'use strict';

// ============================================================
// PLATFORM  —  YouTube (home feed, watch sidebar, Shorts)
// Uses setInterval polling because Polymer hydration makes
// MutationObserver unreliable on YouTube.
// ============================================================
(function () {
  const DSS = window.DSS;
  DSS.platforms = DSS.platforms || {};

  // ── Detect which YouTube page context we're on ───────────
  function getContext() {
    const p = location.pathname;
    if (p.startsWith('/shorts')) return 'shorts';
    if (p.startsWith('/watch'))  return 'watch';
    return 'home';
  }

  // ── Post builder (video card or Shorts card) ─────────────
  function buildPost(suggestion) {
    const host = document.createElement('div');
    host.setAttribute('data-doom-scroll-post', 'true');
    const shadow = host.attachShadow({ mode: 'open' });
    DSS.addShadowStyle(shadow, 'post.css');

    const isShorts = getContext() === 'shorts';
    const wrap = document.createElement('div');
    wrap.className = isShorts ? 'yt-shorts-wrap' : 'yt-wrap';

    if (isShorts) {
      // ── Shorts layout: tall image, then handle ──
      const imgBox = document.createElement('div');
      imgBox.className = 'yt-shorts-img';
      imgBox.appendChild(DSS.buildPostCanvas());
      wrap.appendChild(imgBox);

      const handle = document.createElement('div');
      handle.className = 'yt-shorts-handle';
      handle.innerHTML = '<span>@stop_doomscrolling_bitch</span> · STOP DOOM SCROLLING';
      wrap.appendChild(handle);
    } else {
      // ── Normal video card: 16:9 thumbnail + info row ──
      const thumb = document.createElement('div');
      thumb.className = 'yt-thumb';
      const tc = DSS.buildWideCanvas();
      tc.className = 'yt-thumb-canvas';
      const dur = document.createElement('span');
      dur.className = 'yt-duration'; dur.textContent = '∞:00';
      thumb.append(tc, dur);
      wrap.appendChild(thumb);

      const info = document.createElement('div');
      info.className = 'yt-info';
      const av = DSS.buildAvatarCanvas();
      av.className = 'yt-avatar';
      const meta = document.createElement('div');
      meta.className = 'yt-meta';
      const title = document.createElement('div');
      title.className = 'yt-title';
      title.textContent = 'STOP DOOM SCROLLING — Your real life is calling';
      const chan = document.createElement('div');
      chan.className = 'yt-chan';
      chan.textContent = 'stop_doomscrolling_bitch  ✓';
      const views = document.createElement('div');
      views.className = 'yt-views';
      views.textContent = '1,337,420 views • just now';
      meta.append(title, chan, views);
      info.append(av, meta);
      wrap.appendChild(info);
    }

    // Suggestion box (shared)
    const sugg = document.createElement('div');
    sugg.className = 'sugg';
    sugg.innerHTML = `💡 <strong>Try this instead:</strong> ${suggestion}`;
    wrap.appendChild(sugg);

    // Dismiss button
    const dismiss = document.createElement('button');
    dismiss.className = 'dismiss';
    dismiss.textContent = isShorts
      ? "✕  Ok ok, I'll touch grass"
      : "✕  Ok, I'll do something better";
    dismiss.addEventListener('click', () => {
      host.style.transition = 'opacity .3s, transform .3s';
      host.style.opacity = '0';
      host.style.transform = 'scale(.97)';
      setTimeout(() => host.remove(), 350);
    });
    wrap.appendChild(dismiss);

    shadow.appendChild(wrap);
    return host;
  }

  // ── Find a good insertion point ──────────────────────────
  function findInsertionPoint() {
    const ctx = getContext();

    if (ctx === 'watch') {
      const container =
        document.querySelector('#related #items') ||
        document.querySelector('ytd-watch-next-secondary-results-renderer #items');
      if (!container) return null;
      const cards = [...container.querySelectorAll('ytd-compact-video-renderer')];
      if (!cards.length) return { parent: container, before: container.firstChild };
      const visible = cards.find(el => el.getBoundingClientRect().bottom > 100);
      const target = visible || cards[0];
      return { parent: target.parentNode, before: target.nextSibling };
    }

    if (ctx === 'shorts') {
      const items = [...document.querySelectorAll('ytd-reel-video-renderer')];
      if (!items.length) {
        const container = document.querySelector('ytd-shorts');
        return container ? { parent: container, before: container.firstChild } : null;
      }
      const visible = items.find(el => el.getBoundingClientRect().bottom > 0);
      const target = visible || items[0];
      return { parent: target.parentNode, before: target.nextSibling };
    }

    // Home feed grid
    const contents =
      document.querySelector('ytd-rich-grid-renderer #contents') ||
      document.querySelector('#contents.ytd-rich-grid-renderer');
    if (!contents) return null;
    const cards = [...contents.querySelectorAll('ytd-rich-item-renderer')]
      .filter(el => el.isConnected); // guard: skip detached nodes mid-SPA
    if (!cards.length) return { parent: contents, before: contents.firstChild };
    const visible = cards.find(el => {
      try {
        const r = el.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight;
      } catch { return false; }
    });
    const target = visible || cards[0];
    if (!target) return null;
    return { parent: target.parentNode, before: target.nextSibling };
  }

  // ── Poll-based counter (replaces MutationObserver) ───────
  function startPoll(platform) {
    if (platform._ytPollId) { clearInterval(platform._ytPollId); platform._ytPollId = null; }

    DSS.state.postsSeen     = 0;
    DSS.state.nextTriggerAt = DSS.newTriggerAt();
    let lastCount = 0;

    platform._ytPollId = setInterval(() => {
      if (DSS.state.totalBypass || !platform.isOnFeedPage()) return;
      const postSel      = platform.getPostSel();
      const currentCount = document.querySelectorAll(`${postSel}:not([data-doom-scroll-post])`).length;
      const diff = currentCount - lastCount;
      if (diff <= 0) return;
      lastCount = currentCount;

      if (DSS.state.nukeMode) {
        document.querySelectorAll(`${postSel}:not([data-doom-scroll-post])`).forEach(DSS.nukePost);
      } else {
        DSS.state.postsSeen += diff;
        if (DSS.state.postsSeen >= DSS.state.nextTriggerAt) {
          DSS.state.nextTriggerAt = DSS.newTriggerAt();
          DSS.showDoomPost('post-count');
        }
      }
    }, 2000);
  }

  // ── Platform object ───────────────────────────────────────
  DSS.platforms.youtube = {
    name: 'youtube',
    _ytPollId: null,

    getChipLabel() { return `▶️ YouTube — ${getContext()}`; },

    isOnFeedPage() {
      const p = location.pathname;
      return p === '/' || p.startsWith('/shorts') || p.startsWith('/watch');
    },

    getPostSel() {
      const c = getContext();
      if (c === 'watch')  return 'ytd-compact-video-renderer';
      if (c === 'shorts') return 'ytd-reel-video-renderer';
      return 'ytd-rich-item-renderer';
    },

    getFeedSel() {
      const c = getContext();
      if (c === 'watch')  return '#related';
      if (c === 'shorts') return 'ytd-shorts';
      return 'ytd-rich-grid-renderer';
    },

    buildPost(suggestion) { return buildPost(suggestion); },

    findInsertionPoint() { return findInsertionPoint(); },

    insertPost(post) {
      const pt = findInsertionPoint();
      if (pt) {
        pt.parent.insertBefore(post, pt.before);
      } else {
        document.body.appendChild(post);
      }
    },

    setupPostCountTrigger() {
      startPoll(this);
      // SPA: re-run counter on every client-side YouTube navigation
      window.addEventListener('yt-navigate-finish', () => {
        DSS.state.lastScrollBottomFire = 0;
        startPoll(this);
        console.log('[StopDoomScroll] YouTube SPA navigation detected — post counter reset');
      });
    },
  };
})();
