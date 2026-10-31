import { clamp } from '../core/rng';

export interface AudioState {
  age: number;
  season: number;
  daylight: number;
  rain: number;
  snow: number;
  fog: number;
  pop: number;
  camDist: number;
}

const SCALES = [
  [0, 2, 4, 7, 9],
  [0, 2, 3, 5, 7, 9, 10],
  [0, 2, 4, 5, 7, 9, 11],
  [0, 2, 4, 5, 7, 9, 10],
  [0, 2, 4, 7, 9, 11, 14],
];
const ROOTS = [60, 62, 57, 55]; // printemps, été, automne, hiver
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Audio 100 % procédural (Web Audio) : musique générative + ambiances + effets */
export class AudioEngine {
  ctx: AudioContext | null = null;
  musicVol = 0.5;
  sfxVol = 0.7;
  muteMusic = true;
  muteSfx = true;
  private master!: GainNode;
  private musicG!: GainNode;
  private sfxG!: GainNode;
  private windG!: GainNode;
  private rainG!: GainNode;
  private waterG!: GainNode;
  private cricketG!: GainNode;
  private villageG!: GainNode;
  private noise!: AudioBuffer;
  private nextNote = 0;
  private nextPad = 0;
  private lastDegree = 2;
  private birdTimer = 0;

