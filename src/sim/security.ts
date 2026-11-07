import type { KindId } from '../build/catalog';
import type { Danger } from './gear';

/**
 * Bâtiments de sécurité et expéditions : les pompiers (guetteurs, puis secours) et la police (gardes, puis agents) rendent
 * les expéditions un peu plus sûres. Chacun retire une petite part du risque partout, et davantage quand l'expédition affronte
 * un danger de son ressort : les secours contre les chutes, l'eau vive et les intempéries, les gardes contre les bêtes et les
 * créatures. Un seul bâtiment de chaque sorte compte (en bâtir dix n'aide pas plus), et l'ensemble est plafonné
 */
export interface SecurityPerk {
  kind: KindId;
  /** part du risque retirée partout */
  cut: number;
  /** part retirée quand l'expédition affronte au moins un de ces dangers */
  vs: Danger[];
  vsCut: number;
}

export const SECURITY: SecurityPerk[] = [
  { kind: 'fire', cut: 0.05, vs: ['fall', 'water', 'weather'], vsCut: 0.1 },
  { kind: 'police', cut: 0.05, vs: ['beast', 'monster'], vsCut: 0.1 },
];

/** Part du risque que les bâtiments de sécurité, ensemble, ne retirent jamais au-delà */
export const SECURITY_MAX = 0.15;

/** Ce que chaque bâtiment de sécurité présent retire au risque de cette expédition (pour l'afficher), dans l'ordre de `SECURITY` */
export function securityCuts(dangers: readonly Danger[], has: (k: KindId) => boolean): { kind: KindId; cut: number }[] {
  return SECURITY.filter((s) => has(s.kind)).map((s) => ({ kind: s.kind, cut: dangers.some((d) => s.vs.includes(d)) ? s.vsCut : s.cut }));
}

/** Multiplicateur du risque dû aux bâtiments de sécurité : 1 sans eux, jamais sous 1 − `SECURITY_MAX` */
export function securityK(dangers: readonly Danger[], has: (k: KindId) => boolean) {
  const k = securityCuts(dangers, has).reduce((p, s) => p * (1 - s.cut), 1);
  return Math.max(1 - SECURITY_MAX, k);
}
