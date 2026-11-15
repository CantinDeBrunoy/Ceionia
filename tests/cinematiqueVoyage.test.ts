import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'fs';
import { World, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { expandWorld } from '../src/world/expand';
import { VOY_ACT2, VOY_CAPTIONS, VOY_DIP, VOY_FILM, VOY_LIFT, VOY_WAIT, VOY_CONTACT, actTotal, voyCaptionAt, voyFilmCaptionAt, voyShotAt, voyVeilAt } from '../src/voyageCine';
import { resumeAt } from '../src/ui/voyage';
import { horizonPath } from '../src/voyageStage';
import { navalSites, SHALLOW } from '../src/sim/navalConflict';
import { MUSIC } from '../src/audio/audio';
import { tr, setLang } from '../src/i18n';
import '../src/i18n/en';

describe('la cinématique « Explorer le monde » : le film', () => {
  it('une vidéo d’environ 20 s, la même pour tous, en WebM et en MP4 de secours, légère (sous 8 Mo chacune)', () => {
    expect(VOY_FILM.dur).toBeGreaterThanOrEqual(15);
    expect(VOY_FILM.dur).toBeLessThanOrEqual(25);
    for (const f of ['public/voyage/traversee.webm', 'public/voyage/traversee.mp4']) {
      const size = statSync(f).size;
      expect(size, f).toBeGreaterThan(200_000);
      // (bien sous la limite de taille par fichier des ressources de Cloudflare Workers, 25 Mio)
      expect(size, f).toBeLessThan(8 * 1024 * 1024);
    }
    const ui = readFileSync('src/ui/voyage.ts', 'utf8');
    expect(ui).toContain('./voyage/traversee.webm');
    expect(ui).toContain('./voyage/traversee.mp4');
  });

  it('ses bandeaux suivent le temps de la vidéo ; fini, le bandeau de l’attente', () => {
    expect(voyFilmCaptionAt(0.5, false)).toBeNull();
    expect(voyFilmCaptionAt(3, false)!.text).toBe('Un navire prend la mer');
    expect(voyFilmCaptionAt(10, false)).toBeNull();
    expect(voyFilmCaptionAt(17, false)!.text).toBe('La brume se lève…');
    expect(voyFilmCaptionAt(3, true)).toEqual(VOY_WAIT);
  });

  it('après le rechargement, il reprend là où il s’était arrêté, sans compter le temps du rechargement (borné au film)', () => {
    expect(resumeAt(null)).toBe(0);
    // (en ligne, le rechargement dure longtemps : le film ne doit pas sauter à sa fin)
    expect(resumeAt({ t: 4, at: 10_000 })).toBe(4);
    expect(resumeAt({ t: 25, at: 0 })).toBe(VOY_FILM.dur);
    expect(resumeAt({ t: -1, at: 0 })).toBe(0);
  });
});

describe('la cinématique « Explorer le monde » : le survol en direct', () => {
  it('l’horizon, les deux îles, les flottes et le retour (≈ 30 s)', () => {
    expect(VOY_ACT2.map((p) => p.id)).toEqual(['horizon', 'orient', 'asie', 'fleets', 'home']);
    expect(actTotal(VOY_ACT2)).toBeGreaterThan(25);
    expect(actTotal(VOY_ACT2)).toBeLessThan(40);
  });

  it('les plans s’enchaînent sans trou ; rien après la fin', () => {
    expect(voyShotAt(VOY_ACT2, 0)!.shot).toBe('horizon');
    let t0 = 0;
    for (const p of VOY_ACT2) {
      const mid = voyShotAt(VOY_ACT2, t0 + p.dur / 2)!;
      expect(mid.shot).toBe(p.id);
      expect(mid.k).toBeCloseTo(0.5, 5);
      t0 += p.dur;
    }
    expect(voyShotAt(VOY_ACT2, actTotal(VOY_ACT2) + 0.01)).toBeNull();
  });

  it('chaque plan du récit a son bandeau, court, qui apparaît et s’efface en douceur', () => {
    for (const id of ['horizon', 'orient', 'asie', 'fleets'] as const) expect(VOY_CAPTIONS.some((c) => c.shot === id)).toBe(true);
    for (const c of VOY_CAPTIONS) expect(c.text.length).toBeLessThanOrEqual(40);
    const c = VOY_CAPTIONS.find((x) => x.shot === 'orient')!, at = VOY_ACT2[0].dur + c.at;
    expect(voyCaptionAt(VOY_ACT2, at - 0.1)).toBeNull();
    expect(voyCaptionAt(VOY_ACT2, at + 0.3)!.alpha).toBeCloseTo(0.5, 5);
    expect(voyCaptionAt(VOY_ACT2, at + 2)!.text).toBe(c.text);
    expect(voyCaptionAt(VOY_ACT2, actTotal(VOY_ACT2) - 1)).toBeNull();
  });

  it('la brume du film se dissipe au début, un fondu au noir à chaque coupe ; sans film (partie rechargée), il s’ouvre au noir', () => {
    expect(voyVeilAt(0).mist).toBe(1);
    expect(voyVeilAt(VOY_LIFT / 2).mist).toBeCloseTo(0.5, 5);
    expect(voyVeilAt(VOY_LIFT + 0.1).mist).toBe(0);
    let cut = 0;
    for (let i = 0; i < VOY_ACT2.length - 1; i++) {
      cut += VOY_ACT2[i].dur;
      expect(voyVeilAt(cut).black).toBeCloseTo(1, 5);
      expect(voyVeilAt(cut + VOY_DIP + 0.05).black).toBe(0);
    }
    expect(voyVeilAt(0, false)).toEqual({ mist: 0, black: 1 });
    expect(voyVeilAt(VOY_DIP + 0.01, false).black).toBe(0);
  });

  it('textes traduits en anglais ; la musique de l’exploration existe', () => {
    expect(MUSIC.age2).toContain('medieval-exploration');
    setLang('en', false);
    try {
      for (const c of [...VOY_CAPTIONS, ...VOY_FILM.captions]) { expect(tr(c.text)).not.toBe(c.text); if (c.sub) expect(tr(c.sub)).not.toBe(c.sub); }
      for (const s of [VOY_WAIT.text, VOY_WAIT.sub, VOY_CONTACT.title, VOY_CONTACT.sub]) expect(tr(s)).not.toBe(s);
    } finally { setLang('fr', false); }
  });
});

describe('la cinématique « Explorer le monde » : le navire de l’horizon', () => {
  it('il file en pleine eau, jamais à travers un îlot de l’archipel (le premier plan en direct le suit)', () => {
    for (const seed of [2026, 11]) {
      setMapSize(192);
      const w0 = new World();
      newWorld(w0, 3, seed, GEN);
      const big = expandWorld(JSON.parse(JSON.stringify(w0.toJSON())), w0.mapId, w0.seed);
      setMapSize(big.n);
      try {
        const w = new World();
        w.fromJSON(big);
        const s = navalSites(w)!;
        const path = horizonPath(w, s.battle);
        expect(path.length, `graine ${seed}`).toBeGreaterThan(20);
        for (const [x, z] of path) expect(w.cellAvg(Math.floor(x), Math.floor(z)), `graine ${seed} (${x.toFixed(0)}, ${z.toFixed(0)})`).toBeLessThan(SHALLOW);
      } finally { setMapSize(192); }
    }
  });
});

describe('la cinématique « Explorer le monde » : les sauvegardes', () => {
  it('le monde agrandi la demande une fois (`reveal`) ; une partie déjà agrandie, rechargée après, ne la rejoue pas', () => {
    setMapSize(192);
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    const big = expandWorld(JSON.parse(JSON.stringify(w.toJSON())), w.mapId, w.seed);
    setMapSize(big.n);
    try {
      const first = new World();
      first.fromJSON(big);
      expect(first.reveal).toBe(true);
      // elle a joué : la sauvegarde suivante ne la porte plus
      first.reveal = false;
      const again = new World();
      again.fromJSON(JSON.parse(JSON.stringify(first.toJSON())));
      expect(again.reveal).toBe(false);
      expect(again.isles).toBeTruthy();
    } finally { setMapSize(192); }
  });
});
