import * as THREE from 'three';
import { Parts } from './parts';
import { mats } from './materials';
import { HUMAN_K } from './assets';

/**
 * Fantassins de l'époque, dans le style des cavaliers et des jouteurs des jardins : légionnaire romain à l'Antiquité
 * (tunique rouge, cuirasse à lames, casque à crête, grand bouclier rouge et glaive), chevalier au Moyen Âge (armure, tabard
 * bleu et or, heaume à plumet, écu et épée), fantassin napoléonien à l'âge industriel (habit bleu à revers rouges, buffleteries
 * blanches croisées, shako à plumet, fusil à baïonnette), militaire moderne ensuite (treillis, gilet pare-balles, casque,
 * fusil d'assaut). Posés à y = 0, tournés vers +z, à la taille des habitants (0,3)
 */

export interface Soldier {
  root: THREE.Group;
  /** le buste (qui respire, se penche) ; jambes et bras pivotent à la hanche et à l'épaule */
  body: THREE.Group;
  legs: THREE.Object3D[];
  arms: THREE.Object3D[];
  /** la torche du garde, dans la main gauche (flamme à faire vaciller), ou null */
  flame: THREE.Object3D | null;
}

/** Ce que fait le soldat : immobile, au pas, au combat, au garde-à-vous, en liesse */
export type SoldierMode = 'idle' | 'walk' | 'fight' | 'guard' | 'cheer';

const dark = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
const STEEL = 0xc4cad2, BLUE = 0x3a6ab8, GOLD = 0xe8c66a, SKIN = 0xe8b894, LEATHER = 0x5a3e2c, BLACK = 0x1e1e22, WHITE = 0xf0ece0;
const SKINS = [0xe8b894, 0xd8a07a, 0xb07a52, 0xf0c8a8];
const FLAME = new THREE.MeshBasicMaterial({ color: 0xffa040 });

/** Tenue d'une époque : couleurs des pièces du corps, coiffe, ce que tient chaque main */
interface Kit {
  leg: number; boot: number; hip: number; torso: number; arm: number; hand: number;
  dress(p: Parts): void;
  head(p: Parts): void;
  right(p: Parts): void;
  left(p: Parts): void;
}

const roman: Kit = {
  leg: SKIN, boot: LEATHER, hip: 0xb8322c, torso: 0xb8322c, arm: SKIN, hand: SKIN,
  dress(p) {
    // tunique qui dépasse en jupe, cuirasse à lames d'acier, épaulières, ceinturon à lanières
    p.box(0.082, 0.04, 0.056, 0, 0.1, 0, 0xb8322c);
    p.box(0.084, 0.055, 0.058, 0, 0.15, 0, STEEL);
    for (const y of [0.158, 0.172, 0.186, 0.2]) p.box(0.086, 0.004, 0.06, 0, y, 0, dark(STEEL, 0.75));
    for (const s of [-1, 1]) p.box(0.03, 0.022, 0.05, s * 0.05, 0.19, 0, STEEL);
    p.box(0.086, 0.01, 0.06, 0, 0.138, 0, LEATHER);
    for (let k = 0; k < 4; k++) p.box(0.008, 0.035, 0.006, -0.018 + k * 0.012, 0.105, 0.03, LEATHER);
  },
  head(p) {
    // casque à crête rouge, couvre-joues et couvre-nuque
    p.sphere(0.03, 0, 0.255, 0, STEEL, 1, 0.8);
    for (const s of [-1, 1]) p.box(0.006, 0.03, 0.022, s * 0.027, 0.232, 0.008, STEEL);
    p.box(0.05, 0.008, 0.02, 0, 0.24, -0.026, STEEL);
    p.box(0.012, 0.03, 0.06, 0, 0.275, 0, 0xd8443a);
  },
  right(p) {
    // glaive
    p.box(0.01, 0.022, 0.01, 0, -0.012, 0, LEATHER); p.box(0.024, 0.006, 0.012, 0, 0.0, 0, GOLD);
    p.box(0.012, 0.075, 0.004, 0, 0.004, 0, STEEL); p.add(new THREE.ConeGeometry(0.006, 0.014, 4), 0, 0.086, 0, STEEL);
  },
  left(p) {
    // scutum rouge bordé d'or, ombilic et éclairs
    p.box(0.012, 0.11, 0.07, 0.008, -0.045, 0.01, 0xb8322c);
    p.box(0.013, 0.11, 0.006, 0.008, -0.045, 0.046, GOLD); p.box(0.013, 0.11, 0.006, 0.008, -0.045, -0.026, GOLD);
    p.sphere(0.012, 0.016, 0.01, 0.01, GOLD, 0, 0.6);
    p.box(0.014, 0.004, 0.05, 0.008, 0.03, 0.01, GOLD); p.box(0.014, 0.004, 0.05, 0.008, -0.02, 0.01, GOLD);
  },
};

