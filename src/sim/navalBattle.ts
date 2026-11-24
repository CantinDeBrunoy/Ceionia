import { mulberry32 } from '../core/rng';

/**
 * La bataille navale (chantier B du nouveau monde), réglée par des choix tactiques et non par un pilotage navire par navire
 * (décision de l'auteur). Une simulation pure, sur le modèle de la bataille terrestre : trois temps, une carte de choix avant
 * chacun, le jeu en pause jusqu'au choix. Trois batailles :
 * - `strait`, la bataille du bras de mer (guerre, Médiéval, avant le débarquement) : notre flotte et celle de l'allié contre
 *   la flotte rivale ;
 * - `blockade`, le blocus du port (guerre, Industriel, avant sa prise) : plus courte, contre l'escadre du port ;
 * - `convoy`, l'escorte du premier convoi (paix, Médiéval) : amener trois navires marchands d'un mouillage à l'autre, malgré
 *   les pirates.
 *
 * Le repère est celui de la bataille : x le long du bras de mer (nous à l'ouest, x < 0 ; l'ennemi à l'est), z en travers ;
 * en cases. La vue (`render/navalBattleView.ts`) le pose sur l'eau. Le moteur avance par pas de temps ; sans hasard en test
 * (graine fixe), un peu de hasard en jeu (le feu de chaque navire varie de ±15 %). Voir `docs/flotte.md`.
 */

export type NavalKind = 'strait' | 'blockade' | 'convoy';
export type NavalSide = 'ours' | 'ally' | 'foe' | 'merchant';

/** Les choix : l'approche (1), l'engagement (2), la fin (3 ; pas pour l'escorte) */
export type Approach = 'line' | 'crescent' | 'wind' | 'wide' | 'tight' | 'scout';
export type Engage = 'cannonade' | 'board' | 'contact' | 'fireship' | 'torpedo' | 'repel' | 'lure' | 'pay';
export type Finish = 'pursue' | 'return';
export type NavalChoice = Approach | Engage | Finish;

export interface NShip {
  id: number;
  side: NavalSide;
  /** rang dans notre flotte (nos navires seulement), pour rendre les coques */
  slot: number;
  hp: number; max: number;
  /** feu (points de coque ôtés par seconde, avant les choix) */
  gun: number;
  x: number; z: number;
  /** cap (radians, 0 : vers +x) et poste visé */
  heading: number;
  gx: number; gz: number;
  speed: number;
  /** coulé, pris à l'abordage, en fuite (hors de la bataille) */
  sunk: boolean; taken: boolean; fled: boolean;
  /** la cible (id), ou -1 */
  target: number;
  /** il tire en ce moment (la vue en fait des bordées) */
  firing: boolean;
  /** le navire sacrifié (brûlot, vedette lance-torpilles), le leurre (escorte) */
  role: '' | 'strike' | 'lure';
}

/** Ce qui se passe, pour les bannières et la vue */
export type NavalNews =
  | { type: 'choice'; step: 1 | 2 | 3 }
  | { type: 'sunk'; id: number; side: NavalSide }
  | { type: 'taken'; id: number }
  | { type: 'strike'; id: number; hits: number[] }
  | { type: 'break' }
  | { type: 'pay'; gold: number }
  | { type: 'arrive'; n: number }
  | { type: 'end'; outcome: 'won' | 'lost' };

/** La force d'un navire, par camp (nos navires de l'âge, ceux de l'allié et du rival, les marchands, les pirates) */
export const SHIP_HP: Record<NavalSide, number> = { ours: 100, ally: 85, foe: 100, merchant: 70 };
export const SHIP_GUN: Record<NavalSide, number> = { ours: 0.8, ally: 0.68, foe: 0.8, merchant: 0 };
/**
 * La force de la flotte rivale, par âge (coque et feu de chaque navire, calés par `tests/batailleNavale.test.ts` : gagnée sans
 * ordre avec 3 de nos navires au Médiéval, 4 à l'Industriel, 5 au Moderne ; perdue de justesse avec 2 et les pires choix)
 */
