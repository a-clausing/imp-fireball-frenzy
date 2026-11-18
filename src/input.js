// InputController: one-finger aiming on the arena.
//
// Two styles (Settings → "Pull-back aiming"):
//  • Point (default): the shot aims straight at your finger. Touch anywhere
//    above Imp, slide to adjust, lift to fire. Slide below Imp's hand to cancel.
//  • Pull-back: slingshot — drag down to aim up, horizontal drag sets the angle.
//
// Accidental taps never fire: a gesture must move at least AIM_MIN_DRAG pixels
// or be held for AIM_MIN_HOLD seconds.
import { CONFIG } from './config.js';

const D2R = Math.PI / 180;
const clampA = (a) => Math.min(CONFIG.MAX_ANGLE_DEG * D2R, Math.max(CONFIG.MIN_ANGLE_DEG * D2R, a));

/** Pull-back: angle from a screen drag vector (dx, dy). */
export function angleFromDrag(dx, dy) {
  let a = Math.atan2(dy, -dx); // dy>0 (dragging down) => aims upward
  if (a < 0) a = a < -Math.PI / 2 ? Math.PI : 0;
  return clampA(a);
}

/**
 * Point: angle from the launch origin (ox, oy) toward a logical point (x, y).
 * Returns null when the point is too close to / below the launch height (cancel zone).
 */
export function angleFromPoint(ox, oy, x, y) {
  const dy = oy - y;
  if (dy < CONFIG.AIM_CANCEL_MARGIN) return null;
  return clampA(Math.atan2(dy, x - ox));
}

export class InputController {
  /**
   * opts: canAim(), onFire(angle), onAimChange(aim|null),
   *       toLogical(clientX, clientY) -> [x, y], origin() -> [x, y], mode() -> 'point'|'pull'
   */
  constructor(el, opts) {
    this.el = el;
    this.o = opts;
    this.aim = null; // { valid, angle, cancel }
    this.pid = null;
    el.addEventListener('pointerdown', (e) => this._down(e));
    el.addEventListener('pointermove', (e) => this._move(e));
    el.addEventListener('pointerup', (e) => this._up(e));
    el.addEventListener('pointercancel', (e) => this._cancel(e));
    el.addEventListener('lostpointercapture', (e) => { if (e.pointerId === this.pid) this._cancel(e); });
  }

  _down(e) {
    if (this.pid !== null || !this.o.canAim()) return;
    if (e.target.closest && e.target.closest('button')) return;
    e.preventDefault();
    this.pid = e.pointerId;
    try { this.el.setPointerCapture(e.pointerId); } catch { /* */ }
    this.sx = e.clientX; this.sy = e.clientY;
    this.t0 = performance.now();
    this.moved = false;
    this.aim = { valid: false, angle: Math.PI / 2, cancel: false };
    this._update(e);
  }

  _update(e) {
    const dx = e.clientX - this.sx, dy = e.clientY - this.sy;
    if (Math.hypot(dx, dy) >= CONFIG.AIM_MIN_DRAG) this.moved = true;
    const prev = this.aim ? this.aim.angle : Math.PI / 2;
    if (this.o.mode() === 'pull') {
      const valid = this.moved;
      this.aim = { valid, angle: valid ? angleFromDrag(dx, dy) : prev, cancel: false };
    } else {
      const [x, y] = this.o.toLogical(e.clientX, e.clientY);
      const [ox, oy] = this.o.origin();
      const a = angleFromPoint(ox, oy, x, y);
      this.aim = { valid: a !== null, angle: a !== null ? a : prev, cancel: a === null };
    }
    if (!this.o.canAim()) this.aim.valid = false;
    this.o.onAimChange(this.aim);
  }

  _move(e) {
    if (e.pointerId !== this.pid) return;
    e.preventDefault();
    this._update(e);
  }

  _up(e) {
    if (e.pointerId !== this.pid) return;
    this._update(e);
    this.pid = null;
    const held = (performance.now() - this.t0) / 1000 >= CONFIG.AIM_MIN_HOLD;
    const deliberate = this.moved || (this.o.mode() === 'point' && held);
    const fire = this.aim && this.aim.valid && deliberate && this.o.canAim();
    const angle = this.aim.angle;
    this.aim = null;
    this.o.onAimChange(null);
    if (fire) this.o.onFire(angle);
  }

  _cancel(e) {
    if (e.pointerId !== this.pid) return;
    this.pid = null; this.aim = null; this.o.onAimChange(null);
  }

  reset() { this.pid = null; this.aim = null; this.o.onAimChange(null); }
}
