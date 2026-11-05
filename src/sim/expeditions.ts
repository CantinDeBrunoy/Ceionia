import { World, N, VEG_FOREST, VEG_CAVE, VEG_FIELD, VEG_GARDEN, BIOME_DESERT, BIOME_TROPICAL, BIOME_MARSH } from '../world/world';
import { Agents, Kit } from './agents';
import { MISSIONS, Mission, Choice, DestKind, Effect, applyEffects, effectSummary, penHerds, redoEffects, choiceAt, RECENT_EVENTS } from './missions';
import { Underground, ORE_KINDS, oreVeins, troopRoute, FIGHT_HALT, UZ_STONE, UZ_CRYSTAL, UZ_ICE, UZ_LUSH, UZ_MAGMA } from '../world/underground';
import { AGES, KINDS, KindId, Building, sizeOf } from '../build/catalog';
import { GEAR_BY, Gear, GearId, Pack, loadout, packLabel, gearShort, payGear } from './gear';
import { ExpEvent, pickEvent, waitTime } from './events';
import { CAMP_QUESTS, CAMP_GUARDS, CampQuest, depthStats } from './depths';
import { YIELD, Resource, REFINE_CRUDE, FUEL_PER_CRUDE } from './economy';
import { rulesOf } from './difficulty';
import { hash2 } from '../core/rng';

/**
 * Étapes d'une expédition : aller, travail sur place, retour, fête (ou mine déconfite) au village ; « gather » (le rassemblement
 * au village d'avant le départ) ne sert plus qu'aux équipes des anciennes sauvegardes
 */
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
  /** cœur du village (où l'équipe revient) et destination */
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
  /** secondes restantes d'une attente choisie (« Attendre… ») : le travail est suspendu, l'équipe reste à l'arrêt */
  hold: number;
  /** imprévus prévus (deux pour un long travail), déjà survenus, l'option choisie pour chacun (-1 : pas encore), et ce qu'en dira le récit */
  events: number;
  seen: string[];
  picks: number[];
  notes: string[];
  /** le genre de lieu où l'équipe s'est vraiment rendue (une rivière introuvable : la plaine) */
  site: DestKind;
  /** elle a pris la mer pour de bon (une côte ouverte sur le large, pas une simple rivière) : requins, baleines… */
  sea: boolean;
  /** l'âge du village au départ (une mission d'autrefois refaite à l'époque moderne n'y croise plus de loups) */
  age: number;
  /** temps de travail en plus, gains en plus (si réussite), blessés en plus */
  extra: number;
  bonus: Effect[];
  hurt: number;
  /** expédition armée : filons visés sous terre (dans l'ordre où la troupe les abat) et case de galerie où elle descend */
  targets: number[];
  entry: number;
  /** galeries qu'elle prendra si elle l'emporte, et le point le plus avancé où elle plante ses lanternes (-1 : aucun) */
  take: number[];
  front: number;
  /** troupe armée partie du camp souterrain : ni marche depuis le village, ni retour à pied */
  fromCamp: boolean;
  /** embuscades sur son chemin, longueur de son parcours (haltes comprises) et sa force au combat */
  ambush: Ambush[];
  routeLen: number;
  might: number;
  /** chevaux de l'écurie partis avec l'équipe */
  mounts: number;
  /** la mission avait déjà été réussie : on la refait (bêtes, minerai, vivres ; bonus durables seulement passagers) */
  redo: boolean;
}

/** Créatures qui tendent des embuscades aux troupes armées */
export type FoeKind = 'zombie' | 'skeleton' | 'spider' | 'golem' | 'worm';
/**
 * Embuscade dans les galeries sauvages : la case où elle surgit, les créatures et leur nombre, le moment (temps de parcours
 * de la troupe) ; l'issue est tirée quand elle survient, ses blessés comptés à la fin du combat
 */
export interface Ambush { cell: number; kind: FoeKind; n: number; t0: number; state: 'wait' | 'fight' | 'done'; result: 'clean' | 'hurt' | 'rout' | null }

/** Attaque du camp souterrain : les créatures, leur nombre, la case du camp, le temps écoulé et l'issue (tirée au début) */
export interface Raid { id: number; kind: FoeKind; n: number; cell: number; t: number; result: 'clean' | 'hurt' }
/** Durée d'une attaque du camp, et temps entre deux attaques (au hasard entre ces bornes, secondes de jeu) */
export const RAID_TIME = 26;
const RAID_EVERY: [number, number] = [420, 900];

export interface Report { m: Mission; c: Choice; ok: boolean; text: string; summary: string; notes: string[]; /** mission déjà réussie, refaite */ redo: boolean }

const DEST_NAME: Record<DestKind, string> = { plain: 'la plaine', forest: 'la forêt', river: 'la rivière', mountain: 'la montagne', cave: 'la grotte', far: 'les terres au-delà des collines', spaceport: 'le cosmodrome' };
/** Où va l'équipe, en deux mots (la mer pour une expédition qui prend le large) */
const destName = (c: Choice) => (c.sea ? 'la mer' : DEST_NAME[c.dest]);
/**
 * Repli quand le village n'a pas de tel endroit à portée ; une grotte introuvable se cherche dans la montagne, puis au pied
 * de la moindre paroi (l'équipe y trouve une entrée), jamais dans la plaine ou le désert lointain
 */
const FALLBACK: Record<DestKind, DestKind | null> = { cave: 'mountain', mountain: 'far', river: 'plain', forest: 'plain', far: 'plain', plain: null, spaceport: null };
/** Une équipe de plus tous les 30 habitants, quatre au plus */
const PER_TEAM = 30, MAX_TEAMS = 4;
/** Sans réponse du joueur, l'équipe tranche d'elle-même au bout de ce temps (secondes de jeu) */
const AUTO_DECIDE = 90;
/** Une équipe encore en chemin au bout de ce temps (secondes de jeu) se met au travail là où elle est : elle est bloquée */
const OUT_MAX = 480;
/** Pièces en attente de fabrication, au plus */
const MAX_CRAFT = 6;

/** Nombre d'expéditions que le village peut mener de front, selon sa population */
export const partyLimit = (pop: number) => Math.min(MAX_TEAMS, 1 + Math.floor(pop / PER_TEAM));

/**
 * Expéditions : chaque équipe enrôlée part aussitôt en file vers sa destination, y travaille, revient au cœur du village ;
 * l'issue (tirée selon le risque du choix) s'applique au retour et fait l'objet d'un récit. Plus le village est peuplé,
 * plus il peut envoyer d'équipes à la fois ; une école les rend plus sûres, un lieu de soins guérit plus vite les blessés.
 * L'équipe emporte l'équipement du village contre les dangers du voyage, et sur place un imprévu demande une décision
 */
/** Galeries que la garnison d'un avant-poste tient autour de son entrée (en pas) */
const HOLD = 6;
/** Qui attaque, selon la zone : morts-vivants dans la roche et la glace, squelettes du cristal et du magma, araignées des grottes luxuriantes */
const FOES: Record<number, FoeKind[]> = {
  [UZ_STONE]: ['zombie', 'zombie', 'skeleton'], [UZ_CRYSTAL]: ['skeleton', 'spider'], [UZ_ICE]: ['skeleton', 'zombie'],
  [UZ_LUSH]: ['spider'], [UZ_MAGMA]: ['skeleton', 'zombie'],
};
/**
 * Aux âges avancés, les profondeurs se peuplent de pires créatures : gardiens de pierre dès l'âge médiéval (roche, cristal,
 * magma), vers des profondeurs dès l'âge industriel (roche, magma, grotte luxuriante, glace)
 */
const LATE_FOES: [FoeKind, number, number[]][] = [['golem', 2, [UZ_STONE, UZ_CRYSTAL, UZ_MAGMA]], ['worm', 3, [UZ_STONE, UZ_MAGMA, UZ_LUSH, UZ_ICE]]];
const FOE_MIGHT: Record<FoeKind, number> = { zombie: 0.8, skeleton: 1, spider: 1.15, golem: 1.6, worm: 1.8 };
export const FOE_NAME: Record<FoeKind, string> = { zombie: 'zombies', skeleton: 'squelettes', spider: 'araignées géantes', golem: 'gardiens de pierre', worm: 'vers des profondeurs' };
/** Créatures d'une embuscade dans cette zone, à l'âge donné */
export function foesOf(zone: number, age: number): FoeKind[] {
  const base = FOES[zone] ?? FOES[UZ_STONE];
  return [...base, ...LATE_FOES.filter(([, from, zones]) => age >= from && zones.includes(zone)).map(([k]) => k)];
}
/** Nombres en toutes lettres, pour le récit (« Quatre filons abattus ») */
const NUMBER = ['Aucun', 'Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept', 'Huit', 'Neuf', 'Dix', 'Onze', 'Douze'];
/** « de fer », « d’or », « d’émeraude » */
const ofOre = (name: string) => (/^[aeiouyéèêh]/i.test(name) ? `d’${name}` : `de ${name}`);
/** Temps que les mineurs du camp mettent à percer une case de roche (secondes de jeu), et cases qu'ils gardent en file, au plus */
export const DIG_TIME = 4, MAX_DIGS = 30;
/** Pas des mineurs qui se rendent au front du tunnel (cases par seconde de jeu ; ils pressent le pas), et leur marche au plus (secondes) */
export const DIG_WALK = 2.4, DIG_WALK_MAX = 25;
/** Un tunnel se prévoit d'un clic jusqu'à cette longueur (cases de roche), le tunnel conseillé aussi */
const DIG_REACH = MAX_DIGS;
/** Les quatre cases voisines (les cases de galerie et de roche creusable sont loin du bord de la carte) */
const around = (k: number) => [k + 1, k - 1, k + N, k - N];

