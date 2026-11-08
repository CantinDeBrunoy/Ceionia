import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { World, setMapSize } from '../src/world/world';
import { Sim } from '../src/sim/sim';
import { KINDS, KIND_ORDER, KIND_SUB, KIND_LABEL } from '../src/build/catalog';
import { KIND_ICON, ic } from '../src/ui/icons';
import { getModel } from '../src/render/models';
import { MISSIONS } from '../src/sim/missions';
import { setLang, i18nEntries } from '../src/i18n';
import '../src/i18n/en';

const fair = () => MISSIONS.find((m) => m.id === 'fair')!;
const tris = (g: THREE.BufferGeometry | null | undefined) => (g ? g.attributes.position.count / 3 : 0);
const O = { v: 0, L: false, R: false, F: true };

afterEach(() => setLang('fr', false));

describe('le cirque', () => {
  it('est un chapiteau de 3 × 3 cases dès le Moyen Âge, rubrique détente de « Vie & culture »', () => {
    const d = KINDS.circus;
    expect(d.size).toBe(3);
    expect(d.minAge).toBe(2);
    expect(d.cat).toBe('life');
    expect(KIND_SUB.circus).toBe('detente');
    expect(KIND_ORDER).toContain('circus');
    expect(KIND_LABEL.circus).toBeTruthy();
    expect(d.names).toEqual(['', '', 'Chapiteau de la troupe', 'Cirque', 'Grand cirque', 'Cirque holographique']);
    expect(d.joy).toEqual([0, 0, 10, 14, 18, 24]);
    expect(d.jobs).toEqual([0, 0, 2, 3, 4, 5]);
    expect(d.desc.length).toBeGreaterThan(20);
  });

  it('est verrouillé par l’expédition « Les jongleurs du carrefour », qui annonce son déblocage', () => {
    expect(KINDS.circus.reqMission).toBe('fair');
    expect(fair().title).toBe('Les jongleurs du carrefour');
    expect(fair().unlocks).toBe('circus');
    expect(fair().age).toBeLessThanOrEqual(KINDS.circus.minAge);
    const c = fair().choices[0];
    expect(c.winText).toBe('La troupe s’installe au village : le cirque peut ouvrir !');
    // le bonus de bien-être et le texte d'échec restent
    expect(c.win.length).toBeGreaterThan(0);
    expect(c.loseText).toMatch(/jongleurs/);
  });

  it('a une icône, des textes anglais (« Troupe\'s tent », « Circus », « Grand circus », « Holographic circus ») et une phrase d’expédition', () => {
    expect(KIND_ICON.circus).toBe('tent');
    expect(ic(KIND_ICON.circus)).toContain('<path');
    const en = i18nEntries();
    expect(KINDS.circus.names.slice(2).map((n) => en.get(n))).toEqual(["Troupe's tent", 'Circus', 'Grand circus', 'Holographic circus']);
    expect(en.get(fair().choices[0].winText!)).toBe('The troupe is settling into the village: the circus can open!');
    expect(en.get(KINDS.circus.desc)).toBeTruthy();
    expect(en.get(KINDS.circus.perk!)).toBeTruthy();
    expect(en.get(KIND_LABEL.circus)).toBe('circuses');
  });

  it('a un modèle distinct à chaque âge, de milliers de sommets, avec ses lampions qui s’allument la nuit', () => {
    const sig = new Set<string>();
    for (let age = 2; age <= 5; age++) {
      const m = getModel('circus', age, O);
      const n = m.body.attributes.position.count + (m.glow?.attributes.position.count ?? 0);
      expect(n, `âge ${age}`).toBeGreaterThan(8000);
      expect(n, `âge ${age}`).toBeLessThan(400000);
      expect(m.glow, `âge ${age}`).not.toBeNull();
      expect(m.glow!.attributes.position.count, `âge ${age}`).toBeGreaterThan(500);
      // reste dans la parcelle de 3 × 3 cases (marge pour le dôme et les fanions)
      m.body.computeBoundingBox();
      const bb = m.body.boundingBox!;
      expect(Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z), `âge ${age}`).toBeLessThan(1.62);
      expect(bb.max.y, `âge ${age}`).toBeLessThan(3);
      sig.add(`${m.body.attributes.position.count}|${m.glow!.attributes.position.count}`);
      // des pièces animées : fanions qui flottent, jongleur, funambule et sa perche
      expect((m.sways ?? []).length, `âge ${age}`).toBeGreaterThan(6);
      const t = tris(m.body) + tris(m.glow) + (m.sways ?? []).reduce((s, w) => s + tris(w.geo) + tris(w.glow), 0);
      expect(t, `âge ${age}`).toBeLessThan(90000);
    }
    expect(sig.size).toBe(4);
    // le dôme holographique tourne : anneaux de l'âge futuriste
    expect(getModel('circus', 5, O).sways!.some((s) => s.spin)).toBe(true);
    // à l'âge futuriste, le modèle est celui du futur, pas le moderne rehaussé
    expect(getModel('circus', 5, O).body.attributes.position.count).not.toBe(getModel('circus', 4, O).body.attributes.position.count);
  });

  it('compte dans le bien-être du village, de plus en plus avec les âges', () => {
    const joyAt = (age: number) => {
      setMapSize(96);
      const w = new World();
      w.heights.fill(1);
      w.buildings.set(w.nextId, { id: w.nextId++, kind: 'circus', x: 10, z: 10, rot: 0, auto: true, age });
      const sim = new Sim(w);
      sim.update(0, 1);
      return sim.joy.cap;
    };
    const base = joyAt(1) , a2 = joyAt(2), a3 = joyAt(3), a5 = joyAt(5);
    expect(a2 - base).toBe(10);
    expect(a3 - base).toBeGreaterThanOrEqual(14);
    expect(a5 - base).toBeGreaterThanOrEqual(24);
  });
});