const knight: Kit = {
  leg: STEEL, boot: dark(STEEL, 0.75), hip: BLUE, torso: STEEL, arm: STEEL, hand: dark(STEEL, 0.8),
  dress(p) {
    // armure, tabard bleu à bande d'or, ceinture
    p.box(0.082, 0.1, 0.056, 0, 0.1, 0, STEEL);
    p.box(0.086, 0.09, 0.06, 0, 0.1, 0, BLUE);
    p.box(0.022, 0.09, 0.061, 0, 0.1, 0, GOLD);
    p.box(0.088, 0.01, 0.062, 0, 0.14, 0, LEATHER);
    for (const s of [-1, 1]) p.sphere(0.022, s * 0.048, 0.195, 0, STEEL, 0, 0.8);
  },
  head(p) {
    // heaume à fente et plumet doré
    p.cyl(0.028, 0.03, 0.055, 7, 0, 0.222, 0, STEEL);
    p.box(0.04, 0.006, 0.01, 0, 0.255, 0.027, 0x3c4a54);
    p.sphere(0.02, 0, 0.29, -0.006, GOLD, 0, 1.4);
  },
  right(p) {
    // épée
    p.box(0.01, 0.024, 0.01, 0, -0.014, 0, LEATHER); p.box(0.034, 0.007, 0.012, 0, 0.0, 0, GOLD);
    p.box(0.012, 0.1, 0.004, 0, 0.004, 0, STEEL); p.add(new THREE.ConeGeometry(0.006, 0.016, 4), 0, 0.112, 0, STEEL);
  },
  left(p) {
    // écu bleu à croix d'or
    p.box(0.01, 0.075, 0.06, 0.008, -0.04, 0.008, BLUE);
    p.add(new THREE.ConeGeometry(0.03, 0.03, 4).rotateZ(Math.PI).rotateY(Math.PI / 4), 0.008, -0.09, 0.008, BLUE);
    p.box(0.011, 0.075, 0.012, 0.008, -0.04, 0.008, GOLD); p.box(0.011, 0.012, 0.06, 0.008, -0.03, 0.008, GOLD);
  },
};

const napoleonic: Kit = {
  leg: WHITE, boot: BLACK, hip: 0x2c3e6a, torso: 0x2c3e6a, arm: 0x2c3e6a, hand: WHITE,
  dress(p) {
    // habit bleu à basques, revers rouges, buffleteries blanches croisées, épaulettes rouges, giberne
    p.box(0.08, 0.1, 0.055, 0, 0.11, 0, 0x2c3e6a);
    p.box(0.084, 0.04, 0.02, 0, 0.09, -0.02, 0x2c3e6a);
    p.box(0.04, 0.06, 0.004, 0, 0.16, 0.028, 0xd8443a);
    p.box(0.084, 0.008, 0.058, 0, 0.12, 0, WHITE);
    p.add(new THREE.BoxGeometry(0.012, 0.11, 0.004), 0, 0.165, 0.03, WHITE, 0, false, 0.62);
    p.add(new THREE.BoxGeometry(0.012, 0.11, 0.004), 0, 0.165, 0.03, WHITE, 0, false, -0.62);
    for (const s of [-1, 1]) p.box(0.028, 0.012, 0.04, s * 0.048, 0.205, 0, 0xd8443a);
    p.box(0.05, 0.03, 0.016, 0.0, 0.11, -0.034, BLACK);
  },
  head(p) {
    // shako noir, plaque de cuivre, plumet rouge, jugulaire
    p.cyl(0.03, 0.027, 0.06, 8, 0, 0.245, 0, BLACK);
    p.box(0.064, 0.006, 0.03, 0, 0.245, 0.02, BLACK);
    p.box(0.02, 0.022, 0.004, 0, 0.27, 0.029, GOLD);
    p.cyl(0.008, 0.01, 0.035, 5, 0, 0.305, 0.006, 0xd8443a);
    p.sphere(0.012, 0, 0.345, 0.006, 0xd8443a, 0, 1.4);
  },
  right(p) {
    // fusil à baïonnette, porté droit : crosse, canon, baïonnette
    p.box(0.014, 0.05, 0.02, 0, -0.04, 0, 0x7a5236);
    p.box(0.01, 0.13, 0.012, 0, 0.0, 0.004, 0x7a5236);
    p.box(0.005, 0.14, 0.005, 0, 0.02, 0.012, 0x5a5f66);
    p.box(0.003, 0.05, 0.006, 0, 0.17, 0.012, STEEL);
  },
  left() {},
};

