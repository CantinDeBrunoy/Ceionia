import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { Sim } from '../src/sim/sim';
import { KINDS, KIND_ORDER, KIND_SUB, KIND_LABEL, KindId } from '../src/build/catalog';
import { KIND_ICON, ic } from '../src/ui/icons';
import { getModel } from '../src/render/models';
import { costOf } from '../src/sim/economy';
import { Funeral } from '../src/render/funeral';
import { applyMourning, grief, hasCemetery, sickNews, sickToll, MOURN } from '../src/sim/mishaps';
import { setLang, i18nEntries } from '../src/i18n';
import '../src/i18n/en';

const O = { v: 0, L: false, R: false, F: true };

afterEach(() => setLang('fr', false));

/** Le continent des tests, toujours la même graine */
function continent() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  return w;
}

/** Première place où poser ce bâtiment, en partant du coin (x0, z0) */
function spot(w: World, kind: KindId, x0 = 10, z0 = 10): [number, number] {
  for (let z = z0; z < N - 10; z++) for (let x = x0; x < N - 10; x++) if (w.canPlace(kind, x, z) === null) return [x, z];
  throw new Error(`pas de place pour ${kind}`);
}

describe('le cimetière', () => {
  it('est un bâtiment de 2 × 2 dès la Préhistoire, rubrique Culte de « Vie & culture », un nom par âge', () => {
    const d = KINDS.cemetery;
    expect(d.size).toBe(2);
    expect(d.minAge).toBe(0);
    expect(d.cat).toBe('life');
    expect(KIND_SUB.cemetery).toBe('culte');
    expect(KIND_ORDER).toContain('cemetery');
    expect(KIND_LABEL.cemetery).toBe('cimetières');
    expect(d.names).toEqual(['Tertre des ancêtres', 'Nécropole', 'Cimetière paroissial', 'Cimetière à chapelle', 'Parc du souvenir', 'Jardin du souvenir']);
    // un peu de bien-être (moins qu'un lieu de culte), un gardien plus tard ; ni déblocage ni bâtiment requis
    expect(d.joy).toEqual([1, 1, 2, 2, 3, 3]);
    for (let a = 0; a < 6; a++) expect(d.joy![a]).toBeLessThan(KINDS.temple.joy![Math.max(1, a)]);
    expect(d.reqMission).toBeUndefined();
    expect(d.reqKind).toBeUndefined();
    // aucun texte affiché avec un point-virgule
    for (const t of [...d.names, d.desc, d.perk!]) expect(t).not.toContain(';');
  });

  it('coûte le prix ordinaire d’un 2 × 2 : modeste en Facile, un peu plus en Normal', () => {
    const easy = costOf('cemetery', 0, 'easy')!, normal = costOf('cemetery', 0, 'normal')!;
    expect(easy.wood).toBeGreaterThan(0);
    expect(easy.wood).toBeLessThanOrEqual(costOf('temple', 1, 'easy')!.wood);
    expect(normal.wood).toBeGreaterThanOrEqual(easy.wood);
    expect(costOf('cemetery', 3, 'normal')!.wood).toBe(costOf('temple', 3, 'normal')!.wood);
  });

  it('se pose sur un terrain ordinaire, et compte dans le bien-être', () => {
    const w = continent();
    const [x, z] = spot(w, 'cemetery', 40, 40);
    w.place('cemetery', x, z, 0, true, 3, false);
    expect(hasCemetery(w)).toBe(true);
    const sim = new Sim(w);
    sim.age = 3;
    sim.recalc();
    sim.update(0.1);
    expect(sim.needDetail('joy').rows.some((r) => r.v === 2)).toBe(true);
  });

  it('a une icône et ses textes anglais', () => {
    expect(KIND_ICON.cemetery).toBe('stele');
    expect(ic(KIND_ICON.cemetery)).toContain('<path');
    const en = i18nEntries();
    expect(KINDS.cemetery.names.map((n) => en.get(n))).toEqual(['Ancestors’ mound', 'Necropolis', 'Churchyard', 'Chapel cemetery', 'Memorial park', 'Garden of remembrance']);
    expect(en.get(KINDS.cemetery.desc)).toBeTruthy();
    expect(en.get(KINDS.cemetery.perk!)).toBeTruthy();
    expect(en.get(KIND_LABEL.cemetery)).toBe('cemeteries');
    expect(en.get('Deuil (aucun cimetière)')).toBeTruthy();
  });

  it('a un modèle distinct et détaillé à chaque âge, qui tient dans sa parcelle ; des lumières au futur', () => {
    const sig = new Set<number>();
    for (let age = 0; age <= 5; age++) {
      const m = getModel('cemetery', age, O);
      const n = m.body.attributes.position.count + (m.glow?.attributes.position.count ?? 0);
      expect(n, `âge ${age}`).toBeGreaterThan(5000);
      expect(n, `âge ${age}`).toBeLessThan(300000);
      const box = new THREE.Box3().setFromBufferAttribute(m.body.attributes.position as THREE.BufferAttribute);
      expect(box.min.x, `âge ${age}`).toBeGreaterThan(-1.1);
      expect(box.max.x, `âge ${age}`).toBeLessThan(1.1);
      expect(box.min.z, `âge ${age}`).toBeGreaterThan(-1.1);
      expect(box.max.z, `âge ${age}`).toBeLessThan(1.1);
      for (const v of m.body.attributes.position.array as Float32Array) expect(Number.isFinite(v)).toBe(true);
      sig.add(n);
    }
    expect(sig.size).toBe(6);
    expect(getModel('cemetery', 5, O).glow!.attributes.position.count).toBeGreaterThan(500);
    // la lanterne des morts et les lumignons s'allument au Moyen Âge
    expect(getModel('cemetery', 2, O).glow).not.toBeNull();
  });
});

