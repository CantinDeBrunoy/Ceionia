import { KINDS, Building, sizeOf } from '../build/catalog';

/**
 * Couverture de sécurité : la part des habitations à portée d'une caserne de pompiers et d'un poste de police.
 * Rayons (en cases, du centre du bâtiment de sécurité au centre de l'habitation) :
 * - pompiers : 14 cases, la portée d'intervention des secours contre les incendies (inchangée) ;
 * - police : 12 cases au poste des gardes, +1 case par âge (17 cases à la centrale de sécurité).
 * La jauge est la moyenne des deux couvertures ; c'est un indicateur et un petit bonus de bien-être, jamais un blocage.
 */
export const FIRE_RANGE = 14;
export const policeRange = (age: number) => 12 + Math.max(0, Math.min(5, age));
export const rangeOf = (b: { kind: string; age: number }) => (b.kind === 'fire' ? FIRE_RANGE : b.kind === 'police' ? policeRange(b.age) : 0);

/** Bien-être par habitation couverte par les deux services, et plafond (léger : le village ne dépend pas de la sécurité) */
export const COVER_JOY = 0.04;
export const COVER_JOY_MAX = 2;

export interface Coverage {
  homes: number;
  /** habitations à portée d'une caserne, d'un commissariat, des deux */
  fire: number;
  police: number;
  both: number;
  /** parts (0 … 1) ; sans habitation, tout est couvert */
  fireShare: number;
  policeShare: number;
  /** la jauge : moyenne des deux couvertures */
  share: number;
  stations: { fire: Building[]; police: Building[] };
  /** habitations sans pompiers / sans police */
  uncoveredFire: Building[];
  uncoveredPolice: Building[];
  /** bien-être apporté */
  joy: number;
}

export function computeCoverage(buildings: Iterable<Building>): Coverage {
  const fireSt: Building[] = [], policeSt: Building[] = [], homes: Building[] = [];
  for (const b of buildings) {
    if (b.kind === 'fire') fireSt.push(b);
    else if (b.kind === 'police') policeSt.push(b);
    else if ((KINDS[b.kind]?.housing?.[b.age] ?? 0) > 0) homes.push(b);
  }
  const mid = (b: Building) => sizeOf(b) / 2;
  const near = (st: Building[], h: Building) => st.some((s) => Math.hypot(s.x + mid(s) - h.x - mid(h), s.z + mid(s) - h.z - mid(h)) <= rangeOf(s));
  let fire = 0, police = 0, both = 0;
  const uf: Building[] = [], up: Building[] = [];
  for (const h of homes) {
    const f = near(fireSt, h), p = near(policeSt, h);
    if (f) fire++; else uf.push(h);
    if (p) police++; else up.push(h);
    if (f && p) both++;
  }
  const n = homes.length, share = (c: number) => (n ? c / n : 1);
  return {
    homes: n, fire, police, both, fireShare: share(fire), policeShare: share(police), share: (share(fire) + share(police)) / 2,
    stations: { fire: fireSt, police: policeSt }, uncoveredFire: uf, uncoveredPolice: up,
    joy: Math.min(COVER_JOY_MAX, both * COVER_JOY),
  };
}

const DIRS = ['à l’est', 'au sud-est', 'au sud', 'au sud-ouest', 'à l’ouest', 'au nord-ouest', 'au nord', 'au nord-est'];
/** Où se trouve le centre d'un groupe d'habitations, en clair (« au nord-est du village ») */
export function whereIs(group: Building[], all: Building[]): string {
  if (!group.length || !all.length) return '';
  const mx = all.reduce((s, b) => s + b.x, 0) / all.length, mz = all.reduce((s, b) => s + b.z, 0) / all.length;
  const gx = group.reduce((s, b) => s + b.x, 0) / group.length, gz = group.reduce((s, b) => s + b.z, 0) / group.length;
  if (Math.hypot(gx - mx, gz - mz) < 4) return 'au centre du village';
  const a = Math.atan2(gz - mz, gx - mx); // z croît vers le sud
  return `${DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]} du village`;
}

/** Les conseils de la fiche, ton casual */
export function coverageTips(c: Coverage, all: Building[]): string[] {
  const t: string[] = [];
  if (!c.homes) return ['Pas encore d’habitations à protéger.'];
  if (!c.stations.fire.length) t.push('Bâtissez une caserne de pompiers : elle protège les maisons des flammes.');
  else if (c.uncoveredFire.length) t.push(`Une caserne de pompiers de plus ${whereIs(c.uncoveredFire, all)} : ${c.uncoveredFire.length} maison${c.uncoveredFire.length > 1 ? 's sont' : ' est'} trop loin des secours.`);
  if (!c.stations.police.length) t.push('Bâtissez un poste de police : les rondes rassurent tout le monde.');
  else if (c.uncoveredPolice.length) t.push(`Un poste de police de plus ${whereIs(c.uncoveredPolice, all)} : ${c.uncoveredPolice.length} maison${c.uncoveredPolice.length > 1 ? 's sont' : ' est'} trop loin des gardes.`);
  return t;
}
