# doom-scroll-stopper — Project Context

> **AI instruction:** Every time you read this file, update it before doing anything else. Reflect any changes to files, architecture, state, gotchas, or TODOs that you discover during the session. Keep it accurate and current — this is the living source of truth for the project.



## What it is

A Chrome Extension (Manifest v3) that interrupts mindless doom scrolling on **Facebook**, **Instagram**, and **YouTube** by injecting a fake "reality-check" post directly into the feed.

The fake post mimics the platform's native card style and includes:
- A canvas-drawn "STOP DOOM SCROLLING" image
- Account name `stop_doomscrolling_bitch`
- A randomly picked suggestion of something better to do
- A dismiss button

**Version:** 1.1.0

---

## Triggers

| Trigger | Behavior |
|---|---|
| **Time limit** (default 7 min, configurable 1–120 min) | After the limit, activates **Nuke Mode**: replaces ALL feed posts with doom posts and pauses all videos |
| **Scroll to bottom** | Fires one doom post; 1-min cooldown between fires |
| **Post count** | Fires every 5–7 new posts loaded (randomised threshold) |

---

## Architecture

### Load order (defined in `manifest.json`)

```
core/state.js → core/suggestions.js → core/canvas.js → core/utils.js →
core/doom.js → core/triggers.js → core/panel.js →
platforms/instagram.js → platforms/facebook.js → platforms/youtube.js →
content.js
```

All modules attach to a shared `window.DSS` namespace.

### File map

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest; declares content scripts, permissions (`storage`), popup |
| `content.js` | Entry point: detects platform, calls `registerPlatform()`, calls `init()` |
| `core/state.js` | `DSS.CONFIG` + `DSS.state`; session persistence via `sessionStorage` |
| `core/suggestions.js` | Loads suggestions from `chrome.storage.sync` (falls back to `suggestions.json`) |
| `core/canvas.js` | Canvas helpers: `buildPostCanvas()`, `buildAvatarCanvas()`, `buildWideCanvas()` |
| `core/utils.js` | `pickRandom()`, `addShadowStyle()` |
| `core/doom.js` | `showDoomPost()`, `nukePost()`, `unNuke()`, `registerPlatform()`; listens for popup preview message |
| `core/triggers.js` | `setupTimeTrigger()`, `setupScrollTrigger()`, `restartTimer()`, `newTriggerAt()` |
| `core/panel.js` | Floating control panel (shadow DOM); live countdown timer; nuke/total bypass toggles; nuke timer setting |
| `platforms/instagram.js` | Instagram platform adapter |
| `platforms/facebook.js` | Facebook platform adapter |
| `platforms/youtube.js` | YouTube platform adapter (uses poll instead of MutationObserver due to Polymer) |
| `popup.html` / `popup.js` | Extension popup: enable toggle, show count, suggestion editor, preview button |
| `suggestions.json` | Default suggestions list |
| `styles/post.css` | Styles for the injected doom post (loaded into shadow DOM) |
| `styles/panel.css` | Styles for the floating control panel (loaded into shadow DOM) |
| `generate_icons.py` | One-time script to generate `icons/icon{16,48,128}.png` using stdlib only |

---

## Platform adapters

Each platform object implements:

```js
{
  name,
  getChipLabel(),         // text shown in the panel chip
  isOnFeedPage(),         // guard: only fire triggers on scrollable feeds
  getPostSel(),           // CSS selector for real feed posts
  getFeedSel(),           // CSS selector for the feed container
  buildPost(suggestion),  // returns a shadow-DOM host element
  findInsertionPoint(),   // returns { parent, before } or null
  insertPost(post),       // inserts the doom post node
  setupPostCountTrigger() // sets up MutationObserver or poll
}
```

### Platform-specific notes

**Instagram**
- Page types: `home` (`/`), `reels`, `explore`, `account` (profile grid) — each uses a different post selector
- Selectors by page type:
  - `home`: `article`
  - `reels`: `div[aria-label="Video player"]` (the UI overlay div — ⚠️ the `<video>` element is a SIBLING before it, not a child; hiding this div alone does NOT block the video)
  - `explore`/`account` (grid): `a[href*="/p/"], a[href*="/reel/"]`
  - ⚠️ `div[data-visualcompletion="ignore-dynamic"]` matches toolbar on account pages — do NOT use
  - `findInsertionPoint()` uses `getPostSel()` dynamically (not hardcoded `article`) for all feed types
  - For reels: doom post host is a zero-size mount point (`width:0;height:0`) appended to `document.body`. The visible overlay is `.reel-screen` inside shadow DOM using `position:fixed; z-index:100; width:100vw; height:100vh` — viewport-relative, bypasses reel container's stacking context (so Instagram's search bar at higher z-index appears above it). `pointer-events:none` on `.reel-screen`, `pointer-events:auto` on `.wrap` allows swipe/scroll through to Instagram. Video is blurred (`filter:blur(12px)`) via `insertPost()` — the `<video>` is a SIBLING of `div[aria-label="Video player"]`, not a child; we reach it via `visible.parentElement.querySelector('video')`. Blurred videos tracked in module-level `_reelBlurredVideos` array; cleaned up on SPA nav and on dismiss. `.reel-overlay` class on host triggers `post.css` card-width constraint (380px).
  - Grid: walks up 3 levels from thumbnail, inserts above grid but below profile header
