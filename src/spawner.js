// EnemySpawner: controlled procedural formations. Rows are logical (for
// advancing), but horizontal placement, size and small vertical offsets are
// irregular, with validated spacing and a guaranteed open shooting gap.
import { CONFIG, ENEMY_TYPES, typeWeights, rowCount, baseHp, eliteChance } from './config.js';
import { createEnemy, enemyOverlaps } from './enemy.js';

function overlapsPickups(x, y, r, pickups, pad) {
  for (const p of pickups) {
    if (p.taken) continue;
    const R = p.r + r + pad;
    if ((p.x - x) ** 2 + (p.y - y) ** 2 < R * R) return true;
  }
  return false;
}

export function maxRowGap(row, W = CONFIG.W) {
  const iv = row.map((e) => [e.x - e.r, e.x + e.r]).sort((a, b) => a[0] - b[0]);
  let cursor = 0, best = 0;
  for (const [a, b] of iv) {
    best = Math.max(best, a - cursor);
    cursor = Math.max(cursor, b);
  }
  return Math.max(best, W - cursor);
}

/**
 * Generate one new row at logical y `rowY`.
 * ctx: { rng, wave, enemies, pickups, nextId() }
 * Returns { enemies: [...], pickups: [...] } (not yet added to ctx).
 */
export function generateRow(ctx, rowY) {
  const { rng, wave } = ctx;
  const W = CONFIG.W;
  const want = rowCount(wave, rng.next());
  const weights = typeWeights(wave);
  const row = [];
  const others = ctx.enemies;
  const placeEnemy = (type) => {
    const def = ENEMY_TYPES[type];
    const r = def.r + rng.range(-1.5, 1.5);
    for (let a = 0; a < 28; a++) {
      const x = rng.range(r + 3, W - r - 3);
      const y = rowY + rng.range(-CONFIG.ROW_JITTER, CONFIG.ROW_JITTER);
      // gaps inside a row vary: sometimes tight (bank shots), sometimes wide
      const pad = rng.next() < 0.35 ? 1 : rng.range(4, 18);
      if (enemyOverlaps(x, y, r, row, pad)) continue;
      if (enemyOverlaps(x, y, r, others, 3)) continue;
      if (overlapsPickups(x, y, r, ctx.pickups, 8)) continue;
      let hp = baseHp(wave) * def.hp * (1 + rng.range(-CONFIG.HP_VARIANCE, CONFIG.HP_VARIANCE) / 1);
      if (rng.next() < eliteChance(wave)) hp *= 2;
      return createEnemy(ctx.nextId(), type, x, y, Math.max(1, hp), r);
    }
    return null;
  };
  for (let i = 0; i < want; i++) {
    const e = placeEnemy(rng.pickWeighted(weights));
    if (e) row.push(e);
  }
  // never fully block a row: guarantee an open lane for fireballs
  while (row.length > 1 && maxRowGap(row) < CONFIG.MIN_GAP) {
    row.splice(rng.int(0, row.length - 1), 1);
  }

  const newPickups = [];
  const allEnemies = others.concat(row);
  const placePickup = (kind, r, force) => {
    for (let a = 0; a < 60; a++) {
      const x = rng.range(r + 8, W - r - 8);
      const y = rowY + rng.range(-CONFIG.ROW_JITTER, CONFIG.ROW_JITTER);
      if (enemyOverlaps(x, y, r, allEnemies, 10)) continue;
      if (overlapsPickups(x, y, r, ctx.pickups.concat(newPickups), 10)) continue;
      newPickups.push({ id: ctx.nextId(), kind, x, y, r, taken: false });
      return true;
    }
    if (force && row.length) {
      // make room: replace a row enemy with the pickup
      const idx = rng.int(0, row.length - 1);
      const e = row[idx];
      row.splice(idx, 1);
      allEnemies.splice(allEnemies.indexOf(e), 1);
      const x = Math.min(W - r - 8, Math.max(r + 8, e.x));
      if (!enemyOverlaps(x, rowY, r, allEnemies, 4)) {
        newPickups.push({ id: ctx.nextId(), kind, x, y: rowY, r, taken: false });
        return true;
      }
    }
    return false;
  };
  // one +1 per wave keeps the volley growing with difficulty
  if (!placePickup('ball', CONFIG.PICKUP_R, true)) ctx.missedBall = (ctx.missedBall || 0) + 1;
  if (wave >= CONFIG.POWERUP_START_WAVE && rng.next() < CONFIG.POWERUP_CHANCE) {
    placePickup(rng.next() < 0.5 ? 'pierce' : 'inferno', CONFIG.POWERUP_R, false);
  }
  return { enemies: row, pickups: newPickups };
}
