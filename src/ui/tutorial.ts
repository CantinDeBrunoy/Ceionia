import { KINDS, KindId } from '../build/catalog';
import { MAPS } from '../world/mapgen';
import { loadSlot } from '../save/save';
import { ic } from './icons';
import type { UI, UIHost } from './ui';

/**
 * Tutoriel guidé : une bulle montre l'élément de l'interface dont il est question (un anneau l'entoure) et passe d'elle-même à
 * l'étape suivante quand le joueur l'a fait, ou d'un clic sur « Suivant ». Rien n'est bloqué : le jeu continue autour. On le
 * passe, on le reprend depuis les réglages ; il est activé d'office pour qui n'a encore aucune partie, et le choix est retenu.
 */

/** Tous les textes du tutoriel, au même endroit (pour la traduction du jeu). `{eye}`, `{compass}`… : icônes dans le texte */
export const TUTO_TEXT = {
  stepOf: (i: number, n: number) => `Tutoriel · ${i} / ${n}`,
  next: 'Suivant',
  finish: 'Terminer',
  skip: 'Passer le tutoriel',
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
    hintOn: (i: number, n: number, title: string) => `Une bulle vous guide pas à pas. Étape ${i} sur ${n} : « ${title} ».`,
    hintOff: (i: number, n: number, title: string) => `Mis de côté à l’étape ${i} sur ${n} (« ${title} ») : le réactiver le reprend là, « Recommencer » repart du début.`,
    hintNew: 'Une bulle vous guide pas à pas : caméra, construction, besoins, âges, expéditions et incidents.',
  },
  steps: {
    camera: {
      title: 'Bienvenue ! Regardez autour de vous',
      text: 'Faites tourner la vue (clic droit et glisser, ou A / E), zoomez (molette, vers le point visé) et déplacez-vous (clic milieu, Maj + clic droit, ou ZQSD / flèches). Perdu ? V, ou le bouton {target} en bas à droite, ramène la vue sur le village.',
      touch: 'Avec deux doigts : glissez pour déplacer la vue, pincez pour zoomer, tournez-les pour faire pivoter. Perdu ? Le bouton {target} en bas à droite ramène la vue sur le village.',
      tasks: ['Se déplacer', 'Tourner la vue', 'Zoomer'],
      paused: 'Le jeu est en pause pendant que vous prenez vos repères : vous le relancerez un peu plus loin. Un seul des trois gestes suffit pour continuer.',
    },
    dock: {
      title: 'La barre de construction',
      text: 'En bas, l’onglet « Bâtir » range les bâtiments par rayons : Habitat, Production, Services, Vie & culture. « Relief » et « Nature » sculptent et décorent le terrain. Survolez une vignette pour lire sa fiche, cliquez pour prendre le bâtiment en main.',
      tasks: ['Prendre un bâtiment en main'],
    },
    place: {
      title: 'Premières constructions',
      text: 'Il faut de quoi loger, nourrir et abreuver le village : une maison, une ferme et un puits (leur nom change avec les âges). Le bâtiment en main se pose d’un clic sur le terrain ; R le tourne, Échap le lâche.',
      tasks: ['logement', 'nourriture', 'eau'],
      kindTask: (name: string, what: string) => `${name} (${what})`,
    },
    road: {
      title: 'Tracer une route',
      text: 'Prenez l’outil Route {road} (touche R), en haut à gauche de la barre, puis glissez sur le terrain. Habitants et charrettes circulent sur les routes ; sur l’eau peu profonde, la route devient un pont.',
      tasks: ['Prendre l’outil Route', 'Tracer une route'],
    },
    needs: {
      title: 'Les besoins du village',
      text: 'En haut, chaque jauge montre un besoin : nourriture, eau, logement, travail, bien-être, santé. Elle vire à l’orange quand il manque quelque chose. Cliquez sur une icône pour voir d’où vient le besoin et quoi bâtir pour le combler ; le compteur d’habitants détaille leur état.',
      tasks: ['Ouvrir la fiche d’un besoin'],
    },
    time: {
      title: 'Pause et vitesse',
      text: 'Le bouton {pause} (ou Espace) arrête ou relance le temps, pour réfléchir ou bâtir tranquillement ; le bouton ×1 passe à ×2 puis ×4 pour accélérer les jours et les saisons.',
      tasks: ['Arrêter ou relancer le temps', 'Changer la vitesse'],
    },
    ages: {
      title: 'Les âges',
      text: 'Le village traverse six âges : Préhistoire, Antiquité, Médiéval, Industriel, Moderne et Futuriste. Le panneau en haut à gauche montre où il en est : cliquez dessus pour voir ce que demande l’âge suivant (habitants, bâtiments, minerai, expédition obligatoire ★). Une condition qui nomme un bâtiment se clique pour le bâtir. Quand tout est réuni, le bouton « Passer à … » fait entrer le village dans le nouvel âge.',
      tasks: ['Ouvrir les conditions de l’âge suivant'],
    },
    expeditions: {
      title: 'Les expéditions',
      text: 'Le bouton {compass} ouvre les expéditions : une petite équipe d’habitants part chercher bêtes, minerai ou semences, et débloque parfois de nouveaux bâtiments. Chaque âge a son expédition obligatoire ★. Une fois l’équipe partie, sa carte s’affiche à gauche : son bouton {eye} la fait suivre (ou lâcher) par la caméra.',
      choose: 'Choisissez une mission, puis l’un de ses choix pour faire partir l’équipe.',
      none: 'Aucune équipe ne peut partir pour l’instant (il faut des habitants libres) : « Suivant » passe à la suite.',
      tasks: ['Ouvrir les expéditions', 'Lancer une expédition', 'Suivre l’équipe avec {eye}'],
    },
    incidents: {
      title: 'Les incidents',
      text: 'Incendies, malaises et cambriolages s’affichent en cartes rouges à gauche, sous les expéditions, le temps que pompiers, secours ou gendarmes interviennent. Le bouton {eye} de la carte suit l’intervention à la caméra.',
      none: 'Aucun incident pour l’instant : sa carte apparaîtra à gauche quand il en arrivera un.',
      tasks: ['Suivre un incident avec {eye}'],
    },
  },
};

