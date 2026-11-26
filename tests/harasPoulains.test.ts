import { describe, it, expect } from 'vitest';
import { breedHorses, FOAL_S, STABLE_CAP, newExpState, readExpState } from '../src/sim/missions';

/** Un village réduit à ce que lit `breedHorses` : ses bâtiments et l'état des expéditions */
const village = (stables: number, horses = 0) => {
  const buildings = new Map<number, { kind: string }>();
  for (let i = 0; i < stables; i++) buildings.set(i, { kind: 'stable' });
  const exp = newExpState();
  for (let i = 0; i < horses; i++) exp.herd.push('horse');
  return { buildings, exp } as any;
};
const horses = (w: any) => w.exp.herd.filter((k: string) => k === 'horse').length;

describe('haras : les écuries élèvent des chevaux', () => {
  it('un haras vide fait naître un poulain toutes les FOAL_S secondes, jusqu’à ses quatre stalles', () => {
    const w = village(1);
    expect(breedHorses(w, FOAL_S - 1)).toBe(0);
    expect(breedHorses(w, 1)).toBe(1);
    for (let i = 0; i < 10; i++) breedHorses(w, FOAL_S);
    expect(horses(w)).toBe(STABLE_CAP);
  });

  it('sans écurie, aucun poulain', () => {
    const w = village(0);
    expect(breedHorses(w, FOAL_S * 5)).toBe(0);
    expect(horses(w)).toBe(0);
  });

  it('un cheval monté libère sa stalle', () => {
    const w = village(1, STABLE_CAP);
    expect(breedHorses(w, FOAL_S)).toBe(0);
    w.exp.riding = 1;
    expect(breedHorses(w, FOAL_S)).toBe(1);
  });

  it('une ancienne sauvegarde sans le champ se relit à 0', () => {
    expect(readExpState({ herd: ['horse'] }).foal).toBe(0);
    expect(readExpState({ foal: 120 }).foal).toBe(120);
  });
});
