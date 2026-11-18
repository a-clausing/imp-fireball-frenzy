// CollisionSystem: continuous (swept) circle collision against walls,
// circular enemies and the recovery floor. Shared by real fireballs and the
// aiming preview so the preview is always exact.
import { CONFIG } from './config.js';

const EPS = 1e-4;

/** v' = v - 2(v·n)n  (n must be unit length) */
export function reflect(vx, vy, nx, ny) {
  const d = vx * nx + vy * ny;
  return [vx - 2 * d * nx, vy - 2 * d * ny];
}

/** Keep a minimum vertical component so balls never travel almost horizontally forever. */
export function enforceMinVertical(vx, vy, nx = 0, ny = 0) {
  const speed = Math.hypot(vx, vy);
  const minVy = speed * CONFIG.MIN_VY_RATIO;
  if (Math.abs(vy) >= minVy || speed === 0) return [vx, vy];
  const sy = vy === 0 ? 1 : Math.sign(vy); // default: head downward toward recovery
  const nvy = sy * minVy;
  const nvx = Math.sign(vx || 1) * Math.sqrt(Math.max(0, speed * speed - nvy * nvy));
  // never redirect back into the surface we just bounced off
  if (nx * nvx + ny * nvy < 0) return [vx, vy];
  return [nvx, nvy];
}

/**
 * Find the earliest collision along p + v*t for t in [0, tMax].
 * Returns null or { t, kind: 'wall'|'ceiling'|'floor'|'enemy', nx, ny, enemy }.
 * Enemies are skipped when `pierce` is true (piercing handled separately).
 */
export function findFirstHit(px, py, vx, vy, tMax, br, enemies, pierce, W = CONFIG.W, floorY = CONFIG.FLOOR_Y) {
  let best = null;
  let bt = tMax;
  // side walls
  if (vx < 0) {
    const t = (br - px) / vx;
    if (t <= bt) { bt = Math.max(0, t); best = { t: bt, kind: 'wall', nx: 1, ny: 0 }; }
  } else if (vx > 0) {
    const t = (W - br - px) / vx;
    if (t <= bt) { bt = Math.max(0, t); best = { t: bt, kind: 'wall', nx: -1, ny: 0 }; }
  }
  if (vy < 0) {
    const t = (br - py) / vy;
    if (t <= bt) { bt = Math.max(0, t); best = { t: bt, kind: 'ceiling', nx: 0, ny: 1 }; }
  } else if (vy > 0) {
    const t = (floorY - br - py) / vy;
    if (t <= bt) { bt = Math.max(0, t); best = { t: bt, kind: 'floor', nx: 0, ny: -1 }; }
  }
  if (!pierce && enemies) {
    const a = vx * vx + vy * vy;
    const reachY = Math.abs(vy) * tMax + br;
    const reachX = Math.abs(vx) * tMax + br;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      const R = e.r + br;
      const dx = px - e.x, dy = py - e.y;
      if (Math.abs(dy) > R + reachY || Math.abs(dx) > R + reachX) continue; // broad phase
      const b = dx * vx + dy * vy;
      if (b >= 0) continue; // moving away / tangent
      const c = dx * dx + dy * dy - R * R;
      let t;
      if (c <= 0) {
        t = 0; // overlapping and approaching: resolve immediately
      } else {
        const disc = b * b - a * c;
        if (disc < 0) continue;
        t = (-b - Math.sqrt(disc)) / a;
        if (t < 0) continue;
      }
      if (t <= bt) {
        const cx = px + vx * t - e.x, cy = py + vy * t - e.y;
        const len = Math.hypot(cx, cy) || 1;
        bt = t;
        best = { t, kind: 'enemy', nx: cx / len, ny: cy / len, enemy: e };
      }
    }
  }
  return best;
}

/** Does segment (ax,ay)->(bx,by) pass within distance R of (cx,cy)? */
export function segmentHitsCircle(ax, ay, bx, by, cx, cy, R) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - cx, qy = ay + dy * t - cy;
  return qx * qx + qy * qy <= R * R;
}

/**
 * Advance one ball by dt. `world` supplies enemies, pickups and callbacks:
 *   onEnemyHit(ball, enemy, x, y), onWall(ball, kind), onFloor(ball), onPickup(ball, pickup)
 * Returns true if the ball was recovered at the floor.
 */
