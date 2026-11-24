import type { World } from '../world/world';
import type { KindId } from '../build/catalog';
import { KINDS } from '../build/catalog';
import { tr } from '../i18n';
import { archipelagoOn, isleName, rivalPeople } from './diplomacy';
import { zoneOf, type Concession } from '../world/concession';

/**
 * Les règles des zones (chantier C du nouveau monde, plan `.claude/plan-nouveau-monde.md`, partie 3) : ce qu'on bâtit dans la
 * concession chez l'allié et dans la tête de pont chez le rival, et ce que ces bâtiments apportent. Ils n'ont ni habitants
 * ni chemin (comme le comptoir) : ils comptent par leur présence. Tout se paie avec les stocks du village. La zone elle-même
 * (ses cases, sa plage, son camp) vient de `world/concession.ts`. Voir `docs/diplomatie.md`, « Les concessions »
 */

/** La tête de pont (la guerre) : chez le rival, une fois la plage prise */
export const FRONT_KINDS: KindId[] = ['frontTower', 'frontInfirmary', 'fort', 'battery', 'frontForge', 'garrison', 'milHospital', 'soldierClub', 'garrisonHouse', 'milHeliport', 'radar'];
/** La ville de garnison (au Moderne, autour du fort) : la caserne et deux autres de ces bâtiments font le chapitre */
export const GARRISON_KINDS: KindId[] = ['garrison', 'milHospital', 'soldierClub', 'garrisonHouse'];
export const GARRISON_NEED = 3;
/** La base arrière de la guerre, dans la concession alliée */
export const BACK_KINDS: KindId[] = ['allyBarracks', 'allyShipyard', 'allyHospital'];
/** La concession de la paix, chez l'allié */
export const PEACE_KINDS: KindId[] = ['merchantPort', 'exchangeHall', 'commonSchool', 'dispensary', 'researchCenter'];
/** Les maisons communes de la paix (à l'Industriel, deux des trois font le chapitre) */
export const COMMON_KINDS: KindId[] = ['exchangeHall', 'commonSchool', 'dispensary'];
export const COMMONS_NEED = 2;
/** Tous les bâtiments qui ne se posent que dans une zone */
export const ZONE_KINDS: KindId[] = [...FRONT_KINDS, ...BACK_KINDS, ...PEACE_KINDS];
export const isZoneKind = (k: KindId) => ZONE_KINDS.includes(k);
/** Ce que la ligne de vapeurs du port marchand rapporte chaque jour (or) */
export const STEAMER_GOLD = 3;

type W = Pick<World, 'isles' | 'diplo'>;

/** La zone de l'allié : la concession (null sans archipel ou sans allié) */
export const allyZone = (w: World): Concession | null => (archipelagoOn(w) && w.diplo.ally ? zoneOf(w, w.diplo.ally) : null);
/** La zone du rival : la tête de pont (null sans archipel ou sans allié) */
export const rivalZone = (w: World): Concession | null => { const r = rivalPeople(w.diplo); return archipelagoOn(w) && r ? zoneOf(w, r) : null; };

/** La voie de la guerre (prise, ou la guerre gagnée) */
const warPath = (w: W) => w.diplo.path === 'war' || w.diplo.conflict === 'won';
/** La voie de la paix (prise, ou une paix déjà signée, un traité) */
const peacePath = (w: W) => w.diplo.path === 'peace' || w.diplo.conflict === 'peace' || w.diplo.conflict === 'treaty';

/**
 * La tête de pont est-elle à nous ? La plage prise (le camp posé), ou la guerre gagnée. La plage reperdue, la zone se ferme
 * et ses bâtiments attendent (comme la base des Enfers quand le portail se ferme)
 */
export const frontOpen = (w: W) => archipelagoOn(w) && !!w.diplo.ally && (w.diplo.conflict === 'won' || (w.diplo.path === 'war' && w.diplo.conflict === 'open' && w.diplo.camp.held.includes('plage')));

/** Le bâtiment est-il proposé dans cette partie ? (seulement sur sa voie : la tête de pont et la base arrière en guerre, la concession en paix) */
export function zoneKindOffered(w: W, k: KindId) {
  if (!isZoneKind(k)) return true;
  if (!archipelagoOn(w) || !w.diplo.ally) return false;
  return PEACE_KINDS.includes(k) ? peacePath(w) : warPath(w);
}

