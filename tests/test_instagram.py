"""
Instagram-specific tests.
"""
import pytest
from playwright.async_api import Page, expect

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Panel / init
# ---------------------------------------------------------------------------

async def test_panel_appears(ig_page: Page):
    """Extension injects the control panel into the feed page."""
    panel_host = ig_page.locator("[data-doom-panel]")
    await expect(panel_host).to_have_count(1)


async def test_panel_shows_instagram_site(ig_page: Page):
    """Control panel displays the correct site chip (Instagram)."""
    # The site chip text is inside Shadow DOM; query via JS
    chip_text = await ig_page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return null;
        const chip = host.shadowRoot.querySelector('.site-chip');
        return chip ? chip.textContent.trim() : null;
    }""")
    assert chip_text is not None
    assert "instagram" in chip_text.lower()


# ---------------------------------------------------------------------------
# Post count trigger
# ---------------------------------------------------------------------------

async def test_doom_post_appears_after_enough_new_posts(ig_page: Page):
    """
    Adding 12 articles to the Instagram feed triggers at least one doom post
    (threshold is 5–10, so 12 guarantees at least one trigger).
    """
    # Remove any pre-existing doom posts from other tests
    await ig_page.evaluate(
        "document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove())"
    )

    for i in range(12):
        await ig_page.evaluate("""(i) => {
            const feed = document.querySelector('main #feed') || document.querySelector('main > div');
            if (!feed) return;
            const article = document.createElement('article');
            article.dataset.dynamic = 'true';
            article.dataset.idx = i;
            article.textContent = 'Dynamic post ' + i;
            feed.appendChild(article);
        }""", i)
        await ig_page.wait_for_timeout(60)

    await ig_page.wait_for_selector("[data-doom-scroll-post]", timeout=6_000)
    count = await ig_page.locator("[data-doom-scroll-post]").count()
    assert count >= 1


async def test_multiple_doom_posts_appear(ig_page: Page):
    """
    Without the one-at-a-time guard, two or more doom posts appear for 25+ new posts.
    """
    await ig_page.evaluate(
        "document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove())"
    )

    for i in range(25):
        await ig_page.evaluate("""(i) => {
            const feed = document.querySelector('main #feed') || document.querySelector('main > div');
            if (!feed) return;
            const article = document.createElement('article');
            article.dataset.dynamic = 'true';
            article.dataset.idx = 'multi-' + i;
            article.textContent = 'Post ' + i;
            feed.appendChild(article);
        }""", i)
        await ig_page.wait_for_timeout(50)

    # Allow time for all mutations to process
    await ig_page.wait_for_timeout(1_500)

    count = await ig_page.locator("[data-doom-scroll-post]").count()
    # 25 posts / avg 7.5 trigger = ~3 doom posts expected
    assert count >= 2, f"Expected ≥2 doom posts, got {count}"


# ---------------------------------------------------------------------------
# Scroll-to-bottom trigger
# ---------------------------------------------------------------------------

async def test_scroll_bottom_triggers_doom_post(ig_page: Page):
    """Scrolling to the bottom of the feed fires a doom post."""
    await ig_page.evaluate(
        "document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove())"
    )

    await ig_page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    await ig_page.wait_for_selector("[data-doom-scroll-post]", timeout=5_000)


# ---------------------------------------------------------------------------
# Dismiss button
# ---------------------------------------------------------------------------

async def test_dismiss_button_removes_doom_post(ig_page: Page):
    """Clicking the dismiss button removes the doom post from the DOM."""
    # Trigger a doom post via scroll
    await ig_page.evaluate(
        "document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove())"
    )
    await ig_page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    await ig_page.wait_for_selector("[data-doom-scroll-post]", timeout=5_000)

    # Click the dismiss button inside the Shadow DOM
    dismissed = await ig_page.evaluate("""() => {
        const host = document.querySelector('[data-doom-scroll-post]');
        if (!host || !host.shadowRoot) return false;
        const btn = host.shadowRoot.querySelector('button');
        if (!btn) return false;
        btn.click();
        return true;
    }""")
    assert dismissed, "Could not find dismiss button in Shadow DOM"

    await ig_page.wait_for_timeout(500)
    count = await ig_page.locator("[data-doom-scroll-post]").count()
    assert count == 0, "Doom post should be removed after dismiss"
