// Game simulation core. Headless and deterministic: no DOM, no timers.
// The browser layer calls step(DT) at a fixed rate and drains `events`
// for effects/audio. Fast-forward simply runs more fixed steps per frame,
// so it can never change collision outcomes or scoring.
import { CONFIG, ENEMY_TYPES, baseHp } from './config.js';
import { RNG } from './rng.js';
import { stepBall } from './physics.js';
import { createEnemy, enemyOverlaps } from './enemy.js';
import { generateRow } from './spawner.js';
import { ScoreManager, PowerUpManager, VolleyManager } from './managers.js';

const D2R = Math.PI / 180;

export function clampAngle(a) {
  return Math.min(CONFIG.MAX_ANGLE_DEG * D2R, Math.max(CONFIG.MIN_ANGLE_DEG * D2R, a));
}

export class Simulation {
  constructor() {
    this.events = [];
    this.killQueue = [];
  }

  // ---------- run lifecycle ----------
  newRun(seed) {
    this._resetCommon(seed);
    const row = generateRow(this, CONFIG.SPAWN_Y);
    this.enemies.push(...row.enemies);
    this.pickups.push(...row.pickups);
    this._compensateMissed();
    this.emit({ type: 'checkpoint' });
  }

  _resetCommon(seed) {
    this.rng = new RNG(seed);
    this.wave = 1;
    this.idCounter = 1;
    this.scoreMgr = new ScoreManager();
    this.power = new PowerUpManager();
    this.volley = new VolleyManager();
    this.ballCount = 1;
    this.launchX = CONFIG.START_X;
    this.impX = this.launchX;
    this.impFromX = this.launchX;
    this.enemies = [];
    this.pickups = [];
    this.balls = [];
    this.returning = [];
    this.time = 0;
    this.phase = 'aim';
    this.advT = 0;
    this.missedBall = 0;
    this.bestCombo = 0;
    this.killQueue.length = 0;
  }

  nextId() { return this.idCounter++; }
  emit(ev) { this.events.push(ev); }
  get score() { return this.scoreMgr.score; }

  // ---------- save / load ----------
  serialize() {
    return {
      rng: this.rng.state,
      wave: this.wave,
      score: this.scoreMgr.score,
      ballCount: this.ballCount,
      launchX: this.launchX,
      idCounter: this.idCounter,
      bestCombo: this.bestCombo,
      pending: { ...this.power.pending },
      enemies: this.enemies.filter((e) => !e.dead).map((e) => ({
        id: e.id, type: e.type, x: e.x, y: e.y, r: e.r, hp: e.hp, maxHp: e.maxHp,
      })),
      pickups: this.pickups.filter((p) => !p.taken).map((p) => ({
        id: p.id, kind: p.kind, x: p.x, y: p.y, r: p.r,
      })),
    };
  }

  restore(d) {
    this._resetCommon(d.rng);
    this.wave = d.wave;
    this.scoreMgr.score = d.score;
    this.ballCount = d.ballCount;
    this.launchX = this.impX = this.impFromX = d.launchX;
    this.idCounter = d.idCounter;
    this.bestCombo = d.bestCombo || 0;
    this.power.pending = { pierce: !!d.pending.pierce, inferno: !!d.pending.inferno };
    this.enemies = d.enemies.map((e) => {
      const en = createEnemy(e.id, e.type, e.x, e.y, e.maxHp, e.r);
      en.hp = e.hp;
      return en;
    });
    this.pickups = d.pickups.map((p) => ({ ...p, taken: false }));
  }

  // ---------- turn flow ----------
  canAim() { return this.phase === 'aim'; }

  beginVolley(angle) {
    if (this.phase !== 'aim') return false;
    angle = clampAngle(angle);
    this.power.startVolley();
    this.scoreMgr.resetVolley();
    this.volley.start(this.ballCount, this.launchX, angle);
    this.phase = 'volley';
    this.emit({ type: 'volleyStart', count: this.ballCount, power: { ...this.power.active } });
    return true;
  }

