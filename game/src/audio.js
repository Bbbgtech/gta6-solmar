// audio.js — every sound in Solmar is synthesised with WebAudio.
// No audio files, no network: oscillators and filtered noise, started only
// after the player's first key or click (browsers require a gesture).
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenTimer = null;
    this.muted = false;
  }
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      // Engine: a low sawtooth whose pitch follows the car's speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(filter).connect(this.engineGain).connect(this.ctx.destination);
      this.engineOsc.start();
    } catch (e) { this.ctx = null; }
  }
  setEngine(speed, maxSpeed) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const f = 55 + 130 * Math.abs(speed) / Math.max(1, maxSpeed);
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.08);
    this.engineGain.gain.setTargetAtTime(Math.abs(speed) > 5 ? 0.045 : 0, t, 0.1);
  }
  blip(freq, dur, type = 'sine', vol = 0.12) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(t); o.stop(t + dur);
    } catch (e) {}
  }
  noise(dur, vol = 0.2, freq = 1200) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(filter).connect(g).connect(this.ctx.destination);
      src.start(t);
    } catch (e) {}
  }
  shoot() { this.noise(0.14, 0.3, 2600); this.blip(180, 0.1, 'square', 0.1); }
  punch() { this.noise(0.08, 0.25, 500); this.blip(90, 0.12, 'sine', 0.18); }
  crash() { this.noise(0.25, 0.3, 700); }
  pickup() { this.blip(660, 0.1); setTimeout(() => this.blip(990, 0.14), 90); }
  cash() { this.blip(880, 0.09); setTimeout(() => this.blip(1320, 0.16), 80); }
  horn() { this.blip(370, 0.18, 'square', 0.07); }
  // Two-tone police siren while any police car is close.
  siren(on) {
    if (!this.ctx || this.muted) return;
    if (on && !this.sirenTimer) {
      let high = false;
      this.sirenTimer = setInterval(() => {
        high = !high;
        this.blip(high ? 880 : 660, 0.32, 'triangle', 0.045);
      }, 340);
    } else if (!on && this.sirenTimer) {
      clearInterval(this.sirenTimer);
      this.sirenTimer = null;
    }
  }
  jingle() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.12), i * 130));
  }
  fail() {
    [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'sawtooth', 0.07), i * 150));
  }
}
