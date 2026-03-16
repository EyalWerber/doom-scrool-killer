"""
YouTube-specific tests (home feed + watch sidebar).
The polling counter runs every 2 s, so timeouts are a bit longer.
"""
import pytest
from playwright.async_api import Page, expect

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Home feed
# ---------------------------------------------------------------------------

async def test_panel_appears_on_yt_home(yt_home_page: Page):
    """Extension injects the control panel on YouTube home."""
    await expect(yt_home_page.locator("[data-doom-panel]")).to_have_count(1)


async def test_yt_home_doom_post_after_new_videos(yt_home_page: Page):
    """
    Adding ≥12 ytd-rich-item-renderer elements triggers the 2-s poll and
    eventually fires a doom post.
    """
    await yt_home_page.evaluate(
        "document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove())"
    )

    for i in range(12):
        await yt_home_page.evaluate("""(i) => {
            const contents = document.querySelector('ytd-rich-grid-renderer #contents');
            if (!contents) return;
            const item = document.createElement('ytd-rich-item-renderer');
            item.dataset.dynamic = 'true';
            item.dataset.idx = i;
            item.textContent = 'Video ' + (i + 4);
            contents.appendChild(item);
        }""", i)
        await yt_home_page.wait_for_timeout(100)

    # Poll runs every 2 s; give up to 10 s for at least one doom post
    await yt_home_page.wait_for_selector("[data-doom-scroll-post]", timeout=10_000)
    count = await yt_home_page.locator("[data-doom-scroll-post]").count()
    assert count >= 1


async def test_yt_home_panel_shows_youtube_site(yt_home_page: Page):
    """Control panel chip shows 'youtube'."""
    chip_text = await yt_home_page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return null;
        const chip = host.shadowRoot.querySelector('.site-chip');
        return chip ? chip.textContent.trim() : null;
    }""")
    assert chip_text is not None
    assert "youtube" in chip_text.lower()


# ---------------------------------------------------------------------------
# Watch page (sidebar suggestions)
# ---------------------------------------------------------------------------

async def test_panel_appears_on_yt_watch(yt_watch_page: Page):
    """Extension injects the control panel on YouTube watch page."""
    await expect(yt_watch_page.locator("[data-doom-panel]")).to_have_count(1)


async def test_yt_watch_doom_post_in_sidebar(yt_watch_page: Page):
    """Adding suggestion cards in the sidebar triggers the post counter."""
    await yt_watch_page.evaluate(
        "document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove())"
    )

    for i in range(12):
        await yt_watch_page.evaluate("""(i) => {
            const items = document.querySelector('#related #items');
            if (!items) return;
            const card = document.createElement('ytd-compact-video-renderer');
            card.dataset.dynamic = 'true';
            card.textContent = 'Suggestion ' + (i + 4);
            items.appendChild(card);
        }""", i)
        await yt_watch_page.wait_for_timeout(100)

    await yt_watch_page.wait_for_selector("[data-doom-scroll-post]", timeout=10_000)
    count = await yt_watch_page.locator("[data-doom-scroll-post]").count()
    assert count >= 1


# ---------------------------------------------------------------------------
# SPA navigation simulation
# ---------------------------------------------------------------------------

async def test_yt_sPA_navigation_resets_post_counter(yt_home_page: Page):
    """
    After a simulated yt-navigate-finish event, adding fewer posts than the
    previous trigger threshold still fires the extension (counter was reset).
    """
    # First: build up a large post count so nextTriggerAt is high
    for i in range(20):
        await yt_home_page.evaluate("""(i) => {
            const contents = document.querySelector('ytd-rich-grid-renderer #contents');
            if (!contents) return;
            const item = document.createElement('ytd-rich-item-renderer');
            item.dataset.phase = 'pre-nav';
            item.dataset.idx = i;
            item.textContent = 'Pre-nav video ' + i;
            contents.appendChild(item);
        }""", i)

    # Allow poll to process
    await yt_home_page.wait_for_timeout(3_000)

    # Simulate YouTube SPA navigation (clears counter state in the extension)
    await yt_home_page.evaluate("""() => {
        window.dispatchEvent(new CustomEvent('yt-navigate-finish'));
    }""")
    await yt_home_page.wait_for_timeout(500)

    # Remove existing doom posts
    await yt_home_page.evaluate(
        "document.querySelectorAll('[data-doom-scroll-post]').forEach(el => el.remove())"
    )

    # Now add only 7 posts — enough to cross the freshly-reset trigger (5–10)
    for i in range(7):
        await yt_home_page.evaluate("""(i) => {
            const contents = document.querySelector('ytd-rich-grid-renderer #contents');
            if (!contents) return;
            const item = document.createElement('ytd-rich-item-renderer');
            item.dataset.phase = 'post-nav';
            item.dataset.idx = i;
            item.textContent = 'Post-nav video ' + i;
            contents.appendChild(item);
        }""", i)
        await yt_home_page.wait_for_timeout(100)

    await yt_home_page.wait_for_selector("[data-doom-scroll-post]", timeout=10_000)
