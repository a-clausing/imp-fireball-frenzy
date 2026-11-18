import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, ENEMY_TYPES, comboMultiplier } from '../src/config.js';
import { reflect, stepBall, predictPath, findFirstHit } from '../src/physics.js';
import { Simulation } from '../src/sim.js';
import { createEnemy } from '../src/enemy.js';
import { SaveManager, validateRun, SAVE_VERSION } from '../src/save.js';
import { maxRowGap } from '../src/spawner.js';

const DT = CONFIG.DT;
const D2R = Math.PI / 180;

function ball(x, y, vx, vy, opts = {}) {
  return { x, y, vx, vy, r: CONFIG.BALL_R, damage: 1, pierce: false, overlaps: new Set(), active: true, ...opts };
}
function world(enemies = [], pickups = []) {
  const w = { enemies, pickups, hits: [], walls: [], floor: 0, picks: [] };
  w.onEnemyHit = (b, e) => { w.hits.push(e.id); e.hp -= b.damage; if (e.hp <= 0) e.dead = true; };
  w.onWall = (b, k) => w.walls.push(k);
  w.onFloor = () => w.floor++;
  w.onPickup = (b, p) => { p.taken = true; w.picks.push(p.id); };
  return w;
}
function runUntil(sim, cond, maxSteps = 200000) {
  let n = 0;
  while (!cond() && n++ < maxSteps) sim.step(DT);
  assert.ok(n < maxSteps, 'condition not reached');
}
function emptySim(seed = 1) {
  const s = new Simulation();
  s.newRun(seed);
  s.enemies = []; s.pickups = [];
  return s;
}

test('reflection formula', () => {
  const [vx, vy] = reflect(3, -4, 0, 1);
  assert.deepEqual([vx, vy], [3, 4]);
  const n = Math.SQRT1_2;
  const [a, b] = reflect(1, 0, -n, -n);
  assert.ok(Math.abs(a) < 1e-12 && Math.abs(b + 1) < 1e-12);
});

test('new run starts with exactly one fireball and zero score', () => {
  const s = new Simulation(); s.newRun(42);
  assert.equal(s.ballCount, 1);
  assert.equal(s.score, 0);
  assert.equal(s.wave, 1);
  assert.equal(s.phase, 'aim');
  assert.ok(s.enemies.length >= 1);
});

test('bounces off side walls and ceiling preserving speed', () => {
  const w = world();
  const b = ball(20, 300, -700, -300);
  for (let i = 0; i < 400 && !w.walls.includes('ceiling'); i++) stepBall(b, DT, w);
  assert.ok(w.walls.includes('wall'), 'hit a side wall');
  assert.ok(w.walls.includes('ceiling'), 'hit ceiling');
  assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - Math.hypot(700, 300)) < 1e-6);
  assert.ok(b.x >= b.r && b.x <= CONFIG.W - b.r && b.y >= b.r);
});

test('ball does not bounce off floor; it is recovered', () => {
  const w = world();
  const b = ball(100, 500, 100, 700);
  let rec = false;
  for (let i = 0; i < 200 && !rec; i++) rec = stepBall(b, DT, w);
  assert.ok(rec);
  assert.equal(w.floor, 1);
});

test('circular enemy bounce uses surface normal and never leaves ball inside', () => {
  const e = createEnemy(1, 'brute', 180, 200, 999);
  const w = world([e]);
  // head-on from below: should reflect straight down
  const b = ball(180, 400, 0, -760);
  for (let i = 0; i < 60; i++) {
    stepBall(b, DT, w);
    const d = Math.hypot(b.x - e.x, b.y - e.y);
    assert.ok(d >= e.r + b.r - 1e-6, 'ball inside enemy at step ' + i);
  }
  assert.equal(w.hits.length, 1, 'exactly one damage event per contact');
  assert.ok(b.vy > 0, 'reflected downward');
  // glancing hit: reflect according to normal
  const e2 = createEnemy(2, 'ember', 180, 200, 999);
  const w2 = world([e2]);
  const b2 = ball(180 - 15, 400, 0, -760);
  for (let i = 0; i < 40; i++) stepBall(b2, DT, w2);
  assert.equal(w2.hits.length, 1);
  assert.ok(b2.vx < 0, 'glancing hit deflects sideways');
});

