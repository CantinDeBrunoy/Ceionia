import * as THREE from 'three';
import { Parts } from './parts';
import { Kit, archerKit, spear, longRifle, dark, registerKits } from './soldiers';

/**
 * Les soldats des deux peuples des îles rivales, une tenue par époque (voir `makeSoldier`, rôles `orient`, `orientArcher`,
 * `asie`, `asieArcher`). Le peuple oriental : sable, blanc, turquoise et laiton (turban, cimeterre, bouclier rond, long
 * fusil à bagues). Le peuple asiatique : laque rouge, noir et or (armure lamellaire, lance à houppe, chapeau conique, bouclier
 * de rotin). Inventés, sans caricature. Servent au conflit vivant entre les îles, et plus tard à la grande bataille
 */

const SKIN = 0xe8b894, LEATHER = 0x5a3e2c, STEEL = 0xc4cad2, BLACK = 0x1e1e22;
const WHITE = 0xf2ece0, SAND = 0xd8b47a, TURQ = 0x2fa8a0, BRASS = 0xd8a840, NAVY = 0x2a3e6a;
const LACQ = 0xb02a22, INK = 0x24201e, GOLD = 0xe0b040, STRAW = 0xd8c080, JADE = 0x3a8a6a;

/** Cimeterre : poignée, garde de laiton, lame courbe en deux pans */
function scimitar(p: Parts, blade = STEEL) {
  p.box(0.01, 0.024, 0.01, 0, -0.014, 0, LEATHER); p.box(0.03, 0.007, 0.012, 0, 0, 0, BRASS);
  p.add(new THREE.BoxGeometry(0.004, 0.06, 0.014), 0, 0.034, 0.002, blade);
  p.add(new THREE.BoxGeometry(0.004, 0.05, 0.012), 0, 0.085, 0.012, blade, 0, false, 0, 0.35);
}
/** Bouclier rond, peint, bordé et à ombilic */
function roundShield(p: Parts, face: number, rim: number, r = 0.042) {
  p.add(new THREE.CylinderGeometry(r, r, 0.01, 12).rotateZ(Math.PI / 2), 0.01, -0.035, 0.008, face);
  p.add(new THREE.TorusGeometry(r - 0.001, 0.004, 4, 14).rotateY(Math.PI / 2), 0.016, -0.035, 0.008, rim);
  p.sphere(0.011, 0.018, -0.035, 0.008, rim, 0, 0.6);
}
/** Fusil d'assaut (moderne) ou à impulsions (futuriste, `neon` : couleur de sa cellule) */
function carbine(p: Parts, body: number, neon?: number) {
  p.box(0.012, 0.03, 0.03, 0, -0.03, -0.01, BLACK);
  p.box(0.014, 0.026, 0.074, 0, -0.005, 0.022, body);
  p.box(0.01, 0.026, 0.012, 0, -0.026, 0.032, body);
  p.box(0.005, 0.005, 0.05, 0, 0.0, 0.078, 0x2a2a2e);
  if (neon !== undefined) p.box(0.016, 0.01, 0.03, 0, -0.008, 0.01, neon, 0, 'neon');
}
/** Turban : enroulé (trois tours) autour du crâne, sa queue sur la nuque */
function turban(p: Parts, c: number, y = 0.246) {
  p.cyl(0.033, 0.03, 0.026, 9, 0, y - 0.012, 0, c);
  p.sphere(0.03, 0, y + 0.012, 0, c, 1, 0.55);
  p.box(0.068, 0.006, 0.066, 0, y, 0, dark(c, 0.88));
  p.box(0.014, 0.04, 0.006, 0, y - 0.04, -0.03, c);
}

/** Bandes molletières enroulées jusqu'au genou */
function wraps(p: Parts, c: number) {
  for (const y of [-0.066, -0.052, -0.038]) p.box(0.032, 0.006, 0.036, 0, y, 0, c);
}
/** Bracelet de poignet */
function bracelet(p: Parts, c: number) {
  p.box(0.027, 0.01, 0.031, 0, -0.058, 0, c);
}
/** Jambières de lamelles laquées */
function greaves(p: Parts, c: number) {
  p.box(0.033, 0.03, 0.012, 0, -0.072, 0.014, c);
  p.box(0.034, 0.004, 0.013, 0, -0.06, 0.014, GOLD);
}

