import { World, N, VEG_FOREST, VEG_CAVE, VEG_FIELD, VEG_GARDEN } from '../world/world';
import { Agents } from './agents';
import { MISSIONS, Mission, Choice, DestKind, Effect, applyEffects, effectSummary } from './missions';
import { AGES, KINDS } from '../build/catalog';
import { GEAR_BY, Gear, GearId, Pack, loadout, packLabel } from './gear';
import { ExpEvent, pickEvent } from './events';

/** Étapes d'une expédition : rassemblement au village, aller, travail sur place, retour, fête (ou mine déconfite) au village */
export type Phase = 'gather' | 'out' | 'work' | 'back' | 'home';

export interface ActiveExpedition {
  /** numéro de l'expédition (pour la suivre à la caméra) */
  id: number;
  m: Mission;
  c: Choice;
  phase: Phase;
  /** temps écoulé dans l'étape (secondes de jeu) */
  t: number;
  /** identifiants des membres de l'équipe */
  party: number[];
  /** point de rassemblement au village et destination */
  base: [number, number];
  dest: [number, number];
  /** succès, tiré à la fin du travail sur place */
  ok: boolean;
  /** équipement emporté (rendu au retour) */
  gear: Pack;
  /** le risque du choix est multiplié par l'équipement, puis par chaque décision prise sur place */
  riskK: number;
  /** imprévu en attente de décision : l'équipe patiente sur place (depuis waitT secondes) */
  wait: ExpEvent | null;
  waitT: number;
  /** imprévus prévus (deux pour un long travail), déjà survenus, et ce qu'en dira le récit */
  events: number;
  seen: string[];
  notes: string[];
  /** temps de travail en plus, gains en plus (si réussite), blessés en plus */
  extra: number;
  bonus: Effect[];
  hurt: number;
}

export interface Report { m: Mission; c: Choice; ok: boolean; text: string; summary: string; notes: string[] }

const DEST_NAME: Record<DestKind, string> = { plain: 'la plaine', forest: 'la forêt', river: 'la rivière', mountain: 'la montagne', cave: 'la grotte', far: 'au-delà des collines' };
/** Repli quand le village n'a pas de tel endroit à portée */
const FALLBACK: Record<DestKind, DestKind | null> = { cave: 'mountain', mountain: 'far', river: 'plain', forest: 'plain', far: 'plain', plain: null };
/** Une équipe de plus tous les 30 habitants, quatre au plus */
const PER_TEAM = 30, MAX_TEAMS = 4;
/** Sans réponse du joueur, l'équipe tranche d'elle-même au bout de ce temps (secondes de jeu) */
const AUTO_DECIDE = 90;
/** Pièces en attente de fabrication, au plus */
const MAX_CRAFT = 6;

/** Nombre d'expéditions que le village peut mener de front, selon sa population */
export const partyLimit = (pop: number) => Math.min(MAX_TEAMS, 1 + Math.floor(pop / PER_TEAM));

/**
 * Expéditions : chaque équipe enrôlée se rassemble au cœur du village, part en file vers sa destination, y travaille, revient ;
 * l'issue (tirée selon le risque du choix) s'applique au retour et fait l'objet d'un récit. Plus le village est peuplé,
 * plus il peut envoyer d'équipes à la fois ; une école les rend plus sûres, un lieu de soins guérit plus vite les blessés.
 * L'équipe emporte l'équipement du village contre les dangers du voyage, et sur place un imprévu demande une décision
 */
export class Expeditions {
  active: ActiveExpedition[] = [];
  onReport: ((r: Report) => void) | null = null;
  onNews: ((msg: string) => void) | null = null;
  /** une équipe attend une décision */
  onEvent: ((a: ActiveExpedition) => void) | null = null;
  /** population du village, donnée par le jeu */
  pop: () => number = () => 0;
  private nextId = 1;
  constructor(private world: World, private agents: Agents, private dayLen: () => number, private rnd: () => number = Math.random) {}

  /** état sauvegardé des expéditions (réserve d'équipement, fabrication…) et minerai du village */
  get state() { return this.world.exp; }
  get ore() { return this.world.ore; }
  done(m: Mission) { return this.world.exp.done.includes(m.id); }
  running(m: Mission) { return this.active.some((a) => a.m.id === m.id); }
  /** équipes que le village peut envoyer à la fois */
  slots() { return partyLimit(this.pop()); }
  private has(kind: string) { for (const b of this.world.buildings.values()) if (b.kind === kind) return true; return false; }

  /** Risque réel d'un choix : une école prépare mieux les équipes */
  riskOf(c: Choice) { return c.risk * (this.has('school') ? 0.7 : 1); }

