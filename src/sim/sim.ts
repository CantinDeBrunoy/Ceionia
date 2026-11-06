import { World } from '../world/world';
import { AGES, BUILD_CATS, KINDS, KindId, lineOf } from '../build/catalog';
import { mandatoriesFor, needBonus, MISSIONS, VICTORY } from './missions';
import { DIFF_TEXT, Difficulty, rulesOf } from './difficulty';
import { priceIn, YIELD } from './economy';
import { CAMP_JOY } from './depths';

export interface Need { cap: number; demand: number; ok: boolean }

export type NeedId = 'housing' | 'food' | 'water' | 'jobs' | 'joy' | 'health';

/**
 * Détail d'un besoin pour sa fiche : chaque source (bâtiments d'une même sorte, champs, jardins, forêts, maisons au bord de
 * l'eau, effets d'expédition) avec son nombre et son apport ; le bâtiment qui le comble le mieux et ce qu'il apporte
 */
export interface NeedDetail extends Need { rows: { label: string; n: number; v: number }[]; kind: KindId; per: number }

/** Parts entières d'un besoin : ce qui est fourni s'arrondit en dessous, ce qui est demandé au-dessus (aux erreurs d'arrondi près) */
const down = (v: number) => Math.max(0, Math.floor(v + 1e-9)), up = (v: number) => Math.ceil(v - 1e-9);

export interface AgeProgress {
  next: number;
  ratio: number;
  /** chaque condition ; `kind` : le bâtiment demandé (nommé comme dans la barre de construction) */
  items: { label: string; have: number; need: number; kind?: KindId }[];
}

/**
 * Bâtiments que demande l'âge `n`, par genre : en partie normale, autant qu'il en faut au village ; en défi, ce qu'il en faut
 * de plus que n'en demandaient déjà les âges d'avant (un genre qu'ils demandaient déjà autant n'est plus demandé)
 */
export function reqKindsOf(n: number, d: Difficulty): Partial<Record<KindId, number>> {
  const req = AGES[n].reqKinds;
  if (!rulesOf(d).newOnly) return req;
  const out: Partial<Record<KindId, number>> = {};
  for (const [k, c] of Object.entries(req) as [KindId, number][]) {
    const before = usedBefore(k, n);
    if (c > before) out[k] = c - before;
  }
  return out;
}

/** Combien de bâtiments de ce genre les âges d'avant `n` ont déjà demandés (ceux-là ne comptent plus, en défi) */
export function usedBefore(k: KindId, n: number): number {
  return Math.max(0, ...AGES.slice(0, n).map((a) => a.reqKinds[k] ?? 0));
}

/** Simulation légère : besoins par présence, population, passage d'âge */
export class Sim {
  pop = 0;
  age = 0;
  housing: Need = { cap: 0, demand: 0, ok: true };
  food: Need = { cap: 0, demand: 0, ok: true };
  water: Need = { cap: 0, demand: 0, ok: true };
  jobs: Need = { cap: 0, demand: 0, ok: true };
  joy: Need = { cap: 0, demand: 0, ok: true };
  health: Need = { cap: 0, demand: 0, ok: true };
  message = '';
  /** le bâtiment dont parle le message (un clic sur le message le prend en main), s'il y en a un */
  messageKind: KindId | null = null;
  counts: Record<string, number> = {};
  /** Humidité des sols (0 sécheresse … 1 bien arrosés) : la pluie l'entretient, l'été la fait chuter ; elle règle la récolte des champs */
  moisture = 0.7;
  /** pluie (0 … 1) et saison courantes, données par le jeu */
  rain = 0;
  season = 0;
  private baseFood = 0;
  private fieldFood = 0;
  private baseWater = 0;
  private baseJobs = 0;
  private baseJoy = 0;
  private grow = 0;
  /** secondes de jeu pendant lesquelles le village se remet d'un manque (en défi, il grandit alors plus lentement) */
  recovering = 0;
  /** habitants partis pendant la disette en cours (défi) */
  fled = 0;
  /** d'où vient chaque besoin : apports des bâtiments par sorte (et des maisons au bord de l'eau), puis la terre cultivée */
  private src: Record<NeedId, Map<string, { n: number; v: number }>> = { housing: new Map(), food: new Map(), water: new Map(), jobs: new Map(), joy: new Map(), health: new Map() };
  private land = { fields: 0, fertile: 0, gardens: 0, forests: 0 };
  private lastVersion = -1;
  private recalcTimer = 0;
  onAgeUp: ((age: number) => void) | null = null;

