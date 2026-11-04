import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { World, VEG_FOREST } from '../world/world';
import { Parts, Glow } from './parts';
import { mats, LIGHTS } from './materials';
import { makeFolk, folkStep, holdFolk, Folk } from './folk';

/**
 * La fête du retour d'une expédition réussie, à côté du cœur du village, là où il y a de la place : à chaque âge, un feu de
 * joie (un bûcher de rondins entrecroisés dans son cercle de pierres, des langues de flammes qui ondulent autour d'un cœur
 * clair, un lit de braises, un halo au sol, des braises qui montent et un peu de fumée), une ronde de danseurs, deux
 * musiciens, un festin, et le décor de l'âge : des mâts reliés de guirlandes de feuillage (Préhistoire), de fleurs sous des
 * torches (Antiquité), de fanions sous des torches (Moyen Âge), de fanions et de lanternes de papier (âge industriel),
 * d'ampoules (époque moderne), de néons (âge futuriste). Des pétales tombent (Antiquité), des fusées d'or montent (Moyen Âge),
 * des confettis (âge industriel), un grand feu d'artifice multicolore (époque moderne). Tout brille assez pour se voir de loin,
 * de jour comme de nuit
 */

const CAP = 6000;
/** couleurs des gerbes, de l'or seul (Moyen Âge) à toutes les couleurs (époque moderne) */
const BURSTS: number[][] = [
  [], [], [0xffc04a, 0xff7a3a], [0xffc04a, 0xff4a4a, 0xf8f4e8, 0x6ad0ff],
  [0xff4a6a, 0x4aa8ff, 0x6aff8a, 0xffd04a, 0xd06aff, 0xff8a3a, 0xf8f4e8],
];
const CONFETTI = [0xff5a6a, 0x4aa8ff, 0x6ad86a, 0xffd04a, 0xd06aff, 0xffffff];
const PETALS = [0xf8c8d8, 0xffffff, 0xf2a6c8];
/** couleurs des fanions selon l'âge (les guirlandes de la Préhistoire et de l'Antiquité sont de feuillage et de fleurs) */
const FLAGS: number[][] = [[], [], [0xc83a32, 0xe8b84a, 0x3a6ab8, 0x4a8a3e, 0xf2ece0], [0x2a4a9a, 0xf4f2ee, 0xd23a32], [0xff5a6a, 0x4aa8ff, 0x6ad86a, 0xffd04a, 0xd06aff], [0x40e8ff, 0xff4ad8, 0x8a6aff, 0x4affb0]];
/** mâts : leur bois (ou leur métal) et leur hauteur, selon l'âge */
const MAST = [0x6a4a30, 0x7a5a3e, 0x6a4a30, 0x5a4a3e, 0xeceae4, 0xc8d0dc];
const MAST_H = [0.5, 0.52, 0.6, 0.6, 0.62, 0.66];

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; c: THREE.Color; kind: 'spark' | 'rocket' | 'flake' | 'ember'; drag: number; trail: number }
/**
 * Les braises qui montent du feu de joie : petites, comme les étincelles d'un vrai feu (tirées avec les gerbes du feu
 * d'artifice, larges pour se voir de loin dans le ciel, elles faisaient une colonne de lumière jaune plus haute que le camp)
 */
const EMBERS = 600;

/** Une langue de flamme : sa largeur, sa hauteur, son rythme, et vers où elle penche (rotations autour de x et de z) */
interface Tongue { m: THREE.Mesh; r: number; h: number; ph: number; ax: number; az: number }
/** Une volute de fumée qui monte, grossit et s'efface */
interface Puff { s: THREE.Sprite; t: number; life: number; x: number; y: number; z: number; vx: number; vz: number }

interface Fest {
  x: number; y: number; z: number; age: number; t: number; dur: number; next: number;
  /** équipes de plus fêtées en même temps : la fête dure et s'intensifie au lieu de s'empiler */
  boost: number;
  /** tout ce que montre la fête ; le décor (bûcher, mâts, guirlandes, festin), qui s'aplatit à la fin */
  group: THREE.Group; decor: THREE.Group;
  /** les langues de flammes, le halo au sol et la lueur au-dessus du feu ; les flammes des torches */
  tongues: Tongue[]; halo: THREE.Mesh; aura: THREE.Sprite; torches: THREE.Mesh[];
  /** la ronde (chaque danseur à sa place dans le cercle) et les musiciens (le tambour, puis la flûte ou la trompette) */
  dancers: { f: Folk; a: number }[]; band: { f: Folk; drum: boolean }[];
  smoke: Puff[]; puffT: number;
  /** géométries et matériaux propres à la fête, libérés à la fin */
  own: { dispose(): void }[];
}

/** Petit disque lumineux au bord doux, pour que les étincelles soient rondes */
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!, r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.85)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/** Un tronçon de cylindre de a à b, du rayon r0 au rayon r1 (petit bois, cordes des guirlandes) */
function tube(p: Parts, a: number[], b: number[], r0: number, r1: number, c: number, seg = 5, glow: Glow = false) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg).translate(0, len / 2, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  p.add(g, a[0], a[1], a[2], c, 0, glow);
}
/** Un triangle (un fanion), visible des deux côtés */
function tri(p: Parts, a: number[], b: number[], c: number[], color: number) {
  for (const v of [[...a, ...b, ...c], [...a, ...c, ...b]]) p.add(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(v, 3)), 0, 0, 0, color);
}

