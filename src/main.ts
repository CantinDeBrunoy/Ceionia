import './style.css';
import * as THREE from 'three';
import { World, N, VEG_CAVE, VEG_FISSURE, VEG_VOLCANO, setMapSize } from './world/world';
import { Underground, UZ_NAMES } from './world/underground';
import type { UnderView } from './render/underView';
/** Le monde souterrain (décor, créatures) est chargé à part, en arrière-plan après le démarrage */
let underModule: Promise<typeof import('./render/underView')> | null = null;
const loadUnder = () => (underModule ??= import('./render/underView'));
import { newWorld, addDefaultDecor, mapDef, newSeed, CONTINENT } from './world/mapgen';
import { TerrainView, SNOWY } from './render/terrainView';
import { BuildingView } from './render/buildings';
import { RoadView } from './render/roads';
import { stepWind } from './render/wind';
import { Helis } from './render/helis';
import { Airships } from './render/airships';
import { Fairground } from './render/fairground';
import { AlpineView } from './render/alpine';
import { Emergencies } from './render/emergency';
import { Hoists } from './render/hoists';
import { Transports } from './render/transports';
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
import { SNOW, setSnowMap } from './render/snow';
import { AmbientLife } from './render/life';
import { Glow } from './render/glow';
import { loadModels } from './render/assets';
import { ToolController, ToolId } from './build/tools';
import { AudioEngine } from './audio/audio';
import { UI, showMenu, UIHost } from './ui/ui';
import { Tutorial } from './ui/tutorial';
import { AGES, KINDS, Building, sizeOf } from './build/catalog';
import { MISSIONS, VICTORY } from './sim/missions';
import { SpaceCast, showVictory, showVoyage } from './ui/spaceViews';
import { L_GONE } from './render/expeditionScenes';
import { Fires } from './render/fires';
import { Traffic } from './render/traffic';
import { GardenView } from './render/gardens';
import { Halos } from './render/halos';
import { Expeditions } from './sim/expeditions';
import { Railway, LINE_COLORS } from './sim/railway';
import { RailView } from './render/railway';
import { RailEditState, TrackEditor } from './build/trackEdit';
import { ExpeditionView } from './render/expeditionView';
import { Festivities } from './render/festivities';
import { PenView } from './render/pens';
import { OilSeeps } from './render/oilSeeps';
import { SaveData, Settings, Quality, saveSlot, loadSlot, deleteSlot, exportSave, readSaveFile, loadSettings, saveSettings } from './save/save';
import { Difficulty, isDifficulty, rulesOf } from './sim/difficulty';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;
const coarse = window.matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
if (coarse) document.body.classList.add('low-fx');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

