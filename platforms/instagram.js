'use strict';

// ============================================================
// PLATFORM  —  Instagram
// ============================================================
(function () {
  const DSS = window.DSS;
  DSS.platforms = DSS.platforms || {};

  // ── Post builder ─────────────────────────────────────────
  function buildPost(suggestion) {
    const host = document.createElement('div');
    host.setAttribute('data-doom-scroll-post', 'true');

    const onReels = getPageType() === 'reels';

    // Collect hidden videos so the dismiss handler can restore them.
    let hiddenVideos = [];

    if (onReels) {
      // Host fills the reel container so the .reel-screen overlay covers only
      // the video area and scrolls away naturally with the swipe gesture.
      // position:absolute keeps it inside the container's stacking context,
      // which means Instagram's search bar (in a separate, higher stacking
      // context) renders above us automatically — no z-index fighting needed.
      host.style.cssText = 'position:absolute!important;top:0!important;left:0!important;' +
        'width:100%!important;height:100%!important;z-index:5!important;';
      host.classList.add('reel-overlay');
      host._dssHiddenVideos = hiddenVideos; // exposed so insertPost() can register the video
    } else {
      // Standard feed / grid card.
      host.style.cssText = 'position:relative!important;display:block!important;' +
        'width:100%!important;max-width:614px!important;margin:12px auto!important;' +
        'float:none!important;clear:both!important;';
    }

    const shadow = host.attachShadow({ mode: 'open' });
    DSS.addShadowStyle(shadow, 'post.css');

    const wrap = document.createElement('div');
    wrap.className = 'wrap';

    // Header
    const header = document.createElement('div');
    header.className = 'header';
    const avatar = DSS.buildAvatarCanvas();
    avatar.className = 'avatar';
    const hinfo = document.createElement('div');
    hinfo.className = 'hinfo';
    const uname = document.createElement('span');
    uname.className = 'uname'; uname.textContent = 'stop_doomscrolling_bitch';
    const sub = document.createElement('span');
    sub.className = 'sub'; sub.textContent = '⚠️ Reality Check';
    const more = document.createElement('span');
    more.className = 'more'; more.textContent = '•••';
    hinfo.append(uname, sub);
    header.append(avatar, hinfo, more);
    wrap.appendChild(header);

    // Post image (canvas)
    const img = DSS.buildPostCanvas();
    img.className = 'img-canvas';
    wrap.appendChild(img);

    // Instagram actions
    const actions = document.createElement('div');
    actions.className = 'ig-actions';
    ['♥', '💬', '📤'].forEach(ic => {
      const b = document.createElement('span');
      b.className = 'ig-btn'; b.textContent = ic;
      actions.appendChild(b);
    });
    const bk = document.createElement('span');
    bk.className = 'ig-btn ig-bk'; bk.textContent = '🔖';
    actions.appendChild(bk);
    wrap.appendChild(actions);

    const likes = document.createElement('div');
    likes.className = 'ig-likes'; likes.textContent = '1,337 likes';
    wrap.appendChild(likes);

    const cap = document.createElement('div');
    cap.className = 'ig-caption';
    const cu = document.createElement('span');
    cu.className = 'ig-cuser'; cu.textContent = 'stop_doomscrolling_bitch';
    cap.append(cu, document.createTextNode(
      " You've been doom scrolling for too long. Your real life is waiting. Put your phone down. 🛑"
    ));
    wrap.appendChild(cap);

    // Suggestion box
    const sugg = document.createElement('div');
    sugg.className = 'sugg';
    sugg.innerHTML = `💡 <strong>Try this instead:</strong> ${suggestion}`;
    wrap.appendChild(sugg);

    // Post time
    const time = document.createElement('div');
    time.className = 'ig-time'; time.textContent = 'just now';
    wrap.appendChild(time);

    // Dismiss button
    const dismiss = document.createElement('button');
    dismiss.className = 'dismiss';
    dismiss.textContent = "✕  Ok, I get it — I'll go touch grass";
    dismiss.addEventListener('click', () => {
      // Restore any videos that were hidden for the reels overlay.
      hiddenVideos.forEach(v => v.style.removeProperty('filter'));
      hiddenVideos = [];

      host.style.transition = 'opacity .3s, transform .3s';
      host.style.opacity = '0';
      host.style.transform = 'scale(.97)';
      setTimeout(() => host.remove(), 350);
    });
    wrap.appendChild(dismiss);

    if (onReels) {
      // Inner wrapper handles the dark background + centering within the
      // fixed host. Keeps shadow :host CSS rules from fighting the layout.
      const screen = document.createElement('div');
      screen.className = 'reel-screen';
      screen.appendChild(wrap);
      shadow.appendChild(screen);
    } else {
      shadow.appendChild(wrap);
    }
    return host;
  }

  // ── Find a good insertion point ───────────────────────────
  function findInsertionPoint() {
    if (isGridPage()) {
      // For grid pages insert the doom post just above the thumbnail grid —
      // below the profile header/tabs, not at the top of <main>.
      // Walk up exactly 3 levels from the thumbnail: that puts us at
      // approximately the grid-section container level.
      const postSel = DSS.platforms.instagram.getPostSel();
      const firstItem = document.querySelector(`${postSel}:not([data-doom-scroll-post])`);
      if (firstItem) {
        let node = firstItem;
        for (let i = 0; i < 3 && node.parentElement && node.parentElement.tagName !== 'MAIN'; i++) {
          node = node.parentElement;
        }
        if (node.parentElement) {
          return { parent: node.parentElement, before: node };
        }
      }
      const main = document.querySelector('main');
      if (main) return { parent: main, before: main.firstChild };
      return null;
    }

    // Feed pages (home, reels): insert after the first visible post.
    const posts = [...document.querySelectorAll(
      `${DSS.platforms.instagram.getPostSel()}:not([data-doom-scroll-post])`
    )].filter(el => el.isConnected);
    if (!posts.length) return null;
    const visible = posts.find(el => {
      try {
        const r = el.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight;
      } catch { return false; }
    });
    const target = visible || posts[0];
    if (!target) return null;
    return { parent: target.parentNode, before: target.nextSibling };
  }

  // ── MutationObserver-based post counter ──────────────────
  let _feedObserver = null;
  // Videos blurred by the reels overlay — tracked for nav cleanup.
  let _reelBlurredVideos = [];

  // Countdown to the next sparse replacement: decrement per new post,
  // replace when it hits 0, then reset to a fresh 5–9 value.
  let _sparseNext = 5 + Math.floor(Math.random() * 5);

  // Stamp a post as "decided" so it is never ticked again — even if Instagram's
  // React re-renders the feed and re-adds its own articles as fresh DOM nodes.
  // (Re-renders happen when we mutate the feed, e.g. hiding a post.)
  // Both "skip" and "replace" decisions stamp the node.
  function _sparseTick(post) {
    if (post.hasAttribute('data-dss-seen')) return;
    post.setAttribute('data-dss-seen', '');
    _sparseNext--;
    if (_sparseNext <= 0) {
      _sparseNext = 5 + Math.floor(Math.random() * 5);
      DSS.sparseDoomPost(post);
    }
  }

  // Selector that excludes both doom posts and already-decided real posts.
  function _newPostSel(postSel) {
    return `${postSel}:not([data-doom-scroll-post]):not([data-dss-seen])`;
  }

  function setupObserver(feed, postSel) {
    if (_feedObserver) { _feedObserver.disconnect(); _feedObserver = null; }

    _feedObserver = new MutationObserver(mutations => {
      // Use a Set to avoid double-counting when Instagram adds both a
      // wrapper div AND the article inside it in the same mutation batch.
      const newPostSet = new Set();
      const sel = _newPostSel(postSel);
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.matches?.(sel)) newPostSet.add(node);
          if (node.querySelectorAll) node.querySelectorAll(sel).forEach(n => newPostSet.add(n));
        }
      }
      const newPosts = [...newPostSet];
      if (!newPosts.length) return;

      if (DSS.state.nukeMode) {
        newPosts.forEach(DSS.nukePost);
      } else {
        newPosts.forEach(_sparseTick);
      }
    }).observe(feed, { childList: true, subtree: true });
  }

  // ── SPA navigation detection ──────────────────────────────
  // Chrome content scripts run in an isolated JS world — patching
  // history.pushState in the content script does NOT intercept calls made
  // by Instagram's own page JS.  Instead we poll location.pathname every
  // 300 ms; when it changes we know a navigation happened.
  (function setupNavListener() {
    if (window._dssInstagramNavPolling) return;
    window._dssInstagramNavPolling = true;

    let _lastPath = location.pathname;
    let _navTimer = null;

    function latch() {
      _navTimer = null;
      const postSel = DSS.platforms.instagram.getPostSel();
      const feed    = document.querySelector('main');

      if (!feed) {
        DSS.platforms.instagram.setupPostCountTrigger();
        return;
      }

      // Grid pages (account/explore): only watch for nuke mode — no early doom posts.
      if (isGridPage()) {
        setupObserver(feed, postSel);
        if (DSS.state.nukeMode) {
          feed.querySelectorAll(`${postSel}:not([data-doom-scroll-post])`).forEach(DSS.nukePost);
        }
        return;
      }

      // Fresh sparse counter — this is a new page visit.
      _sparseNext = 5 + Math.floor(Math.random() * 5);

      // Watch for posts added after this moment.
      setupObserver(feed, postSel);

      // In nuke mode, immediately replace posts already in the DOM.
      // In normal mode do NOT bulk-tick already-loaded posts — only newly
      // arriving posts (observed additions) get the sparse treatment.
      if (DSS.state.nukeMode) {
        feed.querySelectorAll(`${postSel}:not([data-doom-scroll-post])`).forEach(DSS.nukePost);
      }
    }

    setInterval(() => {
      const path = location.pathname;
      if (path === _lastPath) return;
      _lastPath = path;

      // URL changed — drop the stale observer immediately.
      if (_feedObserver) { _feedObserver.disconnect(); _feedObserver = null; }
      if (_navTimer)     { clearTimeout(_navTimer);    _navTimer     = null; }
      DSS.state.lastDoomPostTime = 0;

      // Remove ALL doom posts from the previous page — Instagram's React
      // replaces the feed content but may leave the doom post's parent node
      // intact, causing stale posts to persist into the next page visit.
      document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove());
      document.querySelectorAll('[data-dss-seen]').forEach(el => el.removeAttribute('data-dss-seen'));
      _reelBlurredVideos.forEach(v => v.style.removeProperty('filter'));
      _reelBlurredVideos = [];

      // Give React ~800 ms to render the new page before latching.
      _navTimer = setTimeout(latch, 800);
    }, 300);
  })();

  // ── Classify the current Instagram page type ─────────────
  //   'home'    — home feed   (/)
  //   'reels'   — reels feed  (/reels, /reels/*)
  //   'explore' — explore     (/explore, /explore/*)
  //   'account' — user profile grid (/username/, /username/tagged/, etc.)
  //   null      — not a scrollable feed (single post, DMs, settings …)
  function getPageType() {
    const p = location.pathname;
    if (p === '/' || p === '') return 'home';
    if (p.startsWith('/reels'))   return 'reels';
    if (p.startsWith('/explore')) return 'explore';

    // Everything else with a single username segment is a profile page.
    // Exclude known non-profile top-level paths.
    const NON_PROFILE = new Set([
      'p', 'tv', 'reel', 'stories', 'direct', 'accounts',
      'login', 'settings', 'ar', 'notifications', 'audio',
      'location', 'tags', 'graphql', 'challenge',
    ]);
    const firstSeg = p.split('/').filter(Boolean)[0];
    if (firstSeg && !NON_PROFILE.has(firstSeg)) return 'account';
    return null;
  }

  // Grid pages show a thumbnail grid rather than a linear feed.
  function isGridPage() {
    const t = getPageType();
    return t === 'explore' || t === 'account';
  }

  // ── Platform object ───────────────────────────────────────
  DSS.platforms.instagram = {
    name: 'instagram',

    getChipLabel() { return '📸 Instagram'; },

    // Grid pages (account profiles, explore) don't get early doom posts —
    // a full card inside a thumbnail grid looks wrong. Nuke mode still works
    // because nukePost() is called directly and bypasses this check.
    isOnFeedPage() {
      const t = getPageType();
      return t === 'home' || t === 'reels';
    },

    // Selector per page type:
    //   grid (explore/account) → thumbnail links
    //   reels feed             → video player containers
    //   home feed              → article
    getPostSel() {
      if (isGridPage()) return 'a[href*="/p/"], a[href*="/reel/"]';
      if (getPageType() === 'reels') return 'div[aria-label="Video player"]';
      return 'article';
    },

    getFeedSel() { return 'main'; },

    buildPost(suggestion) { return buildPost(suggestion); },

    findInsertionPoint() { return findInsertionPoint(); },

    insertPost(post) {
      if (getPageType() === 'reels') {
        // Find the visible reel container and insert inside it.
        // The host is position:absolute filling the container, so the doom
        // overlay covers only the video — and swipes away with it naturally.
        const allOverlays = [...document.querySelectorAll('div[aria-label="Video player"]')];
        const visible = allOverlays.find(el => {
          const r = el.getBoundingClientRect();
          return r.top < window.innerHeight && r.bottom > 0;
        }) || allOverlays[0];

        if (!visible) { document.body.appendChild(post); return; }

        const container = visible.parentElement;
        if (!container) { document.body.appendChild(post); return; }

        // Make container a positioning context for the absolute host.
        if (getComputedStyle(container).position === 'static') {
          container.style.position = 'relative';
        }

        // Blur the sibling <video> (it is NOT a child of div[aria-label]).
        const video = container.querySelector('video');
        if (video && post._dssHiddenVideos) {
          video.style.setProperty('filter', 'blur(12px)', 'important');
          post._dssHiddenVideos.push(video);
          _reelBlurredVideos.push(video);
        }

        container.appendChild(post);
        return;
      }
      const pt = findInsertionPoint();
      if (pt) {
        pt.parent.insertBefore(post, pt.before);
      } else {
        const anyPost = document.querySelector(this.getPostSel());
        if (anyPost && anyPost.parentElement) {
          anyPost.parentElement.insertBefore(post, anyPost.nextSibling);
        } else {
          document.body.appendChild(post);
        }
      }
      // NOTE: no scrollIntoView — it triggers Instagram's infinite scroll,
      // causing a cascade where each doom post loads more posts → more doom posts.
    },

    setupPostCountTrigger() {
      const postSel = this.getPostSel();
      const feedSel = this.getFeedSel();

      // Grid pages only need the observer for nuke mode — no doom-post counting.
      if (isGridPage()) {
        const feed = document.querySelector(feedSel);
        if (feed) setupObserver(feed, postSel);
        return;
      }

      const feed = document.querySelector(feedSel);
      if (feed) {
        setupObserver(feed, postSel);
      } else {
        new MutationObserver((_, obs) => {
          const f = document.querySelector(feedSel);
          if (f) {
            obs.disconnect();
            setupObserver(f, postSel);
          }
        }).observe(document.body, { childList: true, subtree: true });
      }
    },
  };
})();
