'use strict';

// ============================================================
// PLATFORM  —  Facebook
// ============================================================
(function () {
  const DSS = window.DSS;
  DSS.platforms = DSS.platforms || {};

  // ── Post builder ─────────────────────────────────────────
  function buildPost(suggestion) {
    const host = document.createElement('div');
    host.setAttribute('data-doom-scroll-post', 'true');

    const shadow = host.attachShadow({ mode: 'open' });
    DSS.addShadowStyle(shadow, 'post.css');

    const wrap = document.createElement('div');
    wrap.className = 'wrap fb';

    // ── Header ──
    const header = document.createElement('div');
    header.className = 'header';

    const avatar = DSS.buildAvatarCanvas();
    avatar.className = 'avatar';

    const hinfo = document.createElement('div');
    hinfo.className = 'hinfo';

    const uname = document.createElement('span');
    uname.className = 'uname'; uname.textContent = 'Stop Doom Scrolling';

    const sub = document.createElement('span');
    sub.className = 'sub'; sub.textContent = 'Just now · 🌍 · Sponsored';

    const more = document.createElement('span');
    more.className = 'more'; more.textContent = '•••';

    hinfo.append(uname, sub);
    header.append(avatar, hinfo, more);
    wrap.appendChild(header);

    // ── Facebook post text ──
    const fbText = document.createElement('div');
    fbText.className = 'fb-text';
    fbText.textContent = "You've been doom scrolling for too long. Your real life is waiting. Put the phone down. 🛑";
    wrap.appendChild(fbText);

    // ── Post image (canvas) ──
    const img = DSS.buildPostCanvas();
    img.className = 'img-canvas';
    wrap.appendChild(img);

    // ── Suggestion box ──
    const sugg = document.createElement('div');
    sugg.className = 'sugg';
    sugg.innerHTML = `💡 <strong>Try this instead:</strong> ${suggestion}`;
    wrap.appendChild(sugg);

    // ── Facebook reactions bar ──
    const react = document.createElement('div');
    react.className = 'fb-react';
    react.innerHTML = '<span>👍 ❤️ 😮  1,337</span><span>42 comments · 7 shares</span>';
    wrap.appendChild(react);

    // ── Dismiss button ──
    const dismiss = document.createElement('button');
    dismiss.className = 'dismiss';
    dismiss.textContent = "✕  Ok, I'll do something better with my time";
    dismiss.addEventListener('click', () => {
      // Stop the re-insertion observer before removing the node.
      if (host._dssDisconnect) host._dssDisconnect();
      host.setAttribute('data-dismissed', '');
      host.style.transition = 'opacity .3s, transform .3s';
      host.style.opacity = '0';
      host.style.transform = 'scale(.97)';
      setTimeout(() => host.remove(), 350);
    });
    wrap.appendChild(dismiss);

    shadow.appendChild(wrap);
    return host;
  }

  // ── Inline insertion with React-reconciler guard ──────────
  // React removes any foreign node we inject into [role="feed"].
  // We fight back with a MutationObserver that re-inserts the post
  // whenever React evicts it — until the user dismisses or we give up.
  function insertInline(post) {
    const feed = document.querySelector('[role="feed"]');
    if (!feed) return false;

    function doInsert() {
      const arts = [...feed.querySelectorAll('[role="article"]:not([data-doom-scroll-post])')];
      // Prefer an article whose bottom edge is visible (already scrolled past)
      const anchor = arts.find(a => a.getBoundingClientRect().bottom > 200) || arts[0];
      feed.insertBefore(post, anchor ? anchor.nextSibling : feed.firstChild);
    }

    doInsert();

    let reinserts = 0;
    const obs = new MutationObserver(() => {
      if (post.isConnected || post.hasAttribute('data-dismissed')) return;
      if (reinserts >= 10 || !feed.isConnected || document.querySelector('[role="feed"]') !== feed) {
        // React won this round — stop fighting and wait for the next trigger cycle.
        obs.disconnect();
        return;
      }
      reinserts++;
      doInsert();
    });

    obs.observe(document.body, { childList: true, subtree: true });
    post._dssDisconnect = () => obs.disconnect();
    return true;
  }

  // ── Platform object ───────────────────────────────────────
  DSS.platforms.facebook = {
    name: 'facebook',

    getChipLabel() { return '👥 Facebook'; },

    isOnFeedPage() {
      const p = location.pathname;
      return p === '/' || p === '/home.php' || p.startsWith('/home') || p === '';
    },

    getPostSel() { return '[role="article"]'; },

    getFeedSel() { return '[role="feed"]'; },

    buildPost(suggestion) { return buildPost(suggestion); },

    findInsertionPoint() { return null; },

    insertPost(post) {
      insertInline(post);
    },

    setupPostCountTrigger() {
      const postSel = this.getPostSel(); // '[role="article"]'

      // Seed with articles already in DOM
      DSS.state.postsSeen     = document.querySelectorAll(`${postSel}:not([data-doom-scroll-post])`).length;
      DSS.state.nextTriggerAt = DSS.newTriggerAt();

      // Watch document.body directly — do NOT require [role="feed"] to exist first.
      // Facebook redesigns frequently; [role="feed"] may not be present,
      // but [role="article"] has been stable across all versions.
      new MutationObserver(mutations => {
        const newPostSet = new Set();
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            if (node.matches?.(postSel) && !node.hasAttribute('data-doom-scroll-post'))
              newPostSet.add(node);
            if (node.querySelectorAll)
              node.querySelectorAll(`${postSel}:not([data-doom-scroll-post])`).forEach(n => newPostSet.add(n));
          }
        }
        const newPosts = [...newPostSet];
        if (!newPosts.length) return;

        if (DSS.state.nukeMode) {
          newPosts.forEach(DSS.nukePost);
        } else {
          DSS.state.postsSeen += newPosts.length;
          if (DSS.state.postsSeen >= DSS.state.nextTriggerAt) {
            DSS.state.nextTriggerAt = DSS.newTriggerAt();
            DSS.showDoomPost('post-count');
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    },
  };
})();
