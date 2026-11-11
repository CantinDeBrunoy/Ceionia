import { KINDS, KindId } from '../build/catalog';
import { MAPS } from '../world/mapgen';
import { loadSlot } from '../save/save';
import { ic } from './icons';
import { tr, localize, colon, getLang } from '../i18n';
import type { UI, UIHost } from './ui';

/**
 * Tutoriel guidé : une bulle montre l'élément de l'interface dont il est question (un halo l'entoure) et passe d'elle-même à
 * l'étape suivante quand le joueur l'a fait, ou d'un clic sur « Suivant ». Rien n'est bloqué : le jeu continue autour. On le
 * passe, on le reprend depuis les réglages ; il est activé d'office pour qui n'a encore aucune partie, et le choix est retenu.
 * Des chapitres s'y ajoutent plus tard dans la partie, lancés par un événement (voir `Tutorial.chapter` et `tutorialChapters.ts`)
 */

/** Tous les textes du tutoriel, au même endroit (pour la traduction du jeu). `{eye}`, `{compass}`… : icônes dans le texte */
export const TUTO_TEXT = {
  stepOf: (i: number, n: number) => tr('Tutoriel · {i} / {n}', { i, n }),
  next: 'Suivant',
  finish: 'Terminer',
  skip: 'Passer le tutoriel',
  skipChapter: 'Passer ce chapitre',
  sandbox: 'Pas de tutoriel au bac à sable : bâtissez dans l’ordre que vous voulez.',
  wellDone: 'Bien joué !',
  skipped: 'Tutoriel mis de côté : reprenez-le quand vous voulez dans Réglages › Partie.',
  finished: 'Tutoriel terminé ! Il reste dans Réglages › Partie, si vous voulez le refaire.',
  menu: {
    label: 'Tutoriel guidé',
    on: 'activé',
    off: 'désactivé',
    title: 'Une bulle vous guide pas à pas dans la partie : caméra, construction, besoins, âges, expéditions et incidents.',
  },
  settings: {
    title: 'Tutoriel',
    label: 'Tutoriel',
    on: 'Activé',
    off: 'Désactivé',
    restart: 'Recommencer',
    hintOn: (i: number, n: number, title: string) => tr('Une bulle vous guide pas à pas. Étape {i} sur {n} : « {title} ».', { i, n, title }),
    hintOff: (i: number, n: number, title: string) => tr('Mis de côté à l’étape {i} sur {n} (« {title} ») : le réactiver le reprend là, « Recommencer » repart du début.', { i, n, title }),
    hintNew: 'Une bulle vous guide pas à pas : caméra, construction, besoins, âges, expéditions et incidents.',
    hintChap: (title: string, i: number, n: number) => tr('Chapitre « {title} » : étape {i} sur {n}.', { title, i, n }),
  },
  steps: {
    welcome: {
      title: 'Bienvenue !',
      text: 'Votre but : faire grandir un village, des premiers feux de camp jusqu’aux étoiles.',
      tasks: [] as string[],
    },
    camera: {
      title: 'Regardez autour de vous',
      text: 'Faites glisser la vue avec le clic droit, et zoomez à la molette.',
      touch: 'Glissez à deux doigts pour bouger, zoomer et tourner la vue.',
      /** les touches de la vue, dans la disposition du clavier du joueur (voir `viewKeys`) */
      keys: (move: string, turn: string) => tr('Au clavier : {move} déplacent la vue, {turn} la tournent.', { move, turn }),
      tasks: ['Bouger la vue'],
      paused: 'Le jeu est en pause pour l’instant.',
    },
    fire: {
      title: 'Le cœur du village',
      text: 'Prenez le feu de camp dans l’onglet « Bâtir », puis cliquez sur le terrain pour le poser.',
      tasks: [] as string[],
    },
    habitat: {
      title: 'Les habitats',
      text: 'Les habitants ont besoin d’un toit et d’eau : ouvrez le rayon « Habitat » et posez-les.',
      tasks: [] as string[],
    },
    food: {
      title: 'De quoi manger',
      text: 'Posez de quoi nourrir le village, au rayon « Production ».',
      tasks: [] as string[],
    },
    wood: {
      title: 'Le bois',
      text: 'Posez un bûcheron près des arbres, dans la zone verte.',
      tasks: [] as string[],
    },
    stone: {
      title: 'La pierre',
      text: 'Posez un pierrier près des rochers, dans la zone verte.',
      tasks: [] as string[],
    },
    resources: {
      title: 'Les ressources',
      text: 'Vos réserves s’affichent ici : bois et pierre paient les grands bâtiments, le minerai le passage des âges.',
      tasks: [] as string[],
    },
    road: {
      title: 'Les routes',
      text: 'Prenez l’outil Route {road} puis cliquez un point A et un point B pour les relier.',
      tasks: ['Prendre l’outil Route', 'Tracer une route'],
    },
    needs: {
      title: 'Les besoins',
      text: 'Chaque jauge en haut est un besoin : cliquez sur une icône pour savoir quoi bâtir.',
      tasks: ['Ouvrir la fiche d’un besoin'],
    },
    time: {
      title: 'Le temps',
      text: 'Le bouton {pause} arrête le temps, le bouton {fastForward} l’accélère.',
      tasks: ['Arrêter ou relancer le temps', 'Changer la vitesse'],
    },
    ages: {
      title: 'Les âges',
      text: 'Cliquez sur le panneau en haut à gauche pour voir ce qu’il faut pour passer à l’âge suivant.',
      tasks: ['Ouvrir les conditions de l’âge suivant'],
    },
    expeditions: {
      title: 'Les expéditions',
      text: 'Le bouton {compass} envoie une équipe chercher des ressources et de nouveaux bâtiments.',
      choose: 'Choisissez une mission, puis « Partir ».',
      none: 'Personne n’est libre pour partir : passez à la suite.',
      tasks: ['Ouvrir les expéditions', 'Lancer une expédition', 'Suivre l’équipe avec {eye}'],
    },
    gear: {
      title: 'L’équipement',
      text: 'Certaines expéditions demandent du matériel : fabriquez-le dans l’onglet « Équipement ».',
      tasks: ['Ouvrir l’onglet Équipement', 'Fabriquer une pièce'],
    },
    incidents: {
      title: 'Les incidents',
      text: 'Incendies et cambriolages s’affichent à gauche : {eye} suit l’intervention.',
      none: 'Aucun incident pour l’instant : sa carte apparaîtra à gauche.',
      tasks: ['Suivre un incident avec {eye}'],
    },
  },
  kindTask: (name: string) => tr('Poser : {name}', { name }),
  locked: 'Le tutoriel vous le fera bâtir un peu plus tard.',
  ok: 'OK',
};

