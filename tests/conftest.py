"""
Pytest / Playwright fixtures for the Stop Doom Scrolling extension.

The extension's content.js is injected by Chrome into pages whose URL matches
the manifest's host_permissions.  We intercept those real URLs with page.route()
and serve our mock HTML — the URL in the browser bar stays the same so Chrome
still fires the content script.
"""
from pathlib import Path
import asyncio
import pytest
from playwright.async_api import async_playwright, BrowserContext, Page

# Absolute path to the extension folder (one level up from tests/)
EXTENSION_DIR = str(Path(__file__).parent.parent.resolve())

MOCK_DIR = Path(__file__).parent / "mock_pages"


# ---------------------------------------------------------------------------
# Session-scoped browser context (loaded once for the whole test run)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def event_loop():
    """Single event loop shared across session-scoped async fixtures."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
async def ctx(tmp_path_factory):
    """
    Persistent Chrome context with the extension loaded.
    --headless=new supports extensions (unlike the legacy headless mode).
    """
    user_data = tmp_path_factory.mktemp("chrome_profile")
    async with async_playwright() as pw:
        context = await pw.chromium.launch_persistent_context(
            str(user_data),
            headless=False,          # set to True if --headless=new below is not enough
            args=[
                "--headless=new",
                f"--disable-extensions-except={EXTENSION_DIR}",
                f"--load-extension={EXTENSION_DIR}",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
        )
        yield context
        await context.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _read_mock(filename: str) -> str:
    return (MOCK_DIR / filename).read_text(encoding="utf-8")


async def _open_mocked(
    ctx: BrowserContext,
    url: str,
    html: str,
    *,
    wait_for_panel: bool = True,
) -> Page:
    """
    Open a new page, intercept `url` with `html`, navigate, and
    optionally wait for the extension's control panel to appear.
    """
    page = await ctx.new_page()

    async def _fulfill(route):
        await route.fulfill(content_type="text/html; charset=utf-8", body=html)

    await page.route(url, _fulfill)
    await page.goto(url, wait_until="domcontentloaded")

    if wait_for_panel:
        # The control panel host carries data-doom-panel; wait up to 8 s
        await page.wait_for_selector("[data-doom-panel]", timeout=8_000)

    return page


async def add_posts(page: Page, selector: str, parent_selector: str, count: int, delay_ms: int = 80):
    """
    Append `count` real post elements to the feed via page JS so that the
    extension's MutationObserver / polling loop sees them.
    """
    for i in range(count):
        await page.evaluate(
            """([sel, parentSel, idx]) => {
                const parent = document.querySelector(parentSel);
                if (!parent) return;
                const el = document.createElement(sel.replace(/[\\[\\]]/g, ''));
                el.dataset.dynamic = 'true';
                el.dataset.idx = idx;
                el.textContent = 'Dynamic post ' + idx;
                parent.appendChild(el);
            }""",
            [selector, parent_selector, i],
        )
        if delay_ms:
            await page.wait_for_timeout(delay_ms)


# ---------------------------------------------------------------------------
# Per-test page fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def ig_page(ctx):
    """Instagram home feed (/) with mock HTML."""
    page = await _open_mocked(
        ctx,
        "https://www.instagram.com/",
        _read_mock("instagram.html"),
    )
    yield page
    await page.close()


@pytest.fixture
async def fb_page(ctx):
    """Facebook home feed (/) with mock HTML."""
    page = await _open_mocked(
        ctx,
        "https://www.facebook.com/",
        _read_mock("facebook.html"),
    )
    yield page
    await page.close()


@pytest.fixture
async def yt_home_page(ctx):
    """YouTube home feed (/) with mock HTML."""
    page = await _open_mocked(
        ctx,
        "https://www.youtube.com/",
        _read_mock("youtube_home.html"),
    )
    yield page
    await page.close()


@pytest.fixture
async def yt_watch_page(ctx):
    """YouTube watch page with sidebar suggestions."""
    page = await _open_mocked(
        ctx,
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        _read_mock("youtube_watch.html"),
    )
    yield page
    await page.close()