  step(dt) {
    this.time += dt;
    if (this.phase === 'volley') this._stepVolley(dt);
    else if (this.phase === 'advance') this._stepAdvance(dt);
    this._stepReturning(dt);
  }

  _spawnBall() {
    const v = this.volley;
    const sp = CONFIG.BALL_SPEED;
    const dmg = CONFIG.BASE_DAMAGE * (this.power.active.inferno ? 2 : 1);
    const b = {
      id: this.nextId(),
      x: v.originX, y: CONFIG.FLOOR_Y - CONFIG.BALL_R - 0.5,
      vx: Math.cos(v.angle) * sp, vy: -Math.sin(v.angle) * sp,
      r: CONFIG.BALL_R, damage: dmg,
      pierce: this.power.active.pierce, inferno: this.power.active.inferno,
      overlaps: new Set(), active: true,
    };
    b.prevX = b.x; b.prevY = b.y;
    this.balls.push(b);
  }

  _stepVolley(dt) {
    const n = this.volley.tick(dt);
    for (let i = 0; i < n; i++) this._spawnBall();
    if (n) this.emit({ type: 'launch', x: this.volley.originX, angle: this.volley.angle, n });

    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      b.prevX = b.x; b.prevY = b.y;
      if (stepBall(b, dt, this)) b.active = false;
      if (this.killQueue.length) this._processKills();
    }
    if (this.balls.some((b) => !b.active)) {
      const keep = [];
      for (const b of this.balls) {
        if (b.active) { keep.push(b); continue; }
        const first = this.volley.registerReturn(b.x);
        this.returning.push({ x: b.x, y: b.y });
        if (first) {
          this.impFromX = this.impX;
          this.emit({ type: 'firstReturn', x: this.volley.firstReturnX });
        }
      }
      this.balls = keep;
    }
    if (this.enemies.some((e) => e.dead)) this.enemies = this.enemies.filter((e) => !e.dead);
    if (this.pickups.some((p) => p.taken)) this.pickups = this.pickups.filter((p) => !p.taken);