export function stepBall(ball, dt, world) {
  const br = ball.r;
  let remaining = dt;
  let iters = 0;
  while (remaining > EPS * dt && iters++ < CONFIG.MAX_COLLISION_ITERS) {
    const hit = findFirstHit(ball.x, ball.y, ball.vx, ball.vy, remaining, br, world.enemies, ball.pierce);
    const t = hit ? hit.t : remaining;
    const ax = ball.x, ay = ball.y;
    ball.x += ball.vx * t;
    ball.y += ball.vy * t;
    sweepPassThrough(ball, ax, ay, world);
    remaining -= t;
    if (!hit) break;
    if (hit.kind === 'floor') {
      ball.y = CONFIG.FLOOR_Y - br;
      world.onFloor && world.onFloor(ball);
      return true;
    }
    if (hit.kind === 'enemy') {
      const e = hit.enemy;
      // positional correction: never leave the ball inside an enemy
      const R = e.r + br + 0.01;
      ball.x = e.x + hit.nx * R;
      ball.y = e.y + hit.ny * R;
      [ball.vx, ball.vy] = reflect(ball.vx, ball.vy, hit.nx, hit.ny);
      [ball.vx, ball.vy] = enforceMinVertical(ball.vx, ball.vy, hit.nx, hit.ny);
      world.onEnemyHit && world.onEnemyHit(ball, e, ball.x - hit.nx * br, ball.y - hit.ny * br);
    } else {
      [ball.vx, ball.vy] = reflect(ball.vx, ball.vy, hit.nx, hit.ny);
      if (hit.kind === 'wall') [ball.vx, ball.vy] = enforceMinVertical(ball.vx, ball.vy, hit.nx, hit.ny);
      // clamp inside arena
      ball.x = Math.min(CONFIG.W - br, Math.max(br, ball.x));
      ball.y = Math.max(br, ball.y);
      world.onWall && world.onWall(ball, hit.kind);
    }
  }
  if (ball.pierce) updatePierceOverlaps(ball, world.enemies);
  return false;
}

// Pickups (and piercing damage) are pass-through: test the swept segment.
function sweepPassThrough(ball, ax, ay, world) {
  const bx = ball.x, by = ball.y;
  if (world.pickups && world.onPickup) {
    for (const p of world.pickups) {
      if (p.taken) continue;
      if (segmentHitsCircle(ax, ay, bx, by, p.x, p.y, p.r + ball.r)) world.onPickup(ball, p);
    }
  }
  if (ball.pierce && world.enemies) {
    for (const e of world.enemies) {
      if (e.dead) continue;
      if (ball.overlaps.has(e.id)) continue; // already damaged during this continuous overlap
      if (segmentHitsCircle(ax, ay, bx, by, e.x, e.y, e.r + ball.r)) {
        ball.overlaps.add(e.id);
        world.onEnemyHit && world.onEnemyHit(ball, e, (ax + bx) / 2, (ay + by) / 2);
      }
    }
  }
}

function updatePierceOverlaps(ball, enemies) {
  if (!ball.overlaps.size) return;
  for (const id of ball.overlaps) {
    const e = enemies.find((q) => q.id === id);
    if (!e || e.dead) { ball.overlaps.delete(id); continue; }
    const R = e.r + ball.r;
    if ((ball.x - e.x) ** 2 + (ball.y - e.y) ** 2 > R * R) ball.overlaps.delete(id);
  }
}

/**
 * Predict the path of a shot for the aiming guide. Uses exactly the same
 * findFirstHit / reflect / enforceMinVertical as real fireballs.
 */
export function predictPath(x, y, angle, enemies, pierce, maxBounces = CONFIG.PREVIEW_BOUNCES, maxLen = CONFIG.PREVIEW_LENGTH) {
  const pts = [[x, y]];
  let vx = Math.cos(angle), vy = -Math.sin(angle);
  let len = 0, bounces = 0;
  const br = CONFIG.BALL_R;
  let guard = 0;
  while (len < maxLen && bounces <= maxBounces && guard++ < 50) {
    const hit = findFirstHit(x, y, vx, vy, maxLen - len, br, enemies, pierce);
    const t = hit ? hit.t : maxLen - len;
    x += vx * t; y += vy * t; len += t;
    pts.push([x, y]);
    if (!hit || hit.kind === 'floor') break;
    if (hit.kind === 'enemy') {
      const e = hit.enemy, R = e.r + br + 0.01;
      x = e.x + hit.nx * R; y = e.y + hit.ny * R;
      [vx, vy] = reflect(vx, vy, hit.nx, hit.ny);
      [vx, vy] = enforceMinVertical(vx, vy, hit.nx, hit.ny);
    } else {
      [vx, vy] = reflect(vx, vy, hit.nx, hit.ny);
      if (hit.kind === 'wall') [vx, vy] = enforceMinVertical(vx, vy, hit.nx, hit.ny);
    }
    bounces++;
  }
  return pts;
}
