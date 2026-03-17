"""
Control panel UI tests — timer display, site chip, minimize toggle.
"""
from playwright.sync_api import Page


def test_panel_has_restart_button(ig_page: Page):
    """Restart Timer button is present in the shadow DOM panel."""
    has_button = ig_page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return false;
        const buttons = Array.from(host.shadowRoot.querySelectorAll('button'));
        return buttons.some(b => b.textContent.includes('Restart'));
    }""")
    assert has_button, "Restart Timer button not found in panel shadow DOM"


def test_panel_has_nuke_bypass_toggle(ig_page: Page):
    """Nuke Bypass toggle is present in the control panel."""
    has_toggle = ig_page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return false;
        const labels = Array.from(host.shadowRoot.querySelectorAll('label, .toggle-label'));
        return labels.some(l => l.textContent.toLowerCase().includes('nuke'));
    }""")
    assert has_toggle, "Nuke Bypass toggle not found in panel"


def test_panel_has_total_bypass_toggle(ig_page: Page):
    """Total Bypass toggle is present in the control panel."""
    has_toggle = ig_page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return false;
        const labels = Array.from(host.shadowRoot.querySelectorAll('label, .toggle-label'));
        return labels.some(l => l.textContent.toLowerCase().includes('pause') ||
                                l.textContent.toLowerCase().includes('total'));
    }""")
    assert has_toggle, "Total Bypass toggle not found in panel"


def test_panel_timer_is_running(ig_page: Page):
    """The countdown timer value changes within 2 seconds."""
    t1 = ig_page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return null;
        const el = host.shadowRoot.querySelector('.timer-val');
        return el ? el.textContent.trim() : null;
    }""")
    assert t1 is not None, "Timer value element not found"

    ig_page.wait_for_timeout(2_000)

    t2 = ig_page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return null;
        const el = host.shadowRoot.querySelector('.timer-val');
        return el ? el.textContent.trim() : null;
    }""")
    assert t2 is not None
    assert t1 != t2, f"Timer did not advance: still showing {t1!r}"


def test_panel_minimize_toggle(ig_page: Page):
    """Clicking the minimize button collapses and expands the panel body."""
    collapsed = ig_page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return null;
        const minBtn = host.shadowRoot.querySelector('.ph-min');
        if (!minBtn) return null;
        minBtn.click();
        const body = host.shadowRoot.querySelector('.pb');
        return body ? getComputedStyle(body).display : null;
    }""")
    assert collapsed in ("none", ""), f"Panel body not hidden after minimize, got: {collapsed!r}"

    expanded = ig_page.evaluate("""() => {
        const host = document.querySelector('[data-doom-panel]');
        if (!host || !host.shadowRoot) return null;
        const minBtn = host.shadowRoot.querySelector('.ph-min');
        if (!minBtn) return null;
        minBtn.click();
        const body = host.shadowRoot.querySelector('.pb');
        return body ? getComputedStyle(body).display : null;
    }""")
    assert expanded not in ("none", ""), f"Panel body still hidden after expand, got: {expanded!r}"
