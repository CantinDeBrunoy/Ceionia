import { describe, it, expect } from 'vitest';
import { OPEN_FILM, OPEN_FALLBACK, OPEN_LIVE, OPEN_LIFT, OPEN_LIVE_CAPTION, openFilmCaptionAt, openFallbackPlan, openLiveCaptionAt, openCloudAt, openViewAt, openingDue } from '../src/openingCine';
import { fetchFilm, filmOrder, FILM_WAIT } from '../src/ui/filmLoad';
import { tr, setLang } from '../src/i18n';
import '../src/i18n/en';

describe('la cinématique d’ouverture : la partition', () => {
  it('deux plans vidéo d’environ 10 s collés, puis le direct : environ 26 s, en WebM puis MP4', () => {
    expect(OPEN_FILM.dur).toBeCloseTo(19.58, 1);
    expect(OPEN_FILM.webm).toMatch(/^\.\/ouverture\/.*\.webm$/);
    expect(OPEN_FILM.mp4).toMatch(/^\.\/ouverture\/.*\.mp4$/);
    expect(OPEN_FILM.dur + OPEN_LIVE).toBeGreaterThanOrEqual(20);
    expect(OPEN_FILM.dur + OPEN_LIVE).toBeLessThanOrEqual(27);
    // (le fondu de remplacement est plus court que le film : sans vidéo, on attend moins)
    expect(OPEN_FALLBACK).toBeLessThan(OPEN_FILM.dur);
  });

  it('un bandeau par plan vidéo, chacun dans son plan, qui paraît et s’efface en douceur', () => {
    expect(OPEN_FILM.captions).toHaveLength(2);
    const [a, b] = OPEN_FILM.captions;
    expect(a.at + a.dur).toBeLessThanOrEqual(8);
    expect(b.at).toBeGreaterThanOrEqual(8);
    expect(b.at + b.dur).toBeLessThanOrEqual(OPEN_FILM.dur);
    for (const c of OPEN_FILM.captions) {
      expect(openFilmCaptionAt(c.at + c.dur / 2)).toMatchObject({ text: c.text, alpha: 1 });
      expect(openFilmCaptionAt(c.at)!.alpha).toBe(0);
    }
    expect(openFilmCaptionAt(0)).toBeNull();
    expect(openFilmCaptionAt(OPEN_FILM.dur)).toBeNull();
  });

  it('le fondu de remplacement garde les deux bandeaux, dans sa durée, puis la nuée le recouvre', () => {
    const p = openFallbackPlan();
    expect(p.captions.map((c) => c.text)).toEqual(OPEN_FILM.captions.map((c) => c.text));
    for (const c of p.captions) expect(c.delay + c.dur).toBeLessThanOrEqual(OPEN_FALLBACK);
    expect(p.captions[1].delay).toBeGreaterThanOrEqual(p.captions[0].delay + p.captions[0].dur);
    expect(p.cloudAt + p.cloudDur).toBeCloseTo(OPEN_FALLBACK);
  });

  it('le direct : la nuée se lève, le bandeau du foyer, et la vue finit exactement sur celle du départ', () => {
    expect(openCloudAt(0)).toBe(1);
    expect(openCloudAt(OPEN_LIFT)).toBe(0);
    expect(OPEN_LIVE_CAPTION.at + OPEN_LIVE_CAPTION.dur).toBeLessThanOrEqual(OPEN_LIVE);
    expect(openLiveCaptionAt(OPEN_LIVE_CAPTION.at + 2)?.text).toBe('Ici, ils allaient bâtir leur foyer');
    const to = { x: 90, z: 100, yaw: 0.75, pitch: 0.85, dist: 34 };
    const start = openViewAt(0, { x: 80, z: 120 }, to), end = openViewAt(1, { x: 80, z: 120 }, to);
    // (du ciel, au-dessus de la bête, en plongée)
    expect(start).toMatchObject({ x: 80, z: 120 });
    expect(start.dist).toBeGreaterThan(to.dist * 3);
    expect(start.pitch).toBeGreaterThan(1.2);
    for (const k of ['x', 'z', 'yaw', 'pitch', 'dist'] as const) expect(end[k]).toBeCloseTo(to[k]);
    // la vue descend sans jamais remonter
    let d = Infinity;
    for (let k = 0; k <= 1; k += 0.05) { const v = openViewAt(k, { x: 80, z: 120 }, to); expect(v.dist).toBeLessThanOrEqual(d + 1e-9); d = v.dist; }
  });

  it('une seule fois, au début d’une partie neuve : ni en reprenant, ni au bac à sable, ni coupée dans les paramètres', () => {
    const neuve = { fresh: true, sandbox: false, age: 0, off: false };
    expect(openingDue(neuve)).toBe(true);
    expect(openingDue({ ...neuve, fresh: false })).toBe(false);
    // (bac à sable et âge de départ avancé compris : toute partie neuve)
    expect(openingDue({ ...neuve, sandbox: true })).toBe(true);
    expect(openingDue({ ...neuve, sandbox: true, age: 2 })).toBe(true);
    expect(openingDue({ ...neuve, off: true })).toBe(false);
  });

  it('les textes affichés ont leur anglais, sans point-virgule', () => {
    const texts = [...OPEN_FILM.captions.flatMap((c) => [c.text, c.sub!]), OPEN_LIVE_CAPTION.text, 'Chargement de la cinématique…'];
    for (const t of texts) expect(t).not.toContain(';');
    setLang('en', false);
    for (const t of texts) expect(tr(t)).not.toBe(t);
    setLang('fr', false);
  });
});

