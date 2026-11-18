// ScoreManager, PowerUpManager and VolleyManager — small, serializable state holders.
import { CONFIG, comboMultiplier } from './config.js';

export class ScoreManager {
  constructor() { this.score = 0; this.volleyKills = 0; }
  resetVolley() { this.volleyKills = 0; }
  /** Register a kill worth `base` points. Returns { points, mult, kills }. */
  kill(base) {
    this.volleyKills++;
    const mult = comboMultiplier(this.volleyKills);
    const points = Math.round(base * mult);
    this.score += points;
    return { points, mult, kills: this.volleyKills };
  }
}

export class PowerUpManager {
  constructor() {
    this.pending = { pierce: false, inferno: false }; // apply to next volley
    this.active = { pierce: false, inferno: false };  // current volley
  }
  collect(kind) { if (kind in this.pending) this.pending[kind] = true; }
  startVolley() {
    this.active = { ...this.pending };
    this.pending = { pierce: false, inferno: false };
  }
  endVolley() { this.active = { pierce: false, inferno: false }; }
}

export class VolleyManager {
  constructor() { this.reset(); }
  reset() {
    this.running = false;
    this.toLaunch = 0;
    this.launched = 0;
    this.timer = 0;
    this.time = 0;
    this.originX = 0;
    this.angle = Math.PI / 2;
    this.firstReturnX = null;
    this.interval = CONFIG.LAUNCH_INTERVAL;
  }
  start(count, originX, angle) {
    this.reset();
    this.running = true;
    this.toLaunch = count;
    this.originX = originX;
    this.angle = angle;
    const n = CONFIG.LAUNCH_INTERVAL_SCALE_AT;
    this.interval = count <= n ? CONFIG.LAUNCH_INTERVAL
      : Math.max(CONFIG.MIN_LAUNCH_INTERVAL, CONFIG.LAUNCH_INTERVAL * n / count);
    this.timer = 0; // first fireball launches immediately
  }
  /** Advance timers; returns how many fireballs should launch this step. */
  tick(dt) {
    this.time += dt;
    let n = 0;
    this.timer -= dt;
    while (this.launched + n < this.toLaunch && this.timer <= 1e-9) {
      n++;
      this.timer += this.interval;
    }
    this.launched += n;
    return n;
  }
  get allLaunched() { return this.launched >= this.toLaunch; }
  registerReturn(x) {
    if (this.firstReturnX === null) {
      this.firstReturnX = Math.min(CONFIG.W - CONFIG.IMP_HALF_W, Math.max(CONFIG.IMP_HALF_W, x));
      return true;
    }
    return false;
  }
}
