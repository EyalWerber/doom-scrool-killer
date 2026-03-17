"""
Facebook-specific tests.
"""
from playwright.sync_api import Page, expect


def test_panel_appears(fb_page: Page):
    """Extension injects the control panel on Facebook."""
    expect(fb_page.locator("[data-doom-panel]")).to_have_count(1)


def test_doom_post_appears_after_new_articles(fb_page: Page):
    """Adding ≥10 role=article elements fires at least one doom post."""
    fb_page.evaluate(
        "document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove())"
    )

    for i in range(12):
        fb_page.evaluate("""(i) => {
            const feed = document.querySelector('[role="feed"]');
            if (!feed) return;
            const article = document.createElement('div');
            article.setAttribute('role', 'article');
            article.dataset.dynamic = 'true';
            article.textContent = 'FB post ' + i;
            feed.appendChild(article);
        }""", i)
        fb_page.wait_for_timeout(60)

    fb_page.wait_for_selector("[data-doom-scroll-post]", timeout=6_000)
    count = fb_page.locator("[data-doom-scroll-post]").count()
    assert count >= 1


def test_scroll_bottom_triggers_doom_post(fb_page: Page):
    """Scrolling to page bottom triggers a doom post on Facebook."""
    fb_page.evaluate(
        "document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove())"
    )
    fb_page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    fb_page.wait_for_selector("[data-doom-scroll-post]", timeout=5_000)


def test_panel_shows_facebook_site(fb_page: Page):
    """Control panel chip shows 'facebook'."""
    chip_text = fb_page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return null;
        const chip = host.shadowRoot.querySelector('.site-chip');
        return chip ? chip.textContent.trim() : null;
    }""")
    assert chip_text is not None
    assert "facebook" in chip_text.lower()
