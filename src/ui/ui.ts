import { ToolController, ToolId, SCULPT_TOOLS, VEG_TOOLS, SINGLE_TOOLS, RoadMode } from '../build/tools';
import { KINDS, KIND_ORDER, AGES, KindId, KindDef, SEASONS, BUILD_CATS, BuildCat, sizeOf, UPGRADES } from '../build/catalog';
import { Sim, NeedId } from '../sim/sim';
import type { Agents } from '../sim/agents';
import { GameTime } from '../core/time';
import { Environment, WeatherKind } from '../render/env';
import { AudioEngine } from '../audio/audio';
import { CameraRig } from '../core/camera';
import { loadSlot, SaveData } from '../save/save';
import { MAPS, genHeights, newSeed } from '../world/mapgen';
import { Expeditions, Report, ActiveExpedition, partyLimit } from '../sim/expeditions';
import { Railway, Train, isStation } from '../sim/railway';
import type { RailEditState } from '../build/trackEdit';
import { effectSummary, mandatoryFor, DestKind, Mission, MISSIONS, redoEffects, REDO_DAYS, penHerds, choiceAt } from '../sim/missions';
import type { World } from '../world/world';
import { GEAR, GEAR_BY, GearId, DANGER_NAME, DANGER_VS, dangersOf, gearCost, gearCostLabel } from '../sim/gear';
import { CAMP_QUESTS } from '../sim/depths';
import { priceIn, canPay, costLabel, Resource, PRODUCERS, YIELD, REFINE_CRUDE, FUEL_PER_CRUDE } from '../sim/economy';
import { Difficulty, DIFFICULTIES, DIFF_TEXT, readDifficulty, rulesOf } from '../sim/difficulty';
import { TEAM_COLORS } from '../render/expeditionView';
import { ic, KIND_ICON, CAT_ICON, SEASON_ICONS } from './icons';
import { type Tutorial, menuToggle } from './tutorial';

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
  newGame(difficulty: Difficulty): void;
  toMenu(): void;
  setPhoto(on: boolean): void;
  capture(): void;
  /** monde souterrain : descendre par l'entrée la plus proche, remonter, poser des torches */
  enterNearest(): void;
  exitUnder(): void;
  torchMode: boolean;
  underZone(): string | null;
  /** brouillard visible (0 … 1), et le dissiper */
  fogLevel(): number;
  dispelFog(): void;
  /** qualité graphique et catastrophes naturelles */
  quality: 'high' | 'medium' | 'low';
  setQuality(q: 'high' | 'medium' | 'low'): void;
  disasters: boolean;
  setDisasters(on: boolean): void;
  autoRoads: boolean;
  setAutoRoads(on: boolean): void;
  /** expéditions, et celle que la caméra suit (son numéro) */
  expeditions: Expeditions;
  /** chemin de fer de la gare à l'avant-poste, et la caméra qui suit le train */
  railway: Railway;
  followTrain(line: number): void;
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
  /** plus de points de passage : la voie se pose d'elle-même ; ce qui empêche de valider le tracé (null : rien) */
  railAuto(): void;
  railTrouble(): string | null;
  agents: Agents;
  following: number | null;
  follow(id: number | null): void;
  /** la vue revient sur le village (une seconde fois : vue d'ensemble) */
  goHome(): void;
}

const DEST_ICON: Record<DestKind, string> = { plain: '🌾 plaine', forest: '🌲 forêt', river: '🏞️ rivière', mountain: '⛰️ montagne', cave: '🕳️ grotte', far: '🧭 au loin', spaceport: '🚀 cosmodrome' };
/** Où en est le train d'une ligne, en clair */
function trainWhere(r: Railway, tr: Train) {
  if (tr.why) return tr.why;
  const st = tr.stops[tr.at], name = st ? r.stopName(st.b) : '';
  if (tr.phase === 'dwell') {
    const dir = tr.at + tr.dir < 0 || tr.at + tr.dir >= tr.stops.length ? -tr.dir : tr.dir, nx = tr.stops[tr.at + dir];
    return tr.waiting && nx ? `à quai à ${name}, attend que le quai de ${r.stopName(nx.b)} se libère` : `à quai à ${name}`;
  }
  const next = tr.stops[tr.at + tr.dir];
  return next ? `de ${name} vers ${r.stopName(next.b)}` : `parti de ${name}`;
}
const dot = (c: number) => `<i class="lineDot" style="background:${hex(c)}"></i>`;
const riskLabel = (r: number) => (r <= 0.12 ? 'faible' : r <= 0.22 ? 'mesuré' : r <= 0.32 ? 'élevé' : 'très élevé');
const pct = (r: number) => `${Math.round(r * 100)} %`;
const workLabel = (s: number) => (s <= 15 ? 'courte' : s <= 23 ? 'moyenne' : 'longue');
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
  garden: { icon: 'spring', label: 'Jardin', key: '8' },
  biome: { icon: 'palette', label: 'Biome' },
  rocks: { icon: 'rock', label: 'Rochers' },
  cave: { icon: 'cave', label: 'Grotte' },
  fissure: { icon: 'crack', label: 'Faille' },
  erase: { icon: 'eraser', label: 'Gomme', key: '9' },
  road: { icon: 'road', label: 'Route', key: 'R' },
  bulldoze: { icon: 'demolish', label: 'Démolir', key: 'X' },
  move: { icon: 'hand', label: 'Déplacer', key: 'M' },
};

/** À quoi sert chaque outil (fiche au survol) */
const TOOL_DESC: Record<string, string> = {
  none: 'Regarder le village. Un clic sur un volcan le réveille, sur une grotte ou une faille on descend sous terre.',
  raise: 'Monter le terrain sous le pinceau.', lower: 'Baisser le terrain sous le pinceau.', flatten: 'Aplanir à la hauteur du premier clic.',
  cliff: 'Tailler des falaises nettes, en gradins.', dig: 'Creuser sous le niveau de l’eau : mares, rivières, lacs.',
  mountain: 'Faire pousser une montagne, avec ses neiges éternelles si elle est haute.', volcano: 'Poser un volcan (un clic) : plus le pinceau est large, plus il est haut.',
  forest: 'Planter une forêt : bois et bien-être.', field: 'Semer des champs : ils nourrissent le village.', garden: 'Un jardin : un lieu de rencontre qui change avec les âges et selon sa taille.',
  biome: 'Peindre un biome (tempéré, taïga, désert, tropical, marais) ou rendre la terre à son climat : le sol, les arbres, l’herbe, les bêtes et la neige suivent.',
  rocks: 'Poser des rochers (un clic).', cave: 'Ouvrir une grotte vers le monde souterrain (un clic).', fissure: 'Ouvrir une faille vers le monde souterrain (un clic).',
  erase: 'Effacer forêts, champs, jardins et rochers.',
  road: 'Tracer une route : en ligne, en glissant case par case ; en libre, d’un clic au point A puis au point B, une belle courbe qui contourne les obstacles (R pour changer de mode). Sur l’eau peu profonde, elle devient un pont.',
  bulldoze: 'Démolir un bâtiment, une route ou un décor.', move: 'Ramasser un bâtiment pour le reposer ailleurs (Échap pour annuler).',
};

/** Le jardin change de nature avec les âges : son nom, son icône et sa fiche aussi */
const GARDEN_BY_AGE: { icon: string; label: string; desc: string }[] = [
  { icon: 'campfire', label: 'Campement', desc: 'Un campement : lieu de rassemblement autour des feux, tipis, séchoirs et taille du silex.' },
  { icon: 'spring', label: 'Jardin', desc: 'Un jardin à l’antique : pelouse, bassin, cyprès, oliviers et bancs de marbre.' },
  { icon: 'shield', label: 'Lices', desc: 'Des lices : sur une zone longue, un tournoi où deux chevaliers joutent devant les gradins ; sur une petite zone, quintaine et tir à l’arc.' },
  { icon: 'leaf', label: 'Jardin public', desc: 'Un jardin public : à la française sur un terrain rectangulaire, à l’anglaise (étang, kiosque) sur une zone aux contours libres.' },
  { icon: 'slide', label: 'Parc', desc: 'Un parc et son aire de jeux : toboggan, balançoires, bascule, tourniquet, bac à sable.' },
];
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
  { id: 'relief', icon: 'relief', label: 'Relief', hint: 'Sculptez le terrain', tools: ['raise', 'lower', 'flatten', 'cliff', 'dig', 'mountain', 'volcano'] },
  { id: 'nature', icon: 'tree', label: 'Nature', hint: 'Plantez et décorez', tools: ['forest', 'field', 'garden', 'biome', 'rocks', 'cave', 'fissure', 'erase'] },
  { id: 'build', icon: 'houses', label: 'Bâtir', hint: '', tools: [] as string[] },
];

/** Besoins du village, dans l'ordre de la barre du haut */
const NEEDS: { k: 'food' | 'water' | 'housing' | 'jobs' | 'joy' | 'health'; icon: string; label: string }[] = [
  { k: 'food', icon: 'bread', label: 'Nourriture' }, { k: 'water', icon: 'drop', label: 'Eau' }, { k: 'housing', icon: 'house', label: 'Logement' },
  { k: 'jobs', icon: 'hammer', label: 'Travail' }, { k: 'joy', icon: 'smile', label: 'Bien-être' }, { k: 'health', icon: 'heart', label: 'Santé' },
];
/** Ce qu'un bâtiment apporte, pour sa fiche et sa vignette */
const GIVES: { k: 'housing' | 'food' | 'water' | 'jobs' | 'joy' | 'health'; icon: string; label: string; one?: string }[] = [
  { k: 'housing', icon: 'house', label: 'logements', one: 'logement' }, { k: 'food', icon: 'bread', label: 'nourriture' }, { k: 'water', icon: 'drop', label: 'eau' },
  { k: 'jobs', icon: 'hammer', label: 'emplois', one: 'emploi' }, { k: 'joy', icon: 'smile', label: 'bien-être' }, { k: 'health', icon: 'heart', label: 'santé' },
];
/** Fiche d'une ressource : son icône, à quoi elle sert, comment en avoir plus, et le bâtiment qui la produit */
const RES_META: Record<Resource, { label: string; icon: string; use: string; more: string; kind: KindId }> = {
  wood: { label: 'Bois', icon: 'tree', kind: 'lumber', use: 'Sert à bâtir les grands bâtiments.', more: 'Un bûcheron, posé en lisière ou dans une forêt, en coupe chaque jour. Pas de forêt ? Plantez-en une (Nature › Forêt).' },
  stone: { label: 'Pierre', icon: 'rock', kind: 'quarry', use: 'Sert à bâtir les grands bâtiments.', more: 'Une carrière, posée près des rochers ou dans la montagne, en taille chaque jour. Pas de rochers ? Posez-en (Nature › Rochers). La mine en donne aussi.' },
  ore: { label: 'Minerai', icon: 'pickaxe', kind: 'mine', use: 'Sert à passer les âges et à fabriquer l’équipement des expéditions.', more: 'La mine, creusée dans la montagne, en donne chaque jour ; les expéditions armées en remontent du monde souterrain.' },
  crude: { label: 'Pétrole brut', icon: 'crude', kind: 'oilwell', use: 'La raffinerie en fait du carburant.', more: 'Un puits de pétrole se fore sur un gisement : les taches sombres où le brut suinte.' },
  fuel: { label: 'Carburant', icon: 'fuel', kind: 'refinery', use: 'Fait rouler les blindés de l’expédition armée.', more: 'La raffinerie en tire du pétrole brut des puits.' },
};

/** Une condition d'âge sans bâtiment : le minerai, l'expédition obligatoire ou les habitants */
const reqOf = (label: string) => (label.startsWith('expédition') ? 'exp' : label.includes('minerai') ? 'ore' : 'pop');

/** « +1 emploi », « +3 emplois » */
const give = (g: (typeof GIVES)[number], v: number) => `+${num(v)} ${v < 2 && g.one ? g.one : g.label}`;
/** une décimale quand il y en a une (« 2,4 » de bien-être ne s'affiche plus « 2 » en rouge) */
const num = (v: number) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1));
/** Ce que demande chaque besoin, en clair, pour sa fiche */
const NEED_RULE: Record<NeedId, string> = {
  housing: 'Chaque habitant occupe une place. Le village grandit tant qu’il reste des places libres et que les autres besoins sont comblés.',
  food: 'Chaque habitant mange une part (une part et quart en défi), plus une part de réserve pour le village ; on compte en parts entières.',
  water: 'Chaque habitant boit une part, plus une part de réserve pour le village.',
  jobs: 'À partir de 6 habitants, la moitié d’entre eux cherche du travail.',
  joy: 'À partir de 6 habitants, chacun demande 0,3 de bien-être.',
  health: 'À partir de 15 habitants, chacun demande 0,2 de soins.',
};
/** Apport principal d'un bâtiment, sur sa vignette */
const MAIN: (typeof GIVES)[number]['k'][] = ['housing', 'food', 'water', 'health', 'joy', 'jobs'];

const WEATHER_ICON: Record<WeatherKind, string> = { clear: '', rain: 'rain', snow: 'snow', fog: 'fog' };

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

/** Confirmation dans le jeu (le confirm() natif est bloqué dans certains navigateurs intégrés) */
export function confirmBox(root: HTMLElement, message: string, ok = 'Confirmer'): Promise<boolean> {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.style.zIndex = '40';
    ov.innerHTML = `<div class="modal panel" style="max-width:380px"><p></p><div class="row"><span class="grow"></span><button data-r="0">Annuler</button><button data-r="1" class="active">${ok}</button></div></div>`;
    $('p', ov).textContent = message;
    const done = (r: boolean) => { ov.remove(); resolve(r); };
    ov.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => done(b.dataset.r === '1')));
    ov.addEventListener('pointerdown', (e) => { if (e.target === ov) done(false); });
    root.appendChild(ov);
  });
}

