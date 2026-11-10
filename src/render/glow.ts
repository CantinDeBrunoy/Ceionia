import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CompileJob, compileNow, representatives } from './precompile';

/**
 * Halo lumineux (bloom) autour des sources très vives : fenêtres, lave, lucioles, éclairs, cristaux du souterrain.
 * De jour, le soleil rend les surfaces claires aussi vives que la lave : le halo ne s'allume que la nuit (et sous terre),
 * et sans halo l'image est rendue directement, sans coût supplémentaire
 */
export class Glow {
  private composer: EffectComposer;
  private pass: RenderPass;
  private bloom: UnrealBloomPass;
  /** les passes de flou, chacune sur un carré, pour compiler leurs shaders d'avance (voir `nightJobs`) */
  private quads: THREE.Scene | null = null;

  constructor(private renderer: THREE.WebGLRenderer) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.pass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0, 0.55, 1.5);
    // un seul point non fini (NaN ou infini : une racine, une puissance d'un nombre négatif dans un voile additif) gagnait, par
    // le flou du halo, toute l'image : l'écran restait vide dès la nuit tombée. Le filtre qui choisit ce qui rayonne écarte ces
    // points et borne l'éclat (le reste de l'image n'en garde, au pire, qu'un pixel)
    const hp = this.bloom.materialHighPassFilter;
    hp.fragmentShader = hp.fragmentShader.replace(/}\s*$/, '  gl_FragColor = any(isnan(gl_FragColor)) || any(isinf(gl_FragColor)) ? vec4(0.0) : min(gl_FragColor, vec4(32.0));\n}');
    hp.needsUpdate = true;
    this.composer.addPass(this.pass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  /**
   * Alloue tout de suite les images où la scène est rendue avant le halo. À faire avant de lancer des compilations : la
   * première allocation interroge le pilote, et cette question attend la fin de toutes les compilations en cours
   */
  allocate() {
    this.renderer.initRenderTarget(this.composer.renderTarget1);
    this.renderer.initRenderTarget(this.composer.renderTarget2);
  }

  /**
   * Les shaders du halo, à compiler d'avance : la scène rendue dans son image (sans correction des tons, en couleurs
   * linéaires : d'autres variantes que celles de l'écran) et ses passes de flou. Sans cela, la première nuit les compilait
   * toutes d'un coup, au premier halo : plusieurs secondes d'image figée. La dernière passe (vers l'écran) ne prend ses
   * réglages qu'au premier rendu : voir `warm`. `objects` : les représentants de la scène, s'ils sont déjà connus
   */
  nightJobs(scene: THREE.Scene, objects = representatives(scene)): CompileJob[] {
    if (!this.quads) {
      const b = this.bloom, plane = new THREE.PlaneGeometry(2, 2);
      this.quads = new THREE.Scene();
      for (const m of [b.materialHighPassFilter, ...b.separableBlurMaterials, b.compositeMaterial, b.blendMaterial]) this.quads.add(new THREE.Mesh(plane, m));
    }
    const target = this.composer.renderTarget1;
    return [{ objects, scene, target, label: '' }, { objects: this.quads.children, scene: this.quads, target, label: '' }];
  }

  /** Lance tout de suite, sans attendre la fin, la compilation des shaders du halo (voir `nightJobs`) */
  precompile(scene: THREE.Scene, camera: THREE.Camera) {
    compileNow(this.renderer, camera, this.nightJobs(scene));
  }

  /** Une image avec le halo, rendue pour de bon (derrière l'écran de chargement) : ses images s'allouent, sa dernière passe se compile */
  warm(scene: THREE.Scene, camera: THREE.Camera) {
    this.render(scene, camera, 0.8, 1.3);
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
