import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SkipGate, SKIP_ASK, SKIP_SAME } from '../src/ui/skipAsk';

/** Tous les fichiers .ts de `src` */
function sources(dir = 'src'): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('passer une cinématique en deux temps', () => {
  it('le premier appui demande, le second passe', () => {
    const g = new SkipGate();
    expect(g.press(10)).toBe('ask');
    expect(g.press(11)).toBe('go');
    // passé : un nouvel appui redemande
    expect(g.press(12)).toBe('ask');
  });

  it('le même geste (pointerdown puis click, double-clic) ne confirme pas', () => {
    const g = new SkipGate();
    expect(g.press(5)).toBe('ask');
    expect(g.press(5 + SKIP_SAME / 2)).toBe('same');
    expect(g.press(5 + SKIP_SAME + 0.01)).toBe('go');
  });

  it('la demande expire : trop tard, on redemande', () => {
    const g = new SkipGate();
    expect(g.press(0)).toBe('ask');
    expect(g.press(SKIP_ASK + 0.5)).toBe('ask');
    expect(g.press(SKIP_ASK + 1)).toBe('go');
  });

  it('chaque cinématique qui a un bouton « Passer » passe par la demande, Échap compris', () => {
    const files = sources().filter((p) => /class="(kc-skip|tc-skip|skip)\b/.test(readFileSync(p, 'utf8')));
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const p of files) {
      const s = readFileSync(p, 'utf8');
      expect(s, p).toMatch(/skipAsk\(/);
      // plus aucun gestionnaire de clic ou de touche qui passe d'un coup
      expect(s, p).not.toMatch(/(pointerdown|onclick)[^\n]*this\.skip\(\)/);
      expect(s, p).not.toMatch(/stopImmediatePropagation\(\);\s*\n\s*this\.skip\(\);/);
    }
  });
});
