import * as THREE from 'three';
import { Parts } from './parts';
import { mats } from './materials';
import { HUMAN_K } from './assets';
import type { Rider } from './riders';

/**
 * Les troupes de l'âge futuriste qui sortent de l'ordinaire : le char antigrav (coque effilée blanche et anthracite à liserés
 * néon, coussin d'énergie sous le ventre, tourelle à deux canons à plasma, bouclier énergétique qui scintille quand il est
 * touché) et les deux drones de combat du pilote de drones (ils le suivent, visent et tirent un fin rayon laser). Visuel seulement :
 * les dégâts restent ceux de l'unité
 */

const WHITE = 0xeef2f6, WHITE2 = 0xdde3ea, ANTHRA = 0x2e333b, ANTHRA2 = 0x464d58, CYAN = 0x5af0ff, VIOLET = 0xb070ff, RED = 0xff3a4a;
/** hauteur du ventre du char au-dessus du sol (unités du modèle) */
const HOVER = 0.075;

/** Matières lumineuses qui se mêlent à la scène (additif, sans brouillard ni écriture de profondeur) */
const additive = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
const LAMP = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });

/** Les pièces dessinées, accrochées au groupe : la coque (ombres portées) et ses liserés qui luisent de leur couleur (néon) */
function hang(p: Parts, g: THREE.Object3D) {
  const built = p.build(false), m = new THREE.Mesh(built.body, mats.body);
  m.castShadow = true;
  g.add(m);
  if (built.glow) g.add(new THREE.Mesh(built.glow, mats.glow));
  return m;
}
/** Cylindre couché le long de z */
const tube = (rt: number, rb: number, len: number) => new THREE.CylinderGeometry(rt, rb, len, 8).rotateX(Math.PI / 2);

/** Ce qui s'anime sur un char antigrav */
export interface HoverParts {
  /** coussin d'énergie au sol, ombre portée, cône lumineux sous le ventre */
  cushion: THREE.Object3D;
  blob: THREE.Object3D;
  cone: THREE.Object3D;
  /** bouclier : remplissage et filet, leurs matières, la tourelle, l'antenne radar, les flammes de bouche */
  fill: THREE.MeshBasicMaterial;
  wire: THREE.MeshBasicMaterial;
  turret: THREE.Object3D;
  dish: THREE.Object3D;
  flares: THREE.Object3D[];
  ph: number;
}

