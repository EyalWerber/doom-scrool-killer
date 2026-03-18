'use strict';

// ============================================================
// ENTRY POINT
// Detects the active platform, registers it, then initialises
// all triggers and the control panel.
//
// Load order (manifest.json js array):
//   core/state.js → core/suggestions.js → core/canvas.js →
//   core/utils.js → core/doom.js → core/triggers.js →
//   core/panel.js → platforms/instagram.js →
//   platforms/facebook.js → platforms/youtube.js → content.js
// ============================================================
(function () {
  const DSS = window.DSS;

  // ── Detect and register the active platform ───────────────
  const host = location.hostname;
  let platform;
  if      (host.includes('instagram.com')) platform = DSS.platforms.instagram;
  else if (host.includes('facebook.com'))  platform = DSS.platforms.facebook;
  else if (host.includes('youtube.com'))   platform = DSS.platforms.youtube;
  else return; // unsupported site

  DSS.registerPlatform(platform);

  // ── Skip activation on login / signup pages ───────────────
  const _skipPaths = ['/accounts/login', '/accounts/signup', '/accounts/emailsignup'];
  if (_skipPaths.some(p => location.pathname.startsWith(p))) {
    // Show a subtle indicator so the user knows DSS is waiting for login.
    // Use the same readyState guard as init() — DOMContentLoaded may have
    // already fired by the time the content script runs.
    const _appendIndicator = () => {
      const ind = document.createElement('div');
      ind.id = 'dss-login-indicator';
      ind.setAttribute('data-dss-indicator', 'true');
      ind.style.cssText =
        'position:fixed;bottom:16px;right:16px;z-index:2147483647;' +
        'background:rgba(20,20,20,0.75);color:#555;font-size:10px;' +
        'padding:4px 10px;border-radius:6px;font-family:sans-serif;' +
        'pointer-events:none;letter-spacing:.3px;';
      ind.textContent = '⏸ DSS inactive';
      document.body.appendChild(ind);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _appendIndicator);
    } else {
      _appendIndicator();
    }
    return; // do not initialise triggers or panel
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    // Guard against double-init on SPA re-injection: if state was preserved
    // the timer is still running and the panel is still in the DOM — nothing
    // to do.  Only the post-count trigger is re-setup (its observer may have
    // become stale after the platform replaced the feed container).
    if (DSS.state.initialized) {
      platform.setupPostCountTrigger();
      return;
    }
    DSS.state.initialized = true;

    // Always set up triggers — each one checks isOnFeedPage() dynamically
    // before firing. This prevents Facebook's async React hydration (which
    // may not have rendered the feed yet at document_idle) from silently
    // aborting the entire init.
    DSS.createControlPanel();
    DSS.setupTimeTrigger();
    DSS.setupScrollTrigger();
    platform.setupPostCountTrigger();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