test('no tunneling at very high speed', () => {
  const e = createEnemy(1, 'scorchmini', 180, 200, 999); // smallest enemy
  const w = world([e]);
  const b = ball(180, 590, 0, -60000); // 500 units per step
  for (let i = 0; i < 3; i++) stepBall(b, DT, w);
  assert.equal(w.hits.length, 1);
  assert.ok(b.vy > 0);
});

test('random stress: balls never end a step inside an enemy', () => {
  const s = new Simulation(); s.newRun(7);
  const enemies = [];
  let id = 1;
  for (let i = 0; i < 40; i++) {
    const x = 30 + (i % 8) * 42 + (i % 3) * 3, y = 60 + Math.floor(i / 8) * 60;
    enemies.push(createEnemy(id++, i % 2 ? 'brute' : 'wisp', x, y, 1e9, i % 2 ? 18 : 12));
  }
  const w = world(enemies);
  for (let k = 0; k < 40; k++) {
    const a = (10 + k * 4) * D2R;
    const b = ball(20 + k * 8, 600, Math.cos(a) * 760, -Math.sin(a) * 760);
    for (let i = 0; i < 3000; i++) {
      if (stepBall(b, DT, w)) break;
      for (const e of enemies) {
        assert.ok(Math.hypot(b.x - e.x, b.y - e.y) >= e.r + b.r - 0.05, 'stuck inside enemy');
      }
    }
  }
});

test('piercing fireballs pass through, damage once per overlap', () => {
  const e1 = createEnemy(1, 'brute', 180, 300, 50);
  const e2 = createEnemy(2, 'brute', 180, 150, 50);
  const w = world([e1, e2]);
  const b = ball(180, 590, 0, -760, { pierce: true });
  for (let i = 0; i < 80; i++) stepBall(b, DT, w);
  assert.deepEqual(w.hits, [1, 2]);
  assert.ok(b.vy < 0 || b.y < 100, 'kept travelling upward through enemies');
});

test('pickup collection via swept segment', () => {
  const p = { id: 9, kind: 'ball', x: 180, y: 300, r: 11, taken: false };
  const w = world([], [p]);
  const b = ball(180, 590, 0, -60000);
  stepBall(b, DT, w);
  assert.deepEqual(w.picks, [9]);
});

test('aim preview matches real trajectory', () => {
  const s = new Simulation(); s.newRun(3);
  const angle = 63 * D2R;
  const pts = predictPath(s.launchX, CONFIG.FLOOR_Y - CONFIG.BALL_R - 0.5, angle, s.enemies, false, 2, 2000);
  // simulate with no damage
  const enemies = s.enemies.map((e) => ({ ...e, hp: 1e9 }));
  const w = world(enemies);
  w.onEnemyHit = (b, e) => w.hits.push([b.x, b.y]);
  w.onWall = (b) => w.hits.push([b.x, b.y]);
  const b = ball(s.launchX, CONFIG.FLOOR_Y - CONFIG.BALL_R - 0.5, Math.cos(angle) * 760, -Math.sin(angle) * 760);
  for (let i = 0; i < 2000 && w.hits.length < 2; i++) stepBall(b, DT, w);
  for (let i = 0; i < Math.min(2, w.hits.length); i++) {
    const [px, py] = pts[i + 1];
    assert.ok(Math.hypot(px - w.hits[i][0], py - w.hits[i][1]) < 0.5, `bounce ${i} matches`);
  }
});

test('volley: sequential launches, first return sets launch x, enemies advance once', () => {
  const s = emptySim();
  s.ballCount = 5;
  const e = createEnemy(s.nextId(), 'ember', 100, 100, 1e6);
  s.enemies.push(e);
  s.events.length = 0;
  assert.ok(s.beginVolley(70 * D2R));
  assert.equal(s.beginVolley(70 * D2R), false, 'cannot aim during volley');
  const launchTimes = [];
  let firstX = null, steps = 0;
  while (s.phase === 'volley') {
    s.step(DT); steps++;
    for (const ev of s.events) {
      if (ev.type === 'launch') for (let i = 0; i < ev.n; i++) launchTimes.push(s.time);
      if (ev.type === 'firstReturn') { assert.equal(firstX, null, 'only one first return'); firstX = ev.x; }
    }
    s.events.length = 0;
  }
  assert.equal(launchTimes.length, 5);
  for (let i = 1; i < 5; i++) assert.ok(launchTimes[i] - launchTimes[i - 1] >= CONFIG.LAUNCH_INTERVAL - DT - 1e-9);
  const y0 = e.y;
  runUntil(s, () => s.phase === 'aim');
  assert.equal(s.launchX, firstX);
  assert.ok(Math.abs(e.y - (y0 + CONFIG.ROW_STEP)) < 1e-9, 'advanced exactly one row');
  assert.equal(s.wave, 2);
});

