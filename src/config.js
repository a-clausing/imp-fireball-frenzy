// Central gameplay configuration. Tweak balance and physics here.
// All distances are in logical arena units (the arena is always W x H logical units,
// scaled to fit the screen).

export const CONFIG = {
  // ---- Arena geometry ----
  W: 360,
  H: 640,
  FLOOR_Y: 606,        // fireballs are recovered when they reach this line
  DANGER_Y: 548,       // an enemy touching this line after advancing ends the run
  SPAWN_Y: 46,         // y of the newest row once it has slid into place
  ROW_STEP: 48,        // how far enemies advance each turn
  ROW_JITTER: 7,       // random vertical offset inside a row (natural look)

  // ---- Fireballs ----
  BALL_R: 6,
  BALL_SPEED: 760,     // logical units / second
  BASE_DAMAGE: 1,
  MIN_VY_RATIO: 0.14,  // prevents near-horizontal endless bouncing
  MAX_COLLISION_ITERS: 12,

  // ---- Simulation ----
  DT: 1 / 120,         // fixed timestep (seconds)
  MAX_STEPS_PER_FRAME: 48,

  // ---- Volley ----
  LAUNCH_INTERVAL: 0.085,      // seconds between fireballs (small volleys)
  MIN_LAUNCH_INTERVAL: 0.035,  // floor for very large volleys
  LAUNCH_INTERVAL_SCALE_AT: 30,// volleys bigger than this launch faster
  FAST_FORWARD_AFTER: 3.0,     // seconds of volley before the >> button appears
  FAST_FORWARD_SPEED: 3,
  ADVANCE_TIME: 0.32,          // enemy advance animation (seconds)
  MAX_ACTIVE_TRAILS: 60,       // perf safeguard: only N fireballs draw trails

  // ---- Aiming ----
  MIN_ANGLE_DEG: 10,
  MAX_ANGLE_DEG: 170,
  AIM_MIN_DRAG: 20,            // CSS pixels before an aim counts
  PREVIEW_BOUNCES: 3,
  PREVIEW_LENGTH: 820,

  // ---- Imp ----
  IMP_HALF_W: 20,
  START_X: 180,

  // ---- Pickups ----
  PICKUP_R: 11,
  POWERUP_R: 13,
  POWERUP_START_WAVE: 3,
  POWERUP_CHANCE: 0.14,

  // ---- Combo multipliers: [minKills, multiplier] ----
  COMBO: [[7, 3], [4, 2], [2, 1.5], [1, 1]],
  COMBO_ANNOUNCE: [4, 7, 12, 20, 30],

  // ---- Explosions (Infernal Imp) ----
  EXPLOSION_RADIUS: 78,
  EXPLOSION_DAMAGE_FACTOR: 0.9,   // x wave base health

  // ---- Difficulty ----
  // Base health for wave w = w * (1 + w / HP_SUPERLINEAR)
  HP_SUPERLINEAR: 140,
  HP_VARIANCE: 0.45,             // +/- share of random health spread
  ELITE_CHANCE_MAX: 0.10,        // chance of double health (ramps in waves 8-25)
  MIN_GAP: 26,                   // guaranteed open horizontal gap per row
};

// Enemy archetypes. `r` = collision radius (independent of artwork).
export const ENEMY_TYPES = {
  ember:      { name: 'Ember Imp',    r: 19, hp: 1.0, score: 10, color: '#ff5a2a' },
  wisp:       { name: 'Cinder Wisp',  r: 15, hp: 1.25, score: 20, color: '#3fb6ff' },
  shadow:     { name: 'Shadow Imp',   r: 20, hp: 1.5, score: 25, color: '#9a4dff' },
  brute:      { name: 'Magma Brute',  r: 26, hp: 2.3, score: 50, color: '#c8642a' },
  scorchling: { name: 'Scorchling',   r: 18, hp: 1.2, score: 20, color: '#ffb020', splits: true },
  scorchmini: { name: 'Scorchlet',    r: 12, hp: 0.5, score: 5,  color: '#ffd040' },
  infernal:   { name: 'Infernal Imp', r: 20, hp: 1.5, score: 75, color: '#ff2a55', explodes: true },
};

const ramp = (w, a, b) => Math.max(0, Math.min(1, (w - a) / (b - a)));

// Spawn weights per wave. Smooth ramps, no sudden spikes.
export function typeWeights(w) {
  return {
    ember: 1 - 0.45 * ramp(w, 6, 32),
    wisp: 0.32 * ramp(w, 6, 15),
    shadow: 0.30 * ramp(w, 8, 15) + 0.12 * ramp(w, 15, 32),
    brute: 0.22 * ramp(w, 16, 30),
    scorchling: 0.24 * ramp(w, 17, 28),
    infernal: w >= 31 ? 0.04 + 0.06 * ramp(w, 31, 50) : 0,
  };
}

// How many enemies a new row tries to place.
export function rowCount(w, rand) {
  return 2 + Math.floor(rand * 2) + Math.floor(ramp(w, 4, 40) * 3.2);
}

export function baseHp(w) {
  return w * (1 + w / CONFIG.HP_SUPERLINEAR);
}

export function eliteChance(w) {
  return CONFIG.ELITE_CHANCE_MAX * ramp(w, 8, 25);
}

export function comboMultiplier(kills) {
  for (const [min, m] of CONFIG.COMBO) if (kills >= min) return m;
  return 1;
}

// Sprite manifest: drop PNG/WebP files here to replace the procedural art.
// Paths are relative to index.html. Missing files fall back to vector art.
export const SPRITES = {
  // Uncomment / add entries once the PNG or WebP files exist in assets/sprites/.
  // imp: 'assets/sprites/imp.png',
  // ember: 'assets/sprites/ember.png',
  // wisp: 'assets/sprites/wisp.png',
  // shadow: 'assets/sprites/shadow.png',
  // brute: 'assets/sprites/brute.png',
  // scorchling: 'assets/sprites/scorchling.png',
  // scorchmini: 'assets/sprites/scorchmini.png',
  // infernal: 'assets/sprites/infernal.png',
};
// Sprite art is drawn at (collision radius * SPRITE_SCALE) radius.
export const SPRITE_SCALE = 1.35;
