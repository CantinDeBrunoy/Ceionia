import { clamp } from './rng';

/** Écart de cadence entre le jour et la nuit : 0,6 donne environ 70 % du cycle au jour et 30 % à la nuit */
const NIGHT_SKIP = 0.6;

export class GameTime {
  hour = 9;
  /** 0..4 : 0 printemps, 1 été, 2 automne, 3 hiver */
  seasonT = 0.15;
  dayLen = 100; // secondes réelles par jour
  seasonLen = 160; // secondes réelles par saison
  speed = 1;
  paused = false;
  days = 0;

  /** Retourne le dt de jeu */
  update(dt: number): number {
    if (this.paused || this.speed <= 0) return 0;
    const g = dt * this.speed;
    // les heures de nuit filent plus vite que celles du jour (un tiers du cycle environ), la journée garde sa durée
    this.hour += (g * 24) / this.dayLen / (1 + NIGHT_SKIP * Math.sin(((this.hour - 6) / 24) * Math.PI * 2));
    while (this.hour >= 24) { this.hour -= 24; this.days++; }
    this.seasonT += g / this.seasonLen;
    while (this.seasonT >= 4) this.seasonT -= 4;
    return g;
  }

  get season() { return Math.floor(this.seasonT) % 4; }
  get frac() { return this.seasonT - Math.floor(this.seasonT); }

  /** Transition vers la saison suivante sur les derniers 30 % */
  mix(): { a: number; b: number; t: number } {
    const a = this.season;
    const f = clamp((this.frac - 0.7) / 0.3, 0, 1);
    return { a, b: (a + 1) % 4, t: f * f * (3 - 2 * f) };
  }

  setSeason(i: number) { this.seasonT = i + 0.3; }
}
