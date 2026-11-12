import { describe, it, expect } from 'vitest';
import { nearIsle, ISLE_NEAR_IN, ISLE_NEAR_OUT, STRAIT_MIN } from '../src/world/portal';

/** L'interface de l'île s'affiche quand la vue s'approche de l'île du portail, avec hystérésis (pas de clignotement en bordure) */

describe('Interface de l’île : la vue près de l’île', () => {
  const r = 12;

  it('entre en deçà du seuil d’entrée, pas au-delà', () => {
    expect(nearIsle(false, r + ISLE_NEAR_IN - 0.1, r)).toBe(true);
    expect(nearIsle(false, r + ISLE_NEAR_IN + 0.1, r)).toBe(false);
    expect(nearIsle(false, 0, r)).toBe(true);
  });

  it('une fois près, ne sort qu’au-delà du seuil de sortie', () => {
    expect(nearIsle(true, r + ISLE_NEAR_IN + 3, r)).toBe(true);
    expect(nearIsle(true, r + ISLE_NEAR_OUT - 0.1, r)).toBe(true);
    expect(nearIsle(true, r + ISLE_NEAR_OUT + 0.1, r)).toBe(false);
  });

  it('une vue qui oscille dans la bande entre les deux seuils ne change pas d’état', () => {
    const band = [r + 5, r + 7, r + 5.5, r + 9, r + 6];
    let near = false;
    for (const d of band) near = nearIsle(near, d, r);
    expect(near).toBe(false);
    near = true;
    for (const d of band) near = nearIsle(near, d, r);
    expect(near).toBe(true);
  });

  it('un aller-retour : entre, reste, sort, puis rentre', () => {
    const path = [r + 20, r + 6, r + 3, r + 8, r + 9.5, r + 11, r + 6, r + 2];
    const seen: boolean[] = [];
    let near = false;
    for (const d of path) seen.push(near = nearIsle(near, d, r));
    expect(seen).toEqual([false, false, true, true, true, false, false, true]);
  });

  it('les seuils : l’entrée reste au-dessus du bras de mer, la sortie plus loin que l’entrée', () => {
    expect(ISLE_NEAR_IN).toBeLessThan(STRAIT_MIN);
    expect(ISLE_NEAR_OUT).toBeGreaterThan(ISLE_NEAR_IN);
  });
});