  /** Ce qu'une équipe partant maintenant emporterait, et son risque avec cet équipement */
  preview(c: Choice) {
    const l = loadout(c, this.world.exp.gear);
    return { take: l.take, label: packLabel(l.take), risk: this.riskOf(c) * l.k };
  }

  /** Risque d'une équipe en route : celui du choix, équipement et décisions compris */
  chance(a: ActiveExpedition) { return Math.min(0.95, Math.max(0.02, this.riskOf(a.c) * a.riskK)); }

  /** Missions proposées : celles de l'âge, puis les facultatives des âges passés pas encore réussies */
  list(age: number) { return MISSIONS.filter((m) => m.age === age || (m.age < age && !this.done(m))); }

  /** Pourquoi l'on ne peut pas partir (ou null) */
  why(m: Mission, c: Choice): string | null {
    if (this.done(m)) return 'Mission déjà réussie.';
    if (this.running(m)) return 'Cette expédition est déjà en route.';
    const max = this.slots();
    if (this.active.length >= max) {
      return max < MAX_TEAMS
        ? `Toutes les équipes sont en route (${this.active.length}/${max}) : à ${max * PER_TEAM} habitants, le village pourra en envoyer une de plus.`
        : `Toutes les équipes sont en route (${max}/${max}).`;
    }
    if (!this.base()) return 'Il faut d’abord un village : une maison au moins.';
    const free = this.agents.available();
    if (free < c.party) return `Il faut ${c.party} habitants disponibles (${free} pour l’instant).`;
    return null;
  }

  start(m: Mission, ci: number): ActiveExpedition | null {
    const c = m.choices[ci];
    if (!c || this.why(m, c)) return null;
    const base = this.base()!;
    let kind: DestKind | null = c.dest, dest: [number, number] | null = null;
    while (kind && !dest) { dest = this.findDest(kind, base); kind = dest ? kind : FALLBACK[kind]; }
    if (!dest) return null;
    const party = this.agents.recruit(c.party);
    if (!party) return null;
    // l'équipe emporte le meilleur équipement en réserve contre les dangers du voyage
    const { take, k } = loadout(c, this.world.exp.gear);
    for (const [g, n] of Object.entries(take) as [GearId, number][]) this.world.exp.gear[g] -= n;
    const a: ActiveExpedition = {
      id: this.nextId++, m, c, phase: 'gather', t: 0, party, base, dest, ok: false, gear: take, riskK: k,
      wait: null, waitT: 0, events: c.work >= 20 && this.rnd() < 0.5 ? 2 : 1, seen: [], notes: [], extra: 0, bonus: [], hurt: 0,
    };
    this.active.push(a);
    this.agents.partyGo(party, base[0], base[1], 0.15);
    return a;
  }

  update(dt: number) {
    const ag = this.agents;
    this.craftStep(dt);
    for (const a of [...this.active]) {
      // une décision attendue : l'équipe patiente, puis tranche d'elle-même
      if (a.wait) {
        a.waitT += dt;
        if (a.waitT >= AUTO_DECIDE) this.decide(a, this.safest(a));
        continue;
      }
      a.t += dt;
      if (a.phase === 'gather' && (ag.partyDone(a.party) || a.t > 40)) {
        a.phase = 'out'; a.t = 0;
        ag.partyGo(a.party, a.dest[0], a.dest[1]);
        this.onNews?.(`${a.m.icon} L’expédition « ${a.m.title} » prend la route de ${DEST_NAME[a.c.dest]}.`);
      } else if (a.phase === 'out' && (ag.partyDone(a.party) || a.t > 240)) {
        a.phase = 'work'; a.t = 0;
        ag.partyAct(a.party, 'work');
        this.raise(a);
      } else if (a.phase === 'work' && a.seen.length < a.events && a.t >= (a.c.work + a.extra) * 0.55) {
        this.raise(a);
      } else if (a.phase === 'work' && a.t >= a.c.work + a.extra) {
        a.ok = this.rnd() >= this.chance(a);
        a.phase = 'back'; a.t = 0;
        ag.partyGo(a.party, a.base[0], a.base[1]);
        this.onNews?.(a.ok ? `${a.m.icon} « ${a.m.title} » : l’équipe rentre… et elle n’a pas l’air bredouille !` : `${a.m.icon} « ${a.m.title} » : l’équipe rentre, la mine basse.`);
      } else if (a.phase === 'back' && (ag.partyDone(a.party) || a.t > 240)) {
        a.phase = 'home'; a.t = 0;
        ag.partyAct(a.party, a.ok ? 'cheer' : 'stroll');
      } else if (a.phase === 'home' && a.t > 4) this.finish(a);
    }
  }