// ---------- Peuple oriental ----------

const sandGuard: Kit = {
  leg: SKIN, boot: LEATHER, hip: WHITE, torso: WHITE, arm: SKIN, hand: SKIN, hold: 'blade',
  dress(p) {
    // longue tunique blanche, gilet sable à liseré, ceinture turquoise nouée
    p.box(0.082, 0.13, 0.056, 0, 0.07, 0, WHITE);
    p.box(0.086, 0.07, 0.06, 0, 0.13, 0, SAND);
    p.box(0.03, 0.07, 0.061, 0, 0.13, 0, WHITE);
    p.box(0.088, 0.016, 0.062, 0, 0.12, 0, TURQ);
    p.box(0.012, 0.03, 0.006, 0.03, 0.09, 0.03, TURQ);
    // galons du gilet, poignard courbe à la ceinture, gourde de cuir
    for (const s of [-1, 1]) p.box(0.004, 0.07, 0.061, s * 0.016, 0.13, 0, BRASS);
    p.add(new THREE.BoxGeometry(0.01, 0.03, 0.008), -0.016, 0.115, 0.032, BRASS, 0, false, 0.5);
    p.add(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 6).rotateZ(Math.PI / 2).scale(1, 1, 0.6), 0.046, 0.1, -0.008, LEATHER);
  },
  shin: (p) => wraps(p, WHITE),
  sleeve: (p) => bracelet(p, BRASS),
  head(p) { turban(p, WHITE); p.add(new THREE.ConeGeometry(0.008, 0.026, 5), 0, 0.285, 0, BRASS); p.box(0.016, 0.016, 0.005, 0, 0.246, 0.033, TURQ); },
  right: (p) => scimitar(p),
  left: (p) => roundShield(p, TURQ, BRASS),
};

const mailRider: Kit = {
  leg: 0x8a8f96, boot: LEATHER, hip: TURQ, torso: 0x9aa0a8, arm: 0x9aa0a8, hand: LEATHER, hold: 'blade',
  dress(p) {
    // cotte de mailles sous un long manteau turquoise ouvert, ceinture de laiton
    p.box(0.082, 0.12, 0.056, 0, 0.08, 0, 0x9aa0a8);
    for (const s of [-1, 1]) p.box(0.03, 0.14, 0.06, s * 0.028, 0.06, 0, TURQ);
    p.box(0.088, 0.012, 0.062, 0, 0.13, 0, BRASS);
    for (const s of [-1, 1]) p.box(0.03, 0.02, 0.05, s * 0.05, 0.19, 0, dark(TURQ, 0.8));
    // bordure brodée du manteau, plaque ronde de poitrine, fourreau du cimeterre
    for (const s of [-1, 1]) p.box(0.004, 0.14, 0.061, s * 0.014, 0.06, 0, BRASS);
    p.add(new THREE.CylinderGeometry(0.016, 0.016, 0.005, 10).rotateX(Math.PI / 2), 0, 0.165, 0.03, STEEL);
    p.add(new THREE.BoxGeometry(0.012, 0.09, 0.016), 0.047, 0.09, -0.008, LEATHER, 0, false, 0, -0.35);
  },
  shin(p) {
    // bottes de cuir rouge à revers, genouillère de mailles
    p.box(0.032, 0.036, 0.036, 0, -0.08, 0, 0x8a2e26);
    p.box(0.032, 0.014, 0.01, 0, -0.045, 0.016, 0x9aa0a8);
  },
  sleeve: (p) => { p.box(0.027, 0.026, 0.031, 0, -0.064, 0, STEEL); p.box(0.028, 0.004, 0.032, 0, -0.04, 0, BRASS); },
  head(p) {
    // casque à pointe sur un turban, camail de mailles sur la nuque
    turban(p, WHITE, 0.24);
    p.add(new THREE.ConeGeometry(0.03, 0.05, 8), 0, 0.282, 0, STEEL);
    p.add(new THREE.ConeGeometry(0.005, 0.03, 4), 0, 0.318, 0, BRASS);
    p.box(0.06, 0.03, 0.01, 0, 0.21, -0.026, 0x9aa0a8);
  },
  right: (p) => scimitar(p),
  left: (p) => roundShield(p, 0xe8e0cc, BRASS, 0.048),
};