/** Cône ouvert (sommet en haut, évasé vers le bas) dont la lumière s'éteint vers le sol : le souffle du coussin d'énergie */
function glowCone(h: number) {
  const g = new THREE.CylinderGeometry(0.2, 0.25, h, 12, 1, true), pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(CYAN);
  for (let i = 0; i < pos.count; i++) { const k = 0.25 + 0.75 * (pos.getY(i) / h + 0.5); col.set([c.r * k, c.g * k, c.b * k], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.scale(1, 1, 1.55);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.renderOrder = 3;
  return m;
}

/**
 * Char antigrav, tourné vers +z, posé à y = 0 : coque effilée à nez de flèche (blanc, soubassement anthracite), liserés néon
 * cyan, ailerons et dérives, tuyères arrière, patins de sustentation, antennes ; tourelle à part à deux canons à plasma
 * (l'arme `weapon` les porte tous deux : elle lève et recule ensemble), antenne radar qui tourne, bouclier d'énergie
 */
export function makeHoverTank(v = 0): Rider {
  const p = new Parts();
  // soubassement, jupes latérales en biais, plaque de ventre
  p.box(0.22, 0.03, 0.46, 0, 0, -0.04, ANTHRA);
  for (const s of [-1, 1]) {
    p.add(new THREE.BoxGeometry(0.05, 0.034, 0.44).translate(0, 0.017, 0), s * 0.145, 0.004, -0.04, ANTHRA2, 0, false, s * 0.3);
    // patins de sustentation et leur face luisante
    for (const z of [0.1, -0.16]) {
      p.box(0.06, 0.014, 0.1, s * 0.1, -0.012, z, ANTHRA2);
      p.box(0.046, 0.004, 0.08, s * 0.1, -0.016, z, CYAN, 0, 'neon');
    }
  }
  // coque : caisse, nez en flèche, glacis, pont supérieur
  p.box(0.27, 0.05, 0.46, 0, 0.03, -0.04, WHITE);
  p.add(new THREE.ConeGeometry(0.2, 0.34, 4).rotateY(Math.PI / 4).rotateX(Math.PI / 2).scale(1, 0.3, 1), 0, 0.055, 0.34, WHITE);
  p.add(new THREE.ConeGeometry(0.12, 0.3, 4).rotateY(Math.PI / 4).rotateX(Math.PI / 2).scale(1, 0.18, 1), 0, 0.075, 0.3, WHITE2);
  p.box(0.2, 0.026, 0.3, 0, 0.078, -0.07, WHITE2);
  p.add(new THREE.BoxGeometry(0.2, 0.012, 0.12), 0, 0.093, 0.1, WHITE, 0, false, 0, -0.38);
  // ailerons aux flancs, dérives arrière
  for (const s of [-1, 1]) {
    p.add(new THREE.BoxGeometry(0.11, 0.012, 0.2), s * 0.2, 0.062, -0.13, ANTHRA, s * 0.25, false, s * -0.12);
    p.box(0.01, 0.075, 0.12, s * 0.085, 0.1, -0.25, ANTHRA2, 0, false, s * 0.15);
    p.box(0.01, 0.01, 0.03, s * 0.088, 0.17, -0.27, CYAN, 0, 'neon');
    // liserés néon : le long des flancs et en chevron sur le nez
    p.box(0.006, 0.008, 0.42, s * 0.138, 0.046, -0.04, CYAN, 0, 'neon');
    p.box(0.1, 0.006, 0.006, s * 0.06, 0.064, 0.3, CYAN, s * 0.6, 'neon');
    p.box(0.006, 0.006, 0.2, s * 0.05, 0.092, -0.07, CYAN, 0, 'neon');
    // tuyères arrière
    p.add(tube(0.03, 0.034, 0.05), s * 0.07, 0.045, -0.275, ANTHRA);
    p.add(new THREE.CylinderGeometry(0.024, 0.024, 0.006, 8).rotateX(Math.PI / 2), s * 0.07, 0.045, -0.303, VIOLET, 0, 'neon');
  }
  p.box(0.12, 0.006, 0.006, 0, 0.083, 0.2, CYAN, 0, 'neon');
  // antennes (pointes lumineuses)
  for (const [x, z, h] of [[0.1, -0.2, 0.16], [-0.1, -0.15, 0.1]]) {
    p.box(0.004, h, 0.004, x, 0.09, z, ANTHRA);
    p.box(0.01, 0.01, 0.01, x - 0.003, 0.09 + h, z - 0.003, x > 0 ? CYAN : RED, 0, 'neon');
  }
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  root.scale.setScalar(((1 + HUMAN_K) / 2) * 1.25);
  hang(p, body);
  body.position.y = HOVER;

  // tourelle à part (elle se balaie doucement), deux canons à plasma accolés
  const turret = new THREE.Group();
  turret.position.set(0, 0.09, -0.05);
  body.add(turret);
  const t = new Parts();
  t.box(0.19, 0.04, 0.22, 0, 0, 0, WHITE);
  t.box(0.15, 0.024, 0.16, 0, 0.04, -0.015, WHITE2);
  for (const s of [-1, 1]) {
    t.add(new THREE.BoxGeometry(0.04, 0.045, 0.15).translate(0, 0.02, 0), s * 0.105, 0.002, 0.03, WHITE, 0, false, s * -0.2);
    t.box(0.005, 0.012, 0.13, s * 0.097, 0.024, 0.02, CYAN, 0, 'neon');
    t.box(0.02, 0.05, 0.05, s * 0.06, 0.04, -0.105, ANTHRA2);
  }
  t.box(0.06, 0.012, 0.006, 0, 0.022, 0.112, CYAN, 0, 'neon');
  t.sphere(0.026, 0.045, 0.062, -0.05, ANTHRA2, 1, 0.7);
  t.box(0.01, 0.01, 0.004, 0.045, 0.066, -0.026, RED, 0, 'neon');
  hang(t, turret);
  // l'antenne radar : disque incliné sur un mât, qui tourne
  const dish = new THREE.Group(), dp = new Parts();
  dp.box(0.004, 0.04, 0.004, 0, 0, 0, ANTHRA);
  dp.add(new THREE.CylinderGeometry(0.03, 0.012, 0.012, 8), 0, 0.05, 0, ANTHRA2, 0, false, 0.5);
  dp.box(0.006, 0.006, 0.006, 0, 0.058, 0.01, CYAN, 0, 'neon');
  hang(dp, dish);
  dish.position.set(-0.05, 0.064, -0.09);
  turret.add(dish);
  // les deux canons : logements, tubes, bobines (anneaux sombres et lumineux), bouches ; flammes de plasma cachées entre deux tirs
  const g = new Parts();
  for (const s of [-1, 1]) {
    const x = s * 0.048;
    g.box(0.034, 0.04, 0.07, x, -0.02, 0, ANTHRA);
    g.add(tube(0.009, 0.011, 0.3), x, 0, 0.18, WHITE2);
    for (let k = 0; k < 3; k++) {
      g.add(new THREE.CylinderGeometry(0.018, 0.018, 0.014, 8).rotateX(Math.PI / 2), x, 0, 0.1 + k * 0.06, ANTHRA);
      g.add(new THREE.CylinderGeometry(0.0185, 0.0185, 0.004, 8).rotateX(Math.PI / 2), x, 0, 0.1 + k * 0.06 + 0.009, CYAN, 0, 'neon');
    }
    g.add(tube(0.015, 0.012, 0.03), x, 0, 0.345, ANTHRA);
  }
  const weapon = new THREE.Group();
  weapon.position.set(0, 0.032, 0.06);
  weapon.rotation.order = 'YXZ';
  weapon.userData.z0 = 0.06;
  hang(g, weapon);
  turret.add(weapon);
  const flares: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const f = new Parts();
    f.add(new THREE.IcosahedronGeometry(0.03, 0), 0, 0, 0.02, 0xc8f8ff);
    f.add(new THREE.ConeGeometry(0.024, 0.1, 6).rotateX(Math.PI / 2), 0, 0, 0.08, VIOLET);
    f.add(new THREE.ConeGeometry(0.035, 0.05, 6).rotateX(-Math.PI / 2), 0, 0, -0.03, CYAN);
    const m = new THREE.Mesh(f.build(false).body, LAMP);
    m.position.set(s * 0.048, 0, 0.375);
    m.visible = false;
    weapon.add(m);
    flares.push(m);
  }

  // coussin d'énergie : halo cyan à terre, ombre portée plus petite que la coque, souffle sous le ventre
  const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.004, 12).scale(1, 1, 1.45), additive(CYAN, 0.28));
  cushion.position.y = 0.004;
  cushion.renderOrder = 2;
  root.add(cushion);
  const blob = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.002, 12).scale(1, 1, 1.55), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  blob.position.y = 0.002;
  blob.renderOrder = 1;
  root.add(blob);
  const cone = glowCone(HOVER);
  cone.position.y = HOVER / 2;
  root.add(cone);

  // bouclier d'énergie : une coque facettée autour de la caisse (à peine visible, vive à l'impact)
  const sg = new THREE.IcosahedronGeometry(1, 1).scale(0.22, 0.14, 0.42), fill = additive(CYAN, 0.04), wire = additive(0x9ae8ff, 0.12);
  wire.wireframe = true;
  for (const [m, ro] of [[fill, 5], [wire, 6]] as [THREE.Material, number][]) {
    const sh = new THREE.Mesh(sg, m);
    sh.position.set(0, 0.075, -0.01);
    sh.renderOrder = ro;
    body.add(sh);
  }
  const hover: HoverParts = { cushion, blob, cone, fill, wire, turret, dish, flares, ph: v * 1.7 };
  return { root, body, legs: [], weapon, tank: true, hover };
}