/**
 * Campagne d'une troupe armée : l'avant-poste d'où elle part et l'entrée qu'il garde, la case de galerie où elle descend,
 * les filons qu'elle abat (dans l'ordre de sa marche), les galeries qu'elle prend et son point le plus avancé
 */
export interface Campaign { post: Building; entrance: number; entry: number; targets: number[]; take: number[]; front: number }

export class Expeditions {
  active: ActiveExpedition[] = [];
  onReport: ((r: Report) => void) | null = null;
  /** une nouvelle à annoncer ; `depths` : un clic dessus ouvre l'onglet Profondeurs */
  onNews: ((msg: string, depths?: boolean) => void) | null = null;
  /** une équipe attend une décision */
  onEvent: ((a: ActiveExpedition) => void) | null = null;
  /** une quête du camp souterrain est accomplie : le camp grandit */
  onCamp: ((q: CampQuest) => void) | null = null;
  /** population du village, donnée par le jeu */
  pop: () => number = () => 0;
  private nextId = 1;
  /** le monde souterrain, où descendent les troupes armées (donné par le jeu) */
  under: Underground | null = null;
  constructor(private world: World, private agents: Agents, private dayLen: () => number, private rnd: () => number = Math.random) {}

  /** cases où ne pas poser une scène d'expédition (les voies ferrées et leurs abords) */
  avoidCells: (() => Set<number>) | null = null;

  /** état sauvegardé des expéditions (réserve d'équipement, fabrication…) et minerai du village */
  get state() { return this.world.exp; }
  get ore() { return this.world.ore; }
  done(m: Mission) { return this.world.exp.done.includes(m.id); }
  running(m: Mission) { return this.active.some((a) => a.m.id === m.id); }
  /** équipes que le village peut envoyer à la fois */
  slots() { return partyLimit(this.pop()); }
  has(kind: string) { for (const b of this.world.buildings.values()) if (b.kind === kind) return true; return false; }

  /**
   * Risque réel d'un choix : une école prépare mieux les équipes, un observatoire leur lit le ciel, un institut de recherche
   * les équipe, le plan des galeries (le repérage des profondeurs) guide les troupes armées ; le défi est plus risqué
   */
  riskOf(c: Choice) {
    const map = this.world.exp.perks.includes('map') && c.win.some((e) => e.t === 'veins');
    return c.risk * (this.has('school') ? 0.7 : 1) * (this.has('observatory') ? 0.85 : 1) * (this.has('research') ? 0.8 : 1) * (map ? 0.8 : 1) * rulesOf(this.world.difficulty).riskK;
  }

  /**
   * Chevaux qui partiraient avec l'équipe : ceux qu'exige la cavalerie ; une troupe armée à pied n'en prend aucun (ils restent
   * à l'écurie) ; les autres équipes, un par membre tant que l'écurie en a
   */
  mountsFor(c: Choice) { return c.mounts ?? (c.troop ? 0 : Math.min(c.party, this.horsesHome())); }

  /** âge du village, donné par le jeu (sinon celui de ses bâtiments, qui passent d'âge avec lui) */
  age: () => number = () => { let a = 0; for (const b of this.world.buildings.values()) a = Math.max(a, b.age); return a; };
  /** Nom d'un bâtiment tel qu'on le bâtit à l'âge du village (« haras » plutôt qu'« écurie » à l'âge industriel), en minuscules */
  private nameOf(k: KindId) { const d = KINDS[k]; return (d.names[Math.max(this.age(), d.minAge)] || d.names.find((n) => n)!).toLowerCase(); }
  /** « à l'écurie », « au haras », « au centre équestre » */
  private at(k: KindId) { const n = this.nameOf(k); return /^[aeiouyéèê]/.test(n) ? `à l’${n}` : `au ${n}`; }

  /** Ce qu'une équipe partant maintenant emporterait (équipement, chevaux, carburant), et son risque avec cet équipement */
  preview(c: Choice) {
    const l = loadout(c, this.world.exp.gear), n = this.mountsFor(c);
    return { take: l.take, label: [packLabel(l.take), n ? `${n} cheva${n > 1 ? 'ux' : 'l'}` : '', c.fuel ? `${c.fuel} carburant` : ''].filter(Boolean).join(' · '), risk: this.riskOf(c) * l.k };
  }

  /** Risque d'une équipe en route : celui du choix, équipement et décisions compris */
  chance(a: ActiveExpedition) { return this.riskOf(a.c) > 0 ? Math.min(0.95, Math.max(0.02, this.riskOf(a.c) * a.riskK)) : 0; }

  /** Le travail sur place est fini tout de suite (le grand voyage des colons a été vu, ou passé) */
  landNow(a: ActiveExpedition) { if (a.phase === 'work') a.t = Math.max(a.t, a.c.work + a.extra); }

  /** Missions proposées : celles de l'âge et des âges passés ; celles déjà réussies peuvent se refaire */
  list(age: number) { return MISSIONS.filter((m) => m.age <= age); }

  /** Ce qui manque avant de pouvoir tenter la mission : missions à réussir, bâtiments à bâtir (vide : rien) */
  missing(m: Mission): string[] {
    const out: string[] = [];
    for (const id of m.requires?.missions ?? []) if (!this.world.exp.done.includes(id)) out.push(`réussir « ${MISSIONS.find((x) => x.id === id)?.title ?? id} »`);
    for (const k of m.requires?.kinds ?? []) if (!this.has(k)) out.push(`bâtir : ${this.nameOf(k)}`);
    return out;
  }

  /** Chevaux à l'écurie, prêts à partir */
  horsesHome() { let n = 0; for (const h of penHerds(this.world).stables.values()) n += h.length; return n; }

  /** Avant-postes bâtis, chacun avec l'entrée (grotte ou faille) qu'il garde et la case de galerie sous celle-ci */
  outposts(): { b: Building; entrance: number; entry: number }[] {
    const u = this.under, out: { b: Building; entrance: number; entry: number }[] = [];
    if (!u) return out;
    u.sync();
    for (const b of this.world.buildings.values()) {
      if (b.kind !== 'outpost') continue;
      const cell = this.world.outpostEntrance(b.x, b.z, KINDS.outpost.size), ent = u.entrances.find((e) => e.cell === cell);
      const entry = ent ? u.under(ent) : -1;
      if (entry >= 0) out.push({ b, entrance: cell, entry });
    }
    return out;
  }

  /** La garnison de chaque nouvel avant-poste tient aussitôt les galeries autour de son entrée */
  private holdT = 0;
  private holdKey = '';
  private holdStep(dt: number) {
    if ((this.holdT -= dt) > 0 || !this.under) return;
    this.holdT = 1;
    let key = '';
    for (const b of this.world.buildings.values()) if (b.kind === 'outpost') key += `${b.id}:${b.x},${b.z};`;
    if (!key) return;
    const posts = this.outposts();
    key += this.under.version;
    if (key === this.holdKey) return;
    this.holdKey = key;
    const held = this.world.claimed, before = held.size;
    for (const p of posts) { const d = this.under.distances(p.entry); for (let k = 0; k < N * N; k++) if (d[k] >= 0 && d[k] <= HOLD) held.add(k); }
    if (held.size > before) { this.world.version++; this.onNews?.('🚩 La garnison de l’avant-poste tient les premières galeries sous l’entrée.'); }
  }

