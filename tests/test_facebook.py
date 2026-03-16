"""
Facebook-specific tests.
"""
import pytest
from playwright.async_api import Page, expect

pytestmark = pytest.mark.asyncio


async def test_panel_appears(fb_page: Page):
    """Extension injects the control panel on Facebook."""
    await expect(fb_page.locator("[data-doom-panel]")).to_have_count(1)


async def test_doom_post_appears_after_new_articles(fb_page: Page):
    """Adding ≥10 role=article elements fires at least one doom post."""
    await fb_page.evaluate(
        "document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove())"
    )

    for i in range(12):
        await fb_page.evaluate("""(i) => {
            const feed = document.querySelector('[role="feed"]');
            if (!feed) return;
            const article = document.createElement('div');
            article.setAttribute('role', 'article');
            article.dataset.dynamic = 'true';
            article.textContent = 'FB post ' + i;
            feed.appendChild(article);
        }""", i)
        await fb_page.wait_for_timeout(60)

    await fb_page.wait_for_selector("[data-doom-scroll-post]", timeout=6_000)
    count = await fb_page.locator("[data-doom-scroll-post]").count()
    assert count >= 1


async def test_scroll_bottom_triggers_doom_post(fb_page: Page):
    """Scrolling to page bottom triggers a doom post on Facebook."""
    await fb_page.evaluate(
        "document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove())"
    )
    await fb_page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    await fb_page.wait_for_selector("[data-doom-scroll-post]", timeout=5_000)


async def test_panel_shows_facebook_site(fb_page: Page):
    """Control panel chip shows 'facebook'."""
    chip_text = await fb_page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return null;
        const chip = host.shadowRoot.querySelector('.site-chip');
        return chip ? chip.textContent.trim() : null;
    }""")
    assert chip_text is not None
    assert "facebook" in chip_text.lower()
