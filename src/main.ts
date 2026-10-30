import './style.css';
import * as THREE from 'three';
import { World } from './world/world';
import { newWorld, MAPS } from './world/mapgen';
import { TerrainView } from './render/terrainView';
import { BuildingView } from './render/buildings';
import { RoadView } from './render/roads';
import { VegView } from './render/vegetation';
import { Environment } from './render/env';
import { computeSeason, makeSeasonState } from './render/season';
import { CameraRig } from './core/camera';
import { GameTime } from './core/time';
import { Sim } from './sim/sim';
import { Agents } from './sim/agents';
import { ToolController, ToolId } from './build/tools';
import { AudioEngine } from './audio/audio';
import { UI, showMenu, UIHost } from './ui/ui';
import { AGES, KINDS } from './build/catalog';
import { SaveData, Settings, saveSlot, loadSlot, deleteSlot, exportSave, readSaveFile, loadSettings, saveSettings } from './save/save';

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
  tools: ToolController;
  ui: UI;
  audio = audio;
  season = makeSeasonState();
  private lastTime = performance.now();
  private elapsed = 0;
  private seasonKey = -1;
  private terrainTimer = 0;
  private propsTimer = 0;
  private propsDirty = true;
  private uiTimer = 0;
  private saveTimer = 0;
  private running = true;

  constructor(mapId: number, mode: 'continue' | 'new', fresh: boolean) {
    const w = this.world;
    const save = mode === 'continue' ? loadSlot(mapId) : null;
    const settings = { ...loadSettings(), ...(save?.settings ?? {}) } as Partial<Settings>;
    this.sim = new Sim(w);
    if (save) {
      try {
        w.mapId = save.map; w.seed = save.seed;
        w.fromJSON(save.world);
        this.sim.age = save.age; this.sim.pop = save.pop;
        this.time.seasonT = save.seasonT; this.time.hour = save.hour;
      } catch (e) {
        console.warn(e);
        newWorld(w, mapId, MAPS[mapId].defaultSeed);
      }
    } else {
      newWorld(w, mapId, fresh ? Math.floor(Math.random() * 100000) + 1 : MAPS[mapId].defaultSeed);
    }
    Object.assign(this.time, { dayLen: settings.dayLen ?? 100, seasonLen: settings.seasonLen ?? 160, speed: settings.speed ?? 1 });
    Object.assign(audio, { musicVol: settings.musicVol ?? 0.5, sfxVol: settings.sfxVol ?? 0.7, muteMusic: !!settings.muteMusic, muteSfx: !!settings.muteSfx });

    this.terrain = new TerrainView(w);
    this.roads = new RoadView(w);
    this.veg = new VegView(w);
    this.buildings = new BuildingView(w);
    this.env = new Environment(this.scene, renderer, coarse);
    this.agents = new Agents(w);
    this.scene.add(this.terrain.group, this.roads.mesh, this.veg.group, this.buildings.group, this.agents.group);

    const host = this;
    this.tools = new ToolController({
      world: w, terrain: this.terrain, cam: this.cam, canvas, scene: this.scene, audio,
      getAge: () => this.sim.age,
      toast: (m) => this.ui.toast(m),
      changed: () => { this.propsDirty = true; this.ui?.refreshTools(); },
    });
    this.cam.handler = this.tools;
    this.ui = new UI(uiRoot, host);
    this.sim.onAgeUp = (age) => {
      this.ui.banner(`Nouvel âge : ${AGES[age].name}`, AGES[age].tagline);
      audio.sfxAgeUp();
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
    return { dayLen: this.time.dayLen, seasonLen: this.time.seasonLen, speed: this.time.speed, musicVol: audio.musicVol, sfxVol: audio.sfxVol, muteMusic: audio.muteMusic, muteSfx: audio.muteSfx };
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
    const map: Record<string, ToolId> = { '1': 'raise', '2': 'lower', '3': 'flatten', '4': 'cliff', '5': 'dig', '6': 'forest', '7': 'field', '8': 'garden', '9': 'erase', r: 'road', x: 'bulldoze', m: 'move' };
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? this.tools.redo() : this.tools.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); this.tools.redo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (map[k]) { this.tools.setTool(map[k]); audio.sfxClick(); }
      else if (k === 'b') { this.tools.setTool('build', this.tools.kind); }
      else if (k === 't') this.tools.rotate();
      else if (k === 'escape') { this.tools.escape(); this.setPhoto(false); }
      else if (k === ' ') { e.preventDefault(); this.time.paused = !this.time.paused; }
      else if (k === 'p') this.setPhoto(!document.body.classList.contains('photo'));
      else if (k === 'h') document.body.classList.toggle('photo');
      else if (k === '[') { this.tools.radius = Math.max(1, this.tools.radius - 0.5); this.ui.refreshTools(); }
      else if (k === ']') { this.tools.radius = Math.min(8, this.tools.radius + 0.5); this.ui.refreshTools(); }
    });
  }

  private onResize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    this.cam.resize(w, h);
  }

  private refreshSeason(force = false) {
    computeSeason(this.time, this.season);
    const key = Math.floor(this.time.seasonT * 120);
    if (force || key !== this.seasonKey) {
      this.seasonKey = key;
      this.terrain.update(this.season);
      this.veg.applySeason(this.season);
      this.roads.rebuild(this.sim.age, this.season.snow);
      this.propsDirty = false;
    }
  }

  private renderer_render() { renderer.render(this.scene, this.cam.camera); }

  private frame() {
    if (!this.running) return;
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.elapsed += dt;
    const w = this.world;

    const gdt = this.time.update(dt);
    this.cam.update(dt, (x, z) => w.hAt(x, z));
    this.tools.update(dt);

    // maillages dépendant du monde (limités en fréquence)
    this.terrainTimer -= dt;
    if (w.terrainDirty && this.terrainTimer <= 0) {
      this.terrainTimer = 0.04;
      w.terrainDirty = false;
      this.terrain.update(this.season);
      this.buildings.syncHeights();
      this.propsDirty = true;
    }
    this.propsTimer -= dt;
    if ((this.propsDirty || w.roadsDirty || w.vegDirty) && this.propsTimer <= 0) {
      this.propsTimer = 0.12;
      if (w.roadsDirty || this.propsDirty) { w.roadsDirty = false; this.roads.rebuild(this.sim.age, this.season.snow); this.buildings.refreshAll(); }
      if (w.vegDirty || this.propsDirty) { w.vegDirty = false; this.veg.rebuild(this.season); }
      this.propsDirty = false;
    }
    this.refreshSeason();

    this.env.update(dt, this.time, this.season, this.cam.target, gdt);
    this.buildings.update(dt, this.sim.age);
    this.sim.update(gdt, dt);
    this.agents.update(gdt, this.time.hour, this.sim.age, this.env.rainK > 0.6, this.sim.pop, this.env.night);
    this.terrain.animateWater(this.elapsed, 1 - this.env.weatherK * 0.3);
    audio.update(dt, {
      age: this.sim.age, season: this.time.season, daylight: this.env.daylight,
      rain: this.env.rainK, snow: this.env.weatherKind === 'snow' ? this.env.weatherK : 0, fog: this.env.weatherKind === 'fog' ? this.env.weatherK : 0,
      pop: this.sim.pop, camDist: this.cam.dist,
    });

    this.uiTimer -= dt;
    if (this.uiTimer <= 0) { this.uiTimer = 0.25; this.ui.update(); }
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) { this.saveTimer = 15; this.saveNow(); }

    this.renderer_render();
  }
}

// ---------- Boot ----------
function boot() {
  let started = false;
  const start = (map: number, mode: 'continue' | 'new', fresh = false) => {
    if (started) return;
    started = true;
    menu?.remove();
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
boot();
