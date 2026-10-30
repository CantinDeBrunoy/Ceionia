import * as THREE from 'three';
import { GameTime } from '../core/time';

const P = {
  grass: [0xa6d98a, 0x8fcf7e, 0xd0b862, 0xdfe8ee].map((c) => new THREE.Color(c)),
  foliage: [0xf3bccf, 0x86cf84, 0xefaa55, 0xcdc4bb].map((c) => new THREE.Color(c)),
  crop: [0xb4dc86, 0xe3cf6e, 0xc9a266, 0xf1f5f9].map((c) => new THREE.Color(c)),
  water: [0x9fd8e4, 0x8fd6e2, 0x8fbfc9, 0xbcd9e6].map((c) => new THREE.Color(c)),
  tint: [0xfff0f4, 0xfffbe8, 0xffe6c4, 0xeaf2ff].map((c) => new THREE.Color(c)),
  snow: [0, 0, 0.05, 1],
  leaf: [0.95, 1, 0.9, 0.3],
  waterOpacity: [0.72, 0.7, 0.74, 0.86],
};

export interface SeasonState {
  grass: THREE.Color;
  foliage: THREE.Color;
  crop: THREE.Color;
  water: THREE.Color;
  tint: THREE.Color;
  snow: number;
  leaf: number;
  waterOpacity: number;
}

export function makeSeasonState(): SeasonState {
  return { grass: new THREE.Color(), foliage: new THREE.Color(), crop: new THREE.Color(), water: new THREE.Color(), tint: new THREE.Color(), snow: 0, leaf: 1, waterOpacity: 0.7 };
}

export function computeSeason(time: GameTime, out: SeasonState) {
  const { a, b, t } = time.mix();
  out.grass.copy(P.grass[a]).lerp(P.grass[b], t);
  out.foliage.copy(P.foliage[a]).lerp(P.foliage[b], t);
  out.crop.copy(P.crop[a]).lerp(P.crop[b], t);
  out.water.copy(P.water[a]).lerp(P.water[b], t);
  out.tint.copy(P.tint[a]).lerp(P.tint[b], t);
  out.snow = P.snow[a] + (P.snow[b] - P.snow[a]) * t;
  out.leaf = P.leaf[a] + (P.leaf[b] - P.leaf[a]) * t;
  out.waterOpacity = P.waterOpacity[a] + (P.waterOpacity[b] - P.waterOpacity[a]) * t;
  return out;
}