export const FOE_K: Record<number, number> = { 2: 1.3, 3: 1.15, 4: 1.15, 5: 1.15 };
/** Les pirates sont plus légers que la flotte rivale */
export const PIRATE_K = 0.8;
/** La flotte rivale, par âge (bras de mer, blocus) ; les pirates ; les navires de l'allié */
export const FOES: Record<number, number> = { 2: 4, 3: 5, 4: 6, 5: 6 };
export const BLOCKADE_FOES: Record<number, number> = { 2: 3, 3: 3, 4: 4, 5: 4 };
export const PIRATES: Record<number, number> = { 2: 3, 3: 4, 4: 4, 5: 4 };
export const ALLIES: Record<number, number> = { 2: 2, 3: 2, 4: 3, 5: 3 };
/** Les marchands du convoi */
export const MERCHANTS = 3;
/** L'écart entre les deux lignes (cases), la portée du canon de l'âge ; la vitesse des navires (cases par seconde) */
export const GAP: Record<number, number> = { 2: 7, 3: 9, 4: 11, 5: 11 };
/** D'où partent les flottes (cases du centre) ; jusqu'où s'enfuit l'ennemi ; le temps d'arriver au poste (s) */
export const START = 22, FLEE = 36, SAIL_T = 15;
/** Le vent ou le large : la manœuvre ralentit l'approche (part de la vitesse) */
export const WIND_SLOW = 0.62;
/** La fin de l'approche, au plus tard (s) ; l'engagement, au plus (s) ; la poursuite (s) ; le retour (s) */
export const APPROACH_MAX = 34, ENGAGE_MAX = 110, PURSUE_T = 12, RETURN_T = 5;
/** Le vent ou le large : nous tirons les premiers, l'ennemi se tait ces secondes de l'engagement */
export const FIRST_T = 12;
/** L'ennemi rompt à la moitié de ses navires perdus (un navire pris compte double), ou sous ce reste de coque */
export const BREAK_HP = 0.35, BREAK_SHARE = 0.6;
/** Notre camp rompt sous ce reste de coque (le nôtre et celui de l'allié ensemble) */
export const OUR_BREAK = 0.3;
/** Un navire ennemi pris à l'abordage, sous ce reste de coque, près de l'un des nôtres */
export const TAKE_HP = 0.25;
/** Le brûlot ou la torpille : il frappe ces secondes après le choix */
export const STRIKE_T = 6;
/** L'escorte : la traversée du convoi (s), l'or du passage payé par âge, l'or perdu par marchand coulé, gagné par marchand arrivé */
export const CONVOY_T = 96;
export const PAY_GOLD: Record<number, number> = { 2: 25, 3: 35, 4: 45, 5: 45 };
export const MERCHANT_LOSS = 10, MERCHANT_GAIN = 8;
/** Le leurre rompt sous ce reste de coque (il ne coule pas : il rejoint le convoi) */
export const LURE_OUT = 0.2;
/** Délai avant un nouvel essai, une bataille perdue (jours de jeu) */
export const SEA_RETRY_DAYS = 1;

/** Les multiplicateurs d'un choix : notre feu, les coups que nous prenons */
interface Mods { fire: number; take: number }
const APPROACH: Record<Approach, Mods> = {
  line: { fire: 1.2, take: 1.15 }, crescent: { fire: 1, take: 1 }, wind: { fire: 1.05, take: 1 }, wide: { fire: 1.05, take: 1 },
  tight: { fire: 1, take: 1 }, scout: { fire: 1, take: 1 },
};
const ENGAGE: Record<Engage, Mods> = {
  cannonade: { fire: 0.85, take: 0.7 }, board: { fire: 1.35, take: 1.25 }, contact: { fire: 1.35, take: 1.25 },
  fireship: { fire: 1, take: 1 }, torpedo: { fire: 1, take: 1 }, repel: { fire: 1, take: 1 }, lure: { fire: 0.85, take: 0.4 }, pay: { fire: 0, take: 0 },
};

export interface NavalOpts {
  /** graine (les tests) ; sans graine, le hasard du jeu */
  seed?: number;
  /** navires alliés en plus (les visites des îles, `boons.allies`) ; navires ennemis en moins (`boons.foes`) */
  allies?: number; foeCut?: number;
  /** l'or du village (pour « Payer le passage ») */
  gold?: number;
}

/** Une option d'une carte de choix : son id, et ce qui l'empêche (null : possible) */
export interface NavalOption { id: NavalChoice; why: string | null }

