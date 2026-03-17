"""
Run this directly to log in and save the session:
    python login_now.py YOUR_USERNAME YOUR_PASSWORD
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

EXTENSION_DIR = str(Path(__file__).parent.resolve())
PROFILE_DIR   = str(Path(__file__).parent / "tests" / "auth" / "chrome_profile")
Path(PROFILE_DIR).mkdir(parents=True, exist_ok=True)

if len(sys.argv) < 3:
    print("Usage: python login_now.py USERNAME PASSWORD")
    sys.exit(1)

username = sys.argv[1]
password = sys.argv[2]

print(f"Opening Chrome with extension...")
print(f"Profile: {PROFILE_DIR}")

with sync_playwright() as pw:
    ctx = pw.chromium.launch_persistent_context(
        PROFILE_DIR,
        headless=False,
        args=[
            f"--disable-extensions-except={EXTENSION_DIR}",
            f"--load-extension={EXTENSION_DIR}",
            "--no-sandbox",
        ],
    )
    page = ctx.new_page()

    print("Navigating to Instagram login...")
    page.goto("https://www.instagram.com/accounts/login/", wait_until="domcontentloaded")
    page.wait_for_timeout(3000)

    print("Looking for username field...")
    user = page.get_by_role("textbox", name="Mobile number, username or email")
    user.wait_for(state="visible", timeout=10_000)
    print("Found! Typing username...")
    user.click()
    user.press_sequentially(username, delay=80)
    page.wait_for_timeout(500)

    print("Typing password...")
    passwd = page.get_by_role("textbox", name="Password")
    passwd.click()
    passwd.press_sequentially(password, delay=80)
    page.wait_for_timeout(500)

    print("Clicking Log in...")
    page.wait_for_timeout(600)
    print("Submitting...")
    page.keyboard.press("Enter")

    print("Waiting for feed...")
    page.wait_for_url("https://www.instagram.com/**", timeout=30_000)
    page.wait_for_timeout(3000)

    # Dismiss popups
    for label in ["Not now", "Not Now"]:
        try:
            page.get_by_role("button", name=label).click(timeout=3_000)
        except Exception:
            pass

    print(f"\nLogged in! URL: {page.url}")
    print("Session saved. You can now run: pytest tests/test_instagram_real.py -v")
    ctx.close()
