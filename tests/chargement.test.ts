import { describe, it, expect, afterAll } from 'vitest';
import * as THREE from 'three';
import { WarmUp, SMOOTH_MS, SMOOTH_RUN, WARM_MAX_MS, stillCompiling } from '../src/render/warmup';
import { representatives } from '../src/render/precompile';
import { World, setMapSize } from '../src/world/world';
import { Fauna } from '../src/render/fauna';
import { tr, setLang } from '../src/i18n';
import '../src/i18n/en';

describe('premières images derrière l’écran de chargement', () => {
  it('l’écran se lève après quelques images fluides de suite, pas avant', () => {
    const w = new WarmUp();
    for (let i = 0; i < SMOOTH_RUN - 1; i++) expect(w.feed(16)).toBe(false);
    expect(w.feed(16)).toBe(true);
  });

  it('une image lente remet le compte à zéro', () => {
    const w = new WarmUp();
    for (let i = 0; i < SMOOTH_RUN - 1; i++) w.feed(16);
    expect(w.feed(SMOOTH_MS + 200)).toBe(false);
    for (let i = 0; i < SMOOTH_RUN - 1; i++) expect(w.feed(16)).toBe(false);
    expect(w.feed(16)).toBe(true);
  });

  it('une machine lente ne reste pas bloquée derrière l’écran', () => {
    const w = new WarmUp();
    let t = 0, up = false;
    while (!up && t < WARM_MAX_MS * 3) { t += 80; up = w.feed(80); }
    expect(up).toBe(true);
    expect(t).toBeLessThanOrEqual(WARM_MAX_MS + 80);
  });
});

describe('programmes en cours de compilation', () => {
  it('les programmes prêts sortent de la liste', () => {
    const state = [false, true, false];
    const list = state.map((_, i) => ({ isReady: () => state[i] }));
    expect(stillCompiling(list)).toBe(2);
    state[0] = state[2] = true;
    expect(stillCompiling(list)).toBe(0);
    expect(list).toEqual([]);
  });
});

describe('représentants à compiler d’avance', () => {
  const box = new THREE.BoxGeometry(1, 1, 1);

  it('le même matériau sur la même sorte d’objet : un seul représentant', () => {
    const s = new THREE.Scene(), m = new THREE.MeshStandardMaterial();
    s.add(new THREE.Mesh(box, m), new THREE.Mesh(box, m), new THREE.Mesh(box, m));
    expect(representatives(s)).toHaveLength(1);
  });

  it('un matériau partagé entre un maillage et sa silhouette instanciée : les deux variantes', () => {
    const s = new THREE.Scene(), m = new THREE.MeshStandardMaterial();
    const one = new THREE.Mesh(box, m), many = new THREE.InstancedMesh(box, m, 4);
    s.add(one, many);
    expect(representatives(s)).toEqual([one, many]);
  });

  it('une couleur par instance change la variante', () => {
    const s = new THREE.Scene(), m = new THREE.MeshStandardMaterial();
    const plain = new THREE.InstancedMesh(box, m, 4), tinted = new THREE.InstancedMesh(box, m, 4);
    tinted.setColorAt(0, new THREE.Color(1, 0, 0));
    s.add(plain, tinted);
    expect(representatives(s)).toHaveLength(2);
  });

  it('ce qui est caché compte aussi : ce qui ne paraît que la nuit se prépare de jour', () => {
    const s = new THREE.Scene(), halo = new THREE.Mesh(box, new THREE.MeshBasicMaterial()), g = new THREE.Group();
    halo.visible = false;
    g.visible = false;
    g.add(new THREE.Mesh(box, new THREE.MeshBasicMaterial()));
    s.add(halo, g);
    expect(representatives(s)).toHaveLength(2);
  });
});

describe('les bêtes instanciées ont leur couleur par instance dès le départ', () => {
  it('le shader ne change pas à la première apparition d’une espèce (chauves-souris : la première nuit)', () => {
    setMapSize(64);
    const w = new World(), f = new Fauna(w, { perches: Array.from({ length: 4096 }, () => []), flowers: Array.from({ length: 4096 }, () => []) });
    const inst: THREE.InstancedMesh[] = [];
    f.group.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh && o.parent === f.group) inst.push(o as THREE.InstancedMesh); });
    expect(inst.length).toBeGreaterThan(3);
    for (const m of inst) expect(m.instanceColor).not.toBeNull();
  });
});

describe('textes de l’écran de chargement', () => {
  afterAll(() => setLang('fr', false));
  it('chaque étape a sa traduction anglaise', () => {
    setLang('en', false);
    for (const s of ['Chargement des modèles…', 'Construction du monde…', 'Préparation des matériaux…', 'Préparation de la nuit…', 'Dernières retouches…']) {
      expect(tr(s)).not.toBe(s);
      expect(tr(s)).not.toMatch(/[àâçéèêëîïôûùü]/i);
    }
  });
});
