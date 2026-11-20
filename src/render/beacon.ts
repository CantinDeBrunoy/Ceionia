import * as THREE from 'three';
import { LIGHTS } from './materials';

/**
 * Le faisceau tournant des phares : deux cônes de lumière opposés qui partent de la lanterne, translucides, en dégradé
 * additif qui s'éteint avec la distance et sur les bords, et un éclat (un carré tourné vers la caméra) au cœur de la
 * lanterne, qui flamboie quand un faisceau passe face à elle. Une seule géométrie et un seul matériau pour tous les phares,
 * pas de vraie lumière : le maillage tourne autour de son axe vertical (`BuildingView.update`). On le voit surtout la nuit et
 * par brouillard (`BEAM.fog`, réglé par `Environment.update`), à peine le jour
 */

/** Réglages partagés : brouillard (0 à 1), part du jour où le faisceau reste visible */
export const BEAM = { fog: { value: 0 }, day: { value: 0.05 } };

/** Longueur d'un faisceau (en cases, avant l'échelle du modèle), demi-ouverture au bout */
export const BEAM_LEN = 7, BEAM_SPREAD = 0.55;

let geo: THREE.BufferGeometry | null = null;

/**
 * Deux cônes ouverts le long de +x et -x (pointe à l'origine), un peu plongeants vers la mer ; attributs : `aT` (0 à la
 * lanterne, 1 au bout), `aKind` (0 faisceau, 1 éclat), `aCorner` (coins de l'éclat), `aSide` (le faisceau de +x ou de -x)
 */
export function beamGeometry() {
  if (geo) return geo;
  const pos: number[] = [], t: number[] = [], kind: number[] = [], corner: number[] = [], side: number[] = [];
  const seg = 10, rings = 4, drop = -0.06;
  for (const dir of [1, -1]) {
    for (let r = 0; r < rings; r++) {
      const t0 = r / rings, t1 = (r + 1) / rings;
      for (let k = 0; k < seg; k++) {
        const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
        const P = (tt: number, a: number) => {
          const rad = 0.03 + BEAM_SPREAD * tt;
          return [dir * BEAM_LEN * tt, Math.sin(a) * rad + drop * BEAM_LEN * tt, Math.cos(a) * rad];
        };
        const q = [[t0, a0], [t1, a0], [t1, a1], [t0, a1]] as const;
        for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...P(q[i][0], q[i][1])); t.push(q[i][0]); kind.push(0); corner.push(0, 0); side.push(dir); }
      }
    }
  }
  // l'éclat : deux triangles dont les sommets sont tous au centre, écartés dans le shader face à la caméra
  for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) { pos.push(0, 0, 0); t.push(0); kind.push(1); corner.push(u, v); side.push(1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), BEAM_LEN + 1);
  return (geo = g);
}

const mats = new Map<number, THREE.ShaderMaterial>();

/** Le matériau additif du faisceau, un par couleur (feu de bois orangé, lampe blanche chaude, lumière froide du futur) */
export function beamMaterial(color: number) {
  let m = mats.get(color);
  if (m) return m;
  m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uNight: LIGHTS.night, uFog: BEAM.fog, uDay: BEAM.day },
    vertexShader: /* glsl */ `
      attribute float aT; attribute float aKind; attribute vec2 aCorner; attribute float aSide;
      varying float vT; varying float vKind; varying vec2 vCorner; varying float vFace; varying float vRim;
      void main() {
        vT = aT; vKind = aKind; vCorner = aCorner;
        // l'axe des faisceaux vu de la caméra : face à elle, l'éclat flamboie
        vec3 axis = normalize((modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
        vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vFace = abs(dot(axis, normalize(-c.xyz)));
        if (aKind > 0.5) {
          float s = 0.12 + 0.5 * pow(vFace, 12.0);
          gl_Position = projectionMatrix * (c + vec4(aCorner * s, 0.0, 0.0));
          vRim = 1.0;
        } else {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // (le bord du cône, vu de biais, s'efface ; le cœur, où le regard traverse le plus de lumière, brille : un rai dans l'air)
          // (la direction vient d'un attribut : à la pointe, x vaut 0, et un vecteur nul normalisé donnerait un NaN)
          vec3 dirx = normalize((modelViewMatrix * vec4(aSide, 0.0, 0.0, 0.0)).xyz);
          vec3 rad = mv.xyz - c.xyz - dirx * dot(mv.xyz - c.xyz, dirx);
          vec3 view = normalize(-mv.xyz);
          float rl = length(rad);
          vRim = rl > 1e-5 ? abs(dot(rad / rl, view)) : 1.0;
          gl_Position = projectionMatrix * mv;
        }
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uNight; uniform float uFog; uniform float uDay;
      varying float vT; varying float vKind; varying vec2 vCorner; varying float vFace; varying float vRim;
      void main() {
        float k = clamp(max(uNight, uFog * 0.85) + uDay, 0.0, 1.0);
        float a;
        if (vKind > 0.5) {
          float d = length(vCorner);
          a = clamp(1.0 - d, 0.0, 1.0); a *= a;
          a *= 0.8 + 1.6 * pow(vFace, 12.0);
          a *= max(k, 0.25);
        } else {
          a = pow(1.0 - vT, 1.6) * (0.25 + 0.75 * clamp(vT * 6.0, 0.0, 1.0));
          a *= 0.75 * pow(vRim, 1.5) * (1.0 + uFog * 0.6);
          a *= k;
        }
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  mats.set(color, m);
  return m;
}
