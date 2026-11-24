import { tr } from '../i18n';
import type { Resource } from './economy';

/**
 * Notre flotte de guerre (chantier B du nouveau monde) : les navires armés au chantier naval, qui servent à la bataille du
 * bras de mer, au blocus du port et à l'escorte des convois. Règles pures, état sauvegardé dans `world.fleet`. Voir
 * `docs/flotte.md`.
 * - On arme un navire depuis la fiche du chantier naval : il coûte des ressources et de l'or (décision de l'auteur, 24 nov.
 *   2026), met une demi-journée à se faire, puis mouille devant le chantier.
 * - Deux navires par chantier naval, six au plus pour le village. Ils survivent d'une bataille à l'autre : un navire touché
 *   revient avec sa coque entamée et se répare au chantier (du temps, rien à payer) ; un navire coulé est perdu.
 * - Ils se modernisent d'eux-mêmes au passage d'âge : leur classe se lit dans l'âge du village (`shipClass`), pas dans la
 *   sauvegarde.
 */

/** La classe de nos navires : le galion de guerre (Médiéval), la frégate cuirassée (Industriel), le destroyer (Moderne et après) */
export type OurShip = 'galleon' | 'ironclad' | 'destroyer';
export const shipClass = (age: number): OurShip => (age <= 2 ? 'galleon' : age === 3 ? 'ironclad' : 'destroyer');

/** Deux navires par chantier naval, six au plus pour le village */
export const PER_YARD = 2, FLEET_MAX = 6;
/** Le moins de navires pour partir en mer (la bataille ou l'escorte) */
export const MIN_FLEET = 2;
/** Le temps d'armer un navire (jours de jeu), et de réparer une coque entière (jours de jeu, au chantier) */
export const ARM_DAYS = 0.5, REPAIR_DAYS = 0.5;

export type ShipCost = Partial<Record<Resource, number>>;
/** Le prix d'un navire, selon sa classe (l'or à tous les âges, décision de l'auteur) */
export const SHIP_COST: Record<OurShip, ShipCost> = {
  galleon: { wood: 60, ore: 20, gold: 15 },
  ironclad: { wood: 40, ore: 50, brick: 20, gold: 25 },
  destroyer: { ore: 80, fuel: 20, gold: 30 },
};
export const shipCost = (age: number): ShipCost => SHIP_COST[shipClass(age)];

export interface FleetState {
  /** les navires à flot, leur coque (0 … 1 ; 1 : intacte) */
  hulls: number[];
  /** les navires en chantier : l'heure (`exp.clock`, secondes de jeu) où chacun sera prêt */
  arming: number[];
}
export const newFleet = (): FleetState => ({ hulls: [], arming: [] });

/** Relit l'état sauvegardé (absent : aucune flotte ; des valeurs bornées, jamais plus que `FLEET_MAX`) */
export function readFleet(s: any): FleetState {
  const f = newFleet();
  if (!s || typeof s !== 'object') return f;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (Array.isArray(s.hulls)) f.hulls = s.hulls.filter(num).map((h: number) => Math.min(1, Math.max(0.05, h))).slice(0, FLEET_MAX);
  if (Array.isArray(s.arming)) f.arming = s.arming.filter(num).slice(0, FLEET_MAX - f.hulls.length);
  return f;
}
/** La flotte à sauvegarder (rien si vide) */
export const saveFleet = (f: FleetState) => (f.hulls.length || f.arming.length ? { hulls: f.hulls.map((h) => Math.round(h * 1000) / 1000), arming: f.arming.map(Math.round) } : undefined);

/** Combien de navires le village peut avoir, selon ses chantiers navals */
export const fleetCap = (yards: number) => Math.min(FLEET_MAX, PER_YARD * Math.max(0, yards));

/** Ce que lisent les règles hors de la flotte : les stocks, l'heure, l'âge, les chantiers navals */
export interface FleetWorld {
  fleet: FleetState;
  unlimited?: boolean;
  wood: number; stone: number; ore: number; crude: number; fuel: number; brick: number; gold: number;
}

const RES_ORDER: Resource[] = ['wood', 'stone', 'ore', 'brick', 'fuel', 'gold'];
const RES_LABEL: Record<Resource, string> = { wood: '{n} bois', stone: '{n} pierre', ore: '{n} minerai', crude: '{n} pétrole brut', fuel: '{n} carburant', brick: '{n} briques', gold: '{n} or' };
/** Le prix d'un navire en toutes lettres (« 60 bois, 20 minerai, 15 or ») */
export const costText = (c: ShipCost) => RES_ORDER.filter((r) => c[r]).map((r) => tr(RES_LABEL[r], { n: c[r]! })).join(', ');
/** Ce qui manque pour payer (vide : rien) */
export function missing(w: FleetWorld, c: ShipCost): ShipCost {
  const out: ShipCost = {};
  if (w.unlimited) return out;
  for (const r of RES_ORDER) { const n = c[r] ?? 0; if (n > w[r]) out[r] = Math.ceil(n - w[r]); }
  return out;
}

/** Pourquoi on ne peut pas armer un navire maintenant (null : on peut) */
export function armWhy(w: FleetWorld, age: number, yards: number): string | null {
  if (yards <= 0) return tr('Il faut un chantier naval.');
  if (age < 2) return tr('Les navires de guerre s’arment au Médiéval.');
  const f = w.fleet, n = f.hulls.length + f.arming.length;
  if (n >= FLEET_MAX) return tr('La flotte est au complet : six navires au plus.');
  if (n >= fleetCap(yards)) return tr('Deux navires par chantier naval : bâtissez-en un autre pour en armer plus.');
  const miss = missing(w, shipCost(age));
  if (Object.keys(miss).length) return tr('Il manque {cost}', { cost: costText(miss) });
  return null;
}

/** Arme un navire (il sera prêt dans `ARM_DAYS` jours) ; faux si on ne peut pas */
export function armShip(w: FleetWorld, age: number, yards: number, clock: number, dayLen: number): boolean {
  if (armWhy(w, age, yards)) return false;
  if (!w.unlimited) { const c = shipCost(age); for (const r of RES_ORDER) w[r] -= c[r] ?? 0; }
  w.fleet.arming.push(clock + ARM_DAYS * dayLen);
  return true;
}

/**
 * Le temps qui passe (`dt` : secondes de jeu) : les navires prêts mettent à l'eau, les coques se réparent au chantier (s'il
 * en reste un). Renvoie le nombre de navires mis à l'eau
 */
export function stepFleet(f: FleetState, clock: number, dt: number, dayLen: number, yards: number): number {
  let launched = 0;
  for (let i = f.arming.length - 1; i >= 0; i--) if (clock >= f.arming[i]) { f.arming.splice(i, 1); f.hulls.push(1); launched++; }
  if (yards > 0 && dt > 0) for (let i = 0; i < f.hulls.length; i++) f.hulls[i] = Math.min(1, f.hulls[i] + dt / (REPAIR_DAYS * dayLen));
  return launched;
}

/** Les navires à flot */
export const afloat = (f: FleetState) => f.hulls.length;
/** Le temps restant (secondes de jeu) avant le prochain navire prêt, ou null */
export const nextReady = (f: FleetState, clock: number) => (f.arming.length ? Math.max(0, Math.min(...f.arming) - clock) : null);

/** Après une bataille : les coques de nos navires revenus (les coulés sont perdus) */
export function fleetBack(f: FleetState, hulls: number[]) {
  f.hulls = hulls.filter((h) => h > 0).map((h) => Math.min(1, Math.max(0.05, h)));
}