  /** Un imprévu survient : l'équipe s'arrête et attend la décision du joueur */
  private raise(a: ActiveExpedition) {
    const ev = pickEvent(a.c.dest, a.m.id, a.seen, this.rnd);
    if (!ev) { a.events = a.seen.length; return; }
    a.seen.push(ev.id);
    a.wait = ev; a.waitT = 0;
    this.agents.partyAct(a.party, 'stroll');
    this.onEvent?.(a);
  }

  /** L'équipe a-t-elle emporté de quoi suivre cette option ? */
  canTake(a: ActiveExpedition, i: number) {
    const o = a.wait?.options[i];
    return !!o && (!o.needs || o.needs.some((g) => (a.gear[g] ?? 0) > 0));
  }

  /** Option que l'équipe choisit seule : la plus sûre de celles qu'elle peut suivre */
  private safest(a: ActiveExpedition) {
    const opts = a.wait!.options;
    let best = -1;
    opts.forEach((o, i) => { if (this.canTake(a, i) && (best < 0 || o.risk < opts[best].risk)) best = i; });
    return Math.max(0, best);
  }

  /** Décision du joueur (ou de l'équipe) sur l'imprévu en cours */
  decide(a: ActiveExpedition, i: number) {
    const o = a.wait?.options[i];
    if (!o || !this.canTake(a, i)) return false;
    a.riskK *= o.risk;
    a.extra += o.work ?? 0;
    if (o.bonus) a.bonus.push(...o.bonus);
    a.hurt += o.hurt ?? 0;
    a.notes.push(o.text);
    a.wait = null;
    if (a.phase === 'work') this.agents.partyAct(a.party, 'work');
    return true;
  }

  private finish(a: ActiveExpedition) {
    const eff = a.ok ? [...a.c.win, ...a.bonus] : a.c.lose;
    const res = applyEffects(this.world, eff, this.dayLen());
    if (a.ok && !this.done(a.m)) this.world.exp.done.push(a.m.id);
    // l'équipement revient en réserve ; un échec en coûte parfois une pièce
    const gear = this.world.exp.gear, carried = (Object.keys(a.gear) as GearId[]).filter((g) => (a.gear[g] ?? 0) > 0);
    let lost = '';
    for (const g of carried) gear[g] += a.gear[g]!;
    if (!a.ok && carried.length && this.rnd() < 0.5) {
      const g = carried[Math.floor(this.rnd() * carried.length)];
      gear[g]--;
      lost = `${GEAR_BY[g].name.toLowerCase()} perdue en route`;
    }
    // les blessés guérissent deux fois plus vite avec un lieu de soins, et encore deux fois plus vite avec une trousse
    const injured = Math.min(a.party.length, res.injured + a.hurt), days = Math.max(res.days, a.hurt ? 1 : 0);
    this.agents.dismiss(a.party, injured, days * this.dayLen() * (this.has('health') ? 0.5 : 1) * (a.gear.kit ? 0.5 : 1));
    this.active.splice(this.active.indexOf(a), 1);
    this.world.version++;
    const summary = [effectSummary(eff), lost].filter((x) => x && x !== 'rien').join(' · ') || 'rien';
    this.onReport?.({ m: a.m, c: a.c, ok: a.ok, text: a.ok ? a.c.winText : a.c.loseText, summary, notes: a.notes });
  }

  // ---------------- Fabrication de l'équipement ----------------
  /** Pourquoi le village ne peut pas fabriquer cette pièce (ou null) */
  whyCraft(g: Gear, age: number): string | null {
    if (age < g.age) return `Connu à l’âge ${AGES[g.age].name}`;
    if (g.needs && !this.has(g.needs)) return `Il faut : ${KINDS[g.needs].names[Math.min(age, 4)].toLowerCase()}`;
    if (this.world.ore < g.ore) return `Il faut ${g.ore} minerai`;
    if (this.world.exp.craft.length >= MAX_CRAFT) return 'L’atelier a déjà assez de travail';
    return null;
  }

  /** Met une pièce en fabrication (le minerai est pris tout de suite) */
  craft(id: GearId, age: number) {
    const g = GEAR_BY[id];
    if (this.whyCraft(g, age)) return false;
    this.world.ore -= g.ore;
    this.world.exp.craft.push(id);
    return true;
  }

  /** Annule une pièce de la file (le minerai est rendu) */
  cancelCraft(i: number) {
    const s = this.world.exp, id = s.craft[i];
    if (!id) return;
    s.craft.splice(i, 1);
    if (i === 0) s.craftT = 0;
    this.world.ore += GEAR_BY[id].ore;
  }

  /** Avancement de la pièce en cours (0 … 1) */
  craftProgress() { const s = this.world.exp; return s.craft.length ? Math.min(1, s.craftT / GEAR_BY[s.craft[0]].time) : 0; }

