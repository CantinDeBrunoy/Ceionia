import { describe, it, expect, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tr, trf, trs, t, registerKeys, plural, nplural, fmt, setLang, getLang, onLangChange, registerDict, i18nMissing, i18nResetMissing, i18nDuplicates, i18nEntries, i18nDicts } from '../src/i18n';
import '../src/i18n/en';

afterEach(() => setLang('fr', false));

const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');

describe('i18n : langue et traduction', () => {
  it('le français est la langue par défaut hors navigateur, et tr rend la source', () => {
    expect(getLang()).toBe('fr');
    registerDict('test', { 'Bonjour tout le monde': 'Hello everyone', '{n} habitants disponibles': '{n} inhabitants available' });
    expect(tr('Bonjour tout le monde')).toBe('Bonjour tout le monde');
    expect(tr('{n} habitants disponibles', { n: 3 })).toBe('3 habitants disponibles');
  });

  it('en anglais, tr rend la traduction, les placeholders sont remplis, une clé manquante reste en français', () => {
    registerDict('test', { 'Bonjour tout le monde': 'Hello everyone', '{n} habitants disponibles': '{n} inhabitants available' });
    setLang('en', false);
    expect(tr('Bonjour tout le monde')).toBe('Hello everyone');
    expect(trf('{n} habitants disponibles', { n: 3 })).toBe('3 inhabitants available');
    expect(tr('Phrase sans traduction {x}', { x: 1 })).toBe('Phrase sans traduction 1');
    expect(i18nMissing()).toContain('Phrase sans traduction {x}');
    expect(trs(['Bonjour tout le monde'])).toEqual(['Hello everyone']);
  });

  it('les évènements de changement de langue sont émis une fois par changement', () => {
    const seen: string[] = [];
    const off = onLangChange((l) => seen.push(l));
    setLang('en', false); setLang('en', false); setLang('fr', false);
    off(); setLang('en', false);
    expect(seen).toEqual(['en', 'fr']);
  });

  it('pluriel : en français 0 et 1 au singulier, en anglais seul 1', () => {
    registerDict('test', { habitant: 'inhabitant', habitants: 'inhabitants' });
    expect(nplural(0, 'habitant', 'habitants')).toBe('0 habitant');
    expect(plural(2, 'habitant', 'habitants')).toBe('habitants');
    setLang('en', false);
    expect(nplural(0, 'habitant', 'habitants')).toBe('0 inhabitants');
    expect(nplural(1, 'habitant', 'habitants')).toBe('1 inhabitant');
  });

  it('clés stables et fmt', () => {
    registerKeys({ 'test.k': { fr: 'Salut {a}', en: 'Hi {a}' } });
    expect(t('test.k', { a: 'Zoé' })).toBe('Salut Zoé');
    setLang('en', false);
    expect(t('test.k', { a: 'Zoé' })).toBe('Hi Zoé');
    expect(t('inconnue')).toBe('inconnue');
    expect(fmt('{a}-{b}', { a: 1 })).toBe('1-{b}');
  });
});

describe('i18n : dictionnaires', () => {
  it('chaque entrée garde les mêmes placeholders en français et en anglais', () => {
    const bad = [...i18nEntries()].filter(([fr, en]) => holes(fr) !== holes(en)).map(([fr]) => fr);
    expect(bad).toEqual([]);
  });

  it('aucune traduction vide, aucune clé en double entre dictionnaires', () => {
    expect([...i18nEntries()].filter(([, en]) => !en.trim()).map(([fr]) => fr)).toEqual([]);
    const dup = i18nDuplicates().filter((d) => d.second !== 'test' && d.first !== 'test');
    for (const d of dup) console.warn(`i18n : clé en double (${d.first} / ${d.second}) : ${d.key}`);
    expect(dup).toEqual([]);
    expect(i18nDicts().size).toBeGreaterThan(0);
  });
});

/** Les littéraux passés à tr()/trf()/plural() dans src/, trouvés dans le code (sans lancer le jeu) */
function scan() {
  const found: { file: string; text: string; interpolated: boolean }[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (f !== 'i18n') walk(p); continue; }
      if (!p.endsWith('.ts')) continue;
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(/(?<![\w.$])(?:tr|trf)\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
        const raw = m[2];
        const text = m[1] === '`' ? raw : raw.replace(/\\(['"\\])/g, '$1');
        found.push({ file: p, text, interpolated: m[1] === '`' && raw.includes('${') });
      }
    }
  };
  walk('src');
  return found;
}

describe('i18n : couverture', () => {
  it('aucun tr() ne contient d\'interpolation ${…} : il faut un placeholder {n} et des params', () => {
    expect(scan().filter((f) => f.interpolated).map((f) => `${f.file} : ${f.text}`)).toEqual([]);
  });

  it('textes de tr() sans traduction anglaise (informatif ; I18N_STRICT=1 pour échouer)', () => {
    i18nResetMissing();
    const miss = [...new Set(scan().filter((f) => !f.interpolated && !i18nEntries().has(f.text)).map((f) => f.text))];
    if (miss.length) console.info(`i18n : ${miss.length} texte(s) sans traduction anglaise, ex. :\n  ${miss.slice(0, 15).join('\n  ')}`);
    if (process.env.I18N_STRICT) expect(miss).toEqual([]);
    else expect(Array.isArray(miss)).toBe(true);
  });
});
