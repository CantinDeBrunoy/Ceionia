import * as THREE from 'three';

/**
 * Branche immobile de la scène : three.js recalcule à chaque image la matrice de chaque objet (place, rotation, échelle,
 * puis produit avec celle du parent), même de ceux qui ne bougent jamais ; sur la carte de 384, 2,3 ms par image pour
 * 6 400 objets, dont 0,9 pour les tuiles de végétation, toutes posées à l'origine. Une branche rendue immobile n'est plus
 * parcourue du tout (three « force » toujours les enfants d'un parent à matrice automatique : le paramètre ne dit rien).
 * Après y avoir placé ou déplacé un objet : `refresh(o)`, qui refait ses matrices une fois
 */
export function still<T extends THREE.Object3D>(o: T): T {
  o.updateMatrixWorld = () => {};
  return o;
}

/** Refait une fois les matrices d'une branche immobile (voir `still`) */
export function refresh(o: THREE.Object3D) {
  THREE.Object3D.prototype.updateMatrixWorld.call(o, true);
}
