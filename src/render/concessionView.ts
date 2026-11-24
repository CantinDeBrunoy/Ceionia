import * as THREE from 'three';
import type { World } from '../world/world';
import type { Concession } from '../world/concession';
import { concession } from '../world/concession';

/**
 * La limite des zones des îles (chantier C du nouveau monde, voir `world/concession.ts`) : là où le relief ne la fait pas (la
 * mer, la ria, l'arête), un décor la borne, selon l'âge du village. Au Médiéval et avant, des bornes de pierre ; à
 * l'Industriel, une haie taillée doublée d'une grille ; au Moderne et après, un mur bas enduit. Le passage vers la ville est
 * une porte (deux piliers, une traverse). Avec un bâtiment en main, le contour des zones où il se pose s'éclaire en or
 */
type Style = 'stone' | 'hedge' | 'wall';
const styleOf = (age: number): Style => (age <= 2 ? 'stone' : age === 3 ? 'hedge' : 'wall');

const MAT = {
  stone: new THREE.MeshStandardMaterial({ color: 0xb9ad98, roughness: 0.95, flatShading: true }),
  cap: new THREE.MeshStandardMaterial({ color: 0x8a7f6c, roughness: 0.9, flatShading: true }),
  hedge: new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 1, flatShading: true }),
  iron: new THREE.MeshStandardMaterial({ color: 0x2f3236, roughness: 0.6, metalness: 0.4 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xe2dccd, roughness: 0.9, flatShading: true }),
  coping: new THREE.MeshStandardMaterial({ color: 0x9c9a94, roughness: 0.8, flatShading: true }),
  gold: new THREE.MeshStandardMaterial({ color: 0xe8c66a, roughness: 0.4, metalness: 0.5 }),
};

export class ConcessionView {
  readonly group = new THREE.Group();
  private key = '';
  private outline: THREE.LineSegments[] = [];
  private zones: (Concession | null)[] = [];
  private geos: THREE.BufferGeometry[] = [];

  constructor(private world: World) { this.group.name = 'concessions'; }

  /** Pose les bornes de l'âge (refait seulement si l'âge ou la carte change) ; `lit` : les zones à éclairer (0 : l'île de l'allié, 1 : la tête de pont) */
  sync(age: number, lit: { ally: number | null; front: number | null }) {
    const w = this.world, style = styleOf(age), key = `${w.seed}|${w.zoneGen}|${style}`;
    if (key !== this.key && w.isles) {
      this.key = key;
      this.clear();
      this.zones = w.isles.rivals.map((q) => concession(w, q));
      for (const z of this.zones) if (z) this.build(z, style);
    }
    // le liseré doré : le contour de la zone où le bâtiment en main se pose
    this.outline.forEach((l, i) => { l.visible = i === lit.ally || i === lit.front; });
  }

  /** L'index de la zone d'un peuple (pour `sync`) */
  indexOf(people: string) { return this.zones.findIndex((z) => z?.people === people); }

  private build(z: Concession, style: Style) {
    const w = this.world, h = (x: number, zz: number) => w.hAt(x, zz);
    const [gx, gz] = z.gate;
    const edges = z.edges.filter(([x, zz]) => Math.hypot(x - gx, zz - gz) > 1.6);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(1, 1, 1);
    const place = (geo: THREE.BufferGeometry, mat: THREE.Material, list: [number, number, number][], y0 = 0) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach(([x, zz, a], i) => { q.setFromAxisAngle(up, a); m.compose(new THREE.Vector3(x, h(x, zz) + y0, zz), q, s); mesh.setMatrixAt(i, m); });
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.group.add(mesh);
      this.geos.push(geo);
    };
    if (style === 'stone') {
      // une borne toutes les deux cases de bord, un peu penchée au hasard, son chapeau
      const list = edges.filter((_, i) => i % 2 === 0).map(([x, zz, a], i): [number, number, number] => [x, zz, a + ((i * 7) % 5) * 0.12]);
      place(new THREE.CylinderGeometry(0.11, 0.15, 0.5, 6).translate(0, 0.2, 0), MAT.stone, list);
      place(new THREE.ConeGeometry(0.13, 0.12, 6).translate(0, 0.51, 0), MAT.cap, list);
    } else if (style === 'hedge') {
      // la haie taillée, un pied de grille tous les bords, une main courante
      place(new THREE.BoxGeometry(1.02, 0.42, 0.34).translate(0, 0.2, 0), MAT.hedge, edges);
      place(new THREE.BoxGeometry(0.04, 0.62, 0.04).translate(0.5, 0.3, 0.22), MAT.iron, edges);
      place(new THREE.BoxGeometry(1.0, 0.03, 0.03).translate(0, 0.56, 0.22), MAT.iron, edges);
    } else {
      // le mur bas enduit et sa couvertine
      place(new THREE.BoxGeometry(1.02, 0.44, 0.22).translate(0, 0.18, 0), MAT.wall, edges);
      place(new THREE.BoxGeometry(1.06, 0.06, 0.3).translate(0, 0.42, 0), MAT.coping, edges);
    }
    // la porte du passage : deux piliers et une traverse, tournés le long du bord
    const g = new THREE.Group(), pillar = style === 'stone' ? MAT.stone : style === 'hedge' ? MAT.cap : MAT.wall;
    for (const sx of [-1.1, 1.1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.3, 0.34).translate(sx, 0.6, 0), pillar);
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.24, 4).rotateY(Math.PI / 4).translate(sx, 1.36, 0), MAT.cap);
      g.add(p, c);
    }
    g.add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 0.2).translate(0, 1.32, 0), style === 'wall' ? MAT.coping : MAT.iron));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6).translate(0, 1.5, 0), MAT.gold));
    g.position.set(gx, h(gx, gz), gz);
    g.rotation.y = z.gate[2];
    g.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; this.geos.push(o.geometry); } });
    this.group.add(g);
    // le contour, en or, pour la pose
    const pos: number[] = [];
    for (const [x1, z1, x2, z2] of z.outline) pos.push(x1, h(x1, z1) + 0.08, z1, x2, h(x2, z2) + 0.08, z2);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const line = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.95, depthTest: false }));
    line.renderOrder = 5;
    line.visible = false;
    this.outline.push(line);
    this.group.add(line);
    this.geos.push(lg);
  }

  private clear() {
    for (const g of this.geos.splice(0)) g.dispose();
    for (const l of this.outline) (l.material as THREE.Material).dispose();
    this.outline = [];
    this.group.clear();
  }

  dispose() { this.clear(); this.group.removeFromParent(); }
}