const modern: Kit = {
  leg: 0x5a6a46, boot: 0x2e2a24, hip: 0x5a6a46, torso: 0x5a6a46, arm: 0x5a6a46, hand: 0x2e2a24,
  dress(p) {
    // treillis à taches, gilet pare-balles à poches, ceinturon, sac à dos, genouillères
    p.box(0.08, 0.1, 0.055, 0, 0.11, 0, 0x5a6a46);
    for (const [x, y, c] of [[-0.02, 0.13, 0x3e4a32], [0.025, 0.1, 0x7a7452], [0.01, 0.18, 0x3e4a32]] as [number, number, number][]) p.box(0.026, 0.02, 0.058, x, y, 0, c);
    p.box(0.086, 0.07, 0.062, 0, 0.14, 0, 0x4a5236);
    for (const x of [-0.024, 0, 0.024]) p.box(0.018, 0.022, 0.008, x, 0.15, 0.034, 0x3e4430);
    p.box(0.088, 0.012, 0.064, 0, 0.118, 0, 0x2e2a24);
    p.box(0.06, 0.07, 0.03, 0, 0.14, -0.045, 0x4a5236);
  },
  head(p) {
    // casque à couvre-casque, lunettes sur le front, micro
    p.sphere(0.032, 0, 0.252, 0, 0x4a5236, 1, 0.75);
    p.box(0.07, 0.006, 0.07, 0, 0.247, 0, 0x4a5236);
    p.box(0.04, 0.01, 0.006, 0, 0.262, 0.03, 0x2e3c48);
    p.box(0.004, 0.004, 0.02, 0.022, 0.222, 0.02, BLACK);
  },
  right(p) {
    // fusil d'assaut : crosse, boîtier, chargeur, canon, lunette
    p.box(0.012, 0.03, 0.03, 0, -0.03, -0.01, BLACK);
    p.box(0.014, 0.025, 0.07, 0, -0.005, 0.02, 0x2a2a2e);
    p.box(0.01, 0.025, 0.012, 0, -0.025, 0.03, 0x2a2a2e);
    p.box(0.005, 0.005, 0.05, 0, 0.0, 0.075, 0x2a2a2e);
    p.box(0.01, 0.008, 0.024, 0, 0.012, 0.018, 0x3c3c40);
  },
  left() {},
};

/** Tenue de l'époque (avant l'Antiquité, le légionnaire ; après l'époque moderne, le militaire moderne) */
const KITS = [roman, roman, knight, napoleonic, modern];

/** Torche du garde, flamme à part (elle vacille) */
function torch(): Parts {
  const p = new Parts();
  p.cyl(0.006, 0.007, 0.08, 5, 0, -0.03, 0, 0x6a4a34);
  p.cyl(0.011, 0.009, 0.012, 6, 0, 0.05, 0, 0x3c3c40);
  return p;
}

