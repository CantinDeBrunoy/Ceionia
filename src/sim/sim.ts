import { World } from '../world/world';
import { AGES, BUILD_CATS, KINDS, KindId } from '../build/catalog';
import { mandatoryFor, needBonus } from './missions';

export interface Need { cap: number; demand: number; ok: boolean }

export interface AgeProgress {
  next: number;
  ratio: number;
  /** chaque condition ; `kind` : le bâtiment demandé (nommé comme dans la barre de construction) */
  items: { label: string; have: number; need: number; kind?: KindId }[];
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
  private lastVersion = -1;
  private recalcTimer = 0;
  onAgeUp: ((age: number) => void) | null = null;

  constructor(private world: World) {}

  recalc() {
    const w = this.world;
    let H = 0, F = 0, W = 0, J = 0, Jy = 0, He = 0;
    const counts: Record<string, number> = {};
    for (const b of w.buildings.values()) {
      const k = KINDS[b.kind];
      const a = b.age;
      counts[b.kind] = (counts[b.kind] ?? 0) + 1;
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
    // les champs semés sur les cendres d'une coulée donnent double récolte
    this.baseFood = F;
    this.fieldFood = (fields + fertile) * 3;
    J += fields * 0.5;
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
    // les expéditions ajoutent (ou retirent pour un temps) de quoi satisfaire les besoins ; le blé des collines enrichit les champs
    const seeds = e.perks.includes('seeds') ? 1.3 : 1;
    this.food.cap = Math.max(0, this.baseFood + this.fieldFood * this.yieldK * seeds + needBonus(e, 'food'));
    this.water.cap = Math.max(0, this.baseWater + needBonus(e, 'water'));
    this.jobs.cap = Math.max(0, this.baseJobs + needBonus(e, 'jobs'));
    this.joy.cap = Math.max(0, this.baseJoy + needBonus(e, 'joy'));
    this.housing.demand = p;
    this.food.demand = p + 1;
    this.water.demand = p + 1;
    this.jobs.demand = p >= 6 ? p * 0.5 : 0;
    this.joy.demand = p >= 6 ? p * 0.3 : 0;
    // un village de plus de quinze habitants a besoin de soins
    this.health.demand = p >= 15 ? p * 0.2 : 0;
    this.housing.ok = this.housing.cap > p;
    this.food.ok = this.food.cap >= this.food.demand;
    this.water.ok = this.water.cap >= this.water.demand;
    this.jobs.ok = this.jobs.cap >= this.jobs.demand;
    this.joy.ok = this.joy.cap >= this.joy.demand;
    this.health.ok = this.health.cap >= this.health.demand;
  }

  /** Rendement des champs selon l'humidité des sols : 55 % en pleine sécheresse, 110 % après la pluie */
  get yieldK() { return 0.55 + 0.55 * this.moisture; }

  get drought() { return this.moisture < 0.25 && this.fieldFood > 0; }

  get canGrow() {
    return this.housing.ok && this.food.ok && this.water.ok && this.jobs.ok && this.joy.ok && this.health.ok;
  }

  /** Nom du bâtiment tel que le montre la barre de construction à l'âge du village (« Séchoir à grains » pour la ferme préhistorique) */
  nameOf(k: KindId) {
    const d = KINDS[k];
    return d.names[Math.max(this.age, d.minAge)];
  }

  /** Où le trouver : l'onglet Bâtir et son rayon */
  whereOf(k: KindId) {
    return `Bâtir › ${BUILD_CATS.find((c) => c.id === KINDS[k].cat)!.label}`;
  }

  ageProgress(): AgeProgress | null {
    const n = this.age + 1;
    if (n >= AGES.length) return null;
    const req = AGES[n];
    const items: AgeProgress['items'] = [{ label: 'Habitants', have: Math.floor(this.pop), need: req.reqPop }];
    for (const [k, c] of Object.entries(req.reqKinds)) items.push({ label: this.nameOf(k as KindId), have: this.counts[k] ?? 0, need: c as number, kind: k as KindId });
    if (req.reqOre) items.push({ label: 'minerai (monde souterrain)', have: this.world.unlimited ? req.reqOre : Math.floor(this.world.ore), need: req.reqOre });
    // l'expédition obligatoire de l'âge en cours
    const m = mandatoryFor(this.age);
    if (m) items.push({ label: `expédition « ${m.title} »`, have: this.world.exp.done.includes(m.id) ? 1 : 0, need: 1 });
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
    this.messageKind = null;
    if (w.buildings.size === 0) return about('house', `Pour commencer, posez « ${this.nameOf('house')} », « ${this.nameOf('farm')} » et « ${this.nameOf('well')} ».`);
    if (!this.counts.house) return about('house', `Pour accueillir des habitants : ${say('house')}.`);
    if (!this.housing.ok) return about('house', `Il manque des logements : ${say('house')}.`);
    if (!this.food.ok) return about('farm', this.drought ? `Sécheresse : les champs donnent moins ; ${say('farm')} ou « ${this.nameOf('pier')} » de plus aiderait.` : `Il manque de quoi manger : ${say('farm')} ou un champ.`);
    if (!this.water.ok) return about('well', `Il manque de l’eau : ${say('well')}.`);
    if (!this.jobs.ok) return about('workshop', `Les habitants cherchent du travail : ${say('workshop')}.`);
    if (!this.joy.ok) return about('gather', `Les habitants aimeraient un lieu de rencontre : ${say('gather')}, un jardin ou un lieu de culte.`);
    if (!this.health.ok) return about('health', `Les habitants tombent malades : il faut ${say('health')}.`);
    if (this.drought) return 'Sécheresse : il n’a pas plu depuis longtemps, les champs donnent moins.';
    const ap = this.ageProgress();
    if (ap) {
      if (p < AGES[ap.next].reqPop) return `Le village grandit… (${Math.floor(p)}/${AGES[ap.next].reqPop} habitants pour l’âge suivant)`;
      const miss = ap.items.find((i) => i.have < i.need);
      if (miss?.label.startsWith('expédition')) return `Pour l’âge suivant : réussissez l’${miss.label} (menu Expéditions).`;
      if (miss?.kind) { const n = miss.need - miss.have; return about(miss.kind, `Pour l’âge suivant : il manque ${n > 1 ? `${n} × ` : ''}${say(miss.kind)}.`); }
      if (miss) return `Pour l’âge suivant : extrayez encore ${miss.need - miss.have} minerai dans le monde souterrain.`;
    }
    return 'Le village est paisible et prospère.';
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
    if (dt > 0 && this.canGrow) {
      this.grow += dt * 0.55;
      while (this.grow >= 1) {
        this.grow -= 1;
        if (this.pop + 1 <= this.housing.cap) this.pop++;
        this.evaluate();
        if (!this.canGrow) break;
      }
    }
    // passage d'âge
    const ap = this.ageProgress();
    if (ap && ap.items.every((i) => i.have >= i.need)) {
      this.age = ap.next;
      this.onAgeUp?.(this.age);
    }
    this.message = this.computeMessage();
  }
}
