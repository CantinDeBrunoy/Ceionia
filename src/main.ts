import './style.css';
import './i18n/en';
import { onLangChange, tr as trx, nplural } from './i18n';
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
import { CameraRig, SURFACE_MIN_PITCH, PointerInfo, ToolInput } from './core/camera';
import { GameTime } from './core/time';
import { SurfaceGate } from './core/surface';
import { Sim } from './sim/sim';
import { GEAR_BY } from './sim/gear';
import { Agents } from './sim/agents';
import { Patrols, PATROL_MAX } from './sim/patrols';
import { Sentinels, SENTINEL_MAX } from './sim/sentinels';
import { PatrolView } from './render/patrols';
import { Fauna } from './render/fauna';
import { Eruptions, ERUPTION_DUR } from './render/eruption';
import { Streams } from './render/streams';
import { Atmosphere } from './render/atmosphere';
import { NightSky, SkyShowKind, skyNewsText } from './render/nightSky';
import { SNOW, setSnowMap } from './render/snow';
import { AmbientLife } from './render/life';
import { Glow } from './render/glow';
import { loadModels } from './render/assets';
import { Thumbs } from './render/thumbs';
import { ToolController, ToolId } from './build/tools';
import { AudioEngine } from './audio/audio';
import { UI, showMenu, UIHost } from './ui/ui';
import { Tutorial } from './ui/tutorial';
import { chapters } from './ui/tutorialChapters';
import { AGES, KINDS, Building, sizeOf, type KindId } from './build/catalog';
import { MISSIONS, VICTORY } from './sim/missions';
import { SpaceCast, showVictory, showVoyage } from './ui/spaceViews';
import { L_GONE, L_LIFT } from './render/expeditionScenes';
import { Parade, Spot } from './render/parade';
import { Fires } from './render/fires';
import { Traffic } from './render/traffic';
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
import { BlightView } from './render/blight';
import { isleBlight } from './world/blight';
import { ISLE_UP, ISLE_WAKE } from './render/expeditionScenes';
import { holdIsle, isleDefenses, nearIsle, villageBarracks } from './world/portal';
import { IsleFerry } from './render/isleFerry';
import { IsleRuins } from './render/isleRuins';
import { setFxDensity } from './render/combatFx';
import { War, clockText } from './sim/war';
import { KingdomStage } from './kingdomStage';
import { WarTips, WarTipState, WAR_TIP_TEXT, type WarTipId } from './ui/warTips';
import { BattleLayer } from './render/battleUnits';
import { CommandUI, Theater, PORTAL_REACH } from './ui/command';
import { troopPortrait } from './render/troopPortraits';
import { PortalChoice } from './ui/portalChoice';
import { nextGoal } from './sim/objective';
import { SaveData, Settings, Quality, saveSlot, loadSlot, deleteSlot, exportSave, readSaveFile, loadSettings, saveSettings } from './save/save';
import { Difficulty, DEFAULT_DIFFICULTY, isDifficulty, rulesOf } from './sim/difficulty';
import { AdaptiveQuality, GfxParams, MAX_LEVEL, paramsAt } from './render/adaptive';
import { weakGpu, probeRenderer } from './render/gpu';
import { LoadingScreen, painted } from './ui/loading';
import { WarmUp } from './render/warmup';
import { CompileJob, compilePaced, representatives, firstUseAll } from './render/precompile';

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
  /** les patrouilles de soldats des tours de garde et casernes du village, et leur vue */
  patrols: Patrols;
  patrolView: PatrolView;
  /** les sentinelles qui font les cent pas sur les remparts et veillent sur les tours de garde, et leur vue */
  sentinels: Sentinels;
  sentinelView: PatrolView;
  fauna: Fauna;
  eruptions: Eruptions;
  streams: Streams;
  atmosphere: Atmosphere;
  /** aurores boréales et étoiles filantes */
  nightSky: NightSky;
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
  /** prochain rappel à l'aide pour les feux que personne ne combat (s) */
  private fireCallT = 0;
  /** le bouton « Retourner au village », quand la vue s'éloigne de la grande place */
  private homeBtn: HomeButton;
  /** la mise en scène du royaume des Enfers (combat du roi, victoire) */
  kingStage: KingdomStage;
  /** les aides du volet militaire */
  warTips!: WarTips;
  /** la carte du choix du portail (affronter les démons ou refermer le portail) */
  portalChoice!: PortalChoice;
  /** l'alunissage en direct, pendant l'expédition « Un homme sur la Lune » */
  spaceCast: SpaceCast;
  private feted = new Set<number>();
  /** les habitants qui fêtent la chute du roi pendant la cinématique de fin (ils sautent de joie sur la place) */
  private endCrowd: number[] = [];
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
  /** la contamination de l'île du portail (fissures, cristaux, braises, brume, halos dorés) et sa signature affichée */
  blightView: BlightView;
  private blightKey = '';
  private blightT = 0;
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
  /** les premières images, derrière l'écran de chargement (null ensuite) : la qualité « Auto » ne les juge pas */
  private warming: WarmUp | null = null;
  /** pendant les images d'essai : l'avancée vers le lever de l'écran (barre de chargement) */
  private warmStep: ((k: number) => void) | null = null;
  private warmed: (() => void) | null = null;
  /** durées (ms) et nombres de programmes du chargement, pour le mesurer (`__game.loadStats`, voir docs/chargement-performances.md) */
  loadStats: Record<string, number> = {};
  /** le jour (numéro) dont le soir est préparé : shaders de nuit de ce qui est apparu depuis le chargement */
  private eveningReady = -1;
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
  /** vignettes 3D des bâtiments (barre de construction) */
  private thumbs = new Thumbs(renderer);
  thumb(k: KindId, age: number) { return this.thumbs.get(k, age); }
  private saveTimer = 0;
  private running = true;
  /** monde souterrain (créé à la première descente) */
  under: Underground;
  private underView: UnderView | null = null;
  private mode: 'surface' | 'under' | 'hell' = 'surface';
  /** la vue suit les troupes envoyées dans les Enfers (un geste sur la vue reprend la main) */
  hellFollow = false;
  /** monde des Enfers (mode développeur : `__game.enterHell()`), créé à la première visite */
  hellMode: HellMode | null = null;
  /** la guerre contre les Enfers : faction, incursions sur l'île du portail, armée (voir sim/war) */
  war: War;
  /** le contrôle direct des troupes (dans les Enfers, et sur l'île quand on la commande) */
  command!: CommandUI;
  /** les combattants de l'île du portail, dans la scène de la surface */
  private isleLayer: BattleLayer | null = null;
  /** la galère qui traverse vers l'île du portail (recrues, soldats renvoyés au village) */
  private ferry: IsleFerry | null = null;
  /** les ruines des défenses de l'île abattues pendant une incursion */
  private isleRuins: IsleRuins | null = null;
  /** on commande la garnison de l'île (la vue reste en surface) : vrai tant que la vue est près de l'île (`syncIsleView`) */
  isleCmd = false;
  /** la vue est près de l'île du portail (`nearIsle`, avec hystérésis) */
  private isleNear = false;
  /** les actions du village demandées depuis les Enfers ou le commandement de l'île : on remonte d'abord (`ensureSurface`) */
  private surfaceGate = new SurfaceGate({
    mode: () => this.mode, isle: () => this.isleCmd, fading: () => this.fading,
    exitHell: () => this.exitHell(), leaveIsle: () => this.leaveIsle(), later: (fn, ms) => { setTimeout(fn, ms); },
  });
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

  /**
   * `seed` : graine d'une nouvelle partie (tirée au hasard sans elle) ; `difficulty` : la sienne (normale sans elle) ;
   * `startAge` : l'âge où commence une partie de bac à sable (la Préhistoire sans lui ; ignoré dans les autres modes)
   */
  constructor(mapId: number, mode: 'continue' | 'new', seed?: number, difficulty: Difficulty = DEFAULT_DIFFICULTY, startAge = 0) {
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
      // le bac à sable commence à l'âge choisi, tout ouvert
      if (w.sandbox) this.sim.age = Math.max(0, Math.min(AGES.length - 1, Math.round(startAge) || 0));
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
    this.roads = new RoadView(w);
    this.veg = new VegView(w);
    this.buildings = new BuildingView(w);
    this.env = new Environment(this.scene, renderer, coarse);
    this.agents = new Agents(w);
    this.agents.camera = this.cam.camera;
    this.patrols = new Patrols(w);
    this.patrolView = new PatrolView(w, () => this.patrols.all(), PATROL_MAX * 3);
    this.patrolView.camera = this.cam.camera;
    this.sentinels = new Sentinels(w);
    this.sentinelView = new PatrolView(w, () => this.sentinels.all(), SENTINEL_MAX, 100);
    this.sentinelView.camera = this.cam.camera;
    this.fauna = new Fauna(w, this.veg);
    this.fauna.people = () => this.agents.agents;
    this.eruptions = new Eruptions(w);
    this.streams = new Streams(w, this.terrain.waterMat.normalMap);
    this.atmosphere = new Atmosphere(w, audio);
    this.nightSky = new NightSky(w);
    this.scene.add(this.nightSky.group);
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
    this.fires.top = (b) => this.buildings.topOf(b.id);
    // les pompiers et les voisins au seau : ils restent tant que ça brûle, et leur eau éteint le feu
    this.fires.pails = (b) => this.agents.pails(b);
    this.agents.burning = (id) => this.fires.burning.some((b) => b.id === id);
    this.transports = new Transports(w, this.buildings);
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
    this.roads.streams = this.streams;
    // on saisit la voie prévue pour la faire passer où l'on veut (rayon de saisie selon le zoom)
    this.trackEdit = new TrackEditor(w, this.railway, () => this.railEdit, () => Math.max(0.55, this.cam.dist * 0.02), () => this.ui.update());
    this.railView.group.add(this.trackEdit.group);
    this.pens = new PenView(w);
    this.seeps = new OilSeeps(w);
    this.railBoost = new RailBoost(w);
    this.portalView = new PortalView(w);
    this.scene.add(this.portalView.group);
    this.blightView = new BlightView(w);
    this.scene.add(this.blightView.group);
    // la foudre et les bombes de lave mettent le feu aux bâtiments ; les habitants accourent
    const ignite = (b: Building | undefined) => { if (b && this.fires.ignite(b)) { this.agents.alert(b.z * N + b.x); audio.sfxDestroy(); } };
    this.emergencies.ignite = (b) => ignite(b);
    // (une fois sur deux seulement : les incendies restent des événements)
    this.atmosphere.onStrike = (x, z) => { if (Math.random() < 0.5) ignite(w.buildingAt(Math.floor(x), Math.floor(z))); };
    this.eruptions.onImpact = (k) => { if (w.disasters && w.occ[k] && Math.random() < 0.3) ignite(w.buildings.get(w.occ[k])); };
    this.life.onSplash = (x, z) => audio.sfxSplash((1 - Math.min(1, Math.hypot(x - this.cam.target.x, z - this.cam.target.z) / 25)) * Math.min(1, 40 / this.cam.dist));
    // le hurlement d'une meute, plus faible au loin
    this.fauna.onHowl = (x, z) => { const k = (1 - Math.min(1, Math.hypot(x - this.cam.target.x, z - this.cam.target.z) / 40)) * Math.min(1, 50 / this.cam.dist); if (k > 0.05) audio.sfxHowl(k); };
    this.scene.add(this.terrain.group, this.roads.group, this.veg.group, this.buildings.group, this.agents.group, this.patrolView.group, this.sentinelView.group, this.fauna.group, this.eruptions.group, this.streams.group, this.atmosphere.group, this.life.group, this.fires.group, this.traffic.group, this.helis.group, this.airships.group, this.alpine.group, this.emergencies.group, this.transports.group, this.halos.mesh, this.upBadges.points, this.expView.group, this.fest.group, this.parade.group, this.pens.group, this.railView.group, this.seeps.group, this.railBoost.group);
    this.applyQuality();

    const host = this;
    this.tools = new ToolController({
      world: w, terrain: this.terrain, cam: this.cam, canvas, scene: this.scene, audio,
      wetCell: (k) => this.streams.covers(k),
      getAge: () => this.sim.age,
      toast: (m) => this.ui.toast(m),
      changed: () => { this.propsDirty = true; this.ui?.refreshTools(); },
      erupt: (cell) => this.erupt(cell),
      openPortal: () => { if (this.war.ensure()) void this.enterHell(); },
      get autoRoads() { return host.autoRoads; },
    });
    this.cam.handler = this.tools;
    // prendre un outil du village (barre du bas, vignette) depuis les Enfers ou le commandement de l'île : on remonte d'abord
    const setTool = this.tools.setTool.bind(this.tools);
    this.tools.setTool = (t, kind) => { if (t === 'none' || this.mode === 'under') setTool(t, kind); else this.ensureSurface(() => setTool(t, kind)); };
    this.ui = new UI(uiRoot, host);
    this.spaceCast = new SpaceCast(uiRoot);
    // le contrôle des troupes : ses ordres au clic droit (sans glisser), la barre des troupes, l'alerte d'incursion
    this.command = new CommandUI(uiRoot, {
      war: this.war, canvas, camKeys: this.cam.keys,
      pan: (dx, dy) => this.cam.panBy(dx, dy), zoneName: () => (this.mode === 'hell' && this.hellMode ? this.hellMode.zoneName(this.cam.target.z) : null),
      age: () => this.sim.age, pop: () => this.sim.pop,
      paused: () => this.time.paused, togglePause: () => { this.time.paused = !this.time.paused; this.ui.update(); },
      toast: (m) => this.ui.toast(m), click: () => audio.sfxClick(),
      // (« Retourner au village », ou Échap : la vue retourne au village, l'interface de l'île se range d'elle-même)
      leaveIsle: () => this.goHome(), leaveHell: () => this.exitHell(), goHell: () => void this.enterHell(), openPortalChoice: () => this.portalChoice.show(),
      defenseInfo: (k) => { const d = KINDS[k as KindId], a = Math.max(this.sim.age, d.minAge); return { name: d.names[a], icon: d.icon, desc: d.desc }; },
      defenseLock: (k) => this.ui.lockWhy(k as KindId),
      defenseCount: (k) => { const d = isleDefenses(this.world); return k === 'watchtower' ? d.towers : k === 'barracks' ? d.barracks : this.sim.counts[k as KindId] ?? 0; },
      buildDefense: (k) => { this.leaveIsle(true); this.ui.pickBuild(k as KindId); },
      following: () => this.hellFollow, follow: (on) => { this.hellFollow = on; },
      craft: (id) => { const why = this.expeditions.whyCraft(GEAR_BY[id], this.sim.age); if (!why) this.expeditions.craft(id, this.sim.age); return why; },
      crafting: () => this.world.exp.craft, craftCheck: (ids) => this.expeditions.whyCraftAll(ids, this.sim.age),
      // les portraits des cartes de troupes : le modèle 3D rendu hors écran, à la demande, une fois par sorte et par âge
      portrait: troopPortrait,
    });
    this.cam.rightClick = (e) => { if (this.command.active) this.command.rightClick(e); };
    this.homeBtn = new HomeButton(uiRoot, () => { audio.sfxClick(); this.goHome(); });
    this.portalChoice = new PortalChoice(uiRoot, { war: this.war, age: () => this.sim.age, click: () => audio.sfxClick(), fought: () => this.pveStart() });
    // le royaume des Enfers : bannière, barre de vie du roi, tambours, cinématique et écran de la victoire
    this.kingStage = new KingdomStage({
      war: this.war, cam: this.cam, world: w, scene: this.scene, ui: this.ui, audio,
      mode: () => this.mode, hellView: () => (this.mode === 'hell' ? this.hellMode?.view ?? null : null),
      exitHell: () => this.exitHell(), goHome: () => this.goHome(),
      raiders: () => { const i = this.war.isle; return i ? i.raiders().map((u) => ({ x: u.x + i.map.ox, z: u.z + i.map.oz })) : []; },
      age: () => this.sim.age,
      village: () => this.villageCenter(), fest: (x, z) => this.festAt(x, z), crowd: (on, x, z) => this.kingCrowd(on, x, z),
    });
    this.expeditions.onNews = (m) => this.ui.toast(m, undefined, m.startsWith('⚔️') ? 'danger' : 'info');
    this.railway.onNews = (m) => this.ui.info(m);
    // bouger la vue (glisser ou touches) lâche tout ce que la caméra suivait : train, incident, équipe d'expédition
    this.cam.onPan = () => { this.hellFollow = false; this.trainCam = null; this.incidentCam = null; if (this.following !== null) { this.follow(null); this.ui.update(); } };
    // tracer une ligne : un clic sur une gare l'ajoute aux arrêts ; la voie prévue se saisit et se déplace
    this.tools.pickStop = (b) => this.railPick(b);
    this.tools.overlay = this.trackEdit;
    this.expeditions.onEvent = (a) => { audio.sfxClick(); this.ui.expEvent(a); };
    this.expeditions.onReport = (r) => {
      if (r.ok) audio.sfxAgeUp(); else audio.sfxClick();
      // la colonie fondée sur une autre planète : la fin de la partie (on peut continuer à bâtir), à la place du récit
      if (r.ok && r.m.id === VICTORY && !r.redo) showVictory(uiRoot, { name: trx('le village'), pop: this.sim.pop, buildings: this.world.buildings.size, missions: this.world.exp.done.length, days: this.time.days }, undefined, () => this.toMenu());
      else this.ui.showReport(r);
      this.ui.update();
    };
    this.sim.onAgeUp = (age) => {
      // on ne revient pas en arrière par-dessus un passage d'âge (Ctrl+Z rendrait des bâtiments comptés comme neufs)
      this.tools.undoStack.length = 0; this.tools.redoStack.length = 0;
      // la garnison gagne en vie et en force avec l'âge
      this.war.ageUp(age);
      this.ui.banner(trx('Nouvel âge : {name}', { name: AGES[age].name }), AGES[age].tagline);
      // l'Antiquité : la faille violette du rivage mène aux Enfers (dit une fois, en une phrase ; un clic mène à l'expédition)
      if (age === 1 && !this.world.portalOpen && this.world.portal && !this.world.sandbox) {
        this.warTips.markSeen('portal');
        setTimeout(() => this.ui.toast(WAR_TIP_TEXT.portal, () => this.ui.gotoMission('portal')), 6500);
      }
      // la liste de ce que l'âge apporte, comme dans Cities: Skylines : de quoi bâtir sans chercher
      // d'abord le message de passage d'âge (la bannière reste ~4,2 s), puis la fenêtre des bâtiments
      // (au bac à sable, tout est déjà ouvert : pas de liste)
      if (!this.world.sandbox) setTimeout(() => this.ui.showNewAge(age), 3600);
      audio.sfxAgeUp();
      this.propsDirty = true;
    };
    this.buildings.onPlaced = (b) => { this.propsDirty = true; this.defenseWhere(b); };
    this.sim.recalc();
    this.sim.update(0, 1);

    this.onResize();
    // une partie neuve : la vue se pose sur le centre de la place du village à venir (3 × 3 libres près du milieu de la carte)
    if (!w.buildings.size) { const [sx, sz] = w.startSpot(), S = KINDS.gather.size; this.cam.homeAt = [sx + S / 2, sz + S / 2]; }
    this.cam.reset();
    this.cam.dist = this.cam.homeDist();
    // une partie neuve s'ouvre près de la place à venir : de la vue d'ensemble, les premiers bâtiments seraient invisibles
    if (!w.buildings.size && this.cam.homeAt) this.cam.jump({ x: this.cam.homeAt[0], z: this.cam.homeAt[1], dist: 34 }, w.surfaceAt(this.cam.homeAt[0], this.cam.homeAt[1]));
    window.addEventListener('resize', () => this.onResize());
    this.bindKeys();
    const unlock = () => { audio.start(); audio.applyVolumes(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.saveNow(); });
    window.addEventListener('pagehide', () => this.saveNow());
    // changer de langue en jeu : on sauvegarde, la page recharge et reprend la partie dans la nouvelle langue
    onLangChange(() => { this.saveNow(); sessionStorage.setItem(AUTOSTART, `${this.world.mapId}|continue`); this.running = false; location.reload(); });

    this.refreshSeason(true);
    this.refreshHalos();
    this.ui.update();
    // (pas de tutoriel au bac à sable : il n'y a rien à apprendre dans l'ordre)
    this.tutorial = new Tutorial(this.ui, this, !save, w.sandbox);
    // ses chapitres : l'île du portail (le PvE choisi), la première entrée dans les Enfers
    this.tutorial.setChapters(chapters(this.tutorial, this.ui, {
      root: uiRoot, age: () => this.sim.age,
      isle: () => isleDefenses(this.world), village: () => this.villageDefenses(),
      army: () => this.war.army.troops.length + this.war.army.queue.length, need: () => this.war.invasionNeed(), pve: () => this.war.pve === 'on',
      theater: () => this.command.theater?.kind ?? null, mode: () => this.mode, atIsle: () => this.lookingAtIsle(),
      selected: () => this.command.cmd.selected.size, lastOrder: () => this.command.cmd.lastOrder,
      commandIsle: () => this.commandIsle(),
    }));
    // un chapitre fini dit déjà ce que disaient les aides militaires du même moment : elles ne se répètent pas
    this.tutorial.onChapterEnd = (id, done) => { if (done) for (const t of (id === 'pve' ? ['isle', 'orders'] : ['hell']) as WarTipId[]) this.warTips.markSeen(t); };
    // les aides du volet militaire (bulles facultatives, au moment utile)
    this.warTips = new WarTips({
      root: this.ui.root, state: () => this.warTipState(), click: () => audio.sfxClick(), hideHelp: () => this.ui.setHelp(false),
      busy: () => this.tutorial.active || this.ui.popupShowing() || !!document.querySelector('#warAlert.show') || !!this.ui.root.querySelector('.overlay:not(#menu)') || this.kingStage.playing || document.body.classList.contains('photo'),
      act: (id) => { if (id === 'portal') this.ui.gotoMission('portal'); else if (id === 'isle') this.goIsle(); else if (id === 'garrison') this.commandIsle(); else if (id === 'kingdom') this.kingStage.focusFight(); },
    });
    this.ui.info(save ? trx('Bon retour dans votre village !') : w.buildings.size ? trx('Choisissez un bâtiment dans « Bâtir » ou sculptez le terrain.') : trx('Commencez par « {name} », la place au centre du village (Bâtir › Vie & culture).', { name: this.sim.nameOf('gather') }));
    // (la boucle d'images démarre à la fin de `prepare`, derrière l'écran de chargement)
  }

  /**
   * Prépare la scène derrière l'écran de chargement, puis lance la boucle d'images. Les shaders du jour, et ceux de la nuit
   * (la scène rendue dans l'image du halo, les passes du halo), se compilent d'avance, en parallèle quand le navigateur le
   * permet ; puis les premières images tournent pour de bon jusqu'à ce qu'elles passent vite. Sans cela, la première image
   * figeait l'écran plusieurs secondes, et le premier soir encore autant (voir docs/chargement-performances.md)
   */
  async prepare(screen: LoadingScreen) {
    const cam = this.cam.camera, s = this.loadStats, now = () => performance.now();
    let t = 0;
    try {
      screen.step('Construction du monde…', 0.26);
      await painted();
      // une image sans rendu : ce qui se bâtit à la première image (bêtes, chemins…) existe avant la compilation
      t = now();
      this.advance();
      s.firstStep = now() - t;
      screen.step('Préparation des matériaux…', 0.3);
      await painted();
      t = now();
      const night = !!this.glow && this.gfx.glow, objects = representatives(this.scene), n0 = renderer.info.programs?.length ?? 0;
      // (les images du halo d'abord : leur allocation attendrait la fin des compilations lancées)
      if (night) this.glow!.allocate();
      const jobs: CompileJob[] = [{ objects, scene: this.scene, target: null, label: 'Préparation des matériaux…' }];
      if (night) for (const j of this.glow!.nightJobs(this.scene, objects)) jobs.push({ ...j, label: 'Préparation de la nuit…' });
      await compilePaced(renderer, cam, jobs, (k, label) => screen.step(label, 0.3 + 0.55 * k));
      s.compile = now() - t;
      s.programs0 = (renderer.info.programs?.length ?? 0) - n0;
      // une image avec le halo, cachée par l'écran : ses images s'allouent, sa dernière passe se compile
      screen.step('Dernières retouches…', 0.88);
      await painted();
      // tout est montré, hors champ et caché compris, le temps de ces images : chaque shader du jour et de la nuit sert une
      // fois, maillages et textures partent au GPU ; la première rotation de la vue et le premier soir ne figent plus
      t = now();
      // (les ombres ne se refont pas à chaque image : on force leur passe, pour préparer aussi les shaders d'ombre)
      const draws = [() => { renderer.shadowMap.needsUpdate = true; renderer.render(this.scene, cam); }];
      if (night) draws.push(() => this.glow!.warm(this.scene, cam));
      s.firstUsed = firstUseAll(this.scene, objects, draws);
      s.firstUse = now() - t;
    } catch (e) { console.warn(e); }
    t = now();
    // les premières images pour de bon : la barre va de 90 à 100 % à mesure qu'elles passent fluides
    this.warmStep = (k) => screen.step('Premières images…', 0.9 + 0.1 * k);
    await this.warmUp();
    this.warmStep = null;
    s.warmUp = now() - t;
    s.programs = renderer.info.programs?.length ?? 0;
  }

  /** Lance la boucle d'images ; la promesse se tient quand les premières images passent vite (voir `WarmUp`) */
  private warmUp() {
    return new Promise<void>((done) => {
      this.warming = new WarmUp();
      this.warmed = done;
      this.lastTime = performance.now();
      requestAnimationFrame(() => this.frame());
    });
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
    } catch (e) { this.ui.toast(trx('Import impossible : {why}', { why: (e as Error).message })); }
  }
  newGame(difficulty: Difficulty, age = 0) {
    deleteSlot(this.world.mapId);
    sessionStorage.setItem(AUTOSTART, `${this.world.mapId}|fresh|${difficulty}|${age}`);
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
    // (fermés tant que l'invasion du portail n'est pas repoussée)
    const closed = this.war.hellWhy();
    if (closed) { this.ui.toast(closed, this.war.pve === 'on' ? undefined : () => this.portalChoice.show()); return; }
    this.surfaceGate.cancel();
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
      this.cam.minDist = 2.4; this.cam.maxDist = 34; this.cam.minPitch = 0.28;
      // la carte des Enfers est bien plus longue que celle du village : la vue peut aller jusqu'au royaume
      this.cam.bounds = [2, hm.map.W - 2, 2, hm.map.L - 2];
      this.hellFollow = false;
      // (à la base avancée la plus loin, s'il y en a une) ; sur les troupes les plus avancées s'il y en a : la vue se pose sur
      // elles (elle visait quatre cases devant, et sur un petit écran la barre des troupes les cachait)
      const [x, z] = this.hellFocus(hm);
      // vue en perspective de trois quarts (pas presque de dessus) ; le clic droit glissé l'incline de 0,28 à 1,5
      // et l'objectif (l'avant-poste, la forteresse) doit entrer dans l'image : la vue se place entre les troupes et lui
      const goal = nextGoal(f, [x, z]), gd = goal.x === undefined ? 0 : Math.hypot(goal.x - x, goal.z! - z);
      const vx = goal.x !== undefined && gd < 45 ? x + (goal.x - x) * 0.3 : x, vz = goal.x !== undefined && gd < 45 ? z + (goal.z! - z) * 0.3 : z + 1.5;
      this.cam.jump({ x: vx, z: vz, dist: Math.min(30, Math.max(15, 11 + gd * 0.55)), pitch: 0.72, yaw: Math.PI }, hm.view.groundY(vx, vz));
      this.cam.handler = this.command;
      this.command.setTheater(this.hellTheater(hm));
      this.ui.banner(trx('Monde des Enfers'), trx('{zone} : le royaume démoniaque est tout au fond. Expédition facultative ; le portail ramène sur l’île.', { zone: hm.zoneName(z) }), 'hell');
      // la première entrée : le chapitre du tutoriel sur les Enfers (la cible, les troupes, l'attaque, le retour)
      this.tutorial.chapter('hell');
      this.ui.update();
    }, 'Passage du portail…');
  }

  /** Où regarder en entrant dans les Enfers : le groupe des troupes les plus avancées, sinon le camp le plus avancé, sinon le portail */
  private hellFocus(hm: HellMode): [number, number] {
    const us = this.war.troopsIn(hm.hell);
    if (!us.length) return this.war.base?.spawnPoint() ?? hm.map.arrival;
    const lead = us.reduce((a, u) => (u.z > a.z ? u : a)), near = us.filter((u) => Math.hypot(u.x - lead.x, u.z - lead.z) < 8);
    return [near.reduce((s, u) => s + u.x, 0) / near.length, near.reduce((s, u) => s + u.z, 0) / near.length];
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
      this.cam.bounds = null; this.hellFollow = false;
      this.cam.minDist = this.surfaceZoom.min; this.cam.minPitch = SURFACE_MIN_PITCH;
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
      screenRaw: (x, z) => this.toScreenRaw(v.set(x, hm.view.groundY(x, z) + 0.3, z)),
      focus: (x, z, d) => this.cam.goTo(x, z, d === undefined ? this.cam.dist : Math.max(this.cam.dist, d)),
      // le portail des Enfers (celui du point d'arrivée) : un ordre dessus ramène les troupes choisies sur l'île
      atPortal: (x, z) => Math.hypot(x - hm.map.portal[0], z - hm.map.portal[1]) < PORTAL_REACH,
      ghost: (kind, x, z, ok, camp, line) => hm.view.ghost(kind, x, z, ok, camp, line),
    };
  }

  /** Un point de la scène à l'écran même hors de la vue ; derrière la caméra, de l'autre côté (pour une flèche vers lui) */
  private toScreenRaw(v: THREE.Vector3): [number, number] {
    v.project(this.cam.camera);
    const k = v.z > 1 ? -1 : 1;
    return [(k * v.x + 1) / 2 * canvas.clientWidth, (1 - k * v.y) / 2 * canvas.clientHeight];
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
      focus: (x, z, d) => this.cam.goTo(x + ox, z + oz, d === undefined ? this.cam.dist : Math.max(this.cam.dist, d)),
      atPortal: (x, z) => { const p = this.world.portal; return !!p && this.world.portalOpen && Math.hypot(x + ox - p.x, z + oz - p.z) < PORTAL_REACH; },
    };
  }

  /** Prend le commandement de la garnison de l'île (la vue y va) */
  commandIsle() {
    if (this.mode === 'hell') { this.ensureSurface(() => this.commandIsle(), true); return; }
    const p = this.world.portal;
    if (this.mode !== 'surface' || !p || !this.war.ensure()) return;
    this.follow(null); this.trainCam = null; this.incidentCam = null;
    this.tools.setTool('none');
    this.cam.goTo(p.x, p.z + 1, Math.min(Math.max(this.cam.dist, 18), 26));
    // trois quarts plutôt que presque de dessus (l'inclinaison reste réglable : clic droit glissé)
    this.cam.tiltTo(0.8);
    // (la vue va sur l'île : l'interface s'affiche tout de suite, sans attendre la fin du glissement)
    if (!this.enterIsle()) return;
    this.isleNear = true;
    // l'île sans ses défenses : le menu s'ouvre sur « Bâtir », et un message dit quoi y poser
    const d = isleDefenses(this.world);
    if (this.war.pve === 'on' && (!d.towers || !d.barracks)) { this.command.isleMenu('build'); this.isleBrief(); }
    this.ui.update();
  }

  /** « Affronter les démons » : le chapitre du tutoriel (une fois), puis la vue va sur l'île, au commandement, où l'on bâtit */
  private pveStart() {
    this.tutorial.chapter('pve');
    this.commandIsle();
  }

  /**
   * Ce qu'il faut bâtir sur l'île, dit à l'arrivée (une fois par session) : les joueurs posaient tour de garde et caserne au
   * village. Le chapitre du tutoriel, quand il guide, le dit lui-même
   */
  private isleSaid = false;
  private isleBrief() {
    if (this.isleSaid || this.tutorial.active) return;
    this.isleSaid = true;
    this.ui.toast(trx('⚔️ Bâtissez ici, sur l’île du portail (pas au village) : « {tower} » et « {barracks} », puis recrutez une garnison.', { tower: this.sim.nameOf('watchtower'), barracks: this.sim.nameOf('barracks') }), undefined, 'action');
  }

  /** Une tour de garde ou une caserne posée au village quand l'île n'en a pas : elle ne garde pas le portail, on le dit */
  private defenseWhere(b: Building) {
    if ((b.kind !== 'watchtower' && b.kind !== 'barracks') || this.war.pve !== 'on' || this.world.onPortalIsland(b.x, b.z) || this.tutorial.chapterOn === 'pve') return;
    const d = isleDefenses(this.world);
    if (b.kind === 'watchtower' ? d.towers : d.barracks) return;
    this.ui.toast(trx('« {name} » est au village : contre les démons, il en faut sur l’île du portail. Cliquez ici pour y aller.', { name: this.sim.nameOf(b.kind) }), () => this.commandIsle(), 'action');
  }

  /** Tours de garde et casernes du village (hors de l'île du portail) */
  private villageDefenses() {
    let towers = 0;
    for (const b of this.world.buildings.values()) if (b.kind === 'watchtower' && !this.world.onPortalIsland(b.x, b.z)) towers++;
    return { towers, barracks: villageBarracks(this.world) };
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

  /** L'interface de l'île s'affiche : son théâtre passe au contrôle des troupes (la vue ne bouge pas) */
  private enterIsle(): boolean {
    if (this.isleCmd) return true;
    if (this.mode !== 'surface' || !this.war.ensure()) return false;
    this.syncIsleLayer();
    const t = this.isleTheater();
    if (!t) return false;
    this.tools.select(null);
    this.isleCmd = true;
    this.cam.handler = this.command;
    this.command.setTheater(t);
    return true;
  }

  /**
   * L'interface de l'île (ruban d'attaque, « Ma garnison », passage aux Enfers) suit la vue : elle s'affiche quand on s'approche
   * de l'île du portail et se range quand on s'en éloigne (`nearIsle`, avec hystérésis). On mesure là où va la vue (`cam.view`),
   * pas là où elle passe : « Retourner au village » la range aussitôt, « Voir l'île » l'affiche aussitôt. Elle ne s'ouvre pas
   * d'elle-même avec un outil en main (on pose une tour sur l'île : elle revient quand on le lâche), une vue qui suit quelque
   * chose, le tracé d'une ligne, un fondu ou la cinématique du royaume
   */
  private syncIsleView() {
    const p = this.world.portal, v = this.cam.view();
    this.isleNear = this.mode === 'surface' && !!p && this.world.portalOpen && nearIsle(this.isleNear, Math.hypot(v.x - p.x, v.z - p.z), p.r);
    if (!this.isleNear) { if (this.isleCmd) this.leaveIsle(); return; }
    if (this.isleCmd || this.fading || this.tools.tool !== 'none' || this.following !== null || this.trainCam !== null || this.incidentCam !== null || this.railEdit || this.kingStage.playing) return;
    this.enterIsle();
  }

  /** « Voir l'île » : la vue va sur l'île du portail, au commandement */
  viewIsle() { this.commandIsle(); }

  /** La vue va sur l'île du portail (pour y bâtir ses défenses) */
  goIsle() {
    if (this.mode === 'hell') { this.ensureSurface(() => this.goIsle(), true); return; }
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

  /** La ligne du rayon Militaire : le PvE à choisir, ou le portail refermé à rouvrir (rien une fois qu'on affronte les démons) */
  pveLine() {
    const w = this.war;
    if (!w.active) return null;
    if (w.pve === 'off') return { text: trx('🔒 Portail fermé'), button: trx('Rouvrir') };
    if (w.pve === 'ask') return { text: trx('🌀 Les Enfers'), button: trx('Affronter…') };
    return null;
  }
  openPortalChoice() { this.portalChoice.show(); }

  /** Ce que regardent les aides du volet militaire */
  private warTipState(): WarTipState {
    const w = this.world, war = this.war, d = w.portal ? isleDefenses(w) : { towers: 0, barracks: 0 };
    return {
      age: this.sim.age, portalOpen: w.portalOpen, portalUnderway: this.expeditions.active.some((a) => a.m.id === 'portal'),
      pve: war.pve === 'on', towers: d.towers, barracks: d.barracks, isleTroops: war.army.troops.filter((t) => t.where === 'isle' && t.heal <= 0).length,
      commanding: this.command.theater?.kind ?? null, frontier: war.faction?.frontier ?? 1, ageLock: !!war.faction && war.faction.gate && war.faction.conquestFrontier > war.faction.frontier, camp: !!war.base?.countOf('camp'), victory: !!war.faction?.victory,
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
    // le portail vient de s'ouvrir (ou la partie chargée n'a jamais choisi) : la carte du choix s'ouvre une seule fois, hors fenêtre
    if (w.active && w.pve === 'ask' && !w.choiceSeen && !this.portalChoice.visible && this.mode === 'surface' && !uiRoot.querySelector('.overlay') && !this.fading) this.portalChoice.show();
    const said = new Set<string>();
    for (const n of w.news.splice(0)) {
      // (plusieurs soldats au même moment : une seule nouvelle)
      if (said.has(n.text)) continue;
      said.add(n.text);
      // le combat du roi, la chute du royaume : la mise en scène s'en charge
      if (this.kingStage.news(n)) continue;
      // l'incursion elle-même a son alerte en haut (« Voir l'île ») : pas de message en double ; l'avertissement qui la précède reste
      if (n.kind === 'invasionReady') {
        // tout est prêt : un message mène à l'île, où le bouton « Affronter » attend
        this.ui.toast(trx('{text} Cliquez ici pour voir l’île.', { text: n.text }), () => this.viewIsle());
      } else if (n.kind === 'portalSealed') {
        // le portail se referme : un éclat doré, puis le tourbillon s'éteint (voir `portalView`)
        audio.sfxGoldBurst();
        this.ui.toast(n.text);
      } else if (n.kind === 'invasion') {
        // l'annonce de l'invasion : bannière, message qui mène à l'île ; le compte à rebours reste affiché en haut
        this.ui.banner(trx('Les démons vont attaquer !'), trx('Préparez la garnison de l’île.'));
        this.ui.toast(trx('{text} Cliquez ici pour voir l’île.', { text: n.text }), () => this.viewIsle(), 'danger');
      } else if (n.kind === 'invasionStart') {
        // la vague arrive : la vue se place sur l'île, où l'on défend
        this.ui.info(n.text);
        if (this.mode === 'surface' && !(this.isleCmd && this.lookingAtIsle())) this.viewIsle();
      } else if (n.kind === 'invasionDone') {
        this.ui.banner(trx('Invasion repoussée !'), trx('Le portail est affaibli. Menez vos troupes aux Enfers : suivez le guide.'));
        this.ui.toast(n.text);
      } else if (n.kind === 'raid' && n.text.startsWith('🔥')) this.ui.info(n.text);
      else if (n.kind === 'raid' || n.kind === 'lost') this.ui.toast(trx('{text} Cliquez ici pour voir l’île.', { text: n.text }), () => this.viewIsle(), 'danger');
      else if ((n.kind === 'portal' || n.kind === 'counter' || n.kind === 'zone') && this.mode !== 'hell' && (n.kind !== 'zone' || /repris|reprendre|tombé|retaken|retake|has fallen/.test(n.text))) this.ui.toast(trx('{text} Cliquez ici pour y aller.', { text: n.text }), () => this.enterHell());
      else this.ui.toast(n.text, undefined, n.kind === 'boss' || n.kind === 'counter' || (n.kind === 'zone' && /repris|reprendre|tombé|retaken|retake|has fallen/.test(n.text)) ? 'danger' : 'info');
      if (n.kind === 'repelled' || n.kind === 'secured' || n.kind === 'invasionDone') audio.sfxAgeUp();
    }
    // l'alerte reste tant que dure l'incursion, si l'on ne regarde pas l'île ; avant l'invasion, son compte à rebours (toujours) ;
    // après sa victoire, le guidage vers les Enfers quand on n'est pas au commandement de l'île
    const isle = w.isle, watching = this.isleCmd && this.lookingAtIsle();
    const left = w.inv === 'coming' ? w.nextWaveIn() : null;
    this.command.alert(
      isle?.raid && !watching ? (w.inv === 'raid' ? trx('🔥 Invasion du portail : {n} !', { n: nplural(isle.raiders().length, 'démon', 'démons') }) : trx('🔥 Incursion sur l’île du portail : {n} !', { n: nplural(isle.raiders().length, 'démon', 'démons') }))
        : left !== null ? trx('⚠️ Les démons vont attaquer : préparez la garnison ! {t}', { t: clockText(left) })
        : w.guideStep(0) && !watching && this.mode === 'surface' ? trx('🌀 Menez vos troupes aux Enfers : allez sur l’île.') : null,
      () => this.viewIsle());
    this.syncIsleLayer();
    if (this.isleLayer) {
      this.isleLayer.age = this.sim.age;
      if (this.mode === 'surface') this.isleLayer.update(dt, this.cam.camera, w.isleFx);
      else w.isleFx.length = 0;
      this.isleLayer.group.visible = this.mode === 'surface';
    }
    if (w.active) {
      if (!this.ferry) { this.ferry = new IsleFerry(this.world); this.scene.add(this.ferry.group); }
      this.ferry.update(dt, w, this.sim.age);
      this.ferry.group.visible = this.mode === 'surface';
    }
    // les défenses de l'île abattues : en ruines fumantes, jusqu'à leur relève
    if (!this.isleRuins) { this.isleRuins = new IsleRuins(this.world, this.buildings); this.scene.add(this.isleRuins.group); }
    this.isleRuins.update(dt, isle, this.isleLayer?.fx ?? null);
    this.isleRuins.group.visible = this.mode === 'surface';
    if (this.mode !== 'hell') w.hellFx.length = 0;
    this.kingStage.update(dt);
    // le commandement de l'île se perd si l'île n'est plus là (partie rechargée)
    if (this.isleCmd && this.command.theater?.sim !== isle?.sim) { const t = this.isleTheater(); if (t) this.command.setTheater(t); else this.leaveIsle(); }
    // l'interface de l'île suit la vue : affichée près de l'île, rangée au loin
    this.syncIsleView();
  }

  // ---------- Monde souterrain ----------
  /** Fondu au noir, bascule, puis retour à l'image */
  /** Passe par un fondu au noir (avec ce qu'il se passe, écrit au milieu) le temps de changer de vue */
  private fadeThrough(fn: () => void | Promise<void>, label = '') {
    if (this.fading) return;
    this.fading = true;
    const f = document.getElementById('fade')!;
    f.textContent = trx(label);
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
    this.ui.toast(trx('La terre tremble : un volcan se réveille… Cliquez ici pour le voir.'), () => this.ensureSurface(() => { this.follow(null); this.cam.goTo((cell % N) + 0.5, Math.floor(cell / N) + 0.5, 40); }), 'danger');
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
    if (this.mode === 'hell' || this.isleCmd) { this.ensureSurface(() => this.followIncident(key)); return; }
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
      this.ui.info(`${a.m.icon} ${trx('Tout le village sort dire adieu aux colons !')}`);
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
      showVoyage(uiRoot, /saut|jump/i.test(a.c.label), () => { this.expeditions.landNow(a); this.time.paused = was; });
    }
  }

  /** La foule de la fête de la victoire : des habitants se rassemblent autour de (x, z), bras levés ; false : ils rentrent */
  private kingCrowd(on: boolean, x: number, z: number) {
    const ag = this.agents;
    if (!on) { if (this.endCrowd.length) { ag.dismiss(this.endCrowd); this.endCrowd = []; } return; }
    if (this.endCrowd.length) return;
    this.endCrowd = ag.recruit(Math.min(28, ag.available())) ?? [];
    this.endCrowd.forEach((id, i) => {
      const a = i * 2.4, r = 2.4 + (i % 4) * 0.7, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      ag.memberGo(id, px, pz, Math.atan2(x - px, z - pz));
    });
  }

  /**
   * Mode développeur : le ciel de nuit à la demande. `__game.skyShow('aurora')` (aurore boréale), `'shower'` (nuit des étoiles
   * filantes), `'star'` (une étoile filante tout de suite), `'off'` (rien cette nuit) ; de jour, la nuit tombe d'un coup et le
   * ciel se dégage. Le jeu doit tourner (en pause, tout reste figé)
   */
  skyShow(kind: SkyShowKind = 'aurora') {
    if (kind !== 'off') {
      if (this.env.daylight > 0.15) this.time.hour = 22;
      if (this.env.weatherKind !== 'clear' || this.env.wantKind !== 'clear') { this.env.manualWeather = null; this.env.wantKind = 'clear'; }
    }
    this.nightSky.force(kind, this.time);
  }

  /** Mode développeur : rejoue la cinématique de fin du volet militaire (`__game.playKingdomEnd()`), depuis les Enfers (tous les plans) ou la surface */
  playKingdomEnd() { this.kingStage.playEnd(true); }

  private stepKingCrowd() {
    for (const id of this.endCrowd) if (this.agents.memberDone(id)) this.agents.partyAct([id], 'cheer');
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
    if (this.mode === 'hell' || this.isleCmd) { this.ensureSurface(() => this.goHome()); return; }
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
    if (this.mode === 'hell' || this.isleCmd) { this.ensureSurface(() => this.followTrain(line)); return; }
    // une seule chose suivie à la fois
    this.follow(null); this.incidentCam = null;
    if (this.mode === 'under') this.exitUnder(Math.floor(p[1]) * N + Math.floor(p[0]));
    this.trainCam = line;
    this.cam.follow(p[0], p[1], 14);
  }

  // ---------- Tracer une ligne de chemin de fer ----------

  /** Commence une ligne à partir de cette gare, ou reprend une ligne existante (ses arrêts, le tracé de sa voie) */
  startRailEdit(from: { stop?: number; line?: number }) {
    if (this.mode === 'hell' || this.isleCmd) { this.ensureSurface(() => this.startRailEdit(from)); return; }
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
    if (e.stops.includes(b.id)) { this.ui.toast(trx('{name} est déjà sur la ligne.', { name: this.railway.stopName(b) })); return; }
    if (!this.railway.stopOf(b)) {
      this.ui.toast(trx('Cliquez une gare.'));
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
    if (twin) { this.ui.toast(trx('🚂 Ce parcours existe déjà ({line}) : sur une voie unique, un seul train peut y rouler.', { line: r.lineLabel(twin) })); return; }
    if (trouble) { this.ui.toast(`🚂 ${trouble}`); return; }
    this.railCancel();
    if (e.line !== null) r.setStops(e.line, e.stops, e.via); else r.addLine(e.stops, e.via);
    const l = e.line !== null ? this.world.lines.find((x) => x.id === e.line) : this.world.lines[this.world.lines.length - 1], tr = l ? r.trains.get(l.id) : undefined;
    audio.sfxPlace();
    this.ui.toast(tr?.why ? `🚂 ${tr.why}` : trx(e.line !== null ? '🚂 Ligne modifiée : {line}.' : '🚂 Ligne ouverte : {line}.', { line: l ? r.lineLabel(l) : '' }));
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
    // l'équipe est au village : depuis les Enfers (ou le commandement de l'île), la vue remonte d'abord
    if (a && (this.mode === 'hell' || this.isleCmd)) { this.ensureSurface(() => this.follow(id)); return; }
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
    this.patrolView.detail = p.faunaDetail;
    this.sentinelView.detail = p.faunaDetail;
    this.veg.lodDist = p.vegLod;
    this.blightView.density = p.density;
    this.blightView.mist = p.mist;
    this.nightSky.density = p.density;
    setFxDensity(p.density);
  }

  /**
   * La contamination de l'île du portail (quelques fois par seconde) : quand elle change (défense posée, vague repoussée, zone
   * conquise, portail ouvert, nouvelle partie), la teinte du sol et la végétation de l'île se refont une fois, les décors aussi
   */
  private syncBlight(dt: number) {
    // (la cinématique de fin du volet militaire lève la contamination elle-même, devant la caméra)
    if (this.kingStage.holdingBlight()) return;
    if ((this.blightT -= dt) > 0) return;
    this.blightT = 0.5;
    const w = this.world, b = isleBlight(w, this.war.conqueredZones());
    this.blightView.set(b);
    // (sans la version du relief : refaire l'île la change, on tournerait en rond)
    const key = b ? b.key : '';
    if (key === this.blightKey) return;
    this.blightKey = key;
    this.terrain.setBlight(b);
    this.veg.blight = b;
    const p = w.portal;
    if (p) {
      // une seule passe sur les sommets de l'île (teintes seules, le relief n'a pas bougé), puis ses tuiles de végétation
      const R = Math.ceil(p.r + 4), rect: [number, number, number, number] = [Math.max(0, p.x - R), Math.max(0, p.z - R), Math.min(N - 1, p.x + R), Math.min(N - 1, p.z + R)];
      this.terrain.update(this.season, rect, true);
      w.markVeg(...rect);
      this.veg.rebuild(this.season);
    }
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

  /**
   * Fait l'action au village : depuis les Enfers ou le commandement de l'île, on remonte d'abord (fondu), puis elle s'exécute une
   * fois. `keepIsle` : on reste au commandement de l'île (aller sur l'île, y commander)
   */
  ensureSurface(then: () => void, keepIsle = false) { this.surfaceGate.ensure(then, keepIsle); }

  /** Réveille le volcan de la case donnée : éruption, grondement et animaux qui détalent */
  erupt(cell: number) {
    if (!this.eruptions.start(cell)) return;
    audio.sfxEruption(ERUPTION_DUR);
    this.ui.info(trx('Le volcan entre en éruption !'));
    // la première éruption de la partie : la vue file sur le volcan pour ne pas la manquer
    // (pas depuis les Enfers ni le commandement de l'île : la vue n'y est pas arrachée, le message mène au volcan)
    if (!this.volcanoSeen && this.mode === 'surface' && !this.isleCmd) {
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
      this.ui.banner('Monde souterrain', trx('{zone} : le puits de lumière ramène à la surface.', { zone: trx(UZ_NAMES[this.under.zoneAt(x, z)]) }), 'under');
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
      this.cam.minPitch = SURFACE_MIN_PITCH;
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
    const map: Record<string, ToolId> = { '0': 'mountain', '1': 'raise', '2': 'lower', '3': 'flatten', '4': 'cliff', '5': 'dig', '6': 'forest', '7': 'field', '9': 'erase', r: 'road', x: 'bulldoze', m: 'move' };
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
        // une touche d'outil ou de bâtiment du village (B, R, X, chiffres…) ramène à la surface, puis prend l'outil
        const vt = digit !== undefined ? map[digit] : /^[0-9]$/.test(k) || e.ctrlKey || e.metaKey || e.altKey ? undefined : map[k];
        if (vt || (k === 'b' && !e.ctrlKey && !e.metaKey && !e.altKey)) this.tools.setTool(vt ?? 'build', vt ? undefined : this.tools.kind);
        // (Échap n'y quitte pas les Enfers : il désélectionne ; le bouton « Retourner sur l'île » ramène à la surface)
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
        this.ui.toast(trx(this.tools.roadMode === 'free' ? 'Route libre : un clic au point A, un clic au point B.' : 'Route en ligne : glissez, case par case.'));
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

  /** Sources de lumière la nuit : feux de camp et braseros, lampadaires, lanternes des chemins */
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
    const ms = this.advance();
    this.renderer_render();
    // les premières images, derrière l'écran de chargement : il se lève quand elles passent vite
    if (this.warming?.feed(ms)) { this.warming = null; this.warmed?.(); this.warmed = null; }
    else if (this.warming) this.warmStep?.(this.warming.progress);
  }

  /** Avance d'une image (temps, simulation, vues), sans la rendre ; rend le temps écoulé depuis la précédente (ms) */
  private advance() {
    const now = performance.now(), ms = now - this.lastTime;
    const dt = Math.min(0.1, ms / 1000);
    if (!this.warming) this.adapt(ms);
    this.lastTime = now;
    this.elapsed += dt;
    stepWind(this.elapsed, this.env.rainK);
    const w = this.world;

    const gdt = this.time.update(dt);
    const uv = this.mode === 'under' ? this.underView : null;
    const hv = this.mode === 'hell' ? this.hellMode : null;
    this.cam.update(dt, uv ? (x, z) => uv.groundY(x, z) : hv ? (x, z) => hv.view.groundY(x, z) : (x, z) => w.hAt(x, z));
    // le sol tremble près d'un volcan en éruption
    let shake = uv || hv || gdt === 0 ? 0 : this.eruptions.shakeAt(this.cam.target.x, this.cam.target.z);
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
    // les torrents ont bougé (relief sculpté) : les dalles qui les franchissent se refont avec les chemins
    if (this.streams.version !== this.roads.builtStreams && !this.roads.busy) w.roadsDirty = true;
    if ((this.propsDirty || w.roadsDirty || w.vegDirty) && this.propsTimer <= 0) {
      this.propsTimer = 0.12;
      const roadsChanged = w.roadsDirty;
      // les chemins se refont au fil des images (pas d'à-coup à la pose) ; les bâtiments se tournent vers la rue tout de suite
      if (w.roadsDirty || this.propsDirty) { w.roadsDirty = false; this.roads.rebuildSoon(this.sim.age, this.season.snow); this.buildings.refreshAll(); }
      // l'herbe des prairies dépend aussi des routes
      if (w.vegDirty || roadsChanged || this.propsDirty) {
        // le sol se teinte sous les champs et forêts
        if (w.vegDirty && w.vegRect) this.terrain.update(this.season, w.vegRect);
        w.vegDirty = false;
        this.veg.rebuild(this.season);
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
    if (!uv && !hv) {
      this.atmosphere.update(dt, this.time, this.season, this.env, this.cam.camera, this.cam.target);
      this.nightSky.update(dt, gdt, this.time, this.env, this.cam.camera);
      // une aurore, une nuit des étoiles filantes : un mot, et un clic relève la vue vers le ciel (en mode photo, la cloche seule)
      for (const k of this.nightSky.news.splice(0)) {
        const text = skyNewsText(k, (this.sim.counts.observatory ?? 0) > 0);
        if (document.body.classList.contains('photo')) this.ui.info(text);
        else this.ui.toast(text, () => this.cam.lookUp(k === 'aurora' ? 0 : undefined));
      }
    } else this.atmosphere.hideMist();
    SNOW.value = uv || hv ? 0 : this.season.snow;
    this.sim.rain = this.env.rainK;
    this.sim.season = this.time.season;
    this.sim.update(gdt, dt);
    this.eruptions.update(gdt);
    this.fauna.alarm = this.eruptions.alarm();
    this.fires.update(dt);
    // personne n'accourt vers un feu (tout le monde était à l'intérieur ou loin au moment où il a pris) : on rappelle à l'aide
    if ((this.fireCallT -= dt) <= 0) { this.fireCallT = 4; for (const b of this.fires.burning) if (!this.agents.responders(b)) this.agents.alert(b.z * N + b.x); }
    this.wakeVolcano(gdt, dt);
    // nouvelles du village : incendies, feux éteints, bâtiments perdus
    for (const m of this.fires.news.splice(0)) this.ui.toast(m, undefined, m.startsWith('🔥') ? 'danger' : 'info');
    for (const m of this.emergencies.news.splice(0)) this.ui.toast(m, undefined, 'danger');
    for (const m of w.losses.splice(0)) this.ui.toast(m, undefined, 'danger');
    // pas de tracteur aux champs tant que l'usine automobile n'est pas bâtie
    this.agents.motor = (this.sim.counts.carworks ?? 0) > 0;
    this.agents.update(gdt, this.time.hour, this.sim.age, this.env.rainK > 0.6, this.sim.pop, this.env.night, this.time.season);
    // les rondes des soldats du village (torche à la main la nuit)
    this.patrols.update(gdt, this.sim.age);
    this.patrolView.update(this.sim.age, this.env.night > 0.5);
    this.sentinels.update(gdt, this.sim.age);
    this.sentinelView.update(this.sim.age, this.env.night > 0.5);
    this.cam.pace = this.time.paused ? 1 : this.time.speed;
    this.expeditions.speed = this.time.speed;
    this.expeditions.update(gdt);
    // les jours tenus sur l'île du portail, défenses debout
    holdIsle(w, gdt, this.time.dayLen);
    // la guerre : la faction des Enfers, ses incursions sur l'île, la garnison
    this.stepWar(dt, gdt);
    this.stepFarewell(dt);
    this.stepKingCrowd();
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
    if (hv) {
      // la vue suit les troupes envoyées ; le marqueur d'objectif
      const fp = this.hellFollow ? this.command.followPoint() : null;
      if (fp && Math.hypot(fp[0] - this.cam.target.x, fp[1] - this.cam.target.z) > 2.5) this.cam.glide(fp[0], fp[1]);
      this.command.frame();
    }
    if (hv) { hv.view.units.age = this.sim.age; hv.view.age = this.sim.age; hv.update(dt, this.war.hellFx, this.cam.camera, this.cam.target, this.cam.dist); }
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
      this.terrain.animateWater(this.elapsed, 1 - this.env.weatherK * 0.3, this.season);
      this.streams.update(dt, this.season, this.cam.target);
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
      if (this.portalView.update(dt, w.portalOpen && !this.war.closed && this.kingStage.portalLit(), wk, this.env.night)) this.refreshHalos();
      this.syncBlight(dt);
      this.blightView.update(dt, this.env.night, this.cam.target, this.cam.dist);
      this.terrain.setNight(this.env.night);
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
      this.halos.update(dt, this.env.night);
      // l'après-midi, une fois par jour : les shaders de nuit de ce qui est apparu depuis le chargement (bêtes de passage et
      // leurs silhouettes lointaines…) se compilent d'avance, sans bloquer ; sinon, tous au premier halo du soir
      const h = this.time.hour;
      if (this.glow && this.gfx.glow && h >= 15 && h < 17 && this.eveningReady !== this.time.days) { this.eveningReady = this.time.days; this.glow.precompile(this.scene, this.cam.camera); }
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
    if (this.uiTimer <= 0) { this.uiTimer = 0.25; this.ui.update(); this.tutorial.update(); this.expeditions.lenient = this.tutorial.guiding; this.command.render(); if (!this.world.sandbox) this.warTips.update(0.25); }
    if (this.uiTimer === 0.25) this.homeBtn.set(this.awayFromHome());
    // une vignette 3D par image, et la barre de construction la montre dès qu'elle est prête
    if (this.thumbs.pump()) this.ui.thumbsReady();
    if ((this.trophyT -= dt) <= 0) { this.trophyT = 0.5; const c = this.villageCenter(); this.trophies.sync(c ? this.plazaNear(c[0], c[1]) : null, trophiesWon(this.world.exp)); }
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) { this.saveTimer = 15; this.saveNow(); }
    return ms;
  }
}

// ---------- Boot ----------
async function boot() {
  // modèles 3D chargés avant tout : la végétation et la faune les lisent à la construction
  // (l'écran de chargement à côté de #ui, non dedans : l'interface du jeu réécrit #ui en se construisant)
  const app = uiRoot.parentElement!;
  let screen: LoadingScreen | null = new LoadingScreen(app);
  const models = screen;
  await loadModels((done, total) => models.step('Chargement des modèles…', (done / total) * 0.2, `${done}/${total}`));

  let started = false;
  const start = async (map: number, mode: 'continue' | 'new', seed?: number, difficulty?: Difficulty, age?: number) => {
    if (started) return;
    started = true;
    // les anciennes cartes (île, vallée, plateaux) n'existent plus : on joue sur le continent
    if (!mapDef(map)) map = CONTINENT;
    // l'écran de chargement couvre la vue (celui des modèles, s'il est encore là) ; on le laisse s'afficher avant de bâtir
    const ld = screen ?? new LoadingScreen(app);
    screen = null;
    ld.step('Construction du monde…', 0.22);
    await painted();
    // l'accueil peut avoir été redessiné (changement de langue) : on retire celui qui est à l'écran
    document.getElementById('menu')?.remove();
    menu?.remove();
    // tailles des tableaux du monde, des vues et de la caméra
    setMapSize(mapDef(map)!.size);
    syncChunks();
    const t0 = performance.now();
    const game = new Game(map, mode, seed, difficulty, age);
    game.loadStats.build = performance.now() - t0;
    (window as any).__game = game;
    await game.prepare(ld);
    ld.done();
  };
  const auto = sessionStorage.getItem(AUTOSTART);
  let menu: HTMLElement | null = null;
  if (auto) {
    sessionStorage.removeItem(AUTOSTART);
    const [m, mode, diff, ageS] = auto.split('|');
    void start(+m, mode === 'continue' ? 'continue' : 'new', undefined, isDifficulty(diff) ? diff : undefined, +ageS || 0);
    return;
  }
  // l'accueil : l'écran des modèles s'efface ; un autre couvrira la vue au lancement de la partie
  models.done(true);
  screen = null;
  menu = showMenu(uiRoot, {
    start: (map, mode, seed, difficulty, age) => start(map, mode, seed, difficulty, age),
    importFile: async (f) => {
      try { const d = await readSaveFile(f); saveSlot(d); void start(d.map, 'continue'); }
      catch (e) { alert(trx('Import impossible : {why}', { why: (e as Error).message })); }
    },
  });
  void KINDS;
}
void boot();
