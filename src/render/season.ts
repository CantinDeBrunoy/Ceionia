import * as THREE from 'three';
import { GameTime } from '../core/time';

const P = {
  // herbe d'un vert franc et tendre, feuillages jaune-vert, eau turquoise (comme un diorama)
  grass: [0xa6dc7a, 0x92d266, 0xd0b862, 0xdfe8ee].map((c) => new THREE.Color(c)),
  foliage: [0xf3bccf, 0x8ad25e, 0xefaa55, 0xcdc4bb].map((c) => new THREE.Color(c)),
  /** feuillage des arbres non fleuris (vert tendre au printemps, jaune en automne) */
  foliage2: [0xa6d866, 0x7ec552, 0xe6c45a, 0xc9c0b6].map((c) => new THREE.Color(c)),
  crop: [0xb4dc86, 0xe3cf6e, 0xc9a266, 0xf1f5f9].map((c) => new THREE.Color(c)),
  water: [0x7cdbe8, 0x6ad7e6, 0x86c4cf, 0xbcd9e6].map((c) => new THREE.Color(c)),
  tint: [0xfff0f4, 0xfffbe8, 0xffe6c4, 0xeaf2ff].map((c) => new THREE.Color(c)),
  snow: [0, 0, 0.05, 1],
  leaf: [0.95, 1, 0.9, 0.3],
  /** hauteur des cultures : pousses, blé mûr, chaume après moisson, rien sous la neige */
  growth: [0.6, 1, 0.45, 0.05],
  waterOpacity: [0.72, 0.7, 0.74, 0.86],
};

export interface SeasonState {
  grass: THREE.Color;
  foliage: THREE.Color;
  foliage2: THREE.Color;
  crop: THREE.Color;
  water: THREE.Color;
  tint: THREE.Color;
  snow: number;
  leaf: number;
  growth: number;
  waterOpacity: number;
}

export function makeSeasonState(): SeasonState {
  return { grass: new THREE.Color(), foliage: new THREE.Color(), foliage2: new THREE.Color(), crop: new THREE.Color(), water: new THREE.Color(), tint: new THREE.Color(), snow: 0, leaf: 1, growth: 1, waterOpacity: 0.7 };
}

export function computeSeason(time: GameTime, out: SeasonState) {
  const { a, b, t } = time.mix();
  out.grass.copy(P.grass[a]).lerp(P.grass[b], t);
  out.foliage.copy(P.foliage[a]).lerp(P.foliage[b], t);
  out.foliage2.copy(P.foliage2[a]).lerp(P.foliage2[b], t);
  out.crop.copy(P.crop[a]).lerp(P.crop[b], t);
  out.water.copy(P.water[a]).lerp(P.water[b], t);
  out.tint.copy(P.tint[a]).lerp(P.tint[b], t);
  out.snow = P.snow[a] + (P.snow[b] - P.snow[a]) * t;
  out.leaf = P.leaf[a] + (P.leaf[b] - P.leaf[a]) * t;
  out.growth = P.growth[a] + (P.growth[b] - P.growth[a]) * t;
  out.waterOpacity = P.waterOpacity[a] + (P.waterOpacity[b] - P.waterOpacity[a]) * t;
  return out;
}