describe('les films des cinématiques : un vrai chargement avant la lecture', () => {
  const files = { webm: './f.webm', mp4: './f.mp4' };
  /** un faux réseau : chaque fichier, sa taille (absent : 404), lu en quatre morceaux */
  const net = (sizes: Record<string, number>, seen: string[] = []) => (async (url: string, init?: { signal?: AbortSignal }) => {
    seen.push(url);
    if (init?.signal?.aborted) throw new Error('coupé');
    const n = sizes[url];
    if (n === undefined) return new Response(null, { status: 404 });
    const part = new Uint8Array(n / 4);
    const body = new ReadableStream({ start(c) { for (let i = 0; i < 4; i++) c.enqueue(part); c.close(); } });
    return new Response(body, { headers: { 'content-length': String(n) } });
  }) as unknown as typeof fetch;

  it('la WebM d’abord quand le navigateur la lit, sinon le MP4 seul', () => {
    expect(filmOrder(files, (t) => (t.includes('webm') ? 'probably' : 'maybe'))).toEqual(['./f.webm', './f.mp4']);
    expect(filmOrder(files, (t) => (t.includes('webm') ? '' : 'maybe'))).toEqual(['./f.mp4']);
  });

  it('le film entier en mémoire, avec son avancée jusqu’au bout ; la WebM absente, le MP4', async () => {
    const real = globalThis.fetch, seen: string[] = [];
    globalThis.fetch = net({ './f.mp4': 400 }, seen);
    try {
      const ks: number[] = [];
      const url = await fetchFilm(['./f.webm', './f.mp4'], (k) => ks.push(k), new AbortController().signal);
      expect(url).toMatch(/^blob:/);
      expect(seen).toEqual(['./f.webm', './f.mp4']);
      expect(ks[ks.length - 1]).toBe(1);
      for (let i = 1; i < ks.length; i++) expect(ks[i]).toBeGreaterThanOrEqual(ks[i - 1]);
      URL.revokeObjectURL(url!);
    } finally { globalThis.fetch = real; }
  });

  it('rien de lisible, ou trop lent (arrêté) : pas de film, l’image de remplacement le remplace', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = net({});
    try {
      expect(await fetchFilm(['./f.webm', './f.mp4'], () => {}, new AbortController().signal)).toBeNull();
      globalThis.fetch = net({ './f.webm': 400 });
      const stop = new AbortController();
      stop.abort();
      expect(await fetchFilm(['./f.webm'], () => {}, stop.signal)).toBeNull();
    } finally { globalThis.fetch = real; }
    // (au plus une vingtaine de secondes d'attente : au-delà, le fondu de remplacement)
    expect(FILM_WAIT).toBeLessThanOrEqual(25000);
  });
});
