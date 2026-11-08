import * as THREE from 'three';
import { Parts } from './parts';
import { mats } from './materials';
import { HUMAN_K } from './assets';

/**
 * Fantassins de l'époque, dans le style des cavaliers et des jouteurs des jardins : légionnaire romain à l'Antiquité
 * (tunique rouge, cuirasse à lames, casque à crête, grand bouclier rouge et glaive), chevalier au Moyen Âge (armure, tabard
 * bleu et or, heaume à plumet, écu et épée), fantassin napoléonien à l'âge industriel (habit bleu à revers rouges, buffleteries
 * blanches croisées, shako à plumet, fusil à baïonnette), militaire moderne ensuite (treillis, gilet pare-balles, casque,
 * fusil d'assaut), exo-armure blanche à liserés lumineux à l'âge futuriste. Posés à y = 0, tournés vers +z, à la taille des
 * habitants (0,3)
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

/** Ce que fait le soldat : immobile, au pas, au combat, au garde-à-vous, en liesse, à la course, accroupi (auprès d'un blessé),
 * à porter (un brancard) */
export type SoldierMode = 'idle' | 'walk' | 'fight' | 'guard' | 'cheer' | 'run' | 'kneel' | 'carry';

const dark = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
const STEEL = 0xc4cad2, BLUE = 0x3a6ab8, GOLD = 0xe8c66a, SKIN = 0xe8b894, LEATHER = 0x5a3e2c, BLACK = 0x1e1e22, WHITE = 0xf0ece0;
const SKINS = [0xe8b894, 0xd8a07a, 0xb07a52, 0xf0c8a8];
const FLAME = new THREE.MeshBasicMaterial({ color: 0xffa040 });

