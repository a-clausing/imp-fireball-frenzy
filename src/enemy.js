// Enemy data + factory. Enemies are plain objects so they serialize cleanly.
import { ENEMY_TYPES } from './config.js';

export function createEnemy(id, type, x, y, hp, rOverride) {
  const def = ENEMY_TYPES[type];
  if (!def) throw new Error('Unknown enemy type ' + type);
  const h = Math.max(1, Math.round(hp));
  return {
    id, type, x, y,
    r: rOverride || def.r,
    hp: h, maxHp: h,
    dead: false,
    lastHit: -10,   // sim time of last hit (render feedback only)
    fromY: y, toY: y, // advance animation
  };
}

export function enemyOverlaps(x, y, r, enemies, pad = 0) {
  for (const e of enemies) {
    if (e.dead) continue;
    const R = e.r + r + pad;
    if ((e.x - x) ** 2 + (e.y - y) ** 2 < R * R) return true;
  }
  return false;
}
