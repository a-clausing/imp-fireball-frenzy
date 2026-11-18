// InputController: one-finger pull-back aiming on the arena.
// Drag down to aim up; horizontal drag sets the angle; release to fire.
import { CONFIG } from './config.js';

const D2R = Math.PI / 180;

export function angleFromDrag(dx, dy) {
  // aim vector is opposite to the drag (pull-back)
  let a = Math.atan2(dy, -dx); // dy>0 (dragging down) => aims upward
  if (a < 0) a = a < -Math.PI / 2 ? Math.PI : 0;
  return Math.min(CONFIG.MAX_ANGLE_DEG * D2R, Math.max(CONFIG.MIN_ANGLE_DEG * D2R, a));
}

export class InputController {
  constructor(el, { canAim, onFire, onAimChange }) {
    this.el = el;
    this.canAim = canAim;
    this.onFire = onFire;
    this.onAimChange = onAimChange || (() => {});
    this.aim = null; // { valid, angle }
    this.pid = null;
    el.addEventListener('pointerdown', (e) => this._down(e));
    el.addEventListener('pointermove', (e) => this._move(e));
    el.addEventListener('pointerup', (e) => this._up(e));
    el.addEventListener('pointercancel', (e) => this._cancel(e));
    el.addEventListener('lostpointercapture', (e) => { if (e.pointerId === this.pid) this._cancel(e); });
  }
  _down(e) {
    if (this.pid !== null || !this.canAim()) return;
    if (e.target.closest && e.target.closest('button')) return;
    e.preventDefault();
    this.pid = e.pointerId;
    try { this.el.setPointerCapture(e.pointerId); } catch { /* */ }
    this.sx = e.clientX; this.sy = e.clientY;
    this.aim = { valid: false, angle: Math.PI / 2 };
    this.onAimChange(this.aim);
  }
  _move(e) {
    if (e.pointerId !== this.pid) return;
    e.preventDefault();
    const dx = e.clientX - this.sx, dy = e.clientY - this.sy;
    const valid = Math.hypot(dx, dy) >= CONFIG.AIM_MIN_DRAG && this.canAim();
    this.aim = { valid, angle: valid ? angleFromDrag(dx, dy) : this.aim.angle };
    this.onAimChange(this.aim);
  }
  _up(e) {
    if (e.pointerId !== this.pid) return;
    const aim = this.aim;
    this._move(e);
    this.pid = null;
    const fire = this.aim && this.aim.valid && this.canAim();
    const angle = this.aim ? this.aim.angle : aim.angle;
    this.aim = null;
    this.onAimChange(null);
    if (fire) this.onFire(angle);
  }
  _cancel(e) {
    if (e.pointerId !== this.pid) return;
    this.pid = null; this.aim = null; this.onAimChange(null);
  }
  reset() { this.pid = null; this.aim = null; this.onAimChange(null); }
}
