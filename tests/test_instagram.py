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
    """Append `count` <article> elements to the Instagram mock feed."""
    for i in range(count):
        page.evaluate("""([i, prefix]) => {
            const feed = document.querySelector('main #feed') || document.querySelector('main > div');
            if (!feed) return;
            const article = document.createElement('article');
            article.dataset.dynamic = 'true';
            article.dataset.idx = prefix + i;
            article.textContent = 'Dynamic post ' + prefix + i;
            feed.appendChild(article);
        }""", [i, prefix])
        if delay_ms:
            page.wait_for_timeout(delay_ms)


def test_sparse_doom_appears_in_feed(ig_page: Page):
    """
    Adding 12 articles triggers at least one sparse doom post inserted before
    a real post. Sparse counter starts at 5–9, so 12 posts guarantees one hit.
    """
    _add_articles(ig_page, 12)

    ig_page.wait_for_selector("[data-doom-scroll-post]", timeout=6_000)

    count = ig_page.locator("[data-doom-scroll-post]").count()
    assert count >= 1, f"Expected ≥1 doom post, got {count}"


def test_sparse_doom_appears_multiple_times(ig_page: Page):
    """
    Adding 20 articles triggers at least 2 sparse doom posts.
    Worst case: counter starts at 9, resets to 9 → hits at posts 9 and 18.
    """
    _add_articles(ig_page, 20, prefix="m", delay_ms=50)

    ig_page.wait_for_timeout(1_500)

    count = ig_page.locator("[data-doom-scroll-post]").count()
    assert count >= 2, f"Expected ≥2 doom posts, got {count}"


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
