import * as THREE from 'three';
import type { World } from '../world/world';
import type { People } from '../world/archipelago';
import type { Front } from '../sim/campaign';
import { RivalBattle } from '../sim/rivalBattle';

/**
 * Ce qu'on tient sur l'île rivale pendant la campagne (dans la tête de pont, la zone de l'île tournée vers notre île, voir
 * `world/concession.ts`) (voir `sim/campaign.ts`), vu depuis le village : le camp de base et la
 * caserne avancée sur la plage (les modèles de la base des Enfers, à l'âge du village, ceux des vignettes de « Ma base »), et
 * nos drapeaux sur le port et la tour du rempart une fois pris. Leurs places sont celles de la bataille (`RivalBattle.goalAt`),
 * calculées une fois. Les modèles viennent du morceau des Enfers, chargé à la première pose
 */
type Thumb = (id: string, age: number) => { obj: THREE.Object3D; done: () => void } | null;
let thumbMod: Promise<Thumb> | null = null;
const loadThumb = () => (thumbMod ??= import('./hellThumbs').then((m) => m.hellThumb as Thumb));

export class RivalCamp {
  readonly group = new THREE.Group();
  private key = '';
  private spots: Record<'camp' | 'barracks' | 'port' | 'tour', [number, number]> | null = null;
  private done: (() => void)[] = [];

  constructor(private world: World, private rival: People) { this.group.name = 'rivalCamp'; }

  /** Pose ce qui est tenu (refait seulement quand ça change) */
  sync(held: readonly Front[], age: number, fort = false) {
    const key = `${held.join(',')}|${age}|${+fort}`;
    if (key === this.key) return;
    this.key = key;
    if (!held.length) { this.clear(); return; }
    if (!this.spots) this.spots = this.place();
    if (!this.spots) return;
    const spots = this.spots;
    void loadThumb().then((thumb) => {
      if (this.key !== key) return;
      this.clear();
      const put = (id: string, [x, z]: [number, number], rot: number, k = 1) => {
        const t = thumb(id, age);
        if (!t) return;
        t.obj.position.set(x, this.world.hAt(x, z), z);
        t.obj.rotation.y += rot;
        t.obj.scale.setScalar(k);
        this.group.add(t.obj);
        this.done.push(t.done);
      };
      const [cx, cz] = spots.camp, face = Math.atan2(spots.port[0] - cx, spots.port[1] - cz);
      // (le fort bâti dans la tête de pont remplace le camp et la caserne avancée)
      if (!fort) { put('camp', spots.camp, face); put('post', spots.barracks, face); }
      // (les avant-postes pris : notre drapeau, sur un brasero, comme aux Enfers)
      if (held.includes('port')) { put('brazier', spots.port, 0); this.flag(spots.port); }
      if (held.includes('tour')) { put('brazier', spots.tour, 0); this.flag(spots.tour); }
    });
  }

  /** Les places, d'après la bataille (coordonnées du monde) ; null si l'île n'a pas de ville */
  private place() {
    let b: RivalBattle;
    try { b = new RivalBattle(this.world, this.rival, 2, false, [], [], undefined, { kind: 'defend' }); } catch { return null; }
    const w = (p: [number, number]) => b.toWorld(p[0], p[1]);
    const camp = w(b.goalAt.camp), port = w(b.goalAt.port);
    // la caserne à côté du camp, de travers par rapport au chemin du port
    const dx = port[0] - camp[0], dz = port[1] - camp[1], l = Math.hypot(dx, dz) || 1;
    const barracks: [number, number] = [camp[0] - (dz / l) * 2.6, camp[1] + (dx / l) * 2.6];
    return { camp, barracks, port, tour: w(b.goalAt.tour) };
  }

  /** Un mât et notre drapeau (rouge et or, celui du village) */
  private flag([x, z]: [number, number]) {
    const y = this.world.hAt(x, z), g = new THREE.Group();
    const poleGeo = new THREE.CylinderGeometry(0.04, 0.05, 2.2, 6).translate(0, 1.1, 0);
    const clothGeo = new THREE.PlaneGeometry(0.8, 0.5).translate(0.4, 1.9, 0);
    const pole = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.9 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.8, side: THREE.DoubleSide });
    g.add(new THREE.Mesh(poleGeo, pole), new THREE.Mesh(clothGeo, cloth));
    g.position.set(x + 0.6, y, z);
    this.group.add(g);
    this.done.push(() => { poleGeo.dispose(); clothGeo.dispose(); pole.dispose(); cloth.dispose(); });
  }

  private clear() {
    for (const f of this.done.splice(0)) f();
    this.group.clear();
  }

  dispose() { this.clear(); this.group.removeFromParent(); }
}
