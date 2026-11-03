import * as THREE from 'three';
import { World, N, VEG_FOREST, VEG_FIELD, VEG_GARDEN } from '../world/world';
import { hash2 } from '../core/rng';

/** Flaques au plus sur toute la carte */
const MAX_SEEPS = 900;
/** Temps entre deux vérifications du monde (bâtiments posés, relief retouché) */
const CHECK = 0.5;

/**
 * Suintements des gisements de pétrole : flaques de brut noir et luisant, cernées d'un reflet irisé, posées à même le sol
 * (couchées sur la pente) sur les cases du gisement ; elles s'effacent sous les bâtiments, les routes, les arbres et les
 * champs. Le sol même est assombri par TerrainView
 */
export class OilSeeps {
  group = new THREE.Group();
  private pools: THREE.InstancedMesh;
  private rims: THREE.InstancedMesh;
  private glints: THREE.InstancedMesh;
  private key = '';
  private t = 0;

  constructor(private world: World) {
    const pool = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2);
    const rim = new THREE.RingGeometry(0.9, 1.1, 10).rotateX(-Math.PI / 2);
    // le reflet du ciel, vers un bord de la flaque
    const glint = new THREE.CircleGeometry(0.32, 7).rotateX(-Math.PI / 2).scale(1.6, 1, 0.7).translate(-0.3, 0.001, -0.25);
    // le brut : brun très sombre et lisse ; décalé vers la caméra pour ne pas clignoter sur le sol
    const off = (k: number) => ({ polygonOffset: true, polygonOffsetFactor: -k, polygonOffsetUnits: -k });
    const oil = new THREE.MeshStandardMaterial({ color: 0x2a221d, roughness: 0.2, metalness: 0.1, ...off(2) });
    const sheen = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, transparent: true, opacity: 0.45, depthWrite: false, ...off(1) });
    const shine = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.15, transparent: true, opacity: 0.55, depthWrite: false, ...off(3) });
    this.pools = new THREE.InstancedMesh(pool, oil, MAX_SEEPS);
    this.rims = new THREE.InstancedMesh(rim, sheen, MAX_SEEPS);
    this.glints = new THREE.InstancedMesh(glint, shine, MAX_SEEPS);
    for (const m of [this.pools, this.rims, this.glints]) { m.count = 0; m.frustumCulled = false; m.receiveShadow = true; this.group.add(m); }
  }

  /** Refait les flaques quand le monde a changé (bâtiment posé ou démoli, relief retouché) */
  update(dt: number) {
    if ((this.t -= dt) > 0) return;
    this.t = CHECK;
    const w = this.world, key = `${w.version}|${w.visVersion}`;
    if (key === this.key) return;
    this.key = key;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), c = new THREE.Color();
    const pos = new THREE.Vector3(), scale = new THREE.Vector3(), turn = new THREE.Quaternion();
    let n = 0;
    for (let k = 0; k < N * N && n < MAX_SEEPS; k++) {
      if (!w.oil[k] || w.occ[k] || w.road[k]) continue;
      const v = w.veg[k];
      if (v === VEG_FOREST || v === VEG_FIELD || v === VEG_GARDEN) continue;
      const cx = k % N, cz = Math.floor(k / N);
      // une ou deux flaques par case, de taille et de forme variées ; certaines cases n'ont que la terre noire
      const many = hash2(cx, cz, 911);
      if (many < 0.3) continue;
      for (let j = 0; j < (many > 0.75 ? 2 : 1) && n < MAX_SEEPS; j++) {
        const x = cx + 0.2 + hash2(cx, cz, 913 + j) * 0.6, z = cz + 0.2 + hash2(cx, cz, 917 + j) * 0.6;
        const r = 0.05 + hash2(cx, cz, 919 + j) * 0.1, long = 1 + hash2(cx, cz, 921 + j) * 0.7;
        // couchée sur la pente du relief affiché
        const e = 0.12, dx = w.hAt(x + e, z) - w.hAt(x - e, z), dz = w.hAt(x, z + e) - w.hAt(x, z - e);
        nrm.set(-dx / (2 * e), 1, -dz / (2 * e)).normalize();
        q.setFromUnitVectors(up, nrm).multiply(turn.setFromAxisAngle(up, hash2(cx, cz, 923 + j) * Math.PI));
        pos.set(x, w.hAt(x, z) + 0.008, z);
        m.compose(pos, q, scale.set(r * long, 1, r));
        this.pools.setMatrixAt(n, m);
        this.rims.setMatrixAt(n, m);
        this.glints.setMatrixAt(n, m);
        // reflet irisé : du violet au vert d'eau, comme une goutte d'huile sur une flaque
        c.setHSL(0.5 + hash2(cx, cz, 927 + j) * 0.35, 0.45, 0.32);
        this.rims.setColorAt(n, c);
        n++;
      }
    }
    for (const im of [this.pools, this.rims, this.glints]) { im.count = n; im.instanceMatrix.needsUpdate = true; }
    if (this.rims.instanceColor) this.rims.instanceColor.needsUpdate = true;
  }
}