export class NavalBattle {
  ships: NShip[] = [];
  /** le temps de la bataille (s), sans les pauses des choix */
  t = 0;
  phase: 'approach' | 'engage' | 'finish' | 'over' = 'approach';
  /** la carte de choix attendue (0 : aucune) */
  waiting: 0 | 1 | 2 | 3 = 1;
  picks: NavalChoice[] = [];
  outcome: 'won' | 'lost' | null = null;
  news: NavalNews[] = [];
  /** l'or payé (le passage), perdu (les marchands coulés), gagné (la cargaison arrivée) */
  goldPaid = 0; goldLost = 0; goldWon = 0;
  /** l'ennemi a rompu */
  broken = false;
  /** le convoi : son avancée (0 … 1) */
  convoy = 0;
  /** secondes depuis le début du temps en cours */
  private pt = 0;
  private rnd: () => number;
  private jit = new Map<number, number>();
  private jitT = 0;
  private strikeAt = -1;
  private foes0: number;

  constructor(readonly kind: NavalKind, readonly age: number, hulls: number[], private opts: NavalOpts = {}) {
    this.rnd = opts.seed !== undefined ? mulberry32(opts.seed) : Math.random;
    const a = Math.min(5, Math.max(2, age)), sp = (START - GAP[a] / 2) / SAIL_T;
    let id = 0;
    const add = (side: NavalSide, slot: number, hull: number, x: number, z: number, k = 1): NShip => {
      const kk = side === 'foe' ? k * FOE_K[a] : k, max = SHIP_HP[side] * kk;
      const s: NShip = { id: id++, side, slot, hp: max * hull, max, gun: SHIP_GUN[side] * kk, x, z, heading: side === 'foe' ? Math.PI : 0, gx: x, gz: z, speed: sp, sunk: false, taken: false, fled: false, target: -1, firing: false, role: '' };
      this.ships.push(s);
      return s;
    };
    const spread = (i: number, n: number, w = 2.6) => (i - (n - 1) / 2) * w;
    hulls.forEach((h, i) => add('ours', i, Math.max(0.05, Math.min(1, h)), -START, spread(i, hulls.length) - 1.5));
    if (kind === 'convoy') {
      for (let i = 0; i < MERCHANTS; i++) { const m = add('merchant', -1, 1, -START - 2 - i * 2.6, 0); m.speed = (2 * START) / CONVOY_T; }
      const n = Math.max(1, PIRATES[a] - (opts.foeCut ?? 0));
      for (let i = 0; i < n; i++) add('foe', -1, 1, 4 + i * 2.2, 17 + (i % 2) * 2, PIRATE_K);
    } else {
      const n = Math.max(2, (kind === 'blockade' ? BLOCKADE_FOES[a] : FOES[a]) - (opts.foeCut ?? 0));
      for (let i = 0; i < n; i++) add('foe', -1, 1, START, spread(i, n));
      const m = ALLIES[a] + Math.max(0, opts.allies ?? 0);
      if (kind !== 'blockade') for (let i = 0; i < m; i++) add('ally', -1, 1, -START - 2.5, spread(i, m) + hulls.length * 1.3 + 1.5);
    }
    this.foes0 = this.ships.filter((s) => s.side === 'foe').length;
    this.news.push({ type: 'choice', step: 1 });
  }

  // ---------- Lecture ----------

  get escort() { return this.kind === 'convoy'; }
  alive(side?: NavalSide) { return this.ships.filter((s) => !s.sunk && !s.taken && !s.fled && (!side || s.side === side)); }
  /** les nôtres et l'allié (le camp du joueur, sans les marchands) */
  friends() { return this.ships.filter((s) => (s.side === 'ours' || s.side === 'ally') && !s.sunk); }
  ours() { return this.ships.filter((s) => s.side === 'ours'); }
  /** reste de coque d'un camp (0 … 1) */
  hpShare(sides: NavalSide[]) {
    const all = this.ships.filter((s) => sides.includes(s.side)), max = all.reduce((a, s) => a + s.max, 0);
    return max ? all.reduce((a, s) => a + (s.sunk || s.taken ? 0 : Math.max(0, s.hp)), 0) / max : 0;
  }
  /** navires ennemis perdus (un navire pris compte double) */
  foeLoss() { return this.ships.reduce((a, s) => a + (s.side !== 'foe' ? 0 : s.taken ? 2 : s.sunk ? 1 : 0), 0); }
  /** ce qui reste à la flotte du village : la coque de chacun de nos navires (0 : coulé), dans l'ordre de la flotte */
  hullsBack() { return this.ours().sort((a, b) => a.slot - b.slot).map((s) => (s.sunk ? 0 : Math.max(0.05, s.hp / s.max))); }
  /** nos navires coulés, les navires ennemis coulés ou pris */
  oursLost() { return this.ours().filter((s) => s.sunk).length; }
  foesDown() { return this.ships.filter((s) => s.side === 'foe' && (s.sunk || s.taken)).length; }

