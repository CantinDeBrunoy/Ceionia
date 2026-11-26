import { describe, it, expect, beforeAll } from 'vitest';
import { placeCard } from '../src/ui/xcard';

/** Un élément de la barre : seulement son rectangle */
const box = (left: number, top: number, right: number, bottom: number) =>
  ({ getBoundingClientRect: () => ({ left, top, right, bottom, width: right - left, height: bottom - top }) }) as unknown as Element;
const card = (h: number) => ({ style: {} as Record<string, string>, dataset: {} as Record<string, string>, offsetHeight: h }) as unknown as HTMLElement;

describe('carte d’explication de la barre de bataille', () => {
  beforeAll(() => { Object.assign(globalThis, { innerWidth: 1366, innerHeight: 768 }); });

  it('passe au-dessus des troupes sur le terrain au lieu d’être cachée dessous (testeur débutant, 26 nov. 2026)', () => {
    // le menu du bas finit près du coin de droite : la carte se pose au-dessus du coin, là où sont les troupes (« Tous »)
    const menu = box(280, 610, 1100, 750), corner = box(1150, 690, 1356, 750), troops = box(1030, 520, 1356, 610);
    const c = card(160);
    placeCard(c, menu, corner, 82, [troops]);
    const bottom = 768 - parseFloat(c.style.bottom);
    expect(bottom).toBeLessThanOrEqual(520);
    // sans les troupes, elle reste juste au-dessus du menu
    const d = card(160);
    placeCard(d, menu, corner, 82);
    expect(768 - parseFloat(d.style.bottom)).toBeGreaterThan(580);
  });
});
