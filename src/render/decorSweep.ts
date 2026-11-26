import * as THREE from 'three';

/**
 * Le décor au sol que la base rase (cristaux, rochers, ronces, crânes… des Enfers) : chaque instance est rangée par les cases
 * qu'elle touche. Un mur ou un bâtiment posé fait disparaître ce qui se tenait sur ses cases (`clear`, pour de bon), et l'aperçu
 * d'un tracé le cache le temps du survol (`peek`), pour montrer le mur tel qu'il sera. Comme la végétation rasée au village :
 * rien ne repousse
 */
interface Inst { mesh: THREE.InstancedMesh; i: number; m: THREE.Matrix4; cells: number[] }

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
/** Ce qui dépasse du centre d'une instance encore compté sur la case voisine (cases) */
const PAD = 0.3;

export class DecorSweep {
  private byCell = new Map<number, Inst[]>();
  private gone = new Set<number>();
  private peeked = new Set<number>();

  constructor(readonly W: number) {}

  /** Range les instances d'un maillage (leurs centres, `pad` cases de débord) */
  add(mesh: THREE.InstancedMesh, pad = PAD) {
    const m = new THREE.Matrix4(), p = new THREE.Vector3();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      const cells = new Set<number>();
      for (const dx of [-pad, pad]) for (const dz of [-pad, pad]) cells.add(Math.floor(p.z + dz) * this.W + Math.floor(p.x + dx));
      const it: Inst = { mesh, i, m: m.clone(), cells: [...cells] };
      for (const c of it.cells) { let l = this.byCell.get(c); if (!l) this.byCell.set(c, (l = [])); l.push(it); }
    }
  }

  /** Les cases rasées pour de bon (un bâtiment s'y tient) */
  clear(cells: Iterable<number>) {
    const touched: Inst[] = [];
    for (const c of cells) if (!this.gone.has(c)) { this.gone.add(c); touched.push(...(this.byCell.get(c) ?? [])); }
    this.show(touched);
  }

  /** Les cases que l'aperçu cache (le reste réapparaît) */
  peek(cells: Iterable<number>) {
    const next = new Set(cells), touched: Inst[] = [];
    for (const c of this.peeked) if (!next.has(c)) touched.push(...(this.byCell.get(c) ?? []));
    for (const c of next) if (!this.peeked.has(c)) touched.push(...(this.byCell.get(c) ?? []));
    this.peeked = next;
    this.show(touched);
  }

  /** Une instance est cachée (pour l'écran et les essais) */
  hidden(cell: number) { return this.gone.has(cell) || this.peeked.has(cell); }
  /** Nombre d'instances rangées sur une case */
  count(cell: number) { return this.byCell.get(cell)?.length ?? 0; }

  private show(list: Inst[]) {
    const dirty = new Set<THREE.InstancedMesh>();
    for (const it of list) {
      const off = it.cells.some((c) => this.gone.has(c) || this.peeked.has(c));
      it.mesh.setMatrixAt(it.i, off ? ZERO : it.m);
      dirty.add(it.mesh);
    }
    for (const m of dirty) m.instanceMatrix.needsUpdate = true;
  }
}
