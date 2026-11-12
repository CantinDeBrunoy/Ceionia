import * as THREE from 'three';
import { HellMap, HW, HL, HWALL, HPOOL_LAVA, HPOOL_CHASM, HLAVA_Y, HCHASM_Y, HELL_ZONES, Z_PORTAL, Z_EMBER, Z_RIVER, Z_CLIFFS, Z_BONES, Z_CRYSTAL, Z_KINGDOM, zoneEnd } from '../world/hell';
import { caveLit, glowMaterial } from './caveLight';
import { paint, merge } from './battleUnits';
import { hash2 } from '../core/rng';
import type { CombatFx } from './combatFx';

/**
 * Le décor vivant des Enfers, en plus du relief et des grandes pièces de `HellView` : la « végétation » infernale (arbres
 * calcinés, ronces, fleurs de feu, champignons qui luisent, cristaux géants), le sol semé de cendres et de cailloux, les
 * traces des démons (torches le long de la faille, pieux à crânes, cages et chaînes pendues aux parois, obélisques à runes
 * à l'entrée des zones, crânes de géants), les cascades de lave qui tombent des parois, les fumerolles qui crachent par
 * moments, la cendre qui tombe. Tout est instancié une fois ; seules les fumerolles s'animent hors des shaders
 */

export interface DecorSource { x: number; y: number; z: number; r: number; c: THREE.Color; flicker: number }
interface Item { m: THREE.Matrix4; c: THREE.Color }
interface Vent { x: number; y: number; z: number; t: number; burst: number }

const d = new THREE.Object3D();
function item(x: number, y: number, z: number, rot: number, sx: number, sy: number, sz: number, c: THREE.Color | number, tilt = 0): Item {
  d.position.set(x, y, z);
  d.rotation.set(tilt, rot, 0);
  d.scale.set(sx, sy, sz);
  d.updateMatrix();
  return { m: d.matrix.clone(), c: new THREE.Color(c) };
}

export class HellDecor {
  group = new THREE.Group();
  sources: DecorSource[] = [];
  private vents: Vent[] = [];

  constructor(readonly map: HellMap, private uTime: { value: number }, wall: THREE.Color[]) {
    this.build(wall);
  }