  /** Les options de la carte attendue (vide : aucune) */
  options(): NavalOption[] {
    const a = this.age, o = (id: NavalChoice, why: string | null = null): NavalOption => ({ id, why });
    if (this.waiting === 1) return this.escort ? [o('tight'), o('scout')] : [o('line'), o('crescent'), o(a <= 2 ? 'wind' : 'wide')];
    if (this.waiting === 2) {
      if (this.escort) {
        const pay = PAY_GOLD[Math.min(5, Math.max(2, a))];
        return [o('repel'), o('lure', this.alive('ours').length < 2 ? 'two' : null), o('pay', (this.opts.gold ?? Infinity) < pay ? 'gold' : null)];
      }
      return [o('cannonade'), o(a <= 2 ? 'board' : 'contact'), o(a <= 2 ? 'fireship' : 'torpedo', this.alive('ours').length < 2 ? 'two' : null)];
    }
    if (this.waiting === 3) return [o('pursue'), o('return')];
    return [];
  }

  // ---------- Les choix ----------

  /** Le choix du joueur pour la carte attendue ; faux s'il n'est pas permis */
  choose(c: NavalChoice): boolean {
    const opt = this.options().find((x) => x.id === c);
    if (!opt || opt.why) return false;
    const step = this.waiting;
    this.picks[step - 1] = c;
    this.waiting = 0;
    this.pt = 0;
    if (step === 1) this.posts();
    else if (step === 2) this.engage(c as Engage);
    else this.finish(c as Finish);
    return true;
  }

  private pick(i: number) { return this.picks[i]; }
  private mods(): Mods {
    let fire = 1, take = 1;
    const a = this.pick(0) as Approach | undefined, e = this.pick(1) as Engage | undefined;
    if (a) { fire *= APPROACH[a].fire; take *= APPROACH[a].take; }
    if (e) { fire *= ENGAGE[e].fire; take *= ENGAGE[e].take; }
    // en croissant contre une flotte plus petite : on enveloppe
    if (a === 'crescent' && this.alive('ours').length + this.alive('ally').length > this.alive('foe').length) fire *= 1.3;
    // éclairer en avant : le choix suivant porte plus
    if (a === 'scout' && e !== 'pay') { fire *= 1.25; take *= 0.85; }
    return { fire, take };
  }

  /** Les postes de l'approche, selon la formation */
  private posts() {
    const a = Math.min(5, Math.max(2, this.age)), gap = GAP[a], f = this.pick(0) as Approach;
    const line = (list: NShip[], x: number, w = 2.6, arc = 0) => list.forEach((s, i) => {
      const u = i - (list.length - 1) / 2;
      s.gx = x + arc * u * u; s.gz = u * w;
    });
    const mine = [...this.alive('ours'), ...this.alive('ally')];
    if (this.escort) {
      // le convoi avance au milieu ; l'escorte le serre, ou part devant éclairer
      for (const s of this.alive('ours')) { s.gx = f === 'scout' ? 0 : -START + 2; s.gz = f === 'scout' ? 4 + s.slot * 2 : (s.slot % 2 ? -2.2 : 2.2); }
      return;
    }
    line(mine, -gap / 2, f === 'crescent' ? 2.9 : 2.5, f === 'crescent' ? 0.55 : 0);
    line(this.alive('foe'), gap / 2, 2.6);
  }