  constructor(private world: World) {}

  recalc() {
    const w = this.world;
    let H = 0, F = 0, W = 0, J = 0, Jy = 0, He = 0;
    const counts: Record<string, number> = {};
    for (const m of Object.values(this.src)) m.clear();
    const add = (need: NeedId, key: string, v: number) => {
      if (v <= 0) return;
      const s = this.src[need].get(key) ?? { n: 0, v: 0 };
      s.n++; s.v += v;
      this.src[need].set(key, s);
    };
    for (const b of w.buildings.values()) {
      const k = KINDS[b.kind];
      const a = b.age;
      counts[b.kind] = (counts[b.kind] ?? 0) + 1;
      for (const need of ['housing', 'food', 'water', 'jobs', 'joy', 'health'] as NeedId[]) add(need, b.kind, k[need]?.[a] ?? 0);
      if (b.kind === 'house' && w.nearWater(b.x, b.z, 3)) add('water', 'riverside', k.housing?.[a] ?? 0);
      H += k.housing?.[a] ?? 0;
      F += k.food?.[a] ?? 0;
      W += k.water?.[a] ?? 0;
      J += k.jobs?.[a] ?? 0;
      Jy += k.joy?.[a] ?? 0;
      He += k.health?.[a] ?? 0;
      if (b.kind === 'house' && w.nearWater(b.x, b.z, 3)) W += k.housing?.[a] ?? 0;
    }
    let fields = 0, fertile = 0, gardens = 0, forests = 0;
    for (let i = 0; i < w.veg.length; i++) {
      const v = w.veg[i];
      if (v === 2) { fields++; if (w.ash[i]) fertile++; } else if (v === 3) gardens++; else if (v === 1) forests++;
    }
    this.land = { fields, fertile, gardens, forests };
    // les champs semés sur les cendres d'une coulée donnent double récolte
    this.baseFood = F;
    this.fieldFood = (fields + fertile) * 3;
    // un emploi pour deux champs (des emplois entiers, comme les autres)
    J += Math.floor(fields / 2);
    Jy += gardens * 0.8 + forests * 0.08;
    this.counts = counts;
    this.housing.cap = H;
    this.food.cap = F;
    this.baseWater = W;
    this.baseJobs = J;
    this.baseJoy = Jy;
    this.water.cap = W;
    this.jobs.cap = J;
    this.joy.cap = Jy;
    this.health.cap = He;
  }

  private evaluate() {
    const p = this.pop, e = this.world.exp;
    // nourriture, eau, emplois et soins se comptent en parts entières, pour les habitants entiers (ceux qu'on affiche) : ce
    // que fournit le village est arrondi en dessous, ce qu'il demande au-dessus. Jauge, manque et nombre d'affamés, de
    // chômeurs ou de malades disent ainsi la même chose (sinon : « 170 / 170, il manque 0.0 » et un habitant qui a faim)
    const n = Math.floor(p);
    // les expéditions ajoutent (ou retirent pour un temps) de quoi satisfaire les besoins
    this.food.cap = down(this.baseFood + this.fieldsFood + needBonus(e, 'food'));
    this.water.cap = down(this.baseWater + needBonus(e, 'water'));
    this.jobs.cap = down(this.baseJobs + needBonus(e, 'jobs'));
    this.joy.cap = Math.max(0, this.baseJoy + needBonus(e, 'joy') + (e.camp >= 7 ? CAMP_JOY : 0));
    this.housing.demand = p;
    this.food.demand = up((n + 1) * rulesOf(this.world.difficulty).foodK);
    this.water.demand = n + 1;
    this.jobs.demand = n >= 6 ? up(n * 0.5) : 0;
    this.joy.demand = p >= 6 ? p * 0.3 : 0;
    // un village de plus de quinze habitants a besoin de soins
    this.health.demand = n >= 15 ? up(n * 0.2) : 0;
    this.housing.ok = this.housing.cap > p;
    this.food.ok = this.food.cap >= this.food.demand;
    this.water.ok = this.water.cap >= this.water.demand;
    this.jobs.ok = this.jobs.cap >= this.jobs.demand;
    this.joy.ok = this.joy.cap >= this.joy.demand;
    this.health.ok = this.health.cap >= this.health.demand;
  }

