import './style.css';
import * as THREE from 'three';
import { World, N, VEG_CAVE, VEG_FISSURE, VEG_VOLCANO, setMapSize } from './world/world';
import { Underground, UZ_NAMES } from './world/underground';
import type { UnderView } from './render/underView';
/** Le monde souterrain (décor, créatures) est chargé à part, en arrière-plan après le démarrage */
let underModule: Promise<typeof import('./render/underView')> | null = null;
const loadUnder = () => (underModule ??= import('./render/underView'));
import { newWorld, addDefaultDecor, MAPS } from './world/mapgen';
import { TerrainView } from './render/terrainView';
import { BuildingView } from './render/buildings';
import { RoadView } from './render/roads';
import { VegView, syncChunks } from './render/vegetation';
import { Environment } from './render/env';
import { computeSeason, makeSeasonState } from './render/season';
import { CameraRig, PointerInfo, ToolInput } from './core/camera';
import { GameTime } from './core/time';
import { Sim } from './sim/sim';
import { Agents } from './sim/agents';
import { Fauna } from './render/fauna';
import { Eruptions, ERUPTION_DUR } from './render/eruption';
import { Streams } from './render/streams';
import { Atmosphere } from './render/atmosphere';
import { AmbientLife } from './render/life';
import { Glow } from './render/glow';
import { loadModels } from './render/assets';
import { ToolController, ToolId } from './build/tools';
import { AudioEngine } from './audio/audio';
import { UI, showMenu, UIHost } from './ui/ui';
import { AGES, KINDS, Building } from './build/catalog';
import { Fires } from './render/fires';
import { Traffic } from './render/traffic';
import { GardenView } from './render/gardens';
import { Halos } from './render/halos';
import { SaveData, Settings, Quality, saveSlot, loadSlot, deleteSlot, exportSave, readSaveFile, loadSettings, saveSettings } from './save/save';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;
const coarse = window.matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
if (coarse) document.body.classList.add('low-fx');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

const audio = new AudioEngine();
const AUTOSTART = 'village-lowpoly:autostart';

class Game implements UIHost {
  scene = new THREE.Scene();
  cam = new CameraRig(canvas);
  world = new World();
  time = new GameTime();
  sim: Sim;
  terrain: TerrainView;
  buildings: BuildingView;
  roads: RoadView;
  veg: VegView;
  env: Environment;
  agents: Agents;
  fauna: Fauna;
  eruptions: Eruptions;
  streams: Streams;
  atmosphere: Atmosphere;
  life: AmbientLife;
  /** halo lumineux de nuit et sous terre (absent en qualité réduite) */
  private glow = coarse ? null : new Glow(renderer);
  /** qualité graphique choisie dans les réglages */
  quality: Quality = coarse ? 'low' : 'high';
  /** routes automatiques jusqu'aux nouveaux bâtiments */
  autoRoads = true;
  fires: Fires;
  traffic: Traffic;
  gardens: GardenView;
  halos: Halos;
  /** réveil spontané d'un volcan : délai (secondes de jeu) et secousses annonciatrices en cours */
  private quakeTimer = 0;
  private quake: { cell: number; t: number } | null = null;
  tools: ToolController;
  ui: UI;
  audio = audio;
  season = makeSeasonState();
  private lastTime = performance.now();
  private elapsed = 0;
  private windT = 0;
  private seasonKey = -1;
  private terrainTimer = 0;
  private propsTimer = 0;
  private lavaTimer = 2;
  private lavaPaint = 0;
  private propsDirty = true;
  private uiTimer = 0;
  private saveTimer = 0;
  private running = true;
  /** monde souterrain (créé à la première descente) */
  under: Underground;
  private underView: UnderView | null = null;
  private mode: 'surface' | 'under' = 'surface';
  private surfaceView: ReturnType<CameraRig['view']> | null = null;
  private surfaceZoom = { min: 10, max: 0 };
  private fading = false;
  torchMode = false;
  /** entrées sous terre : créatures, puits de jour, torches */
  private underInput: ToolInput = {
    down: (e) => this.underClick(e),
    move: () => {},
    up: () => {},
    cancel: () => {},
    hover: (e) => {
      const uv = this.underView, p = uv?.pick(this.cam.ray(e.x, e.y, canvas.clientWidth, canvas.clientHeight));
      canvas.style.cursor = this.torchMode ? 'crosshair' : p && (uv!.entranceAt(p.x, p.z) || uv!.veinNear(p.x, p.z)) ? 'pointer' : '';
    },
  };

