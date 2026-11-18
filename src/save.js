// SaveManager: versioned LocalStorage persistence with validation.
import { CONFIG, ENEMY_TYPES } from './config.js';

export const SAVE_VERSION = 1;
const KEY_RUN = 'impff.run';
const KEY_BEST = 'impff.best';
const KEY_SETTINGS = 'impff.settings';

const num = (v) => typeof v === 'number' && Number.isFinite(v);

export function validateRun(d) {
  try {
    if (!d || d.version !== SAVE_VERSION) return false;
    const r = d.run;
    if (!r || !num(r.rng) || !num(r.wave) || r.wave < 1 || !num(r.score) || r.score < 0) return false;
    if (!num(r.ballCount) || r.ballCount < 1 || !num(r.launchX) || !num(r.idCounter)) return false;
    if (r.launchX < 0 || r.launchX > CONFIG.W) return false;
    if (!r.pending || typeof r.pending !== 'object') return false;
    if (!Array.isArray(r.enemies) || !Array.isArray(r.pickups)) return false;
    for (const e of r.enemies) {
      if (!ENEMY_TYPES[e.type] || ![e.id, e.x, e.y, e.r, e.hp, e.maxHp].every(num)) return false;
      if (e.hp <= 0 || e.r <= 0) return false;
    }
    for (const p of r.pickups) {
      if (!['ball', 'pierce', 'inferno'].includes(p.kind) || ![p.id, p.x, p.y, p.r].every(num)) return false;
    }
    return true;
  } catch { return false; }
}

export class SaveManager {
  constructor(storage) {
    this.s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  }
  _get(k) { try { return this.s ? this.s.getItem(k) : null; } catch { return null; } }
  _set(k, v) { try { this.s && this.s.setItem(k, v); } catch { /* quota / private mode */ } }
  _del(k) { try { this.s && this.s.removeItem(k); } catch { /* ignore */ } }

  saveRun(sim) {
    this._set(KEY_RUN, JSON.stringify({ version: SAVE_VERSION, savedAt: Date.now(), run: sim.serialize() }));
  }
  loadRun() {
    const raw = this._get(KEY_RUN);
    if (!raw) return null;
    try {
      const d = JSON.parse(raw);
      if (validateRun(d)) return d.run;
    } catch { /* corrupt */ }
    this.clearRun();
    return null;
  }
  hasRun() { return !!this.loadRun(); }
  clearRun() { this._del(KEY_RUN); }

  get best() {
    const v = parseInt(this._get(KEY_BEST) || '0', 10);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }
  submitScore(score) {
    if (score > this.best) { this._set(KEY_BEST, String(Math.floor(score))); return true; }
    return false;
  }
  resetBest() { this._del(KEY_BEST); }

  loadSettings() {
    const def = { sound: true, music: true, shake: true, preview: true, pullback: false, hitboxes: false };
    try { return { ...def, ...(JSON.parse(this._get(KEY_SETTINGS) || '{}')) }; } catch { return def; }
  }
  saveSettings(s) { this._set(KEY_SETTINGS, JSON.stringify(s)); }
}