    if (this.volley.allLaunched && this.balls.length === 0) this._endVolley();
  }

  _stepReturning(dt) {
    if (!this.returning.length) return;
    const tx = this.volley.firstReturnX ?? this.launchX;
    const sp = 900 * dt;
    for (const r of this.returning) {
      const d = tx - r.x;
      r.x += Math.abs(d) <= sp ? d : Math.sign(d) * sp;
      r.done = Math.abs(tx - r.x) < 0.5;
    }
    this.returning = this.returning.filter((r) => !r.done);
  }

  _endVolley() {
    this.power.endVolley();
    this.volley.running = false;
    if (this.volley.firstReturnX !== null) this.launchX = this.volley.firstReturnX;
    this.bestCombo = Math.max(this.bestCombo, this.scoreMgr.volleyKills);
    this.emit({ type: 'volleyEnd', kills: this.scoreMgr.volleyKills });

    this.wave++;
    const row = generateRow(this, CONFIG.SPAWN_Y - CONFIG.ROW_STEP);
    this.enemies.push(...row.enemies);
    this.pickups.push(...row.pickups);
    for (const o of this.enemies) { o.fromY = o.y; o.toY = o.y + CONFIG.ROW_STEP; }
    for (const o of this.pickups) { o.fromY = o.y; o.toY = o.y + CONFIG.ROW_STEP; }
    this.impFromX = this.impX;
    this.advT = 0;
    this.phase = 'advance';
  }

  _stepAdvance(dt) {
    this.advT = Math.min(CONFIG.ADVANCE_TIME, this.advT + dt);
    const k = this.advT / CONFIG.ADVANCE_TIME;
    const ease = 1 - (1 - k) * (1 - k) * (1 - k);
    for (const o of this.enemies) o.y = o.fromY + (o.toY - o.fromY) * ease;
    for (const o of this.pickups) o.y = o.fromY + (o.toY - o.fromY) * ease;
    this.impX = this.impFromX + (this.launchX - this.impFromX) * ease;
    if (k >= 1) this._finishAdvance();
  }

  _finishAdvance() {
    for (const o of this.enemies) o.y = o.toY;
    for (const o of this.pickups) o.y = o.toY;
    this.impX = this.launchX;
    // pickups that drift past the danger line are lost
    this.pickups = this.pickups.filter((p) => p.y + p.r < CONFIG.DANGER_Y);
    this._compensateMissed();
    if (this.enemies.some((e) => e.y + e.r >= CONFIG.DANGER_Y)) {
      this.phase = 'over';
      this.emit({ type: 'gameOver', score: this.score, wave: this.wave });
      return;
    }
    this.phase = 'aim';
    this.emit({ type: 'checkpoint' });
  }

  _compensateMissed() {
    if (this.missedBall) { this.ballCount += this.missedBall; this.missedBall = 0; }
  }

  // ---------- collision callbacks (world interface for physics) ----------
  onEnemyHit(ball, e, x, y) {
    this.damageEnemy(e, ball.damage, x, y, ball.inferno);
  }
  onWall(ball, kind) { this.emit({ type: 'wall', x: ball.x, y: ball.y, kind }); }
  onFloor() {}
  onPickup(ball, p) {
    if (p.taken) return;
    p.taken = true;
    if (p.kind === 'ball') {
      this.ballCount++;
      this.emit({ type: 'pickup', x: p.x, y: p.y });
    } else {
      this.power.collect(p.kind);
      this.emit({ type: 'powerup', kind: p.kind, x: p.x, y: p.y });
    }
  }

  damageEnemy(e, dmg, x, y, inferno = false) {
    if (e.dead) return;
    e.hp -= dmg;
    e.lastHit = this.time;
    this.emit({ type: 'hit', x, y, id: e.id, etype: e.type, dmg, inferno });
    if (e.hp <= 0) {
      e.hp = 0;
      e.dead = true;
      this.killQueue.push(e);
    }
  }

  _processKills() {
    let guard = 0;
    while (this.killQueue.length && guard++ < 1000) {
      const e = this.killQueue.shift();
      const def = ENEMY_TYPES[e.type];
      const res = this.scoreMgr.kill(def.score);
      this.emit({ type: 'kill', x: e.x, y: e.y, r: e.r, etype: e.type, ...res });
      if (CONFIG.COMBO_ANNOUNCE.includes(res.kills)) this.emit({ type: 'combo', kills: res.kills, mult: res.mult });
      if (def.explodes) this._explode(e);
      if (def.splits) this._split(e);
    }
  }

  explosionDamage() {
    return Math.max(2, Math.ceil(baseHp(this.wave) * CONFIG.EXPLOSION_DAMAGE_FACTOR));
  }

  _explode(e) {
    const R = CONFIG.EXPLOSION_RADIUS;
    this.emit({ type: 'explode', x: e.x, y: e.y, radius: R });
    const dmg = this.explosionDamage();
    for (const o of this.enemies) {
      if (o.dead || o === e) continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d <= R + o.r) this.damageEnemy(o, dmg, o.x, o.y);
    }
  }

  _split(e) {
    const r = ENEMY_TYPES.scorchmini.r;
    const hp = Math.max(1, Math.ceil(e.maxHp * 0.4));
    for (const s of [-1, 1]) {
      const x = e.x + s * (r + 1.5);
      const y = e.y;
      if (x - r < 0 || x + r > CONFIG.W) continue;
      if (enemyOverlaps(x, y, r, this.enemies, 1)) continue;
      let blocked = false;
      for (const b of this.balls) {
        const R = r + b.r + 1;
        if ((b.x - x) ** 2 + (b.y - y) ** 2 < R * R) { blocked = true; break; }
      }
      if (blocked) continue;
      const m = createEnemy(this.nextId(), 'scorchmini', x, y, hp, r);
      this.enemies.push(m);
      this.emit({ type: 'split', x, y });
    }
  }
}