  constructor(mapId: number, mode: 'continue' | 'new', fresh: boolean) {
    const w = this.world;
    const save = mode === 'continue' ? loadSlot(mapId) : null;
    const settings = { ...loadSettings(), ...(save?.settings ?? {}) } as Partial<Settings>;
    this.sim = new Sim(w);
    this.under = new Underground(w);
    if (save) {
      try {
        w.mapId = save.map; w.seed = save.seed;
        w.fromJSON(save.world);
        this.sim.age = save.age; this.sim.pop = save.pop;
        this.time.seasonT = save.seasonT; this.time.hour = save.hour;
        addDefaultDecor(w, save.seed);
      } catch (e) {
        console.warn(e);
        newWorld(w, mapId, MAPS[mapId].defaultSeed);
      }
    } else {
      newWorld(w, mapId, fresh ? Math.floor(Math.random() * 100000) + 1 : MAPS[mapId].defaultSeed);
    }
    Object.assign(this.time, { dayLen: settings.dayLen ?? 100, seasonLen: settings.seasonLen ?? 160, speed: settings.speed ?? 1 });
    Object.assign(audio, { musicVol: settings.musicVol ?? 0.5, sfxVol: settings.sfxVol ?? 0.7, muteMusic: settings.music !== true, muteSfx: settings.sfx !== true });
    if (settings.quality) this.quality = settings.quality;
    this.autoRoads = settings.autoRoads ?? true;
    w.disasters = settings.disasters ?? true;
    this.quakeTimer = this.time.dayLen * (5 + Math.random() * 4);

    this.terrain = new TerrainView(w);
    this.terrain.gardenAge = this.sim.age;
    this.roads = new RoadView(w);
    this.veg = new VegView(w);
    this.buildings = new BuildingView(w);
    this.env = new Environment(this.scene, renderer, coarse);
    this.agents = new Agents(w);
    this.fauna = new Fauna(w, this.veg);
    this.fauna.people = () => this.agents.agents;
    this.eruptions = new Eruptions(w);
    this.streams = new Streams(w, this.terrain.waterMat.normalMap);
    this.atmosphere = new Atmosphere(w, this.terrain.heightTexture, audio);
    this.life = new AmbientLife(w, this.buildings);
    this.fires = new Fires(w);
    this.traffic = new Traffic(w);
    // jardins : lieux qui changent avec les âges ; leurs feux fument et crépitent comme les foyers
    this.gardens = new GardenView(w);
    // halos de lumière des feux et des lanternes, la nuit
    this.halos = new Halos(w);
    this.life.extraChimneys = (out) => this.gardens.chimneys(out);
    // la foudre et les bombes de lave mettent le feu aux bâtiments ; les habitants accourent
    const ignite = (b: Building | undefined) => { if (b && this.fires.ignite(b)) { this.agents.alert(b.z * N + b.x); audio.sfxDestroy(); } };
    this.atmosphere.onStrike = (x, z) => ignite(w.buildingAt(Math.floor(x), Math.floor(z)));
    this.eruptions.onImpact = (k) => { if (w.disasters && w.occ[k] && Math.random() < 0.3) ignite(w.buildings.get(w.occ[k])); };
    this.life.onSplash = (x, z) => audio.sfxSplash((1 - Math.min(1, Math.hypot(x - this.cam.target.x, z - this.cam.target.z) / 25)) * Math.min(1, 40 / this.cam.dist));
    this.scene.add(this.terrain.group, this.roads.group, this.veg.group, this.buildings.group, this.agents.group, this.fauna.group, this.eruptions.group, this.streams.group, this.atmosphere.group, this.life.group, this.fires.group, this.traffic.group, this.gardens.group, this.halos.mesh);
    this.applyQuality();
    // le monde souterrain se charge en arrière-plan, une fois la partie lancée
    setTimeout(() => void loadUnder(), 4000);

    const host = this;
    this.tools = new ToolController({
      world: w, terrain: this.terrain, cam: this.cam, canvas, scene: this.scene, audio,
      getAge: () => this.sim.age,
      toast: (m) => this.ui.toast(m),
      changed: () => { this.propsDirty = true; this.ui?.refreshTools(); },
      enterUnder: (cell) => this.enterUnder(cell),
      erupt: (cell) => this.erupt(cell),
      get autoRoads() { return host.autoRoads; },
    });
    this.cam.handler = this.tools;
    this.ui = new UI(uiRoot, host);
    this.sim.onAgeUp = (age) => {
      this.ui.banner(`Nouvel âge : ${AGES[age].name}`, AGES[age].tagline);
      audio.sfxAgeUp();
      // le sol des jardins change avec eux
      this.terrain.gardenAge = age;
      this.terrain.recolor(this.season);
      this.propsDirty = true;
    };
    this.buildings.onPlaced = () => { this.propsDirty = true; };
    this.sim.recalc();
    this.sim.update(0, 1);

    this.onResize();
    this.cam.reset();
    this.cam.dist = this.cam.homeDist();
    window.addEventListener('resize', () => this.onResize());
    this.bindKeys();
    const unlock = () => { audio.start(); audio.applyVolumes(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.saveNow(); });
    window.addEventListener('pagehide', () => this.saveNow());

    this.refreshSeason(true);
    this.gardens.sync(this.sim.age);
    this.refreshHalos();
    this.ui.update();
    this.ui.toast(save ? 'Bon retour dans votre village !' : 'Choisissez un bâtiment dans « Bâtir » ou sculptez le terrain.');
    requestAnimationFrame(() => this.frame());
  }

