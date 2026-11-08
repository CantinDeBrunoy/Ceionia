import { World, N, VEG_FOREST, VEG_CAVE, VEG_FIELD, VEG_GARDEN, BIOME_DESERT, BIOME_TROPICAL, BIOME_MARSH } from '../world/world';
import { Agents, Kit } from './agents';
import { MISSIONS, Mission, Choice, DestKind, Effect, applyEffects, effectSummary, penHerds, redoEffects, choiceAt, RECENT_EVENTS } from './missions';
import { Underground, FIGHT_HALT, UZ_STONE, UZ_CRYSTAL, UZ_ICE, UZ_LUSH, UZ_MAGMA } from '../world/underground';
import { AGES, KINDS, KindId, sizeOf, lineOf, reqLine } from '../build/catalog';
import { GEAR_BY, Gear, GearId, Pack, loadout, packLabel, gearShort, gearCost, gearCostLabel, payGear, dangersOf, huntWeapon } from './gear';
import { ExpEvent, pickEvent, waitTime } from './events';
import { YIELD, Resource, REFINE_CRUDE, FUEL_PER_CRUDE, CAR_FUEL } from './economy';
import { allServed, railBoost, spaceRail, SPACE_RAIL_RISK, SPACE_RAIL_WORK } from './freight';
import { rulesOf } from './difficulty';
import { securityK } from './security';
import { FORGE_PERK, FORGE_RISK, FORGE_CRAFT } from './kingdom';
import { hash2 } from '../core/rng';
import { tr } from '../i18n';
import { AirTrip, AirKind, AirPose, airTrip, airSeats, flightPose } from './airlift';

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
  /**
   * troupe sous terre (moteur du monde souterrain, gardé pour les Enfers ; aucune mission ne l'emploie pour l'instant) : cases
   * visées, case où elle descend (-1 : en surface), son point le plus avancé
   */
  targets: number[];
  entry: number;
  front: number;
  /** embuscades sur son chemin, longueur de son parcours (haltes comprises) et sa force au combat */
  ambush: Ambush[];
  routeLen: number;
  might: number;
  /** chevaux de l'écurie partis avec l'équipe */
  mounts: number;
  /** la mission avait déjà été réussie : on la refait (bêtes, minerai, vivres ; bonus durables seulement passagers) */
  redo: boolean;
  /** l'équipe vole (héliport, aérodrome) vers la montagne ou le bout du monde : son voyage (voir `airlift`) */
  air?: AirTrip | null;
  /** aucun imprévu ne convenait à l'arrivée : le premier survient pendant le travail */
  arriveMiss?: boolean;
  /** un éclaireur parti devant (« Envoyer un éclaireur devant ») : depuis combien de temps, sur combien ; la troupe l'attend */
  scout?: { t: number; dur: number } | null;
  /**
   * la chasse au monstre (mégalodon, kraken, dragon) : l'issue du combat, tirée un peu avant la fin du travail (à `FATE_AT`) pour
   * que le monstre meure (ou s'échappe) sous les yeux de l'équipe, avant qu'elle ne reparte ; elle devient `ok` à la fin
   */
  fate?: boolean;
}

/** Les chasses où le monstre meurt sur place : l'issue s'y tire avant la fin du travail */
export const FATED = new Set<string>(['megalodon', 'kraken', 'dragon']);
/** Part du travail où se joue l'issue d'une chasse au monstre (après le dernier imprévu, qui survient aux trois quarts au plus) */
export const FATE_AT = 0.8;
/** Phare et chantier naval veillent sur les expéditions en mer : risque en moins (les deux se cumulent) */
export const LIGHTHOUSE_RISK = 0.88, SHIPYARD_RISK = 0.9;
/** Les chasses en haute mer : jamais sur une simple rivière */
const OPEN_SEA = new Set<string>(['megalodon', 'kraken']);
/**
 * Le dégagement voulu autour du point de combat (cases de haute mer libre, dans tous les sens), au mieux puis au pire : de quoi
 * tenir toute la scène (les deux galères, le monstre qui tourne autour, ses bonds, ses tentacules) et la vue tout autour
 */
export const SEA_CLEAR = 8, SEA_CLEAR_MIN = 6;

/**
 * La haute mer : les cases d'eau de mer (hors lacs) reliées au large, c'est-à-dire au bord de la carte. Une mer intérieure, un
 * étang côtier sous le niveau de la mer n'en sont pas, si grands soient-ils
 */
export function openWater(w: World): Uint8Array {
  const m = new Uint8Array(N * N), st: number[] = [];
  const add = (x: number, z: number) => {
    if (!w.inCells(x, z)) return;
    const k = w.ci(x, z);
    if (m[k] || w.lake[k] || w.cellAvg(x, z) >= -0.1) return;
    m[k] = 1; st.push(k);
  };
  for (let i = 0; i < N; i++) { add(i, 0); add(i, N - 1); add(0, i); add(N - 1, i); }
  while (st.length) {
    const k = st.pop()!, x = k % N, z = (k - x) / N;
    add(x + 1, z); add(x - 1, z); add(x, z + 1); add(x, z - 1);
  }
  return m;
}

/**
 * Le dégagement d'un point de mer : la distance, au plus `max`, dont on peut s'en écarter dans toutes les directions sans
 * rencontrer ni rive, ni lac, ni rocher qui perce l'eau (0 si le point n'est pas en mer) ; avec `sea` (voir `openWater`),
 * seulement de la haute mer
 */
export function seaClearance(w: World, x: number, z: number, max = 8, sea?: Uint8Array): number {
  let room = max;
  for (let d = 0; d < 16 && room > 0; d++) {
    const ux = Math.cos((d * Math.PI) / 8), uz = Math.sin((d * Math.PI) / 8);
    let run = 0;
    for (let k = 0.5; k <= room; k += 0.5) {
      const cx = Math.floor(x + ux * k), cz = Math.floor(z + uz * k);
      if (!w.inCells(cx, cz) || w.lake[w.ci(cx, cz)] || (sea && !sea[w.ci(cx, cz)]) || w.hAt(x + ux * k, z + uz * k) >= -0.1) break;
      run = k;
    }
    room = Math.min(room, run);
  }
  // (le point lui-même aussi)
  const cx = Math.floor(x), cz = Math.floor(z);
  if (sea && (!w.inCells(cx, cz) || !sea[w.ci(cx, cz)])) return 0;
  return room;
}

