# Imp: Fireball Frenzy

A mobile-first, endless ricochet arcade game. Aim a volley of fireballs, bounce them off walls and demons, collect +1 orbs to grow your volley, and survive as long as you can. No levels, no bosses — just waves and a high score.

Pure HTML5 Canvas + vanilla JavaScript (ES modules). No runtime dependencies, no build step required to play or deploy.

## Run locally

ES modules need to be served over HTTP (not `file://`):

```bash
cd imp-fireball-frenzy
python3 -m http.server 8000      # or: npx serve .
# open http://localhost:8000 (use your LAN IP to test on a phone)
```

Single-file build (works even from `file://`, handy for sharing):

```bash
npm install        # only needed for the build tool (esbuild) and nothing else
npm run build      # -> dist/imp-fireball-frenzy.html
```

Run the automated tests (Node 18+):

```bash
npm test
```

Tests cover reflection math, wall/ceiling/enemy bounces, anti-tunneling at extreme speed, "never trapped inside an enemy" stress runs, piercing, pickups, volley sequencing, first-return launch position, single advance per turn, power-up timing and stacking, explosions/chain reactions, scorchling splitting, combo scoring, game over, formation validity over 120 waves × 5 seeds, save/load round-trip and corrupt-save rejection, fast-forward determinism, 200-fireball volleys, and restart reset.

## Deploy to GitHub Pages

This repo deploys automatically with GitHub Actions (`.github/workflows/pages.yml`):

1. In **Settings → Pages**, set Source to **GitHub Actions** (one-time).
2. Every push to `main` runs the test suite, then publishes `index.html`, `styles.css`, `src/` and `assets/`.
3. Live at `https://<user>.github.io/<repo>/`. If the tests fail, the deploy is skipped and the previous version stays up.

`dist/`, `node_modules/`, `tests/` and `build.mjs` aren't needed at runtime, so you can leave them out of the deployed repo. `index.html`, `styles.css`, `src/` and `assets/` are what matter.

## Project layout

```
index.html          screens & HUD markup
styles.css          responsive, safe-area aware styling
src/config.js       ALL tunable gameplay constants, enemy stats, difficulty curves, sprite manifest
src/sim.js          Game simulation (headless, deterministic; turn flow, kills, explosions, splits)
src/physics.js      CollisionSystem: swept circle collisions, reflection, aim preview
src/managers.js     VolleyManager, ScoreManager, PowerUpManager
src/spawner.js      EnemySpawner: procedural natural formations
src/enemy.js        Enemy factory
src/save.js         SaveManager: versioned, validated LocalStorage
src/renderer.js     Renderer (DPR-aware canvas, sprite cache)
src/art.js          Placeholder vector art (enemies, Imp, pickups)
src/fx.js           Pooled particles, floating text, shake
src/audio.js        AudioManager: synthesized SFX + music
src/input.js        InputController: pull-back aiming
src/main.js         Game loop + UIManager (menus, HUD, pause, game over)
tests/              Node test suite
```

## Character art: where assets go and how to replace sprites

Put your images in `assets/sprites/`. Then open `src/config.js` and uncomment (or add) the matching line in `SPRITES`:

```js
export const SPRITES = {
  imp: 'assets/sprites/imp.png',
  ember: 'assets/sprites/ember.png',
  // wisp, shadow, brute, scorchling, scorchmini, infernal ...
};
```

- Keys are enemy type ids: `ember`, `wisp`, `shadow`, `brute`, `scorchling`, `scorchmini` (the small split-off), `infernal`, plus `imp` for the player.
- Use square PNG or WebP files with transparent backgrounds, with the creature centred. 256×256 is plenty.
- The sprite is drawn with radius `collision radius × SPRITE_SCALE` (default 1.35), so horns and flames can stick out past the hitbox. Change `SPRITE_SCALE` to resize all art.
- The `imp` image is drawn 56 units tall, standing on the floor and centred on the launch position.
- Collision shapes come only from `ENEMY_TYPES[type].r`, so swapping art never changes gameplay.
- Any sprite that is missing or fails to load falls back to the built-in vector art.

## Tuning difficulty and physics

Everything lives in `src/config.js`:

| What | Where |
|---|---|
| Fireball speed, radius, damage | `BALL_SPEED`, `BALL_R`, `BASE_DAMAGE` |
| Time between launches | `LAUNCH_INTERVAL`, `MIN_LAUNCH_INTERVAL`, `LAUNCH_INTERVAL_SCALE_AT` |
| Fixed timestep | `DT` (default 1/120 s) |
| Anti-horizontal-loop rule | `MIN_VY_RATIO` |
| Aim limits, drag threshold, preview | `MIN_ANGLE_DEG`, `MAX_ANGLE_DEG`, `AIM_MIN_DRAG`, `PREVIEW_BOUNCES`, `PREVIEW_LENGTH` |
| Danger line, row step | `DANGER_Y`, `ROW_STEP`, `SPAWN_Y` |
| Enemy size, health multiplier, score | `ENEMY_TYPES` |
| Which enemies appear when | `typeWeights(wave)` |
| Row density | `rowCount(wave)` |
| Health curve | `baseHp(wave)`, `HP_SUPERLINEAR`, `HP_VARIANCE`, `ELITE_CHANCE_MAX` |
| Combos | `COMBO`, `COMBO_ANNOUNCE` |
| Explosions | `EXPLOSION_RADIUS`, `EXPLOSION_DAMAGE_FACTOR` |
| Power-up frequency | `POWERUP_START_WAVE`, `POWERUP_CHANCE` |
| Fast-forward | `FAST_FORWARD_AFTER`, `FAST_FORWARD_SPEED` |

After changing anything, run `npm test`. The formation and determinism tests catch most balance mistakes that would break the game.

## Design notes

- **Deterministic physics:** the game runs on a fixed 120 Hz timestep with continuous (swept) collision detection, so fireballs can't tunnel at any speed. Fast-forward just runs more steps per frame, which means it can never change outcomes (this is tested).
- **Aim preview:** uses the same `findFirstHit`/`reflect` code as real fireballs.
- **Saving:** the run is checkpointed to LocalStorage at the start of every aiming phase. If you close the game mid-volley, it restores to the last checkpoint. Saves are versioned (`SAVE_VERSION`) and validated before loading. The high score starts at 0.
- **Mobile:** portrait layout fits the dynamic viewport and safe areas. Rotation, resize and toolbar changes only rescale. The game auto-pauses when the tab is hidden. Audio unlocks on first touch, and the game is fully playable muted.
