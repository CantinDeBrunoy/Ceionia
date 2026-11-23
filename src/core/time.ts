import { clamp } from './rng';

/** Écart de cadence entre le jour et la nuit : 0,6 donne environ 70 % du cycle au jour et 30 % à la nuit */
const NIGHT_SKIP = 0.6;
/** Part de la saison sur laquelle le décor passe d'une saison à l'autre */
const BLEND = 0.3;

export class GameTime {
  hour = 9;
  /** 0..4 : 0 printemps, 1 été, 2 automne, 3 hiver */
  seasonT = 0.15;
  dayLen = 130; // secondes réelles par jour
  seasonLen = 240; // secondes réelles par saison
  speed = 1;
  paused = false;
  days = 0;
  /**
   * Les saisons éteintes par le joueur (Paramètres › Temps et météo) : l'horloge les saute, et le décor passe directement
   * d'une saison allumée à la suivante. Une seule allumée : elle dure toujours. Aucune : toutes reviennent (`isOn`)
   */
  off: boolean[] = [false, false, false, false];

  /** Retourne le dt de jeu */
  update(dt: number): number {
    if (this.paused || this.speed <= 0) return 0;
    const g = dt * this.speed;
    // (un pas aberrant, infini ou non numérique, ne fait rien avancer : il aurait figé le jeu ou abîmé l'heure)
    if (!Number.isFinite(g) || g < 0) return 0;
    if (!Number.isFinite(this.hour)) this.hour = 9;
    if (!Number.isFinite(this.seasonT)) this.seasonT = 0.15;
    // les heures de nuit filent plus vite que celles du jour (un tiers du cycle environ), la journée garde sa durée
    this.hour += (g * 24) / this.dayLen / (1 + NIGHT_SKIP * Math.sin(((this.hour - 6) / 24) * Math.PI * 2));
    // d'un coup, sans boucle (une heure énorme ne finissait jamais de retomber sous 24)
    if (this.hour >= 24) { const d = Math.floor(this.hour / 24); this.days += d; this.hour -= d * 24; if (!(this.hour >= 0 && this.hour < 24)) this.hour = 0; }
    this.seasonT += g / this.seasonLen;
    if (this.seasonT >= 4) { this.seasonT %= 4; if (!Number.isFinite(this.seasonT)) this.seasonT = 0; }
    this.skipOff();
    return g;
  }

  /** La saison `i` a lieu (aucune allumée : toutes ont lieu, la partie ne se fige pas sans saison) */
  isOn(i: number) { return !this.off[i] || this.off.every(Boolean); }
  /** La prochaine saison allumée après `i` (elle-même si c'est la seule) */
  nextOn(i: number) { for (let k = 1; k <= 4; k++) { const j = (i + k) % 4; if (this.isOn(j)) return j; } return i; }
  /** La dernière saison allumée avant `i` */
  prevOn(i: number) { for (let k = 1; k <= 4; k++) { const j = (i + 4 - k) % 4; if (this.isOn(j)) return j; } return i; }

  /** Entré dans une saison éteinte : au début de la prochaine allumée (la seule allumée recommence à son début) */
  skipOff() {
    const s = Math.floor(this.seasonT) % 4;
    if (this.isOn(s)) return;
    this.seasonT = this.nextOn(s) + Math.min(this.frac, 0.05);
  }

  /** Éteint ou rallume des saisons (indices 0 printemps … 3 hiver) ; la saison en cours, éteinte, passe aussitôt */
  setOff(list: readonly number[]) {
    this.off = [0, 1, 2, 3].map((i) => list.includes(i));
    this.skipOff();
  }
  /** Les saisons éteintes, pour la sauvegarde */
  offList() { return [0, 1, 2, 3].filter((i) => this.off[i]); }

  get season() { return Math.floor(this.seasonT) % 4; }
  get frac() { return this.seasonT - Math.floor(this.seasonT); }

  /**
   * Transition du décor d'une saison à la suivante sur 30 % de saison, centrée sur le changement : à mi-chemin quand la
   * saison affichée change, qui est donc toujours celle qui domine le décor (partie sur les derniers 30 %, la transition
   * montrait l'automne en « Été » et la neige en « Automne »)
   */
  mix(): { a: number; b: number; t: number } {
    const s = (this.seasonT + 4 - BLEND / 2) % 4, a0 = Math.floor(s);
    const f = clamp((s - a0 - (1 - BLEND)) / BLEND, 0, 1);
    // des saisons éteintes : le décor va d'une saison allumée à la prochaine allumée ; juste après un saut, la fin de la
    // transition se joue depuis la dernière allumée. Une seule allumée : elle va vers elle-même, rien ne bouge
    const a = this.isOn(a0) ? a0 : this.prevOn(a0);
    return { a, b: this.nextOn(a), t: f * f * (3 - 2 * f) };
  }

  setSeason(i: number) { this.seasonT = i + 0.3; }
}