/** Jusqu'où, depuis la côte, la troupe va chercher la haute mer (cases) */
export const OFFING_REACH = 24;
/**
 * Les exigences sur le point de combat, de la meilleure à la moins bonne : son dégagement, et sa marge en plus jusqu'au bord de
 * la carte (que la vue du combat ne montre pas le bout du monde)
 */
export const OFFING_LEVELS: [clear: number, pad: number][] = [[SEA_CLEAR, 8], [SEA_CLEAR, 0], [SEA_CLEAR_MIN, 0]];

/** Le point de combat depuis la côte (x, z), à la meilleure exigence possible (voir `OFFING_LEVELS`), à partir de `from` */
export function huntSpot(w: World, x: number, z: number, sea: Uint8Array, room: Float32Array, from = 0) {
  for (let i = from; i < OFFING_LEVELS.length; i++) { const [c, p] = OFFING_LEVELS[i], o = offing(w, x, z, c, sea, room, OFFING_REACH, p); if (o) return o; }
  return null;
}

/**
 * Le large de chaque case : à combien de cases (environ, par le milieu des cases) commence ce qui n'est pas la haute mer
 * (`sea`, voir `openWater`) ou le bord de la carte ; 0 hors de la haute mer
 */
export function seaRoomMap(sea: Uint8Array): Float32Array {
  const r = new Float32Array(N * N), D = Math.SQRT2;
  for (let k = 0; k < N * N; k++) r[k] = sea[k] ? 1e9 : 0;
  const at = (x: number, z: number) => (x < 0 || z < 0 || x >= N || z >= N ? 0 : r[z * N + x]);
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      const k = z * N + x;
      if (r[k]) r[k] = Math.min(r[k], at(x - 1, z) + 1, at(x, z - 1) + 1, at(x - 1, z - 1) + D, at(x + 1, z - 1) + D);
    }
  for (let z = N - 1; z >= 0; z--)
    for (let x = N - 1; x >= 0; x--) {
      const k = z * N + x;
      if (r[k]) r[k] = Math.min(r[k], at(x + 1, z) + 1, at(x, z + 1) + 1, at(x + 1, z + 1) + D, at(x - 1, z + 1) + D);
    }
  return r;
}

/**
 * Le point de combat d'une chasse en haute mer, depuis la côte (x, z) : tout droit sur la haute mer (`sea`, voir `openWater`)
 * depuis le mouillage, le plus proche point dégagé de `clear` cases tout autour ; et le mouillage (le premier point d'eau
 * sur ce cap). Rien si la côte ne donne pas sur une telle étendue. `room` : le large de chaque case (voir `seaRoomMap`), pour
 * écarter vite les points trop près d'une rive
 */
export function offing(w: World, x: number, z: number, clear: number, sea: Uint8Array, room = seaRoomMap(sea), reach = OFFING_REACH, pad = 0): { at: [number, number]; moor: [number, number] } | null {
  let best: { at: [number, number]; moor: [number, number] } | null = null, bd = Infinity;
  const open = (px: number, pz: number) => { const cx = Math.floor(px), cz = Math.floor(pz); return w.inCells(cx, cz) && sea[w.ci(cx, cz)] === 1 && w.hAt(px, pz) < -0.1; };
  for (let d = 0; d < 16; d++) {
    const ux = Math.cos((d * Math.PI) / 8), uz = Math.sin((d * Math.PI) / 8);
    let moor: [number, number] | null = null;
    for (let s = 0.5; s <= reach && s < bd; s += 0.5) {
      const px = x + ux * s, pz = z + uz * s;
      if (!open(px, pz)) {
        // une bande de rive avant la mer (trois cases au plus) ; une fois au large, la terre arrête le cap
        if (moor || s > 3) break;
        continue;
      }
      moor ??= [px, pz];
      // (à chaque case)
      if (s % 1 || room[w.ci(Math.floor(px), Math.floor(pz))] < clear || Math.min(px, pz, N - px, N - pz) < clear + pad) continue;
      if (seaClearance(w, px, pz, clear, sea) >= clear) { best = { at: [px, pz], moor }; bd = s; break; }
    }
  }
  return best;
}

/**
 * À quelle part du travail survient le prochain imprévu de l'équipe : le premier à l'arrivée (sinon au tiers du travail), le
 * suivant à mi-chemin, un autre encore aux trois quarts ; jamais deux à la suite
 */
export function nextEventAt(a: Pick<ActiveExpedition, 'seen' | 'arriveMiss'>): number {
  const i = a.seen.length + (a.arriveMiss ? 1 : 0);
  return i <= 0 ? 0.3 : i === 1 ? 0.55 : 0.75;
}

/** L'équipe est sous terre (troupe armée ou éclaireurs dans les galeries) : c'est dans le monde souterrain qu'on la suit */
export const isBelow = (a: Pick<ActiveExpedition, 'entry' | 'phase'>) => a.entry >= 0 && a.phase === 'work';

/** Créatures qui tendent des embuscades aux troupes armées */
export type FoeKind = 'zombie' | 'skeleton' | 'spider' | 'golem' | 'worm';
/**
 * Embuscade dans les galeries sauvages : la case où elle surgit, les créatures et leur nombre, le moment (temps de parcours
 * de la troupe) ; l'issue est tirée quand elle survient, ses blessés comptés à la fin du combat
 */
