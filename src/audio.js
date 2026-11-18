// AudioManager: original synthesized SFX + a small procedural music loop.
// Created lazily on the first user gesture (mobile autoplay rules).
const GAPS = { launch: 45, wall: 35, hit: 28, kill: 40, pickup: 60, powerup: 80, explode: 90, gameover: 500, ui: 40 };

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.sound = true;
    this.music = true;
    this.last = {};
    this.musicTimer = null;
    this.nextNote = 0;
    this.step = 0;
  }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.55;
        this.master.connect(this.ctx.destination);
        this.sfx = this.ctx.createGain(); this.sfx.connect(this.master);
        this.mus = this.ctx.createGain(); this.mus.gain.value = 0.32; this.mus.connect(this.master);
        const len = this.ctx.sampleRate * 0.6;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        // iOS: play a silent buffer inside the gesture to fully unlock
        const s = this.ctx.createBufferSource();
        s.buffer = this.ctx.createBuffer(1, 1, 22050); s.connect(this.ctx.destination); s.start(0);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this._syncMusic();
    } catch { /* audio unavailable: game stays playable */ }
  }

  suspend() { try { this.ctx && this.ctx.state === 'running' && this.ctx.suspend(); } catch { /* */ } }
  resume() { try { this.ctx && this.ctx.state === 'suspended' && this.ctx.resume(); } catch { /* */ } }

  setSound(on) { this.sound = on; }
  setMusic(on) { this.music = on; this._syncMusic(); }

  _ok(name) {
    if (!this.sound || !this.ctx || this.ctx.state !== 'running') return false;
    const now = performance.now();
    if (now - (this.last[name] || 0) < (GAPS[name] || 30)) return false;
    this.last[name] = now;
    return true;
  }

  _tone(freq, dur, { type = 'sine', vol = 0.3, slide = null, delay = 0, out = this.sfx, attack = 0.005 } = {}) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(dur, { vol = 0.3, freq = 1200, q = 1, type = 'lowpass', delay = 0, sweep = null } = {}) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
  }

  play(name, p = 0) {
    if (!this._ok(name)) return;
    try {
      switch (name) {
        case 'launch': this._noise(0.12, { vol: 0.18, freq: 900, sweep: 3000, type: 'bandpass', q: 2 }); this._tone(300, 0.1, { type: 'triangle', vol: 0.08, slide: 600 }); break;
        case 'wall': this._tone(1400 + Math.random() * 300, 0.04, { type: 'square', vol: 0.03 }); break;
        case 'hit': this._tone(520 + p * 40 + Math.random() * 60, 0.06, { type: 'triangle', vol: 0.12, slide: 300 }); break;
        case 'kill': this._noise(0.18, { vol: 0.22, freq: 2400, sweep: 300 }); this._tone(660, 0.12, { type: 'square', vol: 0.06, slide: 1320 }); break;
        case 'pickup': [880, 1175, 1568].forEach((f, i) => this._tone(f, 0.12, { type: 'triangle', vol: 0.12, delay: i * 0.05 })); break;
        case 'powerup': this._tone(330, 0.35, { type: 'sawtooth', vol: 0.08, slide: 1320 }); this._tone(660, 0.3, { type: 'triangle', vol: 0.1, slide: 1760, delay: 0.05 }); break;
        case 'explode': this._noise(0.6, { vol: 0.55, freq: 1600, sweep: 80 }); this._tone(110, 0.45, { type: 'sine', vol: 0.4, slide: 35 }); break;
        case 'gameover': [392, 330, 262, 196].forEach((f, i) => this._tone(f, 0.35, { type: 'sawtooth', vol: 0.09, delay: i * 0.22, slide: f * 0.94 })); break;
        case 'ui': this._tone(660, 0.05, { type: 'triangle', vol: 0.08 }); break;
        default: break;
      }
    } catch { /* ignore */ }
  }

  // ---- music: brooding bass ostinato + pad, scheduled with lookahead ----
  _syncMusic() {
    if (!this.ctx) return;
    if (this.music && !this.musicTimer) {
      this.nextNote = this.ctx.currentTime + 0.1;
      this.musicTimer = setInterval(() => this._schedule(), 120);
    } else if (!this.music && this.musicTimer) {
      clearInterval(this.musicTimer); this.musicTimer = null;
    }
  }

  _schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const bpm = 96, eighth = 60 / bpm / 2;
    // D minor-ish phrygian loop (MIDI notes)
    const bass = [38, 38, 50, 38, 41, 38, 39, 38, 36, 36, 48, 36, 39, 38, 36, 34];
    const lead = { 0: 62, 6: 65, 8: 63, 12: 62, 14: 60 };
    while (this.nextNote < this.ctx.currentTime + 0.35) {
      const i = this.step % 16;
      const bar = Math.floor(this.step / 16) % 4;
      const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
      const delay = this.nextNote - this.ctx.currentTime;
      this._tone(hz(bass[i]), eighth * 0.9, { type: 'triangle', vol: 0.22, delay, out: this.mus });
      if (bar % 2 === 1 && lead[i]) this._tone(hz(lead[i]), eighth * 2.2, { type: 'sine', vol: 0.07, delay, out: this.mus, attack: 0.04 });
      if (i % 4 === 0) this._noiseHat(delay);
      this.nextNote += eighth;
      this.step++;
    }
  }

  _noiseHat(delay) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
    const g = c.createGain(); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f); f.connect(g); g.connect(this.mus); s.start(t); s.stop(t + 0.06);
  }
}