type StepId = keyof typeof TUTO_TEXT.steps;
type Side = 'below' | 'above' | 'right' | 'left';

/** Une étape : l'élément montré, les tâches à faire et comment savoir qu'elles sont faites */
interface Step {
  id: StepId;
  /** l'élément montré (null : la bulle se tient à l'écart, sans anneau) */
  anchor(): Element | null;
  /** les tâches de l'étape, faites ou non (une tâche faite le reste) */
  check(): boolean[];
  /** au début de l'étape : l'état de départ, pour voir ce que le joueur change */
  begin?(): void;
  /** le texte, s'il dépend de la situation */
  text?(): string;
  /** une ligne de plus selon la situation */
  note?(): string;
  /** les intitulés des tâches, s'ils dépendent de la situation */
  tasks?(): string[];
  /** une étape à lire : une fois faite, elle attend « Suivant » au lieu de passer d'elle-même */
  read?: boolean;
  /** tâches à faire pour passer (toutes par défaut) */
  need?: number;
}

const KEY = 'village-lowpoly:v1:tutorial';
interface TutoState { on: boolean; step: number }

function readState(): TutoState | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return s && typeof s.on === 'boolean' ? { on: s.on, step: Math.max(0, Math.floor(+s.step || 0)) } : null;
  } catch { return null; }
}
function writeState(s: TutoState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** Le tutoriel est-il activé ? Tant que le joueur n'a rien choisi : oui s'il n'a encore aucune partie */
export function tutorialOn() { return readState()?.on ?? !MAPS.some((m) => loadSlot(m.id)); }

/** Icônes glissées dans les textes */
const fmt = (s: string) => s.replace(/\{(\w+)\}/g, (_, n: string) => ic(n, 15, 2.2));

/** Interrupteur du tutoriel sur l'écran d'accueil : il vaut pour la partie lancée, et le choix est retenu */
export function menuToggle(): HTMLElement {
  const T = TUTO_TEXT.menu, row = document.createElement('div');
  row.className = 'row tutoToggle';
  const draw = () => {
    const on = tutorialOn();
    row.innerHTML = `<button class="${on ? 'on' : ''}" aria-pressed="${on}" title="${T.title}">${ic('book', 17, 2)}${T.label} : ${on ? T.on : T.off}<i class="sw"></i></button>`;
    (row.firstElementChild as HTMLButtonElement).onclick = () => { writeState({ on: !on, step: readState()?.step ?? 0 }); draw(); };
  };
  draw();
  return row;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const coarse = () => window.matchMedia('(pointer: coarse)').matches;
/** les trois premiers bâtiments : de quoi loger, nourrir et abreuver */
const FIRST: KindId[] = ['house', 'farm', 'well'];

export class Tutorial {
  /** la bulle est affichée */
  on = false;
  private steps: Step[];
  /** étape en cours (ou celle où on l'a laissé) */
  private i = 0;
  /** tâches de l'étape déjà faites */
  private ticks: boolean[] = [];
  /** toutes faites depuis… (la bulle dit « Bien joué ! » un instant avant de passer) */
  private doneAt = 0;
  private key = '';
  private box: HTMLElement;
  private body: HTMLElement;
  private arrow: HTMLElement;
  private ring: HTMLElement;
  /** clics repérés pendant l'étape : l'œil d'une équipe, celui d'un incident */
  private clicks = new Set<'exp' | 'inc'>();
  /** état au début de l'étape */
  private base: { view?: { x: number; z: number; yaw: number; dist: number }; kinds?: Record<string, number>; roads?: number; paused?: boolean; speed?: number } = {};
  /** choix d'expédition déjà amenés sous les yeux */
  private shown = new WeakSet<Element>();

  /** `fresh` : nouvelle partie (le tutoriel, s'il est activé, reprend au début) */
  constructor(private ui: UI, private host: UIHost, fresh: boolean) {
    const h = host, T = TUTO_TEXT.steps, q = (s: string) => ui.root.querySelector(s);
    const count = () => { const n: Record<string, number> = {}; for (const b of h.world.buildings.values()) n[b.kind] = (n[b.kind] ?? 0) + 1; return n; };
    const roads = () => { let n = 0; const r = h.world.road; for (let k = 0; k < r.length; k++) if (r[k]) n++; return n; };
    this.steps = [
      {
        id: 'camera', anchor: () => null,
        begin: () => (this.base.view = h.cam.view()),
        text: () => (coarse() ? T.camera.touch : T.camera.text),
        // une seule des trois suffit : un enfant zoome tout de suite, mais tourner la vue au clic droit ne se devine pas
        need: 1,
        note: () => (h.time.paused ? T.camera.paused : ''),
        check: () => {
          const v = h.cam.view(), b = this.base.view!;
          return [Math.hypot(v.x - b.x, v.z - b.z) > 3, Math.abs(v.yaw - b.yaw) > 0.35, Math.abs(Math.log(v.dist / b.dist)) > 0.15];
        },
      },
      {
        id: 'dock', anchor: () => (ui.tab === 'build' ? q('#dockMain') : q('#modes [data-t="build"]')),
        check: () => [h.tools.tool === 'build'],
      },
      {
        id: 'place',
        begin: () => (this.base.kinds = count()),
        // déjà bâtis avant d'arriver à l'étape : elle passe d'elle-même
        check: () => { const n = count(); return FIRST.map((k) => (n[k] ?? 0) > 0); },
        // le prochain bâtiment à poser : l'onglet Bâtir, son rayon, puis sa vignette
        anchor: () => {
          const k = FIRST.find((_, j) => !this.ticks[j]);
          if (!k) return null;
          const cat = KINDS[k].cat;
          return ui.tab !== 'build' ? q('#modes [data-t="build"]') : ui.cat !== cat ? q(`#subcats [data-c="${cat}"]`) : q(`#items [data-kind="${k}"]`);
        },
        tasks: () => FIRST.map((k, j) => T.place.kindTask(KINDS[k].names[Math.max(h.sim.age, KINDS[k].minAge)], T.place.tasks[j])),
      },
      {
        id: 'road', anchor: () => q('#quickL [data-tool="road"]'),
        begin: () => (this.base.roads = roads()),
        check: () => {
          const n = roads(), on = h.tools.tool === 'road';
          // les chemins posés d'eux-mêmes jusqu'aux nouveaux bâtiments ne comptent pas : seule compte la route tracée à l'outil
          if (!on) this.base.roads = n;
          return [on, on && n > this.base.roads!];
        },
      },
      {
        // la fiche ouverte (d'un besoin ou des habitants) : la bulle se met dessous, sans la cacher
        id: 'needs', anchor: () => [q('#needInfo'), q('#census')].find((x) => !(x as HTMLElement).hidden) ?? q('#needs'),
        check: () => [!(q('#needInfo') as HTMLElement).hidden || !(q('#census') as HTMLElement).hidden],
      },
      {
        id: 'time', anchor: () => q('#timePanel'),
        begin: () => { this.base.paused = h.time.paused; this.base.speed = h.time.speed; },
        check: () => [h.time.paused !== this.base.paused, h.time.speed !== this.base.speed],
      },
      {
        // une fois ouvert, la bulle montre la liste des conditions
        id: 'ages', read: true,
        anchor: () => (q('#agePanel')!.classList.contains('open') ? q('#ageReq') : q('#agePanel')),
        check: () => [q('#agePanel')!.classList.contains('open')],
      },
      {
        id: 'expeditions',
        // le bouton 🧭, puis un choix de mission dans la fenêtre, puis l'œil de la carte de l'équipe
        anchor: () => {
          const m = q('.expModal');
          if (m && !this.ticks[1]) {
            const b = [...m.querySelectorAll('button.choice:not([disabled])')].find((x) => x.getClientRects().length);
            if (b && !this.shown.has(b)) { this.shown.add(b); b.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
            return b ?? m.querySelector('.mtitle');
          }
          if (!this.ticks[1]) return q('#bExp');
          return this.ticks[2] ? null : q('#expList .expCard:not(.incident) .cam');
        },
        check: () => [!!q('.expModal'), h.expeditions.active.length > 0, this.clicks.has('exp')],
        note: () => {
          const m = q('.expModal');
          if (!m || this.ticks[1]) return '';
          return m.querySelector('button.choice:not([disabled])') ? T.expeditions.choose : T.expeditions.none;
        },
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
    this.box.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      b.blur();
      h.audio.sfxClick();
      if (b.classList.contains('tNext')) this.next();
      else if (b.classList.contains('tSkip')) this.skip();
    });
    // l'œil d'une carte d'équipe ou d'incident (capturé avant que la carte ne soit redessinée)
    ui.root.addEventListener('click', (e) => {
      const cam = (e.target as HTMLElement).closest('.expCard .cam');
      if (cam) this.clicks.add(cam.closest('.incident') ? 'inc' : 'exp');
    }, true);
    // une liste qui défile (la fenêtre des expéditions) : la bulle suit l'élément montré
    ui.root.addEventListener('scroll', () => { if (this.on) this.place(); }, true);
    window.addEventListener('resize', () => { if (this.on) this.place(); });
    ui.tutorial = this;

    const st = readState() ?? { on: tutorialOn(), step: 0 };
    // nouvelle partie avec le tutoriel : le temps attend que le joueur ait pris ses repères (il le relance à l'étape du temps)
    if (fresh) { st.step = 0; if (st.on) h.time.paused = true; }
    this.i = Math.min(st.step, this.steps.length - 1);
    writeState({ on: st.on, step: this.i });
    if (st.on) this.show(this.i);
  }

  /** Affiche l'étape donnée (elle repart de zéro) */
  show(i: number) {
    this.i = clamp(i, 0, this.steps.length - 1);
    this.on = true;
    const s = this.steps[this.i];
    this.base = {};
    this.clicks.clear();
    s.begin?.();
    this.ticks = s.check().map(() => false);
    this.doneAt = 0;
    this.key = '';
    writeState({ on: true, step: this.i });
    // la bulle apparaît directement à sa place (sans glisser depuis la précédente)
    this.box.classList.add('fresh');
    this.update();
    requestAnimationFrame(() => this.box.classList.remove('fresh'));
  }

  next() {
    if (this.i >= this.steps.length - 1) { this.finish(); return; }
    this.show(this.i + 1);
  }

  /** Cache la bulle ; le tutoriel reprendra à cette étape */
  stop() {
    this.on = false;
    this.box.hidden = this.ring.hidden = true;
    writeState({ on: false, step: this.i });
  }

  skip() { this.stop(); this.ui.toast(TUTO_TEXT.skipped); }

  finish() {
    this.stop();
    this.i = 0;
    writeState({ on: false, step: 0 });
    this.ui.toast(TUTO_TEXT.finished);
  }

  /** Coche ce que le joueur a fait, passe à l'étape suivante, place la bulle (appelé quatre fois par seconde) */
  update() {
    if (!this.on) return;
    const s = this.steps[this.i];
    s.check().forEach((v, j) => { if (v) this.ticks[j] = true; });
    const all = this.ticks.filter(Boolean).length >= (s.need ?? this.ticks.length);
    if (all && !s.read) {
      if (!this.doneAt) this.doneAt = performance.now();
      else if (performance.now() - this.doneAt > 1000) { this.next(); return; }
    }
    // une fenêtre ouverte (réglages, récit, décision) cache la bulle, sauf celle des expéditions à leur étape
    const ov = this.ui.root.querySelector('.overlay'), body = document.body.classList;
    const away = (!!ov && !(s.id === 'expeditions' && ov.querySelector('.expModal'))) || body.contains('photo') || body.contains('under');
    this.box.hidden = away;
    if (away) { this.ring.hidden = true; return; }
    this.render(s, all);
    this.place();
  }

  private render(s: Step, all: boolean) {
    const T = TUTO_TEXT, st = T.steps[s.id], n = this.steps.length, last = this.i === n - 1;
    const tasks = s.tasks?.() ?? st.tasks, note = s.note?.() ?? '';
    const key = `${this.i}|${this.ticks.join()}|${all}|${note}|${tasks.join()}`;
    if (key === this.key) return;
    this.key = key;
    this.box.classList.toggle('done', all);
    this.body.innerHTML = `
      <div class="tHead"><span>${T.stepOf(this.i + 1, n)}</span>${all ? `<b>${ic('check', 14, 2.6)} ${T.wellDone}</b>` : ''}</div>
      <h4>${st.title}</h4>
      <p>${fmt(s.text?.() ?? st.text)}</p>
      ${note ? `<p class="tNote">${fmt(note)}</p>` : ''}
      <ul>${tasks.map((t, j) => `<li class="${this.ticks[j] ? 'ok' : ''}"><i>${this.ticks[j] ? ic('check', 12, 3) : ''}</i>${fmt(t)}</li>`).join('')}</ul>
      <div class="tActs"><button class="tSkip">${T.skip}</button><span class="grow"></span><button class="tNext ${all ? 'active' : ''}">${last ? T.finish : T.next}</button></div>`;
  }

  /**
   * Place l'anneau autour de l'élément montré et la bulle à côté (dessous pour le haut de l'écran, dessus pour le bas, sinon
   * sur un côté), sans sortir de l'écran ; la pointe vise le milieu de l'élément. Sans élément : à droite, sous la barre du haut
   */
  private place() {
    const box = this.box, ring = this.ring, W = innerWidth, H = innerHeight, m = 8, gap = 14;
    const a = this.steps[this.i].anchor(), r = a?.getBoundingClientRect();
    const seen = !!r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W;
    ring.hidden = !seen;
    const w = box.offsetWidth, h = box.offsetHeight;
    if (!seen) {
      const top = (document.getElementById('hud')?.getBoundingClientRect().bottom ?? 80) + 12;
      box.style.left = `${Math.max(m, W - w - 12)}px`;
      box.style.top = `${clamp(top, m, H - h - m)}px`;
      box.dataset.side = '';
      return;
    }
    ring.style.left = `${r.left - 5}px`; ring.style.top = `${r.top - 5}px`;
    ring.style.width = `${r.width + 10}px`; ring.style.height = `${r.height + 10}px`;
    // dans la barre du bas, la bulle passe au-dessus de la fiche du bâtiment survolé ; en haut, sous tout le panneau (le conseil reste lisible)
    const lid = Math.min(r.top, a!.closest('#dock')?.getBoundingClientRect().top ?? r.top);
    const floor = Math.max(r.bottom, a!.closest('#hud > .panel')?.getBoundingClientRect().bottom ?? r.bottom);
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const order: Side[] = cy < H / 2 ? ['below', 'above', 'right', 'left'] : ['above', 'below', 'right', 'left'];
    const fits = (s: Side) => (s === 'below' ? floor + gap + h <= H - m : s === 'above' ? lid - gap - h >= m : s === 'right' ? r.right + gap + w <= W - m : r.left - gap - w >= m);
    const side = order.find(fits) ?? order[0];
    const vert = side === 'below' || side === 'above';
    const x = clamp(vert ? cx - w / 2 : side === 'right' ? r.right + gap : r.left - gap - w, m, W - w - m);
    const y = clamp(vert ? (side === 'below' ? floor + gap : lid - gap - h) : cy - h / 2, m, H - h - m);
    box.style.left = `${x}px`; box.style.top = `${y}px`;
    box.dataset.side = side;
    this.arrow.style.left = vert ? `${clamp(cx - x, 18, w - 18)}px` : '';
    this.arrow.style.top = vert ? '' : `${clamp(cy - y, 18, h - 18)}px`;
  }

  // ---------------- Réglages ----------------
  /** Sa ligne dans l'onglet Partie des réglages */
  settingsHtml() {
    const T = TUTO_TEXT.settings;
    return `<h4>${T.title}</h4>
      <div class="row"><label>${T.label}</label><button id="gTuto" class="${this.on ? 'active' : ''}">${this.on ? T.on : T.off}</button><button id="gTutoRestart">${ic('restart', 16)} ${T.restart}</button></div>
      <p class="hint" id="gTutoHint">${this.settingsHint()}</p>`;
  }

  private settingsHint() {
    const T = TUTO_TEXT.settings, n = this.steps.length, title = TUTO_TEXT.steps[this.steps[this.i].id].title;
    return this.on ? T.hintOn(this.i + 1, n, title) : this.i ? T.hintOff(this.i + 1, n, title) : T.hintNew;
  }

  /** Activé : la bulle reprend là où on l'avait laissée (la fenêtre se ferme pour la laisser voir) ; « Recommencer » : au début */
  bindSettings(ov: HTMLElement, close: () => void) {
    const T = TUTO_TEXT.settings, b = ov.querySelector<HTMLButtonElement>('#gTuto')!;
    b.onclick = () => {
      if (!this.on) { close(); this.show(this.i); return; }
      this.stop();
      b.textContent = T.off;
      b.classList.remove('active');
      ov.querySelector('#gTutoHint')!.textContent = this.settingsHint();
    };
    ov.querySelector<HTMLButtonElement>('#gTutoRestart')!.onclick = () => { close(); this.show(0); };
  }
}
