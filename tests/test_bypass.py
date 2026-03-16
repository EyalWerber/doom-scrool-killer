"""
Bypass toggle tests — total bypass prevents doom posts; nuke bypass
stops nuke mode from activating.
"""
import pytest
from playwright.async_api import Page

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _enable_total_bypass(page: Page):
    """Click the Total Bypass toggle in the control panel via JS."""
    await page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return;
        const inputs = Array.from(host.shadowRoot.querySelectorAll('input[type="checkbox"]'));
        // The total bypass toggle is the last one
        const toggle = inputs[inputs.length - 1];
        if (toggle && !toggle.checked) toggle.click();
    }""")
    await page.wait_for_timeout(200)


async def _disable_total_bypass(page: Page):
    """Uncheck the Total Bypass toggle."""
    await page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return;
        const inputs = Array.from(host.shadowRoot.querySelectorAll('input[type="checkbox"]'));
        const toggle = inputs[inputs.length - 1];
        if (toggle && toggle.checked) toggle.click();
    }""")
    await page.wait_for_timeout(200)


async def _click_restart_timer(page: Page):
    """Click the Restart Timer button in the panel."""
    await page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return;
        const buttons = Array.from(host.shadowRoot.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes('Restart'));
        if (btn) btn.click();
    }""")
    await page.wait_for_timeout(300)


# ---------------------------------------------------------------------------
# Total bypass
# ---------------------------------------------------------------------------

async def test_total_bypass_prevents_doom_posts(ig_page: Page):
    """When Total Bypass is on, adding many posts must NOT produce any doom post."""
    await ig_page.evaluate(
        "document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove())"
    )

    await _enable_total_bypass(ig_page)

    for i in range(15):
        await ig_page.evaluate("""(i) => {
            const feed = document.querySelector('main #feed') || document.querySelector('main > div');
            if (!feed) return;
            const article = document.createElement('article');
            article.dataset.bypass_test = 'true';
            article.dataset.idx = i;
            article.textContent = 'Bypass post ' + i;
            feed.appendChild(article);
        }""", i)
        await ig_page.wait_for_timeout(60)

    # Give a generous window to ensure no doom posts appear
    await ig_page.wait_for_timeout(1_500)
    count = await ig_page.locator("[data-doom-scroll-post]").count()
    assert count == 0, f"Total bypass is on but {count} doom post(s) appeared"

    # Restore for other tests
    await _disable_total_bypass(ig_page)


async def test_total_bypass_prevents_scroll_trigger(ig_page: Page):
    """Scroll-to-bottom should not fire a doom post when Total Bypass is on."""
    await ig_page.evaluate(
        "document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove())"
    )

    await _enable_total_bypass(ig_page)
    await ig_page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    await ig_page.wait_for_timeout(1_500)

    count = await ig_page.locator("[data-doom-scroll-post]").count()
    assert count == 0, "Total bypass should stop scroll-bottom trigger"

    await _disable_total_bypass(ig_page)


async def test_doom_posts_resume_after_bypass_disabled(ig_page: Page):
    """After disabling Total Bypass, scroll-to-bottom fires again."""
    await ig_page.evaluate(
        "document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove())"
    )

    await _enable_total_bypass(ig_page)
    await _disable_total_bypass(ig_page)

    # Reset scroll cooldown by reloading scroll position
    await ig_page.evaluate("window.scrollTo(0, 0)")
    await ig_page.wait_for_timeout(300)
    await ig_page.evaluate("window.scrollTo(0, document.body.scrollHeight)")

    await ig_page.wait_for_selector("[data-doom-scroll-post]", timeout=5_000)


# ---------------------------------------------------------------------------
# Restart timer
# ---------------------------------------------------------------------------

async def test_restart_timer_resets_panel_timer(ig_page: Page):
    """Clicking Restart Timer resets the elapsed time shown in the panel."""
    # Wait 2 s so the timer shows at least 0:02
    await ig_page.wait_for_timeout(2_000)

    t_before = await ig_page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return null;
        return host.shadowRoot.querySelector('.timer-val')?.textContent.trim();
    }""")

    await _click_restart_timer(ig_page)
    await ig_page.wait_for_timeout(300)

    t_after = await ig_page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return null;
        return host.shadowRoot.querySelector('.timer-val')?.textContent.trim();
    }""")

    assert t_before != t_after, "Timer did not reset after Restart Timer click"
    # After restart the timer should show something close to 0:00
    assert t_after in ("0:00", "0:01", "0:02"), (
        f"Timer should be near 0:00 after restart, got {t_after!r}"
    )