  /**
   * Campagne d'une troupe armée : depuis l'avant-poste le plus prometteur, au-delà des galeries tenues, les filons qu'elle
   * abattrait (ceux encore en place dans les galeries tenues d'abord) et les galeries qu'elle prendrait ; null s'il n'y a
   * plus rien à prendre
   */
  private plans = new Map<string, Campaign | null>();
  campaign(c: Choice): Campaign | null {
    const veins = c.win.find((e) => e.t === 'veins'), u = this.under;
    if (veins?.t !== 'veins' || !u) return null;
    const posts = this.outposts(), w = this.world;
    const key = `${veins.n}|${veins.reach}|${w.claimed.size}|${w.mined.size}|${u.version}|${u.carved}|${posts.map((p) => `${p.b.id}:${p.entry}`).join(',')}`;
    if (this.plans.has(key)) return this.plans.get(key)!;
    const all = oreVeins(u, w.mined);
    let best: Campaign | null = null, score = 0;
    for (const p of posts) {
      const d = u.reach(w.claimed, p.entry, veins.reach), take: number[] = [];
      let front = -1;
      for (let k = 0; k < N * N; k++) if (d[k] > 0) { take.push(k); if (front < 0 || d[k] > d[front]) front = k; }
      const near = all.filter((v) => d[v.k] >= 0).sort((a, b) => d[a.k] - d[b.k]).slice(0, veins.n).map((v) => v.k);
      const s = take.length + near.length * 50;
      if (s <= score) continue;
      // la troupe va de filon en filon, toujours au plus proche de là où elle se trouve
      const targets: number[] = [];
      let at = p.entry;
      while (near.length) {
        const dd = u.distances(at);
        let i = 0;
        near.forEach((k, j) => { if (dd[k] >= 0 && (dd[near[i]] < 0 || dd[k] < dd[near[i]])) i = j; });
        at = near.splice(i, 1)[0];
        targets.push(at);
      }
      score = s;
      best = { post: p.b, entrance: p.entrance, entry: p.entry, targets, take, front };
    }
    if (this.plans.size > 24) this.plans.clear();
    this.plans.set(key, best);
    return best;
  }

  /** Case libre au pied de l'avant-poste, du côté de l'entrée qu'il garde, où la troupe se rassemble avant de descendre */
  private postDoor(b: Building, entrance: number, base: [number, number]): [number, number] | null {
    const w = this.world, s = KINDS.outpost.size, ex = (entrance % N) + 0.5, ez = Math.floor(entrance / N) + 0.5, cand: [number, number, number][] = [];
    for (let z = b.z - 1; z <= b.z + s; z++)
      for (let x = b.x - 1; x <= b.x + s; x++) {
        if (!w.inCells(x, z)) continue;
        const k = w.ci(x, z);
        if (w.occ[k] || w.lake[k] || w.decor[k] || w.cellAvg(x, z) < 0.1) continue;
        cand.push([x + 0.5, z + 0.5, Math.hypot(x + 0.5 - ex, z + 0.5 - ez)]);
      }
    cand.sort((p, q) => p[2] - q[2]);
    const from = w.ci(Math.floor(base[0]), Math.floor(base[1]));
    for (const [x, z] of cand) if (this.agents.findPath(from, w.ci(Math.floor(x), Math.floor(z)))) return [x, z];
    return null;
  }

  /** Galeries que le village tient sous terre (en cases) */
  held() { return this.world.claimed.size; }

  /** Mesures des quêtes du camp : galeries tenues, filons abattus, embuscades repoussées, zones tenues */
  depthStats() { return depthStats(this.world, this.under); }

  /** Niveau du camp souterrain : nombre de ses quêtes accomplies */
  camp() { return Math.min(CAMP_QUESTS.length, this.world.exp.camp); }

  /** Quête en cours du camp souterrain, et où en est son objectif (null : toutes accomplies) */
  campQuest(): { q: CampQuest; cur: number; max: number } | null {
    const q = CAMP_QUESTS[this.camp()];
    if (!q) return null;
    const [cur, max] = q.goal(depthStats(this.world, this.under));
    return { q, cur: Math.min(cur, max), max };
  }

  /** Les quêtes du camp s'accomplissent d'elles-mêmes, l'une après l'autre ; chacune agrandit le camp */
  private campT = 0;
  private campStep(dt: number) {
    if ((this.campT -= dt) > 0) return;
    this.campT = 1;
    const s = this.world.exp;
    for (let cq = this.campQuest(); cq && cq.cur >= cq.max; cq = this.campQuest()) {
      s.camp++;
      // le village fier de ses profondeurs
      if (cq.q.id === 'all') s.bonus.joy += 3;
      this.world.version++;
      this.onCamp?.(cq.q);
    }
  }

  // ---------------- Patrouilles et attaques du camp ----------------
  /** Patrouilles du camp souterrain (petits groupes de soldats qui font la ronde dans les galeries tenues) */
  patrols() { const l = this.camp(); return l ? Math.min(3, 1 + Math.floor(l / 3)) : 0; }

  /** attaque du camp en cours (null : aucune) ; temps avant la prochaine (secondes de jeu) */
  raid: Raid | null = null;
  private raidT = RAID_EVERY[0];
  private raidId = 0;
  /** dernière nouvelle des combats du camp (pour sa fiche) */
  campNews = '';

  /** Case de galerie du camp : sous le puits du plus ancien avant-poste, ou -1 */
  campCell() { return [...this.outposts()].sort((a, b) => a.b.id - b.b.id)[0]?.entry ?? -1; }

  /**
   * De temps à autre, une vague de créatures monte des galeries sauvages vers le camp ; les gardes la repoussent. L'issue se
   * tire au début : la force des gardes (et des patrouilles) contre la vague ; au pire, pertes légères (un garde blessé, un
   * peu de minerai et de pierre renversés), jamais plus. Une victoire compte comme une embuscade repoussée
   */
  private raidStep(dt: number) {
    const lvl = this.camp(), u = this.under;
    if (!lvl || !u) { this.raid = null; return; }
    if (this.raid) {
      const r = this.raid;
      r.t += dt;
      if (r.t < RAID_TIME) return;
      const name = FOE_NAME[r.kind], w = this.world;
      let text: string;
      if (r.result === 'clean') { w.exp.wins++; text = `les gardes ont repoussé les ${r.n} ${name} sans une égratignure`; }
      else {
        const ore = Math.min(Math.floor(w.ore), 2), stone = Math.min(Math.floor(w.stone), 3);
        w.ore -= ore; w.stone -= stone; w.exp.wins++;
        text = `${r.n} ${name} repoussés, mais un garde est blessé${ore || stone ? ` et la réserve a souffert (${[ore ? `−${ore} minerai` : '', stone ? `−${stone} pierre` : ''].filter(Boolean).join(', ')})` : ''}`;
      }
      w.version++;
      this.campNews = `Dernière attaque : ${text}.`;
      this.onRaid?.(`⚔️ Camp souterrain : ${text}.`, false);
      this.raid = null;
      return;
    }
    if ((this.raidT -= dt) > 0) return;
    this.raidT = RAID_EVERY[0] + this.rnd() * (RAID_EVERY[1] - RAID_EVERY[0]);
    const cell = this.campCell();
    if (cell < 0) return;
    const kinds = foesOf(u.zone[cell], this.age()), kind = kinds[Math.floor(this.rnd() * kinds.length)];
    const big = kind === 'golem' || kind === 'worm', n = big ? 2 : 3 + Math.floor(this.rnd() * 3);
    // les gardes du camp et ses patrouilles, contre la vague (les gardiens et les vers comptent double)
    const might = CAMP_GUARDS[lvl] * 1.2 + this.patrols() * 2, threat = n * FOE_MIGHT[kind] * (1 + this.age() * 0.08);
    const result = this.rnd() < might / (might + threat * 0.6) ? 'clean' : 'hurt';
    this.raid = { id: ++this.raidId, kind, n, cell, t: 0, result };
    this.onRaid?.(`⚔️ Le camp souterrain est attaqué : ${n} ${FOE_NAME[kind]} montent des galeries ! Cliquez pour y descendre.`, true);
  }
  /** une attaque du camp commence (`start`) ou s'achève : le message, cliquable */
  onRaid: ((msg: string, start: boolean) => void) | null = null;

  // ---------------- Creusement ----------------
  /** temps passé sur la case en cours (secondes de jeu) */
  private digT = 0;
  /** où se tient l'équipe de mineurs (case de galerie, -1 : au camp), le front vers lequel elle marche et sa marche restante */
  private crewAt = -1;
  private walkFor = -1;
  private walkT = 0;

  /** Cases que les mineurs du camp ont à creuser, dans l'ordre : la première est le front du tunnel */
  digs() { return this.world.digs; }

  /** Avancement de la case en cours (0 … 1) */
  digProgress() { return this.world.digs.length ? Math.min(1, this.digT / DIG_TIME) : 0; }

  /** Les mineurs sont encore en chemin vers le front du tunnel */
  digWalking() { return this.world.digs.length > 0 && this.walkT > 0; }

  /** Case de galerie d'où l'on creuse la roche `k` (une galerie tenue), ou -1 */
  digStand(k: number) { const u = this.under!; return around(k).find((n) => this.world.claimed.has(n) && u.walkable(n % N, Math.floor(n / N))) ?? -1; }

  /** Temps de marche de l'équipe jusqu'au front `k` : depuis le camp (sous le premier avant-poste) ou depuis le front d'avant */
  private walkTime(k: number) {
    const u = this.under!, stand = this.digStand(k);
    const from = this.crewAt >= 0 ? this.crewAt : ([...this.outposts()].sort((a, b) => a.b.id - b.b.id)[0]?.entry ?? -1);
    const d = stand >= 0 && from >= 0 ? u.distances(from)[stand] : -1;
    this.crewAt = stand;
    return d > 0 ? Math.min(DIG_WALK_MAX, d / DIG_WALK) : 0;
  }

