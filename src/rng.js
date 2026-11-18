// Seeded RNG (mulberry32). State is a single uint32 so it can be saved.
export class RNG {
  constructor(seed = (Math.random() * 2 ** 32) >>> 0) {
    this.state = seed >>> 0;
  }
  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pickWeighted(weights) {
    let total = 0;
    for (const k in weights) total += Math.max(0, weights[k]);
    let r = this.next() * total;
    for (const k in weights) {
      r -= Math.max(0, weights[k]);
      if (r <= 0) return k;
    }
    return Object.keys(weights)[0];
  }
}