  private build(WALL: THREE.Color[]) {
    const m = this.map;
    const trees: Item[] = [], thorns: Item[] = [], flowers: Item[] = [], shrooms: Item[] = [], caps: Item[] = [], pebbles: Item[] = [], skulls: Item[] = [];
    const pikes: Item[] = [], poles: Item[] = [], flames: Item[] = [], cages: Item[] = [], chains: Item[] = [], obelisks: Item[] = [], runes: Item[] = [];
    const giants: Item[] = [], bigCryst: Item[] = [], vents: Item[] = [], ventGlow: Item[] = [], pillars: Item[] = [];
    const sites = m.zones.flatMap((z) => z.sites);
    const nearSite = (x: number, z: number, pad: number) => sites.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + pad);
    const nearPortal = (x: number, z: number) => Math.hypot(x - m.portal[0], z - m.portal[1]) < 3.4;
    const FLOWER = [0xff7a1a, 0xffc040, 0xff3a2a].map((c) => new THREE.Color(c));
    const CAP = [0x5affd0, 0xc77dff, 0x7fdcff, 0xff5fc8].map((c) => new THREE.Color(c));
    const CRYST = [0xc77dff, 0xff5fc8, 0x7fdcff].map((c) => new THREE.Color(c));
    for (let k = 0; k < HW * HL; k++) {
      const x = k % HW, z = Math.floor(k / HW), zi = m.zone[k], r = (s: number) => hash2(x, z, s + 500);
      if (!m.open[k] || m.pool[k] || m.block[k]) continue;
      const cx = x + 0.2 + r(1) * 0.6, cz = z + 0.2 + r(2) * 0.6, y = m.heightAt(cx, cz), wd = m.wallDist[k];
      if (y > 0.4 || nearPortal(cx, cz)) continue;
      const onPath = Math.abs(cx - m.spine[z] - 0.5) < 1.6, site = nearSite(cx, cz, 0.9);
      // cendres et cailloux partout, même sur le chemin : le sol n'est plus lisse
      if (r(3) < 0.16 && !site) for (let i = 0, n = 1 + Math.floor(r(4) * 3); i < n; i++) {
        const s = 0.04 + r(5 + i) * 0.07;
        pebbles.push(item(x + r(8 + i), m.heightAt(x + r(8 + i), z + r(11 + i)) + s * 0.2, z + r(11 + i), r(14 + i) * 6, s * 1.3, s * 0.6, s, new THREE.Color(WALL[zi]).multiplyScalar(0.8 + r(17 + i) * 0.6)));
      }
      if (onPath || site) continue;
      // arbres morts, calcinés (ni dans la forêt de cristaux, ni au seuil)
      if (zi !== Z_CRYSTAL && zi !== Z_PORTAL && wd >= 2 && wd <= 4 && r(20) < (zi === Z_EMBER || zi === Z_BONES ? 0.045 : 0.025))
        trees.push(item(cx, y - 0.05, cz, r(21) * 6, 0.8 + r(22) * 0.6, 0.8 + r(23) * 0.7, 0.8 + r(22) * 0.6, new THREE.Color(zi === Z_BONES ? 0x5a4a40 : 0x2e2226).multiplyScalar(0.9 + r(24) * 0.3), (r(25) - 0.5) * 0.2));
      // ronces sombres
      else if (wd >= 1 && wd <= 3 && r(26) < 0.04)
        thorns.push(item(cx, y - 0.02, cz, r(27) * 6, 0.7 + r(28) * 0.6, 0.6 + r(29) * 0.6, 0.7 + r(28) * 0.6, new THREE.Color(zi === Z_CRYSTAL ? 0x3a2a5a : zi === Z_CLIFFS ? 0x4a4048 : 0x5a1a26).multiplyScalar(0.85 + r(30) * 0.3)));
      // fleurs de feu, en touffes (braises, rivière, royaume, seuil)
      if ((zi === Z_EMBER || zi === Z_RIVER || zi === Z_KINGDOM || zi === Z_PORTAL) && r(31) < 0.05)
        for (let i = 0, n = 2 + Math.floor(r(32) * 4); i < n; i++)
          flowers.push(item(cx + (r(33 + i) - 0.5) * 0.6, y - 0.02, cz + (r(38 + i) - 0.5) * 0.6, r(43 + i) * 6, 1, 0.7 + r(48 + i) * 0.6, 1, FLOWER[Math.floor(r(53 + i) * 3)].clone().multiplyScalar(0.85 + r(58) * 0.3)));
      // champignons qui luisent (falaises, gorge, cristaux)
      if ((zi === Z_CRYSTAL || zi === Z_CLIFFS || zi === Z_BONES) && wd <= 3 && r(60) < (zi === Z_CRYSTAL ? 0.07 : 0.035))
        for (let i = 0, n = 2 + Math.floor(r(61) * 4); i < n; i++) {
          const s = 0.5 + r(62 + i) * 0.9, px = cx + (r(67 + i) - 0.5) * 0.5, pz = cz + (r(72 + i) - 0.5) * 0.5, rot = r(77 + i) * 6;
          shrooms.push(item(px, y - 0.02, pz, rot, s, s, s, 0xe8dcc8));
          caps.push(item(px, y - 0.02, pz, rot, s, s, s, CAP[(Math.floor(r(82) * 4) + (zi === Z_CRYSTAL ? 0 : 1)) % 4]));
        }
      // crânes épars, en tas dans la gorge des os et au royaume
      if (r(90) < (zi === Z_BONES ? 0.03 : zi === Z_KINGDOM ? 0.015 : 0.004))
        for (let i = 0, n = 1 + Math.floor(r(91) * (zi === Z_BONES ? 4 : 2)); i < n; i++)
          skulls.push(item(cx + (r(92 + i) - 0.5) * 0.4, y + 0.04 + (i > 1 ? 0.07 : 0), cz + (r(96 + i) - 0.5) * 0.4, r(100 + i) * 6, 0.09, 0.09, 0.09, 0xe8dcc0, (r(104 + i) - 0.5) * 0.6));
      // cages et chaînes pendues au bord des parois
      if (wd === 1 && (zi === Z_EMBER || zi === Z_BONES || zi === Z_KINGDOM || zi === Z_RIVER)) {
        if (r(110) < 0.012) cages.push(item(cx, y, cz, r(111) * 6, 1, 1, 1, 0x3a3640));
        else if (r(112) < 0.03) chains.push(item(cx, y, cz, r(113) * 6, 1, 0.7 + r(114) * 0.5, 1, 0x34303a));
      }
      // cristaux géants (forêt de cristaux) : ils éclairent
      if (zi === Z_CRYSTAL && wd >= 2 && wd <= 5 && r(120) < 0.014) {
        const c = CRYST[Math.floor(r(121) * 3)];
        for (let i = 0; i < 3; i++) {
          const h = 1.2 + r(122 + i) * 1.8, s = 0.25 + r(126 + i) * 0.2;
          d.position.set(cx + (r(130 + i) - 0.5) * 0.7, y - 0.1, cz + (r(134 + i) - 0.5) * 0.7);
          d.rotation.set((r(138 + i) - 0.5) * 0.6, r(142 + i) * 6, (r(146 + i) - 0.5) * 0.6);
          d.scale.set(s, h, s);
          d.updateMatrix();
          bigCryst.push({ m: d.matrix.clone(), c: c.clone().offsetHSL((r(150 + i) - 0.5) * 0.05, 0, 0) });
        }
        this.sources.push({ x: cx, y: y + 1.4, z: cz, r: 4.2, c: c.clone().multiplyScalar(1.5), flicker: 0 });
      }
      // colonnes brisées sur les falaises cendrées
      if (zi === Z_CLIFFS && wd >= 1 && r(160) < 0.02)
        pillars.push(item(cx, y - 0.05, cz, r(161) * 6, 0.9 + r(162) * 0.4, 0.5 + r(163) * 0.9, 0.9 + r(162) * 0.4, new THREE.Color(0x6a646a).multiplyScalar(0.8 + r(164) * 0.4), (r(165) - 0.5) * 0.25));
      // fumerolles (braises, rivière, royaume) : elles crachent de la fumée et des braises par moments
      if ((zi === Z_EMBER || zi === Z_RIVER || zi === Z_KINGDOM) && wd >= 2 && r(170) < 0.008) {
        vents.push(item(cx, y - 0.04, cz, r(171) * 6, 1, 1, 1, new THREE.Color(WALL[zi]).multiplyScalar(0.9)));
        ventGlow.push(item(cx, y - 0.04, cz, 0, 1, 1, 1, 0xff7a20));
        this.vents.push({ x: cx, y: y + 0.18, z: cz, t: r(172) * 8, burst: 0 });
        this.sources.push({ x: cx, y: y + 0.5, z: cz, r: 2.2, c: new THREE.Color(1, 0.45, 0.15), flicker: 0.4 });
      }
    }
    // le long de la faille : des torches contre les parois, de place en place (et des pieux à crânes devant les forteresses)
    for (let zi = 1; zi < HELL_ZONES.length; zi++) {
      const z0 = HELL_ZONES[zi].z0, z1 = zoneEnd(zi);
      for (let z = z0 + 3, side = zi % 2 ? 1 : -1; z < z1 - 2; z += 7, side = -side) {
        const c = this.edgeCell(z, side);
        if (!c || nearSite(c[0], c[1], 0.6)) continue;
        const [tx, tz] = c, y = m.heightAt(tx, tz);
        poles.push(item(tx, y, tz, hash2(tx, tz, 7) * 6, 1, 1, 1, zi === Z_BONES ? 0xd8ccb0 : 0x3a2a2a));
        flames.push(item(tx, y + 1.0, tz, 0, 1, 1, 1, 0xffa040));
        this.sources.push({ x: tx, y: y + 1.2, z: tz, r: 3.4, c: new THREE.Color(1, 0.55, 0.22).multiplyScalar(1.25), flicker: 0.35 });
      }
      // les obélisques à runes, de part et d'autre de l'entrée de la zone
      for (const sd of [-1, 1]) {
        const c = this.edgeCell(z0 + 1, sd);
        if (!c) continue;
        const y = m.heightAt(c[0], c[1]);
        obelisks.push(item(c[0], y - 0.05, c[1], hash2(zi, sd, 9) * 0.6, 1, 1, 1, zi === Z_BONES ? 0x8a7a64 : zi === Z_CRYSTAL ? 0x3a3256 : 0x2a1e2a));
        runes.push(item(c[0], y - 0.05, c[1], hash2(zi, sd, 9) * 0.6, 1, 1, 1, zi === Z_CRYSTAL ? 0x9a7aff : 0xff4a5a));
        this.sources.push({ x: c[0], y: y + 1.2, z: c[1], r: 3, c: new THREE.Color(zi === Z_CRYSTAL ? 0x9a7aff : 0xff4a5a).multiplyScalar(1.2), flicker: 0.05 });
      }
      // pieux à crânes sur les bords du chemin, devant chaque forteresse et la citadelle
      for (const s of m.zones[zi].sites) {
        if (s.kind !== 'fortress' && s.kind !== 'kingdom') continue;
        for (let z = Math.floor(s.z) - (s.kind === 'kingdom' ? 16 : 9); z < s.z - s.r - 1; z += 2)
          for (const sd of [-1, 1]) {
            const c = this.edgeCell(z, sd, 1.2);
            if (!c || nearSite(c[0], c[1], 0.4)) continue;
            pikes.push(item(c[0], m.heightAt(c[0], c[1]) - 0.03, c[1], hash2(z, sd, 3) * 6, 1, 0.9 + hash2(z, sd, 4) * 0.3, 1, 0x4a3224, (hash2(z, sd, 5) - 0.5) * 0.2));
          }
      }
    }
    // crânes de géants à demi enfouis contre les parois de la gorge des os
    for (let z = HELL_ZONES[Z_BONES].z0 + 5, side = 1; z < zoneEnd(Z_BONES) - 4; z += 8, side = -side) {
      const c = this.edgeCell(z, side, 0.4);
      if (!c || nearSite(c[0], c[1], 1.5)) continue;
      const s = 0.7 + hash2(z, 1, 40) * 0.4;
      giants.push(item(c[0], m.heightAt(c[0], c[1]) - 0.15 * s, c[1], side > 0 ? -Math.PI / 2 + 0.3 : Math.PI / 2 - 0.3, s, s, s, 0xeee2c8, -0.15));
    }