test('collected +1 adds to the NEXT volley', () => {
  const s = emptySim();
  s.pickups.push({ id: s.nextId(), kind: 'ball', x: CONFIG.START_X, y: 300, r: 11, taken: false });
  s.beginVolley(Math.PI / 2);
  assert.equal(s.volley.toLaunch, 1);
  runUntil(s, () => s.phase === 'aim');
  // the new wave's guaranteed +1 might also exist, but only one was collected
  assert.equal(s.ballCount, 2);
  s.beginVolley(Math.PI / 2);
  assert.equal(s.volley.toLaunch, 2);
});

test('power-ups apply to next volley only, and stack', () => {
  const s = emptySim();
  s.pickups.push({ id: s.nextId(), kind: 'pierce', x: CONFIG.START_X, y: 300, r: 13, taken: false });
  s.pickups.push({ id: s.nextId(), kind: 'inferno', x: CONFIG.START_X, y: 200, r: 13, taken: false });
  s.beginVolley(Math.PI / 2);
  assert.equal(s.balls.length === 0 || !s.balls[0].pierce, true);
  runUntil(s, () => s.phase === 'aim');
  assert.deepEqual(s.power.pending, { pierce: true, inferno: true });
  s.enemies = [];
  s.beginVolley(Math.PI / 2);
  s.step(DT);
  assert.ok(s.balls[0].pierce && s.balls[0].damage === 2);
  runUntil(s, () => s.phase === 'aim');
  assert.deepEqual(s.power.active, { pierce: false, inferno: false });
  assert.deepEqual(s.power.pending, { pierce: false, inferno: false });
});

test('explosive enemies chain-react and combos multiply score', () => {
  const s = emptySim();
  s.wave = 40;
  const a = createEnemy(s.nextId(), 'infernal', 100, 200, 1);
  const b = createEnemy(s.nextId(), 'infernal', 160, 200, 1);
  const c = createEnemy(s.nextId(), 'ember', 220, 200, 1);
  const far = createEnemy(s.nextId(), 'ember', 330, 500, 1);
  s.enemies.push(a, b, c, far);
  s.damageEnemy(a, 1, 100, 200);
  s._processKills();
  assert.ok(a.dead && b.dead && c.dead, 'chain reaction');
  assert.ok(!far.dead);
  // 75*1 + 75*1.5 + 10*1.5 = 75 + 113 + 15
  assert.equal(s.score, 75 + Math.round(112.5) + 15);
  assert.equal(comboMultiplier(1), 1);
  assert.equal(comboMultiplier(3), 1.5);
  assert.equal(comboMultiplier(6), 2);
  assert.equal(comboMultiplier(7), 3);
});

test('scorchling splits only where there is room', () => {
  const s = emptySim();
  const sc = createEnemy(s.nextId(), 'scorchling', 180, 200, 1);
  s.enemies.push(sc);
  s.damageEnemy(sc, 5, 180, 200); s._processKills();
  assert.equal(s.enemies.filter((e) => e.type === 'scorchmini').length, 2);
  const s2 = emptySim();
  const sc2 = createEnemy(s2.nextId(), 'scorchling', 180, 200, 1);
  const block = createEnemy(s2.nextId(), 'brute', 180 - 30, 200, 99);
  s2.enemies.push(sc2, block);
  s2.damageEnemy(sc2, 5, 180, 200); s2._processKills();
  assert.equal(s2.enemies.filter((e) => e.type === 'scorchmini').length, 1);
});

