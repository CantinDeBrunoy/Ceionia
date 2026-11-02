import { ToolController, ToolId, SCULPT_TOOLS, VEG_TOOLS, SINGLE_TOOLS } from '../build/tools';
import { KINDS, KIND_ORDER, AGES, KindId, KindDef, SEASONS, BUILD_CATS, BuildCat } from '../build/catalog';
import { Sim } from '../sim/sim';
import type { Agents } from '../sim/agents';
import { GameTime } from '../core/time';
import { Environment, WeatherKind } from '../render/env';
import { AudioEngine } from '../audio/audio';
import { CameraRig } from '../core/camera';
import { loadSlot, SaveData } from '../save/save';
import { MAPS, genHeights } from '../world/mapgen';
import { Expeditions, Report, ActiveExpedition, partyLimit } from '../sim/expeditions';
import { Railway, isStation } from '../sim/railway';
import { effectSummary, mandatoryFor, DestKind, Mission, MISSIONS, redoEffects, REDO_DAYS, penHerds } from '../sim/missions';
import type { World } from '../world/world';
import { GEAR, GEAR_BY, GearId, DANGER_NAME, DANGER_VS, dangersOf } from '../sim/gear';
import { CAMP_QUESTS } from '../sim/depths';
import { costOf, costLabel, Resource } from '../sim/economy';
import { TEAM_COLORS } from '../render/expeditionView';
import { ic, KIND_ICON, CAT_ICON, SEASON_ICONS } from './icons';

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
  newGame(): void;
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
  followTrain(): void;
  agents: Agents;
  following: number | null;
  follow(id: number | null): void;
}

const DEST_ICON: Record<DestKind, string> = { plain: '🌾 plaine', forest: '🌲 forêt', river: '🏞️ rivière', mountain: '⛰️ montagne', cave: '🕳️ grotte', far: '🧭 au loin' };
const TRAIN_WHERE: Record<Railway['phase'], string> = { station: 'à quai en gare', down: 'en route vers l’avant-poste', post: 'à quai au pied de la grotte', up: 'en route vers la gare' };
/** Pourquoi il n'y a pas (encore) de chemin de fer */
function railWhy(r: Railway, age: number) {
  return r.why === 'station' ? (age < 3 ? 'Le chemin de fer viendra avec la gare, à l’âge industriel : elle reliera le village à l’avant-poste.' : 'Bâtissez la gare (bâtiment majeur) : une voie la reliera d’elle-même à l’avant-poste.')
    : r.why === 'under' ? 'Le monde souterrain se prépare…'
    : r.why === 'post' ? 'Bâtissez un avant-poste tout contre une grotte ou une faille : la voie ferrée l’y reliera depuis la gare.'
    : 'Pas de tracé possible entre la gare et l’avant-poste : de l’eau, des bâtiments ou des pentes trop raides barrent le chemin.';
}
const riskLabel = (r: number) => (r <= 0.12 ? 'très sûr' : r <= 0.22 ? 'sûr' : r <= 0.32 ? 'risqué' : 'très risqué');
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
  rocks: 'Poser des rochers (un clic).', cave: 'Ouvrir une grotte vers le monde souterrain (un clic).', fissure: 'Ouvrir une faille vers le monde souterrain (un clic).',
  erase: 'Effacer forêts, champs, jardins et rochers.', road: 'Tracer une route en glissant ; sur l’eau peu profonde, elle devient un pont.',
  bulldoze: 'Démolir un bâtiment, une route ou un décor.', move: 'Ramasser un bâtiment pour le reposer ailleurs (Échap pour annuler).',
};

/** Outils rapides, toujours à portée en haut à gauche de la barre */
const QUICK = ['none', 'road', 'bulldoze', 'move'];

/** Grands onglets de la barre du bas */
const TABS = [
  { id: 'relief', icon: 'relief', label: 'Relief', hint: 'Sculptez le terrain', tools: ['raise', 'lower', 'flatten', 'cliff', 'dig', 'mountain', 'volcano'] },
  { id: 'nature', icon: 'tree', label: 'Nature', hint: 'Plantez et décorez', tools: ['forest', 'field', 'garden', 'rocks', 'cave', 'fissure', 'erase'] },
  { id: 'build', icon: 'houses', label: 'Bâtir', hint: '', tools: [] as string[] },
];