export interface Ambush { cell: number; kind: FoeKind; n: number; t0: number; state: 'wait' | 'fight' | 'done'; result: 'clean' | 'hurt' | 'rout' | null }

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
export class Expeditions {
  active: ActiveExpedition[] = [];
  onReport: ((r: Report) => void) | null = null;
  /** une nouvelle à annoncer */
  onNews: ((msg: string) => void) | null = null;
  /** une équipe attend une décision */
  onEvent: ((a: ActiveExpedition) => void) | null = null;
  /** population du village, donnée par le jeu */
  pop: () => number = () => 0;
  private nextId = 1;
  /** le monde souterrain, où descendraient les troupes (donné par le jeu ; moteur gardé pour les Enfers) */
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
  /** Le village en a-t-il un, déjà bâti, ou amélioré depuis (une gare devenue gare centrale compte encore comme une gare) ? */
  has(kind: string) {
    const line: string[] = KINDS[kind as KindId] ? lineOf(kind as KindId) : [kind];
    // la gare centrale et la gare maglev sont des gares aussi
    if (kind === 'station') line.push('terminal', 'maglev');
    for (const b of this.world.buildings.values()) if (line.includes(b.kind)) return true;
    return false;
  }
  /** Le village a-t-il ce bâtiment qu'exige une mission parmi d'autres (`reqs`) ? Chacun compte à part (voir `reqLine`) */
  hasFor(kind: KindId, reqs: readonly KindId[]) {
    const line: string[] = reqLine(kind, reqs);
    for (const b of this.world.buildings.values()) if (line.includes(b.kind)) return true;
    return false;
  }

  /**
   * Risque réel d'un choix : une école prépare mieux les équipes, un observatoire leur lit le ciel, un institut de recherche
   * les équipe ; pompiers et police veillent (voir `securityK`)
   */
  riskOf(c: Choice) {
    // un train de voyageurs amène les équipes au cosmodrome : les expéditions spatiales sont plus sûres
    const rail = c.dest === 'spaceport' && spaceRail(this.world);
    return c.risk * (this.has('school') ? 0.7 : 1) * (this.has('observatory') ? 0.85 : 1) * (this.has('research') ? 0.8 : 1) * (rail ? SPACE_RAIL_RISK : 1) * securityK(dangersOf(c), (k) => this.has(k)) * rulesOf(this.world.difficulty).riskK
      // la forge infernale, rapportée de la chute du royaume des Enfers, équipe mieux les équipes
      * (this.world.exp.perks.includes(FORGE_PERK) ? FORGE_RISK : 1)
      // en mer : le feu du phare guide les marins, le chantier naval répare et arme les bateaux
      * (c.sea ? (this.has('lighthouse') ? LIGHTHOUSE_RISK : 1) * (this.has('shipyard') ? SHIPYARD_RISK : 1) : 1);
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
    for (const k of m.requires?.kinds ?? []) if (!this.hasFor(k, m.requires!.kinds!)) out.push(`bâtir : ${this.nameOf(k)}`);
    return out;
  }

  /** Chevaux à l'écurie, prêts à partir */
  horsesHome() { let n = 0; for (const h of penHerds(this.world).stables.values()) n += h.length; return n; }

  /** Pourquoi l'on ne peut pas partir (ou null) */
  why(m: Mission, c: Choice): string | null {
    if (this.running(m)) return 'Cette expédition est déjà en route.';
    // une partie commencée avant l'île du portail n'en a pas
    if (c.scene === 'portal' && !this.world.portal) return 'Cette carte n’a pas d’île du portail : la partie a commencé avant elle. Une nouvelle partie en aura une.';
    const miss = this.missing(m);
    if (miss.length) return `Il faut d’abord ${miss.join(', ')}.`;
    if (c.mounts) { const n = this.horsesHome(); if (n < c.mounts) return `Il faut ${c.mounts} chevaux ${this.at('stable')} (${n} pour l’instant).`; }
    // les blindés roulent au carburant : la raffinerie le tire du pétrole brut des puits
    if (c.fuel && !this.world.unlimited && this.world.fuel < c.fuel) {
      const n = Math.floor(this.world.fuel);
      return `Il faut ${c.fuel} carburant pour les véhicules (${n} pour l’instant) : ${this.has('refinery') ? 'la raffinerie en tire du pétrole brut des puits' : 'forez des puits de pétrole sur un gisement et bâtissez une raffinerie'}.`;
    }
    const max = this.slots();
    if (this.active.length >= max) {
      return max < MAX_TEAMS
        ? `Toutes les équipes sont en route (${this.active.length}/${max}) : à ${max * PER_TEAM} habitants, le village pourra en envoyer une de plus.`
        : `Toutes les équipes sont en route (${max}/${max}).`;
    }
    if (!this.base()) return 'Il faut d’abord un village : une maison au moins.';
    const free = this.agents.available();
    if (free < this.need(c)) return `Il faut ${c.party} habitants disponibles (${free} pour l’instant).`;
    return null;
  }

  /** tutoriel en cours : une équipe plus petite suffit (au moins un habitant), le village débute à peine */
  lenient = false;
  need(c: Choice) { return this.lenient ? Math.min(c.party, Math.max(1, this.agents.available())) : c.party; }

  /** pourquoi le dernier départ a échoué alors que `why` ne disait rien (pas de haute mer à portée…), ou null */
  lastFail: string | null = null;

