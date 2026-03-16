'use strict';

// ============================================================
// TRIGGERS  —  time trigger, scroll trigger, post-count helper,
//              and restartTimer
// ============================================================
(function () {
  const DSS = window.DSS;

  // ── Compute the next post count threshold ──────────────────
  DSS.newTriggerAt = function () {
    const spread = DSS.CONFIG.postTriggerMax - DSS.CONFIG.postTriggerMin + 1;
    return DSS.state.postsSeen + DSS.CONFIG.postTriggerMin + Math.floor(Math.random() * spread);
  };
  // Seed only on first load — not on SPA re-injection where state is preserved.
  if (!DSS.state.nextTriggerAt) DSS.state.nextTriggerAt = DSS.newTriggerAt();

  // ── Shared nuke-mode activation logic ─────────────────────
  async function activateNuke() {
    const { suggestions, enabled } = await DSS.getSuggestions();
    if (!enabled) return;
    if (DSS.state.nukeBypass || DSS.state.totalBypass) return;

    DSS.state.cachedSuggestions = suggestions;
    DSS.state.nukeMode = true;
    DSS.saveSession();

    console.log('[StopDoomScroll] NUKE MODE activated — replacing all posts');

    document.querySelectorAll('video').forEach(v => { if (!v.paused) v.pause(); });

    const postSel = DSS.platform.getPostSel();
    document.querySelectorAll(`${postSel}:not([data-doom-scroll-post])`).forEach(DSS.nukePost);

    DSS.showDoomPost('7-min-timer');
  }

  // ── TRIGGER 1 — 7-minute timer → NUKE MODE ────────────────
  DSS.setupTimeTrigger = function () {
    // If the timer already fired on a previous load (e.g. platform auto-refresh),
    // immediately re-enter nuke mode instead of starting a fresh 7-min countdown.
    if (DSS.state.timeFired) {
      activateNuke();
      return;
    }

    // Schedule for the *remaining* time, not a full 7 min from now.
    const remaining = Math.max(0, DSS.CONFIG.timeLimit - (Date.now() - DSS.state.startTime));

    DSS.state.timerRef = setTimeout(async () => {
      if (DSS.state.timeFired) return;
      DSS.state.timeFired = true;
      DSS.saveSession();
      await activateNuke();
    }, remaining);
  };

  // ── TRIGGER 2 — scroll to bottom (auto-load detection) ────
  DSS.setupScrollTrigger = function () {
    let lastY   = 0;
    let ticking = false;

    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const top        = window.scrollY;
        const vh         = window.innerHeight;
        const total      = document.documentElement.scrollHeight;
        const goingDown  = top > lastY;
        const nearBottom = top + vh >= total - 300;

        if (goingDown && nearBottom) {
          const now = Date.now();
          if (now - DSS.state.lastScrollBottomFire > DSS.CONFIG.scrollBottomCooldown) {
            DSS.state.lastScrollBottomFire = now;
            DSS.showDoomPost('scroll-bottom');
          }
        }

        lastY   = top;
        ticking = false;
      });
    }, { passive: true });
  };

  // ── Reset the 7-min timer and de-nuke the feed ────────────
  // Only called by explicit user action (panel button or bypass toggle).
  DSS.restartTimer = function () {
    if (DSS.state.timerRef) { clearTimeout(DSS.state.timerRef); DSS.state.timerRef = null; }
    if (DSS.state.nukeMode) DSS.unNuke();
    DSS.state.timeFired         = false;
    DSS.state.nukeMode          = false;
    DSS.state.cachedSuggestions = null;
    DSS.state.startTime         = Date.now();
    DSS.state.lastDoomPostTime  = 0;  // allow a doom post immediately after restart
    DSS.clearSession();   // wipe old session so page reloads also start fresh
    DSS.saveSession();    // persist the new startTime
    DSS.setupTimeTrigger();
  };
})();
