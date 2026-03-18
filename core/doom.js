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
    // Stamp lastDoomPostTime BEFORE the async getSuggestions() call so that
    // two triggers firing simultaneously both see the lock and only one wins.
    const now = Date.now();
    if (reason !== 'popup-preview' && !DSS.state.nukeMode) {
      if (now - DSS.state.lastDoomPostTime < 30_000) return;
    }
    DSS.state.lastDoomPostTime = now; // claim the slot synchronously

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

  // ── Sparse-replace one real post (normal mode, 1-in-5-to-9) ──
  // Like nukePost but fetches+caches suggestions on first call so it works
  // before the 7-min timer fires.
  DSS.sparseDoomPost = async function (realNode) {
    if (DSS.state.totalBypass) return;
    if (!realNode.isConnected) return;

    if (!DSS.state.cachedSuggestions) {
      const { suggestions, enabled } = await DSS.getSuggestions();
      if (!enabled) return;
      DSS.state.cachedSuggestions = suggestions;
    }

    // Re-check after the async gap — node may have been removed by React.
    if (!realNode.isConnected) return;

    // Overlay the doom post INSIDE the real article instead of inserting it
    // as a sibling.  Inserting a foreign sibling into React's managed list
    // container triggers reconciliation: React re-renders all articles as
    // fresh DOM nodes (no data-dss-seen), the observer sees them as new
    // posts, sparseTick fires on all of them — cascade.
    //
    // React's reconciler only touches children it owns.  A foreign child
    // appended from outside the React tree is left in place.
    const doom = _platform.buildPost(DSS.pickRandom(DSS.state.cachedSuggestions));

    // Make the article a positioning context.
    if (getComputedStyle(realNode).position === 'static') {
      realNode.style.setProperty('position', 'relative', 'important');
    }

    // Start invisible so the doom post is in layout (ResizeObserver can measure it)
    // but the user never sees it overflow onto the post below.
    doom.style.cssText =
      'position:absolute!important;top:0!important;left:0!important;' +
      'width:100%!important;z-index:9999!important;' +
      'box-sizing:border-box!important;';
    doom.style.visibility = 'hidden';

    // Silence any videos covered by the overlay.
    // For reels the <video> is a SIBLING of div[aria-label="Video player"],
    // not a child, so we search both realNode and its parent container.
    // For reels, <video> is a direct sibling of div[aria-label="Video player"],
    // so check direct children of the parent — NOT querySelectorAll which would
    // also grab videos inside neighbouring posts and freeze the whole feed.
    const parentDirectVideos = realNode.parentElement
      ? [...realNode.parentElement.children].filter(el => el.tagName === 'VIDEO')
      : [];
    const videoSet = new Set([
      ...realNode.querySelectorAll('video'),
      ...parentDirectVideos,
    ]);
    const videos = [...videoSet];
    // Keep the videos paused — Instagram's own playback observer will try to
    // resume them whenever they are in-viewport, so we intercept each attempt.
    const keepPaused = e => e.target.pause();
    videos.forEach(v => { v.pause(); v.addEventListener('play', keepPaused); });

    realNode.appendChild(doom);
    incrementShowCount();

    // Wait for the shadow-DOM stylesheet to load and layout to settle,
    // then expand the article to contain the doom post and reveal it —
    // all in one tick so there is never a frame where the post overflows.
    const ro = new ResizeObserver(() => {
      if (!doom.isConnected) { ro.disconnect(); return; }
      const h = doom.getBoundingClientRect().height;
      if (h > 10) {
        ro.disconnect();
        realNode.style.setProperty('min-height', h + 'px', 'important');
        doom.style.visibility = ''; // reveal atomically with the height change

        // When the doom post is dismissed: restore height and resume video.
        const mo = new MutationObserver(() => {
          if (!doom.isConnected) {
            realNode.style.removeProperty('min-height');
            videos.forEach(v => {
              v.removeEventListener('play', keepPaused);
              v.play().catch(() => {});
            });
            mo.disconnect();
          }
        });
        mo.observe(realNode, { childList: true });
      }
    });
    ro.observe(doom);
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