  start(m: Mission, ci: number, age = m.age): ActiveExpedition | null {
    const c = m.choices[ci] ? choiceAt(m.choices[ci], age) : undefined;
    if (!c || this.why(m, c)) return null;
    const base = this.base()!;
    // chaque équipe va où la mène sa mission
    let kind: DestKind | null = c.dest, dest: [number, number] | null = null, sea = !!c.sea;
    // les grands Jeux se tiennent au pied du stade
    if (c.scene === 'games') dest = this.padSide(base, 'stadium');
    // la galère du portail part de la côte qui fait face à l'île
    else if (c.scene === 'portal') {
      dest = this.portalShore(base);
      // sans rive idéale, les habitants se débrouillent : la rive la plus proche, ou le village même
      if (!dest) dest = this.portalShore(base, true) ?? base;
    }
    this.lastFail = null;
    while (kind && !dest) {
      const monster = sea && kind === 'river' && OPEN_SEA.has(c.scene);
      // la chasse au monstre des mers se fait en haute mer : une côte d'où l'on gagne une vaste étendue d'eau profonde, sans
      // rive ni falaise tout autour
      dest = this.findDest(kind, base, false, sea && kind === 'river', 8, monster ? 0 : -1);
      // faute de mieux, une haute mer un peu moins dégagée (voir `OFFING_LEVELS`) ; jamais une mer intérieure ni un étang
      if (!dest && monster) {
        for (let lv = 1; lv < OFFING_LEVELS.length && !dest; lv++) dest = this.findDest(kind, base, false, true, 5, lv);
        if (!dest) { this.lastFail = 'Aucune haute mer atteignable : aucune côte à portée du village ne s’ouvre sur le large, et le monstre ne quitte pas la haute mer.'; return null; }
        break;
      }
      // pas de côte ouverte sur le large à portée : la rivière la plus proche fera l'affaire
      if (!dest && sea && kind === 'river') { sea = false; continue; }
      // une grotte introuvable : dans la montagne, puis au pied de la moindre paroi, plutôt qu'au milieu de la plaine
      if (!dest && c.dest === 'cave' && kind === 'mountain') dest = this.findDest('mountain', base, true);
      if (!dest) kind = FALLBACK[kind];
    }
    if (!dest || !kind) return null;
    // une fois la course automobile gagnée ET l'usine automobile bâtie, les équipes (hors troupes armées) partent en petites voitures d'époque, pas à cheval ;
    // à l'époque moderne, la troupe qui brûle du carburant roule : des blindés pour la charge, des véhicules pour les autres
    const armored = !!c.fuel && c.troop === 'cavalry';
    const motor = (age >= 3 && this.world.exp.done.includes('motorcar') && this.has('carworks') && !c.troop && !c.mounts) || (!!c.fuel && !armored);
    // la montagne et le bout du monde se gagnent en l'air quand le village a de quoi s'envoler : pas de chevaux, pas de voiture
    const air = c.troop || c.mounts || sea || m.farewell || c.fuel || c.scene === 'balloon' ? null : this.airFor(kind, age, base, dest);
    const mounts = motor || air ? 0 : this.mountsFor(c);
    const party = this.agents.recruit(this.need(c));
    if (!party) { this.lastFail = 'Pas assez d’habitants prêts à partir à cet instant : réessayez dans un moment.'; return null; }
    this.world.exp.riding += mounts;
    if (c.fuel && !this.world.unlimited) this.world.fuel = Math.max(0, this.world.fuel - c.fuel);
    // l'équipe emporte le meilleur équipement en réserve contre les dangers du voyage
    const { take, k } = loadout(c, this.world.exp.gear);
    for (const [g, n] of Object.entries(take) as [GearId, number][]) this.world.exp.gear[g] -= n;
    const a: ActiveExpedition = {
      id: this.nextId++, m, c, phase: m.farewell ? 'gather' : 'out', t: 0, party, base, dest, ok: false, gear: take, riskK: k,
      wait: null, waitT: 0, hold: 0, events: c.work >= 20 && this.rnd() < 0.5 ? 2 : 1, seen: [], picks: [], notes: [], bonus: [], hurt: 0,
      // (le train de voyageurs amène l'équipe au cosmodrome : les préparatifs du lancement vont plus vite)
      extra: c.dest === 'spaceport' && spaceRail(this.world) ? -c.work * SPACE_RAIL_WORK : 0,
      // une grotte trouvée au pied d'une paroi reste une grotte : l'équipe y entre
      site: c.dest === 'cave' ? 'cave' : kind, age, sea: sea && kind === 'river',
      targets: [], entry: -1, front: -1, redo: this.done(m), mounts, ambush: [], routeLen: 0, might: 0, air,
    };
    // chacun reçoit sa part : l'arme, la torche, la corde, l'armure, et son cheval s'il y en a assez ; on part en selle
    const kits = party.map((): Kit => ({}));
    for (const g of ['plasma', 'assault', 'rifle', 'crossbow', 'sword', 'bow', 'spear'] as const) { let n = take[g] ?? 0; for (const kt of kits) if (n > 0 && !kt.weapon) { kt.weapon = g; n--; } }
    kits.forEach((kt, i) => {
      // les chasseurs du mammouth ont toujours leurs lances de chasse au poing (les armes du village, emportées en plus, rendent la chasse plus sûre)
      if (c.scene === 'mammoth' || c.scene === 'megalodon' || c.scene === 'kraken' || c.scene === 'dragon') kt.weapon ??= huntWeapon(age);
      if (i < (take.armor ?? 0) + (take.energyArmor ?? 0)) kt.armor = true;
      if (kits.length - 1 - i < (take.torch ?? 0)) kt.torch = true;
      else if (kits.length - 1 - i < (take.lamp ?? 0)) kt.lamp = true;
      if (i >= 1 && i <= (take.rope ?? 0)) kt.rope = true;
      // la charge de cavalerie part en cavaliers de l'époque (en chars à l'époque moderne) ; les autres équipes à cheval
      // restent des habitants en selle
      if (motor && !air) kt.car = true;
      else if (armored && i < 3) { kt.rider = true; kt.tank = true; }
      else if (i < mounts) { kt.horse = true; if (c.troop === 'cavalry') kt.rider = true; }
    });
    party.forEach((id, i) => this.agents.equip(id, kits[i]));
    // force au combat : chacun compte, davantage en armure, armé, à cheval (en char, plus encore) ou la torche au poing (les
    // monstres craignent la lumière)
    a.might = kits.reduce((s, k) => s + 1 + (k.armor ? 1 : 0) + (k.weapon ? 0.6 : 0) + (k.rider ? (k.tank ? 1.4 : 0.9) : 0) + (k.torch ? 0.3 : 0), 0);
    this.active.push(a);
    if (m.farewell) {
      // le grand départ : les colons se retrouvent d'abord au cœur du village, où tout le monde vient leur dire adieu
      this.agents.partyGo(party, base[0], base[1], 0.15);
    } else {
      // elle part aussitôt, chacun de là où il est, sans se rassembler d'abord au village (à l'aire d'envol s'il faut voler)
      this.agents.partyGo(party, air ? air.pad[0] : dest[0], air ? air.pad[1] : dest[1]);
      this.onNews?.(`${m.icon} L’expédition « ${m.title} » part ${air ? (air.kind === 'heli' ? 'en hélicoptère ' : 'en montgolfière ') : ''}vers ${destName(c)}.`);
    }
    return a;
  }