    const lit = (key: string) => caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }), key);
    const glow = (key: string, k = 0.9) => glowMaterial(k, key);
    this.instanced(deadTreeGeo(), lit('hell-tree'), trees);
    this.instanced(thornGeo(), lit('hell-thorn'), thorns);
    this.instanced(flowerGeo(), glow('hell-flower', 0.8), flowers);
    this.instanced(shroomStemGeo(), lit('hell-shroom'), shrooms);
    this.instanced(shroomCapGeo(), glow('hell-cap', 0.9), caps);
    this.instanced(paint(new THREE.IcosahedronGeometry(1, 0), 0xffffff, (t) => 0.75 + t * 0.35), lit('hell-pebble'), pebbles);
    this.instanced(skullGeo(), lit('hell-bone'), skulls);
    this.instanced(cageGeo(), lit('hell-iron'), cages);
    this.instanced(chainGeo(), lit('hell-iron'), chains);
    this.instanced(pikeGeo(), lit('hell-pike'), pikes);
    this.instanced(torchGeo(), lit('hell-pike'), poles);
    this.instanced(merge([paint(new THREE.ConeGeometry(0.11, 0.34, 5).translate(0, 0.17, 0), 0xffffff, (t) => 1.1 - t * 0.3), paint(new THREE.ConeGeometry(0.06, 0.2, 4).translate(0.02, 0.1, 0), 0xffe890)]), torchFlame(this.uTime), flames);
    this.instanced(obeliskGeo(), lit('hell-obelisk'), obelisks);
    this.instanced(runeGeo(), new THREE.MeshBasicMaterial({ vertexColors: true }), runes);
    this.instanced(giantSkullGeo(), lit('hell-bone'), giants);
    this.instanced(paint(new THREE.OctahedronGeometry(1, 0).translate(0, 0.7, 0), 0xffffff), glowMaterial(0.6, 'hell-crystal', { transparent: true, opacity: 0.9 }), bigCryst);
    this.instanced(pillarGeo(), lit('hell-pillar'), pillars);
    this.instanced(ventGeo(), lit('hell-vent'), vents);
    this.instanced(paint(new THREE.CylinderGeometry(0.1, 0.06, 0.04, 6).translate(0, 0.2, 0), 0xffffff), new THREE.MeshBasicMaterial({ vertexColors: true }), ventGlow);
    this.buildFalls();
    this.buildAsh();
  }

  /**
   * La case ouverte au pied de la paroi, de part et d'autre de la faille sur la rangée `z` (`side` : −1 à gauche, 1 à
   * droite), un peu en retrait (`inset` cases vers le chemin) ; null si la rangée n'en a pas
   */
  private edgeCell(z: number, side: number, inset = 0.6): [number, number] | null {
    const m = this.map, sx = Math.floor(m.spine[z]) + 0.5;
    for (let dx = 1; dx < 14; dx++) {
      const x = Math.floor(sx + side * dx);
      if (!m.inside(x, z)) return null;
      const k = z * HW + x;
      if (!m.open[k] || m.pool[k]) {
        const px = x - side * (0.5 + inset) + 0.5;
        const pk = z * HW + Math.floor(px);
        return m.open[pk] && !m.pool[pk] && !m.block[pk] ? [px, z + 0.5] : null;
      }
    }
    return null;
  }

  /**
   * Cascades de lave : là où une paroi domine un bassin de lave (ou l'abîme des falaises), un filet de lave tombe de la crête
   * jusqu'en bas, en nappe qui coule (un seul maillage, animé dans son shader)
   */
  private buildFalls() {
    const m = this.map, pos: number[] = [], uv: number[] = [];
    let last = -99;
    for (let k = 0; k < HW * HL; k++) {
      if (m.open[k]) continue;
      const x = k % HW, z = Math.floor(k / HW);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (!m.inside(nx, nz)) continue;
        const p = m.pool[nz * HW + nx];
        if (p !== HPOOL_LAVA && p !== HPOOL_CHASM) continue;
        if (hash2(x, z, 600) > (p === HPOOL_LAVA ? 0.14 : 0.05) || Math.abs(k - last) < 3) continue;
        last = k;
        const y1 = p === HPOOL_LAVA ? HLAVA_Y - 0.05 : HCHASM_Y - 0.05, y0 = HWALL + 0.05;
        // la nappe, sur la face de la paroi (un peu en avant), plus large en bas
        const fx = x + 0.5 + dx * 0.42, fz = z + 0.5 + dz * 0.42, ex = dz, ez = -dx, w0 = 0.16 + hash2(x, z, 601) * 0.12, w1 = w0 + 0.12;
        const out = 0.18;
        const v = [
          [fx - ex * w0 - dx * 0.25, y0, fz - ez * w0 - dz * 0.25], [fx + ex * w0 - dx * 0.25, y0, fz + ez * w0 - dz * 0.25],
          [fx + ex * w1 + dx * out, y1, fz + ez * w1 + dz * out], [fx - ex * w1 + dx * out, y1, fz - ez * w1 + dz * out],
        ];
        const seed = hash2(x, z, 602) * 10;
        pos.push(...v[0], ...v[1], ...v[2], ...v[0], ...v[2], ...v[3]);
        uv.push(seed, 0, seed + 1, 0, seed + 1, 1, seed, 0, seed + 1, 1, seed, 1);
        this.sources.push({ x: fx + dx * 0.4, y: (y0 + y1) / 2, z: fz + dz * 0.4, r: 2.6, c: new THREE.Color(1, 0.4, 0.1).multiplyScalar(1.1), flicker: 0.1 });
        break;
      }
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const mesh = new THREE.Mesh(g, fallMaterial(this.uTime));
    this.group.add(mesh);
  }

  /** La cendre qui tombe doucement dans toute la faille (points animés dans le shader) */
  private buildAsh() {
    const pos: number[] = [], seed: number[] = [];
    for (let i = 0; i < 3200; i++) {
      const x = hash2(i, 1, 700) * HW, z = hash2(i, 2, 700) * HL, k = Math.floor(z) * HW + Math.floor(x);
      if (!this.map.open[k]) continue;
      pos.push(x, 0, z);
      seed.push(hash2(i, 3, 700), 0.5 + hash2(i, 4, 700));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 2));
    const pts = new THREE.Points(g, ashMaterial(this.uTime));
    pts.frustumCulled = false;
    this.group.add(pts);
  }

  private instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: Item[]) {
    if (!items.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => { mesh.setMatrixAt(i, it.m); mesh.setColorAt(i, it.c); });
    mesh.computeBoundingSphere();
    this.group.add(mesh);
  }

  /** Les fumerolles proches de la vue crachent par moments : un panache de fumée et une gerbe de braises */
  update(dt: number, tx: number, tz: number, range: number, fx: CombatFx) {
    for (const v of this.vents) {
      if (Math.hypot(v.x - tx, v.z - tz) > range) continue;
      v.t -= dt;
      if (v.t <= 0 && v.burst <= 0) { v.burst = 1.4 + Math.random(); v.t = 5 + Math.random() * 7; }
      if (v.burst > 0) {
        v.burst -= dt;
        if (Math.random() < dt * 14) fx.plume(v.x + (Math.random() - 0.5) * 0.1, v.y, v.z + (Math.random() - 0.5) * 0.1, 0x4a3a40);
        if (Math.random() < dt * 9) fx.ember(v.x, v.y + 0.05, v.z, 0xff8a2a);
      } else if (Math.random() < dt * 0.8) fx.plume(v.x, v.y, v.z, 0x3a2e34);
    }
  }
}

