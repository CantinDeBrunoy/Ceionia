import * as THREE from 'three';
import { World, N, BIOME_TAIGA, SNOW_LINE } from '../world/world';
import { GameTime } from '../core/time';
import { mulberry32, smoothstep } from '../core/rng';
import { tr } from '../i18n';
import { Environment } from './env';
import { MeteorKind, NightShow, meteorRate, nightOf, nightShow } from '../core/skyNights';

/** Rayon de la coupole du ciel de nuit, centrée sur la caméra : bien au-delà de l'île, qui la cache là où elle passe devant */
const SKY_R = 900;
/** Hauteur (angle, en radians) de la bande où flottent les voiles d'aurore, au-dessus du bord de l'île */
const AURORA_H = 0.36;
/** Segments de la bande d'aurore sur le tour de l'horizon, et sur sa hauteur */
const AURORA_SEG = 160, AURORA_ROWS = 4;
/** Étoiles filantes en vol au plus */
const METEOR_MAX = 24;
/** Le bord de l'île vu de loin : un cercle autour du milieu de la carte (rayon en part du côté), au niveau de la mer */
const RIM = 0.6;
/** Lueur de l'aurore sur le paysage et sur le fond du ciel */
const AURORA_TINT = new THREE.Color(0.35, 1, 0.7), AURORA_SKY = new THREE.Color(0.1, 0.32, 0.3);
/** Teintes des étoiles filantes : surtout blanches, parfois vertes, orangées ou bleutées */
const METEOR_COLORS = [[1, 0.96, 0.88], [1, 0.96, 0.88], [1, 0.96, 0.88], [0.7, 1, 0.78], [1, 0.78, 0.55], [0.75, 0.86, 1]].map(([r, g, b]) => new THREE.Color(r, g, b));

export type SkyNews = 'aurora' | 'shower';
export type SkyShowKind = 'aurora' | 'shower' | 'star' | 'off';

/** Hauteur angulaire (radians, négative sous l'horizon) du bord de l'île vu de `cp`, au cap `az` (cos az, sin az) en (x, z) */
function rimAt(cp: THREE.Vector3, az: number) {
  const dx = Math.cos(az), dz = Math.sin(az), rx = N / 2 - cp.x, rz = N / 2 - cp.z, r = N * RIM;
  const pr = rx * dx + rz * dz, pe = rx * dz - rz * dx;
  return Math.atan2(-cp.y, Math.max(25, pr + Math.sqrt(Math.max(0, r * r - pe * pe))));
}

const dirOf = (az: number, e: number, out: THREE.Vector3) => out.set(Math.cos(az) * Math.cos(e), Math.sin(e), Math.sin(az) * Math.cos(e));

interface Meteor {
  /** départ (direction depuis la caméra) et sens de la course, sur la sphère du ciel */
  p: THREE.Vector3;
  t: THREE.Vector3;
  /** course et longueur de la traînée (radians), durée de vie et âge (secondes de jeu) */
  len: number;
  trail: number;
  life: number;
  age: number;
  /** demi-largeur (radians), éclat, teinte */
  width: number;
  bright: number;
  col: THREE.Color;
}

/**
 * Le ciel de nuit : aurores boréales et étoiles filantes. Tous deux se tiennent sur une coupole centrée sur la caméra, posée
 * au-dessus du bord de l'île vu d'où l'on regarde : on les voit dans le ciel quand la vue relève la tête, et sur le fond de nuit
 * autour de l'île quand elle plonge ou de loin ; l'île, devant, les cache (pas d'écriture de profondeur, mélange additif).
 * Le programme des nuits vient de `skyNights` ; tout avance au temps du jeu (figé en pause). Les matériaux sont créés et
 * dessinés (à vide) dès le départ : rien ne se compile quand le spectacle commence
 */