  /** Le détail d'un besoin pour sa fiche : ce qui le fournit (du plus gros apport au plus petit) et le bâtiment qui le comble */
  needDetail(k: NeedId): NeedDetail {
    const e = this.world.exp, L = this.land;
    const rows = [...this.src[k]].map(([key, s]) => ({ label: key === 'riverside' ? 'Maisons au bord de l’eau' : this.nameOf(key as KindId), n: s.n, v: s.v }));
    if (k === 'food' && L.fields) rows.push({ label: L.fertile ? 'Champs (récolte double sur les cendres)' : 'Champs (selon la pluie)', n: L.fields, v: this.fieldsFood });
    if (k === 'jobs' && L.fields >= 2) rows.push({ label: 'Champs', n: L.fields, v: Math.floor(L.fields / 2) });
    if (k === 'joy' && L.gardens) rows.push({ label: 'Jardins', n: L.gardens, v: L.gardens * 0.8 });
    if (k === 'joy' && L.forests) rows.push({ label: 'Forêts où l’on se promène', n: L.forests, v: L.forests * 0.08 });
    if (k === 'food' || k === 'water' || k === 'jobs' || k === 'joy') { const b = needBonus(e, k); if (b) rows.push({ label: b > 0 ? 'Expéditions (effets en cours)' : 'Expéditions (malus en cours)', n: 0, v: b }); }
    rows.sort((a, b) => b.v - a.v);
    const kind = ({ housing: 'house', food: 'farm', water: 'well', jobs: 'workshop', joy: 'gather', health: 'health' } as Record<NeedId, KindId>)[k];
    const d = KINDS[kind], per = d[k]?.[Math.max(this.age, d.minAge)] ?? 0;
    return { ...this[k], rows, kind, per };
  }

  /** Rendement des champs selon l'humidité des sols : 55 % en pleine sécheresse, 110 % après la pluie */
  get yieldK() { return 0.55 + 0.55 * this.moisture; }

  /** Récolte des champs, en parts entières (selon la pluie ; le blé des collines l'enrichit) */
  private get fieldsFood() { return down(this.fieldFood * this.yieldK * (this.world.exp.perks.includes('seeds') ? 1.3 : 1)); }

  get drought() { return this.moisture < 0.25 && this.fieldFood > 0; }

  get canGrow() {
    return this.housing.ok && this.food.ok && this.water.ok && this.jobs.ok && this.joy.ok && this.health.ok;
  }

  /** Nom du bâtiment tel que le montre la barre de construction à l'âge du village (« Séchoir à grains » pour la ferme préhistorique) */
  nameOf(k: KindId) {
    const d = KINDS[k];
    return d.names[Math.max(this.age, d.minAge)];
  }

  /** Combien le village en a, en comptant ceux qui s'en sont améliorés (une gare devenue gare centrale reste une gare) */
  built(k: KindId) { return lineOf(k).reduce((n, x) => n + (this.counts[x] ?? 0), 0); }

  /** Où le trouver : l'onglet Bâtir et son rayon */
  whereOf(k: KindId) {
    return `Bâtir › ${BUILD_CATS.find((c) => c.id === KINDS[k].cat)!.label}`;
  }