/**
 * Le char antigrav en route (`gait` 0 à l'arrêt … 1) : il flotte et tangue, le nez piqué en avançant, la tourelle balaie ;
 * `elev` lève l'arme, `recoil` (0 … 1) la fait reculer après le tir (flammes de plasma aux bouches, nez relevé) ; `hit` (0 … 1)
 * fait scintiller le bouclier juste après un impact
 */
export function hoverStep(r: Rider, t: number, gait: number, elev: number, recoil: number, hit: number) {
  const h = r.hover!, w = t + h.ph;
  r.body.position.y = HOVER + Math.sin(w * 2.3) * 0.008 + gait * 0.004;
  r.body.rotation.x = Math.sin(w * 1.7) * 0.03 - gait * 0.05 - recoil * 0.05;
  r.body.rotation.z = Math.sin(w * 1.25 + 1) * 0.025 + Math.sin(w * 0.7) * 0.015 * gait;
  // le souffle du coussin respire, l'ombre se resserre quand la caisse monte
  const k = 1 + Math.sin(w * 4.2) * 0.06 + recoil * 0.1;
  h.cushion.scale.set(k, 1, k);
  (h.cushion as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.24 + Math.sin(w * 5) * 0.05 + recoil * 0.2;
  (h.cone as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.2 + Math.sin(w * 6) * 0.04;
  h.blob.scale.setScalar(1 - (r.body.position.y - HOVER) * 4);
  h.turret.rotation.y = Math.sin(t * 0.55 + h.ph) * 0.18 * (1 - gait * 0.5);
  h.dish.rotation.y = t * 2.4;
  r.weapon.rotation.x = elev;
  r.weapon.position.z = r.weapon.userData.z0 - recoil * 0.05;
  for (const f of h.flares) { f.visible = recoil > 0.55; f.rotation.z = t * 9; }
  // bouclier : frémissement léger, puis éclat de filet qui scintille à l'impact
  h.fill.opacity = 0.035 + Math.sin(w * 3.1) * 0.012 + hit * 0.3;
  h.wire.opacity = 0.06 + Math.sin(w * 2.2) * 0.025 + hit * (0.45 + 0.4 * Math.abs(Math.sin(t * 60)));
}

// ---------- Drones de combat du pilote ----------

/** Un drone de combat : son corps (qui tangue), ses hélices, son œil, son rayon laser (à ajouter au même groupe que lui) */
export interface CombatDrone {
  root: THREE.Group;
  body: THREE.Group;
  rotors: THREE.Object3D[];
  eye: THREE.Object3D;
  beam: THREE.Mesh;
  tip: THREE.Object3D;
  /** position lissée (repère du groupe de l'escorte), vitesse, fin du tir en cours et cible visée (null : pas de tir) */
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fireUntil: number;
  aim: THREE.Vector3;
  color: number;
}

/** Drone de combat : corps blanc facetté à bandeau anthracite, œil lumineux, quatre bras à hélices, canon laser sous le nez */
export function makeCombatDrone(color: number): CombatDrone {
  const p = new Parts();
  p.add(new THREE.IcosahedronGeometry(0.035, 0).scale(1, 0.6, 1.2), 0, 0, 0, WHITE);
  p.box(0.07, 0.008, 0.07, 0, -0.004, -0.004, ANTHRA);
  p.box(0.03, 0.012, 0.01, 0, 0.002, 0.04, color, 0, 'neon');
  p.box(0.012, 0.012, 0.02, 0, -0.026, 0.03, ANTHRA2);
  p.box(0.012, 0.008, 0.004, 0, 0.026, -0.04, RED, 0, 'neon');
  const arms: [number, number][] = [[0.06, 0.05], [-0.06, 0.05], [0.06, -0.05], [-0.06, -0.05]];
  for (const [x, z] of arms) {
    p.add(new THREE.BoxGeometry(0.014, 0.006, 0.07), x * 0.5, 0.004, z * 0.5, ANTHRA, Math.atan2(x, z));
    p.cyl(0.011, 0.011, 0.012, 6, x, 0.002, z, ANTHRA2);
  }
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  hang(p, body);
  const rotors: THREE.Object3D[] = [];
  for (const [x, z] of arms) {
    const rp = new Parts();
    rp.box(0.07, 0.002, 0.01, 0, 0, 0, ANTHRA);
    rp.add(new THREE.CylinderGeometry(0.036, 0.036, 0.001, 10), 0, 0.001, 0, 0xcfd6de);
    const r = new THREE.Mesh(rp.build(false).body, mats.body);
    r.position.set(x, 0.016, z);
    body.add(r);
    rotors.push(r);
  }
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.008, 0.004), new THREE.MeshBasicMaterial({ color }));
  eye.position.set(0, 0.008, 0.043);
  body.add(eye);
  const tip = new THREE.Object3D();
  tip.position.set(0, -0.026, 0.045);
  body.add(tip);
  // rayon laser : un trait fin le long de +z (longueur 1, mis à l'échelle quand il tire)
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.007, 1).translate(0, 0, 0.5), additive(color, 0.9));
  beam.visible = false;
  beam.renderOrder = 6;
  return { root, body, rotors, eye, beam, tip, pos: new THREE.Vector3(), vel: new THREE.Vector3(), fireUntil: -1, aim: new THREE.Vector3(), color };
}

