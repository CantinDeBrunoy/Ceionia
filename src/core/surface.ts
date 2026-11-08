/**
 * Remonter au monde réel : une action qui concerne le village (suivre une équipe, aller voir un volcan, bâtir…) demandée depuis
 * les Enfers ou le commandement de l'île quitte d'abord cette vue (fondu), puis s'exécute, une seule fois.
 */
export type ViewMode = 'surface' | 'hell' | 'under';

/** Ce qu'il y a à faire avant d'agir : 'run' (déjà au village), 'leaveIsle', 'exitHell', 'wait' (un fondu est en cours) */
export type SurfaceStep = 'run' | 'leaveIsle' | 'exitHell' | 'wait';

export function surfaceStep(mode: ViewMode, isle: boolean, fading: boolean, keepIsle = false): SurfaceStep {
  // le monde souterrain gère lui-même sa remontée (exitUnder, dans les actions de caméra)
  if (mode === 'under') return 'run';
  if (mode === 'hell') return fading ? 'wait' : 'exitHell';
  return isle && !keepIsle ? 'leaveIsle' : 'run';
}

export interface SurfaceHost {
  mode(): ViewMode;
  isle(): boolean;
  fading(): boolean;
  exitHell(): void;
  leaveIsle(): void;
  /** `fn` dans `ms` millisecondes (setTimeout) */
  later(fn: () => void, ms: number): void;
}

/** Délai laissé au fondu des Enfers, comme pour le commandement de l'île */
export const SURFACE_DELAY = 900;
const MAX_TRIES = 8;

/** La file des actions du village en attente de la remontée (chacune exécutée une fois, dans l'ordre) */
export class SurfaceGate {
  private queue: { fn: () => void; keepIsle: boolean }[] = [];
  private armed = false;
  private tries = 0;
  constructor(private h: SurfaceHost) {}

  /** Vrai tant que des actions attendent la remontée */
  get pending() { return this.queue.length > 0; }

  /** Exécute `then` au village : tout de suite s'il y est déjà, sinon après avoir quitté les Enfers (ou le commandement de l'île) */
  ensure(then: () => void, keepIsle = false) {
    if (!this.queue.length && surfaceStep(this.h.mode(), this.h.isle(), this.h.fading(), keepIsle) === 'run') { then(); return; }
    this.queue.push({ fn: then, keepIsle });
    this.tries = 0;
    this.pump();
  }

  /** Abandonne les actions en attente (on retourne dans les Enfers de soi-même) */
  cancel() { this.queue = []; }

  private pump() {
    if (!this.queue.length) return;
    const keep = this.queue.every((q) => q.keepIsle), s = surfaceStep(this.h.mode(), this.h.isle(), this.h.fading(), keep);
    if (s === 'run') {
      const q = this.queue;
      this.queue = [];
      for (const a of q) a.fn();
      return;
    }
    if (s === 'leaveIsle') { this.h.leaveIsle(); this.pump(); return; }
    if (++this.tries > MAX_TRIES) { this.queue = []; return; }
    if (s === 'exitHell') this.h.exitHell();
    if (this.armed) return;
    this.armed = true;
    this.h.later(() => { this.armed = false; this.pump(); }, SURFACE_DELAY);
  }
}