  ageProgress(): AgeProgress | null {
    const n = this.age + 1;
    if (n >= AGES.length) return null;
    const req = AGES[n], w = this.world;
    const items: AgeProgress['items'] = [{ label: 'Habitants', have: Math.floor(this.pop), need: req.reqPop }];
    // en défi, passé la préhistoire, les bâtiments d'avant qui ont servi aux âges passés (changés d'office en leur version du
    // nouvel âge) ne font pas avancer vers le suivant ; ceux bâtis en avance, avant que le jeu ne les demande, comptent déjà
    const fresh = rulesOf(w.difficulty).newOnly && this.age > 0;
    for (const [k, c] of Object.entries(reqKindsOf(n, w.difficulty)) as [KindId, number][]) {
      const line = lineOf(k), sum = (r: Record<string, number>) => line.reduce((n, x) => n + (r[x] ?? 0), 0);
      const used = fresh ? Math.min(sum(w.ageBase), usedBefore(k, n)) : 0;
      const have = Math.max(0, sum(this.counts) - used);
      items.push({ label: fresh ? DIFF_TEXT.more(this.nameOf(k)) : this.nameOf(k), have, need: c, kind: k });
    }
    if (req.reqOre) items.push({ label: 'minerai (monde souterrain)', have: this.world.unlimited ? req.reqOre : Math.floor(this.world.ore), need: req.reqOre });
    // les briques de la briqueterie (en réserve : on peut en dépenser pour bâtir, il faudra alors en recuire)
    if (req.reqBrick) items.push({ label: 'briques (briqueterie)', have: w.unlimited ? req.reqBrick : Math.floor(w.brick), need: req.reqBrick });
    // les expéditions obligatoires de l'âge en cours (deux à la Préhistoire ; une partie déjà plus loin n'en demande plus)
    for (const m of mandatoriesFor(this.age)) items.push({ label: `expédition « ${m.title} »`, have: this.world.exp.done.includes(m.id) ? 1 : 0, need: 1 });
    let sum = 0;
    for (const it of items) sum += Math.min(1, it.have / it.need);
    return { next: n, ratio: sum / items.length, items };
  }

