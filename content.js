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
