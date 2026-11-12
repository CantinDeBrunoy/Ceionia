import type { SpotKind } from './spots';

/**
 * Les voix des bruitages de proximité, toutes synthétisées. Une voix a une entrée (`inp`) où l'on branche ses boucles
 * (bruit filtré, bourdonnements) et où `tick` programme ses coups (enclume, bêlement…). `tick` rend le délai avant le
 * prochain appel, en secondes. Les volumes sont donnés pour une force 1 ; le gain de la voix applique la force réelle.
 */
export interface Synth {
  ctx: AudioContext;
  noise: AudioBuffer;
}

interface VoiceDef {
  /** gain d'entrée : égalise les voix (mesuré hors temps réel, la fenêtre de 0,1 s la plus forte vers 0,04–0,06, comme une cascade proche) */
  gain: number;
  /** boucles posées à la création de la voix ; rend les sources à arrêter à sa fin */
  loop?(s: Synth, inp: AudioNode): AudioScheduledSourceNode[];
  tick?(s: Synth, inp: AudioNode, t: number): number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Note brève : attaque, puis décroissance exponentielle ; filtre facultatif */
function note(s: Synth, dest: AudioNode, t: number, o: { f: number; f2?: number; dur: number; vol: number; type?: OscillatorType; attack?: number; filter?: BiquadFilterType; ff?: number; q?: number; vib?: number; vibDepth?: number }) {
  const { ctx } = s;
  const osc = ctx.createOscillator(); osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  const g = ctx.createGain(), a = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  let last: AudioNode = osc;
  if (o.filter) {
    const f = ctx.createBiquadFilter(); f.type = o.filter; f.frequency.value = o.ff ?? 1000; f.Q.value = o.q ?? 1;
    osc.connect(f); last = f;
  }
  last.connect(g); g.connect(dest);
  osc.start(t); osc.stop(t + o.dur + 0.05);
  if (o.vib) {
    const l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.value = o.vib; lg.gain.value = o.vibDepth ?? o.f * 0.03;
    l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + o.dur + 0.05);
  }
}

/** Souffle de bruit filtré : attaque `attack`, puis décroissance */
function hiss(s: Synth, dest: AudioNode, t: number, dur: number, ff: number, vol: number, type: BiquadFilterType = 'lowpass', q = 0.8, attack = 0.003) {
  const { ctx } = s;
  const src = ctx.createBufferSource(); src.buffer = s.noise;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = ff; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(t, Math.random() * 2); src.stop(t + dur + 0.05);
}

/** Boucle de bruit filtré, son volume ondulant lentement (`lfo` Hz, `depth` 0 … 1) */
function noiseBed(s: Synth, dest: AudioNode, ff: number, vol: number, type: BiquadFilterType = 'lowpass', q = 0.7, lfo = 0, depth = 0): AudioScheduledSourceNode[] {
  const { ctx } = s;
  const src = ctx.createBufferSource(); src.buffer = s.noise; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = ff; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(0, Math.random() * 2);
  if (!lfo) return [src];
  const l = ctx.createOscillator(), lg = ctx.createGain();
  l.frequency.value = lfo; lg.gain.value = vol * depth;
  l.connect(lg); lg.connect(g.gain); l.start();
  return [src, l];
}

/** Bourdonnement : oscillateurs continus (fréquences, volumes), passe-bas commun */
function drone(s: Synth, dest: AudioNode, parts: [number, number, OscillatorType][], cutoff: number): AudioScheduledSourceNode[] {
  const { ctx } = s;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.connect(dest);
  return parts.map(([fr, v, type]) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = fr; o.detune.value = rnd(-8, 8);
    const g = ctx.createGain(); g.gain.value = v;
    o.connect(g); g.connect(f); o.start();
    return o;
  });
}

/** Coup sur l'enclume : partiels inharmoniques qui sonnent, et le claquement du marteau */
function anvil(s: Synth, d: AudioNode, t: number, v: number) {
  const f = rnd(1700, 1900);
  note(s, d, t, { f, dur: 0.5, vol: 0.12 * v, type: 'triangle', attack: 0.002 });
  note(s, d, t, { f: f * 2.76, dur: 0.3, vol: 0.05 * v, attack: 0.002 });
  note(s, d, t, { f: f * 5.4, dur: 0.12, vol: 0.025 * v, attack: 0.001 });
  hiss(s, d, t, 0.04, 6000, 0.12 * v);
}

