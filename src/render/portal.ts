import * as THREE from 'three';
import { World } from '../world/world';
import { Parts } from './parts';
import { mats } from './materials';
import { hash2 } from '../core/rng';

/** Pierres de l'arche : basalte presque noir, veiné de violet ; métal des braseros */
const BASALT = 0x35303c, BASALT2 = 0x2a2631, BASALT3 = 0x463e4e, PAVE = 0x5a5560, IRON = 0x4a4448;
/** Ouverture de l'arche (repère du portail : x en travers, y vers le haut, l'arche face à +z) : demi-largeur, bas, naissance du cintre */
const HW = 0.58, Y0 = 0.16, YA = 1.62;
/** Centre du tourbillon, et son rayon (le tourbillon déborde un peu sous le cintre) */
const VC = 1.25, VR = 1.0;
/** Étincelles et volutes de fumée à la fois */
const SPARKS = 28, SMOKE = 10;

/**
 * Le portail des Enfers, au centre de l'île du portail : une arche de basalte sombre sur son dallage, hérissée de cornes,
 * gravée de runes qui luisent ; entre ses piliers, un tourbillon rouge, orangé et violet qui tourne ; deux braseros devant
 * elle ; des étincelles et un peu de fumée. Fermé (avant l'expédition « Le portail de l'autre rive »), le tourbillon n'est
 * qu'une lueur sourde et les braseros sont éteints ; il s'éveille pendant l'expédition, puis brûle pour de bon, surtout la nuit.
 * Coût minimal : trois maillages fixes (pierre, runes, tourbillon), deux flammes et deux nuages de points
 */