  /** Le village fabrique une pièce après l'autre, plus vite avec un atelier */
  private craftStep(dt: number) {
    const s = this.world.exp;
    if (!s.craft.length) return;
    const g = GEAR_BY[s.craft[0]];
    s.craftT += dt * (this.has('workshop') ? 1.5 : 1);
    if (s.craftT < g.time) return;
    s.craftT = 0;
    s.craft.shift();
    s.gear[g.id]++;
    if (!s.craft.length) this.onNews?.('L’équipement commandé est prêt pour les prochaines expéditions.');
  }

  /** Avancement d'une expédition (0 … 1) */
  progress(a: ActiveExpedition) {
    const k = Math.min(1, a.t / (a.phase === 'work' ? Math.max(1, a.c.work + a.extra) : a.phase === 'home' ? 4 : 60));
    return { gather: 0.05 * k, out: 0.05 + 0.3 * k, work: 0.35 + 0.3 * k, back: 0.65 + 0.3 * k, home: 0.95 + 0.05 * k }[a.phase];
  }

  /** Ce que fait l'équipe */
  status(a: ActiveExpedition) {
    return {
      gather: 'Rassemblement au village…',
      out: `En route vers ${DEST_NAME[a.c.dest]}…`,
      work: a.wait ? `Décision à prendre : ${a.wait.title.toLowerCase()}` : `Sur place : ${a.c.label.toLowerCase()}…`,
      back: 'Retour au village…',
      home: a.ok ? 'De retour : le village fait la fête !' : 'De retour, bredouilles.',
    }[a.phase];
  }

  /** Cœur du village : le feu de camp ou la place, sinon le milieu des maisons, sur une case libre */
  base(): [number, number] | null {
    const w = this.world, bs = [...w.buildings.values()];
    const g = bs.find((b) => b.kind === 'gather');
    const houses = bs.filter((b) => b.kind === 'house');
    if (!g && !houses.length) return null;
    let x = g ? g.x + 0.5 : houses.reduce((s, b) => s + b.x + 0.5, 0) / houses.length;
    let z = g ? g.z + 1.5 : houses.reduce((s, b) => s + b.z + 0.5, 0) / houses.length;
    for (let r = 0; r < 5; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const cx = Math.floor(x) + dx, cz = Math.floor(z) + dz;
          if (!w.inCells(cx, cz)) continue;
          const k = w.ci(cx, cz);
          if (!w.occ[k] && !w.lake[k] && w.cellAvg(cx, cz) > 0.1) { x = cx + 0.5; z = cz + 0.5; return [x, z]; }
        }
    return [x, z];
  }

  /** Destination du genre voulu, à bonne distance du village et atteignable à pied */
  private findDest(kind: DestKind, base: [number, number]): [number, number] | null {
    const w = this.world, [bx, bz] = base, cand: [number, number, number][] = [];
    const ideal = { plain: 18, forest: 15, river: 15, mountain: 22, cave: 18, far: 32 }[kind];
    for (let z = 2; z < N - 2; z += 2)
      for (let x = 2; x < N - 2; x += 2) {
        const k = w.ci(x, z), h = w.cellAvg(x, z), slope = w.cellSlope(x, z), d = Math.hypot(x + 0.5 - bx, z + 0.5 - bz);
        if (w.occ[k] || w.lake[k] || w.decor[k] || h < 0.15) continue;
        let ok = false;
        if (kind === 'forest') ok = w.veg[k] === VEG_FOREST && d > 8;
        else if (kind === 'plain') ok = w.veg[k] === 0 && !w.road[k] && slope < 0.5 && h < 3 && d > 10;
        else if (kind === 'river') ok = w.nearWater(x, z, 1) && d > 7;
        else if (kind === 'mountain') ok = h > 2.6 && h < 5.2 && slope < 1.2 && d > 9;
        else if (kind === 'cave') ok = d > 6 && [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dz]) => w.inCells(x + dx, z + dz) && w.veg[w.ci(x + dx, z + dz)] === VEG_CAVE);
        else ok = slope < 0.8 && d > 24 && !w.road[k] && w.veg[k] !== VEG_FIELD && w.veg[k] !== VEG_GARDEN;
        if (ok) cand.push([x + 0.5, z + 0.5, Math.abs(d - ideal) + this.rnd() * 5]);
      }
    cand.sort((a, b) => a[2] - b[2]);
    // deux équipes ne vont pas camper au même endroit
    const free = cand.filter(([x, z]) => !this.active.some((a) => Math.hypot(a.dest[0] - x, a.dest[1] - z) < 3));
    const from = w.ci(Math.floor(bx), Math.floor(bz));
    for (const [x, z] of (free.length ? free : cand).slice(0, 8)) if (this.agents.findPath(from, w.ci(Math.floor(x), Math.floor(z)))) return [x, z];
    return null;
  }
}