const audio = new AudioEngine();
/** distance de la caméra quand elle revient sur le village (assez près pour reconnaître ses maisons) */
const VILLAGE_DIST = 30;
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
  helis: Helis;
  airships: Airships;
  fairground: Fairground;
  alpine: AlpineView;
  emergencies: Emergencies;
  hoists: Hoists;
  transports: Transports;
  gardens: GardenView;
  halos: Halos;
  expeditions: Expeditions;
  /** chemin de fer : ses lignes de gare en gare, le train que la caméra suit (numéro de sa ligne) */
  railway: Railway;
  railView: RailView;
  trainCam: number | null = null;
  /** ligne en cours de tracé : ses arrêts dans l'ordre, ses points de passage, et la ligne qu'elle remplacera (null : une nouvelle) */
  railEdit: RailEditState | null = null;
  /** éditeur du tracé de la voie (la ligne en cours de tracé) */
  trackEdit: TrackEditor;
  expView: ExpeditionView;
  /** fêtes du retour des expéditions réussies, et les équipes déjà fêtées */
  fest: Festivities;
  /** l'alunissage en direct, pendant l'expédition « Un homme sur la Lune » */
  spaceCast: SpaceCast;
  private feted = new Set<number>();
  /** la caméra a déjà filé sur un volcan en éruption (la première fois seulement) */
  private volcanoSeen = false;
  /** le grand départ des colons : la foule qui les acclame (au cœur du village, puis au pas de tir), le voyage montré */
  private farewell: { id: number; crowd: number[]; at: string; voyage: boolean } | null = null;
  pens: PenView;
  /** flaques de brut sur les gisements de pétrole */
  seeps: OilSeeps;
  /** la caméra suit l'expédition */
  /** expédition que la caméra suit (son numéro), ou null */
  following: number | null = null;
  /** étape de l'expédition suivie (pour se rapprocher à son arrivée sur place), sa dernière position et sa vitesse lissée */
  private followPhase = '';
  private followLast: [number, number] | null = null;
  private followVel: [number, number] = [0, 0];
  /** la vue est descendue d'elle-même avec la troupe suivie (elle remonte quand l'expédition est finie) */
  private autoUnder = false;
  /** réveil spontané d'un volcan : délai (secondes de jeu) et secousses annonciatrices en cours */
  private quakeTimer = 0;
  private quake: { cell: number; t: number } | null = null;
  tools: ToolController;
  ui: UI;
  /** tutoriel guidé (bulles d'aide), s'il est activé */
  tutorial: Tutorial;
  audio = audio;
  season = makeSeasonState();
  private lastTime = performance.now();
  /** version des lanternes des voies déjà données aux halos */
  private railLightsV = -1;
  private elapsed = 0;
  private windT = 0;
  private seasonKey = -1;
  /** dernière version des biomes peints prise en compte pour la neige des toits */
  private biomeV = 0;
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
  /** mode Creuser : un clic sur la roche y fait creuser un tunnel par les mineurs du camp */
  digMode = false;
  /** ce que montre la case visée en mode Creuser (case, file, roche) */
  private digHover = '';
  /** entrées sous terre : créatures, puits de jour, torches, creusement */
  private underInput: ToolInput = {
    down: (e) => this.underClick(e),
    move: () => {},
    up: () => {},
    cancel: () => {},
    hover: (e) => {
      const uv = this.underView, p = uv?.pick(this.cam.ray(e.x, e.y, canvas.clientWidth, canvas.clientHeight));
      // en mode Creuser, la case visée et le tunnel qu'on y creuserait (en rouge si l'on ne peut pas)
      if (uv && this.digMode) {
        // (recalculé seulement quand la case visée, la file ou la roche changent)
        const k = p ? this.digCell(p) : -1, key = `${k}|${this.world.digs.join(',')}|${this.under.carved}|${uv.digCursorShown()}`;
        if (key !== this.digHover) {
          this.digHover = key;
          const plan = k < 0 || this.world.digs.includes(k) ? null : this.expeditions.digPlan(k);
          if (k < 0 || !plan) uv.digCursor(k < 0 ? [] : [k], true);
          else uv.digCursor(typeof plan === 'string' ? [k] : plan, typeof plan !== 'string');
        }
      }
      canvas.style.cursor = this.torchMode || this.digMode ? 'crosshair' : p && (uv!.entranceAt(p.x, p.z) || uv!.veinNear(p.x, p.z)) ? 'pointer' : '';
    },
  };

  /** `seed` : graine d'une nouvelle partie (tirée au hasard sans elle) ; `difficulty` : la sienne (normale sans elle) */
  constructor(mapId: number, mode: 'continue' | 'new', seed?: number, difficulty: Difficulty = 'normal') {
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
        newWorld(w, mapId, mapDef(mapId)!.defaultSeed);
      }
    } else {
      newWorld(w, mapId, seed ?? newSeed());
      w.difficulty = difficulty;
      w.wood = rulesOf(difficulty).startWood; w.stone = rulesOf(difficulty).startStone;
    }
    Object.assign(this.time, { dayLen: settings.dayLen ?? 100, seasonLen: settings.seasonLen ?? 160, speed: settings.speed ?? 1 });
    Object.assign(audio, { musicVol: settings.musicVol ?? 0.5, sfxVol: settings.sfxVol ?? 0.7, muteMusic: settings.music !== true, muteSfx: settings.sfx !== true });
    if (settings.quality) this.quality = settings.quality;
    this.autoRoads = settings.autoRoads ?? true;
    w.disasters = settings.disasters ?? true;
    w.unlimited = settings.unlimited ?? false;
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
    this.atmosphere = new Atmosphere(w, audio);
    this.life = new AmbientLife(w, this.buildings);
    this.fires = new Fires(w);
    this.traffic = new Traffic(w);
    this.traffic.avoid = this.roads.islands;
    this.helis = new Helis(w, this.buildings);
    this.airships = new Airships(w);
    this.fairground = new Fairground(w, this.buildings);
    this.alpine = new AlpineView(w, this.buildings);
    this.emergencies = new Emergencies(w, this.fires, this.roads.islands);
    this.fires.responder = this.emergencies;
    // les pompiers et les voisins au seau : ils restent tant que ça brûle, et leur eau éteint le feu
    this.fires.pails = (b) => this.agents.pails(b);
    this.agents.burning = (id) => this.fires.burning.some((b) => b.id === id);
    this.hoists = new Hoists(w);
    this.transports = new Transports(w, this.buildings);
    // jardins : lieux qui changent avec les âges ; leurs feux fument et crépitent comme les foyers
    this.gardens = new GardenView(w);
    // halos de lumière des feux et des lanternes, la nuit
    this.halos = new Halos(w);
    // expéditions : une équipe d'habitants part chercher bêtes, minerai, semences… et revient raconter
    this.expeditions = new Expeditions(w, this.agents, () => this.time.dayLen);
    // l'âge du village (les noms des bâtiments, les troupes de l'époque), pas celui du plus récent de ses bâtiments
    this.expeditions.age = () => this.sim.age;
    this.expeditions.pop = () => this.sim.pop;
    this.expeditions.under = this.under;
    this.expView = new ExpeditionView(w, this.agents, this.expeditions);
    this.fest = new Festivities(w);
    this.fest.onBang = (k) => this.audio.sfxBang(k);
    this.fest.onFeast = () => this.audio.sfxFeast();
    this.expView.fx.onClash = (k) => this.audio.sfxClash(k);
    // le train descend des mineurs au pied de la grotte et remonte minerai et pierre des galeries tenues
    this.railway = new Railway(w, this.agents, this.expeditions, () => this.time.dayLen);
    // les scènes des expéditions ne se posent pas sur les voies ferrées
    this.expeditions.avoidCells = () => {
      const out = new Set<number>();
      for (const seg of this.railway.network().segs) for (const [x, z] of seg.pts) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (w.inCells(Math.floor(x) + dx, Math.floor(z) + dz)) out.add(w.ci(Math.floor(x) + dx, Math.floor(z) + dz));
      return out;
    };
    this.railView = new RailView(w, this.railway);
    this.railView.streams = this.streams;
    // on saisit la voie prévue pour la faire passer où l'on veut (rayon de saisie selon le zoom)
    this.trackEdit = new TrackEditor(w, this.railway, () => this.railEdit, () => Math.max(0.55, this.cam.dist * 0.02), () => this.ui.update());
    this.railView.group.add(this.trackEdit.group);
    this.pens = new PenView(w);
    this.seeps = new OilSeeps(w);
    this.life.extraChimneys = (out) => this.gardens.chimneys(out);
    // la foudre et les bombes de lave mettent le feu aux bâtiments ; les habitants accourent
    const ignite = (b: Building | undefined) => { if (b && this.fires.ignite(b)) { this.agents.alert(b.z * N + b.x); audio.sfxDestroy(); } };
    this.emergencies.ignite = (b) => ignite(b);
    // (une fois sur deux seulement : les incendies restent des événements)
    this.atmosphere.onStrike = (x, z) => { if (Math.random() < 0.5) ignite(w.buildingAt(Math.floor(x), Math.floor(z))); };
    this.eruptions.onImpact = (k) => { if (w.disasters && w.occ[k] && Math.random() < 0.3) ignite(w.buildings.get(w.occ[k])); };
    this.life.onSplash = (x, z) => audio.sfxSplash((1 - Math.min(1, Math.hypot(x - this.cam.target.x, z - this.cam.target.z) / 25)) * Math.min(1, 40 / this.cam.dist));
    this.scene.add(this.terrain.group, this.roads.group, this.veg.group, this.buildings.group, this.agents.group, this.fauna.group, this.eruptions.group, this.streams.group, this.atmosphere.group, this.life.group, this.fires.group, this.traffic.group, this.helis.group, this.airships.group, this.alpine.group, this.emergencies.group, this.hoists.group, this.transports.group, this.gardens.group, this.halos.mesh, this.expView.group, this.fest.group, this.pens.group, this.railView.group, this.seeps.group);
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
    this.spaceCast = new SpaceCast(uiRoot);
    this.expeditions.onNews = (m, depths) => this.ui.toast(m, depths ? () => this.ui.openExpeditions('depths') : undefined);
    this.railway.onNews = (m) => this.ui.toast(m, () => this.ui.openExpeditions('depths'));
    this.cam.onPan = () => { this.trainCam = null; this.incidentCam = null; };
    // tracer une ligne : un clic sur une gare ou un avant-poste l'ajoute aux arrêts ; la voie prévue se saisit et se déplace
    this.tools.pickStop = (b) => this.railPick(b);
    this.tools.overlay = this.trackEdit;
    this.expeditions.onEvent = (a) => { audio.sfxClick(); this.ui.expEvent(a); };
    // une quête du camp souterrain accomplie : il grandit de lui-même
    this.expeditions.onCamp = (q) => {
      audio.sfxAgeUp();
      this.ui.toast(`⛺ Quête accomplie : « ${q.title} » — le camp souterrain s’agrandit : ${q.builds}.`, () => this.ui.openExpeditions('depths'));
      this.ui.update();
    };
    this.expeditions.onReport = (r) => {
      if (r.ok) audio.sfxAgeUp(); else audio.sfxClick();
      // la colonie fondée sur une autre planète : la fin de la partie (on peut continuer à bâtir), à la place du récit
      if (r.ok && r.m.id === VICTORY && !r.redo) showVictory(uiRoot, { name: 'le village', pop: this.sim.pop, buildings: this.world.buildings.size, missions: this.world.exp.done.length, days: this.time.days });
      else this.ui.showReport(r);
      this.ui.update();
    };
    this.sim.onAgeUp = (age) => {
      // on ne revient pas en arrière par-dessus un passage d'âge (Ctrl+Z rendrait des bâtiments comptés comme neufs)
      this.tools.undoStack.length = 0; this.tools.redoStack.length = 0;
      this.ui.banner(`Nouvel âge : ${AGES[age].name}`, AGES[age].tagline);
      // la liste de ce que l'âge apporte, comme dans Cities: Skylines : de quoi bâtir sans chercher
      setTimeout(() => this.ui.showNewAge(age), 1800);
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
    this.tutorial = new Tutorial(this.ui, this, !save);
    this.ui.toast(save ? 'Bon retour dans votre village !' : 'Choisissez un bâtiment dans « Bâtir » ou sculptez le terrain.');
    requestAnimationFrame(() => this.frame());
  }

  // ---------- UIHost ----------
  applySettings() {
    audio.applyVolumes();
    saveSettings(this.settings());
  }
  settings(): Settings {
    return { dayLen: this.time.dayLen, seasonLen: this.time.seasonLen, speed: this.time.speed, musicVol: audio.musicVol, sfxVol: audio.sfxVol, music: !audio.muteMusic, sfx: !audio.muteSfx, quality: this.quality, disasters: this.world.disasters, autoRoads: this.autoRoads, unlimited: this.world.unlimitedSetting };
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
  newGame(difficulty: Difficulty) {
    deleteSlot(this.world.mapId);
    sessionStorage.setItem(AUTOSTART, `${this.world.mapId}|fresh|${difficulty}`);
    this.running = false;
    location.reload();
  }
  toMenu() { this.saveNow(); this.running = false; location.reload(); }
  setPhoto(on: boolean) { document.body.classList.toggle('photo', on); }
  underZone() { return this.mode === 'under' ? UZ_NAMES[this.under.zoneAt(this.cam.target.x, this.cam.target.z)] : null; }

  // ---------- Monde souterrain ----------
  /** Fondu au noir, bascule, puis retour à l'image */
  /** Passe par un fondu au noir (avec ce qu'il se passe, écrit au milieu) le temps de changer de vue */
  private fadeThrough(fn: () => void | Promise<void>, label = '') {
    if (this.fading) return;
    this.fading = true;
    const f = document.getElementById('fade')!;
    f.textContent = label;
    f.classList.add('on');
    setTimeout(async () => {
      try { await fn(); } finally {
        // deux images de plus derrière le voile : la nouvelle vue s'y prépare (ses matériaux se compilent) sans figer l'écran à demi ;
        // onglet caché (plus d'images) : le voile se lève quand même
        const lift = () => { if (!this.fading) return; f.classList.remove('on'); this.fading = false; };
        requestAnimationFrame(() => requestAnimationFrame(lift));
        setTimeout(lift, 600);
      }
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
    const cell = vols[Math.floor(Math.random() * vols.length)];
    this.quake = { cell, t: 18 };
    audio.sfxRumble(18);
    // le message mène au volcan qui se réveille (on ne savait pas lequel)
    this.ui.toast('La terre tremble : un volcan se réveille… Cliquez ici pour le voir.', () => { this.follow(null); this.cam.goTo((cell % N) + 0.5, Math.floor(cell / N) + 0.5, 40); });
  }

  setQuality(q: Quality) { this.quality = q; this.applyQuality(); this.applySettings(); }
  setDisasters(on: boolean) { this.world.disasters = on; this.applySettings(); }
  setAutoRoads(on: boolean) { this.autoRoads = on; this.applySettings(); }
  /** Brouillard visible : la météo « brume » et la nappe au ras du sol (0 … 1) */
  fogLevel() { return Math.max(this.env.weatherKind === 'fog' ? this.env.weatherK : 0, this.atmosphere.mist); }
  /** Dissipe le brouillard et la brume ; ils ne reviennent pas avant un bon moment */
  dispelFog() { this.env.dispelFog(); this.atmosphere.dispel(300); }

  /** Incidents en cours (incendies, malaises, cambriolages), pour leurs cartes et la caméra */
  incidents() { return [...this.fires.incidents(), ...this.emergencies.incidents()]; }
  /** l'incident que la caméra suit */
  incidentCam: string | null = null;
  followIncident(key: string | null) {
    this.incidentCam = key;
    if (!key) return;
    this.following = null; this.trainCam = null;
    if (this.mode === 'under') this.exitUnder();
    const i = this.incidents().find((x) => x.key === key);
    if (i) this.cam.follow(i.x, i.z, 9);
  }

  /**
   * Le grand départ des colons : tout le village sort les acclamer, d'abord en cercle autour d'eux au cœur du village (fête et
   * feu d'artifice), puis autour du pas de tir pendant l'embarquement et le décollage. La fusée sortie du ciel, le voyage se
   * montre en plein écran (le jeu attend), puis vient l'écran de fin
   */
  private stepFarewell() {
    const a = this.expeditions.active.find((e) => e.m.farewell && !e.fromCamp), ag = this.agents;
    let f = this.farewell;
    if (!a) { if (f) { ag.dismiss(f.crowd); this.farewell = null; } return; }
    if (!f || f.id !== a.id) {
      if (f) ag.dismiss(f.crowd);
      f = this.farewell = { id: a.id, crowd: ag.recruit(Math.min(30, ag.available())) ?? [], at: '', voyage: false };
      this.fest.start(a.base[0], a.base[1], this.sim.age);
      this.ui.toast(`${a.m.icon} Tout le village sort dire adieu aux colons !`);
    }
    // la foule se range en cercle, tournée vers les colons, et les acclame une fois en place
    const at = a.phase === 'gather' ? 'base' : 'pad';
    if (f.at !== at) {
      f.at = at;
      const [cx, cz] = at === 'base' ? a.base : a.dest, r0 = at === 'base' ? 1.6 : 4;
      f.crowd.forEach((id, i) => {
        const ang = i * 2.4, r = r0 + (i % 3) * 0.7, x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
        ag.memberGo(id, x, z, Math.atan2(cx - x, cz - z));
      });
    }
    for (const id of f.crowd) if (ag.memberDone(id)) ag.partyAct([id], 'cheer');
    // la fusée a quitté le ciel : le grand voyage, plein écran et en temps réel, puis le récit (l'écran de fin)
    if (!f.voyage && a.phase === 'work' && a.t >= (a.c.work + a.extra) * L_GONE) {
      f.voyage = true;
      const was = this.time.paused;
      this.time.paused = true;
      showVoyage(uiRoot, a.c.label.includes('saut'), () => { this.expeditions.landNow(a); this.time.paused = was; });
    }
  }

  /** Le cœur du village : le milieu de ses bâtiments (la médiane, qu'un avant-poste lointain ne décale pas) */
  villageCenter(): [number, number] | null {
    const bs = [...this.world.buildings.values()];
    if (!bs.length) return null;
    const mid = (v: number[]) => v.sort((a, b) => a - b)[v.length >> 1];
    return [mid(bs.map((b) => b.x + sizeOf(b) / 2)), mid(bs.map((b) => b.z + sizeOf(b) / 2))];
  }

  /** Ramène la vue sur le village ; si elle y est déjà, passe à la vue d'ensemble. La vue cesse de suivre quoi que ce soit */
  goHome() {
    // la vue suivait quelque chose : elle revient au village, même si l'équipe en partait à peine
    const tracked = this.following !== null || this.trainCam !== null || this.incidentCam !== null;
    this.follow(null); this.trainCam = null; this.incidentCam = null;
    if (this.mode === 'under') { this.exitUnder(); return; }
    const c = this.villageCenter(), v = this.cam.view();
    if (!c || (!tracked && Math.hypot(v.x - c[0], v.z - c[1]) < 2 && v.dist < VILLAGE_DIST * 1.2)) { this.cam.reset(); return; }
    this.cam.goTo(c[0], c[1], VILLAGE_DIST);
  }

  /** La caméra suit le train de cette ligne (jusqu'à ce qu'on fasse glisser la vue) */
  followTrain(line: number) {
    const tr = this.railway.trains.get(line), p = tr ? this.railway.trainAt(tr) : null;
    if (!p) return;
    this.following = null;
    if (this.mode === 'under') this.exitUnder();
    this.trainCam = line;
    this.cam.follow(p[0], p[1], 14);
  }

  // ---------- Tracer une ligne de chemin de fer ----------

  /** Commence une ligne à partir de cette gare, ou reprend une ligne existante (ses arrêts, le tracé de sa voie) */
  startRailEdit(from: { stop?: number; line?: number }) {
    const l = from.line !== undefined ? this.world.lines.find((x) => x.id === from.line) : undefined;
    const used = new Set(this.world.lines.map((x) => x.color));
    this.railEdit = l ? { stops: [...l.stops], line: l.id, color: l.color, via: l.stops.slice(1).map((_, i) => [...(l.via?.[i] ?? [])]) }
      : { stops: from.stop !== undefined ? [from.stop] : [], line: null, color: LINE_COLORS.find((c) => !used.has(c)) ?? LINE_COLORS[0], via: [] };
    this.tools.setTool('none');
    this.tools.select(null);
    this.tools.pickStop = (b) => this.railPick(b);
    this.tools.picking = true;
    this.ui.update();
  }

  /** Un clic pendant le tracé : une gare ou un avant-poste s'ajoute aux arrêts (recliquer le dernier le retire) */
  railPick(b: Building | undefined) {
    const e = this.railEdit;
    if (!e || !b) return;
    if (e.stops[e.stops.length - 1] === b.id) { this.railUndo(); audio.sfxClick(); return; }
    if (e.stops.includes(b.id)) { this.ui.toast(`${this.railway.stopName(b)} est déjà sur la ligne.`); return; }
    if (!this.railway.stopOf(b)) {
      this.ui.toast(b.kind === 'outpost' ? 'Cet avant-poste ne garde aucune entrée, ou n’a pas la place d’un quai à son pied.' : 'Cliquez une gare ou un avant-poste.');
      return;
    }
    e.stops.push(b.id);
    if (e.stops.length > 1) e.via.push([]);
    audio.sfxClick();
    this.ui.update();
  }

  /** Retire le dernier arrêt de la ligne en cours de tracé (et les points de passage du tronçon qui y menait) */
  railUndo() {
    const e = this.railEdit;
    if (!e?.stops.length) return;
    e.stops.pop();
    e.via.length = Math.max(0, e.stops.length - 1);
    this.ui.update();
  }

  /** Le tracé de la voie redevient automatique : plus aucun point de passage */
  railAuto() {
    const e = this.railEdit;
    if (!e) return;
    e.via = e.via.map(() => []);
    audio.sfxClick();
    this.ui.update();
  }

  /** Ce qui empêche de valider le tracé de la voie (null : rien) */
  railTrouble() { return this.trackEdit.trouble(); }

  /** Valide la ligne tracée : le train s'y met en route ; un tronçon qui ne passe pas par les points choisis est refusé */
  railFinish() {
    const e = this.railEdit;
    if (!e || e.stops.length < 2) return;
    const r = this.railway, twin = r.sameAs(e.stops, e.line ?? undefined), trouble = this.trackEdit.trouble();
    if (twin) { this.ui.toast(`🚂 Ce parcours existe déjà (${r.lineLabel(twin)}) : sur une voie unique, un seul train peut y rouler.`); return; }
    if (trouble) { this.ui.toast(`🚂 ${trouble}`); return; }
    this.railCancel();
    if (e.line !== null) r.setStops(e.line, e.stops, e.via); else r.addLine(e.stops, e.via);
    const l = e.line !== null ? this.world.lines.find((x) => x.id === e.line) : this.world.lines[this.world.lines.length - 1], tr = l ? r.trains.get(l.id) : undefined;
    audio.sfxPlace();
    this.ui.toast(tr?.why ? `🚂 ${tr.why}` : `🚂 Ligne ${e.line !== null ? 'modifiée' : 'ouverte'} : ${l ? r.lineLabel(l) : ''}.`);
    this.ui.update();
  }

  railCancel() {
    this.railEdit = null;
    this.tools.picking = false;
    this.ui.update();
  }

  /** La caméra suit l'expédition donnée (null : elle redevient libre) */
  follow(id: number | null) {
    const a = this.expeditions.active.find((e) => e.id === id);
    this.following = a ? a.id : null;
    if (a) this.trainCam = null;
    // on cesse de suivre : la vue reste où elle est
    if (!a) this.autoUnder = false;
    // assez près pour voir l'équipe (de petits personnages) ; on se rapproche encore quand elle arrive sur place
    if (a) { const p = this.agents.partyPositions(a.party)[0]; if (p) this.cam.follow(p[0], p[1], 10); this.followPhase = ''; this.followLast = null; }
  }
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
    return { stream: stream * zoom, cascade: cascade * zoom, coast: coast * zoom, fire: Math.max(this.life.fireNear(f), this.fires.nearness(f.x, f.z)) * zoom, alt: Math.max(0, w.hAt(f.x, f.z)), frogs: this.fauna.frogsNear(f.x, f.z, 9) * zoom };
  }

  /** Réveille le volcan de la case donnée : éruption, grondement et animaux qui détalent */
  erupt(cell: number) {
    if (!this.eruptions.start(cell)) return;
    audio.sfxEruption(ERUPTION_DUR);
    this.ui.toast('Le volcan entre en éruption !');
    // la première éruption de la partie : la vue file sur le volcan pour ne pas la manquer
    if (!this.volcanoSeen) {
      this.volcanoSeen = true;
      this.follow(null);
      this.cam.goTo((cell % N) + 0.5, Math.floor(cell / N) + 0.5, 34);
    }
  }

  /** Descend par l'entrée (grotte ou faille) de la case donnée */
  async enterUnder(cell: number) {
    if (this.mode === 'under') return;
    this.tools.setTool('none');
    this.fadeThrough(async () => {
      const { UnderView } = await loadUnder();
      this.under.sync();
      this.underView ??= new UnderView(this.world, this.under);
      this.underView.fx.onClash = (k) => this.audio.sfxClash(k);
      this.underView.onPick = () => this.audio.sfxMine();
      this.underView.build();
      this.surfaceView = this.cam.view();
      this.surfaceZoom = { min: this.cam.minDist, max: this.cam.maxDist };
      this.mode = 'under';
      document.body.classList.add('under');
      this.cam.minDist = 2.4;
      this.cam.maxDist = 24;
      this.cam.minPitch = 0.95;
      const x = (cell % N) + 0.5, z = Math.floor(cell / N) + 0.5;
      this.cam.jump({ x, z, dist: 11, pitch: 1.05 }, this.underView.groundY(x, z));
      this.cam.handler = this.underInput;
      canvas.style.cursor = '';
      this.ui.banner('Monde souterrain', `${UZ_NAMES[this.under.zoneAt(x, z)]} : torches, cristaux et créatures. Le puits de lumière ramène à la surface.`);
      this.ui.update();
    }, 'Descente sous terre…');
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

  /** Remonte à la surface, devant l'entrée empruntée (ou celle donnée) ; remonter soi-même cesse de suivre la troupe */
  exitUnder(cell?: number, auto = false) {
    if (this.mode !== 'under') return;
    if (!auto && this.autoUnder) { this.autoUnder = false; this.following = null; }
    this.fadeThrough(() => {
      this.mode = 'surface';
      document.body.classList.remove('under');
      this.underView?.leave();
      this.torchMode = false;
      this.digMode = false;
      this.cam.minDist = this.surfaceZoom.min;
      this.cam.minPitch = 0.25;
      this.cam.maxDist = this.surfaceZoom.max || this.cam.maxDist;
      const v = this.surfaceView ?? this.cam.view();
      if (cell !== undefined) { v.x = (cell % N) + 0.5; v.z = Math.floor(cell / N) + 0.5; v.dist = Math.min(v.dist, 16); }
      this.cam.jump(v, this.world.hAt(v.x, v.z));
      this.cam.handler = this.tools;
      canvas.style.cursor = '';
      this.saveNow();
    }, 'Retour à la surface…');
  }

  private underClick(e: PointerInfo) {
    const uv = this.underView;
    if (!uv) return;
    const ray = this.cam.ray(e.x, e.y, canvas.clientWidth, canvas.clientHeight);
    const p = uv.pick(ray);
    // creuser : la roche cliquée (et le tunnel jusqu'à elle) entre dans la file des mineurs ; une case prévue s'annule
    if (this.digMode) {
      if (!p) return;
      const r = this.expeditions.planDig(this.digCell(p));
      if (typeof r === 'string') { this.ui.toast(r); audio.sfxClick(); }
      else if (r) audio.sfxMine(); else audio.sfxDestroy();
      // la case visée se redessine : prévue, elle n'est plus qu'un contour (un clic l'annulerait)
      this.underInput.hover(e);
      this.ui.update();
      return;
    }
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
    // un filon dans la paroi : seule une expédition armée peut l'abattre (créatures, galeries profondes)
    const ore = uv.veinAt(p.x, p.z);
    if (ore) {
      const deep = MISSIONS.find((m) => m.id === 'deep')!, miss = this.expeditions.missing(deep);
      audio.sfxClick();
      if (this.sim.age < deep.age) this.ui.toast(`⛏️ Filon de ${ore.name} (${ore.amount} minerai) : il faudra une expédition armée, à l’âge ${AGES[deep.age].name}.`);
      else if (miss.length) this.ui.toast(`⛏️ Filon de ${ore.name} : seule une expédition armée peut l’abattre. Il faut d’abord ${miss.join(', ')}.`);
      else this.ui.toast(`⛏️ Filon de ${ore.name} (${ore.amount} minerai) : envoyez une expédition armée pour l’abattre.`, () => this.ui.openExpeditions());
      return;
    }
    if (uv.mobs.scare(p.x, p.z)) { audio.sfxClick(); return; }
    // des cristaux : ils tintent, et l'on dit où se trouve le minerai
    if (uv.crystalNear(p.x, p.z)) { audio.sfxClick(); this.ui.toast('✨ Les cristaux éclairent les galeries. Le minerai, lui, est dans les filons : les taches colorées des parois.'); }
  }

  /** Case visée en mode Creuser : celle du point cliqué ; sur le flanc d'une paroi, la roche la plus proche plutôt que le sol */
  private digCell(p: THREE.Vector3) {
    const u = this.under, cx = Math.floor(p.x), cz = Math.floor(p.z), k = cz * N + cx;
    if (cx < 0 || cz < 0 || cx >= N || cz >= N) return -1;
    if (!u.open[k] || p.y < 0.45) return k;
    let best = k, bd = Infinity;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = k + dz * N + dx, d = Math.hypot(cx + dx + 0.5 - p.x, cz + dz + 0.5 - p.z);
      if (!u.open[n] && d < bd) { bd = d; best = n; }
    }
    return best;
  }

  /**
   * Creuser un tunnel (depuis l'onglet Profondeurs) : la vue descend sous terre là où la roche est la plus mince vers d'autres
   * galeries, en mode Creuser
   */
  digTunnel() {
    const hint = this.expeditions.tunnelHint(), at = hint[0] ?? this.expeditions.outposts()[0]?.entry ?? -1;
    this.torchMode = false;
    this.digMode = true;
    const tip = hint.length ? `⛏️ Creuser : les marques montrent le passage le plus court (${hint.length} case${hint.length > 1 ? 's' : ''} de roche). Cliquez sur la dernière marque, les mineurs creusent jusque-là.` : '⛏️ Creuser : cliquez sur la roche tout contre une galerie tenue.';
    if (this.mode === 'under') {
      if (at >= 0) this.cam.goTo((at % N) + 0.5, Math.floor(at / N) + 0.5, 12);
      this.ui.toast(tip);
      this.ui.update();
      return;
    }
    if (at < 0) { this.enterNearest(); return; }
    this.enterUnder(at);
    setTimeout(() => this.ui.toast(tip), 1200);
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
      // Échap ferme d'abord la fenêtre ouverte
      if (k === 'escape' && this.ui.closeTop()) return;
      // sous terre : U remonte, T bascule les torches, C le creusement, les outils de surface sont inactifs
      if (this.mode === 'under') {
        if (k === 'escape' && this.digMode) { this.digMode = false; this.ui.update(); }
        else if (k === 'u' || k === 'escape') this.exitUnder();
        else if (k === 't') { this.torchMode = !this.torchMode; this.digMode = false; this.ui.update(); }
        else if (k === 'c') { this.digMode = !this.digMode; this.torchMode = false; this.ui.update(); }
        else if (k === ' ') { e.preventDefault(); this.time.paused = !this.time.paused; }
        return;
      }
      if (k === 'u') { this.enterNearest(); return; }
      // R tourne le bâtiment en main ou celui qu'on a choisi ; sinon c'est l'outil Route
      if (k === 'r' && (this.tools.holding() || this.tools.selected !== null)) { this.tools.rotate(); return; }
      const tool = digit !== undefined ? map[digit] : /^[0-9]$/.test(k) ? undefined : map[k];
      // R, l'outil Route déjà en main : on passe du tracé en ligne au tracé libre, et retour
      if (tool === 'road' && this.tools.tool === 'road') {
        this.tools.setRoadMode(this.tools.roadMode === 'line' ? 'free' : 'line');
        this.ui.toast(this.tools.roadMode === 'free' ? 'Route libre : un clic au point A, un clic au point B.' : 'Route en ligne : glissez, case par case.');
        audio.sfxClick();
      } else if (tool) { this.tools.setTool(tool); audio.sfxClick(); }
      else if (k === 'b') { this.tools.setTool('build', this.tools.kind); }
      else if (k === 't') this.tools.rotate();
      else if (k === 'escape' && this.railEdit) this.railCancel();
      else if (k === 'enter' && this.railEdit) this.railFinish();
      else if (k === 'escape') { this.tools.escape(); this.setPhoto(false); }
      else if (k === ' ') { e.preventDefault(); this.time.paused = !this.time.paused; }
      else if (k === 'v' || k === 'home') this.goHome();
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
    for (let i = 0; i < this.railView.lights.length; i += 2) pts.push(this.railView.lights[i], this.railView.lights[i + 1], 0.95, 0.6);
    this.halos.set(pts);
  }

  private refreshSeason(force = false) {
    computeSeason(this.time, this.season);
    const key = Math.floor(this.time.seasonT * 120);
    if (force || key !== this.seasonKey) {
      this.seasonKey = key;
      // les teintes du sol changent par bandes, sur quelques images
      if (force) this.terrain.update(this.season); else this.terrain.recolor(this.season);
      // neige sur les toits selon le biome (la carte a pu changer)
      const w = this.world;
      setSnowMap(N, (k) => SNOWY[w.biome[k]] ?? 1);
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
    stepWind(this.elapsed, this.env.rainK);
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
      if (w.biomeVersion !== this.biomeV) { this.biomeV = w.biomeVersion; setSnowMap(N, (k) => SNOWY[w.biome[k]] ?? 1); }
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
    else this.atmosphere.hideMist();
    SNOW.value = uv ? 0 : this.season.snow;
    this.sim.rain = this.env.rainK;
    this.sim.season = this.time.season;
    this.sim.update(gdt, dt);
    this.eruptions.update(dt);
    this.fauna.alarm = this.eruptions.alarm();
    this.fires.update(dt);
    this.wakeVolcano(gdt, dt);
    // nouvelles du village : incendies, feux éteints, bâtiments perdus
    for (const m of this.fires.news.splice(0)) this.ui.toast(m);
    for (const m of this.emergencies.news.splice(0)) this.ui.toast(m);
    for (const m of w.losses.splice(0)) this.ui.toast(m);
    this.agents.update(gdt, this.time.hour, this.sim.age, this.env.rainK > 0.6, this.sim.pop, this.env.night, this.time.season);
    this.cam.pace = this.time.paused ? 1 : this.time.speed;
    this.expeditions.speed = this.time.speed;
    this.expeditions.update(gdt);
    this.stepFarewell();
    this.railway.update(gdt);
    this.expView.update(gdt);
    this.spaceCast.update(this.expeditions.active);
    // une équipe rentre victorieuse : tout le village fait la fête au cœur du village, à la mode de son âge
    for (const a of this.expeditions.active) if (a.phase === 'home' && a.ok && !a.fromCamp && !this.feted.has(a.id)) { this.feted.add(a.id); this.fest.start(a.base[0], a.base[1], this.sim.age); }
    this.fest.update(dt);
    this.pens.update(gdt);
    // la caméra accompagne l'équipe
    const followed = this.following === null ? null : this.expeditions.active.find((e) => e.id === this.following);
    // une troupe armée suivie : quand elle est sous terre, la vue y descend avec elle ; elle remonte quand l'expédition est finie
    const below = !!followed && followed.entry >= 0 && followed.phase === 'work';
    if (below && this.mode === 'surface' && !this.autoUnder) { this.autoUnder = true; this.enterUnder(followed!.entry); }
    else if (this.autoUnder && !below && this.mode === 'under') { this.autoUnder = false; this.exitUnder(undefined, true); }
    if (!followed) this.following = null;
    else if (!uv) {
      const pos = this.agents.partyPositions(followed.party);
      if (pos.length && !below) {
        let x = pos.reduce((s, p) => s + p[0], 0) / pos.length, z = pos.reduce((s, p) => s + p[1], 0) / pos.length;
        // sur place, la vue se pose entre l'équipe et le cœur de la scène (l'enclos, la barque, la montgolfière…), et se rapproche
        const f = followed.phase === 'work' ? this.expView.focusOf(followed.id) : null;
        let lift = 0;
        if (f && Math.hypot(f[0] - x, f[1] - z) < 4) { x = (x + f[0]) / 2; z = (z + f[1]) / 2; lift = this.expView.liftOf(followed.id) * 0.6; }
        const arrived = followed.phase === 'work' && this.followPhase !== 'work';
        this.followPhase = followed.phase;
        // en route (à cheval surtout), la vue vise un peu devant l'équipe, là où elle va : elle ne la regarde plus filer
        const last = this.followLast;
        this.followLast = [x, z];
        if (last && followed.phase !== 'work' && gdt > 0) {
          const vx = (x - last[0]) / gdt, vz = (z - last[1]) / gdt, sp = Math.hypot(vx, vz);
          if (sp < 8) { this.followVel[0] += (vx - this.followVel[0]) * 0.1; this.followVel[1] += (vz - this.followVel[1]) * 0.1; }
          x += this.followVel[0] * 0.6; z += this.followVel[1] * 0.6;
        } else this.followVel = [0, 0];
        this.cam.follow(x, z, arrived ? 6.5 : undefined, lift);
      }
    } else {
      const p = uv.troopAt(followed.id);
      if (p) this.cam.follow(p[0], p[1]);
    }
    // la surface ne s'anime que lorsqu'on la regarde
    if (uv) {
      // les troupes armées en train de parcourir les galeries
      uv.setTroops(this.expeditions.active.filter((a) => a.entry >= 0 && a.phase === 'work').map((a) => ({
        id: a.id, kind: a.c.troop ?? 'miners', n: a.party.length, entry: a.entry, targets: a.targets, front: a.front, ambush: a.ambush, progress: Math.min(1, a.t / Math.max(1, a.c.work + a.extra)), age: this.sim.age,
      })), dt);
      uv.age = this.sim.age;
      // les mineurs descendus par les trains, une équipe par ligne
      uv.setMiners([...this.railway.trains.values()].filter((t) => !t.why && t.mine >= 0 && t.crew.length).map((t) => ({ id: t.line.id, n: t.crew.length, entry: t.stops[t.mine].entry, vein: t.vein })), this.sim.age, gdt);
      // les mineurs du camp au front du tunnel ; en mode Creuser, le passage conseillé
      uv.setDigs(this.world.digs, this.expeditions.digProgress(), this.digMode ? this.expeditions.tunnelHint() : null, this.sim.age, gdt);
      uv.update(dt, this.cam.camera, this.cam.target, this.cam.dist, this.env.daylight);
    }
    else {
      this.buildings.update(dt, this.sim.age);
      this.fauna.update(gdt, this.elapsed, this.time.hour, this.time.season, this.env.rainK, this.sim.age, this.cam.camera);
      this.terrain.animateWater(this.elapsed, 1 - this.env.weatherK * 0.3);
      this.streams.update(dt, this.season.snow, this.cam.target);
      this.life.update(dt, this.time, this.season, this.env, this.cam.target);
      // pas de voiture sur les routes tant que l'usine automobile n'est pas bâtie : des charrettes jusque-là
      this.traffic.motor = (this.sim.counts.carworks ?? 0) > 0;
      this.traffic.update(gdt, this.time.hour, this.sim.age, this.sim.pop);
      this.helis.update(gdt, this.sim.age);
      this.airships.update(gdt, this.time.hour, this.sim.age);
      this.fairground.update(dt);
      this.alpine.update(gdt, this.sim.age, this.season.snow);
      this.emergencies.motor = this.traffic.motor;
      this.emergencies.update(gdt, this.sim.age);
      this.hoists.update(gdt);
      this.seeps.update(dt);
      this.transports.update(gdt, this.sim.age);
      this.railView.update(dt, this.sim.age);
      if (this.railView.lightsVersion !== this.railLightsV) { this.railLightsV = this.railView.lightsVersion; this.refreshHalos(); }
      // la ligne en cours de tracé : une borne à chaque arrêt ; la voie prévue entre eux, que l'on saisit pour la déplacer
      this.railView.setPreview(this.railEdit ? this.railEdit.stops.map((id) => this.world.buildings.get(id)).filter((b): b is Building => !!b) : [], this.railEdit?.color ?? 0, false);
      this.trackEdit.update();
      const tr = this.trainCam === null ? undefined : this.railway.trains.get(this.trainCam), tp = tr ? this.railway.trainAt(tr) : null;
      if (tp) this.cam.follow(tp[0], tp[1]);
      else this.trainCam = null;
      // l'incident suivi : la caméra reste dessus (sur le véhicule en route), jusqu'à ce qu'il soit fini
      if (this.incidentCam) { const i = this.incidents().find((x) => x.key === this.incidentCam); if (i) this.cam.follow(i.x, i.z); else this.incidentCam = null; }
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
    if (this.uiTimer <= 0) { this.uiTimer = 0.25; this.ui.update(); this.tutorial.update(); }
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
  const start = (map: number, mode: 'continue' | 'new', seed?: number, difficulty?: Difficulty) => {
    if (started) return;
    started = true;
    // les anciennes cartes (île, vallée, plateaux) n'existent plus : on joue sur le continent
    if (!mapDef(map)) map = CONTINENT;
    menu?.remove();
    // tailles des tableaux du monde, des vues et de la caméra
    setMapSize(mapDef(map)!.size);
    syncChunks();
    (window as any).__game = new Game(map, mode, seed, difficulty);
  };
  const auto = sessionStorage.getItem(AUTOSTART);
  let menu: HTMLElement | null = null;
  if (auto) {
    sessionStorage.removeItem(AUTOSTART);
    const [m, mode, diff] = auto.split('|');
    start(+m, mode === 'continue' ? 'continue' : 'new', undefined, isDifficulty(diff) ? diff : undefined);
    return;
  }
  menu = showMenu(uiRoot, {
    start: (map, mode, seed, difficulty) => start(map, mode, seed, difficulty),
    importFile: async (f) => {
      try { const d = await readSaveFile(f); saveSlot(d); start(d.map, 'continue'); }
      catch (e) { alert('Import impossible : ' + (e as Error).message); }
    },
  });
  void KINDS;
}
void boot();
