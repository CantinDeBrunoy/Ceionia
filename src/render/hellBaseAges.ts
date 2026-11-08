import * as THREE from 'three';
import type { BaseKind } from '../sim/hell';
import { makeKit, V3, Kit } from './hellBaseKit';
import { buildCamp } from './hellBaseCamp';
import { buildPost } from './hellBasePost';
import { buildSmithy } from './hellBaseSmithy';
import { buildInfirmary } from './hellBaseInfirmary';
import { buildTower } from './hellBaseTower';
import { buildBrazier } from './hellBaseBrazier';

/**
 * Les bâtiments de la base avancée, âge par âge (1 Antiquité : bois, toile, pieux ; 2 Médiéval : pierre, créneaux, bannières ;
 * 3 Industriel : brique, cheminées, tôle, fumée ; 4 Moderne : béton, projecteurs, antennes ; 5 Futuriste : métal lisse, néons,
 * boucliers d'énergie, hologrammes). Même emprise et même face (vers -z) à chaque âge : un bâtiment « monte de niveau » sans bouger.
 * Chaque genre a son fichier (hellBaseCamp.ts…) et sa boîte à outils commune (hellBaseKit.ts). Les flammes (`flame`, rejouées en
 * hauteur par la vue), les champs d'énergie (`field`, translucides) et les pièces qui tournent (`spin` : radar, hologramme) sont des
 * maillages à part ; `smoke` et `sparks` sont les points d'où partent fumée et étincelles ; `flag` et `flags` les drapeaux qui flottent
 */

export const BASE_AGE_MAX = 5;
/** L'âge du village (0 à 99 selon la sim) ramené aux cinq variantes */
export const baseAgeOf = (age: number) => Math.max(1, Math.min(BASE_AGE_MAX, Math.round(age) || 1));
/** Les bâtiments sont dessinés à cette échelle de l'emprise de la sim : la caméra de jeu les voit de loin (14 à 34 cases) */
export const BASE_SCALE = 1.3;

export interface BaseParts {
  solid: THREE.BufferGeometry;
  shine: THREE.BufferGeometry | null;
  flame: THREE.BufferGeometry | null;
  field: THREE.BufferGeometry | null;
  /** pièces qui tournent sur elles-mêmes autour de leur pivot (x, z) */
  spin: { geo: THREE.BufferGeometry; x: number; z: number }[];
  /** hauteur du pied des flammes (la vue les étire sans les décoller) */
  flameY: number;
  /** hauteur de la lumière du feu (0 : sans feu) */
  fire: number;
  /** le drapeau de faction (bleu du joueur) et ceux de plus : oriflammes, fanions */
  flag: V3 | null;
  flags?: V3[];
  smoke: V3[];
  sparks: V3[];
}

const BUILDERS: Partial<Record<BaseKind, (k: Kit) => void>> = { camp: buildCamp, post: buildPost, smithy: buildSmithy, infirmary: buildInfirmary, tower: buildTower, brazier: buildBrazier };

export function baseAgeGeo(kind: BaseKind, ageIn: number): BaseParts | null {
  const build = BUILDERS[kind];
  if (!build) return null;
  const k = makeKit(baseAgeOf(ageIn));
  build(k);
  return k.finish(BASE_SCALE);
}