  /** Galeries d'où l'on creuse : celles que le village tient, tunnels compris */
  private digFrom() {
    const u = this.under!, out: number[] = [];
    for (const k of this.world.claimed) if (u.walkable(k % N, Math.floor(k / N))) out.push(k);
    return out;
  }

  /** La case touche-t-elle une galerie tenue (ou un bout de tunnel) ? */
  private touchesHeld(k: number) { const u = this.under!; return around(k).some((n) => this.world.claimed.has(n) && u.walkable(n % N, Math.floor(n / N))); }

  /**
   * Cases à creuser pour atteindre la case visée : une case de roche contre une galerie tenue (ou au bout du tunnel prévu),
   * sinon le tunnel le plus court jusqu'à elle ; une galerie hors d'atteinte, le tunnel le plus court jusqu'à elle. Renvoie
   * ces cases, ou pourquoi l'on ne peut pas
   */
  digPlan(k: number): number[] | string {
    const u = this.under, w = this.world;
    if (!u) return 'Le monde souterrain n’est pas encore prêt.';
    u.sync();
    const x = k % N, z = Math.floor(k / N);
    if (k < 0 || k >= N * N || (!u.open[k] && !u.canCarve(k))) return 'On ne creuse pas au-delà du bord de la carte.';
    if (u.pool[k]) return 'On ne creuse ni dans l’eau ni dans la lave.';
    const from = this.digFrom();
    if (!from.length) return 'Il faut d’abord tenir des galeries : bâtissez un avant-poste tout contre une grotte ou une faille.';
    const left = MAX_DIGS - w.digs.length, src = [...from, ...w.digs];
    if (left <= 0) return 'Les mineurs ont déjà assez de travail : laissez-les avancer un peu.';
    let path: number[] | null;
    if (u.open[k]) {
      if (w.claimed.has(k)) return 'C’est une galerie tenue : cliquez sur la roche tout contre elle pour y creuser.';
      // une galerie au-delà de la roche : le tunnel le plus court jusqu'à elle (déjà à portée : c'est l'affaire des expéditions)
      const d = u.distances(z * N + x);
      if (from.some((f) => d[f] >= 0)) return 'Cette galerie est déjà à portée : envoyez une expédition armée pour la prendre.';
      path = u.tunnel(src, (r) => around(r).some((n) => d[n] >= 0), DIG_REACH);
      if (!path) return 'Ces galeries sont trop loin à travers la roche : creusez d’abord un bout de tunnel vers elles.';
    } else {
      path = u.tunnel(src, (r) => r === k, DIG_REACH);
      if (!path) return 'Trop loin : creusez la roche tout contre une galerie tenue, ou au bout du tunnel.';
    }
    if (path.length > left) return `Ce tunnel ferait ${path.length} cases : les mineurs n’en prennent que ${left} de plus pour l’instant.`;
    return path;
  }

  /** Un clic du mode Creuser : on prévoit le tunnel jusqu'à la case (true), on annule une case prévue (false), ou pourquoi l'on ne peut pas */
  planDig(k: number): boolean | string {
    const w = this.world, i = w.digs.indexOf(k);
    if (i >= 0) {
      w.digs.splice(i, 1);
      if (i === 0) this.digT = 0;
      this.pruneDigs();
      return false;
    }
    const p = this.digPlan(k);
    if (typeof p === 'string') return p;
    w.digs.push(...p);
    return true;
  }

  /**
   * Un clic sur un filon : les mineurs du camp vont percer la roche où il luit (`wall`, sinon la roche voisine la plus proche
   * à creuser) et l'abattre. Renvoie true si c'est prévu (ou déjà prévu), sinon pourquoi l'on ne peut pas
   */
  mineVein(k: number, wall = -1): true | string {
    const u = this.under, w = this.world;
    if (!u) return 'Le monde souterrain n’est pas encore prêt.';
    const rocks = around(k).filter((n) => u.canCarve(n)).sort((a, b) => (b === wall ? 1 : 0) - (a === wall ? 1 : 0));
    if (rocks.some((n) => w.digs.includes(n))) return true;
    let best: number[] | null = null, why = 'Ce filon est hors d’atteinte des mineurs du camp.';
    for (const n of rocks) {
      const p = this.digPlan(n);
      if (typeof p === 'string') { why = p; continue; }
      if (!best || p.length < best.length) best = p;
      if (n === wall && p.length <= 1) break;
    }
    if (!best) return why;
    w.digs.push(...best);
    return true;
  }

  /** Une case annulée : la suite du tunnel qui ne tient plus à rien l'est avec elle */
  private pruneDigs() {
    const u = this.under, w = this.world;
    if (!u) return;
    const ok = new Set(this.digFrom());
    w.digs = w.digs.filter((k) => {
      const keep = u.canCarve(k) && around(k).some((n) => ok.has(n));
      if (keep) ok.add(k);
      return keep;
    });
  }

  /** Les mineurs du camp se rendent au front du tunnel, puis creusent la file case après case ; la file vide, ils rentrent au camp */
  private digStep(dt: number) {
    const w = this.world, u = this.under;
    if (!w.digs.length || !u) { this.digT = 0; this.crewAt = this.walkFor = -1; this.walkT = 0; return; }
    u.sync();
    const k = w.digs[0];
    // le front ne tient plus à une galerie tenue (souterrain régénéré, case déjà ouverte) : on le laisse
    if (!u.canCarve(k) || !this.touchesHeld(k)) { w.digs.shift(); this.digT = 0; this.pruneDigs(); return; }
    if (this.walkFor !== k) { this.walkFor = k; this.walkT = this.walkTime(k); }
    if (this.walkT > 0) { this.walkT -= dt; return; }
    this.digT += dt;
    if (this.digT < DIG_TIME) return;
    this.digT = 0;
    w.digs.shift();
    this.carve(k);
  }

  /**
   * Les mineurs percent la case : elle devient un bout de tunnel que le village tient ; on en remonte de la pierre (parfois
   * une pépite de minerai), et un filon dont on ôte la dernière roche tombe avec elle. Un tunnel qui débouche sur des galeries
   * hors d'atteinte les ouvre aux expéditions armées
   */
  private carve(k: number) {
    const u = this.under!, w = this.world, x = k % N, z = Math.floor(k / N);
    // les galeries sauvages contre la case : jusqu'ici hors d'atteinte des avant-postes ?
    const wild = around(k).filter((n) => u.walkable(n % N, Math.floor(n / N)) && !w.claimed.has(n));
    const posts = wild.length ? this.outposts().map((p) => p.entry) : [];
    const reach = posts.length ? u.distances(posts) : null, fresh = wild.some((n) => !reach || reach[n] < 0);
    const veins = oreVeins(u, w.mined).filter((v) => around(k).includes(v.k));
    if (!u.dig(k)) return;
    w.claimed.add(k);
    w.stone += 1;
    let ore = hash2(x, z, 700) < 0.15 ? 1 : 0;
    // la roche percée contre un filon l'abat toujours (avant, il ne tombait qu'avec sa dernière roche : percer la paroi où
    // luisait le minerai ne donnait rien la plupart du temps, ses cubes sautaient sur l'autre paroi)
    const fell = veins;
    for (const v of fell) { w.mined.add(v.k); ore += ORE_KINDS[v.ore].amount; }
    w.ore += ore;
    w.version++;
    if (fell.length) this.onNews?.(`⛏️ Les mineurs abattent un filon ${ofOre(ORE_KINDS[fell[0].ore].name)} : +${ore} minerai.`);
    if (fresh) this.onNews?.('⛏️ Le tunnel débouche sur de nouvelles galeries : envoyez une expédition armée !', true);
  }

  /** Plus rien à prendre depuis les avant-postes : seul un tunnel vers d'autres galeries relancera les expéditions armées */
  tunnelNeeded() {
    const deep = MISSIONS.find((m) => m.id === 'deep');
    return !!deep && !!this.under && this.age() >= deep.age && this.outposts().length > 0 && deep.choices.every((c) => !this.campaign(choiceAt(c, this.age())));
  }

