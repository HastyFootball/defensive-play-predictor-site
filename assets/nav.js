(function(){
  const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const authed = ['dashboard.html','prep-center.html','game-mode.html','staff.html','app.html','live-mode.html','import-center.html','analytics.html','reports.html','opponents.html'].includes(path);
  const publicLinks = `
    <a href="features.html">Features</a>
    <a href="how-it-works.html">Workflow</a>
    <a href="login.html" data-guest-only class="ghost">Log in</a>
    <a href="signup.html" data-guest-only class="cta">Create account</a>
    <a href="dashboard.html" data-auth-only class="cta hidden">Dashboard</a>`;
  const coachLinks = `
    <a class="${path==='dashboard.html'?'active':''}" href="dashboard.html">Home</a>
    <a class="${path==='prep-center.html'?'active':''}" href="prep-center.html">Prep Center</a>
    <a class="${path==='game-mode.html'?'active':''}" href="game-mode.html">Game Mode</a>
    <a class="${path==='staff.html'?'active':''}" href="staff.html">Staff</a>
    <button onclick="signOut()">Sign out</button>`;
  document.write(`
  <nav><div class="nav-inner"><a class="brand" href="${authed?'dashboard.html':'index.html'}"><div class="mark">E</div><div class="brand-name"><span>DPP</span> Coach AI</div></a><div class="nav-links coach-nav">${authed ? coachLinks : publicLinks}</div></div></nav>
  `);
})();
