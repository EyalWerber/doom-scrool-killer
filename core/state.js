'use strict';

// ============================================================
// STATE  —  shared CONFIG + mutable state object
// Loaded first; every other module references window.DSS.state
// ============================================================
(function () {
  const DSS = window.DSS = window.DSS || {};

  DSS.CONFIG = {
    timeLimit:            7 * 60 * 1000, // 7 minutes (may be overridden by saved setting)
    postTriggerMin:       5,             // show doom post every N–M real posts
    postTriggerMax:       7,
    scrollBottomCooldown: 60 * 1000,     // 1 min cooldown between scroll-bottom fires
  };

  // Apply saved nuke timer setting as early as possible so setupTimeTrigger()
  // uses the correct value. The storage read is async but typically resolves
  // before document_idle content scripts run.
  chrome.storage.sync.get(['nukeMinutes', 'nukeSeconds'], r => {
    const mins = (r.nukeMinutes && typeof r.nukeMinutes === 'number') ? r.nukeMinutes : null;
    const secs = (typeof r.nukeSeconds === 'number') ? r.nukeSeconds : 0;
    if (mins !== null) {
      DSS.CONFIG.timeLimit = Math.max(5000, (mins * 60 + secs) * 1000);
    }
  });

  // Use || so that if Chrome re-injects this content script during a SPA
  // navigation (Facebook, YouTube), the existing in-memory state is kept
  // intact — timer, nukeMode, startTime — instead of being reset to fresh values.
  DSS.state = DSS.state || {
    postsSeen:            0,
    nextTriggerAt:        0,
    timeFired:            false,
    lastScrollBottomFire: 0,
    lastDoomPostTime:     0,          // cooldown: min 30 s between normal-mode doom posts
    initialized:          false,
    nukeMode:             false,       // true after 7 min — every post becomes a doom post
    cachedSuggestions:    null,        // pre-loaded for synchronous nuke insertions
    startTime:            Date.now(),  // page-load timestamp — drives the panel countdown
    timerRef:             null,        // clearTimeout handle for the 7-min timer
    nukeBypass:           false,       // prevents nuke mode from activating
    totalBypass:          false,       // disables ALL intervention features
    panelMinimized:       false,       // control-panel collapsed state
  };

  // ── Session persistence (survives page reloads within the same tab) ──
  // startTime, timeFired, and bypass flags are saved to sessionStorage so that
  // a platform auto-refresh (e.g. Facebook scrolling to top) does not reset
  // the timer. Only an explicit user action (Restart Timer / bypass toggle)
  // clears the session.
  const _SESSION_KEY = 'DSS_session';

  DSS.saveSession = function () {
    try {
      sessionStorage.setItem(_SESSION_KEY, JSON.stringify({
        startTime:   DSS.state.startTime,
        timeFired:   DSS.state.timeFired,
        nukeBypass:  DSS.state.nukeBypass,
        totalBypass: DSS.state.totalBypass,
      }));
    } catch {}
  };

  DSS.clearSession = function () {
    try { sessionStorage.removeItem(_SESSION_KEY); } catch {}
  };

  // Restore state from a previous load on this tab (if present and recent).
  (function restoreSession() {
    try {
      const raw = sessionStorage.getItem(_SESSION_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (!s || typeof s.startTime !== 'number') return;
      // Discard if stale (> 2 hours — user returned after a long break)
      if (Date.now() - s.startTime > 2 * 60 * 60 * 1000) return;
      DSS.state.startTime   = s.startTime;
      DSS.state.timeFired   = !!s.timeFired;
      DSS.state.nukeBypass  = !!s.nukeBypass;
      DSS.state.totalBypass = !!s.totalBypass;
    } catch {}
  })();

  // Persist whatever startTime we ended up with (fresh or restored).
  DSS.saveSession();
})();
