/**
 * Préparation de l'âge suivant, au repos. Au passage d'âge, tout ce qui change d'aspect se refaisait dans la même demi-seconde :
 * vignettes de la barre de construction (une par image, 6 à 14 ms chacune, avec une lecture de pixels qui attend la carte
 * graphique), modèles des bâtiments qui évoluent (15 à 20 ms au premier de chaque sorte), routes, recensement de la faune.
 * Dès que les conditions de l'âge suivant sont réunies, ce qui peut se faire d'avance (vignettes, modèles) se fait par petits
 * pas, aux moments où le navigateur n'a rien d'autre à faire (`requestIdleCallback`). Voir docs/chargement-performances.md
 */

type Deadline = { timeRemaining(): number };
type IdleWin = Window & { requestIdleCallback?: (cb: (d: Deadline) => void, o?: { timeout: number }) => number };

/** Temps de repos (ms) qu'il doit rester pour enchaîner un pas de plus dans le même moment de repos */
const SLACK_MS = 6;
/** Attente la plus longue d'un moment de repos (ms) */
const WAIT_MS = 1500;

export class AgePrep {
  private job: Generator<void, void, void> | null = null;
  private key = '';
  private busy = false;
  /** pas faits depuis le dernier départ (essais, mesure) */
  steps = 0;

  /** `make(key)` : le travail à faire pour cette clé, en pas (un `yield` après chaque morceau coûteux) */
  constructor(private make: (key: string) => Generator<void, void, void>) {}

  /**
   * L'état voulu, à rappeler de temps en temps : une clé (l'âge visé et ce qui change le travail, la version du monde), ou null
   * quand il n'y a rien à préparer. Une clé nouvelle relance la préparation (ce qui est déjà fait est sauté vite)
   */
  want(key: string | null) {
    if (key === null) { this.job = null; this.key = ''; return; }
    if (key === this.key) return;
    this.key = key;
    this.job = this.make(key);
    this.steps = 0;
    this.later();
  }

  /** La préparation est-elle finie (ou sans objet) ? */
  get idle() { return !this.job; }

  private later() {
    if (this.busy || !this.job) return;
    this.busy = true;
    const w = (typeof window === 'undefined' ? undefined : window) as IdleWin | undefined;
    // (au plus tard après `WAIT_MS` : une machine jamais au repos se prépare quand même, un pas à la fois)
    if (w?.requestIdleCallback) w.requestIdleCallback((d) => this.run(d), { timeout: WAIT_MS });
    else setTimeout(() => this.run({ timeRemaining: () => 0 }), 100);
  }

  /** Un pas au moins par moment de repos, d'autres tant qu'il en reste le temps */
  private run(d: Deadline) {
    this.busy = false;
    do {
      const job = this.job;
      if (!job) return;
      if (job.next().done) { if (this.job === job) this.job = null; return; }
      this.steps++;
    } while (d.timeRemaining() > SLACK_MS);
    this.later();
  }
}
