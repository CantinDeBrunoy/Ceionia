import * as THREE from 'three';
import { Parts } from './parts';
import { orientShip } from './models/orientShips';
import { asianShip } from './models/asianShips';
import type { People } from '../world/archipelago';
import type { WarshipKind } from '../sim/navalConflict';

/**
 * Les navires de guerre des deux peuples des îles rivales, par âge (voir `warshipKind`) : galère à éperon et à boucliers,
 * boutre à voiles latines (peuple oriental) ou jonque à voiles lattées (peuple asiatique), frégate à canons, vapeur cuirassé
 * à tourelle, vedette lance-roquettes, vedette à coussin d'air et ses drones. Le peuple oriental : bois clair, turquoise,
 * blanc et laiton ; le peuple asiatique : laque rouge, noir et or. Proue vers +z, flottaison à y = 0, environ une case de long.
 * Les dessins sont dans `models/orientShips.ts` et `models/asianShips.ts` ; ici, l'aiguillage, le cache et les débris
 */

export interface WarshipModel {
  body: THREE.BufferGeometry;
  glow: THREE.BufferGeometry | null;
  /** un banc de rames (côté +x, le pivot au plat-bord, à `oarAt`) ; l'autre côté est son miroir. Null : pas de rames */
  oars: THREE.BufferGeometry | null;
  oarAt: [number, number, number];
  /** d'où partent les tirs (repère du navire) : archers sur le pont, sabords, tourelles */
  muzzles: [number, number, number][];
  /** bouche de la cheminée (fumée), ou null */
  funnel: [number, number, number] | null;
  /** un drone (vedette futuriste), ou null */
  drone: THREE.BufferGeometry | null;
}


const cache = new Map<string, WarshipModel>();
/** Le modèle d'un navire de guerre (géométries partagées) */
export function warshipModel(kind: WarshipKind, people: People): WarshipModel {
  const key = `${kind}|${people}`;
  let m = cache.get(key);
  if (!m) {
    const p = new Parts(), extra = people === 'orient' ? orientShip(p, kind) : asianShip(p, kind), built = p.build(false);
    m = { body: built.body, glow: built.glow, oars: extra.oars ?? null, oarAt: extra.oarAt ?? [0, 0, 0], muzzles: extra.muzzles ?? [[0, 0.1, 0.3]], funnel: extra.funnel ?? null, drone: extra.drone ?? null };
    cache.set(key, m);
  }
  return m;
}

let debris: THREE.BufferGeometry | null = null;
/** Débris d'un naufrage : une planche, un bout de mât, un tonneau (une seule géométrie, tournée au hasard) */
export function debrisGeo() {
  if (!debris) {
    const p = new Parts();
    p.box(0.16, 0.012, 0.04, 0, 0, 0, 0x7a5236);
    p.box(0.012, 0.012, 0.2, 0.05, 0.004, 0.06, 0x4a3426, 0.4);
    p.cyl(0.022, 0.022, 0.05, 7, -0.07, 0, -0.05, 0x6a4a2a);
    debris = p.build(false).body;
  }
  return debris;
}

/** Couleur du feu d'un tir de flèches enflammées, de la gerbe d'un boulet dans l'eau */
export const SPLASH = 0xe8f4f8;

