import { KINDS, Building, sizeOf } from '../build/catalog';
import { tr } from '../i18n';

/**
 * Couverture de sécurité : la part des habitations à portée d'une caserne de pompiers et d'un poste de police.
 * Rayons (en cases, du centre du bâtiment de sécurité au centre de l'habitation) :
 * - pompiers : 14 cases, la portée d'intervention des secours contre les incendies (inchangée) ;
 * - police : 12 cases au poste des gardes, +1 case par âge (17 cases à la centrale de sécurité).
 * La jauge est la moyenne des deux couvertures ; c'est un indicateur et un petit bonus de bien-être, jamais un blocage.
 */
export const FIRE_RANGE = 14;
export const policeRange = (age: number) => 12 + Math.max(0, Math.min(5, age));
/**
 * (la tour de garde du village veille comme un poste de police, à la même portée ; `guard` : les cases de plus que les chiens
 * de garde donnent à la police et aux tours, voir `HOUND_RANGE` de `legacy.ts`)
 */
export const rangeOf = (b: { kind: string; age: number; patrols?: number }, guard = 0) => (b.kind === 'fire' ? FIRE_RANGE : b.kind === 'police' || b.kind === 'watchtower' ? policeRange(b.age) + guard : 0) + PATROL_REACH * patrolsOf(b);

/**
 * Les patrouilles d'un poste de police ou d'une caserne de pompiers (demande de l'auteur, 27 nov. 2026) : on en ajoute depuis
 * sa fiche, trois au plus ; chacune étend sa portée de `PATROL_REACH` cases (voir `sim/stationPatrols.ts`). La tour de garde
 * n'en a pas : sa ronde de soldats est la sienne
 */
export const PATROLS_MAX = 3;
export const PATROL_REACH = 3;
/** (borné : une sauvegarde abîmée ne donne jamais plus de `PATROLS_MAX`) */
export const patrolsOf = (b: { kind: string; patrols?: number }) => (b.kind === 'fire' || b.kind === 'police' ? Math.max(0, Math.min(PATROLS_MAX, Math.floor(b.patrols ?? 0) || 0)) : 0);

/**
 * Le poste `s` dessert-il le bâtiment `h` ? Distance de centre à centre, à la portée du poste : une seule règle pour la jauge,
 * les pompiers qui éteignent (`Fires`) et les véhicules envoyés (`Emergencies`, portée `fallback` pour un service sans portée)
 */
export const reaches = (s: Building, h: Building, fallback = 0, guard = 0) => {
  const ms = sizeOf(s) / 2, mh = sizeOf(h) / 2;
  return Math.hypot(s.x + ms - h.x - mh, s.z + ms - h.z - mh) <= (rangeOf(s, guard) || fallback);
};

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

export function computeCoverage(buildings: Iterable<Building>, guard = 0): Coverage {
  const fireSt: Building[] = [], policeSt: Building[] = [], homes: Building[] = [];
  for (const b of buildings) {
    if (b.kind === 'fire') fireSt.push(b);
    else if (b.kind === 'police' || b.kind === 'watchtower') policeSt.push(b);
    else if ((KINDS[b.kind]?.housing?.[b.age] ?? 0) > 0) homes.push(b);
  }
  const near = (st: Building[], h: Building) => st.some((s) => reaches(s, h, 0, guard));
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
/** (les textes sont traduits à l'affichage : `tr` cherche le français exact) */
/** Où se trouve le centre d'un groupe d'habitations, en clair (« au nord-est du village ») */
export function whereIs(group: Building[], all: Building[]): string {
  if (!group.length || !all.length) return '';
  const mx = all.reduce((s, b) => s + b.x, 0) / all.length, mz = all.reduce((s, b) => s + b.z, 0) / all.length;
  const gx = group.reduce((s, b) => s + b.x, 0) / group.length, gz = group.reduce((s, b) => s + b.z, 0) / group.length;
  if (Math.hypot(gx - mx, gz - mz) < 4) return tr('au centre du village');
  const a = Math.atan2(gz - mz, gx - mx); // z croît vers le sud
  return tr('{dir} du village', { dir: tr(DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]) });
}

/**
 * Les conseils de la fiche, ton casual. Les bâtiments y sont nommés à l'âge du village (`age`) : la caserne de pompiers est
 * d'abord le poste des vigiles, puis la tour de guet, le centre de secours… (retour de l'auteur, 24 nov. 2026)
 */
export function coverageTips(c: Coverage, all: Building[], age = 3): string[] {
  const t: string[] = [];
  if (!c.homes) return [tr('Pas encore d’habitations à protéger.')];
  const name = (k: 'fire' | 'police') => KINDS[k].names[Math.max(KINDS[k].minAge, Math.min(5, age))];
  const fire = name('fire'), police = name('police');
  if (!c.stations.fire.length) t.push(tr('Bâtissez « {name} » : il protège les maisons des flammes.', { name: fire }));
  else if (c.uncoveredFire.length) t.push(tr(c.uncoveredFire.length > 1 ? 'Encore « {name} » {where} : {n} maisons sont trop loin des secours.' : 'Encore « {name} » {where} : {n} maison est trop loin des secours.', { name: fire, where: whereIs(c.uncoveredFire, all), n: c.uncoveredFire.length }));
  if (!c.stations.police.length) t.push(tr('Bâtissez « {name} » : les rondes rassurent tout le monde.', { name: police }));
  else if (c.uncoveredPolice.length) t.push(tr(c.uncoveredPolice.length > 1 ? 'Encore « {name} » {where} : {n} maisons sont trop loin des gardes.' : 'Encore « {name} » {where} : {n} maison est trop loin des gardes.', { name: police, where: whereIs(c.uncoveredPolice, all), n: c.uncoveredPolice.length }));
  return t;
}