/** Pourquoi ce bâtiment de zone est verrouillé (null : on peut le bâtir), hors âge et bâtiment préalable */
export function zoneLock(w: Pick<World, 'isles' | 'diplo' | 'buildings'>, k: KindId): string | null {
  if (!isZoneKind(k)) return null;
  if (FRONT_KINDS.includes(k)) {
    if (!frontOpen(w)) return tr('Dans la tête de pont : d’abord débarquer et prendre la plage de l’île rivale');
    if (k === 'fort' && !w.diplo.camp.held.includes('port') && w.diplo.conflict !== 'won') return tr('Le fort se bâtit une fois le port de l’île rivale pris');
    if (GARRISON_KINDS.includes(k) && ![...w.buildings.values()].some((b) => b.kind === 'fort')) return tr('La ville de garnison grandit autour du fort : bâtissez d’abord le fort de la tête de pont');
  }
  return null;
}

/** La case de la tête de pont où le camp et la caserne avancée sont posés (réservée : on n'y bâtit pas) */
export function campReserved(w: World, x: number, z: number) {
  const zr = rivalZone(w);
  return !!zr && Math.hypot(x + 0.5 - zr.camp[0], z + 0.5 - zr.camp[1]) < 3.4;
}

/** La case est-elle dans la concession alliée ? */
export function inAllyZone(w: World, x: number, z: number) { const a = allyZone(w); if (!a || !w.inCells(x, z)) return false; const k = w.ci(x, z); return a.cells.has(k) || a.shore.has(k); }
/** La case est-elle dans la tête de pont tenue ? */
export function inFront(w: World, x: number, z: number) { const r = rivalZone(w); return !!r && frontOpen(w) && w.inCells(x, z) && r.cells.has(w.ci(x, z)); }

/**
 * Pourquoi ce bâtiment ne se pose pas sur l'emprise (x, z, s) (null : il s'y pose) : chaque liste dans sa zone, et rien
 * d'autre que la liste de guerre dans la tête de pont
 */
export function zoneWhy(w: World, k: KindId, x: number, z: number, s: number): string | null {
  if (!archipelagoOn(w)) return isZoneKind(k) ? tr('Il se bâtit dans une zone des îles rivales : explorez d’abord le monde') : null;
  const all = (f: (x: number, z: number) => boolean) => { for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) if (!f(x + i, z + j)) return false; return true; };
  const any = (f: (x: number, z: number) => boolean) => { for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) if (f(x + i, z + j)) return true; return false; };
  if (FRONT_KINDS.includes(k)) {
    const lock = zoneLock(w, k);
    if (lock) return lock;
    if (!all((a, b) => inFront(w, a, b))) return tr('Il se bâtit dans la tête de pont, la zone bornée de l’île rivale ({isle})', { isle: isleName(rivalPeople(w.diplo)!) });
    if (any((a, b) => campReserved(w, a, b))) return tr('C’est la place du camp et de la caserne avancée');
    return null;
  }
  if (BACK_KINDS.includes(k) || PEACE_KINDS.includes(k)) {
    if (!w.diplo.ally) return tr('Il se bâtit dans la concession de votre allié : choisissez-le d’abord');
    if (!all((a, b) => inAllyZone(w, a, b))) return tr('Il se bâtit dans la concession, la zone bornée que votre allié nous cède ({isle})', { isle: isleName(w.diplo.ally) });
    if (k === 'merchantPort' && !waterNear(w, x, z, s)) return tr('Le port marchand se pose au bord de l’eau : la mer à 3 cases au plus');
    return null;
  }
  // dans la tête de pont, seulement la liste de guerre (les routes, elles, y passent)
  if (frontOpen(w) && any((a, b) => inFront(w, a, b))) return tr('Dans la tête de pont, on ne bâtit que les bâtiments de la guerre');
  return null;
}

function waterNear(w: World, x: number, z: number, s: number) {
  for (let dz = -3; dz < s + 3; dz++) for (let dx = -3; dx < s + 3; dx++) if (w.inCells(x + dx, z + dz) && w.cellAvg(x + dx, z + dz) < -0.3) return true;
  return false;
}

/** Le nombre de bâtiments de chaque sorte dans la partie (où qu'ils soient : chaque liste ne se pose que dans sa zone) */
type Counts = Partial<Record<KindId, number>>;
const has = (c: Counts, k: KindId) => (c[k] ?? 0) > 0;