  // ---------- UIHost ----------
  applySettings() {
    audio.applyVolumes();
    saveSettings(this.settings());
  }
  settings(): Settings {
    return { dayLen: this.time.dayLen, seasonLen: this.time.seasonLen, speed: this.time.speed, musicVol: audio.musicVol, sfxVol: audio.sfxVol, music: !audio.muteMusic, sfx: !audio.muteSfx, quality: this.quality, disasters: this.world.disasters, autoRoads: this.autoRoads };
  }
  buildSave(): SaveData {
    return { v: 1, map: this.world.mapId, seed: this.world.seed, world: this.world.toJSON(), age: this.sim.age, pop: this.sim.pop, seasonT: this.time.seasonT, hour: this.time.hour, settings: this.settings(), savedAt: Date.now() };
  }
  saveNow() { if (this.running) saveSlot(this.buildSave()); }
  exportSave() { exportSave(this.buildSave()); }
  async importFile(f: File) {
    try {
      const d = await readSaveFile(f);
      saveSlot(d);
      sessionStorage.setItem(AUTOSTART, `${d.map}|continue`);
      this.running = false;
      location.reload();
    } catch (e) { this.ui.toast('Import impossible : ' + (e as Error).message); }
  }
  newGame() {
    deleteSlot(this.world.mapId);
    sessionStorage.setItem(AUTOSTART, `${this.world.mapId}|fresh`);
    this.running = false;
    location.reload();
  }
  toMenu() { this.saveNow(); this.running = false; location.reload(); }
  setPhoto(on: boolean) { document.body.classList.toggle('photo', on); }
  underZone() { return this.mode === 'under' ? UZ_NAMES[this.under.zoneAt(this.cam.target.x, this.cam.target.z)] : null; }