export class PortalView {
  group = new THREE.Group();
  private stone: THREE.Mesh;
  private runes: THREE.Mesh;
  private runeMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true });
  private vortex: THREE.Mesh;
  private vortexMat: THREE.ShaderMaterial;
  private flames: THREE.Mesh[] = [];
  private flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.95, 0.3), transparent: true, opacity: 0.95, depthWrite: false });
  private sparks: THREE.Points;
  private smoke: THREE.Points;
  private sparkV = new Float32Array(SPARKS * 4);
  private smokeV = new Float32Array(SMOKE * 4);
  private t = 0;
  /** éveil du portail (0 : fermé, 1 : ouvert), et la valeur visée */
  private wake = 0;
  private key = '';
  /** braseros et tourbillon allumés (les halos de nuit en dépendent) */
  lit = false;

  constructor(private world: World) {
    const p = new Parts();
    // le dallage rond, ses marches, et un cercle de pierres levées
    p.cyl(1.25, 1.35, 0.1, 12, 0, -0.06, 0, PAVE);
    p.cyl(1.05, 1.12, 0.07, 12, 0, 0.04, 0, dark(PAVE, 0.85));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      if (Math.cos(a) > 0.55) continue;
      p.box(0.12, 0.18 + hash2(i, 1, 51) * 0.16, 0.1, Math.sin(a) * 1.22, 0, Math.cos(a) * 1.22, BASALT3, a);
    }
    // les deux piliers : blocs de basalte empilés, un peu de travers
    for (const s of [-1, 1]) {
      let y = 0.1;
      for (let j = 0; j < 5; j++) {
        const h = 0.28 + hash2(j, s, 53) * 0.06, w = 0.36 - j * 0.015 + hash2(j, s, 57) * 0.04;
        p.box(w, h, 0.38, s * (HW + 0.17), y, 0, j % 2 ? BASALT : BASALT2, (hash2(j, s, 59) - 0.5) * 0.12);
        y += h;
      }
      // le socle évasé et la corne qui pointe vers le ciel, au-dessus du pilier
      p.box(0.5, 0.12, 0.5, s * (HW + 0.17), 0.04, 0, BASALT2);
      p.add(new THREE.ConeGeometry(0.09, 0.42, 5).translate(0, 0.21, 0), s * (HW + 0.32), YA + 0.42, 0, BASALT3, 0, false, -s * 0.5);
    }
    // le cintre : des voussoirs en demi-cercle, la clef de voûte cornue
    const N = 9;
    for (let i = 0; i < N; i++) {
      const a = Math.PI * (i + 0.5) / N, x = Math.cos(a) * (HW + 0.17), y = YA + Math.sin(a) * (HW + 0.17);
      p.box(0.34, 0.3, 0.36, x, y - 0.15, 0, i % 2 ? BASALT : BASALT2, 0, false, a - Math.PI / 2);
    }
    p.box(0.3, 0.36, 0.42, 0, YA + HW + 0.06, 0, BASALT3);
    for (const s of [-1, 1]) p.add(new THREE.ConeGeometry(0.06, 0.3, 5).translate(0, 0.15, 0), s * 0.1, YA + HW + 0.36, 0.05, BASALT3, 0, false, -s * 0.35);
    // les braseros de part et d'autre, devant l'arche : trépied de fer et coupe
    for (const s of [-1, 1]) {
      const bx = s * 1.0, bz = 0.75;
      for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; p.add(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 4).translate(0, 0.2, 0), bx + Math.cos(a) * 0.08, 0.04, bz + Math.sin(a) * 0.08, IRON, 0, false, Math.cos(a) * 0.25, Math.sin(a) * 0.25); }
      p.cyl(0.14, 0.07, 0.1, 7, bx, 0.4, bz, IRON);
      p.cyl(0.11, 0.11, 0.02, 7, bx, 0.48, bz, 0x2a1a14);
    }
    const st = p.build();
    this.stone = new THREE.Mesh(st.body, mats.body);
    this.stone.castShadow = true; this.stone.receiveShadow = true;
    this.group.add(this.stone);
    // les runes, gravées sur les deux faces des piliers et du cintre : de petits signes qui luisent
    const r = new Parts();
    for (const s of [-1, 1]) for (const f of [-1, 1]) for (let j = 0; j < 4; j++) {
      const y = 0.4 + j * 0.3, x = s * (HW + 0.17), z = f * 0.195, c = j % 2 ? 0xff5a2a : 0xd040ff;
      r.box(0.1, 0.018, 0.01, x, y + 0.06, z, c);
      r.box(0.018, 0.12, 0.01, x + (hash2(j, s, 61) - 0.5) * 0.06, y, z, c);
      r.box(0.06, 0.018, 0.01, x + (hash2(j, f, 63) - 0.5) * 0.05, y + 0.02 + hash2(s, f, j) * 0.06, z, c, 0.6);
    }
    for (let i = 1; i < 8; i += 2) for (const f of [-1, 1]) {
      const a = Math.PI * (i + 0.5) / 9;
      r.box(0.05, 0.05, 0.01, Math.cos(a) * (HW + 0.17), YA + Math.sin(a) * (HW + 0.17) - 0.15, f * 0.185, 0xff7a3a, a);
    }
    this.runes = new THREE.Mesh(r.build(false).body, this.runeMat);
    this.group.add(this.runes);
    // le tourbillon : l'ouverture de l'arche, peinte par un petit shader (spirales qui tournent, cœur qui palpite)
    const shape = new THREE.Shape();
    shape.moveTo(-HW, Y0); shape.lineTo(HW, Y0); shape.lineTo(HW, YA);
    shape.absarc(0, YA, HW, 0, Math.PI, false);
    shape.lineTo(-HW, Y0);
    this.vortexMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpen: { value: 0 }, uNight: { value: 0 } },
      vertexShader: VORTEX_VS, fragmentShader: VORTEX_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.vortex = new THREE.Mesh(new THREE.ShapeGeometry(shape, 10), this.vortexMat);
    this.vortex.renderOrder = 3;
    this.group.add(this.vortex);
    // les flammes des braseros (une même géométrie)
    const fg = new THREE.ConeGeometry(0.09, 0.32, 6).translate(0, 0.16, 0);
    for (const s of [-1, 1]) { const f = new THREE.Mesh(fg, this.flameMat); f.position.set(s * 1.0, 0.49, 0.75); this.flames.push(f); this.group.add(f); }
    // étincelles qui montent du tourbillon et des braseros, et quelques volutes de fumée
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({ color: new THREE.Color(2, 0.8, 0.3), size: 0.07, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SMOKE * 3), 3));
    this.smoke = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0x6a6070, size: 0.32, transparent: true, opacity: 0.28, depthWrite: false }));
    for (const o of [this.sparks, this.smoke]) { o.frustumCulled = false; this.group.add(o); }
    for (let i = 0; i < SPARKS; i++) this.sparkV[i * 4 + 3] = Math.random();
    for (let i = 0; i < SMOKE; i++) this.smokeV[i * 4 + 3] = Math.random();
    this.group.visible = false;
  }

  /** Les halos de nuit du portail (x, z, rayon, intensité à la suite), quand il est allumé */
  lights(pts: number[]) {
    const p = this.world.portal;
    if (!p || !this.lit) return;
    pts.push(p.x, p.z, 3.4, 1);
    const c = Math.cos(this.group.rotation.y), s = Math.sin(this.group.rotation.y);
    for (const k of [-1, 1]) pts.push(p.x + k * c + 0.75 * s, p.z - k * s + 0.75 * c, 1.2, 0.7);
  }

  /**
   * `open` : le portail est ouvert ; `waking` : l'équipe est en train de l'éveiller (0 … 1) ; `night` : 0 le jour … 1 la nuit.
   * Renvoie vrai quand il vient de s'allumer ou de s'éteindre (les halos sont à refaire)
   */
  update(dt: number, open: boolean, waking: number, night: number): boolean {
    const w = this.world, p = w.portal;
    if (!p) { this.group.visible = false; const was = this.lit; this.lit = false; return was; }
    // posé au centre de l'île, face au continent (le milieu de la carte) ; replacé si le relief change
    const key = `${p.x}|${p.z}|${w.visVersion}`;
    if (key !== this.key) {
      this.key = key;
      this.group.position.set(p.x, w.hAt(p.x, p.z), p.z);
      this.group.rotation.y = Math.atan2(w.n / 2 - p.x, w.n / 2 - p.z);
      this.group.visible = true;
    }
    this.t += dt;
    const goal = open ? 1 : Math.max(0, Math.min(1, waking));
    this.wake += (goal - this.wake) * Math.min(1, dt * 1.5);
    const k = this.wake, flick = 0.85 + 0.1 * Math.sin(this.t * 9.1) * Math.sin(this.t * 5.3) + 0.05 * Math.sin(this.t * 23);
    this.vortexMat.uniforms.uTime.value = this.t;
    this.vortexMat.uniforms.uOpen.value = k;
    this.vortexMat.uniforms.uNight.value = night;
    this.vortex.scale.setScalar(1 + Math.sin(this.t * 2.2) * 0.012 * k);
    // les runes : à peine visibles fermé, elles palpitent une fois le portail éveillé, plus vives la nuit
    this.runeMat.color.setScalar((0.25 + 0.75 * k) * (0.7 + 0.3 * Math.sin(this.t * 2.6)) * (1 + night * 0.9));
    // les braseros s'allument à l'éveil
    const fire = Math.min(1, k * 1.6);
    for (const [i, f] of this.flames.entries()) {
      f.visible = fire > 0.05;
      f.scale.set(fire * (0.9 + 0.15 * Math.sin(this.t * 13 + i * 2)), fire * flick * (0.9 + 0.2 * Math.sin(this.t * 7.7 + i)), fire * (0.9 + 0.15 * Math.cos(this.t * 11 + i)));
    }
    this.stepParticles(dt, k);
    const lit = k > 0.5;
    if (lit !== this.lit) { this.lit = lit; return true; }
    return false;
  }

  /** Étincelles (du tourbillon et des braseros, de plus en plus nombreuses à l'éveil) et fumée des braseros */
  private stepParticles(dt: number, k: number) {
    const sp = this.sparks.geometry.attributes.position as THREE.BufferAttribute, sv = this.sparkV;
    for (let i = 0; i < SPARKS; i++) {
      let life = sv[i * 4 + 3] + dt * (0.5 + hash2(i, 3, 71) * 0.4);
      if (life >= 1) {
        life = 0;
        // un tiers jaillit des braseros, le reste du tourbillon
        const fromFire = i % 3 === 0, s = i % 2 ? 1 : -1;
        sv[i * 4] = fromFire ? s * 1.0 : (Math.random() - 0.5) * HW * 1.6;
        sv[i * 4 + 1] = fromFire ? 0.6 : VC + (Math.random() - 0.5) * 1.0;
        sv[i * 4 + 2] = fromFire ? 0.75 : 0.05 + Math.random() * 0.1;
      }
      sv[i * 4 + 3] = life;
      // elles montent en tourbillonnant ; fermé, presque aucune
      const on = i < SPARKS * (0.15 + 0.85 * k) ? 1 : 0;
      const x = sv[i * 4] + Math.sin(life * 9 + i) * 0.08, y = sv[i * 4 + 1] + life * (0.9 + (i % 5) * 0.12), z = sv[i * 4 + 2] + life * 0.4;
      sp.setXYZ(i, x, on ? y : -50, z);
    }
    sp.needsUpdate = true;
    (this.sparks.material as THREE.PointsMaterial).opacity = 0.35 + 0.6 * k;
    const mp = this.smoke.geometry.attributes.position as THREE.BufferAttribute, mv = this.smokeV;
    for (let i = 0; i < SMOKE; i++) {
      let life = mv[i * 4 + 3] + dt * 0.18;
      if (life >= 1) life = 0;
      mv[i * 4 + 3] = life;
      const s = i % 2 ? 1 : -1;
      mp.setXYZ(i, s * 1.0 + Math.sin(life * 4 + i) * 0.15 + life * 0.3, k > 0.3 ? 0.7 + life * 1.6 : -50, 0.75 + life * 0.2);
    }
    mp.needsUpdate = true;
  }
}

