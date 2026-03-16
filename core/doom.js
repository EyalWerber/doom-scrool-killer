'use strict';

// ============================================================
// DOOM  —  platform registry + showDoomPost / nukePost / unNuke
// Uses a platform registry set by content.js via registerPlatform().
// ============================================================
(function () {
  const DSS = window.DSS;

  // Active platform object — set by registerPlatform() in content.js
  let _platform = null;

  DSS.registerPlatform = function (p) {
    _platform = p;
    DSS.platform = p; // also expose publicly for triggers.js / panel.js
  };

  // ── Guard against Chrome context invalidation (extension reload without page reload) ──
  function incrementShowCount() {
    try {
      chrome.storage.local.get(['showCount'], r => {
        try { chrome.storage.local.set({ showCount: (r.showCount || 0) + 1 }); } catch {}
      });
    } catch {}
  }

  // ── Show one doom post ──────────────────────────────────────
  DSS.showDoomPost = async function (reason) {
    if (DSS.state.totalBypass) return;
    const { suggestions, enabled } = await DSS.getSuggestions();
    if (!enabled) return;
    if (!_platform.isOnFeedPage()) return;

    // Cooldown: in normal mode, wait at least 30 s between doom posts.
    // Prevents the scroll-cascade on Instagram where inserting a post
    // triggers infinite scroll → more posts → counter fires again.
    const now = Date.now();
    if (reason !== 'popup-preview' && !DSS.state.nukeMode) {
      if (now - DSS.state.lastDoomPostTime < 30_000) return;
    }
    DSS.state.lastDoomPostTime = now;

    console.log('[StopDoomScroll] Inserting post — trigger:', reason);

    incrementShowCount();

    const post = _platform.buildPost(DSS.pickRandom(suggestions));
    _platform.insertPost(post);
  };

  // ── Replace a real post node with a doom post (nuke mode) ──
  DSS.nukePost = function (realNode) {
    if (DSS.state.totalBypass || !DSS.state.cachedSuggestions) return;
    realNode.setAttribute('data-doom-hidden', '');
    realNode.style.setProperty('display', 'none', 'important');
    const doom = _platform.buildPost(DSS.pickRandom(DSS.state.cachedSuggestions));
    realNode.parentNode.insertBefore(doom, realNode);
    incrementShowCount();
  };

  // ── Reverse nuke: remove doom posts, restore hidden real posts ──
  DSS.unNuke = function () {
    document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove());
    document.querySelectorAll('[data-doom-hidden]').forEach(el => {
      el.removeAttribute('data-doom-hidden');
      el.style.removeProperty('display');
    });
  };

  // ── Listen for preview messages from the popup ──
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'preview') DSS.showDoomPost('popup-preview');
  });
})();