const jezailMan: Kit = {
  leg: WHITE, boot: LEATHER, hip: TURQ, torso: TURQ, arm: TURQ, hand: SKIN, hold: 'rifle',
  dress(p) {
    // veste courte turquoise à boutons de laiton, large ceinture rouge, cartouchière de cuir en travers
    p.box(0.08, 0.1, 0.055, 0, 0.11, 0, TURQ);
    for (const y of [0.13, 0.16, 0.19]) p.box(0.008, 0.008, 0.004, 0, y, 0.029, BRASS);
    p.box(0.086, 0.03, 0.06, 0, 0.1, 0, 0xb83a32);
    p.add(new THREE.BoxGeometry(0.012, 0.11, 0.004), 0, 0.15, 0.03, LEATHER, 0, false, 0.62);
    // cartouches sur la cartouchière, poire à poudre, sacoche de laine dans le dos
    for (let k = 0; k < 4; k++) p.add(new THREE.BoxGeometry(0.005, 0.01, 0.005), -0.026 + k * 0.016, 0.115 + k * 0.022, 0.033, BRASS, 0, false, 0.62);
    p.add(new THREE.ConeGeometry(0.009, 0.036, 5).rotateZ(1.1), 0.036, 0.1, 0.03, 0xe8dcc0);
    p.box(0.05, 0.05, 0.022, 0, 0.13, -0.04, 0x8a3a30); for (const y of [0.14, 0.16]) p.box(0.052, 0.004, 0.024, 0, y, -0.04, SAND);
  },
  shin: (p) => wraps(p, SAND),
  sleeve: (p) => bracelet(p, 0xb83a32),
  head(p) { turban(p, WHITE); p.box(0.01, 0.014, 0.004, 0, 0.25, 0.033, BRASS); p.box(0.07, 0.012, 0.004, 0, 0.212, -0.03, WHITE); },
  right: (p) => { longRifle(p, { wood: 0x8a5a32, metal: 0x6a6a6e, len: 0.18 }); for (const y of [0.04, 0.09]) p.box(0.012, 0.006, 0.012, 0, y, 0.008, BRASS); },
  left() {},
};

