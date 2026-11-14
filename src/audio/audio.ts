import { clamp } from '../core/rng';
import type { SpotKind, SpotVoice } from './spots';
import { VOICES, CALLS } from './voices';

export interface AudioState {
  age: number;
  season: number;
  daylight: number;
  rain: number;
  snow: number;
  fog: number;
  pop: number;
  camDist: number;
  /** 1 sous terre ou aux Enfers : ni oiseaux ni grillons, grondement sourd */
  under: number;
  /** aux Enfers : pas de gouttes d'eau (ces petits « bip-bup » n'ont leur place que dans les grottes) */
  hell?: boolean;
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
/**
 * Vrais enregistrements de cris (espèce de la faune → fichier de `public/sons/animaux`, sans extension). Sources et
 * licences : `docs/audio.md` et la page Crédits. Le cerf et l'élan partagent le brame du wapiti
 */
const SAMPLES: Record<string, { file: string; rate?: number; max?: number }> = {
  sheep: { file: 'mouton' }, cow: { file: 'vache' }, horse: { file: 'cheval' }, deer: { file: 'cerf' }, moose: { file: 'cerf', rate: 0.85 },
  // le caquètement dure 9 s : on en joue un passage
  hen: { file: 'poule', max: 3.5 },
  // pas de chèvre libre et légère : le bouquetin reprend le bêlement du mouton, plus aigu
  ibex: { file: 'mouton', rate: 1.3 },
};
/** niveau de crête des enregistrements, proche des cris de synthèse */
const SAMPLE_PEAK = 0.16;

/** Ambiances musicales hors des âges : le menu principal, les Enfers, la fin (chute du roi, voyage des colons, victoire) */
export type MusicScene = 'menu' | 'hell' | 'end';
/**
 * Musique enregistrée, en attendant celle composée pour le jeu : fichiers de `public/sons/musique/` (sans extension),
 * une liste par âge (`age0` … `age5`) et par scène. Sources et licences : `docs/audio.md` et la page Crédits. Une liste
 * vide ou des fichiers absents rendent la musique générée ; `RECORDED_MUSIC = false` la rend partout
 */
export const MUSIC: Record<string, string[]> = {
  age0: ['prehistoire-tribal', 'prehistoire-ancetres', 'prehistoire-oiseau-tonnerre'],
  age1: ['antiquite-temple', 'antiquite-harpe', 'antiquite-luth', 'antiquite-cuivres'],
  age2: ['medieval-exploration', 'medieval-auberge', 'medieval-conteur'],
  age3: ['industriel-gymnopedie', 'industriel-morialta', 'industriel-gymnopedie-3', 'industriel-valse-givre', 'industriel-adieux'],
  age4: ['moderne-the', 'moderne-fleuriste', 'moderne-barman', 'moderne-cafe-chats'],
  age5: ['futuriste-synthwave', 'futuriste-aout', 'futuriste-lifewave'],
  menu: ['menu'], hell: ['enfers-oppression', 'enfers-com-mecha', 'enfers-croisade', 'enfers-rituel'], end: ['fin'],
};
const RECORDED_MUSIC = true;
/** durée du fondu enchaîné entre deux morceaux (s) */
const MUSIC_FADE = 4;
/**
 * niveau des morceaux sur le bus de la musique (les fichiers sont tous à −20 LUFS, voir `docs/audio.md`) : un peu au-dessus
 * de la musique générée en valeur efficace (0,014 contre 0,011 au volume par défaut), un son continu contre des notes éparses
 */
const TRACK_GAIN = 0.55;

/** Réglages du son enregistrés (`Settings`), tels que les lit le moteur */
export interface SoundSettings { musicVol?: number; sfxVol?: number; ambVol?: number; music?: boolean; sfx?: boolean; musicChosen?: boolean; sfxChosen?: boolean }
/**
 * Les réglages enregistrés, en valeurs du moteur. Musique et sons sont allumés sauf si le joueur les a lui-même coupés :
 * `music` et `sfx` ne comptent qu'avec `musicChosen` / `sfxChosen` (les anciennes sauvegardes notaient `false` sans choix)
 */
export function soundSettings(s: SoundSettings) {
  return {
    musicVol: s.musicVol ?? 0.5, sfxVol: s.sfxVol ?? 0.7, ambVol: s.ambVol ?? 0.7,
    muteMusic: s.musicChosen === true && s.music !== true, musicChosen: s.musicChosen === true,
    muteSfx: s.sfxChosen === true && s.sfx !== true, sfxChosen: s.sfxChosen === true,
  };
}

/** Un morceau en cours : l'élément audio (lu en flux, sans tout décoder), son nœud et son gain de fondu */
interface Track { key: string; name: string; el: HTMLAudioElement; src: MediaElementAudioSourceNode; g: GainNode; next: boolean; dropped: boolean }

export class AudioEngine {
  ctx: AudioContext | null = null;
  musicVol = 0.5;
  sfxVol = 0.7;
  /** volume des ambiances : nature (eau, pluie, oiseaux…) et bruitages de proximité (forge, bêtes, foule…) */
  ambVol = 0.7;
  /** musique, sons et ambiances allumés par défaut ; tout démarre au premier geste du joueur (`start`) */
  muteMusic = false;
  muteSfx = false;
  /** le joueur a lui-même allumé ou coupé la musique, les sons (sinon on suit le défaut) */
  musicChosen = false;
  sfxChosen = false;
  private master!: GainNode;
  private musicG!: GainNode;
  private sfxG!: GainNode;
  private ambG!: GainNode;
  private surfG!: GainNode;
  /** voix des bruitages de proximité, une par sorte de source */
  private voices = new Map<SpotKind, { out: GainNode; pan: StereoPannerNode; inp: GainNode; srcs: AudioScheduledSourceNode[]; next: number; k: number; end: number }>();
  private rainG!: GainNode;
  private waterG!: GainNode;
  private villageG!: GainNode;
  private caveG!: GainNode;
  private streamG!: GainNode;
  private cascadeG!: GainNode;
  private surfLfo!: GainNode;
  private gullTimer = 4;
  private eagleTimer = 10;
  private crackleTimer = 0;
  private dripTimer = 0;
  /** prochaine stridulation de grillon (les grillons chantent par courtes trilles espacées, plus en continu) */
  private cricketTimer = 0;
  private noise!: AudioBuffer;
  private nextNote = 0;
  private nextPad = 0;
  private lastDegree = 2;
  private birdTimer = 0;
  private frogTimer = 2;
  /** vrais cris d'animaux chargés : tampon, début et durée utiles (s), gain qui ramène le pic à `SAMPLE_PEAK` */
  private samples = new Map<string, { buf: AudioBuffer; from: number; len: number; gain: number }>();
  /** musique enregistrée : la scène imposée (sinon celle de l'âge), le morceau en cours, les fichiers introuvables */
  private scene: MusicScene | null = null;
  private ageKey = 'age0';
  private track: Track | null = null;
  private missing = new Set<string>();
  /** dernier morceau joué par liste : le suivant en diffère */
  private lastTrack = new Map<string, string>();

