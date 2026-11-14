import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { MUSIC, AudioEngine, soundSettings } from '../src/audio/audio';

describe('musique allumée par défaut', () => {
  it('le moteur démarre musique et sons allumés', () => {
    const a = new AudioEngine();
    expect(a.muteMusic).toBe(false);
    expect(a.muteSfx).toBe(false);
  });

  it('sans réglage, ou avec une ancienne sauvegarde (music: false sans choix), la musique joue', () => {
    expect(soundSettings({}).muteMusic).toBe(false);
    expect(soundSettings({ music: false, musicVol: 0.4 })).toMatchObject({ muteMusic: false, musicChosen: false, musicVol: 0.4 });
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

  it('un morceau n’appartient qu’à une liste', () => {
    const all = Object.values(MUSIC).flat();
    expect(new Set(all).size).toBe(all.length);
  });
});
