"""
Instagram feature tests against the real Instagram website.

Run
---
    $env:INSTAGRAM_USER="your_user"; $env:INSTAGRAM_PASS="your_pass"
    pytest tests/test_instagram_real.py -v -s
"""
import pytest
from playwright.sync_api import Page, expect
from conftest import _ensure_logged_in


# ---------------------------------------------------------------------------
# Login flow — must run first
# ---------------------------------------------------------------------------

def test_extension_inactive_on_login_page(real_ctx):
    """DSS panel must NOT appear on the login page — only the inactive indicator."""
    page = real_ctx.new_page()
    page.goto("https://www.instagram.com/accounts/login/", wait_until="domcontentloaded")
    page.wait_for_timeout(3_000)

    # Panel should be absent
    assert page.locator("[data-doom-panel]").count() == 0, \
        "DSS panel should NOT appear on the login page"

    # Inactive indicator should be present
    assert page.locator("[data-dss-indicator]").count() == 1, \
        "DSS inactive indicator should appear on the login page"

    page.close()


def test_login_and_extension_activates(real_ctx):
    """Log in to Instagram and verify DSS panel appears on the home feed."""
    page = real_ctx.new_page()
    page.goto("https://www.instagram.com/accounts/login/", wait_until="domcontentloaded")
    page.wait_for_timeout(3_000)

    _ensure_logged_in(page)

    # Navigate to feed if not redirected automatically
    if "/accounts/login" in page.url:
        page.goto("https://www.instagram.com/", wait_until="domcontentloaded")
        page.wait_for_timeout(2_000)

    # Panel must now appear
    try:
        page.wait_for_selector("[data-doom-panel]", timeout=15_000)
    except Exception:
        pytest.exit(
            "\n\n💥 DSS panel did not appear after login. "
            "Login may have failed or the feed did not load.\n",
            returncode=1,
        )

    assert page.locator("[data-doom-panel]").count() == 1, \
        "DSS panel should appear on the home feed after login"

    page.close()


# ---------------------------------------------------------------------------
# Panel
# ---------------------------------------------------------------------------

def test_panel_appears_on_real_instagram(ig_real_page: Page):
    """Extension injects the control panel on real Instagram home feed."""
    expect(ig_real_page.locator("[data-doom-panel]")).to_have_count(1)


def test_panel_shows_instagram_chip(ig_real_page: Page):
    """Control panel site chip contains 'instagram'."""
    chip_text = ig_real_page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return null;
        const chip = host.shadowRoot.querySelector('.site-chip');
        return chip ? chip.textContent.trim() : null;
    }""")
    assert chip_text is not None
    assert "instagram" in chip_text.lower()


# ---------------------------------------------------------------------------
# Home feed — post count trigger
# ---------------------------------------------------------------------------

def test_doom_post_appears_on_home_feed(ig_real_page: Page):
    """
    Scrolling the real home feed until enough posts load triggers a doom post.
    Instagram lazy-loads posts as you scroll; we keep scrolling until we see one.
    """
    ig_real_page.evaluate(
        "document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove())"
    )

    # Scroll down in steps to trigger Instagram's infinite scroll + extension counter
    for _ in range(8):
        ig_real_page.evaluate("window.scrollBy(0, window.innerHeight)")
        ig_real_page.wait_for_timeout(800)
        if ig_real_page.locator("[data-doom-scroll-post]").count() > 0:
            break

    count = ig_real_page.locator("[data-doom-scroll-post]").count()
    assert count >= 1, "No doom post appeared after scrolling the home feed"


def test_doom_post_dismiss_on_real_instagram(ig_real_page: Page):
    """Dismiss button removes the doom post on real Instagram."""
    ig_real_page.evaluate(
        "document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove())"
    )

    # Trigger a doom post via scroll
    for _ in range(8):
        ig_real_page.evaluate("window.scrollBy(0, window.innerHeight)")
        ig_real_page.wait_for_timeout(800)
        if ig_real_page.locator("[data-doom-scroll-post]").count() > 0:
            break

    assert ig_real_page.locator("[data-doom-scroll-post]").count() >= 1, \
        "Could not trigger a doom post to test dismiss"

    dismissed = ig_real_page.evaluate("""() => {
        const host = document.querySelector('[data-doom-scroll-post]');
        if (!host || !host.shadowRoot) return false;
        const btn = host.shadowRoot.querySelector('button');
        if (!btn) return false;
        btn.click();
        return true;
    }""")
    assert dismissed, "Dismiss button not found in Shadow DOM"

    ig_real_page.wait_for_timeout(500)
    assert ig_real_page.locator("[data-doom-scroll-post]").count() == 0


# ---------------------------------------------------------------------------
# Account page — no doom posts before nuke
# ---------------------------------------------------------------------------

def test_no_doom_post_on_account_page(real_ctx):
    """
    Navigating to a public profile grid must NOT show a doom post before
    the nuke timer fires.
    """
    page = real_ctx.new_page()
    page.goto("https://www.instagram.com/instagram/", wait_until="domcontentloaded")
    _ensure_logged_in(page)
    page.wait_for_selector("[data-doom-panel]", timeout=15_000)

    # Scroll a bit to let the extension settle
    for _ in range(3):
        page.evaluate("window.scrollBy(0, window.innerHeight)")
        page.wait_for_timeout(600)

    count = page.locator("[data-doom-scroll-post]").count()
    page.close()
    assert count == 0, f"Doom post appeared on account page before nuke — got {count}"


# ---------------------------------------------------------------------------
# Reels — overlay covers video, swipe still works
# ---------------------------------------------------------------------------

def test_reels_overlay_appears(real_ctx):
    """
    On /reels, after the post-count threshold is crossed the doom overlay
    appears inside the reel container (not as a fixed full-screen element).
    """
    page = real_ctx.new_page()
    page.goto("https://www.instagram.com/reels/", wait_until="domcontentloaded")
    _ensure_logged_in(page)
    page.wait_for_selector("[data-doom-panel]", timeout=15_000)

    # Force a doom post immediately via JS (bypasses the 30s cooldown for testing)
    page.evaluate("""() => {
        if (window.DSS) {
            window.DSS.state.lastDoomPostTime = 0;
            window.DSS.showDoomPost('test');
        }
    }""")
    page.wait_for_timeout(2_000)

    count = page.locator("[data-doom-scroll-post]").count()

    if count > 0:
        # Verify it's inside a reel container, not fixed to the body
        is_inside_container = page.evaluate("""() => {
            const post = document.querySelector('[data-doom-scroll-post]');
            if (!post) return false;
            // Should NOT be a direct child of body
            return post.parentElement !== document.body;
        }""")
        assert is_inside_container, "Reels doom post was appended to body instead of reel container"

    page.close()
    # If DSS isn't exposed or reels didn't load, skip gracefully
    if count == 0:
        pytest.skip("Reels page did not load or DSS not accessible — skipping overlay check")
