import * as THREE from 'three';
import { tr } from '../../i18n';
import type { ShowView } from './common';

/**
 * La fête du village sur commande, sur la place : la même fête que celle du retour d'une expédition (`Festivities` de
 * festivities.ts : le feu, la ronde, les musiciens, le festin, puis les fanions, les lanternes, les confettis et le feu
 * d'artifice selon l'âge). Cette scène n'a rien à elle : elle attend que le village se rassemble autour de la place, allume la
 * fête (`start`), et la laisse durer son temps
 */

/** l'attente des habitants (au plus), la fête (sa durée dans festivities.ts : 28 s, 34 s dès l'âge industriel), la fin */
const GATHER = 7, FEAST = [28, 28, 28, 34, 34, 34], END = 2;
/** ce que la fête a de plus beau, selon l'âge (le tableau) */
const LINES = ['La ronde autour du feu', 'Danses et festin sous les torches', 'Fanions, musique et fusées d’or', 'Lanternes et confettis', 'Le feu d’artifice sur la place', 'Néons et feu d’artifice'];

export interface FeastEvents { start: () => void; roar?: (k: number) => void }

export class FeastView implements ShowView {
  group = new THREE.Group();
  done = false;
  phase: 'gather' | 'feast' | 'end' = 'gather';
  private t = 0;
  private came = false;
  private next = 6;

  constructor(private age: number, private ev: FeastEvents) {}

  /** tout le village est là (ou on n'attend plus) : la fête commence un instant après */
  ready() { this.came = true; }

  update(dt: number) {
    if (this.done) return;
    this.t += dt;
    if (this.phase === 'gather' && (this.t > GATHER || (this.came && this.t > 2))) { this.phase = 'feast'; this.t = 0; this.ev.start(); this.ev.roar?.(0.6); }
    else if (this.phase === 'feast') {
      // la foule reprend de temps en temps
      if ((this.next -= dt) <= 0) { this.next = 7 + Math.random() * 4; this.ev.roar?.(0.35); }
      if (this.t > FEAST[Math.min(5, Math.max(0, this.age))]) { this.phase = 'end'; this.t = 0; this.ev.roar?.(0.8); }
    } else if (this.phase === 'end' && this.t > END) this.done = true;
  }

  board() {
    if (this.phase === 'gather') return `🔥 <b>${tr('Le village se rassemble sur la place…')}</b>`;
    return `🔥 <b>${tr('Fête du village')}</b><small>${tr(LINES[Math.min(5, Math.max(0, this.age))])}</small>`;
  }

  dispose() { /* rien à elle : la fête se défait d'elle-même (festivities.ts) */ }
}