/** Assombrit une couleur */
function dark(c: number, k: number) {
  const r = ((c >> 16) & 255) * k, g = ((c >> 8) & 255) * k, b = (c & 255) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

const VORTEX_VS = /* glsl */ `
varying vec2 vP;
void main() {
  vP = vec2(position.x, position.y - ${VC.toFixed(2)}) / ${VR.toFixed(2)};
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Spirales qui tournent vers le cœur, du violet au rouge, des filets orangés, un cœur clair qui palpite ; fermé : une lueur sourde */
const VORTEX_FS = /* glsl */ `
uniform float uTime;
uniform float uOpen;
uniform float uNight;
varying vec2 vP;
void main() {
  float r = length(vP), a = atan(vP.y, vP.x);
  float spin = uTime * (0.6 + 2.2 * uOpen);
  float b1 = 0.5 + 0.5 * sin(a * 3.0 + r * 10.0 - spin * 2.0);
  float b2 = 0.5 + 0.5 * sin(a * 5.0 - r * 16.0 + spin * 1.3);
  vec3 violet = vec3(0.42, 0.1, 0.72), red = vec3(1.0, 0.16, 0.08), orange = vec3(1.0, 0.58, 0.14);
  vec3 c = mix(violet, red, b1);
  c = mix(c, orange, pow(b2, 4.0) * 0.7);
  float core = smoothstep(0.5, 0.0, r) * (0.8 + 0.2 * sin(uTime * 3.0));
  c += vec3(1.0, 0.8, 0.5) * core * uOpen;
  // fermé : un voile violet sombre, à peine animé
  vec3 shut = vec3(0.12, 0.05, 0.18) * (0.7 + 0.3 * b1);
  c = mix(shut, c * (1.0 + uNight * 1.4), uOpen);
  float alpha = mix(0.75, 0.95, uOpen) * smoothstep(1.25, 0.9, r);
  gl_FragColor = vec4(c, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
