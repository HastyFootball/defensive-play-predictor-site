/* Analyst Assist shared staff auth helper. */
(function () {
  const cfg = window.DPP_CONFIG || {};
  const url = String(cfg.SUPABASE_URL || '');
  const key = String(cfg.SUPABASE_ANON_KEY || '');

  const hasConfig = !!(
    window.supabase &&
    url.startsWith('https://') &&
    key.length > 30 &&
    !url.includes('PASTE') &&
    !key.includes('PASTE')
  );

  window.aaSupabase = hasConfig
    ? window.supabase.createClient(url, key)
    : null;

  /**
   * Build an absolute URL using the website's current domain.
   * This works for production and Vercel preview deployments.
   */
  function getSiteUrl(path) {
    const cleanPath = String(path || '').replace(/^\/+/, '');
    return `${window.location.origin}/${cleanPath}`;
  }

  /**
   * Display an authentication message safely.
   */
  function setAuthMessage(message, color) {
    const msg = document.getElementById('authMsg');

    if (!msg) {
      console.warn('Authentication message element #authMsg was not found.');
      return;
    }

    msg.style.color = color;
    msg.textContent = message;
  }

  /**
   * Optional local authentication bypass.
   */
  window.aaAuthBypass = function () {
    try {
      localStorage.setItem('aa_auth_bypass', '1');
    } catch (error) {
      console.warn('Could not save authentication bypass:', error);
    }

    window.location.href = 'coach-console.html';
  };

  /**
   * Require a logged-in Supabase session before opening protected pages.
   */
  window.requireAuth = async function () {
    let bypass = false;

    try {
      bypass = localStorage.getItem('aa_auth_bypass') === '1';
    } catch (error) {
      console.warn('Could not read authentication bypass:', error);
    }

    if (bypass) {
      return;
    }

    if (!window.aaSupabase) {
      console.warn(
        'Analyst Assist: Supabase configuration is missing or still contains placeholder values. Cloud login is disabled.'
      );
      return;
    }

    try {
      const { data, error } = await window.aaSupabase.auth.getSession();

      if (error) {
        console.warn('Auth session check failed:', error.message);
        return;
      }

      const currentPage = window.location.pathname.toLowerCase();
      const isPublicAuthPage =
        currentPage.endsWith('/staff-access.html') ||
        currentPage.endsWith('/login.html') ||
        currentPage.endsWith('/signup.html');

      if (!data.session && !isPublicAuthPage) {
        window.location.href = 'login.html';
      }
    } catch (error) {
      console.error('Unexpected session check error:', error);
    }
  };

  /**
   * Sign the current user out.
   */
  window.signOut = async function () {
    try {
      localStorage.removeItem('aa_auth_bypass');
    } catch (error) {
      console.warn('Could not remove authentication bypass:', error);
    }

    if (window.aaSupabase) {
      try {
        const { error } = await window.aaSupabase.auth.signOut();

        if (error) {
          console.warn('Supabase sign-out failed:', error.message);
        }
      } catch (error) {
        console.warn('Unexpected sign-out error:', error);
      }
    }

    window.location.href = 'login.html';
  };

  /* ──────────────────────────────
     LOGIN
  ────────────────────────────── */

  window.loginCoach = async function (event) {
    event.preventDefault();

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !password) {
      setAuthMessage(
        'Enter your email address and password.',
        'var(--red, red)'
      );
      return;
    }

    if (!window.aaSupabase) {
      setAuthMessage(
        'Supabase is not configured. Check assets/config.js.',
        'var(--red, red)'
      );
      return;
    }

    setAuthMessage('Signing in…', 'var(--muted, #888)');

    try {
      const { data, error } =
        await window.aaSupabase.auth.signInWithPassword({
          email,
          password
        });

      if (error) {
        setAuthMessage(error.message, 'var(--red, red)');
        return;
      }

      if (data && data.session) {
        try {
          localStorage.removeItem('aa_auth_bypass');
        } catch (error) {
          console.warn('Could not remove authentication bypass:', error);
        }

        window.location.href = 'coach-console.html';
        return;
      }

      setAuthMessage(
        'Unable to start a login session. Please try again.',
        'var(--red, red)'
      );
    } catch (error) {
      console.error('Unexpected login error:', error);

      setAuthMessage(
        'An unexpected login error occurred. Please try again.',
        'var(--red, red)'
      );
    }
  };

  /* ──────────────────────────────
     SIGNUP
  ────────────────────────────── */

  window.signupCoach = async function (event) {
    event.preventDefault();

    const fullNameInput = document.getElementById('full_name');
    const teamNameInput = document.getElementById('team_name');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');

    const full_name = fullNameInput
      ? fullNameInput.value.trim()
      : '';

    const team_name = teamNameInput
      ? teamNameInput.value.trim()
      : '';

    const email = emailInput
      ? emailInput.value.trim()
      : '';

    const password = passwordInput
      ? passwordInput.value
      : '';

    if (!full_name || !team_name || !email || !password) {
      setAuthMessage(
        'Complete all fields before creating your account.',
        'var(--red, red)'
      );
      return;
    }

    if (password.length < 6) {
      setAuthMessage(
        'Your password must contain at least 6 characters.',
        'var(--red, red)'
      );
      return;
    }

    if (!window.aaSupabase) {
      setAuthMessage(
        'Supabase is not configured. Check assets/config.js.',
        'var(--red, red)'
      );
      return;
    }

    setAuthMessage('Creating account…', 'var(--muted, #888)');

    /*
     * After the user clicks the Supabase confirmation email,
     * they will return to the normal login page instead of a
     * broken or outdated URL.
     */
    const confirmationRedirect =
      getSiteUrl('login.html?verified=1');

    try {
      const { data, error } =
        await window.aaSupabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: confirmationRedirect,
            data: {
              full_name,
              team_name
            }
          }
        });

      if (error) {
        setAuthMessage(error.message, 'var(--red, red)');
        return;
      }

      /*
       * If email confirmation is disabled in Supabase,
       * a session may be created immediately.
       */
      if (data && data.session) {
        try {
          localStorage.removeItem('aa_auth_bypass');
        } catch (error) {
          console.warn('Could not remove authentication bypass:', error);
        }

        window.location.href = 'coach-console.html';
        return;
      }

      setAuthMessage(
        'Account created! Check your email to confirm your address, then log in.',
        'var(--green, green)'
      );
    } catch (error) {
      console.error('Unexpected signup error:', error);

      setAuthMessage(
        'An unexpected signup error occurred. Please try again.',
        'var(--red, red)'
      );
    }
  };

  /* ──────────────────────────────
     CONFIRMATION RETURN MESSAGE
  ────────────────────────────── */

  function showVerificationMessage() {
    const params = new URLSearchParams(window.location.search);

    if (params.get('verified') === '1') {
      setAuthMessage(
        'Email confirmed successfully. You can now log in.',
        'var(--green, green)'
      );

      /*
       * Remove the query parameter from the address bar without
       * refreshing the page.
       */
      if (window.history && window.history.replaceState) {
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      showVerificationMessage
    );
  } else {
    showVerificationMessage();
  }
})();
