import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Halo lumineux (bloom) autour des sources très vives : fenêtres, lave, lucioles, éclairs, cristaux du souterrain.
 * De jour, le soleil rend les surfaces claires aussi vives que la lave : le halo ne s'allume que la nuit (et sous terre),
 * et sans halo l'image est rendue directement, sans coût supplémentaire
 */
export class Glow {
  private composer: EffectComposer;
  private pass: RenderPass;
  private bloom: UnrealBloomPass;

  constructor(private renderer: THREE.WebGLRenderer) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.pass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0, 0.55, 1.5);
    this.composer.addPass(this.pass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  /** @param strength force du halo (0 = rendu direct) ; @param threshold luminosité à partir de laquelle une surface rayonne */
  render(scene: THREE.Scene, camera: THREE.Camera, strength: number, threshold: number) {
    if (strength < 0.02) { this.renderer.render(scene, camera); return; }
    this.pass.scene = scene;
    this.pass.camera = camera;
    this.bloom.strength = strength;
    this.bloom.threshold = threshold;
    this.composer.render();
  }
}