/** Fantassin de l'époque `age` ; `v` varie son teint ; `withTorch` : une torche dans la main gauche à la place de l'écu */
export function makeSoldier(age: number, v = 0, withTorch = false): Soldier {
  const kit = KITS[Math.min(4, Math.max(0, age))], skin = SKINS[((v % SKINS.length) + SKINS.length) % SKINS.length];
  const tint = (c: number) => (c === SKIN ? skin : c);
  const p = new Parts();
  kit.dress(p);
  p.box(0.042, 0.042, 0.042, 0, 0.212, 0, skin);
  p.box(0.03, 0.006, 0.004, 0, 0.226, 0.021, dark(skin, 0.6));
  kit.head(p);
  // dessiné pour des habitants de 0,3, ramené à leur taille
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  root.scale.setScalar(HUMAN_K);
  const built = p.build(false), hull = new THREE.Mesh(built.body, mats.body);
  hull.castShadow = true;
  body.add(hull);
  if (built.glow) body.add(new THREE.Mesh(built.glow, mats.glow));
  // jambes (pivot à la hanche) et bras (pivot à l'épaule), ce que tient chaque main au bout du bras
  const legs: THREE.Object3D[] = [], arms: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const lp = new Parts();
    lp.box(0.03, 0.07, 0.034, 0, -0.075, 0, tint(kit.leg));
    lp.box(0.032, 0.03, 0.044, 0, -0.1, 0.006, kit.boot);
    if (kit === modern) lp.box(0.032, 0.014, 0.01, 0, -0.06, 0.018, 0x2e2a24);
    const leg = new THREE.Mesh(lp.build(false).body, mats.body);
    leg.position.set(s * 0.02, 0.1, 0);
    leg.castShadow = true;
    root.add(leg);
    legs.push(leg);
  }
  let flame: THREE.Object3D | null = null;
  for (const s of [-1, 1]) {
    const ap = new Parts();
    ap.box(0.024, 0.075, 0.028, 0, -0.035, 0, tint(kit.arm));
    ap.box(0.024, 0.022, 0.024, 0, -0.078, 0.004, tint(kit.hand));
    const held = new Parts();
    if (s < 0) kit.right(held);
    else if (withTorch) {
      const t = torch(); for (const g of t.body) held.body.push(g);
    } else kit.left(held);
    const arm = new THREE.Group();
    arm.add(new THREE.Mesh(ap.build(false).body, mats.body));
    if (held.body.length) {
      const hm = new THREE.Mesh(held.build(false).body, mats.body);
      hm.position.set(0, -0.085, 0.012);
      hm.castShadow = true;
      arm.add(hm);
      arm.userData.held = hm;
      if (s > 0 && withTorch) {
        flame = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.04, 5).translate(0, 0.02, 0), FLAME);
        flame.position.set(0, 0.056, 0);
        hm.add(flame);
      }
    }
    arm.position.set(s * 0.055, 0.205, 0);
    arm.userData.hold = s < 0 ? (kit === napoleonic || kit === modern ? 'rifle' : 'blade') : withTorch ? 'torch' : 'shield';
    body.add(arm);
    arms.push(arm);
  }
  return { root, body, legs, arms, flame };
}

/** Le soldat au rythme de `phase` : pas cadencé, garde, coups portés, bras levés */
export function soldierStep(s: Soldier, phase: number, mode: SoldierMode) {
  const walk = mode === 'walk', sw = Math.sin(phase);
  s.body.position.y = walk ? Math.abs(sw) * 0.006 : Math.sin(phase * 0.3) * 0.0015;
  s.body.rotation.x = mode === 'fight' ? 0.12 : 0;
  s.legs[0].rotation.x = walk ? sw * 0.6 : mode === 'fight' ? -0.25 : 0;
  s.legs[1].rotation.x = walk ? -sw * 0.6 : mode === 'fight' ? 0.3 : 0;
  const [right, left] = s.arms, rifle = right.userData.hold === 'rifle';
  if (mode === 'fight') {
    // il frappe (ou met en joue), l'écu en avant
    const beat = Math.max(0, Math.sin(phase * 1.6));
    right.rotation.x = rifle ? -1.35 : -0.4 - beat * 1.6;
    left.rotation.x = rifle ? -1.2 : -0.9;
    right.rotation.z = rifle ? 0.25 : 0;
  } else if (mode === 'cheer') {
    right.rotation.x = -2.6 + Math.sin(phase * 2) * 0.2; left.rotation.x = -2.4 - Math.sin(phase * 2) * 0.2; right.rotation.z = 0;
  } else {
    // au pas, les bras balancent ; au garde-à-vous, l'arme portée
    right.rotation.x = rifle ? -0.5 : walk ? -sw * 0.45 : -0.15;
    left.rotation.x = walk ? sw * 0.45 : mode === 'guard' ? -0.7 : -0.1;
    right.rotation.z = 0;
  }
  // ce que tiennent les mains : la lame pointe devant ; le fusil se porte à l'épaule, se couche à l'horizontale pour viser ;
  // la torche reste droite
  const rh = right.userData.held as THREE.Object3D | undefined, lh = left.userData.held as THREE.Object3D | undefined;
  if (rh) rh.rotation.x = rifle ? (mode === 'fight' ? Math.PI / 2 - right.rotation.x : 0) : Math.PI / 2;
  if (lh) lh.rotation.x = left.userData.hold === 'torch' ? -left.rotation.x : 0;
  if (s.flame) s.flame.scale.set(0.9 + Math.sin(phase * 7) * 0.12, 0.85 + Math.sin(phase * 5.3) * 0.25, 0.9 + Math.cos(phase * 6.1) * 0.12);
}
