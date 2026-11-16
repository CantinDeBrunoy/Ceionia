import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Environment } from '../src/render/env';
import { GameTime } from '../src/core/time';
import { makeSeasonState } from '../src/render/season';
import { loadSettings } from '../src/save/save';

/** Un ciel sans écran : le constructeur ne touche que les ombres du rendu */
function sky() {
  const renderer = { shadowMap: {} } as unknown as THREE.WebGLRenderer;
  const env = new Environment(new THREE.Scene(), renderer, false);
  const time = new GameTime();
  time.hour = 11;
  const s = makeSeasonState(), focus = new THREE.Vector3(50, 0, 50);
  /** il fait `kind` depuis `sec` secondes, caméra proche */
  const run = (kind: 'rain' | 'snow' | 'fog', sec = 6) => {
    env.setWeather(kind);
    for (let t = 0; t < sec; t += 0.1) env.update(0.1, time, s, focus, 0.1, 30);
  };
  return { env, run };
}

describe('Effets de la météo (réglages)', () => {
  it('affichés par défaut : pluie, neige et brouillard se voient', () => {
    const { env, run } = sky();
    expect(env.show).toEqual({ rain: true, snow: true, fog: true });
    run('rain');
    expect(env.rain.visible).toBe(true);
    expect(env.fog.far).toBeLessThan(200);
  });

  it('pluie coupée : plus de traits ni de ciel gris, mais il pleut toujours pour la simulation', () => {
    const { env, run } = sky();
    env.show.rain = false;
    run('rain');
    expect(env.rain.visible).toBe(false);
    expect(env.shownRain).toBe(0);
    expect(env.shownOvercast).toBe(0);
    // les champs, les habitants à l'abri, les sons lisent `rainK` : il pleut
    expect(env.weatherKind).toBe('rain');
    expect(env.rainK).toBeGreaterThan(0.9);
  });

  it('neige coupée : plus de flocons, même pas ceux qui flottent l’hiver', () => {
    const { env, run } = sky();
    env.show.snow = false;
    run('snow');
    expect(env.snowPts.visible).toBe(false);
    expect(env.weatherKind).toBe('snow');
  });

  it('brouillard coupé : la vue porte aussi loin que par temps clair', () => {
    const clear = sky();
    clear.run('fog', 0.05);
    const far = clear.env.fog.far;
    const { env, run } = sky();
    env.show.fog = false;
    run('fog');
    expect(env.weatherKind).toBe('fog');
    expect(env.shownFog).toBe(0);
    expect(env.fog.far).toBeCloseTo(far, 0);
  });

  it('une ancienne sauvegarde de réglages, sans ces champs, affiche tout', () => {
    const store: Record<string, string> = { 'village-lowpoly:v1:settings': JSON.stringify({ dayLen: 130, seasonLen: 240, speed: 1, musicVol: 0.5, sfxVol: 0.5 }) };
    (globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } } as Storage;
    const st = loadSettings();
    const show = { rain: !st.hideRain, snow: !st.hideSnow, fog: !st.hideFog };
    expect(show).toEqual({ rain: true, snow: true, fog: true });
  });
});
