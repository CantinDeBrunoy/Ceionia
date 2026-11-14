import { describe, it, expect } from 'vitest';
import { PopupGate, CALM } from '../src/ui/popupGate';

/** Avance la porte de `secs` secondes, par images de 1/60 s */
const run = (g: PopupGate, secs: number, busy = false) => { for (let t = 0; t < secs; t += 1 / 60) g.step(1 / 60, busy); };

describe('fenêtres automatiques : une à la fois, jamais par-dessus une autre', () => {
  it('ne s’ouvre qu’après un moment de calme', () => {
    const g = new PopupGate();
    expect(g.open).toBe(false);
    run(g, CALM * 0.5);
    expect(g.open).toBe(false);
    run(g, CALM);
    expect(g.open).toBe(true);
  });

  it('au passage d’âge, la fenêtre de l’âge passe d’abord : rien ne s’ouvre pendant le délai, ni tant qu’elle est ouverte', () => {
    const g = new PopupGate();
    run(g, 5);
    expect(g.open).toBe(true);
    // passage d'âge : la bannière, puis la fenêtre de l'âge 3,6 s plus tard
    g.hold(5);
    run(g, 3.6);
    expect(g.open).toBe(false);
    // la fenêtre de l'âge est ouverte (une `.overlay`) : le joueur la lit 20 s
    run(g, 20, true);
    expect(g.open).toBe(false);
    // il clique « C'est parti » : la carte suivante attend encore un peu de calme
    run(g, 0.3);
    expect(g.open).toBe(false);
    run(g, CALM);
    expect(g.open).toBe(true);
  });

  it('une carte qui s’ouvre referme la porte : la suivante attend qu’elle se ferme', () => {
    const g = new PopupGate();
    run(g, 3);
    expect(g.open).toBe(true);
    g.taken();
    expect(g.open).toBe(false);
    // la carte est à l'écran
    run(g, 10, true);
    expect(g.open).toBe(false);
    run(g, CALM + 0.1);
    expect(g.open).toBe(true);
  });
});
