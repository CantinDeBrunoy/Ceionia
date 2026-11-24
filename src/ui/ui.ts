import type { ShowDirector } from '../shows';
import { armWhy, costText, fleetCap, shipCost } from '../sim/fleet';
import { tr, plural, nplural, getLang, setLang, colon, pct as pctText, LANGS, type Lang, bothOf, bothLangs, isEnglish } from '../i18n';
import { ToolController, ToolId, SCULPT_TOOLS, VEG_TOOLS, SINGLE_TOOLS, RoadMode } from '../build/tools';
import { KINDS, KIND_ORDER, AGES, KindId, KindDef, SEASONS, BUILD_CATS, BUILD_SUBS, KIND_SUB, BuildCat, sizeOf, hasDoor, UPGRADES, Building, lineOf } from '../build/catalog';
import { rampartTower } from '../build/rampart';
import { isStart, startMessage, START_KIND } from '../build/startLock';
import { Sim, NeedId, ageGo } from '../sim/sim';
import { coverageTips, policeRange, FIRE_RANGE, COVER_JOY, COVER_JOY_MAX } from '../sim/coverage';
import type { Agents } from '../sim/agents';
import { GameTime } from '../core/time';
import { Environment, WeatherKind } from '../render/env';
import type { GfxParams } from '../render/adaptive';
import { AudioEngine } from '../audio/audio';
import { CameraRig, CAM_SENS } from '../core/camera';
import { type Controls, type CamControl, type KbLayout, layoutKeys } from '../core/controls';
import { type Blason, flagSvg } from '../sim/blason';
import { chooseBlason, blasonPickerHtml, bindBlasonPicker } from './blason';
import { setTeamBlason } from '../render/teamPaint';
import { matches } from './search';
import { readSlot, SaveData, savedAgo, Quality } from '../save/save';
import { helpOn, setHelpOn } from './warTips';
import { MAPS, newSeed } from '../world/mapgen';
import { Expeditions, Report, ActiveExpedition } from '../sim/expeditions';
import type { ExpEvent } from '../sim/events';
import { Railway, Train, isStation } from '../sim/railway';
import type { RailEditState } from '../build/trackEdit';
import { zoneLock, peacePerks } from '../sim/concession';
import { isleName, kindOffered, allyPostReadyNow, boonsMatter, talkRisk, TALK_RISK } from '../sim/diplomacy';
import { peoplesView } from '../sim/peoples';
import { peoplesHtml } from './peoples';
import { legacyOf } from '../sim/legacy';
import { boonText, effectSummary, effectChips, giftChips, splitIntro, mandatoriesFor, isLegendary, isMilitary, Mission, MISSIONS, VICTORY, redoEffects, REDO_DAYS, penHerds } from '../sim/missions';
import type { World } from '../world/world';
import { isleBlight } from '../world/blight';
import { GEAR, GEAR_BY, GearId, Gear, DANGER_NAME, DANGER_VS, gearCost, gearCostLabel, gearGaps, gearCurrent } from '../sim/gear';
import { choiceStyles, cardPhrase, type ChoiceStyleKind, type ChoiceEffect } from '../sim/choiceStyle';
import { priceIn, canPay, costLabel, haveLabel, shortLabel, Resource, PRODUCERS, YIELD, REFINE_CRUDE, FUEL_PER_CRUDE, CAR_FUEL, RES_NAME } from '../sim/economy';
import { archipelagoOn } from '../world/expand';
import { waysTabShown, type Way, type WayState } from '../sim/crossroads';
import { waysHtml, type ConflictWay } from './ways';
import { buy, buyQuote, sell, sellQuote, SAT_MAX, SAT_RECOVER, TRADE_RES, TradeRes, HALL_STEP, SAT_STEP } from '../sim/trade';
import { flowOf, flowOfBuilding, ledgerOf, LedgerRow, Flow, refundTotal, shortText } from '../sim/ledger';
import { gap, railBoost, railStation, railWant, freightBonus, FREIGHT_BONUS, RAIL_REACH } from '../sim/freight';
import { Difficulty, DIFFICULTIES, DIFF_TEXT, DEFAULT_DIFFICULTY, readDifficulty, rulesOf } from '../sim/difficulty';
import { TEAM_COLORS } from '../render/expeditionView';
import { ic, KIND_ICON, SUB_ICON, SEASON_ICONS } from './icons';
import { eyeClick } from './homeButton';
import { type Tutorial, menuToggle } from './tutorial';
import { brief, shortStop } from './brief';
import { citizenCard, missingText } from './citizenCard';
import { firstName, familyName } from '../sim/citizens';
import { folkTraits } from '../render/folk';
import { pic, hudPic, leadPic, withPic } from './pics';
import { activeGoals, progressOf, type GoalCtx, type GoalDef, type GoalReward } from '../sim/goals';
import { POPUP_PICS, preloadPics } from './preload';
import { menuBg, LOGO_PEAKS } from './loading';
import { MiniMap } from './minimap';
import { placeCard } from './xcard';
import { NotifQueue, Banners, type NotifLevel } from './notifs';
import type { CalamityKind } from '../sim/calamity';

export interface UIHost {
  tools: ToolController;
  world: World;
  sim: Sim;
  time: GameTime;
  env: Environment;
  audio: AudioEngine;
  cam: CameraRig;
  applySettings(): void;
  saveNow(): void;
  exportSave(): void;
  importFile(f: File): void;
  newGame(difficulty: Difficulty, age?: number): void;
  toMenu(): void;
  setPhoto(on: boolean): void;
  capture(): void;
  /** monde souterrain (moteur gardé pour les Enfers, hors de portée du joueur) : remonter, et la zone où l'on est */
  exitUnder(): void;
  underZone(): string | null;
  /** prendre le commandement de la garnison de l'île du portail (tour de garde, caserne) */
  commandIsle?(): void;
  /**
   * une garnison se commande sur l'île du portail (le bouton « Commander la garnison » des tours et casernes) ; faux au passage
   * direct : Karim (v6) le trouvait sans suite, les troupes vivent dans les Enfers
   */
  isleGarrison?(): boolean;
  /** le portail ouvert, on peut aller aux Enfers (le bouton rond « Les Enfers » paraît), et y aller */
  hellOpen?(): boolean;
  goHell?(): void;
  /**
   * Les deux voies du grand choix (les Enfers, explorer le monde), pour l'onglet « Grands choix » des expéditions : où elles en sont,
   * et les prendre (la carte de la voie s'ouvre pour confirmer)
   */
  ways?(): { hell: WayState; world: WayState };
  /** la carte du conflit des deux îles dans l'onglet « Grands choix » (null : pas d'archipel ou pas d'allié) */
  conflictWay?(): ConflictWay | null;
  takeWay?(way: Way): void;
  /** rouvrir la carte du grand choix (condition du passage au Médiéval) */
  openCrossroads?(): void;
  /** la diplomatie de l'archipel : la ligne du conflit des deux îles (rayon Vie) et sa carte */
  diploLine?(): { text: string; button: string } | null;
  openDiploChoice?(change?: boolean): void;
  /** la vue va sur l'île du portail (pour y bâtir) */
  goIsle?(): void;
  /** la vue va sur l'île de l'allié, là où l'on peut bâtir (le comptoir, le port) */
  goAlly?(): void;
  /** brouillard visible (0 … 1), et le dissiper */
  fogLevel(): number;
  dispelFog(): void;
  /** qualité graphique et catastrophes naturelles */
  quality: Quality;
  setQuality(q: Quality): void;
  /** ce que la qualité en cours donne vraiment : paramètres, halo, part de la finesse de l'écran, palier de « Auto » */
  readonly gfxShown: { p: GfxParams; glow: boolean; fine: number; level: number; max: number };
  disasters: boolean;
  setDisasters(on: boolean): void;
  /** catastrophes laissées une à une (crues, séismes, pluies de météorites) */
  readonly calamities: Readonly<Record<CalamityKind, boolean>>;
  setCalamity(k: CalamityKind, on: boolean): void;
  autoRoads: boolean;
  setAutoRoads(on: boolean): void;
  /** flèches d'amélioration au-dessus des bâtiments, masquées ou non */
  hideUpBadges: boolean;
  setHideUpBadges(on: boolean): void;
  /** petits objectifs de la barre du haut : masqués ou non ; `goalsOn` : ils avancent (pas au bac à sable ni pendant le tutoriel) */
  hideGoals: boolean;
  setHideGoals(on: boolean): void;
  /** la cinématique d'ouverture des parties neuves : coupée ou non (Paramètres › Divers) */
  introOff: boolean;
  setIntroOff(on: boolean): void;
  goalsOn: boolean;
  goalCtx(): GoalCtx;
  /** comment le joueur déplace la vue (souris ou clavier, et la disposition du clavier) ; voir `core/controls.ts` */
  controls: Controls;
  setControls(c: Controls): void;
  /** sensibilité de la vue et défilement au bord de l'écran (Paramètres › Partie) */
  camSens: number;
  edgeScroll: boolean;
  setCamSens(v: number): void;
  setEdgeScroll(on: boolean): void;
  /** les saisons éteintes (Paramètres › Temps et météo) */
  setSeasonsOff(list: number[]): void;
  /** le blason du village (couleurs des drapeaux et des troupes) ; voir `sim/blason.ts` */
  setBlason(b: Blason): void;
  /** le nom de l'île du joueur, choisi avec le blason (affiché en haut à gauche) */
  setIsleName(n: string): void;
  /** effets de la météo affichés (pluie, neige, brouillard), et les couper ou les rendre */
  readonly weatherFx: { rain: boolean; snow: boolean; fog: boolean };
  setWeatherFx(k: 'rain' | 'snow' | 'fog', on: boolean): void;
  /** expéditions, et celle que la caméra suit (son numéro) */
  expeditions: Expeditions;
  /** les gestes des bâtiments (lancer un match…) : voir shows.ts */
  shows: ShowDirector;
  /** la flotte de guerre (chantier B) : armer un navire au chantier naval (ce qui l'empêche, ou null), le nom de nos navires */
  armShip?(): string | null;
  shipName?(age?: number): string;
  /** chemin de fer de gare en gare, et la caméra qui suit le train */
  railway: Railway;
  followTrain(line: number): void;
  /** l'habitant que suit la caméra (sa fiche, bouton « Suivre »), et le suivre ou le lâcher */
  citizenCam: number | null;
  followCitizen(id: number | null): void;
  /** incendies, malaises, cambriolages en cours, et la caméra qui en suit un */
  incidents(): { key: string; icon: string; title: string; status: string; progress: number; x: number; z: number }[];
  incidentCam: string | null;
  followIncident(key: string | null): void;
  /** ligne en cours de tracé (arrêts, points de passage de la voie), et ce qu'on en fait */
  railEdit: RailEditState | null;
  startRailEdit(from: { stop?: number; line?: number }): void;
  railUndo(): void;
  railFinish(): void;
  railCancel(): void;
  /** le guidage pas à pas de la première ligne, rejoué depuis le début (onglet Chemin de fer) */
  railGuide?(): void;
  /** vignette 3D d'un bâtiment à un âge (data URL), null tant qu'elle n'est pas rendue */
  thumb?(k: KindId, age: number): string | null;
  /** plus de points de passage : la voie se pose d'elle-même ; ce qui empêche de valider le tracé (null : rien) */
  railAuto(): void;
  railTrouble(): string | null;
  agents: Agents;
  following: number | null;
  /** la vue suit une équipe (`far` : sans se rapprocher, au départ d'une expédition) */
  follow(id: number | null, far?: boolean): void;
  /** le joueur est au milieu d'un geste sur la carte (pose à moitié faite, clic à l'instant) : rien ne s'ouvre de soi-même */
  midGesture(): boolean;
  /** la vue revient sur le village (une seconde fois : vue d'ensemble) */
  goHome(): void;
}

/** Où en est le train d'une ligne, en clair */
function trainWhere(r: Railway, t: Train) {
  if (t.why) return t.why;
  const st = t.stops[t.at], name = st ? r.stopName(st.b) : '';
  if (t.phase === 'dwell') {
    const dir = t.at + t.dir < 0 || t.at + t.dir >= t.stops.length ? -t.dir : t.dir, nx = t.stops[t.at + dir];
    return t.waiting && nx ? tr('à quai à {name}, attend que le quai de {next} se libère', { name, next: r.stopName(nx.b) }) : tr('à quai à {name}', { name });
  }
  const next = t.stops[t.at + t.dir];
  return next ? tr('de {name} vers {next}', { name, next: r.stopName(next.b) }) : tr('parti de {name}', { name });
}
const dot = (c: number) => `<i class="lineDot" style="background:${hex(c)}"></i>`;
/** clé du `localStorage` : la barre du bas repliée ('1') ou dépliée ('0') */
const DOCK_MIN_KEY = 'ceionia.basReplie';
/** Texte sûr dans un attribut (info-bulle) */
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
/** Un texte long en fiche : son début, et la suite repliée derrière « En savoir plus » (data-k garde l'état ouvert d'un rendu à l'autre) */
function folded(text: string, k: string) {
  const [head, rest] = brief(text);
  return `<div class="desc">${head}${rest ? `<details class="more" data-k="${k}"><summary>${tr('En savoir plus')}</summary>${rest}</details>` : ''}</div>`;
}

/**
 * Ce que le rail apporte à ce bâtiment, pour sa fiche : une gare de marchandises voisine à un atelier ou une carrière (ou
 * ce qu'il faudrait pour en avoir une), une gare de voyageurs au cosmodrome ; pour une gare, les bâtiments qu'elle sert
 */
function railStat(h: UIHost, b: Building): [string, string] | null {
  const w = h.world, r = h.railway, want = railWant(b.kind), t = ic('train', 14, 2), bonus = Math.round(freightBonus(w) * 100);
  // [pastille courte, explication complète en info-bulle]
  if (want === 'freight') {
    const st = railStation(w, b);
    return st ? [`${t} ${pic('⚡', 14)} ${tr('+{n} % par le rail', { n: bonus })}`, tr('Boosté : servi par la gare de marchandises voisine ({name}), dont le chariot fait la navette. Il produit {n} % de plus', { name: r.stopName(st), n: bonus })]
      : [`${t} ${tr('+{n} % avec une gare', { n: bonus })}`, tr('Une gare à {r} cases au plus, desservie par un train de marchandises, le ferait produire {n} % de plus', { r: RAIL_REACH, n: bonus })];
  }
  if (want === 'passenger') {
    const st = railStation(w, b);
    return st ? [`${t} ${pic('⚡', 14)} ${tr('Servi par le train')}`, tr('Boosté : servi par la gare de voyageurs voisine ({name}). Les équipes arrivent en train, les expéditions spatiales sont plus sûres et les lancements préparés plus vite', { name: r.stopName(st) })]
      : [`${t} ${tr('À relier au train')}`, tr('Une gare à {r} cases au plus, desservie par un train de voyageurs, y amènerait les équipes : expéditions spatiales plus sûres et lancements préparés plus vite', { r: RAIL_REACH })];
  }
  if (!isStation(b)) return null;
  const near = [...w.buildings.values()].filter((o) => railWant(o.kind) && gap(o, b) <= RAIL_REACH);
  if (!near.length) return null;
  const names = [...new Set(near.map((o) => KINDS[o.kind].names[Math.max(o.age, KINDS[o.kind].minAge)].toLowerCase()))].join(', ');
  const lines = r.linesAt(b), freight = lines.some((l) => l.freight), pass = lines.some((l) => !l.freight);
  const prod = near.some((o) => railWant(o.kind) === 'freight'), space = near.some((o) => railWant(o.kind) === 'passenger');
  const served = (prod && freight) || (space && pass);
  return served ? [`${t} ${tr('Sert ses voisins')}`, tr('Sert ses voisins : {names}', { names })]
    : [`${t} ${tr('Voisins à servir')}`, tr('À côté : {names}. {tip} (bouton 📦 / 🧳 d’une ligne : marchandises ou voyageurs).', { names, tip: prod ? tr('Une ligne de marchandises d’ici les ferait produire {n} % de plus', { n: bonus }) : tr('Une ligne de voyageurs d’ici y amènerait les équipes') })];
}
/** Le conseil du rail sur la fiche d'un bâtiment qu'on s'apprête à bâtir */
function railTip(k: KindId) {
  const want = railWant(k);
  return want === 'freight' ? `<p class="perk">🚂 ${tr('Posé à {r} cases au plus d’une gare desservie par un train de marchandises, il produit {n} % de plus.', { r: RAIL_REACH, n: Math.round(FREIGHT_BONUS * 100) })}</p>`
    : want === 'passenger' ? `<p class="perk">🚂 ${tr('Une gare de voyageurs à {r} cases au plus y amène les équipes : expéditions spatiales plus sûres et lancements préparés plus vite.', { r: RAIL_REACH })}</p>` : '';
}
const riskLabel = (r: number) => tr(r <= 0.12 ? 'faible' : r <= 0.22 ? 'mesuré' : r <= 0.32 ? 'élevé' : 'très élevé');
const pct = (r: number) => pctText(Math.round(r * 100));
const workLabel = (s: number) => (s <= 15 ? 'courte' : s <= 23 ? 'moyenne' : 'longue');
/** Les gains en pastilles d'icônes (la phrase complète en infobulle) */
const chipsHtml = (effects: Parameters<typeof effectChips>[0]) => effectChips(effects).map((c) => `<span class="chip" title="${c.title}">${c.icon}${c.n ? ` ${c.n}` : ''}</span>`).join('') || `<span class="chip" title="${tr('rien')}">∅</span>`;
/** Un danger en icône (le nom en infobulle) */
const DANGER_ICON: Record<string, string> = { beast: '🐺', fall: '🧗', water: '🌊', dark: '🌑', weather: '⛈️', monster: '👹' };
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

const TOOL_INFO: Record<string, { icon: string; label: string; key?: string }> = {
  none: { icon: 'pointer', label: 'Voir', key: 'Échap' },
  raise: { icon: 'raise', label: 'Monter', key: '1' },
  lower: { icon: 'lower', label: 'Baisser', key: '2' },
  flatten: { icon: 'level', label: 'Aplanir', key: '3' },
  cliff: { icon: 'stairs', label: 'Falaise', key: '4' },
  dig: { icon: 'waves', label: 'Eau', key: '5' },
  mountain: { icon: 'peaks', label: 'Montagne', key: '0' },
  volcano: { icon: 'volcano', label: 'Volcan' },
  forest: { icon: 'forest', label: 'Forêt', key: '6' },
  field: { icon: 'wheat', label: 'Champ', key: '7' },
  biome: { icon: 'palette', label: 'Biome' },
  rocks: { icon: 'rock', label: 'Rochers' },
  cave: { icon: 'cave', label: 'Grotte' },
  fissure: { icon: 'crack', label: 'Faille' },
  erase: { icon: 'eraser', label: 'Gomme', key: '9' },
  road: { icon: 'road', label: 'Route', key: 'R' },
  bulldoze: { icon: 'demolish', label: 'Démolir', key: 'X' },
  move: { icon: 'hand', label: 'Déplacer', key: 'M' },
};

/** Ce que le jardin n'est pas : il ne produit rien */

/** À quoi sert chaque outil (fiche au survol) */
const TOOL_DESC: Record<string, string> = {
  none: 'Regarder le village. Un clic sur un volcan le réveille.',
  raise: 'Monter le terrain sous le pinceau.', lower: 'Baisser le terrain sous le pinceau.', flatten: 'Aplanir à la hauteur du premier clic.',
  cliff: 'Tailler des falaises : en glissant, le sol se dresse d’un gradin à paroi de roche franche, ou en gradins sur une pente. Maj : creuser d’un gradin.', dig: 'Creuser sous le niveau de l’eau : mares, rivières, lacs.',
  mountain: 'Faire pousser une montagne, avec ses neiges éternelles si elle est haute.', volcano: 'Poser un volcan (un clic) : plus le pinceau est large, plus il est haut. Pour le retirer : la Gomme ou Démolir sur son cône. Ctrl+Z annule.',
  forest: 'Planter une forêt : bois et bien-être.', field: 'Semer des champs : ils nourrissent le village.',
  biome: 'Peindre un biome (tempéré, taïga, désert, tropical, marais) ou rendre la terre à son climat : le sol, les arbres, l’herbe, les bêtes et la neige suivent.',
  rocks: 'Poser des rochers (un clic).', cave: 'Ouvrir une grotte dans la roche (un clic) : les expéditions vers une grotte s’y rendent.', fissure: 'Creuser une faille : en glissant, un ravin se creuse le long du tracé (le pinceau en règle la largeur). La Gomme le comble.',
  erase: 'Effacer forêts, champs, rochers et les arbres isolés de la carte, ou combler une faille.',
  road: 'Tracer une route : en ligne, en glissant case par case. En libre, d’un clic au point A puis au point B, une belle courbe qui contourne les obstacles (R pour changer de mode). Sur l’eau peu profonde, elle devient un pont.',
  bulldoze: 'Démolir un bâtiment, une route ou un décor. Élargissez le pinceau pour effacer d’un coup tout un parc, une forêt ou des routes (les petits bâtiments partent aussi, les grands se démolissent un à un).', move: 'Ramasser un bâtiment pour le reposer ailleurs (Échap pour annuler).',
};

/** Biomes que peint le pinceau, et leur teinte de pastille (null : rendre la terre à son climat) */
const BIOME_CHOICES: { b: number | null; label: string; color: string }[] = [
  { b: 0, label: 'Tempéré', color: '#8fc47e' }, { b: 1, label: 'Taïga', color: '#5f8a72' }, { b: 2, label: 'Désert', color: '#e2c27a' },
  { b: 3, label: 'Tropical', color: '#3fae6a' }, { b: 4, label: 'Marais', color: '#7a8a5a' }, { b: null, label: 'Climat', color: 'transparent' },
];

/** Modes de tracé de l'outil Route */
const ROAD_MODES: { id: RoadMode; icon: string; label: string; title: string }[] = [
  { id: 'line', icon: 'road', label: 'Ligne', title: 'En glissant, case par case (tout droit, à angle droit)' },
  { id: 'free', icon: 'pen', label: 'Libre', title: 'Un clic au point A, un clic au point B : une belle courbe qui contourne les obstacles, comme la voie ferrée' },
];

/** Outils rapides, toujours à portée en haut à gauche de la barre */
const QUICK = ['none', 'road', 'bulldoze', 'move'];

/** Grands onglets de la barre du bas */
const TABS = [
  { id: 'build', label: 'Bâtir' },
  { id: 'land', label: 'Paysage' },
];
type LandSub = 'relief' | 'nature';
/**
 * Les sous-menus du mode Paysage (comme les rayons de Bâtir), et dans chacun les outils rangés en groupes de lecture
 * (comme `BUILD_SUBS`)
 */
const LAND_SUBS: { id: LandSub; pic: string; label: string; groups: { label: string; icon: string; tools: string[] }[] }[] = [
  { id: 'relief', pic: '⛰', label: 'Relief', groups: [
    { label: 'Sculpter', icon: 'raise', tools: ['raise', 'lower', 'flatten', 'cliff'] },
    { label: 'Eau', icon: 'waves', tools: ['dig'] },
    { label: 'Sommets', icon: 'peaks', tools: ['mountain', 'volcano'] },
  ] },
  { id: 'nature', pic: '🌳', label: 'Nature', groups: [
    { label: 'Végétation', icon: 'forest', tools: ['forest'] },
    { label: 'Sol', icon: 'palette', tools: ['biome'] },
    { label: 'Décor', icon: 'rock', tools: ['rocks', 'cave', 'fissure'] },
    { label: 'Effacer', icon: 'eraser', tools: ['erase'] },
  ] },
];
/** Le sous-menu du Paysage auquel appartient un outil (null : un outil d'ailleurs) */
const landOfTool = (tool: ToolId): LandSub | null =>
  SCULPT_TOOLS.includes(tool) ? 'relief' : tool === 'biome' || (VEG_TOOLS.includes(tool) && tool !== 'field') ? 'nature' : null;

/** Besoins du village, dans l'ordre de la barre du haut */
const NEEDS: { k: 'food' | 'water' | 'housing' | 'jobs' | 'joy' | 'health'; icon: string; label: string }[] = [
  { k: 'food', icon: 'bread', label: 'Nourriture' }, { k: 'water', icon: 'drop', label: 'Eau' }, { k: 'housing', icon: 'house', label: 'Logement' },
  { k: 'jobs', icon: 'hammer', label: 'Travail' }, { k: 'joy', icon: 'smile', label: 'Bien-être' }, { k: 'health', icon: 'heart', label: 'Santé' },
];
/** Ce qu'un bâtiment apporte, pour sa fiche et sa vignette */
/** Le 7e besoin de la barre : la sécurité (couverture des pompiers et de la police), un indicateur qui ne bloque pas la croissance */
const SECURITY_NEED = { k: 'security' as const, icon: 'shield', label: 'Sécurité' };
/** Pictos 3D du HUD (voir `pics.ts`) : besoins, stocks, saisons, rayons et onglets de la barre de construction */
// icônes peintes du HUD (`hudPic`) ; le carburant garde son picto
const NEED_PIC: Record<NeedId | 'security', string> = { food: 'nourriture', water: 'eau', housing: 'logement', jobs: 'travail', joy: 'bienetre', health: 'sante', security: 'securite' };
const RES_PIC: Record<Resource, string> = { wood: 'bois', stone: 'pierre', ore: 'minerai', brick: 'briques', crude: 'carburant', fuel: '⛽', gold: '💰' };
const resPic = (r: Resource, size: number) => RES_PIC[r].length > 2 ? hudPic(RES_PIC[r], size) : pic(RES_PIC[r], size);
/** La barre du haut tient sur une ligne dès cette largeur d'écran (voir `UI.fitHud` et `style.css`) */
const ONE_LINE_MIN = 1100;
/**
 * L'écran allégé (version B des maquettes `.claude/maquettes-hud/ecran-allege/`, choisie par l'auteur le 23 nov. 2026) : sur un
 * écran d'ordinateur, tout le haut sur une barre de 46 px, les équipes dans une pastille, le conseil et les messages à une seule
 * place, les vignettes de construction repliées tant qu'aucun outil n'est en main. `body.allege`, voir `hudAllege.css`
 */
const ALLEGE = `(min-width: ${ONE_LINE_MIN}px) and (min-height: 521px)`;
const allege = () => document.body.classList.contains('allege');
/** marge de sécurité de la barre du haut sur une ligne (arrondis, bordures des pilules) */
const FIT_SLACK = 8;
/**
 * Ce qui reste de cette marge pour garder le nombre de stocks et de besoins déjà montré : sans elle, quand la place était
 * juste, un rien (l'heure, l'objectif, un chiffre) faisait passer la barre de quatre stocks à trois et ses flèches, puis
 * revenir, image après image (vidéo de l'auteur, 24 nov. 2026)
 */
const FIT_KEEP = 6;
/** durée de la pastille dorée d'un objectif atteint */
const GOAL_WIN_MS = 5000;
/**
 * Une case qui ne tient pas entière dans sa fenêtre de défilement (stocks, besoins) est masquée : on ne voit plus un bout du stock
 * suivant, ses chiffres coupés (« 31 » pour 318, testeuse v6). Refait à chaque défilement
 */
function hidePeek(v: HTMLElement) {
  const box = v.getBoundingClientRect();
  for (const e of v.querySelectorAll<HTMLElement>('.res, .need')) {
    const r = e.getBoundingClientRect();
    e.classList.toggle('peek', r.left < box.left - 1 || r.right > box.right + 1);
  }
}
/** La récompense d'un objectif en petites pastilles : « +25 [pierre] », « [bien-être] +2 · 4 j » */
function rewardChips(r: GoalReward) {
  const out: string[] = [];
  for (const k of ['wood', 'stone', 'ore'] as const) if (r[k]) out.push(`<span class="gc">+${r[k]} ${resPic(k, 15)}</span>`);
  if (r.joy) out.push(`<span class="gc">${hudPic('bienetre', 15)} +${r.joy.n} · ${tr('{n} j', { n: r.joy.days })}</span>`);
  return out.length ? `<span class="gr">${out.join('')}</span>` : '';
}
/** La même, en mots : « +25 pierre, bien-être +2 pendant 4 jours » */
function rewardWords(r: GoalReward) {
  const out: string[] = [];
  if (r.wood) out.push(tr('+{n} bois', { n: r.wood }));
  if (r.stone) out.push(tr('+{n} pierre', { n: r.stone }));
  if (r.ore) out.push(tr('+{n} minerai', { n: r.ore }));
  if (r.joy) out.push(tr('bien-être +{n} pendant {d} jours', { n: r.joy.n, d: r.joy.days }));
  return out.length ? tr('Récompense : {r}', { r: out.join(', ') }) : '';
}
const SEASON_PIC = ['printemps', 'ete', 'automne', 'hiver'];
const CAT_PIC: Record<BuildCat, string> = { home: 'habitat', prod: 'production', service: 'services', life: 'culture', deco: 'printemps', war: 'militaire' };
/** Le picto de la carte du village, qui suit l'âge : Préhistoire, Antiquité, Médiéval, Industriel, Moderne, Futuriste */
const AGE_PIC = ['age-0', 'age-1', 'age-2', 'age-3', 'age-4', 'age-5'];
/** l'emblème au trait de chaque âge, si son image peinte n'arrive pas (cartouche du village) */
const AGE_SVG = ['campfire', 'columns', 'castle', 'anvil', 'tower', 'rocket'];
const TAB_PIC: Record<string, string> = { build: 'production', land: 'paysage' };
const GIVES: { k: 'housing' | 'food' | 'water' | 'jobs' | 'joy' | 'health'; icon: string; label: string; one?: string }[] = [
  { k: 'housing', icon: 'house', label: 'logements', one: 'logement' }, { k: 'food', icon: 'bread', label: 'nourriture' }, { k: 'water', icon: 'drop', label: 'eau' },
  { k: 'jobs', icon: 'hammer', label: 'emplois', one: 'emploi' }, { k: 'joy', icon: 'smile', label: 'bien-être' }, { k: 'health', icon: 'heart', label: 'santé' },
];
/** Fiche d'une ressource : son icône, à quoi elle sert, comment en avoir plus, et le bâtiment qui la produit */
/** (l'or n'a pas de bâtiment : sa fiche est le comptoir des voisins, `renderTrade`) */
const RES_META: Record<Exclude<Resource, 'gold'>, { label: string; icon: string; use: string; more: string; kind: KindId }> = {
  wood: { label: 'Bois', icon: 'tree', kind: 'lumber', use: 'Sert à bâtir les grands bâtiments.', more: 'Un bûcheron, posé en lisière ou dans une forêt, en coupe chaque jour. Pas de forêt ? Plantez-en une (Paysage › Nature › Forêt).' },
  stone: { label: 'Pierre', icon: 'rock', kind: 'quarry', use: 'Sert à bâtir les grands bâtiments.', more: 'Une carrière, posée près des rochers ou dans la montagne, en taille chaque jour. Pas de rochers ? Posez-en (Paysage › Nature › Rochers). La mine en donne aussi.' },
  ore: { label: 'Minerai', icon: 'pickaxe', kind: 'mine', use: 'Sert à passer les âges et à fabriquer l’équipement des expéditions.', more: 'La mine, creusée dans la montagne, en donne chaque jour. Certaines expéditions en rapportent aussi.' },
  brick: { label: 'Briques', icon: 'brick', kind: 'brickworks', use: 'Sert à passer à l’âge futuriste et à bâtir gares, usines et raffineries.', more: 'Une briqueterie (Bâtir › Production, dès l’âge industriel) en cuit chaque jour. Elle se pose où l’on veut, l’argile ne manque jamais.' },
  crude: { label: 'Pétrole brut', icon: 'crude', kind: 'oilwell', use: 'La raffinerie en fait du carburant.', more: 'Un puits de pétrole se fore sur un gisement : les taches sombres où le brut suinte.' },
  fuel: { label: 'Carburant', icon: 'fuel', kind: 'refinery', use: 'Fait rouler les automobiles du village (2 par jour pour chaque usine automobile). Sans carburant, elles restent au garage.', more: 'La raffinerie (débloquée par l’expédition « L’or noir ») en tire du pétrole brut des puits. Une gare de marchandises à côté d’elle la fait raffiner 75 % de plus.' },
};

/** Une condition d'âge sans bâtiment : le minerai, les briques, l'expédition obligatoire ou les habitants */

/**
 * Le bâtiment est-il proposé dans cette partie ? (la diplomatie ; le comptoir : seulement avec l'archipel). Au bac à sable, les
 * monuments de la diplomatie (arc de triomphe, ambassade, concorde) s'ouvrent à leur âge sans guerre ni paix, comme le reste
 * (retour de l'auteur, 20 nov. 2026) ; le comptoir reste à l'archipel, il ne se pose que chez l'allié
 */
const offered = (w: World, k: KindId) => (w.sandbox ? k !== 'tradepost' || archipelagoOn(w) : kindOffered(w, k) && (k !== 'tradepost' || archipelagoOn(w)));

/** « +1 emploi », « +3 emplois » */
/** La consommation du village, par besoin, dans la carte d'un équipement survolé (`needUse`) */
const NEED_USE: Record<(typeof GIVES)[number]['k'], string> = {
  housing: 'À loger : {n} habitants', food: 'Consommation du village : {n} de nourriture', water: 'Consommation du village : {n} d’eau',
  jobs: 'À employer : {n} habitants', joy: 'Demande du village : {n} de bien-être', health: 'Consommation du village : {n} de soins',
};
/** La sensibilité de la vue, en facteur (« ×1,2 ») */
const sensText = (v: number) => `×${v.toFixed(1).replace('.', isEnglish() ? '.' : ',')}`;
/** En dessous de cette largeur (téléphone), la languette de la barre reste au milieu de la barre (`UI.placeFold`) */
const FOLD_SIDE = '(max-width: 860px)';
const give = (g: (typeof GIVES)[number], v: number) => `+${num(v)} ${tr(v < 2 && g.one ? g.one : g.label)}`;
/** une décimale quand il y en a une (« 2,4 » de bien-être ne s'affiche plus « 2 » en rouge) */
const num = (v: number) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1));
/** Ce qu'un bâtiment produit ou consomme par jour, en pastilles (« +8 bois / jour », « −2 carburant / jour ») */
const flowChips = (f: Flow) => (Object.keys(f) as Resource[]).filter((r) => f[r]).sort((a, b) => f[b]! - f[a]!)
  .map((r) => `<span class="eff flow${f[r]! < 0 ? ' neg' : ''}">${resPic(r, 15)} ${tr('{n} {res} / jour', { n: signed(f[r]!), res: tr(RES_NAME[r]) })}</span>`).join('');
/** « +8 », « −2,5 » : un débit par jour, signé */
const signed = (v: number) => `${v < 0 ? '−' : '+'}${num(Math.abs(v))}`;
/** Ce que demande chaque besoin, en clair, pour sa fiche */
const NEED_RULE: Record<NeedId, string> = {
  housing: 'Chaque habitant occupe une place. Le village grandit tant qu’il reste des places libres et que les autres besoins sont comblés.',
  food: 'Chaque habitant mange une part (une part et quart en Normal), plus une part de réserve pour le village. On compte en parts entières.',
  water: 'Chaque habitant boit une part, plus une part de réserve pour le village.',
  jobs: 'À partir de 6 habitants, la moitié d’entre eux cherche du travail.',
  joy: 'À partir de 6 habitants, chacun demande 0,3 de bien-être.',
  health: 'À partir de 15 habitants, chacun demande 0,2 de soins.',
};
/** Ce qu'un bâtiment apporte, en quelques mots (bois, pierre, nourriture, emplois…) : sa vignette et son info-bulle */
const givesOf = (k: KindId, a: number): string[] => {
  const out: string[] = [];
  const y = YIELD[k];
  for (const r of Object.keys(y ?? {}) as Exclude<Resource, 'gold'>[]) if (y![r]![a]) out.push(tr(RES_META[r].label));
  for (const g of MAIN.map((m) => GIVES.find((x) => x.k === m)!)) if (KINDS[k][g.k]?.[a]) { const l = tr(g.label); out.push(l[0].toUpperCase() + l.slice(1)); }
  return out;
};
/** Apport principal d'un bâtiment, sur sa vignette */
const MAIN: (typeof GIVES)[number]['k'][] = ['housing', 'food', 'water', 'health', 'joy', 'jobs'];

const WEATHER_ICON: Record<WeatherKind, string> = { clear: '', rain: 'rain', snow: 'snow', fog: 'fog' };
/** Effets de la météo qu'on peut éteindre dans les réglages : clé, icône, nom */
/** Les catastrophes qu'on coupe une à une : leur icône et leur nom */
const CALAM_FX: [CalamityKind, string, () => string][] = [['flood', 'waves', () => tr('Crues')], ['quake', 'crack', () => tr('Séismes')], ['meteor', 'flame', () => tr('Météorites')]];
const WEATHER_FX: ['rain' | 'snow' | 'fog', string, () => string][] = [['rain', 'rain', () => tr('Pluie')], ['snow', 'snow', () => tr('Neige')], ['fog', 'fog', () => tr('Brouillard')]];

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

/** Le niveau de qualité choisi, en clair : une phrase, puis ce qu'il donne aspect par aspect (relu des réglages appliqués) */
function qualityInfo(qual: Quality, g: UIHost['gfxShown']) {
  const p = g.p, pc = (x: number) => pctText(Math.round(Math.min(1, x) * 100));
  const say = qual === 'auto'
    ? `${tr('S’ajuste tout seul : part du plus beau, baisse par paliers si le jeu saccade, et remonte quand tout redevient fluide.')} ${g.level ? tr('En ce moment : palier {n} sur {max}, l’image est allégée.', { n: g.level, max: g.max }) : tr('En ce moment : rien n’est allégé.')}`
    : qual === 'high' ? tr('Tout au plus beau, avec le halo lumineux des lampes et des feux la nuit. Pour un ordinateur solide.')
    : qual === 'medium' ? tr('Sans halo de nuit. Ombres, détails au loin et particules un peu allégés.')
    : tr('Sans halo ni brume. Ombres, détails au loin et particules réduits. Pour un ordinateur modeste ou un portable sur batterie.');
  const yes = (on: boolean) => `<b class="${on ? 'on' : 'off'}">${tr(on ? 'Oui' : 'Non')}</b>`;
  const items: [string, string][] = [
    [tr('Halo de nuit'), yes(g.glow)],
    [tr('Brume'), yes(p.mist)],
    [tr('Ombres'), `<b>${tr(p.shadowSize >= 2048 ? 'Fines' : p.shadowSize >= 1536 ? 'Moyennes' : 'Grossières')}</b>`],
    [tr('Bêtes et habitants animés'), `<b>${tr('{p} de la distance', { p: pc(p.faunaDetail) })}</b>`],
    [tr('Arbres détaillés'), `<b>${tr('{p} de la distance', { p: pc(p.vegLod / 48) })}</b>`],
    [tr('Finesse de l’image'), `<b>${tr('{p} de l’écran', { p: pc(g.fine) })}</b>`],
    [tr('Fumées, embruns, étincelles'), `<b>${pc(p.density)}</b>`],
  ];
  return `<p class="hint">${say}</p><ul class="qGrid">${items.map(([l, v]) => `<li><span>${l}</span>${v}</li>`).join('')}</ul>`;
}

/** Noms des langues, chacun dans sa propre langue */
const LANG_NAME: Record<string, string> = { fr: 'Français', en: 'English' };
/** Le drapeau de chaque langue, en SVG (3 sur 2) : France, Royaume-Uni */
const LANG_FLAG: Record<string, string> = {
  fr: '<svg viewBox="0 0 3 2" preserveAspectRatio="none"><rect width="1" height="2" fill="#0055a4"/><rect x="1" width="1" height="2" fill="#fff"/><rect x="2" width="1" height="2" fill="#ef4135"/></svg>',
  en: '<svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice"><clipPath id="flagUkT"><path d="M30,15h30v15zv15h-30zh-30v-15zv-15h30z"/></clipPath>'
    + '<rect width="60" height="30" fill="#012169"/><path d="M0,0L60,30M60,0L0,30" stroke="#fff" stroke-width="6"/>'
    + '<path d="M0,0L60,30M60,0L0,30" clip-path="url(#flagUkT)" stroke="#c8102e" stroke-width="4"/>'
    + '<path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/><path d="M30,0v30M0,15h60" stroke="#c8102e" stroke-width="6"/></svg>',
};
/** Sélecteur de langue (menu principal et réglages) : un bouton par langue, celle en cours est enfoncée */
function langPicker(cur: string, cls = '') {
  return `<div class="row langPick ${cls}" role="group" aria-label="${tr('Langue')}">${LANGS.map((l) => `<button type="button" data-lang="${l}" class="${l === cur ? 'active' : ''}" aria-pressed="${l === cur}" lang="${l}"><span class="flag" aria-hidden="true">${LANG_FLAG[l] ?? ''}</span>${LANG_NAME[l]}</button>`).join('')}</div>`;
}
/** Branche le sélecteur : un clic change la langue (mémorisée) ; `after` redessine l'écran (en jeu, la page recharge d'elle-même) */
function bindLangPicker(root: HTMLElement, after?: (l: Lang) => void) {
  root.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) => (b.onclick = () => {
    const l = b.dataset.lang as Lang;
    if (l === getLang()) return;
    setLang(l);
    after?.(l);
  }));
}

/** Confirmation dans le jeu (le confirm() natif est bloqué dans certains navigateurs intégrés) */
export function confirmBox(root: HTMLElement, message: string, ok = 'Confirmer'): Promise<boolean> {
  ok = tr(ok);
  message = tr(message);
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.style.zIndex = '40';
    ov.innerHTML = `<div class="modal panel" style="max-width:380px"><p></p><div class="row"><span class="grow"></span><button data-r="0">${tr('Annuler')}</button><button data-r="1" class="active">${ok}</button></div></div>`;
    $('p', ov).textContent = message;
    const done = (r: boolean) => { ov.remove(); resolve(r); };
    ov.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => done(b.dataset.r === '1')));
    ov.addEventListener('pointerdown', (e) => { if (e.target === ov) done(false); });
    root.appendChild(ov);
  });
}

/** Les boutons de choix de l'âge de départ (bac à sable) : `data-a` porte l'âge, `aria-pressed` celui qui est choisi */
const ageButtons = (cls: string, pick: number) => AGES.map((a, i) => `<button type="button" class="${cls}" data-a="${i}" aria-pressed="${i === pick}">${a.name}</button>`).join('');

/**
 * Choix de la difficulté d'une nouvelle partie : trois cartes (celle de `current` choisie d'avance), puis « Commencer » ;
 * `note` prévient de ce qui sera écrasé. Au bac à sable, on choisit aussi l'âge de départ (`age` d'avance).
 * Rend la difficulté et l'âge choisis, ou null si le joueur renonce
 */
export function chooseDifficulty(root: HTMLElement, opts: { current?: Difficulty; age?: number; note?: string; ok?: string } = {}): Promise<{ d: Difficulty; age: number } | null> {
  const T = DIFF_TEXT;
  let pick: Difficulty = opts.current ?? DEFAULT_DIFFICULTY, age = opts.age ?? 0;
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.style.zIndex = '40';
    ov.innerHTML = `<div class="modal panel diffpick"><div class="mtitle"><h3>${ic('target', 22)} ${T.choose}</h3></div><p class="hint">${T.chooseSub}</p>
      <div class="diffs">${DIFFICULTIES.map((d) => `<button class="diff ${d}" data-d="${d}" aria-pressed="${d === pick}"><b>${ic(T.icon[d], 30, 1.6)}</b><strong>${T.name[d]}</strong><em>${T.tagline[d]}</em><ul>${T.points[d].map((x) => `<li>${x}</li>`).join('')}</ul></button>`).join('')}</div>
      <div class="pickAges" ${pick === 'sandbox' ? '' : 'hidden'}><span>${T.startAge}</span><div class="ageBtns">${ageButtons('ageBtn', age)}</div></div>
      ${opts.note ? `<p class="hint warn">${ic('alert', 14, 2)}${opts.note}</p>` : ''}
      <div class="row foot"><span class="grow"></span><button data-r="0">${T.cancel}</button><button data-r="1" class="active">${opts.ok ?? T.start}</button></div></div>`;
    const done = (r: { d: Difficulty; age: number } | null) => { ov.remove(); resolve(r); };
    // l'âge de départ ne compte qu'au bac à sable
    const res = (d: Difficulty) => ({ d, age: d === 'sandbox' ? age : 0 });
    const sel = () => { ov.querySelectorAll<HTMLElement>('[data-d]').forEach((x) => x.setAttribute('aria-pressed', `${x.dataset.d === pick}`)); $('.pickAges', ov).hidden = pick !== 'sandbox'; };
    ov.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => {
      b.onclick = () => { pick = b.dataset.d as Difficulty; sel(); };
      b.ondblclick = () => done(res(b.dataset.d as Difficulty));
    });
    ov.querySelectorAll<HTMLButtonElement>('.ageBtn').forEach((b) => {
      b.onclick = () => { age = +b.dataset.a!; ov.querySelectorAll('.ageBtn').forEach((x) => x.setAttribute('aria-pressed', `${x === b}`)); };
    });
    ov.querySelectorAll<HTMLButtonElement>('[data-r]').forEach((b) => (b.onclick = () => done(b.dataset.r === '1' ? res(pick) : null)));
    ov.addEventListener('pointerdown', (e) => { if (e.target === ov) done(null); });
    root.appendChild(ov);
  });
}

/** Les cartes de choix qui arrêtent le jeu tant qu'elles sont montrées (voir `UI.menuOpen`) */
const CHOICE_CARDS = ['worldChoice', 'portalChoice', 'diploChoice'];

/** les pixels que la fenêtre des stocks peut prendre en plus de sa place pour montrer une ressource entière (voir `fitResView`) */
const RES_SLACK = 16;
/** Fenêtre du jeu : titre, contenu, bouton de fermeture ; se ferme aussi d'un clic à côté */
/** `sticky` : une fenêtre qu'on ne peut pas écarter (ni croix, ni clic à côté, ni Échap) : seule sa propre réponse la ferme */
function modal(root: HTMLElement, cls: string, title: string, body: string, onClose?: () => void, sticky = false): { ov: HTMLElement; close: () => void } {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal panel ${cls}"><div class="mtitle"><h3>${title}</h3><button class="x" title="${tr('Fermer')}" aria-label="${tr('Fermer')}">${ic('close', 16, 2)}</button></div>${body}</div>`;
  root.appendChild(ov);
  // Échap ferme la fenêtre du dessus (voir closeTop)
  (ov as HTMLElement & { close?: () => void }).close = () => { if (!sticky) close(); };
  const close = () => { if (!ov.isConnected) return; ov.remove(); onClose?.(); };
  if (sticky) ov.classList.add('sticky');
  else ov.addEventListener('pointerdown', (e) => { if (e.target === ov) close(); });
  $('.x', ov).onclick = close;
  return { ov, close };
}

/** Les outils de la barre des bâtiments qui ont une vignette peinte (le champ de blé, `public/ui/champ.webp`) */
const TOOL_THUMB: Record<string, string> = { field: './ui/champ.webp' };

/** La boussole peinte de l'en-tête des expéditions (`public/icons/hud/boussole.webp`) */
const EXP_EMBLEM = hudPic('boussole', 62, 'exEmblem');
/** L'avion de papier du bouton « Envoyer une équipe » */
const SEND_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M21.5 2.5L10 14M21.5 2.5l-7 19-4.5-7.5L2.5 9.5z"/></svg>';
/**
 * L'illustration d'une carte d'expédition (`public/expeditions/`) : celle de la mission si elle en a une, sinon celle de son
 * lieu (le premier choix ; la mer pour un choix en mer). Sans image, la carte montre la pastille de la mission sur un fond
 * aux couleurs du lieu (`.mart.{lieu}`)
 */
const MISSION_ART = new Set([
  'mammoth', 'honey', 'seeds', 'horses', 'fishing', 'springs', 'pugilat', 'kraken', 'portal', 'megalodon', 'mine', 'wolf',
  'brewer', 'dragon', 'caravel', 'spice', 'railway', 'coal', 'motorcar', 'flight', 'oil', 'galleon', 'summit', 'reef',
  'stars', 'games', 'trawl', 'seafarm', 'rocket', 'moon', 'colony',
]);
const DEST_ART = new Set(['plain', 'forest', 'sea', 'far', 'mountain', 'river', 'cave', 'spaceport']);
/**
 * Missions dessinées en diorama (`public/expeditions/dio-{id}.webp`, îlot isométrique sur fond transparent) : l'îlot est posé
 * à cheval sur le bord gauche de la carte. Toutes les missions en ont un ; une mission ajoutée sans diorama garde l'image
 * dans son cadre
 */
const MISSION_DIO = new Set([
  'herd', 'berries', 'flint', 'honey', 'mammoth', 'seeds', 'horses', 'fishing', 'springs', 'pugilat', 'kraken', 'portal',
  'megalodon', 'mine', 'wolf', 'fair', 'brewer', 'dragon', 'caravel', 'spice', 'railway', 'coal', 'motorcar', 'flight', 'oil',
  'galleon', 'summit', 'reef', 'stars', 'games', 'trawl', 'seafarm', 'rocket', 'moon', 'colony', 'allywar', 'envoys', 'truce',
  'obsidian', 'ascent', 'eruption', 'stag', 'isleFair', 'isleRebuild', 'isleSmiths', 'isleRegatta', 'isleSpy', 'isleDefector',
  'isleSabotage', 'isleSeeds',
]);
/** Équipements illustrés (`public/icons/gear/`) : `{id}.webp` sans décor (cases, file), `{id}-bg.webp` avec décor (cartes) */
const GEAR_ART = new Set<GearId>([
  'spear', 'rope', 'torch', 'bow', 'boat', 'sword', 'crossbow', 'armor', 'kit', 'rifle', 'lamp', 'assault', 'grenade',
  'plasma', 'energyArmor', 'fieldShield', 'obsidianSpear', 'obsidianSword',
]);
/** Icône au trait de la carte d'équipement : celles du pack de la maquette, sinon l'icône de la pièce */
const GEAR_LINE: Partial<Record<GearId, string>> = {
  rifle: 'eq-rifle', assault: 'eq-rifle', plasma: 'eq-plasma', rope: 'eq-rope', lamp: 'eq-lamp', boat: 'eq-boat', armor: 'eq-armor',
  energyArmor: 'eq-energyArmor', fieldShield: 'eq-fieldShield',
};
/** Une pièce sans décor à `img` px, ou son icône au trait à `line` px si elle n'est pas encore illustrée */
const gearPic = (g: Gear, img: number, line: number, stroke = 1.8) => GEAR_ART.has(g.id)
  ? `<img class="gpic" src="./icons/gear/${g.id}.webp" width="${img}" height="${img}" alt="" draggable="false" decoding="async">`
  : ic(g.icon, line, stroke);
function missionArt(m: Mission): { src: string | null; dest: string } {
  const c = m.choices[0], dest = c?.sea ? 'sea' : c?.dest ?? 'plain';
  const src = MISSION_ART.has(m.id) ? `./expeditions/mission-${m.id}.webp` : DEST_ART.has(dest) ? `./expeditions/dest-${dest}.webp` : null;
  return { src, dest };
}

/** Onglet auquel appartient un outil ('none' reste dans l'onglet courant) */
const tabOfTool = (tool: ToolId, current: string) =>
  landOfTool(tool) ? 'land' : tool === 'none' ? current : 'build';

/** Ce que change un bâtiment débloqué par une expédition, dit au retour de l'équipe */
const UNLOCK_NOTE: Partial<Record<KindId, string>> = {
  pen: ' Les bêtes ramenées y vivront.', stable: ' Les chevaux ramenés y vivront.', mine: ' Elle rapportera du minerai chaque jour.',
  carworks: ' Les automobiles remplacent désormais les charrettes sur les routes. Les écuries gardent leurs chevaux pour la cavalerie.',
  aerodrome: ' Montgolfières et dirigeable prendront l’air depuis son terrain.',
};

export class UI {
  root: HTMLElement;
  tab = 'build';
  /** rayon ouvert de la barre de construction */
  cat: BuildCat = 'home';
  /** sous-menu ouvert du mode Paysage */
  land: LandSub = 'relief';
  private lastAge = -1;
  /** le besoin dont la fiche est ouverte */
  private needOpen: NeedId | 'security' | null = null;
  /** ressource dont la fiche est ouverte (même panneau que celle d'un besoin) */
  private resOpen: Resource | null = null;
  private notifs = new NotifQueue();
  private banners = new Banners(() => document.getElementById('banner')!);
  /** bâtiment ou outil survolé dans la barre (sa fiche s'affiche) */
  private hover: { kind?: KindId; tool?: string } | null = null;
  /** fiche du bâtiment sélectionné : redessinée seulement quand il change */
  private selKey = '';
  /** cartes des expéditions en cours, par numéro */
  private expCards = new Map<number, HTMLElement>();
  private incCards = new Map<string, HTMLElement>();
  /** tutoriel guidé (sa ligne dans les réglages) */
  tutorial: Tutorial | null = null;
  /** la mini-carte du coin bas droit */
  private mini: MiniMap;

  constructor(root: HTMLElement, private host: UIHost) {
    this.root = root;
    root.innerHTML = `
      <header id="hud">
        <div id="hudL">
          <div id="agePanel" class="panel" title="${tr("Voir ce qu'il faut pour l'âge suivant")}">
            <div class="vCard">
              <span class="vLogo" id="vLogo"></span>
              <div class="vText">
                <div class="ageTop"><b class="vName">Ceionia</b><span class="chev">▾</span><em id="agePct"></em></div>
                <div class="ageLine"><i class="dot"></i><b id="ageName"></b></div>
              </div>
            </div>
            <small id="ageSub"></small>
            <div class="bar ageGauge"><i id="ageBar"></i></div>
            <div id="ageNext"></div>
            <button id="ageGo" hidden></button>
            <div id="ageReq"></div>
          </div>
          <div id="hudNotes">
            <div class="msgRow"><div id="msg"></div></div>
          </div>
        </div>
        <div id="needsPanel">
          <div id="resPanel" class="panel hudPill"><button class="resNav" id="resPrev" title="${tr('Ressources précédentes')}" aria-label="${tr('Ressources précédentes')}">${ic('chevLeft', 16, 2.4)}</button><div id="resView"><div id="res"></div></div><button class="resNav" id="resNext" title="${tr('Ressources suivantes')}" aria-label="${tr('Ressources suivantes')}">${ic('chevRight', 16, 2.4)}</button><span class="hsep"></span><button class="pop" id="pop" title="${tr('État des habitants')}" aria-label="${tr('État des habitants')}" aria-expanded="false"></button></div>
          <div id="needsBox" class="panel hudPill"><button id="needsOk" type="button" aria-expanded="false"></button><button class="resNav" id="needPrev" title="${tr('Besoins précédents')}" aria-label="${tr('Besoins précédents')}">${ic('chevLeft', 16, 2.4)}</button><div id="needView"><div id="needs"></div></div><button class="resNav" id="needNext" title="${tr('Besoins suivants')}" aria-label="${tr('Besoins suivants')}">${ic('chevRight', 16, 2.4)}</button></div>
          <div id="goalBox" class="panel hudPill" hidden></div>
        </div>
        <div id="hudR">
          <div id="timePanel">
            <div id="clock" class="panel"></div>
            <button id="bPause" class="round" title="${tr('Pause (Espace)')}" aria-label="${tr('Pause')}">${ic('pause', 20, 2.2)}</button>
            <button id="bSpeed" class="round" title="${tr('Vitesse (− / +)')}" aria-label="${tr('Vitesse')}"></button>
          </div>
          <nav id="menuBtns">
            <button id="bExp" class="round" title="${tr('Expéditions (J)')}" aria-label="${tr('Expéditions')}">${ic('compass', 21)}<span id="expBadge"></span></button>
            <button id="bMenu" class="round" type="button" title="${tr('Peuples, Enfers et notifications')}" aria-label="${tr('Peuples, Enfers et notifications')}" aria-expanded="false">${ic('menu', 20, 2.2)}<span id="menuBadge"></span></button>
            <div id="hudMenu" class="panel" hidden></div>
            <button id="bHell" class="round" title="${tr('Les Enfers : vos troupes et votre base, de l’autre côté du portail')}" aria-label="${tr('Les Enfers')}" style="display:none">${ic('flame', 21)}<span class="wl">${tr('Les Enfers')}</span></button>
            <button id="bPeoples" class="round" title="${tr('Peuples')}" aria-label="${tr('Peuples')}" style="display:none">${ic('flag', 21)}<span class="wl">${tr('Peuples')}</span></button>
            <button id="bBell" class="round" title="${tr('Notifications (N)')}" aria-label="${tr('Notifications')}" aria-expanded="false">${ic('bell', 20)}<span class="wl">${tr('Notifications')}</span><span id="bellBadge"></span></button>
            <button id="bSettings" class="round" title="${tr('Paramètres')}" aria-label="${tr('Paramètres')}">${ic('gear', 21)}</button>
          </nav>
        </div>
      </header>
      <div id="expList"><button id="helpBtn" type="button" aria-pressed="false"></button><button id="expPill" type="button" aria-expanded="false" hidden></button><div id="toasts" role="status" aria-live="polite" aria-relevant="additions"></div></div>
      <div id="underBar" class="panel">
        <div id="underZone"></div>
        <button id="bUp" title="${tr('Remonter à la surface (U)')}">${ic('up', 18)} ${tr('Remonter')}</button>
      </div>
      <div id="selCard" class="panel"></div>
      <div id="railEdit" class="panel"></div>
      <div id="fade"></div>
      <footer id="dock">
        <div id="info" class="panel"></div>
        <div id="dockRow">
          <div id="dockSide" class="panel">
            <button id="bFold" type="button" aria-expanded="true"></button>
            <div id="modes"></div>
            <div class="quick" id="quickL"></div>
            <div class="quick" id="quickR">
              <button id="bUndo" title="${tr('Annuler (Ctrl+Z)')}" aria-label="${tr('Annuler')}">${ic('undo', 17, 2)}</button>
              <button id="bRedo" title="${tr('Rétablir (Ctrl+Y)')}" aria-label="${tr('Rétablir')}">${ic('redo', 17, 2)}</button>
              <button id="bRot" title="${tr('Tourner le bâtiment (R)')}" aria-label="${tr('Tourner le bâtiment')}">${ic('rotate', 17, 2)}</button>
            </div>
          </div>
          <div id="dockMain" class="panel">
            <div id="dockTop"><div id="subcats"></div><label id="dockSearch" title="${tr('Chercher un bâtiment ou un outil par son nom (Ctrl+F)')}">${ic('search', 15, 2.2)}<input id="itSearch" type="search" autocomplete="off" spellcheck="false" placeholder="${tr('Rechercher…')}" aria-label="${tr('Rechercher un bâtiment')}"><button id="itClear" type="button" tabindex="-1" aria-label="${tr('Effacer la recherche')}">${ic('close', 12, 2.4)}</button></label><button id="bMore" type="button" aria-expanded="false" title="${tr('Outils, vue et carte')}" aria-label="${tr('Outils, vue et carte')}">⋯</button></div>
            <div id="itemsWrap">
              <button class="scr" id="itPrev" type="button" title="${tr('Précédents')}" aria-label="${tr('Précédents')}">‹</button>
              <div id="items"></div>
              <button class="scr" id="itNext" type="button" title="${tr('Suivants')}" aria-label="${tr('Suivants')}">›</button>
            </div>
            <div id="dockBottom">
              <div id="biomes"></div>
              <div id="roadModes"></div>
              <div id="brush"><span>${tr('Taille du pinceau')}</span><input id="rad" type="range" min="1" max="8" step="0.5" value="3"><b id="radv">3</b></div>
            </div>
          </div>
          <div id="dockRight">
          <nav id="viewBtns">
            <button id="bHome" class="round" title="${tr('Revenir au village (V) — une seconde fois : vue d\'ensemble')}" aria-label="${tr('Revenir au village')}">${ic('target', 20, 2)}</button>
            <button id="bFog" class="round" title="${tr('Dissiper le brouillard')}" aria-label="${tr('Dissiper le brouillard')}" hidden>${ic('fog', 20, 2)}</button>
            <button id="bPhoto" class="round" title="${tr('Mode photo (P)')}" aria-label="${tr('Mode photo')}">${ic('eyeOff', 20, 2)}</button>
          </nav>
          </div>
        </div>
      </footer>
      <div id="notifPanel" class="panel" hidden></div>
      <div id="pauseVeil" aria-hidden="true"></div>
      <button id="pauseBar" type="button" aria-live="polite" hidden>${hudPic('sablier', 50)}<b>${tr('Jeu en pause')}</b><small><span class="pbKey">${tr('Espace, ou cliquez ici, pour reprendre')}</span><span class="pbTouch">${tr('Touchez ici pour reprendre')}</span></small></button>
      <div id="cursorHint"></div>
      <div id="cursorDeny" role="alert"><span class="cdX" aria-hidden="true">✕</span><span class="cdT"></span></div>
      <div id="bannerWrap"><div id="banner" class="panel"><h2></h2><p></p></div></div>
      <div id="photoBar" class="panel"><button id="pCap">${ic('camera', 18)} ${tr('Capturer')}</button><button id="pExit">${tr('Quitter')}</button></div>
    `;
    // dans les bandeaux qui défilent de côté (vignettes de la barre de construction, rayons…), la molette les fait défiler
    // horizontalement ; une liste qui défile de haut en bas garde son défilement habituel
    root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b && e.detail > 0) setTimeout(() => b.blur(), 0);
    });
    // (outil Démolir : la bulle suit le bâtiment visé, après que l'outil a regardé sous la souris)
    window.addEventListener('pointermove', (e) => { this.cursorXY = [e.clientX, e.clientY]; this.onMap = (e.target as HTMLElement).tagName === 'CANVAS'; if (this.hintTxt || this.host.tools.tool === 'bulldoze') requestAnimationFrame(() => this.renderCursorHint()); }, { passive: true });
    // la carte d'explication suit la mise en page de la barre du bas (après le reflux)
    window.addEventListener('resize', () => requestAnimationFrame(() => this.placeCards()));
    root.addEventListener('wheel', (e) => {
      if (e.ctrlKey) return;
      for (let el = e.target as HTMLElement | null; el && el !== root; el = el.parentElement) {
        if (el.scrollWidth <= el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) continue;
        const ox = getComputedStyle(el).overflowX;
        if (ox !== 'auto' && ox !== 'scroll') continue;
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (!d) return;
        e.preventDefault();
        el.scrollLeft += e.deltaMode === 1 ? d * 32 : e.deltaMode === 2 ? d * el.clientWidth : d;
        return;
      }
    }, { passive: false });
    // chaque besoin : son picto 3D, le pourcentage comblé et sa jauge (le nom reste en infobulle, et sous la jauge si la place le permet)
    $('#needs').innerHTML = [...NEEDS, SECURITY_NEED].map((n) => `<div class="need" id="n-${n.k}"><b>${hudPic(NEED_PIC[n.k], 26)}</b><em class="pv"></em><div class="bar"><i></i></div><span>${tr(n.label)}</span></div>`).join('');
    // l'écran allégé, dès 1 100 px de large (en dessous, la barre du haut passe sur deux lignes comme avant)
    const mq = matchMedia(ALLEGE), lighten = () => { document.body.classList.toggle('allege', mq.matches); this.fitKey = ''; this.placeDock(); this.placeMenu(); };
    mq.addEventListener('change', () => { lighten(); this.update(); });
    document.body.classList.toggle('allege', mq.matches);
    // les besoins, dans l'écran allégé : seuls ceux qui manquent, ou un mot quand tout va bien ; ce bouton déplie la liste entière
    $('#needsOk').onclick = () => {
      const on = $('#needsBox').classList.toggle('all');
      $('#needsOk').setAttribute('aria-expanded', String(on));
      this.fitKey = ''; this.host.audio.sfxClick(); this.update();
    };
    // fiche des habitants : un clic sur le compteur l'ouvre, un clic ailleurs la ferme
    const census = document.createElement('div');
    census.id = 'census';
    census.className = 'panel';
    census.hidden = true;
    root.appendChild(census);
    $('#pop').onclick = () => { census.hidden ? this.openCensus() : this.closeCensus(); this.host.audio.sfxClick(); };
    // fiche d'un besoin : un clic sur son icône l'ouvre (combien il en faut, d'où il vient, ce qui le comblerait)
    const needInfo = document.createElement('div');
    needInfo.id = 'needInfo';
    needInfo.className = 'panel';
    needInfo.hidden = true;
    root.appendChild(needInfo);
    needInfo.dataset.tip = tr('Cliquez sur l’icône pour garder la fiche ouverte');
    // un clic ouvre la fiche et la garde ; sur une fiche ouverte au survol, il la garde ; sur une fiche gardée, il la ferme
    const toggle = (open: boolean, show: () => void) => {
      if (open && this.peek) this.pin(); else if (open) this.closeNeed(); else { show(); this.pin(); }
      this.host.audio.sfxClick();
    };
    for (const k of [...NEEDS.map((n) => n.k), 'security' as const]) {
      const el = $('#n-' + k);
      el.onclick = () => toggle(this.needOpen === k, () => this.openNeed(k));
      // au survol (à la souris), la fiche s'ouvre d'elle-même et se referme quand on s'en va (Karim, testeur v6, ne les avait pas trouvées)
      el.onpointerenter = (e) => { if (e.pointerType === 'mouse') this.peekAt(() => this.needOpen !== k && this.openNeed(k)); };
      el.onpointerleave = () => this.peekLeave();
    }
    needInfo.onpointerenter = () => clearTimeout(this.peekT);
    needInfo.onpointerleave = () => this.peekLeave();
    // les stocks défilent dans une fenêtre de quelques ressources : les flèches avancent d'une ressource (demande de l'auteur,
    // 17 nov. 2026 : sept stocks côte à côte faisaient déborder le bandeau sur le panneau des âges et sur l'horloge)
    const view = $('#resView'), step = (d: number) => {
      const item = view.querySelector<HTMLElement>('.res');
      view.scrollBy({ left: d * (item ? item.offsetWidth + 2 : 90), behavior: 'smooth' });
      this.host.audio.sfxClick();
    };
    $('#resPrev').onclick = () => step(-1);
    $('#resNext').onclick = () => step(1);
    view.addEventListener('scroll', () => this.syncResNav(), { passive: true });
    addEventListener('resize', () => { this.fitHud(); this.syncResNav(); this.syncNeedNav(); });
    // la page elle-même ne défile jamais : un `scrollIntoView` (vignette de la barre du bas, carte d'expédition) faisait glisser
    // toute l'interface de côté, la carte du village coupée à gauche et les boutons de droite hors de l'écran (auteur, nov. 2026)
    document.addEventListener('scroll', (e) => {
      const t = e.target;
      for (const el of [document.scrollingElement, document.documentElement, document.body, document.getElementById('app'), root]) {
        if (el && (t === document || t === el) && (el.scrollLeft || el.scrollTop)) { el.scrollLeft = 0; el.scrollTop = 0; }
      }
    }, true);
    // la place laissée aux stocks change avec la fenêtre et avec ce qu'il y a à côté (les besoins) : la fenêtre se recale (sur deux
    // lignes ; sur une ligne, c'est `fitHud` qui la taille)
    new ResizeObserver(() => { this.fitResView(); this.syncResNav(); }).observe($('#resPanel'));
    // les besoins aussi, quand la barre du haut tient sur une ligne : deux à la fois au moins (nourriture et eau d'abord)
    const nview = $('#needView'), nstep = (d: number) => {
      const item = nview.querySelector<HTMLElement>('.need');
      nview.scrollBy({ left: d * (item ? item.offsetWidth + 2 : 50), behavior: 'smooth' });
      this.host.audio.sfxClick();
    };
    $('#needPrev').onclick = () => nstep(-1);
    $('#needNext').onclick = () => nstep(1);
    nview.addEventListener('scroll', () => this.syncNeedNav(), { passive: true });
    // l'objectif du moment : un point en choisit un autre ; un clic ailleurs mène au bâtiment, aux expéditions ou au besoin
    $('#goalBox').onclick = (e) => {
      const dot = (e.target as HTMLElement).closest<HTMLElement>('[data-gi]');
      if (dot) { this.goalIdx = +dot.dataset.gi!; this.goalKey = ''; this.renderGoals(); this.host.audio.sfxClick(); return; }
      const g = this.goalShown;
      if (!g || this.goalWin) return;
      this.host.audio.sfxClick();
      if (g.exp) { this.openExpeditions(); return; }
      const k = g.kinds?.find((x) => !this.lockOf(x)) ?? g.kinds?.[0];
      if (k) { this.pick(k); return; }
      if (g.pic === 'content' || g.pic === 'nourriture') this.openNeed(this.host.sim.food.ok ? 'water' : 'food');
    };
    // fiche d'une ressource : un clic sur son stock (d'où elle vient, à quoi elle sert, quoi bâtir pour en avoir plus)
    $('#res').onclick = (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.res[data-r]');
      if (!el) return;
      const r = el.dataset.r as Resource;
      toggle(this.resOpen === r, () => this.openRes(r));
    };
    $('#res').onpointerover = (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.res[data-r]');
      if (el && e.pointerType === 'mouse') this.peekAt(() => this.resOpen !== el.dataset.r && this.openRes(el.dataset.r as Resource));
    };
    $('#res').onpointerleave = () => this.peekLeave();
    needInfo.onclick = (e) => {
      if (this.resOpen === 'gold' && this.tradeClick(e.target as HTMLElement)) return;
      const k = (e.target as HTMLElement).closest<HTMLElement>('[data-kind]')?.dataset.kind as KindId | undefined;
      if (k) { this.closeNeed(); this.pick(k); return; }
      // Sécurité : surligner (ou non) sur la carte les zones couvertes et les habitations sans protection
      if ((e.target as HTMLElement).closest('[data-cover]')) { const cv = this.host.tools.coverage; cv.set(!cv.active); this.renderNeed(); }
    };
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as HTMLElement;
      if (!census.hidden && !census.contains(t) && !t.closest('#pop')) this.closeCensus();
      // (la liste entière des besoins, dépliée dans l'écran allégé, se replie d'un clic ailleurs)
      if ($('#needsBox').classList.contains('all') && !t.closest('#needsBox, #needInfo')) { $('#needsBox').classList.remove('all'); $('#needsOk').setAttribute('aria-expanded', 'false'); this.fitKey = ''; }
      if ((this.needOpen || this.resOpen) && !needInfo.contains(t) && !t.closest('.need, .res') && !(this.host.tools.coverage.active && t.tagName === 'CANVAS')) this.closeNeed();
      // (écran allégé : un clic sur la carte sans outil en main replie les vignettes)
      if (allege() && this.dockOpen && t.tagName === 'CANVAS' && this.host.tools.tool === 'none') { this.dockOpen = false; this.syncFold(); }
      // la liste des conditions d'âge se replie dès qu'on clique ailleurs
      if (!t.closest('#agePanel') && $('#agePanel').classList.contains('open')) { $('#agePanel').classList.remove('open'); this.update(); }
    });

    $('#agePanel').onclick = (e) => {
      // le passage à l'âge suivant, quand tout est prêt
      if ((e.target as HTMLElement).closest('#ageGo')) { this.host.sim.advance(); return; }
      // bac à sable : un âge au choix (le panneau reste ouvert)
      const setAge = (e.target as HTMLElement).closest<HTMLElement>('[data-setage]')?.dataset.setage;
      if (setAge !== undefined) { if (this.host.sim.setAge(+setAge)) this.host.audio.sfxClick(); this.update(); return; }
      // une condition qui demande un bâtiment : on le prend en main (le bon onglet et le bon rayon s'ouvrent)
      const k = (e.target as HTMLElement).closest<HTMLElement>('[data-kind]')?.dataset.kind as KindId | undefined;
      // (les défenses de l'île : la vue y va, l'outil en main)
      if (k) { this.pick(k); if (k === 'watchtower' || k === 'barracks') this.host.goIsle?.(); return; }
      // une condition sans bâtiment : on montre comment l'obtenir
      // une expédition : son identifiant (le titre affiché ne la retrouvait pas en anglais)
      const m = (e.target as HTMLElement).closest<HTMLElement>('[data-m]')?.dataset.m;
      if (m) { this.host.audio.sfxClick(); if (MISSIONS.some((x) => x.id === m)) this.gotoMission(m); else this.openExpeditions(); return; }
      const req = (e.target as HTMLElement).closest<HTMLElement>('[data-req]')?.dataset.req;
      if (req === 'ore') { this.openRes('ore'); return; }
      // les briques : la briqueterie en main, dans le rayon du bas, comme une condition de bâtiment (la fiche des briques
      // en haut, avant : deux conduites différentes pour la même sorte de condition)
      if (req === 'brick') { if (this.host.sim.age >= KINDS.brickworks.minAge) this.pick('brickworks'); else this.openRes('brick'); return; }
      if (req === 'gold') { this.openRes('gold'); return; }
      if (req === 'pop') { this.openNeed('housing'); return; }
      if (req === 'choice') { this.host.audio.sfxClick(); this.host.openCrossroads?.(); return; }
      // le conflit des deux îles à régler : la carte de la diplomatie (paix ou guerre ; l'allié d'abord s'il manque)
      if (req === 'conflict') { this.host.audio.sfxClick(); this.host.openDiploChoice?.(); return; }
      // le chemin de fer : la gare qui manque, ou le tracé d'une ligne depuis une gare
      if (req === 'rail') { const nx = this.host.sim.railNext(); this.host.audio.sfxClick(); if ('kind' in nx) this.pick(nx.kind); else this.host.startRailEdit({ stop: nx.stop }); return; }
      $('#agePanel').classList.toggle('open');
      this.update();
    };
    // la cloche : l'historique des messages ; l'horloge de la file tourne quatre fois par seconde
    $('#bBell').onclick = () => { this.host.audio.sfxClick(); this.toggleNotifPanel(); };
    window.setInterval(() => this.tickNotifs(), 250);
    window.addEventListener('pointerdown', (e) => { if (!$('#notifPanel').hidden && !(e.target as HTMLElement).closest('#notifPanel, #bBell')) this.toggleNotifPanel(false); }, true);
    // le conseil du moment parle d'un bâtiment : un clic le prend en main
    $('#helpBtn').onclick = () => { this.help = !this.help; setHelpOn(this.help); this.host.audio.sfxClick(); this.renderMessage(); };
    $('#msg').onclick = () => { const k = this.host.sim.messageKind; if (k === 'farm' && !this.host.sim.food.ok) { this.host.tools.setTool('field'); this.host.audio.sfxClick(); } else if (this.host.sim.messageExp) { this.openExpeditions(); this.host.audio.sfxClick(); } else if (this.host.sim.messageGold) { this.host.audio.sfxClick(); this.openRes('gold'); } else if (this.host.sim.messageChoice) { this.host.audio.sfxClick(); this.host.openCrossroads?.(); } else if (this.host.sim.messageConflict) { this.host.audio.sfxClick(); this.host.openDiploChoice?.(); } else if (this.host.sim.messageRail !== null) { this.host.audio.sfxClick(); this.host.startRailEdit({ stop: this.host.sim.messageRail }); } else if (k) this.pick(k); else if (this.host.sim.ready) this.host.sim.advance(); };
    $('#bPause').onclick = () => { host.time.paused = !host.time.paused; host.audio.sfxClick(); };
    $('#pauseBar').onclick = () => { host.time.paused = false; host.audio.sfxClick(); this.syncPause(); };
    $('#bFog').onclick = () => { host.dispelFog(); host.audio.sfxClick(); this.info(tr('Le brouillard se lève.')); };
    $('#bSpeed').onclick = () => {
      const seq = [1, 2, 4, 8];
      host.time.speed = seq[(seq.indexOf(host.time.speed) + 1) % seq.length] ?? 1;
      host.applySettings();
    };
    $('#bSettings').onclick = () => this.openSettings();
    $('#bExp').onclick = () => this.openExpeditions();
    // l'écran allégé : Peuples, Enfers et notifications dans un seul menu (demande de l'auteur, 24 nov. 2026 : restent à part les
    // expéditions, le temps et les paramètres) ; avec un seul choix (les notifications, avant l'archipel et le portail), il y
    // mène tout droit
    $('#bMenu').onclick = () => {
      const menu = $('#hudMenu'), items = [...menu.querySelectorAll<HTMLButtonElement>('button')].filter((b) => b.style.display !== 'none');
      if (items.length === 1) { this.hudMenu(false); items[0].click(); return; }
      this.hudMenu(menu.hidden);
      this.host.audio.sfxClick();
    };
    // (un choix pris referme le menu)
    $('#hudMenu').addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('button')) this.hudMenu(false); });
    document.addEventListener('pointerdown', (e) => { if (!$('#hudMenu').hidden && !(e.target as HTMLElement).closest('#hudMenu, #bMenu')) this.hudMenu(false); });
    // l'écran allégé : les équipes en route tiennent dans une pastille, un clic déplie leurs cartes (et les replie)
    $('#expPill').onclick = () => {
      const on = $('#expList').classList.toggle('open');
      $('#expPill').setAttribute('aria-expanded', String(on));
      this.host.audio.sfxClick();
    };
    $('#bPeoples').onclick = () => { this.host.audio.sfxClick(); this.openPeoples(); };
    $('#bHell').onclick = () => { this.host.audio.sfxClick(); this.host.goHell?.(); };
    $('#bPhoto').onclick = () => host.setPhoto(true);
    $('#pExit').onclick = () => host.setPhoto(false);
    $('#pCap').onclick = () => host.capture();
    // au téléphone, la barre du bas se replie sur les modes, les rayons et les vignettes : « ⋯ » montre les outils, la vue et la carte
    $('#bMore').onclick = () => { const on = document.body.classList.toggle('dockMore'); $('#bMore').setAttribute('aria-expanded', String(on)); host.audio.sfxClick(); this.placeCards(); };
    $('#bUndo').onclick = () => host.tools.undo();
    $('#bRedo').onclick = () => host.tools.redo();
    $('#bRot').onclick = () => host.tools.rotate();
    $('#bHome').onclick = () => { host.goHome(); host.audio.sfxClick(); };
    $('#bUp').onclick = () => host.exitUnder();
    $('#biomes').innerHTML = BIOME_CHOICES.map((c) => `<button data-b="${c.b ?? ''}" title="${c.b === null ? tr('Rendre la terre au biome de son climat') : tr('Peindre : {biome}', { biome: tr(c.label).toLowerCase() })}"><i style="background:${c.color}"></i>${tr(c.label)}</button>`).join('');
    $('#biomes').onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-b]');
      if (!b) return;
      this.host.tools.biomeKind = b.dataset.b === '' ? null : Number(b.dataset.b);
      this.host.audio.sfxClick();
      this.refreshTools();
    };
    // l'outil Route : tracer en ligne (en glissant) ou en libre (d'un point A à un point B, en courbe)
    $('#roadModes').innerHTML = `<span>${tr('Tracé')}</span>${ROAD_MODES.map((m) => `<button data-m="${m.id}" title="${tr(m.title)}">${ic(m.icon, 15, 2)}${tr(m.label)}</button>`).join('')}`;
    $('#roadModes').onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-m]');
      if (!b) return;
      this.host.tools.setRoadMode(b.dataset.m as RoadMode);
      this.host.audio.sfxClick();
    };
    // la recherche : chaque lettre tapée filtre les vignettes de tous les rayons ; Échap (ou la croix) efface, Entrée prend le
    // premier résultat qui se pose
    const find = $<HTMLInputElement>('#itSearch'), box = $('#dockSearch');
    find.oninput = () => {
      this.query = find.value;
      box.classList.toggle('on', !!find.value.trim());
      // (le Paysage n'a pas tous les bâtiments : la recherche se fait depuis Bâtir)
      if (this.tab !== 'build') { this.tab = 'build'; this.renderDock(); } else this.renderItems();
    };
    find.onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.clearSearch(); find.blur(); this.renderItems(); }
      else if (e.key === 'Enter') { e.preventDefault(); this.root.querySelector<HTMLButtonElement>('#items button.tile:not(.locked)')?.click(); find.blur(); }
    };
    $('#itClear').onclick = () => { this.clearSearch(); this.renderItems(); find.focus(); };
    // Ctrl+F (ou /) : le champ de recherche du menu, à la place de celle du navigateur
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || this.root.querySelector('.overlay')) return;
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') || (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        if (document.body.classList.contains('photo')) return;
        e.preventDefault();
        if (document.body.classList.contains('dockMin')) this.setDockMin(false);
        find.focus(); find.select();
      }
    });
    // le carrousel des vignettes : les flèches font défiler d'une largeur visible, et se grisent au bout
    const items = $('#items'), slide = (d: number) => { items.scrollBy({ left: d * items.clientWidth * 0.8, behavior: 'smooth' }); this.host.audio.sfxClick(); };
    $('#itPrev').onclick = () => slide(-1);
    $('#itNext').onclick = () => slide(1);
    items.addEventListener('scroll', () => this.refreshArrows(), { passive: true });
    // les clics sur les vignettes ne se perdent plus (retour de l'auteur, 15 nov. 2026 : « parfois, cliquer ne fait rien ») :
    // pendant l'appui, rien ne remplace la vignette (ni la rangée qui suit le village, ni sa vignette 3D qui arrive) ; et un
    // appui au bord, dont le relâchement tombe à côté (le bouton rétrécit sous le doigt), vaut un clic sur la même vignette
    const tileSel = (b: HTMLElement) => (b.dataset.kind ? `button[data-kind="${b.dataset.kind}"]` : `button[data-tool="${b.dataset.tool}"]`);
    items.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-kind], button[data-tool]');
      this.press = b ? { sel: tileSel(b), x: e.clientX, y: e.clientY } : null;
    });
    const release = () => {
      if (!this.press) return;
      // (après le clic, qui suit le relâchement dans la même tâche)
      setTimeout(() => {
        this.press = null;
        if (this.tilesNow() !== this.tilesKey) this.renderItems(true);
        if (this.thumbsLate) { this.thumbsLate = false; this.thumbsReady(); }
      }, 0);
    };
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    items.addEventListener('click', (e) => {
      const p = this.press;
      if (!p || e.detail === 0 || (e.target as HTMLElement).closest('button')) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) return;
      items.querySelector<HTMLButtonElement>(p.sel)?.click();
    });
    window.addEventListener('resize', () => this.refreshArrows());
    // la mini-carte, à droite des boutons de vue
    this.mini = new MiniMap($('#dockRight'), host, () => host.audio.sfxClick());
    // la petite flèche qui replie la barre du bas (état retenu d'une partie à l'autre)
    $('#bFold').onclick = () => { this.setDockMin(!document.body.classList.contains('dockMin')); host.audio.sfxClick(); };
    matchMedia(FOLD_SIDE).addEventListener('change', () => this.placeFold());
    // (l'état retenu ne vaut que hors de l'écran allégé, où les vignettes suivent l'outil en main : `placeDock`)
    this.placeDock();
    this.placeMenu();
    const rad = $<HTMLInputElement>('#rad');
    rad.oninput = () => { host.tools.radius = +rad.value; $('#radv').textContent = rad.value; };

    // une partie neuve s'ouvre sur le rayon de la place du village, la première chose à bâtir (voir markFirst)
    if (!host.world.buildings.size) { this.tab = 'build'; this.cat = KINDS.gather.cat; }
    this.renderDock();
  }

  /**
   * Tant que rien n'est bâti, l'onglet Bâtir, le rayon Vie & culture et la vignette de la place du village luisent doucement :
   * le joueur voit tout de suite par où commencer (les autres bâtiments restent grisés jusque-là)
   */
  private firstArmed = false;
  private plazaLostSaid = false;
  private markFirst() {
    const first = this.host.world.buildings.size === 0;
    // la place du village a été démolie : on la remet en lumière, sans rien verrouiller ni armer (le joueur reste libre)
    // (lue dans les bâtiments du monde, pas dans `sim.counts` : au chargement, ce compte est vide jusqu'au premier recomptage,
    // et le message partait à tort, la place bien là ; Chloé, Margot, v6)
    let lost = false;
    if (!first) { const line = lineOf('gather'); lost = true; for (const b of this.host.world.buildings.values()) if (line.includes(b.kind)) { lost = false; break; } }
    if (lost && !this.plazaLostSaid) { this.plazaLostSaid = true; this.toast(tr('La place du village a disparu : reposez-la (le bouton qui luit) pour retrouver son bien-être et partir en expédition.')); }
    if (!lost) this.plazaLostSaid = false;
    const sel = ['#modes [data-t="build"]', `#subcats [data-c="${KINDS.gather.cat}"]`, '#items [data-kind="gather"]'];
    for (const s of sel) this.root.querySelector(s)?.classList.toggle('first', first || lost);
    // la place du village est déjà en main : le premier clic sur le terrain la pose (une vignette qui luit sans être prise déroute).
    // Pas pendant l'accueil et « Regardez autour de vous » du tutoriel : le glissé demandé posait le feu de camp (testeurs v6)
    if (first && !this.firstArmed && this.host.tools.tool === 'none' && !this.tutorial?.looking) { this.firstArmed = true; this.host.tools.setTool('build', START_KIND); }
    // village vide : les onglets Relief et Nature, les autres rayons et les outils rapides sont grisés (voir startLock)
    const shut = (s: string, on: boolean) => this.root.querySelectorAll<HTMLElement>(s).forEach((b) => { b.classList.toggle('locked', on); b.setAttribute('aria-disabled', String(on)); });
    shut('#modes button:not([data-t="build"])', first);
    shut(`#subcats button[data-c]:not([data-c="${KINDS.gather.cat}"])`, first);
    shut('#quickL button:not([data-tool="none"])', first);
  }

  /** Le message du verrou de départ (null une fois le village commencé) */
  private startWhy() { return isStart(this.host.world) ? startMessage(this.host.sim.nameOf(START_KIND)) : null; }

  // ---------------- Barre du bas (façon Anno 1800) ----------------
  /**
   * Replie (ou rouvre) la barre du bas : les rayons et les vignettes disparaissent, restent les modes, les outils, la vue et la
   * mini-carte. La petite flèche `#bFold` le fait aussi ; le choix est retenu pour ce joueur (`ceionia.basReplie`).
   * Dans l'écran allégé, c'est le vœu du joueur (`dockOpen`) : la barre suit aussi l'outil en main et le tutoriel (`syncFold`),
   * et rien n'est retenu
   */
  setDockMin(on: boolean) {
    this.dockOpen = !on;
    if (allege()) { this.syncFold(); return; }
    this.foldDock(on);
    try { localStorage.setItem(DOCK_MIN_KEY, on ? '1' : '0'); } catch { /* sans stockage */ }
  }

  /** Replie ou rouvre la barre à l'écran, sans rien retenir */
  private foldDock(on: boolean) {
    document.body.classList.toggle('dockMin', on);
    this.placeFold();
    const b = $('#bFold'), t = tr(on ? 'Déplier la barre de construction' : 'Replier la barre de construction');
    b.innerHTML = ic(on ? 'chevUp' : 'chevDown', 16, 2.6);
    b.title = t;
    b.setAttribute('aria-label', t);
    b.setAttribute('aria-expanded', String(!on));
    requestAnimationFrame(() => { this.placeCards(); this.refreshArrows(); });
  }

  /**
   * L'écran allégé : les vignettes de construction restent repliées tant qu'aucun outil n'est en main. Elles s'ouvrent d'un clic
   * sur un mode ou un rayon (`dockOpen`), avec un outil en main, une recherche, pendant le tutoriel (choix de l'auteur, 23 nov.
   * 2026 : dépliées pendant le tutoriel, repliées ensuite) et au passage d'un âge (pour montrer les nouveaux bâtiments). Un outil
   * lâché, un clic sur la carte sans outil, ou un second clic sur le rayon ouvert les replient
   */
  private dockOpen = false;
  private foldTool: ToolId = 'none';
  private syncFold() {
    if (!allege()) return;
    const tl = this.host.tools, held = tl.tool !== 'none';
    if (this.foldTool !== 'none' && !held) this.dockOpen = false;
    this.foldTool = tl.tool;
    const open = held || this.dockOpen || !!this.tutorial?.active || !!this.query.trim() || document.activeElement?.id === 'itSearch';
    if (document.body.classList.contains('dockMin') === open) this.foldDock(!open);
  }

  /**
   * L'écran allégé met les modes et les outils sur la même bande que les rayons (`#dockTop`) ; ailleurs, ils reviennent dans
   * leur panneau de gauche (`#dockSide`). Refait quand on passe d'un écran à l'autre
   */
  private placeDock() {
    const top = $('#dockTop'), side = $('#dockSide'), modes = $('#modes'), ql = $('#quickL'), qr = $('#quickR');
    if (allege()) {
      // Bâtir et Paysage dans leur pastille, au-dessus de la bande (demande de l'auteur, 24 nov. 2026)
      if (modes.parentElement !== $('#dockMain')) { $('#dockMain').prepend(modes); top.insertBefore(ql, $('#bMore')); top.insertBefore(qr, $('#bMore')); }
      this.syncFold();
    } else {
      if (modes.parentElement !== side) side.append(modes, ql, qr);
      let min = false; try { min = localStorage.getItem(DOCK_MIN_KEY) === '1'; } catch { /* sans stockage */ }
      this.foldDock(min);
    }
  }

  /**
   * La languette qui replie la barre : à droite, sur le bord haut de la mini-carte (à gauche, sur les modes, on ne la
   * comprenait pas : retour de joueurs, 22 nov. 2026) ; au téléphone, où la colonne de droite se cache, au milieu de la barre
   */
  /** Ouvre ou ferme le menu des boutons rangés (écran allégé) */
  private hudMenu(open: boolean) {
    $('#hudMenu').hidden = !open;
    $('#bMenu').setAttribute('aria-expanded', String(open));
    $('#bMenu').classList.toggle('on', open);
  }

  /**
   * L'écran allégé range Peuples, Enfers et la cloche dans le menu de `#bMenu` (`#hudMenu`) ; ailleurs, ils reviennent dans la
   * rangée des boutons ronds, devant les paramètres
   */
  private placeMenu() {
    const menu = $('#hudMenu'), ids = ['#bHell', '#bPeoples', '#bBell'].map((q) => $(q));
    if (allege()) { if (ids[0].parentElement !== menu) menu.append(...ids); }
    else { if (ids[0].parentElement === menu) { for (const b of ids) $('#menuBtns').insertBefore(b, $('#bSettings')); } this.hudMenu(false); }
  }

  private placeFold() {
    const b = $('#bFold'), home = matchMedia(FOLD_SIDE).matches ? $('#dockSide') : $('#dockRight');
    if (b.parentElement !== home) home.prepend(b);
  }

  /**
   * En haut, les outils rapides (voir, route, démolir, déplacer), les grands onglets (Relief, Nature, Bâtir) en relief au
   * milieu, l'historique et la vue à droite ; au centre, les vignettes ; en bas, les rayons de construction ou le pinceau
   */
  private renderDock() {
    const modes = $('#modes');
    modes.innerHTML = TABS.map((t) => `<button data-t="${t.id}" class="${t.id === this.tab ? 'active' : ''}" title="${tr(t.label)}${t.id === this.tab ? tr(' — recliquer pour replier ou déplier la barre') : ''}"><b>${hudPic(TAB_PIC[t.id], 26)}</b><span>${tr(t.label)}</span></button>`).join('');
    modes.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => {
      const why = b.dataset.t !== 'build' ? this.startWhy() : null;
      if (why) { this.toast(why); return; }
      // l'onglet déjà ouvert : un clic replie la barre (ou la rouvre), pour laisser la place à la carte
      if (b.dataset.t === this.tab) { this.setDockMin(!document.body.classList.contains('dockMin')); this.host.audio.sfxClick(); return; }
      this.setDockMin(false);
      this.clearSearch();
      this.tab = b.dataset.t!;
      // l'outil courant appartient à un autre onglet : on le lâche, sinon refreshTools ramènerait l'onglet
      if (tabOfTool(this.host.tools.tool, this.tab) !== this.tab) this.host.tools.setTool('none');
      this.renderDock(); this.host.audio.sfxClick();
    }));
    const quick = $('#quickL');
    quick.innerHTML = QUICK.map((id) => { const i = this.toolInfo(id); return `<button data-tool="${id}" title="${i.label}${i.key ? ` (${i.key})` : ''}" aria-label="${i.label}">${ic(i.icon, 17, 2)}</button>`; }).join('');
    this.bindTools(quick);
    this.renderItems();
  }

  /** Les boutons d'outil d'un conteneur : choisir l'outil, sa fiche au survol */
  private bindTools(root: HTMLElement) {
    root.querySelectorAll<HTMLButtonElement>('button[data-tool]').forEach((b) => {
      const id = b.dataset.tool!;
      // (la flèche, l'outil Voir, vide aussi la sélection : la fiche du bâtiment choisi restait ouverte)
      b.onclick = () => { this.host.tools.setTool(id as ToolId); if (id === 'none') this.host.tools.select(null); this.host.audio.sfxClick(); };
      b.onpointerenter = (e) => { if (e.pointerType === 'mouse') { this.hover = { tool: id }; this.renderInfo(); } };
      b.onpointerleave = () => { this.hover = null; this.renderInfo(); };
    });
  }

  /** Prend un bâtiment en main (onglet Bâtir, son rayon), ou dit pourquoi il est encore verrouillé */
  /** Pourquoi ce bâtiment ne se pose pas encore (âge, expédition, tour de garde d'abord) ; null : il se pose */
  lockWhy(k: KindId) { return this.lockOf(k); }
  /** Prend ce bâtiment en main (comme un clic sur sa vignette) */
  pickBuild(k: KindId) { this.pick(k); }

  private pick(k: KindId) {
    const lock = this.lockOf(k);
    if (lock) { this.toast(lock, this.lockGo(k)); return; }
    this.host.tools.setTool('build', k);
    this.host.audio.sfxClick();
  }

  /** Ce que montrent les vignettes du rayon ouvert (nombre de chaque bâtiment, cadenas) : elles se redessinent quand ça change */
  private tilesKey = '';
  /**
   * La vignette sous le doigt ou la souris, entre l'appui et le relâchement : tant qu'on appuie, la rangée ne se redessine pas
   * et les vignettes 3D attendent (`thumbsLate`). Un nœud remplacé pendant l'appui ne reçoit pas de clic : le clic était perdu
   */
  private press: { sel: string; x: number; y: number } | null = null;
  private thumbsLate = false;
  private tilesNow() {
    // une recherche en cours : les vignettes de tous les rayons qui répondent
    if (this.query.trim()) return `q${this.query}|${this.tab}|${+isStart(this.host.world)}|${KIND_ORDER.map((k) => (this.lockOf(k) ? 'L' : this.host.sim.counts[k] ?? 0)).join()}`;
    return this.tab === 'build' ? (this.cat === 'life' ? this.host.diploLine?.()?.text ?? '' : '') + +isStart(this.host.world) + KIND_ORDER.filter((k) => KINDS[k].cat === this.cat).map((k) => (this.lockOf(k) ? 'L' : this.host.sim.counts[k] ?? 0)).join() : this.tab + this.land;
  }

  /** keep : la rangée garde son défilement (les vignettes se mettent à jour sous les yeux du joueur) */
  renderItems(keep = false) {
    this.tilesKey = this.tilesNow();
    const age = this.host.sim.age, build = this.tab === 'build', query = this.query.trim();
    const sub = $('#subcats');
    // (pendant une recherche, aucun rayon n'est ouvert : les résultats viennent de tous)
    sub.innerHTML = build
      ? BUILD_CATS.map((c) => `<button data-c="${c.id}" aria-label="${c.label}" class="${c.id === this.cat && !query ? 'on' : ''}" title="${c.label}${colon()}${BUILD_SUBS[c.id].map((x) => x.label.toLowerCase()).join(', ')} (${tr('Maj+{n}', { n: BUILD_CATS.indexOf(c) + 1 })})"><b>${hudPic(CAT_PIC[c.id], 22)}</b><span class="cl">${c.label}</span></button>`).join('')
      : LAND_SUBS.map((l) => `<button data-l="${l.id}" aria-label="${tr(l.label)}" class="${l.id === this.land ? 'on' : ''}" title="${tr(l.label)}${colon()}${l.groups.map((g) => tr(g.label).toLowerCase()).join(', ')}"><b>${pic(l.pic, 20)}</b><span class="cl">${tr(l.label)}</span></button>`).join('');
    sub.classList.toggle('searching', !!query);
    // un sous-menu du Paysage : l'outil en main d'un autre sous-menu est lâché (sinon refreshTools ramènerait le sien)
    // (écran allégé : un clic du joueur sur le sous-menu ou le rayon déjà ouvert replie les vignettes, un autre les ouvre)
    const unfold = (again: boolean, ev: MouseEvent) => { if (allege() && ev.isTrusted) { this.dockOpen = !(again && !document.body.classList.contains('dockMin')); this.syncFold(); } };
    sub.querySelectorAll<HTMLButtonElement>('button[data-l]').forEach((b) => (b.onclick = (ev) => {
      unfold(b.dataset.l === this.land, ev);
      this.land = b.dataset.l as LandSub;
      this.clearSearch();
      const lt = landOfTool(this.host.tools.tool);
      if (lt && lt !== this.land) this.host.tools.setTool('none');
      this.renderItems(); this.host.audio.sfxClick();
    }));
    sub.querySelectorAll<HTMLButtonElement>('button[data-c]').forEach((b) => (b.onclick = (ev) => {
      const why = b.dataset.c !== KINDS.gather.cat ? this.startWhy() : null;
      if (why) { this.toast(why); return; }
      unfold(b.dataset.c === this.cat && !this.query.trim(), ev);
      this.cat = b.dataset.c as BuildCat;
      this.clearSearch();
      // le bâtiment en main est d'un autre rayon : on le lâche, sinon refreshTools ramènerait son rayon
      const tl = this.host.tools;
      if (tl.tool === 'build' && KINDS[tl.kind].cat !== this.cat) tl.setTool('none');
      this.renderItems(); this.host.audio.sfxClick();
    }));
    let html: string;
    // ce qu'on montre : les bâtiments de l'âge courant et de l'âge suivant (pas ceux des âges lointains), proposés au village
    const shown = (k: KindId) => KINDS[k].minAge <= age + 1 && !(KINDS[k].maxAge !== undefined && age > KINDS[k].maxAge) && offered(this.host.world, k);
    const shut = (k: KindId) => +!!this.lockOf(k);
    {
      const tile = (k: KindId) => {
        const d = KINDS[k], locked = !!this.lockOf(k), a = Math.max(age, d.minAge), n = this.host.sim.counts[k] ?? 0, gv = givesOf(k, a);
        const badge = locked ? `<i class="badge lock">${pic('🔒', 14)}</i>` : n ? `<i class="badge">${n}</i>` : '';
        const tip = `${d.names[a]}${gv.length ? ` : ${gv.join(', ').toLowerCase()}` : ''}`;
        // la vignette 3D du bâtiment (son vrai modèle, à cet âge) ; en attendant qu'elle soit rendue, son icône au trait
        const th = this.host.thumb?.(k, a), img = th ? `<b class="th"><img src="${th}" alt="" draggable="false"></b>` : `<b class="th" data-th="${k}|${a}">${ic(KIND_ICON[k], 28, 1.6)}</b>`;
        // l'âge où il apparaît, en petite pastille : après un passage d'âge, on distingue les bâtiments de chaque époque
        // (retour de joueurs, 22 nov. 2026) ; ceux de l'âge du village ont la leur en avant
        const era = `<i class="ageMk a${d.minAge}${d.minAge === age ? ' now' : ''}" aria-hidden="true">${hudPic(AGE_PIC[d.minAge] ?? AGE_PIC[0], 14)}</i>`;
        return `<button class="tile kind ${locked ? 'locked' : ''} ${d.size === 2 ? 'big' : d.size === 3 ? 'big huge' : d.size >= 4 ? 'big giant' : ''}" data-kind="${k}" title="${tip} · ${AGES[d.minAge].name}" aria-label="${tip}">${img}<span class="lbl">${d.names[a]}</span><small class="gv">${gv[0] ?? ''}</small>${era}${badge}</button>`;
      };
      const toolTile = (id: string, sub: string) => {
        const i = this.toolInfo(id);
        // (le champ a sa vignette peinte, comme les bâtiments ; les autres outils gardent leur icône au trait)
        const face = TOOL_THUMB[id] ? `<b class="th"><img src="${TOOL_THUMB[id]}" alt="" draggable="false"></b>` : `<b>${ic(i.icon, 28, 1.6)}</b>`;
        return `<button class="tile${TOOL_THUMB[id] ? ' thumb' : ''}" data-tool="${id}" title="${i.label}${colon()}${sub}" aria-label="${i.label}${colon()}${sub}">${face}<span class="lbl">${i.label}</span><small class="gv">${sub}</small>${i.key ? `<i class="key">${i.key}</i>` : ''}</button>`;
      };
      // les outils du Paysage, par groupe de lecture (Sculpter, Eau, Sommets ; Végétation, Sol, Décor, Effacer)
      const tool = (id: string) => { const i = this.toolInfo(id); return `<button class="tile" data-tool="${id}" aria-label="${i.label}"><b>${ic(i.icon, 28, 1.6)}</b><span class="lbl">${i.label}</span>${i.key ? `<i class="key">${i.key}</i>` : ''}</button>`; };
      if (query) html = this.searchHtml(query, shown, shut, tile, toolTile, tool);
      else if (build) {
      // ce qu'on peut bâtir d'abord, les bâtiments encore verrouillés ensuite (chacun dans l'ordre du catalogue) ; ceux des âges
      // lointains ne se montrent pas encore : seulement ce qu'apportera l'âge suivant. Les vignettes se rangent par groupe de
      // lecture (Nourriture, Matériaux, Santé…), chacun sous son titre
      const kinds = KIND_ORDER.filter((k) => KINDS[k].cat === this.cat && shown(k));
      html = BUILD_SUBS[this.cat].map((sub) => {
        const tiles = kinds.filter((k) => KIND_SUB[k] === sub.id).sort((p, q) => shut(p) - shut(q)).map(tile);
        // les champs nourrissent (groupe Nourriture), masqués tant que le village est vide : on ne pose d'abord que le feu de camp
        if (this.cat === 'prod' && sub.id === 'nourriture' && !isStart(this.host.world)) tiles.push(toolTile('field', tr('Nourriture')));
        return tiles.length ? `<div class="grp" data-sub="${sub.id}"><div class="gh">${ic(SUB_ICON[sub.id] ?? 'leaf', 13, 2)}<span>${sub.label}</span></div><div class="gt">${tiles.join('')}</div></div>` : '';
      }).join('') || `<span class="mhint">${tr('Rien à bâtir dans ce rayon avant l’âge {age}.', { age: AGES[Math.min(age + 2, AGES.length - 1)].name })}</span>`;
      } else html = LAND_SUBS.find((l) => l.id === this.land)!.groups.map((g) => `<div class="grp"><div class="gh">${ic(g.icon, 13, 2)}<span>${tr(g.label)}</span></div><div class="gt">${g.tools.map(tool).join('')}</div></div>`).join('');
    }
    // (les voies du grand choix, les Enfers et l'archipel, ne s'annoncent pas ici : elles sont dans l'onglet « Grands choix » des
    // expéditions, que le jeu ne montre pas du doigt)
    // le conflit des deux îles (archipel, âge industriel) : une ligne en tête du rayon Vie
    const dip = build && this.cat === 'life' && !query ? this.host.diploLine?.() : null;
    if (dip) html = `<div class="grp pvehead diplohead"><span>${dip.text}</span><button data-diplo="1">${dip.button}</button></div>${html}`;
    const items = $('#items'), left = items.scrollLeft;
    items.innerHTML = html;
    items.scrollLeft = keep ? left : 0;
    items.querySelector<HTMLButtonElement>('[data-diplo]')?.addEventListener('click', () => { this.host.audio.sfxClick(); this.host.openDiploChoice?.(); });
    this.markFirst();
    this.bindTools(items);
    items.querySelectorAll<HTMLButtonElement>('button[data-kind]').forEach((b) => {
      const k = b.dataset.kind as KindId;
      b.onclick = () => {
        const lock = this.lockOf(k);
        if (lock) { this.toast(lock, this.lockGo(k)); return; }
        this.host.tools.setTool('build', k);
        this.host.audio.sfxClick();
      };
      b.onpointerenter = (e) => { if (e.pointerType === 'mouse') { this.hover = { kind: k }; this.renderInfo(); } };
      b.onpointerleave = () => { this.hover = null; this.renderInfo(); };
    });
    this.refreshTools();
    requestAnimationFrame(() => this.refreshArrows());
  }

  /** Ce que le joueur cherche dans le menu (champ de recherche de la barre) ; vide : le rayon ouvert */
  private query = '';
  private clearSearch() {
    this.query = '';
    const f = this.root.querySelector<HTMLInputElement>('#itSearch');
    if (f) f.value = '';
    this.root.querySelector('#dockSearch')?.classList.remove('on');
  }

  /**
   * Les vignettes qui répondent à la recherche, sans accents, en français comme en anglais (voir `search.ts`) : les bâtiments
   * de tous les rayons, rangés sous le nom de leur rayon (le nom à tous les âges compte : « hutte » trouve la maison), puis le
   * champ et les outils du Paysage
   */
  private searchHtml(query: string, shown: (k: KindId) => boolean, shut: (k: KindId) => number, tile: (k: KindId) => string, toolTile: (id: string, sub: string) => string, tool: (id: string) => string) {
    const subOf = (k: KindId) => BUILD_SUBS[KINDS[k].cat].find((x) => x.id === KIND_SUB[k]);
    const hit = (k: KindId) => { const sb = subOf(k), c = BUILD_CATS.find((x) => x.id === KINDS[k].cat)!; return matches(query, [...bothOf(KINDS[k], 'names'), ...(sb ? bothOf(sb, 'label') : []), ...bothOf(c, 'label')]); };
    const groups = BUILD_CATS.map((c) => {
      const tiles = KIND_ORDER.filter((k) => KINDS[k].cat === c.id && shown(k) && hit(k)).sort((p, q) => shut(p) - shut(q)).map(tile);
      // le champ se range avec la nourriture (pas tant que le village est vide)
      if (c.id === 'prod' && !isStart(this.host.world) && matches(query, [...bothLangs(TOOL_INFO.field.label), ...bothLangs('Nourriture')])) tiles.push(toolTile('field', tr('Nourriture')));
      return tiles.length ? `<div class="grp"><div class="gh">${hudPic(CAT_PIC[c.id], 13)}<span>${c.label}</span></div><div class="gt">${tiles.join('')}</div></div>` : '';
    });
    // les outils du Paysage (sculpter, planter, grotte…), seulement une fois le village commencé
    const land = isStart(this.host.world) ? [] : LAND_SUBS.flatMap((l) => l.groups.flatMap((g) => g.tools.filter((id) => matches(query, [...bothLangs(TOOL_INFO[id].label), ...bothLangs(g.label), ...bothLangs(l.label)]))));
    if (land.length) groups.push(`<div class="grp"><div class="gh">${ic('peaks', 13, 2)}<span>${tr('Paysage')}</span></div><div class="gt">${land.map(tool).join('')}</div></div>`);
    return groups.join('') || `<span class="mhint">${tr('Rien ne répond à « {q} ». Essayez un autre nom, en français ou en anglais.', { q: attr(query) })}</span>`;
  }

  /** Les flèches du carrousel : grisées au bout de la rangée, cachées quand tout tient */
  /**
   * Où montrer un bâtiment à poser (bulles du tutoriel) : l'onglet Bâtir, puis son rayon, puis sa vignette ; une vignette
   * cachée hors de la rangée qui défile : la flèche de son côté (`hidden` : la flèche à cliquer, sinon null)
   */
  buildAnchor(k: KindId): { el: Element | null; hidden: 'next' | 'prev' | null } {
    const q = (s: string) => this.root.querySelector(s);
    if (this.tab !== 'build') return { el: q('#modes [data-t="build"]'), hidden: null };
    if (this.cat !== KINDS[k].cat) return { el: q(`#subcats [data-c="${KINDS[k].cat}"]`), hidden: null };
    const tile = q(`#items [data-kind="${k}"]`);
    if (!tile) return { el: null, hidden: null };
    const r = tile.getBoundingClientRect(), box = $('#items').getBoundingClientRect();
    // (à moitié visible au bord : il faut défiler aussi)
    if (r.right > box.right + 2) return { el: q('#itNext'), hidden: 'next' };
    if (r.left < box.left - 2) return { el: q('#itPrev'), hidden: 'prev' };
    return { el: tile, hidden: null };
  }

  private refreshArrows() {
    const it = $('#items'), max = it.scrollWidth - it.clientWidth;
    $('#itemsWrap').classList.toggle('fits', max <= 1);
    ($('#itPrev') as HTMLButtonElement).disabled = it.scrollLeft <= 1;
    ($('#itNext') as HTMLButtonElement).disabled = it.scrollLeft >= max - 1;
  }

  /** Une vignette 3D vient d'être rendue : elle remplace l'icône au trait des vignettes qui l'attendaient */
  thumbsReady() {
    if (this.press) { this.thumbsLate = true; return; }
    this.root.querySelectorAll<HTMLElement>('#items [data-th]').forEach((el) => {
      const [k, a] = el.dataset.th!.split('|'), th = this.host.thumb?.(k as KindId, +a);
      if (!th) return;
      el.innerHTML = `<img src="${th}" alt="" draggable="false">`;
      delete el.dataset.th;
    });
  }

  /** Un bâtiment verrouillé par une expédition : un clic sur son message mène à cette expédition */
  private lockGo(k: KindId) {
    const d = KINDS[k];
    return d.minAge <= this.host.sim.age && d.reqMission && !this.host.world.sandbox ? () => this.gotoMission(d.reqMission!) : undefined;
  }

  /**
   * Ce qui manque à une mission, en boutons : un bâtiment à bâtir (sous son nom de l'âge), une expédition à réussir.
   * `fold` (la carte de la liste) : deux conditions, puis « + n autres » qui déplie le reste ; une mission qui demandait six
   * bâtiments faisait une carte deux fois plus haute que ses voisines (retour de l'auteur, 17 nov. 2026)
   */
  private needsHtml(m: Mission, fold = false) {
    const h = this.host, age = h.sim.age, out: string[] = [];
    for (const id of m.requires?.missions ?? []) {
      if (h.expeditions.state.done.includes(id)) continue;
      const r = MISSIONS.find((x) => x.id === id);
      out.push(`<button class="go" data-goto="${id}">${r?.icon ?? '🧭'} ${tr('Réussir « {title} »', { title: r?.title ?? id })}</button>`);
    }
    for (const k of m.requires?.kinds ?? []) {
      if (h.expeditions.hasFor(k, m.requires!.kinds!)) continue;
      out.push(`<button class="go" data-kind="${k}">${ic('hammer', 14, 2)} ${tr('Bâtir « {name} »', { name: KINDS[k].names[Math.max(age, KINDS[k].minAge)] })}</button>`);
    }
    if (!fold || out.length <= 3) return out.join('');
    return `${out.slice(0, 2).join('')}<button class="go goMore" data-more>${tr('+ {n} autres conditions', { n: out.length - 2 })}</button><span class="goRest" hidden>${out.slice(2).join('')}</span>`;
  }

  /** Sur la carte d'une mission : équipe, durée et risque (de tous ses choix) en pastilles, et ce qu'elle peut rapporter en icônes */
  private missionPills(m: Mission) {
    const cs = m.choices;
    const range = (a: number[], f: (n: number) => string) => { const lo = Math.min(...a), hi = Math.max(...a); return lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`; };
    const risks = cs.map((c) => this.host.expeditions.preview(c).risk);
    const lvl = Math.max(...risks) <= 0.12 ? 'low' : Math.max(...risks) <= 0.22 ? 'mid' : 'high';
    const gains = giftChips(cs.flatMap((c) => this.winOf(c)));
    return `<div class="mpills"><span title="${tr('Habitants dans l’équipe')}">${ic('team', 15, 2)} ${range(cs.map((c) => c.party), String)}</span><span title="${tr('Durée')}">${ic('clock', 15, 2)} ${['courte', 'moyenne', 'longue'].filter((l) => cs.some((c) => workLabel(c.work) === l)).map((l) => tr(l)).join('–')}</span><span class="crisk ${lvl}" title="${tr('Risque d’échec')}">${ic('alert', 14, 2.2)} ${range(risks, (r) => `${Math.round(r * 100)}`)} %</span></div>
      ${gains.length ? `<div class="mgains">${gains.map((c) => `<span class="chip" title="${attr(c.title)}">${pic(c.icon, 26)}</span>`).join('')}</div>` : ''}`;
  }

  /**
   * Les gains d’un choix à montrer : sans les avantages du dénouement une fois le conflit réglé (ils ne serviraient plus)
   */
  private winOf(c: Mission['choices'][number]) { return boonsMatter(this.host.world) ? c.win : c.win.filter((e) => e.t !== 'boon'); }

  /**
   * Ce qu'une expédition des îles apporte au dénouement de l'archipel (demande de l'auteur, 20 nov. 2026 : l'avantage
   * affiché clairement) : « Pour la bataille : +4 troupes alliées · Pour la paix : +10 % de chances ». Le plus fort de ses
   * choix pour chaque avantage. Pour un pourparler de la paix : son risque, et ce que la bonne volonté en a ôté. Rien une fois
   * le conflit réglé, ni pour une mission déjà réussie (refaite, elle ne rapporte plus d'avantage)
   */
  private boonHtml(m: Mission) {
    const w = this.host.world;
    if (!boonsMatter(w)) return '';
    if (m.talks) {
      const r = Math.round(talkRisk(w.diplo) * 100), base = Math.round(TALK_RISK * 100);
      return `<p class="mboon">${ic('alert', 14, 2.2)} ${r === base ? tr('Les pourparlers peuvent échouer ({r} %) : les expéditions sur les îles rendent la paix plus sûre.', { r }) : tr('Risque d’échec : {base} % → {r} %, grâce à vos expéditions sur les îles.', { base, r })}</p>`;
    }
    if (this.host.expeditions.done(m)) return '';
    const best = new Map<string, number>();
    for (const c of m.choices) for (const e of c.win) if (e.t === 'boon') { const v = best.get(e.kind); if (v === undefined || Math.abs(e.n) > Math.abs(v)) best.set(e.kind, e.n); }
    if (!best.size) return '';
    const war = ['allies', 'ours', 'foes'].filter((k) => best.has(k)).map((k) => boonText(k as 'allies', best.get(k)!, true));
    const peace = best.get('peace');
    const parts = [war.length ? `<span>${pic('⚔', 16)} <b>${tr('Pour la bataille :')}</b> ${war.join(' · ')}</span>` : '', peace ? `<span class="${peace < 0 ? 'neg' : ''}">${pic('📜', 16)} <b>${tr('Pour la paix :')}</b> ${boonText('peace', peace, true)}</span>` : ''];
    return `<p class="mboon">${parts.filter(Boolean).join('')}</p>`;
  }

  /**
   * Le panneau « Peuples » (bouton rond `#bPeoples`, voir `docs/diplomatie.md`) : une fiche par peuple de l'archipel, son humeur,
   * son état, et les gestes possibles ; ceux pas encore possibles sont grisés avec la raison. Il ne fait que mener aux gestes
   * qui existent : la carte de l'allié, la carte de la paix ou de la guerre (`openDiploChoice`), une expédition, le comptoir
   */
  openPeoples() {
    this.root.querySelector('.peoplesModal')?.closest<HTMLElement & { close?: () => void }>('.overlay')?.close?.();
    const h = this.host, w = h.world;
    const ways = h.ways?.(), canExplore = ways?.world !== 'none';
    const view = peoplesView(w, { age: h.sim.age, tradeOpen: h.sim.tradeOpen, postReady: allyPostReadyNow(w), canExplore, waysTab: !!ways && waysTabShown(w, ways.hell, ways.world) });
    const { ov, close } = modal(this.root, 'peoplesModal', `${ic('flag', 22)} ${tr('Les peuples de l’archipel')}`, peoplesHtml(view));
    ov.querySelectorAll<HTMLButtonElement>('[data-g]').forEach((b) => (b.onclick = () => {
      const [i, k] = b.dataset.g!.split(':').map(Number), g = view.cards[i]?.gestures[k];
      if (!g?.on) return;
      h.audio.sfxClick();
      close();
      if (g.go === 'ally' || g.go === 'path') h.openDiploChoice?.();
      else if (g.go === 'change') h.openDiploChoice?.(true);
      else if (g.go === 'mission' && g.mission) this.gotoMission(g.mission);
      else if (g.go === 'trade') this.openRes('gold');
      else if (g.go === 'post') { h.goAlly?.(); this.pick('tradepost'); }
      else if (g.go === 'visit') h.goAlly?.();
    }));
  }

  /** Ouvre les expéditions sur une mission : l'onglet des missions, sa carte amenée sous les yeux et mise en avant */
  gotoMission(id: string) {
    if (!this.root.querySelector('.expModal')) this.openExpeditions();
    const ov = this.root.querySelector('.expModal')!.closest('.overlay')!;
    // une recherche en cours pourrait la cacher : on l'efface (le bouton « Toutes » remet le filtre)
    const find = ov.querySelector<HTMLInputElement>('.expFind input');
    if (find) find.value = '';
    ov.querySelector<HTMLButtonElement>('[data-tab="missions"]')?.click();
    const card = ov.querySelector<HTMLElement>(`.mission[data-id="${id}"]`);
    if (!card) return;
    // le filtre en cours pourrait la cacher : retour à « Toutes »
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    card.classList.remove('flash');
    void card.offsetWidth;
    card.classList.add('flash');
  }

  /** Pourquoi ce bâtiment n'est pas encore constructible : un âge à venir, ou une expédition à réussir (null s'il l'est) */
  private lockOf(k: KindId): string | null {
    const d = KINDS[k], h = this.host;
    if (d.minAge > h.sim.age) return tr('Disponible à l’âge : {age}', { age: AGES[d.minAge].name });
    if (d.maxAge !== undefined && h.sim.age > d.maxAge) return tr('On ne le bâtit plus qu’à l’âge : {age} (c’est trop tard)', { age: AGES[d.maxAge].name });
    // un village neuf commence par sa place : le reste se bâtit autour
    if (k !== START_KIND && isStart(h.world)) return startMessage(h.sim.nameOf(START_KIND));
    const guide = this.tutorial?.lock(k);
    if (guide) return guide;
    // au bac à sable, tout ce qui est de l'âge s'ouvre : ni expédition ni bâtiment préalable
    if (h.world.sandbox) return null;
    if (d.reqMission && !h.expeditions.state.done.includes(d.reqMission)) {
      const m = MISSIONS.find((x) => x.id === d.reqMission);
      return tr('Débloqué par l’expédition « {title} »', { title: tr(m?.title ?? d.reqMission) });
    }
    // (les zones des îles : la tête de pont prise, le port pris pour le fort, le fort pour la ville de garnison)
    const zl = zoneLock(h.world, k);
    if (zl) return zl;
    if (d.reqKind && !h.sim.built(d.reqKind)) return tr('Il faut d’abord « {name} » au village', { name: h.sim.nameOf(d.reqKind) });
    if (k === 'tradepost' && !h.world.diplo.ally) return tr('Choisissez d’abord votre allié : le comptoir se bâtit chez lui');
    return null;
  }

  /** La vignette 3D d'un bâtiment pour la carte d'explication (son picto tant qu'elle n'est pas rendue) */
  private cardThumb(k: KindId, a: number) {
    const th = this.host.thumb?.(k, a);
    return `<b class="xth">${th ? `<img src="${th}" alt="" draggable="false">` : ic(KIND_ICON[k], 34, 1.6)}</b>`;
  }

  /** Place les cartes d'explication à droite du menu du bas (au village, et sur la barre de bataille) */
  placeCards() {
    const top = parseFloat(this.root.style.getPropertyValue('--hudB')) || 82;
    if (document.body.classList.contains('commanding')) {
      // (la bande d'aide au-dessus des modes, où qu'ils soient dans la barre)
      const foot = document.querySelector<HTMLElement>('#troopBar .tfoot'), tool = document.querySelector('#troopBar .ttool');
      const bar = document.getElementById('troopBar');
      if (foot && tool && bar) { const l = `${Math.round(tool.getBoundingClientRect().left - foot.getBoundingClientRect().left)}px`; if (bar.style.getPropertyValue('--tbL') !== l) bar.style.setProperty('--tbL', l); }
      const t = document.getElementById('tinfo');
      if (t) placeCard(t, document.querySelector('#troopBar .tmenu'), document.querySelector('#troopBar .tcorner'), top);
      return;
    }
    // (au téléphone, la barre ne forme plus qu'un panneau, `#dockRow` : le menu et le coin se mesurent sur lui)
    const row = $('#dockRow'), menu = $('#dockMain').getBoundingClientRect().width ? $('#dockMain') : row;
    const corner = $('#dockRight').getBoundingClientRect().width ? $('#dockRight') : row;
    placeCard($('#info'), menu, corner, top);
    placeCard($('#selCard'), menu, corner, top);
  }

  /** la raison du refus montrée par la fiche (elle se redessine quand le curseur passe sur un endroit refusé pour une autre raison) */
  private infoWhy: string | null = null;
  private infoStage = 0;
  private infoHave = '';
  /** ce que montre la ligne du coût de la fiche : le prix payable ou non, et ce qu'on a quand il manque quelque chose */
  private haveNow() {
    const tl = this.host.tools, k = this.hover ? this.hover.kind ?? null : tl.tool === 'build' || (tl.tool === 'move' && tl.holding()) ? tl.kind : null;
    if (!k) return '';
    const w = this.host.world, c = priceIn(w, k, this.host.sim.age);
    return c && !canPay(w, c) ? haveLabel(w, c) : '';
  }

  /** Fiche de l'outil ou du bâtiment survolé, sinon du bâtiment qu'on s'apprête à poser */
  private renderInfo() {
    const tl = this.host.tools, box = $('#info');
    this.infoWhy = tl.placeWhy;
    this.infoStage = tl.placeStage;
    this.infoHave = this.haveNow();
    const held = tl.tool === 'build' || (tl.tool === 'move' && tl.holding()) ? tl.kind : null;
    const k = this.hover ? this.hover.kind ?? null : held, tool = this.hover?.tool;
    box.classList.toggle('show', !!(k || tool));
    // une seule carte à la fois : la fiche du bâtiment choisi s'efface tant qu'on survole ou qu'on tient un bâtiment
    $('#selCard').classList.toggle('hid', !!(k || tool));
    this.placeCards();
    // le bâtiment en main (pas survolé) : une fiche réduite, dans le coin, qui laisse voir et viser le milieu de l'écran
    const brief = !this.hover;
    box.classList.toggle('held', brief);
    if (tool) {
      const i = this.toolInfo(tool);
      box.innerHTML = `<div class="ihead"><b>${ic(i.icon, 28, 1.6)}</b><div class="grow"><h4>${i.label}</h4>${i.key ? `<small>${tr('Raccourci : {key}', { key: i.key })}</small>` : ''}</div></div><p>${i.desc}</p>`;
      return;
    }
    if (!k) return;
    const d: KindDef = KINDS[k], age = this.host.sim.age, lock = this.lockOf(k), a = Math.max(age, d.minAge);
    const n = this.host.sim.counts[k] ?? 0;
    // ce qu'il produirait ou consommerait par jour à cet âge (sans gare de marchandises), puis ce qu'il apporte au village
    const effs = flowChips(flowOf(k, a, 1, this.host.world.unlimited)) + GIVES.map((g) => (d[g.k]?.[a] ? `<span class="eff give n-${g.k}">${ic(g.icon, 14, 2)} ${give(g, d[g.k]![a])}</span>` : '')).join('');
    // les grands bâtiments se paient en bois et en pierre, tous en Normal (sauf en ressources illimitées) ; le premier bûcheron est offert
    const w = this.host.world, cost = priceIn(w, k, age), rich = canPay(w, cost), gift = !cost && !w.unlimited && !!rulesOf(w.difficulty).price && PRODUCERS.includes(k);
    // (les défenses se comptent au village et sur l'île du portail)
    const isle = k === 'watchtower' || k === 'barracks' ? [...w.buildings.values()].filter((b) => b.kind === k && w.onPortalIsland(b.x, b.z)).length : 0;
    const count = !n ? tr('pas encore construit') : isle === n ? tr('{n} sur l’île du portail', { n }) : isle ? tr('{n} dans le village, {m} sur l’île du portail', { n: n - isle, m: isle }) : tr('{n} dans le village', { n });
    // la carte d'explication (à droite du menu) : la vignette 3D, le nom, « 2 × 2 · Médiéval », à quoi il sert ; le détail
    // (effets, conseil) quand on le survole dans la barre, pas quand on l'a en main
    box.innerHTML = `<div class="ihead">${this.cardThumb(k, a)}<div class="grow"><h4>${d.names[a]}</h4><small class="xsub">${d.size} × ${d.size} · ${AGES[a].name}</small><small class="xcount">${count}</small></div></div>
      <p class="xdesc">${d.desc}</p>${brief ? '' : `${effs ? `<div class="effs">${effs}</div>` : ''}${this.needUse(k, a)}${d.perk ? `<p class="perk">✦ ${d.perk}</p>` : ''}${railTip(k)}`}
      ${tl.tracingWall && tl.wallCost ? `<p class="cost">${ic('hammer', 14, 2)} ${tl.wallCost}</p>` : cost ? `<p class="cost ${rich ? '' : 'short'}">${ic('hammer', 14, 2)} ${rich ? tr(k === 'wall' ? 'Coût par pan : {cost}' : 'Coût : {cost}', { cost: costLabel(cost) }) : shortLabel(w, cost)}</p>` : gift ? `<p class="cost">${ic('hammer', 14, 2)} ${DIFF_TEXT.firstFree}</p>` : ''}
      ${lock ? `<p class="lock">${pic('🔒', 16)} ${lock}</p>` : brief && tl.placeWhy && !(cost && !rich && tl.placeWhy === shortLabel(w, cost)) ? `<p class="lock">✗ ${tl.placeWhy}</p>` : tl.tool === 'build' && brief ? `<p class="keys">${k === 'wall' ? tr(tl.freeStage === 2 ? 'Cliquez le point B : le mur se pose d’un trait (il saute les routes)' : 'Cliquez le point A, puis le point B : le mur se pose d’un trait') : tl.tracingWall ? tr(tl.freeStage === 2 ? 'Cliquez le point B : la ligne se pose d’un trait, en angles droits' : 'Cliquez le point A, puis le point B : la ligne se pose d’un trait') : `${tr(tl.placeStage === 2 ? 'Cliquez du côté de l’entrée (sur le bâtiment : vers la route)' : tl.placeStage === 1 ? 'Un clic : l’endroit, un second : le côté de l’entrée (en or)' : hasDoor(k) ? 'L’entrée est marquée en or' : 'Sans entrée : on y vient de tous côtés')} · ${tr('R : tourner')}`} · ${tr('Échap ou clic droit : lâcher')}</p>` : ''}`;
  }

  /**
   * Un équipement (eau, santé, nourriture…) survolé : ce que le village en consomme, ce qu'il en a, et ce qu'il aurait avec
   * celui-ci, sur une jauge à la couleur du besoin. La carte ne disait que « +18 eau » (retour de joueur, 22 nov. 2026)
   */
  private needUse(k: KindId, a: number) {
    const d = KINDS[k], sim = this.host.sim;
    return GIVES.filter((g) => d[g.k]?.[a]).map((g) => {
      const need = sim[g.k], add = d[g.k]![a], housing = g.k === 'housing';
      const use = housing ? Math.floor(sim.pop) : need.demand, cap = need.cap, top = Math.max(use, cap + add, 1);
      const pct = (v: number) => `${Math.round(Math.min(1, v / top) * 1000) / 10}%`;
      const head = tr(NEED_USE[g.k], { n: num(use) });
      const state = !use ? tr('Personne n’en demande encore') : cap >= use ? tr('Comblé : {cap} pour {use}', { cap: num(cap), use: num(use) }) : tr('Il en manque {n}', { n: num(use - cap) });
      return `<div class="xneed n-${g.k}${cap < use ? ' short' : ''}"><div class="xnh">${ic(g.icon, 15, 2.2)}<b>${head}</b></div>
        <div class="xbar"><i style="width:${pct(cap)}"></i><i class="add" style="left:${pct(cap)};width:${pct(add)}"></i><u style="left:${pct(use)}"></u></div>
        <small>${state} · ${tr('avec celui-ci : {n}', { n: num(cap + add) })}</small></div>`;
    }).join('');
  }

  /**
   * Fiche du bâtiment choisi d'un clic : ce qu'il est et ce qu'il apporte, ses habitants ou ses bêtes ;
   * le déplacer, le tourner (R), le démolir
   */
  private renderSelection() {
    const h = this.host, tl = h.tools, box = $('#selCard');
    const b = tl.selected !== null ? h.world.buildings.get(tl.selected) : undefined;
    if (!b && tl.citizen !== null) { this.renderCitizen(box, tl.citizen); return; }
    if (!b) { if (this.selKey) { this.selKey = ''; box.classList.remove('show'); } return; }
    const d = KINDS[b.kind], a = Math.max(b.age, d.minAge), stats: string[] = [];
    if (b.kind === 'house' || b.kind === 'manor') {
      // ceux qu'on voit de la maisonnée, par leur nom (un clic ouvre leur fiche)
      const folk = h.agents.agents.filter((x) => x.home === b.id), n = folk.length;
      const names = folk.slice(0, 6).map((x) => `<button class="who" data-act="cit:${x.id}">${firstName(x.id, h.sim.age, folkTraits(x.id, x.child).woman)}</button>`).join(' ');
      stats.push(`${ic('house', 14, 2)} ${n ? tr('Famille {family} : {names}', { family: familyName(b.id, h.sim.age), names }) : nplural(n, 'habitant', 'habitants')}`);
    }
    if (b.kind === 'pen' || b.kind === 'stable') {
      const herds = penHerds(h.world), list = (b.kind === 'pen' ? herds.pens : herds.stables).get(b.id) ?? [];
      const names: Record<string, [string, string]> = { sheep: ['mouton', 'moutons'], cow: ['vache', 'vaches'], pig: ['cochon', 'cochons'], horse: ['cheval', 'chevaux'] }, count = new Map<string, number>();
      for (const k of list) count.set(k, (count.get(k) ?? 0) + 1);
      stats.push(list.length ? `${ic('pen', 14, 2)} ${[...count].map(([k, n]) => nplural(n, names[k][0], names[k][1])).join(', ')}` : `${ic('pen', 14, 2)} ${tr('aucune bête pour l’instant')}`);
    }
    // une défense de l'île du portail : la contamination de l'île, que son halo doré repousse
    if ((b.kind === 'watchtower' || b.kind === 'barracks') && h.world.onPortalIsland(b.x, b.z)) { const bl = isleBlight(h.world); if (bl) stats.push(b.kind === 'watchtower' ? tr('🔥 Contamination de l’île : {n} % · son halo doré la repousse alentour (on s’y soigne plus vite)', { n: Math.round(bl.level * 100) }) : tr('🔥 Contamination de l’île : {n} % · la caserne la fait reculer, sans halo autour d’elle', { n: Math.round(bl.level * 100) })); }
    if (b.kind === 'refinery') stats.push(`${ic('fuel', 14, 2)} ${tr('Raffine jusqu’à {n} barils de brut par jour ({fuel} de carburant) · {crude} brut et {stock} carburant au village', { n: REFINE_CRUDE * railBoost(h.world, b), fuel: REFINE_CRUDE * FUEL_PER_CRUDE * railBoost(h.world, b), crude: Math.floor(h.world.crude), stock: Math.floor(h.world.fuel) })}`);
    if (b.kind === 'carworks' && !h.world.unlimited) stats.push(h.expeditions.cars() ? `${ic('fuel', 14, 2)} ${tr('Les voitures brûlent {n} carburant par jour · {stock} au village', { n: CAR_FUEL, stock: Math.floor(h.world.fuel) })}` : `${ic('fuel', 14, 2)} ${tr('Plus de carburant : les voitures restent au garage. La raffinerie en tire du pétrole brut des puits.')}`);
    // ce que le rail lui apporte (ou lui apporterait), et pour une gare, les bâtiments qu'elle sert
    // (en pastille courte : l'explication entière passe en info-bulle)
    const railLine = railStat(h, b);
    const railChip = railLine ? `<span class="eff rail" title="${attr(railLine[1])}">${railLine[0]}</span>` : '';
    // gare : les lignes qui s'y arrêtent, une ligne compacte chacune (noms courts, le reste en info-bulle) ;
    // au-delà de trois, la liste défile ; en tracer une nouvelle d'ici
    const r = h.railway, stop = isStation(b) ? r.stopOf(b) : null, lines = stop ? r.linesAt(b) : [];
    const rails = stop ? `<div class="rails"><div class="rhead"><b>${ic('train', 14, 2)} ${tr('Chemin de fer')}${lines.length ? ` <small>· ${nplural(lines.length, 'ligne', 'lignes')}</small>` : ''}</b>
      <button data-act="newline" class="newline" title="${tr('Tracer une nouvelle ligne depuis cette gare')}">${ic('train', 14, 2)} ${tr('Nouvelle ligne')}</button></div>
      ${lines.length ? `<div class="rlist${lines.length > 3 ? ' many' : ''}">${lines.map((l) => {
      const train = r.trains.get(l.id), stops = l.stops.map((id) => h.world.buildings.get(id));
      const short = stops.map((s) => (!s ? '?' : s.id === b.id ? `<b>${tr('ici')}</b>` : shortStop(r.stopName(s)))).join(' → ');
      const tip = `${r.lineLabel(l)}\n${tr(l.freight ? 'Marchandises' : 'Voyageurs')}${train ? tr(' · train {where}', { where: trainWhere(r, train) }) : tr(' · pas de train')}`;
      return `<div class="rline" title="${attr(tip)}">${dot(l.color)}<span class="grow">${short}</span>
        <button data-act="cargo:${l.id}" class="ltype" title="${l.freight ? tr('Train de marchandises : les ateliers et carrières à côté de ses gares produisent {n} % de plus. Cliquer pour en faire un train de voyageurs', { n: Math.round(freightBonus(h.world) * 100) }) : tr('Train de voyageurs : il emmène les habitants de gare en gare et les équipes au cosmodrome. Cliquer pour en faire un train de marchandises')}" aria-label="${tr(l.freight ? 'Train de marchandises' : 'Train de voyageurs')}">${l.freight ? '📦' : '🧳'}</button>
        <button data-act="follow:${l.id}" title="${tr('Suivre le train')}" aria-label="${tr('Suivre le train')}">${ic('eye', 14, 2)}</button><button data-act="edit:${l.id}" title="${tr('Modifier la ligne : ses arrêts et le tracé de sa voie')}" aria-label="${tr('Modifier la ligne')}">${ic('road', 14, 2)}</button><button data-act="drop:${l.id}" title="${tr('Fermer la ligne')}" aria-label="${tr('Fermer la ligne')}">${ic('close', 14, 2)}</button></div>`;
    }).join('')}</div>` : ''}</div>`
      : '';
    // le geste du bâtiment (lancer un match…), comme « Nouvelle ligne » à la gare : un bouton, ou ce qui l'empêche
    const st = h.shows.status(b);
    const show = st ? `<div class="acts showAct"><button data-act="show" class="${st.why ? '' : 'primary'}"${st.why ? ' disabled' : ''} title="${attr(st.def.tip)}">${pic(st.def.icon, 16)} ${st.here ? tr('Voir le spectacle') : st.def.act}</button></div>${st.here ? `<p class="stat showOn">${pic(st.def.icon, 14)} ${st.def.running}</p>` : st.why ? `<p class="stat showWhy">${st.why}</p>` : ''}` : '';
    // le chantier naval : notre flotte de guerre (chantier B), armer un navire
    const fleet = b.kind === 'shipyard' && h.sim.age >= 2 && h.armShip ? this.fleetBlock() : '';
    // améliorations : ce qu'il peut devenir à cet âge, et leur prix (ou ce qui manque pour les débloquer)
    const ups = UPGRADES.filter((u) => u.from === b.kind && h.sim.age >= KINDS[u.to].minAge).map((u) => {
      const to = KINDS[u.to], name = to.names[Math.max(b.age, to.minAge)], c = priceIn(h.world, u.to, h.sim.age);
      const locked = to.reqMission && !h.world.missionDone(to.reqMission) ? MISSIONS.find((m) => m.id === to.reqMission)?.title ?? to.reqMission : null;
      const first = !locked && !h.world.sandbox && to.reqKind && !h.sim.built(to.reqKind) ? h.sim.nameOf(to.reqKind) : null;
      if (first) return `<button disabled title="${attr(tr('Il faut d’abord « {name} » au village', { name: first }))}">${ic('upgrade', 16, 2)} ${name} <small>${pic('🔒', 12)} ${tr('{name} d’abord', { name: first })}</small></button>`;
      // (pas la place de grandir autour : le bouton le dit, et la flèche au-dessus du bâtiment ne se montre pas)
      if (!locked && !h.world.upgradeRoom(b.id, u.to)) return `<button disabled title="${attr(tr('Il faut {n} × {n} cases libres autour du bâtiment pour l’améliorer', { n: to.size }))}">${ic('upgrade', 16, 2)} ${name} <small>${pic('🔒', 12)} ${tr('pas la place autour')}</small></button>`;
      return locked ? `<button disabled title="${attr(tr('Débloqué par l’expédition « {title} »', { title: tr(locked) }))}">${ic('upgrade', 16, 2)} ${name} <small>${pic('🔒', 12)} ${tr(locked)}</small></button>`
        : `<button data-act="up:${u.to}" class="primary">${ic('upgrade', 16, 2)} ${tr('Améliorer : {name}', { name })}${to.size > sizeOf(b) ? ` <small>${to.size} × ${to.size}</small>` : ''}${c ? ` <small>${canPay(h.world, c) ? costLabel(c) : shortLabel(h.world, c)}</small>` : ''}</button>`;
    }).join('');
    // la case à cocher des flèches d'amélioration : elle vaut pour tous les bâtiments (même réglage que Paramètres › Partie)
    const upChk = `<label class="upchk" title="${attr(tr('Montre ou cache la flèche au-dessus de chaque bâtiment qui peut être amélioré, pour tous les bâtiments.'))}"><input type="checkbox" data-act="badges" ${h.hideUpBadges ? '' : 'checked'}> ${tr('Afficher les flèches d’amélioration')}</label>`;
    // un pan de rempart : passer de tour à simple pan, ou l'inverse (la tour vient seule aux bouts et aux angles)
    const towered = b.kind === 'wall' && rampartTower(h.world, b);
    const node = b.kind === 'wall' ? `<div class="acts ups"><button data-act="tower" class="primary" title="${attr(tr('Une tour vient seule aux bouts et aux angles du mur. Ici, on choisit pour ce pan.'))}">${ic('upgrade', 16, 2)} ${tr(towered ? 'Changer en simple pan' : 'Changer en tour')}</button></div>` : '';
    const upgrades = (ups ? `<div class="acts ups">${ups}</div>${upChk}` : '') + node;
    // ce qu'il produit ou consomme par jour, gare de marchandises comprise
    const flow = flowChips(flowOfBuilding(h.world, b));
    // (« Commander la garnison » n'a de sens que le portail ouvert : avant, le bouton ne menait à rien, testeur v6)
    const key = `${b.id}|${b.rot}|${b.age}|${b.auto}|${stats.join()}|${flow}|${railChip}|${rails}|${show}|${fleet}|${upgrades}|${h.world.portalOpen}`;
    if (key === this.selKey) return;
    const same = box.dataset.id === String(b.id) && box.classList.contains('show');
    this.selKey = key;
    box.dataset.id = String(b.id);
    box.classList.remove('citizen');
    // d'un rendu à l'autre du même bâtiment (les trains roulent), on garde ce qui est déplié et où l'on a défilé
    const opened = same ? [...box.querySelectorAll<HTMLDetailsElement>('details[open]')].map((x) => x.dataset.k) : [];
    const scroll = same ? box.scrollTop : 0, listScroll = same ? box.querySelector('.rlist')?.scrollTop ?? 0 : 0;
    const effs = flow + GIVES.map((g) => (d[g.k]?.[a] ? `<span class="eff">${ic(g.icon, 14, 2)} ${give(g, d[g.k]![a])}</span>` : '')).join('');
    // le conseil : replié, son début sur une ligne ; déplié, tout le texte
    const [perkHead, perkRest] = d.perk ? brief(d.perk, 90) : ['', ''];
    const perk = d.perk ? `<details class="perk" data-k="perk"><summary>✦ <span>${perkHead}</span></summary>${perkRest}</details>` : '';
    const size = sizeOf(b) > 1 ? `${sizeOf(b)} × ${sizeOf(b)}` : '', facing = tr(b.auto ? 'façade tournée vers la route' : 'orientée à la main');
    box.innerHTML = `<div class="ihead">${this.cardThumb(b.kind, a)}<div class="grow"><h4>${d.names[a]}</h4><small class="xsub" title="${attr(`${AGES[b.age].name}${size ? tr(' · {size} cases', { size }) : ''} · ${facing}`)}">${sizeOf(b)} × ${sizeOf(b)} · ${AGES[b.age].name}</small></div><button class="xfold" data-act="fold" title="${tr('Replier ou déplier')}" aria-label="${tr('Replier ou déplier')}">▾</button><button class="x" data-act="close" title="${tr('Fermer (Échap)')}" aria-label="${tr('Fermer')}">${ic('close', 16, 2)}</button></div>
      ${folded(d.desc, 'desc')}${effs || railChip ? `<div class="effs">${effs}${railChip}</div>` : ''}${stats.map((s) => `<p class="stat">${s}</p>`).join('')}${perk}${rails}${show}${fleet}${upgrades}
      ${(b.kind === 'watchtower' || b.kind === 'barracks') && h.commandIsle && h.world.portalOpen && h.isleGarrison?.() ? `<div class="acts"><button data-act="command" class="primary" title="${tr('Choisir les troupes, leur donner des ordres, recruter à la caserne')}">⚔️ ${tr('Commander la garnison')}</button></div>` : ''}
      <div class="acts xacts"><button data-act="move">${hudPic('deplacer', 18)} ${tr('Déplacer')}</button><button data-act="rot">${ic('rotate', 16, 2)} ${tr('Tourner')} <kbd>R</kbd></button><button data-act="del" class="danger xdel" title="${tr('Démolir')}" aria-label="${tr('Démolir')}">${ic('demolish', 17, 2)}</button></div>`;
    box.querySelectorAll<HTMLDetailsElement>('details[data-k]').forEach((x) => { if (opened.includes(x.dataset.k)) x.open = true; });
    box.scrollTop = scroll;
    const rl = box.querySelector('.rlist');
    if (rl) rl.scrollTop = listScroll;
    box.classList.add('show');
    // au téléphone, la carte se replie sur son en-tête et ses actions (un clic sur le chevron la déplie)
    box.classList.toggle('fold', this.selFold);
    this.placeCards();
    box.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((el) => (el.onclick = async () => {
      const act = el.dataset.act;
      if (act === 'fold') { this.selFold = !this.selFold; box.classList.toggle('fold', this.selFold); this.placeCards(); return; }
      if (act === 'close') tl.select(null);
      else if (act === 'move') { tl.moveSelected(); h.audio.sfxClick(); }
      else if (act === 'rot') tl.rotateSelected();
      else if (act === 'del') tl.demolishSelected();
      else if (act === 'command') { h.audio.sfxClick(); tl.select(null); h.commandIsle?.(); }
      else if (act === 'newline') { h.audio.sfxClick(); h.startRailEdit({ stop: b.id }); }
      else if (act === 'arm') { const why = h.armShip?.() ?? null; if (why !== null) { h.audio.sfxDeny(); if (why) this.toast(why); } this.selKey = ''; }
      else if (act === 'show') { if (h.shows.run?.b.id === b.id) h.shows.goSee(); else { const why = h.shows.launch(b); if (why) { h.audio.sfxDeny(); this.toast(why); } } this.selKey = ''; }
      else if (act === 'badges') { h.setHideUpBadges(!h.hideUpBadges); h.audio.sfxClick(); this.selKey = ''; }
      else if (act === 'tower') tl.toggleSelectedTower();
      else if (act?.startsWith('up:')) tl.upgradeSelected(act.slice(3) as KindId);
      else if (act?.startsWith('follow:')) h.followTrain(+act.slice(7));
      else if (act?.startsWith('cit:')) { tl.selectCitizen(+act.slice(4)); return; }
      else if (act?.startsWith('cargo:')) { const l = h.world.lines.find((x) => x.id === +act.slice(6)); if (l) { h.audio.sfxClick(); h.railway.setFreight(l.id, !l.freight); this.selKey = ''; this.renderSelection(); } }
      else if (act?.startsWith('edit:')) { h.audio.sfxClick(); h.startRailEdit({ line: +act.slice(5) }); }
      else if (act?.startsWith('drop:')) {
        const l = h.world.lines.find((x) => x.id === +act.slice(5));
        if (l && await confirmBox(this.root, tr('Fermer la ligne {line} ? Ses voies seront retirées.', { line: r.lineLabel(l) }), tr('Fermer la ligne'))) h.railway.removeLine(l.id);
      }
      this.renderSelection();
    }));
  }

  /**
   * La flotte de guerre sur la fiche du chantier naval (chantier B) : nos navires et leur coque (en réparation au chantier),
   * ceux en chantier et le temps qui leur reste, et le bouton « Armer un navire de guerre » avec son prix (ou ce qui l'empêche)
   */
  private fleetBlock() {
    const h = this.host, w = h.world, f = w.fleet, age = h.sim.age, yards = h.sim.counts.shipyard ?? 0, cap = fleetCap(yards);
    const why = armWhy(w, age, yards), name = h.shipName?.(age) ?? '';
    const hours = (secs: number) => Math.max(1, Math.ceil((secs / h.time.dayLen) * 24));
    const ships = f.hulls.map((x) => `<span class="eff${x < 1 ? ' fix' : ''}" title="${attr(x < 1 ? tr('En réparation au chantier naval') : tr('Prêt à prendre la mer'))}">${pic('⛵', 14)} ${x < 1 ? tr('{n} % · en réparation', { n: Math.round(x * 100) }) : tr('prêt')}</span>`).join('')
      + f.arming.map((t) => `<span class="eff" title="${attr(tr('En chantier'))}">⚒️ ${tr('en chantier · {n} h', { n: hours(t - w.exp.clock) })}</span>`).join('');
    return `<p class="stat">${pic('⛵', 14)} ${tr('Notre flotte : {n} navires de guerre sur {m} (deux par chantier naval, six au plus)', { n: f.hulls.length + f.arming.length, m: cap })}</p>${ships ? `<div class="effs">${ships}</div>` : ''}
      <div class="acts showAct"><button data-act="arm" class="${why ? '' : 'primary'}"${why ? ' disabled' : ''} title="${attr(tr('Un navire de guerre ({name}) : il sert à la bataille navale et à l’escorte des convois. Prêt en une demi-journée.', { name }))}">${pic('⛵', 16)} ${tr('Armer un navire ({name})', { name })} <small>${costText(shipCost(age))}</small></button></div>${why ? `<p class="stat showWhy">${why}</p>` : ''}`;
  }

  /**
   * Sa maison, son lieu de travail (un clic dans la fiche d'un habitant) : la vue y va et le cadre, la caméra cesse de suivre
   * l'habitant, et le bâtiment est choisi (sa fiche s'ouvre), comme d'un clic sur la carte
   */
  private goBuilding(id: number) {
    const h = this.host, b = h.world.buildings.get(id);
    if (!b) return;
    h.audio.sfxClick();
    h.followCitizen(null);
    const s = sizeOf(b);
    h.cam.goTo(b.x + s / 2, b.z + s / 2, Math.min(Math.max(h.cam.dist, 6 + s * 2), 16));
    h.tools.select(id);
  }

  /** La fiche d'un habitant, dans la carte du bâtiment choisi (voir citizenCard.ts) ; il n'est plus montré : elle se ferme */
  private renderCitizen(box: HTMLElement, id: number) {
    const h = this.host, tl = h.tools, card = citizenCard(h, id);
    if (!card) { tl.select(null); return; }
    if (card.key === this.selKey) return;
    this.selKey = card.key;
    box.dataset.id = `c${id}`;
    box.innerHTML = card.html;
    box.classList.add('show', 'citizen');
    box.classList.remove('fold');
    this.placeCards();
    box.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((el) => (el.onclick = () => {
      const act = el.dataset.act;
      if (act === 'close') tl.select(null);
      else if (act === 'follow') { h.audio.sfxClick(); h.followCitizen(h.citizenCam === id ? null : id); this.selKey = ''; this.renderSelection(); }
      else if (act === 'exp' && el.dataset.m) { h.audio.sfxClick(); this.gotoMission(el.dataset.m); }
      else if (act === 'home') { const c = h.agents.citizen(id); if (c) this.goBuilding(c.home); }
      else if (act?.startsWith('go:')) this.goBuilding(+act.slice(3));
    }));
  }

  /** La carte du bâtiment choisi, repliée (au téléphone seulement : ailleurs le chevron est caché) */
  private selFold = true;

  /** Tracé d'une ligne : ses arrêts jusqu'ici, et de quoi la valider ou l'abandonner */
  private railKey = '';
  private renderRailEdit() {
    const h = this.host, e = h.railEdit, box = $('#railEdit');
    const trouble = e ? h.railTrouble() : null, points = e ? e.via.reduce((n, v) => n + v.length, 0) : 0;
    const key = e ? `${e.stops.join('.')}|${e.line}|${points}|${trouble}` : '';
    if (key === this.railKey) return;
    this.railKey = key;
    box.classList.toggle('show', !!e);
    if (!e) return;
    const names = e.stops.map((id) => h.world.buildings.get(id)).map((b) => (b ? h.railway.stopName(b) : '?'));
    box.innerHTML = `<div class="rhead">${dot(e.color)}<b>${tr(e.line !== null ? 'Modifier la ligne' : 'Nouvelle ligne')}</b></div>
      <p class="rroute">${ic('train', 18, 2)}<span>${names.length ? names.join(' → ') : '—'}</span></p>
      <small>${tr(e.stops.length < 2 ? 'Cliquez la gare suivante.' : 'Cliquez d’autres arrêts pour prolonger la ligne, ou validez.')} ${tr('Recliquer le dernier arrêt le retire.')}</small>
      ${e.stops.length >= 2 ? `<small class="rtip">${ic('hand', 13, 2)} ${tr('Saisissez la voie prévue et glissez-la pour la faire passer où vous voulez. Glissez un point pour le déplacer, un clic sur un point le retire.')}${points ? ` ${tr(points > 1 ? '{n} points de passage.' : '{n} point de passage.', { n: points })}` : ''}</small>` : ''}
      ${trouble ? `<small class="rbad">${ic('alert', 13, 2)} ${trouble}</small>` : ''}
      <div class="acts"><button data-r="undo" ${e.stops.length ? '' : 'disabled'}>${ic('undo', 15, 2)} ${tr('Retirer le dernier')}</button><button data-r="auto" ${points ? '' : 'disabled'} title="${tr('Retirer tous les points de passage : la voie se pose d’elle-même')}">${ic('restart', 15, 2)} ${tr('Tracé auto')}</button><button data-r="cancel">${ic('close', 15, 2)} ${tr('Annuler')} <kbd>${tr('Échap')}</kbd></button><button data-r="ok" class="primary" ${e.stops.length >= 2 && !trouble ? '' : 'disabled'}>${ic('check', 15, 2)} ${tr('Valider')} <kbd>${tr('Entrée')}</kbd></button></div>`;
    // le paysage de l'âge du village derrière le titre, comme les fenêtres des expéditions
    box.style.setProperty('--exp-banner', `url(./expeditions/banniere-${Math.max(0, Math.min(5, h.sim.age))}.webp)`);
    box.querySelectorAll<HTMLButtonElement>('[data-r]').forEach((b) => (b.onclick = () => {
      const r = b.dataset.r;
      if (r === 'undo') h.railUndo(); else if (r === 'auto') h.railAuto(); else if (r === 'ok') h.railFinish(); else h.railCancel();
    }));
  }

  /** Nom, icône, raccourci et fiche d'un outil */
  private toolInfo(id: string) {
    const base = TOOL_INFO[id];
    return { ...base, label: tr(base.label), key: base.key === 'Échap' ? tr('Échap') : base.key, desc: tr(TOOL_DESC[id] ?? '') };
  }

  /**
   * Le conseil du moment, en pastille : orange quand un besoin manque, bleue pour avancer vers l'âge suivant, verte quand tout
   * va bien ; un bouton « Bâtir » quand il nomme un bâtiment, et la pastille s'anime un instant à chaque nouveau conseil
   */
  /** Les conseils se cachent à partir de l’Antiquité ; un bouton les remet (choix gardé d’une partie à l’autre) */
  private help = helpOn();
  /** Affiche ou masque les aides (conseils, et bulles du volet militaire tant qu'elles ne sont pas masquées : voir `warTips.ts`) */
  setHelp(on: boolean) { this.help = on; setHelpOn(on); this.renderMessage(); }

  private renderMessage() {
    const { sim } = this.host, el = $('#msg'), k = sim.messageKind;
    const hb = $('#helpBtn') as HTMLButtonElement, late = sim.age >= 1;
    // (au bac à sable, pas de conseils : pas d'œil non plus)
    hb.hidden = !late || this.host.world.sandbox;
    hb.setAttribute('aria-pressed', String(this.help));
    hb.classList.toggle('on', this.help);
    hb.title = tr(this.help ? 'Masquer les conseils du moment' : 'Afficher les conseils du moment (ce qu’il faut bâtir ensuite)');
    // une petite pastille « Aides » et son interrupteur, en tête de la colonne de gauche, sous la carte du village (l'œil du
    // milieu de l'écran était trop voyant, et on ne savait pas à quoi il servait)
    if (!hb.firstElementChild) hb.innerHTML = `${ic('bulb', 15, 2)}<span>${tr('Aides')}</span><i class="sw"></i>`;
    // à partir de l’Antiquité, aides coupées, seuls restent visibles un conseil qui signale un besoin à combler (manger,
    // boire…) ou le passage d’âge ; un besoin sans conseil (la sécurité) ne fait plus afficher le conseil de l'âge suivant
    const quiet = late && !this.help && !(sim.ready && !k) && !sim.messageNeed;
    // pendant le tutoriel guidé, sa propre bulle suffit : pas de conseil en plus
    // (et en plein commandement, le conseil du village se tait : le combat a ses propres aides)
    const fighting = !!document.getElementById('troopBar') && document.getElementById('troopBar')!.style.display !== 'none';
    // (au bac à sable : aucun conseil)
    el.hidden = quiet || !!this.tutorial?.active || fighting || this.host.world.sandbox;
    // (la pastille des aides se tait aussi pendant le tutoriel guidé et le commandement : le conseil n'y paraît pas)
    if (this.tutorial?.active || fighting) hb.hidden = true;
    // un village plein n'est pas en manque : il attend des places pour grandir (conseil bleu, pas orange)
    const tone = NEEDS.some((n) => n.k !== 'housing' && !sim[n.k].ok) || sim.drought ? 'warn' : sim.ageProgress() || !sim.housing.ok ? 'goal' : 'calm';
    const ready = !k && sim.ready, exp = !k && sim.messageExp, rail = !k && !exp && sim.messageRail !== null, gold = !k && sim.messageGold, choice = !k && sim.messageChoice, conflict = !k && sim.messageConflict, key = `${tone}|${k}|${ready}|${exp}|${rail}|${gold}|${choice}|${conflict}|${sim.message}`;
    if (el.dataset.v === key) return;
    el.dataset.v = key;
    el.className = `tone-${tone}${k || ready || exp || rail || gold || choice || conflict ? ' link' : ''}`;
    el.title = k === 'farm' && !sim.food.ok ? tr('Cliquer pour tracer un champ') : k ? tr('Cliquer pour bâtir « {name} »', { name: sim.nameOf(k) }) : exp ? tr('Cliquer pour ouvrir les expéditions') : rail ? tr('Cliquer pour tracer une ligne depuis cette gare') : gold ? tr('Cliquer pour ouvrir le comptoir des voisins') : choice ? tr('Cliquer pour faire le grand choix') : conflict ? tr('Cliquer pour régler le conflit des deux îles') : ready ? tr('Cliquer pour passer à l’âge suivant') : '';
    const text = sim.message.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    // un picto selon le ton (manque, objectif, tout va bien) ; un conseil qui mène quelque part finit par son geste et un chevron
    const go = (w: string) => `<b class="go">${w}<i>›</i></b>`;
    el.innerHTML = `<span class="mi">${pic(tone === 'warn' ? '⚠' : tone === 'goal' ? '⬆' : '✅', 24)}</span><span>${text}</span>${k ? go(tr('Bâtir')) : exp ? go(tr('Ouvrir')) : rail ? go(tr('Tracer')) : gold ? go(tr('Échanger')) : choice ? go(tr('Choisir…')) : ready ? go(tr('Passer')) : ''}`;
    void el.offsetWidth;
    el.classList.add('flash');
  }

  /**
   * Stocks du village (bois, pierre, minerai, briques ; pétrole brut et carburant à l'époque moderne, ou dès qu'il y en a) et ce qu'il
   * en produit chaque jour
   */
  private resKey = '';
  /** habitants au début du jour en cours, et ce que la veille a apporté (null le premier jour) */
  private popDay = -1;
  private popPrev = 0;
  private popDelta: number | null = null;
  // ---------------- Petits objectifs et barre du haut sur une ligne ----------------
  /** l'objectif montré dans la pastille (parmi les trois en cours), celui qui vient d'être atteint et jusqu'à quand */
  private goalIdx = 0;
  private goalShown: GoalDef | null = null;
  private goalWin: { g: GoalDef; until: number } | null = null;
  private goalKey = '';
  /** Un objectif atteint : la pastille le montre en doré quelques secondes, avec un mot de félicitation */
  goalWon(g: GoalDef) {
    this.goalWin = { g, until: performance.now() + GOAL_WIN_MS };
    this.goalKey = '';
    this.toast(`${tr('Objectif atteint : {goal}.', { goal: tr(g.text) })} ${tr(g.praise)} ${rewardWords(this.host.world.unlimited ? { joy: g.reward.joy } : g.reward)}`.trim(), undefined, 'notice');
    this.renderGoals();
  }

  /** La pastille de l'objectif : son picto, son texte, sa jauge, sa récompense et un point par objectif en cours */
  private renderGoals() {
    const h = this.host, box = $('#goalBox');
    const win = this.goalWin && performance.now() < this.goalWin.until ? this.goalWin : null;
    if (!win) this.goalWin = null;
    const ctx = h.goalsOn && !h.hideGoals ? h.goalCtx() : null, act = ctx ? activeGoals(h.world.goals, ctx) : [];
    const hide = !ctx || (!act.length && !win);
    if (box.hidden !== hide) { box.hidden = hide; this.fitKey = ''; }
    if (hide) { this.goalShown = null; return; }
    if (this.goalIdx >= act.length) this.goalIdx = 0;
    const g = win ? win.g : act[this.goalIdx];
    this.goalShown = g;
    const [have, need] = win ? [1, 1] : progressOf(g, h.world.goals, ctx!);
    // (ressources illimitées, au bac à sable : pas de ressources à gagner, le bien-être seulement)
    const reward = h.world.unlimited ? { joy: g.reward.joy } : g.reward;
    const dots = act.length > 1 && !win ? `<span class="gd">${act.map((x, i) => `<i data-gi="${i}" class="${i === this.goalIdx ? 'on' : ''}" title="${attr(tr(x.text))}"></i>`).join('')}</span>` : '';
    const ico = win ? hudPic('etoile', 30) : g.pic ? hudPic(g.pic, 30) : pic(KINDS[g.kinds![0]].icon, 30);
    // (le texte sur deux lignes au plus, puis une ligne : la jauge et le compte, ou le mot de félicitation, et la récompense)
    const html = `<span class="gi">${ico}</span><span class="gt"><b class="g1">${win ? tr('Bravo !') : tr(g.text)}</b><span class="g2">`
      + (win ? `<span class="gp">${tr(g.praise)}</span>` : `<span class="gb"><i style="width:${Math.round(Math.min(1, have / Math.max(1, need)) * 100)}%"></i></span><em>${Math.min(have, need)}/${need}</em>`)
      + `${rewardChips(reward)}</span></span>${dots}`;
    const key = `${html}|${getLang()}`;
    if (key === this.goalKey) return;
    this.goalKey = key;
    box.innerHTML = html;
    box.classList.toggle('won', !!win);
    const rw = rewardWords(reward);
    box.title = win ? '' : `${tr('Objectif : {goal}', { goal: tr(g.text) })} (${Math.min(have, need)}/${need})${rw ? ` — ${rw}` : ''}`;
  }

  /**
   * Sur un écran d'ordinateur (dès 1100 px de large), la barre du haut tient sur une ligne : l'âge, les stocks, les besoins,
   * l'objectif, l'heure et les boutons. Les stocks et les besoins défilent alors dans une fenêtre taillée à la place qui reste
   * (deux de chaque au moins) ; plus étroit, ils passent à la ligne comme avant (demande de l'auteur, 20 nov. 2026)
   */
  private fitKey = '';
  /** le nombre de stocks et de besoins montrés au dernier calcul (gardé tant qu'il tient, à `FIT_KEEP` près) */
  private fitPrev: [number, number] | null = null;
  /** l'objectif était resserré au dernier calcul (`compact`, `mini`) */
  private fitPrevBox: '' | 'compact' | 'mini' = '';
  private fitHud() {
    const one = innerWidth >= ONE_LINE_MIN, rv = $('#resView'), nv = $('#needView'), box = $('#goalBox');
    const nRes = rv.querySelectorAll('.res').length, nNeed = nv.querySelectorAll('.need').length;
    // (la largeur des stocks change avec leurs chiffres : 9 → 10 → 100)
    // (l'écran allégé ne montre que les besoins qui manquent, sans fenêtre qui défile : la pilule entière compte, sa largeur entre
    // dans la clé)
    const lite = allege();
    const key = `${innerWidth}|${nRes}|${nNeed}|${box.hidden}|${document.body.className}|${[...rv.children[0]?.children ?? []].map((e) => (e as HTMLElement).offsetWidth).join()}|${$('#pop').offsetWidth}|${$('#hudR').offsetWidth}|${lite ? $('#needsBox').offsetWidth : ''}`;
    if (key === this.fitKey) return;
    this.fitKey = key;
    // (le défilement est gardé : le joueur qui regardait l'or le voit encore après)
    const keep = [rv.scrollLeft, nv.scrollLeft];
    for (const v of [rv, nv]) { v.style.width = ''; v.style.maxWidth = ''; v.style.minWidth = ''; v.style.flexShrink = ''; }
    // (les flèches d'avant ne comptent pas : restées affichées, elles prenaient 48 px, la fenêtre rétrécissait sous la largeur
    // calculée, cachait une ressource derrière un vide, et les flèches restaient ; elles reviennent par `syncResNav`)
    $('#resPanel').classList.remove('scrolls'); $('#needsBox').classList.remove('scrolls');
    box.classList.remove('compact', 'mini');
    if (!one || !nRes || !nNeed) { this.fitResView(); this.syncResNav(); this.syncNeedNav(); return; }
    const hud = $('#hud'), gap = parseFloat(getComputedStyle(hud).columnGap) || 10;
    const rp = $('#resPanel'), nb = $('#needsBox');
    // (les cases n'ont pas toutes la même largeur : une fenêtre de n cases prend la largeur des n plus larges, pour en montrer n
    // entières d'où que parte le défilement ; un bout de la suivante qui dépasserait est masqué, voir `hidePeek`)
    const top = (q: NodeListOf<HTMLElement>) => [...q].map((e) => e.offsetWidth + 2).sort((a, b) => b - a);
    const resWs = top(rv.querySelectorAll<HTMLElement>('.res')), needWs = lite ? [] : top(nv.querySelectorAll<HTMLElement>('.need'));
    const span = (ws: number[], n: number) => ws.slice(0, n).reduce((a, b) => a + b, 0);
    // ce que chaque pilule prend en dehors de sa fenêtre (marges, séparateur, habitants), les flèches à part : mesuré pièce par
    // pièce (la pilule elle-même peut être rétrécie par la place qui manque)
    const navW = 2 * (parseFloat(getComputedStyle($('#resPrev')).width) || 24);
    const chrome = (p: HTMLElement, v: HTMLElement) => {
      const cs = getComputedStyle(p);
      let w = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      for (const c of p.children as HTMLCollectionOf<HTMLElement>) {
        if (c === v || c.classList.contains('resNav')) continue;
        const cc = getComputedStyle(c);
        if (cc.display !== 'none') w += c.offsetWidth + parseFloat(cc.marginLeft) + parseFloat(cc.marginRight);
      }
      return w;
    };
    const chromeR = chrome(rp, rv), chromeN = lite ? nb.offsetWidth : chrome(nb, nv), nN = lite ? 0 : nNeed;
    const fitIn = (goalW: number, extra = 0) => {
      const free = hud.clientWidth - $('#hudL').offsetWidth - $('#hudR').offsetWidth - 3 * gap - (goalW ? goalW + gap : 0) - chromeR - chromeN - FIT_SLACK - extra;
      const cost = (r: number, n: number) => span(resWs, r) + span(needWs, n) + (r < nRes ? navW : 0) + (n < nN ? navW : 0);
      // (ce qui était déjà montré se garde avec un peu de la marge : la barre ne bat plus entre deux tailles)
      const prev = this.fitPrev, fits = (r: number, n: number) => cost(r, n) <= free + (prev && r <= prev[0] && n <= prev[1] ? FIT_KEEP : 0);
      let r = Math.min(2, nRes), n = Math.min(2, nN);
      if (!fits(r, n)) return null;
      // une ressource, puis un besoin, tant qu'il reste de la place
      for (let grew = true; grew;) {
        grew = false;
        if (r < nRes && fits(r + 1, n)) { r++; grew = true; }
        if (n < nN && fits(r, n + 1)) { n++; grew = true; }
      }
      return [r, n];
    };
    // (l'objectif ne regrandit que s'il reste `FIT_KEEP` de marge de plus : sinon il battait entre deux tailles, lui aussi)
    const was = this.fitPrevBox;
    let fit = fitIn(box.hidden ? 0 : box.offsetWidth, was ? FIT_KEEP : 0);
    // pas la place : l'objectif se resserre (sans sa jauge, puis sans sa récompense), puis les fenêtres ne gardent qu'un besoin,
    // et enfin qu'une ressource
    if (!fit && !box.hidden) { box.classList.add('compact'); fit = fitIn(box.offsetWidth, was === 'mini' ? FIT_KEEP : 0); }
    if (!fit && !box.hidden) { box.classList.add('mini'); fit = fitIn(box.offsetWidth); }
    let [r, n] = fit ?? [Math.min(2, nRes), Math.min(1, nN)];
    const apply = () => {
      for (const [v, w] of (lite ? [[rv, span(resWs, r) - 2]] : [[rv, span(resWs, r) - 2], [nv, span(needWs, n) - 2]]) as [HTMLElement, number][]) { v.style.maxWidth = 'none'; v.style.minWidth = '0'; v.style.width = `${w}px`; v.style.flexShrink = '0'; }
      this.syncResNav(); this.syncNeedNav();
    };
    apply();
    // contrôle sur la page réelle : si la ligne dépasse encore (une largeur mesurée trop tôt, une police pas encore chargée), une
    // case de moins, jusqu'à ce qu'elle tienne. Elle débordait chez l'auteur en 1700 px : la cloche et les réglages sortaient de
    // l'écran à droite, et la page glissait de côté
    const over = () => {
      const edge = Math.max(...['#resPanel', '#needsBox', '#goalBox'].map((q) => $(q).getBoundingClientRect().right)), hr = $('#hudR').getBoundingClientRect();
      return edge + gap > hr.left + 0.5 || hr.right > hud.getBoundingClientRect().right + 0.5;
    };
    for (let i = 0; i < 12 && over(); i++) {
      if (!box.hidden && !box.classList.contains('mini')) box.classList.add(box.classList.contains('compact') ? 'mini' : 'compact');
      else if (n > 2) n--;
      else if (r > 2) r--;
      else if (n > 1) n--;
      else if (r > 1) r--;
      else break;
      apply();
    }
    this.fitPrev = [r, n];
    this.fitPrevBox = box.classList.contains('mini') ? 'mini' : box.classList.contains('compact') ? 'compact' : '';
    rv.scrollLeft = keep[0]; nv.scrollLeft = keep[1];
    this.syncResNav(); this.syncNeedNav();
  }

  /** Les flèches des besoins, comme celles des stocks */
  private syncNeedNav() {
    const v = $('#needView'), hidden = v.scrollWidth > v.clientWidth + 2;
    hidePeek(v);
    $('#needsBox').classList.toggle('scrolls', hidden);
    ($('#needPrev') as HTMLButtonElement).disabled = !hidden || v.scrollLeft <= 1;
    ($('#needNext') as HTMLButtonElement).disabled = !hidden || v.scrollLeft + v.clientWidth >= v.scrollWidth - 2;
  }

  /** Un besoin qui manque, caché derrière les flèches, vient de lui-même dans la fenêtre (une fois, quand il se met à manquer) */
  private needWarnKey = '';
  private showNeedWarn() {
    const v = $('#needView'), warn = [...v.querySelectorAll<HTMLElement>('.need.warn, .need.full')];
    const key = warn.map((e) => e.id).join();
    if (key === this.needWarnKey) return;
    this.needWarnKey = key;
    const el = warn[0];
    if (!el || v.scrollWidth <= v.clientWidth + 2) return;
    const left = el.offsetLeft - ($('#needs').offsetLeft);
    if (left >= v.scrollLeft && left + el.offsetWidth <= v.scrollLeft + v.clientWidth) return;
    v.scrollTo({ left, behavior: 'smooth' });
  }

  /**
   * La fenêtre des stocks montre un nombre entier de ressources : à la largeur que lui laisse la barre, la dernière était
   * coupée de quelques pixels, et ses chiffres avec (« 31 » pour 318, « 27( », testeuse v6 en 1440 × 900)
   */
  private fitResView() {
    // (sur une ligne, `fitHud` taille déjà la fenêtre sur des ressources entières)
    if (innerWidth >= ONE_LINE_MIN) return;
    const v = $('#resView'), items = [...v.querySelectorAll<HTMLElement>('.res')];
    v.style.width = ''; v.style.flexShrink = '';
    // (au sous-pixel près : les largeurs arrondies laissaient encore 2 px de la dernière sous le bord)
    const avail = v.getBoundingClientRect().width, rs = items.map((e) => e.getBoundingClientRect()), n = rs.length;
    if (!avail || !n || rs[n - 1].right - rs[0].left <= avail + 0.5) return;
    // le plus de ressources qui tiennent, d'où que parte le défilement (il s'arrête au début d'une ressource) ; il peut manquer
    // quelques pixels (SLACK) : la fenêtre ne rétrécit plus et les besoins voisins les cèdent
    for (let k = n - 1; k >= 1; k--) {
      let worst = 0;
      for (let i = 0; i + k <= n; i++) worst = Math.max(worst, rs[i + k - 1].right - rs[i].left);
      if (worst > avail + RES_SLACK && k > 1) continue;
      v.style.width = `${Math.ceil(worst)}px`;
      v.style.flexShrink = '0';
      return;
    }
  }

  /** Les flèches des stocks : montrées s'il y a des ressources cachées, éteintes au bout */
  private syncResNav() {
    const v = $('#resView'), hidden = v.scrollWidth > v.clientWidth + 2;
    hidePeek(v);
    $('#resPanel').classList.toggle('scrolls', hidden);
    ($('#resPrev') as HTMLButtonElement).disabled = !hidden || v.scrollLeft <= 1;
    ($('#resNext') as HTMLButtonElement).disabled = !hidden || v.scrollLeft + v.clientWidth >= v.scrollWidth - 2;
  }

  private renderResources() {
    const w = this.host.world, day = this.host.expeditions.daily();
    const items: [Resource, string, string][] = [['wood', 'tree', tr('Bois')], ['stone', 'rock', tr('Pierre')], ['ore', 'pickaxe', tr('Minerai')]];
    // les briques paraissent avec la briqueterie, dès l'âge industriel (ou dès qu'on en a : une partie plus ancienne)
    if (this.host.sim.age >= 3 || w.brick >= 1 || day.brick) items.push(['brick', 'brick', tr('Briques')]);
    if (this.host.sim.age >= 4 || w.crude >= 1 || w.fuel >= 1 || day.crude || day.fuel || this.host.expeditions.state.done.includes('oil')) items.push(['crude', 'crude', tr('Brut')], ['fuel', 'fuel', tr('Carburant')]);
    // l'or des voisins, seulement dans une partie qui a accepté l'archipel ; un clic ouvre le comptoir
    if (archipelagoOn(w)) items.push(['gold', 'coin', tr('Or')]);
    // une matière qui bloque l'âge suivant : son débit passe en orange, l'info-bulle dit pourquoi (sa fiche, quoi bâtir)
    const short = new Map(this.host.sim.shortages.map((s) => [s.res, s]));
    const key = `${w.unlimited}|${getLang()}|` + items.map(([r]) => `${Math.floor(w[r])}/${day[r]}/${short.has(r) ? Math.ceil(short.get(r)!.days) : ''}`).join('|');
    if (key === this.resKey) return;
    this.resKey = key;
    // la fiche du bâtiment en main dit si l'on a encore de quoi le payer
    this.renderInfo();
    // la production du jour s'affiche sous le stock (grisée quand rien n'en produit) ; le brut qu'on raffine plus vite qu'on ne
    // le tire baisse chaque jour
    const per = (n: number) => `${n < 0 ? '−' : '+'}${Number.isInteger(n) ? Math.abs(n) : Math.abs(n).toFixed(1)}${tr('/j')}`;
    const use: Partial<Record<Resource, string>> = { wood: tr(' — pour bâtir les grands bâtiments'), stone: tr(' — pour bâtir les grands bâtiments'), ore: tr(' — pour passer les âges et s’équiper. La mine en extrait chaque jour'), brick: tr(' — pour passer à l’âge futuriste et bâtir gares, usines et raffineries'), crude: tr(' — la raffinerie en fait du carburant'), fuel: tr(' — pour les automobiles'), gold: tr(' — pour passer les âges. Cliquez pour échanger au comptoir des voisins') };
    // le brut tiré des puits peut partir aussitôt à la raffinerie : on dit ce qu'en tirent les puits et ce qu'elle en prend
    const drawn = this.host.expeditions.yields().crude;
    const flow = (r: Resource) => (r === 'gold' ? '' : r === 'crude' && drawn ? tr(', {drawn} tirés des puits par jour et {refined} raffinés', { drawn, refined: drawn - day.crude }) : day[r] ? tr(', {n} par jour', { n: per(day[r]).replace(tr('/j'), '') }) : tr(', rien n’en produit pour l’instant'));
    $('#res').innerHTML = items.map(([r, icon, label]) => w.unlimited
      ? `<div class="res" data-r="${r}" title="${tr('{label} : illimité ({why})', { label, why: DIFF_TEXT.resInfinite[w.difficulty] })}">${resPic(r, 28)}<span class="rv"><b>∞</b><small>${label}</small></span></div>`
      : `<div class="res${short.has(r) ? ' short' : ''}" data-r="${r}" aria-label="${tr('{label} : {n} en réserve', { label, n: Math.floor(w[r]) })}${flow(r)}${use[r] ?? ''}${short.has(r) ? ' ' + attr(shortText(w, this.host.sim.age, short.get(r)!, true)) : ''}">${resPic(r, 28)}<span class="rv"><b>${Math.floor(w[r])}</b>${r === 'gold' ? `<em class="rate">${tr('échange')}</em>` : `<em class="rate${day[r] || (r === 'crude' && drawn) ? '' : ' none'}">${per(day[r])}</em>`}</span></div>`).join('');
    this.fitResView();
    this.syncResNav();
  }

  /** Surligne l'outil actif, affiche/masque le réglage de pinceau */
  refreshTools() {
    this.renderSelection();
    const tl = this.host.tools;
    // (l'écran allégé : un outil pris déplie les vignettes, un outil lâché les replie)
    this.syncFold();
    this.root.querySelectorAll<HTMLButtonElement>('#dock button[data-tool], #items button[data-kind]').forEach((b) => {
      const on = b.dataset.tool ? b.dataset.tool === tl.tool : tl.tool === 'build' && b.dataset.kind === tl.kind;
      // le bâtiment pris en main (depuis un message, un raccourci) défile jusque dans la rangée visible
      if (on && b.dataset.kind && !b.classList.contains('active')) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      b.classList.toggle('active', on);
    });
    const brush = SCULPT_TOOLS.includes(tl.tool) || (VEG_TOOLS.includes(tl.tool) && !SINGLE_TOOLS.includes(tl.tool)) || tl.tool === 'biome' || tl.tool === 'bulldoze';
    $('#brush').classList.toggle('show', brush);
    // le pinceau de biome : le choix du biome, à côté de la taille
    $('#biomes').classList.toggle('show', tl.tool === 'biome');
    $('#biomes').querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('active', (b.dataset.b === '' ? null : Number(b.dataset.b)) === tl.biomeKind));
    // l'outil Route : son mode de tracé
    $('#roadModes').classList.toggle('show', tl.tool === 'road');
    $('#roadModes').querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('active', b.dataset.m === tl.roadMode));
    // l'onglet suit l'outil ; le rayon suit le bâtiment choisi
    const tabOf = tabOfTool(tl.tool, this.tab);
    if (tabOf !== this.tab) { this.tab = tabOf; const lt = landOfTool(tl.tool); if (lt) this.land = lt; this.renderDock(); return; }
    // le sous-menu du Paysage suit l'outil en main (un raccourci clavier, par exemple)
    { const lt = landOfTool(tl.tool); if (this.tab === 'land' && lt && lt !== this.land) { this.land = lt; this.renderItems(); return; } }
    if (tl.tool === 'build' && KINDS[tl.kind].cat !== this.cat) { this.cat = KINDS[tl.kind].cat; this.renderItems(); return; }
    $<HTMLInputElement>('#rad').value = String(tl.radius);
    $('#radv').textContent = String(tl.radius);
    ($('#bRot') as HTMLButtonElement).disabled = !tl.holding();
    this.renderInfo();
  }

  /** Route libre : une bulle suit le curseur et dit quoi cliquer (le point A, puis le point B) */
  private cursorXY: [number, number] | null = null;
  /** la souris est sur la carte (pas sur l'interface) */
  private onMap = false;
  private hintTxt = '';
  private renderCursorHint() {
    // (un bâtiment ou une grotte dont l'endroit est fixé : le second clic donne le côté de l'entrée)
    const tl = this.host.tools, ps = tl.placeStage, st = ps === 2 ? 2 : tl.freeStage, el = $('#cursorHint');
    const del = tl.tool === 'bulldoze' ? this.demolishHint() : '';
    const txt = del || (ps === 2 ? tr(tl.tool === 'cave' ? 'Cliquez du côté de l’ouverture' : 'Cliquez du côté de l’entrée') : st === 1 ? tr('Cliquez le point A') : st === 2 ? tr('Cliquez le point B') : '');
    if (txt !== this.hintTxt) { this.hintTxt = txt; el.innerHTML = txt; el.classList.toggle('show', !!txt); el.classList.toggle('b', !del && st === 2); el.classList.toggle('d', !!del); }
    // près du bord droit ou du bas, l'étiquette passe de l'autre côté du curseur (elle sortait de l'écran, testeurs v6)
    if (txt && this.cursorXY) {
      const [x, y] = this.cursorXY, w = el.offsetWidth, h = el.offsetHeight;
      const left = x + 18 + w > innerWidth - 8 ? x - 12 - w : x + 18, top = y + 20 + h > innerHeight - 8 ? y - 12 - h : y + 20;
      el.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
    }
  }

  /**
   * Outil Démolir : ce que rendrait un clic sur le bâtiment visé (ou, au pinceau large, sur tous ceux du disque), avant de
   * cliquer (Karim, testeur v6 : le remboursement n'était dit qu'après). Vide quand on ne vise aucun bâtiment
   */
  private demolishHint(): string {
    const w = this.host.world, list = this.onMap ? this.host.tools.bulldozeTargets() : [];
    if (!list.length) return '';
    const b = list[0], what = list.length > 1 ? nplural(list.length, 'bâtiment', 'bâtiments') : tr('« {name} »', { name: KINDS[b.kind].names[Math.max(b.age, KINDS[b.kind].minAge)] });
    if (w.unlimited) return tr('Démolir {what}', { what });
    const back = refundTotal(w, list);
    // (le premier bûcheron ou la première carrière, offerts en Normal, ne rendent rien : on dit pourquoi)
    const gift = list.length === 1 && PRODUCERS.includes(b.kind) && ![...w.buildings.values()].some((o) => o.kind === b.kind && o.id !== b.id);
    return back ? tr('Démolir {what} : rend <b>{cost}</b>', { what, cost: costLabel(back) }) : tr(gift ? 'Démolir {what} : ne rend rien (il était offert)' : 'Démolir {what} : ne rend rien', { what });
  }

  /**
   * Le jeu arrêté par le joueur : « Jeu en pause » en lettres gravées, sans boîte, posé au-dessus de la barre de construction
   * (un clic reprend), et un voile léger sur les bords. Retours de l'auteur : la pause ne se voyait pas (17 nov. 2026), puis
   * le bandeau au milieu, son bouton « Menu principal » et le cadre doré étaient trop envahissants (19 nov. 2026). Pas pendant
   * une fenêtre (elle arrête le jeu d'elle-même), une cinématique, ni le début d'une partie neuve que le tutoriel tient en pause
   */
  private syncPause() {
    const on = this.host.time.paused && !this.menuOpen() && !document.body.classList.contains('cinematic') && !this.tutorial?.holdsPause;
    const bar = $('#pauseBar');
    if (bar.hidden === on) { bar.hidden = !on; $('#pauseVeil').classList.toggle('on', on); }
    if (!on) return;
    // au-dessus de la barre de construction, de ses onglets (qui dépassent par le haut), des réglages de l'outil (tracé des routes,
    // pinceau : ils flottent au-dessus de la barre), des outils (au téléphone, une rangée au-dessus) et de la fiche de l'outil
    // quand elle passe sous le titre ; leur hauteur varie, d'où le calcul, refait à chaque mise à jour. Toute la largeur du titre
    // compte, sablier compris (testeurs v6 : « Jeu en pause » couvrait « Ligne / Libre » et les outils du téléphone)
    const cx = window.innerWidth / 2, half = bar.offsetWidth / 2 + 70;
    let top = Infinity;
    for (const id of ['dockMain', 'subcats', 'info', 'dockBottom', 'dockSide', 'modes', 'quickL', 'quickR', 'homeBack']) {
      const r = document.getElementById(id)?.getBoundingClientRect();
      if (r && r.height > 0 && r.left < cx + half && r.right > cx - half) top = Math.min(top, r.top);
    }
    const bottom = top < Infinity ? Math.round(window.innerHeight - top + 18) : 150;
    if (bar.dataset.b !== String(bottom)) { bar.style.bottom = bottom + 'px'; bar.dataset.b = String(bottom); }
  }

  /**
   * Un geste refusé sur la carte (poser ici, tracer là…) : la raison dans une bulle rouge sous le curseur, qui tremble, avec un
   * son ; elle s'efface seule. Retour de l'auteur (17 nov. 2026) : le message « pas possible » passait inaperçu, rangé dans la
   * colonne des messages. Il reste dans la cloche. Au doigt (pas de curseur), la bulle se met au milieu de l'écran
   */
  private denyTimer = 0;
  refuse(msg: string) {
    const el = $('#cursorDeny'), touch = window.matchMedia('(pointer: coarse)').matches;
    el.querySelector('.cdT')!.textContent = msg;
    const [x, y] = !touch && this.cursorXY ? this.cursorXY : [innerWidth / 2, innerHeight * 0.42];
    // (près du bord droit ou du bas, la bulle passe de l'autre côté du curseur)
    el.classList.remove('show'); el.style.left = '0px'; el.style.top = '0px';
    void el.offsetWidth;
    el.classList.add('show');
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(innerWidth - r.width - 8, x + 16))}px`;
    el.style.top = `${y + 22 + r.height > innerHeight - 8 ? y - r.height - 14 : y + 22}px`;
    this.host.audio.sfxDeny();
    clearTimeout(this.denyTimer);
    this.denyTimer = window.setTimeout(() => el.classList.remove('show'), 2600);
    this.toast(msg, undefined, 'info');
  }

  /**
   * Message au joueur, par la file des notifications (voir `notifs.ts`) : `level` dit s'il mérite un message à l'écran (action,
   * danger, geste du joueur) ou seulement une ligne dans la cloche (info) ; sans niveau, il est deviné d'après le texte.
   * Avec `act`, un clic dessus y mène.
   */
  toast(msg: string, act?: () => void, level?: NotifLevel) {
    const it = this.notifs.push(msg, performance.now(), { level, act });
    this.renderNotifs();
    return it;
  }

  /** Une annonce discrète : seulement dans la cloche */
  info(msg: string) { this.toast(msg, undefined, 'info'); }

  /** Un message ou une bannière est-il à l'écran ? (les aides et conseils se taisent alors) */
  popupShowing() { return this.notifs.showing || this.banners.showing(); }

  private toastHover = new Set<number>();
  private notifKey = '';

  /** Appelée quatre fois par seconde : horloge de la file, bannière retenue, cloche */
  private tickNotifs() {
    const now = performance.now();
    // une bannière à l'écran : un seul message en plus, pas deux
    // (l'écran allégé : une seule place pour le conseil et les messages, un message à la fois)
    this.notifs.max = window.matchMedia('(max-width: 600px)').matches || this.banners.showing() || allege() ? 1 : 2;
    const open = !!this.root.querySelector('.overlay');
    this.notifs.setBlocked(open, now);
    this.notifs.tick(now, this.toastHover);
    this.banners.tick(open);
    this.renderNotifs();
  }

  private renderNotifs() {
    const q = this.notifs, box = $('#toasts');
    const key = q.visible.map((v) => `${v.id}:${v.count}`).join('|') + `#${q.unread}`;
    if (key === this.notifKey && !q.dirty) return;
    this.notifKey = key;
    q.dirty = false;
    const keep = new Set(q.visible.map((v) => String(v.id)));
    for (const el of Array.from(box.children) as HTMLElement[]) if (!keep.has(el.dataset.id!)) el.remove();
    for (const v of q.visible) {
      let el = box.querySelector<HTMLElement>(`[data-id="${v.id}"]`);
      if (!el) {
        el = document.createElement('div');
        el.dataset.id = String(v.id);
        // un message qui mène quelque part ne s'efface pas sous la souris (le clic tomberait sur la carte)
        el.addEventListener('pointerenter', () => { if (v.act) this.toastHover.add(v.id); });
        el.addEventListener('pointerleave', () => this.toastHover.delete(v.id));
        el.addEventListener('click', () => { this.toastHover.delete(v.id); this.notifs.dismiss(v.id); this.renderNotifs(); v.act?.(); });
        box.appendChild(el);
      }
      el.className = `toast ${v.level}${v.act ? ' act' : ''}`;
      // le picto de l'émoji de tête s'il en a un, sinon un picto selon le niveau (danger, geste à faire, annonce),
      // puis le texte (sûr : posé en texte, pas en HTML)
      const txt = v.count > 1 ? `${v.text} ×${v.count}` : v.text;
      if (el.dataset.v !== txt) {
        const lead = leadPic(txt);
        el.innerHTML = `${pic(lead ? lead[0] : v.level === 'danger' ? '⚠' : v.level === 'action' ? '🧭' : '🔔', 24)}<span></span>`;
        el.querySelector('span')!.textContent = lead ? lead[1] : txt; el.dataset.v = txt;
      }
    }
    // un message à l'écran passe devant le conseil du moment, qui revient après lui (écran allégé : ils ont la même place)
    document.body.classList.toggle('toastOn', q.visible.length > 0);
    $('#bellBadge').textContent = q.unread ? String(Math.min(q.unread, 99)) : '';
    $('#bBell').classList.toggle('new', q.unread > 0);
    // (écran allégé : la cloche est rangée dans le menu, qui reprend son compte de notifications nouvelles)
    $('#menuBadge').textContent = $('#bellBadge').textContent;
    if (!$('#notifPanel').hidden) this.renderNotifPanel();
  }

  /** La cloche : l'historique des 30 derniers messages ; l'ouvrir les marque lus */
  toggleNotifPanel(open = $('#notifPanel').hidden) {
    $('#notifPanel').hidden = !open;
    $('#bBell').setAttribute('aria-expanded', String(open));
    if (open) { this.notifs.markRead(); this.renderNotifPanel(); this.renderNotifs(); }
  }

  private renderNotifPanel() {
    const p = $('#notifPanel'), h = this.notifs.history;
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    p.innerHTML = `<div class="npHead"><b>${tr('Notifications')}</b>${h.length ? `<button class="npClear" type="button">${tr('Tout effacer')}</button>` : ''}</div>`
      + (h.length ? `<ul>${h.map((x) => `<li class="${x.level}">${withPic(esc(x.text), 18)}${x.count > 1 ? ` <em>×${x.count}</em>` : ''}</li>`).join('')}</ul>` : `<p class="npNone">${tr('Rien de nouveau.')}</p>`);
    p.querySelector<HTMLElement>('.npClear')?.addEventListener('click', () => { this.notifs.clearHistory(); this.renderNotifPanel(); this.renderNotifs(); });
  }

  /** Fenêtre d'un nouvel âge : les bâtiments qui apparaissent, chacun à bâtir d'un clic (et ses améliorations) */
  showNewAge(age: number) {
    const fresh = KIND_ORDER.filter((k) => KINDS[k].minAge === age && !this.lockOf(k) && offered(this.host.world, k));
    // ceux qu'une expédition débloquerait : visibles mais grisés, avec le nom de l'expédition
    const shut = KIND_ORDER.filter((k) => KINDS[k].minAge <= age && KINDS[k].reqMission && !this.host.world.missionDone(KINDS[k].reqMission!) && offered(this.host.world, k)
      && !(KINDS[k].maxAge !== undefined && age > KINDS[k].maxAge!));
    if (!fresh.length && !shut.length) return;
    const lockedTile = (k: KindId) => {
      const m = MISSIONS.find((x) => x.id === KINDS[k].reqMission);
      return `<button class="newKind shut" data-mission="${KINDS[k].reqMission}" title="${tr('Un clic mène à l’expédition')}"><b>${ic(KIND_ICON[k], 26, 1.6)}</b><span>${KINDS[k].names[age] || KINDS[k].names[KINDS[k].minAge]}</span><small>${tr('Expédition « {title} »', { title: tr(m?.title ?? KINDS[k].reqMission!) })}</small></button>`;
    };
    const tile = (k: KindId) => `<button class="newKind" data-kind="${k}" title="${this.host.sim.whereOf(k)}"><b>${ic(KIND_ICON[k], 26, 1.6)}</b><span>${KINDS[k].names[age]}</span><small>${BUILD_CATS.find((c) => c.id === KINDS[k].cat)!.label}</small></button>`;
    const { ov, close } = modal(this.root, 'newAge', `${ic('up', 22)} ${AGES[age].name}`, `
      <p class="hint">${tr('{tagline}. Nouveaux bâtiments à votre disposition :', { tagline: AGES[age].tagline })}</p>
      ${fresh.length ? `<div class="newKinds">${fresh.map(tile).join('')}</div>` : ''}
      ${shut.length ? `<p class="hint">${tr('À débloquer par des expéditions :')}</p><div class="newKinds">${shut.map(lockedTile).join('')}</div>` : ''}
      <div class="row"><span class="grow"></span><button class="active ok">${tr('C’est parti')}</button></div>`);
    $('.ok', ov).onclick = close;
    ov.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('.newKind');
      const k = t?.dataset.kind as KindId | undefined;
      if (k) { close(); this.pick(k); }
      else if (t?.dataset.mission) { close(); this.gotoMission(t.dataset.mission); }
    });
  }

  /** Bannière d'arrivée, courte ; `once` : seulement la première fois (clé gardée d'une partie à l'autre) */
  banner(title: string, sub: string, once?: string) { this.banners.show(title, sub, once); }

  update() {
    const { sim, time, env } = this.host;
    this.renderRailEdit();
    this.renderCursorHint();
    if (this.waitNotes.size) this.dropDecided();
    // (un nouvel âge : l'écran allégé déplie les vignettes, pour montrer les nouveaux bâtiments)
    if (sim.age !== this.lastAge) { if (this.lastAge >= 0) this.dockOpen = true; this.lastAge = sim.age; this.renderItems(); }
    // les vignettes suivent le village : un bâtiment de plus ou de moins, un cadenas levé par une expédition
    else if (!this.press && this.tilesNow() !== this.tilesKey) this.renderItems(true);
    this.markFirst();
    this.syncFold();
    // (et quand les stocks bougent, une fiche qui dit « vous avez 15 bois » : elle restait à l'ancien compte, testeuse v6)
    if (this.host.tools.placeWhy !== this.infoWhy || this.host.tools.placeStage !== this.infoStage || this.haveNow() !== this.infoHave) this.renderInfo();
    $('#ageName').textContent = AGES[sim.age].name;
    // le nom de l'île du joueur (choisi avec le blason), à la place du titre du jeu
    const vName = $('.vName');
    if (vName.textContent !== this.host.world.isleName) { vName.textContent = this.host.world.isleName; vName.title = tr('L’île de {name}', { name: this.host.world.isleName }); delete vName.dataset.fit; }
    // un nom long prend une lettre plus petite (jusqu'à 14 px), puis des points de suspension ; mesuré une fois la carte visible
    // (une fenêtre ouverte par-dessus la cache, ou la police pas encore chargée : on attend)
    if (vName.dataset.fit === undefined && vName.clientWidth > 0 && (document.fonts?.status ?? 'loaded') === 'loaded') {
      vName.dataset.fit = '1';
      vName.style.fontSize = '';
      let px = parseFloat(getComputedStyle(vName).fontSize) || 24;
      while (vName.scrollWidth > vName.clientWidth && px > 14) { px -= 1; vName.style.fontSize = `${px}px`; }
    }
    // le logo de la carte du village change avec l'âge (picto et teinte du fond)
    const logo = $('#vLogo');
    if (logo.dataset.a !== String(sim.age)) {
      logo.innerHTML = hudPic(AGE_PIC[sim.age] ?? AGE_PIC[0], 34); logo.dataset.a = String(sim.age); logo.className = `vLogo age${sim.age}`;
      // l'image ne paraît qu'une fois chargée ; si elle n'arrive pas (réseau, ancien cache après un déploiement), elle est redemandée
      // une fois, puis l'emblème de l'âge au trait la remplace : jamais l'icône d'image cassée du navigateur (l'auteur l'a vue au
      // Médiéval, nov. 2026, dans Chrome)
      const img = logo.querySelector('img');
      if (img && !(img.complete && img.naturalWidth)) {
        img.style.visibility = 'hidden';
        img.onload = () => { img.style.visibility = ''; };
        img.onerror = () => {
          if (!img.dataset.retry) { img.dataset.retry = '1'; img.src = `${img.getAttribute('src')}?r=${Date.now()}`; return; }
          img.replaceWith(Object.assign(document.createElement('span'), { className: 'vLogoAlt', innerHTML: ic(AGE_SVG[sim.age] ?? 'campfire', 26, 2) }));
        };
      }
    }
    $('#ageSub').textContent = AGES[sim.age].tagline;
    const ap = sim.ageProgress(), pct = ap ? Math.floor(ap.ratio * 100) : 100, sb = this.host.world.sandbox;
    $('#agePanel').classList.toggle('sandbox', sb);
    $('#agePanel').title = tr(sb ? 'Choisir l’âge du village' : "Voir ce qu'il faut pour l'âge suivant");
    $('#ageBar').style.width = `${pct}%`;
    $('#agePanel').classList.toggle('ready', pct >= 100);
    // où en est l'âge : le pourcentage, l'âge visé et les conditions remplies (le détail s'ouvre d'un clic)
    const met = ap ? ap.items.filter((i) => i.have >= i.need).length : 0;
    const next = sb ? `<span>${ic('palette', 13, 2)} ${tr('Bac à sable')}</span><span>${tr('Changer d’âge ▾')}</span>` : ap ? `<span>${tr('Vers {age}', { age: AGES[ap.next].name })}</span><span>${tr('{met}/{n} conditions ▾', { met, n: ap.items.length })}</span>` : `<span>${tr('Dernier âge atteint')}</span>`;
    $('#agePct').textContent = ap ? pctText(pct) : '';
    if ($('#ageNext').dataset.v !== next) { $('#ageNext').innerHTML = next; $('#ageNext').dataset.v = next; }
    // tout est réuni : un bouton pour passer à l'âge suivant (ce n'est plus automatique)
    const go = $('#ageGo'), ready = !!ap && sim.ready, label = ap ? `${ic('up', 15, 2.4)} ${tr('Passer à : {age}', { age: AGES[ap.next].name })}` : '';
    go.hidden = !ready;
    if (ready && go.dataset.v !== label) { go.innerHTML = label; go.dataset.v = label; go.title = tr('Toutes les conditions sont réunies : passer à l’âge suivant ({age})', { age: AGES[ap!.next].name }); }
    // au bac à sable, le panneau liste les âges : un clic y mène, vers l'avant comme vers l'arrière
    const sbReq = sb ? `<b>${tr('Changer d’âge : sans condition')}</b>${AGES.map((a, i) => `<button type="button" class="ageSet${i === sim.age ? ' now' : ''}" data-setage="${i}">${a.name}<small>${a.tagline}</small></button>`).join('')}` : null;
    // chaque condition porte son geste (`ageGo`) : un bâtiment, une expédition (son identifiant) ou une fiche
    const goAttr = (i: (typeof ap & {})['items'][number]) => {
      const g = ageGo(i);
      return 'kind' in g ? ` data-kind="${g.kind}" title="${sim.whereOf(g.kind)} ${tr('— cliquer pour le bâtir')}"` : 'mission' in g ? ` data-m="${g.mission}" title="${tr('Cliquer pour voir l’expédition')}"` : ` data-req="${g.req}" title="${tr('Cliquer pour savoir comment l’obtenir')}"`;
    };
    // (en tête, pour l'écran allégé dont la barre ne garde que l'âge et sa jauge : le nom de l'île, le pourcentage, les
    // conditions remplies ; caché sinon, la carte du village le dit déjà)
    const isle = this.host.world.isleName.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const reqHead = `<div class="rqHead"><b>${isle}</b><em>${ap ? `${pctText(pct)} · ${tr('{met}/{n} conditions', { met, n: ap.items.length })}` : ''}</em></div>`;
    const reqHtml = sbReq ?? (ap
      ? `${reqHead}<b>${tr('Vers : {age}', { age: AGES[ap.next].name })}</b>` + ap.items.map((i) => `<span class="${i.have >= i.need ? 'ok' : ''} kind"${goAttr(i)}>${i.have >= i.need ? '✓' : '•'} ${i.mission ? tr('expédition « {title} »', { title: tr(i.mission) }) : tr(i.label)}${i.kind ? ` <small>${sim.whereOf(i.kind).replace(/^[^›]*› /, '')}</small>` : ''} <em>${Math.min(i.have, 999)}/${i.need}</em></span>`).join('')
      : reqHead + this.endRoad());
    // réécrite seulement si elle change, et pas sous le doigt : la liste refaite quatre fois par seconde entre l'appui et le
    // relâchement perdait le clic (le nœud appuyé n'existait plus), qui repliait alors la liste sans rien ouvrir
    const reqBox = $('#ageReq');
    if (reqBox.dataset.v !== reqHtml && !reqBox.matches(':active')) { reqBox.innerHTML = reqHtml; reqBox.dataset.v = reqHtml; }
    for (const n of NEEDS) {
      const el = $('#n-' + n.k), need = sim[n.k], housing = n.k === 'housing';
      const fill = housing ? (need.cap > 0 ? Math.min(1, sim.pop / need.cap) : 0) : need.demand <= 0 ? 1 : Math.min(1, need.cap / need.demand);
      $('i', el).style.width = `${Math.round(fill * 100)}%`;
      $('.pv', el).textContent = pctText(Math.round(fill * 100));
      el.classList.toggle('warn', !need.ok && !housing);
      el.classList.toggle('full', !need.ok && housing);
      el.setAttribute('aria-label', housing ? tr('{need} : {pop} habitants pour {cap} places', { need: tr(n.label), pop: Math.floor(sim.pop), cap: need.cap }) : tr('{need} : {cap} pour un besoin de {demand}', { need: tr(n.label), cap: num(need.cap), demand: num(need.demand) }));
    }
    // l'écran allégé : un mot quand tout va bien (« Besoins ✓ »), sinon seuls les besoins qui manquent ; le bouton déplie la
    // liste entière (la sécurité, simple indicateur, n'y paraît qu'alors)
    {
      // (un village plein n'est pas en manque : il attend des places pour grandir, comme le dit le conseil, bleu et non orange)
      const miss = NEEDS.filter((n) => n.k !== 'housing' && !sim[n.k].ok).length, ok = $('#needsOk');
      const v = `${miss}|${getLang()}`;
      if (ok.dataset.v !== v) {
        ok.dataset.v = v;
        ok.innerHTML = miss ? ic('chevDown', 15, 2.4) : `<i class="dot"></i><span>${tr('Besoins')}</span><b class="okv">${ic('check', 11, 3)}</b>`;
        const t = tr(miss ? 'Voir tous les besoins' : 'Tous les besoins sont comblés : voir le détail');
        ok.title = t; ok.setAttribute('aria-label', t);
        $('#needsBox').classList.toggle('allOk', !miss);
        this.fitKey = '';
      }
    }
    this.renderGoals();
    this.fitHud();
    this.showNeedWarn();
    { const s = sim.coverage.share; $('i', $('#n-security')).style.width = `${Math.round(s * 100)}%`; $('.pv', $('#n-security')).textContent = pctText(Math.round(s * 100)); $('#n-security').setAttribute('aria-label', tr('Sécurité : {pct} % des habitations couvertes (pompiers {fire} %, police {police} %)', { pct: Math.round(s * 100), fire: Math.round(sim.coverage.fireShare * 100), police: Math.round(sim.coverage.policeShare * 100) })); }
    // le compteur signale le souci le plus pressant ; le détail est dans la fiche des habitants
    const cs = this.census(), alert = cs.untreated ? tr('{n} sans soins', { n: cs.untreated }) : cs.hungry ? tr(cs.hungry > 1 ? '{n} ont faim' : '{n} a faim', { n: cs.hungry }) : cs.thirsty ? tr(cs.thirsty > 1 ? '{n} ont soif' : '{n} a soif', { n: cs.thirsty })
      : cs.jobless ? tr('{n} sans emploi', { n: cs.jobless }) : cs.injured ? `${cs.injured} ${plural(cs.injured, 'blessé', 'blessés')}` : '';
    // sous le nombre : le souci le plus pressant, sinon ce que le village a gagné (ou perdu) d'habitants la veille
    const day = this.host.time.days;
    if (day !== this.popDay) { if (this.popDay >= 0) this.popDelta = cs.p - this.popPrev; this.popDay = day; this.popPrev = cs.p; }
    const dl = this.popDelta, trend = dl === null ? `<small>${tr('habitants')}</small>` : `<small class="trend ${dl > 0 ? 'up' : dl < 0 ? 'down' : ''}" title="${tr('Depuis hier')}">${dl > 0 ? `▲ +${dl}` : dl < 0 ? `▼ −${-dl}` : `= ${tr('stable')}`}</small>`;
    const popHtml = `${pic('👥', 26)}<span class="pn"><b>${cs.p}</b>${alert ? `<small class="alert">${alert}</small>` : trend}</span>`;
    if ($('#pop').dataset.v !== popHtml) { $('#pop').innerHTML = popHtml; $('#pop').dataset.v = popHtml; }
    if (!$('#census').hidden) this.renderCensus();
    if (this.needOpen) this.renderNeed();
    if (this.resOpen) this.renderRes();
    this.renderMessage();
    const hh = Math.floor(time.hour), mm = Math.floor((time.hour % 1) * 60);
    const wk = WEATHER_ICON[env.weatherKind] && env.weatherK > 0.3 ? ic(WEATHER_ICON[env.weatherKind], 13, 2) : '';
    // le picto de la saison (la lune la nuit), l'heure, la saison et le jour de la partie
    const night = hh >= 21 || hh < 6, sp = hudPic(night ? 'nuit' : SEASON_PIC[time.season], 38);
    // (deux écritures du jour : l'écran allégé, sur une ligne, prend la courte, « Printemps · j. 23 »)
    const clock = `${sp}<span class="time">${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}<small class="dl">${tr('{season}, jour {n}', { season: SEASONS[time.season], n: time.days + 1 })} ${wk}</small><small class="ds">${tr('{season} · j. {n}', { season: SEASONS[time.season], n: time.days + 1 })} ${wk}</small></span>`;
    // le contenu ne change que si l'heure, la saison ou la météo changent (on évite de recréer les icônes à chaque mise à jour)
    if ($('#clock').dataset.v !== clock) { $('#clock').innerHTML = clock; $('#clock').dataset.v = clock; }
    this.syncPause();
    if ($('#bPause').dataset.p !== String(time.paused)) { $('#bPause').innerHTML = ic(time.paused ? 'play' : 'pause', 20, 2.2); $('#bPause').dataset.p = String(time.paused); $('#bPause').classList.toggle('on', time.paused); }
    if ($('#bSpeed').dataset.v !== String(time.speed)) { $('#bSpeed').innerHTML = `${ic('fastForward', 20, 2)}<small>×${time.speed}</small>`; $('#bSpeed').dataset.v = String(time.speed); $('#bSpeed').classList.toggle('on', time.speed > 1); }
    // le bouton du brouillard ne paraît que lorsqu'il y en a
    ($('#bFog') as HTMLButtonElement).hidden = this.host.fogLevel() < 0.15;
    const zone = this.host.underZone();
    if (zone) {
      const zh = zone.startsWith('🔥') ? `${zone}<small>${tr('Le portail ramène sur l’île')}</small>` : `⛏️ ${zone}<small>${tr('Puits de lumière : remonter')}</small>`;
      if ($('#underZone').dataset.v !== zh) { $('#underZone').innerHTML = zh; $('#underZone').dataset.v = zh; }
    }
    this.updateExpeditions();
    this.placeCards();
    this.mini.update();
    this.renderSelection();
    this.renderResources();
    ($('#bUndo') as HTMLButtonElement).disabled = !this.host.tools.undoStack.length;
    ($('#bRedo') as HTMLButtonElement).disabled = !this.host.tools.redoStack.length;
  }

  // ---------------- Habitants ----------------
  /**
   * État des habitants, d'après les besoins du village : la moitié travaille (au travail ou sans emploi), les autres sont
   * enfants ou anciens ; un habitant sur cinq a besoin de soins passé quinze habitants ; ceux qui manquent de nourriture,
   * d'eau ou de bien-être ; les blessés des expéditions au repos et les équipes en route
   */
  private census() {
    const { sim, agents, expeditions: ex } = this.host, p = Math.floor(sim.pop);
    const workers = Math.round(p * 0.5), employed = sim.jobs.demand > 0 ? Math.min(workers, Math.floor(sim.jobs.cap)) : workers;
    const sick = Math.round(sim.health.demand), cared = Math.min(sick, Math.floor(sim.health.cap));
    const short = (n: { cap: number; demand: number }, per: number) => Math.min(p, Math.max(0, Math.ceil((n.demand - n.cap) / per - 1e-6)));
    return {
      p, places: Math.floor(sim.housing.cap), workers, employed, jobless: workers - employed, others: p - workers,
      sick, cared, untreated: sick - cared, injured: agents.injured(), away: ex.active.reduce((n, a) => n + a.party.length, 0),
      hungry: short(sim.food, 1), thirsty: short(sim.water, 1), unhappy: short(sim.joy, 0.3),
    };
  }

  private openCensus() {
    const box = $('#census'), r = $('#pop').getBoundingClientRect();
    box.hidden = false;
    this.renderCensus();
    // sous le compteur, sans sortir de l'écran
    box.style.top = `${Math.round(r.bottom + 8)}px`;
    box.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8, r.left + r.width / 2 - box.offsetWidth / 2)))}px`;
    $('#pop').setAttribute('aria-expanded', 'true');
  }

  private closeCensus() { $('#census').hidden = true; $('#pop').setAttribute('aria-expanded', 'false'); }

  private openNeed(k: NeedId | 'security') {
    this.closeCensus();
    if (k !== 'security') this.host.tools.coverage.set(false);
    this.resOpen = null;
    document.querySelectorAll('.res.open').forEach((el) => el.classList.remove('open'));
    this.needOpen = k;
    const box = $('#needInfo'), r = $('#n-' + k).getBoundingClientRect();
    box.hidden = false;
    box.classList.remove('trade');
    box.dataset.v = '';
    this.renderNeed();
    // sous l'icône du besoin, sans sortir de l'écran
    box.style.top = `${Math.round(r.bottom + 8)}px`;
    box.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8, r.left + r.width / 2 - box.offsetWidth / 2)))}px`;
    document.querySelectorAll('.need').forEach((el) => el.classList.toggle('open', el.id === 'n-' + k));
  }

  /** la fiche d'un stock ou d'un besoin ouverte au survol (elle se referme quand la souris s'en va), pas d'un clic */
  private peek = false;
  private peekT = 0;
  /** au survol : ouvre la fiche, sauf si une autre est déjà gardée ouverte d'un clic */
  private peekAt(open: () => unknown) {
    clearTimeout(this.peekT);
    if ((this.needOpen || this.resOpen) && !this.peek) return;
    this.peek = true;
    open();
    $('#needInfo').classList.add('hover');
  }
  private peekLeave() {
    if (!this.peek) return;
    clearTimeout(this.peekT);
    // (un court délai : la souris passe du stock à sa fiche, juste dessous)
    this.peekT = window.setTimeout(() => { if (this.peek) this.closeNeed(); }, 250);
  }
  /** la fiche ouverte au survol reste ouverte (un clic) */
  private pin() {
    clearTimeout(this.peekT);
    this.peek = false;
    $('#needInfo').classList.remove('hover');
  }

  private closeNeed() {
    clearTimeout(this.peekT);
    this.peek = false;
    $('#needInfo').classList.remove('hover');
    this.needOpen = null;
    this.host.tools.coverage.set(false);
    this.resOpen = null;
    $('#needInfo').hidden = true;
    document.querySelectorAll('.need.open, .res.open').forEach((el) => el.classList.remove('open'));
  }

  /** Ouvre la fiche d'une ressource, sous son stock */
  private openRes(r: Resource) {
    this.closeCensus();
    this.needOpen = null;
    this.host.tools.coverage.set(false);
    document.querySelectorAll('.need.open').forEach((el) => el.classList.remove('open'));
    this.resOpen = r;
    const box = $('#needInfo'), el = $(`#res .res[data-r="${r}"]`);
    box.hidden = false;
    // le comptoir, plus large que les autres fiches
    box.classList.toggle('trade', r === 'gold');
    box.dataset.v = '';
    this.renderRes();
    const b = el.getBoundingClientRect();
    box.style.top = `${Math.round(b.bottom + 8)}px`;
    box.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8, b.left + b.width / 2 - box.offsetWidth / 2)))}px`;
    document.querySelectorAll('#res .res').forEach((x) => x.classList.toggle('open', x === el));
  }

  /** Fiche d'une ressource : stock, production du jour et ses sources, à quoi elle sert, et le bâtiment qui en donnerait plus */
  private renderRes() {
    if (this.resOpen === 'gold') { this.renderTrade(); return; }
    const h = this.host, w = h.world, r = this.resOpen!, meta = RES_META[r], age = h.sim.age;
    // le livre de la ressource : chaque sorte de bâtiment, ce qu'elle produit et ce qu'elle consomme par jour, puis le solde
    const book = ledgerOf(w, r), day = book.net;
    const row = (x: LedgerRow) => `<div class="crow"><span>${KINDS[x.kind].names[Math.max(age, KINDS[x.kind].minAge)]}<i>× ${x.n}</i></span><em class="${x.v < 0 ? 'neg' : ''}">${signed(x.v)}</em></div>`;
    const prod = book.prod.map(row).join('') || `<div class="crow"><span class="none">${tr('Aucun bâtiment n’en produit encore.')}</span></div>`;
    const use = book.use.length ? `<div class="chead">${tr('Consommation')}</div>${book.use.map(row).join('')}` : '';
    const total = book.use.length || book.prod.length > 1 ? `<div class="crow total"><span>${tr('Solde')}</span><em class="${day < 0 ? 'neg' : day > 0 ? 'ok' : ''}">${tr('{n} par jour', { n: signed(day) })}</em></div>` : '';
    // le goulot de l'âge suivant : combien il en faut encore, en combien de jours, et ce que coûte un producteur de plus
    const sh = h.sim.shortages.find((x) => x.res === r);
    const k = meta.kind, lock = this.lockOf(k), name = KINDS[k].names[Math.max(age, KINDS[k].minAge)];
    const html = `
      <h4>${resPic(r, 20)} ${tr(meta.label)}<em class="${sh ? 'warn' : day > 0 ? 'ok' : 'warn'}">${w.unlimited ? '∞' : Math.floor(w[r])}</em></h4>
      <div class="sub">${day ? tr('{sign}{n} par jour', { sign: day > 0 ? '+' : '−', n: num(Math.abs(day)) }) : tr('rien n’en produit pour l’instant')}</div>
      <p class="hint">${tr(meta.use)}</p>
      <div class="src"><div class="chead">${tr('Production par jour')}</div>${prod}${use}${total}</div>
      ${sh ? `<p class="hint warn">${shortText(w, age, sh, true)}</p>` : `<p class="hint ${day > 0 ? 'ok' : 'warn'}">${tr(meta.more)}</p>`}
      ${lock ? `<p class="hint warn">${pic('🔒', 16)} ${lock}</p>` : `<button class="primary" data-kind="${k}" title="${h.sim.whereOf(k)}">${ic('hammer', 15, 2.2)} ${tr('Bâtir « {name} »', { name })}</button>`}
`;
    const box = $('#needInfo');
    if (box.dataset.v !== html) { box.innerHTML = html; box.dataset.v = html; }
  }

  /** lot du comptoir : on échange 1 or à la fois, ou 10 */
  private tradeLot = 1;
  /**
   * Comptoir des voisins (la fiche de l'or) : pour chaque ressource, son cours du moment (la saturation des ventes le fait
   * baisser, il remonte chaque jour), un bouton pour en vendre contre de l'or, un autre pour en acheter
   */
  /** La saturation d'un or vendu (la halle des échanges de la concession la divise par deux) */
  private satStep() { return peacePerks(this.host.world, this.host.sim.counts).trade ? HALL_STEP : SAT_STEP; }
  private renderTrade() {
    const h = this.host, w = h.world, lot = this.tradeLot, inf = w.unlimited, age = h.sim.age;
    if (!h.sim.tradeOpen) { this.renderTradeShut(); return; }
    const label: Record<TradeRes, string> = { wood: tr('Bois'), stone: tr('Pierre'), ore: tr('Minerai'), brick: tr('Briques'), fuel: tr('Carburant') };
    // les ressources que le village connaît déjà (comme la barre des stocks : briques à l'âge industriel, carburant au moderne)
    const shown = TRADE_RES.filter((r) => (r !== 'brick' || age >= 3 || w.brick >= 1) && (r !== 'fuel' || age >= 4 || w.fuel >= 1));
    const rows = shown.map((r) => {
      const sat = w.trade.sat[r] ?? 0, q = sellQuote(r, sat, lot, this.satStep()), get = buyQuote(r, lot);
      const canSell = inf || w[r] + 1e-9 >= q.cost, canBuy = inf || w.gold + 1e-9 >= lot;
      const drop = Math.round(sat * 100);
      return `<div class="trow"><span class="tn">${resPic(r, 22)}<span>${label[r]}<small>${inf ? '∞' : Math.floor(w[r])}${drop ? ` · <b class="warn">${tr('cours −{n} %', { n: drop })}</b>` : ''}</small></span></span>`
        + `<button data-sell="${r}" ${canSell ? '' : 'disabled'} title="${tr('Vendre {n} {res} contre {g} or', { n: num(q.cost), res: label[r].toLowerCase(), g: lot })}">${tr('Vendre')}<small>${num(q.cost)} → ${lot} ${pic('💰', 14)}</small></button>`
        + `<button data-buy="${r}" ${canBuy ? '' : 'disabled'} title="${tr('Acheter {n} {res} pour {g} or', { n: get, res: label[r].toLowerCase(), g: lot })}">${tr('Acheter')}<small>${lot} ${pic('💰', 14)} → ${get}</small></button></div>`;
    }).join('');
    const html = `
      <h4>${pic('💰', 20)} ${tr('Les voisins')}<em class="ok">${inf ? '∞' : Math.floor(w.gold)}</em></h4>
      <div class="sub">${tr('comptoir d’échange · or en réserve')}</div>
      <p class="hint">${tr('L’or ne vient que de l’échange avec le peuple allié. Il sert à passer les âges. Chaque vente fait baisser le cours de la ressource (jusqu’à −{max} %), puis il remonte de {up} % par jour.', { max: Math.round(SAT_MAX * 100), up: Math.round(SAT_RECOVER * 100) })}</p>
      <div class="tlot">${tr('Par lot de')} <button data-lot="1" class="${lot === 1 ? 'on' : ''}">1 ${pic('💰', 14)}</button><button data-lot="10" class="${lot === 10 ? 'on' : ''}">10 ${pic('💰', 14)}</button></div>
      <div class="tradeRows">${rows}</div>
      ${w.trade.legacy ? `<p class="hint">${tr('Bâtissez un comptoir sur l’île de votre allié : l’échange passera par lui.')}</p>` : ''}`;
    const box = $('#needInfo');
    if (box.dataset.v !== html) { box.innerHTML = html; box.dataset.v = html; }
  }

  /** Le comptoir n'est pas encore bâti : la fiche de l'or dit où le bâtir (ou de choisir d'abord l'allié) */
  private renderTradeShut() {
    const h = this.host, w = h.world, ally = w.diplo.ally, name = h.sim.nameOf('tradepost'), lock = this.lockOf('tradepost');
    const why = !ally ? tr('Choisissez d’abord votre allié parmi les deux peuples des îles : l’échange se fait chez lui.')
      : tr('Pas encore de comptoir : bâtissez « {name} » sur {isle}, hors de leur ville. On y vendra nos matériaux contre de l’or.', { name, isle: isleName(ally) });
    const html = `
      <h4>${pic('💰', 20)} ${tr('Les voisins')}<em class="warn">${Math.floor(w.gold)}</em></h4>
      <div class="sub">${tr('comptoir d’échange · or en réserve')}</div>
      <p class="hint">${tr('L’or ne vient que de l’échange avec le peuple allié. Il sert à passer les âges.')}</p>
      <p class="hint warn">${why}</p>
      ${ally ? `<div class="row2"><button data-ally="1">${ic('eye', 15, 2.2)} ${tr('Voir l’île alliée')}</button>${lock ? '' : `<button class="primary" data-kind="tradepost">${ic('hammer', 15, 2.2)} ${tr('Bâtir « {name} »', { name })}</button>`}</div>` : ''}`;
    const box = $('#needInfo');
    if (box.dataset.v !== html) { box.innerHTML = html; box.dataset.v = html; }
  }

  /** Un clic au comptoir : changer de lot, vendre ou acheter ; true s'il s'agissait du comptoir */
  private tradeClick(t: HTMLElement) {
    // le comptoir à bâtir : la vue va sur l'île alliée (et, pour « Bâtir », le comptoir est pris en main par `data-kind`)
    if (t.closest('[data-ally], [data-kind="tradepost"]')) { this.host.goAlly?.(); if (t.closest('[data-ally]')) { this.host.audio.sfxClick(); return true; } return false; }
    if (!this.host.sim.tradeOpen) return false;
    const b = t.closest<HTMLButtonElement>('button[data-lot], button[data-sell], button[data-buy]');
    if (!b || b.disabled) return !!b;
    const w = this.host.world, d = b.dataset;
    if (d.lot) { this.tradeLot = +d.lot; this.host.audio.sfxClick(); }
    else {
      const r = (d.sell ?? d.buy) as TradeRes, done = d.sell ? sell(w, r, this.tradeLot, this.satStep()) : buy(w, r, this.tradeLot);
      if (done) { this.host.audio.sfxClick(); this.resKey = ''; this.renderResources(); }
    }
    this.renderTrade();
    return true;
  }

  /**
   * Fiche d'un besoin : disponible / nécessaire (habitants / places pour le logement), la règle, chaque source et son apport,
   * puis ce qui manque et le bâtiment qui le comblerait, à bâtir d'un clic
   */
  private renderNeed() {
    if (this.needOpen === 'security') { this.renderSecurity(); return; }
    const { sim } = this.host, k = this.needOpen!, meta = NEEDS.find((n) => n.k === k)!, d = sim.needDetail(k), p = Math.floor(sim.pop);
    const housing = k === 'housing', have = housing ? p : d.cap, want = housing ? d.cap : d.demand;
    const fill = housing ? (d.cap > 0 ? Math.min(1, p / d.cap) : 0) : d.demand <= 0 ? 1 : Math.min(1, d.cap / d.demand);
    const state = d.ok ? 'ok' : housing ? 'full' : 'warn', name = sim.nameOf(d.kind), where = sim.whereOf(d.kind);
    const rows = d.rows.length
      ? d.rows.map((r) => `<div class="crow"><span>${r.label}${r.n ? `<i>× ${r.n}</i>` : ''}</span><em class="${r.v < 0 ? 'neg' : ''}">${r.v < 0 ? '−' : '+'}${num(Math.abs(r.v))}</em></div>`).join('')
      : `<div class="crow"><span class="none">${tr('Rien ne le fournit encore.')}</span></div>`;
    let tip: string;
    if (housing) tip = d.ok ? tr(d.cap - p >= 2 ? '{n} places libres : le village va grandir.' : '{n} place libre : le village va grandir.', { n: Math.floor(d.cap - p) }) : tr('Le village est plein : chaque « {name} » de plus loge {per} habitants.', { name, per: d.per });
    else if (d.ok) tip = d.demand > 0 ? tr('Comblé, avec {n} d’avance.', { n: num(d.cap - d.demand) }) : tr('Pas encore demandé : le village est trop petit.');
    else {
      const miss = d.demand - d.cap, n = d.per > 0 ? Math.ceil(miss / d.per - 1e-6) : 0;
      tip = !n ? tr('Il manque {miss}.', { miss: num(miss) }) : n > 1 ? tr('Il manque {miss} : {n} × « {name} » (+{per} chacun) suffiraient.', { miss: num(miss), n, name, per: d.per }) : tr('Il manque {miss} : « {name} » (+{per} chacun) suffirait.', { miss: num(miss), name, per: d.per });
    }
    const html = `
      <h4>${ic(meta.icon, 18, 2)} ${tr(meta.label)}<em class="${state}">${num(have)} / ${num(want)}</em></h4>
      <div class="sub">${tr(housing ? 'habitants / places' : 'disponible / nécessaire')}</div>
      <div class="bar ${state}"><i style="width:${Math.round(fill * 100)}%"></i></div>
      <p class="hint">${tr(NEED_RULE[k])}</p>
      <div class="src">${rows}</div>
      <div class="crow total"><span>${tr(housing ? 'Places' : 'Disponible')}</span><em>${num(d.cap)}</em></div>
      <div class="crow total"><span>${housing ? tr('Habitants') : tr('Nécessaire ({p} habitants)', { p })}</span><em>${num(housing ? p : d.demand)}</em></div>
      <p class="hint ${state}">${tip}</p>
      ${d.per > 0 && (!d.ok || housing) ? `<button class="primary" data-kind="${d.kind}" title="${where}">${ic('hammer', 15, 2.2)} ${tr('Bâtir « {name} »', { name })}</button>` : ''}`;
    const box = $('#needInfo');
    if (box.dataset.v !== html) { box.innerHTML = html; box.dataset.v = html; }
  }

  /** Fiche du besoin Sécurité : couverture des pompiers et de la police, rayons, conseils, et le bouton de surbrillance sur la carte */
  private renderSecurity() {
    const { sim, world } = this.host, c = sim.coverage, pc = (v: number) => pctText(Math.round(v * 100));
    const all = [...world.buildings.values()], on = this.host.tools.coverage.active;
    const state = c.share >= 0.8 ? 'ok' : c.share >= 0.4 ? 'full' : 'warn';
    const tips = coverageTips(c, all, sim.age);
    const row = (icon: string, label: string, v: string, note = '') => `<div class="crow"><b>${ic(icon, 16, 2)}</b><span>${tr(label)}${note ? `<small>${note}</small>` : ''}</span><em>${v}</em></div>`;
    const html = `
      <h4>${ic(SECURITY_NEED.icon, 18, 2)} ${tr(SECURITY_NEED.label)}<em class="${state}">${pc(c.share)}</em></h4>
      <div class="sub">${tr('couverture moyenne des habitations')}</div>
      <div class="bar ${state}"><i style="width:${Math.round(c.share * 100)}%"></i></div>
      <p class="hint">${tr('Pompiers : {fire} cases autour de la caserne. Police : {p1} à {p5} cases selon l’âge du poste. Un bonus, pas une obligation : +{joy} de bien-être par maison protégée par les deux (jusqu’à +{max}).', { fire: FIRE_RANGE, p1: policeRange(1), p5: policeRange(5), joy: COVER_JOY, max: COVER_JOY_MAX })}</p>
      <div class="src">
        ${row('flame', 'Couverture des pompiers', pc(c.fireShare), nplural(c.stations.fire.length, 'caserne de pompiers', 'casernes de pompiers'))}
        ${row('shield', 'Couverture de la police', pc(c.policeShare), nplural(c.stations.police.length, 'poste', 'postes'))}
      </div>
      <div class="crow total"><span>${tr('Maisons protégées par les deux')}</span><em>${c.both} / ${c.homes}</em></div>
      <div class="crow total"><span>${tr('Postes de sécurité')}</span><em>${c.stations.fire.length + c.stations.police.length}</em></div>
      ${tips.length ? `<p class="hint ${state}">${tips.join(' ')}</p>` : `<p class="hint ok">${tr('Tout le village est bien protégé !')}</p>`}
      <button class="primary" data-cover title="${tr('Cercles verts : portée des postes. Rond orange : maison mal protégée. Rond rouge : aucune protection.')}">${ic('eye', 15, 2.2)} ${tr(on ? 'Masquer la carte de couverture' : 'Montrer sur la carte')}</button>
      <div class="row2"><button data-kind="fire">${ic('hammer', 14, 2.2)} ${sim.nameOf('fire')}</button><button data-kind="police">${ic('hammer', 14, 2.2)} ${sim.nameOf('police')}</button></div>`;
    const box = $('#needInfo');
    if (box.dataset.v !== html) { box.innerHTML = html; box.dataset.v = html; }
  }

  /** Fiche des habitants : répartition en barre, puis le détail, et ce qui manquerait */
  private renderCensus() {
    const c = this.census(), p = Math.max(1, c.p);
    const seg = (n: number, cls: string, label: string) => (n > 0 ? `<i class="${cls}" style="width:${(n / p) * 100}%" title="${tr('{label} : {n}', { label: tr(label), n })}"></i>` : '');
    const row = (icon: string, label: string, n: number, cls = '', note = '') => `<div class="crow ${cls}"><b>${ic(icon, 16, 2)}</b><span>${tr(label)}${note ? `<small>${note}</small>` : ''}</span><em>${n}</em></div>`;
    const tips: string[] = [];
    if (c.jobless) tips.push(tr('Un atelier, une ferme ou un moulin de plus donnerait du travail.'));
    if (c.untreated) tips.push(tr('Un lieu de soins soignerait les malades.'));
    if (c.hungry) tips.push(tr('Une ferme, un champ ou un ponton de pêche nourrirait tout le monde.'));
    if (c.thirsty) tips.push(tr('Un point d’eau ou un puits de plus abreuverait tout le monde.'));
    if (c.unhappy) tips.push(tr('Un lieu de rencontre, une arène ou un lieu de culte rendrait le village plus heureux.'));
    // ce qui retient les nouveaux venus (Chloé, v6 : « je n'ai pas compris ce qui manquait pour que des gens arrivent »)
    const sim = this.host.sim, g = sim.growth();
    const short = (k: NeedId) => Math.max(1, Math.ceil(sim[k].demand - sim[k].cap - 1e-6));
    const lack = g.missing.map((k) => (k === 'jobs' ? tr('du travail ({n})', { n: nplural(short('jobs'), 'emploi', 'emplois') }) : k === 'health' ? tr('des soins ({n})', { n: nplural(short('health'), 'place', 'places') }) : missingText([k]))).join(', ');
    // (un manque d'abord, s'il y en a : bâtir des maisons n'y changerait rien ; le village plein ensuite)
    const full = g.full ? `<p class="cgrow full">${ic('house', 15, 2)} ${tr('Village plein : bâtissez des maisons pour accueillir de nouveaux habitants.')}</p>` : '';
    const grow = g.missing.length ? `<p class="cgrow warn">${ic('alert', 15, 2)} ${tr('Personne de nouveau n’arrive : il manque {list}.', { list: lack })}</p>${full}`
      : g.full ? full
        : `<p class="cgrow ok">${ic('spring', 15, 2)} ${tr('De nouveaux habitants arrivent : le prochain est en route.')}${g.slow ? ` ${tr('(Plus lentement : le village se remet d’un manque.)')}` : ''}</p><div class="gbar"><i style="width:${Math.round(g.progress * 100)}%"></i></div>`;
    const html = `
      <h4>${ic('houses', 18, 2)} ${nplural(c.p, 'habitant', 'habitants')} <small>${tr('pour {n} places', { n: c.places })}${c.away ? tr(', dont {n} en expédition', { n: c.away }) : ''}</small></h4>
      ${grow}
      <div class="cbar">${seg(c.employed, 'work', 'Au travail')}${seg(c.jobless, 'idle', 'Sans emploi')}${seg(c.others, 'kids', 'Enfants et anciens')}</div>
      ${row('hammer', 'Au travail', c.employed)}
      ${row('alert', 'Sans emploi', c.jobless, c.jobless ? 'warn' : '')}
      ${row('smile', 'Enfants et anciens', c.others)}
      ${row('health', 'Malades soignés', c.cared, '', c.sick ? tr('sur {n} à soigner', { n: c.sick }) : tr('aucun malade pour l’instant'))}
      ${c.untreated ? row('health', 'Malades sans soins', c.untreated, 'warn') : ''}
      ${row('kit', 'Blessés au repos', c.injured, c.injured ? 'note' : '', c.injured ? tr('au retour d’une expédition') : '')}
      ${row('compass', 'En expédition', c.away, '', c.away ? tr('déjà comptés parmi les habitants ci-dessus') : '')}
      ${c.hungry ? row('bread', 'Ont faim', c.hungry, 'warn') : ''}
      ${c.thirsty ? row('drop', 'Ont soif', c.thirsty, 'warn') : ''}
      ${c.unhappy ? row('smile', 'Mécontents', c.unhappy, 'warn') : ''}
      ${tips.length ? `<p class="hint">${tips.join(' ')}</p>` : `<p class="hint ok">${tr('Tout le monde va bien.')}</p>`}`;
    const box = $('#census');
    if (box.dataset.v !== html) { box.innerHTML = html; box.dataset.v = html; }
  }

  // ---------------- Expéditions ----------------
  /** Cartes des équipes en route (à gauche), compteur du bouton 🧭, signal de l'expédition obligatoire */
  private updateExpeditions() {
    const h = this.host, ex = h.expeditions, list = $('#expList');
    // juste sous la barre du haut, quelle que soit sa hauteur (elle passe sur plusieurs lignes sur un téléphone)
    // (le bas des panneaux du haut, sans la colonne de gauche qui descend avec le conseil et les messages)
    const hudB = Math.round(Math.max(...['#agePanel', '#resPanel', '#needsBox', '#goalBox', '#hudR', '#ageGo:not([hidden])'].map((q) => this.root.querySelector(q)?.getBoundingClientRect().bottom ?? 0)));
    // les cartes des équipes : à gauche, sous la barre du haut ; la liste des conditions d'âge
    // dépliée : elles passent dessous au lieu d'être cachées
    const req = $('#agePanel').classList.contains('open') ? $('#ageReq').getBoundingClientRect().bottom : 0;
    // (sur un écran étroit, le conseil du moment s'étale jusqu'au bord gauche : la colonne passe dessous, pastille des aides
    // comprise, au lieu de le chevaucher)
    // (toutes les mesures d'abord, les écritures ensuite : lire une taille après avoir écrit un style refait toute la mise en
    // page, et ces lectures suivent souvent l'ouverture d'une popup, dont la mise en page se payait alors deux fois)
    const notes = $('#hudNotes').getBoundingClientRect(), lr = list.getBoundingClientRect();
    const dm = $('#dockRow').getBoundingClientRect(), sc = $('#selCard').getBoundingClientRect();
    const under = notes.height > 0 && notes.left < lr.right && notes.right > lr.left ? notes.bottom - 2 : 0;
    list.style.top = `${Math.round(Math.max(hudB, req, under)) + 8}px`;
    // le bas du bandeau du haut (une ou deux lignes selon la largeur) : les fiches et les messages se posent dessous
    if (this.root.style.getPropertyValue('--hudB') !== `${hudB}px`) this.root.style.setProperty('--hudB', `${hudB}px`);
    // dans les Enfers, la frise du haut monte au niveau des boutons de droite quand elle tient (les ressources et les besoins y
    // sont cachés) ; sur l'île, le bandeau des attaques reste sous la barre du haut, qui garde ses besoins
    const ts = document.querySelector<HTMLElement>('#troopBar .tstate');
    if (ts && document.body.classList.contains('commanding') && document.body.classList.contains('hell')) {
      const w = ts.offsetWidth, res = $('#resPanel').getBoundingClientRect(), hr = $('#hudR').getBoundingClientRect();
      // centrée sur l'écran si possible, sinon au milieu de la place libre entre les deux
      const a = (res.width ? res.right : 0) + 12, b = hr.left - 12, fits = b - a >= w;
      const mid = (innerWidth - w) / 2 >= a && (innerWidth + w) / 2 <= b ? innerWidth / 2 : (a + b) / 2;
      document.body.classList.toggle('tsTop', fits);
      if (fits) {
        this.root.style.setProperty('--tsTop', `${Math.round(res.width ? res.top : hr.top)}px`);
        this.root.style.setProperty('--tsX', `${Math.round(mid)}px`);
      }
    } else document.body.classList.remove('tsTop');
    // la hauteur de la barre du bas, quand elle s'étend sous la fiche d'un bâtiment (à droite) : la fiche s'arrête au-dessus
    // et défile plutôt que de passer dessous
    const dockH = dm.height && (!sc.width || dm.right > sc.left) ? Math.max(0, Math.round(innerHeight - dm.top)) : 0;
    if (this.root.style.getPropertyValue('--dockH') !== `${dockH}px`) this.root.style.setProperty('--dockH', `${dockH}px`);
    const live = new Set<number>();
    for (const a of ex.active) {
      live.add(a.id);
      let card = this.expCards.get(a.id);
      if (!card) {
        card = document.createElement('div');
        card.className = 'expCard panel';
        card.innerHTML = `<i class="team"></i><b class="mi"></b><div class="grow"><div class="t"></div><small></small><div class="bar"><i></i></div></div><button class="dec" hidden title="${tr('Une décision vous attend')}" aria-label="${tr('Prendre la décision')}">${ic('alert', 18)}</button><button class="cam" title="${tr('La caméra suit l\'équipe')}" aria-label="${tr('Suivre l\'équipe à la caméra')}">${ic('eye', 18)}</button>`;
        ($('.team', card) as HTMLElement).style.background = hex(TEAM_COLORS[(a.id - 1) % TEAM_COLORS.length]);
        $('.mi', card).textContent = a.m.icon;
        $('.t', card).textContent = a.m.title;
        const id = a.id;
        // l'œil suit l'équipe ; sur l'équipe suivie, il la lâche et ramène la vue au village
        $('.cam', card).onclick = () => { if (eyeClick(h.following, id) === 'home') h.goHome(); else h.follow(id); this.update(); };
        // une équipe qui attend : un clic n'importe où sur sa carte ouvre la décision (sauf l'œil, qui la suit à la caméra)
        card.onclick = (ev) => {
          if ((ev.target as HTMLElement).closest('.cam')) return;
          const e = ex.active.find((x) => x.id === id);
          if (e?.wait) this.showDecision(e);
        };
        list.insertBefore(card, $('#toasts'));
        this.expCards.set(a.id, card);
      }
      $('small', card).textContent = ex.status(a);
      ($('.bar i', card) as HTMLElement).style.width = `${Math.round(ex.progress(a) * 100)}%`;
      $('.cam', card).classList.toggle('active', h.following === a.id);
      ($('.dec', card) as HTMLElement).hidden = !a.wait;
      card.classList.toggle('ask', !!a.wait);
    }
    for (const [id, card] of this.expCards) if (!live.has(id)) { card.remove(); this.expCards.delete(id); }
    // les incidents en cours (incendies, malaises, cambriolages) : une carte chacun, l'œil pour les suivre à la caméra
    const inc = h.incidents(), liveI = new Set<string>();
    for (const i of inc) {
      liveI.add(i.key);
      let card = this.incCards.get(i.key);
      if (!card) {
        card = document.createElement('div');
        card.className = 'expCard panel incident';
        card.innerHTML = `<i class="team"></i><b class="mi"></b><div class="grow"><div class="t"></div><small></small><div class="bar"><i></i></div></div><button class="cam" title="${tr('La caméra suit l\'intervention')}" aria-label="${tr('Suivre l\'intervention à la caméra')}">${ic('eye', 18)}</button>`;
        const key = i.key;
        $('.cam', card).onclick = () => { h.followIncident(h.incidentCam === key ? null : key); this.update(); };
        list.insertBefore(card, $('#toasts'));
        this.incCards.set(i.key, card);
      }
      $('.mi', card).textContent = i.icon;
      $('.t', card).textContent = i.title;
      $('small', card).textContent = i.status;
      ($('.bar i', card) as HTMLElement).style.width = `${Math.round(i.progress * 100)}%`;
      $('.cam', card).classList.toggle('active', h.incidentCam === i.key);
    }
    for (const [key, card] of this.incCards) if (!liveI.has(key)) { card.remove(); this.incCards.delete(key); }
    // la pastille de l'écran allégé : « 2 en route · ⚠ 1 décision » (cachée sans équipe dehors)
    const pill = $<HTMLButtonElement>('#expPill'), nDec = ex.active.filter((a) => a.wait).length;
    const ph = ex.active.length ? `${ic('compass', 15, 2.2)}<span>${tr('{n} en route', { n: ex.active.length })}</span>${nDec ? `<i class="sep">·</i>${pic('⚠', 16)}<span class="dec">${tr(nDec > 1 ? '{n} décisions' : '{n} décision', { n: nDec })}</span>` : ''}<b class="chev">${ic('chevDown', 13, 2.6)}</b>|${getLang()}` : '';
    if (pill.dataset.v !== ph) {
      pill.dataset.v = ph;
      pill.innerHTML = ph.slice(0, ph.lastIndexOf('|'));
      pill.hidden = !ex.active.length;
      pill.classList.toggle('ask', !!nDec);
      const t = tr('Les équipes en route : cliquer pour voir leurs cartes');
      pill.title = t; pill.setAttribute('aria-label', t);
      if (!ex.active.length) { list.classList.remove('open'); pill.setAttribute('aria-expanded', 'false'); }
    }
    const max = ex.slots();
    $('#expBadge').textContent = ex.active.length ? `${ex.active.length}/${max}` : '';
    $('#bExp').classList.toggle('ping', mandatoriesFor(h.sim.age).some((m) => !ex.done(m) && !ex.running(m)));
    // le panneau des peuples : avec l'archipel ; avant, grisé dès l'Antiquité si le monde peut encore s'agrandir (il dit comment)
    const arch = archipelagoOn(h.world), canMeet = h.ways?.().world !== 'none';
    const pb = $('#bPeoples');
    pb.style.display = arch || (canMeet && h.sim.age >= 1 && !h.world.sandbox) ? '' : 'none';
    pb.classList.toggle('off', !arch);
    // les Enfers : le portail ouvert (décision de l'auteur, 22 nov. 2026 : l'arche de l'île et ce bouton y mènent)
    $('#bHell').style.display = h.hellOpen?.() ? '' : 'none';
    this.offerPending();
  }

  /** Précharge au repos les images des fenêtres, et celles des expéditions de l'âge en cours (bandeau, illustrations) */
  preloadArt() {
    const age = Math.max(0, Math.min(5, this.host.sim.age));
    const ms = this.host.expeditions.list(age).filter((m) => m.age === age);
    preloadPics([...POPUP_PICS, `./expeditions/banniere-${age}.webp`,
      ...ms.map((m) => (MISSION_DIO.has(m.id) ? `./expeditions/dio-${m.id}.webp` : missionArt(m).src)).filter((s): s is string => !!s)]);
  }

  openExpeditions(tab: 'missions' | 'gear' | 'rail' | 'ways' | 'blason' = 'missions') {
    const h = this.host, ex = h.expeditions, age = h.sim.age, max = ex.slots(), pop = Math.floor(h.sim.pop);
    // le chemin de fer ne vient qu'à l'âge industriel : avant, pas d'onglet
    const railOn = age >= 3;
    if (tab === 'rail' && !railOn) tab = 'missions';
    // les voies du grand choix (les Enfers, explorer le monde) : une fois le grand choix fait (au bac à sable, tout de suite)
    const ways = h.ways?.() ?? { hell: 'none' as WayState, world: 'none' as WayState };
    const waysOn = waysTabShown(h.world, ways.hell, ways.world);
    if (tab === 'ways' && !waysOn) tab = 'missions';
    // l'équipe suivante : à 20 habitants, avec la maison des explorateurs (dès le Médiéval), puis à 80 habitants
    const nx = ex.nextTeam();
    const next = nx === 'house'
      ? (age >= KINDS.explorers.minAge ? tr('Équipe en plus avec une maison des explorateurs') : tr('Équipe en plus avec une maison des explorateurs, au Médiéval'))
      : nx ? tr('Équipe en plus à {n} habitants (vous : {pop})', { n: nx.pop, pop }) : tr('Équipes au maximum');
    const teams = ex.active.map((a) => `<span class="teamChip"><i style="background:${hex(TEAM_COLORS[(a.id - 1) % TEAM_COLORS.length])}"></i>${pic(a.m.icon, 18)} ${a.m.title} — ${ex.status(a)}</span>`).join('');
    // d'abord les expéditions obligatoires et légendaires qui restent à faire, puis les autres à faire, puis ce qu'on peut refaire
    const rank = (m: Mission) => (ex.done(m) ? 2 : (m.mandatory || isLegendary(m)) && !ex.done(m) ? 0 : 1);
    // une carte par mission : son illustration à gauche ; à droite la pastille et le titre, les étiquettes, une phrase, les
    // pastilles (équipe, durée, risque), les gains, ce qu'elle débloque ou ce qui manque, et un bouton qui ouvre la petite
    // fenêtre de départ (les choix, l'équipement, le risque)
    const card = (m: Mission) => {
      const done = ex.done(m), run = ex.running(m), redo = done, leg = isLegendary(m), mil = isMilitary(m);
      const tags = `${m.mandatory ? `<span class="mtag must">${pic('★', 14)} ${tr('Obligatoire')}</span>` : ''}${leg ? `<span class="mtag leg">${pic('✨', 14)} ${tr('Légendaire')}</span>` : ''}${mil ? `<span class="mtag mil">${pic('⚔️', 14)} ${tr('Militaire')}</span>` : ''}`;
      const label = tr(run ? 'Équipe en route…' : redo ? 'Refaire l’expédition' : 'Envoyer une équipe');
      const art = missionArt(m);
      // une mission réussie passe en carte compacte, dans la grille du bas : « ✓ réussie », vignette, titre, âge et « Refaire »,
      // à hauteur fixe (les grandes cartes réduites débordaient de leur rangée et se chevauchaient : retour de l'auteur, nov. 2026)
      if (redo && !run) {
        const thumb = MISSION_DIO.has(m.id) ? `<img src="./expeditions/dio-${m.id}.webp" alt="" loading="lazy" decoding="async">` : art.src ? `<img class="cover" src="${art.src}" alt="" loading="lazy" decoding="async">` : pic(m.icon, 44);
        const build = m.unlocks && this.canBuildNow(m.unlocks, done) ? `<button class="go bgo" data-kind="${m.unlocks}" title="${tr('Bâtir')} : ${KINDS[m.unlocks].names[Math.max(age, KINDS[m.unlocks].minAge)]}" aria-label="${tr('Bâtir')}">${ic('hammer', 15, 2)}</button>` : '';
        return `<div class="mission done small ${leg ? 'leg' : ''} ${m.mandatory ? 'must' : ''}" data-id="${m.id}" data-leg="${+leg}" data-mil="${+mil}">
          <div class="cthumb ${art.dest}">${thumb}</div>
          <div class="cbody"><span class="cstate">✓ ${tr('réussie')}</span><h4 title="${m.title}">${m.title}</h4><small>${AGES[m.age].name}</small></div>
          ${build}<button class="sendBtn redo" data-send="${m.id}" title="${tr('Refaire l’expédition')}">${ic('restart', 15, 2)} ${tr('Refaire')}</button></div>`;
      }
      return `<div class="mission ${done ? 'done' : ''} ${leg ? 'leg' : ''} ${m.mandatory ? 'must' : ''}" data-id="${m.id}" data-leg="${+leg}" data-mil="${+mil}">
        <div class="mart ${art.dest}${MISSION_DIO.has(m.id) ? ' dio' : ''}">${MISSION_DIO.has(m.id) ? `<img class="dioImg" src="./expeditions/dio-${m.id}.webp" alt="" loading="lazy" decoding="async">` : art.src ? `<img src="${art.src}" alt="" loading="lazy" decoding="async">` : `<b>${pic(m.icon, 96)}</b>`}${done ? `<span class="mstate ok">✓ ${tr('réussie')}</span>` : run ? `<span class="mstate run">${tr('en route…')}</span>` : ''}</div>
        <div class="mbody">
          <div class="mhead"><b class="mbadge">${pic(m.icon, 30)}</b><div class="grow"><h4>${m.title}</h4><small>${AGES[m.age].name}</small></div></div>
          ${tags ? `<div class="mtags">${tags}</div>` : ''}
          <p class="mtext">${splitIntro(m.intro).head}</p>
          ${this.missionPills(m)}
          ${this.boonHtml(m)}
          ${m.unlocks ? `<p class="unlock${this.canBuildNow(m.unlocks, done) ? ' ready' : ''}">${ic(KIND_ICON[m.unlocks], 15, 2)} ${tr(done ? 'A débloqué :' : 'Débloque :')} <b>${KINDS[m.unlocks].names[Math.max(age, KINDS[m.unlocks].minAge)]}</b>${this.canBuildNow(m.unlocks, done) ? `<button class="go bgo" data-kind="${m.unlocks}">${ic('hammer', 14, 2)} ${tr('Bâtir')}</button>` : ''}</p>` : ''}
          ${this.legacyHtml(m, done)}
          ${ex.missing(m).length ? `<p class="req">${this.needsHtml(m, true)}</p>` : ''}
          <button class="sendBtn" data-send="${m.id}" ${run ? 'disabled' : ''}>${SEND_ICON} ${label}</button>
        </div></div>`;
    };
    const sorted = ex.list(age).sort((a, b) => rank(a) - rank(b));
    // les expéditions disponibles, puis la grille des réussies (cartes compactes) sous un intertitre
    const compact = (m: Mission) => ex.done(m) && !ex.running(m), doneList = sorted.filter(compact);
    const cards = sorted.filter((m) => !compact(m)).map(card).join('')
      + (doneList.length ? `<div class="doneBox"><h5 class="doneHead">✓ ${tr('Réussies')} <small>(${doneList.length})</small></h5><div class="doneGrid">${doneList.map(card).join('')}</div></div>` : '');
    const nMil = sorted.filter(isMilitary).length, nLeg = sorted.filter(isLegendary).length;
    // l'en-tête : la rose des vents, le titre et une phrase ; puis une seule barre : les filtres des missions (toutes,
    // militaires, légendaires), et à droite l'équipement et le chemin de fer
    const head = `${EXP_EMBLEM}<span class="exTitle"><span>${tr('Expéditions')}</span><small>${tr('Envoyez des équipes explorer de nouveaux territoires et rapporter des ressources ou des savoir-faire.')}</small></span>`;
    const { ov, close } = modal(this.root, 'expModal', head, `
      <nav class="expNav">
        <button data-tab="missions" data-f="all" class="${tab === 'missions' ? 'on' : ''}">${ic('ex-all', 19, 1.8)}${tr('Toutes')} <small>(${sorted.length})</small></button>
        <button data-f="mil">${ic('ex-mil', 19, 1.8)}${tr('Militaires')} <small>(${nMil})</small></button>
        <button data-f="leg">${ic('ex-leg', 19, 1.8)}${tr('Légendaires')} <small>(${nLeg})</small></button>
        <label class="expFind" ${tab === 'missions' ? '' : 'hidden'}>${ic('search', 15, 2.2)}<input type="search" autocomplete="off" spellcheck="false" placeholder="${tr('Rechercher…')}" aria-label="${tr('Rechercher une expédition')}"></label>
        <span class="grow"></span>
        <button data-tab="gear" class="${tab === 'gear' ? 'on' : ''}">${ic('ex-gear', 19, 1.8)}${tr('Équipement')}</button>
        ${railOn ? `<button data-tab="rail" class="${tab === 'rail' ? 'on' : ''}">${ic('ex-rail', 19, 1.8)}${tr('Chemin de fer')}</button>` : ''}
        ${waysOn ? `<button data-tab="ways" class="${tab === 'ways' ? 'on' : ''}">${ic('compass', 19, 1.8)}${tr('Grands choix')}</button>` : ''}
        <button data-tab="blason" class="${tab === 'blason' ? 'on' : ''}">${ic('flag', 19, 1.8)}${tr('Blason')}</button>
      </nav>
      <section data-sec="missions" ${tab === 'missions' ? '' : 'hidden'}>
        <div class="teams"><div class="row"><b>${ic('team', 16, 2)} ${tr('Équipes en route : {n} / {max}', { n: ex.active.length, max })}</b><span class="grow"></span><small>${next}</small></div>${teams}
          <details class="cdet"><summary>${tr('En savoir plus')}</summary><p class="hint">${tr('Vous les verrez partir, faire leur travail sur place et revenir. Sur place, un imprévu vous demandera de choisir. Chaque âge a au moins une expédition obligatoire (★) pour passer au suivant. En cas d’échec, on peut retenter. L’équipement, une école et un lieu de soins rendent les expéditions plus sûres.')}</p></details></div>
        <div class="missions">${cards}</div>
        <p class="emptyMsg" hidden></p>
      </section>
      <section data-sec="gear" ${tab === 'gear' ? '' : 'hidden'}><div class="arsenal"></div></section>
      ${railOn ? `<section data-sec="rail" ${tab === 'rail' ? '' : 'hidden'}><div class="railBox">${this.railHtml()}</div></section>` : ''}
      ${waysOn ? `<section data-sec="ways" ${tab === 'ways' ? '' : 'hidden'}>${waysHtml(ways, h.conflictWay?.() ?? null)}</section>` : ''}
      <section data-sec="blason" class="blTab" ${tab === 'blason' ? '' : 'hidden'}>
        <div class="blHead"><div><b>${tr('Le blason du village')}</b><small>${tr('Il flotte sur vos tours, vos navires et vos bannières, et vos troupes en portent les couleurs.')}</small></div><button type="button" data-rand>${ic('dice', 16, 2)}${tr('Au hasard')}</button></div>
        ${blasonPickerHtml()}
      </section>`);    // le paysage de l'en-tête suit l'âge du village (public/expeditions/banniere-{âge}.webp)
    // l'onglet Blason : chaque clic change le blason du village (sauvé, tout le jeu se teint aussitôt)
    bindBlasonPicker($('[data-sec="blason"]', ov), h.world.blason, (b) => h.setBlason(b), { name: h.world.isleName, change: (n) => h.setIsleName(n) });
    $('.expModal', ov).style.setProperty('--exp-banner', `url(./expeditions/banniere-${Math.max(0, Math.min(5, age))}.webp)`);

    // la barre : un filtre montre les missions (toutes, militaires, légendaires), l'équipement et le chemin de fer leur section
    // le filtre en cours et la recherche (le titre de la mission, en français comme en anglais, sans accents)
    let f = 'all';
    const find = $<HTMLInputElement>('.expFind input', ov);
    const filter = () => {
      const q = find.value.trim();
      let shown = 0;
      ov.querySelectorAll<HTMLElement>('.mission').forEach((el) => {
        const m = MISSIONS.find((x) => x.id === el.dataset.id);
        el.hidden = (f === 'mil' ? el.dataset.mil !== '1' : f === 'leg' ? el.dataset.leg !== '1' : false) || (!!q && !!m && !matches(q, [...bothOf(m, 'title'), ...bothOf(AGES[m.age], 'name')]));
        if (!el.hidden) shown++;
      });
      // l'intertitre et la grille des réussies disparaissent quand le filtre n'en garde aucune
      const box = ov.querySelector<HTMLElement>('.doneBox');
      if (box) { const n = box.querySelectorAll('.mission:not([hidden])').length; box.hidden = !n; const c = box.querySelector('.doneHead small'); if (c) c.textContent = `(${n})`; }
      const em = ov.querySelector<HTMLElement>('.emptyMsg');
      if (em) {
        em.hidden = shown > 0;
        em.textContent = q ? tr('Aucune expédition ne répond à « {q} ».', { q })
          : f === 'mil' ? tr('Aucune expédition militaire à cet âge. Les expéditions armées (le loup des bois…) apparaissent au fil des âges : revenez après avoir progressé.')
          : f === 'leg' ? tr('Aucune expédition légendaire à cet âge. Les grands exploits (mammouth, kraken, mégalodon, dragon, JO…) arrivent à des âges précis.')
          : tr('Aucune expédition disponible pour le moment.');
      }
    };
    find.oninput = filter;
    find.onkeydown = (e) => { if (e.key === 'Escape' && find.value) { e.preventDefault(); e.stopPropagation(); find.value = ''; filter(); } };
    ov.querySelectorAll<HTMLButtonElement>('.expNav button').forEach((b) => (b.onclick = () => {
      ov.querySelectorAll<HTMLButtonElement>('.expNav button').forEach((x) => x.classList.toggle('on', x === b));
      const sec = b.dataset.tab ?? 'missions';
      ov.querySelectorAll<HTMLElement>('[data-sec]').forEach((x) => (x.hidden = x.dataset.sec !== sec));
      // (la recherche ne vaut que pour les missions)
      ($('.expFind', ov) as HTMLElement).hidden = sec !== 'missions';
      if (!b.dataset.f) return;
      f = b.dataset.f;
      filter();
    }));
    // l'arsenal se redessine quand la réserve ou la file changent ; la barre de fabrication avance en continu
    let key = '';
    const arsenal = () => {
      if (!ov.isConnected) { clearInterval(iv); return; }
      const st = ex.state, k = `${JSON.stringify(st.gear)}|${st.craft.join()}|${Math.floor(ex.ore)}|${Math.floor(h.world.wood)}|${Math.floor(h.world.stone)}|${ex.active.length}`;
      if (k !== key && !ov.querySelector('.arsenal button:active')) { key = k; this.renderArsenal($('.arsenal', ov) as HTMLElement, () => (key = '')); }
      ov.querySelectorAll<HTMLElement>('.queue .bar i, .cbar i').forEach((bar) => (bar.style.width = `${Math.round(ex.craftProgress() * 100)}%`));
      const rb = ov.querySelector<HTMLElement>('.railBox'), rh = this.railHtml();
      if (rb && rb.dataset.html !== rh) { rb.dataset.html = rh; rb.innerHTML = rh; }
    };
    ov.addEventListener('click', (e) => {
      // « Me guider pas à pas » : la fenêtre se ferme, la bulle reprend la première ligne du début
      if ((e.target as HTMLElement).closest('[data-guide]')) { close(); h.audio.sfxClick(); h.railGuide?.(); return; }
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-train]');
      if (!el) return;
      close();
      h.audio.sfxClick();
      h.followTrain(+el.dataset.train!);
    });
    const iv = setInterval(arsenal, 300);
    arsenal();
    // ce qui manque à une mission : un bâtiment se prend en main (la fenêtre se ferme), une expédition s'amène sous les yeux
    ov.addEventListener('click', (e) => {
      // « + n autres conditions » : le reste se déplie à sa place
      const more = (e.target as HTMLElement).closest<HTMLElement>('.go[data-more]');
      if (more) { h.audio.sfxClick(); more.nextElementSibling?.removeAttribute('hidden'); more.remove(); return; }
      const go = (e.target as HTMLElement).closest<HTMLElement>('.go[data-kind], .go[data-goto]');
      if (!go) return;
      h.audio.sfxClick();
      if (go.dataset.kind) { close(); this.pick(go.dataset.kind as KindId); } else this.gotoMission(go.dataset.goto!);
    });
    // une voie du grand choix : la fenêtre se ferme, la carte de la voie s'ouvre pour confirmer
    ov.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-way]');
      if (!b || b.disabled) return;
      h.audio.sfxClick();
      close();
      h.takeWay?.(b.dataset.way as Way);
    });
    // le conflit des deux îles : la fenêtre se ferme, la carte paix ou guerre s'ouvre (ou la bataille)
    ov.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-conflict]');
      if (!b) return;
      h.audio.sfxClick();
      close();
      h.openDiploChoice?.();
    });
    // « Envoyer une équipe » : la petite fenêtre de départ s'ouvre par-dessus
    ov.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-send]');
      if (!b || b.disabled) return;
      const m = MISSIONS.find((x) => x.id === b.dataset.send);
      if (!m) return;
      h.audio.sfxClick();
      this.openSend(m, ov, close);
    });
  }

  /**
   * La petite fenêtre de départ d'une mission, par-dessus les expéditions : l'intro, puis chaque choix avec tout ce qu'il faut
   * pour décider (habitants, durée, risque, dangers, équipement prêt ou à fabriquer, chevaux, carburant, gains) et son bouton
   * « Partir ». Elle se redessine quand l'équipement ou la réserve changent ; l'équipe partie, tout se ferme
   */
  private openSend(m: Mission, main: HTMLElement, closeMain: () => void) {
    const h = this.host, ex = h.expeditions;
    // la façon de partir choisie (prudent, équilibré, audacieux) : d'avance l'équilibrée, sinon le premier choix possible
    let sel = this.defaultChoice(m);
    const body = () => this.sendHtml(m, sel);
    const head = `${EXP_EMBLEM}<span class="exTitle"><span>${tr('Lancer une expédition')}</span><small>${tr('Envoyez votre équipe explorer de nouveaux territoires.')}</small></span>`;
    const { ov, close } = modal(this.root, 'sendModal', head, `<div class="sendBody">${body()}</div>`, () => clearInterval(iv));
    // le paysage de l'âge du village dans l'en-tête, comme la fenêtre des expéditions
    $('.sendModal', ov).style.setProperty('--exp-banner', `url(./expeditions/banniere-${Math.max(0, Math.min(5, h.sim.age))}.webp)`);
    const root = $('.sendBody', ov);
    // une pièce fabriquée, une équipe partie ou de retour, la réserve qui bouge : les choix se redessinent ; la barre de
    // fabrication avance en continu
    const stamp = () => { const st = ex.state; return `${JSON.stringify(st.gear)}|${st.craft.join()}|${ex.active.length}|${Math.floor(h.world.wood)}|${Math.floor(h.world.stone)}|${Math.floor(ex.ore)}|${Math.floor(h.world.fuel)}|${Math.floor(h.sim.pop)}|${ex.done(m)}`; };
    let key = stamp();
    const tick = () => {
      if (!ov.isConnected) { clearInterval(iv); return; }
      const k = stamp();
      // pas de redessin pendant qu'un bouton est enfoncé : le bouton remplacé sous le doigt perdait le clic ("rien ne se passe")
      if (k !== key && !root.querySelector('button:active')) { key = k; root.innerHTML = body(); }
      ov.querySelectorAll<HTMLElement>('.gnbar i').forEach((i) => (i.style.width = `${Math.round(ex.craftProgress() * 100)}%`));
    };
    const iv = setInterval(tick, 300);
    ov.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      // une autre façon de partir : le panneau de droite se redessine
      const pick = t.closest<HTMLButtonElement>('button[data-pick]');
      if (pick) { sel = +pick.dataset.pick!; this.lastChoice.set(m.id, sel); h.audio.sfxClick(); root.innerHTML = body(); return; }
      if (t.closest('button.sBack')) { h.audio.sfxClick(); close(); return; }
      // l'équipement qui manque : le fabriquer d'ici, ou aller à sa fiche dans l'onglet Équipement
      const mkAll = t.closest<HTMLButtonElement>('button[data-mkall]');
      if (mkAll) {
        const box = mkAll.closest('.gearNeed'), age = h.sim.age;
        let n = 0, last: string | null = null;
        box?.querySelectorAll<HTMLButtonElement>('button[data-mk]').forEach((b) => {
          const id = b.dataset.mk as GearId, g = GEAR_BY[id], left = Number(b.dataset.left ?? 1);
          for (let i = 0; i < left; i++) { if (ex.craft(id, age)) n++; else { last = ex.whyCraft(g, age); break; } }
        });
        // (une partie seulement en fabrication, la file pleine : on dit pourquoi le reste attend ; les barques du kraken
        // restaient en plan sans un mot, testeurs v6)
        if (n) { h.audio.sfxClick(); key = ''; tick(); if (last) this.toast(last); } else this.toast(last ?? tr('Impossible à fabriquer pour l’instant.'));
        return;
      }
      const mk = t.closest<HTMLButtonElement>('button[data-mk]'), gg = t.closest<HTMLButtonElement>('button[data-geargo]');
      if (mk) {
        if (mk.disabled) return;
        const id = mk.dataset.mk as GearId;
        let n = 0;
        for (let i = 0; i < Number(mk.dataset.left ?? 1); i++) { if (ex.craft(id, h.sim.age)) n++; else break; }
        if (n) { h.audio.sfxClick(); key = ''; tick(); } else this.toast(ex.whyCraft(GEAR_BY[id], h.sim.age) ?? tr('Impossible à fabriquer pour l’instant.'));
        return;
      }
      if (gg) {
        h.audio.sfxClick();
        close();
        main.querySelector<HTMLButtonElement>('[data-tab="gear"]')?.click();
        const card = main.querySelector<HTMLElement>(`.gear[data-gear="${gg.dataset.geargo}"]`);
        card?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        card?.classList.remove('flash'); void card?.offsetWidth; card?.classList.add('flash');
        return;
      }
      // ce qui manque à la mission : un bâtiment se prend en main (tout se ferme), une expédition s'amène sous les yeux
      const go = t.closest<HTMLElement>('.go[data-kind], .go[data-goto]');
      if (go) {
        h.audio.sfxClick();
        close();
        if (go.dataset.kind) { closeMain(); this.pick(go.dataset.kind as KindId); } else this.gotoMission(go.dataset.goto!);
        return;
      }
      // « Partir »
      const b = t.closest<HTMLButtonElement>('button.choice[data-m]');
      if (!b || b.disabled) return;
      const ci = +b.dataset.c!, a = ex.start(m, ci, h.sim.age);
      if (!a) {
        // le refus s'affiche dans la fenêtre même (le message du haut passait derrière) et en message
        const why = ex.why(m, m.choices[ci]) ?? ex.lastFail ?? tr('Aucun chemin praticable vers cette destination.');
        this.toast(why);
        let f = ov.querySelector<HTMLElement>('.failMsg');
        if (!f) { f = document.createElement('p'); f.className = 'failMsg'; root.prepend(f); }
        f.textContent = why;
        return;
      }
      this.lastChoice.set(m.id, ci);
      close();
      closeMain();
      h.audio.sfxClick();
      // la caméra suit l'équipe d'office, à la même distance (elle se collait au sol, testeurs v6) ; l'œil de sa carte (à gauche)
      // la lâche ou la reprend de près
      h.follow(a.id, true);
      this.update();
    });
  }

  /** Le choix montré d'avance à l'ouverture de la fenêtre de départ : l'équilibré, sinon le premier qu'on peut faire */
  private defaultChoice(m: Mission) {
    const ex = this.host.expeditions, cs = m.choices, st = choiceStyles(cs);
    const ok = (i: number) => !ex.why(m, cs[i]);
    // la façon de partir choisie la dernière fois pour cette mission (fenêtre refermée, mission ratée qu'on relance)
    const last = this.lastChoice.get(m.id);
    // (sauf si elle est devenue impossible alors qu'une autre ne l'est pas)
    if (last !== undefined && last < cs.length && (ok(last) || !cs.some((_, i) => ok(i)))) return last;
    const bal = st.findIndex((x, i) => x.style === 'balanced' && ok(i));
    if (bal >= 0) return bal;
    // sans équilibrée : la prudente, la première carte affichée (le premier choix des données, souvent l'audacieux, était
    // retenu sans qu'on le voie : le kraken partait en « Trancher ses tentacules », testeurs v6)
    const safe = st.findIndex((x, i) => x.style === 'cautious' && ok(i));
    if (safe >= 0) return safe;
    const first = cs.findIndex((_, i) => ok(i));
    return first >= 0 ? first : 0;
  }
  /** la dernière façon de partir choisie, par mission (le temps de la session) */
  private lastChoice = new Map<string, number>();

  /**
   * La fenêtre de départ : à gauche l'illustration de la mission, son nom et sa phrase ; à droite la façon de partir
   * (prudent / équilibré / audacieux, un sélecteur segmenté), l'équipement nécessaire (une case par pièce : prête, ou « + »
   * qui la fabrique), la durée, le risque, les récompenses ; en bas « Retour », ce qui peut mal tourner (ou pourquoi on
   * ne peut pas partir) et « Lancer l'expédition »
   */
  private sendHtml(m: Mission, sel: number) {
    const h = this.host, ex = h.expeditions, age = h.sim.age, st = ex.state;
    const cs = m.choices, styles = choiceStyles(cs);
    const i = Math.min(sel, cs.length - 1), c = cs[i], done = ex.done(m), run = ex.running(m), redo = done;
    const why = run ? tr('Une équipe est déjà en route.') : ex.why(m, c);
    const pv = ex.preview(c);
    const STYLE: Record<ChoiceStyleKind, string> = { cautious: 'Prudent', balanced: 'Équilibré', bold: 'Audacieux' };
    const EFFECT: Record<ChoiceEffect, string> = { fewerInjuries: 'Moins de blessés', safer: 'Plus sûr', moreRewards: 'Plus de récompenses', riskier: 'Plus risqué' };
    const art = missionArt(m), si = splitIntro(m.intro);
    // la façon de partir (maquette « parchemin déroulé » de l'auteur) : une grande carte par choix, son emblème peint et son
    // nom en ruban, ce qui le distingue, sa phrase, puis sa durée, son risque et ses récompenses ; la carte choisie est dorée
    // (rangées du plus sûr au plus risqué : prudent, équilibré, audacieux)
    const ORDER: Record<string, number> = { cautious: 0, balanced: 1, bold: 2 };
    const EMB: Record<ChoiceStyleKind, string> = { cautious: 'prudent', balanced: 'equilibre', bold: 'audacieux' };
    const order = cs.map((_, k) => k).sort((a, b) => (ORDER[styles[a].style ?? ''] ?? 3) - (ORDER[styles[b].style ?? ''] ?? 3) || a - b);
    const card = (k: number) => {
      const x = cs[k], sk = styles[k].style, name = sk ? tr(STYLE[sk]) : x.label, off = !!ex.why(m, x);
      const px = ex.preview(x), lv = px.risk <= 0.12 ? 'low' : px.risk <= 0.22 ? 'mid' : 'high';
      const wx = done ? redoEffects(x.win) : this.winOf(x), gx = giftChips(wx, 3);
      const phrase = cardPhrase(x.text), text = sk && x.label ? `<b>${x.label}</b>${phrase ? ` — ${phrase}` : ''}` : phrase;
      return `<button type="button" role="radio" data-pick="${k}" class="sCard ${k === i ? 'on' : ''} ${sk ?? ''} ${off ? 'off' : ''}" aria-checked="${k === i}" title="${attr(x.label)}">
        <span class="scHead">${sk ? `<img class="scEmb" src="./expeditions/depart/embleme-${EMB[sk]}.webp" alt="" decoding="async">` : pic(m.icon, 44)}<span class="scName"><b>${name}</b>${styles[k].effect ? `<small>${tr(EFFECT[styles[k].effect!])}</small>` : ''}</span></span>
        ${text ? `<span class="scText">${text}</span>` : ''}
        <span class="scStats"><span class="scBox">${ic('clock', 20, 2)}<span><small>${tr('Durée')}</small><b>${tr(workLabel(x.work))}</b></span></span><span class="scBox scRisk ${lv}" title="${attr(tr('Risque d’échec : {r}', { r: `${riskLabel(px.risk)} (${pct(px.risk)})` }))}">${ic('alert', 20, 2.2)}<span><small>${tr('Risque')}</small><b>${pct(px.risk)}</b></span></span><span class="scBox scGifts"><span><small>${ic('gift', 14, 2)} ${tr('Récompenses')}</small><span class="scG">${gx.map((e) => `<i title="${attr(e.title)}">${pic(e.icon, 24)}${e.n ? `<em>${e.n.replace(/ /g, ' ')}</em>` : ''}</i>`).join('') || `<em>${tr('rien')}</em>`}</span></span></span></span>
      </button>`;
    };
    const cards = `<div class="sCards n${cs.length}" role="radiogroup" aria-label="${tr('Façon de partir')}">${order.map(card).join('')}</div>`;
    // l'équipement : ce que l'équipe emporte de la réserve (prêt), et ce qui manque (à fabriquer d'un clic)
    const gaps = gearGaps(c, st.gear, st.craft, age, (g) => !g.needs || ex.has(g.needs), st.perks);
    const scaled = (g: Gear, n: number) => { const k = gearCost(g, h.world.difficulty); return { wood: k.wood * n, stone: k.stone * n, ore: k.ore * n, fuel: (k.fuel ?? 0) * n }; };
    const ready = GEAR.filter((g) => (pv.take[g.id] ?? 0) > 0).map((g) => `<div class="gslot ok" title="${attr(`${tr(g.name)} ×${pv.take[g.id]} · ${tr('prêt, en réserve')}`)}">${gearPic(g, 46, 30)}<b>×${pv.take[g.id]}</b><i class="gmark">${ic('check', 12, 3)}</i></div>`).join('');
    const missing = gaps.map((g) => {
      const left = g.need - g.have - g.queued, wc = ex.whyCraft(g.gear, age), name = tr(g.need > 1 ? g.gear.plural : g.gear.name);
      if (left <= 0) return `<div class="gslot wait" title="${attr(tr('{name} : en fabrication', { name }))}">${gearPic(g.gear, 46, 30)}<b>×${g.need - g.have}</b><i class="gmark">${ic('clock', 12, 2.6)}</i>${st.craft[0] === g.gear.id ? `<div class="bar gnbar"><i style="width:${Math.round(ex.craftProgress() * 100)}%"></i></div>` : ''}</div>`;
      const price = gearCostLabel(scaled(g.gear, left));
      const tip = wc ?? `${name} : ${tr('protège de : {d}', { d: g.dangers.map((d) => tr(DANGER_NAME[d])).join(', ') })} · ${price ? tr('Fabriquer · {price}', { price }) : tr('Fabriquer')}`;
      return `<button type="button" class="gslot miss" data-mk="${g.gear.id}" data-left="${left}" ${wc ? 'disabled' : ''} title="${attr(tip)}">${gearPic(g.gear, 46, 30)}<b>×${left}</b><i class="gmark">+</i></button>`;
    }).join('');
    const todo = gaps.filter((g) => g.need - g.have - g.queued > 0);
    const total = todo.reduce((t, g) => { const k = scaled(g.gear, g.need - g.have - g.queued); return { wood: t.wood + k.wood, stone: t.stone + k.stone, ore: t.ore + k.ore, fuel: t.fuel + k.fuel }; }, { wood: 0, stone: 0, ore: 0, fuel: 0 });
    const gearNote = todo.length ? `<p class="gnote">${tr('Cliquez sur « + » pour fabriquer ce qui manque.')}${todo.length > 1 ? ` <button type="button" class="mkAll" data-mkall="1">${ic('hammer', 13, 2)} ${gearCostLabel(total) ? tr('Tout fabriquer · {price}', { price: gearCostLabel(total) }) : tr('Tout fabriquer')}</button>` : ''}</p>` : '';
    // la boîte de « Tout fabriquer » doit contenir les boutons des pièces (voir le gestionnaire)
    // l'équipement en une ligne fine sous les cartes : titre, pièces, consigne, nombre d'habitants
    const gearBox = `<div class="sPanel sGear gearNeed sSlim"><span class="sgT">${ic('shield', 20, 2)}<b>${tr('Équipement nécessaire')}</b></span>
      ${ready || missing ? `<div class="gslots">${ready}${missing}</div>${gearNote}` : `<p class="gnote">${tr('Aucun équipement nécessaire : l’équipe part les mains libres.')}</p>`}<small class="sgP">${ic('team', 16, 2)} ${tr('{n} habitants', { n: c.party })}</small></div>`;
    // en bas : pourquoi on ne peut pas partir, sinon ce qui arrive en cas d'échec
    // (un échec coûte une pièce emportée une fois sur deux, voir `Expeditions.finish` : l'aperçu disait « rien », testeur v6)
    const carried = GEAR.some((g) => (pv.take[g.id] ?? 0) > 0);
    const parts = c.lose.length ? [effectSummary(c.lose)] : [];
    if (carried) parts.push(tr('peut-être une pièce d’équipement perdue'));
    const lose = parts.length ? parts.join(' · ') : effectSummary(c.lose);
    const warn = why ?? (this.needsHtml(m) ? '' : lose ? tr('En cas d’échec : {what}', { what: lose }) : tr('Une expédition peut échouer : l’équipement la rend plus sûre.'));
    const needs = ex.missing(m).length ? `<div class="sNeeds req">${this.needsHtml(m)}</div>` : '';
    const L = './expeditions/depart/';
    return `<div class="sScroll">
      <div class="sTop mart ${art.dest}${MISSION_DIO.has(m.id) ? ' dio' : ''}">${MISSION_DIO.has(m.id) ? `<img class="dioImg" src="./expeditions/dio-${m.id}.webp" alt="" decoding="async">` : art.src ? `<img src="${art.src}" alt="" decoding="async">` : `<b>${pic(m.icon, 120)}</b>`}</div>
      <div class="sCap"><h3>${MISSION_DIO.has(m.id) ? '' : pic(m.icon, 28) + ' '}${m.title}</h3><span class="sEraRow"><img class="sLaur" src="${L}laurier-g.webp" alt="" decoding="async"><span class="sEra">${hudPic(AGE_PIC[m.age] ?? AGE_PIC[0], 16)} ${AGES[m.age].name}</span><img class="sLaur" src="${L}laurier-d.webp" alt="" decoding="async"></span><p>${si.head}</p>${this.boonHtml(m)}${redo ? `<small>${ic('restart', 13, 2)} ${tr('Déjà réussie : bonus de {n} jours seulement.', { n: REDO_DAYS })}</small>` : ''}</div>
      ${cards}
      ${gearBox}
    </div>
    ${needs}
    <div class="sFoot">
      <button type="button" class="sBack">${ic('back', 18, 2.2)} ${tr('Retour')}</button>
      <p class="sWarn ${why ? 'block' : ''}">${pic(why ? '⛔' : '🔥', 22)}<span>${warn}</span></p>
      <button class="choice depart sGo" data-m="${m.id}" data-c="${i}" ${why ? 'disabled' : ''}>${SEND_ICON} ${tr('Lancer l’expédition')}</button>
    </div>`;
  }

  /**
   * Chemin de fer : l'en-tête (le train, une phrase), puis une carte par ligne : son paysage (public/expeditions/rail/,
   * cinq illustrations qui tournent selon le numéro de la ligne), sa couleur, son trajet, où en est son train, « Suivre le train »
   */
  private railHtml() {
    const h = this.host, r = h.railway, age = h.sim.age, R = './expeditions/rail/';
    const head = (sub: string) => `<div class="rlTop">${hudPic('train', 58)}<div><h4>${tr('Chemin de fer')}</h4><p>${sub}</p></div></div>`;
    // sous les lignes, une carte en pointillé rappelle comment en tracer une autre (au lieu d'un grand vide)
    // (et propose le guidage pas à pas, celui de la première ligne, pour qui s'y perd)
    const guide = h.world.sandbox ? '' : `<button class="rlGuide" data-guide title="${attr(tr('Une bulle montre chaque geste, des gares au premier train'))}">${ic('bulb', 15, 2)} ${tr('Me guider pas à pas')}</button>`;
    const more = `<div class="rlMore"><span class="rlPlus">+</span><p><b>${tr('Nouvelle ligne :')}</b> ${tr('choisissez une gare, puis « Nouvelle ligne ».')}</p>${guide}</div>`;
    const how = tr('Choisissez une gare d’un clic, puis « Nouvelle ligne », et cliquez dans l’ordre les gares à relier (Entrée pour valider). La voie se pose d’elle-même d’un arrêt à l’autre et un train fait la navette : il prend et dépose des voyageurs aux gares. Un train de marchandises fait produire davantage les ateliers et carrières à côté de ses gares.');
    if (age < 3) return head(tr('Le chemin de fer viendra avec les gares, à l’âge industriel.'));
    if (!h.world.lines.length) return `${head(how)}<p class="hint rlNone">${tr('Aucune ligne pour l’instant : bâtissez deux gares (petite gare, ou la gare centrale).')}</p>${more}`;
    const lines = h.world.lines.map((l) => {
      const tn = r.trains.get(l.id);
      if (!tn) return '';
      const seated = r.seated(tn);
      // les voyageurs arrivés en info-bulle : la carte ne garde que le trajet et la position du train
      // l'îlot de la ligne (cinq dioramas qui tournent selon son numéro), posé à cheval sur le bord gauche comme les missions
      return `<div class="rlCard" title="${tr('Voyageurs arrivés :')} ${tn.carried}"><img class="rlDio" src="${R}dio-${(Math.abs(l.id) % 5) + 1}.webp" alt="" loading="lazy" decoding="async">
        <div class="rlBody"><b>${dot(l.color)}${r.lineLabel(l)}</b><span>${tr('Train :')} ${trainWhere(r, tn)}</span>${seated ? `<em class="rlSeat">${hudPic('equipe', 18)} ${tr('{n} à bord', { n: seated })}</em>` : ''}</div>
        ${tn.why ? '' : `<button class="trainBtn" data-train="${l.id}">${ic('eye', 18, 2)}${tr('Suivre le train')}</button>`}</div>`;
    }).join('');
    return `${head(tr('Choisissez une ligne et suivez le train jusqu’à sa destination.'))}<div class="rlList">${lines}${more}</div>`;
  }

  /** Équipement : réserve, fabrication et file d'attente */
  private renderArsenal(el: HTMLElement, changed: () => void) {
    const h = this.host, ex = h.expeditions, age = h.sim.age, st = ex.state;
    const away = (id: GearId) => ex.active.reduce((n, a) => n + (a.gear[id] ?? 0), 0);
    const per = (g: Gear) => tr(g.per(1) === 1 && g.per(2) === 2 ? 'un par membre' : g.id === 'kit' ? 'une par équipe' : g.per(3) === 1 ? 'une pour trois' : 'une pour deux');
    // seules les pièces de l'âge (ni à venir, ni dépassées) : la caserne fabrique elle-même ce qui manque à ses recrues
    const card = (g: Gear) => {
        const why = ex.whyCraft(g, age), n = st.gear[g.id], out = away(g.id), price = gearCostLabel(gearCost(g, h.world.difficulty));
        // l'objet peint, détouré, posé sur un halo doré en tête de carte ; une pièce pas encore illustrée garde son icône au trait
        // (sans chargement paresseux : la grille se refait à chaque fabrication, et une image paresseuse refaite restait vide
        // un moment, la torche disparaissait après « Fabriquer », testeuse v6)
        const art = GEAR_ART.has(g.id) ? `<img src="./icons/gear/${g.id}.webp" alt="" decoding="sync">` : ic(g.icon, 40, 1.6);
        const crafting = st.craft.filter((x) => x === g.id).length;
        // fabricable : « Fabriquer » en bleu, le prix en info-bulle ; sinon une pilule grise avec le prix
        return `<div class="gear" data-gear="${g.id}" title="${g.desc}">
          <div class="gart${GEAR_ART.has(g.id) ? '' : ' none'}">${art}</div>
          <div class="gbody">
          <div class="ghead"><b class="gname">${g.name}</b><span class="cnt" title="${tr('En réserve')}${crafting ? tr(', en fabrication') : ''}${out ? tr(', en route') : ''}">${n}${crafting ? ` · ${pic('⏳', 14)}${crafting}` : ''}${out ? ` · ${hudPic('boussole', 14)}${out}` : ''}</span></div>
          <small class="gd" title="${g.guards ? DANGER_VS[g.guards] : tr('Utile partout')}${g.also ? tr(' et les {d}', { d: DANGER_NAME[g.also] }) : ''} · ${per(g)}">${hudPic('securite', 16)} ${tr('−{n} % de risque', { n: Math.round(g.cut * 100) })}</small>
          <button data-craft="${g.id}" class="${why ? '' : 'go'}" ${why ? 'disabled' : ''} title="${why ?? (price ? tr('Fabriquer : {t} s, {price}', { t: g.time, price }) : tr('Fabriquer : {t} s', { t: g.time }))}">${why ? hudPic('cadenas', 15) : ic('eq-craft', 16, 1.9)} ${why ? price || tr('Fabriquer') : tr('Fabriquer')}</button>
          ${st.craft[0] === g.id ? `<div class="bar gnbar cbar"><i style="width:${Math.round(ex.craftProgress() * 100)}%"></i></div>` : ''}
          </div>
        </div>`;
    };
    el.innerHTML = `
      <p class="hint" title="${tr('Elle le rapporte au retour (un échec peut en coûter une pièce). Sur place, certaines décisions demandent une corde, une barque ou des armes. Le village fabrique une pièce après l’autre, plus vite avec un atelier.')}">${tr('Chaque équipe emporte le meilleur équipement en réserve.')}</p>
      <div class="gstock"><span>${pic('🪵', 26)}${tr('{n} bois', { n: Math.floor(h.world.wood) })}</span><span>${pic('🪨', 26)}${tr('{n} pierre', { n: Math.floor(h.world.stone) })}</span><span>${pic('⛏', 26)}${tr('{n} minerai', { n: Math.floor(ex.ore) })}</span>${age >= 4 ? `<span title="${tr('Carburant')}">${pic('⛽', 26)}${Math.floor(h.world.fuel)}</span>` : ''}</div>
      <div class="gearGrid">${GEAR.filter((g) => gearCurrent(g, age)).map(card).join('')}</div>
      <h4>${tr('Fabrication')}</h4>
      <div class="queue">${st.craft.length ? st.craft.map((id, i) => `<span class="qi">${gearPic(GEAR_BY[id], 22, 16, 2)}${GEAR_BY[id].name}${i === 0 ? `<i class="bar"><i style="width:${Math.round(ex.craftProgress() * 100)}%"></i></i>` : ''}<button data-cancel="${i}" title="${tr('Annuler')}" aria-label="${tr('Annuler')}">${ic('close', 14, 2)}</button></span>`).join('') : `<small>${tr('Rien en cours.')}</small>`}</div>`;
    el.querySelectorAll<HTMLButtonElement>('[data-craft]').forEach((b) => (b.onclick = () => {
      if (ex.craft(b.dataset.craft as GearId, age)) { h.audio.sfxClick(); changed(); }
    }));
    el.querySelectorAll<HTMLButtonElement>('[data-cancel]').forEach((b) => (b.onclick = () => { ex.cancelCraft(+b.dataset.cancel!); changed(); }));
  }

  /**
   * Imprévu d'une équipe : la fenêtre s'ouvre d'elle-même si rien d'autre n'est ouvert et qu'on n'est pas en train de
   * bâtir (sinon le message et la carte de l'équipe, qui clignote, y mènent)
   */
  expEvent(a: ActiveExpedition) {
    const ev = a.wait;
    const it = this.toast(tr('{icon} « {mission} » : {event} — une décision vous attend (cliquez ici).', { icon: a.m.icon, mission: a.m.title, event: a.wait?.title.toLowerCase() ?? '' }), () => { if (a.wait === ev) this.showDecision(a); });
    if (it && ev) this.waitNotes.set(it.id, { a, ev });
    this.forceDecision(a);
    this.update();
  }

  /** les messages « une décision vous attend » encore justes : leur équipe et l'imprévu (retirés une fois la décision prise) */
  private waitNotes = new Map<number, { a: ActiveExpedition; ev: ExpEvent }>();
  private dropDecided() {
    for (const [id, { a, ev }] of this.waitNotes) if (a.wait !== ev) { this.notifs.retire(id); this.waitNotes.delete(id); }
  }

  /** l'imprévu de chaque équipe dont la fenêtre s'est déjà ouverte (une fois fermée sans choisir, elle ne se rouvre pas d'elle-même) */
  private offered = new WeakMap<ActiveExpedition, ExpEvent>();

  /**
   * Un imprévu dont la fenêtre n'a pas encore pu s'ouvrir (un récit ou un panneau ouvert, un bâtiment en main) : elle s'ouvre
   * dès que la voie est libre, où que soit la caméra et quelle que soit l'équipe suivie
   */
  private offerPending() {
    const h = this.host;
    // une décision en attente passe avant tout : elle écarte ce qui était ouvert et pose le bâtiment en main
    const a = h.expeditions.active.find((e) => e.wait && (this.offered.get(e) !== e.wait || !this.root.querySelector('.decide')));
    if (a) this.forceDecision(a);
  }

  /**
   * Ouvre la décision d'une équipe : les fenêtres ouvertes se ferment (sauf le menu). Pas en plein geste sur la carte (une pose à
   * moitié faite, un clic à l'instant) : elle attend (`offerPending` la rouvre), et l'outil reste en main (testeurs v6 : la
   * fenêtre mangeait le clic de pose et lâchait l'outil)
   */
  private forceDecision(a: ActiveExpedition) {
    if (this.root.querySelector('.decide') || this.host.midGesture()) return;
    this.root.querySelectorAll<HTMLElement & { close?: () => void }>('.overlay').forEach((o) => { if (o.id !== 'menu' && !o.classList.contains('victory')) o.close?.(); });
    this.showDecision(a);
  }

  /** l'état de la pause avant qu'une décision n'arrête le jeu (null : aucune décision ouverte) */
  private pausedFor: boolean | null = null;

  /**
   * Au dernier âge, le panneau des âges montre le chemin vers la fin du jeu : le cosmodrome, la centrale à fusion, puis les
   * trois expéditions spatiales, dans l'ordre (un clic : bâtir, ou l'expédition). « Profitez de votre village » ne vient
   * qu'une fois la colonie fondée (retour de l'auteur, 17 nov. 2026 : le message s'affichait alors qu'il restait des étapes)
   */
  private endRoad() {
    const h = this.host, w = h.world;
    if (w.missionDone(VICTORY)) return tr('Dernier âge atteint, la colonie fondée : profitez de votre village !');
    const has = (k: KindId) => [...w.buildings.values()].some((b) => b.kind === k);
    const row = (ok: boolean, attr: string, text: string) => `<span class="${ok ? 'ok' : ''} kind" ${attr}>${ok ? '✓' : '•'} ${text}</span>`;
    const kind = (k: KindId) => row(has(k), `data-kind="${k}" title="${h.sim.whereOf(k)} ${tr('— cliquer pour le bâtir')}"`, tr('bâtir « {name} »', { name: KINDS[k].names[5] }));
    const exp = (id: string) => { const m = MISSIONS.find((x) => x.id === id)!; return row(w.missionDone(id), `data-m="${id}" title="${tr('Cliquer pour voir l’expédition')}"`, tr('expédition « {title} »', { title: tr(m.title) })); };
    return `<b>${tr('Pour finir le jeu')}</b>${kind('spaceport')}${exp('rocket')}${exp('moon')}${kind('fusion')}${exp(VICTORY)}`;
  }

  /**
   * Une fenêtre est ouverte (expéditions, paramètres, confirmation…) : le jeu s'arrête tant qu'elle l'est (demande de
   * l'auteur, 17 nov. 2026). Sans toucher à `time.paused` : la fenêtre fermée, le jeu repart comme il était.
   * Les écrans de victoire (`.victory`) ne comptent pas : la fête derrière doit continuer
   */
  menuOpen(): boolean {
    if (this.root.querySelector('.overlay:not(.victory):not(#menu):not([hidden])')) return true;
    // les grandes cartes de choix (le grand choix, le portail, l'allié, la paix ou la guerre) : montrées ou cachées par `display`
    return CHOICE_CARDS.some((id) => { const el = document.getElementById(id); return !!el && el.style.display !== 'none'; });
  }

  /** Ferme la fenêtre du dessus (Échap) ; false s'il n'y en avait pas */
  closeTop(): boolean {
    const ovs = this.root.querySelectorAll<HTMLElement & { close?: () => void }>('.overlay');
    const top = ovs[ovs.length - 1];
    if (top?.close && top.id !== 'menu' && !top.classList.contains('victory')) { top.close(); return true; }
    if (top) return false;
    // puis les panneaux du haut : conditions de l'âge, fiche d'un besoin ou d'un stock, habitants (Échap ne les fermait pas, v6)
    if ($('#agePanel').classList.contains('open')) { $('#agePanel').classList.remove('open'); this.update(); return true; }
    if (this.needOpen || this.resOpen) { this.closeNeed(); return true; }
    if (!$('#census').hidden) { this.closeCensus(); return true; }
    return false;
  }

  /** Décision à prendre sur l'imprévu en cours d'une équipe */
  showDecision(a: ActiveExpedition) {
    const h = this.host, ex = h.expeditions, ev = a.wait;
    if (!ev) return;
    // la première fois que la fenêtre s'ouvre pour cet imprévu, l'équipe attend encore tout son temps : celui passé à attendre
    // que la fenêtre puisse s'ouvrir (un récit, un panneau ouvert, un bâtiment en main) ne compte pas
    if (this.offered.get(a) !== ev) { this.offered.set(a, ev); a.waitT = 0; }
    this.root.querySelector('.decide')?.closest('.overlay')?.remove();
    const opts = ev.options.map((o, i) => {
      const ok = ex.canTake(a, i), hints: string[] = [];
      // « des armes » plutôt que la liste de toutes les armes possibles
      const names = (gs: GearId[]) => (gs.length > 2 ? tr('des armes') : gs.map((g) => GEAR_BY[g].plural.toLowerCase()).join(tr(' ou ')));
      if (o.needs) hints.push(ok ? tr('avec {items}', { items: names(o.needs.filter((g) => (a.gear[g] ?? 0) > 0)) }) : tr('demande {items}, non emportées', { items: names(o.needs) }));
      if (o.risk < 0.98) hints.push(o.risk <= 0.7 ? tr('bien plus sûr') : tr('plus sûr'));
      else if (o.risk > 1.02) hints.push(o.risk >= 1.25 ? tr('bien plus risqué') : tr('plus risqué'));
      if (o.work) hints.push(o.work > 0 ? tr('plus long') : tr('plus rapide'));
      return `<button class="choice opt" data-o="${i}" ${ok ? '' : 'disabled'}><b>${o.label}</b><small>${hints.join(' · ')}${o.bonus ? `${hints.length ? ' · ' : ''}✅ ${chipsHtml(o.bonus)}` : ''}</small></button>`;
    }).join('');
    // le jeu s'arrête le temps de la décision ; il reprend à la fermeture s'il tournait
    if (this.pausedFor === null) { this.pausedFor = h.time.paused; h.time.paused = true; }
    const { ov, close } = modal(this.root, 'decide', `${a.m.icon} ${a.m.title}`, `
      <h4 class="evt">${ic('alert', 18, 2)} ${ev.title}</h4>
      <p class="story">${ev.text}</p>
      ${opts}
      <p class="hint" title="${tr('Le jeu reste en pause : l’équipe attend votre choix pour continuer.')}">⚠️ ${tr('Risque d’échec : {p} · ⏸ jeu en pause', { p: pct(ex.chance(a)) })}</p>`, () => {
      clearInterval(iv);
      if (this.root.querySelector('.decide')) return;
      if (this.pausedFor === false) h.time.paused = false;
      this.pausedFor = null;
    }, true);
    // l'équipe a tranché d'elle-même (le jeu relancé à la main) : la fenêtre n'a plus lieu d'être
    const iv = setInterval(() => { if (a.wait !== ev || !ex.active.includes(a)) close(); }, 500);
    ov.querySelectorAll<HTMLButtonElement>('button.opt').forEach((b) => (b.onclick = () => {
      if (a.wait === ev && ex.decide(a, +b.dataset.o!)) { h.audio.sfxClick(); this.info(`${a.m.icon} ${tr(ev.options[+b.dataset.o!].label)}.`); }
      close();
      this.update();
    }));
  }

  /** Le bâtiment qu'une expédition réussie a débloqué se bâtit maintenant, et n'est pas encore bâti : on le met en avant */
  private canBuildNow(k: KindId, done: boolean) { return done && !this.lockOf(k) && !(this.host.sim.counts[k] ?? 0); }

  /**
   * Le savoir-faire durable d'une expédition qui ne débloque pas de bâtiment (`legacy.ts`) : la même ligne « Débloque : … »,
   * son effet complet en infobulle
   */
  private legacyHtml(m: Mission, done: boolean) {
    const l = m.unlocks ? null : legacyOf(m.id);
    if (!l) return '';
    return `<p class="unlock" title="${attr(effectSummary([{ t: 'perk', id: l.perk }]))}">${pic(l.icon, 15)} ${tr(done ? 'A débloqué :' : 'Débloque :')} <b>${tr(l.label)}</b></p>`;
  }

  /** Récit du retour d'une expédition */
  showReport(r: Report) {
    const build = r.ok && r.m.unlocks && !r.redo && !this.lockOf(r.m.unlocks) ? r.m.unlocks : null;
    const { ov, close } = modal(this.root, `report ${r.ok ? 'win' : 'lose'}`, `${r.m.icon} ${r.m.title}`, `
      <h2>${tr(r.ok ? 'Réussite !' : 'Échec…')}</h2>
      <p class="story"></p>
      <p class="sum">${r.summary === tr('rien') ? tr('Rien gagné, rien perdu.') : r.summary}</p>
      ${r.notes.length ? `<details class="mstory"><summary>${tr('Le détail')}</summary><ul class="notes">${r.notes.map((n) => `<li>${n}</li>`).join('')}</ul></details>` : ''}
      ${r.ok && r.m.unlocks && !r.redo ? `<p class="unlock">${ic(KIND_ICON[r.m.unlocks], 18, 2)} ${tr('Nouveau : {name} à bâtir', { name: `<b>${KINDS[r.m.unlocks].names[this.host.sim.age].toLowerCase()}</b>` })}${UNLOCK_NOTE[r.m.unlocks] ? `<span class="unote" title="${tr('Rayon {cat}.', { cat: BUILD_CATS.find((c) => c.id === KINDS[r.m.unlocks!].cat)!.label })} ${tr(UNLOCK_NOTE[r.m.unlocks]!.trim())}"> ⓘ</span>` : ''}</p>` : ''}
      ${r.ok && r.m.mandatory && !r.redo && r.m.age === this.host.sim.age ? `<p class="hint">${tr('Obligatoire réussie : l’âge suivant approche.')}</p>` : !r.ok && r.m.mandatory && !r.redo ? `<p class="hint">${tr('On peut retenter, avec le même choix ou un autre.')}</p>` : ''}
      <div class="row"><span class="grow"></span>${build ? `<button class="build bgo">${ic(KIND_ICON[build], 16, 2)} ${tr('Bâtir {name}', { name: KINDS[build].names[this.host.sim.age].toLowerCase() })}</button>` : ''}<button class="active ok">${tr('Fermer')}</button></div>`);
    // une ou deux phrases ; le reste du récit est sous « Lire la suite »
    const rt = splitIntro(r.text), rt2 = splitIntro(rt.rest);
    $('.story', ov).textContent = tr('« {label} » : {text}', { label: r.c.label, text: `${rt.head}${rt2.head ? ` ${rt2.head}` : ''}` });
    if (rt2.rest) $('.story', ov).insertAdjacentHTML('afterend', `<details class="mstory"><summary>${tr('Lire la suite')}</summary><p>${rt2.rest}</p></details>`);
    $('.ok', ov).onclick = close;
    // le bâtiment que l'expédition vient de débloquer : on le prend en main d'un clic
    ov.querySelector<HTMLButtonElement>('.build')?.addEventListener('click', () => { close(); this.host.audio.sfxClick(); this.pick(build!); });
    // ni un clic à côté, ni Échap pour remonter du monde souterrain ne l'effacent avant qu'on l'ait lu (on le ferme au bouton)
    ov.addEventListener('pointerdown', (e) => { if (e.target === ov) e.stopImmediatePropagation(); }, true);
    (ov as HTMLElement & { close?: () => void }).close = () => { if (!document.body.classList.contains('under')) close(); };
  }

  // ---------------- Réglages ----------------
  /** Raccourci Maj+1 … 6 : ouvre le n-ième rayon de Bâtir, dans l'ordre de `BUILD_CATS` (Habitat … Décorations, Militaire) */
  openCat(i: number) {
    const c = BUILD_CATS[i];
    if (!c || document.body.classList.contains('photo')) return;
    if (this.tab !== 'build') $<HTMLButtonElement>('#modes [data-t="build"]').click();
    if (document.body.classList.contains('dockMin')) this.setDockMin(false);
    this.root.querySelector<HTMLButtonElement>(`#subcats [data-c="${c.id}"]`)?.click();
  }

  /** Raccourci J : ouvre la fenêtre des expéditions, ou la referme */
  toggleExpeditions() {
    const ov = this.root.querySelector('.expModal')?.closest('.overlay') as (HTMLElement & { close?: () => void }) | null;
    if (ov) ov.close?.(); else if (!this.menuOpen()) this.openExpeditions();
  }

  /**
   * La liste des raccourcis clavier (touche ?, ou Paramètres › Partie). Les touches de la vue suivent la disposition du
   * clavier choisie (ZQSD en AZERTY, WASD en QWERTY). Demande de Karim, testeur v6 qui joue aux jeux de stratégie
   */
  openKeys() {
    if (this.root.querySelector('.keysModal')) return;
    const k = layoutKeys(this.host.controls.layout), az = this.host.controls.layout === 'azerty';
    const kb = (keys: string) => keys.split(' ').map((x) => `<kbd>${x}</kbd>`).join('');
    const part = (title: string, rows: [string, string][]) => `<h5>${title}</h5>${rows.map(([keys, label]) => `<div class="kr"><span>${label}</span><span>${kb(keys)}</span></div>`).join('')}`;
    const left = part(tr('Temps'), [[tr('Espace'), tr('Pause, reprendre')], ['− +', tr('Ralentir, accélérer (×1 à ×8)')]])
      + part(tr('Fenêtres'), [['J', tr('Expéditions')], ['N', tr('Notifications')], ['?', tr('Cette aide')], [tr('Échap'), tr('Fermer la fenêtre, lâcher l’outil')]])
      + part(tr('Vue'), [[`${k.move.join(' ')}`, tr('Déplacer (aussi les flèches)')], [k.turn.join(' '), tr('Tourner')], ['V', tr('Revenir au village')], ['P', tr('Mode photo')]]);
    const right = part(tr('Bâtir'), [['B', tr('Reprendre le dernier bâtiment')], [tr('Maj+1 … {n}', { n: BUILD_CATS.length }), tr('Rayons, d’Habitat à Militaire')], [tr('Ctrl+F'), tr('Chercher un bâtiment (ou /)')], ['R', tr('Tourner le bâtiment, sinon tracer une route')], ['X', tr('Démolir')], ['M', tr('Déplacer un bâtiment')], [tr('Ctrl+Z Ctrl+Y'), tr('Annuler, rétablir')]])
      + part(tr('Paysage'), [['1 2 3 4 5', tr('Monter, baisser, aplanir, falaise, eau')], ['6 7 9 0', tr('Forêt, champ, gomme, montagne')], ['[ ]', tr('Taille du pinceau')]]);
    const note = az ? tr('− et + : les deux touches à droite du 0 (« ) » et « = » en AZERTY), ou le pavé numérique.') : tr('− et + : les deux touches à droite du 0, ou le pavé numérique.');
    modal(this.root, 'keysModal', tr('Raccourcis clavier'), `<div class="keysHelp"><div>${left}</div><div>${right}</div><p class="note">${note}</p></div>`);
  }

  openSettings() {
    const h = this.host, t = h.time, a = h.audio;
    // quatre onglets en colonne (en rangée sur téléphone) ; chaque section commence par son titre et son icône
    const tabs = [['time', 'sun', tr('Temps et météo')], ['look', 'screen', tr('Graphismes & son')], ['game', 'pad', tr('Partie')], ['misc', 'sliders', tr('Divers')]];
    const head = (k: string) => { const [, i, l] = tabs.find((x) => x[0] === k)!; return `<h3 class="setH">${ic(i, 22, 2)}${l}</h3>`; };
    const lang = getLang();
    // au bac à sable et en Normal, la difficulté impose le réglage des ressources
    const forced = DIFF_TEXT.resForced[h.world.difficulty];
    // la DA des fenêtres peintes de l'accueil (menuPop) : coque crème et dorée, le choix en cours en or
    const { ov, close } = menuPop(this.root, 'settings', 'options', tr('Paramètres'), `<div class="setWrap">
      <nav class="setTabs">${tabs.map(([k, i, l], n) => `<button data-tab="${k}" class="${n ? '' : 'on'}">${ic(i, 18, 2)}${l}</button>`).join('')}<button class="setMenu setSave" id="gSave2">${ic('save', 18)}<span>${tr('Sauvegarder')}</span></button><button class="setMenu" id="gMenu2">${ic('house', 18)}${tr('Sauvegarder et quitter')}</button></nav>
      <div class="setPane">
      <section data-sec="time">${head('time')}
        <div class="row"><label>${tr('Vitesse')}</label><button data-sp="0">${ic('pause', 16, 2.2)} ${tr('Pause')}</button><button data-sp="1">×1</button><button data-sp="2">×2</button><button data-sp="4">×4</button><button data-sp="8">×8</button></div>
        <div class="row"><label>${tr('Durée du jour')}</label><input id="sDay" type="range" min="30" max="400" step="10" value="${t.dayLen}"><span id="vDay">${t.dayLen}s</span></div>
        <div class="row"><label>${tr('Durée saison')}</label><input id="sSeason" type="range" min="30" max="600" step="10" value="${t.seasonLen}"><span id="vSeason">${t.seasonLen}s</span></div>
        <h4>${tr('Saison et heure')}</h4>
        <div class="row">${SEASONS.map((s, i) => `<button data-season="${i}" class="${t.season === i ? 'active' : ''}">${ic(SEASON_ICONS[i], 16)} ${s}</button>`).join('')}</div>
        <div class="row"><label>${tr('Heure')}</label><input id="sHour" type="range" min="0" max="23.9" step="0.1" value="${t.hour.toFixed(1)}"><span id="vHour">${Math.floor(t.hour)}h</span></div>
        <h4>${tr('Saisons jouées')}</h4>
        <div class="row">${SEASONS.map((s, i) => `<button data-son="${i}" aria-pressed="${t.isOn(i)}" class="${t.isOn(i) ? 'active' : ''}">${ic(SEASON_ICONS[i], 16)} ${s}</button>`).join('')}</div>
        <p class="hint">${tr('Une saison éteinte est sautée : le village passe tout droit à la suivante. Gardez-en une seule pour la vivre toute l’année.')}</p>
        <h4>${tr('Météo')}</h4>
        <div class="row">${[['auto', '', tr('Auto')], ['clear', 'sun', tr('Clair')], ['rain', 'rain', tr('Pluie')], ['snow', 'snow', tr('Neige')], ['fog', 'fog', tr('Brume')]].map(([k, i, l]) => `<button data-w="${k}" class="${(h.env.manualWeather ?? 'auto') === k ? 'active' : ''}">${i ? ic(i, 16) + ' ' : ''}${l}</button>`).join('')}</div>
        <h4>${tr('Effets affichés')}</h4>
        <div class="row">${WEATHER_FX.map(([k, i, l]) => `<button data-fx="${k}" aria-pressed="${h.weatherFx[k]}" class="${h.weatherFx[k] ? 'active' : ''}">${ic(i, 16)} ${l()}</button>`).join('')}</div>
        <p class="hint">${tr('Un effet éteint ne se voit plus, mais le temps qu’il fait continue : la pluie arrose toujours les champs, la neige suit l’hiver.')}</p>
      </section>
      <section data-sec="look" hidden>${head('look')}
        <h4>${tr('Graphismes')}</h4>
        <div class="row">${[['auto', tr('Auto')], ['high', tr('Haute')], ['medium', tr('Normale')], ['low', tr('Réduite')]].map(([k, l]) => `<button data-q="${k}" class="${h.quality === k ? 'active' : ''}">${l}</button>`).join('')}</div>
        <div class="qInfo"></div>
        <h4>${tr('Audio')}</h4>
        <div class="row"><label>${tr('Musique')}</label><input id="sMusic" type="range" min="0" max="1" step="0.05" value="${a.musicVol}"><button id="mMusic" aria-label="${tr('Couper la musique')}" class="${a.muteMusic ? 'active' : ''}">${ic(a.muteMusic ? 'mute' : 'volume', 18)}</button></div>
        <div class="row"><label>${tr('Sons')}</label><input id="sSfx" type="range" min="0" max="1" step="0.05" value="${a.sfxVol}"><button id="mSfx" aria-label="${tr('Couper les sons')}" class="${a.muteSfx ? 'active' : ''}">${ic(a.muteSfx ? 'mute' : 'volume', 18)}</button></div>
        <div class="row"><label title="${tr('Nature, ateliers, bêtes et foule près de la caméra')}">${tr('Ambiances')}</label><input id="sAmb" type="range" min="0" max="1" step="0.05" value="${a.ambVol}"><button tabindex="-1" aria-hidden="true" style="visibility:hidden">${ic('volume', 18)}</button></div>
      </section>
      <section data-sec="game" hidden>${head('game')}
        <h4>${tr('Contrôles')}</h4>
        <div class="row"><label>${tr('Déplacer la vue')}</label><button data-ctl="mouse">${tr('À la souris')}</button><button data-ctl="keys">${tr('Au clavier')}</button></div>
        <div class="row"><label>${tr('Clavier')}</label><button data-lay="azerty">AZERTY</button><button data-lay="qwerty">QWERTY</button></div>
        <p class="hint" id="ctlHint"></p>
        <div class="row"><label>${tr('Sensibilité de la vue')}</label><input id="sSens" type="range" min="${CAM_SENS.min}" max="${CAM_SENS.max}" step="0.1" value="${h.camSens}"><span id="vSens">${sensText(h.camSens)}</span></div>
        <div class="row"><label>${tr('Bord de l’écran')}</label><button id="gEdge" class="${h.edgeScroll ? 'active' : ''}">${tr(h.edgeScroll ? 'Activé' : 'Désactivé')}</button></div>
        <p class="hint">${tr('La souris amenée au bord de l’écran fait défiler la vue. La sensibilité règle la vitesse de la vue : tourner, défiler, zoomer.')}</p>
        <div class="row"><label>${tr('Raccourcis clavier')}</label><button id="gKeys">${tr('Voir la liste')} <small>?</small></button></div>
        <h4>${tr('Blason du village')}</h4>
        <div class="row"><label>${tr('Drapeau')}</label><span class="setFlag">${flagSvg(h.world.blason, 66)}</span><button id="gBlason">${tr('Changer le blason')}</button></div>
        <p class="hint">${tr('Ses couleurs flottent sur vos drapeaux et habillent vos troupes.')}</p>
        <h4>${tr('Règles')}</h4>
        <div class="row"><label>${DIFF_TEXT.setting}</label><span class="diffTag ${h.world.difficulty}">${ic(DIFF_TEXT.icon[h.world.difficulty], 16, 2)}${DIFF_TEXT.name[h.world.difficulty]}</span></div>
        <ul class="hint dpoints">${DIFF_TEXT.points[h.world.difficulty].map((x) => `<li>${x}</li>`).join('')}</ul>
        <p class="hint">${DIFF_TEXT.settingHint}</p>
        <div class="row"><label>${tr('Catastrophes')}</label><button id="gDisasters" class="${h.disasters ? 'active' : ''}">${tr(h.disasters ? 'Activées' : 'Désactivées')}</button></div>
        <p class="hint">${tr('Activées : le volcan se réveille de lui-même, la lave et les incendies peuvent détruire des bâtiments. Désactivées : ni éruption spontanée, ni incendie.')}</p>
        <div class="row"><label>${tr('Catastrophes naturelles')}</label>${CALAM_FX.map(([k, i, l]) => `<button data-calam="${k}" aria-pressed="${h.calamities[k]}" class="${h.calamities[k] ? 'active' : ''}">${ic(i, 16)} ${l()}</button>`).join('')}</div>
        <p class="hint">${tr('Une au plus par âge, annoncée juste avant : une crue après une forte averse, un séisme, une pluie de météorites la nuit. Chacune se coupe à part.')}</p>
        <div class="row"><label>${tr('Routes auto')}</label><button id="gRoads" class="${h.autoRoads ? 'active' : ''}">${tr(h.autoRoads ? 'Activées' : 'Désactivées')}</button></div>
        <p class="hint">${tr('Un chemin relie chaque nouveau bâtiment à la route la plus proche, s’il n’y touche pas déjà.')}</p>
        <div class="row"><label>${tr('Flèches d’amélioration')}</label><button id="gBadges" class="${h.hideUpBadges ? '' : 'active'}">${tr(h.hideUpBadges ? 'Masquées' : 'Affichées')}</button></div>
        <p class="hint">${tr('Une flèche dorée flotte au-dessus des bâtiments qu’on peut améliorer et dont on a de quoi payer l’amélioration.')}</p>
        <div class="row"><label>${tr('Objectifs')}</label><button id="gGoals" class="${h.hideGoals ? '' : 'active'}">${tr(h.hideGoals ? 'Masqués' : 'Affichés')}</button></div>
        <div class="row"><label title="${tr('Le conseil du moment, au milieu sous la barre du haut : ce qu’il faut bâtir ensuite')}">${tr('Conseils du moment')}</label><button id="gHelp" class="${this.help ? 'active' : ''}">${tr(this.help ? 'Affichés' : 'Masqués')}</button></div>
        <p class="hint">${tr('Trois petits objectifs à la fois dans la barre du haut, chacun avec une récompense.')}</p>
        <div class="row"><label>${tr('Ressources')}</label><button id="gUnlimited" class="${h.world.unlimited ? 'active' : ''}" ${forced ? 'disabled' : ''}>${forced ?? tr(h.world.unlimited ? 'Illimitées' : 'Normales')}</button></div>
        <p class="hint">${tr('Normales : bois, pierre et minerai se gagnent et se dépensent. Illimitées : ils ne manquent jamais — les grands bâtiments ne coûtent rien, l’équipement non plus, et le minerai demandé pour passer d’âge est acquis.')}</p>
        <h4>${tr('Sauvegarde')}</h4>
        <div class="row"><button id="gSave">${ic('save', 16)} ${tr('Sauvegarder')}</button><button id="gExport">${ic('download', 16)} ${tr('Exporter')}</button><button id="gImport">${ic('upload', 16)} ${tr('Importer')}</button></div>
        <h4>${tr('Quitter')}</h4>
        <div class="row"><button id="gNew">${ic('restart', 16)} ${tr('Recommencer cette carte')}</button><button id="gMenu">${ic('house', 16)} ${tr('Menu principal')}</button></div>
        <input type="file" id="fImport" accept="application/json,.json" style="display:none">
      </section>
      <section data-sec="misc" hidden>${head('misc')}
        ${this.tutorial?.settingsHtml() ?? ''}
        <h4>${tr('Cinématique d’ouverture')}</h4>
        <div class="row"><label>${tr('Au début d’une partie')}</label><button id="gIntro" class="${h.introOff ? '' : 'active'}">${tr(h.introOff ? 'Désactivée' : 'Activée')}</button></div>
        <p class="hint">${tr('Un court film au début de chaque nouvelle partie : la vallée sauvage, un peuple nomade, le premier foyer.')}</p>
        <h4>${tr('Langue')}</h4>
        ${langPicker(lang)}
        <h4>${tr('Crédits')}</h4>
        <div class="row"><button id="gCredits">${tr('Crédits')}</button></div>
      </section>
      </div></div>`, undefined, tr('Personnalisez votre expérience de jeu.'));
    bindLangPicker(ov);
    const q = <T extends HTMLElement>(s: string) => $(s, ov) as T;
    q('#gCredits').onclick = () => showCredits(this.root);
    // le blason : le village se teint pendant qu'on choisit, la croix rend l'ancien
    q('#gBlason').onclick = () => {
      h.audio.sfxClick();
      void chooseBlason(this.root, h.world.blason, false, (b) => setTeamBlason(b), h.world.isleName).then((b) => {
        if (b) { h.setBlason(b.blason); h.setIsleName(b.isle); }
        q('.setFlag').innerHTML = flagSvg(h.world.blason, 66);
      });
    };
    // sous les onglets : sauvegarder (le bouton le dit lui-même : la fenêtre ouverte retient les messages), ou
    // sauvegarder et revenir au menu principal (`toMenu` sauvegarde avant de recharger la page)
    q('#gSave2').onclick = () => {
      h.saveNow(); h.audio.sfxClick();
      const b = q('#gSave2');
      b.classList.add('done'); $('span', b).textContent = tr('Partie sauvegardée');
      window.setTimeout(() => { b.classList.remove('done'); $('span', b).textContent = tr('Sauvegarder'); }, 2000);
    };
    q('#gMenu2').onclick = () => h.toMenu();
    ov.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => (b.onclick = () => {
      ov.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
      ov.querySelectorAll<HTMLElement>('[data-sec]').forEach((s) => (s.hidden = s.dataset.sec !== b.dataset.tab));
    }));
    ov.querySelectorAll<HTMLButtonElement>('[data-sp]').forEach((b) => (b.onclick = () => {
      const v = +b.dataset.sp!;
      if (v === 0) t.paused = true; else { t.paused = false; t.speed = v; }
      h.applySettings();
      live();
    }));
    // sous les boutons de qualité, ce que le niveau choisi change vraiment (relu du jeu : rien d'affiché qui ne soit appliqué)
    let qKey = '';
    const showQ = () => {
      const g = h.gfxShown, html = qualityInfo(h.quality, g);
      if (html === qKey) return;
      qKey = html;
      q('.qInfo').innerHTML = html;
    };
    showQ();
    // la fenêtre suit le jeu tant qu'elle est ouverte : vitesse en cours, saison et heure qui avancent
    const live = () => {
      ov.querySelectorAll<HTMLButtonElement>('[data-sp]').forEach((b) => { const v = +b.dataset.sp!; b.classList.toggle('active', v === 0 ? t.paused : !t.paused && t.speed === v); });
      ov.querySelectorAll<HTMLButtonElement>('[data-season]').forEach((b) => { b.classList.toggle('active', +b.dataset.season! === t.season); b.disabled = !t.isOn(+b.dataset.season!); });
      const hour = q<HTMLInputElement>('#sHour');
      if (document.activeElement !== hour) { hour.value = t.hour.toFixed(1); q('#vHour').textContent = `${Math.floor(t.hour)}h`; }

      // le palier de « Auto » peut changer pendant qu'on regarde
      if (h.quality === 'auto') showQ();
    };
    live();
    const iv = setInterval(() => { if (ov.isConnected) live(); else clearInterval(iv); }, 500);
    const rng = (id: string, fn: (v: number) => void, out?: string, fmt = (v: number) => `${v}`) => {
      const el = q<HTMLInputElement>(id);
      el.oninput = () => { fn(+el.value); if (out) q(out).textContent = fmt(+el.value); h.applySettings(); };
    };
    rng('#sDay', (v) => (t.dayLen = v), '#vDay', (v) => `${v}s`);
    rng('#sSeason', (v) => (t.seasonLen = v), '#vSeason', (v) => `${v}s`);
    rng('#sHour', (v) => (t.hour = v), '#vHour', (v) => `${Math.floor(v)}h`);
    ov.querySelectorAll<HTMLButtonElement>('[data-season]').forEach((b) => (b.onclick = () => {
      t.setSeason(+b.dataset.season!);
      ov.querySelectorAll('[data-season]').forEach((x) => x.classList.toggle('active', x === b));
      h.applySettings();
    }));
    // les saisons jouées : chacune s'éteint ou se rallume ; la dernière allumée reste (sans saison, l'année n'aurait rien) : son
    // bouton le dit au survol
    const seasonsOn = () => {
      const only = t.offList().length >= 3;
      ov.querySelectorAll<HTMLButtonElement>('[data-son]').forEach((x) => {
        const v = t.isOn(+x.dataset.son!);
        x.classList.toggle('active', v);
        x.classList.toggle('only', v && only);
        x.setAttribute('aria-pressed', String(v));
        x.title = v && only ? tr('Gardez au moins une saison.') : '';
      });
    };
    seasonsOn();
    ov.querySelectorAll<HTMLButtonElement>('[data-son]').forEach((b) => (b.onclick = () => {
      const i = +b.dataset.son!, off = t.offList(), on = off.includes(i);
      if (!on && off.length >= 3) return;
      h.setSeasonsOff(on ? off.filter((x) => x !== i) : [...off, i]);
      seasonsOn();
      live();
      a.sfxClick();
    }));
    ov.querySelectorAll<HTMLButtonElement>('[data-w]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.w!;
      h.env.setWeather(k === 'auto' ? null : (k as WeatherKind));
      if (k === 'auto') h.env.wantKind = 'clear';
      ov.querySelectorAll('[data-w]').forEach((x) => x.classList.toggle('active', x === b));
    }));
    ov.querySelectorAll<HTMLButtonElement>('[data-fx]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.fx as 'rain' | 'snow' | 'fog', on = !h.weatherFx[k];
      h.setWeatherFx(k, on);
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
      a.sfxClick();
    }));
    ov.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => (b.onclick = () => {
      h.setQuality(b.dataset.q as Quality);
      ov.querySelectorAll('[data-q]').forEach((x) => x.classList.toggle('active', x === b));
      showQ();
    }));
    ov.querySelectorAll<HTMLButtonElement>('[data-calam]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.calam as CalamityKind, on = !h.calamities[k];
      h.setCalamity(k, on);
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
      a.sfxClick();
    }));
    q('#gDisasters').onclick = () => {
      h.setDisasters(!h.disasters);
      q('#gDisasters').textContent = tr(h.disasters ? 'Activées' : 'Désactivées');
      q('#gDisasters').classList.toggle('active', h.disasters);
    };
    q('#gUnlimited').onclick = () => {
      // passer en ressources illimitées en pleine partie change tout : un second clic le confirme
      const b = q<HTMLButtonElement>('#gUnlimited');
      if (!h.world.unlimited && !b.dataset.sure) {
        b.dataset.sure = '1';
        b.textContent = tr('Sûr ? Recliquez pour tout rendre illimité');
        setTimeout(() => { if (b.dataset.sure) { delete b.dataset.sure; b.textContent = tr(h.world.unlimited ? 'Illimitées' : 'Normales'); } }, 4000);
        return;
      }
      delete b.dataset.sure;
      h.world.unlimited = !h.world.unlimited;
      h.applySettings();
      q('#gUnlimited').textContent = tr(h.world.unlimited ? 'Illimitées' : 'Normales');
      q('#gUnlimited').classList.toggle('active', h.world.unlimited);
      this.update();
    };
    q('#gIntro').onclick = () => {
      h.setIntroOff(!h.introOff);
      q('#gIntro').textContent = tr(h.introOff ? 'Désactivée' : 'Activée');
      q('#gIntro').classList.toggle('active', !h.introOff);
    };
    // (les aides : la pastille « Aides » de la colonne de gauche n'est plus dans l'écran allégé, l'interrupteur est ici)
    q('#gHelp').onclick = () => {
      this.setHelp(!this.help);
      q('#gHelp').textContent = tr(this.help ? 'Affichés' : 'Masqués');
      q('#gHelp').classList.toggle('active', this.help);
    };
    q('#gGoals').onclick = () => {
      h.setHideGoals(!h.hideGoals);
      q('#gGoals').textContent = tr(h.hideGoals ? 'Masqués' : 'Affichés');
      q('#gGoals').classList.toggle('active', !h.hideGoals);
    };
    q('#gBadges').onclick = () => {
      h.setHideUpBadges(!h.hideUpBadges);
      q('#gBadges').textContent = tr(h.hideUpBadges ? 'Masquées' : 'Affichées');
      q('#gBadges').classList.toggle('active', !h.hideUpBadges);
    };
    // les contrôles de la vue (le même choix qu'au premier lancement)
    const ctl = () => {
      const c = h.controls;
      ov.querySelectorAll<HTMLButtonElement>('[data-ctl]').forEach((b) => b.classList.toggle('active', b.dataset.ctl === c.mode));
      ov.querySelectorAll<HTMLButtonElement>('[data-lay]').forEach((b) => b.classList.toggle('active', b.dataset.lay === c.layout));
      q('#ctlHint').textContent = controlText(c.mode, c.layout);
    };
    $('#gKeys', ov).onclick = () => { h.audio.sfxClick(); this.openKeys(); };
    ov.querySelectorAll<HTMLButtonElement>('[data-ctl]').forEach((b) => (b.onclick = () => { h.setControls({ ...h.controls, mode: b.dataset.ctl as CamControl }); h.audio.sfxClick(); ctl(); }));
    ov.querySelectorAll<HTMLButtonElement>('[data-lay]').forEach((b) => (b.onclick = () => { h.setControls({ ...h.controls, layout: b.dataset.lay as KbLayout }); h.audio.sfxClick(); ctl(); }));
    ctl();
    { const s = q<HTMLInputElement>('#sSens'); s.oninput = () => { h.setCamSens(+s.value); q('#vSens').textContent = sensText(h.camSens); }; }
    q('#gEdge').onclick = () => {
      h.setEdgeScroll(!h.edgeScroll);
      q('#gEdge').textContent = tr(h.edgeScroll ? 'Activé' : 'Désactivé');
      q('#gEdge').classList.toggle('active', h.edgeScroll);
      h.audio.sfxClick();
    };
    q('#gRoads').onclick = () => {
      h.setAutoRoads(!h.autoRoads);
      q('#gRoads').textContent = tr(h.autoRoads ? 'Activées' : 'Désactivées');
      q('#gRoads').classList.toggle('active', h.autoRoads);
    };
    rng('#sMusic', (v) => (a.musicVol = v));
    rng('#sSfx', (v) => (a.sfxVol = v));
    rng('#sAmb', (v) => (a.ambVol = v));
    q('#mMusic').onclick = () => { a.muteMusic = !a.muteMusic; a.musicChosen = true; q('#mMusic').innerHTML = ic(a.muteMusic ? 'mute' : 'volume', 18); q('#mMusic').classList.toggle('active', a.muteMusic); h.applySettings(); };
    q('#mSfx').onclick = () => { a.muteSfx = !a.muteSfx; a.sfxChosen = true; q('#mSfx').innerHTML = ic(a.muteSfx ? 'mute' : 'volume', 18); q('#mSfx').classList.toggle('active', a.muteSfx); h.applySettings(); };
    q('#gSave').onclick = () => { h.saveNow(); this.info('Partie sauvegardée'); };
    q('#gExport').onclick = () => h.exportSave();
    const fi = q<HTMLInputElement>('#fImport');
    q('#gImport').onclick = () => fi.click();
    fi.onchange = () => { if (fi.files?.[0]) h.importFile(fi.files[0]); };
    q('#gNew').onclick = async () => { const r = await chooseDifficulty(this.root, { current: h.world.difficulty, age: h.world.sandbox ? h.sim.age : 0, note: DIFF_TEXT.restartNote, ok: DIFF_TEXT.restart }); if (r) h.newGame(r.d, r.age); };
    q('#gMenu').onclick = () => h.toMenu();
    this.tutorial?.bindSettings(ov, close);
  }
}

// ---------------- Menu principal ----------------
export interface MenuHost {
  /** `seed` : graine d'une nouvelle partie (celle du continent montré en aperçu) ; `difficulty` : celle qu'a choisie le joueur */
  start(map: number, mode: 'continue' | 'new', seed?: number, difficulty?: Difficulty, age?: number): void;
  importFile(f: File): void;
  /** le volume de la musique (0 à 1) et sa coupure, réglés depuis les options de l'accueil (même réglage qu'en jeu) */
  music: { vol: number; muted: boolean; setVol(v: number): void; setMuted(on: boolean): void };
}

export function drawPreview(canvas: HTMLCanvasElement, heights: ArrayLike<number>) {
  // côté de la grille (chaque carte a sa taille), aperçu d'environ 290 pixels
  const S = Math.round(Math.sqrt(heights.length)), K = Math.max(1, Math.round(290 / S)), P = S * K;
  canvas.width = canvas.height = P;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(P, P);
  for (let y = 0; y < P; y++)
    for (let x = 0; x < P; x++) {
      const fx = Math.min(S - 1.001, x / K), fz = Math.min(S - 1.001, y / K);
      const ix = Math.floor(fx), iz = Math.floor(fz);
      const at = (a: number, b: number) => heights[Math.min(S - 1, b) * S + Math.min(S - 1, a)];
      const h = at(ix, iz);
      const dx = at(ix + 1, iz) - at(ix - 1 < 0 ? 0 : ix - 1, iz), dz = at(ix, iz + 1) - at(ix, iz - 1 < 0 ? 0 : iz - 1);
      const shade = 1 + (-dx * 0.6 - dz * 0.4) * 0.15;
      let r: number, gg: number, b: number;
      if (h < 0) { const d = Math.min(1, -h / 1.5); r = 170 - 80 * d; gg = 214 - 50 * d; b = 215 - 20 * d; }
      else if (h < 0.3) { r = 238; gg = 220; b = 170; }
      else {
        // herbe → roche, puis neiges éternelles sur les sommets
        const k = Math.min(1, h / 5), sn = Math.min(1, Math.max(0, (h - 7) / 1.2));
        r = 150 + 60 * k + 40 * sn; gg = 207 - 20 * k + 50 * sn; b = 126 + 30 * k + 80 * sn;
      }
      const i = (y * P + x) * 4;
      img.data[i] = Math.min(255, r * shade); img.data[i + 1] = Math.min(255, gg * shade); img.data[i + 2] = Math.min(255, b * shade); img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
}

/**
 * Les crédits : les modèles 3D et les licences (les auteurs sous licence CC-BY doivent être cités). Même fenêtre peinte que
 * les paramètres (`menuPop`) : losange des crédits, titre et sous-titre, une carte par licence, paysage en bas
 */
export function showCredits(root: HTMLElement) {
  const a = (href: string, t: string) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${t}</a>`;
  // titres des morceaux, entre les guillemets de la langue
  const q = (...ts: string[]) => ts.map((t) => tr('« {t} »', { t })).join(', ');
  menuPop(root, 'credits', 'credits', tr('Crédits'), `<div class="credPane">
    <p class="credIntro">${tr('Ceionia est un jeu libre de droits d’image et de son : la géométrie des bâtiments, des habitants, de nombreuses bêtes (mouton, cochon, poule, lapin, canards, oie, grenouille, bouquetin…), des véhicules et la plupart des sons sont dessinés et générés par le jeu lui-même. Certains modèles 3D, des cris d’animaux et les musiques, gratuits, viennent d’artistes à qui nous disons merci.')}</p>
    <section class="credCard">
      <h4>${ic('heart', 18, 2)}${tr('Musiques, en attendant celles composées pour le jeu')}</h4>
      <ul class="credits">
        <li>${tr('{author}, licence {lic} : {titles}.', { author: a('https://incompetech.com', 'Kevin MacLeod (incompetech.com)'), lic: a(tr('https://creativecommons.org/licenses/by/4.0/deed.fr'), 'CC BY 4.0'), titles: q('The Sky of our Ancestors', 'Thunderbird', 'Temple of the Manes', 'Enchanted Journey', 'Suonatore di Liuto', 'Peaceful Desolation', 'Teller of the Tales') + `, ${q('Toccata and Fugue in D Minor')} (Jean-Sébastien Bach), ${q('Gymnopedie No 1', 'Gymnopedie No 3')} (Erik Satie), ${q('Danse Morialta', 'Frost Waltz', 'The Parting')}, ${q('Thaxted')} (Gustav Holst), ${q('Oppressive Gloom', 'Crusade', 'Ritual')}` })}</li>
        <li>${tr('{author}, licence {lic} : {titles}.', { author: a('https://opengameart.org/users/matthew-pablo', 'Matthew Pablo'), lic: a(tr('https://creativecommons.org/licenses/by/3.0/deed.fr'), 'CC BY 3.0'), titles: q('Beyond The Clouds', 'Theme of Com-Mecha') })}</li>
        <li>${tr('Via {src}, en CC0 : {list}.', { src: a('https://opengameart.org', 'OpenGameArt'), list: [[q('Tribal'), 'Of Far Different Nature'], [q('Medieval: Exploration', 'Medieval: The Old Tower Inn'), 'RandomMind'], [q('A cup of tea', 'Florist', 'Bartender', 'Cat caffe'), 'TAD'], [q('Calm Ambient 1 (Synthwave 4k)', 'Another August', 'Calm Ambient 3 (Lifewave 2k)'), 'The Cynic Project']].map(([t, by]) => tr('{titles} par {author}', { titles: t, author: by })).join('. ') })}</li>
      </ul>
    </section>
    <section class="credCard">
      <h4>${ic('heart', 18, 2)}${tr('Modèles sous licence CC0 (domaine public)')}</h4>
      <ul class="credits">
        <li>${a('https://quaternius.com', 'Quaternius')} : ${tr('Animated Animal Pack (cheval, alpaga, vache, shiba, husky, biche, cerf, renard), loup, faune marine, arbres (Ultimate Nature), palmiers, cactus, créatures des grottes, décors, puits, fermes, tour de pierre, enclos.')}</li>
        <li>${a('https://kenney.nl', 'Kenney')} : ${tr('Survival Kit, épave de navire.')}</li>
        <li>${tr('Kay Lousberg (crâne, os), MiniPoly (coraux), Mohabins (algues), iPoly3D (cristaux), MilkAndBanana (jarre), reyshapes (cruche), via {src}.', { src: a('https://poly.pizza', 'Poly Pizza') })}</li>
      </ul>
    </section>
    <section class="credCard">
      <h4>${ic('heart', 18, 2)}${tr('Cris d’animaux enregistrés')}</h4>
      <ul class="credits">
        <li>${tr('Via {src}, en CC0 ou domaine public : bêlement de mouton (aussi pour le bouquetin), hennissement, caquètement de poule (alys, PDSounds), hurlement d’une meute de loups, de l’US Fish and Wildlife Service.', { src: a('https://commons.wikimedia.org', 'Wikimedia Commons') })}</li>
        <li>${tr('« Single Cow Moo » par {author}, licence {lic} : meuglement de la vache.', { author: a('https://commons.wikimedia.org/wiki/File:Single_Cow_Moo.ogg', 'MichaeltheFox8621'), lic: a('https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'CC BY-SA 4.0') })}</li>
      </ul>
    </section>
    <section class="credCard">
      <h4>${ic('heart', 18, 2)}${tr('Modèles sous licence CC-BY 3.0')}</h4>
      <ul class="credits">
        <li>${tr('« Greek Temple » par {author} : temple et asclépiéion de l’Antiquité.', { author: a('https://poly.pizza/m/cdMQnl19MB9', 'Alexandre Thomas (Ashtom)') })}</li>
        <li>${tr('« Amphora » par {a1} et « Eight Vases » par {a2} : atelier du potier.', { a1: a('https://poly.pizza/m/7Q8MkXjALbL', 'Bruno Oliveira'), a2: a('https://poly.pizza/m/083bnosQpkP', 'Paul Spooner') })}</li>
      </ul>
    </section>
    <p class="hint">${tr('Les modèles ont été retouchés (couleurs, échelle) pour s’accorder au style du jeu. Les licences : {cc0} et {ccby}.', { cc0: a(tr('https://creativecommons.org/publicdomain/zero/1.0/deed.fr'), 'CC0'), ccby: a(tr('https://creativecommons.org/licenses/by/3.0/deed.fr'), 'CC-BY 3.0') })}</p>
  </div>`, undefined, tr('Les artistes des modèles 3D, des sons et des musiques, et leurs licences.'));
}

/** le triangle plein des boutons « Nouvelle partie » et « Continuer », et le chevron des cartes */
const playIcon = (s = 30) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path d="M6 3.5l15 8.5-15 8.5z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
const CHEVRON = '<svg class="mChev" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';


/**
 * L'écran d'accueil, sur un paysage animé (la vidéo `MENU_VIDEO` de `loading.ts`, ou l'image fixe) : le titre, les
 * trois modes en cartes illustrées (un clic choisit le mode, la carte choisie grandit ; un double-clic lance), « Nouvelle
 * partie » dans le mode choisi (le bac à sable demande d'abord l'âge de départ ; une confirmation si la sauvegarde de la
 * carte serait écrasée) et, s'il existe une sauvegarde, son résumé en bas à gauche avec « Continuer ».
 * L'engrenage ouvre les options : langue, tutoriel guidé, carte (s'il y en a plusieurs), import, crédits, commandes.
 */
export function showMenu(root: HTMLElement, host: MenuHost, map = MAPS[0].id): HTMLElement {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.id = 'menu';
  ov.innerHTML = `${menuBg('mBg')}
    <button class="mGear" title="${tr('Options')}" aria-label="${tr('Options')}">${ic('gear', 30, 1.9)}</button>
    <div class="mInner">
      <header class="mTitle">${LOGO_PEAKS}<h1>Ceionia</h1>
        <p class="sub"><span>${tr('Bâtissez')}</span><i>◆</i><span>${tr('Équilibrez')}</span><i>◆</i><span>${tr('Façonnez votre monde')}</span></p></header>
      <div class="mModes" role="radiogroup" aria-label="${tr('Mode')}">${DIFFICULTIES.map((d) => `<button type="button" role="radio" class="mMode ${d}${d === DEFAULT_DIFFICULTY ? ' rec' : ''}" data-d="${d}" title="${attr(DIFF_TEXT.points[d].join(' · '))}">
        <span class="mGem" aria-hidden="true"></span>
        <span class="mArt"><img src="./menu/mode-${d}.webp" alt="" decoding="async"></span>
        <span class="mRec">${d === DEFAULT_DIFFICULTY ? DIFF_TEXT.recommended : ''}</span>
        <h2>${DIFF_TEXT.mode(d)}</h2><em>${DIFF_TEXT.blurb[d]}</em>${CHEVRON}</button>`).join('')}</div>
      <div class="mPlay"><button class="mResume" hidden>${playIcon()}<span>${tr('Continuer')}</span></button><button class="mGo">${playIcon()}<span>${tr('Nouvelle partie')}</span></button></div>
      <p class="mSave" hidden></p>
    </div>
    <input type="file" id="mFile" accept="application/json,.json" style="display:none">`;
  // la carte choisie (le continent par défaut) : sa sauvegarde, et la graine de sa prochaine partie (chacune a son continent)
  let save: SaveData | null = null, seed = newSeed(), pick: Difficulty = DEFAULT_DIFFICULTY;
  const status = $('.mSave', ov), resume = $<HTMLButtonElement>('.mResume', ov);
  const select = (d: Difficulty) => {
    pick = d;
    ov.querySelectorAll<HTMLElement>('.mMode').forEach((b) => { b.classList.toggle('sel', b.dataset.d === d); b.setAttribute('aria-checked', `${b.dataset.d === d}`); });
  };
  const draw = () => {
    const slot = readSlot(map);
    save = slot.save;
    seed = newSeed();
    resume.hidden = !save;
    ov.classList.toggle('hasSave', !!save);
    // le mode choisi d'avance : celui de la sauvegarde, sinon le mode conseillé
    const d = save ? readDifficulty(save.world.difficulty, save.world.diffV) : DEFAULT_DIFFICULTY;
    select(d);
    // une sauvegarde illisible : on le dit (elle sera gardée de côté au lancement, pas écrasée)
    status.hidden = !save && !slot.error;
    if (slot.error) { status.textContent = tr('⚠️ Votre sauvegarde n’a pas pu être lue ({why}). Elle sera gardée de côté : une nouvelle partie ne l’écrasera pas.', { why: slot.error }); return; }
    if (!save) return;
    // sous les boutons, le résumé de la partie : mode, âge, habitants, « il y a… »
    const when = savedAgo(save.savedAt), pop = Math.floor(save.pop);
    status.textContent = `${tr('Votre monde vous attend…')} ${[DIFF_TEXT.name[d], AGES[save.age]?.name ?? '', `${pop} ${plural(pop, 'habitant', 'habitants')}`, when].filter(Boolean).join(' · ')}`;
  };
  draw();
  resume.onclick = () => host.start(map, 'continue');
  const play = async () => {
    const d = pick;
    // bac à sable : l'âge où la partie commence, d'abord
    const age = d === 'sandbox' ? await pickAge(root) : 0;
    if (age === null) return;
    // seule une sauvegarde de la carte que la nouvelle partie écraserait demande confirmation
    if (save && !(await menuConfirm(root, DIFF_TEXT.overwrite, DIFF_TEXT.play(d)))) return;
    host.start(map, 'new', seed, d, age);
  };
  $('.mGo', ov).onclick = play;
  ov.querySelectorAll<HTMLButtonElement>('.mMode').forEach((b) => {
    b.onclick = () => select(b.dataset.d as Difficulty);
    b.ondblclick = () => { select(b.dataset.d as Difficulty); void play(); };
  });
  const f = $<HTMLInputElement>('#mFile', ov);
  f.onchange = () => { if (f.files?.[0]) host.importFile(f.files[0]); };
  // les options : langue, musique, tutoriel, carte, import (les crédits sont dans les paramètres du jeu)
  $('.mGear', ov).onclick = () => {
    const { ov: m, close } = menuPop(root, 'menuOpts', 'options', tr('Options'), `
      <div class="row"><span class="popKey">${popIc('langue')}<label>${tr('Langue')}</label></span>${langPicker(getLang(), 'mLang')}</div>
      <div class="row mMusic"><span class="popKey">${ic('volume', 26)}<label for="mVol">${tr('Musique')}</label></span><input id="mVol" type="range" min="0" max="1" step="0.05" value="${host.music.vol}"><button class="mMute${host.music.muted ? ' active' : ''}" aria-label="${tr('Couper la musique')}" title="${tr('Couper la musique')}">${ic(host.music.muted ? 'mute' : 'volume', 18)}</button></div>
      <div class="row mTuto"><span class="popKey">${popIc('tutoriel')}<label>${tr('Tutoriel')}</label></span></div>
      ${MAPS.length > 1 ? `<div class="row"><span class="popKey"><label for="mMapSel">${tr('Carte')}</label></span><select id="mMapSel">${MAPS.map((x) => `<option value="${x.id}"${x.id === map ? ' selected' : ''}>${x.name}</option>`).join('')}</select></div>` : ''}
      <div class="mBtns"><button class="mImport">${popIc('importer')}${tr('Importer une sauvegarde')}</button></div>`);
    // la musique de l'accueil : le curseur s'entend aussitôt ; le bouton la coupe ou la rend
    const vol = $<HTMLInputElement>('#mVol', m), mute = $<HTMLButtonElement>('.mMute', m);
    vol.oninput = () => host.music.setVol(+vol.value);
    mute.onclick = () => {
      host.music.setMuted(!host.music.muted);
      mute.innerHTML = ic(host.music.muted ? 'mute' : 'volume', 18);
      mute.classList.toggle('active', host.music.muted);
    };
    // le tutoriel guidé, pour la partie qu'on lance
    $('.mTuto', m).appendChild(menuToggle());
    const sel = m.querySelector<HTMLSelectElement>('#mMapSel');
    if (sel) sel.onchange = () => { map = +sel.value; draw(); };
    $('.mImport', m).onclick = () => { close(); f.click(); };
    // la langue change à chaud : l'accueil est redessiné dans la nouvelle langue
    // les options se rouvrent aussitôt dans la nouvelle langue, sans animation : elles restent ouvertes pour le joueur
    bindLangPicker(m, () => {
      close(); ov.remove();
      $<HTMLButtonElement>('.mGear', showMenu(root, host, map)).click();
      const pop = [...root.querySelectorAll<HTMLElement>('.menuOpts')].pop();
      if (pop) pop.style.animation = 'none';
    });
  };
  // Échap ferme la fenêtre ouverte par-dessus l'accueil (le clavier du jeu n'est pas encore branché)
  const onKey = (e: KeyboardEvent) => {
    if (!ov.isConnected) { window.removeEventListener('keydown', onKey); return; }
    if (e.key !== 'Escape') return;
    const top = [...root.querySelectorAll<HTMLElement & { close?: () => void }>('.overlay:not(#menu)')].pop();
    top?.close?.();
  };
  window.addEventListener('keydown', onKey);
  root.appendChild(ov);
  return ov;
}

/** Les images des fenêtres de l'accueil (public/menu/popup/) */
const POP = './menu/popup/';
const popIc = (f: string, cls = 'popIc') => `<img class="${cls}" src="${POP}icone_${f}.webp" alt="" decoding="async">`;
/** l'icône de chaque âge, dans l'ordre de AGES */
const AGE_ICON = ['prehistoire', 'antiquite', 'medieval', 'industriel', 'moderne', 'futuriste'];

/**
 * Fenêtre de l'accueil (options, âge de départ, confirmation) : fond crème bordé d'or, petites montagnes au-dessus,
 * paysage peint en bas (montagnes lointaines, prairie). `icon` : le losange du titre (un fichier icone_*.webp) ; `sub` : sous-titre.
 * Sert aussi en jeu (les paramètres) : le style vaut pour toute fenêtre `.cePop` de #ui
 */
export function menuPop(root: HTMLElement, cls: string, icon: string, title: string, body: string, onClose?: () => void, sub = '') {
  const head = `<span class="popTi">${title}${sub ? `<small>${sub}</small>` : ''}</span>`;
  const r = modal(root, `cePop ${cls}`, icon ? `${popIc(icon, 'popBadge')}${head}` : title, body, onClose);
  $('.modal', r.ov).insertAdjacentHTML('afterbegin', `<img class="popCrest" src="${POP}montagnes_entete.webp" alt="" aria-hidden="true">`
    + `<div class="popLand" aria-hidden="true"><img class="popFar" src="${POP}montagnes_lointaines.webp" alt=""><img class="popMeadow" src="${POP}prairie_collines.webp" alt=""></div>`);
  return r;
}

/** Confirmation sur l'accueil (une sauvegarde va être écrasée) : l'avertissement, le message, « Annuler » et `ok` */
function menuConfirm(root: HTMLElement, message: string, ok: string): Promise<boolean> {
  return new Promise((resolve) => {
    let r = false;
    const { ov, close } = menuPop(root, 'menuConfirm', '', '',
      `${popIc('avertissement', 'popWarn')}<p class="popMsg"></p><div class="popFoot"><button data-r="0">${tr('Annuler')}</button><button data-r="1">${ic('play', 15, 2)}${ok}</button></div>`, () => resolve(r));
    ov.style.zIndex = '40';
    $('.popMsg', ov).textContent = tr(message);
    ov.querySelectorAll<HTMLButtonElement>('[data-r]').forEach((b) => (b.onclick = () => { r = b.dataset.r === '1'; close(); }));
  });
}

/** La souris dessinée de la fenêtre des contrôles (le bouton gauche en or) */
const MOUSE_SVG = '<svg viewBox="0 0 48 64" width="44" height="58" aria-hidden="true"><rect x="6" y="4" width="36" height="56" rx="18" fill="#fffaf0" stroke="#7a5a32" stroke-width="3"/><path d="M24 4v20M6 24h36" stroke="#7a5a32" stroke-width="3"/><path d="M8.5 22V22a15.5 15.5 0 0 1 14-17v17z" fill="#e9b949"/><path d="M30 34l8 0M34 30l4 4-4 4" stroke="#7a5a32" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/** Les touches de la vue, en croix comme sur le clavier (la ligne du haut : tourner, avancer, tourner) */
const keyCaps = (l: KbLayout) => { const k = layoutKeys(l); return `<span class="kcaps"><span><kbd class="t">${k.turn[0]}</kbd><kbd>${k.move[0]}</kbd><kbd class="t">${k.turn[1]}</kbd></span><span><kbd>${k.move[1]}</kbd><kbd>${k.move[2]}</kbd><kbd>${k.move[3]}</kbd></span></span>`; };
/** La phrase de chaque façon de déplacer la vue (fenêtre du premier lancement, paramètres) */
export const controlText = (m: CamControl, l: KbLayout) => {
  const k = layoutKeys(l);
  return m === 'mouse'
    ? tr('Approchez la souris du bord de l’écran pour faire défiler la vue. Avec l’outil Voir, faites glisser le terrain.')
    : tr('{move} déplacent la vue, {turn} la tournent.', { move: k.move.join(''), turn: k.turn.join(' / ') });
};

/**
 * Comment déplacer la vue : à la souris ou au clavier (ZQSD en AZERTY, WASD en QWERTY). Au premier lancement (`first`), le
 * bouton dit « Jouer » ; fermer la fenêtre garde le choix en cours
 */
export function chooseControls(root: HTMLElement, cur: Controls, first = false): Promise<Controls> {
  return new Promise((resolve) => {
    const c: Controls = { ...cur };
    const { ov, close } = menuPop(root, 'ctlPick', 'options', tr('Déplacer la vue'), `
      <div class="ctlCards">
        <button type="button" class="ctlCard" data-m="mouse"><span class="ctlArt">${MOUSE_SVG}</span><b>${tr('À la souris')}</b><span class="ctlTxt"></span></button>
        <button type="button" class="ctlCard" data-m="keys"><span class="ctlArt"></span><b>${tr('Au clavier')}</b><span class="ctlTxt"></span></button>
      </div>
      <div class="ctlLay"><span>${tr('Votre clavier')}</span><button type="button" data-l="azerty">AZERTY</button><button type="button" data-l="qwerty">QWERTY</button></div>
      <p class="hint">${tr('Dans les deux cas : la molette zoome, le clic droit glissé tourne la vue, les flèches la déplacent. Vous pourrez changer d’avis dans Paramètres › Partie.')}</p>
      <div class="popFoot"><button type="button" data-ok data-r="1">${ic('play', 15, 2)}${tr(first ? 'Jouer' : 'Valider')}</button></div>`,
    () => resolve(c), first ? tr('Choisissez comment vous déplacez la vue.') : '');
    ov.style.zIndex = '40';
    const draw = () => {
      ov.querySelectorAll<HTMLButtonElement>('[data-m]').forEach((b) => { b.classList.toggle('on', b.dataset.m === c.mode); b.setAttribute('aria-pressed', String(b.dataset.m === c.mode)); $('.ctlTxt', b).textContent = controlText(b.dataset.m as CamControl, c.layout); });
      ov.querySelectorAll<HTMLButtonElement>('[data-l]').forEach((b) => { b.classList.toggle('on', b.dataset.l === c.layout); b.setAttribute('aria-pressed', String(b.dataset.l === c.layout)); });
      $('[data-m="keys"] .ctlArt', ov).innerHTML = keyCaps(c.layout);
      ($('.ctlLay', ov) as HTMLElement).classList.toggle('dim', c.mode !== 'keys');
    };
    ov.querySelectorAll<HTMLButtonElement>('[data-m]').forEach((b) => { b.onclick = () => { c.mode = b.dataset.m as CamControl; draw(); }; b.ondblclick = () => close(); });
    ov.querySelectorAll<HTMLButtonElement>('[data-l]').forEach((b) => (b.onclick = () => { c.layout = b.dataset.l as KbLayout; c.mode = 'keys'; draw(); }));
    $('[data-ok]', ov).onclick = () => close();
    draw();
  });
}

/** Bac à sable : l'âge où commence la partie ; null si le joueur renonce */
function pickAge(root: HTMLElement): Promise<number | null> {
  return new Promise((resolve) => {
    let age: number | null = null;
    const btns = AGES.map((a, i) => `<button type="button" class="ageBtn" data-a="${i}" aria-pressed="${i === 0}">${AGE_ICON[i] ? popIc(`epoque_${AGE_ICON[i]}`) : ''}${a.name}</button>`).join('');
    const { ov, close } = menuPop(root, 'agePick', 'age_calendrier', DIFF_TEXT.startAge,
      `<p class="hint">${DIFF_TEXT.points.sandbox[0]}</p><div class="ageBtns">${btns}</div>`, () => resolve(age));
    ov.querySelectorAll<HTMLButtonElement>('.ageBtn').forEach((b) => (b.onclick = () => { age = +b.dataset.a!; close(); }));
  });
}
export type { SaveData };