// ---------- Géométries (1 de haut environ, posées au sol) ----------

/** Arbre mort, calciné : un tronc tordu, des branches nues qui finissent en pointe, quelques braises dans l'écorce */
function deadTreeGeo() {
  const parts: THREE.BufferGeometry[] = [paint(new THREE.CylinderGeometry(0.05, 0.1, 0.9, 5).translate(0, 0.45, 0).rotateZ(0.08), 0xffffff, (t) => 0.8 + t * 0.3)];
  const br = (y: number, a: number, len: number, up: number) => paint(new THREE.CylinderGeometry(0.012, 0.035, len, 4).translate(0, len / 2, 0).rotateZ(up).rotateY(a).translate(0.03, y, 0), 0xffffff, (t) => 0.85 + t * 0.3);
  parts.push(br(0.55, 0.3, 0.45, 0.9), br(0.7, 2.4, 0.4, 0.8), br(0.82, 4.2, 0.34, 0.6), br(0.88, 1.2, 0.3, 0.3), br(0.4, 5.3, 0.3, 1.1));
  // petites fourches au bout des branches
  parts.push(br(0.95, 0.5, 0.18, -0.4), br(0.9, 3.3, 0.16, 0.5));
  // les racines qui sortent du sol
  for (let i = 0; i < 4; i++) parts.push(paint(new THREE.ConeGeometry(0.035, 0.3, 4).rotateZ(Math.PI / 2 - 0.25).translate(0.13, 0.04, 0).rotateY(i * 1.6 + 0.3), 0xffffff, () => 0.75));
  return merge(parts);
}