export class NightSky {
  group = new THREE.Group();
  /** annonces à faire (une par nuit et par spectacle) */
  news: SkyNews[] = [];
  private aurora: THREE.Mesh;
  private auroraU = { uTime: { value: 0 }, uAlpha: { value: 0 }, uFine: { value: 1 }, uMap: { value: new THREE.Vector3() }, uR: { value: SKY_R }, uH: { value: AURORA_H } };
  /** densité des effets (qualité graphique) : en dessous de la moitié, l'aurore n'a qu'un voile */
  set density(d: number) { this.auroraU.uFine.value = d > 0.5 ? 1 : 0; }
  /** force affichée de l'aurore (suit le programme en douceur) */
  private auroraK = 0;
  private meteorMesh: THREE.Mesh;
  private meteorPos = new Float32Array(METEOR_MAX * 12);
  private meteorCol = new Float32Array(METEOR_MAX * 16);
  private flying: Meteor[] = [];
  private spare: Meteor[] = [];
  private night = NaN;
  private show: NightShow = { aurora: 0, meteors: 'none' };
  private forced: { night: number; show: NightShow } | null = null;
  /** une étoile filante demandée tout de suite (mode développeur) */
  private starNow = false;
  private told = NaN;
  private salt = Date.now() & 0xffff;
  private rnd = mulberry32(Date.now() & 0xffffff);
  /** point radiant de la nuit des étoiles filantes : elles en jaillissent toutes */
  private radiant = new THREE.Vector3(0, 1, 0);
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  private v4 = new THREE.Vector3();

