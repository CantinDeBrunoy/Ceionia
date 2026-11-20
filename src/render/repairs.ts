import * as THREE from 'three';
import { World } from '../world/world';
import { sizeOf } from '../build/catalog';
import { Puffs } from './particles';

const MAX = 480;
const WOOD = new THREE.Color(0.55, 0.4, 0.24), PLANK = new THREE.Color(0.7, 0.55, 0.34), RUBBLE = new THREE.Color(0.56, 0.53, 0.5);
const DUST = new THREE.Color(0.72, 0.66, 0.56);

/**
 * Les bâtiments abîmés (crue, séisme) : un échafaudage de perches et de planches contre leurs murs, quelques gravats au pied,
 * un peu de poussière tant que durent les réparations. Le décor seulement : la règle est dans `World.damaged` et `Sim`
 */
export class RepairsView {
  group = new THREE.Group();
  /** haut du modèle du bâtiment (y monde) ; sans lui, une hauteur forfaitaire */
  top: ((id: number) => number | null) | null = null;
  private poles: THREE.InstancedMesh;
  private stones: THREE.InstancedMesh;
  private dust = new Puffs(120, 0);
  private dummy = new THREE.Object3D();
  private key = '';

  constructor(private world: World) {
    const mat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 });
    this.poles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, MAX);
    this.stones = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), mat, MAX);
    for (const m of [this.poles, this.stones]) {
      m.setColorAt(0, WOOD);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true;
    }
    this.group.add(this.poles, this.stones, this.dust.mesh);
  }

  /** Échafaudages à refaire quand la liste des bâtiments abîmés change (ou qu'ils bougent) ; `dt` : la poussière */
  update(dt: number) {
    const w = this.world, list = [...w.damaged.keys()].map((id) => w.buildings.get(id)).filter((b) => !!b);
    const key = list.map((b) => `${b!.id}:${b!.x},${b!.z},${b!.age}`).join('|');
    if (key !== this.key) {
      this.key = key;
      const d = this.dummy;
      let p = 0, s = 0;
      for (const b of list) {
        const sz = sizeOf(b!), x0 = b!.x, z0 = b!.z, g = w.h(x0, z0), top = Math.max(g + 0.35, Math.min(g + 1.6, this.top?.(b!.id) ?? g + 0.6));
        const h = top - g, side = (b!.id % 4), seed = b!.id * 7.13;
        // l'échafaudage sur un côté : trois perches, deux planches en travers, une échelle de perches en biais
        const along = side % 2 === 0, out = side < 2 ? -0.06 : sz + 0.06;
        const put = (m: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz2: number, rz: number, col: THREE.Color) => {
          d.position.set(x, y, z); d.rotation.set(0, 0, 0); d.scale.set(sx, sy, sz2);
          if (along) d.rotation.z = rz; else d.rotation.x = rz;
          d.updateMatrix(); m.setMatrixAt(i, d.matrix); m.setColorAt(i, col);
        };
        for (let i = 0; i < 3 && p < MAX - 6; i++) {
          const u = 0.1 + (i / 2) * (sz - 0.2);
          put(this.poles, p++, along ? x0 + u : x0 + out, g + h * 0.5, along ? z0 + out : z0 + u, 0.035, h, 0.035, 0, WOOD);
        }
        for (const f of [0.45, 0.85]) {
          if (p >= MAX - 2) break;
          put(this.poles, p++, along ? x0 + sz / 2 : x0 + out, g + h * f, along ? z0 + out : z0 + sz / 2, along ? sz - 0.1 : 0.1, 0.02, along ? 0.1 : sz - 0.1, 0, PLANK);
        }
        if (p < MAX) put(this.poles, p++, along ? x0 + sz * 0.5 : x0 + out, g + h * 0.45, along ? z0 + out : z0 + sz * 0.5, 0.03, h * 1.05, 0.03, 0.5 * Math.sin(seed), WOOD);
        // les gravats au pied du mur d'en face
        for (let i = 0; i < 4 && s < MAX; i++) {
          const a = seed + i * 1.9, r = 0.05 + 0.04 * ((i * 37) % 3);
          d.position.set(x0 + sz / 2 + Math.cos(a) * (sz * 0.55), g + r * 0.4, z0 + sz / 2 + Math.sin(a) * (sz * 0.55));
          d.rotation.set(a, a * 2, 0); d.scale.set(r * 2, r * 1.3, r * 1.7); d.updateMatrix();
          this.stones.setMatrixAt(s, d.matrix); this.stones.setColorAt(s++, RUBBLE);
        }
      }
      this.poles.count = p; this.stones.count = s;
      for (const m of [this.poles, this.stones]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    }
    // la poussière des travaux
    for (const b of list) {
      if (Math.random() > dt * 0.8) continue;
      const sz = sizeOf(b!), g = w.h(b!.x, b!.z);
      this.dust.spawn(b!.x + Math.random() * sz, g + 0.1, b!.z + Math.random() * sz, 0, 0.25, 0, 0.12, 2.2, DUST, 0, { grow: 2.6, drag: 0.4, wind: 0.3, alpha: 0.5 });
    }
    this.dust.update(dt);
  }

  /** Un nuage de poussière d'un coup autour d'un bâtiment (séisme, l'eau qui le frappe) */
  burst(x: number, z: number, s: number, col = DUST) {
    const g = this.world.h(Math.floor(x), Math.floor(z));
    for (let i = 0; i < 10; i++) this.dust.spawn(x + (Math.random() - 0.5) * s, g + 0.1, z + (Math.random() - 0.5) * s, (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.3, (Math.random() - 0.5) * 0.6, 0.18, 2.5, col, 0, { grow: 3, drag: 0.5, wind: 0.2, alpha: 0.6 });
  }
}