  /** L'engagement : la manière */
  private engage(e: Engage) {
    const a = Math.min(5, Math.max(2, this.age)), gap = GAP[a];
    if (this.escort) {
      if (e === 'pay') {
        // payer le passage : aucun combat, les pirates s'éloignent
        const gold = PAY_GOLD[a];
        this.goldPaid += gold;
        this.news.push({ type: 'pay', gold });
        for (const f of this.alive('foe')) { f.fled = true; f.gx = f.x + 6; f.gz = FLEE; }
        this.broken = true;
        return;
      }
      // (le leurre file et louvoie : il prend peu de coups, mais tous sont pour lui)
      if (e === 'lure') { const l = this.alive('ours').sort((x, y) => y.hp - x.hp)[0]; if (l) { l.role = 'lure'; l.gz = 14; l.gx = 6; } }
      return;
    }
    if (e === 'board' || e === 'contact') {
      // au contact : nos navires viennent bord à bord de l'ennemi
      const foes = this.alive('foe'), mine = [...this.alive('ours'), ...this.alive('ally')];
      mine.forEach((s, i) => { const f = foes[i % foes.length]; s.gx = gap / 2 - 1.3; s.gz = f.gz + (i >= foes.length ? 1.2 : -0.4); });
    }
    if (e === 'fireship' || e === 'torpedo') {
      // un de nos navires (le plus abîmé) est lancé droit sur la ligne ennemie
      const s = this.alive('ours').sort((x, y) => x.hp / x.max - y.hp / y.max)[0];
      if (s) { s.role = 'strike'; s.gx = gap / 2 - 0.6; s.gz = this.alive('foe')[0]?.gz ?? 0; s.speed *= 1.6; }
      this.strikeAt = STRIKE_T;
    }
  }

  /** La fin : poursuivre ou rentrer */
  private finish(f: Finish) {
    for (const s of this.alive('foe')) { s.gx = FLEE; s.gz = s.z * 1.3; }
    if (f === 'pursue') for (const s of this.friends()) { s.gx = gap0(this.age) / 2 + 8; }
    else for (const s of this.friends()) { s.gx = -START; }
  }

  // ---------- Le temps ----------

  /**
   * Un pas de `dt` secondes. `auto` : une carte attendue prend son premier choix permis (les tests, « sans ordre ») ; sinon le
   * moteur attend le joueur (`waiting`)
   */
  step(dt: number, auto = false) {
    if (this.outcome) return;
    if (this.waiting) {
      if (!auto) return;
      const first = this.options().find((o) => !o.why);
      if (first) this.choose(first.id);
      else return;
    }
    this.t += dt; this.pt += dt;
    this.jitT -= dt;
    if (this.jitT <= 0) { this.jitT = 2; for (const s of this.ships) this.jit.set(s.id, 0.85 + this.rnd() * 0.3); }
    this.sail(dt);
    if (this.phase === 'approach') this.stepApproach();
    else if (this.phase === 'engage') this.stepEngage(dt);
    else if (this.phase === 'finish') this.stepFinish(dt);
    if (this.escort) this.stepConvoy(dt);
  }

  /** Les navires vont vers leur poste, à leur vitesse (une coque très abîmée traîne un peu) */
  private sail(dt: number) {
    for (const s of this.ships) {
      if (s.sunk || s.taken) continue;
      const dx = s.gx - s.x, dz = s.gz - s.z, d = Math.hypot(dx, dz);
      if (d < 0.05) continue;
      // (le vent ou le large : la manœuvre prend du temps)
      const slow = this.phase === 'approach' && (s.side === 'ours' || s.side === 'ally') && ['wind', 'wide'].includes(this.picks[0] ?? '') ? WIND_SLOW : 1;
      const v = Math.min(d, s.speed * slow * (0.7 + 0.3 * Math.max(0, s.hp / s.max)) * dt);
      s.x += (dx / d) * v; s.z += (dz / d) * v;
      s.heading = Math.atan2(dz, dx);
    }
  }

  private stepApproach() {
    const moving = this.ships.some((s) => !s.sunk && s.side !== 'merchant' && !s.fled && Math.hypot(s.gx - s.x, s.gz - s.z) > 0.3);
    if (this.escort) {
      // les pirates fondent sur le convoi quand il arrive à leur hauteur
      if (this.pt > 14 || this.convoy > 0.3) this.toChoice(2);
      return;
    }
    if (!moving || this.pt > APPROACH_MAX) this.toChoice(2);
  }

  private toChoice(step: 2 | 3) {
    this.phase = step === 2 ? 'engage' : 'finish';
    this.waiting = step;
    this.news.push({ type: 'choice', step });
  }

