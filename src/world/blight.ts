import type { World } from './world';
import { sizeOf } from '../build/catalog';
import { hash2, smoothstep, lerp, clamp } from '../core/rng';
import { isleDefenses, isleSecured, ISLE_SECURE } from './portal';
import { hellFallen } from '../sim/kingdom';

/**
 * La contamination de l'île du portail : le monde des Enfers déborde par le portail sur l'île (sol noirci, fissures de lave,
 * arbres morts, cristaux, braises). Elle recule à mesure qu'on sécurise l'île : chaque tour de garde, chaque caserne, chaque
 * vague repoussée, chaque zone des Enfers conquise ; l'île sécurisée, il n'en reste qu'un petit cercle autour du portail. Les
 * défenses posées sur l'île la repoussent aussi autour d'elles (halo de purification). Rien n'est sauvegardé : tout se déduit
 * de l'état de l'île (portail, défenses, vagues repoussées) et des zones conquises. Logique pure, testable
 */

/** Portail encore fermé : il dort, la contamination est déjà là mais à demi */
export const BLIGHT_DORMANT = 0.6;
/** L'île sécurisée : il n'en reste que ça (et un peu moins par zone des Enfers conquise, jusqu'au plancher) */
export const BLIGHT_SECURED = 0.15;
export const BLIGHT_FLOOR = 0.08;
/** Ce que retire chaque défense (tours et casernes comptées jusqu'à `max`), chaque vague, chaque zone conquise */
export const BLIGHT_STEP = { tower: 0.08, towerMax: 3, barracks: 0.08, barracksMax: 2, wave: 0.09, zone: 0.04, zoneMax: 6 };
/** Rayon de la contamination (cases) : au plus bas, juste autour du portail ; au plus fort, toute l'île */
export const BLIGHT_R_MIN = 2.4;
/** Rayon du halo de purification d'une défense, au-delà de son emprise (cases) */
export const HALO_R = 2.6;
/** Bonus de force des démons au plus fort de la contamination (près du portail), et des soins dans la zone purifiée */
export const DEMON_BONUS = 0.2, HEAL_BONUS = 0.6;

/** La contamination à un instant : son centre (le portail), son rayon, son intensité et les halos des défenses */
export interface Blight {
  x: number;
  z: number;
  /** île (rayon) : la contamination n'en sort pas */
  r: number;
  /** intensité 0 … 1 */
  level: number;
  /** rayon (cases) */
  radius: number;
  /** halos de purification : x, z, rayon */
  halos: [number, number, number][];
  /** déphasages du bord festonné */
  ph: [number, number];
  /** signature : elle change quand il faut refaire les teintes et les décors */
  key: string;
}

/** Intensité de la contamination de l'île (0 sans île) ; `conquered` : zones des Enfers conquises */
export function blightLevel(w: World, conquered = 0): number {
  if (!w.portal) return 0;
  if (!w.portalOpen) return BLIGHT_DORMANT;
  // le royaume des Enfers est tombé : l'île se purifie pour de bon
  if (hellFallen(w)) return 0.03;
  const S = BLIGHT_STEP, z = Math.min(S.zoneMax, Math.max(0, conquered));
  if (isleSecured(w)) return Math.max(BLIGHT_FLOOR, BLIGHT_SECURED - 0.015 * z);
  const d = isleDefenses(w), waves = Math.min(ISLE_SECURE.waves, w.isleGuard.waves);
  const k = 1 - S.tower * Math.min(S.towerMax, d.towers) - S.barracks * Math.min(S.barracksMax, d.barracks) - S.wave * waves - S.zone * z;
  // tant qu'elle n'est pas sécurisée, l'île reste nettement contaminée
  return clamp(k, BLIGHT_SECURED + 0.1, 1);
}

/** La contamination de l'île du portail (null sans île) */
export function isleBlight(w: World, conquered = 0): Blight | null {
  const p = w.portal;
  if (!p) return null;
  const level = blightLevel(w, conquered);
  const halos: [number, number, number][] = [];
  for (const b of w.buildings.values()) {
    if (b.kind !== 'watchtower' || !w.onPortalIsland(b.x, b.z)) continue; // seule la tour de garde a son halo (pas la caserne)
    const s = sizeOf(b);
    halos.push([b.x + s / 2, b.z + s / 2, HALO_R + s / 2]);
  }
  halos.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const radius = lerp(BLIGHT_R_MIN, p.r * 1.05, level);
  const ph: [number, number] = [hash2(p.x, p.z, 7101) * 6.28, hash2(p.x, p.z, 7103) * 6.28];
  const key = `${p.x}|${p.z}|${level.toFixed(3)}|${halos.map((h) => `${h[0]},${h[1]}`).join(';')}`;
  return { x: p.x, z: p.z, r: p.r, level, radius, halos, ph, key };
}

/** Bord festonné de la contamination : son rayon dans la direction `a` */
export function blightRadius(b: Blight, a: number) {
  return b.radius * (1 + 0.14 * Math.sin(3 * a + b.ph[0]) + 0.08 * Math.sin(7 * a + b.ph[1]));
}

/** Purification au point (0 … 1) : le halo de la défense la plus proche */
export function purityAt(b: Blight, x: number, z: number) {
  let p = 0;
  for (const [hx, hz, hr] of b.halos) {
    const d = Math.hypot(x - hx, z - hz);
    if (d < hr) p = Math.max(p, 1 - smoothstep(hr * 0.55, hr, d));
  }
  return p;
}

/** Contamination au point (0 … 1) : la plus forte au portail, qui s'atténue vers son bord ; les halos la repoussent */
export function blightAt(b: Blight, x: number, z: number) {
  const dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz);
  if (d > b.r + 2.5 || b.level <= 0) return 0;
  const R = blightRadius(b, Math.atan2(dz, dx));
  if (d >= R) return 0;
  const peak = 0.35 + 0.65 * b.level;
  const v = peak * (1 - smoothstep(Math.min(1.6, R * 0.6), R, d));
  return v * (1 - 0.9 * purityAt(b, x, z));
}

/** Les démons près du portail, tant que la contamination est forte : un petit bonus de force (multiplicateur) */
export function demonBoost(b: Blight | null, x: number, z: number) {
  return b ? 1 + DEMON_BONUS * smoothstep(0.5, 0.9, blightAt(b, x, z)) : 1;
}

/** La zone purifiée (halos des défenses, terre saine de l'île) : les blessures légères s'y referment plus vite (multiplicateur) */
export function healBoost(b: Blight | null, x: number, z: number) {
  if (!b) return 1;
  const clean = 1 - smoothstep(0.08, 0.3, blightAt(b, x, z));
  return 1 + HEAL_BONUS * Math.max(purityAt(b, x, z), clean);
}

/** Part de l'île encore contaminée, pour la jauge (0 … 1) */
export function blightGauge(b: Blight | null) {
  return b ? clamp(b.level, 0, 1) : 0;
}