  /** vitesse du jeu : l'attente d'une décision se compte en secondes réelles (à ×4, on a le temps de la lire) */
  speed = 1;

  update(dt: number) {
    const ag = this.agents;
    this.craftStep(dt);
    this.mineStep(dt);
    for (const a of [...this.active]) {
      // une décision attendue : l'équipe patiente, puis tranche d'elle-même
      if (a.wait) {
        a.waitT += dt / Math.max(1, this.speed);
        if (a.waitT >= AUTO_DECIDE) this.decide(a, this.safest(a));
        continue;
      }
      // une attente choisie : le travail est suspendu, l'équipe reste là à attendre (elle ne fait pas l'action d'une autre option)
      if (a.hold > 0) {
        a.hold = Math.max(0, a.hold - dt);
        // l'éclaireur parti devant revient quand l'attente finit
        if (a.scout) { a.scout.t = Math.min(a.scout.dur, a.scout.t + dt); if (!a.hold) a.scout = null; }
        if (!a.hold && a.phase === 'work') ag.partyAct(a.party, 'work');
        continue;
      }
      // avec une écurie, les équipes vont à cheval : le travail sur place avance plus vite
      a.t += dt * (a.phase === 'work' && this.has('stable') ? 1.25 : 1);
      if (a.phase === 'work' && a.ambush.length) this.ambushStep(a);
      // (une équipe d'une ancienne sauvegarde, encore rassemblée au village, part à son tour)
      // les adieux durent un peu, le temps que le village acclame les colons
      if (a.phase === 'gather' && ((ag.partyDone(a.party) && a.t > (a.m.farewell ? 20 : 0)) || a.t > 40)) {
        a.phase = 'out'; a.t = 0;
        ag.partyGo(a.party, a.dest[0], a.dest[1]);
        this.onNews?.(`${a.m.icon} L’expédition « ${a.m.title} » part vers ${destName(a.c)}.`);
      } else if (a.phase === 'out' && this.arrived(a, dt)) {
        a.phase = 'work'; a.t = 0;
        ag.partyAct(a.party, 'work');
        ag.mountParty(a.party, false);
        // une troupe qui descend sous terre : on ne la voit plus en surface
        if (a.entry >= 0) ag.partyHide(a.party, true);
        this.raise(a, true);
      } else if (a.phase === 'work' && a.seen.length < a.events && a.t >= (a.c.work + a.extra) * nextEventAt(a)) {
        this.raise(a, false);
      } else if (a.phase === 'work' && a.fate === undefined && FATED.has(a.c.scene) && a.seen.length >= a.events && a.t >= (a.c.work + a.extra) * FATE_AT) {
        // la chasse au monstre se joue sous les yeux de l'équipe : il meurt (ou s'échappe) avant qu'elle ne reparte
        a.fate = this.rnd() >= this.chance(a);
      } else if (a.phase === 'work' && a.t >= a.c.work + a.extra && a.m.farewell) {
        // les colons sont partis pour de bon : pas de retour, le récit arrive aussitôt
        a.ok = this.rnd() >= this.chance(a);
        a.phase = 'home'; a.t = 4;
        ag.partyHide(a.party, true);
      } else if (a.phase === 'work' && a.t >= a.c.work + a.extra) {
        a.ok = a.fate ?? this.rnd() >= this.chance(a);
        a.phase = 'back'; a.t = 0;
        ag.mountParty(a.party, true);
        // en l'air : l'équipe rejoint d'abord l'appareil posé non loin ; sinon, elle rentre à pied
        if (a.air) { a.air.leg = 'fetch'; a.air.t = 0; ag.partyGo(a.party, a.air.land[0], a.air.land[1]); }
        else this.goHome(a);
        this.onNews?.(a.ok ? `${a.m.icon} « ${a.m.title} » : l’équipe rentre… et elle n’a pas l’air bredouille !` : `${a.m.icon} « ${a.m.title} » : l’équipe rentre, la mine basse.`);
      } else if (a.phase === 'back' && this.returned(a, dt)) {
        a.phase = 'home'; a.t = 0;
        ag.partyAct(a.party, a.ok ? 'cheer' : 'stroll');
      } else if (a.phase === 'home' && a.t > 4) this.finish(a);
    }
  }