export class Festivities {
  group = new THREE.Group();
  /** joué à chaque gerbe de feu d'artifice (force 0 … 1), et au début d'une fête autour du feu */
  onBang: ((k: number) => void) | null = null;
  onFeast: ((age: number) => void) | null = null;
  private fests: Fest[] = [];
  private sparks: Particle[] = [];
  private flakes: Particle[] = [];
  private embers: Particle[] = [];
  private glowPts: THREE.Points;
  private flakePts: THREE.Points;
  private emberPts: THREE.Points;
  private flashPts: THREE.Points;
  private flashes: { x: number; y: number; z: number; t: number; c: THREE.Color }[] = [];
  private tex: THREE.Texture;
  /** la langue de flamme (une goutte effilée, de hauteur et de rayon 1), partagée par toutes les fêtes */
  private tongueGeo: THREE.BufferGeometry;
  private flameMat = new THREE.MeshBasicMaterial({ color: 0xff7426, fog: false });
  private amberMat = new THREE.MeshBasicMaterial({ color: 0xffa238, fog: false });
  private innerMat = new THREE.MeshBasicMaterial({ color: 0xffd060, fog: false });
  private coreMat = new THREE.MeshBasicMaterial({ color: 0xfff2c4, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  private bedMat = new THREE.MeshBasicMaterial({ color: 0xff5a1a, fog: false });
  /** l'horloge des fêtes (le lit de braises rougeoie) */
  private clock = 0;

  constructor(private world: World) {
    const mk = (n: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setDrawRange(0, 0);
      return g;
    };
    const tex = (this.tex = dotTexture());
    this.glowPts = new THREE.Points(mk(CAP), new THREE.PointsMaterial({ size: 0.5, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    // l'éclair blanc au cœur de chaque gerbe
    this.flashPts = new THREE.Points(mk(64), new THREE.PointsMaterial({ size: 4, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.flashPts.frustumCulled = false;
    this.group.add(this.flashPts);
    this.flakePts = new THREE.Points(mk(CAP / 2), new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, depthWrite: false }));
    this.emberPts = new THREE.Points(mk(EMBERS), new THREE.PointsMaterial({ size: 0.06, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    for (const p of [this.glowPts, this.flakePts, this.emberPts]) { p.frustumCulled = false; this.group.add(p); }
    // la langue de flamme : renflée au pied, effilée en haut
    this.tongueGeo = new THREE.LatheGeometry([[0, 0], [0.62, 0.07], [0.92, 0.2], [0.86, 0.38], [0.6, 0.6], [0.3, 0.82], [0, 1]].map(([x, y]) => new THREE.Vector2(x, y)), 6);
  }

  /** Une fête commence près de (x, z) (le cœur du village, où l'équipe est revenue) : elle dure une trentaine de secondes */
  start(x: number, z: number, age: number) {
    // une autre équipe rentre pendant la fête : la même fête repart de plus belle, plus longue et plus fournie
    const near = this.fests.find((f) => Math.hypot(f.x - x, f.z - z) < 4);
    if (near) { near.dur = Math.max(near.dur, near.t + 28); near.boost = Math.min(3, near.boost + 1); near.next = Math.min(near.next, 0.3); return; }
    [x, z] = this.spot(x, z);
    const y = this.world.surfaceAt(x, z), group = new THREE.Group(), decor = new THREE.Group();
    group.position.set(x, y, z);
    group.add(decor);
    this.group.add(group);
    const halo = new THREE.Mesh(this.haloGeo(x, y, z), new THREE.MeshBasicMaterial({ map: this.tex, color: 0xff8a3a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, color: 0xff9a48, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const f: Fest = {
      x, y, z, age, t: 0, dur: age >= 3 ? 34 : 28, next: 1.2, boost: 0, group, decor, tongues: [], halo, aura, torches: [],
      dancers: [], band: [], smoke: [], puffT: 0, own: [halo.geometry, halo.material as THREE.Material, aura.material],
    };
    this.bonfire(f);
    this.decorate(f);
    this.fests.push(f);
    if (age <= 2) this.onFeast?.(age);
  }

  /** Le halo du feu, posé sur le terrain autour de lui (un disque plat flotterait au-dessus d'une pente, ou s'y enfoncerait) */
  private haloGeo(x: number, y: number, z: number) {
    const g = new THREE.PlaneGeometry(2.4, 2.4, 12, 12).rotateX(-Math.PI / 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, this.world.surfaceAt(x + p.getX(i), z + p.getZ(i)) - y + 0.025);
    return g;
  }

  /**
   * Où tenir la fête : à côté du cœur du village (l'équipe revenue y regarde la ronde, au lieu de se tenir dans le feu), du côté
   * où le feu, la ronde et le décor tiennent le mieux sans toucher aux maisons ni à l'eau
   */
  private spot(x: number, z: number): [number, number] {
    let best: [number, number] = [x, z], score = -1;
    for (let k = 0; k < 8; k++) {
      const cx = x + Math.cos(k * 0.785) * 1.1, cz = z + Math.sin(k * 0.785) * 1.1;
      let n = this.open(cx, cz, true) ? 8 : 0;
      for (let i = 0; i < 16; i++) for (const r of [0.6, 1, 1.5]) if (this.open(cx + Math.cos(i * 0.39) * r, cz + Math.sin(i * 0.39) * r, true)) n++;
      if (n > score) { score = n; best = [cx, cz]; }
    }
    return best;
  }
  /** Une place libre en (x, z), relative au monde : ni bâtiment, ni eau ; `clear` : ni sous les arbres (on y voit la fête) */
  private open(x: number, z: number, clear = false) {
    const w = this.world, cx = Math.floor(x), cz = Math.floor(z);
    return w.inCells(cx, cz) && !w.occ[w.ci(cx, cz)] && !w.isWet(cx, cz) && !(clear && w.veg[w.ci(cx, cz)] === VEG_FOREST);
  }

  /**
   * Le feu de joie : un cercle de pierres, un bûcher de rondins entrecroisés (quatre lits de deux rondins aux bouts sciés) et
   * le petit bois dressé au milieu ; le lit de braises, sept langues de flammes autour d'un cœur clair, le halo au sol et la
   * lueur au-dessus du feu
   */
  private bonfire(f: Fest) {
    const p = new Parts();
    for (let i = 0; i < 11; i++) { const a = (i / 11) * Math.PI * 2; p.add(new THREE.IcosahedronGeometry(0.04 + (i % 3) * 0.006, 0).scale(1, 0.7, 1), Math.cos(a) * 0.27, 0.02, Math.sin(a) * 0.27, i % 2 ? 0x8a857c : 0x9d978d); }
    for (let l = 0; l < 4; l++) {
      const len = 0.36 - l * 0.035, y = 0.025 + l * 0.04, along = l % 2 === 0;
      for (const s of [-1, 1]) {
        const ox = along ? 0 : s * 0.1, oz = along ? s * 0.1 : 0, ry = along ? 0 : Math.PI / 2;
        p.add(new THREE.CylinderGeometry(0.022, 0.025, len, 6).rotateZ(Math.PI / 2), ox, y, oz, l % 2 ? 0x5e3e26 : 0x6e4a2e, ry);
        for (const e of [-1, 1]) p.add(new THREE.CylinderGeometry(0.019, 0.019, 0.006, 6).rotateZ(Math.PI / 2), ox + (along ? (e * len) / 2 : 0), y, oz + (along ? 0 : (e * len) / 2), 0xc8a070, ry);
      }
    }
    for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3; tube(p, [Math.cos(a) * 0.08, 0.03, Math.sin(a) * 0.08], [Math.cos(a) * 0.012, 0.3, Math.sin(a) * 0.012], 0.012, 0.007, i % 2 ? 0x3a2a20 : 0x4a3424); }
    const pyre = new THREE.Mesh(p.build(false).body, mats.body);
    pyre.castShadow = true;
    f.decor.add(pyre);
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.025, 10), this.bedMat);
    bed.position.y = 0.012;
    f.group.add(bed);
    f.own.push(pyre.geometry, bed.geometry);
    // les langues de flammes : orangées autour, plus claires dedans, et le cœur, presque blanc ; celles du bord penchent au dehors
    const T: [number, number, number, number, THREE.Material][] = [
      [0.1, 0.42, 0.02, 0, this.flameMat], [0.08, 0.34, 0.075, 1.3, this.amberMat], [0.08, 0.3, 0.075, 2.6, this.flameMat], [0.075, 0.36, 0.075, 3.9, this.amberMat],
      [0.07, 0.28, 0.075, 5.2, this.flameMat], [0.07, 0.24, 0.035, 0.7, this.innerMat], [0.06, 0.21, 0.035, 3.6, this.innerMat], [0.075, 0.18, 0, 0, this.coreMat],
    ];
    T.forEach(([r, h, d, a, m], i) => {
      const t = new THREE.Mesh(this.tongueGeo, m);
      t.position.set(Math.cos(a) * d, 0.07, Math.sin(a) * d);
      f.group.add(t);
      f.tongues.push({ m: t, r, h, ph: i * 1.7, ax: Math.sin(a) * d * 3, az: -Math.cos(a) * d * 3 });
    });
    f.aura.position.y = 0.3;
    f.aura.scale.setScalar(0.9);
    f.group.add(f.halo, f.aura);
  }

  /**
   * Le décor de la fête, selon l'âge : la ronde des danseurs autour du feu ; les mâts en cercle et leurs guirlandes (feuillage,
   * fleurs, fanions, lanternes, ampoules, néons), torches en haut des mâts de l'Antiquité et du Moyen Âge ; les deux musiciens
   * du côté le plus dégagé (un tambour, une flûte, puis une trompette) ; le festin de l'autre côté (sur des peaux à la
   * Préhistoire, puis sur une table entre deux bancs)
   */
  private decorate(f: Fest) {
    const age = f.age, w = this.world, p = new Parts(), g = new Parts(), at = (x: number, z: number) => w.surfaceAt(f.x + x, f.z + z) - f.y;
    const free = (x: number, z: number) => this.open(f.x + x, f.z + z);
    // les mâts, leurs guirlandes de l'un à l'autre
    const masts: ([number, number, number] | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.2, x = Math.cos(a) * 1.5, z = Math.sin(a) * 1.5, H = MAST_H[age];
      if (!free(x, z)) { masts.push(null); continue; }
      const y = at(x, z);
      masts.push([x, y + H, z]);
      p.cyl(0.014, 0.018, H, 5, x, y, z, MAST[age]);
      if (age === 0) p.sphere(0.04, x, y + H + 0.02, z, 0x4a7a3a, 0, 1.3);
      else if ((age === 1 || age === 2) && i % 2 === 0) {
        // une torche en haut du mât : son pot, sa flamme qui danse
        p.cyl(0.022, 0.014, 0.04, 6, x, y + H, z, 0x3a3430);
        const t = new THREE.Mesh(this.tongueGeo, this.flameMat);
        t.position.set(x, y + H + 0.035, z);
        t.scale.set(0.03, 0.09, 0.03);
        f.decor.add(t);
        f.torches.push(t);
      } else if (age >= 2) tri(p, [x, y + H, z], [x, y + H - 0.07, z], [x + 0.09, y + H - 0.035, z], FLAGS[age][i % FLAGS[age].length]);
      if (age === 5) p.add(new THREE.IcosahedronGeometry(0.022, 0), x, y + H + 0.01, z, 0x40e8ff, 0, 'neon');
    }
    masts.forEach((m, i) => {
      const n = masts[(i + 1) % masts.length];
      if (!m || !n) return;
      // la corde, qui pend entre les deux mâts, et ce qui y pend
      const N = 12, pts: number[][] = [];
      for (let k = 0; k <= N; k++) { const t = k / N; pts.push([m[0] + (n[0] - m[0]) * t, m[1] - 0.05 + (n[1] - m[1]) * t - Math.sin(t * Math.PI) * 0.13, m[2] + (n[2] - m[2]) * t]); }
      for (let k = 0; k < N; k++) tube(p, pts[k], pts[k + 1], 0.004, 0.004, age >= 4 ? 0x3a3a3e : 0xb8a07a, 3);
      const dx = n[0] - m[0], dz = n[2] - m[2], d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
      for (let k = 1; k < N; k++) {
        const [x, y, z] = pts[k];
        if (age === 0) p.add(new THREE.IcosahedronGeometry(0.022, 0).scale(1, 0.5, 1.4), x, y - 0.02, z, k % 3 ? 0x5c8a45 : 0xc8344a);
        else if (age === 1) p.sphere(0.02, x, y - 0.018, z, k % 2 ? 0x6a9a50 : k % 4 === 1 ? 0xf8c8d8 : 0xffffff);
        else if (age === 3 && k % 3 === 0) {
          // une lanterne de papier, qui luit le soir
          p.cyl(0.003, 0.003, 0.03, 3, x, y - 0.03, z, 0x3a3a3e);
          g.add(new THREE.IcosahedronGeometry(0.03, 1).scale(1, 1.2, 1), x, y - 0.06, z, k % 2 ? 0xffb050 : 0xff6a4a, 0, true);
        } else if (age >= 4 && k % 2 === 0) g.add(new THREE.IcosahedronGeometry(0.014, 0), x, y - 0.014, z, age === 5 ? FLAGS[5][k % 4] : 0xffe2a0, 0, age === 5 ? 'neon' : true);
        else if (age >= 2) tri(p, [x - ux * 0.035, y, z - uz * 0.035], [x + ux * 0.035, y, z + uz * 0.035], [x, y - 0.07, z], FLAGS[age][k % FLAGS[age].length]);
      }
    });
    // les deux côtés les plus dégagés, autour du feu : les musiciens, puis le festin
    const room = (a: number) => [0.9, 1.15, 1.35].filter((r) => free(Math.cos(a) * r, Math.sin(a) * r)).length;
    const angles = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2).sort((a, b) => room(b) - room(a));
    const ba = angles[0], ta = angles.find((a) => Math.abs(Math.atan2(Math.sin(a - ba), Math.cos(a - ba))) > 1.5) ?? ba + Math.PI;
    this.musicians(f, p, ba, at);
    this.feast(p, ta, age, at);
    // la ronde des danseurs, habillés à la mode de l'âge
    for (let i = 0; i < 10; i++) {
      const folk = makeFolk({ age, v: Math.floor(f.x * 31 + f.z * 7) + i * 13, role: 'villager' });
      f.group.add(folk.root);
      f.dancers.push({ f: folk, a: (i / 10) * Math.PI * 2 });
    }
    const body = new THREE.Mesh(p.build(false).body, mats.body);
    body.castShadow = true;
    f.decor.add(body);
    f.own.push(body.geometry);
    // les lanternes, les ampoules et les néons, qui s'allument le soir comme les lumières du village
    if (g.glow.length) {
      const lights = new THREE.Mesh(mergeGeometries(g.glow, false)!, mats.glow);
      for (const x of g.glow) x.dispose();
      f.decor.add(lights);
      f.own.push(lights.geometry);
    }
  }

  /** Les musiciens, côte à côte face au feu : le tambour (assis sur un billot), et la flûte (la trompette dès l'âge industriel) */
  private musicians(f: Fest, p: Parts, a: number, at: (x: number, z: number) => number) {
    const cx = Math.cos(a) * 1.12, cz = Math.sin(a) * 1.12, tx = -Math.sin(a), tz = Math.cos(a), face = Math.atan2(-cx, -cz);
    [-1, 1].forEach((s, i) => {
      const x = cx + tx * s * 0.15, z = cz + tz * s * 0.15, y = at(x, z), drum = i === 0;
      const folk = makeFolk({ age: f.age, v: Math.floor(f.x * 17 + f.z * 5) + i * 7, role: drum ? 'drummer' : 'villager' });
      folk.root.position.set(x, y, z);
      folk.root.rotation.y = face;
      if (drum) {
        p.cyl(0.04, 0.045, 0.05, 7, x - Math.sin(face) * 0.02, y, z - Math.cos(face) * 0.02, 0x6a4a34);
        const dx = x + Math.sin(face) * 0.1, dz = z + Math.cos(face) * 0.1;
        p.cyl(0.045, 0.05, 0.08, 9, dx, at(dx, dz), dz, [0x8a5a3a, 0xa0603a, 0xc84a3e, 0x2a4a8a, 0xd8d8d8, 0x3a3a48][f.age]);
        p.cyl(0.047, 0.047, 0.006, 9, dx, at(dx, dz) + 0.08, dz, 0xf2e8d0);
      } else {
        // la flûte (de bois), puis la trompette (de laiton) dès l'âge industriel
        const q = new Parts(), brass = f.age >= 3;
        q.add(new THREE.CylinderGeometry(0.005, 0.006, 0.09, 5), 0, 0.03, 0, brass ? 0xd8b04a : 0x8a6a44);
        if (brass) q.cone(0.018, 0.03, 7, 0, 0.075, 0, 0xe8c66a);
        const inst = new THREE.Mesh(q.build(false).body, mats.body);
        holdFolk(folk, 0, inst, 'point');
        f.own.push(inst.geometry);
      }
      f.group.add(folk.root);
      f.band.push({ f: folk, drum });
    });
  }

  /** Le festin : des peaux au sol, des paniers de fruits et des billots pour s'asseoir ; puis une table, ses bancs, et ce qu'on y sert */
  private feast(p: Parts, a: number, age: number, at: (x: number, z: number) => number) {
    const cx = Math.cos(a) * 1.15, cz = Math.sin(a) * 1.15, ux = -Math.sin(a), uz = Math.cos(a), ry = Math.atan2(-uz, ux), y = at(cx, cz);
    const put = (u: number, v: number) => [cx + ux * u + Math.cos(a) * v, cz + uz * u + Math.sin(a) * v];
    if (age === 0) {
      for (const [u, c] of [[-0.12, 0xa0784a], [0.13, 0x8a6440]]) { const [x, z] = put(u, 0); p.box(0.2, 0.004, 0.15, x, at(x, z), z, c, ry + u); }
      for (const u of [-0.12, 0.13]) {
        const [x, z] = put(u, 0);
        p.cyl(0.035, 0.028, 0.04, 7, x, at(x, z), z, 0xb08a5a);
        for (let k = 0; k < 4; k++) p.sphere(0.014, x + Math.cos(k * 1.6) * 0.016, at(x, z) + 0.045, z + Math.sin(k * 1.6) * 0.016, k % 2 ? 0xc8344a : 0x5a3a8a);
      }
      for (const v of [-0.17, 0.17]) { const [x, z] = put(0, v); p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6).rotateZ(Math.PI / 2), x, at(x, z) + 0.03, z, 0x6a4a30, ry); }
      return;
    }
    // la table, ses pieds, sa nappe blanche dès l'âge industriel ; les bancs de part et d'autre
    const top = age >= 3 ? 0xf4f2ee : 0x9a7452, wood = age >= 4 ? 0x8a8f96 : 0x7a5a3e;
    p.box(0.42, 0.016, 0.15, cx, y + 0.1, cz, top, ry);
    for (const [u, v] of [[-0.18, -0.055], [0.18, -0.055], [-0.18, 0.055], [0.18, 0.055]]) { const [x, z] = put(u, v); p.box(0.016, 0.1, 0.016, x, y, z, wood, ry); }
    for (const v of [-0.15, 0.15]) {
      const [x, z] = put(0, v);
      p.box(0.4, 0.012, 0.05, x, y + 0.055, z, wood, ry);
      for (const u of [-0.16, 0.16]) { const [lx, lz] = put(u, v); p.box(0.012, 0.055, 0.04, lx, y, lz, wood, ry); }
    }
    // ce qu'on y sert : des pains, des fruits, des cruches (des amphores à l'Antiquité, des bouteilles ensuite)
    for (let k = 0; k < 6; k++) {
      const [x, z] = put(-0.16 + k * 0.064, (k % 2 ? 1 : -1) * 0.03), yy = y + 0.116;
      if (k % 3 === 0) p.add(new THREE.IcosahedronGeometry(0.02, 0).scale(1.5, 0.8, 1), x, yy + 0.01, z, 0xc89050);
      else if (k % 3 === 1) for (let j = 0; j < 3; j++) p.sphere(0.011, x + (j - 1) * 0.012, yy + 0.008, z, [0xc8344a, 0x7cc46a, 0xe8b84a][j]);
      else if (age === 1) { p.cone(0.022, 0.05, 7, x, yy + 0.012, z, 0xc8743a); p.sphere(0.022, x, yy + 0.02, z, 0xc8743a); }
      else p.cyl(0.012, 0.014, age >= 4 ? 0.05 : 0.035, 6, x, yy, z, age >= 4 ? 0x3a7a4a : 0x8a8f96);
    }
    if (age === 2) for (const u of [-0.32, 0.32]) { const [x, z] = put(u, 0); p.cyl(0.04, 0.04, 0.09, 8, x, at(x, z), z, 0x9a6a44); p.cyl(0.042, 0.042, 0.008, 8, x, at(x, z) + 0.06, z, 0x6f5640); }
  }

  get active() { return this.fests.length > 0 || this.sparks.length > 0 || this.flakes.length > 0 || this.embers.length > 0 || this.flashes.length > 0; }

  update(dt: number) {
    if (!this.active) return;
    dt = Math.min(dt, 0.05);
    this.clock += dt;
    // le lit de braises rougeoie
    this.bedMat.color.setRGB(1, 0.34 + Math.sin(this.clock * 3) * 0.06 + Math.sin(this.clock * 7.7) * 0.04, 0.1);
    for (let i = this.fests.length - 1; i >= 0; i--) {
      const f = this.fests[i];
      f.t += dt;
      // le feu prend, brûle, puis retombe à la fin de la fête
      const fade = Math.min(1, (f.dur - f.t) / 3), fire = Math.max(0.03, Math.min(1, f.t / 1.5) * fade);
      // les langues de flammes ondulent et vacillent, chacune à son rythme
      for (const tg of f.tongues) {
        const s = 0.84 + Math.sin(f.t * 9 + tg.ph) * 0.12 + Math.sin(f.t * 15.7 + tg.ph * 2.3) * 0.07, wob = Math.sin(f.t * 7 + tg.ph) * 0.1;
        tg.m.scale.set(tg.r * (1 + wob), tg.h * s * fire, tg.r * (1 - wob));
        tg.m.rotation.set(tg.ax + Math.sin(f.t * 3.1 + tg.ph) * 0.14, 0, tg.az + Math.cos(f.t * 2.7 + tg.ph) * 0.14);
      }
      for (const [j, t] of f.torches.entries()) t.scale.set(0.03, (0.08 + Math.sin(f.t * 12 + j * 2) * 0.015) * Math.max(0.05, fade), 0.03);
      // le halo au sol et la lueur du feu : discrets en plein jour, francs la nuit
      const night = LIGHTS.night.value;
      (f.halo.material as THREE.MeshBasicMaterial).opacity = (0.34 + Math.sin(f.t * 9) * 0.06 + Math.sin(f.t * 23) * 0.04) * fire * (0.25 + 0.75 * night);
      f.aura.material.opacity = (0.3 + Math.sin(f.t * 11) * 0.05) * fire * (0.45 + 0.55 * night);
      if (fade > 0) for (let k = 0; k < 2; k++) if (Math.random() < dt * 14) this.ember(f.x + (Math.random() - 0.5) * 0.16, f.y + 0.32, f.z + (Math.random() - 0.5) * 0.16);
      this.stepSmoke(f, dt, fire);
      // la ronde : on tourne en se tenant au pas, puis on s'arrête, face au feu, les bras levés ; et l'on repart
      const turn = f.t % 9, walking = turn < 6.5, k = Math.max(0.001, Math.min(1, fade * 1.5));
      for (const d of f.dancers) {
        if (walking) d.a += dt * 0.42;
        const x = Math.cos(d.a) * 0.8, z = Math.sin(d.a) * 0.8;
        d.f.root.position.set(x, this.world.surfaceAt(f.x + x, f.z + z) - f.y, z);
        d.f.root.rotation.y = walking ? Math.atan2(-Math.sin(d.a), Math.cos(d.a)) : Math.atan2(-x, -z);
        d.f.root.scale.setScalar(k * 0.001 + (d.f.root.userData.s0 ??= d.f.root.scale.x) * k);
        folkStep(d.f, f.t * 7 + d.a, walking ? 'walk' : 'cheer');
      }
      // les musiciens : le tambour bat à deux mains, la flûte (ou la trompette) se balance au rythme
      for (const [j, b] of f.band.entries()) {
        folkStep(b.f, f.t * 3 + j, b.drum ? 'sit' : 'idle');
        const [r, l] = b.f.arms;
        if (b.drum) { r.rotation.x = -0.75 - Math.max(0, Math.sin(f.t * 9)) * 0.5; l.rotation.x = -0.75 - Math.max(0, -Math.sin(f.t * 9)) * 0.5; }
        else { r.rotation.x = -1.35 + Math.sin(f.t * 2.2) * 0.08; l.rotation.x = -1.25 + Math.sin(f.t * 2.2) * 0.08; b.f.body.rotation.z = Math.sin(f.t * 2.2) * 0.06; }
        b.f.root.scale.setScalar(k * 0.001 + (b.f.root.userData.s0 ??= b.f.root.scale.x) * k);
      }
      // le décor s'aplatit à la fin, comme on le démonte
      f.decor.scale.y = Math.max(0.001, k);
      // fusées : de plus en plus nombreuses avec les âges
      const pal = BURSTS[Math.min(4, f.age)];
      if (pal.length && f.t < f.dur - 4) {
        f.next -= dt;
        if (f.next <= 0) {
          const salvo = (f.age >= 4 ? 1 + Math.floor(Math.random() * 3) : 1) + f.boost;
          for (let n = 0; n < salvo; n++) this.rocket(f.x + (Math.random() - 0.5) * 1.6, f.y + 0.2, f.z + (Math.random() - 0.5) * 1.6, pal, f.age);
          f.next = f.age >= 4 ? 0.45 + Math.random() * 0.6 : f.age === 3 ? 0.9 + Math.random() * 0.8 : 1.6 + Math.random() * 1.2;
        }
      }
      // pétales (Antiquité), confettis (âge industriel et moderne) qui tombent sur la place
      if ((f.age === 1 || f.age >= 3) && fade > 0) for (let n = 0; n < 3; n++) if (Math.random() < dt * (f.age >= 3 ? 40 : 25)) {
        const c = (f.age === 1 ? PETALS : CONFETTI)[Math.floor(Math.random() * (f.age === 1 ? PETALS.length : CONFETTI.length))];
        this.flake(f.x + (Math.random() - 0.5) * 2.4, f.y + 1.2 + Math.random() * 0.8, f.z + (Math.random() - 0.5) * 2.4, c);
      }
      if (f.t >= f.dur) {
        this.group.remove(f.group);
        // (les géométries des habitants leur sont propres ; la langue de flamme et le halo sont partagés)
        for (const d of [...f.dancers, ...f.band]) d.f.root.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
        for (const s of f.smoke) s.s.material.dispose();
        for (const o of f.own) o.dispose();
        this.fests.splice(i, 1);
      }
    }
    this.step(dt);
  }

  /** Un peu de fumée au-dessus du feu : quelques volutes grises qui montent, s'élargissent et s'effacent bien avant le ciel */
  private stepSmoke(f: Fest, dt: number, fire: number) {
    if ((f.puffT -= dt) <= 0 && fire > 0.2) {
      f.puffT = 0.4 + Math.random() * 0.3;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, color: 0x8a847c, transparent: true, opacity: 0, depthWrite: false }));
      f.group.add(s);
      f.smoke.push({ s, t: 0, life: 3.2 + Math.random(), x: (Math.random() - 0.5) * 0.08, y: 0.42, z: (Math.random() - 0.5) * 0.08, vx: 0.05 + (Math.random() - 0.5) * 0.04, vz: (Math.random() - 0.5) * 0.04 });
    }
    f.smoke = f.smoke.filter((p) => {
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) { f.group.remove(p.s); p.s.material.dispose(); return false; }
      p.s.position.set(p.x + p.vx * p.t, p.y + p.t * 0.22, p.z + p.vz * p.t);
      p.s.scale.setScalar(0.18 + k * 0.45);
      p.s.material.opacity = Math.sin(k * Math.PI) * 0.24;
      return true;
    });
  }

  private spark(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, life: number, drag = 0.6) {
    if (this.sparks.length >= CAP) return;
    this.sparks.push({ x, y, z, vx, vy, vz, life, max: life, c: new THREE.Color(color), kind: 'spark', drag, trail: 0 });
  }

  /** Une braise qui monte du feu de joie en tourbillonnant un peu, puis s'éteint */
  private ember(x: number, y: number, z: number) {
    if (this.embers.length >= EMBERS) return;
    const life = 0.7 + Math.random() * 0.6;
    this.embers.push({ x, y, z, vx: (Math.random() - 0.5) * 0.3, vy: 0.5 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 0.3, life, max: life, c: new THREE.Color(Math.random() < 0.6 ? 0xffa040 : 0xffd070), kind: 'ember', drag: 0.5, trail: 0 });
  }

  private flake(x: number, y: number, z: number, color: number) {
    if (this.flakes.length >= CAP / 2) return;
    this.flakes.push({ x, y, z, vx: (Math.random() - 0.5) * 0.3, vy: -0.35 - Math.random() * 0.25, vz: (Math.random() - 0.5) * 0.3, life: 5, max: 5, c: new THREE.Color(color), kind: 'flake', drag: 0, trail: Math.random() * 6 });
  }

  private rocket(x: number, y: number, z: number, pal: number[], age: number) {
    if (this.sparks.length >= CAP) return;
    const c = pal[Math.floor(Math.random() * pal.length)];
    this.sparks.push({ x, y, z, vx: (Math.random() - 0.5) * 0.8, vy: 6.4 + Math.random() * 1.6 + age * 0.2, vz: (Math.random() - 0.5) * 0.8, life: 1.6 + Math.random() * 0.5, max: 10, c: new THREE.Color(c), kind: 'rocket', drag: 0, trail: age });
  }

  /** La gerbe d'une fusée : sphère d'étincelles, anneau, ou saule qui retombe en pluie d'or */
  private burst(p: Particle) {
    const age = p.trail, n = age >= 4 ? 170 + Math.floor(Math.random() * 80) : age === 3 ? 120 : 80;
    this.flashes.push({ x: p.x, y: p.y, z: p.z, t: 0, c: p.c.clone().lerp(new THREE.Color(0xffffff), 0.6) });
    const shape = Math.random(), speed = 3.4 + Math.random() * 1.8 + age * 0.3, second = age >= 4 && Math.random() < 0.4 ? BURSTS[4][Math.floor(Math.random() * 7)] : -1;
    for (let i = 0; i < n; i++) {
      let dx: number, dy: number, dz: number;
      if (shape < 0.25 && age >= 3) { const a = (i / n) * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a) * 0.35; dz = Math.sin(a); }
      else { const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u); dx = r * Math.cos(a); dy = u; dz = r * Math.sin(a); }
      const sp = speed * (0.85 + Math.random() * 0.3), willow = shape > 0.8;
      this.spark(p.x, p.y, p.z, dx * sp, dy * sp, dz * sp, second >= 0 && i % 2 ? second : p.c.getHex(), willow ? 2.8 + Math.random() : 1.7 + Math.random() * 0.8, willow ? 1.6 : 0.9);
    }
    this.onBang?.(age >= 4 ? 0.8 : 0.6);
  }