/** L'escorte d'un pilote : deux drones (le premier tire cyan, le second rouge), dans un groupe au repère de la bataille */
export interface Escort { root: THREE.Group; drones: CombatDrone[]; shots: number; placed: boolean }

export function makeEscort(): Escort {
  const root = new THREE.Group(), drones = [makeCombatDrone(CYAN), makeCombatDrone(RED)];
  for (const d of drones) { d.root.scale.setScalar(1.15); root.add(d.root, d.beam); }
  return { root, drones, shots: 0, placed: false };
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
/**
 * Les drones d'un pilote en (x, y, z) (repère de la bataille), tourné vers `heading` : ils volent de part et d'autre, un peu en
 * arrière (en patrouille) ou en avant du côté de la cible (au tir), lissés pour traîner derrière lui, avec un léger balancement ;
 * `now` : l'heure (secondes), `dt` : le pas, `dead` : le pilote est à terre (ils se posent)
 */
export function escortStep(e: Escort, x: number, y: number, z: number, heading: number, fighting: boolean, dead: boolean, now: number, dt: number, size: number) {
  e.drones.forEach((d, i) => {
    const side = i ? 1 : -1, w = now * 0.9 + i * Math.PI + size, fh = fighting ? 0.55 : -0.25;
    // cap du drone autour du pilote : de part et d'autre, plus ou moins en avant ; léger va-et-vient
    const ang = heading + side * (1.25 - (fighting ? 0.35 : 0)) * 1 + (fighting ? 0 : Math.sin(w * 0.5) * 0.35), r = size * (1.35 + Math.sin(w) * 0.12 + (fighting ? 0.15 : 0));
    const tx = x + Math.sin(ang) * r + Math.sin(heading) * fh * size, tz = z + Math.cos(ang) * r + Math.cos(heading) * fh * size;
    const ty = y + (dead ? 0.04 : size * (1.2 + Math.sin(w * 1.3 + 1) * 0.15 + i * 0.12));
    if (!e.placed) d.pos.set(tx, ty, tz);
    _a.set(tx, ty, tz).sub(d.pos);
    // ressort amorti : le drone rattrape son pilote avec un peu de retard
    d.vel.addScaledVector(_a, 14 * dt).multiplyScalar(Math.max(0, 1 - 5.5 * dt));
    d.pos.addScaledVector(d.vel, dt);
    const firing = now < d.fireUntil;
    d.root.position.copy(d.pos);
    // cap : vers sa cible quand il tire, sinon dans le sens du pilote ; penché dans le sens de sa vitesse
    const yaw = firing ? Math.atan2(d.aim.x - d.pos.x, d.aim.z - d.pos.z) : heading;
    d.root.rotation.set(0, yaw, 0);
    d.body.rotation.x = THREE.MathUtils.clamp((d.vel.x * Math.sin(yaw) + d.vel.z * Math.cos(yaw)) * 0.12, -0.3, 0.3) + Math.sin(w * 1.6) * 0.04;
    d.body.rotation.z = THREE.MathUtils.clamp((d.vel.x * Math.cos(yaw) - d.vel.z * Math.sin(yaw)) * -0.12, -0.3, 0.3) + Math.sin(w * 1.1) * 0.05;
    d.body.position.y = Math.sin(w * 2.4) * 0.006;
    d.rotors.forEach((r, k) => (r.rotation.y = dead ? 0 : now * 46 * (k % 2 ? 1 : -1)));
    // rayon laser : du nez du drone à la cible, qui s'éteint à la fin du coup
    d.beam.visible = firing;
    if (firing) {
      d.root.updateMatrixWorld(true);
      d.tip.getWorldPosition(_b);
      // (le groupe de l'escorte est à l'origine du repère de la bataille : le monde du drone vaut son repère local)
      d.beam.position.copy(d.root.parent!.worldToLocal(_b));
      d.beam.lookAt(d.root.parent!.localToWorld(_a.copy(d.aim)));
      d.beam.scale.set(1, 1, d.beam.position.distanceTo(d.aim));
      (d.beam.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.65 * Math.min(1, (d.fireUntil - now) / 0.1);
    }
  });
  e.placed = true;
  e.root.visible = true;
}

/** Un drone ouvre le feu sur (x, y, z) : le suivant dans la file, rayon visible un instant ; renvoie sa bouche (repère de la bataille) */
export function escortFire(e: Escort, now: number, x: number, y: number, z: number) {
  const d = e.drones[e.shots++ % e.drones.length];
  d.aim.set(x, y, z);
  d.fireUntil = now + 0.16;
  return d;
}