const desertNow: Kit = {
  leg: 0xc8aa78, boot: 0x6a5238, hip: 0xc8aa78, torso: 0xc8aa78, arm: 0xc8aa78, hand: 0x6a5238, hold: 'rifle',
  dress(p) {
    // tenue sable à taches, gilet à poches, foulard turquoise au cou, ceinturon
    p.box(0.08, 0.1, 0.055, 0, 0.11, 0, 0xc8aa78);
    for (const [x, y] of [[-0.02, 0.13], [0.024, 0.1]] as [number, number][]) p.box(0.026, 0.02, 0.058, x, y, 0, 0xa88a5a);
    p.box(0.086, 0.07, 0.062, 0, 0.14, 0, 0xb09468);
    for (const x of [-0.022, 0.022]) p.box(0.018, 0.022, 0.008, x, 0.15, 0.034, 0x8a7450);
    p.box(0.06, 0.016, 0.06, 0, 0.198, 0, TURQ);
    p.box(0.088, 0.012, 0.064, 0, 0.118, 0, 0x6a5238);
    // sac à dos et radio, bidon, étui, lunettes de sable
    p.box(0.056, 0.064, 0.026, 0, 0.13, -0.045, 0x9a7e56);
    p.box(0.003, 0.07, 0.003, 0.02, 0.18, -0.06, 0x2a2a2e);
    p.add(new THREE.CylinderGeometry(0.011, 0.011, 0.024, 6), 0.046, 0.1, -0.012, 0x6a5238);
    p.box(0.014, 0.024, 0.018, -0.046, 0.098, 0.004, 0x5a4630);
  },
  shin(p) { p.box(0.032, 0.014, 0.01, 0, -0.06, 0.018, 0x6a5238); p.box(0.033, 0.01, 0.037, 0, -0.078, 0.002, 0x6a5238); },
  sleeve(p) { for (const x of [-0.0125, 0.0125]) p.box(0.002, 0.014, 0.016, x, -0.012, 0, TURQ); p.box(0.026, 0.008, 0.03, 0, -0.056, 0, 0xd8bc88); },
  head(p) {
    p.sphere(0.032, 0, 0.252, 0, 0xb09468, 1, 0.75);
    p.box(0.07, 0.006, 0.07, 0, 0.247, 0, 0xb09468);
    p.box(0.068, 0.008, 0.068, 0, 0.255, 0, TURQ);
    p.box(0.042, 0.01, 0.006, 0, 0.262, 0.03, 0x2e3c48);
    p.box(0.06, 0.03, 0.004, 0, 0.214, -0.03, 0xb09468);
  },
  right: (p) => carbine(p, 0x3a3630),
  left() {},
};

const sunExo: Kit = {
  leg: 0xe8dcc0, boot: 0x5a4a38, hip: 0xe8dcc0, torso: 0xf2ead8, arm: 0xe8dcc0, hand: 0x5a4a38, hold: 'rifle',
  dress(p) {
    // exo-armure ivoire à plaques dorées, liserés turquoise lumineux, réacteur dorsal
    p.box(0.082, 0.1, 0.056, 0, 0.11, 0, 0xe8dcc0);
    p.box(0.088, 0.06, 0.064, 0, 0.145, 0, 0xf6f0e2);
    for (const s of [-1, 1]) p.box(0.034, 0.024, 0.06, s * 0.05, 0.19, 0, GOLD);
    p.box(0.006, 0.05, 0.004, 0, 0.15, 0.033, 0x4af0d8, 0, 'neon');
    p.box(0.09, 0.012, 0.066, 0, 0.118, 0, 0x5a4a38);
    p.box(0.056, 0.08, 0.03, 0, 0.13, -0.046, 0xd8c8a0);
    // soleil d'or sur le plastron, tuyères dorsales, cellules aux hanches
    p.add(new THREE.CylinderGeometry(0.013, 0.013, 0.004, 8).rotateX(Math.PI / 2), 0, 0.172, 0.033, GOLD);
    for (const s of [-1, 1]) { p.cyl(0.011, 0.013, 0.02, 6, s * 0.016, 0.11, -0.058, 0x5a4a38); p.box(0.014, 0.024, 0.02, s * 0.047, 0.098, 0, 0x5a4a38); }
  },
  shin(p) {
    p.box(0.034, 0.018, 0.01, 0, -0.054, 0.016, GOLD);
    p.box(0.004, 0.026, 0.004, 0, -0.076, 0.019, 0x4af0d8, 0, 'neon');
  },
  sleeve(p) {
    p.box(0.028, 0.028, 0.032, 0, -0.062, 0, 0xd8c8a0);
    p.box(0.029, 0.004, 0.033, 0, -0.044, 0, 0x4af0d8, 0, 'neon');
  },
  head(p) {
    // casque à cimier pointu et visière dorée
    p.sphere(0.037, 0, 0.232, 0, 0xf6f0e2, 1);
    p.add(new THREE.ConeGeometry(0.018, 0.04, 6), 0, 0.28, 0, GOLD);
    p.box(0.05, 0.02, 0.012, 0, 0.222, 0.033, 0x8a6a2a);
    p.box(0.044, 0.004, 0.004, 0, 0.228, 0.04, 0x4af0d8, 0, 'neon');
  },
  right: (p) => carbine(p, 0xf0e8d8, 0x4af0d8),
  left() {},
};