  constructor(private world: World) {
    // ---- aurore : une bande sur tout le tour de l'horizon ; chaque sommet porte (cap, hauteur dans la bande), le shader la
    // pose au-dessus du bord de l'île vu de la caméra
    const pos: number[] = [], idx: number[] = [];
    for (let j = 0; j <= AURORA_ROWS; j++) for (let i = 0; i <= AURORA_SEG; i++) pos.push((i / AURORA_SEG) * Math.PI * 2, j / AURORA_ROWS, 0);
    for (let j = 0; j < AURORA_ROWS; j++) for (let i = 0; i < AURORA_SEG; i++) {
      const a = j * (AURORA_SEG + 1) + i, b = a + AURORA_SEG + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    ag.setIndex(idx);
    this.aurora = new THREE.Mesh(ag, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: this.auroraU,
      vertexShader: `uniform vec3 uMap; uniform float uR; uniform float uH; uniform float uTime; varying vec2 vB;
void main() {
  float az = position.x;
  vec2 d = vec2(cos(az), sin(az)), rel = uMap.xy - cameraPosition.xz;
  float pr = dot(rel, d), pe = rel.x * d.y - rel.y * d.x;
  // le bord de l'île au niveau de la mer, vu d'ici : le voile se lève derrière, plus ou moins loin selon le cap (de loin, il
  // n'entoure pas l'île d'un anneau régulier)
  float far = max(25.0, pr + sqrt(max(0.0, uMap.z * uMap.z - pe * pe)));
  far *= 1.1 + 0.25 * sin(az * 2.0 + 1.3 + uTime * 0.01) + 0.15 * sin(az * 3.0 + 4.1 - uTime * 0.013);
  float e = atan(-cameraPosition.y, far) + position.y * uH;
  vB = position.xy;
  gl_Position = projectionMatrix * viewMatrix * vec4(cameraPosition + vec3(d.x * cos(e), sin(e), d.y * cos(e)) * uR, 1.0);
}`,
      fragmentShader: `uniform float uTime; uniform float uAlpha; uniform float uFine; varying vec2 vB;
float hh(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float nz(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh(i), hh(i + vec2(1.0, 0.0)), f.x), mix(hh(i + vec2(0.0, 1.0)), hh(i + vec2(1.0, 1.0)), f.x), f.y);
}
// bruit sans couture sur le tour de l'horizon : lu sur un cercle de rayon k (k : nombre de motifs par radian)
float ring(float az, float k, vec2 o) { return nz(vec2(cos(az), sin(az)) * k + o); }
vec3 veil(float az, float v, float t, float s, float lift) {
  // bord inférieur : il monte et descend en grandes houles, et frissonne
  float base = lift + 0.22 * (ring(az, 1.6, vec2(s, t * 0.02)) - 0.5) + 0.12 * (ring(az, 6.0, vec2(s + 3.0, t * 0.04)) - 0.5)
    + 0.05 * (ring(az, 14.0, vec2(s - 2.0, t * 0.07)) - 0.5) + 0.02 * sin(az * 23.0 + t * 0.12 + s);
  float h = v - base, up = max(h, 0.0);
  // le rideau se replie : vu par la tranche, il est plus dense, plus vif
  float fold = 1.0 + 1.35 * cos(az * 6.0 + 1.2 * sin(az * 2.0 + t * 0.03 + s) + t * 0.045);
  float dens = 0.42 / (0.38 + abs(fold));
  // quelques arcs vifs, de grands trous entre eux
  float arc = smoothstep(0.48, 0.85, ring(az, 2.4, vec2(t * 0.012 + s * 2.3, s)));
  // fins rayons verticaux qui glissent le long des plis, et des faisceaux plus larges
  float ray = ring(az, 70.0, vec2(fold * 3.0, t * 0.35 + s));
  ray = 0.25 + 0.75 * ray * ray;
  float beam = 0.35 + 0.65 * ring(az, 16.0, vec2(fold * 1.5, t * 0.12 + s));
  // vert au pied, net en bas ; violet qui monte plus haut ; liseré rose sous le bord des parties vives
  float green = smoothstep(-0.045, 0.01, h) * exp(-up * (10.0 - 5.0 * ray));
  float violet = smoothstep(0.04, 0.22, h) * exp(-up * 2.4) * (0.4 + 0.6 * ray);
  float q = (h + 0.016) / 0.014;
  float pink = exp(-q * q) * arc * arc;
  return (vec3(0.2, 1.0, 0.32) * green * (0.5 + 0.8 * ray) + vec3(0.55, 0.12, 0.8) * violet * 0.7 + vec3(1.0, 0.22, 0.5) * pink * 0.7) * arc * dens * beam;
}
void main() {
  float az = vB.x, v = vB.y, t = uTime;
  // vive vers le nord (-z), à peine un voile au sud
  float north = 0.15 + 0.85 * smoothstep(-0.3, 0.9, -sin(az));
  vec3 c = veil(az, v, t, 0.0, 0.24);
  // le second voile, plus haut et plus pâle (sauté quand la carte graphique peine)
  if (uFine > 0.5) c += veil(az + 0.5, v, t * 1.2, 5.7, 0.36) * 0.5;
  else c *= 1.25;
  c *= 0.75 * north * uAlpha * smoothstep(0.0, 0.04, v) * (1.0 - smoothstep(0.7, 1.0, v));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    }));
    this.aurora.frustumCulled = false;
    this.aurora.renderOrder = -8;
    ag.setDrawRange(0, 0);

    // ---- étoiles filantes : un ruban par étoile, tourné vers la caméra, refait à chaque image (quatre sommets chacune)
    const mg = new THREE.BufferGeometry(), ts: number[] = [], mi: number[] = [];
    for (let k = 0; k < METEOR_MAX; k++) {
      ts.push(0, -1, 0, 1, 1, -1, 1, 1);
      const a = k * 4;
      mi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    mg.setAttribute('position', new THREE.BufferAttribute(this.meteorPos, 3).setUsage(THREE.DynamicDrawUsage));
    mg.setAttribute('aTS', new THREE.Float32BufferAttribute(ts, 2));
    mg.setAttribute('aCol', new THREE.BufferAttribute(this.meteorCol, 4).setUsage(THREE.DynamicDrawUsage));
    mg.setIndex(mi);
    mg.setDrawRange(0, 0);
    this.meteorMesh = new THREE.Mesh(mg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute vec2 aTS; attribute vec4 aCol; varying vec2 vTS; varying vec4 vCol; void main() { vTS = aTS; vCol = aCol; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vTS; varying vec4 vCol;
void main() {
  // la traînée (couleur de l'étoile) s'éclaire vers la tête, d'un blanc vif qui s'éteint le premier (vCol.a) ; le cœur du ruban
  // est plus vif que ses bords
  float a = vTS.x, core = exp(-vTS.y * vTS.y * 4.0), knot = smoothstep(0.84, 1.0, a) * vCol.a;
  float m = max(vCol.r, max(vCol.g, vCol.b));
  gl_FragColor = vec4((vCol.rgb * a * a * (0.4 + 0.6 * a) + vec3(m * knot * 1.1)) * core, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    }));
    this.meteorMesh.frustumCulled = false;
    this.meteorMesh.renderOrder = -7;
    this.group.add(this.aurora, this.meteorMesh);
  }

  /**
   * Mode développeur : impose le spectacle de la nuit en cours (ou de la prochaine) ; 'star' lance une étoile filante tout de
   * suite, 'off' éteint tout
   */
  force(kind: SkyShowKind, time: GameTime) {
    const n = nightOf(time.days, time.hour);
    const cur = this.forced?.night === n ? this.forced.show : this.night === n ? this.show : { aurora: 0, meteors: 'none' as MeteorKind };
    const show: NightShow = kind === 'off' ? { aurora: 0, meteors: 'none' } : kind === 'aurora' ? { ...cur, aurora: 1 } : kind === 'shower' ? { ...cur, meteors: 'shower' } : cur;
    this.forced = { night: n, show };
    this.night = NaN;
    this.told = NaN;
    if (kind === 'star') this.starNow = true;
    if (kind === 'off') this.flying.length = 0;
  }

  /** Spectacle de la nuit en cours (pour les tests et le débogage) */
  get tonight(): Readonly<NightShow> { return this.show; }

  /** Part des terres froides : taïga et neiges éternelles (une case sur quatre suffit ; une fois par nuit) */
  private coldShare() {
    const w = this.world;
    let land = 0, cold = 0;
    for (let z = 0; z < N; z += 2) for (let x = 0; x < N; x += 2) {
      const h = w.cellAvg(x, z);
      if (h < 0.08) continue;
      land++;
      if (w.biome[z * N + x] === BIOME_TAIGA || h >= SNOW_LINE[0]) cold++;
    }
    return land ? cold / land : 0;
  }

  update(dt: number, gdt: number, time: GameTime, env: Environment, camera: THREE.PerspectiveCamera) {
    // ---- la nuit : son programme est tiré au soir (ou imposé)
    const n = nightOf(time.days, time.hour);
    if (n !== this.night) {
      this.night = n;
      this.show = this.forced?.night === n ? this.forced.show : nightShow(n, time.season, this.coldShare(), this.salt);
      const a = this.rnd() * Math.PI * 2;
      dirOf(a, 0.45 + this.rnd() * 0.4, this.radiant);
    }
    const overcast = env.weatherKind === 'clear' ? 0 : env.weatherK;
    const clear = 1 - smoothstep(0.15, 0.7, overcast);
    const deep = smoothstep(0.6, 0.95, env.night);
    if (deep > 0.5 && clear > 0.6 && this.told !== n) {
      this.told = n;
      if (this.show.aurora > 0) this.news.push('aurora');
      if (this.show.meteors === 'shower') this.news.push('shower');
    }

    // ---- aurore : elle se lève et s'éteint en douceur, au temps du jeu ; ses voiles respirent (des sursauts de quelques secondes)
    this.auroraK += (this.show.aurora * deep * clear - this.auroraK) * Math.min(1, gdt * 0.5);
    const u = this.auroraU;
    u.uTime.value += gdt;
    if (this.auroraK < 0.005) { this.auroraK = 0; u.uTime.value %= 5000; }
    const t = u.uTime.value;
    u.uAlpha.value = this.auroraK * (0.82 + 0.18 * Math.sin(t * 0.21) * Math.sin(t * 0.13 + 1));
    u.uMap.value.set(N / 2, N / 2, N * RIM);
    this.aurora.geometry.setDrawRange(0, this.auroraK > 0 ? Infinity : 0);
    if (this.auroraK > 0) {
      // une lueur verte sur le paysage et le fond du ciel, qui suit les sursauts
      env.hemi.color.lerp(AURORA_TINT, u.uAlpha.value * 0.2);
      env.skyMat.uniforms.top.value.lerp(AURORA_SKY, u.uAlpha.value * 0.1);
      env.skyMat.uniforms.hz.value.lerp(AURORA_SKY, u.uAlpha.value * 0.06);
    }

    // ---- étoiles filantes : à ×2 et ×4, elles filent deux fois plus vite au plus (sinon on ne les verrait plus)
    const fly = Math.min(gdt, dt * 2);
    // la grande nuit vient par bouffées : des moments calmes, puis plusieurs à la fois
    const c = t * 0.8, surge = this.show.meteors === 'shower' ? 0.5 + 0.9 * Math.max(0, Math.sin(c) * Math.sin(c * 0.41 + 2)) : 1;
    const rate = meteorRate(this.show.meteors, time.dayLen) * surge * deep * clear;
    if (gdt > 0) for (let k = Math.floor(rate * gdt + this.rnd()); k > 0; k--) this.spawn(camera, this.show.meteors === 'shower');
    if (this.starNow) { this.starNow = false; this.spawn(camera, false, 24); }
    this.drawMeteors(fly, camera.position);
  }

  /** Une étoile filante dans la part de ciel (ou de fond de nuit) que montre la vue, au-dessus du bord de l'île */
  private spawn(camera: THREE.PerspectiveCamera, shower: boolean, tries = 8) {
    if (this.flying.length >= METEOR_MAX) return;
    const cp = camera.position, f = camera.getWorldDirection(this.v1), azF = Math.atan2(f.z, f.x);
    const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const p = this.v2, s = this.v3;
    for (let i = 0; i < tries; i++) {
      const az = azF + (this.rnd() * 2 - 1) * half;
      dirOf(az, rimAt(cp, az) + 0.04 + this.rnd() * 0.36, p);
      s.copy(p).multiplyScalar(SKY_R).add(cp).project(camera);
      if (Math.abs(s.x) > 0.9 || Math.abs(s.y) > 0.92 || s.z > 1) continue;
      const m = this.spare.pop() ?? { p: new THREE.Vector3(), t: new THREE.Vector3(), len: 0, trail: 0, life: 0, age: 0, width: 0, bright: 0, col: new THREE.Color() };
      m.p.copy(p);
      let len = 0.09 + this.rnd() * 0.12;
      if (shower) {
        // elles jaillissent toutes du même point du ciel : courtes près de lui, longues au loin
        const c = p.dot(this.radiant);
        m.t.copy(p).multiplyScalar(c).sub(this.radiant).normalize();
        len *= 0.35 + 0.65 * Math.sqrt(Math.max(0, 1 - c * c));
      } else {
        // une étoile isolée tombe en biais, vers la gauche ou la droite
        const up = this.v4.set(0, 1, 0).addScaledVector(p, -p.y).normalize(), east = s.copy(up).cross(p).normalize();
        const a = 0.25 + this.rnd() * 0.9;
        m.t.copy(east).multiplyScalar(Math.cos(a) * (this.rnd() < 0.5 ? -1 : 1)).addScaledVector(up, -Math.sin(a)).normalize();
      }
      // de temps en temps un bolide : plus gros, plus long, plus lent
      const bolide = this.rnd() < 0.06;
      m.len = len * (bolide ? 1.4 : 1);
      m.trail = m.len * (0.45 + this.rnd() * 0.3);
      m.life = (shower ? 0.45 + this.rnd() * 0.4 : 0.6 + this.rnd() * 0.5) * (bolide ? 1.4 : 1);
      m.age = 0;
      m.width = (0.0011 + this.rnd() * 0.0006) * (bolide ? 1.8 : 1);
      // beaucoup de pâles, quelques vives
      const r = this.rnd();
      m.bright = (0.55 + r * r * 1.7) * (bolide ? 2 : 1);
      m.col.copy(METEOR_COLORS[Math.floor(this.rnd() * METEOR_COLORS.length)]);
      this.flying.push(m);
      return;
    }
  }

  /** Avance les étoiles filantes et refait leurs rubans */
  private drawMeteors(fly: number, cp: THREE.Vector3) {
    const pos = this.meteorPos, col = this.meteorCol, head = this.v1, tail = this.v2, side = this.v3;
    let n = 0;
    for (let i = 0; i < this.flying.length; i++) {
      const m = this.flying[i];
      m.age += fly;
      if (m.age >= m.life) { this.spare.push(m); this.flying.splice(i--, 1); continue; }
      // la tête ralentit un peu ; à la fin, la traînée la rattrape en s'effaçant
      const f = m.age / m.life, sh = m.len * (1 - Math.pow(1 - f, 1.5));
      const st = Math.max(0, sh - m.trail * Math.min(1, f * 2.5) * (1 - 0.6 * smoothstep(0.7, 1, f)));
      head.copy(m.p).addScaledVector(m.t, sh).normalize();
      tail.copy(m.p).addScaledVector(m.t, st).normalize();
      // la largeur, perpendiculaire à la course et au regard ; la queue s'affine
      side.copy(head).sub(tail).cross(head).normalize().multiplyScalar(m.width * SKY_R);
      head.multiplyScalar(SKY_R).add(cp);
      tail.multiplyScalar(SKY_R).add(cp);
      const o = n * 12;
      pos[o] = tail.x - side.x * 0.25; pos[o + 1] = tail.y - side.y * 0.25; pos[o + 2] = tail.z - side.z * 0.25;
      pos[o + 3] = tail.x + side.x * 0.25; pos[o + 4] = tail.y + side.y * 0.25; pos[o + 5] = tail.z + side.z * 0.25;
      pos[o + 6] = head.x - side.x; pos[o + 7] = head.y - side.y; pos[o + 8] = head.z - side.z;
      pos[o + 9] = head.x + side.x; pos[o + 10] = head.y + side.y; pos[o + 11] = head.z + side.z;
      // vive d'un coup ; la tête s'éteint, puis la traînée s'efface
      const b = m.bright * smoothstep(0, 0.12, f) * (1 - smoothstep(0.6, 1, f)), hk = 1 - smoothstep(0.65, 0.92, f);
      for (let k = 0; k < 4; k++) { const c = n * 16 + k * 4; col[c] = m.col.r * b; col[c + 1] = m.col.g * b; col[c + 2] = m.col.b * b; col[c + 3] = hk; }
      n++;
    }
    const g = this.meteorMesh.geometry;
    g.setDrawRange(0, n * 6);
    if (n) { g.attributes.position.needsUpdate = true; g.attributes.aCol.needsUpdate = true; }
  }
}

/** Le texte d'une annonce ; avec un observatoire, ce sont ses astronomes qui préviennent */
export function skyNewsText(k: SkyNews, observatory: boolean) {
  if (k === 'aurora') return tr('🌌 Une aurore boréale illumine le ciel ! Cliquez ici pour lever les yeux.');
  return observatory ? tr('🔭 Les astronomes annoncent une nuit d’étoiles filantes ! Cliquez ici pour lever les yeux.') : tr('🌠 Nuit des étoiles filantes ! Cliquez ici pour lever les yeux.');
}