  /**
   * Le conseil du moment. Chaque bâtiment y est nommé comme dans la barre de construction à l'âge du village, avec son
   * rayon (« Séchoir à grains » (Bâtir › Production), pas « une ferme ») ; `messageKind` dit lequel, pour le prendre en main
   */
  private computeMessage() {
    const w = this.world;
    const p = this.pop;
    const say = (k: KindId) => `« ${this.nameOf(k)} » (${this.whereOf(k)})`;
    const about = (k: KindId, text: string) => { this.messageKind = k; return text; };
    // le bâtiment conseillé coûte du bois ou de la pierre que le village n'a pas, et rien n'en produit : on dit d'abord
    // comment en avoir (sinon le joueur attend une ressource qui ne vient jamais)
    const build = (k: KindId, text: string) => {
      const c = priceIn(w, k, this.age);
      for (const [r, prod] of [['stone', 'quarry'], ['wood', 'lumber'], ['brick', 'brickworks']] as const) {
        if (!c || w.unlimited || w[r] >= (c[r] ?? 0) || this.producing(r)) continue;
        const what = { stone: 'de la pierre', wood: 'du bois', brick: 'des briques' }[r], where = { stone: 'près des rochers (Nature › Rochers) ou dans la montagne', wood: 'en lisière ou dans une forêt', brick: 'elle se pose où l’on veut et cuit ses briques toute seule' }[r];
        return about(prod, `Il manque ${what} pour « ${this.nameOf(k)} » : ${say(prod)}, ${where}.`);
      }
      return about(k, text);
    };
    this.messageKind = null;
    // le premier bâtiment est la place du village (feu de camp, agora, marché, parc… selon l'âge) : le cœur où l'on fête les retours
    if (w.buildings.size === 0) return about('gather', `Pour commencer, posez « ${this.nameOf('gather')} » au centre du futur village : c’est la place du village (3 × 3), sans entrée, qu’on rejoint de tous côtés. On y fêtera le retour des expéditions, et elle grandira avec les âges.`);
    if (!this.counts.house) return about('house', `Autour de la place, le centre du village : « ${this.nameOf('house')} », « ${this.nameOf('farm')} » et « ${this.nameOf('well')} ».`);
    if (!this.counts.house) return about('house', `Pour accueillir des habitants : ${say('house')}.`);
    if (!this.food.ok && this.fled >= 1) return about('farm', DIFF_TEXT.famine(say('farm')));
    if (!this.food.ok) return about('farm', this.drought ? `Sécheresse : les champs donnent moins ; ${say('farm')} ou « ${this.nameOf('pier')} » de plus aiderait.` : `Il manque de quoi manger : ${say('farm')} ou un champ.`);
    if (!this.water.ok) return about('well', `Il manque de l’eau : ${say('well')}.`);
    // à la Préhistoire, dans les premières minutes, les premiers bâtiments qui travaillent pour le village : le bûcheron (bois), puis le pierrier (pierre) ; le séchoir à grains nourrit déjà
    const young = this.age === 0 && p < 8;
    if (young && !this.producing('wood')) return about('lumber', `${this.counts.farm ? 'Un bûcheron' : 'Un bûcheron et un séchoir'} : ${this.counts.farm ? 'le premier bâtiment' : 'les premiers bâtiments'} qui travaille${this.counts.farm ? '' : 'nt'} pour vous. ${say('lumber')}${this.counts.farm ? '' : `, puis ${say('farm')}`}.`);
    if (young && !this.producing('stone')) return about('quarry', `Il vous faut aussi de la pierre pour les grands bâtiments : ${say('quarry')}.`);
    if (!this.jobs.ok) return about('workshop', `Les habitants cherchent du travail : ${say('workshop')}.`);
    if (!this.joy.ok) return about('gather', `Les habitants aimeraient un lieu de rencontre : ${say('gather')}, un jardin ou un lieu de culte.`);
    if (!this.health.ok) return about('health', `Les habitants tombent malades : il faut ${say('health')}.`);
    if (this.recovering > 0 && this.housing.ok) return DIFF_TEXT.recovering;
    // le village plein ne grandit plus : il lui faut des places ; c'est une étape, pas un manque
    const full = !this.housing.ok, per = KINDS.house.housing?.[this.age] ?? 0;
    const room = () => build('house', `Village plein (${Math.floor(p)}/${this.housing.cap} places) : ${say('house')} de plus, +${per} places, pour qu’il grandisse.`);
    const ap = this.ageProgress();
    if (ap) {
      if (p < AGES[ap.next].reqPop) return full ? room() : `Le village grandit… (${Math.floor(p)}/${AGES[ap.next].reqPop} habitants pour l’âge suivant)`;
      const miss = ap.items.find((i) => i.have < i.need);
      if (!miss) return `Tout est prêt pour l’âge suivant (${AGES[ap.next].name}) : passez-y quand vous voulez.`;
      if (miss?.label.startsWith('expédition')) {
        // toutes celles qui restent à réussir (la Préhistoire en demande deux)
        const left = ap.items.filter((i) => i.label.startsWith('expédition') && i.have < i.need).map((i) => i.label.slice('expédition '.length));
        return `Pour l’âge suivant : réussissez ${left.length > 1 ? `les expéditions ${left.slice(0, -1).join(', ')} et ${left[left.length - 1]}` : `l’${miss.label}`} (menu Expéditions).`;
      }
      if (miss?.kind) { const n = miss.need - miss.have; return build(miss.kind, `Pour l’âge suivant : il manque ${n > 1 ? `${n} × ` : ''}${say(miss.kind)}.`); }
      if (miss.label.startsWith('briques')) return this.counts.brickworks ? `Pour l’âge suivant : il faut encore ${miss.need - miss.have} briques (la briqueterie en cuit chaque jour).` : about('brickworks', `Pour l’âge suivant : il faut ${miss.need} briques : ${say('brickworks')}.`);
      if (miss) return `Pour l’âge suivant : extrayez encore ${miss.need - miss.have} minerai dans le monde souterrain.`;
    }
    if (full) return room();
    // au dernier âge, la conquête de l'espace : le cosmodrome, puis chaque expédition spatiale à son tour
    if (!ap) {
      if (w.exp.done.includes(VICTORY)) return 'Le village a essaimé dans les étoiles : ses colons vivent sur une autre planète.';
      const next = MISSIONS.find((m) => m.age === this.age && m.requires && !w.exp.done.includes(m.id));
      const need = next?.requires?.kinds?.find((k) => !this.built(k));
      if (need) return build(need, `Pour « ${next!.title} » : il faut ${say(need)}.`);
      if (next) return `Prochaine étape vers les étoiles : l’expédition « ${next.title} » (menu Expéditions).`;
    }
    // la sécheresse ne cache plus ce qu'il reste à bâtir : on n'en parle que quand il n'y a rien d'autre à dire
    if (this.drought) return 'Sécheresse : il n’a pas plu depuis longtemps, les champs donnent moins.';
    return 'Le village est paisible et prospère.';
  }