const ORIENT = [sandGuard, sandGuard, mailRider, jezailMan, desertNow, sunExo];
const ORIENT_ARCHERS = [
  archerKit({ tunic: WHITE, hood: SAND, leg: SKIN, boot: LEATHER, arm: SKIN, shoulder: TURQ, bow: 0x7a4a26, string: 0xf0ece0 }),
  archerKit({ tunic: WHITE, hood: SAND, leg: SKIN, boot: LEATHER, arm: SKIN, shoulder: TURQ, bow: 0x7a4a26, string: 0xf0ece0 }),
  archerKit({ tunic: TURQ, hood: WHITE, leg: 0x8a8f96, boot: LEATHER, arm: 0x9aa0a8, shoulder: SAND, bow: 0x5a3018, string: 0xf0ece0, mail: true }),
  { ...jezailMan, right: (p: Parts) => { longRifle(p, { wood: 0x8a5a32, metal: 0x6a6a6e, len: 0.22 }); p.box(0.012, 0.006, 0.012, 0, 0.12, 0.008, BRASS); } },
  { ...desertNow, right: (p: Parts) => longRifle(p, { wood: 0x3c3a36, metal: 0x2a2a2e, len: 0.2, scope: true }) },
  sunExo,
];

// ---------- Peuple asiatique ----------

/** Lance à houppe rouge sous le fer */
function tasselSpear(p: Parts) { spear(p, 0x6a4a2a); p.box(0.02, 0.022, 0.02, 0, 0.214, 0, 0xd8382c); }
/** Guandao : longue hampe, grande lame courbe, houppe */
function glaive(p: Parts) {
  p.box(0.009, 0.32, 0.009, 0, -0.08, 0, INK);
  p.add(new THREE.BoxGeometry(0.005, 0.07, 0.026), 0, 0.27, 0.008, STEEL, 0, false, 0, 0.12);
  p.box(0.02, 0.016, 0.02, 0, 0.226, 0, GOLD);
  p.box(0.018, 0.024, 0.018, 0, 0.2, 0, 0xd8382c);
}
/** Bouclier de rotin tressé, rond, peint d'un cercle rouge */
function rattan(p: Parts) {
  p.add(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 12).rotateZ(Math.PI / 2), 0.01, -0.035, 0.008, STRAW);
  p.add(new THREE.CylinderGeometry(0.022, 0.022, 0.013, 10).rotateZ(Math.PI / 2), 0.012, -0.035, 0.008, LACQ);
  p.add(new THREE.TorusGeometry(0.044, 0.004, 4, 14).rotateY(Math.PI / 2), 0.016, -0.035, 0.008, 0xa88a50);
}
/** Lamelles : rangées de petites plaques sur le buste */
function lamellar(p: Parts, base: number, band: number) {
  p.box(0.084, 0.1, 0.058, 0, 0.1, 0, base);
  for (const y of [0.115, 0.14, 0.165, 0.19]) p.box(0.086, 0.005, 0.06, 0, y, 0, band);
}

const lacquerGuard: Kit = {
  leg: INK, boot: INK, hip: INK, torso: LACQ, arm: LACQ, hand: SKIN, hold: 'spear',
  dress(p) {
    // armure lamellaire rouge à bandes noires, jupe noire fendue, épaulières
    p.box(0.082, 0.05, 0.056, 0, 0.07, 0, INK);
    lamellar(p, LACQ, INK);
    for (const s of [-1, 1]) p.box(0.03, 0.03, 0.05, s * 0.05, 0.18, 0, INK);
    p.box(0.088, 0.01, 0.062, 0, 0.12, 0, GOLD);
    // pans de jupe fendus, cordons d'or des épaulières, sabre court au côté
    for (const s of [-1, 1]) p.box(0.036, 0.04, 0.008, s * 0.022, 0.06, 0.03, LACQ);
    for (const s of [-1, 1]) p.box(0.032, 0.004, 0.052, s * 0.05, 0.196, 0, GOLD);
    p.add(new THREE.BoxGeometry(0.01, 0.07, 0.012), 0.046, 0.09, -0.008, INK, 0, false, 0, -0.3);
  },
  shin: (p) => greaves(p, LACQ),
  sleeve: (p) => { p.box(0.027, 0.026, 0.031, 0, -0.064, 0, INK); p.box(0.028, 0.004, 0.032, 0, -0.05, 0, GOLD); },
  head(p) {
    // casque rond, couvre-nuque, houppe rouge au sommet
    p.sphere(0.031, 0, 0.252, 0, INK, 1, 0.8);
    p.cyl(0.04, 0.036, 0.012, 10, 0, 0.234, -0.006, INK);
    p.add(new THREE.ConeGeometry(0.012, 0.03, 6).rotateX(Math.PI), 0, 0.296, 0, 0xd8382c);
  },
  right: tasselSpear,
  left: rattan,
};