/** Ronces : des tiges épineuses qui partent en éventail */
function thornGeo() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39, lean = 0.4 + (i % 3) * 0.25, h = 0.28 + (i % 4) * 0.07;
    parts.push(paint(new THREE.ConeGeometry(0.025, h, 4).translate(0, h / 2, 0).rotateZ(lean).rotateY(a), 0xffffff, (t) => 0.7 + t * 0.5));
    // une épine sur chaque tige
    parts.push(paint(new THREE.ConeGeometry(0.01, 0.06, 3).rotateZ(-1.2).translate(0.02, h * 0.5, 0).rotateZ(lean).rotateY(a), 0xffffff, () => 1.3));
  }
  return merge(parts);
}

/** Fleur de feu : une tige sombre, une corolle de pétales en flammes (le tout luit, la tige moins) */
function flowerGeo() {
  const parts: THREE.BufferGeometry[] = [paint(new THREE.CylinderGeometry(0.006, 0.01, 0.16, 3).translate(0, 0.08, 0), 0x3a1a14)];
  for (let i = 0; i < 4; i++) parts.push(paint(new THREE.ConeGeometry(0.022, 0.08, 3).translate(0, 0.04, 0).rotateZ(0.6).translate(0, 0.16, 0).rotateY((i / 4) * Math.PI * 2), 0xffffff, (t) => 0.8 + t * 0.4));
  parts.push(paint(new THREE.IcosahedronGeometry(0.018, 0).translate(0, 0.17, 0), 0xfff0a0));
  return merge(parts);
}