/** Bêlement : voix chevrotante (tremblement rapide de la hauteur), timbre nasal */
function bleat(s: Synth, d: AudioNode, t: number) {
  const f = rnd(280, 420), dur = rnd(0.5, 0.85);
  note(s, d, t, { f, f2: f * 0.9, dur, vol: 0.12, type: 'sawtooth', attack: 0.04, filter: 'bandpass', ff: rnd(900, 1300), q: 2, vib: rnd(9, 12), vibDepth: f * 0.06 });
}

/** Caquètement : petits « cot » secs en rafale */
function cluck(s: Synth, d: AudioNode, t: number) {
  const n = 3 + Math.floor(Math.random() * 4), f = rnd(550, 750);
  for (let i = 0; i < n; i++) {
    const st = t + i * rnd(0.1, 0.16), ff = f * rnd(0.9, 1.1);
    note(s, d, st, { f: ff, f2: ff * 0.8, dur: 0.07, vol: 0.09, type: 'sawtooth', filter: 'bandpass', ff: 1400, q: 3 });
  }
  // de temps en temps, le long « codêêt » final
  if (Math.random() < 0.3) note(s, d, t + n * 0.14, { f: f * 1.3, f2: f * 0.9, dur: 0.35, vol: 0.08, type: 'sawtooth', attack: 0.02, filter: 'bandpass', ff: 1600, q: 3 });
}

