// Pooled particles, floating text, rings and screen shake. Render-only state.
const MAX_PARTICLES = 420;
const MAX_TEXTS = 40;

export class FX {
  constructor() {
    this.parts = Array.from({ length: MAX_PARTICLES }, () => ({ life: 0 }));
    this.pi = 0;
    this.texts = Array.from({ length: MAX_TEXTS }, () => ({ life: 0 }));
    this.ti = 0;
    this.rings = [];
    this.shakeT = 0;
    this.shakeMag = 0;
    this.flash = 0;
    this.shakeEnabled = true;
  }
  clear() {
    for (const p of this.parts) p.life = 0;
    for (const t of this.texts) t.life = 0;
    this.rings.length = 0;
    this.shakeT = 0; this.flash = 0;
  }
  particle(x, y, vx, vy, life, size, color, grav = 0, glow = false) {
    const p = this.parts[this.pi];
    this.pi = (this.pi + 1) % MAX_PARTICLES;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = p.max = life; p.size = size; p.color = color; p.grav = grav; p.glow = glow;
  }
  burst(x, y, n, color, speed = 120, life = 0.5, size = 3, grav = 200, glow = false) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.75);
      this.particle(x, y, Math.cos(a) * s, Math.sin(a) * s - speed * 0.2, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.7), color, grav, glow);
    }
  }
  text(x, y, str, color = '#fff', size = 14, life = 0.8, vy = -40) {
    const t = this.texts[this.ti];
    this.ti = (this.ti + 1) % MAX_TEXTS;
    Object.assign(t, { x, y, str, color, size, life, max: life, vy });
  }
  ring(x, y, radius, color = '#ffb030', life = 0.35) {
    if (this.rings.length < 24) this.rings.push({ x, y, radius, color, life, max: life });
  }
  shake(mag, dur = 0.25) {
    if (!this.shakeEnabled) return;
    this.shakeMag = Math.max(this.shakeMag * (this.shakeT > 0 ? 1 : 0), mag);
    this.shakeT = Math.max(this.shakeT, dur);
  }
  update(dt) {
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - 1.5 * dt;
    }
    for (const t of this.texts) {
      if (t.life <= 0) continue;
      t.life -= dt; t.y += t.vy * dt; t.vy *= 1 - 2.5 * dt;
    }
    for (const r of this.rings) r.life -= dt;
    if (this.rings.length) this.rings = this.rings.filter((r) => r.life > 0);
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3);
  }
  shakeOffset() {
    if (this.shakeT <= 0) return [0, 0];
    const m = this.shakeMag * Math.min(1, this.shakeT * 4);
    return [(Math.random() * 2 - 1) * m, (Math.random() * 2 - 1) * m];
  }
}
