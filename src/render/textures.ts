import * as THREE from 'three';
import { mulberry32 } from '../core/rng';

/** Bruit de valeur périodique (raccord parfait quand la texture se répète), valeurs 0..1 */
function periodicFbm(size: number, periods: number[], seed: number): Float32Array {
  const out = new Float32Array(size * size);
  const rnd = mulberry32(seed);
  let norm = 0;
  periods.forEach((p, o) => {
    const lat = new Float32Array(p * p).map(() => rnd());
    const amp = 1 / (o + 1);
    norm += amp;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * p, fy = (y / size) * p;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        let tx = fx - ix, ty = fy - iy;
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        const a = lat[iy * p + ix], b = lat[iy * p + ((ix + 1) % p)];
        const c = lat[((iy + 1) % p) * p + ix], d = lat[((iy + 1) % p) * p + ((ix + 1) % p)];
        out[y * size + x] += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
      }
  });
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

/**
 * Texture de détail du sol, un motif par canal (0.5 = neutre) :
 * R brins d'herbe, G grain de sable / terre, B roche (marbrures et fissures)
 */
export function groundDetailTexture(size = 512): THREE.Texture {
  const rnd = mulberry32(17);
  // brins d'herbe : petits traits clairs et sombres, recopiés de l'autre côté des bords pour raccorder
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgb(128,128,128)';
  g.fillRect(0, 0, size, size);
  g.lineCap = 'round';
  for (let i = 0; i < 5200; i++) {
    const x = rnd() * size, y = rnd() * size, a = rnd() * Math.PI * 2, l = 4 + rnd() * 9;
    const v = Math.round(rnd() < 0.5 ? 70 + rnd() * 45 : 150 + rnd() * 70);
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = 1 + rnd() * 1.4;
    for (const ox of [-size, 0, size])
      for (const oy of [-size, 0, size]) {
        if (Math.abs(x + ox - size / 2) > size / 2 + l || Math.abs(y + oy - size / 2) > size / 2 + l) continue;
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
        g.stroke();
      }
  }
  const grass = g.getImageData(0, 0, size, size).data;
  const rock = periodicFbm(size, [6, 12, 24, 48], 5);
  const ripple = periodicFbm(size, [4, 8], 9);
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const x = i % size;
    const sand = 0.5 + (rnd() - 0.5) * 0.35 + Math.sin(((x + ripple[i] * 60) / size) * Math.PI * 2 * 7) * 0.08;
    // fissures : là où le bruit croise sa valeur médiane
    const r = rock[i], crack = Math.max(0, 1 - Math.abs(r - 0.5) / 0.012);
    img.data[i * 4] = grass[i * 4];
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, sand * 255));
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, (0.25 + r * 0.5 - crack * 0.25) * 255));
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Carte de normales de vaguelettes, répétable */
export function waterNormalTexture(size = 256): THREE.Texture {
  const h = periodicFbm(size, [4, 8, 16, 32], 23);
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 18, dy = (at(x, y + 1) - at(x, y - 1)) * 18;
      const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
      data[i] = (-dx / l * 0.5 + 0.5) * 255;
      data[i + 1] = (-dy / l * 0.5 + 0.5) * 255;
      data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