const blackLamellar: Kit = {
  leg: INK, boot: INK, hip: INK, torso: INK, arm: INK, hand: INK, hold: 'spear',
  dress(p) {
    // lamelles noires bordées d'or, plastron à miroir de laiton, tablier rouge
    lamellar(p, INK, GOLD);
    p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.006, 10).rotateX(Math.PI / 2), 0, 0.16, 0.031, GOLD);
    p.box(0.05, 0.07, 0.008, 0, 0.05, 0.03, LACQ);
    for (const s of [-1, 1]) p.box(0.034, 0.028, 0.056, s * 0.052, 0.18, 0, LACQ);
    // bandes d'or des épaulières, nœud de ceinture, carquois de flèches à l'arrière, étendard dorsal
    for (const s of [-1, 1]) p.box(0.036, 0.004, 0.058, s * 0.052, 0.19, 0, GOLD);
    p.box(0.016, 0.02, 0.01, 0, 0.12, 0.032, LACQ);
    p.box(0.004, 0.16, 0.004, 0.02, 0.15, -0.034, INK);
    p.box(0.003, 0.05, 0.036, 0.02, 0.255, -0.054, LACQ); p.box(0.0035, 0.012, 0.036, 0.02, 0.28, -0.054, GOLD);
  },
  shin: (p) => greaves(p, INK),
  sleeve: (p) => { p.box(0.027, 0.026, 0.031, 0, -0.064, 0, LACQ); for (const y of [-0.056, -0.046]) p.box(0.028, 0.003, 0.032, 0, y, 0, GOLD); },
  head(p) {
    // casque à large bord et à long plumet rouge
    p.sphere(0.031, 0, 0.255, 0, INK, 1, 0.85);
    p.cyl(0.052, 0.054, 0.008, 12, 0, 0.242, 0, INK);
    p.box(0.006, 0.05, 0.006, 0, 0.28, 0, GOLD);
    p.add(new THREE.ConeGeometry(0.014, 0.05, 6).rotateX(Math.PI), 0, 0.33, 0, 0xd8382c);
  },
  right: glaive,
  left: rattan,
};

