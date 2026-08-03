/* Analyst Assist setup cloud sync.
   Syncs concepts, formations, branding, opponent/setup information,
   defensive system settings, and star-player settings.
   Film and live play logs remain in their existing storage/sync paths. */

(function () {
  'use strict';

  function getClient() {
    return window.aaSupabase || null;
  }

  let session = null;
  let team = null;
  let channel = null;
  let saveTimer = null;
  let applyingRemote = false;
  let initialized = false;

  const deviceId = (() => {
    let id = localStorage.getItem('aa_device_id');

    if (!id) {
      id = window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : String(Date.now()) + '-' + Math.random().toString(16).slice(2);

      localStorage.setItem('aa_device_id', id);
    }

    return id;
  })();

  const SETUP_KEYS = [
    'opp',
    'week',
    'teamName',
    'primary',
    'secondary',
    'accent',
    'weight',
    'groupForms',
    'active',
    'customConcepts',
    'deletedConcepts',
    'customFormations',
    'deletedFormations',
    'activeFormations',
    'formationActivationInitialized',
    'scoutNotes',
    'defense',
    'star'
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function captureSetupState() {
    const state = {};

    SETUP_KEYS.forEach((key) => {
      if (
        typeof ST !== 'undefined' &&
        Object.prototype.hasOwnProperty.call(ST, key)
      ) {
        state[key] = clone(ST[key]);
      }
    });

    return state;
  }

  function rebuildConceptList() {
    if (
      typeof CONCEPTS === 'undefined' ||
      typeof DEFAULT_CONCEPTS === 'undefined'
    ) {
      return;
    }

    CONCEPTS.length = 0;

    DEFAULT_CONCEPTS.forEach((concept) => {
      CONCEPTS.push([...concept]);
    });

    (ST.customConcepts || []).forEach((concept) => {
      if (!concept || !concept.name) return;

      const alreadyExists = CONCEPTS.some(
        (item) =>
          item[0].toLowerCase() === String(concept.name).toLowerCase()
      );

      if (!alreadyExists) {
        CONCEPTS.push([concept.name, concept.type || 'Run']);
      }
    });
  }

  function normalizeSetupState() {
    if (!Array.isArray(ST.active)) ST.active = [];
    if (!Array.isArray(ST.customConcepts)) ST.customConcepts = [];
    if (!Array.isArray(ST.deletedConcepts)) ST.deletedConcepts = [];
    if (!Array.isArray(ST.customFormations)) ST.customFormations = [];
    if (!Array.isArray(ST.deletedFormations)) ST.deletedFormations = [];
    if (!Array.isArray(ST.activeFormations)) ST.activeFormations = [];

    ST.defense = {
      ...(ST.defense || {})
    };

    ST.defense.personnel = {
      vs10: '',
      vs11: '',
      vs12: '',
      vsempty: '',
      ...(ST.defense.personnel || {})
    };

    ST.defense.staff = {
      dc: '',
      lb: '',
      sec: '',
      qc: '',
      ...(ST.defense.staff || {})
    };

    if (!Array.isArray(ST.defense.identity)) {
      ST.defense.identity = [];
    }

    if (!Array.isArray(ST.defense.weaknesses)) {
      ST.defense.weaknesses = [];
    }

    ST.star = {
      ...(ST.star || {})
    };

    if (!Array.isArray(ST.star.touch)) {
      ST.star.touch = [];
    }
  }

  function applySetupState(incoming) {
    if (
      !incoming ||
      typeof incoming !== 'object' ||
      typeof ST === 'undefined'
    ) {
      return;
    }

    applyingRemote = true;

    try {
      SETUP_KEYS.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(incoming, key)) {
          ST[key] = clone(incoming[key]);
        }
      });

      normalizeSetupState();
      rebuildConceptList();

      // Save an offline copy without creating another cloud save loop.
      localStorage.setItem('dpp_v4', JSON.stringify(ST));

      if (typeof renderAll === 'function') {
        renderAll();
      }

      const opponentInput = document.getElementById('p-opp');
      const weekInput = document.getElementById('p-week');

      if (opponentInput) {
        opponentInput.value =
          ST.opp === 'Opponent' ? '' : ST.opp || '';
      }

      if (weekInput) {
        weekInput.value = ST.week || '';
      }
    } finally {
      applyingRemote = false;
    }
  }

  async function getSession() {
    const client = getClient();

    if (!client) return null;

    const { data, error } = await client.auth.getSession();

    if (error) {
      throw error;
    }

    return data && data.session ? data.session : null;
  }

  async function pickTeam(client) {
    const { data, error } = await client
      .from('teams')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      throw error;
    }

    return data && data[0] ? data[0] : null;
  }

  async function saveCloudNow() {
    const client = getClient();

    if (
      !client ||
      !session ||
      !team ||
      applyingRemote
    ) {
      return;
    }

    const { error } = await client
      .from('team_setup_state')
      .upsert(
        {
          team_id: team.id,
          state: captureSetupState(),
          updated_by: session.user.id,
          device_id: deviceId,
          updated_at: new Date().toISOString()
        },
        {
          onConflict: 'team_id'
        }
      );

    if (error) {
      console.warn('Setup cloud save failed:', error.message);
      return;
    }

    console.info('Analyst Assist setup saved to Supabase.');
  }

  function queueSave() {
    if (!initialized || applyingRemote) {
      return;
    }

    clearTimeout(saveTimer);

    saveTimer = setTimeout(() => {
      saveCloudNow();
    }, 700);
  }

  // Called by coach-console.html after every normal local save.
  window.queueSetupCloudSave = queueSave;

  async function loadOrCreateCloudState(client) {
    const { data, error } = await client
      .from('team_setup_state')
      .select('team_id,state,device_id,updated_at')
      .eq('team_id', team.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (
      data &&
      data.state &&
      Object.keys(data.state).length
    ) {
      applySetupState(data.state);
    } else {
      await saveCloudNow();
    }
  }

  function subscribe(client) {
    if (channel) {
      client.removeChannel(channel);
    }

    channel = client
      .channel('aa-team-setup-' + team.id)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_setup_state',
          filter: 'team_id=eq.' + team.id
        },
        (payload) => {
          const row = payload.new;

          if (
            !row ||
            !row.state ||
            row.device_id === deviceId
          ) {
            return;
          }

          applySetupState(row.state);
        }
      )
      .subscribe();
  }

  async function init() {
    const client = getClient();

    if (!client) {
      console.warn(
        'Setup cloud sync could not find window.aaSupabase.'
      );
      return;
    }

    try {
      session = await getSession();

      if (!session) {
        console.warn(
          'Setup cloud sync could not find an authenticated session.'
        );
        return;
      }

      team = await pickTeam(client);

      if (!team) {
        console.warn(
          'Setup sync could not find a team row for this login.'
        );
        return;
      }

      initialized = true;

      await loadOrCreateCloudState(client);
      subscribe(client);
    } catch (error) {
      console.warn(
        'Analyst Assist setup sync failed:',
        error
      );

      initialized = false;
    }
  }

  window.addEventListener('online', () => {
    if (initialized) {
      queueSave();
    } else {
      init();
    }
  });

  window.addEventListener('load', () => {
    setTimeout(() => {
      init();
    }, 650);
  });
})();
