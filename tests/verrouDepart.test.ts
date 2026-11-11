import { describe, it, expect } from 'vitest';
import { isStart, startRefusal, START_KIND } from '../src/build/startLock';

const vide = { buildings: { size: 0 } }, bati = { buildings: { size: 1 } };
const tools = ['raise', 'lower', 'flatten', 'cliff', 'dig', 'mountain', 'volcano', 'forest', 'field', 'biome', 'rocks', 'cave', 'fissure', 'erase', 'road', 'bulldoze', 'move'];

describe('verrou de départ', () => {
  it('village vide : seul le feu de camp se pose', () => {
    expect(START_KIND).toBe('gather');
    expect(startRefusal(vide, 'build', 'gather', 'Feu de camp')).toBeNull();
    expect(startRefusal(vide, 'none', undefined, 'Feu de camp')).toBeNull();
    expect(startRefusal(vide, 'build', 'house', 'Feu de camp')).toBe('Posez d’abord « Feu de camp » : c’est la place du village');
    for (const t of tools) expect(startRefusal(vide, t, undefined, 'Feu de camp'), t).not.toBeNull();
  });
  it('une fois le feu de camp posé, tout est libre', () => {
    expect(isStart(bati)).toBe(false);
    for (const t of tools) expect(startRefusal(bati, t, undefined, 'Feu de camp'), t).toBeNull();
    expect(startRefusal(bati, 'build', 'house', 'Feu de camp')).toBeNull();
  });
});
