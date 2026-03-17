"""
Run this standalone to debug the Instagram login:
    python tests/debug_login.py
"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

EXTENSION_DIR = str(Path(__file__).parent.parent.resolve())
REAL_PROFILE_DIR = Path(__file__).parent / "auth" / "chrome_profile"
REAL_PROFILE_DIR.mkdir(parents=True, exist_ok=True)

ig_user = os.environ.get("INSTAGRAM_USER", "")
ig_pass = os.environ.get("INSTAGRAM_PASS", "")

with sync_playwright() as pw:
    ctx = pw.chromium.launch_persistent_context(
        str(REAL_PROFILE_DIR),
        headless=False,
        args=[
            f"--disable-extensions-except={EXTENSION_DIR}",
            f"--load-extension={EXTENSION_DIR}",
            "--no-sandbox",
        ],
    )
    page = ctx.new_page()
    page.goto("https://www.instagram.com/accounts/login/", wait_until="networkidle")

    print(f"\nURL: {page.url}")

    # Try every possible username selector
    for sel in [
        "input[aria-label='Mobile number, username or email']",
        "input[name='username']",
        "input[autocomplete='username']",
    ]:
        els = page.locator(sel).all()
        print(f"Selector '{sel}': found {len(els)} element(s)")

    # Use get_by_role (confirmed working by MCP browser)
    user_input = page.get_by_role("textbox", name="Mobile number, username or email")
    pass_input = page.get_by_role("textbox", name="Password")

    print(f"\nget_by_role username visible: {user_input.is_visible()}")
    print(f"get_by_role password visible: {pass_input.is_visible()}")

    if ig_user and ig_pass:
        print(f"\nTyping username: {ig_user}")
        user_input.click()
        user_input.press_sequentially(ig_user, delay=60)
        page.wait_for_timeout(400)

        print("Typing password...")
        pass_input.click()
        pass_input.press_sequentially(ig_pass, delay=60)
        page.wait_for_timeout(400)

        submit = page.get_by_role("button", name="Log in")
        print(f"Submit button enabled: {submit.is_enabled()}")
        submit.click()

        page.wait_for_timeout(5_000)
        print(f"URL after submit: {page.url}")
    else:
        print("\nNo INSTAGRAM_USER/INSTAGRAM_PASS set — log in manually in the browser window.")
        input("Press Enter when logged in...")

    ctx.close()
