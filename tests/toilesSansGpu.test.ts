import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Quand la carte graphique décroche, le navigateur vide les toiles 2D qu'elle tenait. Une texture tirée d'une telle toile
// revenait vide (sol terne) et la mini-carte grise (retour de joueur, 24 nov. 2026) : ces toiles vivent en mémoire ordinaire
const ROOT = join(__dirname, '..', 'src');
/** Toiles d'aperçu, relues aussitôt en image : pas de texture du jeu */
const SKIP = new Set(['thumbs.ts']);

describe('toiles des textures hors de la carte graphique', () => {
  it('chaque toile 2D du rendu est créée avec willReadFrequently', () => {
    const dir = join(ROOT, 'render'), bad: string[] = [];
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts') || SKIP.has(f)) continue;
      const src = readFileSync(join(dir, f), 'utf8');
      for (const m of src.matchAll(/getContext\('2d'([^)]*)\)/g)) if (!m[1].includes('willReadFrequently')) bad.push(f);
    }
    expect(bad).toEqual([]);
  });

  it('le fond de la mini-carte aussi', () => {
    const src = readFileSync(join(ROOT, 'ui', 'minimap.ts'), 'utf8');
    expect(src).toMatch(/b\.getContext\('2d', \{ willReadFrequently: true \}\)/);
  });

  it('le jeu attend le retour du contexte WebGL, sinon recharge la partie', () => {
    const src = readFileSync(join(ROOT, 'main.ts'), 'utf8');
    expect(src).toContain("'webglcontextlost'");
    expect(src).toContain("'webglcontextrestored'");
  });
});