  // ---------- Monde souterrain ----------
  /** Fondu au noir, bascule, puis retour à l'image */
  private fadeThrough(fn: () => void) {
    if (this.fading) return;
    this.fading = true;
    const f = document.getElementById('fade')!;
    f.classList.add('on');
    setTimeout(() => {
      fn();
      f.classList.remove('on');
      this.fading = false;
    }, 380);
  }

  /** Catastrophes activées : de temps en temps, un volcan se réveille de lui-même, annoncé par des secousses */
  private wakeVolcano(gdt: number, dt: number) {
    const w = this.world;
    if (this.quake) {
      this.quake.t -= dt;
      if (this.quake.t <= 0) { this.erupt(this.quake.cell); this.quake = null; }
      return;
    }
    if (!w.disasters || this.eruptions.active) return;
    this.quakeTimer -= gdt;
    if (this.quakeTimer > 0) return;
    this.quakeTimer = this.time.dayLen * (5 + Math.random() * 5);
    const vols: number[] = [];
    for (let k = 0; k < N * N; k++) if (w.veg[k] === VEG_VOLCANO) vols.push(k);
    if (!vols.length) return;
    this.quake = { cell: vols[Math.floor(Math.random() * vols.length)], t: 18 };
    audio.sfxRumble(18);
    this.ui.toast('La terre tremble : un volcan se réveille…');
  }

  setQuality(q: Quality) { this.quality = q; this.applyQuality(); this.applySettings(); }
  setDisasters(on: boolean) { this.world.disasters = on; this.applySettings(); }
  setAutoRoads(on: boolean) { this.autoRoads = on; this.applySettings(); }
  get disasters() { return this.world.disasters; }

  /** Qualité graphique : halo (haute), brume (haute et normale), densité des particules */
  private applyQuality() {
    const k = { high: 1, medium: 0.7, low: 0.35 }[this.quality];
    this.atmosphere.mistEnabled = this.quality !== 'low';
    this.life.density = k;
    this.streams.density = k;
  }

  /** Sons de l'environnement autour du point visé : plus forts quand la caméra est proche */
  private ambience() {
    const w = this.world, f = this.cam.target, zoom = Math.min(1, Math.max(0.15, 1.3 - this.cam.dist / 70));
    const [stream, cascade] = this.streams.nearness(f);
    const cx = Math.min(N - 1, Math.max(0, Math.floor(f.x))), cz = Math.min(N - 1, Math.max(0, Math.floor(f.z)));
    const coast = 1 - Math.min(1, Math.max(0, (w.waterDist[w.ci(cx, cz)] - 1) / 6));
    return { stream: stream * zoom, cascade: cascade * zoom, coast: coast * zoom, fire: Math.max(this.life.fireNear(f), this.fires.nearness(f.x, f.z)) * zoom, alt: Math.max(0, w.hAt(f.x, f.z)) };
  }

  /** Réveille le volcan de la case donnée : éruption, grondement et animaux qui détalent */
  erupt(cell: number) {
    if (!this.eruptions.start(cell)) return;
    audio.sfxEruption(ERUPTION_DUR);
    this.ui.toast('Le volcan entre en éruption !');
  }