const strawRifle: Kit = {
  leg: 0x2a2e3a, boot: INK, hip: NAVY, torso: NAVY, arm: NAVY, hand: SKIN, hold: 'rifle',
  dress(p) {
    // tunique bleu nuit croisée à passepoil rouge, large ceinture, cartouchière
    p.box(0.08, 0.12, 0.055, 0, 0.09, 0, NAVY);
    p.add(new THREE.BoxGeometry(0.01, 0.1, 0.004), 0, 0.15, 0.029, LACQ, 0, false, 0.45);
    p.box(0.086, 0.02, 0.06, 0, 0.12, 0, INK);
    p.box(0.05, 0.026, 0.016, 0, 0.11, 0.03, LEATHER);
    // boutons, col montant, sac de toile et natte roulée dans le dos
    for (let k = 0; k < 3; k++) p.box(0.005, 0.005, 0.004, 0.014, 0.15 + k * 0.016, 0.03, GOLD);
    p.box(0.05, 0.012, 0.046, 0, 0.198, 0, LACQ);
    p.box(0.05, 0.05, 0.022, 0, 0.13, -0.04, STRAW);
    p.add(new THREE.CylinderGeometry(0.012, 0.012, 0.066, 6).rotateZ(Math.PI / 2), 0, 0.19, -0.042, 0xa88a50);
  },
  shin: (p) => wraps(p, 0xe8e0c8),
  sleeve: (p) => { p.box(0.026, 0.012, 0.03, 0, -0.058, 0, LACQ); },
  head(p) {
    // grand chapeau conique de paille
    p.cone(0.065, 0.04, 10, 0, 0.255, 0, STRAW);
    p.cyl(0.03, 0.03, 0.006, 8, 0, 0.255, 0, 0xa88a50);
    p.cyl(0.004, 0.006, 0.01, 6, 0, 0.292, 0, LACQ);
    for (const x of [-0.02, 0.02]) p.box(0.003, 0.034, 0.003, x, 0.218, 0.01, INK);
  },
  right: (p) => longRifle(p, { wood: 0x5a3a22, metal: 0x5a5f66, len: 0.16 }),
  left() {},
};

const jadeNow: Kit = {
  leg: 0x4a5a40, boot: INK, hip: 0x4a5a40, torso: 0x4a5a40, arm: 0x4a5a40, hand: INK, hold: 'rifle',
  dress(p) {
    // treillis vert sombre, gilet, pattes de col rouges, ceinturon
    p.box(0.08, 0.1, 0.055, 0, 0.11, 0, 0x4a5a40);
    p.box(0.086, 0.07, 0.062, 0, 0.14, 0, 0x3a4632);
    for (const s of [-1, 1]) p.box(0.014, 0.012, 0.004, s * 0.018, 0.2, 0.031, LACQ);
    for (const x of [-0.022, 0.022]) p.box(0.018, 0.022, 0.008, x, 0.15, 0.034, 0x2e3828);
    p.box(0.088, 0.012, 0.064, 0, 0.118, 0, INK);
    // sac et natte, bidon, étui, pelle pliante
    p.box(0.056, 0.064, 0.026, 0, 0.13, -0.045, 0x3a4632);
    p.add(new THREE.CylinderGeometry(0.012, 0.012, 0.062, 6).rotateZ(Math.PI / 2), 0, 0.2, -0.045, 0x5a6a48);
    p.add(new THREE.CylinderGeometry(0.011, 0.011, 0.024, 6), 0.046, 0.1, -0.012, 0x2e3828);
    p.box(0.014, 0.024, 0.018, -0.046, 0.098, 0.004, INK);
  },
  shin(p) { p.box(0.033, 0.026, 0.037, 0, -0.08, 0.002, 0x6a6a5a); },
  sleeve(p) { for (const x of [-0.0125, 0.0125]) { p.box(0.002, 0.014, 0.016, x, -0.012, 0, LACQ); p.box(0.0025, 0.005, 0.005, x, -0.01, 0, GOLD); } },
  head(p) {
    p.box(0.012, 0.012, 0.004, 0, 0.262, 0.032, LACQ);
    p.sphere(0.033, 0, 0.25, 0, 0x3a4632, 1, 0.8);
    p.cyl(0.042, 0.04, 0.008, 10, 0, 0.238, 0, 0x3a4632);
    p.box(0.066, 0.007, 0.066, 0, 0.255, 0, LACQ);
  },
  right: (p) => carbine(p, 0x2a2a2e),
  left() {},
};

