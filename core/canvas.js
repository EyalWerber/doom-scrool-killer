'use strict';

// ============================================================
// CANVAS HELPERS  —  avoid data: URL CSP issues — use real <canvas>
// ============================================================
(function () {
  const DSS = window.DSS;

  DSS.buildPostCanvas = function () {
    const W = 600, H = 600;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0,   '#d32f2f');
    bg.addColorStop(0.5, '#e64a19');
    bg.addColorStop(1,   '#c62828');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle diagonal stripes
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 14;
    for (let i = -H; i < W + H; i += 38) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke();
    }
    ctx.restore();

    // Octagonal stop-sign
    function octagon(ctx, cx, cy, r) {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = ((i * 45) - 22.5) * Math.PI / 180;
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
    }

    const sx = W / 2, sy = 178, sr = 105;
    ctx.save();
    octagon(ctx, sx, sy, sr);
    ctx.fillStyle = '#b71c1c'; ctx.fill();
    ctx.strokeStyle = 'white'; ctx.lineWidth = 9; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 3;
    octagon(ctx, sx, sy, sr * 0.83); ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'white';
    ctx.font = 'bold 56px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 4;
    ctx.fillText('STOP', sx, sy);
    ctx.shadowBlur = 0;

    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 10; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 3;

    ctx.font = 'bold 92px Impact, Arial Black, sans-serif';
    ctx.fillText('DOOM', W / 2, 362);
    ctx.font = 'bold 68px Impact, Arial Black, sans-serif';
    ctx.fillText('SCROLLING', W / 2, 442);

    ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

    ctx.font = 'italic 25px Georgia, serif';
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillText('Your real life is calling.', W / 2, 502);

    ctx.font = '17px Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('@stop_doomscrolling_bitch', W / 2, 548);

    return c;
  };

  DSS.buildAvatarCanvas = function () {
    const c = document.createElement('canvas');
    c.width = 72; c.height = 72;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#c62828';
    ctx.beginPath(); ctx.arc(36, 36, 36, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#e53935';
    ctx.strokeStyle = 'white'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = ((i * 45) - 22.5) * Math.PI / 180;
      const x = 36 + 22 * Math.cos(a), y = 36 + 22 * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.fillStyle = 'white';
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('STOP', 36, 36);

    return c;
  };

  DSS.buildWideCanvas = function () {
    const W = 640, H = 360;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0,   '#d32f2f');
    bg.addColorStop(0.5, '#e64a19');
    bg.addColorStop(1,   '#c62828');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = '#000'; ctx.lineWidth = 10;
    for (let i = -H; i < W + H; i += 30) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke();
    }
    ctx.restore();

    // Stop sign
    const sx = W / 2, sy = H * 0.37, sr = H * 0.19;
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = ((i * 45) - 22.5) * Math.PI / 180;
      const x = sx + sr * Math.cos(a), y = sy + sr * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#b71c1c'; ctx.fill();
    ctx.strokeStyle = 'white'; ctx.lineWidth = 5; ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'white';
    ctx.font = `bold ${Math.round(H * 0.12)}px Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 4;
    ctx.fillText('STOP', sx, sy);
    ctx.shadowBlur = 0;

    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
    ctx.font = `bold ${Math.round(H * 0.21)}px Impact, Arial Black, sans-serif`;
    ctx.fillText('DOOM SCROLLING', W / 2, H * 0.73);
    ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

    ctx.font = `${Math.round(H * 0.065)}px Arial, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.fillText('@stop_doomscrolling_bitch', W / 2, H * 0.89);

    return c;
  };
})();