/** La ville de garnison est-elle bâtie ? (la caserne et deux autres de ses bâtiments) */
export function garrisonBuilt(c: Counts) {
  if (!has(c, 'garrison')) return false;
  return GARRISON_KINDS.reduce((n, k) => n + (c[k] ?? 0), 0) >= GARRISON_NEED;
}
/** Combien des bâtiments de la ville de garnison sont posés (pour la feuille de route), au plus `GARRISON_NEED` */
export const garrisonCount = (c: Counts) => Math.min(GARRISON_NEED, GARRISON_KINDS.reduce((n, k) => n + (c[k] ?? 0), 0));
/** Combien de maisons communes différentes sont bâties */
export const commonsCount = (c: Counts) => COMMON_KINDS.filter((k) => has(c, k)).length;

/**
 * Ce que la tête de pont et la base arrière apportent à la campagne (lu par `Game` pour chaque bataille et chaque pas de la
 * campagne ; tout à faux sans ces bâtiments)
 */
export interface FrontPerks {
  /** l'infirmerie de campagne : les pertes se refont deux fois plus vite */
  infirmary: boolean;
  /** le fort : le camp a deux fois plus de vie dans la défense */
  fort: boolean;
  /** la tour de guet : elle tire pendant les sorties */
  tower: boolean;
  /** la forge du front : +20 % de dégâts pour le corps */
  forge: boolean;
  /** la ville de garnison : le corps grandit de 8 hommes */
  garrison: boolean;
  /** le radar : les sorties s'annoncent un jour à l'avance */
  radar: boolean;
  /** la batterie côtière : elle pilonne la flotte rivale */
  battery: boolean;
  /** la caserne alliée : +3 alliés à chaque bataille */
  allies: number;
  /** le chantier naval allié : +1 navire allié en mer */
  ships: number;
  /** l'hôpital allié : un tiers des tombés reviennent */
  hospital: boolean;
}
export const NO_PERKS: FrontPerks = { infirmary: false, fort: false, tower: false, forge: false, garrison: false, radar: false, battery: false, allies: 0, ships: 0, hospital: false };
/** Les renforts de la caserne alliée, et ce que la forge du front ajoute aux coups */
export const ALLY_BARRACKS_MEN = 3, FORGE_DMG = 1.2, GARRISON_MEN = 8;
/** Ce que la campagne de l'île rivale en lit (`sim/campaign.ts`) */
export const campPerks = (p: FrontPerks) => ({ bonus: p.garrison ? GARRISON_MEN : 0, infirmary: p.infirmary, radar: p.radar, hospital: p.hospital });

export function frontPerks(w: W, c: Counts): FrontPerks {
  if (!archipelagoOn(w) || !warPath(w)) return NO_PERKS;
  return {
    infirmary: has(c, 'frontInfirmary'), fort: has(c, 'fort'), tower: has(c, 'frontTower'), forge: has(c, 'frontForge'),
    garrison: garrisonBuilt(c), radar: has(c, 'radar'), battery: has(c, 'battery'),
    allies: has(c, 'allyBarracks') ? ALLY_BARRACKS_MEN : 0, ships: has(c, 'allyShipyard') ? 1 : 0, hospital: has(c, 'allyHospital'),
  };
}

/** Ce que la concession de la paix apporte : l'or de la ligne de vapeurs, les cours plus lents, des visites plus sûres, l'aide aux catastrophes */
export interface PeacePerks { gold: number; trade: boolean; school: boolean; aid: boolean; research: boolean }
export function peacePerks(w: W, c: Counts): PeacePerks {
  if (!archipelagoOn(w) || !peacePath(w)) return { gold: 0, trade: false, school: false, aid: false, research: false };
  return { gold: has(c, 'merchantPort') ? STEAMER_GOLD : 0, trade: has(c, 'exchangeHall'), school: has(c, 'commonSchool'), aid: has(c, 'dispensary'), research: has(c, 'researchCenter') };
}

/** L'école commune : les visites sur les îles (risque × 0,75) ; le centre de recherche commun : toutes les expéditions (× 0,9) */
export const SCHOOL_ISLE_RISK = 0.75, RESEARCH_RISK = 0.9;
/** Le dispensaire : après une catastrophe, l'aide de l'allié, les réparations deux fois plus rapides */
export const AID_REPAIR = 0.5;

/** Le premier bâtiment de la liste encore à poser (pour la feuille de route), ou le premier de la liste */
export function nextToBuild(c: Counts, list: KindId[]): KindId { return list.find((k) => !has(c, k)) ?? list[0]; }

/** Le nom d'un bâtiment de zone à l'âge (le premier âge où il existe) */
export const zoneName = (k: KindId, age: number) => KINDS[k].names[Math.max(age, KINDS[k].minAge)];