/** Meuglement : grave, long, qui monte puis retombe */
function moo(s: Synth, d: AudioNode, t: number) {
  const f = rnd(95, 125), dur = rnd(1.2, 1.8);
  const { ctx } = s;
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(f * 0.85, t); o.frequency.linearRampToValueAtTime(f * 1.15, t + dur * 0.35); o.frequency.linearRampToValueAtTime(f * 0.8, t + dur);
  const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(350, t); fl.frequency.linearRampToValueAtTime(900, t + dur * 0.4); fl.frequency.linearRampToValueAtTime(400, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.2); g.gain.setValueAtTime(0.16, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(fl); fl.connect(g); g.connect(d);
  o.start(t); o.stop(t + dur + 0.05);
}

/** Hennissement : aigu tremblé qui dégringole ; ou un ébrouement */
function neigh(s: Synth, d: AudioNode, t: number) {
  if (Math.random() < 0.5) { hiss(s, d, t, 0.35, 900, 0.14, 'bandpass', 1.2, 0.02); return; }
  const f = rnd(700, 900);
  note(s, d, t, { f, f2: f * 0.45, dur: 1.1, vol: 0.08, type: 'sawtooth', attack: 0.03, filter: 'bandpass', ff: 1500, q: 1.5, vib: rnd(14, 18), vibDepth: f * 0.08 });
}

/** Syllabes d'une conversation : courtes, à des hauteurs de voix variées */
function chatter(s: Synth, d: AudioNode, t: number, n: number, vol: number) {
  for (let i = 0; i < n; i++) {
    const st = t + rnd(0, 0.5), f = Math.random() < 0.5 ? rnd(110, 160) : rnd(190, 260), ff = rnd(500, 1400);
    note(s, d, st, { f, f2: f * rnd(0.85, 1.15), dur: rnd(0.08, 0.18), vol, type: 'sawtooth', attack: 0.02, filter: 'bandpass', ff, q: 3 });
  }
}

/** Grincement du bois (moulin, cordages) : frottement rauque qui glisse */
function creak(s: Synth, d: AudioNode, t: number, f: number, vol: number) {
  note(s, d, t, { f, f2: f * rnd(1.15, 1.4), dur: rnd(0.4, 0.8), vol, type: 'sawtooth', attack: 0.08, filter: 'bandpass', ff: f * 4, q: 6, vib: 40, vibDepth: f * 0.05 });
}

export const VOICES: Record<SpotKind, VoiceDef> = {
  // Préhistoire : silex taillé, petits chocs secs
  flint: {
    gain: 2.5,
    tick(s, d, t) {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) { hiss(s, d, t + i * 0.18, 0.04, 4200, 0.18); note(s, d, t + i * 0.18, { f: rnd(1900, 2600), dur: 0.05, vol: 0.05, attack: 0.001 }); }
      return rnd(0.6, 1.6);
    },
  },
  // tour du potier qui ronronne, glissements de l'argile
  pottery: {
    gain: 2.5,
    loop: (s, d) => noiseBed(s, d, 240, 0.08, 'bandpass', 3, 1.2, 0.4),
    tick(s, d, t) { hiss(s, d, t, rnd(0.2, 0.4), 700, 0.08, 'bandpass', 1.5, 0.05); return rnd(1.2, 3); },
  },
  // forge : marteau sur l'enclume par séries, souffle du soufflet
  forge: {
    gain: 1.1,
    loop: (s, d) => noiseBed(s, d, 180, 0.05, 'lowpass', 0.7, 0.4, 0.8),
    tick(s, d, t) {
      const n = 2 + Math.floor(Math.random() * 4), gap = rnd(0.32, 0.45);
      for (let i = 0; i < n; i++) anvil(s, d, t + i * gap, i === n - 1 ? 1 : 0.75);
      if (Math.random() < 0.35) hiss(s, d, t + n * gap + 0.4, 1, 500, 0.12, 'lowpass', 0.7, 0.4);
      return n * gap + rnd(1.2, 2.6);
    },
  },
  // vapeur : halètement régulier de la machine, sourd grondement de l'atelier
  factory: {
    gain: 0.6,
    loop: (s, d) => [...noiseBed(s, d, 110, 0.12), ...drone(s, d, [[50, 0.05, 'sawtooth']], 200)],
    tick(s, d, t) {
      for (let i = 0; i < 4; i++) {
        hiss(s, d, t + i * 0.42, 0.22, 2400, 0.09, 'highpass', 0.6, 0.01);
        note(s, d, t + i * 0.42, { f: 70, f2: 45, dur: 0.18, vol: 0.12, attack: 0.004 });
      }
      return 1.68;
    },
  },
  // moulin : l'eau du bief, les ailes ou la roue qui grincent
  mill: {
    gain: 1.6,
    loop: (s, d) => noiseBed(s, d, 650, 0.05, 'lowpass', 0.8, 0.3, 0.3),
    tick(s, d, t) { creak(s, d, t, rnd(160, 230), 0.07); if (Math.random() < 0.4) hiss(s, d, t + 0.6, 0.12, 300, 0.12); return rnd(1.8, 3.5); },
  },
  // éolienne : souffle des pales qui passent
  wind: {
    gain: 1.6,
    loop: (s, d) => noiseBed(s, d, 180, 0.04),
    tick(s, d, t) { hiss(s, d, t, 1.1, 520, 0.12, 'bandpass', 0.8, 0.45); return 1.45; },
  },
  // hache : coups mats sur le bois
  axe: {
    gain: 0.75,
    tick(s, d, t) {
      hiss(s, d, t, 0.1, 1300, 0.3);
      note(s, d, t, { f: rnd(170, 220), f2: 120, dur: 0.12, vol: 0.14, type: 'triangle', attack: 0.002 });
      if (Math.random() < 0.08) hiss(s, d, t + 0.6, 1.4, 260, 0.3, 'lowpass', 0.7, 0.3); // un arbre tombe
      return rnd(0.9, 1.6);
    },
  },
  // scie : va-et-vient râpeux par séries
  saw: {
    gain: 4.5,
    tick(s, d, t) {
      const n = 4 + Math.floor(Math.random() * 5), f = rnd(1800, 2600);
      for (let i = 0; i < n; i++) hiss(s, d, t + i * 0.36, 0.3, f * (i % 2 ? 1 : 0.8), 0.14, 'bandpass', 2.5, 0.1);
      return n * 0.36 + rnd(1, 2.5);
    },
  },
  // carrière : burin sur la pierre, de temps en temps un éboulis
  quarry: {
    gain: 1.2,
    tick(s, d, t) {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) { note(s, d, t + i * 0.25, { f: rnd(2200, 2800), dur: 0.08, vol: 0.06, type: 'triangle', attack: 0.001 }); hiss(s, d, t + i * 0.25, 0.05, 3800, 0.14); }
      if (Math.random() < 0.15) hiss(s, d, t + n * 0.25 + 0.3, 1.2, 600, 0.18, 'lowpass', 0.7, 0.05);
      return n * 0.25 + rnd(0.6, 1.8);
    },
  },
  // mine : coups de pioche qui résonnent dans la galerie
  mine: {
    gain: 1.8,
    tick(s, d, t) {
      hiss(s, d, t, 0.07, 3000, 0.2);
      note(s, d, t, { f: rnd(800, 1000), dur: 0.1, vol: 0.06, type: 'triangle', attack: 0.002 });
      hiss(s, d, t + 0.18, 0.12, 1500, 0.05); // l'écho
      return rnd(0.7, 1.4);
    },
  },
  sheep: { gain: 2.4, tick(s, d, t) { bleat(s, d, t); if (Math.random() < 0.3) bleat(s, d, t + rnd(0.6, 1.2)); return rnd(2.5, 7); } },
  hens: { gain: 4.5, tick(s, d, t) { cluck(s, d, t); return rnd(1.5, 4.5); } },
  cows: { gain: 0.55, tick(s, d, t) { moo(s, d, t); return rnd(5, 11); } },
  horses: { gain: 2.5, tick(s, d, t) { neigh(s, d, t); return rnd(4, 10); } },
  // abeilles : bourdonnement qui ondule
  bees: {
    gain: 0.8,
    loop(s, d) {
      const parts = drone(s, d, [[218, 0.03, 'sawtooth'], [231, 0.025, 'sawtooth'], [440, 0.01, 'sawtooth']], 900);
      return parts;
    },
  },
  // foule : rumeur, conversations, et l'appel d'un marchand
  crowd: {
    gain: 3,
    loop: (s, d) => [...noiseBed(s, d, 480, 0.05, 'bandpass', 1, 0.7, 0.3), ...noiseBed(s, d, 1300, 0.025, 'bandpass', 1.5, 1.1, 0.4)],
    tick(s, d, t) {
      chatter(s, d, t, 4, 0.04);
      if (Math.random() < 0.12) {
        const f = rnd(200, 280);
        note(s, d, t + 0.2, { f, f2: f * 1.25, dur: 0.35, vol: 0.07, type: 'sawtooth', attack: 0.03, filter: 'bandpass', ff: 1000, q: 4 });
        note(s, d, t + 0.6, { f: f * 1.25, f2: f * 0.95, dur: 0.5, vol: 0.07, type: 'sawtooth', attack: 0.03, filter: 'bandpass', ff: 900, q: 4 });
      }
      return 0.5;
    },
  },
  // taverne : conversations, rires, chopes qui trinquent
  tavern: {
    gain: 3,
    loop: (s, d) => noiseBed(s, d, 520, 0.04, 'bandpass', 1, 0.5, 0.3),
    tick(s, d, t) {
      chatter(s, d, t, 3, 0.04);
      const r = Math.random();
      if (r < 0.1) { const f = rnd(230, 300); for (let i = 0; i < 5; i++) note(s, d, t + i * 0.11, { f: f * (1 - i * 0.04), dur: 0.08, vol: 0.06, type: 'sawtooth', attack: 0.01, filter: 'bandpass', ff: 1100, q: 3 }); }
      else if (r < 0.18) { note(s, d, t + 0.1, { f: 3200, dur: 0.18, vol: 0.04, attack: 0.001 }); note(s, d, t + 0.1, { f: 4700, dur: 0.1, vol: 0.025, attack: 0.001 }); }
      return 0.5;
    },
  },
  // port : clapot contre les quais, cordages qui grincent, cloche de temps en temps
  harbor: {
    gain: 1,
    loop: (s, d) => noiseBed(s, d, 420, 0.07, 'lowpass', 0.8, 0.25, 0.6),
    tick(s, d, t) {
      if (Math.random() < 0.15) { note(s, d, t, { f: 880, dur: 2.2, vol: 0.06, attack: 0.002 }); note(s, d, t, { f: 880 * 2.4, dur: 1.2, vol: 0.025, attack: 0.002 }); }
      else creak(s, d, t, rnd(260, 360), 0.05);
      return rnd(2.5, 5);
    },
  },
  // machines de l'âge futuriste : bourdonnement électrique, ventilation et pulsations sourdes (plus de bips aigus : agaçants)
  machine: {
    gain: 0.5,
    loop: (s, d) => [...drone(s, d, [[55, 0.06, 'sine'], [110, 0.035, 'sine'], [165, 0.02, 'triangle']], 600), ...noiseBed(s, d, 3500, 0.012, 'highpass', 0.7)],
    tick(s, d, t) {
      note(s, d, t, { f: 90, f2: 55, dur: 0.9, vol: 0.1, attack: 0.15 });
      return rnd(2.5, 5);
    },
  },
  // volcan : grondement sourd qui enfle et retombe, bulles de lave
  volcano: {
    gain: 0.35,
    loop: (s, d) => noiseBed(s, d, 75, 0.35, 'lowpass', 0.7, 0.13, 0.5),
    tick(s, d, t) {
      note(s, d, t, { f: rnd(70, 100), f2: rnd(150, 200), dur: 0.16, vol: 0.12, attack: 0.01 });
      hiss(s, d, t + 0.05, 0.12, 380, 0.1);
      return rnd(0.5, 2);
    },
  },
};
