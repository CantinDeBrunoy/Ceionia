import * as THREE from 'three';
import { GameTime } from '../core/time';
import { SeasonState } from './season';
import { mats } from './materials';
import { clamp, lerp, smoothstep, mulberry32 } from '../core/rng';
import { N } from '../world/world';

export type WeatherKind = 'clear' | 'rain' | 'snow' | 'fog';

const NIGHT_TOP = new THREE.Color(0x0e1433), NIGHT_HZ = new THREE.Color(0x27305a);
const DAY_TOP = new THREE.Color(0x62b4f0), DAY_HZ = new THREE.Color(0xd2eaf8);
const DUSK_TOP = new THREE.Color(0x8d86c4), DUSK_HZ = new THREE.Color(0xf7b49a);
const GREY = new THREE.Color(0xb9c0ca);

const rainCount = 1500, snowCount = 1300;
/** Échelle de la carte par rapport à la version 48 cases (nuages, brouillard) */
/** Échelle de la carte (nuages, ombres) */
const scale = () => N / 48;

export class Environment {
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  sky: THREE.Mesh;
  skyMat: THREE.ShaderMaterial;
  stars: THREE.Points;
  sunMesh: THREE.Mesh;
  moonMesh: THREE.Mesh;
  clouds = new THREE.Group();
  cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, emissive: 0x222233, emissiveIntensity: 0.3 });
  rain: THREE.LineSegments;
  snowPts: THREE.Points;
  private rainPos = new Float32Array(rainCount * 6);
  private rainBase = new Float32Array(rainCount * 3);
  private snowPos = new Float32Array(snowCount * 3);
  private snowBase = new Float32Array(snowCount * 3);
  fog = new THREE.Fog(0xdcf0fa, 80, 210);
  center = new THREE.Vector3(N / 2, 0, N / 2);

  /** 0 nuit … 1 plein jour */
  daylight = 1;
  /** 0..1 intensité de la météo */
  weatherK = 0;
  weatherKind: WeatherKind = 'clear';
  wantKind: WeatherKind = 'clear';
  /** null = automatique */
  manualWeather: WeatherKind | null = null;
  private weatherTimer = 30;
  private rnd = mulberry32(Date.now() & 0xffff);
  private time = 0;
  private tmpA = new THREE.Color();
  private tmpB = new THREE.Color();
  horizon = new THREE.Color();
  /** demi-largeur courante de la zone d'ombres portées */
  private shadowExt = 0;

  constructor(private scene: THREE.Scene, renderer: THREE.WebGLRenderer, private lowQuality: boolean) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    this.hemi = new THREE.HemisphereLight(0xdcefff, 0xd9c6a8, 0.9);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    this.sun.castShadow = true;
    const ss = lowQuality ? 1024 : 2048;
    this.sun.shadow.mapSize.set(ss, ss);
    const sc = this.sun.shadow.camera;
    sc.near = 1; sc.far = 420;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    scene.add(this.sun, this.sun.target);
    this.sun.target.position.copy(this.center);

    // Ciel
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, hz: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hz; varying vec3 vP; void main(){ float t = pow(clamp(vP.y*1.2+0.05,0.0,1.0),0.65); vec3 c = mix(hz, top, t); gl_FragColor = vec4(c,1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(520, 24, 16), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.position.copy(this.center);
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    // Étoiles
    const sp = new Float32Array(500 * 3);
    const r = mulberry32(5);
    for (let i = 0; i < 500; i++) {
      const a = r() * Math.PI * 2, e = Math.asin(r() * 0.95 + 0.05);
      sp[i * 3] = Math.cos(a) * Math.cos(e) * 480; sp[i * 3 + 1] = Math.sin(e) * 480; sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 480;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.position.copy(this.center);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    scene.add(this.stars);

    this.sunMesh = new THREE.Mesh(new THREE.SphereGeometry(14, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff2c4, fog: false }));
    this.moonMesh = new THREE.Mesh(new THREE.SphereGeometry(10, 12, 8), new THREE.MeshBasicMaterial({ color: 0xe9eeff, fog: false }));
    scene.add(this.sunMesh, this.moonMesh);

    // Nuages
    const cr = mulberry32(21);
    const K = scale();
    for (let i = 0; i < Math.round(11 * K); i++) {
      const c = new THREE.Group();
      const n = 3 + Math.floor(cr() * 3);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(2 + cr() * 2, 0), this.cloudMat);
        m.position.set(k * 2.6 - n * 1.3, cr() * 1.2, (cr() - 0.5) * 2.5);
        m.scale.set(1.5, 0.7, 1.1);
        c.add(m);
      }
      c.scale.setScalar(1 + (K - 1) * 0.4);
      const a = cr() * Math.PI * 2, rad = (50 + cr() * 45) * K;
      c.position.set(Math.cos(a) * rad, 20 + K * 4 + cr() * 12, Math.sin(a) * rad);
      c.rotation.y = cr() * 6;
      this.clouds.add(c);
    }
    this.clouds.position.copy(this.center);
    scene.add(this.clouds);

    // Météo
    const rr = mulberry32(8);
    for (let i = 0; i < rainCount; i++) { this.rainBase[i * 3] = (rr() - 0.5) * 50; this.rainBase[i * 3 + 1] = rr() * 24; this.rainBase[i * 3 + 2] = (rr() - 0.5) * 50; }
    for (let i = 0; i < snowCount; i++) { this.snowBase[i * 3] = (rr() - 0.5) * 50; this.snowBase[i * 3 + 1] = rr() * 24; this.snowBase[i * 3 + 2] = (rr() - 0.5) * 50; }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xcfe3f5, transparent: true, opacity: 0.5, depthWrite: false }));
    this.rain.frustumCulled = false; this.rain.visible = false;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    this.snowPts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.9, depthWrite: false }));
    this.snowPts.frustumCulled = false; this.snowPts.visible = false;
    scene.add(this.rain, this.snowPts);

    scene.fog = this.fog;
    scene.background = this.horizon;
  }

  setWeather(w: WeatherKind | null) {
    this.manualWeather = w;
    if (w) this.wantKind = w;
  }

  private autoWeather(season: number) {
    const r = this.rnd();
    const tbl: [WeatherKind, number][][] = [
      [['clear', 0.5], ['rain', 0.35], ['fog', 0.15]],
      [['clear', 0.78], ['rain', 0.14], ['fog', 0.08]],
      [['clear', 0.42], ['rain', 0.3], ['fog', 0.28]],
      [['clear', 0.4], ['snow', 0.5], ['fog', 0.1]],
    ];
    let acc = 0;
    for (const [k, p] of tbl[season]) { acc += p; if (r <= acc) return k; }
    return 'clear' as WeatherKind;
  }

  update(dt: number, time: GameTime, s: SeasonState, focus: THREE.Vector3, gameDt: number, camDist = 60) {
    this.time += dt;
    // ---- météo
    if (!this.manualWeather) {
      this.weatherTimer -= gameDt;
      if (this.weatherTimer <= 0) {
        this.weatherTimer = 35 + this.rnd() * 55;
        this.wantKind = this.autoWeather(time.season);
        if (this.wantKind === 'rain' && s.snow > 0.5) this.wantKind = 'snow';
      }
    }
    if (this.wantKind !== this.weatherKind) {
      this.weatherK -= dt * 0.5;
      if (this.weatherK <= 0) { this.weatherK = 0; this.weatherKind = this.wantKind; }
    } else if (this.weatherKind !== 'clear') this.weatherK = Math.min(1, this.weatherK + dt * 0.35);
    else this.weatherK = 0;
    const wk = this.weatherK;
    const rainK = this.weatherKind === 'rain' ? wk : 0;
    const snowK = this.weatherKind === 'snow' ? wk : 0;
    const fogK = this.weatherKind === 'fog' ? wk : 0;
    const overcast = clamp(rainK * 0.8 + snowK * 0.6 + fogK * 0.5, 0, 1);

    // ---- soleil / lune
    const ang = ((time.hour - 6) / 24) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.62).normalize();
    const elev = Math.sin(ang);
    const day = smoothstep(-0.12, 0.28, elev);
    this.daylight = day;
    const twi = clamp(1 - Math.abs(elev) / 0.32, 0, 1);

    const top = this.tmpA.copy(NIGHT_TOP).lerp(DAY_TOP, day).lerp(DUSK_TOP, twi * 0.55);
    const hz = this.tmpB.copy(NIGHT_HZ).lerp(DAY_HZ, day).lerp(DUSK_HZ, twi * 0.75);
    top.lerp(s.tint, 0.1 * day);
    hz.lerp(s.tint, 0.12 * day);
    const g = GREY.clone().multiplyScalar(0.25 + 0.75 * day);
    top.lerp(g, overcast * 0.55); hz.lerp(g, overcast * 0.75);
    this.skyMat.uniforms.top.value.copy(top);
    this.skyMat.uniforms.hz.value.copy(hz);
    this.horizon.copy(hz);
    this.fog.color.copy(hz);
    // le brouillard recule quand on dézoome, pour voir toute la carte
    const away = Math.max(0, camDist - 62);
    this.fog.near = lerp(lerp(85, 40, Math.max(rainK, snowK)), 8, fogK) + away * 0.9;
    this.fog.far = lerp(lerp(220, 120, Math.max(rainK, snowK)), 70, fogK) + away * 1.6;

    const sunI = smoothstep(0.0, 0.18, elev) * 2.75 * (1 - overcast * 0.6);
    const moonI = smoothstep(0.0, 0.18, -elev) * 0.95 * (1 - overcast * 0.4);
    const useSun = elev > 0;
    const ld = useSun ? dir : dir.clone().negate();
    // ombres portées autour du point visé, sur une zone qui s'élargit avec le dézoom (calée sur les texels pour ne pas scintiller)
    const ext = Math.min(N * 0.72, Math.max(24, Math.ceil(camDist * 0.8 / 6) * 6));
    const sc = this.sun.shadow.camera;
    if (ext !== this.shadowExt) {
      this.shadowExt = ext;
      sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
      sc.updateProjectionMatrix();
    }
    const texel = (ext * 2) / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx, 0, fz).addScaledVector(ld, 200);
    this.sun.intensity = useSun ? sunI : moonI;
    this.sun.color.setHex(useSun ? 0xffe9c8 : 0x9fb2ff).lerp(new THREE.Color(0xffb27a), useSun ? twi * 0.7 : 0);
    this.hemi.intensity = lerp(0.45, 0.72, day) * (1 + overcast * 0.25);
    this.hemi.color.copy(top).lerp(new THREE.Color(0xffffff), 0.45);
    this.hemi.groundColor.setHex(0xd9c6a8).lerp(new THREE.Color(0x3b3f5c), 1 - day);
    this.sunMesh.position.copy(this.center).addScaledVector(dir, 400);
    this.moonMesh.position.copy(this.center).addScaledVector(dir, -400);
    this.sunMesh.visible = elev > -0.08 && overcast < 0.9;
    this.moonMesh.visible = elev < 0.08 && overcast < 0.9;
    (this.stars.material as THREE.PointsMaterial).opacity = clamp((1 - day) * (1 - overcast), 0, 1);

    // lumières des bâtiments (fenêtres, lampadaires) la nuit
    const night = clamp(1 - day * 1.15 + overcast * 0.25 * day, 0, 1);
    mats.glow.emissiveIntensity = night * (2.3 + 0.3 * Math.sin(this.time * 7.3) * Math.sin(this.time * 3.1));

    // nuages
    this.clouds.rotation.y += dt * 0.006;
    this.cloudMat.color.setHex(0xffffff).lerp(new THREE.Color(0x6a7396), 1 - day).lerp(GREY, overcast * 0.5);

    // précipitations
    this.rain.visible = rainK > 0.01;
    this.snowPts.visible = snowK > 0.01;
    if (this.rain.visible) {
      (this.rain.material as THREE.LineBasicMaterial).opacity = 0.55 * rainK;
      const b = this.rainBase, p = this.rainPos;
      for (let i = 0; i < rainCount; i++) {
        b[i * 3 + 1] -= dt * 22;
        if (b[i * 3 + 1] < 0) b[i * 3 + 1] += 24;
        const x = focus.x + b[i * 3], y = b[i * 3 + 1], z = focus.z + b[i * 3 + 2];
        p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z;
        p[i * 6 + 3] = x - 0.04; p[i * 6 + 4] = y + 0.55; p[i * 6 + 5] = z;
      }
      (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    if (this.snowPts.visible) {
      (this.snowPts.material as THREE.PointsMaterial).opacity = 0.9 * snowK;
      const b = this.snowBase, p = this.snowPos, t = this.time;
      for (let i = 0; i < snowCount; i++) {
        b[i * 3 + 1] -= dt * 2.2;
        if (b[i * 3 + 1] < 0) b[i * 3 + 1] += 24;
        p[i * 3] = focus.x + b[i * 3] + Math.sin(t * 0.8 + i) * 0.5;
        p[i * 3 + 1] = b[i * 3 + 1];
        p[i * 3 + 2] = focus.z + b[i * 3 + 2] + Math.cos(t * 0.7 + i * 1.3) * 0.5;
      }
      (this.snowPts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  get night() { return clamp(1 - this.daylight * 1.15, 0, 1); }
  get rainK() { return this.weatherKind === 'rain' ? this.weatherK : 0; }
}
