// Procedural placeholder artwork (original designs). Every function draws
// centered at (0,0) in the current transform, sized by `r` (the enemy's
// collision radius) so art can be swapped for sprites without touching logic.

const INK = '#1a0710';

function outline(ctx, w) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = w;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function flamePath(ctx, cx, cy, w, h, tips = 3) {
  // teardrop body with flickering tips pointing up
  ctx.beginPath();
  ctx.moveTo(cx - w, cy);
  ctx.bezierCurveTo(cx - w, cy + h * 0.55, cx + w, cy + h * 0.55, cx + w, cy);
  const step = (2 * w) / tips;
  for (let i = 0; i < tips; i++) {
    const x1 = cx + w - step * i;
    const x2 = x1 - step;
    const tipH = h * (i === Math.floor(tips / 2) ? 1 : 0.72);
    const tx = (x1 + x2) / 2 + step * 0.25;
    ctx.quadraticCurveTo(x1 - step * 0.05, cy - h * 0.35, tx, cy - tipH);
    ctx.quadraticCurveTo(x2 + step * 0.35, cy - h * 0.38, x2, cy - h * 0.1);
  }
  ctx.closePath();
}

function eyes(ctx, r, { y = -0.05, sep = 0.36, size = 0.2, color = '#ffe14a', angry = true, pupil = INK } = {}) {
  for (const s of [-1, 1]) {
    const ex = s * r * sep, ey = r * y;
    ctx.beginPath();
    ctx.ellipse(ex, ey, r * size, r * size * 0.82, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    outline(ctx, r * 0.07);
    ctx.beginPath();
    ctx.ellipse(ex + s * -r * 0.03, ey + r * 0.02, r * size * 0.36, r * size * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = pupil;
    ctx.fill();
    if (angry) {
      ctx.beginPath();
      ctx.moveTo(ex + s * r * size * 1.3, ey - r * size * 1.35);
      ctx.lineTo(ex - s * r * size * 1.0, ey - r * size * 0.55);
      ctx.lineWidth = r * 0.11;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  }
}

function grin(ctx, r, { y = 0.38, w = 0.42, teeth = 4, open = 0.18 } = {}) {
  ctx.beginPath();
  ctx.moveTo(-r * w, r * y - r * 0.04);
  ctx.quadraticCurveTo(0, r * (y + open + 0.12), r * w, r * y - r * 0.04);
  ctx.quadraticCurveTo(0, r * (y + 0.06), -r * w, r * y - r * 0.04);
  ctx.fillStyle = '#3a0612';
  ctx.fill();
  // fangs
  ctx.fillStyle = '#fff6dc';
  for (let i = 0; i < teeth; i++) {
    const t = (i + 0.5) / teeth;
    const x = -r * w * 0.8 + t * r * w * 1.6;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.055, r * y + r * 0.0);
    ctx.lineTo(x, r * y + r * 0.13);
    ctx.lineTo(x + r * 0.055, r * y + r * 0.0);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(-r * w, r * y - r * 0.04);
  ctx.quadraticCurveTo(0, r * (y + open + 0.12), r * w, r * y - r * 0.04);
  outline(ctx, r * 0.07);
}

function shadedCircle(ctx, r, base, dark, light, stroke = 0.13) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = base;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.arc(r * 0.35, r * 0.4, r * 1.05, 0, Math.PI * 2);
  ctx.arc(-r * 0.2, -r * 0.25, r * 1.15, 0, Math.PI * 2, true);
  ctx.fillStyle = dark;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-r * 0.4, -r * 0.48, r * 0.32, r * 0.18, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = light;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  outline(ctx, r * stroke);
}

function horn(ctx, r, side, { len = 0.7, curl = 0.35, base = 0.28, color = '#2b1426', y = -0.6, x = 0.45 } = {}) {
  const bx = side * r * x, by = r * y;
  ctx.beginPath();
  ctx.moveTo(bx - side * r * base * 0.5, by + r * 0.12);
  ctx.quadraticCurveTo(bx + side * r * curl, by - r * len * 0.3, bx + side * r * (curl + 0.15), by - r * len);
  ctx.quadraticCurveTo(bx + side * r * (curl * 0.2), by - r * len * 0.25, bx + side * r * base * 0.9, by + r * 0.16);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  outline(ctx, r * 0.09);
}

function ear(ctx, r, side, color) {
  ctx.beginPath();
  ctx.moveTo(side * r * 0.82, -r * 0.2);
  ctx.lineTo(side * r * 1.42, -r * 0.48);
  ctx.lineTo(side * r * 0.9, r * 0.22);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  outline(ctx, r * 0.09);
}

export const ENEMY_ART = {
  ember(ctx, r) {
    ear(ctx, r, -1, '#d8401c'); ear(ctx, r, 1, '#d8401c');
    horn(ctx, r, -1, { color: '#3a1a1a' }); horn(ctx, r, 1, { color: '#3a1a1a' });
    shadedCircle(ctx, r, '#ef5228', '#b8301a', '#ff9a6a');
    eyes(ctx, r);
    grin(ctx, r);
  },
  wisp(ctx, r) {
    const g = ctx.createLinearGradient(0, -r * 1.6, 0, r);
    g.addColorStop(0, '#e6fbff'); g.addColorStop(0.35, '#59c8ff'); g.addColorStop(1, '#1b5fd6');
    flamePath(ctx, 0, r * 0.25, r * 0.95, r * 1.65, 3);
    ctx.fillStyle = g; ctx.fill();
    outline(ctx, r * 0.13);
    flamePath(ctx, 0, r * 0.35, r * 0.5, r * 0.9, 2);
    ctx.fillStyle = 'rgba(230,252,255,0.75)'; ctx.fill();
    eyes(ctx, r, { y: 0.15, sep: 0.33, size: 0.2, color: '#ffffff', angry: false, pupil: '#0b1d4a' });
  },
  shadow(ctx, r) {
    horn(ctx, r, -1, { len: 1.0, curl: 0.55, color: '#2a1a3a', base: 0.36 });
    horn(ctx, r, 1, { len: 1.0, curl: 0.55, color: '#2a1a3a', base: 0.36 });
    ear(ctx, r, -1, '#7a35d0'); ear(ctx, r, 1, '#7a35d0');
    shadedCircle(ctx, r, '#8f45e8', '#5a24a8', '#c69bff');
    eyes(ctx, r, { color: '#ffd23a' });
    grin(ctx, r, { w: 0.36, teeth: 2, open: 0.12 });
  },
  brute(ctx, r) {
    // lumpy rock body
    ctx.beginPath();
    const n = 11;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (1 + (i % 2 ? 0.06 : -0.03) + (i % 3 === 0 ? 0.05 : 0));
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr * 0.95;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#7a4128'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#5a2c1c';
    ctx.beginPath(); ctx.arc(r * 0.4, r * 0.5, r * 1.0, 0, Math.PI * 2); ctx.fill();
    // lava cracks
    ctx.strokeStyle = '#ffae2a'; ctx.lineWidth = r * 0.07;
    ctx.shadowColor = '#ff7a00'; ctx.shadowBlur = r * 0.3;
    for (const [x1, y1, x2, y2, x3, y3] of [[-0.9, -0.2, -0.55, -0.05, -0.65, 0.3], [0.6, -0.75, 0.45, -0.45, 0.75, -0.25], [0.2, 0.75, 0.05, 0.95, -0.25, 0.9]]) {
      ctx.beginPath(); ctx.moveTo(r * x1, r * y1); ctx.lineTo(r * x2, r * y2); ctx.lineTo(r * x3, r * y3); ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (1 + (i % 2 ? 0.06 : -0.03) + (i % 3 === 0 ? 0.05 : 0));
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr * 0.95;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    outline(ctx, r * 0.11);
    // brow ridge
    ctx.beginPath();
    ctx.moveTo(-r * 0.62, -r * 0.32); ctx.quadraticCurveTo(0, -r * 0.05, r * 0.62, -r * 0.32);
    ctx.lineTo(r * 0.6, -r * 0.45); ctx.quadraticCurveTo(0, -r * 0.25, -r * 0.6, -r * 0.45); ctx.closePath();
    ctx.fillStyle = '#4a2416'; ctx.fill(); outline(ctx, r * 0.06);
    eyes(ctx, r, { y: -0.12, sep: 0.3, size: 0.14, color: '#ffdf3a', angry: false });
    grin(ctx, r, { y: 0.35, w: 0.5, teeth: 5, open: 0.22 });
  },
  scorchling(ctx, r, mini = false) {
    const g = ctx.createLinearGradient(0, -r * 1.5, 0, r);
    g.addColorStop(0, mini ? '#fff6a0' : '#ffe56a'); g.addColorStop(0.45, mini ? '#ffc23a' : '#ff9a1a'); g.addColorStop(1, mini ? '#ff7a10' : '#e84a10');
    flamePath(ctx, 0, r * 0.2, r * 1.0, r * 1.6, 5);
    ctx.fillStyle = g; ctx.fill();
    outline(ctx, r * 0.13);
    eyes(ctx, r, { y: 0.1, sep: 0.34, size: 0.19, color: '#fff', angry: true, pupil: '#2a0a00' });
    grin(ctx, r, { y: 0.45, w: 0.32, teeth: 2, open: 0.1 });
  },
  scorchmini(ctx, r) { ENEMY_ART.scorchling(ctx, r, true); },
  infernal(ctx, r) {
    // flame crown
    const g = ctx.createLinearGradient(0, -r * 1.7, 0, 0);
    g.addColorStop(0, '#ffe680'); g.addColorStop(1, '#ff3a1a');
    flamePath(ctx, 0, -r * 0.35, r * 0.95, r * 1.35, 5);
    ctx.fillStyle = g; ctx.fill(); outline(ctx, r * 0.1);
    horn(ctx, r, -1, { len: 0.75, color: '#1a0a0a', curl: 0.45 }); horn(ctx, r, 1, { len: 0.75, color: '#1a0a0a', curl: 0.45 });
    shadedCircle(ctx, r, '#d81e3c', '#8e0f26', '#ff7a8a');
    // glowing core rune
    ctx.save();
    ctx.shadowColor = '#ffcc33'; ctx.shadowBlur = r * 0.5;
    ctx.beginPath(); ctx.arc(0, r * 0.55, r * 0.17, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe36a'; ctx.fill();
    ctx.restore();
    eyes(ctx, r, { y: -0.12, color: '#ffea5a' });
    grin(ctx, r, { y: 0.3, w: 0.32, teeth: 3, open: 0.08 });
  },
};

/** The player's Imp. (x,y) = feet. s = scale (1 ≈ 50 logical units tall). */
export function drawImp(ctx, x, y, s, { pose = 'stand', aim = Math.PI / 2, throwT = 0, t = 0, holdFire = true } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const bob = pose === 'dead' ? 0 : Math.sin(t * 3) * 0.8;
  if (pose === 'dead') {
    ctx.rotate(-Math.PI / 2 * 0.0);
  }
  const lw = 2.4;
  // shadow
  ctx.beginPath(); ctx.ellipse(0, 0, 18, 4, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();

  if (pose === 'dead') {
    // collapsed imp lying flat
    ctx.translate(0, -8);
    ctx.beginPath(); ctx.ellipse(0, 0, 20, 9, 0, 0, Math.PI * 2); ctx.fillStyle = '#c23a22'; ctx.fill(); outline(ctx, lw);
    ctx.save(); ctx.translate(-12, -6); ctx.rotate(-0.3);
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fillStyle = '#e04a2a'; ctx.fill(); outline(ctx, lw);
    for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sx * 4 - 2, -3); ctx.lineTo(sx * 4 + 2, 1); ctx.moveTo(sx * 4 + 2, -3); ctx.lineTo(sx * 4 - 2, 1);
      ctx.lineWidth = 1.8; ctx.strokeStyle = INK; ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(1, 6, 2.5, 3.5, 0, 0, Math.PI * 2); ctx.fillStyle = '#ff6a8a'; ctx.fill(); outline(ctx, 1.2);
    horn(ctx, 11, -1, { color: '#2a1420' }); horn(ctx, 11, 1, { color: '#2a1420' });
    ctx.restore();
    // smoke
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#bbb';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-8 + i * 3, -24 - i * 7 - (t * 8 % 7), 3 + i, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    return;
  }

  ctx.translate(0, bob * 0.3);
  // tail
  ctx.beginPath(); ctx.moveTo(6, -10); ctx.quadraticCurveTo(22, -6 + bob, 20, -22);
  ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = 2.6; ctx.strokeStyle = '#c8321c'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(20, -22); ctx.lineTo(16, -28); ctx.lineTo(25, -27); ctx.closePath();
  ctx.fillStyle = '#c8321c'; ctx.fill(); outline(ctx, 1.6);
  // cape
  ctx.beginPath(); ctx.moveTo(-9, -30); ctx.quadraticCurveTo(-17, -12, -14, 0); ctx.lineTo(14, 0); ctx.quadraticCurveTo(17, -12, 9, -30); ctx.closePath();
  ctx.fillStyle = '#4a1430'; ctx.fill(); outline(ctx, lw);
  // legs
  ctx.fillStyle = '#b8301c';
  for (const sx of [-1, 1]) { ctx.beginPath(); ctx.roundRect(sx * 6 - 3.5, -10, 7, 10, 2); ctx.fill(); outline(ctx, lw * 0.8); }
  // body
  ctx.beginPath(); ctx.ellipse(0, -18, 10, 12, 0, 0, Math.PI * 2); ctx.fillStyle = '#d8401f'; ctx.fill(); outline(ctx, lw);
  // throwing arm
  const lift = Math.min(1, throwT);
  const armA = -aim; // canvas angle
  const ax = 8, ay = -22;
  const reach = 13 + 3 * lift;
  const hx = ax + Math.cos(armA) * reach, hy = ay + Math.sin(armA) * reach;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(hx, hy);
  ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = 4; ctx.strokeStyle = '#d8401f'; ctx.stroke();
  // other arm
  ctx.beginPath(); ctx.moveTo(-8, -22); ctx.lineTo(-14, -12);
  ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 4; ctx.strokeStyle = '#d8401f'; ctx.stroke();
  // head
  ctx.save(); ctx.translate(0, -38);
  const hr = 11;
  ear(ctx, hr, -1, '#c8361c'); ear(ctx, hr, 1, '#c8361c');
  horn(ctx, hr, -1, { len: 1.15, curl: 0.4, color: '#2a1420', base: 0.75, x: 0.4 });
  horn(ctx, hr, 1, { len: 1.15, curl: 0.4, color: '#2a1420', base: 0.75, x: 0.4 });
  shadedCircle(ctx, hr, '#e44c28', '#b0301a', '#ff9a72', 0.2);
  eyes(ctx, hr, { y: -0.05, sep: 0.38, size: 0.24, color: '#ffe14a' });
  grin(ctx, hr, { y: 0.4, w: 0.45, teeth: 3, open: 0.15 });
  ctx.restore();
  // fireball in hand
  if (holdFire) {
    const fr = 4.5 + lift * 1.5;
    const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, fr * 2.4);
    g.addColorStop(0, 'rgba(255,240,180,1)'); g.addColorStop(0.35, 'rgba(255,150,40,0.9)'); g.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, fr * 2.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// Pickup icons drawn at (0,0) with radius r.
export function drawPickupIcon(ctx, kind, r, t = 0) {
  const pulse = 1 + Math.sin(t * 5) * 0.06;
  const colors = {
    ball: ['#9cff5a', '#2ea11a', '#0c4a08'],
    pierce: ['#e0a0ff', '#9a3ff0', '#3a0a6a'],
    inferno: ['#ffd27a', '#ff5a10', '#6a1004'],
  }[kind];
  ctx.save();
  ctx.scale(pulse, pulse);
  ctx.beginPath(); ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2);
  ctx.fillStyle = colors[1] + '40'; ctx.fill();
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, colors[0]); g.addColorStop(0.7, colors[1]); g.addColorStop(1, colors[2]);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  outline(ctx, r * 0.16);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = INK;
  if (kind === 'ball') {
    ctx.font = `900 ${r * 1.05}px "Arial Black", "Avenir Next", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = r * 0.22; ctx.strokeText('+1', 0, r * 0.06); ctx.fillText('+1', 0, r * 0.06);
  } else if (kind === 'pierce') {
    ctx.lineWidth = r * 0.17; ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
    for (const dy of [-0.28, 0.28]) {
      ctx.beginPath(); ctx.moveTo(-r * 0.55, r * dy + r * 0.1 * Math.sign(dy)); ctx.lineTo(r * 0.5, r * dy - r * 0.1 * Math.sign(dy)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.25, r * dy - r * 0.32 * 1); ctx.lineTo(r * 0.55, r * dy - r * 0.1 * Math.sign(dy)); ctx.lineTo(r * 0.28, r * dy + r * 0.12); ctx.stroke();
    }
  } else {
    flamePath(ctx, 0, r * 0.25, r * 0.42, r * 0.85, 3);
    ctx.fillStyle = '#fff3c0'; ctx.fill();
  }
  ctx.restore();
}
