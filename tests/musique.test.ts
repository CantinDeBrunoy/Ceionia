import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { MUSIC } from '../src/audio/audio';

describe('musique enregistrée', () => {
  it('chaque âge et chaque scène (menu, Enfers, fin) a sa liste', () => {
    for (const key of ['age0', 'age1', 'age2', 'age3', 'age4', 'age5', 'menu', 'hell', 'end']) expect(MUSIC[key]?.length, key).toBeGreaterThan(0);
  });

  it('chaque morceau a son fichier dans public/sons/musique', () => {
    for (const name of new Set(Object.values(MUSIC).flat())) expect(existsSync(`public/sons/musique/${name}.mp3`), name).toBe(true);
  });

  it('un morceau n’appartient qu’à une liste', () => {
    const all = Object.values(MUSIC).flat();
    expect(new Set(all).size).toBe(all.length);
  });
});
