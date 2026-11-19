import { describe, it, expect } from 'vitest';
import { MISSIONS } from '../src/sim/missions';

// Le décor propre à un choix est lu dans `Choice.variant`, plus dans son libellé (renommer ou traduire un choix le cassait sans erreur)
describe('variantes de décor des choix', () => {
  const of = (id: string) => MISSIONS.find((m) => m.id === id)!.choices.map((c) => c.variant ?? null);
  it('chaque variante est portée par le bon choix, et lui seul', () => {
    expect(of('moon')).toEqual([null, 'craters']);
    expect(of('colony')).toEqual([null, 'warp']);
    expect(of('galleon')).toEqual([null, 'diver']);
    const dragon = MISSIONS.find((m) => m.id === 'dragon')!.choices;
    expect(dragon.filter((c) => c.variant === 'smoke').map((c) => c.scene)).toEqual(['dragon']);
    // les pourparlers de la paix : par l'île alliée, sur la petite île, à bord (voir `tripSetup`)
    expect(of('envoys')).toEqual(['ally', null]);
    expect(of('truce')).toEqual(['islet', 'ship']);
    // le volcan : la coulée tiède, le bord du lac de lave, la tranchée
    expect(of('obsidian')).toEqual([null, 'hot']);
    expect(of('ascent')).toEqual([null, 'lava']);
    expect(of('eruption')).toEqual([null, 'trench']);
    const all = MISSIONS.flatMap((m) => m.choices).filter((c) => c.variant);
    expect(all).toHaveLength(10);
  });
});
