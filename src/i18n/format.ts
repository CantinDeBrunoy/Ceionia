import { getLang } from './index';

/**
 * Format de nombres selon la langue. En français le code garde ses formats d'origine (rien ne change) ; en anglais : point
 * décimal et virgule pour séparer les milliers (« 1,500 », « 1.5 »).
 * `digits` : nombre de décimales fixes (sinon, celles du nombre, jusqu'à 2).
 */
export function fmtNum(n: number, digits?: number): string {
  if (getLang() !== 'en') return digits === undefined ? String(n) : n.toFixed(digits);
  return n.toLocaleString('en-US', digits === undefined ? { maximumFractionDigits: 2 } : { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