test('game over when an enemy reaches the danger line', () => {
  const s = emptySim();
  const e = createEnemy(s.nextId(), 'ember', 40, CONFIG.DANGER_Y - CONFIG.ROW_STEP - 10, 1e6);
  s.enemies.push(e);
  s.beginVolley(80 * D2R);
  runUntil(s, () => s.phase === 'aim' || s.phase === 'over');
  assert.equal(s.phase, 'over');
});

test('formations: never overlap, always leave a lane, over many waves', () => {
  for (const seed of [1, 2, 3, 99, 1234]) {
    const s = new Simulation(); s.newRun(seed);
    for (let w = 0; w < 120; w++) {
      // emulate end of turns without shooting (but keep enemies from ending game)
      s._endVolley();
      runUntil(s, () => s.phase !== 'advance');
      if (s.phase === 'over') { s.enemies = s.enemies.filter((e) => e.y + e.r < CONFIG.DANGER_Y - 60); s.phase = 'aim'; }
      const all = s.enemies;
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
        const d = Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y);
        assert.ok(d >= all[i].r + all[j].r, `overlap at wave ${s.wave}`);
      }
      for (const e of all) assert.ok(e.x - e.r >= 0 && e.x + e.r <= CONFIG.W);
      const newest = all.filter((e) => Math.abs(e.y - CONFIG.SPAWN_Y) <= CONFIG.ROW_JITTER + 0.01);
      if (newest.length) assert.ok(maxRowGap(newest) >= CONFIG.MIN_GAP);
      for (const p of s.pickups) for (const e of all) {
        assert.ok(Math.hypot(p.x - e.x, p.y - e.y) >= p.r + e.r + 4, 'pickup cramped');
      }
    }
  }
});

test('later waves introduce tougher types', () => {
  const s = new Simulation(); s.newRun(5);
  const seen = new Set();
  for (let w = 0; w < 60; w++) {
    s._endVolley(); runUntil(s, () => s.phase !== 'advance');
    s.enemies.forEach((e) => seen.add(e.type));
    s.enemies = []; s.phase = 'aim';
  }
  for (const t of ['ember', 'wisp', 'shadow', 'brute', 'scorchling', 'infernal']) assert.ok(seen.has(t), t);
});

test('save/load round trip, validation, and corrupt data rejection', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const sm = new SaveManager(storage);
  assert.equal(sm.best, 0, 'first-time best is zero');
  const s = new Simulation(); s.newRun(11);
  s.ballCount = 7; s.scoreMgr.score = 1234; s.power.pending.pierce = true;
  sm.saveRun(s);
  const d = sm.loadRun();
  assert.ok(d);
  const s2 = new Simulation(); s2.restore(d);
  assert.deepEqual(s2.serialize(), s.serialize());
  // identical futures (RNG state restored)
  s.beginVolley(1.2); s2.beginVolley(1.2);
  runUntil(s, () => s.phase === 'aim' || s.phase === 'over');
  runUntil(s2, () => s2.phase === 'aim' || s2.phase === 'over');
  assert.deepEqual(s2.serialize(), s.serialize());
  // corrupt
  mem.set('impff.run', '{"version":1,"run":{"wave":"x"}}');
  assert.equal(sm.loadRun(), null);
  assert.equal(validateRun({ version: SAVE_VERSION + 1, run: {} }), false);
  mem.set('impff.run', 'not json');
  assert.equal(sm.loadRun(), null);
  // high score
  assert.ok(sm.submitScore(500));
  assert.ok(!sm.submitScore(100));
  assert.equal(new SaveManager(storage).best, 500);
});

test('fast-forward (more steps per frame) yields identical outcomes', () => {
  const play = (stepsPerFrame) => {
    const s = new Simulation(); s.newRun(77);
    s.ballCount = 30;
    const angles = [40, 75, 120, 150, 60, 95];
    for (const a of angles) {
      if (s.phase !== 'aim') break;
      s.beginVolley(a * D2R);
      let guard = 0;
      while (s.phase !== 'aim' && s.phase !== 'over' && guard++ < 1e6) {
        for (let k = 0; k < stepsPerFrame; k++) { s.step(DT); if (s.phase === 'aim') break; }
      }
    }
    return JSON.stringify([s.serialize(), s.score]);
  };
  assert.equal(play(1), play(3));
  assert.equal(play(1), play(7));
});

