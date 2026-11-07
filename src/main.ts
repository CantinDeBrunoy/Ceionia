import './style.css';
import * as THREE from 'three';
import { World, N, VEG_VOLCANO, setMapSize } from './world/world';
import { Underground, UZ_NAMES } from './world/underground';
import type { UnderView } from './render/underView';
/**
 * Le monde souterrain (décor, créatures) est chargé à part, à la première descente. Il n'est plus accessible au joueur (retiré
 * du jeu) : le moteur (vue, troupes, combats, caméra) reste pour les Enfers ; `__game.enterUnder(case)` y descend encore
 */
let underModule: Promise<typeof import('./render/underView')> | null = null;
const loadUnder = () => (underModule ??= import('./render/underView'));
import type { HellMode } from './hellMode';
let hellModule: Promise<typeof import('./hellMode')> | null = null;
const loadHell = () => (hellModule ??= import('./hellMode'));
import { newWorld, addDefaultDecor, mapDef, newSeed, CONTINENT } from './world/mapgen';
import { GEN } from './world/continent';
import { TerrainView, SNOWY } from './render/terrainView';
import { BuildingView } from './render/buildings';
import { RoadView, roadSnowStep } from './render/roads';
import { stepWind } from './render/wind';
import { Helis } from './render/helis';
import { Airships } from './render/airships';
import { Fairground } from './render/fairground';
import { ZooView } from './render/zoo';
import { AlpineView } from './render/alpine';
import { Emergencies } from './render/emergency';
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
import { L_GONE, L_LIFT } from './render/expeditionScenes';
import { Parade, Spot } from './render/parade';
import { Fires } from './render/fires';
import { Traffic } from './render/traffic';
import { GardenView } from './render/gardens';
import { Halos } from './render/halos';
import { RailBoost } from './render/railBoost';
import { UpgradeBadges } from './render/upgradeBadges';
import { Expeditions, isBelow } from './sim/expeditions';
import { Railway, LINE_COLORS } from './sim/railway';
import { RailView } from './render/railway';
import { RailEditState, TrackEditor } from './build/trackEdit';
import { ExpeditionView, followPoint } from './render/expeditionView';
import { Festivities } from './render/festivities';
import { Trophies, trophiesWon } from './render/trophies';
import { HomeButton, awayFromHome } from './ui/homeButton';
import { PenView } from './render/pens';
import { OilSeeps } from './render/oilSeeps';
import { PortalView } from './render/portal';
import { ISLE_UP, ISLE_WAKE } from './render/expeditionScenes';
import { holdIsle, isleDefenses } from './world/portal';
import { War } from './sim/war';
import { KingdomStage } from './kingdomStage';
import { WarTips, WarTipState } from './ui/warTips';
import { BattleLayer } from './render/battleUnits';
import { CommandUI, Theater } from './ui/command';
import { SaveData, Settings, Quality, saveSlot, loadSlot, deleteSlot, exportSave, readSaveFile, loadSettings, saveSettings } from './save/save';
import { Difficulty, isDifficulty, rulesOf } from './sim/difficulty';
import { AdaptiveQuality, GfxParams, MAX_LEVEL, paramsAt } from './render/adaptive';
import { weakGpu, probeRenderer } from './render/gpu';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;
const coarse = window.matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
if (coarse) document.body.classList.add('low-fx');

// puce graphique modeste (intégrée, logicielle) : pas d'anticrénelage multi-échantillons, et le réglage « Auto » part plus bas
const weak = weakGpu(probeRenderer(), navigator.hardwareConcurrency ?? 8);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse && !weak, powerPreference: 'high-performance' });
// finesse de l'image plafonnée (1,5 pixel par point d'écran au plus) : voir `applyQuality`
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