  /** Descend par l'entrée (grotte ou faille) de la case donnée */
  async enterUnder(cell: number) {
    if (this.mode === 'under') return;
    this.tools.setTool('none');
    const { UnderView } = await loadUnder();
    this.fadeThrough(() => {
      this.under.sync();
      this.underView ??= new UnderView(this.world, this.under);
      this.underView.build();
      this.surfaceView = this.cam.view();
      this.surfaceZoom = { min: this.cam.minDist, max: this.cam.maxDist };
      this.mode = 'under';
      document.body.classList.add('under');
      this.cam.minDist = 5;
      this.cam.maxDist = 24;
      this.cam.minPitch = 0.95;
      const x = (cell % N) + 0.5, z = Math.floor(cell / N) + 0.5;
      this.cam.jump({ x, z, dist: 11, pitch: 1.05 }, this.underView.groundY(x, z));
      this.cam.handler = this.underInput;
      canvas.style.cursor = '';
      this.ui.banner('Monde souterrain', `${UZ_NAMES[this.under.zoneAt(x, z)]} : torches, cristaux et créatures. Le puits de lumière ramène à la surface.`);
      this.ui.update();
    });
  }

  /** Descend par l'entrée la plus proche du centre de la vue */
  enterNearest() {
    if (this.mode === 'under') { this.exitUnder(); return; }
    const w = this.world, t = this.cam.target;
    let best = -1, bd = Infinity;
    for (let k = 0; k < N * N; k++) {
      if (w.veg[k] !== VEG_CAVE && w.veg[k] !== VEG_FISSURE) continue;
      const d = Math.hypot((k % N) + 0.5 - t.x, Math.floor(k / N) + 0.5 - t.z);
      if (d < bd) { bd = d; best = k; }
    }
    if (best < 0) { this.ui.toast('Aucune entrée : posez une grotte ou une faille (onglet Nature).'); return; }
    this.enterUnder(best);
  }

  /** Remonte à la surface, devant l'entrée empruntée (ou celle donnée) */
  exitUnder(cell?: number) {
    if (this.mode !== 'under') return;
    this.fadeThrough(() => {
      this.mode = 'surface';
      document.body.classList.remove('under');
      this.underView?.leave();
      this.torchMode = false;
      this.cam.minDist = this.surfaceZoom.min;
      this.cam.minPitch = 0.25;
      this.cam.maxDist = this.surfaceZoom.max || this.cam.maxDist;
      const v = this.surfaceView ?? this.cam.view();
      if (cell !== undefined) { v.x = (cell % N) + 0.5; v.z = Math.floor(cell / N) + 0.5; v.dist = Math.min(v.dist, 16); }
      this.cam.jump(v, this.world.hAt(v.x, v.z));
      this.cam.handler = this.tools;
      canvas.style.cursor = '';
      this.saveNow();
    });
  }

