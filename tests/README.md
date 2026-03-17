# Doom Scroll Stopper — Test Suite

## Setup

```bash
pip install -r tests/requirements-test.txt
playwright install chromium
```

---

## Setting credentials

Real Instagram tests require your credentials as environment variables.
Set them once per terminal session before running the tests.

### Linux / macOS (bash / zsh)

```bash
export INSTAGRAM_USER="your_username"
export INSTAGRAM_PASS="your_password"
```

### Windows — Command Prompt (CMD)

```cmd
set INSTAGRAM_USER=your_username
set INSTAGRAM_PASS=your_password
```

### Windows — PowerShell

```powershell
$env:INSTAGRAM_USER = "your_username"
$env:INSTAGRAM_PASS = "your_password"
```

> **Note:** These are session-only variables. They are gone when you close the terminal.
> Your Chrome session is saved to `tests/auth/chrome_profile/` after the first login,
> so subsequent runs skip the login step automatically.

---

## Running the tests

### Mock page tests (no login needed, fast)

```bash
pytest tests/test_instagram.py -v
pytest tests/test_facebook.py -v
pytest tests/test_youtube.py -v
pytest tests/test_panel.py -v
pytest tests/test_bypass.py -v
```

### Real Instagram tests (requires credentials)

```bash
pytest tests/test_instagram_real.py -v -s
```

The `-s` flag shows live output including login progress.

### Full suite

```bash
pytest tests/ -v
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `INSTAGRAM_USER and INSTAGRAM_PASS are not set` | Set the env vars in your terminal (see above) |
| `Login FAILED — form still present after submit` | Wrong credentials, or Instagram is showing a CAPTCHA — log in manually in the Chrome window |
| `DSS panel did not appear after login` | Delete `tests/auth/chrome_profile/` and rerun to force a fresh login |
| Tests pass but extension doesn't seem to work | Reload the extension at `chrome://extensions` and retry |
