import { describe, it, expect } from 'vitest';
import { World, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { expandWorld } from '../src/world/expand';
import { VOY_ACT1, VOY_ACT2, VOY_CAPTIONS, VOY_DIP, VOY_LIFT, VOY_WAIT, VOY_CONTACT, actTotal, voyCaptionAt, voyShotAt, voyVeilAt } from '../src/voyageCine';
import { MUSIC } from '../src/audio/audio';
import { seaRay } from '../src/voyageStage';
import { SHALLOW } from '../src/sim/navalConflict';
import { tr, setLang } from '../src/i18n';
import '../src/i18n/en';

describe('la cinématique « Explorer le monde » : la partition', () => {
  it('deux actes : le départ et la brume (≈ 9 s), puis l’horizon, les deux îles, les flottes et le retour (≈ 32 s)', () => {
    expect(VOY_ACT1.map((p) => p.id)).toEqual(['depart', 'mist']);
    expect(VOY_ACT2.map((p) => p.id)).toEqual(['horizon', 'orient', 'asie', 'fleets', 'home']);
    expect(actTotal(VOY_ACT1)).toBeGreaterThan(7);
    expect(actTotal(VOY_ACT1)).toBeLessThan(12);
    expect(actTotal(VOY_ACT2)).toBeGreaterThan(25);
    expect(actTotal(VOY_ACT2)).toBeLessThan(40);
  });

  it('les plans s’enchaînent sans trou ; rien après la fin', () => {
    expect(voyShotAt(VOY_ACT2, 0)!.shot).toBe('horizon');
    expect(voyShotAt(VOY_ACT2, 6.4)!.shot).toBe('horizon');
    expect(voyShotAt(VOY_ACT2, 6.6)!.shot).toBe('orient');
    let t0 = 0;
    for (const p of VOY_ACT2) {
      const mid = voyShotAt(VOY_ACT2, t0 + p.dur / 2)!;
      expect(mid.shot).toBe(p.id);
      expect(mid.k).toBeCloseTo(0.5, 5);
      t0 += p.dur;
    }
    expect(voyShotAt(VOY_ACT2, actTotal(VOY_ACT2) + 0.01)).toBeNull();
  });

  it('chaque plan du récit a son bandeau, court, qui apparaît et s’efface en douceur', () => {
    for (const id of ['depart', 'mist', 'horizon', 'orient', 'asie', 'fleets'] as const) expect(VOY_CAPTIONS.some((c) => c.shot === id)).toBe(true);
    for (const c of VOY_CAPTIONS) expect(c.text.length).toBeLessThanOrEqual(40);
    const c = VOY_CAPTIONS.find((x) => x.shot === 'orient')!, at = VOY_ACT2[0].dur + c.at;
    expect(voyCaptionAt(VOY_ACT2, at - 0.1)).toBeNull();
    expect(voyCaptionAt(VOY_ACT2, at + 0.3)!.alpha).toBeCloseTo(0.5, 5);
    expect(voyCaptionAt(VOY_ACT2, at + 2)!.text).toBe(c.text);
    // le retour au village se fait sans bandeau (la bannière du premier contact suit)
    expect(voyCaptionAt(VOY_ACT2, actTotal(VOY_ACT2) - 1)).toBeNull();
  });

  it('acte I : la brume monte sur son dernier plan et couvre tout avant la fin (l’écran d’attente prend le relais)', () => {
    expect(voyVeilAt(1, 1).mist).toBe(0);
    expect(voyVeilAt(1, VOY_ACT1[0].dur + 1).mist).toBeGreaterThan(0);
    expect(voyVeilAt(1, actTotal(VOY_ACT1) - 0.05).mist).toBe(1);
    expect(voyVeilAt(1, 3).black).toBe(0);
  });

  it('acte II : la brume se dissipe au début, un fondu au noir à chaque coupe ; sans brume (partie rechargée), il s’ouvre au noir', () => {
    expect(voyVeilAt(2, 0).mist).toBe(1);
    expect(voyVeilAt(2, VOY_LIFT / 2).mist).toBeCloseTo(0.5, 5);
    expect(voyVeilAt(2, VOY_LIFT + 0.1).mist).toBe(0);
    let cut = 0;
    for (let i = 0; i < VOY_ACT2.length - 1; i++) {
      cut += VOY_ACT2[i].dur;
      expect(voyVeilAt(2, cut).black).toBeCloseTo(1, 5);
      expect(voyVeilAt(2, cut + VOY_DIP + 0.05).black).toBe(0);
    }
    expect(voyVeilAt(2, 3).black).toBe(0);
    expect(voyVeilAt(2, 0, false)).toEqual({ mist: 0, black: 1 });
    expect(voyVeilAt(2, VOY_DIP + 0.01, false).black).toBe(0);
  });

  it('textes traduits en anglais ; la musique de l’exploration existe', () => {
    expect(MUSIC.age2).toContain('medieval-exploration');
    setLang('en', false);
    try {
      for (const c of VOY_CAPTIONS) { expect(tr(c.text)).not.toBe(c.text); if (c.sub) expect(tr(c.sub)).not.toBe(c.sub); }
      for (const s of [VOY_WAIT.text, VOY_WAIT.sub, VOY_CONTACT.title, VOY_CONTACT.sub]) expect(tr(s)).not.toBe(s);
    } finally { setLang('fr', false); }
  });
});

describe('la cinématique « Explorer le monde » : le départ du navire', () => {
  it('il part de la côte et file vers le large sur un trait d’eau libre (ni lac ni rivière), quelle que soit la carte', () => {
    setMapSize(192);
    for (const seed of [11, 2026, 7, 42]) {
      const w = new World();
      newWorld(w, 3, seed, GEN);
      for (const v of [[96, 96], [70, 110], [120, 80]] as [number, number][]) {
        const [a, b] = seaRay(w, v);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        expect(len, `graine ${seed}`).toBeGreaterThanOrEqual(4);
        for (let k = 0; k <= 1; k += 0.05) {
          const x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k;
          expect(w.cellAvg(Math.floor(x), Math.floor(z)), `graine ${seed} (${x.toFixed(0)}, ${z.toFixed(0)})`).toBeLessThanOrEqual(SHALLOW);
        }
      }
    }
  });
});

describe('la cinématique « Explorer le monde » : les sauvegardes', () => {
  it('le monde agrandi la demande une fois (`reveal`) ; une partie déjà agrandie, rechargée après, ne la rejoue pas', () => {
    setMapSize(192);
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    const big = expandWorld(JSON.parse(JSON.stringify(w.toJSON())), w.mapId, w.seed);
    setMapSize(big.n);
    try {
      const first = new World();
      first.fromJSON(big);
      expect(first.reveal).toBe(true);
      // elle a joué : la sauvegarde suivante ne la porte plus
      first.reveal = false;
      const again = new World();
      again.fromJSON(JSON.parse(JSON.stringify(first.toJSON())));
      expect(again.reveal).toBe(false);
      expect(again.isles).toBeTruthy();
    } finally { setMapSize(192); }
  });
});