  /** La troupe arrive sur une embuscade : les créatures chargent, le combat se joue ; à la fin, ses blessés et le récit */
  private ambushStep(a: ActiveExpedition) {
    const s = Math.min(1, a.t / Math.max(1, a.c.work + a.extra)) * a.routeLen;
    for (const m of a.ambush) {
      const name = FOE_NAME[m.kind];
      if (m.state === 'wait' && s >= m.t0) {
        m.state = 'fight';
        // l'issue : la force de la troupe contre le nombre et la férocité des créatures (plus grandes dans le magma)
        const threat = m.n * FOE_MIGHT[m.kind] * (this.under?.zone[m.cell] === UZ_MAGMA ? 1.25 : 1) * 0.9;
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
   * L'équipe est-elle arrivée sur place ? À pied : quand tous ont fini de marcher. En l'air : elle gagne l'aire d'envol, monte à
   * bord, vole, se pose et marche jusqu'à son lieu de travail
   */
  private arrived(a: ActiveExpedition, dt: number) {
    const ag = this.agents, air = a.air;
    if (!air) return ag.partyDone(a.party) || a.t > OUT_MAX;
    if (air.leg === 'walk') {
      if (ag.partyDone(a.party) || a.t > OUT_MAX / 4) { air.leg = 'out'; air.t = 0; this.airRide(a); }
    } else if (air.leg === 'out') {
      air.t += dt;
      if (air.t < air.dur) this.airRide(a);
      else {
        // posé : tout le monde descend et va à son ouvrage
        for (const id of a.party) ag.ride(id, null);
        ag.partyPlace(a.party, air.land[0], air.land[1]);
        ag.partyGo(a.party, a.dest[0], a.dest[1]);
        air.leg = 'ground'; air.t = 0;
      }
    } else return ag.partyDone(a.party) || a.t > OUT_MAX;
    return false;
  }

  /** L'équipe est-elle rentrée au village ? En l'air : elle rejoint l'appareil, vole jusqu'à l'aire d'envol, puis rentre à pied */
  private returned(a: ActiveExpedition, dt: number) {
    const ag = this.agents, air = a.air;
    if (!air) return ag.partyDone(a.party) || a.t > 240;
    if (air.leg === 'fetch') {
      air.t += dt;
      if (ag.partyDone(a.party) || air.t > 40) { air.leg = 'back'; air.t = 0; this.airRide(a); }
    } else if (air.leg === 'back') {
      air.t += dt;
      if (air.t < air.dur) this.airRide(a);
      else {
        for (const id of a.party) ag.ride(id, null);
        ag.partyPlace(a.party, air.pad[0], air.pad[1]);
        air.leg = 'home'; air.t = 0;
        this.goHome(a);
      }
    } else return ag.partyDone(a.party) || a.t > 240;
    return false;
  }

  /** Où est l'appareil de l'équipe (null : elle va à pied) : au sol sur l'aire d'envol ou d'atterrissage, ou en vol */
  airPose(a: ActiveExpedition): AirPose | null {
    const t = a.air;
    if (!t) return null;
    const w = this.world, surf = (x: number, z: number) => w.surfaceAt(x, z), head = Math.atan2(t.land[0] - t.pad[0], t.land[1] - t.pad[1]);
    const park = (p: [number, number]): AirPose => ({ x: p[0], z: p[1], y: surf(p[0], p[1]), heading: head, up: 0, moving: false });
    if (t.leg === 'out') return flightPose(t.kind, t.dur, t.pad, t.land, t.t, surf);
    if (t.leg === 'back') return flightPose(t.kind, t.dur, t.land, t.pad, t.t, surf);
    return park(t.leg === 'ground' || t.leg === 'fetch' ? t.land : t.pad);
  }

  /** L'équipe à bord : chacun à sa place dans l'appareil (assis dans l'hélicoptère, debout dans la nacelle), où qu'il soit en vol */
  private airRide(a: ActiveExpedition) {
    const p = this.airPose(a);
    if (!p || !a.air) return;
    const seats = airSeats(a.air.kind, a.party.length), c = Math.cos(p.heading), s = Math.sin(p.heading);
    a.party.forEach((id, i) => {
      const k = seats[i];
      this.agents.ride(id, { x: p.x + k.x * c + k.z * s, z: p.z - k.x * s + k.z * c, y: p.y + k.y, heading: p.heading + k.face, act: k.sit ? 'sit' : null });
    });
  }

  /** L'appareil qui emmènerait l'équipe : l'hélicoptère de l'héliport (âge moderne) ou la montgolfière de l'aérodrome, avec ses deux aires ; null si le village n'en a pas */
  private airFor(kind: DestKind | null, age: number, base: [number, number], dest: [number, number]): AirTrip | null {
    if (kind !== 'mountain' && kind !== 'far') return null;
    const air: AirKind | null = age >= 4 && this.has('heliport') ? 'heli' : age >= 3 && this.has('aerodrome') ? 'balloon' : null;
    if (!air) return null;
    const pad = this.padSide(base, air === 'heli' ? 'heliport' : 'aerodrome'), land = this.landing(dest, base);
    return pad && land ? airTrip(air, pad, land) : null;
  }

  /** Aire d'atterrissage près du lieu de travail : la case libre la moins pentue autour, sur le côté (la scène occupe le cœur du lieu), d'où l'on rejoint le lieu à pied */
  private landing(dest: [number, number], base: [number, number]): [number, number] | null {
    const w = this.world, side = Math.atan2(base[1] - dest[1], base[0] - dest[0]) + Math.PI / 2, cand: [number, number, number][] = [];
    for (const r of [1.6, 2.3, 3])
      for (let k = 0; k < 8; k++) {
        const ang = side + (k * Math.PI) / 4, x = dest[0] + Math.cos(ang) * r, z = dest[1] + Math.sin(ang) * r, cx = Math.floor(x), cz = Math.floor(z);
        if (!w.inCells(cx, cz)) continue;
        const i = w.ci(cx, cz);
        if (w.occ[i] || w.lake[i] || w.decor[i] || w.cellAvg(cx, cz) < 0.1) continue;
        cand.push([x, z, w.cellSlope(cx, cz) + r * 0.05 + k * 0.01]);
      }
    cand.sort((p, q) => p[2] - q[2]);
    const goal = w.ci(Math.floor(dest[0]), Math.floor(dest[1]));
    for (const [x, z] of cand.slice(0, 10)) if (this.agents.findPath(w.ci(Math.floor(x), Math.floor(z)), goal)) return [x, z];
    return null;
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
    const ev = pickEvent({ dest: a.site, mission: a.m.id, scene: a.c.scene, age: a.age, arrive, sea: a.sea, warm: this.warm(a.dest), at: arrive ? undefined : nextEventAt(a) }, a.seen, avoid, this.rnd);
    // rien à l'arrivée : l'imprévu viendra pendant le travail (avant, il était perdu, et le suivant avec lui)
    if (!ev) { if (arrive) a.arriveMiss = true; else a.events = a.seen.length; return; }
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
    // envoyer un éclaireur devant : la troupe l'attend sur place le temps qu'il aille reconnaître le chemin et revienne
    const waits = (!!o.wait || !!o.scout) && a.phase === 'work';
    a.extra += waits ? Math.min(0, o.work ?? 0) : o.work ?? 0;
    if (waits) a.hold = waitTime(o);
    a.scout = waits && o.scout ? { t: 0, dur: a.hold } : null;
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
    const text = a.ok ? a.c.winText : a.c.loseText;
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
    this.agents.dismiss(a.party, injured, days * this.dayLen() * (this.has('health') ? 0.5 : 1) * (a.gear.kit ? 0.5 : 1));
    this.active.splice(this.active.indexOf(a), 1);
    this.world.version++;
    const summary = [effectSummary(eff), lost].filter((x) => x && x !== 'rien').join(' · ') || 'rien';
    this.onReport?.({ m: a.m, c: a.c, ok: a.ok, text, summary, notes: a.notes, redo: a.redo });
  }

  // ---------------- Fabrication de l'équipement ----------------
  /** Pourquoi le village ne peut pas fabriquer cette pièce (ou null) */
  whyCraft(g: Gear, age: number): string | null {
    if (age < g.age) return tr('Connu à l’âge {age}', { age: AGES[g.age].name });
    if (g.needs && !this.has(g.needs)) {
      const name = KINDS[g.needs].names[Math.min(age, AGES.length - 1)].toLowerCase();
      // l'atelier porte le nom de l'âge (une forge au Moyen Âge) : on dit les deux
      return g.needs === 'workshop' ? tr('Il faut un atelier pour fabriquer {items} : bâtissez-en un (à votre âge : {name})', { items: g.plural.toLowerCase(), name }) : tr('Il faut : {name}', { name });
    }
    const lack = gearShort(this.world, g); if (lack) return lack;
    if (this.world.exp.craft.length >= MAX_CRAFT) return tr('La file de fabrication est pleine ({n} pièces) : attendez qu’une pièce sorte', { n: MAX_CRAFT });
    return null;
  }

  /**
   * Pourquoi le village ne peut pas fabriquer tout ce lot de pièces d'un coup (ou null) : l'atelier, le total du prix et la
   * place dans la file, pour ne rien commander à moitié
   */
  whyCraftAll(ids: readonly GearId[], age: number): string | null {
    if (!ids.length) return null;
    for (const id of ids) { const g = GEAR_BY[id]; if (age < g.age || (g.needs && !this.has(g.needs))) return this.whyCraft(g, age); }
    const w = this.world, tot = { wood: 0, stone: 0, ore: 0, fuel: 0 };
    for (const id of ids) { const c = gearCost(GEAR_BY[id], w.difficulty); tot.wood += c.wood; tot.stone += c.stone; tot.ore += c.ore; tot.fuel += c.fuel ?? 0; }
    if (!w.unlimited && (w.wood < tot.wood || w.stone < tot.stone || w.ore < tot.ore || w.fuel < tot.fuel)) {
      return tr('Il faut {cost} en tout pour {items}', { cost: gearCostLabel({ wood: tot.wood, stone: tot.stone, ore: tot.ore, ...(tot.fuel ? { fuel: tot.fuel } : {}) }), items: ids.map((i) => GEAR_BY[i].name.toLowerCase()).join(tr(' et ')) });
    }
    if (w.exp.craft.length + ids.length > MAX_CRAFT) return tr('La file de fabrication est pleine ({n} pièces) : attendez qu’une pièce sorte', { n: MAX_CRAFT });
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
    // une gare de marchandises à côté : le bâtiment produit davantage
    const st = allServed(this.world);
    for (const b of this.world.buildings.values()) {
      const y = YIELD[b.kind];
      if (!y) continue;
      const k = railBoost(this.world, b, st);
      for (const r of Object.keys(y) as Resource[]) rate[r] += (y[r]![b.age] ?? 0) * k;
    }
    return rate;
  }

  /** Pétrole brut que les raffineries peuvent traiter par jour */
  refining() {
    const st = allServed(this.world);
    let n = 0;
    for (const b of this.world.buildings.values()) if (b.kind === 'refinery') n += REFINE_CRUDE * railBoost(this.world, b, st);
    return n;
  }

  /** Carburant que brûlent chaque jour les automobiles (celles des usines automobiles) */
  burning() { let n = 0; for (const b of this.world.buildings.values()) if (b.kind === 'carworks') n += CAR_FUEL; return this.world.unlimited ? 0 : n; }

  /** Les automobiles roulent-elles ? Il faut une usine automobile, et du carburant (sauf en ressources illimitées) */
  cars() {
    let n = 0;
    for (const b of this.world.buildings.values()) if (b.kind === 'carworks') n++;
    return n > 0 && (this.world.unlimited || this.world.fuel > 0);
  }

  /**
   * Ce que le village produit chaque jour : bois des bûcherons, pierre des carrières et des mines, minerai des mines ; le
   * pétrole brut des puits, moins ce qu'en raffinent les raffineries (tant qu'il y en a), et le carburant qu'elles en tirent
   */
  daily(): Record<Resource, number> {
    const rate = this.yields(), cap = this.refining();
    const use = Math.min(cap, this.world.crude >= 1 ? cap : rate.crude);
    rate.crude -= use;
    rate.fuel += use * FUEL_PER_CRUDE - this.burning();
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
    // les automobiles brûlent leur carburant au fil des heures
    const burn = this.burning();
    if (burn) w.fuel = Math.max(0, w.fuel - day * burn);
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
    s.craftT += dt * (this.has('workshop') ? 1.5 : 1) * (s.perks.includes(FORGE_PERK) ? FORGE_CRAFT : 1);
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
      out: `${a.air ? (a.air.kind === 'heli' ? 'En hélicoptère' : 'En montgolfière') : 'En route'} vers ${destName(a.c)}…`,
      work: a.wait ? `Décision à prendre : ${a.wait.title.toLowerCase()}` : this.fighting(a) ?? `Sur place, l’équipe ${a.c.doing ?? a.c.label.toLowerCase()}…`,
      back: a.air ? `Retour au village en ${a.air.kind === 'heli' ? 'hélicoptère' : 'montgolfière'}…` : 'Retour au village…',
      home: a.ok ? 'De retour : le village fait la fête !' : 'De retour, bredouilles.',
    }[a.phase];
  }

  /**
   * Cœur du village : la place du village (le feu de camp, l'agora…), sinon le milieu des maisons ; on s'y rassemble sur la
   * case libre la plus proche, au bord de la place (d'abord au milieu de son côté sud)
   */
  base(): [number, number] | null {
    const w = this.world, bs = [...w.buildings.values()];
    const g = bs.find((b) => b.kind === 'gather');
    const houses = bs.filter((b) => b.kind === 'house');
    if (!g && !houses.length) return null;
    const gs = g ? sizeOf(g) : 1;
    let x = g ? g.x + gs / 2 : houses.reduce((s, b) => s + b.x + 0.5, 0) / houses.length;
    let z = g ? g.z + gs + 0.5 : houses.reduce((s, b) => s + b.z + 0.5, 0) / houses.length;
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
   * pied de la moindre paroi (une grotte qu'on ne trouve nulle part ailleurs). `hunt` : une chasse en haute mer, à cette
   * exigence (voir `OFFING_LEVELS`)
   */
  private findDest(kind: DestKind, base: [number, number], loose = false, sea = false, seaLen = 8, hunt = -1): [number, number] | null {
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
    const outside: [number, number, number][] = [], rails = this.avoidCells?.() ?? null, high = hunt >= 0 ? openWater(w) : null, room = high ? seaRoomMap(high) : null;
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
        else if (kind === 'river') ok = sea ? w.nearWater(x, z, 2) && d > 7 && (high ? !!offing(w, x + 0.5, z + 0.5, OFFING_LEVELS[hunt][0], high, room!, OFFING_REACH, OFFING_LEVELS[hunt][1]) : this.openSea(x, z, seaLen)) : w.nearWater(x, z, 1) && d > 7;
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
    const pool = free.length ? free : cand;
    for (const [x, z] of pool.slice(0, 40)) {
      const p = this.agents.findPath(from, w.ci(Math.floor(x), Math.floor(z)));
      if (!p) continue;
      if (p.length <= Math.max(24, Math.hypot(x - bx, z - bz) * 1.8)) return [x, z];
      far ??= [x, z];
    }
    // aucun chemin trouvé (village ceint de rails, de bâtiments ou d'eau) : on part quand même vers le meilleur lieu, plutôt que de renoncer
    return far ?? (pool.length ? [pool[0][0], pool[0][1]] : null);
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

  /**
   * D'où part la galère du portail : la rive du continent la plus proche de l'île, atteignable à pied depuis le village, d'où
   * l'on gagne l'île tout droit sur l'eau (sans toucher d'autre terre en chemin) ; null sans île ou sans telle rive
   */
  portalShore(base: [number, number], loose = false): [number, number] | null {
    const w = this.world, p = w.portal;
    if (!p) return null;
    const cand: [number, number, number][] = [];
    for (let z = 1; z < N - 1; z++)
      for (let x = 1; x < N - 1; x++) {
        const k = w.ci(x, z);
        if (w.onPortalIsland(x, z) || w.occ[k] || w.lake[k] || w.decor[k] || w.cellAvg(x, z) < 0.12) continue;
        if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => w.cellAvg(x + dx, z + dz) < -0.3 && !w.lake[w.ci(x + dx, z + dz)])) continue;
        cand.push([x + 0.5, z + 0.5, Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z)]);
      }
    cand.sort((a, b) => a[2] - b[2]);
    // tout droit sur l'eau : passé la rive, rien que la mer jusqu'à l'île
    const clear = (x: number, z: number) => {
      const dx = p.x - x, dz = p.z - z, L = Math.hypot(dx, dz);
      let wet = false;
      for (let s = 0.5; s < L; s += 0.5) {
        const cx = Math.floor(x + (dx / L) * s), cz = Math.floor(z + (dz / L) * s);
        if (w.onPortalIsland(cx, cz)) return wet;
        if (w.cellAvg(cx, cz) < -0.1) wet = true;
        else if (wet || s > 3.5) return false;
      }
      return wet;
    };
    const from = w.ci(Math.floor(base[0]), Math.floor(base[1]));
    // (une rive injoignable est souvent celle d'un îlot : on n'essaie plus ses voisines)
    const failed: [number, number][] = [];
    for (const [x, z] of cand) {
      if (failed.some(([fx, fz]) => Math.hypot(fx - x, fz - z) < 8) || (!loose && !clear(x, z))) continue;
      if (this.agents.findPath(from, w.ci(Math.floor(x), Math.floor(z)))) return [x, z];
      failed.push([x, z]);
      if (failed.length >= 40) break;
    }
    return null;
  }

  /** Le climat de l'endroit est chaud (désert, tropiques, marais) : les crocodiles y hantent les eaux douces */
  private warm([x, z]: [number, number]) {
    const w = this.world, cx = Math.floor(x), cz = Math.floor(z);
    return w.inCells(cx, cz) && [BIOME_DESERT, BIOME_TROPICAL, BIOME_MARSH].includes(w.biome[w.ci(cx, cz)]);
  }

  /** Au pied du cosmodrome (ou de l'héliport, de l'aérodrome) : une case libre le long de son emprise, la plus proche du village, où l'on arrive à pied */
  private padSide(base: [number, number], kind: KindId = 'spaceport'): [number, number] | null {
    const w = this.world, cand: [number, number, number][] = [];
    for (const b of w.buildings.values()) {
      if (b.kind !== kind) continue;
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
