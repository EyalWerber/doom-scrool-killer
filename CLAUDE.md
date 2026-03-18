# Doom Scroll Stopper — Claude Context

## What this project is
A Chrome extension (Manifest V3) that intercepts Instagram, Facebook, and YouTube to interrupt doom-scrolling. It injects "STOP" posts into the feed, either sparingly (1-in-5-9 posts) or in full nuke mode (after 7 minutes, every post).

## Architecture

### Load order (manifest.json)
```
core/state.js → core/suggestions.js → core/canvas.js → core/utils.js →
core/doom.js → core/triggers.js → core/panel.js →
platforms/instagram.js → platforms/facebook.js → platforms/youtube.js →
content.js
```

### Key files
- `core/doom.js` — `showDoomPost`, `nukePost`, `sparseDoomPost`, `unNuke`
- `core/triggers.js` — 7-min timer, scroll-bottom trigger, activateNuke()
- `core/state.js` — shared state + sessionStorage persistence
- `platforms/instagram.js` — Instagram-specific selectors, observer, buildPost, buildGridPost
- `content.js` — entry point, platform detection, skip-login logic

---

## Critical architectural rules

### 1. Doom posts go INSIDE the target node — never as siblings in the feed
React manages the feed container. Inserting a foreign sibling triggers reconciliation: React removes it, restores the article, the MutationObserver fires again → infinite cascade loop. React ignores foreign *children* it didn't create.

- `sparseDoomPost` → `realNode.appendChild(doom)` with `position:absolute` overlay
- `nukePost` (feed `<article>`) → overlay-inside, `position:relative` + `min-height` via ResizeObserver
- `nukePost` (grid `<a>`) → overlay-inside too — grid IS React-managed, sibling insertion gets reconciled away

### 2. Grid pages vs feed pages
**Home feed / Reels** (`<article>`, `div[aria-label="Video player"]`):
- Overlay inside article, `position:relative` on article, `visibility:hidden` until `ResizeObserver` measures height, then set `min-height` and reveal atomically
- `data-doom-hidden` marks article as processed (article stays visible — not hidden)

**Explore / Account grid** (`a[href*="/p/"]`, `a[href*="/reel/"]`):
- Use `buildGridPost()` — compact dark overlay (🛑 + short text + dismiss), NOT the full feed card
- Both `sparseDoomPost` and `nukePost`: overlay inside `<a>` with `height:100%; overflow:hidden`
- Dismiss button must call `e.stopPropagation()` to prevent `<a>` navigation
- `host.addEventListener('click', e => e.stopPropagation())` blocks ALL clicks reaching the `<a>`
- `host.style.position = 'relative'` required so the `position:absolute` shadow overlay has an anchor

### 3. Video silencing
For reels, `<video>` is a **direct sibling** of `div[aria-label="Video player"]`, not a child. Search `realNode.parentElement.children` (direct children only) — NOT `querySelectorAll` which recurses into neighbouring posts and freezes the whole feed.

Add `keepPaused = e => e.target.pause()` listener on `play` events to block Instagram's own playback observer from re-starting videos.

### 4. data-dss-seen / data-doom-hidden guards
- `data-dss-seen` — set by `_sparseTick` on every new post (skip or replace decision)
- `data-doom-hidden` — set by `nukePost` on articles/thumbnails that have been processed
- Both prevent re-processing on React re-renders
- `_newPostSel` excludes both: `:not([data-doom-scroll-post]):not([data-dss-seen]):not([data-doom-hidden])`

---

## Testing

### Running tests
```bash
python -m pytest tests/test_instagram.py -v       # mock tests (fast, no login)
python -m pytest tests/test_instagram_real.py -v -s  # real Instagram (needs login)
```

### Triggering nuke mode in tests
Content scripts run in an **isolated JS world** — `window.DSS` is invisible to `page.evaluate()`. The DOM and `sessionStorage` ARE shared.

To enter nuke mode without waiting 7 minutes:
```python
import time
start_ms = int(time.time() * 1000) - 60 * 60 * 1000
page.evaluate(f"""() => {{
    sessionStorage.setItem('DSS_session', JSON.stringify({{
        startTime: {start_ms}, timeFired: true,
        nukeBypass: false, totalBypass: false,
    }}));
}}""")
page.reload(wait_until="domcontentloaded")
page.wait_for_selector("[data-doom-scroll-post]", timeout=5_000)
```
This works because `restoreSession()` in `state.js` reads sessionStorage on every load.

### Test conventions
- Use `page.fill()` — never `press_sequentially()` with delay
- Use `wait_for_selector` / `wait_for_function` — not fixed `wait_for_timeout` sleeps
- Short `wait_for_timeout(≤600ms)` only to let a second event settle after the first is confirmed
- Mock fixtures live in `tests/mock_pages/` and are routed via `page.route()`
- Each page type needs its own mock HTML and conftest fixture

### Mock pages
| File | URL | Purpose |
|------|-----|---------|
| `instagram.html` | `https://www.instagram.com/` | Home feed (`<article>`) |
| `instagram_explore.html` | `https://www.instagram.com/explore/` | Explore grid (`<a href*="/p/">`) |
| `facebook.html` | `https://www.facebook.com/` | Facebook feed |
| `youtube_home.html` | `https://www.youtube.com/` | YouTube home |
| `youtube_watch.html` | `https://www.youtube.com/watch?...` | YouTube watch page |
