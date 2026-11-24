import { describe, it, expect, afterAll } from 'vitest';
import { World, setMapSize } from '../src/world/world';
import { newWorld, CONTINENT } from '../src/world/mapgen';
import { GEN_ARCH } from '../src/world/continent';
import { MISSIONS, applyEffects, redoEffects, effectChips, boonText } from '../src/sim/missions';
import { ISLE_MISSIONS } from '../src/sim/isleMissions';
import { newDiplo, readDiplo, saveDiplo, talkRisk, TALK_RISK, addBoon, isleOffered, isleWhy, BOON_MAX, PEACE_MIN } from '../src/sim/diplomacy';
import { RivalBattle, foeGroups, FOES, ALLY_FIRST, OURS, WAVES, BATTLE_LIMIT } from '../src/sim/rivalBattle';

/**
 * Les expéditions facultatives sur les îles de l'archipel (demande de l'auteur, 20 nov. 2026) : quatre chez l'allié, quatre
 * chez son rival, toutes au Médiéval ; chacune donne un avantage pour la voie du dénouement (des troupes pour la bataille, des
 * chances pour la paix), sauvegardé, montré sur sa carte et là où il agit
 */
const total = (g: Record<string, [number, number]>) => Object.entries(g).reduce((n, [k, [s, a]]) => n + (s + a) * (k === 'vague' ? WAVES : 1), 0);

/** Un monde minimal pour les règles : l'archipel, l'allié choisi */
function world(): World {
  const w = new World();
  w.isles = { main: { x: 0, z: 0, n: 192 }, rivals: [], small: [] };
  w.diplo.met = ['orient', 'asie']; w.diplo.ally = 'orient';
  return w;
}