/**
 * Choix de la difficulté d'une nouvelle partie : trois cartes (celle de `current` choisie d'avance), puis « Commencer » ;
 * `note` prévient de ce qui sera écrasé. Rend la difficulté choisie, ou null si le joueur renonce
 */
export function chooseDifficulty(root: HTMLElement, opts: { current?: Difficulty; note?: string; ok?: string } = {}): Promise<Difficulty | null> {
  const T = DIFF_TEXT;
  let pick: Difficulty = opts.current ?? 'normal';
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.style.zIndex = '40';
    ov.innerHTML = `<div class="modal panel diffpick"><div class="mtitle"><h3>${ic('target', 22)} ${T.choose}</h3></div><p class="hint">${T.chooseSub}</p>
      <div class="diffs">${DIFFICULTIES.map((d) => `<button class="diff ${d}" data-d="${d}" aria-pressed="${d === pick}"><b>${ic(T.icon[d], 30, 1.6)}</b><strong>${T.name[d]}</strong><em>${T.tagline[d]}</em><ul>${T.points[d].map((x) => `<li>${x}</li>`).join('')}</ul></button>`).join('')}</div>
      ${opts.note ? `<p class="hint warn">${ic('alert', 14, 2)}${opts.note}</p>` : ''}
      <div class="row foot"><span class="grow"></span><button data-r="0">${T.cancel}</button><button data-r="1" class="active">${opts.ok ?? T.start}</button></div></div>`;
    const done = (r: Difficulty | null) => { ov.remove(); resolve(r); };
    ov.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => {
      b.onclick = () => { pick = b.dataset.d as Difficulty; ov.querySelectorAll('[data-d]').forEach((x) => x.setAttribute('aria-pressed', `${x === b}`)); };
      b.ondblclick = () => done(b.dataset.d as Difficulty);
    });
    ov.querySelectorAll<HTMLButtonElement>('[data-r]').forEach((b) => (b.onclick = () => done(b.dataset.r === '1' ? pick : null)));
    ov.addEventListener('pointerdown', (e) => { if (e.target === ov) done(null); });
    root.appendChild(ov);
  });
}

/** Fenêtre du jeu : titre, contenu, bouton de fermeture ; se ferme aussi d'un clic à côté */
function modal(root: HTMLElement, cls: string, title: string, body: string, onClose?: () => void): { ov: HTMLElement; close: () => void } {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal panel ${cls}"><div class="mtitle"><h3>${title}</h3><button class="x" title="Fermer" aria-label="Fermer">${ic('close', 16, 2)}</button></div>${body}</div>`;
  root.appendChild(ov);
  // Échap ferme la fenêtre du dessus (voir closeTop)
  (ov as HTMLElement & { close?: () => void }).close = () => close();
  const close = () => { if (!ov.isConnected) return; ov.remove(); onClose?.(); };
  ov.addEventListener('pointerdown', (e) => { if (e.target === ov) close(); });
  $('.x', ov).onclick = close;
  return { ov, close };
}

/** Onglet auquel appartient un outil ('none' reste dans l'onglet courant) */
const tabOfTool = (tool: ToolId, current: string) =>
  SCULPT_TOOLS.includes(tool) ? 'relief' : VEG_TOOLS.includes(tool) || tool === 'biome' ? 'nature' : tool === 'none' ? current : 'build';

/** Ce que change un bâtiment débloqué par une expédition, dit au retour de l'équipe */
const UNLOCK_NOTE: Partial<Record<KindId, string>> = {
  pen: ' Les bêtes ramenées y vivront.', stable: ' Les chevaux ramenés y vivront.', mine: ' Elle rapportera du minerai chaque jour.',
  outpost: ' Bâtissez-le tout contre une grotte ou une faille : sa garnison tiendra les galeries dessous, et les expéditions armées partiront de là.',
  carworks: ' Les automobiles remplacent désormais les charrettes sur les routes ; les écuries gardent leurs chevaux pour la cavalerie.',
  aerodrome: ' Montgolfières et dirigeable prendront l’air depuis son terrain.',
};

export class UI {
  root: HTMLElement;
  tab = 'build';
  /** rayon ouvert de la barre de construction */
  cat: BuildCat = 'home';
  private lastAge = -1;
  /** le besoin dont la fiche est ouverte */
  private needOpen: NeedId | null = null;
  /** ressource dont la fiche est ouverte (même panneau que celle d'un besoin) */
  private resOpen: Resource | null = null;
  private toastTimer = 0;
  private bannerTimer = 0;
  /** bâtiment ou outil survolé dans la barre (sa fiche s'affiche) */
  private hover: { kind?: KindId; tool?: string } | null = null;
  /** fiche du bâtiment sélectionné : redessinée seulement quand il change */
  private selKey = '';
  /** cartes des expéditions en cours, par numéro */
  private expCards = new Map<number, HTMLElement>();
  private incCards = new Map<string, HTMLElement>();
  /** tutoriel guidé (sa ligne dans les réglages) */
  tutorial: Tutorial | null = null;

