import * as THREE from 'three';
import { World, N, SEA, VR, VS, VEG_CAVE, VEG_FIELD, VEG_FISSURE, VEG_VOLCANO, BIOME_DESERT, BIOME_MARSH, BIOME_TROPICAL, CAVE_TUNNEL, SNOW_LINE, VolcanoFrame } from '../world/world';
import { hash2, clamp, smoothstep } from '../core/rng';
import { Simplex } from '../world/noise';
import { groundDetailTexture, waterNormalTexture } from './textures';
import { Blight, blightAt, purityAt } from '../world/blight';
import { SeasonState, seasonOf } from './season';
import { SNOW_COLORS, ICE_COLOR } from './seasonConfig';
import { SNOW_U, SNOW_SUN } from './snow';

/** Teintes de saison du sol et de l'eau : l'état de saison complet (seasonConfig.ts) */
export type GroundPalette = SeasonState;

const SAND = new THREE.Color(0xeedcaa);
const WET_SAND = new THREE.Color(0xd8c79c);
const SEABED = new THREE.Color(0x6f9a96);
const ROCK = new THREE.Color(0xc2b2a2);
const MOUNTAIN = new THREE.Color(0xa49d99);
/** falaises de craie (façon Étretat) et basalte autour des volcans */
const CHALK = new THREE.Color(0xf0ebdf);
const BASALT = new THREE.Color(0x4e4645);
const VOLCANO_BROWN = new THREE.Color(0x7d5c40);
const GRAVEL = new THREE.Color(0xb9b1a6);
const WHITE = new THREE.Color(0xf4f7fb);
/** Neige : teinte de base, bleutée dans les creux, éclatante sur les bosses */
const SNOW_BASE = new THREE.Color(SNOW_COLORS.base), SNOW_SHADE = new THREE.Color(SNOW_COLORS.shade), SNOW_LIT = new THREE.Color(SNOW_COLORS.lit);
const HIGH = new THREE.Color(0xc9d79a);
const TILLED = new THREE.Color(0xa47b52);
const BEDS = new THREE.Color(0x8a6548);
/** Sol des anciens jardins (il n'en reste plus : voir `World.fromJSON`) */
const LAWN = new THREE.Color(0x74c060);
const UNDERGROWTH = new THREE.Color(0x6f9c5c);
const YARD = new THREE.Color(0xcdb791);
/** Sols des biomes (tempéré = herbe de saison) : taïga, désert, tropiques, marais */
const TAIGA = new THREE.Color(0x6a9576);
const DESERT = new THREE.Color(0xe8cf98);
const DESERT_RED = new THREE.Color(0xd9ad7a);
const TROPIC = new THREE.Color(0x74cc6c);
const MARSH = new THREE.Color(0x86a062);
const MUD = new THREE.Color(0x6f6448);
/** Ravins : parois de roche, fond sombre */
const RAVINE_WALL = new THREE.Color(0x8a7f74);
const RAVINE_DEEP = new THREE.Color(0x3a332e);
/** Champs de lave refroidie : basalte noir, puis mousse quand la végétation revient ; glace des glaciers */
const LAVA_FIELD = new THREE.Color(0x35302e);
const LAVA_MOSS = new THREE.Color(0x6f7a4a);
/** Gisements de pétrole : terre imbibée de brun sombre, et taches de brut presque noires */
const OIL_SOIL = new THREE.Color(0x5a4c3e);
const OIL_TAR = new THREE.Color(0x1c1814);
const ICE = new THREE.Color(0xcfe6f4);
/** Sol contaminé de l'île du portail : noirci, veiné de rouge braise, cendre violacée en lisière ; herbe drue des halos */
const BLIGHT_CHAR = new THREE.Color(0x2c2128), BLIGHT_EMBER = new THREE.Color(0x86342a), BLIGHT_ASH = new THREE.Color(0x6e5a66);
const PURE_GRASS = new THREE.Color(0x6fcf5a);
/** Halos de purification au plus, pour la lueur de nuit */
const MAX_HALOS = 8;
const MAX_CAVES = 24;
/** Lignes de cases reteintes par image quand la saison change */
const RECOLOR_ROWS = 6;
/** Part de la neige de saison qui tient dans chaque biome */
/** Neige que retient chaque biome (tempéré, taïga, désert, tropical, marais) */
export const SNOWY = [1, 1, 0.15, 0.2, 1];
/** Nombre de biomes */
const NB = 5;
/** Strates de la falaise sous l'île, de la terre du haut à la roche du bas */
const STRATA = [0xb58c66, 0xd2bda2, 0xb5a08c, 0x9c8a7c, 0x857869].map((c) => new THREE.Color(c));
/** Profondeur relative des rangées de la falaise (0 = bord du relief, 1 = base) */
const STRATA_T = [0, 0.05, 0.27, 0.5, 0.75, 1];
const SKIRT_BOTTOM = -3.5;
/** Part de la normale de face dans l'ombrage : garde un léger facettage low-poly sur un relief lissé */
const FACE_MIX = 0.3;
/** Sous la neige, les facettes se marquent davantage : part de la normale de la facette quand la neige couvre tout */
const SNOW_FACE_MIX = 0.8;
/**
 * Épaisseur de la neige au sol (affichage seul, le relief du jeu ne bouge pas) : couche de fond, bourrelets en plus, congère
 * à une demi-case des bâtiments. Nulle sur les routes, les champs, près de l'eau et dans l'emprise des bâtiments : ce qui y
 * est posé à fleur de sol (clôtures de 0,12, bancs, pavés) resterait dessous
 */
const SNOW_DEPTH = 0.025, SNOW_DRIFT = 0.05, SNOW_BANK = 0.06;
/** Sous-cases par côté (selon la taille de la carte) */
const subCells = () => N * VR;

/**
 * Contamination de l'île du portail dans les shaders (sol et eau) : son intensité au point, comme `blightAt` (sans le bord
 * festonné : la lueur reste en deçà de la teinte des sommets), éteinte dans les halos des défenses
 */