  /**
   * Le tunnel conseillé : le plus court, depuis les galeries tenues (ou le bout du tunnel prévu), vers des galeries hors
   * d'atteinte des avant-postes ; ses cases de roche, de la galerie vers elles (vide : rien à rejoindre, ou déjà prévu)
   */
  private hintKey = '';
  private hint: number[] = [];
  tunnelHint(): number[] {
    const u = this.under, w = this.world;
    if (!u) return [];
    const posts = this.outposts();
    const key = `${u.version}|${u.carved}|${w.claimed.size}|${w.digs.join(',')}|${posts.map((p) => p.entry).join(',')}`;
    if (key === this.hintKey) return this.hint;
    this.hintKey = key;
    const from = this.digFrom();
    if (!from.length || !posts.length) return (this.hint = []);
    const d = u.distances(posts.map((p) => p.entry)), out = (n: number) => d[n] < 0 && u.walkable(n % N, Math.floor(n / N));
    // le tunnel prévu débouche déjà quelque part : rien à conseiller
    if (w.digs.some((k) => around(k).some(out))) return (this.hint = []);
    return (this.hint = u.tunnel([...from, ...w.digs], (r) => around(r).some(out), DIG_REACH) ?? []);
  }

  /** Pourquoi l'on ne peut pas partir (ou null) */
  why(m: Mission, c: Choice): string | null {
    if (this.running(m)) return 'Cette expédition est déjà en route.';
    const miss = this.missing(m);
    if (miss.length) return `Il faut d’abord ${miss.join(', ')}.`;
    if (c.mounts) { const n = this.horsesHome(); if (n < c.mounts) return `Il faut ${c.mounts} chevaux ${this.at('stable')} (${n} pour l’instant).`; }
    // les blindés roulent au carburant : la raffinerie le tire du pétrole brut des puits
    if (c.fuel && !this.world.unlimited && this.world.fuel < c.fuel) {
      const n = Math.floor(this.world.fuel);
      return `Il faut ${c.fuel} carburant pour les véhicules (${n} pour l’instant) : ${this.has('refinery') ? 'la raffinerie en tire du pétrole brut des puits' : 'forez des puits de pétrole sur un gisement et bâtissez une raffinerie'}.`;
    }
    if (c.win.some((e) => e.t === 'veins') && this.under && !this.campaign(c)) {
      return this.outposts().length ? 'Toutes les galeries que l’on peut atteindre depuis l’avant-poste sont tenues, et leurs filons abattus : creusez un tunnel vers de nouvelles galeries.' : 'L’avant-poste ne garde aucune entrée praticable : rebâtissez-le tout contre une grotte ou une faille.';
    }
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

  start(m: Mission, ci: number, age = m.age): ActiveExpedition | null {
    const c = m.choices[ci] ? choiceAt(m.choices[ci], age) : undefined;
    if (!c || this.why(m, c)) return null;
    const base = this.base()!;
    // la troupe armée part de l'avant-poste et descend par l'entrée qu'il garde ; les autres vont où les mène leur mission
    const plan = c.win.some((e) => e.t === 'veins') ? this.campaign(c) : null;
    let kind: DestKind | null = c.dest, dest: [number, number] | null = null, sea = !!c.sea;
    // avec un camp souterrain, la troupe s'y rassemble : pas besoin de chemin depuis le village jusqu'à l'avant-poste
    const fromCamp = !!plan && this.camp() >= 1;
    if (plan) dest = fromCamp ? [(plan.entrance % N) + 0.5, Math.floor(plan.entrance / N) + 0.5] : this.postDoor(plan.post, plan.entrance, base);
    else if (c.win.some((e) => e.t === 'veins')) return null;
    else while (kind && !dest) {
      dest = this.findDest(kind, base, false, sea && kind === 'river');
      // pas de côte ouverte sur le large à portée : la rivière la plus proche fera l'affaire
      if (!dest && sea && kind === 'river') { sea = false; continue; }
      // une grotte introuvable : dans la montagne, puis au pied de la moindre paroi, plutôt qu'au milieu de la plaine
      if (!dest && c.dest === 'cave' && kind === 'mountain') dest = this.findDest('mountain', base, true);
      if (!dest) kind = FALLBACK[kind];
    }
    if (!dest || !kind) return null;
    const { targets, entry, take: held, front } = plan ?? { targets: [], entry: -1, take: [], front: -1 };
    const { ambush, len } = plan ? this.planAmbush(entry, targets, front) : { ambush: [], len: 0 };
    // une fois la course automobile gagnée, les équipes (hors troupes armées) partent en petites voitures d'époque, pas à cheval ;
    // à l'époque moderne, la troupe qui brûle du carburant roule : des blindés pour la charge, des véhicules pour les autres
    const armored = !!c.fuel && c.troop === 'cavalry';
    const motor = (age >= 3 && this.world.exp.done.includes('motorcar') && !c.troop && !c.mounts) || (!!c.fuel && !armored);
    const mounts = motor ? 0 : this.mountsFor(c);
    const party = this.agents.recruit(c.party);
    if (!party) return null;
    this.world.exp.riding += mounts;
    if (c.fuel && !this.world.unlimited) this.world.fuel = Math.max(0, this.world.fuel - c.fuel);
    // l'équipe emporte le meilleur équipement en réserve contre les dangers du voyage
    const { take, k } = loadout(c, this.world.exp.gear);
    for (const [g, n] of Object.entries(take) as [GearId, number][]) this.world.exp.gear[g] -= n;
    const a: ActiveExpedition = {
      id: this.nextId++, m, c, phase: m.farewell ? 'gather' : 'out', t: 0, party, base, dest, ok: false, gear: take, riskK: k,
      wait: null, waitT: 0, hold: 0, events: c.work >= 20 && this.rnd() < 0.5 ? 2 : 1, seen: [], picks: [], notes: [], extra: 0, bonus: [], hurt: 0,
      // une grotte trouvée au pied d'une paroi reste une grotte : l'équipe y entre
      site: c.dest === 'cave' ? 'cave' : kind, age, sea: sea && kind === 'river',
      targets: [...targets], entry, take: held, front, redo: this.done(m), mounts, ambush, routeLen: len, might: 0, fromCamp,
    };
    // chacun reçoit sa part : l'arme, la torche, la corde, l'armure, et son cheval s'il y en a assez ; on part en selle
    const kits = party.map((): Kit => ({}));
    for (const g of ['rifle', 'sword', 'bow', 'spear'] as const) { let n = take[g] ?? 0; for (const kt of kits) if (n > 0 && !kt.weapon) { kt.weapon = g; n--; } }
    kits.forEach((kt, i) => {
      // les chasseurs du mammouth ont toujours leurs lances de chasse au poing (les armes du village, emportées en plus, rendent la chasse plus sûre)
      if (c.scene === 'mammoth' || c.scene === 'megalodon' || c.scene === 'kraken') kt.weapon ??= 'spear';
      if (i < (take.armor ?? 0)) kt.armor = true;
      if (kits.length - 1 - i < (take.torch ?? 0)) kt.torch = true;
      if (i >= 1 && i <= (take.rope ?? 0)) kt.rope = true;
      // la charge de cavalerie part en cavaliers de l'époque (en chars à l'époque moderne) ; les autres équipes à cheval
      // restent des habitants en selle
      if (motor) kt.car = true;
      else if (armored && i < 3) { kt.rider = true; kt.tank = true; }
      else if (i < mounts) { kt.horse = true; if (c.troop === 'cavalry') kt.rider = true; }
    });
    party.forEach((id, i) => this.agents.equip(id, kits[i]));
    // force au combat : chacun compte, davantage en armure, armé, à cheval (en char, plus encore) ou la torche au poing (les
    // monstres craignent la lumière)
    a.might = kits.reduce((s, k) => s + 1 + (k.armor ? 1 : 0) + (k.weapon ? 0.6 : 0) + (k.rider ? (k.tank ? 1.4 : 0.9) : 0) + (k.torch ? 0.3 : 0), 0) + (plan && this.camp() >= 4 ? 2 : 0) + (plan && this.camp() >= 9 ? 2 : 0);
    this.active.push(a);
    if (fromCamp) {
      // elle descend aussitôt du camp souterrain dans les galeries
      a.phase = 'work';
      this.agents.partyHide(party, true);
      this.onNews?.(`${m.icon} « ${m.title} » : la troupe se rassemble au camp souterrain et s’enfonce dans les galeries.`);
    } else if (m.farewell) {
      // le grand départ : les colons se retrouvent d'abord au cœur du village, où tout le monde vient leur dire adieu
      this.agents.partyGo(party, base[0], base[1], 0.15);
    } else {
      // elle part aussitôt, chacun de là où il est, sans se rassembler d'abord au village
      this.agents.partyGo(party, dest[0], dest[1]);
      this.onNews?.(`${m.icon} L’expédition « ${m.title} » part vers ${destName(c)}.`);
    }
    return a;
  }

  /** vitesse du jeu : l'attente d'une décision se compte en secondes réelles (à ×4, on a le temps de la lire) */
  speed = 1;

  update(dt: number) {
    const ag = this.agents;
    this.craftStep(dt);
    this.mineStep(dt);
    this.holdStep(dt);
    this.campStep(dt);
    this.raidStep(dt);
    this.digStep(dt);
    for (const a of [...this.active]) {
      // une décision attendue : l'équipe patiente, puis tranche d'elle-même
      if (a.wait) {
        a.waitT += dt / Math.max(1, this.speed);
        if (a.waitT >= AUTO_DECIDE) this.decide(a, this.safest(a));
        continue;
      }
      // une attente choisie : le travail est suspendu, l'équipe reste là à attendre (elle ne fait pas l'action d'une autre option)
      if (a.hold > 0) { a.hold = Math.max(0, a.hold - dt); if (!a.hold && a.phase === 'work') ag.partyAct(a.party, 'work'); continue; }
      // avec une écurie, les équipes vont à cheval : le travail sur place avance plus vite
      a.t += dt * (a.phase === 'work' && this.has('stable') ? 1.25 : 1);
      if (a.phase === 'work' && a.ambush.length) this.ambushStep(a);
      // (une équipe d'une ancienne sauvegarde, encore rassemblée au village, part à son tour)
      // les adieux durent un peu, le temps que le village acclame les colons
      if (a.phase === 'gather' && ((ag.partyDone(a.party) && a.t > (a.m.farewell ? 20 : 0)) || a.t > 40)) {
        a.phase = 'out'; a.t = 0;
        ag.partyGo(a.party, a.dest[0], a.dest[1]);
        this.onNews?.(`${a.m.icon} L’expédition « ${a.m.title} » part vers ${destName(a.c)}.`);
      } else if (a.phase === 'out' && (ag.partyDone(a.party) || a.t > OUT_MAX)) {
        a.phase = 'work'; a.t = 0;
        ag.partyAct(a.party, 'work');
        ag.mountParty(a.party, false);
        // la troupe armée descend dans les galeries : on ne la voit plus en surface, mais sous terre
        if (a.entry >= 0) ag.partyHide(a.party, true);
        this.raise(a, true);
      } else if (a.phase === 'work' && a.seen.length < a.events && a.t >= (a.c.work + a.extra) * 0.55) {
        this.raise(a, false);
      } else if (a.phase === 'work' && a.t >= a.c.work + a.extra && a.fromCamp) {
        // partie du camp, elle y remonte : les soldats rentrent au village sans refaire la route, et l'on fête leur retour
        a.ok = this.rnd() >= this.chance(a);
        a.phase = 'home'; a.t = 0;
        ag.partyHide(a.party, false);
        ag.partyAct(a.party, a.ok ? 'cheer' : 'stroll');
        this.onNews?.(a.ok ? `${a.m.icon} « ${a.m.title} » : la troupe remonte du camp souterrain, victorieuse !` : `${a.m.icon} « ${a.m.title} » : la troupe remonte du camp souterrain, la mine basse.`);
      } else if (a.phase === 'work' && a.t >= a.c.work + a.extra && a.m.farewell) {
        // les colons sont partis pour de bon : pas de retour, le récit arrive aussitôt
        a.ok = this.rnd() >= this.chance(a);
        a.phase = 'home'; a.t = 4;
        ag.partyHide(a.party, true);
      } else if (a.phase === 'work' && a.t >= a.c.work + a.extra) {
        a.ok = this.rnd() >= this.chance(a);
        a.phase = 'back'; a.t = 0;
        ag.mountParty(a.party, true);
        this.goHome(a);
        this.onNews?.(a.ok ? `${a.m.icon} « ${a.m.title} » : l’équipe rentre… et elle n’a pas l’air bredouille !` : `${a.m.icon} « ${a.m.title} » : l’équipe rentre, la mine basse.`);
      } else if (a.phase === 'back' && (ag.partyDone(a.party) || a.t > 240)) {
        a.phase = 'home'; a.t = 0;
        ag.partyAct(a.party, a.ok ? 'cheer' : 'stroll');
      } else if (a.phase === 'home' && a.t > 4) this.finish(a);
    }
  }

  /**
   * Embuscades prévues au départ : dans la partie sauvage du chemin (hors des galeries tenues), une à trois selon sa
   * longueur, réparties le long du trajet ; les créatures sont celles de la zone. Renvoie aussi la longueur du parcours
   */
  private planAmbush(entry: number, targets: number[], front: number): { ambush: Ambush[]; len: number } {
    const u = this.under!, w = this.world;
    const base = troopRoute(u, entry, targets, front);
    const wild = base.cells.filter((k) => !w.claimed.has(k));
    const n = wild.length < 8 ? 0 : Math.min(3, Math.max(1, Math.round(wild.length / 28)));
    const cells: number[] = [];
    for (let j = 0; j < n; j++) {
      const k = wild[Math.min(wild.length - 1, Math.floor(((j + 0.3 + this.rnd() * 0.45) / n) * wild.length))];
      if (!cells.includes(k)) cells.push(k);
    }
    const route = troopRoute(u, entry, targets, front, cells);
    const ambush = route.legs.filter((l) => l.kind === 'fight').map((l): Ambush => {
      const cell = route.cells[l.to], zone = u.zone[cell], kinds = foesOf(zone, this.age()), kind = kinds[Math.floor(this.rnd() * kinds.length)];
      // les grosses créatures vont par deux ou trois
      const n = kind === 'golem' || kind === 'worm' ? 2 + (this.rnd() < 0.3 ? 1 : 0) : 2 + Math.floor(this.rnd() * 3) + (zone === UZ_MAGMA ? 1 : 0);
      return { cell, kind, n, t0: l.t0, state: 'wait', result: null };
    });
    return { ambush, len: route.total };
  }

  /** La troupe arrive sur une embuscade : les créatures chargent, le combat se joue ; à la fin, ses blessés et le récit */
  private ambushStep(a: ActiveExpedition) {
    const s = Math.min(1, a.t / Math.max(1, a.c.work + a.extra)) * a.routeLen;
    for (const m of a.ambush) {
      const name = FOE_NAME[m.kind];
      if (m.state === 'wait' && s >= m.t0) {
        m.state = 'fight';
        // l'issue : la force de la troupe contre le nombre et la férocité des créatures (plus grandes dans le magma)
        const threat = m.n * FOE_MIGHT[m.kind] * (this.under?.zone[m.cell] === UZ_MAGMA ? 1.25 : 1) * 0.9 * (this.camp() >= 9 ? 0.7 : this.camp() >= 2 ? 0.85 : 1);
        const win = a.might / (a.might + threat), r = this.rnd();
        m.result = r < win ? 'clean' : r < win + (1 - win) * 0.65 ? 'hurt' : 'rout';
        this.onNews?.(`⚔️ « ${a.m.title} » : ${m.n} ${name} surgissent des galeries et chargent la troupe !`);
      } else if (m.state === 'fight' && s >= m.t0 + FIGHT_HALT) {
        m.state = 'done';
        const text = m.result === 'clean' ? `la troupe a taillé en pièces les ${m.n} ${name} qui l'attendaient dans le noir`
          : m.result === 'hurt' ? `${m.n} ${name} repoussés, mais un soldat est blessé`
          : `les ${name} étaient trop nombreux : la troupe a dû reculer, deux blessés`;
        if (m.result !== 'rout') this.world.exp.wins++;
        if (m.result === 'hurt') { a.hurt += 1; a.riskK *= 1.06; }
        if (m.result === 'rout') { a.hurt += 2; a.riskK *= 1.2; }
        a.notes.push(`Embuscade dans les galeries : ${text}.`);
        this.onNews?.(`⚔️ « ${a.m.title} » : ${text}.`);
      }
    }
  }

  /**
   * L'équipe rentre au village. Un membre resté là où aucun chemin ne part (descendu d'une barque, sorti d'une grotte…)
   * repart du lieu de l'expédition, où le chemin de l'aller arrivait : on voit toujours l'équipe rentrer à pied
   */
  private goHome(a: ActiveExpedition) {
    const ag = this.agents;
    ag.partyGo(a.party, a.base[0], a.base[1]);
    const stuck = a.party.filter((id) => { const g = ag.agents.find((x) => x.id === id); return !!g && ag.memberDone(id) && Math.hypot(g.x - a.base[0], g.z - a.base[1]) > 2; });
    if (!stuck.length) return;
    ag.partyHide(stuck, false);
    ag.partyPlace(stuck, a.dest[0], a.dest[1]);
    ag.partyGo(stuck, a.base[0], a.base[1]);
  }

  /** Un imprévu survient (à l'arrivée de l'équipe, ou au milieu du travail) : l'équipe s'arrête et attend la décision du joueur */
  private raise(a: ActiveExpedition, arrive: boolean) {
    // pas un imprévu des dernières expéditions, ni celui qu'une autre équipe attend ou vient de vivre
    const avoid = [...this.world.exp.recent, ...this.active.filter((o) => o !== a).flatMap((o) => o.seen)];
    const ev = pickEvent({ dest: a.site, mission: a.m.id, scene: a.c.scene, age: a.age, arrive, sea: a.sea, warm: this.warm(a.dest) }, a.seen, avoid, this.rnd);
    if (!ev) { a.events = a.seen.length; return; }
    a.seen.push(ev.id);
    a.picks.push(-1);
    const recent = this.world.exp.recent;
    recent.push(ev.id);
    if (recent.length > RECENT_EVENTS) recent.splice(0, recent.length - RECENT_EVENTS);
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
    // l'avancement ne recule jamais : le temps déjà passé compte pour la même part du chantier allongé (ou raccourci) ;
    // sinon la troupe, sous terre, était ramenée en arrière sur son chemin
    const before = Math.max(1, a.c.work + a.extra);
    // choisir d'attendre : le temps d'attente est du temps réel de jeu pendant lequel rien n'avance (on ne l'ajoute pas au travail)
    const waits = !!o.wait && a.phase === 'work';
    a.extra += waits ? Math.min(0, o.work ?? 0) : o.work ?? 0;
    if (waits) a.hold = waitTime(o);
    if (a.phase === 'work') a.t *= Math.max(1, a.c.work + a.extra) / before;
    if (o.bonus) a.bonus.push(...o.bonus);
    a.hurt += o.hurt ?? 0;
    a.notes.push(o.text);
    // la scène joue la suite de l'option choisie (le grand feu, la corde, la décrue…)
    const j = a.seen.lastIndexOf(a.wait!.id);
    if (j >= 0) a.picks[j] = i;
    a.wait = null;
    if (a.phase === 'work') this.agents.partyAct(a.party, a.hold > 0 ? 'sit' : 'work');
    return true;
  }

  private finish(a: ActiveExpedition) {
    const eff = a.ok ? [...(a.redo ? redoEffects(a.c.win) : a.c.win), ...a.bonus] : a.c.lose;
    const res = applyEffects(this.world, eff, this.dayLen());
    // la troupe a abattu ses filons : ils disparaissent des parois, leur minerai rentre au village
    let veins = '', held = '', text = a.ok ? a.c.winText : a.c.loseText;
    if (a.ok && a.take.length) {
      // victoire : la troupe a planté ses lanternes, le village tient ces galeries
      for (const k of a.take) this.world.claimed.add(k);
      held = `${a.take.length} cases de galeries prises`;
    }
    if (a.ok && a.c.win.some((e) => e.t === 'veins')) {
      const kinds = new Map(this.under ? oreVeins(this.under, this.world.mined).map((v) => [v.k, v.ore]) : []), got = new Map<string, number>();
      let ore = 0, n = 0;
      for (const k of a.targets) {
        const o = kinds.get(k);
        if (o === undefined) continue;
        this.world.mined.add(k);
        n++;
        // la forge du camp souterrain tire un minerai de plus de chaque filon
        ore += ORE_KINDS[o].amount + (this.camp() >= 3 ? 1 : 0) + (this.camp() >= 8 ? 1 : 0);
        got.set(ORE_KINDS[o].name, (got.get(ORE_KINDS[o].name) ?? 0) + 1);
      }
      this.world.ore += ore;
      // un seul total de minerai : les filons abattus (combien de chaque), et ce qu'on a trouvé en chemin (une veine creusée)
      const found = eff.reduce((s, e) => s + (e.t === 'ore' ? e.n : 0), 0), s = n > 1 ? 's' : '';
      if (n) veins = `+${ore + found} minerai : ${n} filon${s} abattu${s} (${[...got].map(([name, k]) => `${k} ${ofOre(name)}`).join(', ')})${found ? `, et ${found} trouvé${found > 1 ? 's' : ''} en chemin` : ''}`;
      // le récit dit combien de filons la troupe a vraiment abattus (aucun, s'il n'y en avait pas sur son chemin)
      text += n ? ` ${NUMBER[n] ?? n} filon${s} abattu${s} : le minerai remonte à la lumière.` : ' Mais pas un filon sur son chemin : elle ne rapporte que les galeries prises.';
    }
    this.world.exp.riding = Math.max(0, this.world.exp.riding - a.mounts);
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
    // l'infirmerie du camp souterrain soigne les blessés des troupes armées deux fois plus vite
    this.agents.dismiss(a.party, injured, days * this.dayLen() * (this.has('health') ? 0.5 : 1) * (a.gear.kit ? 0.5 : 1) * (a.entry >= 0 && this.camp() >= 5 ? 0.5 : 1));
    this.active.splice(this.active.indexOf(a), 1);
    this.world.version++;
    const summary = [veins, held, effectSummary(eff.filter((e) => e.t !== 'veins' && !(veins && e.t === 'ore'))), lost].filter((x) => x && x !== 'rien').join(' · ') || 'rien';
    this.onReport?.({ m: a.m, c: a.c, ok: a.ok, text, summary, notes: a.notes, redo: a.redo });
  }

  // ---------------- Fabrication de l'équipement ----------------
  /** Pourquoi le village ne peut pas fabriquer cette pièce (ou null) */
  whyCraft(g: Gear, age: number): string | null {
    if (age < g.age) return `Connu à l’âge ${AGES[g.age].name}`;
    if (g.needs && !this.has(g.needs)) return `Il faut : ${KINDS[g.needs].names[Math.min(age, AGES.length - 1)].toLowerCase()}`;
    const lack = gearShort(this.world, g); if (lack) return lack;
    if (this.world.exp.craft.length >= MAX_CRAFT) return 'L’atelier a déjà assez de travail';
    return null;
  }

  /** Met une pièce en fabrication (son prix est pris tout de suite) */
  craft(id: GearId, age: number) {
    const g = GEAR_BY[id];
    if (this.whyCraft(g, age)) return false;
    payGear(this.world, g);
    this.world.exp.craft.push(id);
    return true;
  }

  /** Annule une pièce de la file (son prix est rendu) */
  cancelCraft(i: number) {
    const s = this.world.exp, id = s.craft[i];
    if (!id) return;
    s.craft.splice(i, 1);
    if (i === 0) s.craftT = 0;
    payGear(this.world, GEAR_BY[id], true);
  }

  /** Avancement de la pièce en cours (0 … 1) */
  craftProgress() { const s = this.world.exp; return s.craft.length ? Math.min(1, s.craftT / GEAR_BY[s.craft[0]].time) : 0; }

  /** production de chaque ressource en cours (fractions d'unité), et avancement du baril en cours à la raffinerie (0 … 1) */
  private prodT: Record<Resource, number> = { wood: 0, stone: 0, ore: 0, crude: 0, fuel: 0, brick: 0 };
  private refineT = 0;
  /** Ce que le village tire chaque jour de ses bâtiments : bois, pierre, minerai, briques, pétrole brut des puits (avant raffinage) */
  yields(): Record<Resource, number> {
    const rate: Record<Resource, number> = { wood: 0, stone: 0, ore: 0, crude: 0, fuel: 0, brick: 0 };
    for (const b of this.world.buildings.values()) {
      const y = YIELD[b.kind];
      if (y) for (const r of Object.keys(y) as Resource[]) rate[r] += y[r]![b.age] ?? 0;
    }
    // le monte-charge du camp souterrain remonte du minerai chaque jour
    if (this.camp() >= 6) rate.ore += 2;
    return rate;
  }

  /** Pétrole brut que les raffineries peuvent traiter par jour */
  refining() { let n = 0; for (const b of this.world.buildings.values()) if (b.kind === 'refinery') n += REFINE_CRUDE; return n; }

  /**
   * Ce que le village produit chaque jour : bois des bûcherons, pierre des carrières et des mines, minerai des mines ; le
   * pétrole brut des puits, moins ce qu'en raffinent les raffineries (tant qu'il y en a), et le carburant qu'elles en tirent
   */
  daily(): Record<Resource, number> {
    const rate = this.yields(), cap = this.refining();
    const use = Math.min(cap, this.world.crude >= 1 ? cap : rate.crude);
    rate.crude -= use;
    rate.fuel += use * FUEL_PER_CRUDE;
    return rate;
  }
  private mineStep(dt: number) {
    const rate = this.yields(), w = this.world, day = dt / this.dayLen();
    for (const r of ['wood', 'stone', 'ore', 'brick', 'crude'] as Resource[]) {
      if (!rate[r]) continue;
      // bois, pierre, minerai et briques arrivent au fil des heures, en petites parts (l'affichage arrondit), et non d'un coup chaque
      // jour ; le brut et le carburant se comptent en barils entiers (la raffinerie les traite un à un)
      if (r === 'crude') { this.prodT[r] += day * rate[r]; const n = Math.floor(this.prodT[r]); if (n) { this.prodT[r] -= n; w[r] += n; } }
      else w[r] += day * rate[r];
    }
    // la raffinerie traite le brut baril après baril, tant qu'il en reste ; chaque baril donne sa part de carburant
    const cap = this.refining();
    if (!cap) return;
    this.refineT = Math.min(1, this.refineT + day * cap);
    while (this.refineT >= 1 && w.crude >= 1) {
      this.refineT -= 1;
      w.crude -= 1;
      this.prodT.fuel += FUEL_PER_CRUDE;
    }
    const n = Math.floor(this.prodT.fuel + 1e-9);
    if (n) { this.prodT.fuel -= n; w.fuel += n; }
  }

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

  /** La troupe en plein combat contre une embuscade : ce qu'en dit sa carte (ou null) */
  fighting(a: ActiveExpedition) {
    const m = a.ambush.find((x) => x.state === 'fight');
    return m ? `⚔️ Attaquée par ${m.n} ${FOE_NAME[m.kind]} !` : null;
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
      out: `En route vers ${destName(a.c)}…`,
      work: a.wait ? `Décision à prendre : ${a.wait.title.toLowerCase()}` : this.fighting(a) ?? `Sur place, l’équipe ${a.c.doing ?? a.c.label.toLowerCase()}…`,
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

  /**
   * Destination du genre voulu, hors du village (à quatre cases au moins de tout bâtiment, plus loin que le gros des maisons :
   * dans un grand village, la plaine la plus proche n'est pas entre deux maisons) et atteignable à pied. Une grotte se
   * cherche d'abord parmi les vraies grottes (une faille fait l'affaire), hors du désert ; la montagne aussi. `loose` : au
   * pied de la moindre paroi (une grotte qu'on ne trouve nulle part ailleurs)
   */
  private findDest(kind: DestKind, base: [number, number], loose = false, sea = false): [number, number] | null {
    if (kind === 'spaceport') return this.padSide(base);
    const w = this.world, [bx, bz] = base, cand: [number, number, number][] = [];
    const town = new Uint8Array(N * N), ds: number[] = [];
    for (const b of w.buildings.values()) {
      if (b.kind === 'lamp') continue;
      const s = sizeOf(b);
      ds.push(Math.hypot(b.x + s / 2 - bx, b.z + s / 2 - bz));
      for (let dz = -4; dz < s + 4; dz++) for (let dx = -4; dx < s + 4; dx++) if (w.inCells(b.x + dx, b.z + dz)) town[w.ci(b.x + dx, b.z + dz)] = 1;
    }
    ds.sort((p, q) => p - q);
    // le rayon du gros du village (huit bâtiments sur dix en deçà) : on part au-delà
    const reach = ds.length ? ds[Math.floor(ds.length * 0.8)] : 0;
    const ideal = { plain: 18, forest: 15, river: 15, mountain: 22, cave: 18, far: 32, spaceport: 0 }[kind] + (kind === 'cave' ? 0 : reach * 0.7);
    const outside: [number, number, number][] = [], rails = this.avoidCells?.() ?? null;
    // dénivelé autour d'une case : de combien le terrain monte dans un rayon de trois cases (une paroi, une pente de montagne)
    const rise = (x: number, z: number) => {
      let top = -Infinity;
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (w.inCells(x + dx, z + dz)) top = Math.max(top, w.cellAvg(x + dx, z + dz));
      return top - w.cellAvg(x, z);
    };
    for (let z = 2; z < N - 2; z += 2)
      for (let x = 2; x < N - 2; x += 2) {
        const k = w.ci(x, z), h = w.cellAvg(x, z), slope = w.cellSlope(x, z), d = Math.hypot(x + 0.5 - bx, z + 0.5 - bz);
        if (w.occ[k] || w.lake[k] || w.decor[k] || h < 0.15 || rails?.has(k)) continue;
        let ok = false, extra = 0;
        // une grotte, une montagne : pas au milieu des dunes, s'il y a mieux
        const sand = w.biome[k] === BIOME_DESERT && (kind === 'cave' || kind === 'mountain') ? 15 : 0;
        if (kind === 'forest') ok = w.veg[k] === VEG_FOREST && d > 8;
        else if (kind === 'plain') ok = w.veg[k] === 0 && !w.road[k] && slope < 0.5 && h < 3 && d > 10;
        else if (kind === 'river') ok = sea ? w.nearWater(x, z, 2) && d > 7 && this.openSea(x, z) : w.nearWater(x, z, 1) && d > 7;
        else if (kind === 'mountain') {
          // un replat où l'on tient debout, mais au pied d'une paroi ou haut dans le massif (au pied d'une simple butte, s'il le faut)
          const up = slope < 1.2 && (h > 1 || loose) && d > 9 ? rise(x, z) : 0;
          if (up > (loose ? 0.6 : 1.4) || (h > 4.2 && slope < 1.2 && d > 9)) (town[k] ? cand : outside).push([x + 0.5, z + 0.5, Math.abs(d - ideal) - Math.min(up, 4) * 3 + sand + this.rnd() * 5]);
          continue;
        }
        // devant une grotte ou une faille : au bord de son emprise (une vraie grotte plutôt qu'une faille)
        else if (kind === 'cave') { const e = d > 6 ? w.outpostEntrance(x, z, 1) : -1; ok = e >= 0; extra = ok && w.veg[e] !== VEG_CAVE ? 10 : 0; }
        else ok = slope < 0.8 && d > 24 && !w.road[k] && w.veg[k] !== VEG_FIELD && w.veg[k] !== VEG_GARDEN;
        if (ok) (kind === 'cave' || !town[k] ? outside : cand).push([x + 0.5, z + 0.5, Math.abs(d - ideal) + extra + sand + this.rnd() * 5]);
      }
    // hors du village d'abord ; entre les maisons seulement s'il n'y a rien d'autre
    if (outside.length) cand.splice(0, cand.length, ...outside);
    cand.sort((a, b) => a[2] - b[2]);
    // deux équipes ne vont pas camper au même endroit
    const free = cand.filter(([x, z]) => !this.active.some((a) => Math.hypot(a.dest[0] - x, a.dest[1] - z) < 3));
    // atteignable à pied, et sans un détour démesuré (un lac, une chaîne de montagnes à contourner) : l'équipe arrive vraiment
    // sur place, au lieu d'y « travailler » à mi-chemin ; faute de mieux, le premier lieu atteignable
    const from = w.ci(Math.floor(bx), Math.floor(bz));
    let far: [number, number] | null = null;
    for (const [x, z] of (free.length ? free : cand).slice(0, 16)) {
      const p = this.agents.findPath(from, w.ci(Math.floor(x), Math.floor(z)));
      if (!p) continue;
      if (p.length <= Math.max(24, Math.hypot(x - bx, z - bz) * 1.8)) return [x, z];
      far ??= [x, z];
    }
    return far;
  }

  /**
   * La côte s'ouvre-t-elle sur le large ? Tout droit depuis cette case, huit cases de mer au moins (pas un lac), dont de
   * l'eau profonde : de quoi aller bien plus loin que la rive
   */
  private openSea(x: number, z: number, len = 8): boolean {
    const w = this.world;
    for (let d = 0; d < 8; d++) {
      const dx = Math.round(Math.cos((d * Math.PI) / 4)), dz = Math.round(Math.sin((d * Math.PI) / 4));
      let wet = 0, deep = false;
      for (let s = 1; s <= len + 4; s++) {
        const cx = x + dx * s, cz = z + dz * s;
        if (!w.inCells(cx, cz) || w.lake[w.ci(cx, cz)]) break;
        const h = w.cellAvg(cx, cz);
        if (h < -0.1) { wet++; if (h < -0.5) deep = true; } else if (wet) break;
      }
      if (wet >= len && deep) return true;
    }
    return false;
  }

  /** Le climat de l'endroit est chaud (désert, tropiques, marais) : les crocodiles y hantent les eaux douces */
  private warm([x, z]: [number, number]) {
    const w = this.world, cx = Math.floor(x), cz = Math.floor(z);
    return w.inCells(cx, cz) && [BIOME_DESERT, BIOME_TROPICAL, BIOME_MARSH].includes(w.biome[w.ci(cx, cz)]);
  }

  /** Au pied du cosmodrome : une case libre le long de son emprise, la plus proche du village, où l'on arrive à pied */
  private padSide(base: [number, number]): [number, number] | null {
    const w = this.world, cand: [number, number, number][] = [];
    for (const b of w.buildings.values()) {
      if (b.kind !== 'spaceport') continue;
      const s = sizeOf(b);
      for (let z = b.z - 1; z <= b.z + s; z++)
        for (let x = b.x - 1; x <= b.x + s; x++) {
          if ((x >= b.x && x < b.x + s && z >= b.z && z < b.z + s) || !w.inCells(x, z)) continue;
          const k = w.ci(x, z);
          if (w.occ[k] || w.lake[k] || w.decor[k] || w.cellAvg(x, z) < 0.1) continue;
          cand.push([x + 0.5, z + 0.5, Math.hypot(x + 0.5 - base[0], z + 0.5 - base[1])]);
        }
    }
    cand.sort((p, q) => p[2] - q[2]);
    const from = w.ci(Math.floor(base[0]), Math.floor(base[1]));
    for (const [x, z] of cand.slice(0, 24)) if (this.agents.findPath(from, w.ci(Math.floor(x), Math.floor(z)))) return [x, z];
    return null;
  }
}
