"""
Bypass toggle tests — total bypass prevents doom posts; nuke bypass
stops nuke mode from activating.
"""
from playwright.sync_api import Page


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _enable_total_bypass(page: Page):
    """Click the Total Bypass toggle in the control panel via JS."""
    page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return;
        const inputs = Array.from(host.shadowRoot.querySelectorAll('input[type="checkbox"]'));
        // The total bypass toggle is the last one
        const toggle = inputs[inputs.length - 1];
        if (toggle && !toggle.checked) toggle.click();
    }""")
    page.wait_for_timeout(200)


def _disable_total_bypass(page: Page):
    """Uncheck the Total Bypass toggle."""
    page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return;
        const inputs = Array.from(host.shadowRoot.querySelectorAll('input[type="checkbox"]'));
        const toggle = inputs[inputs.length - 1];
        if (toggle && toggle.checked) toggle.click();
    }""")
    page.wait_for_timeout(200)


def _click_restart_timer(page: Page):
    """Click the Restart Timer button in the panel."""
    page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return;
        const buttons = Array.from(host.shadowRoot.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes('Restart'));
        if (btn) btn.click();
    }""")
    page.wait_for_timeout(300)


# ---------------------------------------------------------------------------
# Total bypass
# ---------------------------------------------------------------------------

def test_total_bypass_prevents_doom_posts(ig_page: Page):
    """When Total Bypass is on, adding many posts must NOT produce any doom post."""
    ig_page.evaluate(
        "document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove())"
    )

    _enable_total_bypass(ig_page)

    for i in range(15):
        ig_page.evaluate("""(i) => {
            const feed = document.querySelector('main #feed') || document.querySelector('main > div');
            if (!feed) return;
            const article = document.createElement('article');
            article.dataset.bypass_test = 'true';
            article.dataset.idx = i;
            article.textContent = 'Bypass post ' + i;
            feed.appendChild(article);
        }""", i)
        ig_page.wait_for_timeout(60)

    ig_page.wait_for_timeout(1_500)
    count = ig_page.locator("[data-doom-scroll-post]").count()
    assert count == 0, f"Total bypass is on but {count} doom post(s) appeared"

    _disable_total_bypass(ig_page)


def test_total_bypass_prevents_scroll_trigger(ig_page: Page):
    """Scroll-to-bottom should not fire a doom post when Total Bypass is on."""
    ig_page.evaluate(
        "document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove())"
    )

    _enable_total_bypass(ig_page)
    ig_page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    ig_page.wait_for_timeout(1_500)

    count = ig_page.locator("[data-doom-scroll-post]").count()
    assert count == 0, "Total bypass should stop scroll-bottom trigger"

    _disable_total_bypass(ig_page)


def test_doom_posts_resume_after_bypass_disabled(ig_page: Page):
    """After disabling Total Bypass, scroll-to-bottom fires again."""
    ig_page.evaluate(
        "document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove())"
    )

    _enable_total_bypass(ig_page)
    _disable_total_bypass(ig_page)

    ig_page.evaluate("window.scrollTo(0, 0)")
    ig_page.wait_for_timeout(300)
    ig_page.evaluate("window.scrollTo(0, document.body.scrollHeight)")

    ig_page.wait_for_selector("[data-doom-scroll-post]", timeout=5_000)


# ---------------------------------------------------------------------------
# Restart timer
# ---------------------------------------------------------------------------

def test_restart_timer_resets_panel_timer(ig_page: Page):
    """Clicking Restart Timer resets the elapsed time shown in the panel."""
    ig_page.wait_for_timeout(2_000)

    t_before = ig_page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return null;
        return host.shadowRoot.querySelector('.timer-val')?.textContent.trim();
    }""")

    _click_restart_timer(ig_page)
    ig_page.wait_for_timeout(300)

    t_after = ig_page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return null;
        return host.shadowRoot.querySelector('.timer-val')?.textContent.trim();
    }""")

    assert t_before != t_after, "Timer did not reset after Restart Timer click"
    assert t_after in ("0:00", "0:01", "0:02"), (
        f"Timer should be near 0:00 after restart, got {t_after!r}"
    )
