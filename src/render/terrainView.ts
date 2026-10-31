import * as THREE from 'three';
import { World, N, SEA, VR, VS, CAVE, VEG_CAVE, VEG_VOLCANO } from '../world/world';
import { hash2, clamp, smoothstep } from '../core/rng';
import { Simplex } from '../world/noise';
import { groundDetailTexture, waterNormalTexture } from './textures';

export interface GroundPalette {
  grass: THREE.Color;
  crop: THREE.Color;
  foliage: THREE.Color;
  snow: number;
  water: THREE.Color;
  waterOpacity: number;
}

const SAND = new THREE.Color(0xeedcaa);
const WET_SAND = new THREE.Color(0xd8c79c);
const SEABED = new THREE.Color(0x6f9a96);
const ROCK = new THREE.Color(0xc2b2a2);
const MOUNTAIN = new THREE.Color(0xa49d99);
/** falaises de craie (façon Étretat) et basalte autour des volcans */
const CHALK = new THREE.Color(0xf0ebdf);
const BASALT = new THREE.Color(0x4e4645);
const GRAVEL = new THREE.Color(0xb9b1a6);
const WHITE = new THREE.Color(0xf4f7fb);
const HIGH = new THREE.Color(0xc9d79a);
const TILLED = new THREE.Color(0xa47b52);
const BEDS = new THREE.Color(0x8a6548);
const UNDERGROWTH = new THREE.Color(0x6f9c5c);
const MEADOW = new THREE.Color(0xc9da8e);
const YARD = new THREE.Color(0xcdb791);
const DEEP_WATER = new THREE.Color(0x2c7899);
const SHALLOW_WATER = new THREE.Color(0x9fe3d8);
/** Strates de la falaise sous l'île, de la terre du haut à la roche du bas */
const STRATA = [0xb58c66, 0xd2bda2, 0xb5a08c, 0x9c8a7c, 0x857869].map((c) => new THREE.Color(c));
/** Profondeur relative des rangées de la falaise (0 = bord du relief, 1 = base) */
const STRATA_T = [0, 0.05, 0.27, 0.5, 0.75, 1];
const SKIRT_BOTTOM = -3.5;
/** Part de la normale de face dans l'ombrage : garde un léger facettage low-poly sur un relief lissé */
const FACE_MIX = 0.3;
/** Sous-cases par côté */
const C = N * VR;

