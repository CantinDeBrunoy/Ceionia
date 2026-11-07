import { describe, it, expect } from 'vitest';
import { World, setMapSize } from '../src/world/world';
import { KINDS, KindId } from '../src/build/catalog';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import type { Choice } from '../src/sim/missions';
import { SECURITY, SECURITY_MAX, securityCuts, securityK } from '../src/sim/security';

const village = (...ks: KindId[]) => (k: KindId) => ks.includes(k);

describe('bâtiments de sécurité et expéditions', () => {
  it('sans pompiers ni police, rien ne change', () => {
    expect(securityK(['beast'], village())).toBe(1);
    expect(securityCuts(['beast'], village('school', 'health'))).toEqual([]);
  });

  it('chacun retire 5 % partout, 10 % face aux dangers de son ressort', () => {
    // les pompiers : chutes, eau vive, intempéries
    expect(securityK(['fall'], village('fire'))).toBeCloseTo(0.9);
    expect(securityK(['water'], village('fire'))).toBeCloseTo(0.9);
    expect(securityK(['dark'], village('fire'))).toBeCloseTo(0.95);
    // la police : bêtes et créatures
    expect(securityK(['beast'], village('police'))).toBeCloseTo(0.9);
    expect(securityK(['monster', 'dark'], village('police'))).toBeCloseTo(0.9);
    expect(securityK(['weather'], village('police'))).toBeCloseTo(0.95);
  });

  it('les deux ensemble se cumulent, mais jamais au-delà du plafond', () => {
    expect(securityK(['dark'], village('fire', 'police'))).toBeCloseTo(0.95 * 0.95);
    expect(securityK(['beast'], village('fire', 'police'))).toBeCloseTo(0.9 * 0.95);
    // chacun à 10 % ferait −19 % : plafonné à −15 %
    expect(securityK(['beast', 'weather'], village('fire', 'police'))).toBeCloseTo(1 - SECURITY_MAX);
    expect(securityCuts(['beast', 'weather'], village('fire', 'police')).map((s) => s.cut)).toEqual([0.1, 0.1]);
    // le plafond reste modeste : le risque ne tombe jamais à zéro
    expect(SECURITY_MAX).toBeLessThanOrEqual(0.2);
    for (const s of SECURITY) expect(s.vsCut).toBeLessThanOrEqual(SECURITY_MAX);
  });

  it('les bâtiments concernés existent et leur fiche le dit', () => {
    for (const s of SECURITY) {
      expect(KINDS[s.kind], s.kind).toBeTruthy();
      expect(KINDS[s.kind].perk, s.kind).toMatch(/risque −5 %, −10 %/);
    }
  });

  it('le risque d’un choix en tient compte ; un seul bâtiment de chaque sorte compte', () => {
    setMapSize(64);
    const w = new World();
    const ex = new Expeditions(w, new Agents(w), () => 100, () => 0.5);
    const c = { risk: 0.2, dest: 'forest', win: [] } as unknown as Choice;
    const base = ex.riskOf(c);
    expect(base).toBeGreaterThan(0);
    const counts: Partial<Record<string, number>> = {};
    ex.has = (k: string) => (counts[k] ?? 0) > 0;
    counts.police = 1;
    expect(ex.riskOf(c)).toBeCloseTo(base * 0.9);
    // dix postes de police n'aident pas plus qu'un seul
    counts.police = 10;
    expect(ex.riskOf(c)).toBeCloseTo(base * 0.9);
    counts.fire = 3;
    expect(ex.riskOf(c)).toBeCloseTo(base * 0.9 * 0.95);
  });
});
