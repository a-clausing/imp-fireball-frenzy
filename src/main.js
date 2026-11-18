// Game: browser orchestration — loop, screens (UIManager), events → FX/audio.
import { CONFIG, ENEMY_TYPES } from './config.js';
import { Simulation } from './sim.js';
import { Renderer, enemyIcon } from './renderer.js';
import { InputController } from './input.js';
import { AudioManager } from './audio.js';
import { SaveManager } from './save.js';
import { FX } from './fx.js';
import { drawImp, drawPickupIcon } from './art.js';

// Safari < 16 polyfill
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(typeof r === 'number' ? r : 0, w / 2, h / 2);
    this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
  };
}

const $ = (s) => document.querySelector(s);
const fmt = (n) => Math.floor(n).toLocaleString('en-US');

// ---------------- UIManager ----------------
class UIManager {
  constructor(game) {
    this.g = game;
    this.overlay = null;
    this.hudCache = {};
    this.backTo = 'menu';
    document.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('click', (e) => { e.stopPropagation(); game.audio.unlock(); game.audio.play('ui'); this.action(b.dataset.act, b); });
    });
    document.querySelectorAll('[data-set]').forEach((inp) => {
      inp.addEventListener('change', () => game.setSetting(inp.dataset.set, inp.checked));
    });
    $('#btn-pause').addEventListener('click', (e) => { e.stopPropagation(); game.pause(); });
    $('#btn-ff').addEventListener('pointerdown', (e) => e.stopPropagation());
    $('#btn-ff').addEventListener('click', (e) => { e.stopPropagation(); game.toggleFastForward(); });
    this._drawPowerIcons();
  }

  action(act) {
    const g = this.g;
    switch (act) {
      case 'play':
        if (g.hasResumableRun()) this.confirm('Start a new run? Your current run will be lost.', () => g.startNew());
        else g.startNew();
        break;
      case 'continue': g.continueRun(); break;
      case 'howto': this.buildHowTo(); this.show('howto'); break;
      case 'settings': this.backTo = this.overlay === 'pause' ? 'pause' : 'menu'; this.syncSettings(); this.show('settings'); break;
      case 'back': this.show(this.overlay === 'settings' ? this.backTo : 'menu'); if (this.overlay === 'menu') g.showMenu(); break;
      case 'resume': g.resume(); break;
      case 'restart': this.confirm('Restart? Your current run will be abandoned.', () => g.startNew(), 'pause'); break;
      case 'menu': g.showMenu(); break;
      case 'again': g.startNew(); break;
      case 'resetbest': this.confirm('Reset your all-time high score to zero?', () => { g.save.resetBest(); this.show('settings'); this.refreshBest(); }, 'settings'); break;
      case 'yes': { const f = this.onYes; this.onYes = null; f && f(); break; }
      case 'no': this.show(this.confirmBack || 'menu'); break;
      default: break;
    }
  }

  confirm(text, onYes, back) {
    $('#confirm-text').textContent = text;
    this.onYes = onYes;
    this.confirmBack = back || this.overlay || 'menu';
    this.show('confirm');
  }

  show(name) {
    for (const id of ['menu', 'howto', 'settings', 'pause', 'confirm', 'gameover']) $('#' + id).classList.toggle('show', id === name);
    this.overlay = name;
    const inGame = this.g.state !== 'menu';
    const wasHidden = !$('#game').classList.contains('show');
    $('#game').classList.toggle('show', inGame);
    if (wasHidden && inGame) this.g.layout();
    if (name === 'menu') this.refreshMenu();
  }

  hideOverlays() { this.show(null); }

  refreshMenu() {
    $('#btn-continue').classList.toggle('hidden', !this.g.hasResumableRun());
    this.refreshBest();
  }
  refreshBest() { $('#menu-best').textContent = fmt(this.g.save.best); }

  syncSettings() {
    document.querySelectorAll('[data-set]').forEach((inp) => { inp.checked = !!this.g.settings[inp.dataset.set]; });
  }

  hud(sim) {
    const best = Math.max(this.g.save.best, sim.score);
    const vals = { score: fmt(sim.score), best: fmt(best), wave: sim.wave, balls: sim.ballCount };
    for (const k in vals) {
      if (this.hudCache[k] !== vals[k]) { this.hudCache[k] = vals[k]; $('#hud-' + k).textContent = vals[k]; }
    }
    const p = sim.power;
    for (const kind of ['pierce', 'inferno']) {
      const st = p.active[kind] ? 'active' : p.pending[kind] ? 'pending' : 'off';
      const key = 'pw-' + kind;
      if (this.hudCache[key] !== st) {
        this.hudCache[key] = st;
        const el = $('#' + key);
        el.classList.remove('off', 'pending', 'active'); el.classList.add(st);
        el.querySelector('b').textContent = st === 'active' ? 'ON' : 'NEXT';
      }
    }
    const ff = $('#btn-ff');
    const showFF = this.g.state === 'playing' && sim.phase === 'volley' && sim.volley.time > CONFIG.FAST_FORWARD_AFTER;
    if (this.hudCache.ff !== showFF) { this.hudCache.ff = showFF; ff.classList.toggle('hidden', !showFF); }
    ff.classList.toggle('on', this.g.speed > 1);
  }

  combo(kills, mult) {
    const el = $('#combo');
    const word = kills >= 20 ? 'INFERNAL!' : kills >= 12 ? 'INFERNO!' : kills >= 7 ? 'FRENZY!' : 'COMBO!';
    el.innerHTML = `${word} ×${mult}<small>${kills} KILLS</small>`;
    el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  }

  gameOver(score, wave, best, isNew) {
    $('#go-score').textContent = fmt(score);
    $('#go-wave').textContent = wave;
    $('#go-best').textContent = fmt(best);
    $('#go-new').classList.toggle('hidden', !isNew);
    const c = $('#go-imp'); const dpr = Math.min(3, devicePixelRatio || 1);
    c.width = 160 * dpr; c.height = 90 * dpr;
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    drawImp(g, 80, 80, 2.2, { pose: 'dead', t: 0 });
    this.show('gameover');
  }

  _drawPowerIcons() {
    for (const kind of ['pierce', 'inferno']) {
      const c = document.querySelector(`#pw-${kind} canvas`);
      const g = c.getContext('2d'); g.translate(32, 32);
      drawPickupIcon(g, kind, 22, 0);
    }
  }

  buildHowTo() {
    if (this.howBuilt) return;
    this.howBuilt = true;
    const dpr = Math.min(3, devicePixelRatio || 1);
    const mk = (w, h, fn) => {
      const c = document.createElement('canvas'); c.width = w * dpr; c.height = h * dpr;
      c.style.width = w + 'px'; c.style.height = h + 'px';
      const g = c.getContext('2d'); g.scale(dpr, dpr); fn(g); return c;
    };
    const put = (key, ...els) => { const slot = document.querySelector(`[data-icon="${key}"]`); slot.append(...els); };
    put('aim', mk(74, 56, (g) => {
      drawImp(g, 18, 52, 0.85, { aim: 0.9, holdFire: true });
      g.fillStyle = '#ffc04a';
      for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(30 + i * 6.5, 30 - i * 4, 1.8, 0, 7); g.fill(); }
    }));
    put('brute', enemyIcon('brute', 56, dpr));
    put('ball', mk(56, 56, (g) => { g.translate(28, 28); drawPickupIcon(g, 'ball', 17); }));
    put('powers', mk(36, 36, (g) => { g.translate(18, 18); drawPickupIcon(g, 'pierce', 13); }), mk(36, 36, (g) => { g.translate(18, 18); drawPickupIcon(g, 'inferno', 13); }));
    put('special', enemyIcon('scorchling', 36, dpr), enemyIcon('infernal', 36, dpr));
    put('survive', enemyIcon('ember', 26, dpr), enemyIcon('shadow', 26, dpr), enemyIcon('wisp', 26, dpr));
  }
}

