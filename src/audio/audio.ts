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
  /** 1 sous terre : ni vent ni oiseaux, gouttes d'eau et grondement sourd */
  under: number;
  /** proximité (0 … 1) d'un torrent, d'une cascade, du rivage et d'un feu ; altitude du point visé */
  stream?: number;
  cascade?: number;
  coast?: number;
  fire?: number;
  alt?: number;
  /** grenouilles autour du point visé (0 … 1) */
  frogs?: number;
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
  private caveG!: GainNode;
  private streamG!: GainNode;
  private cascadeG!: GainNode;
  private gullTimer = 4;
  private eagleTimer = 10;
  private crackleTimer = 0;
  private dripTimer = 0;
  private noise!: AudioBuffer;
  private nextNote = 0;
  private nextPad = 0;
  private lastDegree = 2;
  private birdTimer = 0;
  private frogTimer = 2;

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
    const cave = noiseLoop('lowpass', 150, 0.9); this.caveG = cave.g;
    // eau vive : murmure clair des torrents, grondement grave des cascades
    const stream = noiseLoop('bandpass', 1300, 0.5); this.streamG = stream.g;
    const casc = noiseLoop('lowpass', 320, 0.7); this.cascadeG = casc.g;
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
    const out = 1 - s.under;
    // le vent forcit en altitude
    const high = clamp(((s.alt ?? 0) - 4) / 7, 0, 1);
    set(this.windG, (0.02 + 0.025 * (s.season === 3 ? 1 : 0.4) + 0.03 * s.fog + 0.02 * s.rain + 0.02 * s.snow + 0.05 * high) * out);
    set(this.streamG, 0.07 * (s.stream ?? 0) * out);
    set(this.cascadeG, 0.12 * (s.cascade ?? 0) * out);
    set(this.rainG, 0.1 * s.rain * out);
    this.waterG.gain.setTargetAtTime(0.02 * clamp(1.4 - s.camDist / 130, 0.2, 1) * out, T, 0.5);
    set(this.cricketG, night * (s.season === 3 ? 0 : 0.012) * (1 - s.rain) * out);
    set(this.villageG, Math.min(0.03, s.pop * 0.0004) * s.daylight * (1 - s.rain * 0.6) * out);
    set(this.caveG, 0.06 * s.under);
    // gouttes qui tombent de la voûte, en écho
    this.dripTimer -= dt;
    if (s.under > 0.5 && this.dripTimer <= 0) {
      this.dripTimer = 0.4 + Math.random() * 2.2;
      const f = 1400 + Math.random() * 1600;
      this.tone(f, T + 0.02, 0.18, 'sine', 0.05, this.sfxG, 0, 0.002);
      this.tone(f * 0.7, T + 0.2, 0.3, 'sine', 0.015, this.sfxG, 0, 0.004);
    }
    // mouettes près du rivage, aigles en montagne, crépitement des feux
    this.gullTimer -= dt;
    if (this.gullTimer <= 0) {
      this.gullTimer = 3 + Math.random() * 7;
      if ((s.coast ?? 0) > 0.3 && s.daylight > 0.4 && s.rain < 0.5 && out > 0.5) this.gull(T + 0.05, s.coast!);
    }
    this.eagleTimer -= dt;
    if (this.eagleTimer <= 0) {
      this.eagleTimer = 8 + Math.random() * 12;
      if (high > 0.2 && s.daylight > 0.5 && s.rain < 0.4 && out > 0.5) this.eagle(T + 0.05, high);
    }
    this.crackleTimer -= dt;
    if ((s.fire ?? 0) > 0.05 && this.crackleTimer <= 0 && out > 0.5) {
      this.crackleTimer = (0.04 + Math.random() * 0.25) / s.fire!;
      this.burst(T + 0.01, 0.025 + Math.random() * 0.03, 2500 + Math.random() * 3000, 0.12 * s.fire! * (0.4 + Math.random()));
    }
    // grenouilles : un concert au crépuscule et la nuit, plus fourni après la pluie
    this.frogTimer -= dt;
    if (this.frogTimer <= 0) {
      const k = (s.frogs ?? 0) * (0.25 + 0.75 * night) * (1 + s.rain) * out;
      this.frogTimer = k > 0.05 ? (0.4 + Math.random() * 1.8) / Math.min(1.5, k + 0.3) : 2;
      if (k > 0.05 && s.season !== 3) this.croak(T + 0.02, Math.min(1, k));
    }
    // oiseaux
    this.birdTimer -= dt;
    if (this.birdTimer <= 0 && s.daylight > 0.5 && s.rain < 0.3 && s.season !== 3 && s.under < 0.5) {
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

  /** Cri de mouette : deux ou trois « kia » qui glissent vers le grave */
  private gull(t: number, k: number) {
    const ctx = this.ctx!, n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const st = t + i * 0.28, f = 1300 + Math.random() * 300;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 1500; flt.Q.value = 2;
      const g = ctx.createGain();
      o.frequency.setValueAtTime(f, st); o.frequency.exponentialRampToValueAtTime(f * 0.62, st + 0.22);
      g.gain.setValueAtTime(0.0001, st); g.gain.linearRampToValueAtTime(0.045 * k, st + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, st + 0.24);
      o.connect(flt); flt.connect(g); g.connect(this.sfxG);
      o.start(st); o.stop(st + 0.26);
    }
  }

  /** Cri d'aigle : long sifflement aigu qui retombe en tremblant */
  private eagle(t: number, k: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = 'triangle';
    const vib = ctx.createOscillator(); vib.frequency.value = 28;
    const vg = ctx.createGain(); vg.gain.value = 90; vib.connect(vg); vg.connect(o.frequency);
    const g = ctx.createGain();
    o.frequency.setValueAtTime(2600, t); o.frequency.exponentialRampToValueAtTime(1500, t + 0.75);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035 * k, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    o.connect(g); g.connect(this.sfxG);
    o.start(t); vib.start(t); o.stop(t + 0.85); vib.stop(t + 0.85);
  }

  /** Grondement souterrain d'un volcan qui se réveille (durée en secondes) */
  sfxRumble(dur: number) {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 90;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.6, t0 + dur * 0.8); g.gain.linearRampToValueAtTime(0.3, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxG);
    src.start(t0); src.stop(t0 + dur + 0.2);
  }

  /** Coups de pioche sur la roche */
  sfxMine() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) { this.burst(t + i * 0.14, 0.06, 3200, 0.35); this.tone(880 + Math.random() * 200, t + i * 0.14, 0.08, 'triangle', 0.08, this.sfxG, 0, 0.002); }
  }

  /** Plouf d'un poisson (force 0 … 1) */
  sfxSplash(k: number) {
    if (!this.ctx || k < 0.05) return;
    const t = this.ctx.currentTime;
    this.burst(t, 0.18, 1400, 0.18 * k);
    this.tone(520 + Math.random() * 200, t, 0.12, 'sine', 0.05 * k, this.sfxG, 0, 0.004);
  }

  /** « Croâ » de grenouille : deux ou trois pulsations rauques, la voix varie d'une grenouille à l'autre */
  private croak(t: number, k: number) {
    const ctx = this.ctx!;
    const f0 = 240 + Math.random() * 260, pulses = Math.random() < 0.4 ? 3 : 2, vol = 0.05 * k * (0.5 + Math.random() * 0.5);
    for (let i = 0; i < pulses; i++) {
      const t0 = t + i * (0.13 + Math.random() * 0.03), dur = 0.09 + Math.random() * 0.04;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0 * 0.85, t0);
      o.frequency.linearRampToValueAtTime(f0 * 1.15, t0 + dur * 0.4);
      o.frequency.linearRampToValueAtTime(f0, t0 + dur);
      // grain rauque : modulation rapide de l'amplitude
      const am = ctx.createOscillator(); am.frequency.value = 38 + Math.random() * 20;
      const amg = ctx.createGain(); amg.gain.value = 0.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      const vca = ctx.createGain(); vca.gain.value = 0.5;
      am.connect(amg); amg.connect(vca.gain);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = f0 * 2.2; f.Q.value = 2.5;
      o.connect(f); f.connect(vca); vca.connect(g); g.connect(this.sfxG);
      o.start(t0); am.start(t0); o.stop(t0 + dur + 0.05); am.stop(t0 + dur + 0.05);
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
  /** Éruption : détonation sourde, grondement continu et explosions au fil des salves (durée en secondes) */
  sfxEruption(dur: number) {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime, blast = t0 + 1.2;
    // grondement : bruit très grave qui enfle, tient pendant le paroxysme puis s'éteint
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 130;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.5, blast);
    g.gain.setValueAtTime(0.5, t0 + dur * 0.55);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxG);
    src.start(t0); src.stop(t0 + dur + 0.1);
    // détonation : grave qui plonge, souffle et craquement
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(70, blast); o.frequency.exponentialRampToValueAtTime(26, blast + 1.8);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, blast); og.gain.linearRampToValueAtTime(0.7, blast + 0.02); og.gain.exponentialRampToValueAtTime(0.0001, blast + 2);
    o.connect(og); og.connect(this.sfxG);
    o.start(blast); o.stop(blast + 2.1);
    this.burst(blast, 2.4, 240, 0.9);
    this.burst(blast, 0.45, 1400, 0.35);
    // salves
    for (let i = 0; i < 14; i++) {
      const t = blast + 0.8 + Math.random() * dur * 0.55;
      this.burst(t, 0.7, 320, 0.4);
      this.tone(44 + Math.random() * 10, t, 0.8, 'sine', 0.28, this.sfxG, 0, 0.01);
    }
  }
  /** Tonnerre : craquement sec si l'éclair est proche, puis long roulement grave (délai en secondes, force 0 … 1) */
  sfxThunder(delay: number, k: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    if (k > 0.7) this.burst(t, 0.35, 2200, 0.35 * k);
    this.burst(t + 0.05, 2.8, 180, 0.9 * k);
    this.burst(t + 0.6 + Math.random() * 0.5, 2.2, 120, 0.6 * k);
    this.tone(38, t, 2.4, 'sine', 0.3 * k, this.sfxG, 0, 0.05);
  }
  /** Feu d'artifice : détonation, souffle grave et crépitement des étincelles (force 0 … 1) */
  sfxBang(k: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.burst(t, 0.5, 1800, 0.3 * k);
    this.tone(70, t, 0.4, 'sine', 0.22 * k, this.sfxG, 0, 0.004);
    for (let i = 0; i < 6; i++) this.burst(t + 0.25 + Math.random() * 0.7, 0.05, 4200, 0.07 * k);
  }
  /** Combat : choc de lames (tintement métallique), coup de feu (détonation sèche), morsure (grognement bref) */
  sfxClash(kind: 'blade' | 'shot' | 'bite') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (kind === 'blade') {
      this.tone(1500 + Math.random() * 500, t, 0.14, 'triangle', 0.07, this.sfxG, 0, 0.002);
      this.tone(2700 + Math.random() * 300, t, 0.07, 'sine', 0.04, this.sfxG, 0, 0.002);
      this.burst(t, 0.04, 5200, 0.05);
    } else if (kind === 'shot') {
      this.burst(t, 0.2, 1500, 0.2);
      this.tone(85, t, 0.16, 'sine', 0.14, this.sfxG, 0, 0.003);
    } else {
      this.tone(130 + Math.random() * 30, t, 0.18, 'sawtooth', 0.06, this.sfxG, 650, 0.01);
      this.burst(t, 0.08, 700, 0.07);
    }
  }
  /** Fête autour du feu : tambours et petite ritournelle de flûte */
  sfxFeast() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 16; i++) this.tone(i % 4 === 0 ? 70 : 115, t + i * 0.22, 0.18, 'sine', i % 4 === 0 ? 0.3 : 0.14, this.sfxG, 0, 0.003);
    [0, 2, 4, 7, 4, 2, 0, -3].forEach((iv, i) => this.tone(mtof(72 + iv), t + i * 0.44, 0.4, 'triangle', 0.12, this.sfxG, 2500, 0.02));
  }
  sfxAgeUp() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 12, 16, 19].forEach((iv, i) => this.tone(mtof(60 + iv), t + i * 0.12, 1.6, 'triangle', 0.25, this.sfxG, 3000, 0.01));
  }
}