function shroomStemGeo() { return paint(new THREE.CylinderGeometry(0.015, 0.025, 0.14, 5).translate(0, 0.07, 0), 0xffffff, (t) => 0.8 + t * 0.2); }
function shroomCapGeo() { return paint(new THREE.SphereGeometry(0.06, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(0, 0.135, 0), 0xffffff, (t) => 0.8 + t * 0.3); }

/** Crâne (rayon 1 environ, face à +z) */
function skullGeo() {
  return merge([
    paint(new THREE.IcosahedronGeometry(1, 1).scale(1, 0.92, 1.05), 0xffffff, (t) => 0.85 + t * 0.2),
    paint(new THREE.BoxGeometry(0.95, 0.45, 0.8).translate(0, -0.72, 0.2), 0xffffff, () => 0.9),
    ...[-1, 1].map((s) => paint(new THREE.BoxGeometry(0.32, 0.3, 0.2).translate(s * 0.36, -0.05, 0.92), 0x241818)),
    paint(new THREE.ConeGeometry(0.1, 0.18, 3).rotateX(Math.PI).translate(0, -0.35, 0.98), 0x241818),
  ]);
}

/** Cage de fer pendue à une chaîne qui descend du haut de la paroi, un squelette tassé dedans */
function cageGeo() {
  const IRON = 0xffffff, parts: THREE.BufferGeometry[] = [];
  const y0 = 0.75, h = 0.6, r = 0.22;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; parts.push(paint(new THREE.CylinderGeometry(0.012, 0.012, h, 3).translate(Math.sin(a) * r, y0 + h / 2, Math.cos(a) * r), IRON)); }
  for (const y of [y0, y0 + h]) parts.push(paint(new THREE.TorusGeometry(r, 0.018, 3, 10).rotateX(Math.PI / 2).translate(0, y, 0), IRON));
  parts.push(paint(new THREE.ConeGeometry(r * 1.05, 0.16, 8).translate(0, y0 + h + 0.08, 0), IRON));
  parts.push(paint(new THREE.CylinderGeometry(0.008, 0.008, HWALL + 0.3 - (y0 + h), 3).translate(0, (HWALL + 0.3 + y0 + h) / 2, 0), IRON));
  // le prisonnier : un crâne et des os blancs
  parts.push(paint(new THREE.IcosahedronGeometry(0.06, 1).translate(0.05, y0 + 0.2, 0.03), 0x9c9488), paint(new THREE.BoxGeometry(0.04, 0.16, 0.04).rotateZ(0.6).translate(-0.04, y0 + 0.1, 0), 0x9c9488), paint(new THREE.BoxGeometry(0.16, 0.03, 0.03).translate(0, y0 + 0.03, 0.06), 0x9c9488));
  return merge(parts);
}

/** Chaîne pendue de la crête de la paroi, finie par un crochet */
function chainGeo() {
  const parts: THREE.BufferGeometry[] = [];
  const top = HWALL + 0.3, bot = 0.85;
  for (let y = bot, i = 0; y < top; y += 0.085, i++) parts.push(paint(new THREE.TorusGeometry(0.03, 0.009, 3, 6).scale(0.7, 1.3, 1).rotateY(i % 2 ? Math.PI / 2 : 0).translate(0, y, 0), 0xffffff));
  parts.push(paint(new THREE.TorusGeometry(0.06, 0.012, 3, 8, Math.PI * 1.3).rotateZ(Math.PI).translate(0, bot - 0.08, 0), 0xffffff));
  return merge(parts);
}