export class TerrainView {
  group = new THREE.Group();
  top: THREE.Mesh;
  skirt: THREE.Mesh;
  water: THREE.Mesh;
  waterMat: THREE.MeshStandardMaterial;
  private sideMat: THREE.MeshStandardMaterial;
  private waterBase: Float32Array;
  private waterGeo: THREE.BufferGeometry;
  private waterU = {
    uTime: { value: 0 },
    uHeight: { value: null as THREE.Texture | null },
    uDetail: { value: null as THREE.Texture | null },
    uShallow: { value: new THREE.Color() },
    uDeep: { value: new THREE.Color() },
  };
  /** Relief affiché en texture (demi-flottants) : l'eau en déduit sa profondeur et son écume */
  private heightTex: THREE.DataTexture;
  private pos = new Float32Array(C * C * 6 * 3);
  private col = new Float32Array(C * C * 6 * 3);
  private nor = new Float32Array(C * C * 6 * 3);
  private surf = new Float32Array(C * C * 6 * 3);
  private skPos = new Float32Array(4 * C * (STRATA_T.length - 1) * 6 * 3);
  private skCol = new Float32Array(4 * C * (STRATA_T.length - 1) * 6 * 3);
  private skNor = new Float32Array(4 * C * (STRATA_T.length - 1) * 6 * 3);
  private tmp = new THREE.Color();
  /** Par sous-sommet : normale lissée, couleur, poids des motifs de détail (herbe, sable/terre, roche) */
  private vnor = new Float32Array(VS * VS * 3);
  private vcol = new Float32Array(VS * VS * 3);
  private vsurf = new Float32Array(VS * VS * 3);
  /** Par sous-sommet : part des cases voisines en forêt / champ / jardin / rocaille (zones à bords doux) */
  private vegW = new Float32Array(VS * VS * 4);
  private vegCol = [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
  /** Par sous-sommet : terre battue autour des bâtiments */
  private yardW = new Float32Array(VS * VS);
  /** Par sous-sommet : grandes taches de prairie (-1 herbe sombre … 1 herbe claire) */
  private patch = new Float32Array(VS * VS);
  private frame = 0;
  /** grottes (x, y, z, cap) : le relief s'ouvre devant leur tunnel */
  private caveU = { uCaves: { value: Array.from({ length: 16 }, () => new THREE.Vector4()) }, uCaveN: { value: 0 } };
  private cliff = new THREE.Color();

  constructor(private world: World) {
    const detail = groundDetailTexture();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    g.setAttribute('surf', new THREE.BufferAttribute(this.surf, 3));
    const topMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    topMat.onBeforeCompile = (sh) => {
      sh.uniforms.uDetail = { value: detail };
      Object.assign(sh.uniforms, this.caveU);
      sh.vertexShader = 'attribute vec3 surf;\nvarying vec3 vSurf;\nvarying vec3 vPos;\nvarying vec3 vNrm;\n'
        + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSurf = surf;\n  vPos = position;\n  vNrm = normal;');
      sh.fragmentShader = `uniform sampler2D uDetail;
uniform vec4 uCaves[16];
uniform int uCaveN;
varying vec3 vSurf;
varying vec3 vPos;
varying vec3 vNrm;
// motif projeté sur les trois axes, pondéré par l'orientation de la surface : pas d'étirement sur les parois (0.5 = neutre)
vec3 tri(vec3 p, vec3 w, float s) {
  return texture2D(uDetail, p.zy * s).rgb * w.x + texture2D(uDetail, p.xz * s).rgb * w.y + texture2D(uDetail, p.xy * s).rgb * w.z;
}
` + sh.fragmentShader
        .replace('void main() {', `void main() {
  // grottes : le relief s'ouvre devant le tunnel
  for (int i = 0; i < 16; i++) {
    if (i >= uCaveN) break;
    vec4 c = uCaves[i];
    vec3 d = vPos - c.xyz;
    float lz = d.x * sin(c.w) + d.z * cos(c.w);
    float lx = d.x * cos(c.w) - d.z * sin(c.w);
    vec2 e = vec2(lx / ${CAVE.r.toFixed(3)}, d.y / ${CAVE.h.toFixed(3)});
    if (lz < 0.05 && lz > -${CAVE.depth.toFixed(3)} && d.y > -0.01 && dot(e, e) < 1.0) discard;
  }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
  vec3 bw = pow(abs(normalize(vNrm)), vec3(4.0));
  bw /= bw.x + bw.y + bw.z;
  vec3 d1 = tri(vPos, bw, 0.6) - 0.5;
  vec3 d2 = tri(vPos + 0.31, bw, 0.11) - 0.5;
  diffuseColor.rgb *= 1.0 + dot(vSurf, d1 * vec3(0.55, 0.4, 0.6) + d2 * vec3(0.3, 0.2, 0.35));
  // strates horizontales sur la craie et la roche
  float strata = smoothstep(0.86, 1.0, sin(vPos.y * 9.0 + sin(vPos.x * 1.1 + vPos.z * 0.7) * 0.8));
  diffuseColor.rgb *= 1.0 - strata * 0.16 * vSurf.z;`);
    };
    this.top = new THREE.Mesh(g, topMat);
    this.top.receiveShadow = true;
    this.top.castShadow = true;
    this.top.frustumCulled = false;

    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.skPos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(this.skCol, 3));
    sg.setAttribute('normal', new THREE.BufferAttribute(this.skNor, 3));
    this.skirt = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide }));
    this.skirt.frustumCulled = false;
    this.skirt.receiveShadow = true;
    this.skirt.castShadow = true;

    // Eau : couleur selon la profondeur, écume au rivage, vaguelettes, reflet du ciel en incidence rasante
    this.heightTex = new THREE.DataTexture(new Uint16Array(VS * VS), VS, VS, THREE.RedFormat, THREE.HalfFloatType);
    this.heightTex.magFilter = this.heightTex.minFilter = THREE.LinearFilter;
    this.waterU.uHeight.value = this.heightTex;
    this.waterU.uDetail.value = detail;
    const pg = new THREE.PlaneGeometry(N, N, 48, 48).rotateX(-Math.PI / 2).translate(N / 2, 0, N / 2);
    this.waterGeo = pg;
    this.waterBase = (pg.attributes.position.array as Float32Array).slice();
    const normalMap = waterNormalTexture();
    normalMap.repeat.set(9, 9);
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, roughness: 0.1, metalness: 0, depthWrite: false, normalMap, normalScale: new THREE.Vector2(0.4, 0.4) });
    this.waterMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.waterU);
      sh.vertexShader = 'varying vec2 vWater;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWater = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = `uniform float uTime;\nuniform sampler2D uHeight;\nuniform sampler2D uDetail;\nuniform vec3 uShallow;\nuniform vec3 uDeep;\nvarying vec2 vWater;\n`
        + sh.fragmentShader
          .replace('#include <color_fragment>', `#include <color_fragment>
  float ground = texture2D(uHeight, (vWater * ${VR.toFixed(1)} + 0.5) / ${VS.toFixed(1)}).r;
  float depth = max(0.0, ${SEA.toFixed(1)} - ground);
  diffuseColor.rgb = mix(uShallow, uDeep, 1.0 - exp(-depth * 1.2));
  diffuseColor.a = mix(0.32, 0.93, smoothstep(0.0, 1.8, depth));
  // écume : bande claire qui respire le long du rivage, découpée par un bruit qui dérive
  float n = texture2D(uDetail, vWater * 0.45 + vec2(uTime * 0.02, uTime * 0.013)).b;
  float band = 1.0 - smoothstep(0.0, 0.16 + 0.06 * sin(uTime * 1.4 + vWater.x * 1.3 + vWater.y * 0.9), depth);
  float foam = smoothstep(0.42, 0.62, n + band * 0.45) * band;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), foam * 0.8);
  diffuseColor.a = max(diffuseColor.a, foam * 0.9);`)
          .replace('#include <opaque_fragment>', `vec3 skyCol = vec3(0.8, 0.9, 0.97);
#ifdef USE_FOG
  skyCol = fogColor;
#endif
  float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 5.0);
  outgoingLight = mix(outgoingLight, skyCol * vec3(0.85, 0.93, 1.0), fres * 0.35);
#include <opaque_fragment>`);
    };
    this.water = new THREE.Mesh(pg, this.waterMat);
    this.water.receiveShadow = true;
    this.water.frustumCulled = false;
    this.water.renderOrder = 2;
    this.sideMat = new THREE.MeshStandardMaterial({ color: 0x5fa6bf, transparent: true, opacity: 0.8, roughness: 0.3, depthWrite: false });

    this.group.add(this.top, this.skirt, this.water, this.makeWaterSides(), this.makeRock());
    const sx = new Simplex(77);
    for (let z = 0; z < VS; z++) for (let x = 0; x < VS; x++) this.patch[z * VS + x] = clamp(sx.fbm((x / VR) * 0.085, (z / VR) * 0.085, 3) * 1.6, -1, 1);
    this.update({ grass: new THREE.Color(0x8fcf7e), crop: new THREE.Color(0xe3cf6e), foliage: new THREE.Color(0x86cf84), snow: 0, water: new THREE.Color(0x9fd8e0), waterOpacity: 0.72 });
  }

  private makeWaterSides() {
    const g = new THREE.Group();
    const depth = 3.6, e = 0.012;
    const sides: [number, number, number, number][] = [[N / 2, -e, 0, 0], [N / 2, N + e, 0, Math.PI], [-e, N / 2, 0, -Math.PI / 2], [N + e, N / 2, 0, Math.PI / 2]];
    for (const [x, z, , ry] of sides) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(N, depth), this.sideMat);
      m.position.set(x, -depth / 2, z);
      m.rotation.y = ry;
      m.renderOrder = 2;
      g.add(m);
    }
    return g;
  }

  /** Socle rocheux sous la falaise, plus sombre vers la pointe */
  private makeRock() {
    const R = (N / 2) * Math.SQRT2;
    const geo = new THREE.CylinderGeometry(R, 3, 13, 4, 4, true).rotateY(Math.PI / 4);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < 6.4 && y > -6.4) {
        const j = 1 + (hash2(Math.round(p.getX(i) * 10), Math.round(y * 10), 3) - 0.5) * 0.28;
        p.setX(i, p.getX(i) * j); p.setZ(i, p.getZ(i) * j);
        p.setY(i, y + (hash2(i, 9, 3) - 0.5) * 1.2);
      }
    }
    const ng = geo.toNonIndexed();
    ng.deleteAttribute('uv');
    ng.computeVertexNormals();
    const c = new Float32Array(ng.attributes.position.count * 3);
    const col = new THREE.Color();
    const top = STRATA[STRATA.length - 1], tip = new THREE.Color(0x6f6676);
    for (let i = 0; i < ng.attributes.position.count; i++) {
      const t = (ng.attributes.position.getY(i) + 6.5) / 13;
      col.copy(tip).lerp(top, t);
      col.multiplyScalar(0.92 + hash2(Math.floor(i / 3), 5, 5) * 0.14);
      c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
    }
    ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const m = new THREE.Mesh(ng, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    m.position.set(N / 2, SKIRT_BOTTOM - 6.5, N / 2);
    m.castShadow = true;
    return m;
  }

  /** Reconstruit géométrie + couleurs */
  update(pal: GroundPalette) {
    const w = this.world;
    w.updateVis();
    const vis = w.vis, vnor = this.vnor, vcol = this.vcol, vsurf = this.vsurf;
    const vw = this.vegW, yw = this.yardW, patch = this.patch, tmp = this.tmp;

    // grottes à creuser dans le relief, volcans à entourer de basalte
    let nCaves = 0;
    const volcanoes: [number, number][] = [];
    for (let k = 0; k < N * N; k++) {
      const t = w.veg[k], cx = k % N, cz = Math.floor(k / N);
      if (t === VEG_CAVE && nCaves < 16) { const f = w.caveFrame(cx, cz); this.caveU.uCaves.value[nCaves++].set(f.x, f.y, f.z, f.yaw); }
      else if (t === VEG_VOLCANO) volcanoes.push([cx + 0.5, cz + 0.5]);
    }
    this.caveU.uCaveN.value = nCaves;

    // relief pour l'eau
    const hd = this.heightTex.image.data as Uint16Array;
    for (let i = 0; i < VS * VS; i++) hd[i] = THREE.DataUtils.toHalfFloat(vis[i]);
    this.heightTex.needsUpdate = true;

    // normales lissées (différences centrées)
    for (let z = 0; z < VS; z++)
      for (let x = 0; x < VS; x++) {
        const xl = Math.max(0, x - 1), xr = Math.min(VS - 1, x + 1), zl = Math.max(0, z - 1), zr = Math.min(VS - 1, z + 1);
        const dx = ((vis[z * VS + xr] - vis[z * VS + xl]) * VR) / (xr - xl);
        const dz = ((vis[zr * VS + x] - vis[zl * VS + x]) * VR) / (zr - zl);
        const l = Math.hypot(dx, 1, dz), i = (z * VS + x) * 3;
        vnor[i] = -dx / l; vnor[i + 1] = 1 / l; vnor[i + 2] = -dz / l;
      }

    // zones : part des cases qui touchent chaque sous-sommet (1 au centre d'une case, ½ sur un bord)
    vw.fill(0);
    yw.fill(0);
    for (let z = 0; z < VS; z++) {
      const z1 = Math.min(N - 1, Math.floor(z / VR)), z0 = z % VR === 0 ? z1 - (z === VS - 1 ? 0 : 1) : z1;
      for (let x = 0; x < VS; x++) {
        const x1 = Math.min(N - 1, Math.floor(x / VR)), x0 = x % VR === 0 ? x1 - (x === VS - 1 ? 0 : 1) : x1;
        let n = 0, y = 0;
        const f = [0, 0, 0, 0];
        for (let cz = z0; cz <= z1; cz++)
          for (let cx = x0; cx <= x1; cx++) {
            if (!w.inCells(cx, cz)) continue;
            const k = w.ci(cx, cz), t = w.veg[k];
            n++;
            // rocaille et grottes partagent le sol de gravier ; épaves et cratères n'en ont pas
            if (t >= 1 && t <= 5) f[Math.min(t, 4) - 1]++;
            if (w.occ[k]) y++;
          }
        if (!n) continue;
        const i = z * VS + x;
        for (let q = 0; q < 4; q++) vw[i * 4 + q] = f[q] / n;
        yw[i] = y / n;
      }
    }
    const [cForest, cField, cGarden, cRocks] = this.vegCol;
    cForest.copy(pal.grass).lerp(UNDERGROWTH, 0.55).lerp(pal.foliage, 0.12);
    cField.copy(TILLED).lerp(pal.crop, 0.55);
    cGarden.copy(BEDS).lerp(pal.grass, 0.12);
    cRocks.copy(GRAVEL).lerp(pal.grass, 0.15);

    // couleur et motif par sous-sommet : dégradés continus fond marin → sable → herbe → roche → neiges éternelles
    for (let i = 0; i < VS * VS; i++) {
      const h = vis[i];
      let grass = 0, sand = 0, rock = 0;
      if (h < 0.02) {
        tmp.copy(WET_SAND).lerp(SEABED, clamp(-h / 1.6, 0, 1));
        sand = 0.6;
      } else {
        const steep = 1 - smoothstep(0.6, 0.8, vnor[i * 3 + 1]), flat = 1 - steep;
        const alt = smoothstep(3.8, 5.4, h), cap = smoothstep(5.4, 6.3, h);
        tmp.copy(pal.grass).lerp(HIGH, clamp((h - 2.5) / 4, 0, 0.6) * (1 - pal.snow));
        const pv = patch[i];
        if (pv > 0) tmp.lerp(MEADOW, pv * 0.32 * (1 - pal.snow)); else tmp.multiplyScalar(1 + pv * 0.13);
        const beach = 1 - smoothstep(0.12, 0.42, h);
        tmp.lerp(SAND, beach);
        // parois : craie blanche près de la mer, roche plus haut, grise en montagne
        if (steep > 0) tmp.lerp(this.cliff.copy(CHALK).lerp(ROCK, smoothstep(1.5, 3.5, h)).lerp(MOUNTAIN, alt), steep);
        if (alt > 0) tmp.lerp(MOUNTAIN, alt * 0.85);
        let lava = 0;
        if (volcanoes.length) {
          const x = (i % VS) / VR, z = Math.floor(i / VS) / VR;
          for (const [vx, vz] of volcanoes) lava = Math.max(lava, 1 - smoothstep(1.2, 3.8, Math.hypot(x - vx, z - vz)));
          if (lava > 0) tmp.lerp(BASALT, lava * 0.9);
        }
        const soil = Math.min(1, yw[i] * 0.55 + vw[i * 4 + 1] + vw[i * 4 + 2]);
        if (yw[i] > 0) tmp.lerp(YARD, yw[i] * 0.55 * flat);
        for (let q = 0; q < 4; q++) if (vw[i * 4 + q] > 0) tmp.lerp(this.vegCol[q], vw[i * 4 + q] * (q === 3 ? 1 : flat));
        if (pal.snow > 0) tmp.lerp(WHITE, pal.snow * (0.85 - steep * 0.35));
        // le volcan reste sombre, sans neige sur ses flancs chauds
        if (cap > 0) tmp.lerp(WHITE, cap * (0.9 - steep * 0.3) * (1 - lava));
        rock = Math.max(steep, alt, vw[i * 4 + 3], lava);
        sand = Math.max(beach, soil) * (1 - rock);
        grass = Math.max(0, 1 - sand - rock);
        // la neige lisse les motifs
        const smooth = 1 - Math.max(pal.snow, cap) * 0.75;
        grass *= smooth; sand *= smooth; rock *= smooth;
      }
      vcol[i * 3] = tmp.r; vcol[i * 3 + 1] = tmp.g; vcol[i * 3 + 2] = tmp.b;
      vsurf[i * 3] = grass; vsurf[i * 3 + 1] = sand; vsurf[i * 3 + 2] = rock;
    }

    // triangles (même découpage que World.hAt)
    const pos = this.pos, col = this.col, nor = this.nor, surf = this.surf;
    let o = 0;
    for (let cz = 0; cz < C; cz++)
      for (let cx = 0; cx < C; cx++) {
        const i00 = cz * VS + cx, i10 = i00 + 1, i01 = i00 + VS, i11 = i01 + 1;
        for (let t = 0; t < 2; t++) {
          const ia = i00, ib = t === 0 ? i11 : i01, ic = t === 0 ? i10 : i11;
          const ax = (ia % VS) / VR, az = Math.floor(ia / VS) / VR, ay = vis[ia];
          const bx = (ib % VS) / VR, bz = Math.floor(ib / VS) / VR, by = vis[ib];
          const qx = (ic % VS) / VR, qz = Math.floor(ic / VS) / VR, qy = vis[ic];
          const ux = bx - ax, uy = by - ay, uz = bz - az, wx = qx - ax, wy = qy - ay, wz = qz - az;
          let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
          const l = Math.hypot(nx, ny, nz) || 1;
          nx /= l; ny /= l; nz /= l;
          for (const [vi, x, y, z] of [[ia, ax, ay, az], [ib, bx, by, bz], [ic, qx, qy, qz]]) {
            pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
            const k = vi * 3;
            const mx = nx * FACE_MIX + vnor[k] * (1 - FACE_MIX), my = ny * FACE_MIX + vnor[k + 1] * (1 - FACE_MIX), mz = nz * FACE_MIX + vnor[k + 2] * (1 - FACE_MIX);
            const ml = Math.hypot(mx, my, mz) || 1;
            nor[o] = mx / ml; nor[o + 1] = my / ml; nor[o + 2] = mz / ml;
            col[o] = vcol[k]; col[o + 1] = vcol[k + 1]; col[o + 2] = vcol[k + 2];
            surf[o] = vsurf[k]; surf[o + 1] = vsurf[k + 1]; surf[o + 2] = vsurf[k + 2];
            o += 3;
          }
        }
      }
    const ga = this.top.geometry.attributes;
    ga.position.needsUpdate = ga.color.needsUpdate = ga.normal.needsUpdate = ga.surf.needsUpdate = true;
    this.updateSkirt(pal);
    // eau : turquoise clair sur les hauts-fonds, bleu profond au large, teintée par la saison
    this.waterU.uShallow.value.copy(SHALLOW_WATER).lerp(pal.water, 0.45);
    this.waterU.uDeep.value.copy(DEEP_WATER).lerp(pal.water, 0.25);
    this.sideMat.color.copy(this.waterU.uDeep.value);
  }

  /** Falaise sur les bords de la carte : strates de terre puis de roche, faces irrégulières */
  private updateSkirt(pal: GroundPalette) {
    const vis = this.world.vis, vcol = this.vcol;
    const p = this.skPos, c = this.skCol, nn = this.skNor;
    const rows = STRATA_T.length;
    const edge = new THREE.Color();
    const px: number[] = new Array(rows), py: number[] = new Array(rows), pz: number[] = new Array(rows);
    const cols: THREE.Color[] = Array.from({ length: rows }, () => new THREE.Color());
    const prev = { x: [...px], y: [...py], z: [...pz], c: cols.map((k) => k.clone()) };
    let o = 0;
    const push = (x: number, y: number, z: number, nx: number, nz: number, k: THREE.Color) => {
      p[o] = x; p[o + 1] = y; p[o + 2] = z; nn[o] = nx; nn[o + 1] = 0; nn[o + 2] = nz;
      c[o] = k.r; c[o + 1] = k.g; c[o + 2] = k.b; o += 3;
    };
    // bord : (sous-sommet de départ, pas le long du bord, normale sortante)
    const sides: [number, number, number, number][] = [[0, 1, 0, -1], [(VS - 1) * VS, 1, 0, 1], [0, VS, -1, 0], [VS - 1, VS, 1, 0]];
    sides.forEach(([start, step, nx, nz], side) => {
      for (let j = 0; j <= C; j++) {
        const vi = start + j * step;
        const ex = (vi % VS) / VR, ez = Math.floor(vi / VS) / VR, top = vis[vi];
        edge.setRGB(vcol[vi * 3], vcol[vi * 3 + 1], vcol[vi * 3 + 2]);
        for (let r = 0; r < rows; r++) {
          const t = STRATA_T[r];
          // les rangées intermédiaires bombent vers l'extérieur (sauf aux angles, partagés par deux bords)
          const inner = r > 1 && r < rows - 1 && j > 0 && j < C;
          const bulge = inner ? (hash2(j, r, side) - 0.3) * 0.3 : 0;
          px[r] = ex + nx * bulge; pz[r] = ez + nz * bulge;
          py[r] = top + (SKIRT_BOTTOM - top) * t + (inner ? (hash2(j, r, side + 7) - 0.5) * 0.25 : 0);
          if (r === 0) cols[r].copy(edge);
          else if (r === 1) cols[r].copy(edge).lerp(STRATA[0], top > 0.1 ? 0.55 : 0.85);
          else cols[r].copy(STRATA[r - 1]).multiplyScalar(0.92 + hash2(j, r, side + 13) * 0.14);
          if (r <= 1 && pal.snow > 0) cols[r].lerp(WHITE, pal.snow * 0.6);
        }
        if (j > 0)
          for (let r = 0; r < rows - 1; r++) {
            const a = [prev.x[r], prev.y[r], prev.z[r]], b = [px[r], py[r], pz[r]];
            const a2 = [prev.x[r + 1], prev.y[r + 1], prev.z[r + 1]], b2 = [px[r + 1], py[r + 1], pz[r + 1]];
            const ca = prev.c[r], cb = cols[r], ca2 = prev.c[r + 1], cb2 = cols[r + 1];
            for (const [v, k] of [[a, ca], [b, cb], [b2, cb2], [a, ca], [b2, cb2], [a2, ca2]] as [number[], THREE.Color][]) push(v[0], v[1], v[2], nx, nz, k);
          }
        for (let r = 0; r < rows; r++) { prev.x[r] = px[r]; prev.y[r] = py[r]; prev.z[r] = pz[r]; prev.c[r].copy(cols[r]); }
      }
    });
    this.skirt.geometry.attributes.position.needsUpdate = true;
    this.skirt.geometry.attributes.color.needsUpdate = true;
    this.skirt.geometry.attributes.normal.needsUpdate = true;
  }

  animateWater(t: number, calm = 1) {
    this.frame++;
    const arr = this.waterGeo.attributes.position.array as Float32Array;
    const b = this.waterBase;
    for (let i = 0; i < arr.length; i += 3) {
      const x = b[i], z = b[i + 2];
      arr[i + 1] = SEA + (Math.sin(x * 0.9 + t * 1.3) + Math.sin(z * 1.1 + t * 1.1) + Math.sin((x + z) * 0.5 + t * 0.7)) * 0.018 * calm;
    }
    this.waterGeo.attributes.position.needsUpdate = true;
    if (this.frame % 2 === 0) this.waterGeo.computeVertexNormals();
    this.waterU.uTime.value = t;
    this.waterMat.normalMap!.offset.set(t * 0.011, t * 0.007);
  }

  /** Lance un rayon contre le relief ; retourne le point d'impact monde ou null */
  pick(ray: THREE.Ray): THREE.Vector3 | null {
    const w = this.world;
    const o = ray.origin, d = ray.direction;
    const inside = (x: number, z: number) => x >= 0 && z >= 0 && x <= N && z <= N;
    let prevT = 0, hit = false, t = 0;
    for (t = 0; t < 400; t += 0.4) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (inside(x, z) && y <= w.hAt(x, z)) { hit = true; break; }
      prevT = t;
    }
    if (!hit) return null;
    let lo = prevT, hi = t;
    for (let i = 0; i < 12; i++) {
      const m = (lo + hi) / 2;
      const x = o.x + d.x * m, y = o.y + d.y * m, z = o.z + d.z * m;
      if (y <= w.hAt(x, z)) hi = m; else lo = m;
    }
    const x = o.x + d.x * hi, z = o.z + d.z * hi;
    return new THREE.Vector3(x, w.hAt(x, z), z);
  }
}