/** Besoins du village, dans l'ordre de la barre du haut */
const NEEDS: { k: 'food' | 'water' | 'housing' | 'jobs' | 'joy' | 'health'; icon: string; label: string }[] = [
  { k: 'food', icon: 'bread', label: 'Nourriture' }, { k: 'water', icon: 'drop', label: 'Eau' }, { k: 'housing', icon: 'house', label: 'Logement' },
  { k: 'jobs', icon: 'hammer', label: 'Travail' }, { k: 'joy', icon: 'smile', label: 'Bien-être' }, { k: 'health', icon: 'heart', label: 'Santé' },
];
/** Ce qu'un bâtiment apporte, pour sa fiche et sa vignette */
const GIVES: { k: 'housing' | 'food' | 'water' | 'jobs' | 'joy' | 'health'; icon: string; label: string }[] = [
  { k: 'housing', icon: 'house', label: 'logements' }, { k: 'food', icon: 'bread', label: 'nourriture' }, { k: 'water', icon: 'drop', label: 'eau' },
  { k: 'jobs', icon: 'hammer', label: 'emplois' }, { k: 'joy', icon: 'smile', label: 'bien-être' }, { k: 'health', icon: 'heart', label: 'santé' },
];
const num = (v: number) => (v < 1 ? v.toFixed(1) : String(Math.round(v)));
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

/** Fenêtre du jeu : titre, contenu, bouton de fermeture ; se ferme aussi d'un clic à côté */
function modal(root: HTMLElement, cls: string, title: string, body: string): { ov: HTMLElement; close: () => void } {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal panel ${cls}"><div class="mtitle"><h3>${title}</h3><button class="x" title="Fermer" aria-label="Fermer">${ic('close', 16, 2)}</button></div>${body}</div>`;
  root.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener('pointerdown', (e) => { if (e.target === ov) close(); });
  $('.x', ov).onclick = close;
  return { ov, close };
}

/** Onglet auquel appartient un outil ('none' reste dans l'onglet courant) */
const tabOfTool = (tool: ToolId, current: string) =>
  SCULPT_TOOLS.includes(tool) ? 'relief' : VEG_TOOLS.includes(tool) ? 'nature' : tool === 'none' ? current : 'build';

/** Ce que change un bâtiment débloqué par une expédition, dit au retour de l'équipe */
const UNLOCK_NOTE: Partial<Record<KindId, string>> = {
  pen: ' Les bêtes ramenées y vivront.', stable: ' Les chevaux ramenés y vivront.', mine: ' Elle rapportera du minerai chaque jour.',
  outpost: ' Bâtissez-le tout contre une grotte ou une faille : sa garnison tiendra les galeries dessous, et les expéditions armées partiront de là.',
};

export class UI {
  root: HTMLElement;
  tab = 'build';
  /** rayon ouvert de la barre de construction */
  cat: BuildCat = 'home';
  private lastAge = -1;
  private toastTimer = 0;
  private bannerTimer = 0;
  /** bâtiment ou outil survolé dans la barre (sa fiche s'affiche) */
  private hover: { kind?: KindId; tool?: string } | null = null;
  /** fiche du bâtiment sélectionné : redessinée seulement quand il change */
  private selKey = '';
  /** cartes des expéditions en cours, par numéro */
  private expCards = new Map<number, HTMLElement>();

