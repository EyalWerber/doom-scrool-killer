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
    if (realNode.hasAttribute('data-doom-hidden')) return; // already nuked

    const suggestion  = DSS.pickRandom(DSS.state.cachedSuggestions);
    const isGridThumb = realNode.tagName === 'A';
    const doom = isGridThumb && _platform.buildGridPost
      ? _platform.buildGridPost(suggestion)
      : _platform.buildPost(suggestion);

    // Mark as nuked so the observer / latch loop doesn't process it again.
    realNode.setAttribute('data-doom-hidden', '');

    if (isGridThumb) {
      // Grid thumbnail: overlay INSIDE the <a>, same reason as feed articles.
      // The explore/account grid is also React-managed — inserting a sibling
      // doom div causes reconciliation that removes it immediately.
      // React ignores foreign children, so append inside the <a>.
      if (getComputedStyle(realNode).position === 'static') {
        realNode.style.setProperty('position', 'relative', 'important');
      }
      realNode.style.setProperty('overflow', 'hidden', 'important');
      doom.style.cssText =
        'position:absolute!important;top:0!important;left:0!important;' +
        'width:100%!important;height:100%!important;z-index:9999!important;' +
        'box-sizing:border-box!important;overflow:hidden!important;';

      // Prevent <a> navigation while the doom overlay is active.
      // stopPropagation on the shadow host is not enough — the browser triggers
      // <a> default action for any click on a descendant. We must preventDefault
      // directly on the <a> in capture phase (fires before any other handler).
      const blockNav = e => e.preventDefault();
      realNode.addEventListener('click', blockNav, true);
      realNode.appendChild(doom);

      // Clean up when doom is removed (dismissed or React reconciliation).
      // If realNode is still in the DOM but doom was stripped (React removed a
      // foreign child during reconciliation), clear data-doom-hidden so the
      // periodic sweep can re-nuke this node — otherwise it's permanently skipped.
      const cleanupMo = new MutationObserver(() => {
        if (!doom.isConnected) {
          realNode.removeEventListener('click', blockNav, true);
          if (realNode.isConnected) realNode.removeAttribute('data-doom-hidden');
          cleanupMo.disconnect();
        }
      });
      cleanupMo.observe(realNode, { childList: true });
    } else {
      // Feed article: overlay INSIDE the article, exactly like sparseDoomPost.
      // Inserting a sibling into React's feed container triggers reconciliation —
      // React removes the foreign div and restores the article, the observer
      // fires again, nuke loops, doom posts never stick.
      // React ignores foreign children it didn't create, so append inside.
      if (getComputedStyle(realNode).position === 'static') {
        realNode.style.setProperty('position', 'relative', 'important');
      }
      doom.style.cssText =
        'position:absolute!important;top:0!important;left:0!important;' +
        'width:100%!important;z-index:9999!important;' +
        'box-sizing:border-box!important;';
      doom.style.visibility = 'hidden';
      realNode.appendChild(doom);

      const ro = new ResizeObserver(() => {
        if (!doom.isConnected) { ro.disconnect(); return; }
        const h = doom.getBoundingClientRect().height;
        if (h > 10) {
          ro.disconnect();
          realNode.style.setProperty('min-height', h + 'px', 'important');
          doom.style.visibility = '';
        }
      });
      ro.observe(doom);
    }

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
    // Grid thumbnails (<a> tags) get a compact overlay instead of the full feed-
    // post card — the full card is far too tall to fit in a small square cell.
    const isGridThumb = realNode.tagName === 'A';
    const suggestion  = DSS.pickRandom(DSS.state.cachedSuggestions);
    const doom = isGridThumb && _platform.buildGridPost
      ? _platform.buildGridPost(suggestion)
      : _platform.buildPost(suggestion);

    // Make the article a positioning context.
    if (getComputedStyle(realNode).position === 'static') {
      realNode.style.setProperty('position', 'relative', 'important');
    }

    if (isGridThumb) {
      realNode.style.setProperty('overflow', 'hidden', 'important');
      doom.style.cssText =
        'position:absolute!important;top:0!important;left:0!important;' +
        'width:100%!important;height:100%!important;z-index:9999!important;' +
        'box-sizing:border-box!important;overflow:hidden!important;';

      // Prevent <a> navigation while the doom overlay is active.
      const blockNav = e => e.preventDefault();
      realNode.addEventListener('click', blockNav, true);
      // _dssBlockNav stored for the MutationObserver cleanup below.
      doom._dssBlockNav = () => realNode.removeEventListener('click', blockNav, true);
    } else {
      // Start invisible so the doom post is in layout (ResizeObserver can measure it)
      // but the user never sees it overflow onto the post below.
      doom.style.cssText =
        'position:absolute!important;top:0!important;left:0!important;' +
        'width:100%!important;z-index:9999!important;' +
        'box-sizing:border-box!important;';
      doom.style.visibility = 'hidden';
    }

    // Silence any videos covered by the overlay.
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
    const keepPaused = e => e.target.pause();
    videos.forEach(v => { v.pause(); v.addEventListener('play', keepPaused); });

    realNode.appendChild(doom);
    incrementShowCount();

    if (isGridThumb) {
      // Cell size is fixed — no expansion needed, reveal immediately.
      const mo = new MutationObserver(() => {
        if (!doom.isConnected) {
          doom._dssBlockNav?.();
          realNode.style.removeProperty('overflow');
          videos.forEach(v => {
            v.removeEventListener('play', keepPaused);
            v.play().catch(() => {});
          });
          mo.disconnect();
        }
      });
      mo.observe(realNode, { childList: true });
    } else {
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
    }
  };

  // ── Reverse nuke: remove doom posts, restore real posts ──
  DSS.unNuke = function () {
    document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove());
    document.querySelectorAll('[data-doom-hidden]').forEach(el => {
      el.removeAttribute('data-doom-hidden');
      if (el.tagName === 'A') {
        // Grid thumbnail: was overlaid (not hidden) — remove overflow we set.
        el.style.removeProperty('overflow');
      } else {
        // Feed article: was overlaid (not hidden) — remove the min-height we set.
        el.style.removeProperty('min-height');
      }
    });
  };

  // ── Listen for preview messages from the popup ──
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'preview') DSS.showDoomPost('popup-preview');
  });
})();
