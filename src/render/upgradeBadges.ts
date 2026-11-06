import * as THREE from 'three';
import { World } from '../world/world';
import { KINDS, UPGRADES, sizeOf, lineOf } from '../build/catalog';
import { priceIn, canPay } from '../sim/economy';

/** La pastille : un disque doré et sa flèche vers le haut, dessinés une fois pour toutes */
function badgeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f2a900';
  g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(32, 46); g.lineTo(32, 20); g.moveTo(20, 31); g.lineTo(32, 19); g.lineTo(44, 31); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Pastilles « ⬆ » au-dessus des bâtiments qui peuvent évoluer et dont l'amélioration est payable : un seul nuage de points
 * (toujours tournés vers la caméra), recalculé seulement quand le village, l'âge ou la réserve changent ; la pastille bat doucement
 */
export class UpgradeBadges {
  points: THREE.Points;
  private mat: THREE.PointsMaterial;
  private key = '';
  private t = 0;
  /** nombre de bâtiments qui peuvent évoluer (pour les tests) */
  count = 0;
  /** masquées par le joueur (réglages) */
  hidden = false;

  constructor(private world: World) {
    this.mat = new THREE.PointsMaterial({ map: badgeTexture(), size: 0.9, sizeAttenuation: true, transparent: true, alphaTest: 0.2, depthWrite: false });
    this.points = new THREE.Points(new THREE.BufferGeometry(), this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 12;
    this.points.visible = false;
  }

  /** Les bâtiments qu'on peut améliorer maintenant : une amélioration connue à cet âge, débloquée, et de quoi la payer */
  static upgradable(w: World, age: number) {
    const out: { x: number; y: number; z: number }[] = [];
    for (const b of w.buildings.values()) {
      for (const u of UPGRADES) {
        if (u.from !== b.kind) continue;
        const to = KINDS[u.to];
        if (age < to.minAge || (to.reqMission && !w.exp.done.includes(to.reqMission))) continue;
        if (to.reqKind && ![...w.buildings.values()].some((o) => lineOf(to.reqKind!).includes(o.kind))) continue;
        if (!canPay(w, priceIn(w, u.to, age))) continue;
        const s = sizeOf(b);
        out.push({ x: b.x + s / 2, y: w.flatTarget(b.x, b.z, s) + 1.3 + s * 0.55, z: b.z + s / 2 });
        break;
      }
    }
    return out;
  }

  /** À chaque image : la pastille bat ; les positions ne se refont que si quelque chose a changé */
  update(dt: number, age: number) {
    const w = this.world;
    const key = `${w.version}|${age}|${Math.floor(w.wood)}|${Math.floor(w.stone)}|${Math.floor(w.brick)}|${w.exp.done.length}`;
    if (key !== this.key) {
      this.key = key;
      const list = UpgradeBadges.upgradable(w, age), pos = new Float32Array(list.length * 3);
      list.forEach((p, i) => pos.set([p.x, p.y, p.z], i * 3));
      this.points.geometry.dispose();
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.points.geometry = g;
      this.count = list.length;
    }
    this.points.visible = !this.hidden && this.count > 0;
    this.t += dt;
    this.mat.size = 0.85 + 0.12 * Math.sin(this.t * 3.2);
  }
}