describe('expéditions facultatives sur les îles de l’archipel', () => {
  afterAll(() => setMapSize(192));

  it('huit missions au Médiéval, quatre par peuple, chacune avec un avantage pour la bataille ou la paix et une visite sur l’île', () => {
    expect(ISLE_MISSIONS.length).toBe(8);
    expect(ISLE_MISSIONS.filter((m) => m.isle!.to === 'ally').length).toBe(4);
    for (const m of ISLE_MISSIONS) {
      expect(MISSIONS).toContain(m);
      expect(m.age, m.id).toBe(2);
      expect(m.mandatory).toBe(false);
      for (const c of m.choices) {
        expect(c.visit?.to, `${m.id}/${c.label}`).toBe(m.isle!.to);
        expect(c.win.some((e) => e.t === 'boon'), `${m.id}/${c.label}`).toBe(true);
      }
    }
  });

  it('proposées selon la diplomatie : rien sans allié ; le sabotage sur la voie de la guerre ; l’espion et le transfuge tant que le conflit dure', () => {
    const w = world(), ids = (f: (id: string, when: Parameters<typeof isleOffered>[2]) => boolean) => ISLE_MISSIONS.filter((m) => f(m.id, m.isle!.when)).map((m) => m.id);
    w.diplo.ally = null;
    expect(ids((id, k) => isleOffered(w, id, k))).toEqual([]);
    expect(isleWhy(w, 'isleFair', 'ally')).toMatch(/allié/);
    w.diplo.ally = 'orient';
    expect(ids((id, k) => isleOffered(w, id, k))).not.toContain('isleSabotage');
    expect(isleWhy(w, 'isleSabotage', 'war')).toMatch(/guerre/);
    w.diplo.path = 'war';
    // (le sabotage, la régate, le transfuge et rebâtir sont retirés le 24 nov. 2026 : la guerre était trop facile)
    expect(ids((id, k) => isleOffered(w, id, k)).sort()).toEqual(['isleFair', 'isleSeeds', 'isleSmiths', 'isleSpy']);
    w.exp.done.push('isleSabotage');
    expect(isleOffered(w, 'isleSabotage', 'war')).toBe(false);
    w.exp.done.pop();
    w.diplo.conflict = 'peace';
    const after = ids((id, k) => isleOffered(w, id, k));
    expect(after).not.toContain('isleSpy');
    expect(after).not.toContain('isleSabotage');
    expect(after).toContain('isleFair');
    // (réussie, elle reste dans la liste)
    w.exp.done.push('isleSpy');
    expect(isleOffered(w, 'isleSpy', 'open')).toBe(true);
  });

  it('les avantages s’ajoutent, bornés, se sauvegardent, et ne bougent plus le conflit réglé ; refaite, une mission n’en rapporte plus', () => {
    const w = world();
    const fair = ISLE_MISSIONS.find((m) => m.id === 'isleFair')!;
    const gold = w.gold;
    applyEffects(w, fair.choices[0].win, 100);
    expect(w.diplo.boons.allies).toBe(2);
    expect(w.diplo.boons.peace).toBe(5);
    expect(w.gold).toBe(gold + 6);
    for (let i = 0; i < 20; i++) addBoon(w.diplo, 'allies', 3);
    expect(w.diplo.boons.allies).toBe(BOON_MAX.allies);
    for (let i = 0; i < 20; i++) addBoon(w.diplo, 'peace', -10);
    expect(w.diplo.boons.peace).toBe(PEACE_MIN);
    const back = readDiplo(JSON.parse(JSON.stringify(saveDiplo(w.diplo))));
    expect(back.boons).toEqual(w.diplo.boons);
    // (une ancienne sauvegarde : rien de gagné)
    expect(readDiplo({ ally: 'asie' }).boons).toEqual({ allies: 0, ours: 0, foes: 0, peace: 0 });
    expect(readDiplo({ boons: { foes: 999, peace: -999 } }).boons).toEqual({ allies: 0, ours: 0, foes: BOON_MAX.foes, peace: PEACE_MIN });
    w.diplo.conflict = 'won';
    const was = { ...w.diplo.boons };
    addBoon(w.diplo, 'foes', 4);
    expect(w.diplo.boons).toEqual(was);
    expect(redoEffects(fair.choices[0].win).some((e) => e.t === 'boon')).toBe(false);
  });

  it('l’avantage se lit sur la carte : « +4 troupes alliées pour la bataille », « +10 % de chances pour la paix »', () => {
    expect(boonText('allies', 4)).toBe('+4 troupes alliées pour la bataille');
    expect(boonText('peace', 10)).toBe('+10 % de chances pour la paix');
    expect(boonText('peace', -5)).toBe('−5 % de chances pour la paix');
    expect(boonText('foes', 6, true)).toBe('−6 ennemis');
    const chips = effectChips([{ t: 'boon', kind: 'foes', n: 6 }, { t: 'boon', kind: 'peace', n: 10 }]);
    expect(chips.map((c) => c.n)).toEqual(['−6', '+10 %']);
  });

  it('les pourparlers de la paix échouent 30 % du temps, moins la bonne volonté gagnée sur les îles', () => {
    const d = newDiplo();
    expect(talkRisk(d)).toBeCloseTo(TALK_RISK);
    expect(TALK_RISK).toBe(0.3);
    d.boons.peace = 15;
    expect(talkRisk(d)).toBeCloseTo(0.15);
    d.boons.peace = 45;
    expect(talkRisk(d)).toBe(0);
    d.boons.peace = -10;
    expect(talkRisk(d)).toBeCloseTo(0.4);
  });

  it('les ennemis ôtés le sont du port d’abord, chaque groupe garde un homme', () => {
    expect(total(foeGroups(0))).toBe(total(FOES as unknown as Record<string, [number, number]>));
    expect(total(foeGroups(4))).toBe(total(foeGroups(0)) - 4);
    expect(foeGroups(4).port[0] + foeGroups(4).port[1]).toBe(1);
    const all = foeGroups(99);
    for (const [k, [s, a]] of Object.entries(all)) expect(s + a, k).toBeGreaterThanOrEqual(1);
    expect(all.palais).toEqual([...FOES.palais]);
  });

  it('à la bataille : les renforts alliés débarquent avec la première vague, nos soldats en plus, moins d’ennemis ; elle se gagne toujours', () => {
    setMapSize(384);
    const w = new World();
    w.seed = 11;
    newWorld(w, CONTINENT, 11, GEN_ARCH);
    const boons = { allies: 6, ours: 3, foes: 9, peace: 0 };
    const plain = new RivalBattle(w, 'asie', 2), boosted = new RivalBattle(w, 'asie', 2, false, undefined, [], boons);
    const foes = (b: RivalBattle) => [...b.foes.values()].reduce((n, ids) => n + ids.length, 0);
    expect(foes(boosted)).toBeLessThan(foes(plain));
    expect(total(boosted.sizes)).toBe(total(plain.sizes) - 9);
    let landed = 0, ours = 0;
    for (let t = 0; t < BATTLE_LIMIT + 10 && !boosted.outcome; t += 0.25) {
      boosted.step(0.25);
      landed = Math.max(landed, boosted.allies.length);
      ours = Math.max(ours, boosted.army.length);
      if (boosted.t > 60 && landed === 0) break;
    }
    expect(ours).toBe(OURS[0] + OURS[1] + 3);
    expect(landed).toBeGreaterThanOrEqual(ALLY_FIRST[0] + ALLY_FIRST[1] + 6);
    expect(boosted.outcome).toBe('won');
  });
});
