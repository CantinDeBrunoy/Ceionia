import * as THREE from 'three';
import { SEA } from '../world/world';

/** L'ancre dessinée une fois (pastille dorée cerclée de blanc) */
function anchorTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffd45a'; g.strokeStyle = '#fff6d8'; g.lineWidth = 8;
  g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.fill(); g.stroke();
  g.font = '72px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#3a2a10';
  g.fillText('⚓', 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * La balise d'un emplacement à viser (le port chez l'allié) : une colonne de lumière dorée qui monte de la rive et une
 * ancre qui flotte au-dessus, qui bat doucement. Se voit de loin, par-dessus le relief ; `show` la pose, `hide` l'ôte
 */
export class SpotBeacon {
  readonly group = new THREE.Group();
  private beam: THREE.Mesh;
  private beamMat: THREE.MeshBasicMaterial;
  private pin: THREE.Sprite;
  private t = 0;

  constructor() {
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xffd45a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    // (ouverte en haut et en bas, plus large au pied)
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.3, 9, 16, 1, true), this.beamMat);
    this.beam.position.y = 4.5;
    this.pin = new THREE.Sprite(new THREE.SpriteMaterial({ map: anchorTex(), depthTest: false, transparent: true }));
    this.pin.scale.setScalar(2.6);
    this.pin.renderOrder = 9;
    this.group.add(this.beam, this.pin);
    this.group.visible = false;
  }

  /** Pose la balise au point (x, z) du monde, au-dessus du sol `y` (la mer au moins) */
  show(x: number, z: number, y: number) {
    this.group.position.set(x, Math.max(y, SEA), z);
    this.group.visible = true;
  }

  hide() { this.group.visible = false; }

  update(dt: number) {
    if (!this.group.visible) return;
    this.t += dt;
    const p = 0.5 + 0.5 * Math.sin(this.t * 2.6);
    this.beamMat.opacity = 0.22 + 0.2 * p;
    this.pin.position.y = 5 + Math.sin(this.t * 1.8) * 0.4;
  }
}
