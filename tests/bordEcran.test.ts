import { describe, expect, it } from 'vitest';
import { edgeDir } from '../src/core/camera';

// la barre du bas flotte à 10 px du bord : entre ses blocs, la carte se voit (testeurs v6, la vue glissait après un clic dans la barre)
const dock = { left: 10, right: 1270, top: 644, bottom: 790 }, hud = { left: 10, right: 1270, top: 10, bottom: 203 };

describe('défilement au bord de l’écran', () => {
  it('ne défile pas dans le cadre de la barre du bas ou du HUD', () => {
    expect(edgeDir(300, 786, 1280, 800, [dock, hud])).toEqual([0, 0]);
    expect(edgeDir(640, 12, 1280, 800, [dock, hud])).toEqual([0, 0]);
  });
  it('défile tout contre le bord, sous la barre comme ailleurs', () => {
    expect(edgeDir(640, 797, 1280, 800, [dock, hud])).toEqual([0, 1]);
    expect(edgeDir(640, 4, 1280, 800, [dock, hud])).toEqual([0, -1]);
    expect(edgeDir(4, 400, 1280, 800, [dock, hud])).toEqual([-1, 0]);
    expect(edgeDir(1277, 400, 1280, 800, [dock, hud])).toEqual([1, 0]);
  });
  it('rien au milieu de l’écran', () => {
    expect(edgeDir(640, 400, 1280, 800, [])).toEqual([0, 0]);
  });
});
