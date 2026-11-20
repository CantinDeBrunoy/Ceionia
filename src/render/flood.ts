import * as THREE from 'three';
import { World, N } from '../world/world';
import { Puffs } from './particles';
import type { FloodSite } from '../sim/calamity';

/** Sommets par côté de case de la nappe (2 : une petite houle facettée) */
const RES = 2;
const MUD = new THREE.Color(0.47, 0.39, 0.26), MUD_DEEP = new THREE.Color(0.36, 0.32, 0.22), FOAM = new THREE.Color(0.86, 0.82, 0.72);
const MAX_V = 9000;

/**
 * La nappe d'une crue : une eau boueuse, facettée comme le reste du décor, qui recouvre les cases noyées et le tronçon de
 * rivière qui déborde. Elle monte de son niveau à `level + rise × k` ; sur ses bords, elle plonge sous le sol ou sous la
 * rivière (pas de bord suspendu). De l'écume naît au front de l'eau. Rien de logique ici : la crue est menée par `Calamities`
 */
export class FloodView {
  group = new THREE.Group();
  private mesh: THREE.Mesh;
  private geo = new THREE.BufferGeometry();
  private pos = new Float32Array(MAX_V * 3);
  private col = new Float32Array(MAX_V * 3);
  /** par sommet : x, z, sol, bord (1 : le sommet touche une case hors de la nappe) */
  private verts: { x: number; z: number; ground: number; edge: boolean }[] = [];
  private foam = new Puffs(160, 0);
  private site: FloodSite | null = null;
  private t = 0;

  constructor(private world: World) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setIndex(new THREE.BufferAttribute(new Uint32Array(MAX_V * 6), 1));
    this.geo.setDrawRange(0, 0);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.3, metalness: 0.05, transparent: true, opacity: 0.86, depthWrite: false });
    this.mesh = new THREE.Mesh(this.geo, mat);
    // visible dès le départ (rien à dessiner) : son programme se compile au chargement, pas à la première crue
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.group.add(this.mesh, this.foam.mesh);
  }

  /** La crue à dessiner (null : plus rien) */
  set(site: FloodSite | null) {
    this.site = site;
    this.verts = [];
    if (!site) { this.geo.setDrawRange(0, 0); return; }
    const w = this.world, inSheet = new Set([...site.cells, ...site.water]);
    const vid = new Map<number, number>(), idx: number[] = [];
    const W = N * RES + 1;
    const vert = (gx: number, gz: number) => {
      const key = gz * W + gx;
      let i = vid.get(key);
      if (i !== undefined) return i;
      i = this.verts.length;
      if (i >= MAX_V) return -1;
      const x = gx / RES, z = gz / RES;
      // un sommet est au bord s'il touche une case hors de la nappe
      // (sur une ligne de la grille des cases, il touche les deux cases de part et d'autre ; entre deux, une seule)
      const cols = gx % RES ? [Math.floor(x)] : [x - 1, x], rows = gz % RES ? [Math.floor(z)] : [z - 1, z];
      let edge = false;
      for (const cx of cols) for (const cz of rows) if (!w.inCells(cx, cz) || !inSheet.has(cz * N + cx)) edge = true;
      this.verts.push({ x, z, ground: w.hAt(x, z), edge });
      vid.set(key, i);
      return i;
    };
    for (const k of inSheet) {
      const cx = k % N, cz = Math.floor(k / N);
      for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
        const gx = cx * RES + i, gz = cz * RES + j;
        const a = vert(gx, gz), b = vert(gx + 1, gz), c = vert(gx, gz + 1), d = vert(gx + 1, gz + 1);
        if (a < 0 || b < 0 || c < 0 || d < 0) continue;
        idx.push(a, c, b, b, c, d);
      }
    }
    const ix = this.geo.index!.array as Uint32Array;
    ix.set(idx.slice(0, ix.length));
    this.geo.index!.needsUpdate = true;
    this.geo.setDrawRange(0, Math.min(idx.length, ix.length));
    for (let i = 0; i < this.verts.length; i++) {
      const v = this.verts[i], c = v.edge ? FOAM : (Math.sin(v.x * 1.7 + v.z * 2.3) > 0.3 ? MUD_DEEP : MUD);
      this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    }
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.update(0, 0);
  }

  /**
   * `k` : part de la montée (0 l'eau à son niveau … 1 à son plus haut) ; `dt` : temps réel (houle, écume). L'eau s'avance d'une
   * case basse à l'autre : un sommet n'est sous l'eau que si son sol est sous la nappe
   */
  update(dt: number, k: number) {
    this.t += dt;
    const s = this.site;
    if (!s) { this.foam.update(dt); return; }
    const top = s.level + 0.6 * k;
    for (let i = 0; i < this.verts.length; i++) {
      const v = this.verts[i];
      const wave = 0.025 * Math.sin(this.t * 1.6 + v.x * 2.1 + v.z * 1.3) + 0.015 * Math.sin(this.t * 2.7 - v.x * 1.2 + v.z * 2.6);
      // au bord : sous le sol (ou sous la rivière), la nappe s'y enfonce
      const y = v.edge ? Math.min(top, Math.max(s.level, v.ground) - 0.04) : top + wave * Math.min(1, k * 4);
      this.pos[i * 3] = v.x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = v.z;
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.geo.computeVertexNormals();
    // l'écume au front de l'eau : là où la nappe affleure le sol
    if (k > 0.05 && this.verts.length) for (let n = 0; n < 3; n++) {
      if (Math.random() > dt * 8) continue;
      const v = this.verts[Math.floor(Math.random() * this.verts.length)];
      if (Math.abs(v.ground - top) > 0.15 || v.ground < s.level) continue;
      this.foam.spawn(v.x, top + 0.02, v.z, (Math.random() - 0.5) * 0.2, 0.05, (Math.random() - 0.5) * 0.2, 0.09, 1.6, FOAM, 0, { grow: 1.8, drag: 0.8, wind: 0.05, alpha: 0.7 });
    }
    this.foam.update(dt);
  }
}
