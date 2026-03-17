'use strict';

// ============================================================
// PANEL  —  floating control panel (shadow DOM)
// CSS lives in styles/panel.css.
// ============================================================
(function () {
  const DSS = window.DSS;

  DSS.makeToggle = function (checked, onChange) {
    const lbl = document.createElement('label');
    lbl.className = 'switch';
    const inp = document.createElement('input');
    inp.type = 'checkbox'; inp.checked = checked;
    const sl = document.createElement('span');
    sl.className = 'slider';
    inp.addEventListener('change', () => onChange(inp.checked));
    lbl.append(inp, sl);
    return lbl;
  };

  DSS.makeDraggable = function (host, handle) {
    handle.addEventListener('mousedown', e => {
      if (e.button !== 0 || e.target.classList?.contains('ph-min')) return;
      const rect = host.getBoundingClientRect();
      const ox = e.clientX - rect.left, oy = e.clientY - rect.top;
      const onMove = e => {
        const vw = document.documentElement.clientWidth;   // excludes scrollbar
        const vh = document.documentElement.clientHeight;
        const x = Math.max(0, Math.min(e.clientX - ox, vw - rect.width));
        const y = Math.max(0, Math.min(e.clientY - oy, vh - rect.height));
        host.style.left   = x + 'px';
        host.style.bottom = (vh - y - rect.height) + 'px';
        host.style.right  = 'auto';
        host.style.top    = 'auto';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
      e.preventDefault();
    });
  };

  DSS.createControlPanel = function () {
    const host = document.createElement('div');
    host.setAttribute('data-doom-panel', 'true');
    const shadow = host.attachShadow({ mode: 'open' });

    DSS.addShadowStyle(shadow, 'panel.css');

    const panel = document.createElement('div');
    panel.className = 'panel';

    // ── Header ──
    const ph = document.createElement('div');
    ph.className = 'ph';
    const phIcon  = document.createElement('span');
    phIcon.className = 'ph-icon'; phIcon.textContent = '🛑';
    const phTitle = document.createElement('span');
    phTitle.className = 'ph-title'; phTitle.textContent = 'Stop Doom Scrolling';
    const phMin = document.createElement('button');
    phMin.className = 'ph-min'; phMin.textContent = '−'; phMin.title = 'Minimize';
    ph.append(phIcon, phTitle, phMin);
    // ── Body ──
    const pb = document.createElement('div');
    pb.className = 'pb';

    // Site chip — label provided by the platform
    const chip = document.createElement('div');
    chip.className = 'site-chip';
    const dot = document.createElement('span');
    dot.className = 'site-dot';
    const chipTxt = document.createElement('span');
    chipTxt.textContent = DSS.platform.getChipLabel();
    chip.append(dot, chipTxt);
    pb.appendChild(chip);

    // Timer
    const timerRow = document.createElement('div');
    timerRow.className = 'timer-row';
    const timerLbl = document.createElement('span');
    timerLbl.className = 'timer-lbl'; timerLbl.textContent = 'Time on site:';
    const timerVal = document.createElement('span');
    timerVal.className = 'timer-val'; timerVal.textContent = '00:00';
    timerRow.append(timerLbl, timerVal);
    pb.appendChild(timerRow);

    // Status badge
    const status = document.createElement('div');
    status.className = 'status'; status.textContent = '✅ Active';
    pb.appendChild(status);

    pb.appendChild(Object.assign(document.createElement('hr'), { className: 'div' }));

    // Restart button
    const restartBtn = document.createElement('button');
    restartBtn.className = 'restart-btn'; restartBtn.textContent = '⟳  Restart Timer';
    restartBtn.addEventListener('click', () => {
      DSS.restartTimer();
      timerVal.textContent = '00:00';
      timerVal.className   = 'timer-val';
      status.textContent   = '✅ Active';
      status.className     = 'status';
    });
    pb.appendChild(restartBtn);

    pb.appendChild(Object.assign(document.createElement('hr'), { className: 'div' }));

    // Nuke Bypass toggle
    const nukeRow = document.createElement('div');
    nukeRow.className = 'bypass-row';
    const nukeLabel = document.createElement('div');
    nukeLabel.className = 'bypass-lbl';
    nukeLabel.innerHTML = 'Nuke Bypass<small>Prevents 7-min takeover</small>';
    const nukeSwitch = DSS.makeToggle(DSS.state.nukeBypass, checked => {
      DSS.state.nukeBypass = checked;
      DSS.saveSession();
      if (checked && DSS.state.nukeMode) {
        DSS.state.nukeMode = false;
        DSS.unNuke();
      }
    });
    nukeRow.append(nukeLabel, nukeSwitch);
    pb.appendChild(nukeRow);

    // Total Bypass toggle
    const totalRow = document.createElement('div');
    totalRow.className = 'bypass-row';
    const totalLabel = document.createElement('div');
    totalLabel.className = 'bypass-lbl';
    totalLabel.innerHTML = 'Total Bypass<small>Disables everything</small>';
    const totalSwitch = DSS.makeToggle(DSS.state.totalBypass, checked => {
      DSS.state.totalBypass = checked;
      DSS.saveSession();
      if (checked) DSS.unNuke();
    });
    totalRow.append(totalLabel, totalSwitch);
    pb.appendChild(totalRow);

    pb.appendChild(Object.assign(document.createElement('hr'), { className: 'div' }));

    // Settings section
    const settingsTitle = document.createElement('div');
    settingsTitle.className = 'settings-title';
    settingsTitle.textContent = '⚙ Settings';
    pb.appendChild(settingsTitle);

    // Nuke timer setting
    const nukeTimeRow = document.createElement('div');
    nukeTimeRow.className = 'settings-row';
    const nukeTimeLbl = document.createElement('span');
    nukeTimeLbl.className = 'settings-lbl';
    nukeTimeLbl.textContent = 'Nuke timer';
    const nukeTimeRight = document.createElement('div');
    nukeTimeRight.className = 'settings-right';
    const nukeTimeInput = document.createElement('input');
    nukeTimeInput.type    = 'number';
    nukeTimeInput.className = 'settings-input';
    nukeTimeInput.min   = '1';
    nukeTimeInput.max   = '120';
    nukeTimeInput.step  = '1';
    nukeTimeInput.value = Math.round(DSS.CONFIG.timeLimit / 60000);
    // Re-read storage directly in case the async state.js read hasn't resolved yet.
    chrome.storage.sync.get(['nukeMinutes'], r => {
      if (r.nukeMinutes && typeof r.nukeMinutes === 'number' && r.nukeMinutes >= 1) {
        nukeTimeInput.value = r.nukeMinutes;
      }
    });
    const nukeTimeUnit = document.createElement('span');
    nukeTimeUnit.className   = 'settings-unit';
    nukeTimeUnit.textContent = 'min';
    nukeTimeInput.addEventListener('change', () => {
      const mins = Math.max(1, Math.min(120, parseInt(nukeTimeInput.value, 10) || 7));
      nukeTimeInput.value      = mins;
      DSS.CONFIG.timeLimit     = mins * 60 * 1000;
      chrome.storage.sync.set({ nukeMinutes: mins });
      DSS.restartTimer();
      timerVal.textContent = '00:00';
      timerVal.className   = 'timer-val';
      status.textContent   = '✅ Active';
      status.className     = 'status';
    });
    nukeTimeRight.append(nukeTimeInput, nukeTimeUnit);
    nukeTimeRow.append(nukeTimeLbl, nukeTimeRight);
    pb.appendChild(nukeTimeRow);

    panel.appendChild(pb);
    panel.appendChild(ph);
    shadow.appendChild(panel);
    document.body.appendChild(host);

    // ── Minimize ──
    phMin.addEventListener('click', () => {
      DSS.state.panelMinimized = !DSS.state.panelMinimized;
      pb.style.display  = DSS.state.panelMinimized ? 'none' : '';
      phMin.textContent = DSS.state.panelMinimized ? '+' : '−';
      phMin.title       = DSS.state.panelMinimized ? 'Expand' : 'Minimize';
    });

    // ── Drag ──
    DSS.makeDraggable(host, ph);

    // ── Live timer (updates every second) ──
    setInterval(() => {
      const secs    = Math.floor((Date.now() - DSS.state.startTime) / 1000);
      const elapsed = secs * 1000;
      timerVal.textContent =
        `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;

      if      (DSS.state.nukeMode)                         timerVal.className = 'timer-val nuked';
      else if (elapsed >= DSS.CONFIG.timeLimit)             timerVal.className = 'timer-val danger';
      else if (elapsed >= DSS.CONFIG.timeLimit * 0.72)     timerVal.className = 'timer-val warn';
      else                                                  timerVal.className = 'timer-val';

      if (DSS.state.totalBypass) {
        status.textContent = '⏸ Paused';      status.className = 'status paused';
      } else if (DSS.state.nukeMode) {
        status.textContent = '💣 Nuke Mode';  status.className = 'status nuked';
      } else if (elapsed >= DSS.CONFIG.timeLimit) {
        status.textContent = DSS.state.nukeBypass ? '🛡️ Nuke bypassed' : '⚠️ Time limit hit';
        status.className   = 'status warn';
      } else if (elapsed >= DSS.CONFIG.timeLimit * 0.72) {
        status.textContent = '⚠️ Almost at limit'; status.className = 'status warn';
      } else {
        status.textContent = '✅ Active';     status.className = 'status';
      }
    }, 1000);
  };
})();
