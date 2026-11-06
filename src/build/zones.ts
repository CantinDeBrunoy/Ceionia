import * as THREE from 'three';
import { World, N, SEA } from '../world/world';
import { KINDS, KindId } from './catalog';

/**
 * Bâtiments qui ne se posent qu'à des endroits précis (règles de `World.canPlace`) : ce qu'il leur faut, dit au joueur
 * quand la carte n'offre aucun emplacement
 */
export const ZONED: Partial<Record<KindId, string>> = {
  harbor: 'il faut une rive, au bord de la mer ou d’un lac',
  pier: 'il faut une rive, au bord de l’eau',
  mine: 'il faut une montagne',
  alpine: 'il faut une montagne',
  quarry: 'il faut des rochers ou une montagne',
  lumber: 'il faut une forêt',
  outpost: 'il faut une grotte ou une faille',
  oilwell: 'il faut un gisement de pétrole (les taches sombres)',
};

export const isZoned = (kind: KindId) => kind in ZONED;

/** Refus communs à tous les bâtiments : ils ne disent rien de ce qui manque au bâtiment en main */
const GENERIC = new Set(['Hors de la carte', 'Emplacement occupé', 'Une route est déjà ici', 'Devant la porte d’un bâtiment : son chemin passe ici', 'Une grotte ou une faille est ici', 'Un lac est ici', 'Trop proche de l’eau', 'Terrain trop pentu']);

/**
 * Recherche, sur toute la carte, des emplacements où le bâtiment se pose : par tranches (`step`), pour ne pas figer une
 * image. `cells` marque les cases couvertes par au moins une emprise valide ; `origins` compte les emprises valides
 */
export class ZoneScan {
  readonly cells: Uint8Array;
  origins = 0;
  done = false;
  private next = 0;
  private readonly size: number;
  private readonly why = new Map<string, number>();

  constructor(private w: World, readonly kind: KindId) {
    this.size = KINDS[kind].size;
    this.cells = new Uint8Array(N * N);
  }

  /** Examine jusqu'à `budget` emprises ; true quand la carte est entièrement parcourue */
  step(budget: number) {
    const w = this.w, s = this.size, last = N - s;
    while (!this.done && budget-- > 0) {
      const x = this.next % N, z = Math.floor(this.next / N);
      if (z > last) { this.done = true; break; }
      this.next++;
      if (x > last) continue;
      const r = w.canPlace(this.kind, x, z);
      if (r === null) {
        this.origins++;
        for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) this.cells[(z + j) * N + x + i] = 1;
      } else if (!GENERIC.has(r)) this.why.set(r, (this.why.get(r) ?? 0) + 1);
    }
    return this.done;
  }

  /** Message quand il n'y a aucun emplacement : le refus propre au bâtiment le plus fréquent, sinon ce qu'il lui faut */
  emptyMessage(name: string) {
    let best = '', n = 0;
    for (const [r, k] of this.why) if (k > n) { n = k; best = r; }
    const need = ZONED[this.kind] ?? 'la place manque';
    return `Aucun emplacement pour « ${name} » : ${need}.${best ? ` (${best})` : ''}`;
  }
}

/** Toutes les emprises valides (cases d'origine) d'un bâtiment, d'un seul tenant (tests, outils) */
export function zoneOrigins(w: World, kind: KindId): number[] {
  const out: number[] = [], s = KINDS[kind].size;
  for (let z = 0; z + s <= N; z++) for (let x = 0; x + s <= N; x++) if (w.canPlace(kind, x, z) === null) out.push(z * N + x);
  return out;
}

/** Emprises examinées par image : la carte entière en quelques images, sans à-coup */
const BUDGET = 6000;

/**
 * Surbrillance des emplacements possibles du bâtiment en main, quand il ne se pose qu'à des endroits précis (port, mine,
 * bûcheron…) : un seul maillage, posé au ras du sol, qui bat doucement. Calculé à la sélection, refait quand le monde change
 */
export class ZoneHighlight {
  readonly mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private scan: ZoneScan | null = null;
  private kind: KindId | null = null;
  private version = -1;
  private world: World | null = null;
  private t = 0;
  /** dit au joueur qu'il n'y a aucun emplacement (une fois par sélection) */
  onEmpty: ((msg: string) => void) | null = null;
  private warned = false;

  constructor(private getWorld: () => World, scene: THREE.Scene, private nameOf: (k: KindId) => string = (k) => KINDS[k].names.find((n) => n)!) {
    this.mat = new THREE.MeshBasicMaterial({ color: 0x5b9bff, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.renderOrder = 7; this.mesh.visible = false; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /** Bâtiment en main (null : rien en main) ; sans contrainte de terrain, rien ne s'affiche */
  set(kind: KindId | null) {
    if (kind && !isZoned(kind)) kind = null;
    if (kind === this.kind) return;
    this.kind = kind;
    this.scan = null; this.version = -1; this.warned = false;
    this.mesh.visible = false;
  }

  update(dt: number) {
    const kind = this.kind;
    if (!kind) return;
    // le monde a changé : on reprend la recherche (l'ancienne surbrillance reste en attendant)
    const w = this.getWorld();
    if (w !== this.world || w.version !== this.version) { this.world = w; this.version = w.version; this.scan = new ZoneScan(w, kind); }
    const sc = this.scan;
    if (sc && !sc.done && sc.step(BUDGET)) {
      this.build(sc.cells);
      if (!sc.origins && !this.warned && this.onEmpty) { this.warned = true; this.onEmpty(sc.emptyMessage(this.nameOf(kind))); }
    }
    this.t += dt;
    this.mat.opacity = 0.22 + 0.1 * Math.sin(this.t * 2.6);
  }

  /** Une tuile par case, posée sur le relief affiché (quatre petits carreaux : il a deux sous-sommets par case) */
  private build(cells: Uint8Array) {
    const w = this.getWorld();
    let n = 0;
    for (let k = 0; k < cells.length; k++) n += cells[k];
    const pos = new Float32Array(n * 9 * 3), idx = new Uint32Array(n * 24);
    let v = 0, t = 0;
    for (let k = 0; k < cells.length; k++) {
      if (!cells[k]) continue;
      const cx = k % N, cz = Math.floor(k / N);
      // au-dessus de l'eau (le quai du port mord dessus), au ras du sol ailleurs
      const water = w.lake[k] ? w.lakeLevel[k] : SEA;
      const base = v;
      for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) {
        const x = cx + i / 2, z = cz + j / 2;
        pos[v * 3] = x; pos[v * 3 + 1] = Math.max(w.hAt(x, z), water) + 0.05; pos[v * 3 + 2] = z;
        v++;
      }
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const a = base + j * 3 + i, b = a + 1, c = a + 3, d = a + 4;
        idx.set([a, c, b, b, c, d], t); t += 6;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
    this.mesh.visible = n > 0;
  }
}