  /** Les tirs d'un pas : chaque navire vise et ôte de la coque ; puis les naufrages, les prises, la rupture */
  private fire(dt: number, ours: Mods, foeFire: number) {
    const foes = this.alive('foe'), mine = [...this.alive('ours'), ...this.alive('ally')], merchants = this.alive('merchant');
    for (const s of this.ships) s.firing = false;
    // nous (et l'allié) : le feu sur l'ennemi le plus abîmé (on coule un navire après l'autre)
    if (foes.length && ours.fire > 0) {
      const tgt = foes.reduce((a, b) => (b.hp < a.hp ? b : a));
      for (const s of mine) {
        if (s.role === 'strike') continue;
        s.target = tgt.id; s.firing = true;
        tgt.hp -= s.gun * ours.fire * (this.jit.get(s.id) ?? 1) * dt;
      }
    }
    // l'ennemi : chacun son adversaire, réparti sur notre ligne (les pirates visent le convoi, ou le leurre)
    if (mine.length && foeFire > 0) {
      const lure = mine.find((s) => s.role === 'lure');
      foes.forEach((f, i) => {
        let tgt: NShip;
        if (this.escort) {
          const tight = this.pick(0) === 'tight';
          tgt = lure ?? (merchants.length && i % (tight ? 3 : 2) === 0 ? merchants[i % merchants.length] : mine[i % mine.length]);
        } else {
          // (à distance, la flotte rivale répartit son feu sur notre ligne ; au contact, elle le concentre sur le plus abîmé
          // de nos navires : l'abordage est risqué)
          const ours = mine.filter((x) => x.side === 'ours' && x.role !== 'strike');
          const close = this.pick(1) === 'board' || this.pick(1) === 'contact';
          if (close && ours.length) tgt = ours.reduce((a, b) => (b.hp < a.hp ? b : a));
          else tgt = mine[i % mine.length];
        }
        f.target = tgt.id; f.firing = true;
        // (le convoi serré : l'escorte couvre les marchands)
        const k = tgt.side === 'merchant' ? (this.pick(0) === 'tight' ? 0.5 : 1) : ours.take * (tgt.side === 'ally' ? 0.9 : 1);
        tgt.hp -= f.gun * foeFire * k * (this.jit.get(f.id) ?? 1) * dt;
      });
    }
    // le leurre à bout de coque rompt et rejoint le convoi : les pirates reviennent sur les marchands
    const lure = this.ships.find((x) => x.role === 'lure' && !x.sunk);
    if (lure && lure.hp < lure.max * LURE_OUT) lure.role = '';
    // le convoi ne se perd jamais en entier avec deux navires de guerre : le dernier marchand tient
    if (this.escort && this.ours().length >= 2) {
      const left = this.alive('merchant');
      if (left.length === 1) left[0].hp = Math.max(left[0].hp, 1);
    }
    this.wrecks();
  }

  /** Les navires à bout : coulés, ou pris à l'abordage (au contact, un navire ennemi sous `TAKE_HP`) */
  private wrecks() {
    const boarding = this.pick(1) === 'board' || this.pick(1) === 'contact';
    for (const s of this.ships) {
      if (s.sunk || s.taken || s.fled) continue;
      if (boarding && s.side === 'foe' && s.hp < s.max * TAKE_HP && s.hp > 0) {
        s.taken = true; s.firing = false;
        this.news.push({ type: 'taken', id: s.id });
        continue;
      }
      if (s.hp > 0) continue;
      s.hp = 0; s.sunk = true; s.firing = false;
      this.news.push({ type: 'sunk', id: s.id, side: s.side });
      if (s.side === 'merchant') this.goldLost += MERCHANT_LOSS;
    }
  }