// ---------------- Menu background (flames + embers) ----------------
class MenuBackground {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.embers = Array.from({ length: 50 }, () => this._e(true));
  }
  _e(init) { return { x: Math.random(), y: init ? Math.random() : 1.05, v: 0.03 + Math.random() * 0.07, s: 1 + Math.random() * 2.2, p: Math.random() * 6 }; }
  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.w = innerWidth; this.h = innerHeight;
    this.c.width = this.w * dpr; this.c.height = this.h * dpr;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // static stone wall layer
    const s = document.createElement('canvas'); s.width = this.c.width; s.height = this.c.height;
    const g = s.getContext('2d'); g.scale(dpr, dpr);
    const gr = g.createLinearGradient(0, 0, 0, this.h);
    gr.addColorStop(0, '#22123a'); gr.addColorStop(1, '#2a0e1c');
    g.fillStyle = gr; g.fillRect(0, 0, this.w, this.h);
    let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < this.h; y += 30) {
      let x = (y / 30) % 2 ? -22 : 0;
      while (x < this.w) { const bw = 44 + rnd() * 30; const sh = 36 + rnd() * 16;
        g.fillStyle = `rgb(${sh + 8},${sh * 0.55},${sh + 26})`; g.beginPath(); g.roundRect(x + 1.5, y + 1.5, bw - 3, 27, 4); g.fill(); x += bw; }
    }
    const vg = g.createRadialGradient(this.w / 2, this.h * 0.45, 60, this.w / 2, this.h * 0.45, Math.max(this.w, this.h) * 0.75);
    vg.addColorStop(0, 'rgba(10,4,18,0.35)'); vg.addColorStop(1, 'rgba(5,0,10,0.85)');
    g.fillStyle = vg; g.fillRect(0, 0, this.w, this.h);
    this.wall = s;
  }
  draw(t, dt) {
    const g = this.g, w = this.w, h = this.h;
    if (!this.wall) return;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(this.wall, 0, 0); g.restore();
    // flames at the bottom
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const fx = (i / 8) * w, fh = h * (0.12 + 0.05 * Math.sin(t * 3 + i * 1.7)) * (i % 4 === 0 ? 1.5 : 1);
      const gr = g.createRadialGradient(fx, h, 4, fx, h, fh);
      gr.addColorStop(0, 'rgba(255,200,80,0.55)'); gr.addColorStop(0.4, 'rgba(255,90,20,0.3)'); gr.addColorStop(1, 'rgba(120,0,40,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(fx, h, fh, 0, Math.PI * 2); g.fill();
    }
    for (const e of this.embers) {
      e.y -= e.v * dt; e.x += Math.sin(t + e.p) * 0.0006;
      if (e.y < -0.05) Object.assign(e, this._e(false));
      g.globalAlpha = 0.4 + 0.4 * Math.sin(t * 4 + e.p);
      g.fillStyle = e.p > 3 ? '#ffb040' : '#ff6020';
      g.beginPath(); g.arc(e.x * w, e.y * h, e.s, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
}

// ---------------- Game ----------------
class Game {
  constructor() {
    this.save = new SaveManager();
    this.settings = this.save.loadSettings();
    this.audio = new AudioManager();
    this.audio.setSound(this.settings.sound);
    this.audio.setMusic(this.settings.music);
    this.fx = new FX();
    this.fx.shakeEnabled = this.settings.shake;
    this.renderer = new Renderer($('#arena'));
    this.menuBg = new MenuBackground($('#bgfx'));
    this.sim = null;
    this.state = 'menu';
    this.speed = 1;
    this.acc = 0;
    this.aim = null;
    this.lastThrow = -10;
    this.frameDt = 0;
    this.lastDmgText = 0;
    this.ui = new UIManager(this);
    this.input = new InputController($('#stage'), {
      canAim: () => this.state === 'playing' && this.sim && this.sim.canAim(),
      onFire: (a) => this.fire(a),
      onAimChange: (a) => { this.aim = a; },
    });
    this._bindGlobal();
    this.layout();
    this.showMenu();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  _bindGlobal() {
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('touchend', unlock, { passive: true });
    let pending = false;
    const relayout = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; this.layout(); }); };
    window.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', () => setTimeout(relayout, 150));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', relayout);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (this.state === 'playing') this.pause(); this.audio.suspend(); }
      else { this.audio.resume(); this.last = performance.now(); this.acc = 0; }
    });
    // block pinch-zoom, double-tap zoom, and page scroll (except inside scroll panels)
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => { if (!e.target.closest('.scroll')) e.preventDefault(); }, { passive: false });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  layout() {
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--vh', vh + 'px');
    const stage = $('#stage');
    if (stage.clientWidth > 0 && stage.clientHeight > 0) {
      this.renderer.resize(stage.clientWidth, stage.clientHeight, window.devicePixelRatio || 1);
    }
    this.menuBg.resize();
  }

  hasResumableRun() {
    return !!(this.sim && this.sim.phase !== 'over') || this.save.hasRun();
  }

  setSetting(key, val) {
    this.settings[key] = val;
    this.save.saveSettings(this.settings);
    if (key === 'sound') this.audio.setSound(val);
    if (key === 'music') this.audio.setMusic(val);
    if (key === 'shake') this.fx.shakeEnabled = val;
  }

  // ----- run control -----
  startNew() {
    this.save.clearRun();
    this.sim = new Simulation();
    this.sim.newRun((Math.random() * 2 ** 32) >>> 0);
    this._enterRun();
  }

  continueRun() {
    if (!(this.sim && this.sim.phase !== 'over')) {
      const d = this.save.loadRun();
      if (!d) { this.ui.refreshMenu(); return; }
      this.sim = new Simulation();
      this.sim.restore(d);
    }
    this._enterRun();
  }

  _enterRun() {
    this.runStartBest = this.save.best;
    this.fx.clear();
    this.speed = 1; this.acc = 0;
    this.input.reset();
    this.state = 'playing';
    this.ui.hudCache = {};
    this.ui.hideOverlays();
    this.layout();
    this._drainEvents();
    this.last = performance.now();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.reset();
    this.ui.show('pause');
  }
  resume() {
    this.state = 'playing';
    this.last = performance.now(); this.acc = 0;
    this.ui.hideOverlays();
  }
  showMenu() {
    if (this.state === 'gameover') this.sim = null;
    this.state = 'menu';
    this.input.reset();
    this.ui.show('menu');
  }

  fire(angle) {
    if (this.sim.beginVolley(angle)) this.speed = 1;
  }
  toggleFastForward() { this.speed = this.speed > 1 ? 1 : CONFIG.FAST_FORWARD_SPEED; }

  // ----- events → feedback -----
  _drainEvents() {
    const sim = this.sim; if (!sim) return;
    const evs = sim.events;
    const fx = this.fx, au = this.audio;
    const busy = sim.balls.length > 40;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      switch (e.type) {
        case 'checkpoint':
          this.save.saveRun(sim);
          this.save.submitScore(sim.score);
          break;
        case 'launch':
          this.lastThrow = this.t;
          au.play('launch');
          if (!busy) fx.burst(e.x, CONFIG.FLOOR_Y - 30, 3, '#ffb040', 60, 0.25, 2.5, 0, true);
          break;
        case 'wall':
          au.play('wall');
          if (!busy) fx.burst(e.x, e.y, 2, '#ffcf80', 50, 0.18, 2, 0, true);
          break;
        case 'hit': {
          au.play('hit', Math.min(8, e.dmg));
          fx.burst(e.x, e.y, busy ? 1 : 3, e.inferno ? '#ff5030' : '#ffd070', 90, 0.22, 2.4, 0, true);
          if (this.t - this.lastDmgText > 0.07) {
            this.lastDmgText = this.t;
            fx.text(e.x + (Math.random() - 0.5) * 10, e.y - 8, '-' + e.dmg, e.inferno ? '#ff7050' : '#ffe6a0', 10, 0.45, -50);
          }
          break;
        }
        case 'kill': {
          const col = ENEMY_TYPES[e.etype].color;
          au.play('kill');
          fx.burst(e.x, e.y, busy ? 8 : 16, col, 170, 0.55, 4, 260);
          fx.burst(e.x, e.y, 6, '#ffe6a0', 110, 0.35, 2.5, 0, true);
          fx.ring(e.x, e.y, e.r * 1.6, col, 0.3);
          fx.text(e.x, e.y - 4, '+' + e.points, e.mult > 1 ? '#ffd23a' : '#ffffff', e.mult > 1 ? 15 : 13, 0.9);
          break;
        }
        case 'combo': this.ui.combo(e.kills, e.mult); au.play('powerup'); break;
        case 'explode':
          au.play('explode');
          fx.ring(e.x, e.y, e.radius, '#ff7a20', 0.45);
          fx.burst(e.x, e.y, 26, '#ff6a20', 260, 0.7, 5, 120, true);
          fx.shake(6, 0.3); fx.flash = Math.min(1, fx.flash + 0.6);
          break;
        case 'pickup':
          au.play('pickup');
          fx.burst(e.x, e.y, 12, '#9cff5a', 120, 0.45, 3, 0, true);
          fx.text(e.x, e.y - 6, '+1', '#9cff5a', 18, 0.9);
          break;
        case 'powerup':
          au.play('powerup');
          fx.burst(e.x, e.y, 18, e.kind === 'pierce' ? '#d08aff' : '#ff7a30', 150, 0.5, 3, 0, true);
          fx.text(e.x, e.y - 6, e.kind === 'pierce' ? 'PIERCE!' : 'INFERNO!', e.kind === 'pierce' ? '#e0b0ff' : '#ff9a50', 15, 1.1);
          break;
        case 'split': fx.burst(e.x, e.y, 6, '#ffd040', 80, 0.3, 2.5, 0, true); break;
        case 'volleyEnd': this.speed = 1; break;
        case 'gameOver': this._gameOver(); break;
        default: break;
      }
    }
    evs.length = 0;
  }

  _gameOver() {
    const sim = this.sim;
    this.save.clearRun();
    const isNew = sim.score > this.runStartBest && sim.score > 0;
    this.save.submitScore(sim.score);
    this.state = 'dying';
    this.dyingT = 0;
    this.input.reset();
    this.audio.play('gameover');
    this.fx.shake(8, 0.5);
    this.fx.flash = 1;
    this.goInfo = [sim.score, sim.wave, this.save.best, isNew];
  }

  // ----- main loop -----
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 0.1);
    this.frameDt = dt;
    this.t = now / 1000;

    if (this.state === 'playing' && this.sim) {
      this.acc += dt * this.speed;
      const DT = CONFIG.DT;
      let steps = 0;
      while (this.acc >= DT && steps < CONFIG.MAX_STEPS_PER_FRAME) {
        this.sim.step(DT);
        this.acc -= DT; steps++;
        if (this.sim.events.length) this._drainEvents();
        if (this.state !== 'playing') break;
      }
      if (steps >= CONFIG.MAX_STEPS_PER_FRAME) this.acc = 0; // device too slow: slow down rather than skip physics
    }
    if (this.state === 'dying') {
      this.dyingT += dt;
      if (this.dyingT > 1.3) { this.state = 'gameover'; this.ui.gameOver(...this.goInfo); }
    }
    if (this.state !== 'paused') this.fx.update(dt);

    const inMenu = this.state === 'menu';
    if (inMenu) {
      this.menuBg.draw(this.t, dt);
      const mi = $('#menu-imp');
      const dpr = Math.min(3, devicePixelRatio || 1);
      const want = Math.round(mi.clientWidth * dpr), wantH = Math.round(mi.clientHeight * dpr);
      if (want && (mi.width !== want || mi.height !== wantH)) { mi.width = want; mi.height = wantH; }
      if (mi.width && mi.clientWidth) {
        const g = mi.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, mi.width, mi.height);
        const s = mi.height / 62;
        drawImp(g, mi.width / 2 - 4 * s, mi.height - 4 * s, s, { aim: 1.1 + Math.sin(this.t * 1.5) * 0.15, t: this.t, throwT: 1 });
      }
    } else if (this.sim && $('#game').classList.contains('show')) {
      const alpha = this.state === 'playing' ? this.acc / CONFIG.DT : 1;
      this.renderer.draw(this, Math.min(1, alpha), this.t);
      this.ui.hud(this.sim);
    }
  }
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => { window.game = new Game(); });
else window.game = new Game();