/** Pieu planté, un crâne fiché au sommet */
function pikeGeo() {
  return merge([
    paint(new THREE.CylinderGeometry(0.025, 0.035, 1.05, 4).translate(0, 0.52, 0), 0xffffff, (t) => 0.8 + t * 0.3),
    paint(new THREE.ConeGeometry(0.025, 0.1, 4).translate(0, 1.1, 0), 0xffffff),
    paint(new THREE.IcosahedronGeometry(0.075, 1).scale(1, 0.9, 1.05).translate(0, 1.0, 0), 0xe8dcc0),
    paint(new THREE.BoxGeometry(0.07, 0.035, 0.06).translate(0, 0.94, 0.03), 0xe8dcc0),
    ...[-1, 1].map((s) => paint(new THREE.BoxGeometry(0.025, 0.022, 0.02).translate(s * 0.027, 1.0, 0.075), 0x241818)),
  ]);
}

/** Torche sur poteau : un fût, une vasque de fer, trois griffes (la flamme est à part, elle vacille) */
function torchGeo() {
  return merge([
    paint(new THREE.CylinderGeometry(0.035, 0.05, 0.92, 5).translate(0, 0.46, 0), 0xffffff, (t) => 0.8 + t * 0.3),
    paint(new THREE.CylinderGeometry(0.12, 0.06, 0.1, 6).translate(0, 0.97, 0), 0x3a3640),
    ...[0, 1, 2].map((i) => paint(new THREE.ConeGeometry(0.02, 0.16, 3).rotateZ(-0.5).translate(0.11, 1.05, 0).rotateY((i / 3) * Math.PI * 2), 0x3a3640)),
    paint(new THREE.IcosahedronGeometry(0.07, 0).scale(1, 0.4, 1).translate(0, 0.03, 0), 0x2a2226),
  ]);
}

/** Obélisque de pierre noire, à pointe, sur un socle (les runes sont à part : elles luisent) */
function obeliskGeo() {
  return merge([
    paint(new THREE.BoxGeometry(0.62, 0.2, 0.62).translate(0, 0.1, 0), 0xffffff, () => 0.75),
    paint(new THREE.CylinderGeometry(0.16, 0.24, 1.9, 4).rotateY(Math.PI / 4).translate(0, 1.15, 0), 0xffffff, (t) => 0.8 + t * 0.3),
    paint(new THREE.ConeGeometry(0.17, 0.35, 4).rotateY(Math.PI / 4).translate(0, 2.27, 0), 0xffffff, () => 1.2),
    ...[-1, 1].map((s) => paint(new THREE.ConeGeometry(0.05, 0.35, 4).translate(0, 0.17, 0).rotateZ(-s * 0.7).translate(s * 0.15, 1.8, 0), 0xe8dcc0)),
  ]);
}

/** Les runes des obélisques : des traits qui luisent sur les quatre faces */
function runeGeo() {
  const parts: THREE.BufferGeometry[] = [];
  for (let f = 0; f < 4; f++)
    for (let i = 0; i < 4; i++) {
      const y = 0.55 + i * 0.32, w = 0.05 + ((i * 7 + f) % 3) * 0.04, off = 0.21 - (y - 0.2) * 0.04;
      parts.push(paint(new THREE.BoxGeometry(w, 0.05, 0.02).rotateZ(((i + f) % 2) * 0.6 - 0.3).translate(0, y, off).rotateY((f / 4) * Math.PI * 2), 0xffffff));
    }
  return merge(parts);
}

/** Crâne de géant à demi enfoui : boîte crânienne, orbites profondes, mâchoire, cornes cassées (face à +z) */
function giantSkullGeo() {
  return merge([
    paint(new THREE.IcosahedronGeometry(1, 1).scale(1.1, 0.9, 1.25).translate(0, 0.55, 0), 0xffffff, (t) => 0.8 + t * 0.25),
    paint(new THREE.BoxGeometry(1.2, 0.4, 0.9).translate(0, 0.05, 0.75), 0xffffff, () => 0.85),
    ...[-1, 1].map((s) => paint(new THREE.IcosahedronGeometry(0.3, 0).scale(1, 0.9, 0.5).translate(s * 0.42, 0.6, 1.1), 0x1a1012)),
    paint(new THREE.ConeGeometry(0.16, 0.3, 3).rotateX(Math.PI).translate(0, 0.3, 1.2), 0x1a1012),
    ...[-1, 1].map((s) => paint(new THREE.ConeGeometry(0.22, 0.9, 5).translate(0, 0.45, 0).rotateZ(-s * 1.0).rotateX(-0.4).translate(s * 0.8, 1.05, -0.1), 0xffffff, (t) => 0.7 + t * 0.4)),
    // des dents
    ...[-0.36, -0.12, 0.12, 0.36].map((x) => paint(new THREE.ConeGeometry(0.06, 0.18, 4).rotateX(Math.PI).translate(x, 0.2, 1.18), 0xffffff, () => 1.05)),
  ]);
}