  private stepEngage(dt: number) {
    const m = this.mods(), e = this.pick(1);
    // le brûlot, la torpille : il frappe, coule les deux plus forts navires ennemis (la torpille : un, et en abîme un autre)
    if (this.strikeAt >= 0 && this.pt >= this.strikeAt) {
      this.strikeAt = -1;
      const s = this.ships.find((x) => x.role === 'strike' && !x.sunk);
      const big = this.alive('foe').sort((a, b) => b.hp - a.hp);
      const hits: number[] = [];
      if (big[0]) { big[0].hp = 0; hits.push(big[0].id); }
      if (big[1]) { if (e === 'fireship') big[1].hp = 0; else big[1].hp *= 0.35; hits.push(big[1].id); }
      if (s) { s.hp = 0; }
      this.news.push({ type: 'strike', id: s?.id ?? -1, hits });
      this.wrecks();
    }
    // (le vent, le large, l'éclaireur : nous tirons les premiers)
    const first = ['wind', 'wide'].includes(this.pick(0)!) && this.pt < FIRST_T;
    this.fire(dt, m, first ? 0 : 1);
    if (this.escort) {
      if (!this.broken && this.foeBroken()) { this.broken = true; this.news.push({ type: 'break' }); for (const f of this.alive('foe')) { f.fled = true; f.gx = f.x + 4; f.gz = FLEE; } }
      return;
    }
    if (this.foeBroken()) { this.broken = true; this.news.push({ type: 'break' }); this.toChoice(3); return; }
    if (this.oursBroken() || this.pt > ENGAGE_MAX) this.end(this.oursBroken() || this.hpShare(['foe']) > this.hpShare(['ours', 'ally']) ? 'lost' : 'won');
  }

  foeBroken() { return this.foeLoss() >= Math.ceil(this.foes0 * BREAK_SHARE) || this.hpShare(['foe']) < BREAK_HP || !this.alive('foe').length; }
  oursBroken() { return !this.alive('ours').length || this.hpShare(['ours', 'ally']) < OUR_BREAK; }

  private stepFinish(dt: number) {
    if (this.pick(2) === 'pursue') {
      // la poursuite : nos bordées continuent sur l'ennemi qui fuit ; il riposte peu
      const m = this.mods();
      this.fire(dt, { fire: m.fire, take: 0.6 }, 0.35);
      if (this.pt > PURSUE_T || !this.alive('foe').length) this.end('won');
    } else if (this.pt > RETURN_T) this.end('won');
  }

  /** L'escorte : le convoi avance ; arrivé, la bataille est gagnée (perdue si plus aucun marchand) */
  private stepConvoy(dt: number) {
    const ms = this.alive('merchant');
    if (!ms.length) { this.end('lost'); return; }
    this.convoy = Math.min(1, this.convoy + dt / CONVOY_T);
    ms.forEach((s, i) => { s.gx = -START - 2 + this.convoy * (2 * START + 2) - i * 2.6; s.gz = 0; });
    // l'escorte serrée suit le convoi ; les pirates fondent sur lui (sauf s'ils ont rompu ou suivent le leurre)
    const lead = ms[0];
    for (const s of this.alive('ours')) {
      if (s.role === 'lure') continue;
      if (this.pick(0) === 'tight' || this.phase === 'engage') { s.gx = lead.x - 2.6 * (s.slot % 3); s.gz = s.slot % 2 ? -2.2 : 2.2; }
    }
    if (this.phase === 'engage' && !this.broken) {
      const lure = this.alive('ours').find((s) => s.role === 'lure');
      this.alive('foe').forEach((f, i) => { const t = lure ?? ms[i % ms.length]; f.gx = t.x + 1 + (i % 2); f.gz = t.z + 3.2 + i * 0.8; });
    }
    if (this.convoy >= 1) {
      this.goldWon = ms.length * MERCHANT_GAIN;
      this.news.push({ type: 'arrive', n: ms.length });
      this.end('won');
    }
  }

  /** La retraite (le joueur) : la bataille est perdue, nos navires rentrent avec leurs coques */
  retreat() { if (!this.outcome) this.end('lost'); }

  private end(o: 'won' | 'lost') {
    if (this.outcome) return;
    this.outcome = o;
    this.phase = 'over';
    this.waiting = 0;
    for (const s of this.ships) s.firing = false;
    this.news.push({ type: 'end', outcome: o });
  }
}

const gap0 = (age: number) => GAP[Math.min(5, Math.max(2, age))];

/** Joue la bataille jusqu'au bout, avec ces choix (les tests) ; `dt` : le pas */
export function playNaval(b: NavalBattle, picks: NavalChoice[] = [], dt = 0.25, limit = 400) {
  for (let t = 0; t < limit && !b.outcome; t += dt) {
    if (b.waiting) {
      const want = picks[b.waiting - 1];
      if (!want || !b.choose(want)) { const first = b.options().find((o) => !o.why); if (first) b.choose(first.id); }
    }
    b.step(dt);
  }
  return b;
}