const BLIGHT_GLSL = /* glsl */ `
uniform vec4 uBlight;
uniform float uBlightNight;
uniform vec3 uHalos[${MAX_HALOS}];
uniform int uHaloN;
float blightK(vec2 p) {
  if (uBlight.w <= 0.0) return 0.0;
  float d = distance(p, uBlight.xy);
  if (d > uBlight.z) return 0.0;
  float b = (0.35 + 0.65 * uBlight.w) * (1.0 - smoothstep(min(1.6, uBlight.z * 0.6), uBlight.z, d));
  for (int i = 0; i < ${MAX_HALOS}; i++) {
    if (i >= uHaloN) break;
    vec3 h = uHalos[i];
    b *= 1.0 - 0.9 * (1.0 - smoothstep(h.z * 0.55, h.z, distance(p, h.xy)));
  }
  return b;
}`;

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
    /** amplitude de la houle (plus calme par gros temps) */
    uCalm: { value: 1 },
    uHeight: { value: null as THREE.Texture | null },
    uDetail: { value: null as THREE.Texture | null },
    uShallow: { value: new THREE.Color() },
    uDeep: { value: new THREE.Color() },
    /** courant des rivières : sens vers la mer (r, g) et force (b), par case */
    uFlow: { value: null as THREE.Texture | null },
    /** avancée du courant (vitesse de saison cumulée : elle change sans faire sauter les stries) */
    uFlowT: { value: 0 },
    /** limpidité des hauts-fonds, reflet du ciel, gel, débris qui dérivent (pétales, feuilles) : saison */
    uClarity: { value: 1 },
    uSparkle: { value: 0.35 },
    uIce: { value: 0 },
    uIceCol: { value: new THREE.Color(ICE_COLOR) },
    uFloat: { value: new THREE.Color() },
    uFloatK: { value: 0 },
  };
  private lastWaterT = -1;
  private flowTex = new THREE.DataTexture(new Uint8Array(N * N * 4), N, N);
  /** Relief affiché en texture (demi-flottants) : l'eau en déduit sa profondeur et son écume, la brume son épaisseur */
  private heightTex: THREE.DataTexture;
  get heightTexture() { return this.heightTex; }
  private C = subCells();
  private pos = new Float32Array(this.C * this.C * 6 * 3);
  private col = new Float32Array(this.C * this.C * 6 * 3);
  private nor = new Float32Array(this.C * this.C * 6 * 3);
  private surf = new Float32Array(this.C * this.C * 6 * 4);
  private skPos = new Float32Array(4 * this.C * (STRATA_T.length - 1) * 6 * 3);
  private skCol = new Float32Array(4 * this.C * (STRATA_T.length - 1) * 6 * 3);
  private skNor = new Float32Array(4 * this.C * (STRATA_T.length - 1) * 6 * 3);
  private tmp = new THREE.Color();
  /** Par sous-sommet : normale lissée, couleur, poids des motifs de détail (herbe, sable/terre, roche) */
  private vnor = new Float32Array(VS * VS * 3);
  private vcol = new Float32Array(VS * VS * 3);
  /** motifs par sous-sommet : herbe, sable, roche, neige */
  private vsurf = new Float32Array(VS * VS * 4);
  /** Par sous-sommet : part des cases voisines en forêt / champ / jardin / rocaille (zones à bords doux) */
  private vegW = new Float32Array(VS * VS * 4);
  private vegCol = [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
  /** Par sous-sommet : terre battue autour des bâtiments, champs de lave refroidie */
  private yardW = new Float32Array(VS * VS);
  private lavaW = new Float32Array(VS * VS);
  /** Par sous-sommet : part des cases voisines sur un gisement de pétrole */
  private oilW = new Float32Array(VS * VS);
  /** Par sous-sommet : part des cases voisines sous un port ou à ses abords (le terre-plein et son talus gardent l'herbe : ni grève, ni roche, ni terre battue) */
  private quayW = new Float32Array(VS * VS);
  /** Par sous-sommet : grandes taches de prairie (-1 herbe sombre … 1 herbe claire) */
  private patch = new Float32Array(VS * VS);
  /** Par sous-sommet : bruit fin qui fait onduler les bords des champs et des jardins */
  private wobble = new Float32Array(VS * VS);
  /** Par sous-sommet : bruit des bourrelets de neige ; part des cases voisines où la neige peut s'épaissir ; épaisseur affichée */
  private drift = new Float32Array(VS * VS);
  private openW = new Float32Array(VS * VS);
  private lift = new Float32Array(VS * VS);
  /** Cases d'un torrent ou d'une rivière dessinés à part (`Streams`) : la neige ne s'y épaissit pas */
  wetCell: ((k: number) => boolean) | null = null;
  /** Par case : part de chaque biome alentour (transitions douces), et couleur de sol de chaque biome */
  private biomeW = new Float32Array(N * N * NB);
  private biomeTmp = new Float32Array(N * N * NB);
  private biomeOne = new Float32Array(N * N * NB);
  /** Teintes de saison à refaire, bande par bande : prochaine ligne de cases (-1 si rien), lignes qu'il reste à reteinter */
  private sweep = -1;
  private sweepLeft = 0;
  private sweepPal: GroundPalette | null = null;
  private biomeCol = Array.from({ length: NB }, () => new THREE.Color());
  /** Par sous-sommet : parts des biomes (interpolées entre les centres de cases) */
  private vbw = new Float32Array(VS * VS * NB);
  private zone = [0, 0, 0, 0];
  private cliff = new THREE.Color();
  /** grottes (x, y du seuil, z, cap) : le relief est ouvert à l'intérieur de leur tunnel */
  private caveU = { uCaves: { value: Array.from({ length: MAX_CAVES }, () => new THREE.Vector4()) }, uCaveN: { value: 0 } };
  /** contamination de l'île du portail : teinte du sol (sommets), lueur de nuit du sol et de l'eau (shaders) */
  private blight: Blight | null = null;
  private blightU = {
    /** centre (x, z), rayon, intensité */
    uBlight: { value: new THREE.Vector4() },
    uBlightNight: { value: 0 },
    uHalos: { value: Array.from({ length: MAX_HALOS }, () => new THREE.Vector3()) },
    uHaloN: { value: 0 },
  };

  constructor(private world: World) {
    const detail = groundDetailTexture();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    g.setAttribute('surf', new THREE.BufferAttribute(this.surf, 4));
    const topMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    topMat.onBeforeCompile = (sh) => {
      sh.uniforms.uDetail = { value: detail };
      Object.assign(sh.uniforms, this.caveU, this.blightU, { uSnowSun: SNOW_SUN });
      sh.vertexShader = 'attribute vec4 surf;\nvarying vec4 vSurf;\nvarying vec3 vPos;\nvarying vec3 vNrm;\n'
        + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSurf = surf;\n  vPos = position;\n  vNrm = normal;');
      const T = CAVE_TUNNEL, f = (v: number) => v.toFixed(3), sb = SNOW_BASE;
      sh.fragmentShader = `uniform sampler2D uDetail;
uniform vec3 uSnowSun;
uniform vec4 uCaves[${MAX_CAVES}];
uniform int uCaveN;
varying vec4 vSurf;
varying vec3 vPos;
varying vec3 vNrm;
// motif projeté sur les trois axes, pondéré par l'orientation de la surface : pas d'étirement sur les parois (0.5 = neutre)
vec3 tri(vec3 p, vec3 w, float s) {
  return texture2D(uDetail, p.zy * s).rgb * w.x + texture2D(uDetail, p.xz * s).rgb * w.y + texture2D(uDetail, p.xy * s).rgb * w.z;
}
// bruit doux (valeurs interpolées) pour les congères de neige : sans les fissures du motif de roche
float snH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float snN(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(snH(i), snH(i + vec2(1.0, 0.0)), f.x), mix(snH(i + vec2(0.0, 1.0)), snH(i + vec2(1.0, 1.0)), f.x), f.y);
}
${BLIGHT_GLSL}
` + sh.fragmentShader
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  // sol contaminé de l'île du portail : des veines de braise qui rougeoient, à peine le jour, nettement la nuit
  float bk = blightK(vPos.xz);
  if (bk > 0.0) {
    float sp = texture2D(uDetail, vPos.xz * 0.37 + 0.13).b;
    totalEmissiveRadiance += vec3(0.95, 0.13, 0.05) * bk * (0.015 + uBlightNight * (0.035 + 0.3 * smoothstep(0.6, 0.78, sp)));
  }`)
        .replace('void main() {', `void main() {
  // grottes : le versant qui traverse le tunnel est ouvert (la butte rocheuse recouvre l'ouverture)
  for (int i = 0; i < ${MAX_CAVES}; i++) {
    if (i >= uCaveN) break;
    vec4 c = uCaves[i];
    vec3 d = vPos - c.xyz;
    float lx = d.x * cos(c.w) - d.z * sin(c.w), lz = d.x * sin(c.w) + d.z * cos(c.w), ly = d.y - ${f(T.floor)};
    float t = (${f(T.z0)} - lz) / ${f(T.depth)};
    if (t < -0.05 || t > 1.0 || ly < 0.0) continue;
    float sc = 1.0 - 0.35 * pow(max(t, 0.0), 1.0 / 0.85);
    vec2 e = vec2(lx / (${f(T.a)} * sc), (ly - ${f(T.cy)}) / (${f(T.b)} * sc));
    if (dot(e, e) < 1.1) discard;
  }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
  vec3 bw = pow(abs(normalize(vNrm)), vec3(4.0));
  bw /= bw.x + bw.y + bw.z;
  // bord de la neige net et dentelé, tracé au pixel : la couverture des sommets (fondue sur une demi-case) sert de seuil, un
  // bruit le découpe en plaques où le sol perce, avec un liseré de terre mouillée. Le sol sous la neige se retrouve en ôtant
  // la neige du mélange des sommets (assez juste tant que la neige y est mince ; au-delà, le bord est déjà tout blanc)
  float sn = 0.0;
  if (vSurf.w > 0.01) {
    float snRaw = vSurf.w;
    float jag = snN(vPos.xz * 2.3 + 1.7) * 0.6 + snN(vPos.xz * 5.3 + 4.2) * 0.4 - 0.5;
    float snT = snRaw + jag * 1.7 * snRaw * (1.0 - snRaw);
    sn = smoothstep(0.47, 0.52, snT);
    vec3 snBase = vec3(${f(sb.r)}, ${f(sb.g)}, ${f(sb.b)});
    float c0 = min(snRaw, 0.85);
    vec3 under = clamp((diffuseColor.rgb - snBase * c0) / (1.0 - c0), 0.0, 1.0);
    // marche de la neige : son ombre sur le sol au pied du bord, une lèvre claire en haut
    under *= 1.0 - 0.3 * smoothstep(0.38, 0.47, snT) * (1.0 - sn);
    // au cœur de la neige, la teinte des sommets (creux bleutés, bosses claires) reprend la main
    vec3 snCol = mix(snBase, diffuseColor.rgb, smoothstep(0.8, 1.0, snRaw));
    snCol *= 1.0 + 0.07 * (1.0 - smoothstep(0.52, 0.6, snT));
    diffuseColor.rgb = mix(under, snCol, sn);
  }
  vec3 d1 = tri(vPos, bw, 0.6) - 0.5;
  vec3 d2 = tri(vPos + 0.31, bw, 0.11) - 0.5;
  // sous la neige, les motifs du sol et les strates s'effacent : une neige propre, sans traînées grises
  float clean = 1.0 - sn * 0.9;
  diffuseColor.rgb *= 1.0 + dot(vSurf.xyz, d1 * vec3(0.55, 0.4, 0.6) + d2 * vec3(0.3, 0.2, 0.35)) * clean;
  // strates horizontales sur la craie et la roche
  float strata = smoothstep(0.86, 1.0, sin(vPos.y * 9.0 + sin(vPos.x * 1.1 + vPos.z * 0.7) * 0.8));
  diffuseColor.rgb *= 1.0 - strata * 0.16 * vSurf.z * clean;
  // neige : congères (grandes ondulations), rides du vent aux creux bleutés, grain et paillettes qui s'éteignent au loin ;
  // chaque facette prend sa nuance selon le soleil (crème au soleil, bleutée à contre-jour) ; par grandes zones, un blanc un
  // peu plus chaud ou plus froid
  if (sn > 0.01) {
    vec3 snF = normalize(cross(dFdx(vPos), dFdy(vPos)));
    float toSun = dot(snF, uSnowSun);
    vec3 snTint = mix(vec3(0.8, 0.87, 1.04), vec3(1.04, 1.0, 0.93), smoothstep(-0.1, 0.75, toSun));
    snTint *= 1.0 + vec3(0.03, 0.005, -0.03) * (snN(vPos.xz * 0.05 + 9.0) * 2.0 - 1.0);
    diffuseColor.rgb *= mix(vec3(1.0), snTint, sn);
    float drift = snN(vPos.xz * 0.45 + 3.1) * 0.6 + snN(vPos.xz * 1.3 + 7.7) * 0.4 - 0.5;
    // traînées allongées dans le sens du vent
    float streak = snN(vec2(vPos.x * 0.3 + vPos.z * 0.12, vPos.z * 2.2 - vPos.x * 0.5)) - 0.5;
    float rip = tri(vPos + 0.7, bw, 0.9).g - 0.5;
    float grain = tri(vPos + 1.9, bw, 2.6).g - 0.5;
    float glint = smoothstep(0.78, 0.86, tri(vPos * 1.7 + 4.1, bw, 3.1).b);
    vec3 c = diffuseColor.rgb * (1.0 + (drift * 0.12 + streak * 0.05 + grain * 0.035) * sn);
    c = mix(c, c * vec3(0.9, 0.95, 1.04), clamp(-drift * 2.5, 0.0, 1.0) * 0.3 * sn);
    c = mix(c, c * vec3(0.92, 0.96, 1.03), clamp(-rip * 2.2, 0.0, 1.0) * 0.3 * sn);
    diffuseColor.rgb = c + glint * 0.12 * sn;
  }`);
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
    this.heightTex = new THREE.DataTexture(new Uint16Array(VS * VS * 2), VS, VS, THREE.RGFormat, THREE.HalfFloatType);
    this.heightTex.magFilter = this.heightTex.minFilter = THREE.LinearFilter;
    this.waterU.uHeight.value = this.heightTex;
    this.waterU.uDetail.value = detail;
    this.flowTex.magFilter = this.flowTex.minFilter = THREE.LinearFilter;
    this.waterU.uFlow.value = this.flowTex;
    const pg = new THREE.PlaneGeometry(N, N, N, N).rotateX(-Math.PI / 2).translate(N / 2, 0, N / 2);
    this.waterGeo = pg;
    this.waterBase = (pg.attributes.position.array as Float32Array).slice();
    const normalMap = waterNormalTexture();
    normalMap.repeat.set(9 * N / 48, 9 * N / 48);
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, roughness: 0.1, metalness: 0, depthWrite: false, normalMap, normalScale: new THREE.Vector2(0.4, 0.4) });
    this.waterMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.waterU, this.blightU, SNOW_U);
      // houle calculée par la carte graphique (même vague que les canards de la faune) : plus de sommets à recopier à chaque image
      sh.vertexShader = 'uniform float uTime;\nuniform float uCalm;\nvarying vec2 vWater;\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
  float wA = position.x * 0.9 + uTime * 1.3, wB = position.z * 1.1 + uTime * 1.1, wC = (position.x + position.z) * 0.5 + uTime * 0.7;
  float wK = 0.018 * uCalm;
  objectNormal = normalize(vec3(-wK * (0.9 * cos(wA) + 0.5 * cos(wC)), 1.0, -wK * (1.1 * cos(wB) + 0.5 * cos(wC))));`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  transformed.y = ${SEA.toFixed(4)} + (sin(wA) + sin(wB) + sin(wC)) * wK;
  vWater = (modelMatrix * vec4(transformed, 1.0)).xz;`);
      sh.fragmentShader = `uniform float uTime;\nuniform sampler2D uHeight;\nuniform sampler2D uDetail;\nuniform sampler2D uFlow;\nuniform vec3 uShallow;\nuniform vec3 uDeep;\nvarying vec2 vWater;\n`
        + `uniform float uFlowT;\nuniform float uClarity;\nuniform float uSparkle;\nuniform float uIce;\nuniform vec3 uIceCol;\nuniform vec3 uFloat;\nuniform float uFloatK;\nuniform sampler2D uSnowMap;\nuniform float uSnowSize;\n${BLIGHT_GLSL}\n`
        + sh.fragmentShader
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  // autour de l'île du portail, près de lui : une eau un peu rougeâtre, écumeuse, qui luit la nuit
  if (uBlight.w > 0.0) {
    float wd = distance(vWater, uBlight.xy);
    float wb = uBlight.w * (1.0 - smoothstep(uBlight.z * 0.7, uBlight.z * 1.2 + 2.5, wd));
    if (wb > 0.0) {
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.2, 0.26), wb * 0.38);
      float fn = texture2D(uDetail, vWater * 0.8 - vec2(uTime * 0.03, uTime * 0.017)).b;
      float froth = smoothstep(0.58, 0.74, fn) * wb * 0.45;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.78, 0.74), froth);
      diffuseColor.a = max(diffuseColor.a, froth * 0.85);
      totalEmissiveRadiance += vec3(0.7, 0.1, 0.06) * wb * uBlightNight * 0.3;
    }
  }`)
          .replace('#include <color_fragment>', `#include <color_fragment>
  // relief sous l'eau (r) et part de marais (g, négatif au fond des ravins : pas d'eau) : eau dormante, sombre et sans écume
  vec2 hg = texture2D(uHeight, (vWater * ${VR.toFixed(1)} + 0.5) / ${VS.toFixed(1)}).rg;
  if (hg.g < -0.3) discard;
  float ground = hg.r, calm = clamp(hg.g, 0.0, 1.0);
  float depth = max(0.0, ${SEA.toFixed(1)} - ground);
  diffuseColor.rgb = mix(uShallow, uDeep, 1.0 - exp(-depth * 1.2));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.42, 0.33), calm * 0.65);
  // eau limpide au printemps et l'été (on voit le fond des hauts-fonds), plus sombre et plus opaque l'automne
  diffuseColor.a = mix(mix(0.32 / uClarity, 0.93, smoothstep(0.0, 1.8 * uClarity, depth)), 0.88, calm * 0.7);
  // écume : bande claire qui respire le long du rivage, découpée par un bruit qui dérive
  float n = texture2D(uDetail, vWater * 0.45 + vec2(uTime * 0.02, uTime * 0.013)).b;
  float band = 1.0 - smoothstep(0.0, 0.16 + 0.06 * sin(uTime * 1.4 + vWater.x * 1.3 + vWater.y * 0.9), depth);
  float foam = smoothstep(0.42, 0.62, n + band * 0.45) * band * (1.0 - calm * 0.9);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), foam * 0.8);
  diffuseColor.a = max(diffuseColor.a, foam * 0.9);
  // rivières : stries claires qui filent vers l'aval, étirées dans le sens du courant. Le motif est tracé dans le repère
  // de chaque maille d'une grille (3 cases), tourné autour du centre de la maille, et les quatre mailles voisines se
  // fondent l'une dans l'autre. Un repère tourné autour de l'origine du monde décalait les rangs de plusieurs tirets pour
  // un centième de radian d'écart de direction : des franges serrées en courbes de niveau, en chevrons et en spirales.
  // La texture du courant est filtrée : hors de l'eau elle vaut 0 (alpha compris), d'où la direction 2 rg - a.
  vec4 fl = texture2D(uFlow, vWater / ${N.toFixed(1)});
  if (fl.b > 0.02) {
    vec2 pdir = normalize(fl.rg * 2.0 - fl.a + 1e-4);
    vec2 gp = vWater / 3.0 - 0.5, g0 = floor(gp), gt = fract(gp);
    gt = gt * gt * (3.0 - 2.0 * gt);
    float lines = 0.0, wSum = 0.0, bitK = 0.0;
    vec3 bitC = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      vec2 o = vec2(mod(float(i), 2.0), floor(float(i) * 0.5));
      vec2 cell = g0 + o, c = (cell + 0.5) * 3.0;
      vec4 cf = texture2D(uFlow, c / ${N.toFixed(1)});
      vec2 dir = cf.a > 0.3 ? normalize(cf.rg * 2.0 - cf.a + 1e-4) : pdir;
      float w = mix(1.0 - gt.x, gt.x, o.x) * mix(1.0 - gt.y, gt.y, o.y);
      vec2 rel = vWater - c;
      vec2 q = vec2(dot(rel, dir), dot(rel, vec2(-dir.y, dir.x)));
      float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
      // tirets fins et espacés, un rang sur deux environ, qui avancent vers l'aval
      float lane = q.y * 1.5 + h * 7.0, row = floor(lane), rh = fract(sin(row * 12.9898 + h * 31.7) * 43758.5453);
      float f = fract(q.x * 0.34 - uFlowT * 0.22 + rh * 3.0);
      float dash = smoothstep(0.0, 0.08, f) * smoothstep(0.34, 0.12, f) * smoothstep(0.17, 0.05, abs(fract(lane) - 0.5)) * step(0.45, rh);
      lines += dash * w;
      wSum += w;
      // pétales au printemps, feuilles mortes à l'automne : de petits losanges qui dérivent au fil du courant (chance
      // réduite : les mailles voisines superposent chacune les leurs)
      if (uFloatK > 0.01) {
        vec2 fq = vec2(q.x * 1.4 - uFlowT * 0.5, q.y * 1.4) + h * 17.0;
        vec2 fc = floor(fq), ff = fract(fq) - 0.5;
        float fh = fract(sin(dot(fc, vec2(41.3, 289.1))) * 43758.5453);
        vec2 fo = vec2(fract(fh * 13.7), fract(fh * 71.3)) - 0.5;
        float fd = abs(ff.x - fo.x * 0.5) * 1.5 + abs(ff.y - fo.y * 0.5);
        float bit = step(fh, uFloatK * 0.2 * clamp(fl.b * 3.0, 0.0, 1.0)) * (1.0 - smoothstep(0.14, 0.17, fd)) * w;
        bitC += uFloat * (0.82 + 0.36 * fract(fh * 7.1)) * bit;
        bitK += bit;
      }
    }
    lines = clamp(lines * fl.b * 2.0 / max(wSum, 1e-3), 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.97, 1.0), lines * 0.4);
    diffuseColor.a = max(diffuseColor.a, lines * 0.6);
    if (bitK > 0.001) {
      diffuseColor.rgb = mix(diffuseColor.rgb, bitC / bitK, min(1.0, bitK));
      diffuseColor.a = max(diffuseColor.a, min(1.0, bitK));
    }
  }
  // glace l'hiver : elle part des rives et des eaux dormantes, en plaques aux bords irréguliers ; l'eau reste libre là où le
  // courant est fort, au large, et là où la neige ne tient pas (tropiques, désert)
  if (uIce > 0.01) {
    float iz = texture2D(uDetail, vWater * 0.3).b, iz2 = texture2D(uDetail, vWater * 0.11 + 0.37).b;
    float ice = uIce * smoothstep(0.3, 0.8, texture2D(uSnowMap, vWater / uSnowSize).r) * (1.0 - smoothstep(0.1, 0.45, fl.b) * 0.85);
    float reach = ice * (0.45 + calm * 1.6) * (0.6 + iz2 * 0.9);
    float iceK = ice > 0.02 ? 1.0 - smoothstep(reach * 0.8, reach * 1.05 + 0.02, depth + (iz - 0.5) * 0.35) : 0.0;
    if (iceK > 0.0) {
      // voile de neige par endroits, fissures plus sombres
      float crack = 1.0 - smoothstep(0.0, 0.035, abs(fract(iz * 7.0) - 0.5));
      vec3 ic = mix(uIceCol, vec3(0.92, 0.95, 0.97), smoothstep(0.55, 0.78, iz) * 0.7) * (1.0 - crack * 0.16);
      diffuseColor.rgb = mix(diffuseColor.rgb, ic, iceK);
      diffuseColor.a = mix(diffuseColor.a, 0.96, iceK);
    }
  }`)
          .replace('#include <opaque_fragment>', `vec3 skyCol = vec3(0.8, 0.9, 0.97);
#ifdef USE_FOG
  skyCol = fogColor;
#endif
  float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 5.0);
  outgoingLight = mix(outgoingLight, skyCol * vec3(0.85, 0.93, 1.0), fres * uSparkle);
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
    for (let z = 0; z < VS; z++) for (let x = 0; x < VS; x++) this.wobble[z * VS + x] = sx.noise2((x / VR) * 0.8 + 50, (z / VR) * 0.8);
    for (let z = 0; z < VS; z++) for (let x = 0; x < VS; x++) this.drift[z * VS + x] = sx.noise2((x / VR) * 0.55 + 20, (z / VR) * 0.55 + 80) * 0.65 + sx.noise2((x / VR) * 1.4 - 30, (z / VR) * 1.4) * 0.35;
    this.update(seasonOf(0));
  }

  /** De l'eau à moins de `r` cases de la zone (cases, bornes incluses) ? */
  private waterNear(rect: [number, number, number, number], r: number) {
    const w = this.world;
    for (let cz = Math.max(0, rect[1] - r); cz <= Math.min(N - 1, rect[3] + r); cz++)
      for (let cx = Math.max(0, rect[0] - r); cx <= Math.min(N - 1, rect[2] + r); cx++) if (w.cellAvg(cx, cz) < 0.08 || w.lake[w.ci(cx, cz)]) return true;
    return false;
  }

  /**
   * Courant des rivières : l'eau descend la vallée, seulement dans les chenaux étroits. L'axe suit le bord de l'eau ; le
   * sens va vers les berges plus basses le long de cet axe (des hautes vallées vers les basses)
   */
  private computeFlow() {
    const w = this.world, R = 4, S = N + 1;
    const wet = (k: number) => w.cellAvg(k % N, Math.floor(k / N)) < -0.05 && !w.lake[k];
    // tables cumulées : somme des hauteurs et nombre de cases de terre, pour une moyenne en carré en temps constant
    const sumH = new Float64Array(S * S), cnt = new Float64Array(S * S), land = new Int16Array(N * N).fill(-1), q: number[] = [];
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        const k = z * N + x, dry = !wet(k), i = (z + 1) * S + x + 1;
        sumH[i] = (dry ? w.cellAvg(x, z) : 0) + sumH[i - 1] + sumH[i - S] - sumH[i - S - 1];
        cnt[i] = (dry ? 1 : 0) + cnt[i - 1] + cnt[i - S] - cnt[i - S - 1];
        if (dry) { land[k] = 0; q.push(k); }
      }
    const nb = (k: number) => { const x = k % N, z = Math.floor(k / N); return [x > 0 ? k - 1 : -1, x < N - 1 ? k + 1 : -1, z > 0 ? k - N : -1, z < N - 1 ? k + N : -1]; };
    // largeur : distance à la rive, au plus quelques cases
    for (let h = 0; h < q.length; h++) { const d = land[q[h]]; if (d >= 4) continue; for (const j of nb(q[h])) if (j >= 0 && land[j] < 0) { land[j] = d + 1; q.push(j); } }
    const bank = (x: number, z: number) => {
      const x0 = Math.max(0, x - R), z0 = Math.max(0, z - R), x1 = Math.min(N, x + R + 1), z1 = Math.min(N, z + R + 1);
      const c = cnt[z1 * S + x1] - cnt[z0 * S + x1] - cnt[z1 * S + x0] + cnt[z0 * S + x0];
      return c ? (sumH[z1 * S + x1] - sumH[z0 * S + x1] - sumH[z1 * S + x0] + sumH[z0 * S + x0]) / c : 0;
    };
    // axe du chenal : la pente moyenne des berges va surtout d'une rive à l'autre (une rive plus haute que l'autre) ; l'axe
    // vient donc du bord de l'eau. Part de terre en carré de rayon 2, son gradient (vers les rives), puis tenseur de
    // structure de ce gradient en carré de rayon 3 : son vecteur propre mineur suit le chenal, même en son milieu où le
    // gradient s'annule
    const box = (t: Float64Array, x: number, z: number, r: number) => {
      const x0 = Math.max(0, x - r), z0 = Math.max(0, z - r), x1 = Math.min(N, x + r + 1), z1 = Math.min(N, z + r + 1);
      return [t[z1 * S + x1] - t[z0 * S + x1] - t[z1 * S + x0] + t[z0 * S + x0], (x1 - x0) * (z1 - z0)];
    };
    const dryF = new Float32Array(N * N);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { const [c, a] = box(cnt, x, z, 2); dryF[z * N + x] = c / a; }
    const jxx = new Float64Array(S * S), jxz = new Float64Array(S * S), jzz = new Float64Array(S * S);
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        const gx = dryF[z * N + Math.min(N - 1, x + 1)] - dryF[z * N + Math.max(0, x - 1)];
        const gz = dryF[Math.min(N - 1, z + 1) * N + x] - dryF[Math.max(0, z - 1) * N + x], i = (z + 1) * S + x + 1;
        jxx[i] = gx * gx + jxx[i - 1] + jxx[i - S] - jxx[i - S - 1];
        jxz[i] = gx * gz + jxz[i - 1] + jxz[i - S] - jxz[i - S - 1];
        jzz[i] = gz * gz + jzz[i - 1] + jzz[i - S] - jzz[i - S - 1];
      }
    const data = this.flowTex.image.data as Uint8Array;
    data.fill(0);
    for (let k = 0; k < N * N; k++) {
      if (!wet(k) || land[k] < 0) continue;
      const x = k % N, z = Math.floor(k / N);
      const a = box(jxx, x, z, 3)[0], b = box(jxz, x, z, 3)[0], c = box(jzz, x, z, 3)[0];
      if (a + c < 1e-6) continue;
      const th = 0.5 * Math.atan2(2 * b, a - c);
      let vx = -Math.sin(th), vz = Math.cos(th);
      // sens : vers l'aval, là où les berges sont plus basses, 4 cases plus loin le long de l'axe
      const at = (s: number) => bank(Math.min(N - 1, Math.max(0, Math.round(x + vx * s))), Math.min(N - 1, Math.max(0, Math.round(z + vz * s))));
      const drop = at(-4) - at(4);
      if (drop < 0) { vx = -vx; vz = -vz; }
      const narrow = Math.min(1, Math.max(0, (4.5 - land[k]) / 2.5)), strong = Math.min(1, 0.45 + Math.abs(drop) * 1.5);
      data[k * 4] = Math.round((vx * 0.5 + 0.5) * 255);
      data[k * 4 + 1] = Math.round((vz * 0.5 + 0.5) * 255);
      data[k * 4 + 2] = Math.round(narrow * strong * 255);
      data[k * 4 + 3] = 255;
    }
    this.flowTex.needsUpdate = true;
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
    const ng = geo.index ? geo.toNonIndexed() : geo;
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

  /**
   * Nouvelle saison : les teintes du sol se refont par bandes, sur quelques images (pas d'à-coup sur une grande carte). Un
   * balayage en cours n'est pas renvoyé en haut de la carte : il continue d'où il en est et fait le tour complet. Repris du
   * haut à chaque nouvelle teinte, il n'atteignait jamais le bas de la carte quand les saisons filent vite (×4, saisons
   * courtes, images rares) : la neige y restait l'été, derrière une limite droite
   */
  recolor(pal: GroundPalette) {
    this.sweepPal = pal;
    if (this.sweep < 0) this.sweep = 0;
    this.sweepLeft = N;
  }

  /** Avance d'une bande la mise à jour des teintes de saison ; la falaise du bord suit à chaque tour de la carte */
  stepRecolor() {
    if (this.sweep < 0 || !this.sweepPal) return;
    const z0 = this.sweep, z1 = Math.min(N - 1, z0 + Math.min(RECOLOR_ROWS, this.sweepLeft) - 1);
    this.update(this.sweepPal, [0, z0, N - 1, z1], true);
    this.sweepLeft -= z1 - z0 + 1;
    this.sweep = z1 >= N - 1 ? 0 : z1 + 1;
    if (z1 >= N - 1 || this.sweepLeft <= 0) this.updateSkirt(this.sweepPal);
    if (this.sweepLeft <= 0) this.sweep = -1;
  }

  /**
   * Reconstruit géométrie et couleurs ; `rect` (cases, bornes incluses) limite le travail à la zone retouchée,
   * `colorsOnly` aux seules teintes (saison) : sur une grande carte, tout refaire à chaque coup de pinceau serait trop lent
   */
  update(pal: GroundPalette, rect: [number, number, number, number] | null = null, colorsOnly = false) {
    const w = this.world;
    if (!colorsOnly) w.updateVis(rect);
    // sous-sommets à recalculer : ceux dont le relief a changé (plus un, pour les normales), ou les lignes à reteinter
    let x0 = 0, z0 = 0, x1 = VS - 1, z1 = VS - 1;
    if (rect && colorsOnly) {
      x0 = Math.max(0, rect[0] * VR); z0 = Math.max(0, rect[1] * VR); x1 = Math.min(VS - 1, (rect[2] + 1) * VR); z1 = Math.min(VS - 1, (rect[3] + 1) * VR);
    } else if (rect) {
      const [a, b, c, d] = w.visWindow;
      x0 = Math.max(0, a - 1); z0 = Math.max(0, b - 1); x1 = Math.min(VS - 1, c + 1); z1 = Math.min(VS - 1, d + 1);
    }
    const full = x0 === 0 && z0 === 0 && x1 === VS - 1 && z1 === VS - 1;
    // le courant des rivières (toute la carte) ne change que si le relief a bougé près de l'eau
    if (!colorsOnly && (!rect || this.waterNear(rect, 6))) this.computeFlow();
    const vis = w.vis, vnor = this.vnor, vcol = this.vcol, vsurf = this.vsurf;
    const vw = this.vegW, yw = this.yardW, patch = this.patch, tmp = this.tmp, bl = this.blight;

    // grottes : tunnel à ouvrir dans le relief ; volcans : hauteur du pied et du bord du cratère, pour teinter le cône selon l'altitude
    let nCaves = 0;
    const volcanoes: VolcanoFrame[] = [];
    for (let k = 0; k < N * N; k++) {
      const t = w.veg[k], cx = k % N, cz = Math.floor(k / N);
      if (t === VEG_CAVE && nCaves < MAX_CAVES) { const f = w.caveFrame(cx, cz); this.caveU.uCaves.value[nCaves++].set(f.x, f.y, f.z, f.yaw); }
      else if (t === VEG_VOLCANO) volcanoes.push(w.volcanoFrame(cx, cz));
    }

    // relief et marais pour l'eau
    this.caveU.uCaveN.value = nCaves;
    this.blurBiomes(x0, z0, x1, z1);
    const hd = this.heightTex.image.data as Uint16Array;
    for (let z = z0; z <= z1; z++)
      for (let i = z * VS + x0; i <= z * VS + x1; i++) {
        hd[i * 2] = THREE.DataUtils.toHalfFloat(vis[i]);
        hd[i * 2 + 1] = THREE.DataUtils.toHalfFloat(w.ravine[i] > 0.02 ? -1 : this.vbw[i * NB + BIOME_MARSH]);
      }
    this.heightTex.needsUpdate = true;

    // normales lissées (différences centrées)
    if (!colorsOnly) for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const xl = Math.max(0, x - 1), xr = Math.min(VS - 1, x + 1), zl = Math.max(0, z - 1), zr = Math.min(VS - 1, z + 1);
        const dx = ((vis[z * VS + xr] - vis[z * VS + xl]) * VR) / (xr - xl);
        const dz = ((vis[zr * VS + x] - vis[zl * VS + x]) * VR) / (zr - zl);
        const l = Math.hypot(dx, 1, dz), i = (z * VS + x) * 3;
        vnor[i] = -dx / l; vnor[i + 1] = 1 / l; vnor[i + 2] = -dz / l;
      }

    // les abords des ports : leur emprise et deux cases tout autour (le talus du terre-plein), hors de l'eau
    const quayNear = new Set<number>();
    for (const b of w.buildings.values()) {
      if (b.kind !== 'harbor') continue;
      const s = b.small ? 2 : 3;
      for (let cz = b.z - 2; cz < b.z + s + 2; cz++) for (let cx = b.x - 2; cx < b.x + s + 2; cx++) if (w.inCells(cx, cz) && (w.occ[w.ci(cx, cz)] === b.id || w.cellAvg(cx, cz) > 0.05)) quayNear.add(w.ci(cx, cz));
    }
    // zones : part des cases qui touchent chaque sous-sommet (1 au centre d'une case, ½ sur un bord)
    for (let z = z0; z <= z1; z++) {
      const cz1 = Math.min(N - 1, Math.floor(z / VR)), cz0 = z % VR === 0 ? cz1 - (z === VS - 1 ? 0 : 1) : cz1;
      for (let x = x0; x <= x1; x++) {
        const cx1 = Math.min(N - 1, Math.floor(x / VR)), cx0 = x % VR === 0 ? cx1 - (x === VS - 1 ? 0 : 1) : cx1;
        let n = 0, y = 0, lava = 0, oil = 0, quay = 0, open = 0;
        const f = this.zone;
        f.fill(0);
        for (let cz = cz0; cz <= cz1; cz++)
          for (let cx = cx0; cx <= cx1; cx++) {
            if (!w.inCells(cx, cz)) continue;
            // rocaille, seuil des grottes et abords des failles partagent le sol de gravier (la butte d'une grotte reste en herbe) ;
            // épaves et cratères n'en ont pas
            const k = w.ci(cx, cz), t = w.decor[k] === VEG_FISSURE || w.veg[k] === VEG_CAVE ? 4 : w.veg[k];
            n++;
            if (t >= 1 && t <= 4) f[t - 1]++;
            if (w.occ[k]) y++;
            if (quayNear.has(k)) quay++;
            else if (!w.road[k] && w.veg[k] !== VEG_FIELD && !w.lake[k] && w.waterDist[k] >= 2 && !this.wetCell?.(k)) open++;
            lava += w.basalt[k];
            oil += w.oil[k];
          }
        const i = z * VS + x;
        for (let q = 0; q < 4; q++) vw[i * 4 + q] = n ? f[q] / n : 0;
        // champs et jardins : bords ondulés et coins arrondis, plutôt que des carrés
        for (const q of [1, 2]) { const v = vw[i * 4 + q]; if (v > 0 && v < 1) vw[i * 4 + q] = smoothstep(0.3, 0.7, v + this.wobble[i] * 0.28); }
        yw[i] = n ? y / n : 0;
        this.lavaW[i] = n ? lava / n : 0;
        this.oilW[i] = n ? oil / n : 0;
        this.quayW[i] = n ? quay / n : 0;
        this.openW[i] = n && w.ravine[i] <= 0.02 ? open / n : 0;
      }
    }
    const bc = this.biomeCol;
    bc[0].copy(pal.grass);
    bc[1].copy(pal.grass).lerp(TAIGA, 0.75);
    bc[2].copy(DESERT);
    bc[3].copy(pal.grass).lerp(TROPIC, 0.75);
    bc[4].copy(pal.grass).lerp(MARSH, 0.6);
    const [cForest, cField, cGarden, cRocks] = this.vegCol;
    // sous-bois : mousse et ombre, tapis de feuilles mortes à l'automne, un voile de pétales au printemps
    cForest.copy(pal.grass).lerp(UNDERGROWTH, 0.55).lerp(pal.terrain.litter, pal.terrain.litterK).lerp(pal.foliage, 0.1);
    cField.copy(TILLED).lerp(pal.crop, 0.55);
    // (les anciens jardins : il n'en reste plus, voir `World.fromJSON` ; une pelouse si jamais)
    cGarden.copy(pal.grass).lerp(LAWN, 0.55);
    cRocks.copy(GRAVEL).lerp(pal.grass, 0.15);

    // couleur et motif par sous-sommet : dégradés continus fond marin → sable → herbe → roche → neiges éternelles
    for (let zz = z0; zz <= z1; zz++) for (let i = zz * VS + x0; i <= zz * VS + x1; i++) {
      const h = vis[i];
      let grass = 0, sand = 0, rock = 0, cover = 0;
      if (h < 0.02) {
        // fond vaseux des mares du marais
        tmp.copy(WET_SAND).lerp(SEABED, clamp(-h / 1.6, 0, 1)).lerp(MUD, this.vbw[i * NB + BIOME_MARSH] * 0.8);
        sand = 0.6;
      } else {
        // (le talus du terre-plein d'un port reste en herbe : pas de paroi de roche ni de grève autour du quai)
        const quay = this.quayW[i], steep = (1 - smoothstep(0.6, 0.8, vnor[i * 3 + 1])) * (1 - quay * 0.9), flat = 1 - steep;
        const alt = smoothstep(3.8, 5.4, h), cap = smoothstep(SNOW_LINE[0], SNOW_LINE[1], h);
        // sol du biome (mélange des biomes voisins), neige plus ou moins tenace
        const bw = this.vbw, bo = i * NB;
        tmp.setRGB(0, 0, 0);
        let snow = 0;
        for (let b = 0; b < NB; b++) { const k = bw[bo + b]; if (k > 0) { tmp.r += bc[b].r * k; tmp.g += bc[b].g * k; tmp.b += bc[b].b * k; snow += SNOWY[b] * k; } }
        snow = Math.min(1, pal.snow * snow);
        const dry = bw[bo + BIOME_DESERT], wet = bw[bo + BIOME_MARSH];
        tmp.lerp(HIGH, clamp((h - 2.5) / 4, 0, 0.6) * (1 - snow) * (1 - dry));
        const pv = patch[i];
        // grandes plaques : prairie claire au printemps, herbe un peu sèche l'été, jaunie l'automne (moins sous les tropiques)
        if (pv > 0) {
          if (dry > 0.5) tmp.lerp(DESERT_RED, pv * 0.32 * (1 - snow));
          else tmp.lerp(pal.terrain.patch, pv * pal.terrain.patchK * (1 - snow) * (1 - bw[bo + BIOME_TROPICAL] * 0.7));
        } else tmp.multiplyScalar(1 + pv * 0.13);
        // quelques taches de terre apparente, sur le plat
        const earth = pal.terrain.soilK * flat * smoothstep(0.42, 0.75, this.wobble[i] * 0.7 + pv * 0.5) * (1 - snow) * (1 - dry);
        if (earth > 0) tmp.lerp(pal.terrain.soil, earth);
        // marais : flaques de vase sombre
        if (wet > 0 && pv < 0) tmp.lerp(MUD, -pv * 0.7 * wet);
        // rivages : sable, sauf au marais (berges de vase)
        const beach = (1 - smoothstep(0.12, 0.42, h)) * (1 - quay);
        // haut des berges : herbe fraîche et mousse, feuilles mortes ou givre selon la saison, entre le sable et l'herbe
        const bank = (0.45 + 0.55 * smoothstep(0.15, 0.3, h)) * pal.terrain.bankK * (1 - wet);
        tmp.lerp(SAND, beach * (1 - wet) * (1 - bank)).lerp(pal.terrain.bank, beach * bank).lerp(MUD, beach * wet * 0.6);
        // parois : craie blanche près de la mer, roche plus haut, grise en montagne
        if (steep > 0) tmp.lerp(this.cliff.copy(CHALK).lerp(ROCK, smoothstep(1.5, 3.5, h)).lerp(MOUNTAIN, alt), steep);
        if (alt > 0) tmp.lerp(MOUNTAIN, alt * 0.85);
        // volcan : vert au pied, il vire au brun en montant, plus sombre près du cratère
        let lava = 0, top = 0;
        if (volcanoes.length) {
          const x = (i % VS) / VR, z = Math.floor(i / VS) / VR;
          for (const v of volcanoes) {
            const d = Math.hypot(x - v.x, z - v.z);
            if (d >= v.r) continue;
            const rel = clamp((h - v.foot) / Math.max(0.5, v.rim - v.foot), 0, 1.2);
            const k = smoothstep(0.06, 0.45, rel) * (1 - smoothstep(v.r * 0.8, v.r, d));
            if (k > lava) { lava = k; top = smoothstep(0.82, 1, rel); }
          }
          if (lava > 0) tmp.lerp(VOLCANO_BROWN, lava * 0.95).lerp(BASALT, top * lava * 0.65);
        }
        const yard = yw[i] * (1 - quay), soil = Math.min(1, yard * 0.55 + vw[i * 4 + 1]);
        if (yard > 0) tmp.lerp(YARD, yard * 0.55 * flat);
        // pas de sous-bois vert sous les cactus
        for (let q = 0; q < 4; q++) if (vw[i * 4 + q] > 0) tmp.lerp(this.vegCol[q], vw[i * 4 + q] * (q === 3 ? 1 : flat) * (q === 0 ? 1 - dry : 1));
        // champs de lave refroidie : basalte noir, que la mousse puis l'herbe regagnent
        const lf = this.lavaW[i];
        if (lf > 0) tmp.lerp(this.cliff.copy(LAVA_MOSS).lerp(LAVA_FIELD, smoothstep(0.1, 0.35, lf)), smoothstep(0, 0.18, lf) * 0.94);
        // gisement de pétrole : la terre s'assombrit, le brut y fait des taches noires aux bords irréguliers
        const of = this.oilW[i];
        if (of > 0) {
          const k = smoothstep(0, 0.75, of + this.wobble[i] * 0.25);
          tmp.lerp(OIL_SOIL, k * 0.75).lerp(OIL_TAR, smoothstep(0.1, 0.5, this.wobble[i] + pv * 0.6 + of * 0.5 - 0.35) * k * 0.9);
        }
        // neige : couverture inégale — plaques où l'herbe perce, moins sous les arbres et sur les pentes, qui grandissent
        // avec l'hiver ; bleutée dans les creux, éclatante sur les bosses
        if (snow > 0) {
          // bord doux entre la neige et le sol : la neige s'amincit vers l'herbe (sans plaques blanches découpées)
          cover = smoothstep(0.24, 0.68, snow * 1.2 - 0.12 + (pv * 0.65 + this.wobble[i] * 0.4 - steep * 0.8 - vw[i * 4] * 0.55) * snow);
          const xi = i % VS, zi = (i / VS) | 0;
          const curv = xi > 1 && zi > 1 && xi < VS - 2 && zi < VS - 2 ? (vis[i - 2] + vis[i + 2] + vis[i - 2 * VS] + vis[i + 2 * VS]) * 0.25 - h : 0;
          this.cliff.copy(SNOW_BASE).lerp(SNOW_SHADE, clamp(curv * 4, 0, 0.35)).lerp(SNOW_LIT, clamp(-curv * 5 + 0.2, 0, 0.9));
          tmp.lerp(this.cliff, cover);
        }
        // le volcan reste sombre, sans neige sur ses flancs chauds
        if (cap > 0) tmp.lerp(WHITE, cap * (0.95 - steep * 0.25) * (1 - lava));
        // glaciers : la neige des replats d'altitude tourne à la glace bleutée
        if (cap > 0.5) tmp.lerp(ICE, (cap - 0.5) * 2 * flat * 0.5 * (1 - lava));
        // peu de strates sur le volcan : elles y dessineraient des courbes de niveau
        rock = Math.max((steep + alt - steep * alt) * (1 - lava * 0.7), vw[i * 4 + 3], lava * 0.35, smoothstep(0.3, 0.8, lf) * 0.9);
        sand = Math.max(beach, soil, dry * 0.9) * (1 - rock);
        grass = Math.max(0, 1 - sand - rock);
        // la neige recouvre les motifs du sol (ils restent là où elle est mince) ; elle a les siens
        cover = Math.max(cover, cap * 0.9);
        const smooth = 1 - cover * 0.85;
        grass *= smooth; sand *= smooth; rock *= smooth;
      }
      // ravins : parois de roche, de plus en plus sombres vers le fond
      const rv = w.ravine[i];
      if (rv > 0) {
        tmp.lerp(RAVINE_WALL, smoothstep(0, 0.3, rv) * 0.85).lerp(RAVINE_DEEP, smoothstep(0.3, 1, rv) * 0.85);
        rock = Math.max(rock, rv); grass *= 1 - rv; sand *= 1 - rv;
      }
      // l'île du portail contaminée : sol noirci veiné de braise près du portail, cendre violacée vers la lisière (la neige
      // n'y tient pas) ; dans les halos des défenses, l'herbe repousse drue
      if (bl && h > -0.6) {
        const x = (i % VS) / VR, z = Math.floor(i / VS) / VR;
        if (Math.abs(x - bl.x) < bl.r + 3 && Math.abs(z - bl.z) < bl.r + 3) {
          const b = blightAt(bl, x, z);
          if (b > 0) {
            const k = smoothstep(0.03, 0.6, b), pv = patch[i] * 0.5 + this.wobble[i] * 0.5;
            this.cliff.copy(BLIGHT_ASH).lerp(BLIGHT_CHAR, smoothstep(0.15, 0.5, b)).lerp(BLIGHT_EMBER, clamp(pv * 1.2 + b - 0.9, 0, 0.3));
            tmp.lerp(this.cliff, k * 0.94);
            cover *= 1 - k;
            rock = Math.max(rock * (1 - k), k * 0.65); grass *= 1 - k * 0.8; sand *= 1 - k * 0.6;
          }
          const pu = purityAt(bl, x, z) * (1 - smoothstep(0.03, 0.4, b));
          if (pu > 0 && h > 0.2) tmp.lerp(PURE_GRASS, pu * 0.2 * (1 - cover));
        }
      }
      // occlusion ambiante cuite dans les couleurs : vallons, pieds de falaise et fonds de cratère plus sombres, crêtes un peu plus claires
      const xi = i % VS, zi = (i / VS) | 0;
      if (xi > 2 && zi > 2 && xi < VS - 3 && zi < VS - 3) {
        const l1 = (vis[i - 1] + vis[i + 1] + vis[i - VS] + vis[i + VS]) * 0.25 - h;
        const l3 = (vis[i - 3] + vis[i + 3] + vis[i - 3 * VS] + vis[i + 3 * VS]) * 0.25 - h;
        // sous la neige, les creux bleuissent au lieu de noircir
        tmp.multiplyScalar(1 - clamp(l1 * 0.9 + l3 * 0.3, -0.06, 0.3) * (1 - cover * 0.85));
      }
      vcol[i * 3] = tmp.r; vcol[i * 3 + 1] = tmp.g; vcol[i * 3 + 2] = tmp.b;
      vsurf[i * 4] = grass; vsurf[i * 4 + 1] = sand; vsurf[i * 4 + 2] = rock; vsurf[i * 4 + 3] = cover;
      // épaisseur de la neige : une couche, des bourrelets ; rien sur le bord ni dans l'emprise d'un bâtiment, une congère sur
      // le rang de sous-sommets qui l'entoure
      const open = yw[i] > 0 ? 0 : smoothstep(0.7, 1, this.openW[i]) * smoothstep(0.15, 0.5, h);
      let bank = 0;
      if (open > 0) {
        const xi = i % VS, zi = (i / VS) | 0;
        if (xi > 0 && xi < VS - 1 && zi > 0 && zi < VS - 1) bank = Math.max(yw[i - 1], yw[i + 1], yw[i - VS], yw[i + VS]) > 0 ? 1 : 0;
      }
      this.lift[i] = cover > 0.05 && open > 0
        ? cover * open * (SNOW_DEPTH + SNOW_DRIFT * smoothstep(-0.25, 0.75, this.drift[i]) + SNOW_BANK * bank) : 0;
    }

    // triangles (même découpage que World.hAt)
    const pos = this.pos, col = this.col, nor = this.nor, surf = this.surf, lift = this.lift;
    let o = 0;
    // (la neige change l'épaisseur et les normales : positions et normales se refont aussi aux changements de saison)
    const emit = (vi: number, x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
      const k = vi * 3, fm = FACE_MIX + (SNOW_FACE_MIX - FACE_MIX) * vsurf[vi * 4 + 3];
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
      const mx = nx * fm + vnor[k] * (1 - fm), my = ny * fm + vnor[k + 1] * (1 - fm), mz = nz * fm + vnor[k + 2] * (1 - fm);
      const ml = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
      nor[o] = mx / ml; nor[o + 1] = my / ml; nor[o + 2] = mz / ml;
      col[o] = vcol[k]; col[o + 1] = vcol[k + 1]; col[o + 2] = vcol[k + 2];
      const so = (o / 3) * 4, sk = vi * 4;
      surf[so] = vsurf[sk]; surf[so + 1] = vsurf[sk + 1]; surf[so + 2] = vsurf[sk + 2]; surf[so + 3] = vsurf[sk + 3];
      o += 3;
    };
    // sous-cases dont un sommet a changé ; chacune occupe 18 valeurs (2 triangles × 3 sommets × 3)
    const C = this.C, sx0 = Math.max(0, x0 - 1), sz0 = Math.max(0, z0 - 1), sx1 = Math.min(C - 1, x1), sz1 = Math.min(C - 1, z1);
    for (let cz = sz0; cz <= sz1; cz++)
      for (let cx = sx0; cx <= sx1; cx++) {
        o = (cz * C + cx) * 18;
        const i00 = cz * VS + cx, i10 = i00 + 1, i01 = i00 + VS, i11 = i01 + 1;
        for (let t = 0; t < 2; t++) {
          const ia = i00, ib = t === 0 ? i11 : i01, ic = t === 0 ? i10 : i11;
          const ax = (ia % VS) / VR, az = Math.floor(ia / VS) / VR, ay = vis[ia] + lift[ia];
          const bx = (ib % VS) / VR, bz = Math.floor(ib / VS) / VR, by = vis[ib] + lift[ib];
          const qx = (ic % VS) / VR, qz = Math.floor(ic / VS) / VR, qy = vis[ic] + lift[ic];
          const ux = bx - ax, uy = by - ay, uz = bz - az, wx = qx - ax, wy = qy - ay, wz = qz - az;
          let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
          const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          nx /= l; ny /= l; nz /= l;
          emit(ia, ax, ay, az, nx, ny, nz);
          emit(ib, bx, by, bz, nx, ny, nz);
          emit(ic, qx, qy, qz, nx, ny, nz);
        }
      }
    // envoi au processeur graphique : seulement les rangées touchées
    const ga = this.top.geometry.attributes;
    const sent = [ga.position, ga.color, ga.normal, ga.surf];
    for (const a of sent) {
      const attr = a as THREE.BufferAttribute;
      const per = 6 * attr.itemSize;
      if (!full) for (let cz = sz0; cz <= sz1; cz++) attr.addUpdateRange((cz * C + sx0) * per, (sx1 - sx0 + 1) * per);
      attr.needsUpdate = true;
    }
    // falaise du bord : si la zone le touche (la bande de saison la refait une fois finie)
    if (!colorsOnly && (full || x0 === 0 || z0 === 0 || x1 === VS - 1 || z1 === VS - 1)) this.updateSkirt(pal);
    // eau : hauts-fonds clairs, grand fond, selon la saison
    this.seasonWater(pal);
  }

  /**
   * Part de chaque biome autour de chaque case : flou (boîte 5×5) de la carte des biomes, puis interpolation aux
   * sous-sommets (x0…x1, z0…z1) ; seules les cases qui les touchent sont refaites
   */
  private blurBiomes(x0: number, z0: number, x1: number, z1: number) {
    const w = this.world, a = this.biomeW, t = this.biomeTmp, one = this.biomeOne, R = 2;
    // cases dont la part finale est lue, puis marges des deux passes du flou
    const ax0 = Math.max(0, Math.floor(x0 / VR) - 2), az0 = Math.max(0, Math.floor(z0 / VR) - 2);
    const ax1 = Math.min(N - 1, Math.ceil(x1 / VR) + 1), az1 = Math.min(N - 1, Math.ceil(z1 / VR) + 1);
    const ox0 = Math.max(0, ax0 - R), oz0 = Math.max(0, az0 - R), ox1 = Math.min(N - 1, ax1 + R), oz1 = Math.min(N - 1, az1 + R);
    for (let cz = oz0; cz <= oz1; cz++)
      for (let cx = ox0; cx <= ox1; cx++) {
        const k = cz * N + cx;
        for (let b = 0; b < NB; b++) one[k * NB + b] = 0;
        one[k * NB + w.biome[k]] = 1;
      }
    // passe horizontale (lignes élargies pour la passe verticale) puis verticale
    for (const [src, dst, sx, sz, rz0, rz1] of [[one, t, 1, 0, oz0, oz1], [t, a, 0, 1, az0, az1]] as [Float32Array, Float32Array, number, number, number, number][]) {
      for (let cz = rz0; cz <= rz1; cz++)
        for (let cx = ax0; cx <= ax1; cx++) {
          const o = (cz * N + cx) * NB;
          for (let b = 0; b < NB; b++) dst[o + b] = 0;
          let n = 0;
          for (let d = -R; d <= R; d++) {
            const x = cx + d * sx, z = cz + d * sz;
            if (x < 0 || z < 0 || x >= N || z >= N) continue;
            const q = (z * N + x) * NB;
            for (let b = 0; b < NB; b++) dst[o + b] += src[q + b];
            n++;
          }
          for (let b = 0; b < NB; b++) dst[o + b] /= n;
        }
    }
    // sous-sommets : interpolation entre les centres de cases
    const out = this.vbw;
    for (let zz = z0; zz <= z1; zz++) for (let i = zz * VS + x0; i <= zz * VS + x1; i++) {
      const fx = clamp((i % VS) / VR - 0.5, 0, N - 1), fz = clamp(Math.floor(i / VS) / VR - 0.5, 0, N - 1);
      const x0 = Math.min(N - 2, Math.floor(fx)), z0 = Math.min(N - 2, Math.floor(fz)), u = fx - x0, v = fz - z0;
      const o00 = (z0 * N + x0) * NB, o10 = o00 + NB, o01 = o00 + N * NB, o11 = o01 + NB;
      for (let b = 0; b < NB; b++) out[i * NB + b] = (a[o00 + b] * (1 - u) + a[o10 + b] * u) * (1 - v) + (a[o01 + b] * (1 - u) + a[o11 + b] * u) * v;
    }
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
    const C = this.C;
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

  /**
   * La contamination de l'île du portail change (nouvelle partie, défense posée, vague repoussée) : les shaders la suivent
   * tout de suite ; la teinte des sommets, elle, se refait à la prochaine mise à jour de la zone de l'île (à demander)
   */
  setBlight(b: Blight | null) {
    this.blight = b;
    const u = this.blightU;
    if (!b) { u.uBlight.value.set(0, 0, 0, 0); u.uHaloN.value = 0; return; }
    u.uBlight.value.set(b.x, b.z, b.radius, b.level);
    const n = Math.min(MAX_HALOS, b.halos.length);
    for (let i = 0; i < n; i++) u.uHalos.value[i].set(...b.halos[i]);
    u.uHaloN.value = n;
  }

  /** La nuit (0 … 1) : le sol contaminé et l'eau autour du portail rougeoient */
  setNight(night: number) { this.blightU.uBlightNight.value = night; }

  /** Eau de la saison : teintes (lues sur place à chaque image), limpidité, reflets, gel, débris qui dérivent */
  private seasonWater(s: SeasonState) {
    const u = this.waterU, w = s.water;
    u.uShallow.value = w.shallow; u.uDeep.value = w.deep; u.uFloat.value = w.float;
    u.uClarity.value = w.clarity; u.uSparkle.value = w.sparkle; u.uFloatK.value = w.floatK; u.uIce.value = s.iceNow;
    this.waterMat.roughness = w.roughness;
    this.sideMat.color.copy(w.deep);
  }

  animateWater(t: number, calm = 1, s?: SeasonState) {
    // le courant avance à la vitesse de la saison (fonte des neiges, ralenti l'hiver)
    const dt = this.lastWaterT < 0 ? 0 : Math.max(0, Math.min(0.25, t - this.lastWaterT));
    this.lastWaterT = t;
    this.waterU.uFlowT.value += dt * (s ? s.water.flow : 1);
    if (s) this.seasonWater(s);
    this.waterU.uTime.value = t;
    this.waterU.uCalm.value = calm;
    this.waterMat.normalMap!.offset.set(t * 0.011, t * 0.007);
  }

  /** Lance un rayon contre le relief ; retourne le point d'impact monde ou null */
  pick(ray: THREE.Ray): THREE.Vector3 | null {
    const w = this.world;
    const o = ray.origin, d = ray.direction;
    const inside = (x: number, z: number) => x >= 0 && z >= 0 && x <= N && z <= N;
    // le curseur s'arrête à la surface de l'eau (la mer, un lac), pas sur le fond : ce qu'on vise reste sous la souris
    const top = (x: number, z: number) => {
      const cx = Math.min(N - 1, Math.floor(x)), cz = Math.min(N - 1, Math.floor(z)), k = w.ci(cx, cz);
      return Math.max(w.hAt(x, z), w.lake[k] ? w.lakeLevel[k] : SEA);
    };
    let prevT = 0, hit = false, t = 0;
    for (t = 0; t < 400; t += 0.4) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (inside(x, z) && y <= top(x, z)) { hit = true; break; }
      prevT = t;
    }
    if (!hit) return null;
    let lo = prevT, hi = t;
    for (let i = 0; i < 12; i++) {
      const m = (lo + hi) / 2;
      const x = o.x + d.x * m, y = o.y + d.y * m, z = o.z + d.z * m;
      if (y <= top(x, z)) hi = m; else lo = m;
    }
    const x = o.x + d.x * hi, z = o.z + d.z * hi;
    return new THREE.Vector3(x, top(x, z), z);
  }
}