  private step(dt: number) {
    const sp = this.glowPts.geometry, pos = sp.attributes.position as THREE.BufferAttribute, col = sp.attributes.color as THREE.BufferAttribute;
    let n = 0;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.life -= dt;
      if (p.kind === 'rocket') {
        p.vy -= 4 * dt;
        // traînée dorée sous la fusée
        for (let t = 0; t < 2; t++) this.spark(p.x, p.y, p.z, (Math.random() - 0.5) * 0.25, -0.4, (Math.random() - 0.5) * 0.25, 0xffc87a, 0.6, 2);
        if (p.life <= 0 || p.vy < 1.2) { this.burst(p); this.sparks.splice(i, 1); continue; }
      } else {
        p.vy -= 1.6 * dt;
        const d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vy *= d; p.vz *= d;
        if (p.life <= 0) { this.sparks.splice(i, 1); continue; }
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (n >= CAP) continue;
      const k = p.kind === 'rocket' ? 1 : Math.min(1, (p.life / p.max) * 1.6) * (0.75 + Math.random() * 0.25);
      pos.setXYZ(n, p.x, p.y, p.z); col.setXYZ(n, p.c.r * k, p.c.g * k, p.c.b * k); n++;
    }
    sp.setDrawRange(0, n); pos.needsUpdate = true; col.needsUpdate = true;
    const fg = this.flakePts.geometry, fpos = fg.attributes.position as THREE.BufferAttribute, fcol = fg.attributes.color as THREE.BufferAttribute;
    let m = 0;
    for (let i = this.flakes.length - 1; i >= 0; i--) {
      const p = this.flakes[i];
      p.life -= dt; p.trail += dt * 3;
      const ground = this.world.surfaceAt(p.x, p.z) + 0.02;
      if (p.y > ground) { p.x += (p.vx + Math.sin(p.trail) * 0.25) * dt; p.y += p.vy * dt; p.z += (p.vz + Math.cos(p.trail * 0.8) * 0.25) * dt; } else p.y = ground;
      if (p.life <= 0) { this.flakes.splice(i, 1); continue; }
      fpos.setXYZ(m, p.x, p.y, p.z); fcol.setXYZ(m, p.c.r, p.c.g, p.c.b); m++;
    }
    fg.setDrawRange(0, m); fpos.needsUpdate = true; fcol.needsUpdate = true;
    const eg = this.emberPts.geometry, epos = eg.attributes.position as THREE.BufferAttribute, ecol = eg.attributes.color as THREE.BufferAttribute;
    let e = 0;
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const p = this.embers[i];
      p.life -= dt;
      if (p.life <= 0) { this.embers.splice(i, 1); continue; }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = Math.min(1, (p.life / p.max) * 1.8);
      epos.setXYZ(e, p.x, p.y, p.z); ecol.setXYZ(e, p.c.r * k, p.c.g * k, p.c.b * k); e++;
    }
    eg.setDrawRange(0, e); epos.needsUpdate = true; ecol.needsUpdate = true;
    const hg = this.flashPts.geometry, hpos = hg.attributes.position as THREE.BufferAttribute, hcol = hg.attributes.color as THREE.BufferAttribute;
    let h = 0;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      if (f.t > 0.25 || h >= 64) { this.flashes.splice(i, 1); continue; }
      const k = 1 - f.t / 0.25;
      hpos.setXYZ(h, f.x, f.y, f.z); hcol.setXYZ(h, f.c.r * k, f.c.g * k, f.c.b * k); h++;
    }
    hg.setDrawRange(0, h); hpos.needsUpdate = true; hcol.needsUpdate = true;
  }
}