  constructor(root: HTMLElement, private host: UIHost) {
    this.root = root;
    root.innerHTML = `
      <header id="hud">
        <div id="agePanel" class="panel" title="Voir ce qu'il faut pour l'âge suivant">
          <div class="ageTop"><b id="ageName"></b><em id="agePct"></em><small id="ageSub"></small></div>
          <div class="bar ageGauge"><i id="ageBar"></i></div>
          <div id="ageNext"></div>
          <button id="ageGo" hidden></button>
          <div id="ageReq"></div>
        </div>
        <div id="needsPanel" class="panel">
          <div class="needsRow"><div id="needs"></div><div id="res"></div></div>
          <div id="msg"></div>
        </div>
        <div id="timePanel" class="panel">
          <div id="clock"></div>
          <button id="bPause" title="Pause (Espace)" aria-label="Pause">${ic('pause', 18, 2.2)}</button>
          <button id="bSpeed" title="Vitesse">×1</button>
          <button id="bFog" title="Dissiper le brouillard" aria-label="Dissiper le brouillard" hidden>${ic('fog', 18, 2)}</button>
        </div>
        <nav id="menuBtns" class="panel">
          <button id="bExp" title="Expéditions" aria-label="Expéditions">${ic('compass')}<span id="expBadge"></span></button>
          <button id="bPhoto" title="Mode photo (P)" aria-label="Mode photo">${ic('camera')}</button>
          <button id="bSettings" title="Réglages" aria-label="Réglages">${ic('gear')}</button>
        </nav>
      </header>
      <div id="expList"></div>
      <div id="underBar" class="panel">
        <div id="underZone"></div>
        <button id="campQuest" title="Quêtes du camp souterrain"></button>
        <button id="bTorch" title="Poser ou retirer des torches (T)">${ic('flame', 18)} Torches</button>
        <button id="bUp" title="Remonter à la surface (U)">${ic('up', 18)} Remonter</button>
      </div>
      <div id="selCard" class="panel"></div>
      <div id="railEdit" class="panel"></div>
      <div id="fade"></div>
      <footer id="dock">
        <div id="info" class="panel"></div>
        <div id="dockMain" class="panel">
          <div id="dockTop">
            <div class="quick" id="quickL"></div>
            <div id="modes"></div>
            <div class="quick" id="quickR">
              <button id="bUndo" title="Annuler (Ctrl+Z)" aria-label="Annuler">${ic('undo', 17, 2)}</button>
              <button id="bRedo" title="Rétablir (Ctrl+Y)" aria-label="Rétablir">${ic('redo', 17, 2)}</button>
              <button id="bRot" title="Tourner le bâtiment (R)" aria-label="Tourner le bâtiment">${ic('rotate', 17, 2)}</button>
              <button id="bHome" title="Revenir au village (V) — une seconde fois : vue d'ensemble" aria-label="Revenir au village">${ic('target', 17, 2)}</button>
              <button id="bUnder" title="Explorer le monde souterrain (U)" aria-label="Monde souterrain">${ic('pickaxe', 17, 2)}</button>
            </div>
          </div>
          <div id="items"></div>
          <div id="dockBottom">
            <div id="subcats"></div>
            <div id="biomes"></div>
            <div id="roadModes"></div>
            <div id="brush"><span>Taille du pinceau</span><input id="rad" type="range" min="1" max="8" step="0.5" value="3"><b id="radv">3</b></div>
          </div>
        </div>
      </footer>
      <div id="toast"></div>
      <div id="bannerWrap"><div id="banner" class="panel"><h2></h2><p></p></div></div>
      <div id="photoBar" class="panel"><button id="pCap">${ic('camera', 18)} Capturer</button><button id="pExit">Quitter</button></div>
    `;
    // dans les bandeaux qui défilent de côté (vignettes de la barre de construction, rayons…), la molette les fait défiler
    // horizontalement ; une liste qui défile de haut en bas garde son défilement habituel
    root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b && e.detail > 0) setTimeout(() => b.blur(), 0);
    });
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
    $('#needs').innerHTML = NEEDS.map((n) => `<div class="need" id="n-${n.k}"><b>${ic(n.icon, 20)}</b><div class="bar"><i></i></div><span>${n.label}</span></div>`).join('')
      + `<button class="pop" id="pop" title="État des habitants" aria-label="État des habitants" aria-expanded="false">0<small>habitants</small></button>`;
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
    for (const n of NEEDS) $('#n-' + n.k).onclick = () => { this.needOpen === n.k ? this.closeNeed() : this.openNeed(n.k); this.host.audio.sfxClick(); };
    // fiche d'une ressource : un clic sur son stock (d'où elle vient, à quoi elle sert, quoi bâtir pour en avoir plus)
    $('#res').onclick = (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.res[data-r]');
      if (!el) return;
      const r = el.dataset.r as Resource;
      if (this.resOpen === r) this.closeNeed(); else this.openRes(r);
      this.host.audio.sfxClick();
    };
    needInfo.onclick = (e) => {
      const k = (e.target as HTMLElement).closest<HTMLElement>('[data-kind]')?.dataset.kind as KindId | undefined;
      if (k) { this.closeNeed(); this.pick(k); }
    };
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as HTMLElement;
      if (!census.hidden && !census.contains(t) && !t.closest('#pop')) this.closeCensus();
      if ((this.needOpen || this.resOpen) && !needInfo.contains(t) && !t.closest('.need, .res')) this.closeNeed();
    });

    $('#agePanel').onclick = (e) => {
      // le passage à l'âge suivant, quand tout est prêt
      if ((e.target as HTMLElement).closest('#ageGo')) { this.host.sim.advance(); return; }
      // une condition qui demande un bâtiment : on le prend en main (le bon onglet et le bon rayon s'ouvrent)
      const k = (e.target as HTMLElement).closest<HTMLElement>('[data-kind]')?.dataset.kind as KindId | undefined;
      if (k) { this.pick(k); return; }
      // une condition sans bâtiment : on montre comment l'obtenir
      const req = (e.target as HTMLElement).closest<HTMLElement>('[data-req]')?.dataset.req;
      if (req === 'ore') { this.openRes('ore'); return; }
      if (req === 'exp') { this.openExpeditions(); return; }
      if (req === 'pop') { this.openNeed('housing'); return; }
      $('#agePanel').classList.toggle('open');
    };
    // le conseil du moment parle d'un bâtiment : un clic le prend en main
    $('#msg').onclick = () => { const k = this.host.sim.messageKind; if (k) this.pick(k); else if (this.host.sim.ready) this.host.sim.advance(); };
    $('#bPause').onclick = () => { host.time.paused = !host.time.paused; host.audio.sfxClick(); };
    $('#bFog').onclick = () => { host.dispelFog(); host.audio.sfxClick(); this.toast('Le brouillard se lève.'); };
    $('#bSpeed').onclick = () => {
      const seq = [1, 2, 4];
      host.time.speed = seq[(seq.indexOf(host.time.speed) + 1) % seq.length] ?? 1;
      host.applySettings();
    };
    $('#bSettings').onclick = () => this.openSettings();
    $('#bExp').onclick = () => this.openExpeditions();
    $('#bPhoto').onclick = () => host.setPhoto(true);
    $('#pExit').onclick = () => host.setPhoto(false);
    $('#pCap').onclick = () => host.capture();
    $('#bUndo').onclick = () => host.tools.undo();
    $('#bRedo').onclick = () => host.tools.redo();
    $('#bRot').onclick = () => host.tools.rotate();
    $('#bHome').onclick = () => { host.goHome(); host.audio.sfxClick(); };
    $('#bUnder').onclick = () => host.enterNearest();
    $('#bUp').onclick = () => host.exitUnder();
    $('#campQuest').onclick = () => this.openExpeditions('depths');
    $('#bTorch').onclick = () => { host.torchMode = !host.torchMode; host.audio.sfxClick(); this.update(); };
    $('#biomes').innerHTML = BIOME_CHOICES.map((c) => `<button data-b="${c.b ?? ''}" title="${c.b === null ? 'Rendre la terre au biome de son climat' : `Peindre : ${c.label.toLowerCase()}`}"><i style="background:${c.color}"></i>${c.label}</button>`).join('');
    $('#biomes').onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-b]');
      if (!b) return;
      this.host.tools.biomeKind = b.dataset.b === '' ? null : Number(b.dataset.b);
      this.host.audio.sfxClick();
      this.refreshTools();
    };
    // l'outil Route : tracer en ligne (en glissant) ou en libre (d'un point A à un point B, en courbe)
    $('#roadModes').innerHTML = `<span>Tracé</span>${ROAD_MODES.map((m) => `<button data-m="${m.id}" title="${m.title}">${ic(m.icon, 15, 2)}${m.label}</button>`).join('')}`;
    $('#roadModes').onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-m]');
      if (!b) return;
      this.host.tools.setRoadMode(b.dataset.m as RoadMode);
      this.host.audio.sfxClick();
    };
    const rad = $<HTMLInputElement>('#rad');
    rad.oninput = () => { host.tools.radius = +rad.value; $('#radv').textContent = rad.value; };

    this.renderDock();
  }

  // ---------------- Barre du bas (façon Anno 1800) ----------------
  /**
   * En haut, les outils rapides (voir, route, démolir, déplacer), les grands onglets (Relief, Nature, Bâtir) en relief au
   * milieu, l'historique et la vue à droite ; au centre, les vignettes ; en bas, les rayons de construction ou le pinceau
   */
  private renderDock() {
    const modes = $('#modes');
    modes.innerHTML = TABS.map((t) => `<button data-t="${t.id}" class="${t.id === this.tab ? 'active' : ''}" title="${t.label}${t.id === this.tab ? ' — recliquer pour replier ou déplier la barre' : ''}"><b>${ic(t.icon, 20)}</b><span>${t.label}</span></button>`).join('');
    modes.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => {
      // l'onglet déjà ouvert : un clic replie la barre (ou la rouvre), pour laisser la place à la carte
      if (b.dataset.t === this.tab) { document.body.classList.toggle('dockMin'); this.host.audio.sfxClick(); return; }
      document.body.classList.remove('dockMin');
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
      b.onclick = () => { this.host.tools.setTool(id as ToolId); this.host.audio.sfxClick(); };
      b.onpointerenter = (e) => { if (e.pointerType === 'mouse') { this.hover = { tool: id }; this.renderInfo(); } };
      b.onpointerleave = () => { this.hover = null; this.renderInfo(); };
    });
  }

  /** Prend un bâtiment en main (onglet Bâtir, son rayon), ou dit pourquoi il est encore verrouillé */
  private pick(k: KindId) {
    const lock = this.lockOf(k);
    if (lock) { this.toast(lock); return; }
    this.host.tools.setTool('build', k);
    this.host.audio.sfxClick();
  }

  /** Ce que montrent les vignettes du rayon ouvert (nombre de chaque bâtiment, cadenas) : elles se redessinent quand ça change */
  private tilesKey = '';
  private tilesNow() {
    return this.tab === 'build' ? KIND_ORDER.filter((k) => KINDS[k].cat === this.cat).map((k) => (this.lockOf(k) ? 'L' : this.host.sim.counts[k] ?? 0)).join() : this.tab;
  }

  /** keep : la rangée garde son défilement (les vignettes se mettent à jour sous les yeux du joueur) */
  renderItems(keep = false) {
    this.tilesKey = this.tilesNow();
    const t = TABS.find((x) => x.id === this.tab)!, age = this.host.sim.age, build = t.id === 'build';
    const sub = $('#subcats');
    sub.innerHTML = build
      ? BUILD_CATS.map((c) => `<button data-c="${c.id}" class="${c.id === this.cat ? 'on' : ''}">${ic(CAT_ICON[c.id], 16, 2)}${c.label}</button>`).join('')
      : `<span class="mhint">${ic(t.icon, 16, 2)}${t.hint}</span>`;
    sub.querySelectorAll<HTMLButtonElement>('button[data-c]').forEach((b) => (b.onclick = () => {
      this.cat = b.dataset.c as BuildCat;
      // le bâtiment en main est d'un autre rayon : on le lâche, sinon refreshTools ramènerait son rayon
      const tl = this.host.tools;
      if (tl.tool === 'build' && KINDS[tl.kind].cat !== this.cat) tl.setTool('none');
      this.renderItems(); this.host.audio.sfxClick();
    }));
    let html: string;
    if (build) {
      // ce qu'on peut bâtir d'abord, les bâtiments encore verrouillés ensuite (chacun dans l'ordre du catalogue) ; ceux des âges
      // lointains ne se montrent pas encore : seulement ce qu'apportera l'âge suivant
      const kinds = KIND_ORDER.filter((k) => KINDS[k].cat === this.cat && KINDS[k].minAge <= age + 1), shut = (k: KindId) => +!!this.lockOf(k);
      html = kinds.sort((p, q) => shut(p) - shut(q)).map((k) => {
        const d = KINDS[k], locked = !!this.lockOf(k), a = Math.max(age, d.minAge), n = this.host.sim.counts[k] ?? 0;
        const badge = locked ? '<i class="badge lock">🔒</i>' : n ? `<i class="badge">${n}</i>` : '';
        return `<button class="tile kind ${locked ? 'locked' : ''} ${d.size === 2 ? 'big' : d.size === 3 ? 'big huge' : d.size >= 4 ? 'big giant' : ''}" data-kind="${k}" aria-label="${d.names[a]}"><b>${ic(KIND_ICON[k], 28, 1.6)}</b><span class="lbl">${d.names[a]}</span>${badge}</button>`;
      }).join('') || `<span class="mhint">Rien à bâtir dans ce rayon avant l’âge ${AGES[Math.min(age + 2, AGES.length - 1)].name}.</span>`;
    } else {
      html = t.tools.map((id) => { const i = this.toolInfo(id); return `<button class="tile" data-tool="${id}" aria-label="${i.label}"><b>${ic(i.icon, 28, 1.6)}</b><span class="lbl">${i.label}</span>${i.key ? `<i class="key">${i.key}</i>` : ''}</button>`; }).join('');
    }
    const items = $('#items'), left = items.scrollLeft;
    items.innerHTML = html;
    items.scrollLeft = keep ? left : 0;
    this.bindTools(items);
    items.querySelectorAll<HTMLButtonElement>('button[data-kind]').forEach((b) => {
      const k = b.dataset.kind as KindId;
      b.onclick = () => {
        const lock = this.lockOf(k);
        if (lock) { this.toast(lock); return; }
        this.host.tools.setTool('build', k);
        this.host.audio.sfxClick();
      };
      b.onpointerenter = (e) => { if (e.pointerType === 'mouse') { this.hover = { kind: k }; this.renderInfo(); } };
      b.onpointerleave = () => { this.hover = null; this.renderInfo(); };
    });
    this.refreshTools();
  }

  /** Pourquoi ce bâtiment n'est pas encore constructible : un âge à venir, ou une expédition à réussir (null s'il l'est) */
  private lockOf(k: KindId): string | null {
    const d = KINDS[k], h = this.host;
    if (d.minAge > h.sim.age) return `Disponible à l’âge : ${AGES[d.minAge].name}`;
    if (d.reqMission && !h.expeditions.state.done.includes(d.reqMission)) {
      const m = MISSIONS.find((x) => x.id === d.reqMission);
      return `Débloqué par l’expédition « ${m?.title ?? d.reqMission} »`;
    }
    return null;
  }

  /** la raison du refus montrée par la fiche (elle se redessine quand le curseur passe sur un endroit refusé pour une autre raison) */
  private infoWhy: string | null = null;

  /** Fiche de l'outil ou du bâtiment survolé, sinon du bâtiment qu'on s'apprête à poser */
  private renderInfo() {
    const tl = this.host.tools, box = $('#info');
    this.infoWhy = tl.placeWhy;
    const held = tl.tool === 'build' || (tl.tool === 'move' && tl.holding()) ? tl.kind : null;
    const k = this.hover ? this.hover.kind ?? null : held, tool = this.hover?.tool;
    box.classList.toggle('show', !!(k || tool));
    // le bâtiment en main (pas survolé) : une fiche réduite, dans le coin, qui laisse voir et viser le milieu de l'écran
    const brief = !this.hover;
    box.classList.toggle('held', brief);
    if (tool) {
      const i = this.toolInfo(tool);
      box.innerHTML = `<div class="ihead"><b>${ic(i.icon, 28, 1.6)}</b><div class="grow"><h4>${i.label}</h4>${i.key ? `<small>Raccourci : ${i.key}</small>` : ''}</div></div><p>${i.desc}</p>`;
      return;
    }
    if (!k) return;
    const d: KindDef = KINDS[k], age = this.host.sim.age, lock = this.lockOf(k), a = Math.max(age, d.minAge);
    const n = this.host.sim.counts[k] ?? 0;
    const effs = GIVES.map((g) => (d[g.k]?.[a] ? `<span class="eff">${ic(g.icon, 14, 2)} ${give(g, d[g.k]![a])}</span>` : '')).join('');
    // les grands bâtiments se paient en bois et en pierre, tous en défi (sauf en ressources illimitées) ; le premier bûcheron du défi est offert
    const w = this.host.world, cost = priceIn(w, k, age), rich = canPay(w, cost), gift = !cost && !w.unlimited && !!rulesOf(w.difficulty).price && PRODUCERS.includes(k);
    box.innerHTML = `<div class="ihead"><b>${ic(KIND_ICON[k], 28, 1.6)}</b><div class="grow"><h4>${d.names[a]}</h4><small>${d.size > 1 ? `Grand bâtiment (${d.size} × ${d.size}) · ` : ''}${n ? `${n} dans le village` : 'pas encore construit'}</small></div></div>
      ${brief ? '' : `<p>${d.desc}</p>${effs ? `<div class="effs">${effs}</div>` : ''}${d.perk ? `<p class="perk">✦ ${d.perk}</p>` : ''}`}
      ${cost ? `<p class="cost ${rich ? '' : 'short'}">${ic('hammer', 14, 2)} Coût : ${costLabel(cost)}${rich ? '' : ` — vous avez ${Math.floor(w.wood)} bois et ${Math.floor(w.stone)} pierre`}</p>` : gift ? `<p class="cost">${ic('hammer', 14, 2)} ${DIFF_TEXT.firstFree}</p>` : ''}
      ${lock ? `<p class="lock">🔒 ${lock}</p>` : brief && tl.placeWhy ? `<p class="lock">✗ ${tl.placeWhy}</p>` : tl.tool === 'build' && brief ? '<p class="keys">R : tourner · Échap : lâcher</p>' : ''}`;
  }

  /**
   * Fiche du bâtiment choisi d'un clic : ce qu'il est et ce qu'il apporte, ses habitants, ses bêtes ou ses galeries ;
   * le déplacer, le tourner (R), le démolir
   */
  private renderSelection() {
    const h = this.host, tl = h.tools, box = $('#selCard');
    const b = tl.selected !== null ? h.world.buildings.get(tl.selected) : undefined;
    if (!b) { if (this.selKey) { this.selKey = ''; box.classList.remove('show'); } return; }
    const d = KINDS[b.kind], a = Math.max(b.age, d.minAge), stats: string[] = [];
    if (b.kind === 'house') { const n = h.agents.agents.filter((x) => x.home === b.id).length; stats.push(`${ic('house', 14, 2)} ${n} habitant${n > 1 ? 's' : ''}`); }
    if (b.kind === 'pen' || b.kind === 'stable') {
      const herds = penHerds(h.world), list = (b.kind === 'pen' ? herds.pens : herds.stables).get(b.id) ?? [];
      const names: Record<string, [string, string]> = { sheep: ['mouton', 'moutons'], cow: ['vache', 'vaches'], pig: ['cochon', 'cochons'], horse: ['cheval', 'chevaux'] }, count = new Map<string, number>();
      for (const k of list) count.set(k, (count.get(k) ?? 0) + 1);
      stats.push(list.length ? `${ic('pen', 14, 2)} ${[...count].map(([k, n]) => `${n} ${names[k][n > 1 ? 1 : 0]}`).join(', ')}` : `${ic('pen', 14, 2)} aucune bête pour l’instant`);
    }
    if (b.kind === 'oilwell') stats.push(`${ic('crude', 14, 2)} ${YIELD.oilwell!.crude![a] ?? 0} barils de pétrole brut par jour · ${Math.floor(h.world.crude)} en réserve au village`);
    if (b.kind === 'refinery') stats.push(`${ic('fuel', 14, 2)} Raffine jusqu’à ${REFINE_CRUDE} barils de brut par jour (${REFINE_CRUDE * FUEL_PER_CRUDE} de carburant) · ${Math.floor(h.world.crude)} brut et ${Math.floor(h.world.fuel)} carburant au village`);
    if (b.kind === 'outpost') stats.push(`${ic('outpost', 14, 2)} ${h.expeditions.held()} cases de galeries tenues sous terre · camp niveau ${h.expeditions.camp()}`);
    // gare ou avant-poste : les lignes qui s'y arrêtent, où en sont leurs trains ; en tracer une nouvelle d'ici
    const r = h.railway, stop = isStation(b) || b.kind === 'outpost' ? r.stopOf(b) : null, lines = stop ? r.linesAt(b) : [];
    const rails = stop ? `<div class="rails"><b>${ic('train', 14, 2)} Chemin de fer</b>${lines.map((l) => {
      const tr = r.trains.get(l.id);
      return `<div class="rline">${dot(l.color)}<div class="grow"><span>${r.lineLabel(l)}</span><small>${tr ? trainWhere(r, tr) : ''}${tr && tr.crew.length ? ` · ${tr.crew.length} mineurs au fond` : ''}</small></div>
        <button data-act="follow:${l.id}" title="Suivre le train" aria-label="Suivre le train">${ic('eye', 15, 2)}</button><button data-act="edit:${l.id}" title="Modifier la ligne : ses arrêts et le tracé de sa voie" aria-label="Modifier la ligne">${ic('road', 15, 2)}</button><button data-act="drop:${l.id}" title="Fermer la ligne" aria-label="Fermer la ligne">${ic('close', 15, 2)}</button></div>`;
    }).join('')}<button data-act="newline" class="newline">${ic('train', 15, 2)} Nouvelle ligne depuis ${b.kind === 'outpost' ? 'cet avant-poste' : 'cette gare'}</button></div>`
      : b.kind === 'outpost' && h.sim.age >= 3 ? `<p class="stat">${ic('train', 14, 2)} Cet avant-poste n’a pas la place d’un quai à son pied : le train ne peut pas s’y arrêter.</p>` : '';
    // améliorations : ce qu'il peut devenir à cet âge, et leur prix (ou ce qui manque pour les débloquer)
    const ups = UPGRADES.filter((u) => u.from === b.kind && h.sim.age >= KINDS[u.to].minAge).map((u) => {
      const to = KINDS[u.to], name = to.names[Math.max(b.age, to.minAge)], c = priceIn(h.world, u.to, h.sim.age);
      const locked = to.reqMission && !h.expeditions.state.done.includes(to.reqMission) ? MISSIONS.find((m) => m.id === to.reqMission)?.title ?? to.reqMission : null;
      return locked ? `<button disabled title="Débloqué par l’expédition « ${locked} »">${ic('upgrade', 16, 2)} ${name} <small>🔒 ${locked}</small></button>`
        : `<button data-act="up:${u.to}" class="primary">${ic('upgrade', 16, 2)} Améliorer : ${name}${to.size > sizeOf(b) ? ` <small>${to.size} × ${to.size}</small>` : ''}${c ? ` <small>${costLabel(c)}</small>` : ''}</button>`;
    }).join('');
    const upgrades = ups ? `<div class="acts ups">${ups}</div>` : '';
    const key = `${b.id}|${b.rot}|${b.age}|${b.auto}|${stats.join()}|${rails}|${upgrades}`;
    if (key === this.selKey) return;
    this.selKey = key;
    const effs = GIVES.map((g) => (d[g.k]?.[a] ? `<span class="eff">${ic(g.icon, 14, 2)} ${give(g, d[g.k]![a])}</span>` : '')).join('');
    box.innerHTML = `<div class="ihead"><b>${ic(KIND_ICON[b.kind], 28, 1.6)}</b><div class="grow"><h4>${d.names[a]}</h4><small>${AGES[b.age].name}${sizeOf(b) > 1 ? ` · ${sizeOf(b)} × ${sizeOf(b)}` : ''} · ${b.auto ? 'façade tournée vers la route' : 'orientée à la main'}</small></div><button class="x" data-act="close" title="Fermer (Échap)" aria-label="Fermer">${ic('close', 16, 2)}</button></div>
      <p>${d.desc}</p>${effs ? `<div class="effs">${effs}</div>` : ''}${stats.map((s) => `<p class="stat">${s}</p>`).join('')}${d.perk ? `<p class="perk">✦ ${d.perk}</p>` : ''}${rails}${upgrades}
      <div class="acts"><button data-act="move">${ic('hand', 16, 2)} Déplacer</button><button data-act="rot">${ic('rotate', 16, 2)} Tourner <kbd>R</kbd></button><button data-act="del" class="danger">${ic('demolish', 16, 2)} Démolir</button></div>`;
    box.classList.add('show');
    box.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((el) => (el.onclick = async () => {
      const act = el.dataset.act;
      if (act === 'close') tl.select(null);
      else if (act === 'move') { tl.moveSelected(); h.audio.sfxClick(); }
      else if (act === 'rot') tl.rotateSelected();
      else if (act === 'del' && await confirmBox(this.root, `Démolir : ${d.names[a].toLowerCase()} ? (Ctrl+Z pour annuler)`, 'Démolir')) tl.demolishSelected();
      else if (act === 'newline') { h.audio.sfxClick(); h.startRailEdit({ stop: b.id }); }
      else if (act?.startsWith('up:')) tl.upgradeSelected(act.slice(3) as KindId);
      else if (act?.startsWith('follow:')) h.followTrain(+act.slice(7));
      else if (act?.startsWith('edit:')) { h.audio.sfxClick(); h.startRailEdit({ line: +act.slice(5) }); }
      else if (act?.startsWith('drop:')) {
        const l = h.world.lines.find((x) => x.id === +act.slice(5));
        if (l && await confirmBox(this.root, `Fermer la ligne ${r.lineLabel(l)} ? Ses voies seront retirées.`, 'Fermer la ligne')) h.railway.removeLine(l.id);
      }
      this.renderSelection();
    }));
  }

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
    box.innerHTML = `<div class="rhead">${dot(e.color)}<b>${e.line !== null ? 'Modifier la ligne' : 'Nouvelle ligne'}</b></div>
      <p>${names.length ? names.join(' → ') : '—'}</p>
      <small>${e.stops.length < 2 ? 'Cliquez la gare ou l’avant-poste suivant.' : 'Cliquez d’autres arrêts pour prolonger la ligne, ou validez.'} Recliquer le dernier arrêt le retire.</small>
      ${e.stops.length >= 2 ? `<small class="rtip">${ic('hand', 13, 2)} Saisissez la voie prévue et glissez-la pour la faire passer où vous voulez ; glissez un point pour le déplacer, un clic sur un point le retire.${points ? ` ${points} point${points > 1 ? 's' : ''} de passage.` : ''}</small>` : ''}
      ${trouble ? `<small class="rbad">${ic('alert', 13, 2)} ${trouble}</small>` : ''}
      <div class="acts"><button data-r="undo" ${e.stops.length ? '' : 'disabled'}>${ic('undo', 15, 2)} Retirer le dernier</button><button data-r="auto" ${points ? '' : 'disabled'} title="Retirer tous les points de passage : la voie se pose d’elle-même">${ic('restart', 15, 2)} Tracé auto</button><button data-r="ok" class="primary" ${e.stops.length >= 2 && !trouble ? '' : 'disabled'}>${ic('check', 15, 2)} Valider <kbd>Entrée</kbd></button><button data-r="cancel">${ic('close', 15, 2)} Annuler <kbd>Échap</kbd></button></div>`;
    box.querySelectorAll<HTMLButtonElement>('[data-r]').forEach((b) => (b.onclick = () => {
      const r = b.dataset.r;
      if (r === 'undo') h.railUndo(); else if (r === 'auto') h.railAuto(); else if (r === 'ok') h.railFinish(); else h.railCancel();
    }));
  }

  /** Nom, icône, raccourci et fiche d'un outil ; le jardin prend ceux de l'âge du village (campement, jardin, lices, parc…) */
  private toolInfo(id: string) {
    const base = TOOL_INFO[id];
    if (id !== 'garden') return { ...base, desc: TOOL_DESC[id] ?? '' };
    const g = GARDEN_BY_AGE[Math.min(this.host.sim.age, GARDEN_BY_AGE.length - 1)];
    return { ...base, icon: g.icon, label: g.label, desc: g.desc };
  }

  /**
   * Le conseil du moment, en pastille : orange quand un besoin manque, bleue pour avancer vers l'âge suivant, verte quand tout
   * va bien ; un bouton « Bâtir » quand il nomme un bâtiment, et la pastille s'anime un instant à chaque nouveau conseil
   */
  private renderMessage() {
    const { sim } = this.host, el = $('#msg'), k = sim.messageKind;
    // un village plein n'est pas en manque : il attend des places pour grandir (conseil bleu, pas orange)
    const tone = NEEDS.some((n) => n.k !== 'housing' && !sim[n.k].ok) || sim.drought ? 'warn' : sim.ageProgress() || !sim.housing.ok ? 'goal' : 'calm';
    const ready = !k && sim.ready, key = `${tone}|${k}|${ready}|${sim.message}`;
    if (el.dataset.v === key) return;
    el.dataset.v = key;
    el.className = `tone-${tone}${k || ready ? ' link' : ''}`;
    el.title = k ? `Cliquer pour bâtir « ${sim.nameOf(k)} »` : ready ? 'Cliquer pour passer à l’âge suivant' : '';
    const text = sim.message.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    el.innerHTML = `${ic(tone === 'warn' ? 'alert' : tone === 'goal' ? 'target' : 'check', 15, 2.2)}<span>${text}</span>${k ? `<b class="go">${ic('hammer', 12, 2.4)}Bâtir</b>` : ready ? `<b class="go">${ic('up', 12, 2.4)}Passer</b>` : ''}`;
    void el.offsetWidth;
    el.classList.add('flash');
  }

  /**
   * Stocks du village (bois, pierre, minerai ; pétrole brut et carburant à l'époque moderne, ou dès qu'il y en a) et ce qu'il
   * en produit chaque jour
   */
  private resKey = '';
  private renderResources() {
    const w = this.host.world, day = this.host.expeditions.daily(), rail = this.host.railway.daily();
    day.ore += rail.ore; day.stone += rail.stone;
    const items: [Resource, string, string][] = [['wood', 'tree', 'Bois'], ['stone', 'rock', 'Pierre'], ['ore', 'pickaxe', 'Minerai']];
    if (this.host.sim.age >= 4 || w.crude >= 1 || w.fuel >= 1 || day.crude || day.fuel) items.push(['crude', 'crude', 'Brut'], ['fuel', 'fuel', 'Carburant']);
    const key = `${w.unlimited}|` + items.map(([r]) => `${Math.floor(w[r])}/${day[r]}`).join('|');
    if (key === this.resKey) return;
    this.resKey = key;
    // la fiche du bâtiment en main dit si l'on a encore de quoi le payer
    this.renderInfo();
    // la production du jour s'affiche sous le stock (grisée quand rien n'en produit) ; le brut qu'on raffine plus vite qu'on ne
    // le tire baisse chaque jour
    const per = (n: number) => `${n < 0 ? '−' : '+'}${Number.isInteger(n) ? Math.abs(n) : Math.abs(n).toFixed(1)}/j`;
    const use: Partial<Record<Resource, string>> = { wood: ' — pour bâtir les grands bâtiments', stone: ' — pour bâtir les grands bâtiments', crude: ' — la raffinerie en fait du carburant', fuel: ' — pour les blindés de l’expédition armée' };
    // le brut tiré des puits peut partir aussitôt à la raffinerie : on dit ce qu'en tirent les puits et ce qu'elle en prend
    const drawn = this.host.expeditions.yields().crude;
    const flow = (r: Resource) => (r === 'crude' && drawn ? `, ${drawn} tirés des puits par jour et ${drawn - day.crude} raffinés` : day[r] ? `, ${per(day[r]).replace('/j', '')} par jour` : ', rien n’en produit pour l’instant');
    $('#res').innerHTML = items.map(([r, icon, label]) => w.unlimited
      ? `<div class="res" data-r="${r}" title="${label} : illimité (${DIFF_TEXT.resInfinite[w.difficulty]})">${ic(icon, 18, 2)}<b>∞</b><small>${label}</small></div>`
      : `<div class="res" data-r="${r}" title="${label} : ${Math.floor(w[r])} en réserve${flow(r)}${use[r] ?? ''}">${ic(icon, 18, 2)}<b>${Math.floor(w[r])}</b><em class="rate${day[r] || (r === 'crude' && drawn) ? '' : ' none'}">${per(day[r])}</em><small>${label}</small></div>`).join('');
  }

  /** Surligne l'outil actif, affiche/masque le réglage de pinceau */
  refreshTools() {
    this.renderSelection();
    const tl = this.host.tools;
    this.root.querySelectorAll<HTMLButtonElement>('#dock button[data-tool], #items button[data-kind]').forEach((b) => {
      const on = b.dataset.tool ? b.dataset.tool === tl.tool : tl.tool === 'build' && b.dataset.kind === tl.kind;
      // le bâtiment pris en main (depuis un message, un raccourci) défile jusque dans la rangée visible
      if (on && b.dataset.kind && !b.classList.contains('active')) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      b.classList.toggle('active', on);
    });
    const brush = SCULPT_TOOLS.includes(tl.tool) || (VEG_TOOLS.includes(tl.tool) && !SINGLE_TOOLS.includes(tl.tool)) || tl.tool === 'biome';
    $('#brush').classList.toggle('show', brush);
    // le pinceau de biome : le choix du biome, à côté de la taille
    $('#biomes').classList.toggle('show', tl.tool === 'biome');
    $('#biomes').querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('active', (b.dataset.b === '' ? null : Number(b.dataset.b)) === tl.biomeKind));
    // l'outil Route : son mode de tracé
    $('#roadModes').classList.toggle('show', tl.tool === 'road');
    $('#roadModes').querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('active', b.dataset.m === tl.roadMode));
    // l'onglet suit l'outil ; le rayon suit le bâtiment choisi
    const tabOf = tabOfTool(tl.tool, this.tab);
    if (tabOf !== this.tab) { this.tab = tabOf; this.renderDock(); return; }
    if (tl.tool === 'build' && KINDS[tl.kind].cat !== this.cat) { this.cat = KINDS[tl.kind].cat; this.renderItems(); return; }
    $<HTMLInputElement>('#rad').value = String(tl.radius);
    $('#radv').textContent = String(tl.radius);
    ($('#bRot') as HTMLButtonElement).disabled = !tl.holding();
    this.renderInfo();
  }

  /** Message bref en haut de l'écran ; avec `act`, un clic dessus y mène (il reste alors affiché plus longtemps) */
  toast(msg: string, act?: () => void) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    t.classList.toggle('act', !!act);
    t.onclick = act ? () => { t.classList.remove('show'); act(); } : null;
    clearTimeout(this.toastTimer);
    // un message qui mène quelque part reste longtemps, et ne s'efface jamais sous la souris (le clic tomberait sur la carte)
    const hide = () => { if (act && t.matches(':hover')) { this.toastTimer = window.setTimeout(hide, 800); return; } t.classList.remove('show'); };
    this.toastTimer = window.setTimeout(hide, act ? 12000 : 2600);
  }

  banner(title: string, sub: string) {
    const b = $('#banner');
    $('h2', b).textContent = title;
    $('p', b).textContent = sub;
    b.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => b.classList.remove('show'), 4200);
  }

  update() {
    const { sim, time, env } = this.host;
    this.renderRailEdit();
    if (sim.age !== this.lastAge) { this.lastAge = sim.age; this.renderItems(); }
    // les vignettes suivent le village : un bâtiment de plus ou de moins, un cadenas levé par une expédition
    else if (this.tilesNow() !== this.tilesKey) this.renderItems(true);
    if (this.host.tools.placeWhy !== this.infoWhy) this.renderInfo();
    $('#ageName').textContent = AGES[sim.age].name;
    $('#ageSub').textContent = AGES[sim.age].tagline;
    const ap = sim.ageProgress(), pct = ap ? Math.floor(ap.ratio * 100) : 100;
    $('#ageBar').style.width = `${pct}%`;
    $('#agePanel').classList.toggle('ready', pct >= 100);
    // où en est l'âge : le pourcentage, l'âge visé et les conditions remplies (le détail s'ouvre d'un clic)
    const met = ap ? ap.items.filter((i) => i.have >= i.need).length : 0;
    const next = ap ? `<span>Vers ${AGES[ap.next].name}</span><span>${met}/${ap.items.length} conditions ▾</span>` : '<span>Dernier âge atteint</span>';
    $('#agePct').textContent = ap ? `${pct} %` : '';
    if ($('#ageNext').dataset.v !== next) { $('#ageNext').innerHTML = next; $('#ageNext').dataset.v = next; }
    // tout est réuni : un bouton pour passer à l'âge suivant (ce n'est plus automatique)
    const go = $('#ageGo'), ready = !!ap && sim.ready, label = ap ? `${ic('up', 15, 2.4)} Passer à : ${AGES[ap.next].name}` : '';
    go.hidden = !ready;
    if (ready && go.dataset.v !== label) { go.innerHTML = label; go.dataset.v = label; go.title = `Toutes les conditions sont réunies : passer à l’âge suivant (${AGES[ap!.next].name})`; }
    $('#ageReq').innerHTML = ap
      ? `<b>Vers : ${AGES[ap.next].name}</b>` + ap.items.map((i) => `<span class="${i.have >= i.need ? 'ok' : ''} kind"${i.kind ? ` data-kind="${i.kind}" title="${sim.whereOf(i.kind)} — cliquer pour le bâtir"` : ` data-req="${reqOf(i.label)}" title="Cliquer pour savoir comment l’obtenir"`}>${i.have >= i.need ? '✓' : '•'} ${i.label}${i.kind ? ` <small>${sim.whereOf(i.kind).replace('Bâtir › ', '')}</small>` : ''} <em>${Math.min(i.have, 999)}/${i.need}</em></span>`).join('')
      : 'Dernier âge atteint : profitez de votre village !';
    for (const n of NEEDS) {
      const el = $('#n-' + n.k), need = sim[n.k], housing = n.k === 'housing';
      const fill = housing ? (need.cap > 0 ? Math.min(1, sim.pop / need.cap) : 0) : need.demand <= 0 ? 1 : Math.min(1, need.cap / need.demand);
      $('i', el).style.width = `${Math.round(fill * 100)}%`;
      el.classList.toggle('warn', !need.ok && !housing);
      el.classList.toggle('full', !need.ok && housing);
      el.title = housing ? `${n.label} : ${Math.floor(sim.pop)} habitants pour ${need.cap} places` : `${n.label} : ${num(need.cap)} pour un besoin de ${num(need.demand)}`;
    }
    // le compteur signale le souci le plus pressant ; le détail est dans la fiche des habitants
    const cs = this.census(), alert = cs.untreated ? `${cs.untreated} sans soins` : cs.hungry ? `${cs.hungry} ${cs.hungry > 1 ? 'ont' : 'a'} faim` : cs.thirsty ? `${cs.thirsty} ${cs.thirsty > 1 ? 'ont' : 'a'} soif`
      : cs.jobless ? `${cs.jobless} sans emploi` : cs.injured ? `${cs.injured} blessé${cs.injured > 1 ? 's' : ''}` : '';
    const popHtml = `${cs.p}<small>habitants</small>${alert ? `<small class="alert">${alert}</small>` : ''}`;
    if ($('#pop').dataset.v !== popHtml) { $('#pop').innerHTML = popHtml; $('#pop').dataset.v = popHtml; }
    if (!$('#census').hidden) this.renderCensus();
    if (this.needOpen) this.renderNeed();
    if (this.resOpen) this.renderRes();
    this.renderMessage();
    const hh = Math.floor(time.hour), mm = Math.floor((time.hour % 1) * 60);
    const wk = WEATHER_ICON[env.weatherKind] && env.weatherK > 0.3 ? ic(WEATHER_ICON[env.weatherKind], 13, 2) : '';
    const clock = `${ic(SEASON_ICONS[time.season], 18)}<span class="time">${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}<small>${SEASONS[time.season]} ${wk}</small></span>`;
    // le contenu ne change que si l'heure, la saison ou la météo changent (on évite de recréer les icônes à chaque mise à jour)
    if ($('#clock').dataset.v !== clock) { $('#clock').innerHTML = clock; $('#clock').dataset.v = clock; }
    if ($('#bPause').dataset.p !== String(time.paused)) { $('#bPause').innerHTML = ic(time.paused ? 'play' : 'pause', 18, 2.2); $('#bPause').dataset.p = String(time.paused); }
    $('#bSpeed').textContent = `×${time.speed}`;
    // le bouton du brouillard ne paraît que lorsqu'il y en a
    ($('#bFog') as HTMLButtonElement).hidden = this.host.fogLevel() < 0.15;
    const zone = this.host.underZone();
    if (zone) {
      $('#underZone').innerHTML = `⛏️ ${zone}<small>${this.host.torchMode ? 'Cliquez sur le sol pour poser ou retirer une torche' : 'Filon : comment l’abattre · Puits de lumière : remonter'}</small>`;
      $('#bTorch').classList.toggle('active', this.host.torchMode);
      // la quête en cours du camp souterrain, et où en est son objectif
      const ex = this.host.expeditions, cq = ex.campQuest(), lvl = ex.camp();
      const q = cq ? `<span>${ic('outpost', 16, 2)} Camp · niveau ${lvl}</span><small>${cq.q.title} : ${cq.cur} / ${cq.max}</small><i class="bar"><i style="width:${Math.round((cq.cur / cq.max) * 100)}%"></i></i>`
        : `<span>${ic('outpost', 16, 2)} Camp achevé</span><small>Toutes ses quêtes sont accomplies</small>`;
      if ($('#campQuest').dataset.v !== q) { $('#campQuest').innerHTML = q; $('#campQuest').dataset.v = q; }
    }
    this.updateExpeditions();
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

  private openNeed(k: NeedId) {
    this.closeCensus();
    this.resOpen = null;
    document.querySelectorAll('.res.open').forEach((el) => el.classList.remove('open'));
    this.needOpen = k;
    const box = $('#needInfo'), r = $('#n-' + k).getBoundingClientRect();
    box.hidden = false;
    box.dataset.v = '';
    this.renderNeed();
    // sous l'icône du besoin, sans sortir de l'écran
    box.style.top = `${Math.round(r.bottom + 8)}px`;
    box.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8, r.left + r.width / 2 - box.offsetWidth / 2)))}px`;
    document.querySelectorAll('.need').forEach((el) => el.classList.toggle('open', el.id === 'n-' + k));
  }

  private closeNeed() {
    this.needOpen = null;
    this.resOpen = null;
    $('#needInfo').hidden = true;
    document.querySelectorAll('.need.open, .res.open').forEach((el) => el.classList.remove('open'));
  }

  /** Ouvre la fiche d'une ressource, sous son stock */
  private openRes(r: Resource) {
    this.closeCensus();
    this.needOpen = null;
    document.querySelectorAll('.need.open').forEach((el) => el.classList.remove('open'));
    this.resOpen = r;
    const box = $('#needInfo'), el = $(`#res .res[data-r="${r}"]`);
    box.hidden = false;
    box.dataset.v = '';
    this.renderRes();
    const b = el.getBoundingClientRect();
    box.style.top = `${Math.round(b.bottom + 8)}px`;
    box.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8, b.left + b.width / 2 - box.offsetWidth / 2)))}px`;
    document.querySelectorAll('#res .res').forEach((x) => x.classList.toggle('open', x === el));
  }

  /** Fiche d'une ressource : stock, production du jour et ses sources, à quoi elle sert, et le bâtiment qui en donnerait plus */
  private renderRes() {
    const h = this.host, w = h.world, r = this.resOpen!, meta = RES_META[r], day = h.expeditions.daily()[r], age = h.sim.age;
    const rows: string[] = [];
    for (const k of Object.keys(YIELD) as KindId[]) {
      const per = YIELD[k]![r];
      if (!per) continue;
      let n = 0, v = 0;
      for (const b of w.buildings.values()) if (b.kind === k && per[b.age]) { n++; v += per[b.age]; }
      if (n) rows.push(`<div class="crow"><span>${KINDS[k].names[Math.max(age, KINDS[k].minAge)]}<i>× ${n}</i></span><em>+${num(v)}</em></div>`);
    }
    if (r === 'fuel' && day > 0) rows.push(`<div class="crow"><span>Raffinerie (du pétrole brut)</span><em>+${num(day)}</em></div>`);
    const k = meta.kind, lock = this.lockOf(k), name = KINDS[k].names[Math.max(age, KINDS[k].minAge)];
    const html = `
      <h4>${ic(meta.icon, 18, 2)} ${meta.label}<em class="${day > 0 ? 'ok' : 'warn'}">${w.unlimited ? '∞' : Math.floor(w[r])}</em></h4>
      <div class="sub">${day ? `${day > 0 ? '+' : '−'}${num(Math.abs(day))} par jour` : 'rien n’en produit pour l’instant'}</div>
      <p class="hint">${meta.use}</p>
      <div class="src">${rows.join('') || '<div class="crow"><span class="none">Aucun bâtiment n’en produit encore.</span></div>'}</div>
      <p class="hint ${day > 0 ? 'ok' : 'warn'}">${meta.more}</p>
      ${lock ? `<p class="hint warn">🔒 ${lock}</p>` : `<button class="primary" data-kind="${k}" title="${h.sim.whereOf(k)}">${ic('hammer', 15, 2.2)} Bâtir « ${name} »</button>`}`;
    const box = $('#needInfo');
    if (box.dataset.v !== html) { box.innerHTML = html; box.dataset.v = html; }
  }

  /**
   * Fiche d'un besoin : disponible / nécessaire (habitants / places pour le logement), la règle, chaque source et son apport,
   * puis ce qui manque et le bâtiment qui le comblerait, à bâtir d'un clic
   */
  private renderNeed() {
    const { sim } = this.host, k = this.needOpen!, meta = NEEDS.find((n) => n.k === k)!, d = sim.needDetail(k), p = Math.floor(sim.pop);
    const housing = k === 'housing', have = housing ? p : d.cap, want = housing ? d.cap : d.demand;
    const fill = housing ? (d.cap > 0 ? Math.min(1, p / d.cap) : 0) : d.demand <= 0 ? 1 : Math.min(1, d.cap / d.demand);
    const state = d.ok ? 'ok' : housing ? 'full' : 'warn', name = sim.nameOf(d.kind), where = sim.whereOf(d.kind);
    const rows = d.rows.length
      ? d.rows.map((r) => `<div class="crow"><span>${r.label}${r.n ? `<i>× ${r.n}</i>` : ''}</span><em class="${r.v < 0 ? 'neg' : ''}">${r.v < 0 ? '−' : '+'}${num(Math.abs(r.v))}</em></div>`).join('')
      : '<div class="crow"><span class="none">Rien ne le fournit encore.</span></div>';
    let tip: string;
    if (housing) tip = d.ok ? `${Math.floor(d.cap - p)} place${d.cap - p >= 2 ? 's' : ''} libre${d.cap - p >= 2 ? 's' : ''} : le village va grandir.` : `Le village est plein : chaque « ${name} » de plus loge ${d.per} habitants.`;
    else if (d.ok) tip = d.demand > 0 ? `Comblé, avec ${num(d.cap - d.demand)} d’avance.` : 'Pas encore demandé : le village est trop petit.';
    else { const miss = d.demand - d.cap, n = d.per > 0 ? Math.ceil(miss / d.per - 1e-6) : 0; tip = `Il manque ${num(miss)}${n ? ` : ${n > 1 ? `${n} × ` : ''}« ${name} » (+${d.per} chacun) suffirai${n > 1 ? 'ent' : 't'}` : ''}.`; }
    const html = `
      <h4>${ic(meta.icon, 18, 2)} ${meta.label}<em class="${state}">${num(have)} / ${num(want)}</em></h4>
      <div class="sub">${housing ? 'habitants / places' : 'disponible / nécessaire'}</div>
      <div class="bar ${state}"><i style="width:${Math.round(fill * 100)}%"></i></div>
      <p class="hint">${NEED_RULE[k]}</p>
      <div class="src">${rows}</div>
      <div class="crow total"><span>${housing ? 'Places' : 'Disponible'}</span><em>${num(d.cap)}</em></div>
      <div class="crow total"><span>${housing ? 'Habitants' : `Nécessaire (${p} habitants)`}</span><em>${num(housing ? p : d.demand)}</em></div>
      <p class="hint ${state}">${tip}</p>
      ${d.per > 0 && (!d.ok || housing) ? `<button class="primary" data-kind="${d.kind}" title="${where}">${ic('hammer', 15, 2.2)} Bâtir « ${name} »</button>` : ''}`;
    const box = $('#needInfo');
    if (box.dataset.v !== html) { box.innerHTML = html; box.dataset.v = html; }
  }

  /** Fiche des habitants : répartition en barre, puis le détail, et ce qui manquerait */
  private renderCensus() {
    const c = this.census(), p = Math.max(1, c.p);
    const seg = (n: number, cls: string, label: string) => (n > 0 ? `<i class="${cls}" style="width:${(n / p) * 100}%" title="${label} : ${n}"></i>` : '');
    const row = (icon: string, label: string, n: number, cls = '', note = '') => `<div class="crow ${cls}"><b>${ic(icon, 16, 2)}</b><span>${label}${note ? `<small>${note}</small>` : ''}</span><em>${n}</em></div>`;
    const tips: string[] = [];
    if (c.jobless) tips.push('Un atelier, une ferme ou un moulin de plus donnerait du travail.');
    if (c.untreated) tips.push('Un lieu de soins soignerait les malades.');
    if (c.hungry) tips.push('Une ferme, un champ ou un ponton de pêche nourrirait tout le monde.');
    if (c.thirsty) tips.push('Un point d’eau ou un puits de plus abreuverait tout le monde.');
    if (c.unhappy) tips.push('Un lieu de rencontre, un jardin ou un lieu de culte rendrait le village plus heureux.');
    const html = `
      <h4>${ic('houses', 18, 2)} ${c.p} habitants <small>pour ${c.places} places${c.away ? `, dont ${c.away} en expédition` : ''}</small></h4>
      <div class="cbar">${seg(c.employed, 'work', 'Au travail')}${seg(c.jobless, 'idle', 'Sans emploi')}${seg(c.others, 'kids', 'Enfants et anciens')}</div>
      ${row('hammer', 'Au travail', c.employed)}
      ${row('alert', 'Sans emploi', c.jobless, c.jobless ? 'warn' : '')}
      ${row('smile', 'Enfants et anciens', c.others)}
      ${row('health', 'Malades soignés', c.cared, '', c.sick ? `sur ${c.sick} à soigner` : 'aucun malade pour l’instant')}
      ${c.untreated ? row('health', 'Malades sans soins', c.untreated, 'warn') : ''}
      ${row('kit', 'Blessés au repos', c.injured, c.injured ? 'note' : '', c.injured ? 'au retour d’une expédition' : '')}
      ${row('compass', 'En expédition', c.away, '', c.away ? 'déjà comptés parmi les habitants ci-dessus' : '')}
      ${c.hungry ? row('bread', 'Ont faim', c.hungry, 'warn') : ''}
      ${c.thirsty ? row('drop', 'Ont soif', c.thirsty, 'warn') : ''}
      ${c.unhappy ? row('smile', 'Mécontents', c.unhappy, 'warn') : ''}
      ${tips.length ? `<p class="hint">${tips.join(' ')}</p>` : '<p class="hint ok">Tout le monde va bien.</p>'}`;
    const box = $('#census');
    if (box.dataset.v !== html) { box.innerHTML = html; box.dataset.v = html; }
  }

  // ---------------- Expéditions ----------------
  /** Cartes des équipes en route (à gauche), compteur du bouton 🧭, signal de l'expédition obligatoire */
  private updateExpeditions() {
    const h = this.host, ex = h.expeditions, list = $('#expList');
    // juste sous la barre du haut, quelle que soit sa hauteur (elle passe sur plusieurs lignes sur un téléphone)
    const hudB = Math.round($('#hud').getBoundingClientRect().bottom);
    list.style.top = `${hudB + 8}px`;
    // le bas du bandeau du haut (une ou deux lignes selon la largeur) : les fiches et les messages se posent dessous
    if (this.root.style.getPropertyValue('--hudB') !== `${hudB}px`) this.root.style.setProperty('--hudB', `${hudB}px`);
    const live = new Set<number>();
    for (const a of ex.active) {
      live.add(a.id);
      let card = this.expCards.get(a.id);
      if (!card) {
        card = document.createElement('div');
        card.className = 'expCard panel';
        card.innerHTML = `<i class="team"></i><b class="mi"></b><div class="grow"><div class="t"></div><small></small><div class="bar"><i></i></div></div><button class="dec" hidden title="Une décision vous attend" aria-label="Prendre la décision">${ic('alert', 18)}</button><button class="cam" title="La caméra suit l'équipe" aria-label="Suivre l'équipe à la caméra">${ic('eye', 18)}</button>`;
        ($('.team', card) as HTMLElement).style.background = hex(TEAM_COLORS[(a.id - 1) % TEAM_COLORS.length]);
        $('.mi', card).textContent = a.m.icon;
        $('.t', card).textContent = a.m.title;
        const id = a.id;
        $('.cam', card).onclick = () => { h.follow(h.following === id ? null : id); this.update(); };
        // une équipe qui attend : un clic n'importe où sur sa carte ouvre la décision (sauf l'œil, qui la suit à la caméra)
        card.onclick = (ev) => {
          if ((ev.target as HTMLElement).closest('.cam')) return;
          const e = ex.active.find((x) => x.id === id);
          if (e?.wait) this.showDecision(e);
        };
        list.appendChild(card);
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
        card.innerHTML = `<i class="team"></i><b class="mi"></b><div class="grow"><div class="t"></div><small></small><div class="bar"><i></i></div></div><button class="cam" title="La caméra suit l'intervention" aria-label="Suivre l'intervention à la caméra">${ic('eye', 18)}</button>`;
        const key = i.key;
        $('.cam', card).onclick = () => { h.followIncident(h.incidentCam === key ? null : key); this.update(); };
        list.appendChild(card);
        this.incCards.set(i.key, card);
      }
      $('.mi', card).textContent = i.icon;
      $('.t', card).textContent = i.title;
      $('small', card).textContent = i.status;
      ($('.bar i', card) as HTMLElement).style.width = `${Math.round(i.progress * 100)}%`;
      $('.cam', card).classList.toggle('active', h.incidentCam === i.key);
    }
    for (const [key, card] of this.incCards) if (!liveI.has(key)) { card.remove(); this.incCards.delete(key); }
    const max = ex.slots();
    $('#expBadge').textContent = ex.active.length ? `${ex.active.length}/${max}` : '';
    const must = mandatoryFor(h.sim.age);
    $('#bExp').classList.toggle('ping', !!must && !ex.done(must) && !ex.running(must));
  }

  openExpeditions(tab: 'missions' | 'gear' | 'depths' = 'missions') {
    const h = this.host, ex = h.expeditions, age = h.sim.age, max = ex.slots(), pop = Math.floor(h.sim.pop);
    const next = max < partyLimit(1e9) ? `Une équipe de plus à ${max * 30} habitants (le village en compte ${pop}).` : 'Le village envoie autant d’équipes qu’il le peut.';
    const teams = ex.active.map((a) => `<span class="teamChip"><i style="background:${hex(TEAM_COLORS[(a.id - 1) % TEAM_COLORS.length])}"></i>${a.m.icon} ${a.m.title} — ${ex.status(a)}</span>`).join('');
    // d'abord l'expédition obligatoire qui reste à faire, puis les autres à faire, puis ce qu'on peut refaire
    const rank = (m: Mission) => (ex.done(m) && !m.repeat ? 2 : m.mandatory && !ex.done(m) ? 0 : 1);
    const cards = ex.list(age).sort((a, b) => rank(a) - rank(b)).map((m) => {
      const done = ex.done(m), run = ex.running(m), redo = done && !m.repeat;
      const choices = run ? '' : this.choiceButtons(m);
      return `<div class="mission ${done ? 'done' : ''}">
        <div class="mhead"><b>${m.icon}</b><div class="grow"><h4>${m.title}</h4><small>${AGES[m.age].name}${m.mandatory ? ' · <span class="star">★ obligatoire pour l’âge suivant</span>' : ''}</small></div>${done ? '<span class="okb">✓ réussie</span>' : run ? '<span class="runb">en route…</span>' : ''}</div>
        ${m.unlocks ? `<p class="unlock">${ic(KIND_ICON[m.unlocks], 15, 2)} ${done ? 'A débloqué' : 'Débloque'} : <b>${KINDS[m.unlocks].names[Math.max(age, KINDS[m.unlocks].minAge)]}</b> (${BUILD_CATS.find((c) => c.id === KINDS[m.unlocks!].cat)!.label})</p>` : ''}
        ${m.requires ? `<p class="req">${[...(m.requires.missions ?? []).map((id) => [ex.state.done.includes(id), `« ${MISSIONS.find((x) => x.id === id)?.title} »`] as const), ...(m.requires.kinds ?? []).map((k) => [(h.sim.counts[k] ?? 0) > 0, KINDS[k].names[Math.max(age, KINDS[k].minAge)]] as const)].map(([ok, t]) => `<span class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${t}</span>`).join('')}</p>` : ''}
        ${m.choices.some((c) => c.win.some((e) => e.t === 'veins')) ? `<p class="held">${ic('outpost', 15, 2)} Galeries tenues sous terre : <b>${ex.held()}</b> cases${ex.held() ? ' — chaque victoire pousse le front plus loin' : ' — un avant-poste en tiendra les premières'}</p>` : ''}
        ${run ? '' : redo ? `<details class="redo"><summary>${ic('restart', 14, 2)} Refaire cette expédition</summary><p>${m.intro}</p><p class="hint">Déjà réussie : on en rapporte de nouveau bêtes, minerai et vivres ; ses bonus durables ne durent plus que ${REDO_DAYS} jours.</p>${choices}</details>` : `<p>${m.intro}</p>${choices}`}</div>`;
    }).join('');
    const { ov, close } = modal(this.root, 'expModal', `${ic('compass', 22)} Expéditions`, `
      <div class="tabs"><button data-tab="missions" class="${tab === 'missions' ? 'on' : ''}">${ic('compass', 16, 2)}Missions</button><button data-tab="gear" class="${tab === 'gear' ? 'on' : ''}">${ic('sword', 16, 2)}Équipement</button><button data-tab="depths" class="${tab === 'depths' ? 'on' : ''}">${ic('outpost', 16, 2)}Profondeurs</button></div>
      <section data-sec="missions" ${tab === 'missions' ? '' : 'hidden'}>
        <div class="teams"><div class="row"><b>Équipes en route : ${ex.active.length} / ${max}</b><span class="grow"></span><small>${next}</small></div>${teams}</div>
        <p class="hint">Envoyez de petites équipes chercher ce qui manque au village : vous les verrez partir, faire leur travail sur place et revenir. Sur place, un imprévu vous demandera de choisir. Chaque âge a son expédition obligatoire (★) pour passer au suivant ; en cas d’échec, on peut retenter. L’équipement, une école et un lieu de soins rendent les expéditions plus sûres.</p>
        <div class="missions">${cards}</div>
      </section>
      <section data-sec="gear" ${tab === 'gear' ? '' : 'hidden'}><div class="arsenal"></div></section>
      <section data-sec="depths" ${tab === 'depths' ? '' : 'hidden'}>${this.depthsHtml()}</section>`);
    ov.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => (b.onclick = () => {
      ov.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
      ov.querySelectorAll<HTMLElement>('[data-sec]').forEach((sec) => (sec.hidden = sec.dataset.sec !== b.dataset.tab));
    }));
    // l'arsenal se redessine quand la réserve ou la file changent ; la barre de fabrication avance en continu
    let key = '';
    const arsenal = () => {
      if (!ov.isConnected) { clearInterval(iv); return; }
      const st = ex.state, k = `${JSON.stringify(st.gear)}|${st.craft.join()}|${Math.floor(ex.ore)}|${Math.floor(h.world.wood)}|${Math.floor(h.world.stone)}|${ex.active.length}`;
      if (k !== key) { key = k; this.renderArsenal($('.arsenal', ov) as HTMLElement, () => (key = '')); }
      const bar = ov.querySelector<HTMLElement>('.queue .bar i');
      if (bar) bar.style.width = `${Math.round(ex.craftProgress() * 100)}%`;
      const rb = ov.querySelector<HTMLElement>('.railBox'), rh = this.railHtml();
      if (rb && rb.dataset.html !== rh) { rb.dataset.html = rh; rb.innerHTML = rh; }
    };
    ov.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-train]');
      if (!el) return;
      close();
      h.audio.sfxClick();
      h.followTrain(+el.dataset.train!);
    });
    const iv = setInterval(arsenal, 300);
    arsenal();
    ov.querySelectorAll<HTMLButtonElement>('button.choice').forEach((b) => (b.onclick = () => {
      const m = ex.list(age).find((x) => x.id === b.dataset.m)!, ci = +b.dataset.c!;
      const a = ex.start(m, ci, this.host.sim.age);
      if (!a) { this.toast(ex.why(m, m.choices[ci]) ?? 'Aucun chemin praticable vers cette destination.'); return; }
      close();
      h.audio.sfxClick();
      // la caméra reste où elle est : l'œil de la carte de l'équipe (à gauche) la fait suivre ; le grand départ des colons,
      // lui, se suit d'office (c'est la fin de la partie)
      if (m.farewell) h.follow(a.id);
      else this.toast(`${m.icon} ${a.fromCamp ? 'La troupe descend du camp souterrain…' : ex.status(a)} Cliquez ici ou sur l’œil de sa carte pour la suivre.`, () => { h.follow(a.id); this.update(); });
      this.update();
    }));
  }

  /** Boutons des choix d'une mission : équipe, durée, risque, équipement emporté, gains ; grisés avec la raison s'il manque quelque chose */
  private choiceButtons(m: Mission) {
    const ex = this.host.expeditions, done = ex.done(m);
    return m.choices.map((c0, i) => {
      const c = choiceAt(c0, this.host.sim.age), why = ex.why(m, c), pv = ex.preview(c), base = ex.riskOf(c);
      return `<button class="choice" data-m="${m.id}" data-c="${i}" ${why ? 'disabled' : ''} title="${why ?? ''}">
          <b>${c.label}</b><span>${c.text}</span>
          <small>👥 ${c.party}${c.mounts ? ` · 🐎 ${c.mounts} chevaux` : ''}${c.fuel ? ` · ⛽ ${c.fuel} carburant` : ''} · ⏳ ${workLabel(c.work)} · ⚠️ Risque d’échec : ${pct(pv.risk)}${pv.risk < base - 0.005 ? ` <s>${pct(base)}</s>` : ''} (${riskLabel(pv.risk)}) · ${DEST_ICON[c.dest]}</small>
          <small class="kit">Dangers : ${dangersOf(c).map((d) => DANGER_NAME[d]).join(', ')} — ${pv.label ? `on emporte ${pv.label}` : 'aucun équipement en réserve'}</small>
          <small class="gain">Si tout va bien : ${effectSummary(done ? redoEffects(c.win) : c.win)}${c.lose.length ? ` <em>— sinon : ${effectSummary(c.lose)}</em>` : ''}</small>
          ${why ? `<small class="why">${why}</small>` : ''}</button>`;
    }).join('');
  }

  /** Profondeurs : le camp souterrain, ses quêtes (accomplies, en cours, à venir), ce qu'elles lui apportent ; on y lance l'expédition armée */
  private depthsHtml() {
    const ex = this.host.expeditions, lvl = ex.camp(), st = ex.depthStats();
    // l'expédition armée qui fait avancer les quêtes, lancée d'ici
    const deep = MISSIONS.find((m) => m.id === 'deep')!, age = this.host.sim.age, miss = ex.missing(deep);
    const send = age < deep.age ? `<p class="hint">${ic('sword', 15, 2)} Les expéditions armées viendront à l’âge ${AGES[deep.age].name}.</p>`
      : miss.length ? `<p class="hint">${ic('sword', 15, 2)} Pour envoyer une expédition armée, il faut d’abord ${miss.join(', ')}.</p>`
      : ex.running(deep) ? `<p class="hint">${ic('sword', 15, 2)} Une expédition armée est déjà dans les galeries.</p>`
      : `<div class="send"><h4>${ic('sword', 16, 2)} Envoyer une expédition armée</h4><p class="hint">${lvl ? 'La troupe se rassemble au camp souterrain et s’enfonce aussitôt dans les galeries.' : 'La troupe part du village et gagne l’avant-poste.'} Victorieuse, elle abat les filons de son chemin et prend les galeries jusqu’à son front : c’est ce qui fait avancer les quêtes.</p><div class="choices">${this.choiceButtons(deep)}</div></div>`;
    const quests = CAMP_QUESTS.map((q, i) => {
      const [cur, max] = q.goal(st), done = i < lvl, now = i === lvl, k = Math.min(1, cur / max);
      return `<li class="${done ? 'done' : now ? 'cur' : 'todo'}">
        <div class="qh"><b>${done ? '✓' : now ? ic('compass', 15, 2) : ic('clock', 15, 2)} ${q.title}</b><span class="grow"></span><small>${done ? 'accomplie' : !now && cur >= max ? 'objectif atteint : elle suivra la quête en cours' : `${Math.min(cur, max)} / ${max}`}</small></div>
        <p>${q.text}</p>
        ${done ? '' : `<i class="bar"><i style="width:${Math.round(k * 100)}%"></i></i>`}
        <small class="gain">${done ? 'Le camp a gagné' : 'Le camp y gagnera'} : ${q.builds}. ${q.perk}</small>
      </li>`;
    }).join('');
    return `<p class="hint">Sous terre, on ne bâtit pas : le camp se dresse de lui-même au pied du puits du premier avant-poste, et grandit à mesure que ses quêtes s’accomplissent. Chacune lui ajoute des bâtiments et des gardes, posés d’eux-mêmes, et un avantage durable pour les expéditions armées.</p>
      <div class="campStats"><b>${ic('outpost', 18, 2)} Camp souterrain — niveau ${lvl} / ${CAMP_QUESTS.length}</b>
        <span>Galeries tenues : <b>${st.held}</b></span><span>Filons abattus : <b>${st.veins}</b></span><span>Embuscades repoussées : <b>${st.wins}</b></span><span>Zones tenues : <b>${st.zones}</b></span></div>
      <div class="railBox">${this.railHtml()}</div>
      ${send}
      <ol class="quests">${quests}</ol>`;
  }

  /** Chemin de fer : chaque ligne, où en est son train, ses voyageurs, ses mineurs et ce qu'ils remontent */
  private railHtml() {
    const h = this.host, r = h.railway, age = h.sim.age, head = `<h4>${ic('train', 16, 2)} Chemin de fer</h4>`;
    const how = '<p class="hint">Choisissez une gare d’un clic, puis « Nouvelle ligne », et cliquez dans l’ordre les gares et les avant-postes à relier (Entrée pour valider). La voie se pose d’elle-même d’un arrêt à l’autre et un train fait la navette : il prend et dépose des voyageurs aux gares ; à un avant-poste, il descend une équipe de mineurs et remonte celle d’avant avec le minerai des galeries tenues (la pierre taillée quand il n’y a plus de filon).</p>';
    if (age < 3) return `${head}<p class="hint">Le chemin de fer viendra avec les gares, à l’âge industriel.</p>`;
    if (!h.world.lines.length) return `${head}${how}<p class="hint">Aucune ligne pour l’instant : bâtissez une gare (petite gare, ou la gare centrale) et un avant-poste.</p>`;
    const lines = h.world.lines.map((l) => {
      const tr = r.trains.get(l.id);
      if (!tr) return '';
      const day = r.trainDaily(tr), seated = r.seated(tr);
      return `<div class="rcard"><div class="rhead">${dot(l.color)}<b>${r.lineLabel(l)}</b></div>
        <div class="campStats"><span>Train : <b>${trainWhere(r, tr)}</b>${seated ? ` (${seated} à bord)` : ''}</span><span>Voyageurs arrivés : <b>${tr.carried}</b></span>
        ${tr.mine >= 0 ? `<span>Mineurs au fond : <b>${tr.crew.length}</b></span><span>Au camp : <b>${Math.floor(tr.pile.ore)} minerai · ${Math.floor(tr.pile.stone)} pierre</b></span><span>Par jour : <b>≈ ${day.ore} minerai · ${day.stone} pierre</b></span><span>Remonté : <b>${tr.delivered.ore} minerai · ${tr.delivered.stone} pierre</b></span><span>Filons abattus : <b>${tr.dug}</b></span>` : ''}</div>
        ${tr.why ? '' : `<button class="trainBtn" data-train="${l.id}">${ic('eye', 16, 2)} Suivre le train</button>`}</div>`;
    }).join('');
    return `${head}${how}${lines}`;
  }

  /** Équipement : réserve, fabrication et file d'attente */
  private renderArsenal(el: HTMLElement, changed: () => void) {
    const h = this.host, ex = h.expeditions, age = h.sim.age, st = ex.state;
    const away = (id: GearId) => ex.active.reduce((n, a) => n + (a.gear[id] ?? 0), 0);
    const per = (id: GearId) => ({ spear: 'une par membre', bow: 'un par membre', sword: 'une par membre', rifle: 'un par membre', rope: 'une pour deux', torch: 'une pour deux', boat: 'une pour trois', kit: 'une par équipe', armor: 'une par membre' }[id]);
    el.innerHTML = `
      <p class="hint">Chaque équipe emporte le meilleur équipement en réserve contre les dangers de sa destination, et le rapporte au retour (un échec peut en coûter une pièce). Sur place, certaines décisions demandent une corde, une barque ou des armes. Le village fabrique une pièce après l’autre, plus vite avec un atelier. Réserve : <b>${Math.floor(h.world.wood)}</b> bois, <b>${Math.floor(h.world.stone)}</b> pierre, <b>${Math.floor(ex.ore)}</b> minerai.</p>
      <div class="gearGrid">${GEAR.map((g) => {
        const why = ex.whyCraft(g, age), n = st.gear[g.id], out = away(g.id), locked = age < g.age, price = gearCostLabel(gearCost(g, h.world.difficulty));
        return `<div class="gear ${locked ? 'locked' : ''}">
          <div class="gi">${ic(g.icon, 26, 1.8)}</div>
          <div class="grow"><b>${g.name}</b> <span class="cnt">${n} en réserve${out ? ` · ${out} en route` : ''}</span>
            <small>${g.desc}</small>
            <small class="gd">${g.guards ? DANGER_VS[g.guards] : 'Utile partout'}${g.also ? ` et les ${DANGER_NAME[g.also]}` : ''} : −${Math.round(g.cut * 100)} % de risque · ${per(g.id)}</small>
            ${why ? `<small class="why">${why}</small>` : ''}</div>
          <button data-craft="${g.id}" ${why ? 'disabled' : ''} title="${why ?? `Fabriquer : ${g.time} s${price ? `, ${price}` : ''}`}">${ic('hammer', 16, 2)} ${price || 'Fabriquer'}</button>
        </div>`;
      }).join('')}</div>
      <h4>Fabrication</h4>
      <div class="queue">${st.craft.length ? st.craft.map((id, i) => `<span class="qi">${ic(GEAR_BY[id].icon, 16, 2)} ${GEAR_BY[id].name}${i === 0 ? '<i class="bar"><i></i></i>' : ''}<button data-cancel="${i}" title="Annuler" aria-label="Annuler">${ic('close', 14, 2)}</button></span>`).join('') : '<small>Rien en cours.</small>'}</div>`;
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
    this.toast(`${a.m.icon} « ${a.m.title} » : ${a.wait?.title.toLowerCase()} — une décision vous attend (cliquez ici).`, () => this.showDecision(a));
    if (!this.root.querySelector('.overlay') && this.host.tools.tool === 'none') this.showDecision(a);
    this.update();
  }

  /** l'état de la pause avant qu'une décision n'arrête le jeu (null : aucune décision ouverte) */
  private pausedFor: boolean | null = null;

  /** Ferme la fenêtre du dessus (Échap) ; false s'il n'y en avait pas */
  closeTop(): boolean {
    const ovs = this.root.querySelectorAll<HTMLElement & { close?: () => void }>('.overlay');
    const top = ovs[ovs.length - 1];
    if (!top?.close || top.id === 'menu' || top.classList.contains('victory')) return false;
    top.close();
    return true;
  }

  /** Décision à prendre sur l'imprévu en cours d'une équipe */
  showDecision(a: ActiveExpedition) {
    const h = this.host, ex = h.expeditions, ev = a.wait;
    if (!ev) return;
    this.root.querySelector('.decide')?.closest('.overlay')?.remove();
    const opts = ev.options.map((o, i) => {
      const ok = ex.canTake(a, i), hints: string[] = [];
      // « des armes » plutôt que la liste de toutes les armes possibles
      const names = (gs: GearId[]) => (gs.length > 2 ? 'des armes' : gs.map((g) => GEAR_BY[g].plural.toLowerCase()).join(' ou '));
      if (o.needs) hints.push(ok ? `avec ${names(o.needs.filter((g) => (a.gear[g] ?? 0) > 0))}` : `demande ${names(o.needs)}, non emportées`);
      if (o.risk < 0.98) hints.push(o.risk <= 0.7 ? 'bien plus sûr' : 'plus sûr');
      else if (o.risk > 1.02) hints.push(o.risk >= 1.25 ? 'bien plus risqué' : 'plus risqué');
      if (o.work) hints.push(o.work > 0 ? 'plus long' : 'plus rapide');
      if (o.bonus) hints.push(`si tout va bien : ${effectSummary(o.bonus)}`);
      return `<button class="choice opt" data-o="${i}" ${ok ? '' : 'disabled'}><b>${o.label}</b><small>${hints.join(' · ') || 'sans effet particulier'}</small></button>`;
    }).join('');
    // le jeu s'arrête le temps de la décision ; il reprend à la fermeture s'il tournait
    if (this.pausedFor === null) { this.pausedFor = h.time.paused; h.time.paused = true; }
    const { ov, close } = modal(this.root, 'decide', `${a.m.icon} ${a.m.title}`, `
      <h4 class="evt">${ic('alert', 18, 2)} ${ev.title}</h4>
      <p class="story">${ev.text}</p>
      <button class="look">${ic('eye', 16, 2)} Voir l’équipe</button>
      ${opts}
      <p class="hint">Risque d’échec de l’expédition pour l’instant : ${pct(ex.chance(a))}. Le jeu est en pause pendant que vous choisissez. Sans réponse, l’équipe finit par prendre d’elle-même la voie la plus sûre.</p>`, () => {
      clearInterval(iv);
      if (this.root.querySelector('.decide')) return;
      if (this.pausedFor === false) h.time.paused = false;
      this.pausedFor = null;
    });
    // l'équipe a tranché d'elle-même (le jeu relancé à la main) : la fenêtre n'a plus lieu d'être
    const iv = setInterval(() => { if (a.wait !== ev || !ex.active.includes(a)) close(); }, 500);
    // la scène reste visible à côté de la fenêtre : un clic y emmène la caméra, pour voir l'imprévu avant de choisir
    ($('.look', ov) as HTMLButtonElement).onclick = () => { h.follow(a.id); this.update(); };
    ov.querySelectorAll<HTMLButtonElement>('button.opt').forEach((b) => (b.onclick = () => {
      if (a.wait === ev && ex.decide(a, +b.dataset.o!)) { h.audio.sfxClick(); this.toast(`${a.m.icon} ${ev.options[+b.dataset.o!].label}.`); }
      close();
      this.update();
    }));
  }

  /** Récit du retour d'une expédition */
  showReport(r: Report) {
    const { ov, close } = modal(this.root, `report ${r.ok ? 'win' : 'lose'}`, `${r.m.icon} ${r.m.title}`, `
      <h2>${r.ok ? 'Réussite !' : 'Échec…'}</h2>
      <p class="story"></p>
      ${r.notes.length ? `<ul class="notes">${r.notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
      <p class="sum">${r.summary === 'rien' ? 'Rien de gagné, rien de perdu.' : r.summary}</p>
      ${r.ok && r.m.unlocks && !r.redo ? `<p class="unlock">${ic(KIND_ICON[r.m.unlocks], 18, 2)} Nouveau : vous pouvez bâtir <b>${KINDS[r.m.unlocks].names[this.host.sim.age].toLowerCase()}</b> (rayon ${BUILD_CATS.find((c) => c.id === KINDS[r.m.unlocks!].cat)!.label}).${UNLOCK_NOTE[r.m.unlocks] ?? ''}</p>` : ''}
      ${r.ok && r.m.mandatory ? '<p class="hint">Expédition obligatoire réussie : l’âge suivant se rapproche.</p>' : !r.ok && r.m.mandatory ? '<p class="hint">On pourra retenter l’expédition, avec le même choix ou un autre.</p>' : ''}
      <div class="row"><span class="grow"></span><button class="active ok">Fermer</button></div>`);
    $('.story', ov).textContent = `« ${r.c.label} » : ${r.text}`;
    $('.ok', ov).onclick = close;
    // ni un clic à côté, ni Échap pour remonter du monde souterrain ne l'effacent avant qu'on l'ait lu (on le ferme au bouton)
    ov.addEventListener('pointerdown', (e) => { if (e.target === ov) e.stopImmediatePropagation(); }, true);
    (ov as HTMLElement & { close?: () => void }).close = () => { if (!document.body.classList.contains('under')) close(); };
  }

  // ---------------- Réglages ----------------
  openSettings() {
    const h = this.host, t = h.time, a = h.audio;
    const tabs = [['time', 'clock', 'Temps et météo'], ['look', 'palette', 'Image et son'], ['game', 'houses', 'Partie']];
    // au bac à sable et en défi, la difficulté impose le réglage des ressources
    const forced = DIFF_TEXT.resForced[h.world.difficulty];
    const { ov, close } = modal(this.root, 'settings', `${ic('gear', 22)} Réglages`, `
      <div class="tabs">${tabs.map(([k, i, l], n) => `<button data-tab="${k}" class="${n ? '' : 'on'}">${ic(i, 16, 2)}${l}</button>`).join('')}</div>
      <section data-sec="time">
        <h4>Vitesse</h4>
        <div class="row"><button data-sp="0">${ic('pause', 16, 2.2)} Pause</button><button data-sp="1">×1</button><button data-sp="2">×2</button><button data-sp="4">×4</button></div>
        <div class="row"><label>Durée du jour</label><input id="sDay" type="range" min="30" max="400" step="10" value="${t.dayLen}"><span id="vDay">${t.dayLen}s</span></div>
        <div class="row"><label>Durée saison</label><input id="sSeason" type="range" min="30" max="600" step="10" value="${t.seasonLen}"><span id="vSeason">${t.seasonLen}s</span></div>
        <h4>Saison et heure</h4>
        <div class="row">${SEASONS.map((s, i) => `<button data-season="${i}" class="${t.season === i ? 'active' : ''}">${ic(SEASON_ICONS[i], 16)} ${s}</button>`).join('')}</div>
        <div class="row"><label>Heure</label><input id="sHour" type="range" min="0" max="23.9" step="0.1" value="${t.hour.toFixed(1)}"><span id="vHour">${Math.floor(t.hour)}h</span></div>
        <h4>Météo</h4>
        <div class="row">${[['auto', '', 'Auto'], ['clear', 'sun', 'Clair'], ['rain', 'rain', 'Pluie'], ['snow', 'snow', 'Neige'], ['fog', 'fog', 'Brume']].map(([k, i, l]) => `<button data-w="${k}" class="${(h.env.manualWeather ?? 'auto') === k ? 'active' : ''}">${i ? ic(i, 16) + ' ' : ''}${l}</button>`).join('')}</div>
      </section>
      <section data-sec="look" hidden>
        <h4>Graphismes</h4>
        <div class="row">${[['high', 'Haute (halo de nuit)'], ['medium', 'Normale'], ['low', 'Réduite']].map(([k, l]) => `<button data-q="${k}" class="${h.quality === k ? 'active' : ''}">${l}</button>`).join('')}</div>
        <h4>Audio</h4>
        <div class="row"><label>Musique</label><input id="sMusic" type="range" min="0" max="1" step="0.05" value="${a.musicVol}"><button id="mMusic" aria-label="Couper la musique" class="${a.muteMusic ? 'active' : ''}">${ic(a.muteMusic ? 'mute' : 'volume', 18)}</button></div>
        <div class="row"><label>Sons</label><input id="sSfx" type="range" min="0" max="1" step="0.05" value="${a.sfxVol}"><button id="mSfx" aria-label="Couper les sons" class="${a.muteSfx ? 'active' : ''}">${ic(a.muteSfx ? 'mute' : 'volume', 18)}</button></div>
      </section>
      <section data-sec="game" hidden>
        <h4>Règles</h4>
        <div class="row"><label>${DIFF_TEXT.setting}</label><span class="diffTag ${h.world.difficulty}">${ic(DIFF_TEXT.icon[h.world.difficulty], 16, 2)}${DIFF_TEXT.name[h.world.difficulty]}</span></div>
        <ul class="hint dpoints">${DIFF_TEXT.points[h.world.difficulty].map((x) => `<li>${x}</li>`).join('')}</ul>
        <p class="hint">${DIFF_TEXT.settingHint}</p>
        <div class="row"><label>Catastrophes</label><button id="gDisasters" class="${h.disasters ? 'active' : ''}">${h.disasters ? 'Activées' : 'Désactivées'}</button></div>
        <p class="hint">Activées : le volcan se réveille de lui-même, la lave et les incendies peuvent détruire des bâtiments. Désactivées : ni éruption spontanée, ni incendie.</p>
        <div class="row"><label>Routes auto</label><button id="gRoads" class="${h.autoRoads ? 'active' : ''}">${h.autoRoads ? 'Activées' : 'Désactivées'}</button></div>
        <p class="hint">Un chemin relie chaque nouveau bâtiment à la route la plus proche, s’il n’y touche pas déjà.</p>
        <div class="row"><label>Ressources</label><button id="gUnlimited" class="${h.world.unlimited ? 'active' : ''}" ${forced ? 'disabled' : ''}>${forced ?? (h.world.unlimited ? 'Illimitées' : 'Normales')}</button></div>
        <p class="hint">Normales : bois, pierre et minerai se gagnent et se dépensent. Illimitées : ils ne manquent jamais — les grands bâtiments ne coûtent rien, l’équipement non plus, et le minerai demandé pour passer d’âge est acquis.</p>
        <h4>Sauvegarde</h4>
        <div class="row"><button id="gSave">${ic('save', 16)} Sauvegarder</button><button id="gExport">${ic('download', 16)} Exporter</button><button id="gImport">${ic('upload', 16)} Importer</button></div>
        ${this.tutorial?.settingsHtml() ?? ''}
        <h4>Quitter</h4>
        <div class="row"><button id="gNew">${ic('restart', 16)} Recommencer cette carte</button><button id="gMenu">${ic('house', 16)} Menu principal</button></div>
        <input type="file" id="fImport" accept="application/json,.json" style="display:none">
      </section>
      <div class="row foot"><span class="grow"></span><button id="gClose" class="active">Fermer</button></div>`);
    const q = <T extends HTMLElement>(s: string) => $(s, ov) as T;
    q('#gClose').onclick = close;
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
    // la fenêtre suit le jeu tant qu'elle est ouverte : vitesse en cours, saison et heure qui avancent
    const live = () => {
      ov.querySelectorAll<HTMLButtonElement>('[data-sp]').forEach((b) => { const v = +b.dataset.sp!; b.classList.toggle('active', v === 0 ? t.paused : !t.paused && t.speed === v); });
      ov.querySelectorAll<HTMLButtonElement>('[data-season]').forEach((b) => b.classList.toggle('active', +b.dataset.season! === t.season));
      const hour = q<HTMLInputElement>('#sHour');
      if (document.activeElement !== hour) { hour.value = t.hour.toFixed(1); q('#vHour').textContent = `${Math.floor(t.hour)}h`; }
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
    ov.querySelectorAll<HTMLButtonElement>('[data-w]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.w!;
      h.env.setWeather(k === 'auto' ? null : (k as WeatherKind));
      if (k === 'auto') h.env.wantKind = 'clear';
      ov.querySelectorAll('[data-w]').forEach((x) => x.classList.toggle('active', x === b));
    }));
    ov.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => (b.onclick = () => {
      h.setQuality(b.dataset.q as 'high' | 'medium' | 'low');
      ov.querySelectorAll('[data-q]').forEach((x) => x.classList.toggle('active', x === b));
    }));
    q('#gDisasters').onclick = () => {
      h.setDisasters(!h.disasters);
      q('#gDisasters').textContent = h.disasters ? 'Activées' : 'Désactivées';
      q('#gDisasters').classList.toggle('active', h.disasters);
    };
    q('#gUnlimited').onclick = () => {
      // passer en ressources illimitées en pleine partie change tout : un second clic le confirme
      const b = q<HTMLButtonElement>('#gUnlimited');
      if (!h.world.unlimited && !b.dataset.sure) {
        b.dataset.sure = '1';
        b.textContent = 'Sûr ? Recliquez pour tout rendre illimité';
        setTimeout(() => { if (b.dataset.sure) { delete b.dataset.sure; b.textContent = h.world.unlimited ? 'Illimitées' : 'Normales'; } }, 4000);
        return;
      }
      delete b.dataset.sure;
      h.world.unlimited = !h.world.unlimited;
      h.applySettings();
      q('#gUnlimited').textContent = h.world.unlimited ? 'Illimitées' : 'Normales';
      q('#gUnlimited').classList.toggle('active', h.world.unlimited);
      this.update();
    };
    q('#gRoads').onclick = () => {
      h.setAutoRoads(!h.autoRoads);
      q('#gRoads').textContent = h.autoRoads ? 'Activées' : 'Désactivées';
      q('#gRoads').classList.toggle('active', h.autoRoads);
    };
    rng('#sMusic', (v) => (a.musicVol = v));
    rng('#sSfx', (v) => (a.sfxVol = v));
    q('#mMusic').onclick = () => { a.muteMusic = !a.muteMusic; q('#mMusic').innerHTML = ic(a.muteMusic ? 'mute' : 'volume', 18); q('#mMusic').classList.toggle('active', a.muteMusic); h.applySettings(); };
    q('#mSfx').onclick = () => { a.muteSfx = !a.muteSfx; q('#mSfx').innerHTML = ic(a.muteSfx ? 'mute' : 'volume', 18); q('#mSfx').classList.toggle('active', a.muteSfx); h.applySettings(); };
    q('#gSave').onclick = () => { h.saveNow(); this.toast('Partie sauvegardée'); };
    q('#gExport').onclick = () => h.exportSave();
    const fi = q<HTMLInputElement>('#fImport');
    q('#gImport').onclick = () => fi.click();
    fi.onchange = () => { if (fi.files?.[0]) h.importFile(fi.files[0]); };
    q('#gNew').onclick = async () => { const d = await chooseDifficulty(this.root, { current: h.world.difficulty, note: DIFF_TEXT.restartNote, ok: DIFF_TEXT.restart }); if (d) h.newGame(d); };
    q('#gMenu').onclick = () => h.toMenu();
    this.tutorial?.bindSettings(ov, close);
  }
}