  /** À appeler depuis un geste utilisateur */
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(ctx.destination);
    this.musicG = ctx.createGain(); this.musicG.connect(this.master);
    this.sfxG = ctx.createGain(); this.sfxG.connect(this.master);
    // bruit
    const len = ctx.sampleRate * 3;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    const noiseLoop = (filterType: BiquadFilterType, freq: number, q = 0.7) => {
      const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
      src.loopStart = Math.random() * 1.5;
      const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.sfxG); src.start();
      return { g, f };
    };
    const wind = noiseLoop('bandpass', 420, 0.5); this.windG = wind.g;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12;
    const lg = ctx.createGain(); lg.gain.value = 220; lfo.connect(lg); lg.connect(wind.f.frequency); lfo.start();
    const rain = noiseLoop('highpass', 1800, 0.4); this.rainG = rain.g;
    const water = noiseLoop('lowpass', 520, 0.8); this.waterG = water.g;
    const wl = ctx.createOscillator(); wl.frequency.value = 0.3;
    const wlg = ctx.createGain(); wlg.gain.value = 0.012; wl.connect(wlg); wlg.connect(water.g.gain); wl.start();
    const vil = noiseLoop('bandpass', 700, 1.2); this.villageG = vil.g;
    // grillons
    const cr = ctx.createOscillator(); cr.type = 'sine'; cr.frequency.value = 4300;
    const cg = ctx.createGain(); cg.gain.value = 0;
    const am = ctx.createOscillator(); am.type = 'square'; am.frequency.value = 14;
    const amg = ctx.createGain(); amg.gain.value = 0.5;
    const amOff = ctx.createConstantSource(); amOff.offset.value = 0.5;
    const mod = ctx.createGain(); mod.gain.value = 0;
    am.connect(amg); amg.connect(mod.gain); amOff.connect(mod.gain);
    cr.connect(mod); mod.connect(cg); cg.connect(this.sfxG);
    cr.start(); am.start(); amOff.start();
    this.cricketG = cg;
    this.applyVolumes();
    this.nextNote = ctx.currentTime + 1;
    this.nextPad = ctx.currentTime + 0.5;
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.musicG.gain.setTargetAtTime(this.muteMusic ? 0 : this.musicVol * 0.55, this.ctx.currentTime, 0.1);
    this.sfxG.gain.setTargetAtTime(this.muteSfx ? 0 : this.sfxVol, this.ctx.currentTime, 0.1);
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode, cutoff = 0, attack = 0.01) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let last: AudioNode = o;
    if (cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f); last = f; }
    last.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  update(dt: number, s: AudioState) {
    const ctx = this.ctx;
    if (!ctx) return;
    const T = ctx.currentTime;
    const night = 1 - s.daylight;
    // ambiances
    const set = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, T, 0.4);
    set(this.windG, 0.02 + 0.025 * (s.season === 3 ? 1 : 0.4) + 0.03 * s.fog + 0.02 * s.rain + 0.02 * s.snow);
    set(this.rainG, 0.1 * s.rain);
    this.waterG.gain.setTargetAtTime(0.02 * clamp(1.4 - s.camDist / 80, 0.2, 1), T, 0.5);
    set(this.cricketG, night * (s.season === 3 ? 0 : 0.012) * (1 - s.rain));
    set(this.villageG, Math.min(0.03, s.pop * 0.0004) * s.daylight * (1 - s.rain * 0.6));
    // oiseaux
    this.birdTimer -= dt;
    if (this.birdTimer <= 0 && s.daylight > 0.5 && s.rain < 0.3 && s.season !== 3) {
      this.birdTimer = 1.5 + Math.random() * 4;
      this.chirp(T + 0.05);
    } else if (this.birdTimer <= 0) this.birdTimer = 2;

    // musique
    const scale = SCALES[Math.min(s.age, 4)];
    const root = ROOTS[s.season] - (night > 0.6 ? 12 : 0);
    const beat = (0.8 + (s.age === 0 ? 0.35 : 0) - s.age * 0.05) * (1 + night * 0.35);
    while (this.nextNote < T + 0.4) {
      const t = Math.max(this.nextNote, T);
      const density = (0.55 - night * 0.2) * (s.season === 3 ? 0.8 : 1) * (1 - s.rain * 0.3);
      if (Math.random() < density) {
        const step = Math.random() < 0.6 ? (Math.random() < 0.5 ? -1 : 1) : Math.floor(Math.random() * 5) - 2;
        this.lastDegree = clamp(this.lastDegree + step, 0, scale.length * 2 - 1);
        const deg = this.lastDegree;
        const midi = root + 12 + scale[deg % scale.length] + 12 * Math.floor(deg / scale.length);
        const f = mtof(midi);
        switch (Math.min(s.age, 4)) {
          case 0: this.tone(f, t, 2.4, 'triangle', 0.16, this.musicG, 1800, 0.08); break;
          case 1: this.tone(f, t, 1.8, 'sine', 0.22, this.musicG, 0, 0.008); this.tone(f * 2, t, 0.6, 'sine', 0.05, this.musicG, 0, 0.005); break;
          case 2: this.tone(f, t, 1.4, 'triangle', 0.22, this.musicG, 2400, 0.005); break;
          case 3: this.tone(f, t, 1.2, 'square', 0.07, this.musicG, 1600, 0.004); break;
          default: this.tone(f, t, 1.6, 'sine', 0.2, this.musicG, 0, 0.01); this.tone(f * 3.01, t, 0.3, 'sine', 0.03, this.musicG, 0, 0.005); break;
        }
      }
      this.nextNote += beat * (Math.random() < 0.3 ? 2 : 1);
    }
    while (this.nextPad < T + 0.5) {
      const t = Math.max(this.nextPad, T);
      const prog = [0, 5, 3, 4][Math.floor(Math.random() * 4)];
      const base = root - 12 + (scale[prog % scale.length] ?? 0);
      for (const iv of [0, 7, 12]) this.tone(mtof(base + iv), t, 7.5, 'sine', 0.07, this.musicG, 0, 2.5);
      this.nextPad += 7;
    }
  }

  private chirp(t: number) {
    const ctx = this.ctx!;
    const n = 2 + Math.floor(Math.random() * 3);
    const base = 2200 + Math.random() * 1800;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(); o.type = 'sine';
      const g = ctx.createGain();
      const st = t + i * 0.11;
      o.frequency.setValueAtTime(base, st);
      o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), st + 0.07);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.022, st + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.09);
      o.connect(g); g.connect(this.sfxG);
      o.start(st); o.stop(st + 0.12);
    }
  }

  private burst(t: number, dur: number, freq: number, vol: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxG);
    src.start(t, Math.random() * 2); src.stop(t + dur + 0.05);
  }

  sfxPlace() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(196, t, 0.18, 'triangle', 0.35, this.sfxG, 900, 0.004);
    this.tone(392, t + 0.05, 0.22, 'sine', 0.18, this.sfxG, 0, 0.004);
    this.burst(t, 0.08, 500, 0.3);
  }
  sfxDestroy() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.burst(t, 0.3, 900, 0.5);
    this.tone(150, t, 0.25, 'sine', 0.25, this.sfxG, 0, 0.004);
  }
  sfxClick() {
    if (!this.ctx) return;
    this.tone(660, this.ctx.currentTime, 0.07, 'sine', 0.12, this.sfxG, 0, 0.003);
  }
  sfxAgeUp() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 12, 16, 19].forEach((iv, i) => this.tone(mtof(60 + iv), t + i * 0.12, 1.6, 'triangle', 0.25, this.sfxG, 3000, 0.01));
  }
}