/** Colonne brisée : un fût cannelé, un chapiteau tombé à côté */
function pillarGeo() {
  return merge([
    paint(new THREE.BoxGeometry(0.42, 0.14, 0.42).translate(0, 0.07, 0), 0xffffff, () => 0.8),
    paint(new THREE.CylinderGeometry(0.14, 0.16, 1, 8).translate(0, 0.62, 0), 0xffffff, (t) => 0.85 + t * 0.25),
    paint(new THREE.CylinderGeometry(0.02, 0.15, 0.2, 8).translate(0, 1.18, 0).rotateZ(0.3), 0xffffff, () => 1.05),
    paint(new THREE.BoxGeometry(0.36, 0.14, 0.36).rotateZ(1.2).translate(0.38, 0.12, 0.2), 0xffffff, () => 0.9),
  ]);
}

/** Fumerolle : un cône de roche percé (la lueur du cratère est à part) */
function ventGeo() {
  return merge([
    paint(new THREE.CylinderGeometry(0.12, 0.38, 0.22, 7, 1, true).translate(0, 0.11, 0), 0xffffff, (t) => 0.75 + t * 0.4),
    ...[0, 1, 2, 3].map((i) => paint(new THREE.IcosahedronGeometry(0.08 + (i % 2) * 0.03, 0).translate(Math.sin(i * 1.7) * 0.34, 0.04, Math.cos(i * 1.7) * 0.34), 0xffffff, () => 0.9)),
  ]);
}

// ---------- Matériaux ----------

/** La flamme des torches : un cône qui vacille, chacune à son rythme (sa place dans l'instance) */
function torchFlame(uTime: { value: number }) {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  float ph = 0.0;
#ifdef USE_INSTANCING
  ph = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 1.7;
#endif
  float up = max(transformed.y, 0.0) * 3.0;
  float s = 1.0 + sin(uTime * 11.0 + ph) * 0.15 + sin(uTime * 17.0 + ph * 2.0) * 0.1;
  transformed.y *= s;
  transformed.x += up * 0.05 * sin(uTime * 9.0 + ph);
  transformed.z += up * 0.04 * cos(uTime * 7.0 + ph);`);
  };
  m.customProgramCacheKey = () => 'hell-torch-flame';
  return m;
}

/** La lave qui tombe : des filets clairs qui descendent vite, des plaques plus sombres, le bas qui s'élargit en écume claire */
function fallMaterial(uTime: { value: number }) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime },
    side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  float u = fract(vUv.x) - 0.5;
  vec2 q = vec2(vUv.x * 5.0, vUv.y * 3.0 - uTime * 1.6);
  float f = n(q) * 0.6 + n(q * 2.7 + 3.0) * 0.4;
  vec3 c = mix(vec3(0.75, 0.16, 0.03), vec3(1.0, 0.65, 0.18), smoothstep(0.45, 0.85, f));
  c = mix(c, vec3(0.25, 0.05, 0.03), smoothstep(0.62, 0.72, n(q * 1.3 - 7.0)) * 0.6);
  c += vec3(1.0, 0.7, 0.3) * smoothstep(0.85, 1.0, vUv.y) * 0.5;
  // les bords de la nappe s'effilent
  if (abs(u) > 0.5 - 0.12 * (1.0 - vUv.y) * f) discard;
  gl_FragColor = vec4(c * 1.15, 1.0);
}`,
  });
}

/** Cendre : de petits flocons gris qui tombent en tournoyant, tout le long de la faille */
function ashMaterial(uTime: { value: number }) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime },
    transparent: true, depthWrite: false,
    vertexShader: `attribute vec2 seed; uniform float uTime; varying float vA;
void main() {
  float t = fract(uTime * 0.035 * seed.y + seed.x * 13.0);
  vec3 p = position;
  p.y = 3.4 * (1.0 - t);
  p.x += sin(uTime * 0.7 + seed.x * 30.0) * 0.4;
  p.z += cos(uTime * 0.5 + seed.x * 17.0) * 0.4;
  vA = smoothstep(0.0, 0.1, t) * smoothstep(1.0, 0.85, t);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(55.0 / -mv.z, 1.0, 5.0);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `varying float vA;
void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(0.62, 0.56, 0.58, smoothstep(0.5, 0.1, d) * vA * 0.55); }`,
  });
}
