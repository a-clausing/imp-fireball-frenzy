// Renderer: draws the arena in logical units with DPR-aware scaling.
// Enemy art is cached per (type, radius) into offscreen canvases. If a PNG/WebP
// sprite is listed in SPRITES and loads, it replaces the vector art.
import { CONFIG, ENEMY_TYPES, SPRITES, SPRITE_SCALE } from './config.js';
import { ENEMY_ART, drawImp, drawPickupIcon } from './art.js';
import { predictPath } from './physics.js';

const W = CONFIG.W, H = CONFIG.H;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 1; this.dpr = 1;
    this.spriteCache = new Map();
    this.images = {};
    this.embers = Array.from({ length: 22 }, () => this._newEmber(true));
    this._loadSprites();
  }

  _loadSprites() {
    for (const [key, src] of Object.entries(SPRITES)) {
      const img = new Image();
      img.onload = () => { this.images[key] = img; this.spriteCache.clear(); };
      img.onerror = () => {}; // fall back to vector art silently
      img.src = src;
    }
  }

  resize(cssW, cssH, dpr) {
    this.dpr = Math.min(dpr || 1, 3);
    this.scale = Math.min(cssW / W, cssH / H);
    const w = Math.round(W * this.scale), h = Math.round(H * this.scale);
    this.cssW = w; this.cssH = h;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.px = this.scale * this.dpr; // device pixels per logical unit
    this.spriteCache.clear();
    this.bg = this._buildBackground();
    this.glow = this._buildGlow();
  }

  // ---------- cached layers ----------
  _buildBackground() {
    const c = document.createElement('canvas');
    c.width = this.canvas.width; c.height = this.canvas.height;
    const g = c.getContext('2d');
    g.scale(this.px, this.px);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#24123a'); grad.addColorStop(0.6, '#1a0d2a'); grad.addColorStop(1, '#2a0f1e');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    // stone bricks
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const bh = 24;
    for (let row = 0; row * bh < CONFIG.FLOOR_Y; row++) {
      let x = row % 2 ? -18 : 0;
      while (x < W) {
        const bw = 34 + rnd() * 26;
        const shade = 34 + rnd() * 16;
        g.fillStyle = `rgb(${shade + 6},${shade * 0.55},${shade + 22})`;
        g.beginPath(); g.roundRect(x + 1.2, row * bh + 1.2, bw - 2.4, bh - 2.4, 3); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.03)';
        g.fillRect(x + 2, row * bh + 2, bw - 4, 2);
        x += bw;
      }
    }
    // darken center so creatures and fireballs pop
    const rg = g.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.42, H * 0.62);
    rg.addColorStop(0, 'rgba(10,4,18,0.72)'); rg.addColorStop(1, 'rgba(10,4,18,0.35)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
    // glowing cracks near the walls
    g.save();
    g.shadowColor = '#ff6a10'; g.shadowBlur = 8;
    g.strokeStyle = 'rgba(255,120,30,0.55)'; g.lineWidth = 1.3;
    for (let i = 0; i < 9; i++) {
      let x = i % 2 ? W - 4 - rnd() * 30 : 4 + rnd() * 30;
      let y = 40 + rnd() * (CONFIG.FLOOR_Y - 80);
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 22; y += 6 + rnd() * 14; g.lineTo(x, y); }
      g.stroke();
    }
    g.restore();
    // side frame
    for (const sx of [0, W - 5]) {
      const fg = g.createLinearGradient(sx, 0, sx + 5, 0);
      fg.addColorStop(0, '#3a2350'); fg.addColorStop(1, '#170a22');
      g.fillStyle = fg; g.fillRect(sx, 0, 5, H);
    }
    g.fillStyle = '#170a22'; g.fillRect(0, 0, W, 3);
    // floor ledge
    const fy = CONFIG.FLOOR_Y;
    const lg = g.createLinearGradient(0, fy, 0, H);
    lg.addColorStop(0, '#4a2e5e'); lg.addColorStop(0.15, '#2c1a3a'); lg.addColorStop(1, '#150a1e');
    g.fillStyle = lg; g.fillRect(0, fy, W, H - fy);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    for (let x = 0; x < W; x += 44) g.fillRect(x + (Math.floor(x / 44) % 2) * 22, fy + 2, 2, H - fy);
    g.strokeStyle = '#ff7a2a'; g.globalAlpha = 0.5; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(0, fy + 0.5); g.lineTo(W, fy + 0.5); g.stroke();
    g.globalAlpha = 1;
    // vignette
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    return c;
  }

  _buildGlow() {
    const make = (inner, mid) => {
      const s = Math.ceil(32 * this.px / 2) * 2;
      const c = document.createElement('canvas');
      c.width = c.height = s;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, inner); gr.addColorStop(0.18, inner); gr.addColorStop(0.32, mid);
      gr.addColorStop(1, 'rgba(255,40,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
      return c;
    };
    return {
      normal: make('rgba(255,250,220,1)', 'rgba(255,140,30,0.75)'),
      inferno: make('rgba(255,255,240,1)', 'rgba(255,50,20,0.9)'),
      pierce: make('rgba(255,245,255,1)', 'rgba(190,90,255,0.8)'),
      both: make('rgba(255,255,255,1)', 'rgba(255,60,180,0.85)'),
    };
  }

  enemySprite(type, r) {
    const key = type + ':' + r.toFixed(1);
    let s = this.spriteCache.get(key);
    if (s) return s;
    const R = r * SPRITE_SCALE * 1.25;
    const size = Math.ceil(R * 2 * this.px);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.translate(size / 2, size / 2);
    g.scale(this.px, this.px);
    const img = this.images[type];
    if (img) {
      const d = r * SPRITE_SCALE * 2;
      g.drawImage(img, -d / 2, -d / 2, d, d);
    } else {
      ENEMY_ART[type](g, r);
    }
    s = { canvas: c, R };
    this.spriteCache.set(key, s);
    return s;
  }

  _newEmber(initial) {
    return { x: Math.random() * W, y: initial ? Math.random() * H : H + 5, vy: -(8 + Math.random() * 18), s: 0.6 + Math.random() * 1.4, ph: Math.random() * 6 };
  }

  // ---------- frame ----------
  draw(game, alpha, t) {
    const ctx = this.ctx;
    const sim = game.sim;
    const fx = game.fx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    const [sx, sy] = fx.shakeOffset();
    ctx.setTransform(this.px, 0, 0, this.px, sx * this.px, sy * this.px);

    // ambient embers
    ctx.fillStyle = '#ff8a3a';
    for (const e of this.embers) {
      e.y += e.vy * game.frameDt; e.x += Math.sin(t * 1.5 + e.ph) * 0.15;
      if (e.y < -5) Object.assign(e, this._newEmber(false));
      ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t * 3 + e.ph);
      ctx.fillRect(e.x, e.y, e.s, e.s);
    }
    ctx.globalAlpha = 1;
    if (!sim) return;

    this._drawDanger(ctx, sim, t);

    // pickups
    for (const p of sim.pickups) {
      if (p.taken) continue;
      ctx.save(); ctx.translate(p.x, p.y);
      drawPickupIcon(ctx, p.kind, p.r, t + p.id);
      ctx.restore();
    }

    // enemies
    const over = sim.phase === 'over';
    for (const e of sim.enemies) {
      if (e.dead) continue;
      const s = this.enemySprite(e.type, e.r);
      const since = sim.time - e.lastHit;
      const hit = since < 0.12 ? 1 - since / 0.12 : 0;
      const bob = Math.sin(t * 2.2 + e.id * 1.7) * 0.5;
      const sq = 1 + hit * 0.12;
      ctx.save();
      ctx.translate(e.x, e.y + bob);
      ctx.scale(sq, 2 - sq);
      ctx.drawImage(s.canvas, -s.R, -s.R, s.R * 2, s.R * 2);
      if (hit > 0 || (over && Math.sin(t * 20) > 0)) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = over ? 0.4 : hit * 0.55;
        ctx.drawImage(s.canvas, -s.R, -s.R, s.R * 2, s.R * 2);
      }
      ctx.restore();
    }

    // aim guide (or cancel hint when the finger is below Imp)
    if (game.aim && game.aim.cancel && sim.phase === 'aim') {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '800 13px "Avenir Next", "Arial Black", system-ui, sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = '#1a0710'; ctx.fillStyle = '#ffb0a0';
      ctx.strokeText('RELEASE TO CANCEL', W / 2, CONFIG.DANGER_Y - 18);
      ctx.fillText('RELEASE TO CANCEL', W / 2, CONFIG.DANGER_Y - 18);
    }
    if (game.aim && game.aim.valid && sim.phase === 'aim' && game.settings.preview) this._drawAim(ctx, sim, game.aim.angle, t);

    // imp
    const throwT = Math.max(0, 1 - (t - game.lastThrow) / 0.18);
    const impImg = this.images.imp;
    if (impImg && game.state !== 'dying' && !over) {
      const h = 56, w = h * impImg.width / impImg.height;
      ctx.drawImage(impImg, sim.impX - w / 2, H - 8 - h, w, h);
    } else drawImp(ctx, sim.impX, H - 8, 1, {
      pose: game.state === 'dying' || over ? 'dead' : 'stand',
      aim: game.aim && game.aim.valid ? game.aim.angle : (sim.volley.running ? sim.volley.angle : Math.PI / 2 + 0.5),
      throwT, t, holdFire: sim.phase === 'aim',
    });

    // returning fireballs sliding to the new launch spot
    ctx.globalCompositeOperation = 'lighter';
    for (const r of sim.returning) this._drawBall(ctx, r.x, CONFIG.FLOOR_Y - CONFIG.BALL_R, null, 'normal', false);
    // fireballs
    const many = sim.balls.length > CONFIG.MAX_ACTIVE_TRAILS;
    for (let i = 0; i < sim.balls.length; i++) {
      const b = sim.balls[i];
      const kind = b.pierce && b.inferno ? 'both' : b.pierce ? 'pierce' : b.inferno ? 'inferno' : 'normal';
      const withTrail = !many || i < CONFIG.MAX_ACTIVE_TRAILS;
      const { x, y, path } = this._ballPose(b, alpha, withTrail);
      this._drawBall(ctx, x, y, path, kind, b.inferno);
    }
    ctx.globalCompositeOperation = 'source-over';

    this._drawFx(ctx, fx);
    this._drawHealth(ctx, sim);

    if (fx.flash > 0) {
      ctx.fillStyle = `rgba(255,170,80,${fx.flash * 0.35})`;
      ctx.fillRect(-10, -10, W + 20, H + 20);
    }
  }

  _drawDanger(ctx, sim, t) {
    const y = CONFIG.DANGER_Y;
    let near = 0;
    for (const e of sim.enemies) if (e.y + e.r > y - CONFIG.ROW_STEP * 1.05) near = 1;
    const a = near ? 0.65 + 0.35 * Math.sin(t * 8) : 0.55;
    ctx.save();
    ctx.strokeStyle = `rgba(255,50,40,${a})`;
    ctx.shadowColor = '#ff2a1a'; ctx.shadowBlur = near ? 10 : 5;
    ctx.lineWidth = near ? 2.2 : 1.6;
    ctx.setLineDash([9, 7]);
    ctx.lineDashOffset = -t * 12;
    ctx.beginPath(); ctx.moveTo(6, y); ctx.lineTo(W - 6, y); ctx.stroke();
    ctx.restore();
  }

  /**
   * Interpolated position that follows the TRUE path within the last physics
   * step (prev -> bounce point(s) -> current), so balls visibly touch what they
   * bounce off instead of cutting the corner. Also returns the trail polyline
   * (points behind the ball, newest first) built from real past positions.
   */
  _ballPose(b, alpha, withTrail) {
    const c = b.contacts || [];
    let px = b.prevX, py = b.prevY, pt = 0, x = b.x, y = b.y, seg = c.length;
    for (let i = 0; i < c.length; i += 3) {
      const t = c[i + 2];
      if (alpha <= t) {
        const k = t > pt ? (alpha - pt) / (t - pt) : 1;
        x = px + (c[i] - px) * k; y = py + (c[i + 1] - py) * k; seg = i;
        break;
      }
      px = c[i]; py = c[i + 1]; pt = t;
    }
    if (seg === c.length) {
      const k = pt < 1 ? (alpha - pt) / (1 - pt) : 1;
      x = px + (b.x - px) * k; y = py + (b.y - py) * k;
    }
    if (!withTrail) return { x, y, path: null };
    // points behind the head: this step's bounces already passed, prev pos, older history
    const path = [];
    for (let i = seg - 3; i >= 0; i -= 3) path.push(c[i], c[i + 1]);
    path.push(b.prevX, b.prevY);
    const tr = b.trail || [];
    const skip = c.length / 3 + 1; // entries added during the current step
    for (let i = tr.length - 2 * (skip + 1); i >= 0; i -= 2) path.push(tr[i], tr[i + 1]);
    return { x, y, path };
  }

  _drawBall(ctx, x, y, path, kind, big) {
    const g = this.glow[kind];
    const r = CONFIG.BALL_R * (big ? 1.25 : 1);
    const S = r * 5.2;
    if (path && path.length) {
      // walk back along the real path, placing fading glow puffs
      const spacing = r * 1.3, maxLen = r * 4.2;
      let hx = x, hy = y, dist = 0, next = spacing, i = 0;
      while (i < path.length && next <= maxLen) {
        const ax = path[i], ay = path[i + 1];
        const segLen = Math.hypot(ax - hx, ay - hy);
        if (dist + segLen >= next && segLen > 0) {
          const k = (next - dist) / segLen;
          const tx = hx + (ax - hx) * k, ty = hy + (ay - hy) * k;
          const f = 1 - next / (maxLen + spacing);
          const s = S * (0.45 + 0.4 * f);
          ctx.globalAlpha = 0.5 * f;
          ctx.drawImage(g, tx - s / 2, ty - s / 2, s, s);
          next += spacing;
        } else {
          dist += segLen; hx = ax; hy = ay; i += 2;
        }
      }
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(g, x - S / 2, y - S / 2, S, S);
  }

  _drawAim(ctx, sim, angle, t) {
    const pierce = sim.power.pending.pierce;
    // The guide shows the shot (including wall bounces) only until it first
    // reaches a demon. Where it goes after that is up to the player to judge.
    const pts = predictPath(sim.launchX, CONFIG.FLOOR_Y - CONFIG.BALL_R - 0.5, angle, sim.enemies, pierce,
      CONFIG.PREVIEW_BOUNCES, CONFIG.PREVIEW_LENGTH, true);
    this._dots(ctx, pts, t, pierce ? '#e0b0ff' : '#ffc04a', 1, 11, true);
    const last = pts[pts.length - 1];
    if (pts.hits[pts.hits.length - 1]) { // ended on a demon: small impact spark
      ctx.save(); ctx.globalAlpha = 0.95; ctx.fillStyle = '#fff2c0';
      ctx.beginPath(); ctx.arc(last[0], last[1], 3.4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }

  _dots(ctx, pts, t, color, alphaMul, spacing, markBounces = false, startDist = 0, dotR = 2.3) {
    let carry = (t * 30) % spacing;
    let total = 0;
    ctx.save();
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const len = Math.hypot(bx - ax, by - ay);
      for (let d = carry; d < len; d += spacing) {
        if (total + d < startDist) continue;
        const f = Math.max(0.15, 1 - (total + d) / CONFIG.PREVIEW_LENGTH);
        ctx.globalAlpha = f * alphaMul;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(ax + (bx - ax) * d / len, ay + (by - ay) * d / len, dotR, 0, Math.PI * 2); ctx.fill();
      }
      carry = (carry - len % spacing + spacing) % spacing;
      total += len;
      if (markBounces && i < pts.length - 1) {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#fff2c0';
        ctx.beginPath(); ctx.arc(bx, by, 3.2, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  _drawFx(ctx, fx) {
    for (const r of fx.rings) {
      const k = 1 - r.life / r.max;
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = r.color; ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.radius * (0.3 + 0.7 * k), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = (1 - k) * 0.25;
      ctx.fillStyle = r.color; ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of fx.parts) {
      if (p.life <= 0) continue;
      const k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.5);
      ctx.fillStyle = p.color;
      const s = p.size * (0.4 + 0.6 * k);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const tx of fx.texts) {
      if (tx.life <= 0) continue;
      const k = tx.life / tx.max;
      ctx.globalAlpha = Math.min(1, k * 2.2);
      const pop = 1 + Math.max(0, (k - 0.8)) * 2;
      ctx.font = `900 ${tx.size * pop}px "Avenir Next", "Arial Black", system-ui, sans-serif`;
      ctx.lineWidth = tx.size * 0.22; ctx.strokeStyle = '#1a0710';
      ctx.strokeText(tx.str, tx.x, tx.y);
      ctx.fillStyle = tx.color; ctx.fillText(tx.str, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;
  }

  // Health numbers are drawn last so they stay legible above fireballs.
  _drawHealth(ctx, sim) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const e of sim.enemies) {
      if (e.dead) continue;
      const str = String(e.hp);
      const fs = Math.max(10.5, Math.min(15, e.r * 0.72));
      const by = e.y + e.r * 0.78;
      const w = Math.max(fs * 1.25, str.length * fs * 0.62 + 7);
      ctx.fillStyle = 'rgba(14,6,16,0.92)';
      ctx.beginPath(); ctx.roundRect(e.x - w / 2, by - fs * 0.62, w, fs * 1.24, fs * 0.62); ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
      ctx.font = `800 ${fs}px "Avenir Next", "Arial Black", system-ui, sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.fillText(str, e.x, by + fs * 0.04);
    }
  }
}

/** Render a standalone icon of an enemy (used in How To Play). */
export function enemyIcon(type, cssSize, dpr = 2) {
  const c = document.createElement('canvas');
  c.width = c.height = cssSize * dpr;
  c.style.width = c.style.height = cssSize + 'px';
  const g = c.getContext('2d');
  const r = ENEMY_TYPES[type].r;
  const k = (cssSize * dpr) / (r * 3.4);
  g.translate(c.width / 2, c.height * 0.56);
  g.scale(k, k);
  ENEMY_ART[type](g, r);
  return c;
}
