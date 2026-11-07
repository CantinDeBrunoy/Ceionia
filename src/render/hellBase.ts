import * as THREE from 'three';
import type { BaseKind } from '../sim/hell';
import { paint, merge } from './battleUnits';

/**
 * Les bâtiments de la base avancée du joueur dans les Enfers, en low-poly : bois clair, toile beige, pierre grise et
 * étendards bleus (ils tranchent sur la roche rouge et les étendards violets des démons). Face au nord (vers le portail),
 * +z vers le sud. Pièces opaques, pièces qui luisent (feux, braises), hauteur de la flamme (pour la lumière), 0 sans feu
 */

const WOOD = 0x9a6a3c, DARKWOOD = 0x6a4426, CLOTH = 0xe8dcc0, STONE = 0x8a8590, DARK = 0x4a4650, BLUE = 0x2e6ad8, GOLD = 0xf0c040;
const FIRE = 0xffa040, EMBER = 0xff6a20;

export function baseGeo(kind: BaseKind): { solid: THREE.BufferGeometry; shine: THREE.BufferGeometry | null; fire: number; flag: [number, number, number] | null } {
  const solid: THREE.BufferGeometry[] = [], shine: THREE.BufferGeometry[] = [];
  let fire = 0, flag: [number, number, number] | null = null;
  const tent = (x: number, z: number, s: number, c: number, rot = 0) => {
    solid.push(paint(new THREE.ConeGeometry(0.55 * s, 0.75 * s, 4).rotateY(Math.PI / 4 + rot).scale(1, 1, 1.35).translate(x, 0.375 * s, z), c, (y) => 0.8 + y * 0.3));
    solid.push(paint(new THREE.BoxGeometry(0.2 * s, 0.34 * s, 0.04).translate(x, 0.17 * s, z - 0.52 * s), DARKWOOD));
  };
  const pole = (x: number, z: number, h: number) => {
    solid.push(paint(new THREE.CylinderGeometry(0.03, 0.035, h, 5).translate(x, h / 2, z), DARKWOOD));
    solid.push(paint(new THREE.SphereGeometry(0.06, 6, 4).translate(x, h + 0.03, z), GOLD));
    flag = [x, h - 0.12, z];
  };
  const crate = (x: number, z: number, s = 0.22) => solid.push(paint(new THREE.BoxGeometry(s, s, s).translate(x, s / 2, z), WOOD, (y) => 0.85 + y * 0.2));
  switch (kind) {
    case 'camp':
      // trois tentes autour d'un feu, le mât et son étendard bleu, des caisses de vivres
      tent(-0.62, 0.3, 1, CLOTH, 0); tent(0.62, 0.3, 1, CLOTH, 0); tent(0, 0.75, 1.15, 0xd8c8a0, 0);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; solid.push(paint(new THREE.DodecahedronGeometry(0.07, 0).translate(Math.sin(a) * 0.2, 0.05, -0.45 + Math.cos(a) * 0.2), DARK)); }
      shine.push(paint(new THREE.ConeGeometry(0.12, 0.3, 5).translate(0, 0.15, -0.45), FIRE));
      fire = 0.3;
      pole(0.85, -0.55, 1.5);
      crate(-0.85, -0.5); crate(-0.62, -0.62, 0.18); crate(-0.8, -0.3, 0.16);
      break;
    case 'post':
      // la caserne avancée : un long baraquement de bois au toit à deux pans, un râtelier de lances
      solid.push(paint(new THREE.BoxGeometry(1.5, 0.6, 1).translate(0, 0.3, 0.1), WOOD, (y) => 0.8 + y * 0.25));
      solid.push(paint(new THREE.CylinderGeometry(0.01, 0.7, 0.5, 4, 1).rotateY(Math.PI / 4).scale(1.55, 1, 1.05).translate(0, 0.85, 0.1), 0x3a5a9a));
      solid.push(paint(new THREE.BoxGeometry(0.3, 0.42, 0.04).translate(0, 0.21, -0.41), DARKWOOD));
      solid.push(paint(new THREE.BoxGeometry(0.6, 0.06, 0.06).translate(-0.4, 0.42, -0.62), DARKWOOD));
      for (let i = 0; i < 4; i++) solid.push(paint(new THREE.CylinderGeometry(0.015, 0.015, 0.75, 4).translate(-0.62 + i * 0.15, 0.38, -0.62), 0xb0a090), paint(new THREE.ConeGeometry(0.03, 0.1, 4).translate(-0.62 + i * 0.15, 0.8, -0.62), 0xd0d4dc));
      pole(0.72, -0.5, 1.4);
      break;
    case 'smithy':
      // la forge : hutte de pierre, cheminée qui rougeoie, enclume et foyer ouvert devant
      solid.push(paint(new THREE.BoxGeometry(1.1, 0.6, 0.9).translate(0, 0.3, 0.15), STONE, (y) => 0.8 + y * 0.3));
      solid.push(paint(new THREE.CylinderGeometry(0.02, 0.8, 0.45, 4).rotateY(Math.PI / 4).scale(1, 1, 0.85).translate(0, 0.82, 0.15), DARKWOOD));
      solid.push(paint(new THREE.BoxGeometry(0.24, 0.8, 0.24).translate(0.35, 0.9, 0.35), DARK));
      solid.push(paint(new THREE.BoxGeometry(0.3, 0.1, 0.14).translate(-0.3, 0.26, -0.55), 0x4a4a54), paint(new THREE.BoxGeometry(0.12, 0.21, 0.1).translate(-0.3, 0.105, -0.55), 0x34343c));
      shine.push(paint(new THREE.BoxGeometry(0.4, 0.3, 0.05).translate(0.12, 0.2, -0.31), EMBER), paint(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 6).translate(0.35, 1.32, 0.35), EMBER));
      fire = 0.35;
      break;
    case 'infirmary':
      // l'infirmerie : une grande tente blanche, bannière bleue frappée d'une feuille de soin dorée, brancards
      solid.push(paint(new THREE.CylinderGeometry(0.02, 0.85, 0.85, 6).translate(0, 0.43, 0.1), 0xf4f0e6, (y) => 0.85 + y * 0.2));
      solid.push(paint(new THREE.CylinderGeometry(0.85, 0.85, 0.25, 6).translate(0, 0.12, 0.1), 0xf4f0e6));
      solid.push(paint(new THREE.BoxGeometry(0.34, 0.36, 0.04).translate(0, 0.18, -0.68), 0x5a8ad8));
      shine.push(paint(new THREE.SphereGeometry(0.07, 6, 4).scale(1, 1.5, 0.4).translate(0, 0.25, -0.71), 0x9aff8a));
      for (const x of [-0.75, 0.75]) solid.push(paint(new THREE.BoxGeometry(0.22, 0.06, 0.55).translate(x, 0.1, -0.35), CLOTH), paint(new THREE.BoxGeometry(0.26, 0.04, 0.6).translate(x, 0.05, -0.35), DARKWOOD));
      pole(-0.6, 0.7, 1.3);
      break;
    case 'tower':
      // la tour de guet : quatre pieux, une plateforme crénelée de bois, un petit toit
      for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) solid.push(paint(new THREE.CylinderGeometry(0.05, 0.07, 1.6, 5).translate(x, 0.8, z), DARKWOOD));
      solid.push(paint(new THREE.BoxGeometry(0.62, 0.05, 0.05).rotateY(Math.PI / 4).translate(0, 0.6, -0.3), WOOD), paint(new THREE.BoxGeometry(0.62, 0.05, 0.05).rotateY(-Math.PI / 4).translate(0, 0.6, 0.3), WOOD));
      solid.push(paint(new THREE.BoxGeometry(0.85, 0.08, 0.85).translate(0, 1.6, 0), WOOD));
      for (const [w, d, x, z] of [[0.85, 0.06, 0, -0.42], [0.85, 0.06, 0, 0.42], [0.06, 0.85, -0.42, 0], [0.06, 0.85, 0.42, 0]] as const) solid.push(paint(new THREE.BoxGeometry(w, 0.28, d).translate(x, 1.78, z), WOOD, (y) => 0.85 + y * 0.2));
      solid.push(paint(new THREE.ConeGeometry(0.62, 0.45, 4).rotateY(Math.PI / 4).translate(0, 2.32, 0), 0x3a5a9a));
      for (const [x, z] of [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]]) solid.push(paint(new THREE.CylinderGeometry(0.025, 0.025, 0.38, 4).translate(x, 2.02, z), DARKWOOD));
      flag = [0, 2.45, 0];
      solid.push(paint(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4).translate(0, 2.6, 0), DARKWOOD));
      break;
    case 'palisade':
      // un pan de pieux taillés en pointe, deux traverses
      for (let i = 0; i < 5; i++) {
        const x = -0.4 + i * 0.2, h = 0.75 + ((i * 37) % 5) * 0.04;
        solid.push(paint(new THREE.CylinderGeometry(0.085, 0.09, h, 6).translate(x, h / 2, 0), WOOD, (y) => 0.75 + y * 0.3));
        solid.push(paint(new THREE.ConeGeometry(0.085, 0.18, 6).translate(x, h + 0.09, 0), 0xc89a6a));
      }
      for (const y of [0.22, 0.55]) solid.push(paint(new THREE.BoxGeometry(1, 0.06, 0.05).translate(0, y, -0.1), DARKWOOD));
      break;
    case 'brazier':
      // un brasero : pied de pierre, vasque de fer, flammes vives
      solid.push(paint(new THREE.CylinderGeometry(0.1, 0.16, 0.45, 6).translate(0, 0.225, 0), STONE, (y) => 0.8 + y * 0.3));
      solid.push(paint(new THREE.CylinderGeometry(0.24, 0.14, 0.16, 8).translate(0, 0.53, 0), DARK));
      shine.push(paint(new THREE.ConeGeometry(0.17, 0.42, 6).translate(0, 0.8, 0), FIRE), paint(new THREE.ConeGeometry(0.1, 0.3, 5).translate(0.07, 0.75, 0.04), 0xffe070));
      fire = 0.85;
      break;
  }
  return { solid: merge(solid), shine: shine.length ? merge(shine) : null, fire, flag };
}

/** Couleur du drapeau de la base */
export const BASE_FLAG = BLUE;
