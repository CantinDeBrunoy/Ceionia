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
import { applyMourning, buryAll, grief, hasCemetery, sickNews, sickToll, MOURN, unburied, UNBURIED_HEALTH, naturalRate, naturalNews, NATURAL, logDeath, recentDeaths, DEATH_LOG_DAYS } from '../src/sim/mishaps';
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
    expect(en.get('Défunts sans sépulture (aucun cimetière)')).toBeTruthy();
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

  it('sans cimetière, un défunt coûte 2 de bien-être tant qu’aucun cimetière ne l’accueille ; la fiche le dit ; la sauvegarde le garde', () => {
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
    applyMourning(w);
    applyMourning(w);
    expect(grief(w)).toBe(2 * MOURN.n);
    sim.update(0.1);
    expect(sim.joy.cap).toBeCloseTo(full - 2 * MOURN.n, 5);
    expect(sim.needDetail('joy').rows.some((r) => r.v === -2 * MOURN.n && r.n === 2)).toBe(true);
    // pas de fin de délai : dix jours plus tard, rien n'a changé
    for (let i = 0; i < 1000; i++) sim.update(1);
    expect(grief(w)).toBe(2 * MOURN.n);
    // relu d'une sauvegarde
    const back = new World();
    back.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(back.unburied).toBe(2);
    // une ancienne sauvegarde : ses deuils à durée encore en cours deviennent des défunts sans sépulture
    const old = JSON.parse(JSON.stringify(w.toJSON()));
    delete old.unburied;
    old.mourning = [{ n: 2, until: w.exp.clock + 50 }, { n: 2, until: w.exp.clock - 5 }];
    const legacy = new World();
    legacy.fromJSON(old);
    expect(legacy.unburied).toBe(1);
    delete old.mourning;
    const older = new World();
    older.fromJSON(old);
    expect(older.unburied).toBe(0);
    // un cimetière bâti : ils y reposent tous, le coût s'efface, et on le dit
    const [cx, cz] = spot(w, 'cemetery', 60, 60);
    w.place('cemetery', cx, cz, 0, true, 3, false);
    sim.recalc();
    sim.update(0.1);
    expect(w.unburied).toBe(0);
    expect(grief(w)).toBe(0);
    expect(sim.news.some((m) => /reposent enfin au cimetière/.test(m))).toBe(true);
    expect(buryAll(w)).toBeNull();
  });

  it('le message dit ce qui aurait évité le décès, puis que le défunt repose au cimetière, ou le deuil', () => {
    const t = { n: 3, days: 2, dies: true };
    expect(sickNews(t, true, true)).toMatch(/pas survécu.*hôpital.*cimetière.*repose/);
    expect(sickNews(t, true, false)).toMatch(/pas survécu.*hôpital.*Faute de cimetière.*sans sépulture.*bien-être −2 et soins −1 tant que/);
    for (const m of [sickNews(t, true, true), sickNews(t, true, false)]) expect(m).not.toContain(';');
    const en = i18nEntries();
    setLang('en', false);
    expect(sickNews(t, true, true)).toMatch(/cemetery/);
    expect(sickNews(t, true, false)).toMatch(/no cemetery.*unburied.*until/);
    expect(en.size).toBeGreaterThan(0);
  });
});

describe('les morts dans la fiche Santé, et les morts naturelles', () => {
  it('un défunt sans sépulture pèse aussi sur les soins, la fiche Santé le dit', () => {
    const w = continent();
    w.difficulty = 'normal';
    const [x, z] = spot(w, 'health', 30, 30);
    w.place('health', x, z, 0, true, 3, false);
    const sim = new Sim(w);
    sim.age = 3;
    sim.recalc();
    sim.update(0.1);
    const full = sim.health.cap;
    expect(full).toBeGreaterThan(0);
    applyMourning(w);
    expect(unburied(w)).toBe(UNBURIED_HEALTH);
    sim.update(0.1);
    expect(sim.health.cap).toBeCloseTo(full - UNBURIED_HEALTH, 5);
    expect(sim.needDetail('health').rows.some((r) => r.v === -UNBURIED_HEALTH && /sépulture/.test(r.label))).toBe(true);
    for (let i = 0; i < 500; i++) sim.update(1);
    expect(unburied(w)).toBe(UNBURIED_HEALTH);
  });

  it('les anciens s’éteignent de vieillesse : jamais au bac à sable ni dans un petit village, moitié moins en Facile', () => {
    const w = continent();
    w.difficulty = 'normal';
    expect(naturalRate(w, NATURAL.minPop - 1)).toBe(0);
    expect(naturalRate(w, 50)).toBeCloseTo(0.5, 5);
    expect(naturalRate(w, 1000)).toBe(NATURAL.max);
    w.difficulty = 'easy';
    expect(naturalRate(w, 50)).toBeCloseTo(0.25, 5);
    w.difficulty = 'sandbox';
    expect(naturalRate(w, 50)).toBe(0);
  });

  it('le registre des décès : les derniers jours seulement, ceux sans sépulture à part, gardé par la sauvegarde', () => {
    const w = continent();
    logDeath(w, true, 100);
    logDeath(w, false, 100);
    expect(recentDeaths(w, 100)).toEqual({ n: 2, unburied: 1 });
    const back = new World();
    back.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(recentDeaths(back, 100)).toEqual({ n: 2, unburied: 1 });
    w.exp.clock += DEATH_LOG_DAYS * 100 + 1;
    expect(recentDeaths(w, 100)).toEqual({ n: 0, unburied: 0 });
    logDeath(w, true, 100);
    expect(w.deaths.length).toBe(1);
    // une ancienne sauvegarde n'a pas de registre
    const old = JSON.parse(JSON.stringify(w.toJSON()));
    delete old.deaths;
    const legacy = new World();
    legacy.fromJSON(old);
    expect(legacy.deaths).toEqual([]);
  });

  it('le message d’un ancien qui s’éteint, en français et en anglais', () => {
    expect(naturalNews(true)).toMatch(/vieillesse.*cimetière.*repose/);
    expect(naturalNews(false)).toMatch(/vieillesse.*Faute de cimetière.*bien-être −2 et soins −1 tant que/);
    for (const m of [naturalNews(true), naturalNews(false)]) expect(m).not.toContain(';');
    setLang('en', false);
    expect(naturalNews(true)).toMatch(/old age.*cemetery/);
    expect(naturalNews(false)).toMatch(/no cemetery.*care −1 until/);
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