describe('un décès, avec ou sans cimetière', () => {
  it('en Facile, personne ne meurt : le cimetière n’y est jamais une punition', () => {
    const w = continent();
    w.difficulty = 'easy';
    for (const r of [0, 0.1, 0.99]) expect(sickToll(w, () => r).dies).toBe(false);
  });

  it('sans cimetière, le deuil coûte un peu de bien-être deux jours ; la fiche le dit ; la sauvegarde le garde', () => {
    const w = continent();
    w.difficulty = 'normal';
    const [x, z] = spot(w, 'temple', 30, 30);
    w.place('temple', x, z, 0, true, 3, false);
    const sim = new Sim(w);
    sim.age = 3;
    sim.recalc();
    sim.update(0.1);
    const full = sim.joy.cap;
    expect(hasCemetery(w)).toBe(false);
    applyMourning(w, 100);
    expect(grief(w)).toBe(MOURN.n);
    sim.update(0.1);
    expect(sim.joy.cap).toBeCloseTo(full - MOURN.n, 5);
    expect(sim.needDetail('joy').rows.some((r) => r.v === -MOURN.n)).toBe(true);
    // mesuré : un deuil pèse moins qu'un lieu de culte n'apporte
    expect(MOURN.n).toBeLessThan(KINDS.temple.joy![3] / 4);
    // relu d'une sauvegarde
    const back = new World();
    back.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(grief(back)).toBe(MOURN.n);
    // deux jours plus tard, le deuil est passé
    for (let i = 0; i < MOURN.days * 100 + 10; i++) sim.update(1);
    expect(grief(w)).toBe(0);
    expect(w.mourning).toEqual([]);
    expect(sim.joy.cap).toBeCloseTo(full, 5);
    // une ancienne sauvegarde n'a pas de deuil
    const old = JSON.parse(JSON.stringify(w.toJSON()));
    delete old.mourning;
    const legacy = new World();
    legacy.fromJSON(old);
    expect(legacy.mourning).toEqual([]);
  });

  it('le message dit ce qui aurait évité le décès, puis que le défunt repose au cimetière, ou le deuil', () => {
    const t = { n: 3, days: 2, dies: true };
    expect(sickNews(t, true, true)).toMatch(/pas survécu.*hôpital.*cimetière.*repose/);
    expect(sickNews(t, true, false)).toMatch(/pas survécu.*hôpital.*Faute de cimetière.*2 jours.*bien-être −2/);
    for (const m of [sickNews(t, true, true), sickNews(t, true, false)]) expect(m).not.toContain(';');
    const en = i18nEntries();
    setLang('en', false);
    expect(sickNews(t, true, true)).toMatch(/cemetery/);
    expect(sickNews(t, true, false)).toMatch(/no cemetery.*2 days/);
    expect(en.size).toBeGreaterThan(0);
  });
});

describe('le cortège', () => {
  it('va de la maison au cimetière, s’y arrête, puis chacun repart et tout s’efface', () => {
    const w = continent();
    const f = new Funeral(w);
    const cells: [number, number][] = [];
    for (let i = 0; i < 8; i++) cells.push([40 + i, 50]);
    f.start(cells, [48.6, 50.5], [49.2, 50.5], -Math.PI / 2, 2, 3);
    expect(f.active).toBe(true);
    expect(f.group.children.length).toBeGreaterThan(8);
    const start = f.where()!;
    let t = 0, rested = false;
    while (f.active && t < 200) {
      f.update(0.25); t += 0.25;
      const p = f.where();
      if (p && Math.hypot(p[0] - 49.2, p[1] - 50.5) < 0.01) rested = true;
    }
    expect(rested).toBe(true);
    expect(start[0]).toBeLessThan(42);
    expect(f.active).toBe(false);
    // une mise en scène courte : moins d'une minute et demie de jeu
    expect(t).toBeLessThan(90);
    expect(f.group.children.length).toBe(0);
    // en pause, rien ne bouge
    f.start(cells, [48.6, 50.5], [49.2, 50.5], 0, 5);
    const a = f.where();
    f.update(0);
    expect(f.where()).toEqual(a);
    f.stop();
    expect(f.active).toBe(false);
  });
});
