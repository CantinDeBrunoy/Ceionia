import * as THREE from 'three';
import { World, N, SEA } from '../world/world';
import { KINDS, KindId } from './catalog';
import { tr } from '../i18n';

/**
 * Bâtiments qui ne se posent qu'à des endroits précis (règles de `World.canPlace`) : ce qu'il leur faut, dit au joueur
 * quand la carte n'offre aucun emplacement
 */
export const ZONED: Partial<Record<KindId, string>> = {
  harbor: 'il faut une rive, au bord de la mer ou d’un lac',
  pier: 'il faut une rive, au bord de l’eau',
  shipyard: 'il faut de l’eau (mer ou lac) à moins de 5 cases',
  lighthouse: 'il faut de l’eau (mer ou lac) à moins de 5 cases',
  fishmarket: 'il faut de l’eau (mer ou lac) à moins de 5 cases',
  offshore: 'il faut de l’eau (mer ou lac) à moins de 5 cases',
  mine: 'il faut une montagne',
  alpine: 'il faut une grosse montagne',
  quarry: 'il faut des rochers ou une montagne',
  lumber: 'il faut une forêt',
  oilwell: 'il faut un gisement de pétrole (les taches sombres)',
  // les défenses : seulement sur l'île du portail, une fois le portail ouvert
  watchtower: 'il faut l’île du portail, une fois le portail ouvert',
  barracks: 'il faut l’île du portail, une fois le portail ouvert',
};

export const isZoned = (kind: KindId) => kind in ZONED;

/** Refus communs à tous les bâtiments : ils ne disent rien de ce qui manque au bâtiment en main */
const GENERIC = new Set(['Hors de la carte', 'Emplacement occupé', 'Une route est déjà ici', 'Devant la porte d’un bâtiment : son chemin passe ici', 'Une grotte ou une faille est ici', 'Un lac est ici', 'Trop proche de l’eau : reculez sur la terre ferme', 'Terrain trop pentu']);

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
    const need = tr(ZONED[this.kind] ?? 'la place manque');
    return tr('Aucun emplacement pour « {name} » : {need}.', { name, need }) + (best ? ` (${tr(best)})` : '');
  }
}

/** Toutes les emprises valides (cases d'origine) d'un bâtiment, d'un seul tenant (tests, outils) */
export function zoneOrigins(w: World, kind: KindId): number[] {
  const out: number[] = [], s = KINDS[kind].size;
  for (let z = 0; z + s <= N; z++) for (let x = 0; x + s <= N; x++) if (w.canPlace(kind, x, z) === null) out.push(z * N + x);
  return out;
}

/** Emprises examinées par image : la carte entière en une dizaine d'images, sans à-coup */
const BUDGET = 3000;

/**
 * Surbrillance des emplacements possibles du bâtiment en main, quand il ne se pose qu'à des endroits précis (port, mine,
 * bûcheron…) : un voile doré posé au ras du sol, cerné d'un liseré, qui bat doucement (un maillage et un tracé pour toute la
 * carte). Calculé à la sélection, refait seulement quand le monde change
 */
export class ZoneHighlight {
  readonly mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private edge: THREE.LineSegments;
  private edgeMat: THREE.LineBasicMaterial;
  private scan: ZoneScan | null = null;
  private kind: KindId | null = null;
  private green = false;
  private version = -1;
  private world: World | null = null;
  private t = 0;
  /** dit au joueur qu'il n'y a aucun emplacement (une fois par sélection) */
  onEmpty: ((msg: string) => void) | null = null;
  private warned = false;

  constructor(private getWorld: () => World, scene: THREE.Scene, private nameOf: (k: KindId) => string = (k) => KINDS[k].names.find((n) => n)!) {
    // doré : il ne se confond ni avec l'eau ni avec l'herbe
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffd45a, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.renderOrder = 7; this.mesh.visible = false; this.mesh.frustumCulled = false;
    this.edgeMat = new THREE.LineBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.85, depthWrite: false });
    this.edge = new THREE.LineSegments(new THREE.BufferGeometry(), this.edgeMat);
    this.edge.renderOrder = 7; this.edge.frustumCulled = false;
    this.mesh.add(this.edge);
    scene.add(this.mesh);
  }

  /** Bâtiment en main (null : rien en main) ; sans contrainte de terrain, rien ne s'affiche. `green` : voile vert (bûcheron, pierrier) */
  set(kind: KindId | null, green = false) {
    if (kind && !isZoned(kind)) kind = null;
    if (kind === this.kind && green === this.green) return;
    this.kind = kind;
    this.green = green;
    this.mat.color.setHex(green ? 0x35e070 : 0xffd45a);
    this.edgeMat.color.setHex(green ? 0xc4ffd6 : 0xfff1b0);
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
    const p = 0.5 + 0.5 * Math.sin(this.t * 2.6);
    this.mat.opacity = 0.2 + 0.14 * p;
    this.edgeMat.opacity = 0.55 + 0.4 * p;
  }

  /** Une tuile par case, posée sur le relief affiché (quatre petits carreaux : il a deux sous-sommets par case) ; le liseré suit le bord des zones */
  private build(cells: Uint8Array) {
    const w = this.getWorld();
    // au-dessus de l'eau (le quai du port mord dessus), au ras du sol ailleurs
    const y = (x: number, z: number, k: number) => Math.max(w.hAt(x, z), w.lake[k] ? w.lakeLevel[k] : SEA) + 0.05;
    const on = (x: number, z: number) => x >= 0 && z >= 0 && x < N && z < N && cells[z * N + x] === 1;
    let n = 0, e = 0;
    for (let k = 0; k < cells.length; k++) if (cells[k]) {
      n++;
      const x = k % N, z = Math.floor(k / N);
      e += +!on(x - 1, z) + +!on(x + 1, z) + +!on(x, z - 1) + +!on(x, z + 1);
    }
    const pos = new Float32Array(n * 9 * 3), idx = new Uint32Array(n * 24), line = new Float32Array(e * 4 * 3);
    let v = 0, t = 0, l = 0;
    const seg = (x0: number, z0: number, x1: number, z1: number, k: number) => {
      // deux traits par côté de case, par le milieu : il épouse le relief
      const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2;
      for (const [ax, az, bx, bz] of [[x0, z0, xm, zm], [xm, zm, x1, z1]]) {
        line.set([ax, y(ax, az, k) + 0.02, az, bx, y(bx, bz, k) + 0.02, bz], l); l += 6;
      }
    };
    for (let k = 0; k < cells.length; k++) {
      if (!cells[k]) continue;
      const cx = k % N, cz = Math.floor(k / N);
      const base = v;
      for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) {
        const x = cx + i / 2, z = cz + j / 2;
        pos[v * 3] = x; pos[v * 3 + 1] = y(x, z, k); pos[v * 3 + 2] = z;
        v++;
      }
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const a = base + j * 3 + i, b = a + 1, c = a + 3, d = a + 4;
        idx.set([a, c, b, b, c, d], t); t += 6;
      }
      if (!on(cx - 1, cz)) seg(cx, cz, cx, cz + 1, k);
      if (!on(cx + 1, cz)) seg(cx + 1, cz, cx + 1, cz + 1, k);
      if (!on(cx, cz - 1)) seg(cx, cz, cx + 1, cz, k);
      if (!on(cx, cz + 1)) seg(cx, cz + 1, cx + 1, cz + 1, k);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(line, 3));
    this.edge.geometry.dispose();
    this.edge.geometry = lg;
    this.mesh.visible = n > 0;
  }
}
