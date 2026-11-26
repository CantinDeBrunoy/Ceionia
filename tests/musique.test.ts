import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { MUSIC, STINGS, AGE_OPENERS, AudioEngine, soundSettings, TRACK_TRIM, trackEnd } from '../src/audio/audio';

describe('musique allumée par défaut', () => {
  it('le moteur démarre musique et sons allumés', () => {
    const a = new AudioEngine();
    expect(a.muteMusic).toBe(false);
    expect(a.muteSfx).toBe(false);
  });

  it('sans réglage, ou avec une ancienne sauvegarde (music: false sans choix), la musique joue', () => {
    expect(soundSettings({}).muteMusic).toBe(false);
    expect(soundSettings({ music: false, musicVol: 0.4, volV: 2 })).toMatchObject({ muteMusic: false, musicChosen: false, musicVol: 0.4 });
  });

  it('la musique coupée par le joueur reste coupée ; rallumée, elle joue', () => {
    expect(soundSettings({ music: false, musicChosen: true })).toMatchObject({ muteMusic: true, musicChosen: true });
    expect(soundSettings({ music: true, musicChosen: true }).muteMusic).toBe(false);
  });

  it('les sons suivent la même règle avec sfxChosen', () => {
    expect(soundSettings({ sfx: false }).muteSfx).toBe(false);
    expect(soundSettings({ sfx: false, sfxChosen: true }).muteSfx).toBe(true);
  });
});

describe('musique enregistrée', () => {
  it('chaque âge et chaque scène (menu, Enfers, fin) a sa liste', () => {
    for (const key of ['age0', 'age1', 'age2', 'age3', 'age4', 'age5', 'menu', 'hell', 'end']) expect(MUSIC[key]?.length, key).toBeGreaterThan(0);
  });

  it('chaque morceau a son fichier dans public/sons/musique', () => {
    for (const name of new Set(Object.values(MUSIC).flat())) expect(existsSync(`public/sons/musique/${name}.mp3`), name).toBe(true);
  });

  it('l’Industriel s’ouvre sur la Toccata ; un morceau d’ouverture est dans la liste de son âge', () => {
    expect(AGE_OPENERS.age3).toBe('industriel-toccata');
    for (const [key, name] of Object.entries(AGE_OPENERS)) expect(MUSIC[key], key).toContain(name);
  });

  it('chaque cinématique a son morceau, à elle seule (retour de l’auteur, 26 nov. 2026)', () => {
    const ages = new Set(['age0', 'age1', 'age2', 'age3', 'age4', 'age5'].flatMap((k) => MUSIC[k]));
    for (const key of ['opening', 'portal', 'voyage', 'king', 'peace']) {
      expect(MUSIC[key]?.length, key).toBeGreaterThan(0);
      for (const name of MUSIC[key]) expect(ages.has(name), name).toBe(false);
    }
  });

  it('le coup de musique du trophée a son fichier et n’est dans aucune liste', () => {
    const all = new Set(Object.values(MUSIC).flat());
    for (const name of Object.values(STINGS)) {
      expect(existsSync(`public/sons/musique/${name}.mp3`), name).toBe(true);
      expect(all.has(name), name).toBe(false);
    }
  });

  it('un morceau n’appartient qu’à une liste', () => {
    const all = Object.values(MUSIC).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('volumes : l’ancienne échelle, trop forte, est oubliée ; la nouvelle se relit', () => {
    expect(soundSettings({ musicVol: 0.2, sfxVol: 0.1, ambVol: 0.1 })).toMatchObject({ musicVol: 0.5, sfxVol: 0.5, ambVol: 0.5 });
    expect(soundSettings({ musicVol: 0.3, sfxVol: 0.8, ambVol: 0.6, volV: 2 })).toMatchObject({ musicVol: 0.3, sfxVol: 0.8, ambVol: 0.6 });
    expect(soundSettings({})).toMatchObject({ musicVol: 0.5, sfxVol: 0.5, ambVol: 0.5 });
  });
});

describe('la Toccata (« Il était une fois l’homme ») plus douce et coupée à la moitié', () => {
  it('plus bas que les autres morceaux, et coupée en fondu à la moitié', () => {
    expect(MUSIC.age3).toContain('industriel-toccata');
    expect(TRACK_TRIM['industriel-toccata'].gain).toBeLessThan(1);
    // 8:41 : elle s'efface à partir de 4:20, plus lentement qu'un enchaînement ordinaire
    const e = trackEnd('industriel-toccata', 521);
    expect(e.at).toBeCloseTo(260.5, 1);
    expect(e.fade).toBeGreaterThan(4);
  });
  it('les autres morceaux vont jusqu’au bout, au niveau habituel', () => {
    expect(trackEnd('industriel-gymnopedie', 187)).toEqual({ at: 187, fade: 4 });
    expect(TRACK_TRIM['industriel-gymnopedie']).toBeUndefined();
  });
});