const inkExo: Kit = {
  leg: 0x2a2a30, boot: INK, hip: 0x2a2a30, torso: 0x34343c, arm: 0x2a2a30, hand: INK, hold: 'rifle',
  dress(p) {
    // exo-armure noire laquée à plaques rouges, liserés rouges lumineux
    p.box(0.082, 0.1, 0.056, 0, 0.11, 0, 0x2a2a30);
    p.box(0.088, 0.06, 0.064, 0, 0.145, 0, 0x3a3a44);
    for (const s of [-1, 1]) p.box(0.036, 0.024, 0.06, s * 0.05, 0.19, 0, LACQ);
    for (const y of [0.13, 0.16]) p.box(0.07, 0.004, 0.004, 0, y, 0.033, 0xff4a3a, 0, 'neon');
    p.box(0.09, 0.012, 0.066, 0, 0.118, 0, GOLD);
    p.box(0.056, 0.08, 0.03, 0, 0.13, -0.046, 0x24242a);
    // plaques de jupe en lamelles, tuyères, sabre-plasma sur le dos
    for (const s of [-1, 1]) p.box(0.036, 0.034, 0.008, s * 0.022, 0.07, 0.03, LACQ);
    for (const s of [-1, 1]) p.cyl(0.011, 0.013, 0.02, 6, s * 0.016, 0.11, -0.058, 0x24242a);
    p.add(new THREE.BoxGeometry(0.008, 0.14, 0.008), 0, 0.17, -0.065, INK, 0, false, 0.6);
    p.add(new THREE.BoxGeometry(0.004, 0.06, 0.004), 0.04, 0.228, -0.066, 0xff4a3a, 0, 'neon', 0.6);
  },
  shin(p) {
    p.box(0.034, 0.018, 0.01, 0, -0.054, 0.016, LACQ);
    p.box(0.004, 0.026, 0.004, 0, -0.076, 0.019, 0xff4a3a, 0, 'neon');
  },
  sleeve(p) {
    p.box(0.028, 0.028, 0.032, 0, -0.062, 0, LACQ);
    p.box(0.029, 0.004, 0.033, 0, -0.044, 0, 0xff4a3a, 0, 'neon');
  },
  head(p) {
    // casque à cornes basses dorées et visière rouge
    p.sphere(0.037, 0, 0.232, 0, 0x3a3a44, 1);
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.006, 0.03, 0.008), s * 0.02, 0.27, 0.02, GOLD, 0, false, s * -0.5);
    p.box(0.052, 0.018, 0.012, 0, 0.222, 0.033, 0x4a1a18);
    p.box(0.046, 0.004, 0.004, 0, 0.226, 0.04, 0xff4a3a, 0, 'neon');
  },
  right: (p) => carbine(p, 0x34343c, 0xff4a3a),
  left() {},
};

const ASIE = [lacquerGuard, lacquerGuard, blackLamellar, strawRifle, jadeNow, inkExo];
const ASIE_ARCHERS = [
  archerKit({ tunic: LACQ, hood: INK, leg: INK, boot: INK, arm: SKIN, shoulder: INK, bow: 0x3a2418, string: 0xf0ece0 }),
  archerKit({ tunic: LACQ, hood: INK, leg: INK, boot: INK, arm: SKIN, shoulder: INK, bow: 0x3a2418, string: 0xf0ece0 }),
  archerKit({ tunic: INK, hood: LACQ, leg: INK, boot: INK, arm: 0x9aa0a8, shoulder: JADE, bow: 0x2a1a10, string: 0xf0ece0, mail: true }),
  { ...strawRifle, right: (p: Parts) => longRifle(p, { wood: 0x5a3a22, metal: 0x5a5f66, len: 0.21 }) },
  { ...jadeNow, right: (p: Parts) => longRifle(p, { wood: 0x2a2a2e, metal: 0x2a2a2e, len: 0.2, scope: true }) },
  inkExo,
];

registerKits('orient', ORIENT);
registerKits('orientArcher', ORIENT_ARCHERS);
registerKits('asie', ASIE);
registerKits('asieArcher', ASIE_ARCHERS);

/** Le rôle d'un soldat d'un peuple : fantassin, ou archer (tireur une fois le fusil connu) */
export function peopleRole(people: 'orient' | 'asie', archer: boolean) {
  return (people === 'orient' ? (archer ? 'orientArcher' : 'orient') : archer ? 'asieArcher' : 'asie') as 'orient' | 'orientArcher' | 'asie' | 'asieArcher';
}
