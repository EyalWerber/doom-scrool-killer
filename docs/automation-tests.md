# Automation Test Plan

> **AI instruction:** Update this file whenever a new bug is found, fixed, or when test coverage changes. Each bug found during manual testing should have a corresponding test case added here.

---

## Test Strategy

The extension runs as a Chrome content script. Tests should cover:
1. **Unit logic** — selector correctness, DOM manipulation helpers
2. **Integration** — observer setup, trigger firing, post insertion
3. **E2E (browser)** — real Instagram/Facebook/YouTube pages via Playwright or similar

Currently: Python/pytest unit tests in `tests/`. No E2E tests yet.

---

## Test Cases by Bug Found

### BUG-001 — Instagram account page blocks toolbar instead of thumbnails
**Status:** Fixed 2026-03-16
**Root cause:** `getPostSel()` returned `div[data-visualcompletion="ignore-dynamic"]` which matches the nav/header toolbar on account pages, not post thumbnails.
**Fix:** Changed to `a[href*="/p/"], a[href*="/reel/"]`

**Test cases needed:**
- [ ] `getPostSel()` on account page URL returns selector matching `a[href*="/p/"]`
- [ ] `getPostSel()` on account page URL returns selector matching `a[href*="/reel/"]`
- [ ] `getPostSel()` on account page URL does NOT return `div[data-visualcompletion...]`
- [ ] `nukePost()` on a thumbnail `<a>` element hides the link, not a toolbar div
- [ ] `findInsertionPoint()` on account page walks up to `<main>` direct child (not inside grid)
- [ ] Doom post inserted above the grid section, not inside it
- [ ] Using `Instagram_account_page.html` mock: no nav/toolbar elements are hidden after nuke

---

### BUG-002 — Instagram account page does not block reels thumbnails
**Status:** Fixed 2026-03-16
**Root cause:** Selector `a[href*="/p/"]` only matched posts, not reels (`/reel/` path).
**Fix:** Combined selector `a[href*="/p/"], a[href*="/reel/"]`

**Test cases needed:**
- [ ] `getPostSel()` for grid pages includes `/reel/` in the selector
- [ ] MutationObserver counts a new `a[href*="/reel/"]` node as a post
- [ ] Nuke mode hides reel thumbnail links (not just post links)
- [ ] On a mock explore/account page with both posts and reels, both are blocked

---

### BUG-003 — Instagram: block lost when navigating between account pages (SPA)
**Status:** Fixed 2026-03-16 (attempt 2)
**Root cause (attempt 1):** `history.pushState` fires BEFORE Instagram swaps the DOM. Calling `setupPostCountTrigger()` immediately latched onto the old `<main>`. When Instagram replaced the feed content, the observer was watching a stale/detached element.
**Root cause (additional):** Each `setupPostCountTrigger()` call created a new `MutationObserver` without disconnecting the old one, stacking observers.
**Fix:**
- Track `_feedObserver` ref; disconnect before re-setup
- On navigation: disconnect old observer, then use a temporary `document.body` observer that waits for the old post grid to clear (`.length === 0`), then re-latches to the fresh feed
- 4-second fallback in case Instagram never empties the grid during transition

**Test cases needed:**
- [ ] Simulated `pushState` navigation triggers `onNavigate()`
- [ ] Old `_feedObserver` is disconnected before new one is created
- [ ] After navigation, `postsSeen` resets to 0
- [ ] After navigation, `nextTriggerAt` resets to `newTriggerAt()` (not cumulative from old page)
- [ ] `_navWaitObs` is cleaned up after `latchToNewFeed()` runs
- [ ] `_navWaitObs` is cleaned up if navigation fires again before first one resolved
- [ ] Second navigation before first latch resolves: only ONE observer ends up active
- [ ] Fallback (4s timeout) calls `setupPostCountTrigger()` if grid never empties
- [ ] Navigating home → account → account → home: observer active on each correct page
- [ ] `getPostSel()` is re-evaluated after URL change (new page type gets correct selector)
- [ ] `history.pushState` patch is NOT used (content script isolated world — patch is invisible to page JS); URL polling via `setInterval` is used instead
- [ ] `window._dssInstagramNavPolling` flag prevents duplicate poll intervals

---

---

### BUG-004 — Doom post inserted at top of entire page (above profile header)
**Status:** Fixed 2026-03-16
**Root cause:** `findInsertionPoint()` for grid pages walked up from the thumbnail all the way to a direct child of `<main>`, placing the doom post before the entire profile (header + bio + tabs + grid).
**Fix:** Walk up exactly 3 levels from the thumbnail (stopping before `<main>`), which lands at the grid-section container level — below the profile header.

**Test cases needed:**
- [ ] `findInsertionPoint()` on a grid page does NOT return a node that is a direct child of `<main>`
- [ ] Insertion parent is NOT `<main>` itself
- [ ] Doom post appears below the profile bio/stats section (not above it)
- [ ] Doom post appears above the first row of thumbnails
- [ ] On `Instagram_account_page.html` mock: verify inserted node depth from `<main>` is > 1

---

## Existing Test Files (Python/pytest)

| File | Coverage |
|------|----------|
| `tests/test_instagram.py` | Instagram adapter |
| `tests/test_facebook.py` | Facebook adapter |
| `tests/test_youtube.py` | YouTube adapter |
| `tests/test_panel.py` | Control panel |
| `tests/test_bypass.py` | Bypass logic |
| `tests/conftest.py` | Shared fixtures |

---

## Proposed Test Infrastructure

### Option A — jsdom (lightweight unit tests)
Run JS logic in Node.js with jsdom. Good for:
- Selector correctness
- `getPageType()` / `isGridPage()` logic
- `getPostSel()` return values per URL
- `findInsertionPoint()` DOM traversal
- Observer setup/teardown logic

```
npm install --save-dev jest jest-environment-jsdom
```

### Option B — Playwright E2E (real browser)
Good for testing against live or recorded Instagram pages.
- Navigate between accounts, verify doom posts appear
- Verify toolbar is NOT hidden
- Verify reels ARE blocked
- Verify navigation persistence

```
pip install playwright pytest-playwright
playwright install chromium
```

### Option C — Hybrid
Unit tests with jsdom for logic, Playwright for integration smoke tests.

---

## Priority Test Gaps

1. **Instagram SPA navigation** — most fragile area, zero automated coverage
2. **Grid page selector correctness** — BUG-001/002 could have been caught with a simple selector test
3. **Observer stacking** — no test that calling `setupPostCountTrigger()` twice doesn't double-count posts
4. **Cross-platform selector isolation** — confirm Instagram selectors don't accidentally match on Facebook or YouTube
