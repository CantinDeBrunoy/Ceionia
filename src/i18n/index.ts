/**
 * Langue du jeu (français ou anglais). Approche « français source » : le code garde ses textes français et les enveloppe de
 * `tr('texte français')` ; en anglais, `tr` cherche ce texte exact dans les dictionnaires (src/i18n/en/*.ts) et rend l'anglais,
 * ou le français tel quel si la traduction manque. Voir src/i18n/README.md pour la convention.
 */
export type Lang = 'fr' | 'en';
export const LANGS: readonly Lang[] = ['fr', 'en'];
export const LANG_KEY = 'ceionia.lang';

const isLang = (v: unknown): v is Lang => v === 'fr' || v === 'en';

/** Langue de départ : celle mémorisée, sinon celle du navigateur si 'en' ou 'fr', sinon 'fr' (hors navigateur : 'fr') */
function detect(): Lang {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(LANG_KEY) : null;
    if (isLang(saved)) return saved;
  } catch { /* stockage indisponible */ }
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
    const l = (navigator.language || '').slice(0, 2).toLowerCase();
    if (isLang(l)) return l;
  }
  return 'fr';
}

let lang: Lang = detect();
const listeners = new Set<(l: Lang) => void>();
const applyHtmlLang = () => { if (typeof document !== 'undefined') document.documentElement.lang = lang; };
applyHtmlLang();

export const getLang = (): Lang => lang;
export const isEnglish = () => lang === 'en';

/** Change la langue (mémorisée, <html lang> à jour) et prévient les abonnés ; sans effet si elle ne change pas */
export function setLang(l: Lang, persist = true) {
  if (!isLang(l) || l === lang) return;
  lang = l;
  if (persist) { try { localStorage.setItem(LANG_KEY, l); } catch { /* ignoré */ } }
  applyHtmlLang();
  for (const f of [...listeners]) f(l);
}

/** S'abonne aux changements de langue ; rend la fonction qui se désabonne */
export function onLangChange(fn: (l: Lang) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ---------------- Dictionnaires ----------------
/** texte français exact -> anglais, tous dictionnaires confondus */
const EN = new Map<string, string>();
/** nom du dictionnaire qui possède chaque clé (pour repérer les doublons) */
const OWNER = new Map<string, string>();
const duplicates: { key: string; first: string; second: string }[] = [];
/** textes passés à tr() sans traduction anglaise */
const missing = new Set<string>();

/** Enregistre un dictionnaire { 'texte français': 'English text' } (appelé à l'import par chaque fichier de src/i18n/en/) */
export function registerDict(name: string, dict: Record<string, string>) {
  for (const k of Object.keys(dict)) {
    const first = OWNER.get(k);
    if (first === undefined) OWNER.set(k, name);
    else if (EN.get(k) !== dict[k]) duplicates.push({ key: k, first, second: name });
    EN.set(k, dict[k]);
    missing.delete(k);
  }
}
/** Clés présentes dans plusieurs dictionnaires avec des valeurs différentes (à régler : la dernière enregistrée l'emporte) */
export const i18nDuplicates = () => duplicates.slice();
/** Les dictionnaires chargés : nom -> nombre d'entrées (pour les tests et le débogage) */
export function i18nDicts(): Map<string, number> {
  const out = new Map<string, number>();
  for (const o of OWNER.values()) out.set(o, (out.get(o) ?? 0) + 1);
  return out;
}
export const i18nEntries = (): ReadonlyMap<string, string> => EN;

/** Remplace les {nom} d'un modèle par les valeurs données (un {nom} sans valeur reste tel quel) */
export function fmt(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/**
 * Traduit un texte français source. En 'fr' ou si la traduction manque : le français, tel quel (placeholders {n} remplis).
 * Le texte doit être un littéral SANS interpolation `${…}` : pour une valeur variable, un placeholder {n} et `params`.
 */
export function tr(fr: string, params?: Record<string, string | number>): string {
  let s = fr;
  if (lang === 'en') {
    const e = EN.get(fr);
    if (e !== undefined) s = e; else missing.add(fr);
  } else if (!EN.has(fr)) missing.add(fr);
  return params ? fmt(s, params) : s;
}
/** Même chose que tr avec des placeholders (nom explicite pour les textes à variables) */
export const trf = tr;
/** Traduit chaque texte d'une liste (SEASONS, noms par âge, points d'une fiche…) */
export const trs = (list: readonly string[]): string[] => list.map((x) => tr(x));

// ---------------- Clés stables (rares) ----------------
const KEYED = new Map<string, { fr: string; en: string }>();
/** Textes à clé stable : { 'menu.title': { fr: '…', en: '…' } } (préférer tr() ; pour les textes réutilisés sous un identifiant) */
export function registerKeys(entries: Record<string, { fr: string; en: string }>) { for (const k of Object.keys(entries)) KEYED.set(k, entries[k]); }
/** Texte d'une clé stable dans la langue courante (la clé elle-même si elle est inconnue) */
export function t(key: string, params?: Record<string, string | number>): string {
  const e = KEYED.get(key);
  return fmt(e ? e[lang] : key, params);
}

// ---------------- Pluriels ----------------
/**
 * Mot au singulier ou au pluriel selon la langue : en français 0 et 1 sont au singulier, en anglais seul 1 l'est.
 * Les deux formes françaises sont traduites par le dictionnaire (`'habitant': 'inhabitant'`, `'habitants': 'inhabitants'`).
 * Rend le mot seul : `${n} ${plural(n, 'habitant', 'habitants')}`
 */
export function plural(n: number, one: string, many: string): string {
  const isOne = lang === 'en' ? Math.abs(n) === 1 : Math.abs(n) < 2;
  return tr(isOne ? one : many);
}
/** Le nombre et le mot : « 1 habitant », « 12 habitants » / « 1 inhabitant », « 12 inhabitants » */
export const nplural = (n: number, one: string, many: string) => `${n} ${plural(n, one, many)}`;

// ---------------- Couverture ----------------
/** Les textes français passés à tr() depuis le lancement (jeu ou tests) qui n'ont pas de traduction anglaise */
export function i18nMissing(): string[] { return [...missing].sort(); }
/** Vide la liste (pour mesurer une zone à la fois) */
export function i18nResetMissing() { missing.clear(); }

if (typeof window !== 'undefined') Object.assign(window, { i18nMissing, i18nDuplicates, setLang, getLang });