  private underClick(e: PointerInfo) {
    const uv = this.underView;
    if (!uv) return;
    const ray = this.cam.ray(e.x, e.y, canvas.clientWidth, canvas.clientHeight);
    const p = uv.pick(ray);
    if (this.torchMode) {
      if (!p) return;
      const r = uv.toggleTorch(p.x, p.z);
      if (r === null) this.ui.toast('Une torche se pose sur le sol d’une galerie.');
      else if (r) audio.sfxPlace(); else audio.sfxDestroy();
      return;
    }
    // une créature cliquée sursaute et détale
    const mob = uv.mobs.hit(ray);
    if (mob) { uv.mobs.scare(mob.x, mob.z, 0.6); audio.sfxClick(); return; }
    if (!p) return;
    const ent = uv.entranceAt(p.x, p.z);
    if (ent) { this.exitUnder(ent.cell); return; }
    // un filon dans la paroi : on l'extrait (le minerai sert aux âges industriel et moderne)
    const ore = uv.mineAt(p.x, p.z);
    if (ore) {
      this.world.ore += ore.amount;
      audio.sfxMine();
      this.ui.toast(`⛏️ +${ore.amount} minerai (${ore.name}) — ${this.world.ore} en réserve`);
      this.world.version++;
      return;
    }
    if (uv.mobs.scare(p.x, p.z)) audio.sfxClick();
  }
  capture() {
    this.renderer_render();
    canvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `village-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  }

  // ---------- Entrées clavier ----------
  private bindKeys() {
    const map: Record<string, ToolId> = { '0': 'mountain', '1': 'raise', '2': 'lower', '3': 'flatten', '4': 'cliff', '5': 'dig', '6': 'forest', '7': 'field', '8': 'garden', '9': 'erase', r: 'road', x: 'bulldoze', m: 'move' };
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement) return;
      const k = e.key.toLowerCase();
      // chiffres par touche physique : en AZERTY, la rangée du haut marche sans Maj
      const digit = /^(?:Digit|Numpad)(\d)$/.exec(e.code)?.[1];
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? this.tools.redo() : this.tools.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); this.tools.redo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // sous terre : U remonte, T bascule les torches, les outils de surface sont inactifs
      if (this.mode === 'under') {
        if (k === 'u' || k === 'escape') this.exitUnder();
        else if (k === 't') { this.torchMode = !this.torchMode; this.ui.update(); }
        else if (k === ' ') { e.preventDefault(); this.time.paused = !this.time.paused; }
        return;
      }
      if (k === 'u') { this.enterNearest(); return; }
      const tool = digit !== undefined ? map[digit] : /^[0-9]$/.test(k) ? undefined : map[k];
      if (tool) { this.tools.setTool(tool); audio.sfxClick(); }
      else if (k === 'b') { this.tools.setTool('build', this.tools.kind); }
      else if (k === 't') this.tools.rotate();
      else if (k === 'escape') { this.tools.escape(); this.setPhoto(false); }
      else if (k === ' ') { e.preventDefault(); this.time.paused = !this.time.paused; }
      else if (k === 'p') this.setPhoto(!document.body.classList.contains('photo'));
      else if (k === 'h') document.body.classList.toggle('photo');
      else if (k === '[' || e.code === 'BracketLeft') { this.tools.radius = Math.max(1, this.tools.radius - 0.5); this.ui.refreshTools(); }
      else if (k === ']' || e.code === 'BracketRight') { this.tools.radius = Math.min(8, this.tools.radius + 0.5); this.ui.refreshTools(); }
    });
  }

  private onResize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    this.glow?.setSize(w, h);
    this.cam.resize(w, h);
  }

  /** Sources de lumière la nuit : feux de camp et braseros, lampadaires, feux des jardins, lanternes des chemins */
  private refreshHalos() {
    const pts: number[] = [];
    for (const b of this.world.buildings.values()) {
      if (b.kind === 'gather' && b.age === 0) pts.push(b.x + 0.5, b.z + 0.5, 1.5, 0.8);
      else if (b.kind === 'lamp') {
        // le lampadaire est dans un coin de sa case (décalé de 0,32, tourné avec elle)
        const t = (b.rot * Math.PI) / 2, c = Math.cos(t), s = Math.sin(t);
        pts.push(b.x + 0.5 + 0.32 * (c + s), b.z + 0.5 + 0.32 * (c - s), b.age <= 1 ? 1.1 : 0.95, 0.65);
      }
      else if (b.kind === 'workshop' && b.age === 2) pts.push(b.x + 0.5, b.z + 0.5, 0.75, 0.45);
    }
    this.gardens.lights(pts);
    for (let i = 0; i < this.roads.lights.length; i += 2) pts.push(this.roads.lights[i], this.roads.lights[i + 1], 0.75, 0.5);
    this.halos.set(pts);
  }

  private refreshSeason(force = false) {
    computeSeason(this.time, this.season);
    const key = Math.floor(this.time.seasonT * 120);
    if (force || key !== this.seasonKey) {
      this.seasonKey = key;
      // les teintes du sol changent par bandes, sur quelques images
      if (force) this.terrain.update(this.season); else this.terrain.recolor(this.season);
      this.veg.applySeason(this.season);
      this.gardens.applySeason(this.season);
      this.roads.rebuild(this.sim.age, this.season.snow);
      this.propsDirty = false;
    }
  }

  private renderer_render() {
    const under = this.mode === 'under' && this.underView;
    const scene = under ? this.underView!.scene : this.scene;
    if (!this.glow || this.quality !== 'high') { renderer.render(scene, this.cam.camera); return; }
    // le halo vient avec la nuit ; sous terre, il entoure cristaux, lave et torches
    const night = Math.min(1, Math.max(0, (this.env.night - 0.35) / 0.45));
    this.glow.render(scene, this.cam.camera, under ? 0.3 : night * 0.8, under ? 2 : 1.3);
  }

  private frame() {
    if (!this.running) return;
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.elapsed += dt;
    const w = this.world;

    const gdt = this.time.update(dt);
    const uv = this.mode === 'under' ? this.underView : null;
    this.cam.update(dt, uv ? (x, z) => uv.groundY(x, z) : (x, z) => w.hAt(x, z));
    // le sol tremble près d'un volcan en éruption
    let shake = uv ? 0 : this.eruptions.shakeAt(this.cam.target.x, this.cam.target.z);
    if (this.quake && !uv) {
      const v = this.quake.cell, d = Math.hypot((v % N) + 0.5 - this.cam.target.x, Math.floor(v / N) + 0.5 - this.cam.target.z);
      shake = Math.max(shake, (1 - this.quake.t / 18) * 0.7 * Math.max(0, 1 - d / 70));
    }
    if (shake > 0) {
      const t = this.elapsed, a = shake * 0.12 * Math.min(1, this.cam.dist / 30);
      this.cam.camera.position.add(new THREE.Vector3(Math.sin(t * 47) + Math.sin(t * 29) * 0.5, Math.sin(t * 53) * 0.6, Math.sin(t * 41) + Math.sin(t * 23) * 0.5).multiplyScalar(a));
    }
    if (!uv) this.tools.update(dt);

    // maillages dépendant du monde (limités en fréquence)
    this.terrainTimer -= dt;
    if (w.terrainDirty && this.terrainTimer <= 0) {
      // grande carte : le relief se refait au plus ~16 fois par seconde pendant la sculpture
      this.terrainTimer = 0.06;
      w.terrainDirty = false;
      this.terrain.update(this.season, w.takeTerrainRect());
      this.buildings.syncHeights();
      this.propsDirty = true;
    }
    this.propsTimer -= dt;
    if ((this.propsDirty || w.roadsDirty || w.vegDirty) && this.propsTimer <= 0) {
      this.propsTimer = 0.12;
      const roadsChanged = w.roadsDirty;
      if (w.roadsDirty || this.propsDirty) { w.roadsDirty = false; this.roads.rebuild(this.sim.age, this.season.snow); this.buildings.refreshAll(); }
      // l'herbe des prairies dépend aussi des routes
      if (w.vegDirty || roadsChanged || this.propsDirty) {
        // le sol se teinte sous les champs, jardins et forêts
        if (w.vegDirty && w.vegRect) this.terrain.update(this.season, w.vegRect);
        w.vegDirty = false;
        this.veg.rebuild(this.season);
        this.gardens.sync(this.sim.age);
        this.refreshHalos();
      }
      this.propsDirty = false;
    }
    // champs de lave : la végétation les regagne en trois saisons ; leur teinte se refait par petites zones
    this.lavaTimer -= gdt;
    if (this.lavaTimer <= 0) { this.lavaTimer = 2; w.regrow(2 / (this.time.seasonLen * 3)); }
    this.lavaPaint -= dt;
    if (w.basaltRect && this.lavaPaint <= 0) {
      this.lavaPaint = 0.25;
      this.terrain.update(this.season, w.basaltRect, true);
      w.basaltRect = null;
    }
    this.refreshSeason();
    this.terrain.stepRecolor();

    this.env.update(dt, this.time, this.season, this.cam.target, gdt, this.cam.dist);
    if (!uv) this.atmosphere.update(dt, this.time, this.season, this.env, this.cam.camera, this.cam.target);
    this.sim.rain = this.env.rainK;
    this.sim.season = this.time.season;
    this.sim.update(gdt, dt);
    this.eruptions.update(dt);
    this.fauna.alarm = this.eruptions.alarm();
    this.fires.update(dt);
    this.wakeVolcano(gdt, dt);
    // nouvelles du village : incendies, feux éteints, bâtiments perdus
    for (const m of this.fires.news.splice(0)) this.ui.toast(m);
    for (const m of w.losses.splice(0)) this.ui.toast(m);
    this.agents.update(gdt, this.time.hour, this.sim.age, this.env.rainK > 0.6, this.sim.pop, this.env.night);
    // la surface ne s'anime que lorsqu'on la regarde
    if (uv) uv.update(dt, this.cam.camera, this.cam.target, this.cam.dist, this.env.daylight);
    else {
      this.buildings.update(dt, this.sim.age);
      this.fauna.update(gdt, this.elapsed, this.time.hour, this.time.season, this.env.rainK, this.sim.age, this.cam.camera);
      this.terrain.animateWater(this.elapsed, 1 - this.env.weatherK * 0.3);
      this.streams.update(dt, this.season.snow, this.cam.target);
      this.life.update(dt, this.time, this.season, this.env, this.cam.target);
      this.traffic.update(gdt, this.time.hour, this.sim.age, this.sim.pop);
      this.gardens.update(dt, this.time.hour);
      this.halos.update(dt, this.env.night);
      this.windT += dt * (1 + this.env.weatherK * 0.6);
      this.veg.animate(this.windT, this.elapsed, 1 - this.env.weatherK * 0.3);
      this.veg.update(dt, this.cam.camera.position);
    }
    audio.update(dt, {
      age: this.sim.age, season: this.time.season, daylight: this.env.daylight,
      rain: this.env.rainK, snow: this.env.weatherKind === 'snow' ? this.env.weatherK : 0, fog: this.env.weatherKind === 'fog' ? this.env.weatherK : 0,
      pop: this.sim.pop, camDist: this.cam.dist, under: uv ? 1 : 0,
      ...this.ambience(),
    });

    this.uiTimer -= dt;
    if (this.uiTimer <= 0) { this.uiTimer = 0.25; this.ui.update(); }
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) { this.saveTimer = 15; this.saveNow(); }

    this.renderer_render();
  }
}

// ---------- Boot ----------
async function boot() {
  // modèles 3D chargés avant tout : la végétation et la faune les lisent à la construction
  const loading = document.createElement('div');
  loading.className = 'loading';
  uiRoot.appendChild(loading);
  await loadModels((done, total) => { loading.textContent = `Chargement des modèles… ${done}/${total}`; });
  loading.remove();

  let started = false;
  const start = (map: number, mode: 'continue' | 'new', fresh = false) => {
    if (started) return;
    started = true;
    menu?.remove();
    // tailles des tableaux du monde, des vues et de la caméra
    setMapSize(MAPS[map].size);
    syncChunks();
    (window as any).__game = new Game(map, mode, fresh);
  };
  const auto = sessionStorage.getItem(AUTOSTART);
  let menu: HTMLElement | null = null;
  if (auto) {
    sessionStorage.removeItem(AUTOSTART);
    const [m, mode] = auto.split('|');
    start(+m, mode === 'continue' ? 'continue' : 'new', mode === 'fresh');
    return;
  }
  menu = showMenu(uiRoot, {
    start: (map, mode) => start(map, mode, mode === 'new' && !!loadSlot(map)),
    importFile: async (f) => {
      try { const d = await readSaveFile(f); saveSlot(d); start(d.map, 'continue'); }
      catch (e) { alert('Import impossible : ' + (e as Error).message); }
    },
  });
  void KINDS;
}
void boot();