const audio = new AudioEngine();
/** distance de la caméra quand elle revient sur le village (assez près pour reconnaître ses maisons) */
const VILLAGE_DIST = 30;
/** la parade des colons, une fois la fusée lâchée par la caméra : secondes de jeu, et secondes réelles au moins, avant le voyage */
const PARADE_G = 10, PARADE_MS = 6000;
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
  /** qualité graphique choisie dans les réglages (« auto » : elle s'ajuste d'elle-même aux images qui traînent) */
  quality: Quality = 'auto';
  /** le contrôleur du réglage « Auto » (son palier), et les réglages graphiques en vigueur */
  private adaptive = new AdaptiveQuality();
  gfx: GfxParams = paramsAt(coarse ? 'low' : 'high', 0);
  /** routes automatiques jusqu'aux nouveaux bâtiments */
  autoRoads = true;
  hideUpBadges = false;
  fires: Fires;
  traffic: Traffic;
  helis: Helis;
  airships: Airships;
  fairground: Fairground;
  zoo: ZooView;
  alpine: AlpineView;
  emergencies: Emergencies;
  transports: Transports;
  gardens: GardenView;
  halos: Halos;
  /** pastilles « ⬆ » sur les bâtiments qui peuvent évoluer */
  upBadges: UpgradeBadges;
  expeditions: Expeditions;
  /** chemin de fer : ses lignes de gare en gare, le train que la caméra suit (numéro de sa ligne) */
  railway: Railway;
  railView: RailView;
  trainCam: number | null = null;
  /** ligne en cours de tracé : ses arrêts dans l'ordre, ses points de passage, et la ligne qu'elle remplacera (null : une nouvelle) */
  railEdit: RailEditState | null = null;
  /** clé du dernier calcul des arrêts possibles mis en valeur */
  private candCk = '';
  /** éditeur du tracé de la voie (la ligne en cours de tracé) */
  trackEdit: TrackEditor;
  expView: ExpeditionView;
  /** fêtes du retour des expéditions réussies, et les équipes déjà fêtées */
  fest: Festivities;
  /** les trophées des gros monstres vaincus, sur la grande place ; quand on les remet à jour */
  trophies: Trophies;
  private trophyT = 0;
  /** le bouton « Retourner au village », quand la vue s'éloigne de la grande place */
  private homeBtn: HomeButton;
  /** la mise en scène du royaume des Enfers (combat du roi, victoire) */
  kingStage: KingdomStage;
  /** les aides du volet militaire */
  warTips!: WarTips;
  /** l'alunissage en direct, pendant l'expédition « Un homme sur la Lune » */
  spaceCast: SpaceCast;
  private feted = new Set<number>();
  /** la caméra a déjà filé sur un volcan en éruption (la première fois seulement) */
  private volcanoSeen = false;
  /** la parade du grand départ : les haies de foule, le char et les confettis le long de la route jusqu'au pas de tir */
  parade: Parade;
  /**
   * le grand départ des colons : la foule qui fait la haie le long de la route (`spots` : ses places, `sent` : combien y sont déjà
   * envoyés), l'instant où la caméra a lâché la fusée (`rel`, en temps de l'expédition, `relAt`, en temps réel), le voyage montré
   */
  private farewell: { id: number; crowd: number[]; spots: Spot[]; sent: number; rel: number | null; relAt: number; voyage: boolean } | null = null;
  pens: PenView;
  /** flaques de brut sur les gisements de pétrole */
  seeps: OilSeeps;
  railBoost: RailBoost;
  /** le portail des Enfers, sur son île (voir world/portal) */
  portalView: PortalView;
  /** la caméra suit l'expédition */
  /** expédition que la caméra suit (son numéro), ou null */
  following: number | null = null;
  /** étape de l'expédition suivie (pour se rapprocher à son arrivée sur place), sa dernière position et sa vitesse lissée */
  private followPhase = '';
  private followLast: [number, number] | null = null;
  /** le point suivi, lissé : le balancement du porte-fanion ne secoue plus la vue */
  private followSm: [number, number] | null = null;
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
  /** carte des ombres : position et orientation de la caméra à la dernière image, images depuis sa dernière mise à jour */
  private shadowPos = new THREE.Vector3();
  private shadowQ = new THREE.Quaternion();
  private shadowN = 0;
  /** version des lanternes des voies déjà données aux halos */
  private railLightsV = -1;
  private elapsed = 0;
  private windT = 0;
  private seasonKey = -1;
  /** créneau de saison des dernières teintes du sol */
  private groundKey = -9;
  /** neige sur les routes à leur dernière reconstruction pour la saison */
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
  private mode: 'surface' | 'under' | 'hell' = 'surface';
  /** monde des Enfers (mode développeur : `__game.enterHell()`), créé à la première visite */
  hellMode: HellMode | null = null;
  /** la guerre contre les Enfers : faction, incursions sur l'île du portail, armée (voir sim/war) */
  war: War;
  /** le contrôle direct des troupes (dans les Enfers, et sur l'île quand on la commande) */
  command!: CommandUI;
  /** les combattants de l'île du portail, dans la scène de la surface */
  private isleLayer: BattleLayer | null = null;
  /** on commande la garnison de l'île (la vue reste en surface) */
  isleCmd = false;
  private surfaceView: ReturnType<CameraRig['view']> | null = null;
  private surfaceZoom = { min: 10, max: 0 };
  private fading = false;
  /** entrées sous terre : créatures, puits de jour */
  private underInput: ToolInput = {
    down: (e) => this.underClick(e),
    move: () => {},
    up: () => {},
    cancel: () => {},
    hover: (e) => {
      const uv = this.underView, p = uv?.pick(this.cam.ray(e.x, e.y, canvas.clientWidth, canvas.clientHeight));
      canvas.style.cursor = p && uv!.entranceAt(p.x, p.z) ? 'pointer' : '';
    },
  };

  /** `seed` : graine d'une nouvelle partie (tirée au hasard sans elle) ; `difficulty` : la sienne (normale sans elle) */
  constructor(mapId: number, mode: 'continue' | 'new', seed?: number, difficulty: Difficulty = 'normal') {
    const w = this.world;
    const save = mode === 'continue' ? loadSlot(mapId) : null;
    const settings = { ...loadSettings(), ...(save?.settings ?? {}) } as Partial<Settings>;
    this.sim = new Sim(w);
    this.under = new Underground(w);
    this.war = new War(w);
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
      newWorld(w, mapId, seed ?? newSeed(), GEN);
      w.difficulty = difficulty;
      w.wood = rulesOf(difficulty).startWood; w.stone = rulesOf(difficulty).startStone;
    }
    this.war.load(w.war);
    Object.assign(this.time, { dayLen: settings.dayLen ?? 100, seasonLen: settings.seasonLen ?? 160, speed: settings.speed ?? 1 });
    Object.assign(audio, { musicVol: settings.musicVol ?? 0.5, sfxVol: settings.sfxVol ?? 0.7, muteMusic: settings.music !== true, muteSfx: settings.sfx !== true });
    if (settings.quality) this.quality = settings.quality;
    this.adaptive.level = Math.max(0, Math.min(MAX_LEVEL, Math.round(settings.autoLevel ?? (weak ? 2 : 0))));
    this.autoRoads = settings.autoRoads ?? true;
    this.hideUpBadges = settings.hideUpBadges ?? false;
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
    this.agents.camera = this.cam.camera;
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
    this.zoo = new ZooView(w, this.buildings);
    this.alpine = new AlpineView(w, this.buildings);
    this.emergencies = new Emergencies(w, this.fires, this.roads.islands);
    this.fires.responder = this.emergencies;
    // les pompiers et les voisins au seau : ils restent tant que ça brûle, et leur eau éteint le feu
    this.fires.pails = (b) => this.agents.pails(b);
    this.agents.burning = (id) => this.fires.burning.some((b) => b.id === id);
    this.transports = new Transports(w, this.buildings);
    // jardins : lieux qui changent avec les âges ; leurs feux fument et crépitent comme les foyers
    this.gardens = new GardenView(w);
    // halos de lumière des feux et des lanternes, la nuit
    this.halos = new Halos(w);
    this.upBadges = new UpgradeBadges(w);
    this.upBadges.hidden = this.hideUpBadges;
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
    this.parade = new Parade(w);
    this.trophies = new Trophies(w);
    this.scene.add(this.trophies.group);
    this.parade.onPop = () => this.audio.sfxBang(0.12);
    this.expView.fx.onClash = (k) => this.audio.sfxClash(k);
    // le chemin de fer : un train par ligne, de gare en gare
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
    this.railBoost = new RailBoost(w);
    this.portalView = new PortalView(w);
    this.scene.add(this.portalView.group);
    this.life.extraChimneys = (out) => this.gardens.chimneys(out);
    // la foudre et les bombes de lave mettent le feu aux bâtiments ; les habitants accourent
    const ignite = (b: Building | undefined) => { if (b && this.fires.ignite(b)) { this.agents.alert(b.z * N + b.x); audio.sfxDestroy(); } };
    this.emergencies.ignite = (b) => ignite(b);
    // (une fois sur deux seulement : les incendies restent des événements)
    this.atmosphere.onStrike = (x, z) => { if (Math.random() < 0.5) ignite(w.buildingAt(Math.floor(x), Math.floor(z))); };
    this.eruptions.onImpact = (k) => { if (w.disasters && w.occ[k] && Math.random() < 0.3) ignite(w.buildings.get(w.occ[k])); };
    this.life.onSplash = (x, z) => audio.sfxSplash((1 - Math.min(1, Math.hypot(x - this.cam.target.x, z - this.cam.target.z) / 25)) * Math.min(1, 40 / this.cam.dist));
    // le hurlement d'une meute, plus faible au loin
    this.fauna.onHowl = (x, z) => { const k = (1 - Math.min(1, Math.hypot(x - this.cam.target.x, z - this.cam.target.z) / 40)) * Math.min(1, 50 / this.cam.dist); if (k > 0.05) audio.sfxHowl(k); };
    this.scene.add(this.terrain.group, this.roads.group, this.veg.group, this.buildings.group, this.agents.group, this.fauna.group, this.eruptions.group, this.streams.group, this.atmosphere.group, this.life.group, this.fires.group, this.traffic.group, this.helis.group, this.airships.group, this.alpine.group, this.emergencies.group, this.transports.group, this.gardens.group, this.halos.mesh, this.upBadges.points, this.expView.group, this.fest.group, this.parade.group, this.pens.group, this.railView.group, this.seeps.group, this.railBoost.group);
    this.applyQuality();

    const host = this;
    this.tools = new ToolController({
      world: w, terrain: this.terrain, cam: this.cam, canvas, scene: this.scene, audio,
      getAge: () => this.sim.age,
      toast: (m) => this.ui.toast(m),
      changed: () => { this.propsDirty = true; this.ui?.refreshTools(); },
      erupt: (cell) => this.erupt(cell),
      get autoRoads() { return host.autoRoads; },
    });
    this.cam.handler = this.tools;
    this.ui = new UI(uiRoot, host);
    this.spaceCast = new SpaceCast(uiRoot);
    // le contrôle des troupes : ses ordres au clic droit (sans glisser), la barre des troupes, l'alerte d'incursion
    this.command = new CommandUI(uiRoot, {
      war: this.war, canvas, camKeys: this.cam.keys,
      age: () => this.sim.age, pop: () => this.sim.pop,
      paused: () => this.time.paused, togglePause: () => { this.time.paused = !this.time.paused; this.ui.update(); },
      toast: (m) => this.ui.toast(m), click: () => audio.sfxClick(),
      leaveIsle: () => this.leaveIsle(), leaveHell: () => this.exitHell(),
    });
    this.cam.rightClick = (e) => { if (this.command.active) this.command.rightClick(e); };
    this.homeBtn = new HomeButton(uiRoot, () => { audio.sfxClick(); this.goHome(); });
    // le royaume des Enfers : bannière, barre de vie du roi, tambours, cinématique et écran de la victoire
    this.kingStage = new KingdomStage({
      war: this.war, cam: this.cam, world: w, scene: this.scene, ui: this.ui, audio,
      mode: () => this.mode, hellView: () => (this.mode === 'hell' ? this.hellMode?.view ?? null : null),
      exitHell: () => this.exitHell(), goHome: () => this.goHome(),
    });
    this.expeditions.onNews = (m) => this.ui.toast(m);
    this.railway.onNews = (m) => this.ui.toast(m);
    // bouger la vue (glisser ou touches) lâche tout ce que la caméra suivait : train, incident, équipe d'expédition
    this.cam.onPan = () => { this.trainCam = null; this.incidentCam = null; if (this.following !== null) { this.follow(null); this.ui.update(); } };
    // tracer une ligne : un clic sur une gare l'ajoute aux arrêts ; la voie prévue se saisit et se déplace
    this.tools.pickStop = (b) => this.railPick(b);
    this.tools.overlay = this.trackEdit;
    this.expeditions.onEvent = (a) => { audio.sfxClick(); this.ui.expEvent(a); };
    this.expeditions.onReport = (r) => {
      if (r.ok) audio.sfxAgeUp(); else audio.sfxClick();
      // la colonie fondée sur une autre planète : la fin de la partie (on peut continuer à bâtir), à la place du récit
      if (r.ok && r.m.id === VICTORY && !r.redo) showVictory(uiRoot, { name: 'le village', pop: this.sim.pop, buildings: this.world.buildings.size, missions: this.world.exp.done.length, days: this.time.days }, undefined, () => this.toMenu());
      else this.ui.showReport(r);
      this.ui.update();
    };
    this.sim.onAgeUp = (age) => {
      // on ne revient pas en arrière par-dessus un passage d'âge (Ctrl+Z rendrait des bâtiments comptés comme neufs)
      this.tools.undoStack.length = 0; this.tools.redoStack.length = 0;
      // la garnison gagne en vie et en force avec l'âge
      this.war.ageUp(age);
      this.ui.banner(`Nouvel âge : ${AGES[age].name}`, AGES[age].tagline);
      // la liste de ce que l'âge apporte, comme dans Cities: Skylines : de quoi bâtir sans chercher
      // d'abord le message de passage d'âge (la bannière reste ~4,2 s), puis la fenêtre des bâtiments
      setTimeout(() => this.ui.showNewAge(age), 4600);
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
    // une partie neuve : la vue se pose sur le centre de la place du village à venir (3 × 3 libres près du milieu de la carte)
    if (!w.buildings.size) { const [sx, sz] = w.startSpot(), S = KINDS.gather.size; this.cam.homeAt = [sx + S / 2, sz + S / 2]; }
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
    // les aides du volet militaire (bulles facultatives, au moment utile)
    this.warTips = new WarTips({
      root: this.ui.root, state: () => this.warTipState(), click: () => audio.sfxClick(), hideHelp: () => this.ui.setHelp(false),
      busy: () => this.tutorial.on || !!this.ui.root.querySelector('.overlay:not(#menu)') || this.kingStage.playing || document.body.classList.contains('photo'),
      act: (id) => { if (id === 'portal') this.ui.gotoMission('portal'); else if (id === 'isle') this.goIsle(); else if (id === 'garrison') this.commandIsle(); else if (id === 'kingdom') this.kingStage.focusFight(); },
    });
    this.ui.toast(save ? 'Bon retour dans votre village !' : w.buildings.size ? 'Choisissez un bâtiment dans « Bâtir » ou sculptez le terrain.' : `Commencez par « ${this.sim.nameOf('gather')} », la place au centre du village (Bâtir › Vie & culture).`);
    requestAnimationFrame(() => this.frame());
  }

  // ---------- UIHost ----------
  applySettings() {
    audio.applyVolumes();
    saveSettings(this.settings());
  }
  settings(): Settings {
    return { dayLen: this.time.dayLen, seasonLen: this.time.seasonLen, speed: this.time.speed, musicVol: audio.musicVol, sfxVol: audio.sfxVol, music: !audio.muteMusic, sfx: !audio.muteSfx, quality: this.quality, autoLevel: this.adaptive.level, disasters: this.world.disasters, autoRoads: this.autoRoads, unlimited: this.world.unlimitedSetting, hideUpBadges: this.hideUpBadges };
  }
  buildSave(): SaveData {
    this.world.war = this.war.save();
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
  underZone() { return this.mode === 'under' ? UZ_NAMES[this.under.zoneAt(this.cam.target.x, this.cam.target.z)] : this.mode === 'hell' && this.hellMode ? `🔥 ${this.hellMode.zoneName(this.cam.target.z)}` : null; }

  // ---------- Monde des Enfers (expéditions facultatives, par le portail de l'île) ----------
  /** Entre dans les Enfers, devant le portail : on y commande les troupes qui l'ont passé */
  async enterHell() {
    if (this.mode !== 'surface') return;
    this.leaveIsle(true);
    this.tools.setTool('none');
    this.fadeThrough(async () => {
      const { HellMode } = await loadHell();
      const f = this.war.ensureFaction();
      if (!this.hellMode || this.hellMode.hell !== f) this.hellMode = new HellMode(this.war.hellMap!, f, this.war.king);
      const hm = this.hellMode;
      hm.view.fight = this.war.king;
      hm.view.fx.onClash = (k) => this.audio.sfxClash(k);
      hm.view.build();
      this.surfaceView = this.cam.view();
      this.surfaceZoom = { min: this.cam.minDist, max: this.cam.maxDist };
      this.mode = 'hell';
      this.war.hellInView = true;
      this.war.hellFx.length = 0;
      document.body.classList.add('under', 'hell');
      this.cam.minDist = 2.4; this.cam.maxDist = 30; this.cam.minPitch = 0.95;
      // (à la base avancée la plus loin, s'il y en a une)
      const [x, z] = this.war.base?.spawnPoint() ?? hm.map.arrival;
      this.cam.jump({ x, z: z + 4, dist: 14, pitch: 1.05, yaw: Math.PI }, hm.view.groundY(x, z));
      this.cam.handler = this.command;
      this.command.setTheater(this.hellTheater(hm));
      this.ui.banner('Monde des Enfers', `${hm.zoneName(z)} : le royaume démoniaque est tout au fond. Expédition facultative ; le portail ramène sur l’île.`);
      this.ui.update();
    }, 'Passage du portail…');
  }

  /** Quitte les Enfers pour la surface */
  exitHell() {
    if (this.mode !== 'hell') return;
    this.fadeThrough(() => {
      this.mode = 'surface';
      this.war.hellInView = false;
      document.body.classList.remove('under', 'hell');
      this.hellMode?.view.leave();
      this.command.setTheater(null);
      this.cam.minDist = this.surfaceZoom.min; this.cam.minPitch = 0.25;
      this.cam.maxDist = this.surfaceZoom.max || this.cam.maxDist;
      const v = this.surfaceView ?? this.cam.view();
      this.cam.jump(v, this.world.hAt(v.x, v.z));
      this.cam.handler = this.tools;
      canvas.style.cursor = '';
    }, 'Retour à la surface…');
  }

  /** Le théâtre des Enfers pour le contrôle des troupes */
  private hellTheater(hm: HellMode): Theater {
    const v = new THREE.Vector3();
    return {
      kind: 'hell', sim: hm.hell, layer: hm.view.units,
      pick: (x, y) => { const p = hm.view.pick(this.cam.ray(x, y, canvas.clientWidth, canvas.clientHeight)); return p ? [p.x, p.z] : null; },
      screen: (x, z) => this.toScreen(v.set(x, hm.view.groundY(x, z) + 0.3, z)),
      focus: (x, z) => this.cam.goTo(x, z, this.cam.dist),
      ghost: (kind, x, z, ok, camp) => hm.view.ghost(kind, x, z, ok, camp),
    };
  }

  /** Un point de la scène à l'écran (pixels du canevas), null derrière la caméra */
  private toScreen(v: THREE.Vector3): [number, number] | null {
    v.project(this.cam.camera);
    if (v.z > 1) return null;
    return [(v.x + 1) / 2 * canvas.clientWidth, (1 - v.y) / 2 * canvas.clientHeight];
  }

  // ---------- L'île du portail : sa garnison au combat ----------

  /** Le théâtre de l'île (coordonnées de la carte de l'île, posée sur le monde) */
  private isleTheater(): Theater | null {
    const isle = this.war.isle, layer = this.isleLayer;
    if (!isle || !layer) return null;
    const v = new THREE.Vector3(), w = this.world, { ox, oz } = isle.map;
    return {
      kind: 'isle', sim: isle.sim, layer,
      pick: (x, y) => { const p = this.terrain.pick(this.cam.ray(x, y, canvas.clientWidth, canvas.clientHeight)); return p ? [p.x - ox, p.z - oz] : null; },
      screen: (x, z) => this.toScreen(v.set(x + ox, w.hAt(x + ox, z + oz) + 0.3, z + oz)),
      focus: (x, z) => this.cam.goTo(x + ox, z + oz, this.cam.dist),
    };
  }

  /** Prend le commandement de la garnison de l'île (la vue y va) */
  commandIsle() {
    if (this.mode === 'hell') { this.exitHell(); setTimeout(() => this.commandIsle(), 900); return; }
    if (this.mode !== 'surface' || !this.war.ensure()) return;
    this.syncIsleLayer();
    const t = this.isleTheater(), p = this.world.portal;
    if (!t || !p) return;
    this.follow(null); this.trainCam = null; this.incidentCam = null;
    this.tools.setTool('none');
    this.tools.select(null);
    this.isleCmd = true;
    this.cam.handler = this.command;
    this.command.setTheater(t);
    this.cam.goTo(p.x, p.z + 1, Math.min(Math.max(this.cam.dist, 18), 26));
    this.ui.update();
  }

  /** Quitte le commandement de l'île (`quiet` : sans rien dire) */
  leaveIsle(quiet = false) {
    if (!this.isleCmd) return;
    this.isleCmd = false;
    this.command.setTheater(null);
    if (this.mode === 'surface') this.cam.handler = this.tools;
    canvas.style.cursor = '';
    if (!quiet) this.ui.update();
  }

  /** « Voir l'île » : la vue va sur l'île du portail, au commandement */
  viewIsle() { this.commandIsle(); }

  /** La vue va sur l'île du portail (pour y bâtir ses défenses) */
  goIsle() {
    const p = this.world.portal;
    if (!p || this.mode !== 'surface') return;
    this.follow(null); this.trainCam = null; this.incidentCam = null;
    this.cam.goTo(p.x, p.z, Math.min(Math.max(this.cam.dist, 20), 32));
  }

  /** Les combattants de l'île dans la scène de la surface (refaits si la bataille a changé : partie rechargée) */
  private syncIsleLayer() {
    const isle = this.war.isle;
    if (this.isleLayer && (!isle || this.isleLayer.hell !== isle.sim)) { this.scene.remove(this.isleLayer.group); this.isleLayer.dispose(); this.isleLayer = null; }
    if (!isle || this.isleLayer) return;
    const w = this.world, { ox, oz } = isle.map;
    this.isleLayer = new BattleLayer(isle.sim, (x, z) => w.hAt(x + ox, z + oz));
    this.isleLayer.group.position.set(ox, 0, oz);
    this.isleLayer.fx.onClash = (k) => this.audio.sfxClash(k);
    this.scene.add(this.isleLayer.group);
  }

  /** Ce que regardent les aides du volet militaire */
  private warTipState(): WarTipState {
    const w = this.world, war = this.war, d = w.portal ? isleDefenses(w) : { towers: 0, barracks: 0 };
    return {
      age: this.sim.age, portalOpen: w.portalOpen, portalUnderway: this.expeditions.active.some((a) => a.m.id === 'portal'),
      towers: d.towers, barracks: d.barracks, isleTroops: war.army.troops.filter((t) => t.where === 'isle' && t.heal <= 0).length,
      commanding: this.command.theater?.kind ?? null, frontier: war.faction?.frontier ?? 1, camp: !!war.base?.countOf('camp'), victory: !!war.faction?.victory,
    };
  }

  /** La vue regarde l'île du portail (de près) */
  private lookingAtIsle() {
    const p = this.world.portal;
    return this.mode === 'surface' && !!p && Math.hypot(this.cam.target.x - p.x, this.cam.target.z - p.z) < p.r + 10 && this.cam.dist < 70;
  }

  /** La guerre : un pas, ses nouvelles, l'alerte d'incursion, les combattants de l'île à l'écran */
  private stepWar(dt: number, gdt: number) {
    const w = this.war, healK = (this.sim.counts.health ?? 0) > 0 ? 1.5 : 1;
    const raid = w.update(gdt, this.sim.age, healK);
    if (raid) audio.sfxRumble(4);
    const said = new Set<string>();
    for (const n of w.news.splice(0)) {
      // (plusieurs soldats au même moment : une seule nouvelle)
      if (said.has(n.text)) continue;
      said.add(n.text);
      // le combat du roi, la chute du royaume : la mise en scène s'en charge
      if (this.kingStage.news(n)) continue;
      if (n.kind === 'raid' || n.kind === 'lost') this.ui.toast(`${n.text} Cliquez ici pour voir l’île.`, () => this.viewIsle());
      else if ((n.kind === 'portal' || n.kind === 'counter' || n.kind === 'zone') && this.mode !== 'hell') this.ui.toast(`${n.text} Cliquez ici pour y aller.`, () => this.enterHell());
      // les vivres de la base avancée : un clic envoie un convoi
      else if (n.kind === 'supply') this.ui.toast(`${n.text} Cliquez ici pour envoyer un convoi de ravitaillement.`, () => { const why = w.sendConvoy(); this.ui.toast(why ?? '📦 Convoi parti du village : il passe le portail.'); });
      else this.ui.toast(n.text);
      if (n.kind === 'repelled' || n.kind === 'secured') audio.sfxAgeUp();
    }
    // l'alerte reste tant que dure l'incursion, si l'on ne regarde pas l'île
    const isle = w.isle;
    this.command.alert(isle?.raid && !(this.isleCmd && this.lookingAtIsle()) ? `🔥 Incursion sur l’île du portail : ${isle.raiders().length} démon${isle.raiders().length > 1 ? 's' : ''} !` : null, () => this.viewIsle());
    this.syncIsleLayer();
    if (this.isleLayer) {
      this.isleLayer.age = this.sim.age;
      if (this.mode === 'surface') this.isleLayer.update(dt, this.cam.camera, w.isleFx);
      else w.isleFx.length = 0;
      this.isleLayer.group.visible = this.mode === 'surface';
    }
    if (this.mode !== 'hell') w.hellFx.length = 0;
    this.kingStage.update(dt);
    // le commandement de l'île se perd si l'île n'est plus là (partie rechargée)
    if (this.isleCmd && this.command.theater?.sim !== isle?.sim) { const t = this.isleTheater(); if (t) this.command.setTheater(t); else this.leaveIsle(); }
  }

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
  setHideUpBadges(on: boolean) { this.hideUpBadges = on; this.upBadges.hidden = on; this.applySettings(); }
  /** Brouillard visible : la météo « brume » et la nappe au ras du sol (0 … 1) */
  fogLevel() { return Math.max(this.env.weatherKind === 'fog' ? this.env.weatherK : 0, this.atmosphere.mist); }
  /** Dissipe le brouillard et la brume ; ils ne reviennent pas avant un bon moment */
  dispelFog() { this.env.dispelFog(); this.atmosphere.dispel(300); }

  /** Incidents en cours (incendies, malaises, cambriolages), pour leurs cartes et la caméra */
  incidents() { return [...this.fires.incidents(), ...this.emergencies.incidents()]; }
  /** l'incident que la caméra suit */
  incidentCam: string | null = null;
  followIncident(key: string | null) {
    const i = key ? this.incidents().find((x) => x.key === key) : undefined;
    if (!i) { this.incidentCam = null; return; }
    // une seule chose suivie à la fois : la vue lâche l'équipe (et sa descente sous terre) ou le train
    this.follow(null); this.trainCam = null;
    this.incidentCam = i.key;
    // sous terre, on remonte droit sur l'incident
    if (this.mode === 'under') this.exitUnder(Math.floor(i.z) * N + Math.floor(i.x));
    this.cam.follow(i.x, i.z, 9);
  }

  /**
   * Le grand départ des colons, en carnaval : tout le village se range en deux haies le long de la route du cœur du village au
   * pas de tir (cases de route de préférence, tracé direct sans route), parmi les fanions, les musiciens, les confettis et un
   * char à plumes qui précède les colons ; ils défilent entre les haies jusqu'à la fusée. Dès que la caméra lâche la fusée qui
   * s'élève (ou qu'on ne la suit plus), la parade éclate (feu d'artifice, confettis à foison) et, quelques secondes après, le
   * voyage se montre en plein écran (le jeu attend), puis vient l'écran de fin
   */
  private stepFarewell(dt: number) {
    const a = this.expeditions.active.find((e) => e.m.farewell), ag = this.agents;
    let f = this.farewell;
    if (!a) { if (f) { ag.dismiss(f.crowd); this.farewell = null; } this.parade.stop(); return; }
    if (!f || f.id !== a.id) {
      if (f) ag.dismiss(f.crowd);
      const crowd = ag.recruit(Math.min(60, ag.available())) ?? [];
      // la route des colons : les cases que suivrait leur marche, du cœur du village au pas de tir (le tracé direct sans chemin)
      const cell = (p: number[]) => Math.min(N - 1, Math.max(0, Math.floor(p[1]))) * N + Math.min(N - 1, Math.max(0, Math.floor(p[0])));
      const path = ag.findPath(cell(a.base), cell(a.dest)) ?? [];
      const route: [number, number][] = [[a.base[0], a.base[1]], ...path.slice(0, -1).map((c): [number, number] => [(c % N) + 0.5, Math.floor(c / N) + 0.5]), [a.dest[0], a.dest[1]]];
      const spots = this.parade.start(route, [a.base[0], a.base[1]], [a.dest[0], a.dest[1]], this.sim.age, crowd.length);
      f = this.farewell = { id: a.id, crowd, spots, sent: 0, rel: null, relAt: 0, voyage: false };
      this.festAt(a.base[0], a.base[1]);
      this.ui.toast(`${a.m.icon} Tout le village sort dire adieu aux colons !`);
    }
    // la foule gagne sa place le long de la route, quelques-uns par image (chaque trajet se calcule) ; à défaut de place, elle
    // se range en cercle près du cœur du village
    for (let n = 0; n < 6 && f.sent < f.crowd.length; n++, f.sent++) {
      const i = f.sent, sp = f.spots[i];
      if (sp) ag.memberGo(f.crowd[i], sp.x, sp.z, sp.face);
      else {
        const ang = i * 2.4, r = 2.8 + (i % 4) * 0.5, x = a.base[0] + Math.cos(ang) * r, z = a.base[1] + Math.sin(ang) * r;
        ag.memberGo(f.crowd[i], x, z, Math.atan2(a.base[0] - x, a.base[1] - z));
      }
    }
    for (let i = 0; i < f.sent; i++) if (ag.memberDone(f.crowd[i])) ag.partyAct([f.crowd[i]], 'cheer');
    // la caméra lâche la fusée qui s'élève : elle va voir la parade, et la fête éclate
    const k = a.phase === 'work' ? a.t / Math.max(1, a.c.work + a.extra) : 0;
    if (f.rel === null && a.phase === 'work' && (k >= L_LIFT + 0.07 || (k >= L_LIFT && this.following !== a.id))) {
      f.rel = a.t; f.relAt = performance.now();
      if (this.following === a.id && this.mode === 'surface') {
        this.follow(null);
        const [mx, mz] = this.parade.middle();
        this.cam.goTo(mx, mz, Math.min(40, Math.max(18, this.parade.length * 0.8)));
      }
      this.festAt(a.base[0], a.base[1]);
      this.festAt(a.base[0], a.base[1]);
    }
    const lead = ag.partyPositions(a.party)[0];
    this.parade.update(dt, lead ? [lead[0], lead[1]] : null, f.rel !== null ? 1 : a.phase === 'gather' ? 0.3 : 0.6);
    // quelques secondes de parade, puis le grand voyage, plein écran et en temps réel, puis le récit (l'écran de fin)
    if (!f.voyage && a.phase === 'work' && f.rel !== null && ((a.t - f.rel >= PARADE_G && performance.now() - f.relAt >= PARADE_MS) || k >= 0.92 || a.t >= (a.c.work + a.extra) * L_GONE)) {
      f.voyage = true;
      const was = this.time.paused;
      this.time.paused = true;
      showVoyage(uiRoot, a.c.label.includes('saut'), () => { this.expeditions.landNow(a); this.time.paused = was; });
    }
  }

  /** La grande place du village (le lieu de rencontre de 3 × 3, sans entrée) la plus proche de (x, z), s'il y en a une */
  plazaNear(x: number, z: number): Building | null {
    let best: Building | null = null, bd = Infinity;
    for (const b of this.world.buildings.values()) {
      const s = sizeOf(b);
      if (b.kind !== 'gather' || s < 3) continue;
      const d = Math.hypot(b.x + s / 2 - x, b.z + s / 2 - z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  /** La fête du village : sur la grande place s'il y en a une (et au feu du clan, à la Préhistoire), sinon près de (x, z) */
  festAt(x: number, z: number) {
    const b = this.plazaNear(x, z);
    this.fest.start(x, z, this.sim.age, b ? { x0: b.x, z0: b.z, size: sizeOf(b), fire: b.age === 0 } : null);
  }

  /** La vue s'est éloignée du cœur du village, où la ramène « Retourner au village » (en surface seulement) */
  private awayFromHome() {
    const c = this.mode === 'surface' ? this.villageCenter() : null;
    if (!c) return false;
    const v = this.cam.view(), p = new THREE.Vector3(c[0], this.world.surfaceAt(c[0], c[1]), c[1]).project(this.cam.camera);
    return awayFromHome(Math.hypot(v.x - c[0], v.z - c[1]), v.dist, p.z < 1 ? p : null, this.homeBtn.shown);
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
    // une seule chose suivie à la fois
    this.follow(null); this.incidentCam = null;
    if (this.mode === 'under') this.exitUnder(Math.floor(p[1]) * N + Math.floor(p[0]));
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

  /** Un clic pendant le tracé : une gare s'ajoute aux arrêts (recliquer le dernier le retire) */
  railPick(b: Building | undefined) {
    const e = this.railEdit;
    if (!e || !b) return;
    if (e.stops[e.stops.length - 1] === b.id) { this.railUndo(); audio.sfxClick(); return; }
    if (e.stops.includes(b.id)) { this.ui.toast(`${this.railway.stopName(b)} est déjà sur la ligne.`); return; }
    if (!this.railway.stopOf(b)) {
      this.ui.toast('Cliquez une gare.');
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
    // une seule chose suivie à la fois : suivre l'équipe lâche le train et l'incident
    if (a) { this.trainCam = null; this.incidentCam = null; }
    // on cesse de suivre : la vue reste où elle est
    if (!a) this.autoUnder = false;
    if (!a) return;
    this.followPhase = ''; this.followLast = null; this.followSm = null;
    if (this.mode === 'under') {
      // depuis le monde souterrain : une troupe (ou des éclaireurs) déjà dans les galeries, la vue reste en bas et la suit,
      // puis remonte avec elle ; une équipe en surface, la vue remonte la retrouver
      if (isBelow(a)) { this.autoUnder = true; const p = this.underView?.troopAt(a.id); if (p) this.cam.follow(p[0], p[1]); }
      else this.exitUnder(undefined, true);
      return;
    }
    // assez près pour voir l'équipe (de petits personnages) ; on se rapproche encore quand elle arrive sur place
    const p = this.agents.partyPositions(a.party)[0];
    if (p) this.cam.follow(p[0], p[1], 10);
  }
  get disasters() { return this.world.disasters; }

  /**
   * Qualité graphique : halo (haute), brume (haute et normale), densité des particules ; finesse de l'image (pixels par point
   * d'écran, plafonnée), taille de la carte des ombres, distance d'affichage des bêtes et des arbres détaillés
   */
  private applyQuality() {
    const q = this.quality;
    // en « Auto », on part de la qualité haute (réduite sur un petit écran tactile) et le contrôleur descend par paliers
    const p = this.gfx = q === 'auto' ? paramsAt(coarse ? 'low' : 'high', this.adaptive.level) : paramsAt(q, 0);
    this.atmosphere.mistEnabled = p.mist;
    this.life.density = p.density;
    this.streams.density = p.density;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? Math.max(p.pixelRatio, 1) : p.pixelRatio));
    this.glow?.setSize(innerWidth, innerHeight);
    this.env.setShadowSize(p.shadowSize);
    this.fauna.detail = p.faunaDetail;
    this.agents.detail = p.faunaDetail;
    this.veg.lodDist = p.vegLod;
  }

  /** Le réglage « Auto » juge chaque image : s'il change de palier, les réglages suivent (sans à-coup visible) */
  private adapt(frameMs: number) {
    if (this.quality !== 'auto' || document.hidden) return;
    const l = this.adaptive.step(frameMs);
    if (l < 0) return;
    this.applyQuality();
    saveSettings(this.settings());
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

  /**
   * Descend par l'entrée (grotte ou faille) de la case donnée. Le joueur n'y a plus accès (monde souterrain retiré du jeu) :
   * le moteur reste pour les Enfers (`__game.enterUnder(case)` pour l'essayer)
   */
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
      this.ui.banner('Monde souterrain', `${UZ_NAMES[this.under.zoneAt(x, z)]} : le puits de lumière ramène à la surface.`);
      this.ui.update();
    }, 'Descente sous terre…');
  }

  /** Remonte à la surface, devant l'entrée empruntée (ou celle donnée) ; remonter soi-même cesse de suivre la troupe */
  exitUnder(cell?: number, auto = false) {
    // (le bouton Remonter sert aussi à quitter les Enfers)
    if (this.mode === 'hell') { this.exitHell(); return; }
    if (this.mode !== 'under') return;
    if (!auto && this.autoUnder) { this.autoUnder = false; this.following = null; }
    this.fadeThrough(() => {
      this.mode = 'surface';
      document.body.classList.remove('under');
      this.underView?.leave();
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
    // une créature cliquée sursaute et détale
    const mob = uv.mobs.hit(ray);
    if (mob) { uv.mobs.scare(mob.x, mob.z, 0.6); audio.sfxClick(); return; }
    if (!p) return;
    const ent = uv.entranceAt(p.x, p.z);
    if (ent) { this.exitUnder(ent.cell); return; }
    if (uv.mobs.scare(p.x, p.z)) { audio.sfxClick(); return; }
    // des cristaux : ils tintent
    if (uv.crystalNear(p.x, p.z)) audio.sfxClick();
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
      // en commandement (Enfers, île) : les touches des troupes passent d'abord (H, R, A, groupes, Espace, Échap)
      if (this.command.active) {
        if (k === 'escape' && this.ui.closeTop()) return;
        if (this.command.key(e)) return;
      }
      if (this.mode === 'hell') {
        if (k === 'u' || k === 'escape') this.exitHell();
        else if (k === ' ') { e.preventDefault(); this.time.paused = !this.time.paused; }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? this.tools.redo() : this.tools.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); this.tools.redo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Échap ferme d'abord la fenêtre ouverte
      if (k === 'escape' && this.ui.closeTop()) return;
      // sous terre : U ou Échap remonte, les outils de surface sont inactifs
      if (this.mode === 'under') {
        if (k === 'u' || k === 'escape') this.exitUnder();
        else if (k === ' ') { e.preventDefault(); this.time.paused = !this.time.paused; }
        return;
      }
      // R tourne le bâtiment en main ou celui qu'on a choisi ; sinon c'est l'outil Route
      if (k === 'r' && (this.tools.holding() || this.tools.selected !== null)) { this.tools.rotate(); return; }
      const tool = digit !== undefined ? map[digit] : /^[0-9]$/.test(k) ? undefined : map[k];
      // un outil de construction pris en main : on quitte le commandement de l'île
      if (this.isleCmd && (tool || k === 'b')) this.leaveIsle(true);
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
    // Maj : la sélection des troupes s'ajoute à la précédente
    window.addEventListener('keyup', (e) => { if (e.key === 'Shift') this.command.setShift(false); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Shift') this.command.setShift(true); });
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
      // le feu de camp, au milieu de la place du village (3 × 3, ou 1 × 1 dans une ancienne partie)
      if (b.kind === 'gather' && b.age === 0) { const s = sizeOf(b); pts.push(b.x + s / 2, b.z + s / 2, s > 1 ? 2.1 : 1.5, 0.8); }
      else if (b.kind === 'lamp') {
        // le lampadaire est dans un coin de sa case (décalé de 0,32, tourné avec elle)
        const t = (b.rot * Math.PI) / 2, c = Math.cos(t), s = Math.sin(t);
        pts.push(b.x + 0.5 + 0.32 * (c + s), b.z + 0.5 + 0.32 * (c - s), b.age <= 1 ? 1.1 : 0.95, 0.65);
      }
      else if (b.kind === 'workshop' && b.age === 2) pts.push(b.x + 0.5, b.z + 0.5, 0.75, 0.45);
    }
    this.gardens.lights(pts);
    this.portalView.lights(pts);
    for (let i = 0; i < this.roads.lights.length; i += 2) pts.push(this.roads.lights[i], this.roads.lights[i + 1], 0.75, 0.5);
    for (let i = 0; i < this.railView.lights.length; i += 2) pts.push(this.railView.lights[i], this.railView.lights[i + 1], 0.95, 0.6);
    this.halos.set(pts);
  }

  private refreshSeason(force = false) {
    computeSeason(this.time, this.season);
    const key = Math.floor(this.time.seasonT * 120);
    if (force || key !== this.seasonKey) {
      // les teintes du sol changent par bandes, sur quelques images (un balayage de la carte sur deux suffit : les teintes
      // n'y bougent que d'un soixantième de saison)
      // en accéléré, un balayage tous les deux soixantièmes passerait son temps à recommencer (à ×4, sans arrêt) : on espace
      // les balayages d'autant, la teinte change par pas un peu plus grands
      if (force || Math.abs(key - this.groundKey) >= 2 * Math.max(1, this.time.speed)) {
        this.groundKey = key;
        if (force) this.terrain.update(this.season); else this.terrain.recolor(this.season);
      }
      this.seasonKey = key;
      // neige sur les toits selon le biome (la carte a pu changer)
      const w = this.world;
      setSnowMap(N, (k) => SNOWY[w.biome[k]] ?? 1);
      this.veg.applySeason(this.season);
      this.gardens.applySeason(this.season);
      // la neige des routes suit la saison sans les refaire (shader) ; elles ne se refont que lorsqu'elle franchit un seuil où
      // leurs décors changent : sur un grand village, les refaire coûte un à-coup, et à ×4 la neige bouge quatre fois plus vite
      const s = this.season.snow;
      if (force) { this.roads.rebuild(this.sim.age, s); this.propsDirty = false; }
      else if (this.propsDirty || roadSnowStep(this.roads.builtSnow, s)) { this.roads.rebuildSoon(this.sim.age, s); this.propsDirty = false; }
      else this.roads.setSnow(s);
    }
  }

  private renderer_render() {
    const hell = this.mode === 'hell' ? this.hellMode : null;
    const under = (this.mode === 'under' && this.underView) || !!hell;
    const scene = hell ? hell.scene : under ? this.underView!.scene : this.scene;
    // la carte des ombres ne se refait qu'une image sur deux (sur trois en qualité réduite) quand la vue ne bouge pas : seuls
    // les passants et les véhicules y bougent ; dès que la caméra se déplace, elle suit à chaque image
    const c = this.cam.camera, moved = c.position.distanceToSquared(this.shadowPos) > 1e-6 || 1 - Math.abs(c.quaternion.dot(this.shadowQ)) > 1e-9;
    this.shadowPos.copy(c.position); this.shadowQ.copy(c.quaternion);
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = moved || !!under || ++this.shadowN % this.gfx.shadowEvery === 0;
    if (!this.glow || !this.gfx.glow) { renderer.render(scene, this.cam.camera); return; }
    // le halo vient avec la nuit ; sous terre, il entoure cristaux, lave et torches
    const night = Math.min(1, Math.max(0, (this.env.night - 0.35) / 0.45));
    this.glow.render(scene, this.cam.camera, hell ? hell.view.bloom[0] : under ? 0.3 : night * 0.8, hell ? hell.view.bloom[1] : under ? 2 : 1.3);
  }

  private frame() {
    if (!this.running) return;
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.adapt(now - this.lastTime);
    this.lastTime = now;
    this.elapsed += dt;
    stepWind(this.elapsed, this.env.rainK);
    const w = this.world;

    const gdt = this.time.update(dt);
    const uv = this.mode === 'under' ? this.underView : null;
    const hv = this.mode === 'hell' ? this.hellMode : null;
    this.cam.update(dt, uv ? (x, z) => uv.groundY(x, z) : hv ? (x, z) => hv.view.groundY(x, z) : (x, z) => w.hAt(x, z));
    // le sol tremble près d'un volcan en éruption
    let shake = uv || hv ? 0 : this.eruptions.shakeAt(this.cam.target.x, this.cam.target.z);
    if (this.quake && !uv) {
      const v = this.quake.cell, d = Math.hypot((v % N) + 0.5 - this.cam.target.x, Math.floor(v / N) + 0.5 - this.cam.target.z);
      shake = Math.max(shake, (1 - this.quake.t / 18) * 0.7 * Math.max(0, 1 - d / 70));
    }
    // les cris du roi des Enfers, l'effondrement de son royaume
    shake = Math.max(shake, this.kingStage.shake());
    if (shake > 0) {
      const t = this.elapsed, a = shake * 0.12 * Math.min(1, this.cam.dist / 30);
      this.cam.camera.position.add(new THREE.Vector3(Math.sin(t * 47) + Math.sin(t * 29) * 0.5, Math.sin(t * 53) * 0.6, Math.sin(t * 41) + Math.sin(t * 23) * 0.5).multiplyScalar(a));
    }
    if (this.mode === 'surface') this.tools.update(dt);

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
      // les chemins se refont au fil des images (pas d'à-coup à la pose) ; les bâtiments se tournent vers la rue tout de suite
      if (w.roadsDirty || this.propsDirty) { w.roadsDirty = false; this.roads.rebuildSoon(this.sim.age, this.season.snow); this.buildings.refreshAll(); }
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
    // les chemins en cours de reconstruction avancent un peu à chaque image ; prêts, leurs lanternes éclairent
    if (this.roads.step()) this.refreshHalos();
    this.terrain.stepRecolor();

    this.env.update(dt, this.time, this.season, this.cam.target, gdt, this.cam.dist);
    if (!uv && !hv) this.atmosphere.update(dt, this.time, this.season, this.env, this.cam.camera, this.cam.target);
    else this.atmosphere.hideMist();
    SNOW.value = uv || hv ? 0 : this.season.snow;
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
    // pas de tracteur aux champs tant que l'usine automobile n'est pas bâtie
    this.agents.motor = (this.sim.counts.carworks ?? 0) > 0;
    this.agents.update(gdt, this.time.hour, this.sim.age, this.env.rainK > 0.6, this.sim.pop, this.env.night, this.time.season);
    this.cam.pace = this.time.paused ? 1 : this.time.speed;
    this.expeditions.speed = this.time.speed;
    this.expeditions.update(gdt);
    // les jours tenus sur l'île du portail, défenses debout
    holdIsle(w, gdt, this.time.dayLen);
    // la guerre : la faction des Enfers, ses incursions sur l'île, la garnison
    this.stepWar(dt, gdt);
    this.stepFarewell(dt);
    this.railway.update(gdt);
    this.expView.update(gdt);
    this.spaceCast.update(this.expeditions.active);
    // une équipe rentre victorieuse : tout le village fait la fête au cœur du village, à la mode de son âge
    for (const a of this.expeditions.active) if (a.phase === 'home' && a.ok && !this.feted.has(a.id)) { this.feted.add(a.id); this.festAt(a.base[0], a.base[1]); }
    this.fest.update(dt);
    this.pens.update(gdt);
    // la caméra accompagne l'équipe
    const followed = this.following === null ? null : this.expeditions.active.find((e) => e.id === this.following);
    // une troupe suivie : quand elle est sous terre, la vue y descend avec elle ; elle remonte quand l'expédition est finie
    const below = !!followed && isBelow(followed);
    if (below && this.mode === 'surface' && !this.autoUnder) { this.autoUnder = true; this.enterUnder(followed!.entry); }
    else if (this.autoUnder && !below && this.mode === 'under') { this.autoUnder = false; this.exitUnder(undefined, true); }
    if (!followed) this.following = null;
    else if (!uv) {
      const pos = this.agents.partyPositions(followed.party), focus = followed.phase === 'work' ? this.expView.focusOf(followed.id) : null;
      if ((pos.length || focus) && !below) {
        // la vue suit le fanion du porte-fanion, pas la moyenne de l'équipe ; sur place, elle se pose entre le fanion et le
        // cœur de la scène (l'enclos, la barque, la montgolfière…), et se rapproche
        const pt = followPoint(this.expView.flagOf(followed.id), pos.length ? [pos[0][0], pos[0][1]] : undefined, focus, followed.phase === 'work', this.expView.liftOf(followed.id))!;
        let x = pt.x, z = pt.z;
        const lift = pt.lift;
        const sm = this.followSm;
        if (!sm || this.followLast === null || Math.hypot(x - sm[0], z - sm[1]) > 6) this.followSm = [x, z];
        else { const k = 1 - Math.exp(-Math.min(gdt, 0.25) / 0.6); sm[0] += (x - sm[0]) * k; sm[1] += (z - sm[1]) * k; x = sm[0]; z = sm[1]; }
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
    if (hv) { hv.view.units.age = this.sim.age; hv.update(dt, this.war.hellFx, this.cam.camera, this.cam.target, this.cam.dist); }
    else if (uv) {
      // les troupes en train de parcourir les galeries
      uv.setTroops(this.expeditions.active.filter((a) => a.entry >= 0 && a.phase === 'work').map((a) => ({
        id: a.id, kind: a.c.troop ?? 'miners', n: a.party.length, entry: a.entry, targets: a.targets, front: a.front, ambush: a.ambush, progress: Math.min(1, a.t / Math.max(1, a.c.work + a.extra)), age: this.sim.age,
        halt: a.hold > 0 || !!a.wait, scout: a.scout ? a.scout.t / Math.max(0.01, a.scout.dur) : -1,
      })), dt);
      uv.age = this.sim.age;
      uv.update(dt, this.cam.camera, this.cam.target, this.cam.dist, this.env.daylight);
    }
    else {
      this.buildings.update(dt, this.sim.age);
      this.fauna.update(gdt, this.elapsed, this.time.hour, this.time.season, this.env.rainK, this.sim.age, this.cam.camera);
      this.terrain.animateWater(this.elapsed, 1 - this.env.weatherK * 0.3);
      this.streams.update(dt, this.season.snow, this.cam.target);
      this.life.update(dt, this.time, this.season, this.env, this.cam.target);
      // pas de voiture sur les routes tant que l'usine automobile n'est pas bâtie : des charrettes jusque-là ; sans carburant,
      // les automobiles restent au garage
      this.traffic.motor = this.expeditions.cars();
      this.traffic.update(gdt, this.time.hour, this.sim.age, this.sim.pop);
      this.helis.motor = this.traffic.motor;
      this.helis.update(gdt, this.sim.age);
      this.airships.update(gdt, this.time.hour, this.sim.age);
      this.fairground.update(dt);
      this.zoo.update(gdt, this.cam.camera);
      this.alpine.update(gdt, this.sim.age, this.season.snow);
      this.emergencies.motor = this.traffic.motor;
      this.emergencies.update(gdt, this.sim.age);
      this.seeps.update(dt);
      // le portail : il s'éveille pendant l'expédition qui l'ouvre, et brûle ensuite ; ses halos s'allument avec lui
      const waking = this.expeditions.active.find((a) => a.m.id === 'portal' && a.phase === 'work');
      const wk = waking ? Math.min(1, Math.max(0, (waking.t / Math.max(1, waking.c.work + waking.extra) - ISLE_UP) / (ISLE_WAKE - ISLE_UP))) : 0;
      // (le royaume des Enfers tombé : le portail s'éteint dans une explosion de lumière dorée)
      if (this.portalView.update(dt, w.portalOpen && this.kingStage.portalLit(), wk, this.env.night)) this.refreshHalos();
      this.transports.update(gdt, this.sim.age);
      this.railView.update(dt, this.sim.age);
      this.railBoost.update(dt, this.cam.target.x, this.cam.target.z, this.cam.dist, this.env.night);
      if (this.railView.lightsVersion !== this.railLightsV) { this.railLightsV = this.railView.lightsVersion; this.refreshHalos(); }
      // la ligne en cours de tracé : une borne à chaque arrêt ; la voie prévue entre eux, que l'on saisit pour la déplacer
      this.railView.setPreview(this.railEdit ? this.railEdit.stops.map((id) => this.world.buildings.get(id)).filter((b): b is Building => !!b) : [], this.railEdit?.color ?? 0, false);
      // pendant le tracé : les gares qu'on peut encore ajouter à la ligne sont mis en valeur
      const re = this.railEdit;
      const ck = re ? `${this.world.version}|${this.railway.version}|${re.stops.join('.')}` : '';
      if (ck !== this.candCk) { this.candCk = ck; this.railView.setCandidates(re ? [...this.world.buildings.values()].filter((b) => !re.stops.includes(b.id) && !!this.railway.stopOf(b)) : []); }
      this.trackEdit.update();
      const tr = this.trainCam === null ? undefined : this.railway.trains.get(this.trainCam), tp = tr ? this.railway.trainAt(tr) : null;
      if (tp) this.cam.follow(tp[0], tp[1]);
      else this.trainCam = null;
      // l'incident suivi : la caméra reste dessus (sur le véhicule en route), jusqu'à ce qu'il soit fini
      if (this.incidentCam) { const i = this.incidents().find((x) => x.key === this.incidentCam); if (i) this.cam.follow(i.x, i.z); else this.incidentCam = null; }
      this.gardens.update(dt, this.time.hour);
      this.halos.update(dt, this.env.night);
      this.upBadges.update(dt, this.sim.age);
      this.windT += dt * (1 + this.env.weatherK * 0.6);
      this.veg.animate(this.windT, this.elapsed, 1 - this.env.weatherK * 0.3);
      this.veg.update(dt, this.cam.camera.position);
    }
    audio.update(dt, {
      age: this.sim.age, season: this.time.season, daylight: this.env.daylight,
      rain: this.env.rainK, snow: this.env.weatherKind === 'snow' ? this.env.weatherK : 0, fog: this.env.weatherKind === 'fog' ? this.env.weatherK : 0,
      pop: this.sim.pop, camDist: this.cam.dist, under: uv || hv ? 1 : 0,
      ...this.ambience(),
    });

    this.uiTimer -= dt;
    if (this.uiTimer <= 0) { this.uiTimer = 0.25; this.ui.update(); this.tutorial.update(); this.command.render(); this.warTips.update(0.25); }
    if (this.uiTimer === 0.25) this.homeBtn.set(this.awayFromHome());
    if ((this.trophyT -= dt) <= 0) { this.trophyT = 0.5; const c = this.villageCenter(); this.trophies.sync(c ? this.plazaNear(c[0], c[1]) : null, trophiesWon(this.world.exp)); }
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
