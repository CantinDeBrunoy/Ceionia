export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash déterministe 0..1 à partir de deux entiers et d'un sel. */
export function hash2(x: number, z: number, salt = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(salt | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Angle ramené dans ]−π, π], d'un coup (pas de boucle `while (d > π) d -= 2π` : avec un angle infini, ou si grand que
 * retirer 2π ne le change plus, elle ne finissait jamais et figeait le jeu) ; un angle qui n'est pas un nombre fini donne 0
 */
export function wrapAngle(a: number): number {
  if (!Number.isFinite(a)) return 0;
  const T = Math.PI * 2, r = a - T * Math.ceil((a - Math.PI) / T);
  return Number.isFinite(r) && Math.abs(r) <= Math.PI ? r : 0;
}