// les textes se lisent dans la langue courante (voir `localize`, src/i18n/index.ts) ; les fonctions ci-dessus passent par `tr`
{
  const texts = (o: object) => Object.keys(o).filter((k) => { const v = (o as Record<string, unknown>)[k]; return typeof v === 'string' || Array.isArray(v); });
  localize(TUTO_TEXT, texts(TUTO_TEXT) as never);
  localize(TUTO_TEXT.menu, texts(TUTO_TEXT.menu) as never);
  localize(TUTO_TEXT.settings, texts(TUTO_TEXT.settings) as never);
  for (const st of Object.values(TUTO_TEXT.steps)) localize(st, texts(st) as never);
}

type StepId = keyof typeof TUTO_TEXT.steps;
type Side = 'below' | 'above' | 'right' | 'left';

/** Les textes d'une étape : titre, phrase, tâches */
export interface StepText { title: string; text: string; tasks: string[] }

/** Une étape : l'élément montré, les tâches à faire et comment savoir qu'elles sont faites */
export interface Step {
  /** une étape de la suite principale (`TUTO_TEXT.steps`), ou celle d'un chapitre */
  id: string;
  /** les textes d'une étape de chapitre (ceux de la suite principale viennent de `TUTO_TEXT.steps`) */
  t?: StepText;
  /** l'élément montré (null : la bulle se tient à l'écart, sans halo) */
  anchor(): Element | null;
  /** les tâches de l'étape, faites ou non (une tâche faite le reste) */
  check(): boolean[];
  /** au début de l'étape : l'état de départ, pour voir ce que le joueur change */
  begin?(): void;
  /** le texte, s'il dépend de la situation */
  text?(): string;
  /** une ligne en HTML sous le texte (les touches du clavier) */
  more?(): string;
  /** une ligne de plus selon la situation */
  note?(): string;
  /** les intitulés des tâches, s'ils dépendent de la situation */
  tasks?(): string[];
  /** un bouton dans la bulle qui mène où il faut (« Aller sur l'île ») ; null : pas de bouton */
  act?(): { label: string; run(): void } | null;
  /** l'élément ne sert qu'à placer la bulle (une fiche que le joueur vient d'ouvrir) : ni halo ni anneau */
  bare?(a: Element): boolean;
  /** une étape à lire : une fois faite, elle attend « Suivant » au lieu de passer d'elle-même */
  read?: boolean;
  /** tâches à faire pour passer (toutes par défaut) */
  need?: number;
}

/** Les chapitres : l'île du portail quand le joueur choisit d'affronter les démons, la première entrée dans les Enfers */
export type ChapterId = 'pve' | 'hell';
export const CHAPTERS: readonly ChapterId[] = ['pve', 'hell'];

/** Un chapitre : une courte suite d'étapes qu'un événement lance, une seule fois */
export interface Chapter {
  title(): string;
  steps: Step[];
  /** le chapitre a encore un sens (faux : il s'achève, compté comme vu ; les Enfers quittés, le portail refermé) */
  live?(): boolean;
  /** le joueur n'est pas là où se passe le chapitre : la bulle attend, cachée */
  away?(): boolean;
}

const KEY = 'village-lowpoly:v1:tutorial';

/**
 * L'état enregistré. Les anciens états n'ont que `on` et `step` (le numéro d'étape dans `LEGACY`) : finir et passer y
 * écrivaient tous deux `on: false` ; `end` les distingue désormais
 */
export interface TutoState {
  /** la suite principale est en cours */
  on: boolean;
  /** son étape (celle où on l'a laissée) */
  step: number;
  /** l'identifiant de cette étape, qui survit aux étapes ajoutées */
  id?: string;
  /** comment elle s'est arrêtée : finie, ou mise de côté (« Passer », désactivée) ; absent : en cours, ou ancien état */
  end?: 'done' | 'skip';
  /** les chapitres déjà montrés (finis ou passés) */
  seen?: string[];
  /** le chapitre en cours et son étape */
  ch?: { id: ChapterId; step: number };
}

/** L'ordre des étapes avant « Les ressources » : un ancien état ne donne que le numéro */
const LEGACY = ['welcome', 'camera', 'fire', 'habitat', 'food', 'wood', 'stone', 'road', 'needs', 'time', 'ages', 'expeditions', 'gear', 'incidents'];