  constructor(root: HTMLElement, private host: UIHost) {
    this.root = root;
    root.innerHTML = `
      <header id="hud">
        <div id="agePanel" class="panel" title="Voir ce qu'il faut pour l'âge suivant">
          <div class="ageTop"><b id="ageName"></b><small id="ageSub"></small></div>
          <div class="bar"><i id="ageBar"></i></div>
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
              <button id="bHome" title="Vue d'ensemble" aria-label="Vue d'ensemble">${ic('target', 17, 2)}</button>
              <button id="bUnder" title="Explorer le monde souterrain (U)" aria-label="Monde souterrain">${ic('pickaxe', 17, 2)}</button>
            </div>
          </div>
          <div id="items"></div>
          <div id="dockBottom">
            <div id="subcats"></div>
            <div id="brush"><span>Taille du pinceau</span><input id="rad" type="range" min="1" max="8" step="0.5" value="3"><b id="radv">3</b></div>
          </div>
        </div>
      </footer>
      <div id="toast"></div>
      <div id="bannerWrap"><div id="banner" class="panel"><h2></h2><p></p></div></div>
      <div id="photoBar" class="panel"><button id="pCap">${ic('camera', 18)} Capturer</button><button id="pExit">Quitter</button></div>
    `;
    $('#needs').innerHTML = NEEDS.map((n) => `<div class="need" id="n-${n.k}"><b>${ic(n.icon, 20)}</b><div class="bar"><i></i></div><span>${n.label}</span></div>`).join('')
      + `<button class="pop" id="pop" title="État des habitants" aria-label="État des habitants" aria-expanded="false">0<small>habitants</small></button>`;
    // fiche des habitants : un clic sur le compteur l'ouvre, un clic ailleurs la ferme
    const census = document.createElement('div');
    census.id = 'census';
    census.className = 'panel';
    census.hidden = true;
    root.appendChild(census);
    $('#pop').onclick = () => { census.hidden ? this.openCensus() : this.closeCensus(); this.host.audio.sfxClick(); };
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as HTMLElement;
      if (!census.hidden && !census.contains(t) && !t.closest('#pop')) this.closeCensus();
    });

    $('#agePanel').onclick = () => $('#agePanel').classList.toggle('open');
    $('#bPause').onclick = () => { host.time.paused = !host.time.paused; host.audio.sfxClick(); };
    $('#bFog').onclick = () => { host.dispelFog(); host.audio.sfxClick(); this.toast('Le brouillard se lève.'); };
    $('#bSpeed').onclick = () => {
      const seq = [1, 2, 4];
      host.time.speed = seq[(seq.indexOf(host.time.speed) + 1) % seq.length] ?? 1;
      host.time.paused = false; host.applySettings();
    };
    $('#bSettings').onclick = () => this.openSettings();
    $('#bExp').onclick = () => this.openExpeditions();
    $('#bPhoto').onclick = () => host.setPhoto(true);
    $('#pExit').onclick = () => host.setPhoto(false);
    $('#pCap').onclick = () => host.capture();
    $('#bUndo').onclick = () => host.tools.undo();
    $('#bRedo').onclick = () => host.tools.redo();
    $('#bRot').onclick = () => host.tools.rotate();
    $('#bHome').onclick = () => host.cam.reset();
    $('#bUnder').onclick = () => host.enterNearest();
    $('#bUp').onclick = () => host.exitUnder();
    $('#campQuest').onclick = () => this.openExpeditions('depths');
    $('#bTorch').onclick = () => { host.torchMode = !host.torchMode; host.audio.sfxClick(); this.update(); };
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
    modes.innerHTML = TABS.map((t) => `<button data-t="${t.id}" class="${t.id === this.tab ? 'active' : ''}" title="${t.label}"><b>${ic(t.icon, 20)}</b><span>${t.label}</span></button>`).join('');
    modes.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => {
      this.tab = b.dataset.t!;
      // l'outil courant appartient à un autre onglet : on le lâche, sinon refreshTools ramènerait l'onglet
      if (tabOfTool(this.host.tools.tool, this.tab) !== this.tab) this.host.tools.setTool('none');
      this.renderDock(); this.host.audio.sfxClick();
    }));
    const quick = $('#quickL');
    quick.innerHTML = QUICK.map((id) => { const i = TOOL_INFO[id]; return `<button data-tool="${id}" title="${i.label}${i.key ? ` (${i.key})` : ''}" aria-label="${i.label}">${ic(i.icon, 17, 2)}</button>`; }).join('');
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

  renderItems() {
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
      html = KIND_ORDER.filter((k) => KINDS[k].cat === this.cat).map((k) => {
        const d = KINDS[k], locked = !!this.lockOf(k), a = Math.max(age, d.minAge), n = this.host.sim.counts[k] ?? 0;
        const badge = locked ? '<i class="badge lock">🔒</i>' : n ? `<i class="badge">${n}</i>` : '';
        return `<button class="tile kind ${locked ? 'locked' : ''} ${d.size === 2 ? 'big' : ''}" data-kind="${k}" aria-label="${d.names[a]}"><b>${ic(KIND_ICON[k], 28, 1.6)}</b><span class="lbl">${d.names[a]}</span>${badge}</button>`;
      }).join('');
    } else {
      html = t.tools.map((id) => { const i = TOOL_INFO[id]; return `<button class="tile" data-tool="${id}" aria-label="${i.label}"><b>${ic(i.icon, 28, 1.6)}</b><span class="lbl">${i.label}</span>${i.key ? `<i class="key">${i.key}</i>` : ''}</button>`; }).join('');
    }
    const items = $('#items');
    items.innerHTML = html;
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

  /** Fiche de l'outil ou du bâtiment survolé, sinon du bâtiment qu'on s'apprête à poser */
  private renderInfo() {
    const tl = this.host.tools, box = $('#info');
    const held = tl.tool === 'build' || (tl.tool === 'move' && tl.holding()) ? tl.kind : null;
    const k = this.hover ? this.hover.kind ?? null : held, tool = this.hover?.tool;
    box.classList.toggle('show', !!(k || tool));
    if (tool) {
      const i = TOOL_INFO[tool];
      box.innerHTML = `<div class="ihead"><b>${ic(i.icon, 28, 1.6)}</b><div class="grow"><h4>${i.label}</h4>${i.key ? `<small>Raccourci : ${i.key}</small>` : ''}</div></div><p>${TOOL_DESC[tool] ?? ''}</p>`;
      return;
    }
    if (!k) return;
    const d: KindDef = KINDS[k], age = this.host.sim.age, lock = this.lockOf(k), a = Math.max(age, d.minAge);
    const n = this.host.sim.counts[k] ?? 0;
    const effs = GIVES.map((g) => (d[g.k]?.[a] ? `<span class="eff">${ic(g.icon, 14, 2)} +${num(d[g.k]![a])} ${g.label}</span>` : '')).join('');
    // les grands bâtiments se paient en bois et en pierre
    const cost = costOf(k, age), w = this.host.world, rich = !cost || (w.wood >= cost.wood && w.stone >= cost.stone);
    box.innerHTML = `<div class="ihead"><b>${ic(KIND_ICON[k], 28, 1.6)}</b><div class="grow"><h4>${d.names[a]}</h4><small>${d.size === 2 ? 'Grand bâtiment (2 × 2) · ' : ''}${n ? `${n} dans le village` : 'pas encore construit'}</small></div></div>
      <p>${d.desc}</p>${effs ? `<div class="effs">${effs}</div>` : ''}${d.perk ? `<p class="perk">✦ ${d.perk}</p>` : ''}
      ${cost ? `<p class="cost ${rich ? '' : 'short'}">${ic('hammer', 14, 2)} Coût : ${costLabel(cost)}${rich ? '' : ` — vous avez ${Math.floor(w.wood)} bois et ${Math.floor(w.stone)} pierre`}</p>` : ''}
      ${lock ? `<p class="lock">🔒 ${lock}</p>` : tl.tool === 'build' && !this.hover ? '<p class="keys">R : tourner · Échap : lâcher</p>' : ''}`;
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
    if (b.kind === 'outpost') stats.push(`${ic('outpost', 14, 2)} ${h.expeditions.held()} cases de galeries tenues sous terre · camp niveau ${h.expeditions.camp()}`);
    const rl = h.railway.line;
    if (rl && (rl.station.id === b.id || rl.post.id === b.id)) stats.push(`${ic('train', 14, 2)} Train ${TRAIN_WHERE[h.railway.phase]} · ${h.railway.below.length} mineurs au fond`);
    else if (isStation(b) || b.kind === 'outpost') stats.push(`${ic('train', 14, 2)} ${railWhy(h.railway, h.sim.age)}`);
    const key = `${b.id}|${b.rot}|${b.age}|${b.auto}|${stats.join()}`;
    if (key === this.selKey) return;
    this.selKey = key;
    const effs = GIVES.map((g) => (d[g.k]?.[a] ? `<span class="eff">${ic(g.icon, 14, 2)} +${num(d[g.k]![a])} ${g.label}</span>` : '')).join('');
    box.innerHTML = `<div class="ihead"><b>${ic(KIND_ICON[b.kind], 28, 1.6)}</b><div class="grow"><h4>${d.names[a]}</h4><small>${AGES[b.age].name}${d.size === 2 && !b.small ? ' · 2 × 2' : ''} · ${b.auto ? 'façade tournée vers la route' : 'orientée à la main'}</small></div><button class="x" data-act="close" title="Fermer (Échap)" aria-label="Fermer">${ic('close', 16, 2)}</button></div>
      <p>${d.desc}</p>${effs ? `<div class="effs">${effs}</div>` : ''}${stats.map((s) => `<p class="stat">${s}</p>`).join('')}${d.perk ? `<p class="perk">✦ ${d.perk}</p>` : ''}
      <div class="acts"><button data-act="move">${ic('hand', 16, 2)} Déplacer</button><button data-act="rot">${ic('rotate', 16, 2)} Tourner <kbd>R</kbd></button><button data-act="del" class="danger">${ic('demolish', 16, 2)} Démolir</button></div>`;
    box.classList.add('show');
    box.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((el) => (el.onclick = async () => {
      const act = el.dataset.act;
      if (act === 'close') tl.select(null);
      else if (act === 'move') { tl.moveSelected(); h.audio.sfxClick(); }
      else if (act === 'rot') tl.rotateSelected();
      else if (act === 'del' && await confirmBox(this.root, `Démolir : ${d.names[a].toLowerCase()} ? (Ctrl+Z pour annuler)`, 'Démolir')) tl.demolishSelected();
      this.renderSelection();
    }));
  }

  /** Stocks du village (bois, pierre, minerai) et ce qu'il en produit chaque jour */
  private resKey = '';
  private renderResources() {
    const w = this.host.world, day = this.host.expeditions.daily(), rail = this.host.railway.daily();
    day.ore += rail.ore; day.stone += rail.stone;
    const items: [Resource, string, string][] = [['wood', 'tree', 'Bois'], ['stone', 'rock', 'Pierre'], ['ore', 'pickaxe', 'Minerai']];
    const key = items.map(([r]) => `${Math.floor(w[r])}/${day[r]}`).join('|');
    if (key === this.resKey) return;
    this.resKey = key;
    $('#res').innerHTML = items.map(([r, icon, label]) => `<div class="res" title="${label} : ${Math.floor(w[r])} en réserve${day[r] ? `, +${day[r]} par jour` : ''}${r === 'ore' ? '' : ' — pour bâtir les grands bâtiments'}">${ic(icon, 18, 2)}<b>${Math.floor(w[r])}</b><small>${label}</small></div>`).join('');
  }

  /** Surligne l'outil actif, affiche/masque le réglage de pinceau */
  refreshTools() {
    this.renderSelection();
    const tl = this.host.tools;
    this.root.querySelectorAll<HTMLButtonElement>('#dock button[data-tool], #items button[data-kind]').forEach((b) => {
      const on = b.dataset.tool ? b.dataset.tool === tl.tool : tl.tool === 'build' && b.dataset.kind === tl.kind;
      b.classList.toggle('active', on);
    });
    const brush = SCULPT_TOOLS.includes(tl.tool) || (VEG_TOOLS.includes(tl.tool) && !SINGLE_TOOLS.includes(tl.tool));
    $('#brush').classList.toggle('show', brush);
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
    this.toastTimer = window.setTimeout(() => t.classList.remove('show'), act ? 6000 : 2600);
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
    if (sim.age !== this.lastAge) { this.lastAge = sim.age; this.renderItems(); }
    $('#ageName').textContent = AGES[sim.age].name;
    $('#ageSub').textContent = AGES[sim.age].tagline;
    const ap = sim.ageProgress();
    $('#ageBar').style.width = ap ? `${Math.round(ap.ratio * 100)}%` : '100%';
    $('#ageReq').innerHTML = ap
      ? `<b>Vers : ${AGES[ap.next].name}</b>` + ap.items.map((i) => `<span class="${i.have >= i.need ? 'ok' : ''}">${i.have >= i.need ? '✓' : '•'} ${i.label} <em>${Math.min(i.have, 999)}/${i.need}</em></span>`).join('')
      : 'Dernier âge atteint : profitez de votre village !';
    for (const n of NEEDS) {
      const el = $('#n-' + n.k), need = sim[n.k], housing = n.k === 'housing';
      const fill = housing ? (need.cap > 0 ? Math.min(1, sim.pop / need.cap) : 0) : need.demand <= 0 ? 1 : Math.min(1, need.cap / need.demand);
      $('i', el).style.width = `${Math.round(fill * 100)}%`;
      el.classList.toggle('warn', !need.ok);
      el.title = housing ? `${n.label} : ${Math.floor(sim.pop)} habitants pour ${need.cap} places` : `${n.label} : ${num(need.cap)} pour un besoin de ${num(need.demand)}`;
    }
    // le compteur signale le souci le plus pressant ; le détail est dans la fiche des habitants
    const cs = this.census(), alert = cs.untreated ? `${cs.untreated} sans soins` : cs.hungry ? `${cs.hungry} ont faim` : cs.thirsty ? `${cs.thirsty} ont soif`
      : cs.jobless ? `${cs.jobless} sans emploi` : cs.injured ? `${cs.injured} blessé${cs.injured > 1 ? 's' : ''}` : '';
    const popHtml = `${cs.p}<small>habitants</small>${alert ? `<small class="alert">${alert}</small>` : ''}`;
    if ($('#pop').dataset.v !== popHtml) { $('#pop').innerHTML = popHtml; $('#pop').dataset.v = popHtml; }
    if (!$('#census').hidden) this.renderCensus();
    $('#msg').textContent = sim.message;
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
      $('#underZone').innerHTML = `⛏️ ${zone}<small>${this.host.torchMode ? 'Cliquez sur le sol pour poser ou retirer une torche' : 'Cliquez sur un filon pour l’extraire, sur un puits de lumière pour remonter'}</small>`;
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
      <h4>${ic('houses', 18, 2)} ${c.p} habitants <small>pour ${c.places} places</small></h4>
      <div class="cbar">${seg(c.employed, 'work', 'Au travail')}${seg(c.jobless, 'idle', 'Sans emploi')}${seg(c.others, 'kids', 'Enfants et anciens')}</div>
      ${row('hammer', 'Au travail', c.employed)}
      ${row('alert', 'Sans emploi', c.jobless, c.jobless ? 'warn' : '')}
      ${row('smile', 'Enfants et anciens', c.others)}
      ${row('health', 'Malades soignés', c.cared, '', c.sick ? `sur ${c.sick} à soigner` : 'aucun malade pour l’instant')}
      ${c.untreated ? row('health', 'Malades sans soins', c.untreated, 'warn') : ''}
      ${row('kit', 'Blessés au repos', c.injured, c.injured ? 'note' : '', c.injured ? 'au retour d’une expédition' : '')}
      ${row('compass', 'En expédition', c.away)}
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
    list.style.top = `${Math.round($('#hud').getBoundingClientRect().bottom + 8)}px`;
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
    const max = ex.slots();
    $('#expBadge').textContent = ex.active.length ? `${ex.active.length}/${max}` : '';
    const must = mandatoryFor(h.sim.age);
    $('#bExp').classList.toggle('ping', !!must && !ex.done(must) && !ex.running(must));
  }

  openExpeditions(tab: 'missions' | 'gear' | 'depths' = 'missions') {
    const h = this.host, ex = h.expeditions, age = h.sim.age, max = ex.slots(), pop = Math.floor(h.sim.pop);
    const next = max < partyLimit(1e9) ? `Une équipe de plus à ${max * 30} habitants (le village en compte ${pop}).` : 'Le village envoie autant d’équipes qu’il le peut.';
    const teams = ex.active.map((a) => `<span class="teamChip"><i style="background:${hex(TEAM_COLORS[(a.id - 1) % TEAM_COLORS.length])}"></i>${a.m.icon} ${a.m.title} — ${ex.status(a)}</span>`).join('');
    // d'abord ce qui reste à faire, puis ce qu'on peut refaire
    const cards = ex.list(age).sort((a, b) => +(ex.done(a) && !a.repeat) - +(ex.done(b) && !b.repeat)).map((m) => {
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
      const st = ex.state, k = `${JSON.stringify(st.gear)}|${st.craft.join()}|${Math.floor(ex.ore)}|${ex.active.length}`;
      if (k !== key) { key = k; this.renderArsenal($('.arsenal', ov) as HTMLElement, () => (key = '')); }
      const bar = ov.querySelector<HTMLElement>('.queue .bar i');
      if (bar) bar.style.width = `${Math.round(ex.craftProgress() * 100)}%`;
      const rb = ov.querySelector<HTMLElement>('.railBox'), rh = this.railHtml();
      if (rb && rb.dataset.html !== rh) { rb.dataset.html = rh; rb.innerHTML = rh; }
    };
    ov.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('[data-train]')) return;
      close();
      h.audio.sfxClick();
      h.followTrain();
    });
    const iv = setInterval(arsenal, 300);
    arsenal();
    ov.querySelectorAll<HTMLButtonElement>('button.choice').forEach((b) => (b.onclick = () => {
      const m = ex.list(age).find((x) => x.id === b.dataset.m)!, ci = +b.dataset.c!;
      const a = ex.start(m, ci);
      if (!a) { this.toast(ex.why(m, m.choices[ci]) ?? 'Aucun chemin praticable vers cette destination.'); return; }
      close();
      h.audio.sfxClick();
      h.follow(a.id);
      this.toast(a.fromCamp ? `${m.icon} La troupe descend du camp souterrain…` : `${m.icon} L’équipe se rassemble au village…`);
      this.update();
    }));
  }

  /** Boutons des choix d'une mission : équipe, durée, risque, équipement emporté, gains ; grisés avec la raison s'il manque quelque chose */
  private choiceButtons(m: Mission) {
    const ex = this.host.expeditions, done = ex.done(m);
    return m.choices.map((c, i) => {
      const why = ex.why(m, c), pv = ex.preview(c), base = ex.riskOf(c);
      return `<button class="choice" data-m="${m.id}" data-c="${i}" ${why ? 'disabled' : ''} title="${why ?? ''}">
          <b>${c.label}</b><span>${c.text}</span>
          <small>👥 ${c.party}${c.mounts ? ` · 🐎 ${c.mounts} chevaux` : ''} · ⏳ ${workLabel(c.work)} · 🎲 ${pct(pv.risk)}${pv.risk < base - 0.005 ? ` <s>${pct(base)}</s>` : ''} ${riskLabel(pv.risk)} · ${DEST_ICON[c.dest]}</small>
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
      : `<div class="send"><h4>${ic('sword', 16, 2)} Envoyer une expédition armée</h4><p class="hint">${lvl ? 'La troupe se rassemble au camp souterrain et s’enfonce aussitôt dans les galeries.' : 'La troupe se rassemble au village et gagne l’avant-poste.'} Victorieuse, elle abat les filons de son chemin et prend les galeries jusqu’à son front : c’est ce qui fait avancer les quêtes.</p><div class="choices">${this.choiceButtons(deep)}</div></div>`;
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

  /** Chemin de fer : où en est le train, qui est au fond, ce qui attend au camp et ce qui est remonté */
  private railHtml() {
    const h = this.host, r = h.railway, l = r.line, head = `<h4>${ic('train', 16, 2)} Chemin de fer</h4>`;
    if (!l) return `${head}<p class="hint">${railWhy(r, h.sim.age)}</p>`;
    const day = r.daily(), aboard = r.phase === 'down' || r.phase === 'station' ? r.riders.length : r.up.length;
    return `${head}<p class="hint">La voie relie la gare à l’avant-poste (${Math.round(l.len)} cases). Le train descend une équipe de mineurs (${r.shiftSize() || 'personne de libre'}${r.shiftSize() ? ' la prochaine fois' : ''}) et remonte celle d’avant avec ce qu’elle a tiré des galeries tenues : le minerai des filons, la pierre taillée quand il n’y en a plus.</p>
      <div class="campStats"><span>Train : <b>${TRAIN_WHERE[r.phase]}</b>${aboard ? ` (${aboard} mineurs à bord)` : ''}</span><span>Mineurs au fond : <b>${r.below.length}</b></span>
        <span>Au camp : <b>${Math.floor(r.pile.ore)} minerai · ${Math.floor(r.pile.stone)} pierre</b></span><span>Par jour : <b>≈ ${day.ore} minerai · ${day.stone} pierre</b></span>
        <span>Remonté : <b>${r.delivered.ore} minerai · ${r.delivered.stone} pierre</b></span><span>Filons abattus : <b>${r.dug}</b></span></div>
      <button class="trainBtn" data-train>${ic('eye', 16, 2)} Suivre le train</button>`;
  }

  /** Équipement : réserve, fabrication et file d'attente */
  private renderArsenal(el: HTMLElement, changed: () => void) {
    const h = this.host, ex = h.expeditions, age = h.sim.age, st = ex.state;
    const away = (id: GearId) => ex.active.reduce((n, a) => n + (a.gear[id] ?? 0), 0);
    const per = (id: GearId) => ({ spear: 'une par membre', bow: 'un par membre', sword: 'une par membre', rifle: 'un par membre', rope: 'une pour deux', torch: 'une pour deux', boat: 'une pour trois', kit: 'une par équipe', armor: 'une par membre' }[id]);
    el.innerHTML = `
      <p class="hint">Chaque équipe emporte le meilleur équipement en réserve contre les dangers de sa destination, et le rapporte au retour (un échec peut en coûter une pièce). Sur place, certaines décisions demandent une corde, une barque ou des armes. Le village fabrique une pièce après l’autre, plus vite avec un atelier. Minerai : <b>${Math.floor(ex.ore)}</b>.</p>
      <div class="gearGrid">${GEAR.map((g) => {
        const why = ex.whyCraft(g, age), n = st.gear[g.id], out = away(g.id), locked = age < g.age;
        return `<div class="gear ${locked ? 'locked' : ''}">
          <div class="gi">${ic(g.icon, 26, 1.8)}</div>
          <div class="grow"><b>${g.name}</b> <span class="cnt">${n} en réserve${out ? ` · ${out} en route` : ''}</span>
            <small>${g.desc}</small>
            <small class="gd">${g.guards ? DANGER_VS[g.guards] : 'Utile partout'}${g.also ? ` et les ${DANGER_NAME[g.also]}` : ''} : −${Math.round(g.cut * 100)} % de risque · ${per(g.id)}</small>
            ${why ? `<small class="why">${why}</small>` : ''}</div>
          <button data-craft="${g.id}" ${why ? 'disabled' : ''} title="${why ?? `Fabriquer : ${g.time} s${g.ore ? `, ${g.ore} minerai` : ''}`}">${ic('hammer', 16, 2)} ${g.ore ? `${g.ore} minerai` : 'Fabriquer'}</button>
        </div>`;
      }).join('')}</div>
      <h4>Fabrication</h4>
      <div class="queue">${st.craft.length ? st.craft.map((id, i) => `<span class="qi">${ic(GEAR_BY[id].icon, 16, 2)} ${GEAR_BY[id].name}${i === 0 ? '<i class="bar"><i></i></i>' : ''}<button data-cancel="${i}" title="Annuler" aria-label="Annuler">${ic('close', 14, 2)}</button></span>`).join('') : '<small>Rien en cours.</small>'}</div>`;
    el.querySelectorAll<HTMLButtonElement>('[data-craft]').forEach((b) => (b.onclick = () => {
      if (ex.craft(b.dataset.craft as GearId, age)) { h.audio.sfxClick(); changed(); }
    }));
    el.querySelectorAll<HTMLButtonElement>('[data-cancel]').forEach((b) => (b.onclick = () => { ex.cancelCraft(+b.dataset.cancel!); changed(); }));
  }

  /** Imprévu d'une équipe : la fenêtre s'ouvre d'elle-même si rien d'autre n'est ouvert */
  expEvent(a: ActiveExpedition) {
    this.toast(`${a.m.icon} « ${a.m.title} » : ${a.wait?.title.toLowerCase()} — une décision vous attend.`, () => this.showDecision(a));
    if (!this.root.querySelector('.overlay')) this.showDecision(a);
    this.update();
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
    const { ov, close } = modal(this.root, 'decide', `${a.m.icon} ${a.m.title}`, `
      <h4 class="evt">${ic('alert', 18, 2)} ${ev.title}</h4>
      <p class="story">${ev.text}</p>
      ${opts}
      <p class="hint">Risque de l’expédition pour l’instant : ${pct(ex.chance(a))}. Sans réponse, l’équipe choisira d’elle-même la voie la plus sûre.</p>`);
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
  }

  // ---------------- Réglages ----------------
  openSettings() {
    const h = this.host, t = h.time, a = h.audio;
    const tabs = [['time', 'clock', 'Temps et météo'], ['look', 'palette', 'Image et son'], ['game', 'houses', 'Partie']];
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
        <div class="row"><label>Catastrophes</label><button id="gDisasters" class="${h.disasters ? 'active' : ''}">${h.disasters ? 'Activées' : 'Désactivées'}</button></div>
        <p class="hint">Activées : le volcan se réveille de lui-même, la lave et les incendies peuvent détruire des bâtiments.</p>
        <div class="row"><label>Routes auto</label><button id="gRoads" class="${h.autoRoads ? 'active' : ''}">${h.autoRoads ? 'Activées' : 'Désactivées'}</button></div>
        <p class="hint">Un chemin relie chaque nouveau bâtiment à la route la plus proche, s’il n’y touche pas déjà.</p>
        <h4>Sauvegarde</h4>
        <div class="row"><button id="gSave">${ic('save', 16)} Sauvegarder</button><button id="gExport">${ic('download', 16)} Exporter</button><button id="gImport">${ic('upload', 16)} Importer</button></div>
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
    }));
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
    q('#gNew').onclick = async () => { if (await confirmBox(this.root, 'Recommencer cette carte ? La sauvegarde actuelle sera remplacée.', 'Recommencer')) h.newGame(); };
    q('#gMenu').onclick = () => h.toMenu();
  }
}

// ---------------- Menu principal ----------------
export interface MenuHost {
  start(map: number, mode: 'continue' | 'new'): void;
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
    <p class="sub">Bâtissez, sculptez et regardez votre village traverser cinq âges et quatre saisons.</p>
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
    const heights = save ? (save.world.heights as number[]).map((v) => v / 100) : genHeights(m.id, m.defaultSeed);
    drawPreview($('canvas', card) as HTMLCanvasElement, heights);
    if (save) $('.stat', card).textContent = `${AGES[save.age].name} · ${Math.floor(save.pop)} hab. · ${SEASONS[Math.floor(save.seasonT) % 4]}`;
    const btns = $('.btns', card);
    if (save) {
      btns.innerHTML = `<button class="active" data-m="continue">Continuer</button><button data-m="new">Nouvelle</button>`;
    } else btns.innerHTML = `<button class="active" data-m="new">Jouer</button>`;
    btns.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = async () => {
      const mode = b.dataset.m as 'continue' | 'new';
      if (mode === 'new' && save && !(await confirmBox(root, 'Écraser la sauvegarde de cette carte ?', 'Écraser'))) return;
      host.start(m.id, mode);
    }));
    maps.appendChild(card);
  }
  const f = $<HTMLInputElement>('#mFile', ov);
  $('#mImport', ov).onclick = () => f.click();
  f.onchange = () => { if (f.files?.[0]) host.importFile(f.files[0]); };
  root.appendChild(ov);
  return ov;
}
export type { SaveData };