  /**
   * Démarre le son au premier geste du joueur (le navigateur n'autorise rien avant) : écouté en capture, pour qu'une
   * fenêtre qui arrête la propagation (bulle du tutoriel) ne l'empêche pas, et sur plusieurs gestes (au toucher, seul le
   * lever du doigt compte). Les écouteurs se retirent quand le contexte tourne et que la musique, s'il y en a, joue
   */
  unlockOn(target: Window) {
    const kinds = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const;
    const wake = () => {
      this.start(); this.applyVolumes();
      if (this.ctx?.state === 'running' && !this.track?.el.paused) for (const k of kinds) target.removeEventListener(k, wake, true);
    };
    for (const k of kinds) target.addEventListener(k, wake, true);
  }

  /** À appeler depuis un geste utilisateur */
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume();
      // une lecture refusée faute de geste reprend au suivant
      if (this.track?.el.paused && !document.hidden) this.track.el.play().catch(() => { /* toujours refusée */ });
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(ctx.destination);
    this.musicG = ctx.createGain(); this.musicG.connect(this.master);
    this.sfxG = ctx.createGain(); this.sfxG.connect(this.master);
    this.ambG = ctx.createGain(); this.ambG.connect(this.master);
    this.loadSamples(ctx);
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
      src.connect(f); f.connect(g); g.connect(this.ambG); src.start();
      return { g, f };
    };
    // pas de vent : son souffle continu couvrait les autres ambiances
    const rain = noiseLoop('highpass', 1800, 0.4); this.rainG = rain.g;
    const water = noiseLoop('lowpass', 520, 0.8); this.waterG = water.g;
    const wl = ctx.createOscillator(); wl.frequency.value = 0.3;
    const wlg = ctx.createGain(); wlg.gain.value = 0.012; wl.connect(wlg); wlg.connect(water.g.gain); wl.start();
    const vil = noiseLoop('bandpass', 700, 1.2); this.villageG = vil.g;
    const cave = noiseLoop('lowpass', 150, 0.9); this.caveG = cave.g;
    // eau vive : murmure clair des torrents, grondement grave des cascades
    const stream = noiseLoop('bandpass', 1300, 0.5); this.streamG = stream.g;
    const casc = noiseLoop('lowpass', 320, 0.7); this.cascadeG = casc.g;
    // ressac : houle lente de la mer près du rivage
    const surf = noiseLoop('lowpass', 480, 0.6); this.surfG = surf.g;
    const sl = ctx.createOscillator(); sl.frequency.value = 0.11;
    const slg = ctx.createGain(); slg.gain.value = 0; sl.connect(slg); slg.connect(surf.g.gain); sl.start();
    this.surfLfo = slg;
    this.applyVolumes();
    this.nextNote = ctx.currentTime + 1;
    this.nextPad = ctx.currentTime + 0.5;
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.musicG.gain.setTargetAtTime(this.muteMusic ? 0 : this.musicVol * 0.55, this.ctx.currentTime, 0.1);
    this.sfxG.gain.setTargetAtTime(this.muteSfx ? 0 : this.sfxVol, this.ctx.currentTime, 0.1);
    this.ambG.gain.setTargetAtTime(this.muteSfx ? 0 : this.ambVol, this.ctx.currentTime, 0.1);
    this.syncMusic();
  }

  /** La scène musicale (menu, Enfers, fin) ; null : la musique de l'âge */
  music(scene: MusicScene | null) {
    if (scene === this.scene) return;
    this.scene = scene;
    this.syncMusic();
  }

  /** La liste voulue (rien si la musique est coupée : aucun fichier n'est chargé) ; on change de morceau si elle change */
  private syncMusic() {
    if (!this.ctx) return;
    const want = this.muteMusic || !RECORDED_MUSIC ? null : this.scene ?? this.ageKey;
    if (this.track?.key === want) return;
    this.fadeOut(this.track);
    this.track = null;
    if (want) this.playTrack(want);
  }

  /**
   * Lance un morceau de la liste `key`, autre que le précédent si possible : il entre en fondu dès qu'il joue, et
   * quelques secondes avant sa fin le suivant prend le relais. Un fichier illisible est écarté ; une liste sans fichier
   * laisse la musique générée
   */
  private playTrack(key: string) {
    const ctx = this.ctx!, list = (MUSIC[key] ?? []).filter((n) => !this.missing.has(n));
    if (!list.length) { this.track = null; return; }
    const prev = this.lastTrack.get(key), pool = list.length > 1 ? list.filter((n) => n !== prev) : list;
    const name = pool[Math.floor(Math.random() * pool.length)];
    this.lastTrack.set(key, name);
    const el = new Audio();
    el.preload = 'auto';
    el.src = `${import.meta.env.BASE_URL}sons/musique/${name}.mp3`;
    const src = ctx.createMediaElementSource(el), g = ctx.createGain();
    g.gain.value = 0.0001;
    src.connect(g); g.connect(this.musicG);
    const t: Track = { key, name, el, src, g, next: false, dropped: false };
    this.track = t;
    el.addEventListener('playing', () => { if (this.track === t) g.gain.setTargetAtTime(TRACK_GAIN, ctx.currentTime, MUSIC_FADE / 4); });
    const relay = () => {
      if (this.track !== t || t.next) return;
      t.next = true;
      this.fadeOut(t);
      this.playTrack(key);
    };
    el.addEventListener('timeupdate', () => { if (el.duration - el.currentTime < MUSIC_FADE) relay(); });
    el.addEventListener('ended', relay);
    el.addEventListener('error', () => {
      if (t.dropped) return;
      this.missing.add(name);
      if (this.track === t) { this.drop(t); this.track = null; this.playTrack(key); }
    });
    el.play().catch(() => { /* lecture refusée sans geste : on réessaie au prochain réglage */ });
  }

  private fadeOut(t: Track | null) {
    if (!t || !this.ctx) return;
    t.g.gain.cancelScheduledValues(this.ctx.currentTime);
    t.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, MUSIC_FADE / 4);
    setTimeout(() => this.drop(t), MUSIC_FADE * 1000 + 300);
  }

  private drop(t: Track) {
    if (t.dropped) return;
    t.dropped = true;
    t.el.pause();
    t.el.removeAttribute('src');
    t.el.load();
    t.src.disconnect(); t.g.disconnect();
  }

  /** Le morceau en cours (pour vérifier sans écouter : `__game.audio.debugMusic()`) */
  debugMusic() {
    const t = this.track;
    return { scene: this.scene, age: this.ageKey, track: t?.name ?? null, time: t ? +t.el.currentTime.toFixed(1) : 0, gain: t ? +t.g.gain.value.toFixed(3) : 0, missing: [...this.missing] };
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
    // altitude (aigles en montagne)
    const high = clamp(((s.alt ?? 0) - 4) / 7, 0, 1);
    // ambiances continues gardées discrètes : elles ne doivent pas couvrir le jeu
    set(this.streamG, 0.04 * (s.stream ?? 0) * out);
    set(this.cascadeG, 0.065 * (s.cascade ?? 0) * out);
    // ressac : le niveau moyen et la houle (l'oscillateur ajoute ± autant au gain)
    const surf = 0.035 * (s.coast ?? 0) * out;
    set(this.surfG, surf); this.surfLfo.gain.setTargetAtTime(surf * 0.8, T, 0.4);
    set(this.rainG, 0.045 * s.rain * out);
    this.waterG.gain.setTargetAtTime(0.012 * clamp(1.4 - s.camDist / 130, 0.2, 1) * out, T, 0.5);
    set(this.villageG, Math.min(0.018, s.pop * 0.00025) * s.daylight * (1 - s.rain * 0.6) * out);
    set(this.caveG, 0.04 * s.under);
    this.tickVoices(T);
    // grillons la nuit : une courte trille douce de temps en temps, d'un grillon puis d'un autre (hauteur et place variées)
    this.cricketTimer -= dt;
    // les bêtes ne s'entendent que la vue proche du sol : pleines sous 15 de distance, muettes au-delà de 40
    const near = clamp(1.6 - s.camDist / 25, 0, 1);
    const crick = night * (s.season === 3 ? 0 : 1) * (1 - s.rain) * out * near;
    if (this.cricketTimer <= 0) {
      this.cricketTimer = 1.2 + Math.random() * 3.5;
      if (crick > 0.3) {
        const f = 3600 + Math.random() * 700, n = 2 + Math.floor(Math.random() * 3), vol = 0.004 * crick;
        for (let i = 0; i < n; i++) this.tone(f, T + 0.02 + i * 0.09, 0.05, 'sine', vol, this.ambG, 0, 0.012);
      }
    }
    // gouttes qui tombent de la voûte, en écho
    this.dripTimer -= dt;
    if (s.under > 0.5 && !s.hell && this.dripTimer <= 0) {
      this.dripTimer = 0.4 + Math.random() * 2.2;
      const f = 1400 + Math.random() * 1600;
      this.tone(f, T + 0.02, 0.18, 'sine', 0.05, this.sfxG, 0, 0.002);
      this.tone(f * 0.7, T + 0.2, 0.3, 'sine', 0.015, this.sfxG, 0, 0.004);
    }
    // mouettes près du rivage, aigles en montagne, crépitement des feux
    this.gullTimer -= dt;
    if (this.gullTimer <= 0) {
      this.gullTimer = 8 + Math.random() * 12;
      if ((s.coast ?? 0) > 0.3 && near > 0.2 && s.daylight > 0.4 && s.rain < 0.5 && out > 0.5) this.gull(T + 0.05, s.coast! * near);
    }
    this.eagleTimer -= dt;
    if (this.eagleTimer <= 0) {
      this.eagleTimer = 8 + Math.random() * 12;
      if (high > 0.2 && near > 0.2 && s.daylight > 0.5 && s.rain < 0.4 && out > 0.5) this.eagle(T + 0.05, high * near);
    }
    this.crackleTimer -= dt;
    if ((s.fire ?? 0) > 0.05 && this.crackleTimer <= 0 && out > 0.5) {
      this.crackleTimer = (0.04 + Math.random() * 0.25) / s.fire!;
      this.burst(T + 0.01, 0.025 + Math.random() * 0.03, 2500 + Math.random() * 3000, 0.12 * s.fire! * (0.4 + Math.random()));
    }
    // grenouilles : un concert au crépuscule et la nuit, plus fourni après la pluie
    this.frogTimer -= dt;
    if (this.frogTimer <= 0) {
      const k = (s.frogs ?? 0) * (0.25 + 0.75 * night) * (1 + s.rain) * out * near;
      this.frogTimer = k > 0.05 ? (0.4 + Math.random() * 1.8) / Math.min(1.5, k + 0.3) : 2;
      if (k > 0.05 && s.season !== 3) this.croak(T + 0.02, Math.min(1, k));
    }
    // oiseaux
    this.birdTimer -= dt;
    if (this.birdTimer <= 0 && near > 0.3 && s.daylight > 0.5 && s.rain < 0.3 && s.season !== 3 && s.under < 0.5) {
      this.birdTimer = 4 + Math.random() * 7;
      this.chirp(T + 0.05, near);
    } else if (this.birdTimer <= 0) this.birdTimer = 2;

    // musique : l'enregistrement de l'âge (ou de la scène) s'il y en a un, sinon la musique générée
    const ageKey = `age${Math.min(s.age, 5)}`;
    if (ageKey !== this.ageKey) { this.ageKey = ageKey; this.syncMusic(); }
    if (this.track) { this.nextNote = this.nextPad = T + 0.5; return; }
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

  /**
   * Bruitages de proximité (voir `spots.ts`) : les voix retenues, avec leur panoramique (−1 gauche … 1 droite). Une voix
   * nouvelle naît en fondu ; une voix absente de la liste s'éteint en fondu, puis ses nœuds sont libérés. Les coups de
   * chaque voix ne se programment que si elle s'entend
   */
  spots(list: SpotVoice[], pans: number[]) {
    const ctx = this.ctx;
    if (!ctx) return;
    const T = ctx.currentTime, seen = new Set<SpotKind>();
    list.forEach((sv, i) => {
      seen.add(sv.kind);
      let v = this.voices.get(sv.kind);
      if (!v) {
        const out = ctx.createGain(); out.gain.value = 0;
        const pan = ctx.createStereoPanner(); pan.pan.value = pans[i] ?? 0;
        const inp = ctx.createGain(); inp.gain.value = VOICES[sv.kind].gain;
        inp.connect(out); out.connect(pan); pan.connect(this.ambG);
        const srcs = VOICES[sv.kind].loop?.({ ctx, noise: this.noise }, inp) ?? [];
        v = { out, pan, inp, srcs, next: T + Math.random() * 0.8, k: 0, end: 0 };
        this.voices.set(sv.kind, v);
      }
      v.k = sv.k; v.end = 0;
      v.out.gain.setTargetAtTime(sv.k, T, 0.25);
      v.pan.pan.setTargetAtTime(pans[i] ?? 0, T, 0.25);
    });
    for (const [kind, v] of this.voices) {
      if (seen.has(kind)) continue;
      if (!v.end) { v.end = T + 1.6; v.k = 0; v.out.gain.setTargetAtTime(0, T, 0.25); }
      else if (T >= v.end) {
        for (const s of v.srcs) { try { s.stop(); } catch { /* déjà arrêtée */ } }
        v.pan.disconnect();
        this.voices.delete(kind);
      }
    }
  }

  /** Programme les coups des voix audibles (appelé chaque image) */
  private tickVoices(T: number) {
    for (const [kind, v] of this.voices) {
      const tick = VOICES[kind].tick;
      if (!tick || v.k < 0.02 || T < v.next) continue;
      v.next = Math.max(T, v.next) + tick({ ctx: this.ctx!, noise: this.noise }, v.inp, Math.max(T, v.next) + 0.02);
    }
  }

  /** Voix des bruitages en cours (pour vérifier sans écouter : `__game.audio.debugSpots()`) */
  debugSpots() {
    return [...this.voices].map(([kind, v]) => ({ kind, k: +v.k.toFixed(3), gain: +v.out.gain.value.toFixed(3), pan: +v.pan.pan.value.toFixed(2), fading: !!v.end }));
  }

  /** Onglet caché : tout se tait ; il reprend au retour */
  pause(hidden: boolean) {
    if (!this.ctx) return;
    if (hidden) { this.ctx.suspend(); this.track?.el.pause(); }
    else { this.ctx.resume(); this.track?.el.play().catch(() => { /* reprise refusée */ }); }
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
      o.connect(flt); flt.connect(g); g.connect(this.ambG);
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
    o.connect(g); g.connect(this.ambG);
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
      o.connect(f); f.connect(vca); vca.connect(g); g.connect(this.ambG);
      o.start(t0); am.start(t0); o.stop(t0 + dur + 0.05); am.stop(t0 + dur + 0.05);
    }
  }

  private chirp(t: number, k = 1) {
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
      g.gain.linearRampToValueAtTime(0.022 * k, st + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.09);
      o.connect(g); g.connect(this.ambG);
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
    k *= 0.55; // tonnerre plus lointain, moins agressif
    if (k > 0.4) this.burst(t, 0.35, 2200, 0.35 * k);
    this.burst(t + 0.05, 2.8, 180, 0.9 * k);
    this.burst(t + 0.6 + Math.random() * 0.5, 2.2, 120, 0.6 * k);
    this.tone(38, t, 2.4, 'sine', 0.3 * k, this.sfxG, 0, 0.05);
  }
  /**
   * Cri d'un animal sauvage, au volume des ambiances, atténué selon la distance (k 0 … 1) : le vrai enregistrement
   * (`SAMPLES`) s'il est chargé, joué un peu plus haut ou plus bas à chaque fois ; sinon le cri de synthèse (`CALLS`)
   */
  sfxCall(kind: string, k: number) {
    if (!this.ctx || k <= 0) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.02, def = SAMPLES[kind], smp = def && this.samples.get(def.file);
    const g = ctx.createGain(); g.connect(this.ambG);
    if (def && smp) {
      const src = ctx.createBufferSource(); src.buffer = smp.buf;
      const rate = (def.rate ?? 1) * (0.93 + Math.random() * 0.14);
      src.playbackRate.value = rate;
      // un enregistrement long : un passage tiré au hasard, avec un fondu d'entrée et de sortie
      const len = Math.min(smp.len, def.max ?? smp.len), from = smp.from + Math.random() * (smp.len - len), dur = len / rate, v = k * smp.gain;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + (len < smp.len ? 0.08 : 0.005));
      g.gain.setValueAtTime(v, t + dur * 0.8);
      g.gain.linearRampToValueAtTime(len < smp.len ? 0.0001 : v * 0.8, t + dur);
      src.connect(g); src.start(t, from, len);
      src.onended = () => g.disconnect();
      return;
    }
    const call = CALLS[kind];
    if (!call) { g.disconnect(); return; }
    g.gain.value = k;
    call({ ctx, noise: this.noise }, g, t);
    setTimeout(() => g.disconnect(), 4000);
  }

  /**
   * Charge les vrais cris d'animaux (`public/sons/animaux`) une fois le son démarré. Chacun est rogné de ses silences
   * et ramené au même niveau ; un fichier absent ou illisible laisse le cri de synthèse
   */
  private loadSamples(ctx: AudioContext) {
    for (const name of new Set(Object.values(SAMPLES).map((d) => d.file))) {
      fetch(`${import.meta.env.BASE_URL}sons/animaux/${name}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
        .then((a) => ctx.decodeAudioData(a))
        .then((buf) => {
          const d = buf.getChannelData(0);
          let peak = 0;
          for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
          if (peak < 1e-4) return;
          let a = 0, b = d.length - 1;
          while (a < b && Math.abs(d[a]) < peak * 0.03) a++;
          while (b > a && Math.abs(d[b]) < peak * 0.03) b--;
          const from = Math.max(0, a / buf.sampleRate - 0.02), to = Math.min(buf.duration, b / buf.sampleRate + 0.08);
          this.samples.set(name, { buf, from, len: to - from, gain: SAMPLE_PEAK / peak });
        })
        .catch(() => { /* pas de fichier : le cri de synthèse reste */ });
    }
  }

  /**
   * Hurlement d'une meute (force 0 … 1) : chaque voix monte, tient en vibrant, puis retombe en glissant ; les voix
   * entrent l'une après l'autre, à des hauteurs différentes
   */
  sfxHowl(k: number) {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.02;
    // écho de la vallée : le hurlement porte loin
    const echo = ctx.createDelay(1); echo.delayTime.value = 0.31;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    const dark = ctx.createBiquadFilter(); dark.type = 'lowpass'; dark.frequency.value = 900;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    echo.connect(dark); dark.connect(fb); fb.connect(echo); dark.connect(wet); wet.connect(this.sfxG);
    // le chef d'abord, long ; puis un ou deux autres qui entrent décalés, sur une autre note (pas d'accord : chacun sa hauteur)
    const n = 2 + (Math.random() < 0.5 ? 1 : 0);
    let end = t0;
    for (let v = 0; v < n; v++) {
      const t = t0 + (v === 0 ? 0 : 0.9 + v * (0.5 + Math.random() * 0.7));
      const f0 = (v === 0 ? 300 : 340 + Math.random() * 130) * (0.95 + Math.random() * 0.1);
      const dur = (v === 0 ? 3.4 : 2.4) + Math.random() * 0.9;
      const peak = f0 * (1.35 + Math.random() * 0.15);
      end = Math.max(end, t + dur);
      // contour : départ grave et sourd, montée glissée, longue tenue qui ondule à peine, puis chute en fin de souffle
      const freq = (p: AudioParam) => {
        p.setValueAtTime(f0 * 0.72, t);
        p.linearRampToValueAtTime(peak, t + 0.55 + Math.random() * 0.3);
        p.linearRampToValueAtTime(peak * (0.97 + Math.random() * 0.06), t + dur * 0.55);
        p.linearRampToValueAtTime(peak * 0.94, t + dur * 0.8);
        p.exponentialRampToValueAtTime(f0 * 0.62, t + dur);
      };
      // voix : dents de scie (harmoniques de la gorge) passées dans un « ou » (deux formants), plus un sinus pour le corps
      const saw = ctx.createOscillator(); saw.type = 'sawtooth'; freq(saw.frequency);
      const sine = ctx.createOscillator(); sine.type = 'sine'; freq(sine.frequency);
      const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 520; f1.Q.value = 2.2;
      const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 900; f2.Q.value = 3;
      const sawG = ctx.createGain(); sawG.gain.value = 0.55;
      const sineG = ctx.createGain(); sineG.gain.value = 0.5;
      saw.connect(f1); saw.connect(f2); f1.connect(sawG); f2.connect(sawG); sine.connect(sineG);
      // ondulation lente et légère (pas le vibrato rapide d'une sirène)
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 0.7 + Math.random() * 0.8; lg.gain.value = f0 * 0.012;
      lfo.connect(lg); lg.connect(saw.frequency); lg.connect(sine.frequency);
      // souffle : un peu de bruit autour de la note
      const br = ctx.createBufferSource(); br.buffer = this.noise; br.loop = true;
      const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 700; bf.Q.value = 1.2;
      const bg = ctx.createGain(); bg.gain.value = 0.05;
      br.connect(bf); bf.connect(bg);
      // enveloppe : entrée douce, gonfle un peu, s'éteint en traînant
      const g = ctx.createGain(), vol = (v === 0 ? 0.075 : 0.05) * k;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol * 0.7, t + 0.35);
      g.gain.linearRampToValueAtTime(vol, t + dur * 0.5);
      g.gain.linearRampToValueAtTime(vol * 0.75, t + dur * 0.82);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const soft = ctx.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 1500;
      sawG.connect(soft); sineG.connect(soft); bg.connect(soft); soft.connect(g);
      g.connect(this.sfxG); g.connect(echo);
      for (const o of [saw, sine, lfo]) { o.start(t); o.stop(t + dur + 0.05); }
      br.start(t, Math.random() * 1.5); br.stop(t + dur + 0.05);
    }
    // l'écho se tait après le dernier hurlement
    setTimeout(() => { try { fb.disconnect(); wet.disconnect(); } catch { /* déjà coupé */ } }, (end - ctx.currentTime + 3) * 1000);
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
  /** Cri du roi des Enfers : un rugissement grave et rauque qui monte puis retombe, sous un souffle (force 0 … 1) */
  sfxRoar(k = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [f0, v] of [[70, 0.22], [104, 0.14], [158, 0.07]] as const) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0 * 0.8, t); o.frequency.linearRampToValueAtTime(f0 * 1.25, t + 0.35); o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 1.6);
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 24; lg.gain.value = f0 * 0.08; lfo.connect(lg); lg.connect(o.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * k, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
      o.connect(f); f.connect(g); g.connect(this.sfxG);
      o.start(t); lfo.start(t); o.stop(t + 1.8); lfo.stop(t + 1.8);
    }
    this.burst(t, 1.4, 400, 0.35 * k);
  }
  /** Tambour de guerre (le combat du roi) : un coup grave, `accent` plus fort sur le premier temps */
  sfxWarDrum(accent = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(accent ? 90 : 120, t); o.frequency.exponentialRampToValueAtTime(accent ? 42 : 60, t + 0.3);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(accent ? 0.42 : 0.24, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g); g.connect(this.musicG);
    o.start(t); o.stop(t + 0.5);
    this.burst(t, 0.06, 900, accent ? 0.14 : 0.07);
  }
  /** Le portail s'éteint dans une explosion de lumière dorée : un souffle qui monte, un accord clair qui scintille */
  sfxGoldBurst() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.burst(t, 1.6, 2600, 0.3);
    this.tone(55, t, 1.4, 'sine', 0.3, this.sfxG, 0, 0.02);
    [0, 4, 7, 11, 14, 19, 24].forEach((iv, i) => this.tone(mtof(67 + iv), t + 0.15 + i * 0.07, 2.4, 'triangle', 0.12, this.sfxG, 4000, 0.01));
  }
  sfxAgeUp() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 12, 16, 19].forEach((iv, i) => this.tone(mtof(60 + iv), t + i * 0.12, 1.6, 'triangle', 0.25, this.sfxG, 3000, 0.01));
  }
}