/** Tenue d'une époque : couleurs des pièces du corps, coiffe, ce que tient chaque main */
interface Kit {
  leg: number; boot: number; hip: number; torso: number; arm: number; hand: number;
  /** ce que tient la main droite : une arme d'épaule (on met en joue) ou une lame, une hache, un pic (on frappe), une lance
   * (portée droite, couchée pour frapper) */
  hold?: 'rifle' | 'blade' | 'spear' | 'arrow';
  /** ce que tient la main gauche : un bouclier (par défaut), un arc (tenu droit, bandé au combat) */
  leftHold?: 'shield' | 'bow';
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

const future: Kit = {
  leg: 0xe8ecf0, boot: 0x3a4250, hip: 0xe8ecf0, torso: 0xe8ecf0, arm: 0xdfe4ea, hand: 0x3a4250, hold: 'rifle',
  dress(p) {
    // exo-armure blanche à plaques, liserés lumineux, épaulières, ceinturon, réacteur dorsal
    p.box(0.082, 0.1, 0.056, 0, 0.11, 0, 0xe8ecf0);
    p.box(0.088, 0.06, 0.064, 0, 0.145, 0, 0xf6f8fa);
    for (const s of [-1, 1]) p.box(0.034, 0.024, 0.06, s * 0.05, 0.19, 0, 0xd0d8e0);
    p.box(0.006, 0.05, 0.004, 0, 0.15, 0.033, 0x5af0ff, 0, 'neon');
    for (const s of [-1, 1]) p.box(0.004, 0.02, 0.004, s * 0.026, 0.165, 0.033, 0x5af0ff, 0, 'neon');
    p.box(0.09, 0.012, 0.066, 0, 0.118, 0, 0x3a4250);
    p.box(0.056, 0.08, 0.03, 0, 0.13, -0.046, 0xd0d8e0);
    for (const s of [-1, 1]) p.cyl(0.011, 0.013, 0.02, 6, s * 0.016, 0.11, -0.058, 0x3a4250);
  },
  head(p) {
    // casque intégral à visière fumée et sa ligne lumineuse
    p.sphere(0.038, 0, 0.231, 0, 0xf6f8fa, 1);
    p.box(0.052, 0.022, 0.012, 0, 0.22, 0.034, 0x2a3442);
    p.box(0.046, 0.004, 0.004, 0, 0.226, 0.041, 0x5af0ff, 0, 'neon');
  },
  right(p) {
    // fusil à impulsions : crosse, corps blanc, cellule d'énergie, canon
    p.box(0.012, 0.03, 0.03, 0, -0.03, -0.01, 0x3a4250);
    p.box(0.016, 0.028, 0.08, 0, -0.005, 0.025, 0xf0f2f4);
    p.box(0.018, 0.012, 0.03, 0, -0.008, 0.01, 0x5af0ff);
    p.box(0.007, 0.007, 0.05, 0, 0.002, 0.085, 0x3a4250);
  },
  left() {},
};

/** Tenue de l'époque (avant l'Antiquité, le légionnaire) */
const KITS = [roman, roman, knight, napoleonic, modern, future];

// ---------- Les troupes de la garnison (île du portail, Enfers) : lancier, archer, chevalier, chacun reconnaissable ----------

/** Lance : hampe de frêne, fer en feuille, talon (le long de +y depuis la main) */
function spear(p: Parts, wood = 0x8a6a44, iron = STEEL) {
  p.box(0.009, 0.3, 0.009, 0, -0.07, 0, wood);
  p.add(new THREE.ConeGeometry(0.011, 0.05, 4).scale(1, 1, 0.5), 0, 0.255, 0, iron);
  p.box(0.012, 0.012, 0.012, 0, 0.226, 0, dark(iron, 0.8));
  p.box(0.011, 0.014, 0.011, 0, -0.08, 0, dark(iron, 0.7));
}

/** Lancier antique : le légionnaire, la lance (hasta) à la place du glaive */
const romanSpear: Kit = { ...roman, hold: 'spear', right: (p) => spear(p) };

/** Homme d'armes du Moyen Âge : chapel de fer, gambison matelassé, tabard rouge et blanc, rondache, lance */
const manAtArms: Kit = {
  leg: 0x6a5a48, boot: LEATHER, hip: 0xd8cfb8, torso: 0xd8cfb8, arm: 0xc8bea4, hand: LEATHER, hold: 'spear',
  dress(p) {
    p.box(0.082, 0.11, 0.056, 0, 0.1, 0, 0xd8cfb8);
    for (const y of [0.125, 0.15, 0.175]) p.box(0.084, 0.004, 0.058, 0, y, 0, 0xb8ae94);
    p.box(0.07, 0.1, 0.06, 0, 0.1, 0, 0xc23a32);
    p.box(0.02, 0.1, 0.061, 0, 0.1, 0, WHITE);
    p.box(0.088, 0.01, 0.062, 0, 0.13, 0, LEATHER);
  },
  head(p) {
    p.sphere(0.03, 0, 0.25, 0, STEEL, 1, 0.75);
    p.cyl(0.048, 0.042, 0.01, 10, 0, 0.238, 0, STEEL);
  },
  right: (p) => spear(p),
  left(p) {
    // rondache de bois peinte, bordée de fer, ombilic
    p.add(new THREE.CylinderGeometry(0.042, 0.042, 0.01, 12).rotateZ(Math.PI / 2), 0.01, -0.035, 0.008, 0xc23a32);
    p.add(new THREE.TorusGeometry(0.041, 0.004, 4, 14).rotateY(Math.PI / 2), 0.016, -0.035, 0.008, 0x8a8f96);
    p.box(0.012, 0.012, 0.012, 0.016, -0.041, 0.008, 0xd8dce2);
  },
};

/** Les lanciers : soldats à lance de l'Antiquité et du Moyen Âge, puis le fusil à baïonnette, le fusil d'assaut, l'arme à impulsions */
const SPEARMEN = [romanSpear, romanSpear, manAtArms, napoleonic, modern, future];

/** Couleurs d'un archer selon l'époque : tunique, capuchon et pèlerine, chausses, épaules, arc, corde (`neon` : corde lumineuse) */
interface ArcherLook { tunic: number; hood: number; leg: number; boot: number; arm: number; shoulder: number; bow: number; string: number; neon?: boolean; mail?: boolean }

/** Archer : capuchon pointu et pèlerine, tunique ceinturée, carquois garni dans le dos, arc tenu dans la main gauche */
function archerKit(o: ArcherLook): Kit {
  return {
    leg: o.leg, boot: o.boot, hip: o.tunic, torso: o.tunic, arm: o.arm, hand: LEATHER, hold: 'arrow', leftHold: 'bow',
    dress(p) {
      // tunique qui descend en jupe, ceinture, pèlerine sur les épaules (cotte de mailles au Moyen Âge)
      p.box(0.08, 0.13, 0.055, 0, 0.08, 0, o.tunic);
      p.box(0.084, 0.01, 0.058, 0, 0.13, 0, LEATHER);
      p.box(0.012, 0.012, 0.004, 0, 0.13, 0.03, GOLD);
      if (o.mail) p.box(0.086, 0.03, 0.06, 0, 0.16, 0, 0x9aa0a8);
      p.box(0.094, 0.032, 0.064, 0, 0.182, 0, o.shoulder);
      // carquois de cuir en travers du dos, garni de flèches empennées de blanc et de rouge
      p.add(new THREE.CylinderGeometry(0.014, 0.012, 0.1, 6), 0.02, 0.17, -0.04, 0x6a4026, 0, false, -0.35);
      for (let k = 0; k < 4; k++) p.add(new THREE.BoxGeometry(0.004, 0.026, 0.008), 0.034 + (k % 2) * 0.008 - 0.004, 0.232 + (k >> 1) * 0.004, -0.044 + (k % 2 ? 0.006 : -0.004), k % 2 ? 0xd84a3e : 0xf4f0e6, 0, false, -0.35);
    },
    head(p) {
      // le capuchon : il couvre le crâne, la nuque et les joues (le visage reste dégagé), pointe tombant dans le dos
      p.add(new THREE.IcosahedronGeometry(0.031, 1).scale(1.05, 1, 0.82), 0, 0.243, -0.009, o.hood);
      p.add(new THREE.ConeGeometry(0.012, 0.05, 5).rotateX(-2.2), 0, 0.255, -0.04, o.hood);
      p.box(0.05, 0.012, 0.004, 0, 0.262, 0.016, dark(o.hood, 0.8));
    },
    // (la main droite est vide : elle tire la corde ; une flèche encochée au combat)
    right(p) { p.box(0.003, 0.08, 0.003, 0, -0.01, 0, 0x8a6a44); p.add(new THREE.ConeGeometry(0.005, 0.014, 4), 0, 0.077, 0, STEEL); p.box(0.008, 0.016, 0.002, 0, -0.01, 0, WHITE); },
    left(p) {
      // l'arc, tenu droit, ses branches courbées vers l'avant de l'archer, sa corde tendue de bout en bout
      const r = 0.08, arc = 2.1;
      p.add(new THREE.TorusGeometry(r, 0.009, 4, 10, arc).rotateZ(-arc / 2).rotateY(-Math.PI / 2).translate(0, 0, -r * 0.82), 0, 0, 0.02, o.bow);
      p.box(0.003, 2 * r * Math.sin(arc / 2), 0.003, 0, -r * Math.sin(arc / 2), 0.02 - r * 0.82 + r * Math.cos(arc / 2) - 0.001, o.string, 0, o.neon ? 'neon' : false);
      p.box(0.008, 0.016, 0.008, 0, -0.008, 0.02 + r * 0.18, LEATHER);
    },
  };
}

/** Les archers : tunique antique, cotte de mailles et capuchon vert au Moyen Âge, chasseur de l'âge industriel, treillis moderne, armure futuriste à corde lumineuse */
const ARCHERS = [
  archerKit({ tunic: 0xc89a4a, hood: 0x4a7a3a, leg: SKIN, boot: LEATHER, arm: SKIN, shoulder: 0x4a7a3a, bow: 0x7a4a26, string: 0xf0ece0 }),
  archerKit({ tunic: 0xc89a4a, hood: 0x4a7a3a, leg: SKIN, boot: LEATHER, arm: SKIN, shoulder: 0x4a7a3a, bow: 0x7a4a26, string: 0xf0ece0 }),
  archerKit({ tunic: 0x7a5a3a, hood: 0x2f6a34, leg: 0x5a4a3a, boot: LEATHER, arm: 0x8f949c, shoulder: 0x2f6a34, bow: 0x6a3a1e, string: 0xf0ece0, mail: true }),
  archerKit({ tunic: 0x2e4a32, hood: 0x22382a, leg: 0x3a3a34, boot: BLACK, arm: 0x2e4a32, shoulder: 0x22382a, bow: 0x5a3a24, string: 0xf0ece0 }),
  archerKit({ tunic: 0x5a6a46, hood: 0x4a5236, leg: 0x5a6a46, boot: 0x2e2a24, arm: 0x5a6a46, shoulder: 0x3e4a32, bow: 0x2a2a2e, string: 0xc8c8c8 }),
  archerKit({ tunic: 0xe8ecf0, hood: 0xd0d8e0, leg: 0xe8ecf0, boot: 0x3a4250, arm: 0xdfe4ea, shoulder: 0xd0d8e0, bow: 0x3a4250, string: 0x5af0ff, neon: true }),
];

/** Chevalier : armure de plates, cape rouge, grand heaume à plumet, écu armorié, épée */
const paladin: Kit = {
  ...knight,
  dress(p) {
    knight.dress(p);
    // plastron qui dépasse du tabard, cape rouge dans le dos, grandes épaulières
    p.box(0.07, 0.03, 0.062, 0, 0.17, 0, STEEL);
    p.box(0.09, 0.15, 0.008, 0, 0.06, -0.034, 0xb8322c);
    for (const s of [-1, 1]) p.sphere(0.026, s * 0.05, 0.2, 0, dark(STEEL, 0.9), 0, 0.7);
  },
  head(p) {
    // grand heaume à fente en croix, plumet rouge et blanc
    p.cyl(0.031, 0.032, 0.062, 8, 0, 0.216, 0, STEEL);
    p.cyl(0.024, 0.031, 0.012, 8, 0, 0.278, 0, STEEL);
    p.box(0.044, 0.006, 0.01, 0, 0.252, 0.029, 0x2a2e34); p.box(0.006, 0.026, 0.01, 0, 0.234, 0.029, 0x2a2e34);
    p.add(new THREE.IcosahedronGeometry(0.02, 0).scale(0.7, 1.5, 1.2), 0, 0.31, -0.006, 0xd8443a);
    p.add(new THREE.IcosahedronGeometry(0.014, 0).scale(0.7, 1.4, 1.2), 0, 0.32, 0.01, WHITE);
  },
  left(p) {
    // écu bleu au lion d'or (un losange d'or au milieu), plus grand que celui de l'homme d'armes
    p.box(0.012, 0.09, 0.07, 0.008, -0.05, 0.008, BLUE);
    p.add(new THREE.ConeGeometry(0.035, 0.035, 4).rotateZ(Math.PI).rotateY(Math.PI / 4), 0.008, -0.1, 0.008, BLUE);
    p.add(new THREE.BoxGeometry(0.013, 0.09, 0.006), 0.008, -0.05, 0.044, GOLD); p.add(new THREE.BoxGeometry(0.013, 0.09, 0.006), 0.008, -0.05, -0.028, GOLD);
    p.add(new THREE.BoxGeometry(0.014, 0.024, 0.024), 0.008, -0.045, 0.008, GOLD, 0, false, Math.PI / 4);
  },
};

/** Cuirassier de l'âge industriel : cuirasse d'acier sur l'habit bleu, casque à crinière noire, sabre, sans bouclier */
const cuirassier: Kit = {
  leg: WHITE, boot: BLACK, hip: 0x2c3e6a, torso: 0x2c3e6a, arm: 0x2c3e6a, hand: WHITE, hold: 'blade',
  dress(p) {
    p.box(0.08, 0.1, 0.055, 0, 0.11, 0, 0x2c3e6a);
    p.box(0.086, 0.075, 0.062, 0, 0.13, 0, 0xd8dce2);
    p.box(0.088, 0.006, 0.064, 0, 0.2, 0, GOLD);
    for (const s of [-1, 1]) p.box(0.028, 0.012, 0.042, s * 0.048, 0.205, 0, 0xd8443a);
    p.box(0.088, 0.01, 0.064, 0, 0.125, 0, WHITE);
  },
  head(p) {
    p.sphere(0.032, 0, 0.25, 0, 0xd8dce2, 1, 0.85);
    p.box(0.012, 0.016, 0.06, 0, 0.274, -0.004, GOLD);
    p.add(new THREE.BoxGeometry(0.012, 0.07, 0.016), 0, 0.23, -0.04, BLACK, 0, false, 0, 0.4);
    p.box(0.05, 0.004, 0.022, 0, 0.236, 0.028, 0x2a2a2e);
  },
  right(p) {
    // sabre droit à garde de laiton
    p.box(0.01, 0.024, 0.01, 0, -0.014, 0, BLACK); p.box(0.03, 0.008, 0.014, 0, 0.0, 0, GOLD);
    p.box(0.008, 0.12, 0.004, 0, 0.004, 0, STEEL);
  },
  left() {},
};

/** Grand bouclier rectangulaire (moderne : polycarbonate fumé ; futuriste : champ de force) */
function bigShield(p: Parts, c: number, rim: number, glow: boolean) {
  p.box(0.008, 0.13, 0.075, 0.01, -0.08, 0.008, c, 0, glow ? 'neon' : false);
  p.box(0.01, 0.006, 0.077, 0.01, 0.048, 0.008, rim); p.box(0.01, 0.006, 0.077, 0.01, -0.082, 0.008, rim);
}

/** Lourd moderne : treillis, gilet épais, casque à visière, grand bouclier, matraque-épée */
const heavyNow: Kit = {
  ...modern, hold: 'blade',
  head(p) {
    modern.head(p);
    p.box(0.05, 0.024, 0.006, 0, 0.222, 0.031, 0x6a8090);
  },
  right(p) { p.box(0.01, 0.024, 0.01, 0, -0.014, 0, BLACK); p.box(0.012, 0.1, 0.006, 0, 0.004, 0, 0x3c3c40); },
  left: (p) => bigShield(p, 0x8aa0b0, 0x2a2a2e, false),
};

/** Chevalier futuriste : exo-armure à liserés d'or, lame d'énergie, bouclier de champ de force */
const heavyFuture: Kit = {
  ...future, hold: 'blade',
  dress(p) {
    future.dress(p);
    for (const s of [-1, 1]) p.box(0.036, 0.03, 0.064, s * 0.05, 0.19, 0, 0xe8c66a);
  },
  right(p) { p.box(0.01, 0.024, 0.01, 0, -0.014, 0, 0x3a4250); p.box(0.03, 0.008, 0.012, 0, 0.0, 0, 0xe8c66a); p.box(0.01, 0.12, 0.004, 0, 0.006, 0, 0x5af0ff, 0, 'neon'); },
  left: (p) => bigShield(p, 0x5af0ff, 0xe8c66a, true),
};

/** Long fusil porté droit (le long de +y depuis la main) : crosse, platine, canon de `len` ; lunette ou rail lumineux au besoin */
function longRifle(p: Parts, o: { wood: number; metal: number; len: number; scope?: boolean; neon?: boolean }) {
  p.box(0.014, 0.05, 0.02, 0, -0.04, 0, o.wood);
  p.box(0.01, 0.12, 0.012, 0, 0.0, 0.004, o.wood);
  p.box(0.005, o.len, 0.005, 0, -0.04 + o.len / 2 + 0.05, 0.012, o.metal);
  if (o.scope) p.box(0.008, 0.045, 0.008, 0, 0.04, 0.024, 0x2a2a2e);
  if (o.neon) p.box(0.003, o.len * 0.8, 0.003, 0, o.len / 2, 0.017, 0x5af0ff, 0, 'neon');
}

/** Tirailleur de l'âge industriel (l'archer devenu tireur) : habit vert à passepoils, buffleteries noires, giberne, shako vert à pompon, long fusil sans baïonnette */
const tirailleur: Kit = {
  leg: 0x6a5a48, boot: BLACK, hip: 0x2f5a34, torso: 0x2f5a34, arm: 0x2f5a34, hand: LEATHER, hold: 'rifle',
  dress(p) {
    p.box(0.08, 0.1, 0.055, 0, 0.11, 0, 0x2f5a34);
    p.box(0.084, 0.04, 0.02, 0, 0.09, -0.02, 0x2f5a34);
    p.box(0.04, 0.06, 0.004, 0, 0.16, 0.028, 0x22402a);
    p.add(new THREE.BoxGeometry(0.012, 0.11, 0.004), 0, 0.165, 0.03, BLACK, 0, false, 0.62);
    p.add(new THREE.BoxGeometry(0.012, 0.11, 0.004), 0, 0.165, 0.03, BLACK, 0, false, -0.62);
    p.box(0.086, 0.008, 0.058, 0, 0.12, 0, BLACK);
    for (const s of [-1, 1]) p.box(0.028, 0.012, 0.04, s * 0.048, 0.205, 0, 0x22402a);
    p.box(0.05, 0.03, 0.016, 0, 0.11, -0.034, BLACK);
    // cornet à poudre et sac de balles au côté
    p.box(0.02, 0.03, 0.016, 0.046, 0.1, 0.012, LEATHER);
  },
  head(p) {
    p.cyl(0.03, 0.027, 0.055, 8, 0, 0.245, 0, 0x2f5a34);
    p.box(0.064, 0.006, 0.03, 0, 0.243, 0.02, BLACK);
    p.box(0.02, 0.02, 0.004, 0, 0.265, 0.029, GOLD);
    p.sphere(0.011, 0, 0.292, 0.004, 0xe8c66a, 0, 1.2);
  },
  right: (p) => longRifle(p, { wood: 0x7a5236, metal: 0x5a5f66, len: 0.16 }),
  left() {},
};

/** Tireur d'élite moderne : treillis, filet de camouflage, fusil à lunette */
const sniper: Kit = {
  ...modern, hold: 'rifle',
  head(p) {
    p.sphere(0.032, 0, 0.252, 0, 0x6a7448, 1, 0.75);
    p.cyl(0.048, 0.04, 0.008, 9, 0, 0.243, 0, 0x5a6438);
    p.box(0.07, 0.01, 0.07, 0, 0.268, 0, 0x4a5236);
  },
  right: (p) => longRifle(p, { wood: 0x3c3c40, metal: 0x2a2a2e, len: 0.19, scope: true }),
};

/**
 * Pilote de drones (l'archer de l'âge futuriste) : combinaison blanche à liserés cyan, casque à grande visière lumineuse et
 * antenne, deux nids à drones dans le dos (les drones eux-mêmes volent autour de lui : voir `futureTroops.ts`), émetteur de
 * pilotage à écran lumineux dans la main
 */
const dronePilot: Kit = {
  ...future, hold: 'rifle',
  dress(p) {
    future.dress(p);
    // deux nids à drones sur le sac, voyants rouges
    for (const s of [-1, 1]) { p.box(0.026, 0.034, 0.028, s * 0.03, 0.14, -0.07, 0x3a4250); p.box(0.018, 0.004, 0.004, s * 0.03, 0.17, -0.085, 0xff3a4a, 0, 'neon'); }
  },
  head(p) {
    // casque intégral à visière enveloppante bleutée et antenne de liaison
    p.sphere(0.038, 0, 0.231, 0, 0xf6f8fa, 1);
    p.box(0.058, 0.026, 0.014, 0, 0.218, 0.032, 0x1e3a5a);
    p.box(0.05, 0.005, 0.004, 0, 0.226, 0.04, 0x5af0ff, 0, 'neon');
    p.box(0.003, 0.05, 0.003, 0.03, 0.26, -0.01, 0x3a4250);
    p.box(0.008, 0.008, 0.008, 0.03, 0.31, -0.01, 0x5af0ff, 0, 'neon');
  },
  right(p) {
    // émetteur de pilotage : poignée, tablette à écran lumineux, antenne
    p.box(0.014, 0.034, 0.016, 0, -0.03, -0.004, 0x3a4250);
    p.box(0.05, 0.008, 0.04, 0, -0.004, 0.026, 0xf0f2f4);
    p.box(0.04, 0.004, 0.03, 0, 0.002, 0.026, 0x5af0ff, 0, 'neon');
    p.box(0.003, 0.03, 0.003, 0.022, 0.004, 0.044, 0x3a4250);
  },
};

/** Les tireurs (l'archer, une fois le fusil connu) : tirailleur, tireur d'élite, pilote de drones */
const GUNNERS = [tirailleur, tirailleur, tirailleur, tirailleur, sniper, dronePilot];

/**
 * Fusilier de l'âge industriel (le soldat n'est plus lancier) : l'habit bleu, le shako et les buffleteries, mais un long fusil sans
 * baïonnette, épaulé pour tirer. Moderne et futuriste : le fusil d'assaut et le fusil à impulsions de la tenue d'époque
 */
const fusilier: Kit = { ...napoleonic, hold: 'rifle', right: (p) => longRifle(p, { wood: 0x7a5236, metal: 0x5a5f66, len: 0.15 }), left() {} };
/** Les fusiliers (avant l'âge industriel, personne : le rôle n'y sert pas) */
const RIFLEMEN = [fusilier, fusilier, fusilier, fusilier, { ...modern, hold: 'rifle' as const }, future];

/** Hallebardier de l'âge industriel (le chevalier devenu piquier) : cuirasse et tassettes sur l'habit rouge, morion à crête, hallebarde */
const halberdier: Kit = {
  leg: 0x4a3e34, boot: LEATHER, hip: 0x9a2e2a, torso: STEEL, arm: 0x9a2e2a, hand: LEATHER, hold: 'spear',
  dress(p) {
    p.box(0.082, 0.1, 0.056, 0, 0.1, 0, 0x9a2e2a);
    p.box(0.086, 0.07, 0.06, 0, 0.14, 0, STEEL);
    p.box(0.022, 0.06, 0.062, 0, 0.14, 0, dark(STEEL, 0.8));
    for (const x of [-0.026, 0, 0.026]) p.box(0.022, 0.05, 0.05, x, 0.07, 0.006, dark(STEEL, 0.9));
    p.box(0.088, 0.01, 0.062, 0, 0.105, 0, LEATHER);
    for (const s of [-1, 1]) p.sphere(0.024, s * 0.05, 0.195, 0, STEEL, 0, 0.7);
    p.box(0.09, 0.15, 0.008, 0, 0.07, -0.034, 0x6a1e1c);
  },
  head(p) {
    // morion : calotte, crête, bord relevé
    p.sphere(0.03, 0, 0.25, 0, STEEL, 1, 0.8);
    p.box(0.01, 0.026, 0.07, 0, 0.275, 0, STEEL);
    p.cyl(0.05, 0.042, 0.008, 10, 0, 0.238, 0, STEEL);
  },
  right(p) {
    // hallebarde : longue hampe, fer de hache, pointe, croc
    p.box(0.009, 0.34, 0.009, 0, -0.04, 0, 0x7a5a3e);
    p.box(0.005, 0.045, 0.05, 0, 0.2, 0.026, STEEL);
    p.add(new THREE.ConeGeometry(0.008, 0.06, 4), 0, 0.26, 0, STEEL);
    p.box(0.004, 0.012, 0.03, 0, 0.19, -0.018, STEEL);
    p.box(0.012, 0.012, 0.012, 0, 0.17, 0, dark(STEEL, 0.8));
  },
  left() {},
};

/** Lance-roquettes sur l'épaule (le long de +y depuis la main) : long tube, cône arrière, poignée, roquette engagée à l'avant */
function bazookaTube(p: Parts, tube: number, band: number, neon = false) {
  p.cyl(0.016, 0.016, 0.2, 8, 0, 0.03, 0.01, tube);
  p.cyl(0.022, 0.016, 0.03, 8, 0, -0.08, 0.01, dark(tube, 0.7));
  p.cyl(0.022, 0.018, 0.02, 8, 0, 0.14, 0.01, dark(tube, 0.8));
  p.add(new THREE.ConeGeometry(0.014, 0.04, 6), 0, 0.17, 0.01, 0xb8322c);
  p.box(0.005, 0.03, 0.02, 0, 0.02, 0.0, BLACK);
  p.box(0.034, 0.008, 0.034, 0, 0.06, 0.01, band, 0, neon ? 'neon' : false);
}

/** Bazooka moderne : treillis, gilet, casque, lance-roquettes vert sur l'épaule */
const bazooka: Kit = {
  ...modern, hold: 'rifle',
  right: (p) => bazookaTube(p, 0x4a5a3a, 0xe8c66a),
};

/** Exo-lanceur futuriste : exo-armure, lanceur de missiles à bandes lumineuses */
const exoLauncher: Kit = {
  ...future, hold: 'rifle',
  right: (p) => bazookaTube(p, 0xe8ecf0, 0x5af0ff, true),
};

/** Les chevaliers : chevalier en armure (dès l'Antiquité s'il le faut), hallebardier (âge industriel), bazooka (moderne), exo-lanceur (futuriste) */
const KNIGHTS = [paladin, paladin, paladin, halberdier, bazooka, exoLauncher];

const NAVY = 0x22305a, BUFF = 0xe8c060, SILVER = 0xd8dce2, SIENNA = 0x8a5a3a;

/** Bicorne noir porté en bataille (pointes au-dessus des épaules), galon d'argent, cocarde tricolore */
function bicorne(p: Parts, y: number) {
  const half = (r: number) => new THREE.CylinderGeometry(r, r, 0.026, 12, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1.25, 0.62, 1);
  p.add(half(0.046), 0, y, 0, BLACK);
  for (const z of [-0.0135, 0.0135]) p.add(new THREE.TorusGeometry(0.045, 0.0025, 3, 14, Math.PI).scale(1.25, 0.62, 1), 0, y, z, SILVER);
  p.box(0.11, 0.008, 0.03, 0, y - 0.004, 0, BLACK);
  p.add(new THREE.CylinderGeometry(0.011, 0.011, 0.004, 10).rotateX(Math.PI / 2), 0.026, y + 0.016, 0.016, 0xd8443a);
  p.add(new THREE.CylinderGeometry(0.0075, 0.0075, 0.005, 10).rotateX(Math.PI / 2), 0.026, y + 0.016, 0.017, WHITE);
  p.add(new THREE.CylinderGeometry(0.004, 0.004, 0.006, 8).rotateX(Math.PI / 2), 0.026, y + 0.016, 0.018, 0x2c4a9a);
}

/** Mousqueton de gendarme, court, sans baïonnette */
function musketoon(p: Parts) {
  p.box(0.014, 0.045, 0.02, 0, -0.036, 0, 0x7a5236);
  p.box(0.01, 0.1, 0.012, 0, 0.0, 0.004, 0x7a5236);
  p.box(0.005, 0.11, 0.005, 0, 0.01, 0.012, 0x4a4f56);
}

/** Pic de mineur : manche de bois, fer à deux pointes */
function pick(p: Parts) {
  p.box(0.01, 0.12, 0.01, 0, 0.02, 0, 0x8a6a48);
  p.add(new THREE.BoxGeometry(0.075, 0.012, 0.012), 0, 0.08, 0, 0x6a6f76, 0, false, 0.12);
  for (const s of [-1, 1]) p.add(new THREE.ConeGeometry(0.006, 0.02, 4).rotateZ(-s * Math.PI / 2), s * 0.045, 0.084 - s * 0.004, 0, 0x6a6f76);
}

/** Sergent du guet au Moyen Âge : chapel de fer, tabard bleu à la fleur d'or, cotte, hallebarde, lanterne */
const watchman: Kit = {
  leg: 0x6a6a72, boot: LEATHER, hip: BLUE, torso: 0x8f949c, arm: 0x8f949c, hand: LEATHER,
  dress(p) {
    p.box(0.08, 0.1, 0.055, 0, 0.11, 0, 0x8f949c);
    p.box(0.084, 0.11, 0.058, 0, 0.09, 0, BLUE);
    p.box(0.02, 0.02, 0.06, 0, 0.16, 0, GOLD); p.box(0.008, 0.035, 0.061, 0, 0.152, 0, GOLD);
    p.box(0.086, 0.01, 0.06, 0, 0.13, 0, LEATHER);
  },
  head(p) {
    // chapel de fer : calotte et large bord rabattu
    p.sphere(0.03, 0, 0.25, 0, STEEL, 1, 0.75);
    p.cyl(0.05, 0.044, 0.012, 10, 0, 0.237, 0, STEEL);
  },
  right(p) {
    // hallebarde : hampe, fer de hache, pique, croc
    p.box(0.008, 0.22, 0.008, 0, 0.06, 0, 0x7a5a3e);
    p.box(0.004, 0.035, 0.03, 0, 0.15, 0.016, STEEL);
    p.add(new THREE.ConeGeometry(0.006, 0.03, 4), 0, 0.185, 0, STEEL);
    p.box(0.003, 0.008, 0.016, 0, 0.16, -0.01, STEEL);
  },
  left(p) {
    // lanterne de corne
    p.box(0.003, 0.02, 0.003, 0, -0.005, 0, 0x3c3c40);
    p.box(0.022, 0.03, 0.022, 0, -0.035, 0, 0xf2d27a); p.box(0.026, 0.006, 0.026, 0, -0.017, 0, 0x3c3c40);
  },
};

/** Gendarme de l'âge industriel : bicorne en bataille, habit bleu de roi, buffleteries jaunes bordées de blanc, trèfles et aiguillettes d'argent, gants blancs, mousqueton */
const gendarme: Kit = {
  leg: NAVY, boot: BLACK, hip: NAVY, torso: NAVY, arm: NAVY, hand: WHITE, hold: 'rifle',
  dress(p) {
    p.box(0.08, 0.1, 0.055, 0, 0.11, 0, NAVY);
    p.box(0.084, 0.045, 0.02, 0, 0.088, -0.02, NAVY);
    p.box(0.084, 0.014, 0.058, 0, 0.196, 0, 0xb8322c);
    for (let k = 0; k < 4; k++) p.box(0.006, 0.006, 0.004, 0.012, 0.128 + k * 0.018, 0.029, SILVER);
    // baudrier jaune bordé de blanc en écharpe, ceinturon jaune, giberne noire
    p.add(new THREE.BoxGeometry(0.02, 0.125, 0.003), 0, 0.158, 0.029, WHITE, 0, false, 0.62);
    p.add(new THREE.BoxGeometry(0.014, 0.125, 0.004), 0, 0.158, 0.03, BUFF, 0, false, 0.62);
    p.box(0.086, 0.014, 0.06, 0, 0.118, 0, BUFF); p.box(0.016, 0.014, 0.004, 0, 0.118, 0.031, SILVER);
    p.box(0.04, 0.03, 0.016, 0.0, 0.11, -0.034, BLACK);
    // trèfles d'argent sur les épaules, aiguillette pendue à l'épaule gauche
    for (const s of [-1, 1]) { p.box(0.03, 0.01, 0.042, s * 0.048, 0.207, 0, SILVER); p.sphere(0.009, s * 0.06, 0.207, 0, SILVER); }
    p.add(new THREE.BoxGeometry(0.004, 0.055, 0.004), 0.034, 0.17, 0.03, SILVER, 0, false, 0.35);
    p.add(new THREE.BoxGeometry(0.004, 0.05, 0.004), 0.026, 0.172, 0.031, SILVER, 0, false, 0.5);
  },
  head(p) { bicorne(p, 0.258); },
  right: musketoon,
  left() {},
};

/** Gendarme de l'époque moderne : képi bleu nuit à bandeau d'argent et sa grenade, blouson bleu marine, écusson, ceinturon et étui, fusil */
const gendarmeNow: Kit = {
  leg: 0x1e2a44, boot: BLACK, hip: 0x1e2a44, torso: 0x24345a, arm: 0x24345a, hand: BLACK, hold: 'rifle',
  dress(p) {
    p.box(0.08, 0.1, 0.055, 0, 0.11, 0, 0x24345a);
    p.box(0.086, 0.012, 0.06, 0, 0.118, 0, BLACK); p.box(0.018, 0.026, 0.016, 0.044, 0.1, 0.008, BLACK);
    p.box(0.02, 0.022, 0.004, -0.022, 0.18, 0.029, SILVER); p.box(0.012, 0.012, 0.005, -0.022, 0.182, 0.03, 0x2c4a9a);
    for (const s of [-1, 1]) p.box(0.028, 0.008, 0.04, s * 0.048, 0.205, 0, 0x1e2a44);
    // « GENDARMERIE » en lettres blanches dans le dos
    for (let k = 0; k < 6; k++) p.box(0.008, 0.01, 0.004, -0.025 + k * 0.01, 0.175, -0.029, WHITE);
  },
  head(p) {
    p.cyl(0.026, 0.024, 0.04, 10, 0, 0.245, 0, 0x1a2238);
    p.cyl(0.0265, 0.0265, 0.008, 10, 0, 0.25, 0, SILVER);
    p.box(0.04, 0.005, 0.022, 0, 0.245, 0.03, BLACK);
    p.box(0.01, 0.012, 0.004, 0, 0.266, 0.026, SILVER);
  },
  right: (p) => modern.right(p),
  left() {},
};

/** Mineur du Moyen Âge : capuchon et pèlerine, tablier de cuir sur les reins, pic */
const miner2: Kit = {
  leg: 0x6a5a4a, boot: LEATHER, hip: 0x7a6a54, torso: 0x8a7a64, arm: 0x8a7a64, hand: SKIN,
  dress(p) {
    p.box(0.08, 0.1, 0.055, 0, 0.11, 0, 0x8a7a64);
    p.box(0.086, 0.04, 0.06, 0, 0.17, 0, 0xe8e0c8);
    p.box(0.084, 0.06, 0.012, 0, 0.08, -0.032, LEATHER);
    p.box(0.086, 0.01, 0.06, 0, 0.12, 0, LEATHER);
  },
  head(p) { p.sphere(0.03, 0, 0.245, -0.004, 0xe8e0c8, 1, 0.9); p.add(new THREE.ConeGeometry(0.012, 0.04, 5), 0, 0.27, -0.03, 0xe8e0c8, 0, false, 0, -0.9); },
  right: pick,
  left(p) { p.box(0.003, 0.02, 0.003, 0, -0.005, 0, 0x3c3c40); p.box(0.02, 0.026, 0.02, 0, -0.033, 0, 0xf2c87a); },
};

/** Mineur de l'âge industriel : barrette de cuir et sa lampe, veste de toile bleue, foulard rouge, pantalon gris, pic, lampe de sûreté */
const miner3: Kit = {
  leg: 0x5a5a5e, boot: BLACK, hip: 0x5a5a5e, torso: 0x3a5a8a, arm: 0x3a5a8a, hand: SKIN,
  dress(p) {
    p.box(0.08, 0.1, 0.055, 0, 0.11, 0, 0x3a5a8a);
    p.box(0.05, 0.016, 0.03, 0, 0.198, 0.02, 0xc83a32);
    for (const s of [-1, 1]) p.box(0.024, 0.02, 0.006, s * 0.022, 0.13, 0.029, dark(0x3a5a8a, 0.8));
    p.box(0.086, 0.01, 0.06, 0, 0.118, 0, LEATHER);
    for (const [x, y] of [[-0.02, 0.15], [0.025, 0.11]]) p.box(0.016, 0.012, 0.004, x, y, 0.029, 0x2a2a2e);
  },
  head(p) {
    // barrette de cuir bouilli, sa lampe à flamme nue sur le front
    p.sphere(0.031, 0, 0.25, 0, 0x2a2622, 1, 0.7);
    p.cyl(0.036, 0.036, 0.006, 10, 0, 0.238, 0, 0x2a2622);
    p.box(0.012, 0.016, 0.01, 0, 0.255, 0.03, 0xc8a050); p.cone(0.005, 0.012, 4, 0, 0.264, 0.03, 0xffb04a, true);
  },
  right: pick,
  left(p) {
    // lampe de sûreté : pied de laiton, cylindre de verre qui luit, chapeau, crochet
    p.box(0.003, 0.016, 0.003, 0, -0.005, 0, 0x3c3c40);
    p.cyl(0.011, 0.011, 0.01, 8, 0, -0.048, 0, 0xc8a050);
    p.cyl(0.009, 0.009, 0.022, 8, 0, -0.038, 0, 0xf2e2a0);
    p.cyl(0.006, 0.011, 0.01, 8, 0, -0.016, 0, 0xc8a050);
  },
};

/** Mineur moderne : casque jaune et sa lampe frontale, combinaison orange à bandes réfléchissantes, gants, pic */
const miner4: Kit = {
  leg: 0xf28a3c, boot: BLACK, hip: 0xf28a3c, torso: 0xf28a3c, arm: 0xf28a3c, hand: 0x3c3c40,
  dress(p) {
    p.box(0.08, 0.1, 0.055, 0, 0.11, 0, 0xf28a3c);
    for (const y of [0.13, 0.17]) p.box(0.084, 0.008, 0.058, 0, y, 0, SILVER);
    p.box(0.086, 0.01, 0.06, 0, 0.118, 0, 0x2a2a2e);
  },
  head(p) {
    p.sphere(0.033, 0, 0.25, 0, 0xf2c23a, 1, 0.72);
    p.cyl(0.04, 0.04, 0.005, 10, 0, 0.238, 0.004, 0xf2c23a);
    p.box(0.016, 0.012, 0.008, 0, 0.255, 0.032, 0x3c3c40); p.box(0.01, 0.008, 0.004, 0, 0.255, 0.037, 0xfff4d0, 0, true);
  },
  right: pick,
  left() {},
};

/** Lance d'incendie de laiton, tenue à deux mains (on la pointe comme un fusil) */
function nozzle(p: Parts) {
  p.box(0.016, 0.03, 0.016, 0, -0.03, 0, 0x2a2a2e);
  p.cyl(0.01, 0.006, 0.07, 6, 0, -0.015, 0.0, 0xc8a050);
}

/** Sapeur-pompier de l'âge industriel : casque de laiton à crête, vareuse bleu nuit passepoilée de rouge, ceinturon et hachette, lance */
const fireman: Kit = {
  leg: 0x1e2440, boot: BLACK, hip: 0x1e2440, torso: 0x22305a, arm: 0x22305a, hand: LEATHER, hold: 'rifle',
  dress(p) {
    p.box(0.08, 0.1, 0.055, 0, 0.11, 0, 0x22305a);
    for (const y of [0.13, 0.17]) p.box(0.082, 0.004, 0.057, 0, y, 0, 0xd8443a);
    p.box(0.086, 0.014, 0.06, 0, 0.118, 0, BLACK); p.box(0.016, 0.014, 0.004, 0, 0.118, 0.031, 0xc8a050);
    p.box(0.012, 0.05, 0.02, 0.045, 0.085, -0.01, 0x7a5236); p.box(0.02, 0.018, 0.006, 0.045, 0.11, -0.01, STEEL);
    for (let k = 0; k < 3; k++) p.box(0.006, 0.006, 0.004, 0.012, 0.14 + k * 0.02, 0.029, 0xc8a050);
  },
  head(p) {
    // casque de laiton : bombe, bord, crête et cimier
    p.sphere(0.032, 0, 0.25, 0, 0xd8b050, 1, 0.8);
    p.cyl(0.04, 0.036, 0.008, 10, 0, 0.236, -0.004, 0xd8b050);
    p.box(0.01, 0.022, 0.06, 0, 0.27, 0, 0xe8c66a);
    p.box(0.02, 0.016, 0.006, 0, 0.255, 0.031, 0xc8a050);
  },
  right: nozzle,
  left() {},
};

/** Sapeur-pompier moderne : casque argenté à visière dorée, veste de feu bleu nuit à bandes jaunes réfléchissantes, lance */
const firemanNow: Kit = {
  leg: 0x1e2440, boot: BLACK, hip: 0x1e2440, torso: 0x24304a, arm: 0x24304a, hand: BLACK, hold: 'rifle',
  dress(p) {
    p.box(0.08, 0.1, 0.055, 0, 0.11, 0, 0x24304a);
    for (const y of [0.12, 0.165]) p.box(0.084, 0.01, 0.059, 0, y, 0, 0xe8e040);
    p.box(0.04, 0.012, 0.004, 0, 0.19, -0.029, 0xd84a3e);
  },
  head(p) {
    p.sphere(0.034, 0, 0.25, 0, 0xd8dce2, 1, 0.85);
    p.box(0.05, 0.02, 0.008, 0, 0.238, 0.03, 0xe8c040);
    p.box(0.012, 0.006, 0.06, 0, 0.278, 0, 0xd8dce2);
  },
  right: nozzle,
  left() {},
};

const RED = 0xd84a3e;

/** Infirmier de l'âge industriel : longue blouse blanche boutonnée, croix rouge sur la poitrine, calot blanc à croix, trousse de cuir */
const medic: Kit = {
  leg: 0x3a3a42, boot: BLACK, hip: WHITE, torso: WHITE, arm: WHITE, hand: SKIN, hold: 'rifle',
  dress(p) {
    p.box(0.08, 0.13, 0.055, 0, 0.08, 0, WHITE);
    for (let k = 0; k < 4; k++) p.box(0.005, 0.005, 0.004, 0.012, 0.1 + k * 0.025, 0.029, 0xb8b4ac);
    p.box(0.084, 0.008, 0.058, 0, 0.13, 0, 0xd8d4cc);
    p.box(0.006, 0.02, 0.004, -0.02, 0.165, 0.029, RED); p.box(0.02, 0.006, 0.004, -0.02, 0.172, 0.029, RED);
  },
  head(p) {
    p.box(0.046, 0.012, 0.046, 0, 0.246, 0, 0x5a3e2c);
    p.box(0.044, 0.02, 0.044, 0, 0.252, 0, WHITE);
    p.box(0.004, 0.012, 0.003, 0, 0.256, 0.0225, RED); p.box(0.012, 0.004, 0.003, 0, 0.26, 0.0225, RED);
  },
  right() {},
  left(p) { p.box(0.004, 0.02, 0.004, 0, -0.01, 0, LEATHER); p.box(0.04, 0.03, 0.022, 0, -0.04, 0, 0x7a4a2e); p.box(0.042, 0.006, 0.024, 0, -0.016, 0, 0x5a3420); },
};

/** Ambulancier moderne : pantalon bleu nuit, polo blanc, gilet jaune fluo à bandes argentées, étoile de vie bleue, sac rouge */
const medicNow: Kit = {
  leg: 0x1e2a44, boot: BLACK, hip: 0x1e2a44, torso: 0xf2f2f2, arm: 0xf2f2f2, hand: SKIN, hold: 'rifle',
  dress(p) {
    p.box(0.08, 0.1, 0.055, 0, 0.11, 0, 0xd8e83a);
    for (const y of [0.13, 0.165]) p.box(0.084, 0.008, 0.059, 0, y, 0, SILVER);
    p.box(0.02, 0.02, 0.004, -0.02, 0.185, 0.0285, 0x2c6ad8);
    p.box(0.03, 0.012, 0.004, 0, 0.185, -0.0285, 0x2c6ad8);
  },
  head(p) { p.box(0.046, 0.014, 0.046, 0, 0.25, 0, 0x3a2a1e); p.box(0.046, 0.03, 0.01, 0, 0.222, -0.019, 0x3a2a1e); },
  right() {},
  left(p) { p.box(0.004, 0.02, 0.004, 0, -0.01, 0, BLACK); p.box(0.045, 0.032, 0.024, 0, -0.042, 0, RED); p.box(0.006, 0.02, 0.025, 0, -0.035, 0, WHITE); },
};

/** Sergent de ville de l'âge industriel : képi à bandeau d'argent, tunique bleu nuit à double rangée de boutons, pèlerine, bâton blanc */
const policeman: Kit = {
  leg: NAVY, boot: BLACK, hip: NAVY, torso: NAVY, arm: NAVY, hand: SKIN, hold: 'rifle',
  dress(p) {
    p.box(0.08, 0.12, 0.055, 0, 0.09, 0, NAVY);
    for (const x of [-0.012, 0.012]) for (let k = 0; k < 4; k++) p.box(0.005, 0.005, 0.004, x, 0.11 + k * 0.022, 0.029, SILVER);
    p.box(0.086, 0.01, 0.06, 0, 0.12, 0, BLACK);
    // la pèlerine sur les épaules
    p.box(0.1, 0.04, 0.066, 0, 0.17, 0, dark(NAVY, 0.85));
  },
  head(p) {
    p.cyl(0.025, 0.023, 0.036, 10, 0, 0.244, 0, NAVY);
    p.cyl(0.0255, 0.0255, 0.008, 10, 0, 0.248, 0, SILVER);
    p.box(0.04, 0.005, 0.02, 0, 0.244, 0.028, BLACK);
  },
  // le bâton blanc, pendu au poignet
  right(p) { p.box(0.008, 0.07, 0.008, 0, -0.065, 0, 0xf4f2ee); },
  left() {},
};

/** Policier moderne : casquette bleu nuit au bandeau damier, chemise bleu clair, gilet « POLICE », ceinturon et étui, radio */
const policeNow: Kit = {
  leg: 0x1e2a44, boot: BLACK, hip: 0x1e2a44, torso: 0x7a9ad0, arm: 0x7a9ad0, hand: SKIN, hold: 'rifle',
  dress(p) {
    p.box(0.08, 0.1, 0.055, 0, 0.11, 0, 0x7a9ad0);
    p.box(0.082, 0.07, 0.057, 0, 0.12, 0, 0x1e2a44);
    for (let k = 0; k < 6; k++) p.box(0.008, 0.01, 0.004, -0.025 + k * 0.01, 0.165, -0.0295, WHITE);
    p.box(0.03, 0.008, 0.004, 0.018, 0.17, 0.0295, WHITE);
    p.box(0.086, 0.012, 0.06, 0, 0.118, 0, BLACK); p.box(0.018, 0.026, 0.016, 0.044, 0.1, 0.008, BLACK);
    p.box(0.012, 0.02, 0.01, -0.03, 0.18, 0.03, BLACK);
  },
  head(p) {
    p.cyl(0.026, 0.024, 0.026, 10, 0, 0.244, 0, 0x1e2a44);
    for (let k = 0; k < 8; k++) p.box(0.006, 0.008, 0.003, Math.cos(k * 0.785) * 0.025, 0.25, Math.sin(k * 0.785) * 0.025, k % 2 ? WHITE : 0x2c4a9a);
    p.box(0.042, 0.005, 0.022, 0, 0.244, 0.028, BLACK);
  },
  right() {},
  left() {},
};

/** Gendarmes (sergents du guet au Moyen Âge) et mineurs de chaque époque */
const GENDARMES = [watchman, watchman, watchman, gendarme, gendarmeNow, gendarmeNow];
/** Ambulanciers et policiers des secours (ils n'existent qu'à partir de l'âge industriel) */
const MEDICS = [medic, medic, medic, medic, medicNow, medicNow];
const POLICE = [policeman, policeman, policeman, policeman, policeNow, policeNow];
const MINERS = [miner2, miner2, miner2, miner3, miner4, miner4];
const FIREMEN = [fireman, fireman, fireman, fireman, firemanNow, firemanNow];

/** Qui est-ce : un soldat de l'époque, un gendarme, un mineur */
export type SoldierRole = 'soldier' | 'gendarme' | 'miner' | 'fireman' | 'medic' | 'police' | 'spearman' | 'archer' | 'knight' | 'gunner' | 'rifleman';
/** Les troupes de la garnison (leurs géométries sont partagées d'un soldat à l'autre : `makeSoldier` les garde en cache) */
const TROOP_ROLES: Partial<Record<SoldierRole, Kit[]>> = { spearman: SPEARMEN, archer: ARCHERS, knight: KNIGHTS, gunner: GUNNERS, rifleman: RIFLEMEN };
const troopGeo = new Map<string, THREE.BufferGeometry>();
/** Géométrie partagée d'une pièce de troupe (`key` : rôle, époque, teint, pièce), faite à la première demande */
function shared(key: string | null, make: () => THREE.BufferGeometry) {
  if (!key) return make();
  let g = troopGeo.get(key);
  if (!g) { g = make(); troopGeo.set(key, g); }
  return g;
}

/** Torche du garde, flamme à part (elle vacille) */
function torch(): Parts {
  const p = new Parts();
  p.cyl(0.006, 0.007, 0.08, 5, 0, -0.03, 0, 0x6a4a34);
  p.cyl(0.011, 0.009, 0.012, 6, 0, 0.05, 0, 0x3c3c40);
  return p;
}

/** Fantassin de l'époque `age` ; `v` varie son teint ; `withTorch` : une torche dans la main gauche à la place de l'écu */
export function makeSoldier(age: number, v = 0, withTorch = false, role: SoldierRole = 'soldier'): Soldier {
  const era = Math.min(5, Math.max(0, age)), kit = (TROOP_ROLES[role] ?? (role === 'gendarme' ? GENDARMES : role === 'miner' ? MINERS : role === 'fireman' ? FIREMEN : role === 'medic' ? MEDICS : role === 'police' ? POLICE : KITS))[era], si = ((v % SKINS.length) + SKINS.length) % SKINS.length, skin = SKINS[si];
  const tint = (c: number) => (c === SKIN ? skin : c);
  // les troupes partagent leurs géométries (une par rôle, époque, teint et pièce) : une recrue de plus ne coûte presque rien
  const ck = TROOP_ROLES[role] && !withTorch ? `${role}|${era}|${si}|` : null;
  let glowG: THREE.BufferGeometry | null = null;
  const hullG = shared(ck && ck + 'body', () => {
    const p = new Parts();
    kit.dress(p);
    p.box(0.042, 0.042, 0.042, 0, 0.212, 0, skin);
    p.box(0.03, 0.006, 0.004, 0, 0.226, 0.021, dark(skin, 0.6));
    kit.head(p);
    const built = p.build(false);
    if (built.glow) glowG = built.glow;
    return built.body;
  });
  if (ck) glowG = troopGeo.get(ck + 'glow') ?? (glowG ? (troopGeo.set(ck + 'glow', glowG), glowG) : null);
  // dessiné pour des habitants de 0,3, ramené à leur taille
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  root.scale.setScalar(HUMAN_K);
  const hull = new THREE.Mesh(hullG, mats.body);
  hull.castShadow = true;
  body.add(hull);
  if (glowG) body.add(new THREE.Mesh(glowG, mats.glow));
  // jambes (pivot à la hanche) et bras (pivot à l'épaule), ce que tient chaque main au bout du bras
  const legs: THREE.Object3D[] = [], arms: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(shared(ck && ck + 'leg', () => {
      const lp = new Parts();
      lp.box(0.03, 0.07, 0.034, 0, -0.075, 0, tint(kit.leg));
      lp.box(0.032, 0.03, 0.044, 0, -0.1, 0.006, kit.boot);
      if (kit === modern || kit === heavyNow) lp.box(0.032, 0.014, 0.01, 0, -0.06, 0.018, 0x2e2a24);
      return lp.build(false).body;
    }), mats.body);
    leg.position.set(s * 0.02, 0.1, 0);
    leg.castShadow = true;
    root.add(leg);
    legs.push(leg);
  }
  let flame: THREE.Object3D | null = null;
  for (const s of [-1, 1]) {
    const armG = shared(ck && ck + 'arm', () => {
      const ap = new Parts();
      ap.box(0.024, 0.075, 0.028, 0, -0.035, 0, tint(kit.arm));
      ap.box(0.024, 0.022, 0.024, 0, -0.078, 0.004, tint(kit.hand));
      return ap.build(false).body;
    });
    // ce que tient la main (et ses parties lumineuses : lame d'énergie, corde lumineuse)
    const side = s < 0 ? 'R' : 'L', hk = ck && ck + 'held' + side;
    let heldG: THREE.BufferGeometry | null = hk ? troopGeo.get(hk) ?? null : null, heldGlow: THREE.BufferGeometry | null = hk ? troopGeo.get(hk + 'glow') ?? null : null;
    if (!heldG && !(hk && troopGeo.has(hk + 'none'))) {
      const held = new Parts();
      if (s < 0) kit.right(held);
      else if (withTorch) {
        const t = torch(); for (const g of t.body) held.body.push(g);
      } else kit.left(held);
      if (held.body.length) {
        const built = held.build(false);
        heldG = built.body; heldGlow = built.glow;
        if (hk) { troopGeo.set(hk, heldG); if (heldGlow) troopGeo.set(hk + 'glow', heldGlow); }
      } else if (hk) troopGeo.set(hk + 'none', new THREE.BufferGeometry());
    }
    const arm = new THREE.Group();
    arm.add(new THREE.Mesh(armG, mats.body));
    if (heldG) {
      const hm = new THREE.Mesh(heldG, mats.body);
      if (heldGlow) hm.add(new THREE.Mesh(heldGlow, mats.glow));
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
    arm.userData.hold = s < 0 ? (kit.hold ?? (kit === napoleonic || kit === modern ? 'rifle' : 'blade')) : withTorch ? 'torch' : kit.leftHold ?? 'shield';
    body.add(arm);
    arms.push(arm);
  }
  return { root, body, legs, arms, flame };
}

/** Le soldat au rythme de `phase` : pas cadencé, garde, coups portés, bras levés */
/** `kick` (0 à 1) : le recul d'un coup de feu qui vient de partir (le buste et l'arme rejetés en arrière) */
export function soldierStep(s: Soldier, phase: number, mode: SoldierMode, kick = 0) {
  const run = mode === 'run', walk = mode === 'walk' || mode === 'carry' || run, kneel = mode === 'kneel', sw = Math.sin(phase), stride = run ? 0.95 : 0.6;
  s.body.position.y = kneel ? -0.065 : walk ? Math.abs(sw) * (run ? 0.012 : 0.006) : Math.sin(phase * 0.3) * 0.0015;
  s.body.rotation.x = mode === 'fight' ? 0.12 : kneel ? 0.35 : run ? 0.16 : 0;
  for (const l of s.legs) l.position.y = kneel ? 0.035 : 0.1;
  s.legs[0].rotation.x = kneel ? -1.35 : walk ? sw * stride : mode === 'fight' ? -0.25 : 0;
  s.legs[1].rotation.x = kneel ? -1.15 : walk ? -sw * stride : mode === 'fight' ? 0.3 : 0;
  const [right, left] = s.arms, rifle = right.userData.hold === 'rifle', bow = left.userData.hold === 'bow', pike = right.userData.hold === 'spear';
  if (bow && mode === 'fight') {
    // l'archer bande son arc : bras gauche tendu devant, la main droite tire la corde jusqu'à la joue, puis lâche
    const draw = (phase * 0.9) % 1;
    left.rotation.x = -1.5; right.rotation.x = -1.25 - Math.min(1, draw * 1.6) * 0.25 + (draw > 0.85 ? 0.2 : 0); right.rotation.z = 0.35;
  } else if (pike && mode === 'fight') {
    // le lancier pique : la lance couchée part en avant et revient, le bouclier devant
    const beat = Math.max(0, Math.sin(phase * 1.6));
    right.rotation.x = -0.75 - beat * 0.45; left.rotation.x = -0.9; right.rotation.z = 0;
  } else if (kneel) {
    // penché sur le blessé : les mains au travail
    right.rotation.x = -1 + Math.sin(phase * 1.3) * 0.25; left.rotation.x = -0.9 - Math.sin(phase * 1.1) * 0.2; right.rotation.z = 0;
  } else if (mode === 'carry') {
    // les brancards en main, bras tendus
    right.rotation.x = left.rotation.x = -0.55; right.rotation.z = 0;
  } else if (run) {
    right.rotation.x = -sw * 0.9 - 0.35; left.rotation.x = sw * 0.9 - 0.35; right.rotation.z = 0;
  } else if (mode === 'fight') {
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
  if (kick > 0 && rifle && mode === 'fight') { s.body.rotation.x -= kick * 0.1; right.rotation.x += kick * 0.14; left.rotation.x += kick * 0.1; }
  // ce que tiennent les mains : la lame pointe devant ; le fusil se porte à l'épaule, se couche à l'horizontale pour viser ;
  // la torche reste droite
  const rh = right.userData.held as THREE.Object3D | undefined, lh = left.userData.held as THREE.Object3D | undefined;
  // la lance se porte droite et se couche pour frapper ; l'arc reste droit, la flèche encochée vise devant
  const fight = mode === 'fight';
  if (rh) rh.rotation.x = rifle || (bow && fight) ? (fight ? Math.PI / 2 - right.rotation.x : 0) : pike ? (fight ? Math.PI / 2 - right.rotation.x : -right.rotation.x) : bow ? -right.rotation.x + Math.PI : Math.PI / 2;
  if (lh) lh.rotation.x = left.userData.hold === 'torch' || bow ? -left.rotation.x : 0;
  // (la flèche n'est encochée qu'au combat)
  if (rh && bow) rh.visible = fight;
  if (s.flame) s.flame.scale.set(0.9 + Math.sin(phase * 7) * 0.12, 0.85 + Math.sin(phase * 5.3) * 0.25, 0.9 + Math.cos(phase * 6.1) * 0.12);
}