- MutationObserver on `<main>`; `_feedObserver` ref tracked and disconnected before re-setup
- SPA navigation: polls `location.pathname` every 300ms (`window._dssInstagramNavPolling` flag prevents duplicate intervals). On URL change: drops old observer, waits 800ms for React to render, seeds at 0, attaches observer, counts already-loaded posts as new.
- Does NOT call `scrollIntoView()` — it triggers Instagram's infinite scroll cascade

**Facebook**
- SPA: React re-hydration can re-inject the content script; `DSS.state.initialized` guards against double-init
- MutationObserver on the feed container

**YouTube**
- Contexts: `home` (rich grid), `watch` (sidebar), `shorts`
- Uses `setInterval` polling (2 s) instead of MutationObserver — Polymer hydration makes MO unreliable
- Resets poll on `yt-navigate-finish` event (SPA navigation)
- Shorts: uses a tall portrait canvas layout instead of the standard card

---

## State management

`DSS.state` lives in-memory on `window.DSS`. Key fields:

| Field | Purpose |
|---|---|
| `startTime` | Page-load timestamp; drives panel countdown |
| `timeFired` | Whether the 7-min timer has fired this session |
| `nukeMode` | True after 7-min trigger — every new post becomes a doom post |
| `nukeBypass` | Prevents nuke mode from activating |
| `totalBypass` | Disables ALL intervention (scroll, time, post-count) |
| `postsSeen` / `nextTriggerAt` | Post-count trigger state |
| `cachedSuggestions` | Pre-loaded for synchronous nuke insertions |
| `panelMinimized` | Collapsed state of the floating panel |

**Session persistence** (`sessionStorage` key `DSS_session`): `startTime`, `timeFired`, `nukeBypass`, `totalBypass` survive same-tab page reloads (e.g. Facebook auto-refresh). Discarded if stale (> 2 hours). Cleared on explicit Restart Timer or bypass toggle.

**Chrome storage:**
- `chrome.storage.sync`: suggestions list, enabled flag, `nukeMinutes` (configurable timer)
- `chrome.storage.local`: `showCount` (reality checks delivered)

---

## UI components

### Floating control panel (shadow DOM)
- Draggable, minimizable
- Live elapsed timer with colour states: normal → warn (72% of limit) → danger → nuked
- Status badge: Active / Almost at limit / Time limit hit / Nuke Mode / Paused
- Buttons: Restart Timer
- Toggles: Nuke Bypass, Total Bypass
- Settings: Nuke timer (number input, 1–120 min, saved to `chrome.storage.sync`)

### Popup
- Enable/Disable toggle
- Reality checks delivered counter
- Suggestions textarea (one per line)
- Save / Reset defaults buttons
- Preview post button (sends `{ type: 'preview' }` message to active tab)

---

## Isolation strategy

- **Shadow DOM** on every injected element — platform CSS cannot bleed in or out
- **Canvas API** for images — avoids CSP issues with external image URLs
- **No external dependencies**, no network requests, no analytics

---

## Tests

See [`docs/automation-tests.md`](automation-tests.md) for the full test plan, bug-driven test cases, and coverage gaps.

Located in `tests/` — Python/pytest based.

| File | Coverage |
|---|---|
| `test_instagram.py` | Instagram adapter |
| `test_facebook.py` | Facebook adapter |
| `test_youtube.py` | YouTube adapter |
| `test_panel.py` | Control panel |
| `test_bypass.py` | Bypass logic |
| `conftest.py` | Shared fixtures |
| `mock_pages/` | HTML mock pages for tests |
| `requirements-test.txt` | Test dependencies |
| `pytest.ini` | Pytest config |

---

## Known gotchas

- **Instagram account page (fixed 2026-03-16):** `getPostSel()` for grid pages was `div[data-visualcompletion="ignore-dynamic"]` — this selector matches the header/nav toolbar on account pages, causing it to be hidden instead of post thumbnails. Fixed to `a[href*="/p/"], a[href*="/reel/"]`. Also fixed `findInsertionPoint()` to walk up from thumbnail to a `<main>` direct child before inserting.
- **Instagram SPA navigation (fixed 2026-03-16, v4):** Root cause of all previous attempts failing: Chrome content scripts run in an isolated JS world — patching `history.pushState` in a content script does NOT intercept calls made by Instagram's page JS. Fix: poll `location.pathname` every 300ms; on change, drop old observer, wait 800ms for React to render, then seed at 0, attach observer, and count any already-loaded posts as "new". `setupObserver` no longer owns state — callers do.
- Instagram infinite scroll cascade: inserting a post triggers more posts → counter fires again. Mitigated by: 30 s cooldown between normal-mode doom posts, and no `scrollIntoView()`.
- **Instagram reels search bar (fixed 2026-03-16):** Reel container has transform-based composite stacking context — `position:absolute` doom post inside it appeared above Instagram's search bar. Fix: use `position:fixed; z-index:100` on `.reel-screen` inside shadow DOM. Fixed overlay is viewport-relative and sits below Instagram's modal/search z-index layers. Host element appended to `document.body` (DOM position irrelevant for fixed child). Nav cleanup: `setInterval` poll removes `.reel-overlay[data-doom-scroll-post]` elements and restores `_reelBlurredVideos` on URL change.
- Facebook React re-hydration may re-inject the content script mid-session — `initialized` flag guards against double-init; `||` on `DSS.state` preserves in-memory timer state.
- YouTube Polymer hydration makes MutationObserver unreliable — replaced with `setInterval` poll.
- `chrome.storage.sync` reads are async; `nukeMinutes` is applied to `CONFIG.timeLimit` early in `state.js` but races with `setupTimeTrigger()` — typically resolves before `document_idle` but not guaranteed on very fast loads.