// ---------------- Menu principal ----------------
export interface MenuHost {
  /** `seed` : graine d'une nouvelle partie (celle du continent montré en aperçu) ; `difficulty` : celle qu'a choisie le joueur */
  start(map: number, mode: 'continue' | 'new', seed?: number, difficulty?: Difficulty): void;
  importFile(f: File): void;
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

export function showMenu(root: HTMLElement, host: MenuHost): HTMLElement {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.id = 'menu';
  ov.innerHTML = `
    <h1>Village Lowpoly</h1>
    <p class="sub">Bâtissez, sculptez et regardez votre village traverser six âges et quatre saisons.</p>
    <div class="maps"></div>
    <div class="row" style="justify-content:center"><button id="mImport">${ic('upload', 16)} Importer une sauvegarde (JSON)</button></div>
    <input type="file" id="mFile" accept="application/json,.json" style="display:none">
    <p class="hint">Souris : clic gauche = outil, clic droit + glisser = tourner, molette = zoom, clic milieu ou Maj + clic droit = déplacer, ZQSD/flèches = déplacement, A/E = rotation (WASD et Q/E en QWERTY).<br>Tactile : un doigt = outil, deux doigts = déplacer / zoomer / tourner.</p>`;
  const maps = $('.maps', ov);
  for (const m of MAPS) {
    const save = loadSlot(m.id);
    const card = document.createElement('div');
    card.className = 'card panel';
    card.innerHTML = `<canvas></canvas><h3>${m.name}</h3><p>${m.desc}</p><div class="stat"></div><div class="btns"></div>`;
    // chaque nouvelle partie a son continent : sans sauvegarde, l'aperçu montre celui de la graine tirée pour elle
    const seed = newSeed();
    const heights = save ? (save.world.heights as number[]).map((v) => v / 100) : genHeights(m.id, seed);
    drawPreview($('canvas', card) as HTMLCanvasElement, heights);
    if (save) $('.stat', card).textContent = `${AGES[save.age].name} · ${Math.floor(save.pop)} hab. · ${SEASONS[Math.floor(save.seasonT) % 4]} · ${DIFF_TEXT.name[readDifficulty(save.world.difficulty)]}`;
    const btns = $('.btns', card);
    if (save) {
      btns.innerHTML = `<button class="active" data-m="continue">Continuer</button><button data-m="new">Nouvelle</button>`;
    } else btns.innerHTML = `<button class="active" data-m="new">Jouer</button>`;
    btns.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = async () => {
      const mode = b.dataset.m as 'continue' | 'new';
      if (mode === 'continue') { host.start(m.id, mode); return; }
      // une nouvelle partie : le joueur choisit sa difficulté (la fenêtre prévient s'il écrase une sauvegarde)
      const d = await chooseDifficulty(root, { note: save ? DIFF_TEXT.overwrite : undefined });
      if (d) host.start(m.id, mode, seed, d);
    }));
    maps.appendChild(card);
  }
  const f = $<HTMLInputElement>('#mFile', ov);
  $('#mImport', ov).onclick = () => f.click();
  f.onchange = () => { if (f.files?.[0]) host.importFile(f.files[0]); };
  // le tutoriel guidé, pour la partie qu'on lance
  maps.after(menuToggle());
  root.appendChild(ov);
  return ov;
}
export type { SaveData };