  /** Un bâtiment du village produit-il cette ressource ? */
  private producing(r: 'wood' | 'stone' | 'brick') {
    for (const b of this.world.buildings.values()) if (YIELD[b.kind]?.[r]?.[b.age]) return true;
    return false;
  }

  update(dt: number, realDt: number) {
    this.recalcTimer -= realDt;
    if (this.world.version !== this.lastVersion && this.recalcTimer <= 0) {
      this.lastVersion = this.world.version;
      this.recalcTimer = 0.25;
      this.recalc();
    }
    if (this.pop > this.housing.cap) this.pop = Math.max(this.housing.cap, 0);
    // horloge des expéditions : les effets passagers s'éteignent
    const e = this.world.exp;
    e.clock += dt;
    if (e.temp.length && e.temp.some((t) => t.until <= e.clock)) e.temp = e.temp.filter((t) => t.until > e.clock);
    // la pluie humidifie les sols ; ils sèchent vite l'été, lentement au printemps et en automne, pas l'hiver
    if (dt > 0) {
      if (this.rain > 0.3) this.moisture = Math.min(1, this.moisture + dt * 0.05 * this.rain);
      else this.moisture = Math.max(0, this.moisture - dt * [0.0015, 0.004, 0.0015, 0][this.season]);
    }
    this.evaluate();
    const r = rulesOf(this.world.difficulty);
    if (dt > 0) this.hardship(dt);
    if (dt > 0 && this.canGrow) {
      this.grow += dt * 0.55 * r.growK * (this.recovering > 0 ? r.recoverK : 1);
      while (this.grow >= 1) {
        this.grow -= 1;
        if (this.pop + 1 <= this.housing.cap) this.pop++;
        this.evaluate();
        if (!this.canGrow) break;
      }
    }
    // le passage d'âge n'est plus forcé : c'est le joueur qui le décide (bouton « Passer à l'ère suivante »)
    this.message = this.computeMessage();
  }

  /**
   * Les rigueurs de la difficulté : en défi, la disette fait partir des habitants (d'autant plus que le manque est grand),
   * et tout besoin non comblé laisse le village affaibli un moment ; en partie normale ou au bac à sable, rien de tout cela
   */
  private hardship(dt: number) {
    const r = rulesOf(this.world.difficulty);
    if (r.famine > 0 && !this.food.ok && this.pop > 0) {
      const lack = 1 - this.food.cap / this.food.demand, gone = Math.min(this.pop, dt * r.famine * lack * this.pop);
      this.pop -= gone;
      this.fled += gone;
      this.evaluate();
    } else if (this.food.ok) this.fled = 0;
    const unmet = !(this.food.ok && this.water.ok && this.jobs.ok && this.joy.ok && this.health.ok);
    this.recovering = r.recoverT > 0 && unmet ? r.recoverT : Math.max(0, this.recovering - dt);
  }

  /** Tout est réuni pour l'âge suivant : le bouton « Passer à l'ère suivante » s'allume */
  get ready() { const ap = this.ageProgress(); return !!ap && ap.items.every((i) => i.have >= i.need); }

  /** Passe à l'âge suivant, si tout est réuni ; true si c'est fait */
  advance() {
    // le compte des bâtiments à jour : c'est lui qu'on retient pour l'âge d'après
    this.recalc(); this.evaluate();
    const ap = this.ageProgress();
    if (!ap || !ap.items.every((i) => i.have >= i.need)) return false;
    this.age = ap.next;
    this.world.ageBase = { ...this.counts };
    this.onAgeUp?.(this.age);
    this.message = this.computeMessage();
    return true;
  }
}
