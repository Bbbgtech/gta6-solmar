// Synthesised sound for SOLMAR: every effect is made with WebAudio
// oscillators and noise, so the game ships zero audio files and makes
// zero network requests.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOn = false;
    this.sirenTimer = 0;
    this.enabled = true;
    this._sirenOsc = null;
    this._sirenGain = null;
  }

  // Must be called from a user gesture at least once; safe to call any time.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      // Engine hum: a low sawtooth whose pitch follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 320;
      this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
      // Police siren: two alternating tones.
      this._sirenOsc = this.ctx.createOscillator();
      this._sirenOsc.type = 'triangle';
      this._sirenOsc.frequency.value = 700;
      this._sirenGain = this.ctx.createGain();
      this._sirenGain.gain.value = 0;
      this._sirenOsc.connect(this._sirenGain); this._sirenGain.connect(this.master);
      this._sirenOsc.start();
    } catch (e) { this.ctx = null; }
  }

  setEngine(speed01) {
    if (!this.ctx || !this.engineOsc) return;
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, this.ctx.currentTime, 0.08);
    this.engineGain.gain.setTargetAtTime(speed01 > 0.03 ? 0.05 + speed01 * 0.05 : 0, this.ctx.currentTime, 0.1);
  }

  setSiren(on) {
    if (!this.ctx || !this._sirenGain) return;
    this._sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2);
  }

  update(dt) {
    if (!this.ctx || !this._sirenOsc) return;
    this.sirenTimer += dt;
    if (this.sirenTimer > 0.45) {
      this.sirenTimer = 0;
      const f = this._sirenOsc.frequency.value > 800 ? 700 : 950;
      this._sirenOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
    }
  }

  _tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null) {
    if (!this.ctx || !this.enabled) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* audio is best-effort */ }
  }

  _noise(dur, vol = 0.25, freq = 1200) {
    if (!this.ctx || !this.enabled) return;
    try {
      const t = this.ctx.currentTime;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t);
    } catch (e) { /* audio is best-effort */ }
  }

  punch() { this._noise(0.12, 0.3, 500); this._tone(120, 0.12, 'sine', 0.25, 60); }
  shoot() { this._noise(0.14, 0.35, 2600); this._tone(900, 0.08, 'square', 0.12, 200); }
  crash() { this._noise(0.3, 0.4, 700); this._tone(90, 0.25, 'sine', 0.3, 40); }
  pickup() { this._tone(660, 0.1, 'sine', 0.2); this._tone(990, 0.14, 'sine', 0.2); }
  cash() { this._tone(880, 0.09, 'triangle', 0.2); setTimeout(() => this._tone(1320, 0.16, 'triangle', 0.2), 90); }
  missionOk() { [523, 659, 784].forEach((f, i) => setTimeout(() => this._tone(f, 0.18, 'triangle', 0.22), i * 110)); }
  missionFail() { [400, 300, 200].forEach((f, i) => setTimeout(() => this._tone(f, 0.22, 'sawtooth', 0.14), i * 140)); }
  wantedUp() { this._tone(520, 0.12, 'square', 0.16, 760); }
  door() { this._noise(0.08, 0.2, 900); }
  hurt() { this._tone(220, 0.15, 'sawtooth', 0.18, 110); }
}