/** Lit un état enregistré (null : rien, ou illisible) */
export function parseState(raw: unknown): TutoState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.on !== 'boolean') return null;
  const s: TutoState = { on: o.on, step: Math.max(0, Math.floor(+(o.step as number) || 0)) };
  if (typeof o.id === 'string') s.id = o.id;
  if (o.end === 'done' || o.end === 'skip') s.end = o.end;
  if (Array.isArray(o.seen)) s.seen = o.seen.filter((x): x is string => typeof x === 'string');
  const ch = o.ch as Record<string, unknown> | undefined;
  if (ch && CHAPTERS.includes(ch.id as ChapterId)) s.ch = { id: ch.id as ChapterId, step: Math.max(0, Math.floor(+(ch.step as number) || 0)) };
  return s;
}

/**
 * Le joueur a-t-il mis le tutoriel de côté (« Passer », ou désactivé) ? Un ancien état ne le dit pas : arrêté en route (étape
 * au-delà de la première), il a été passé ; revenu à la première, il a été fini, ou jamais commencé
 */
export function setAside(s: TutoState | null): boolean {
  if (!s || s.on) return false;
  return s.end ? s.end === 'skip' : s.step > 0;
}

/** Un chapitre se lance-t-il ? Une seule fois, même si le tutoriel est fini ; pas s'il a été mis de côté */
export function chapterDue(s: TutoState | null, id: ChapterId): boolean {
  return !setAside(s) && !(s?.seen ?? []).includes(id);
}

/** L'étape où reprendre la suite principale (`ids` : ses étapes dans l'ordre) */
export function stepIndex(s: TutoState, ids: readonly string[]): number {
  const id = s.id ?? LEGACY[s.step];
  const i = id ? ids.indexOf(id) : -1;
  return i >= 0 ? i : Math.min(s.step, ids.length - 1);
}