test('handles 200-fireball volley and every volley completes', () => {
  const s = new Simulation(); s.newRun(5);
  s.ballCount = 200;
  const t0 = performance.now();
  for (let v = 0; v < 5 && s.phase === 'aim'; v++) {
    s.beginVolley((30 + v * 25) * D2R);
    runUntil(s, () => s.phase === 'aim' || s.phase === 'over', 400000);
  }
  const ms = performance.now() - t0;
  assert.ok(ms < 8000, 'simulation fast enough: ' + ms.toFixed(0) + 'ms');
});

test('restart fully resets run state', () => {
  const s = new Simulation(); s.newRun(1);
  s.ballCount = 40; s.scoreMgr.score = 999; s.wave = 30; s.power.pending.inferno = true;
  s.newRun(2);
  assert.equal(s.ballCount, 1); assert.equal(s.score, 0); assert.equal(s.wave, 1);
  assert.deepEqual(s.power.pending, { pierce: false, inferno: false });
  assert.equal(s.launchX, CONFIG.START_X);
});

test('point aiming: aims at the finger, clamps, cancels below launch point', async () => {
  const { angleFromPoint, angleFromDrag } = await import('../src/input.js');
  const ox = 180, oy = 600;
  assert.ok(Math.abs(angleFromPoint(ox, oy, 180, 300) - Math.PI / 2) < 1e-9, 'straight up');
  assert.ok(Math.abs(angleFromPoint(ox, oy, 480, 300) - Math.PI / 4) < 1e-9, '45 degrees right');
  assert.equal(angleFromPoint(ox, oy, 100, 595), null, 'below launch height cancels');
  const shallow = angleFromPoint(ox, oy, 360, oy - 20);
  assert.ok(Math.abs(shallow - 10 * D2R) < 1e-9, 'clamped to 10 degrees');
  // pull-back still works: dragging down aims up
  assert.ok(Math.abs(angleFromDrag(0, 50) - Math.PI / 2) < 1e-9);
});

test('demon bounces are exact mirror reflections (no hidden steering)', () => {
  // a glancing hit that sends the ball almost horizontal must not be bent
  for (const off of [-22, -18, -12, 12, 18, 22]) {
    const e = createEnemy(1, 'brute', 180, 300, 1e9);
    const w = world([e]);
    const b = ball(180 + off, 560, 0, -760);
    let before = null;
    w.onEnemyHit = (bb) => { before = [bb.vx, bb.vy, bb.x, bb.y]; };
    for (let i = 0; i < 60 && !before; i++) stepBall(b, DT, w);
    const nx = (before[2] - e.x), ny = (before[3] - e.y), L = Math.hypot(nx, ny);
    const [ex, ey] = reflect(0, -760, nx / L, ny / L);
    assert.ok(Math.abs(before[0] - ex) < 1e-6 && Math.abs(before[1] - ey) < 1e-6, 'pure reflection at offset ' + off);
  }
});

test('preview matches real fireballs across many angles and formations', () => {
  let worst = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = new Simulation(); s.newRun(seed);
    for (let k = 0; k < 6; k++) { s._endVolley(); runUntil(s, () => s.phase !== 'advance'); if (s.phase === 'over') break; }
    for (let a = 12; a <= 168; a += 6.1) {
      const ang = a * D2R, y0 = CONFIG.FLOOR_Y - CONFIG.BALL_R - 0.5;
      const pts = predictPath(s.launchX, y0, ang, s.enemies, false, 3, 5000);
      const w = world(s.enemies.map((e) => ({ ...e, hp: 1e9 })));
      const hits = [];
      w.onEnemyHit = (b) => hits.push([b.x, b.y]); w.onWall = (b) => hits.push([b.x, b.y]); w.onFloor = () => {};
      const b = ball(s.launchX, y0, Math.cos(ang) * CONFIG.BALL_SPEED, -Math.sin(ang) * CONFIG.BALL_SPEED);
      for (let i = 0; i < 20000 && hits.length < pts.length - 1; i++) if (stepBall(b, DT, w)) break;
      for (let i = 0; i < Math.min(hits.length, pts.length - 2); i++) {
        worst = Math.max(worst, Math.hypot(pts[i + 1][0] - hits[i][0], pts[i + 1][1] - hits[i][1]));
      }
    }
  }
  assert.ok(worst < 0.5, 'worst preview error ' + worst);
});
