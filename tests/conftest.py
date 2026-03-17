"""
Pytest / Playwright fixtures for the Stop Doom Scrolling extension.

The extension's content.js is injected by Chrome into pages whose URL matches
the manifest's host_permissions.  We intercept those real URLs with page.route()
and serve our mock HTML — the URL in the browser bar stays the same so Chrome
still fires the content script.
"""
from pathlib import Path
import os
import pytest
from playwright.sync_api import sync_playwright, BrowserContext, Page

# Absolute path to the extension folder (one level up from tests/)
EXTENSION_DIR = str(Path(__file__).parent.parent.resolve())

MOCK_DIR = Path(__file__).parent / "mock_pages"



# ---------------------------------------------------------------------------
# Session-scoped browser context (loaded once for the whole test run)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def ctx(tmp_path_factory):
    """
    Persistent Chrome context with the extension loaded.
    --headless=new supports extensions (unlike the legacy headless mode).
    """
    user_data = tmp_path_factory.mktemp("chrome_profile")
    with sync_playwright() as pw:
        context = pw.chromium.launch_persistent_context(
            str(user_data),
            headless=False,
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
        context.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _read_mock(filename: str) -> str:
    return (MOCK_DIR / filename).read_text(encoding="utf-8")


def _open_mocked(
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
    page = ctx.new_page()
    page.route(url, lambda route: route.fulfill(content_type="text/html; charset=utf-8", body=html))
    page.goto(url, wait_until="domcontentloaded")

    if wait_for_panel:
        # The control panel host carries data-doom-panel; wait up to 8 s
        page.wait_for_selector("[data-doom-panel]", timeout=8_000)

    return page


def add_posts(page: Page, selector: str, parent_selector: str, count: int, delay_ms: int = 80):
    """
    Append `count` real post elements to the feed via page JS so that the
    extension's MutationObserver / polling loop sees them.
    """
    for i in range(count):
        page.evaluate(
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
            page.wait_for_timeout(delay_ms)


# ---------------------------------------------------------------------------
# Real-Instagram browser context (persistent profile, survives between runs)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def real_ctx(tmp_path_factory):
    """
    Chrome context with the extension loaded in incognito mode.
    Every test run starts fresh — no saved cookies or session state.
    Log in manually in the Chrome window when prompted.
    """
    tmp_profile = tmp_path_factory.mktemp("chrome_real_profile")
    with sync_playwright() as pw:
        context = pw.chromium.launch_persistent_context(
            str(tmp_profile),
            headless=False,
            args=[
                "--incognito",
                f"--disable-extensions-except={EXTENSION_DIR}",
                f"--load-extension={EXTENSION_DIR}",
                "--no-sandbox",
                "--disable-dev-shm-usage",
            ],
        )
        yield context
        context.close()


def _ensure_logged_in(page: Page, timeout_ms: int = 120_000):
    """
    Log in to Instagram if the login form is present.
    - If INSTAGRAM_USER + INSTAGRAM_PASS env vars are set: fills credentials automatically.
    - Otherwise: waits for the user to log in manually in the Chrome window.
    - Returns immediately if already logged in.
    - Aborts all tests if login fails or times out.
    """
    user_inp = page.get_by_role("textbox", name="Mobile number, username or email")
    try:
        user_inp.wait_for(state="visible", timeout=5_000)
    except Exception:
        return  # already logged in

    ig_user = os.environ.get("INSTAGRAM_USER")
    ig_pass = os.environ.get("INSTAGRAM_PASS")

    if ig_user and ig_pass:
        user_inp.click()
        user_inp.press_sequentially(ig_user, delay=80)
        page.wait_for_timeout(400)

        page.get_by_role("textbox", name="Password").click()
        page.get_by_role("textbox", name="Password").press_sequentially(ig_pass, delay=80)
        page.wait_for_timeout(600)

        # Press Enter to submit — avoids needing to click the button
        page.keyboard.press("Enter")

        try:
            user_inp.wait_for(state="detached", timeout=20_000)
        except Exception:
            pytest.exit(
                "\n\n💥 Instagram login FAILED — wrong credentials or CAPTCHA.\n"
                "Fix INSTAGRAM_USER / INSTAGRAM_PASS and rerun.\n",
                returncode=1,
            )
    else:
        print("\n\n*** Log in to Instagram in the Chrome window — tests resume automatically ***\n")
        try:
            user_inp.wait_for(state="detached", timeout=timeout_ms)
        except Exception:
            pytest.exit(
                "\n\n💥 Login timed out. Set INSTAGRAM_USER + INSTAGRAM_PASS env vars or log in manually.\n",
                returncode=1,
            )

    # Dismiss post-login prompts
    for label in ["Not now", "Not Now"]:
        try:
            page.get_by_role("button", name=label).click(timeout=3_000)
        except Exception:
            pass
    page.wait_for_timeout(1_500)

    # Dismiss 'Save your login info?' prompt if it appears
    try:
        page.locator("button:has-text('Not now')").click(timeout=5_000)
    except Exception:
        pass

    # Dismiss notifications prompt if it appears
    try:
        page.locator("button:has-text('Not Now')").click(timeout=3_000)
    except Exception:
        pass

    page.wait_for_timeout(2_000)


@pytest.fixture
def ig_real_page(real_ctx):
    """Navigate to real Instagram home feed with the extension active."""
    page = real_ctx.new_page()
    page.goto("https://www.instagram.com/", wait_until="domcontentloaded")
    page.wait_for_selector("[data-doom-panel]", timeout=15_000)
    yield page
    page.close()


# ---------------------------------------------------------------------------
# Per-test page fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def ig_page(ctx):
    """Instagram home feed (/) with mock HTML."""
    page = _open_mocked(
        ctx,
        "https://www.instagram.com/",
        _read_mock("instagram.html"),
    )
    yield page
    page.close()


@pytest.fixture
def fb_page(ctx):
    """Facebook home feed (/) with mock HTML."""
    page = _open_mocked(
        ctx,
        "https://www.facebook.com/",
        _read_mock("facebook.html"),
    )
    yield page
    page.close()


@pytest.fixture
def yt_home_page(ctx):
    """YouTube home feed (/) with mock HTML."""
    page = _open_mocked(
        ctx,
        "https://www.youtube.com/",
        _read_mock("youtube_home.html"),
    )
    yield page
    page.close()


@pytest.fixture
def yt_watch_page(ctx):
    """YouTube watch page with sidebar suggestions."""
    page = _open_mocked(
        ctx,
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        _read_mock("youtube_watch.html"),
    )
    yield page
    page.close()