function readState(): TutoState | null {
  try { return parseState(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return null; }
}
function writeState(s: TutoState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** Le tutoriel est-il activé ? Tant que le joueur n'a rien choisi : oui s'il n'a encore aucune partie */
export function tutorialOn() { return readState()?.on ?? !MAPS.some((m) => loadSlot(m.id)); }

/**
 * Les lettres des touches de la vue. Le jeu lit les touches physiques (`e.code` : W A S D pour bouger, Q E pour tourner, voir
 * `camera.ts`) : leurs lettres viennent de la disposition du clavier quand le navigateur la donne, sinon de la langue
 * (AZERTY en français : Z Q S D et A E)
 */
export function viewKeys(layout: { get(code: string): string | undefined } | null | undefined, lang: string) {
  const fr = lang === 'fr';
  const k = (code: string, guess: string) => { const v = layout?.get(code); return (v && v.length === 1 && /\p{L}/u.test(v) ? v : guess).toUpperCase(); };
  return { move: [k('KeyW', fr ? 'z' : 'w'), k('KeyA', fr ? 'q' : 'a'), k('KeyS', 's'), k('KeyD', 'd')], turn: [k('KeyQ', fr ? 'a' : 'q'), k('KeyE', 'e')] };
}

/** Icônes glissées dans les textes */
const fmt = (s: string) => s.replace(/\{(\w+)\}/g, (_, n: string) => ic(n, 15, 2.2));
const kbd = (keys: string[], sep = '') => keys.map((x) => `<kbd>${x}</kbd>`).join(sep);

/** Interrupteur du tutoriel sur l'écran d'accueil : il vaut pour la partie lancée, et le choix est retenu */
export function menuToggle(): HTMLElement {
  const T = TUTO_TEXT.menu, row = document.createElement('div');
  row.className = 'row tutoToggle';
  const draw = () => {
    const on = tutorialOn();
    row.innerHTML = `<button class="${on ? 'on' : ''}" aria-pressed="${on}" title="${T.title}">${ic('book', 17, 2)}${T.label}${colon()}${on ? T.on : T.off}<i class="sw"></i></button>`;
    // (désactivé ici : mis de côté, les chapitres se taisent aussi)
    (row.firstElementChild as HTMLButtonElement).onclick = () => { const s = readState(); writeState({ ...s, on: !on, step: s?.step ?? 0, end: on ? 'skip' : undefined }); draw(); };
  };
  draw();
  return row;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const coarse = () => window.matchMedia('(pointer: coarse)').matches;
/** ce que le tutoriel laisse bâtir à chaque étape (le reste est verrouillé) : on ajoute un bâtiment après l'autre */
const GATE: Partial<Record<StepId, KindId[]>> = {
  welcome: ['gather'], camera: ['gather'], fire: ['gather'],
  habitat: ['gather', 'house', 'well'],
  food: ['gather', 'house', 'well', 'farm'],
  wood: ['gather', 'house', 'well', 'farm', 'lumber'],
  stone: ['gather', 'house', 'well', 'farm', 'lumber', 'quarry'],
};
/** les bâtiments que le tutoriel fait poser : un village qui en compte d'autres n'est plus un village neuf */
const GUIDED = new Set<string>(['gather', 'house', 'well', 'farm', 'lumber', 'quarry']);

export class Tutorial {
  /** la bulle est active : la suite principale ou un chapitre */
  on = false;
  /** la suite principale est en cours (un chapitre peut l'interrompre : elle reprend après lui) */
  guiding = false;
  /** un chapitre s'achève (`done` : fini, ou devenu sans objet ; sinon passé) */
  onChapterEnd: ((id: ChapterId, done: boolean) => void) | null = null;
  private steps: Step[];
  /** étape en cours de la suite principale (ou celle où on l'a laissée) */
  private i = 0;
  /** le chapitre en cours et son étape ; tous les chapitres (voir `setChapters`) */
  private ch: ChapterId | null = null;
  private ci = 0;
  private chapters: Partial<Record<ChapterId, Chapter>> = {};
  /** un chapitre en cours à la dernière session : il reprend dès que les chapitres sont connus */
  private pending: TutoState['ch'] | null = null;
  /** comment la suite principale s'est arrêtée, et les chapitres déjà montrés */
  private end: TutoState['end'];
  private seen = new Set<string>();
  /** tâches de l'étape déjà faites */
  private ticks: boolean[] = [];
  /** toutes faites depuis… (la bulle dit « Bien joué ! » un instant avant de passer) */
  private doneAt = 0;
  private key = '';
  private box: HTMLElement;
  private body: HTMLElement;
  private arrow: HTMLElement;
  private ring: HTMLElement;
  /** clics repérés pendant l'étape : l'œil d'une équipe ('exp'), d'un incident ('inc'), un bouton à `data-a` (son action) */
  private clicks = new Set<string>();
  /** l'outil Route a été pris pendant cette étape */
  private roadTool = false;
  /** état au début de l'étape */
  private base: { view?: { x: number; z: number; yaw: number; dist: number }; kinds?: Record<string, number>; roads?: number; paused?: boolean; speed?: number } = {};
  /** choix d'expédition déjà amenés sous les yeux */
  private shown = new WeakSet<Element>();
  /** les touches de la vue (la disposition du clavier, lue dès que le navigateur la donne) */
  private keys = viewKeys(null, getLang());

  /** `fresh` : nouvelle partie (le tutoriel, s'il est activé, reprend au début) */
  constructor(private ui: UI, private host: UIHost, fresh: boolean, private off = false) {
    const h = host, T = TUTO_TEXT.steps, q = (s: string) => ui.root.querySelector(s);
    const count = () => { const n: Record<string, number> = {}; for (const b of h.world.buildings.values()) n[b.kind] = (n[b.kind] ?? 0) + 1; return n; };
    const roads = () => { let n = 0; const r = h.world.road; for (let k = 0; k < r.length; k++) if (r[k]) n++; return n; };
    const name = (k: KindId) => KINDS[k].names[Math.max(h.sim.age, KINDS[k].minAge)];
    const built = (ks: KindId[]) => { const n = count(); return ks.map((k) => (n[k] ?? 0) > 0); };
    // le prochain bâtiment à poser : l'onglet Bâtir, son rayon, puis sa vignette
    const aim = (ks: KindId[]) => () => {
      const k = ks.find((_, j) => !this.ticks[j]);
      if (!k) return null;
      const cat = KINDS[k].cat;
      return ui.tab !== 'build' ? q('#modes [data-t="build"]') : ui.cat !== cat ? q(`#subcats [data-c="${cat}"]`) : q(`#items [data-kind="${k}"]`);
    };
    /** une étape de construction : poser ces bâtiments (déjà bâtis avant d'arriver : elle passe d'elle-même) */
    const make = (id: StepId, ks: KindId[]): Step => ({
      id, begin: () => (this.base.kinds = count()),
      check: () => built(ks), anchor: aim(ks),
      tasks: () => ks.map((k) => TUTO_TEXT.kindTask(name(k))),
    });
    this.steps = [
      // une phrase d'accueil, qui reste jusqu'au « OK »
      { id: 'welcome', anchor: () => null, check: () => [], read: true },
      {
        id: 'camera', anchor: () => null, read: true,
        begin: () => (this.base.view = h.cam.view()),
        text: () => (coarse() ? T.camera.touch : T.camera.text),
        // le clavier : les lettres de la disposition du joueur (ZQSD en AZERTY, WASD en QWERTY)
        more: () => (coarse() ? '' : T.camera.keys(kbd(this.keys.move), kbd(this.keys.turn, ' / '))),
        note: () => (h.time.paused ? T.camera.paused : ''),
        // un seul geste suffit : un enfant zoome tout de suite, mais tourner la vue au clic droit ne se devine pas
        check: () => {
          const v = h.cam.view(), b = this.base.view!;
          return [Math.hypot(v.x - b.x, v.z - b.z) > 3 || Math.abs(v.yaw - b.yaw) > 0.35 || Math.abs(Math.log(v.dist / b.dist)) > 0.15];
        },
      },
      make('fire', ['gather']),
      make('habitat', ['house', 'well']),
      make('food', ['farm']),
      make('wood', ['lumber']),
      make('stone', ['quarry']),
      // le bûcheron et le pierrier posés, leur production paraît dans la barre des ressources
      { id: 'resources', anchor: () => q('#res'), check: () => [], read: true },
      {
        id: 'road', anchor: () => q('#quickL [data-tool="road"]'),
        begin: () => { this.base.roads = roads(); this.roadTool = false; },
        check: () => {
          const n = roads(), on = h.tools.tool === 'road';
          // les chemins posés d'eux-mêmes jusqu'aux nouveaux bâtiments ne comptent pas : seule compte la route tracée à l'outil
          // (la route libre rend la main une fois posée : l'outil pris puis quitté compte aussi)
          if (on) this.roadTool = true;
          if (!on && !this.roadTool) this.base.roads = n;
          return [on || this.roadTool, this.roadTool && n > this.base.roads!];
        },
      },
      {
        // la fiche ouverte (d'un besoin ou des habitants) : la bulle se met à côté, sans la cacher ni l'entourer
        id: 'needs', anchor: () => [q('#needInfo'), q('#census')].find((x) => !(x as HTMLElement).hidden) ?? q('#needs'),
        bare: (a) => a.id === 'needInfo' || a.id === 'census',
        check: () => [!(q('#needInfo') as HTMLElement).hidden || !(q('#census') as HTMLElement).hidden],
      },
      {
        id: 'time', anchor: () => q('#timePanel'),
        begin: () => { this.base.paused = h.time.paused; this.base.speed = h.time.speed; },
        check: () => [h.time.paused !== this.base.paused, h.time.speed !== this.base.speed],
      },
      {
        // une fois ouvert, la bulle se met à côté de la liste des conditions
        id: 'ages', read: true,
        anchor: () => (q('#agePanel')!.classList.contains('open') ? q('#ageReq') : q('#agePanel')),
        bare: (a) => a.id === 'ageReq',
        check: () => [q('#agePanel')!.classList.contains('open')],
      },
      {
        id: 'expeditions',
        // le bouton 🧭, puis un choix de mission dans la fenêtre, puis l'œil de la carte de l'équipe
        anchor: () => {
          // la fenêtre de départ d'une mission, sinon la liste des missions (le bouton « Envoyer une équipe »)
          const m = q('.sendModal') ?? q('.expModal');
          if (m && !this.ticks[1]) {
            // la liste : on désigne d'abord « La grande cueillette », la plus simple pour débuter
            const first = q('.sendModal') ? null : m.querySelector('button[data-send="berries"]:not([disabled])');
            const b = first && first.getClientRects().length ? first : [...m.querySelectorAll('button.choice:not([disabled]), button[data-send]:not([disabled])')].find((x) => x.getClientRects().length);
            if (b && !this.shown.has(b)) { this.shown.add(b); b.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
            return b ?? m.querySelector('.mtitle');
          }
          if (!this.ticks[1]) return q('#bExp');
          return this.ticks[2] ? null : q('#expList .expCard:not(.incident) .cam');
        },
        check: () => [!!q('.expModal'), h.expeditions.active.length > 0, this.clicks.has('exp') || h.following !== null],
        note: () => {
          const m = q('.sendModal') ?? q('.expModal');
          if (!m || this.ticks[1]) return '';
          return m.querySelector('button.choice:not([disabled]), button[data-send]:not([disabled])') ? T.expeditions.choose : T.expeditions.none;
        },
      },
      {
        // le bouton de la boussole, puis l'onglet Équipement de la fenêtre, puis une pièce à fabriquer
        id: 'gear', read: true,
        anchor: () => {
          const m = q('.expModal');
          if (!m) return q('#bExp');
          const tab = m.querySelector('[data-tab="gear"]');
          if (!tab?.classList.contains('on')) return tab;
          const b = [...m.querySelectorAll('button[data-craft]:not([disabled])')].find((x) => x.getClientRects().length);
          if (b && !this.shown.has(b)) { this.shown.add(b); b.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
          return b ?? m.querySelector('.arsenal');
        },
        check: () => { const st = h.expeditions.state; return [!!q('.expModal [data-tab="gear"].on'), st.craft.length > 0 || Object.values(st.gear).some((n) => (n as number) > 0)]; },
      },
      {
        id: 'incidents', anchor: () => q('#expList .expCard.incident .cam'),
        check: () => [this.clicks.has('inc')],
        note: () => (q('#expList .expCard.incident') ? '' : T.incidents.none),
      },
    ];

    this.ring = document.createElement('div');
    this.ring.id = 'tutoRing';
    this.box = document.createElement('div');
    this.box.id = 'tuto';
    this.box.setAttribute('role', 'dialog');
    this.box.innerHTML = '<div class="tBody"></div><i class="tArrow"></i>';
    this.body = this.box.querySelector('.tBody')!;
    this.arrow = this.box.querySelector('.tArrow')!;
    this.box.hidden = this.ring.hidden = true;
    ui.root.append(this.ring, this.box);
    // un clic sur la bulle ne tombe jamais sur la carte (ni ne pose un bâtiment avec l'outil en main)
    for (const t of ['pointerdown', 'pointerup', 'mousedown', 'touchstart']) this.box.addEventListener(t, (e) => e.stopPropagation());
    this.box.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      b.blur();
      h.audio.sfxClick();
      if (b.classList.contains('tNext')) this.next();
      else if (b.classList.contains('tSkip')) this.skip();
      else if (b.classList.contains('tAct')) { this.cur.act?.()?.run(); this.key = ''; }
    });
    // l'œil d'une carte d'équipe ou d'incident, un bouton de la barre des troupes (capturés avant que la carte ne soit redessinée)
    ui.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement, cam = t.closest('.expCard .cam');
      if (cam) this.clicks.add(cam.closest('.incident') ? 'inc' : 'exp');
      const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
      if (a) this.clicks.add(a);
    }, true);
    // une liste qui défile (la fenêtre des expéditions) : la bulle suit l'élément montré
    ui.root.addEventListener('scroll', () => { if (this.on) this.place(); }, true);
    window.addEventListener('resize', () => { if (this.on) this.place(); });
    // les lettres des touches selon la disposition du clavier (Chrome, Edge) ; sinon, celles de la langue
    const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?(): Promise<Map<string, string>> } }).keyboard;
    kb?.getLayoutMap?.().then((m) => { this.keys = viewKeys(m, getLang()); this.key = ''; }).catch(() => { /* disposition inconnue */ });
    ui.tutorial = this;

    // bac à sable : jamais de tutoriel, et le choix du joueur pour les autres parties n'est pas touché
    if (off) return;
    const st = readState() ?? { on: tutorialOn(), step: 0 };
    this.end = st.end;
    this.seen = new Set(st.seen ?? []);
    // un chapitre laissé en cours reprend (pas dans une partie neuve : il se relancera à son heure)
    this.pending = fresh ? null : st.ch ?? null;
    // nouvelle partie avec le tutoriel : le temps attend que le joueur ait pris ses repères (il le relance à l'étape du temps)
    if (fresh && st.on) h.time.paused = true;
    this.i = fresh ? 0 : stepIndex(st, this.steps.map((s) => s.id));
    this.guiding = st.on;
    this.save();
    if (st.on) this.show(this.i);
  }

  /** l'étape affichée : celle du chapitre en cours, sinon celle de la suite principale */
  private get cur(): Step { return this.ch ? this.chapters[this.ch]!.steps[this.ci] : this.steps[this.i]; }

  /** La bulle guide en ce moment (un chapitre qui attend ailleurs ne compte pas : conseils et aides reprennent) */
  get active() { return this.on && !(this.ch && this.chapters[this.ch]!.away?.()); }

  /** Le chapitre en cours (null : aucun) */
  get chapterOn() { return this.ch; }

  /** Un bouton à `data-a` cliqué pendant l'étape (« goal » : le bouton Centrer de la barre des troupes) */
  clicked(a: string) { return this.clicks.has(a); }

  /** Les chapitres (une fois le jeu prêt) ; celui laissé en cours à la dernière session reprend */
  setChapters(defs: Partial<Record<ChapterId, Chapter>>) {
    this.chapters = defs;
    const p = this.pending;
    this.pending = null;
    if (p && defs[p.id] && chapterDue(this.state(), p.id)) this.openChapter(p.id, p.step);
    else this.save();
  }

  /**
   * Lance un chapitre, au moment de son événement : une seule fois, même le tutoriel fini, mais pas s'il a été mis de côté.
   * La suite principale en cours attend la fin du chapitre. Vrai s'il démarre
   */
  chapter(id: ChapterId): boolean {
    // (ni chapitre au bac à sable)
    if (this.off || !this.chapters[id] || this.ch === id || !chapterDue(this.state(), id)) return false;
    // un autre chapitre en cours compte pour vu : le nouveau le remplace
    if (this.ch) this.seen.add(this.ch);
    this.openChapter(id, 0);
    return true;
  }

  private openChapter(id: ChapterId, i: number) {
    this.ch = id;
    this.ci = clamp(i, 0, this.chapters[id]!.steps.length - 1);
    this.on = true;
    this.begin();
  }

  /** Affiche l'étape donnée de la suite principale (elle repart de zéro) */
  show(i: number) {
    if (this.off) return;
    this.i = clamp(i, 0, this.steps.length - 1);
    this.ch = null;
    this.on = this.guiding = true;
    this.end = undefined;
    this.begin();
  }

  /** L'étape affichée commence */
  private begin() {
    const s = this.cur;
    this.base = {};
    this.clicks.clear();
    s.begin?.();
    this.ticks = s.check().map(() => false);
    this.doneAt = 0;
    this.key = '';
    this.save();
    // la bulle apparaît directement à sa place (sans glisser depuis la précédente)
    this.box.classList.add('fresh');
    this.update();
    requestAnimationFrame(() => this.box.classList.remove('fresh'));
  }

  next() {
    if (this.ch) {
      if (this.ci >= this.chapters[this.ch]!.steps.length - 1) this.endChapter(true);
      else { this.ci++; this.begin(); }
      return;
    }
    // une étape de pose terminée : l'outil rentre (sinon le prochain clic, sur « Suivant » ou à côté, poserait un bâtiment de trop)
    if (['fire', 'habitat', 'food', 'wood', 'stone'].includes(this.steps[this.i]?.id) && this.host.tools.tool === 'build') this.host.tools.setTool('none');
    // le feu de camp posé, le temps repart (il était arrêté le temps de regarder autour de soi)
    if (this.steps[this.i]?.id === 'fire' && this.host.time.paused) this.host.time.paused = false;
    if (this.i >= this.steps.length - 1) { this.finish(); return; }
    this.show(this.i + 1);
  }

  /** Un chapitre s'achève (`done` : fini ; sinon passé) : il ne revient plus ; la suite principale en cours reprend */
  private endChapter(done: boolean) {
    const id = this.ch!;
    this.seen.add(id);
    this.ch = null;
    this.onChapterEnd?.(id, done);
    if (this.guiding) { this.show(this.i); return; }
    this.hide();
  }

  /** Cache la bulle et met le tutoriel de côté (il reprendra à cette étape) ; les chapitres se taisent aussi */
  stop() {
    this.end = 'skip';
    this.ch = null;
    this.guiding = false;
    this.hide();
  }

  private hide() {
    this.on = false;
    this.box.hidden = this.ring.hidden = true;
    this.light(null);
    this.save();
  }

  /** « Passer » : le chapitre seul, ou tout le tutoriel */
  skip() {
    if (this.ch) { this.endChapter(false); return; }
    this.stop();
    if (this.host.time.paused) this.host.time.paused = false;
    this.ui.info(TUTO_TEXT.skipped);
  }

  finish() {
    this.i = 0;
    this.end = 'done';
    this.guiding = false;
    this.hide();
    this.ui.info(TUTO_TEXT.finished);
  }

  /** « Recommencer » : la suite principale repart du début, et les chapitres se remontreront à leur heure */
  restart() {
    this.seen.clear();
    this.show(0);
  }

  /** L'état à enregistrer */
  private state(): TutoState {
    return {
      on: this.guiding, step: this.i, id: this.steps[this.i]?.id, end: this.end, seen: [...this.seen],
      ch: this.ch ? { id: this.ch, step: this.ci } : this.pending ?? undefined,
    };
  }
  private save() { writeState(this.state()); }

  /** Coche ce que le joueur a fait, passe à l'étape suivante, place la bulle (appelé quatre fois par seconde) */
  update() {
    if (!this.on) return;
    const chap = this.ch ? this.chapters[this.ch]! : null;
    // un chapitre devenu sans objet (les Enfers quittés, le portail refermé) s'achève
    if (chap?.live && !chap.live()) { this.endChapter(true); return; }
    const s = this.cur;
    s.check().forEach((v, j) => { if (v) this.ticks[j] = true; });
    const all = this.ticks.filter(Boolean).length >= (s.need ?? this.ticks.length);
    if (all && !s.read) {
      if (!this.doneAt) this.doneAt = performance.now();
      else if (performance.now() - this.doneAt > 1000) { this.next(); return; }
    }
    // une fenêtre ouverte (réglages, récit, décision) cache la bulle, sauf celle des expéditions à leur étape ; un chapitre
    // attend que le joueur soit là où il se passe ; la suite principale se cache sous terre et dans les Enfers
    const ov = this.ui.root.querySelector('.overlay'), body = document.body.classList;
    const away = (!!ov && !((s.id === 'expeditions' || s.id === 'gear') && ov.querySelector('.expModal'))) || body.contains('photo') || (chap ? !!chap.away?.() : body.contains('under'));
    this.box.hidden = away;
    if (away) { this.ring.hidden = true; this.light(null); return; }
    this.render(s, all);
    this.place();
  }

  /** l'élément montré : un bouton prend une teinte dorée (l'anneau doré, lui, l'entoure d'un halo qui respire lentement) */
  private lit: Element | null = null;
  private light(a: Element | null) {
    if (a === this.lit) return;
    this.lit?.classList.remove('tHi');
    this.lit = a;
    a?.classList.add('tHi');
  }

  /**
   * Ce que le tutoriel laisse bâtir : pendant les premières étapes, un bâtiment après l'autre (le reste est verrouillé, voir
   * `UI.lockOf`). Libre dès qu'il est fini, mis de côté, ou que le village compte déjà d'autres bâtiments
   */
  lock(k: KindId): string | null {
    if (!this.on) return null;
    const ok = GATE[this.cur.id as StepId];
    if (!ok || ok.includes(k)) return null;
    for (const b of this.host.world.buildings.values()) if (!GUIDED.has(b.kind)) return null;
    return TUTO_TEXT.locked;
  }

  private render(s: Step, all: boolean) {
    const T = TUTO_TEXT, st = s.t ?? T.steps[s.id as StepId], chap = this.ch ? this.chapters[this.ch]! : null;
    const n = chap ? chap.steps.length : this.steps.length, at = chap ? this.ci : this.i, last = at === n - 1;
    const tasks = s.tasks?.() ?? st.tasks, note = s.note?.() ?? '', more = s.more?.() ?? '', act = s.act?.() ?? null;
    const key = `${this.ch}|${at}|${this.ticks.join()}|${all}|${note}|${more}|${act?.label}|${tasks.join()}`;
    if (key === this.key) return;
    this.key = key;
    const fin = all && tasks.length > 0;
    this.box.classList.toggle('done', fin);
    this.box.classList.toggle('chap', !!chap);
    this.body.innerHTML = `
      <div class="tHead"><span>${chap ? `${chap.title()} · ${at + 1} / ${n}` : T.stepOf(at + 1, n)}</span>${fin ? `<b>${ic('check', 15, 2.6)} ${T.wellDone}</b>` : ''}</div>
      <h4>${st.title}</h4>
      <p>${fmt(s.text?.() ?? st.text)}</p>
      ${more ? `<p class="tMore">${more}</p>` : ''}
      ${note ? `<p class="tNote">${fmt(note)}</p>` : ''}
      <ul>${tasks.map((t, j) => `<li class="${this.ticks[j] ? 'ok' : ''}"><i>${this.ticks[j] ? ic('check', 13, 3) : ''}</i>${fmt(t)}</li>`).join('')}</ul>
      ${act ? `<button class="tAct">${act.label}</button>` : ''}
      <div class="tActs"><button class="tSkip">${chap ? T.skipChapter : T.skip}</button><span class="grow"></span><button class="tNext ${all ? 'active' : ''}">${last ? T.finish : s.read ? T.ok : T.next}</button></div>`;
  }

  /**
   * Place l'anneau autour de l'élément montré et la bulle à côté (dessous pour le haut de l'écran, dessus pour le bas, sinon
   * sur un côté), sans sortir de l'écran ; la pointe vise le milieu de l'élément. Sans élément : à droite, sous la barre du haut
   */
  private place() {
    const box = this.box, ring = this.ring, W = innerWidth, H = innerHeight, m = 8, gap = 16;
    const s = this.cur, a = s.anchor(), r = a?.getBoundingClientRect();
    const seen = !!r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W;
    // (une fiche que le joueur vient d'ouvrir place la bulle sans être entourée)
    const bare = seen && !!s.bare?.(a!);
    ring.hidden = !seen || bare;
    this.light(seen && !bare ? a : null);
    const w = box.offsetWidth, h = box.offsetHeight;
    if (!seen) {
      const top = (document.getElementById('hud')?.getBoundingClientRect().bottom ?? 80) + 12;
      box.style.left = `${Math.max(m, W - w - 12)}px`;
      box.style.top = `${clamp(top, m, H - h - m)}px`;
      box.dataset.side = '';
      return;
    }
    ring.style.left = `${r.left - 6}px`; ring.style.top = `${r.top - 6}px`;
    ring.style.width = `${r.width + 12}px`; ring.style.height = `${r.height + 12}px`;
    // dans la barre du bas, la bulle passe au-dessus de la fiche du bâtiment survolé ; en haut, sous tout le panneau (le conseil reste lisible)
    const lid = Math.min(r.top, a!.closest('#dock')?.getBoundingClientRect().top ?? r.top);
    // (en haut : sous toutes les rangées du HUD, qui peut en avoir deux ou plus sur un écran moyen ou étroit ; le conseil et
    // les messages, hors du flux, ne comptent pas)
    const floor = Math.max(r.bottom, a!.closest('#hud')?.getBoundingClientRect().bottom ?? r.bottom);
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const order: Side[] = cy < H / 2 ? ['below', 'above', 'right', 'left'] : ['above', 'below', 'right', 'left'];
    const fits = (s: Side) => (s === 'below' ? floor + gap + h <= H - m : s === 'above' ? lid - gap - h >= m : s === 'right' ? r.right + gap + w <= W - m : r.left - gap - w >= m);
    // la bulle évite aussi les fiches ouvertes (besoin, recensement, bâtiment, expédition) : elle prend le côté qui en cache le moins
    const blockers = ['#needInfo', '#census', '#selCard', '#info', '.expModal', '.expCard'].flatMap((q) => [...this.ui.root.querySelectorAll(q)]).filter((e) => e !== a && !e.contains(a!) && !a!.contains(e) && (e as HTMLElement).offsetParent && !(e as HTMLElement).hidden).map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0);
    const pos = (s: Side) => { const v = s === 'below' || s === 'above'; return { x: clamp(v ? cx - w / 2 : s === 'right' ? r.right + gap : r.left - gap - w, m, W - w - m), y: clamp(v ? (s === 'below' ? floor + gap : lid - gap - h) : cy - h / 2, m, H - h - m) }; };
    const covered = (s: Side) => { const p = pos(s); return blockers.reduce((t, b) => t + Math.max(0, Math.min(p.x + w, b.right) - Math.max(p.x, b.left)) * Math.max(0, Math.min(p.y + h, b.bottom) - Math.max(p.y, b.top)), 0); };
    const ok = order.filter(fits);
    const side = (ok.length ? ok : order).reduce((best, s) => (covered(s) < covered(best) ? s : best));
    const vert = side === 'below' || side === 'above';
    const { x, y } = pos(side);
    box.style.left = `${x}px`; box.style.top = `${y}px`;
    box.dataset.side = side;
    this.arrow.style.left = vert ? `${clamp(cx - x, 20, w - 20)}px` : '';
    this.arrow.style.top = vert ? '' : `${clamp(cy - y, 20, h - 20)}px`;
  }

  // ---------------- Réglages ----------------
  /** Sa ligne dans l'onglet Partie des réglages */
  settingsHtml() {
    const T = TUTO_TEXT.settings;
    if (this.off) return `<h4>${T.title}</h4><p class="hint">${TUTO_TEXT.sandbox}</p>`;
    return `<h4>${T.title}</h4>
      <div class="row"><label>${T.label}</label><button id="gTuto" class="${this.on ? 'active' : ''}">${this.on ? T.on : T.off}</button><button id="gTutoRestart">${ic('restart', 16)} ${T.restart}</button></div>
      <p class="hint" id="gTutoHint">${this.settingsHint()}</p>`;
  }

  private settingsHint() {
    const T = TUTO_TEXT.settings, n = this.steps.length, title = TUTO_TEXT.steps[this.steps[this.i].id as StepId].title;
    if (this.ch) { const c = this.chapters[this.ch]!; return T.hintChap(c.title(), this.ci + 1, c.steps.length); }
    return this.on ? T.hintOn(this.i + 1, n, title) : this.i ? T.hintOff(this.i + 1, n, title) : T.hintNew;
  }

  /** Activé : la bulle reprend là où on l'avait laissée (la fenêtre se ferme pour la laisser voir) ; « Recommencer » : au début */
  bindSettings(ov: HTMLElement, close: () => void) {
    if (this.off) return;
    const T = TUTO_TEXT.settings, b = ov.querySelector<HTMLButtonElement>('#gTuto')!;
    b.onclick = () => {
      if (!this.on) { close(); this.show(this.i); return; }
      this.stop();
      b.textContent = T.off;
      b.classList.remove('active');
      ov.querySelector('#gTutoHint')!.textContent = this.settingsHint();
    };
    ov.querySelector<HTMLButtonElement>('#gTutoRestart')!.onclick = () => { close(); this.restart(); };
  }
}
