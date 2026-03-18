"""
Instagram-specific tests.
"""
from playwright.sync_api import Page, expect


# ---------------------------------------------------------------------------
# Panel / init
# ---------------------------------------------------------------------------

def test_panel_appears(ig_page: Page):
    """Extension injects the control panel into the feed page."""
    expect(ig_page.locator("[data-doom-panel]")).to_have_count(1)


def test_panel_shows_instagram_site(ig_page: Page):
    """Control panel displays the correct site chip (Instagram)."""
    chip_text = ig_page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return null;
        const chip = host.shadowRoot.querySelector('.site-chip');
        return chip ? chip.textContent.trim() : null;
    }""")
    assert chip_text is not None
    assert "instagram" in chip_text.lower()


# ---------------------------------------------------------------------------
# Sparse post replacement (1-in-5-to-9)
# ---------------------------------------------------------------------------

def _add_articles(page: Page, count: int, prefix: str = "", delay_ms: int = 60):
    """Append `count` <article> elements to the Instagram mock feed one at a time."""
    for i in range(count):
        page.evaluate("""([i, prefix]) => {
            const feed = document.querySelector('main #feed') || document.querySelector('main > div');
            if (!feed) return;
            const article = document.createElement('article');
            article.dataset.dynamic = 'true';
            article.dataset.idx = String(prefix) + i;
            article.textContent = 'Dynamic post ' + prefix + i;
            feed.appendChild(article);
        }""", [i, prefix])
        if delay_ms:
            page.wait_for_timeout(delay_ms)


def test_sparse_doom_appears_in_feed(ig_page: Page):
    """
    Adding 10 articles triggers ≥1 sparse doom post.
    Worst-case sparse counter starts at 9, so 10 new posts guarantees one hit.
    """
    _add_articles(ig_page, 10)
    ig_page.wait_for_selector("[data-doom-scroll-post]", timeout=6_000)

    count = ig_page.locator("[data-doom-scroll-post]").count()
    assert count >= 1, f"Expected ≥1 doom post, got {count}"


def test_sparse_doom_post_is_inside_article(ig_page: Page):
    """
    The doom overlay must be appended INSIDE the target article, not injected
    as a sibling in the feed container. Sibling insertion triggers React
    reconciliation which re-renders every post — the cascade bug.
    """
    _add_articles(ig_page, 10)
    ig_page.wait_for_selector("[data-doom-scroll-post]", timeout=6_000)

    all_inside_article = ig_page.evaluate("""() => {
        const dooms = [...document.querySelectorAll('[data-doom-scroll-post]')];
        return dooms.length > 0 && dooms.every(
            d => d.parentElement && d.parentElement.tagName === 'ARTICLE'
        );
    }""")
    assert all_inside_article, "Doom post must be a child of <article>, not a sibling in the feed"


def test_sparse_doom_does_not_cascade(ig_page: Page):
    """
    Regression: only a small fraction of posts should get the doom overlay.
    Before the fix, the first doom post caused ALL posts to turn to STOP.
    With 10 new posts and counter 5–9, at most 2 doom posts can fire.
    """
    _add_articles(ig_page, 10)
    ig_page.wait_for_selector("[data-doom-scroll-post]", timeout=6_000)

    doom_count = ig_page.locator("[data-doom-scroll-post]").count()
    article_count = ig_page.locator("article").count()  # includes host articles

    assert doom_count < article_count, (
        f"Cascade suspected: {doom_count} doom posts out of {article_count} articles"
    )
    assert doom_count <= 2, (
        f"Expected ≤2 doom posts from 10 new articles (counter 5–9), got {doom_count}"
    )


def test_sparse_doom_appears_multiple_times(ig_page: Page):
    """
    Adding 20 articles triggers ≥2 sparse doom posts.
    Worst case: counter=9, resets to 9 → fires at posts 9 and 18.
    """
    _add_articles(ig_page, 20, prefix="m", delay_ms=50)

    # Wait for the first hit, then a brief pause for the second to land.
    ig_page.wait_for_selector("[data-doom-scroll-post]", timeout=8_000)
    ig_page.wait_for_timeout(600)

    count = ig_page.locator("[data-doom-scroll-post]").count()
    assert count >= 2, f"Expected ≥2 doom posts from 20 articles, got {count}"


# ---------------------------------------------------------------------------
# Nuke mode — new posts loaded while nuke is active
# ---------------------------------------------------------------------------

def test_nuke_mode_nukes_new_posts(ig_page: Page):
    """
    New posts added while nuke mode is active must be replaced within 5 s.

    Content scripts run in an isolated JS world so we can't set window.DSS
    directly.  Instead we write timeFired=true into sessionStorage — the
    extension's restoreSession() reads it on load and setupTimeTrigger()
    immediately calls activateNuke() instead of waiting 7 minutes.
    """
    import time

    # Write the session flag that tells the extension the 7-min timer already
    # fired.  startTime is set 1 hour ago so no stale-session guard discards it.
    start_ms = int(time.time() * 1000) - 60 * 60 * 1000
    ig_page.evaluate(f"""() => {{
        sessionStorage.setItem('DSS_session', JSON.stringify({{
            startTime:   {start_ms},
            timeFired:   true,
            nukeBypass:  false,
            totalBypass: false,
        }}));
    }}""")

    # Reload so the extension re-reads the session and enters nuke mode.
    ig_page.reload(wait_until="domcontentloaded")
    ig_page.wait_for_selector("[data-doom-panel]", timeout=10_000)

    # activateNuke() is async (getSuggestions storage call) — wait for it.
    ig_page.wait_for_selector("[data-doom-scroll-post]", timeout=5_000)

    # Cumulative counter: counts doom posts ADDED, not current DOM snapshot.
    # Virtual scrolling unmounts off-screen posts, so snapshot counts mislead.
    ig_page.evaluate("""() => {
        window.__doomAdded = 0;
        new MutationObserver(muts => {
            for (const m of muts)
                for (const n of m.addedNodes)
                    if (n.nodeType === 1 && n.matches('[data-doom-scroll-post]'))
                        window.__doomAdded++;
        }).observe(document.body, { childList: true, subtree: true });
    }""")

    # Inject 3 new articles — the MutationObserver must nuke each within 5 s.
    _add_articles(ig_page, 3, prefix="nuke", delay_ms=200)

    ig_page.wait_for_function("() => window.__doomAdded >= 3", timeout=5_000)

    added = ig_page.evaluate("() => window.__doomAdded")
    assert added >= 3, f"Expected 3 new doom posts added, counter was {added}"


# ---------------------------------------------------------------------------
# Nuke mode — explore grid page
# ---------------------------------------------------------------------------

def _add_thumbs(page: Page, count: int, prefix: str = "", delay_ms: int = 100):
    """Append `count` grid thumbnail <a> links to the explore mock feed."""
    for i in range(count):
        page.evaluate("""([i, prefix]) => {
            const grid = document.querySelector('main .grid') || document.querySelector('main > div');
            if (!grid) return;
            const a = document.createElement('a');
            a.href = '/p/' + prefix + i + '/';
            a.dataset.dynamic = 'true';
            a.dataset.idx = String(prefix) + i;
            a.textContent = 'Dynamic thumb ' + prefix + i;
            grid.appendChild(a);
        }""", [i, prefix])
        if delay_ms:
            page.wait_for_timeout(delay_ms)


def test_nuke_mode_nukes_new_thumbs_on_explore(ig_explore_page: Page):
    """
    New grid thumbnails added while nuke mode is active must be replaced
    within 5 s — same guarantee as the home feed nuke test.

    Explore thumbnails are <a href*="/p/"> elements.  nukePost hides them
    with display:none and inserts a compact buildGridPost sibling sized to
    match the thumbnail cell.
    """
    import time

    start_ms = int(time.time() * 1000) - 60 * 60 * 1000
    ig_explore_page.evaluate(f"""() => {{
        sessionStorage.setItem('DSS_session', JSON.stringify({{
            startTime:   {start_ms},
            timeFired:   true,
            nukeBypass:  false,
            totalBypass: false,
        }}));
    }}""")

    ig_explore_page.reload(wait_until="domcontentloaded")
    ig_explore_page.wait_for_selector("[data-doom-panel]", timeout=10_000)

    # Wait for nuke to activate and nuke the pre-existing thumbnails.
    ig_explore_page.wait_for_selector("[data-doom-scroll-post]", timeout=5_000)

    ig_explore_page.evaluate("""() => {
        window.__doomAdded = 0;
        new MutationObserver(muts => {
            for (const m of muts)
                for (const n of m.addedNodes)
                    if (n.nodeType === 1 && n.matches('[data-doom-scroll-post]'))
                        window.__doomAdded++;
        }).observe(document.body, { childList: true, subtree: true });
    }""")

    # Add 3 new thumbnails — the MutationObserver must nuke each within 5 s.
    _add_thumbs(ig_explore_page, 3, prefix="nuke", delay_ms=150)

    ig_explore_page.wait_for_function("() => window.__doomAdded >= 3", timeout=5_000)

    added = ig_explore_page.evaluate("() => window.__doomAdded")
    assert added >= 3, f"Expected 3 new doom posts added, counter was {added}"


# ---------------------------------------------------------------------------
# Scroll-to-bottom trigger
# ---------------------------------------------------------------------------

def test_scroll_bottom_triggers_doom_post(ig_page: Page):
    """Scrolling to the bottom of the feed fires a doom post."""
    ig_page.evaluate(
        "document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove())"
    )
    ig_page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    ig_page.wait_for_selector("[data-doom-scroll-post]", timeout=5_000)


# ---------------------------------------------------------------------------
# Dismiss button
# ---------------------------------------------------------------------------

def test_dismiss_button_removes_doom_post(ig_page: Page):
    """Clicking the dismiss button removes the doom post from the DOM."""
    ig_page.evaluate(
        "document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove())"
    )
    ig_page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    ig_page.wait_for_selector("[data-doom-scroll-post]", timeout=5_000)

    dismissed = ig_page.evaluate("""() => {
        const host = document.querySelector('[data-doom-scroll-post]');
        if (!host || !host.shadowRoot) return false;
        const btn = host.shadowRoot.querySelector('button');
        if (!btn) return false;
        btn.click();
        return true;
    }""")
    assert dismissed, "Could not find dismiss button in Shadow DOM"

    ig_page.wait_for_timeout(500)
    count = ig_page.locator("[data-doom-scroll-post]").count()
    assert count == 0, "Doom post should be removed after dismiss"
