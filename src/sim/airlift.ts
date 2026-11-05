/**
 * Les expéditions de montagne et du bout du monde en l'air : à l'âge moderne, quand le village a un héliport, l'équipe gagne
 * l'aire d'envol à pied, monte à bord, file en vol jusqu'à sa destination, se pose, travaille, puis reprend l'hélicoptère
 * jusqu'à l'héliport et rentre à pied ; avant, avec un aérodrome, une montgolfière fait le même trajet, plus lentement. Ce
 * module ne connaît ni le monde ni les habitants : il dit où est l'appareil à chaque instant du vol et où chacun s'assoit
 */

export type AirKind = 'heli' | 'balloon';

/**
 * Où en est le voyage : l'équipe marche vers l'aire (`walk`), vole à l'aller (`out`), marche de l'atterrissage au lieu de travail
 * (`ground`) ; au retour, rejoint l'appareil (`fetch`), vole (`back`), puis rentre à pied de l'aire d'envol (`home`)
 */
export type AirLeg = 'walk' | 'out' | 'ground' | 'fetch' | 'back' | 'home';

export interface AirTrip {
  kind: AirKind;
  /** l'aire d'envol, près de l'héliport ou de l'aérodrome, et l'aire d'atterrissage près du lieu de travail */
  pad: [number, number];
  land: [number, number];
  leg: AirLeg;
  /** temps écoulé dans l'étape (secondes de jeu), durée d'un vol */
  t: number;
  dur: number;
}

/** Les appareils : vitesse de croisière (cases par seconde), durée du décollage et de l'atterrissage (s), hauteur de croisière, places à bord */
export const AIR: Record<AirKind, { speed: number; lift: number; settle: number; cruise: number; seats: number }> = {
  heli: { speed: 3.2, lift: 3, settle: 3.2, cruise: 1.7, seats: 5 },
  balloon: { speed: 0.9, lift: 7, settle: 6, cruise: 2.6, seats: 5 },
};

/** Le voyage d'une équipe : aire d'envol, aire d'atterrissage, durée d'un vol (décollage, croisière, atterrissage) */
export function airTrip(kind: AirKind, pad: [number, number], land: [number, number]): AirTrip {
  const A = AIR[kind], dist = Math.hypot(land[0] - pad[0], land[1] - pad[1]);
  return { kind, pad, land, leg: 'walk', t: 0, dur: A.lift + dist / A.speed + A.settle };
}

/** L'appareil à un instant : sa place, sa hauteur absolue, son cap, son élévation de 0 (au sol) à 1 (en croisière), et s'il avance */
export interface AirPose { x: number; z: number; y: number; heading: number; up: number; moving: boolean }

const smooth = (u: number) => { const k = Math.min(1, Math.max(0, u)); return k * k * (3 - 2 * k); };

/**
 * Pose de l'appareil `t` secondes après son décollage de `from` vers `to` (`surface` : hauteur du sol) : il s'élève sur place,
 * avance, ralentit et redescend ; en route il passe toujours bien au-dessus du relief
 */
export function flightPose(kind: AirKind, dur: number, from: [number, number], to: [number, number], t: number, surface: (x: number, z: number) => number): AirPose {
  const A = AIR[kind], start = A.lift * 0.5, end = dur - A.settle * 0.5;
  const p = smooth((t - start) / Math.max(0.1, end - start));
  const up = t < A.lift ? smooth(t / A.lift) : t > dur - A.settle ? smooth((dur - t) / A.settle) : 1;
  const x = from[0] + (to[0] - from[0]) * p, z = from[1] + (to[1] - from[1]) * p;
  const g0 = surface(from[0], from[1]), g1 = surface(to[0], to[1]);
  const base = g0 + (g1 - g0) * p;
  // au-dessus du relief : la hauteur de croisière depuis la ligne droite des deux aires, mais jamais à moins de 70 % d'elle au-dessus du sol sous lui
  const y = Math.max(base + up * A.cruise * 0.5, surface(x, z) + up * A.cruise * 0.7);
  const heading = Math.atan2(to[0] - from[0], to[1] - from[1]);
  return { x, z, y: Math.max(y, surface(x, z)), heading, up, moving: t > start && t < end };
}

/** Une place à bord, dans le repère de l'appareil (avant = +z) : où l'on s'assoit (ou se tient), à quelle hauteur et tourné vers où */
export interface AirSeat { x: number; z: number; y: number; face: number; sit: boolean }

/**
 * Les places des passagers : dans l'hélicoptère, deux bancs (trois derrière, deux devant) ; dans la nacelle, un cercle autour
 * du brûleur, debout, tournés vers l'extérieur
 */
export function airSeats(kind: AirKind, n: number): AirSeat[] {
  if (kind === 'heli') {
    const spots: [number, number][] = [[-0.075, -0.1], [0.075, -0.1], [0, -0.1], [-0.07, 0.01], [0.07, 0.01]];
    return Array.from({ length: n }, (_, i) => ({ x: spots[i % 5][0], z: spots[i % 5][1], y: HELI_SEAT, face: 0, sit: true }));
  }
  const S = BALLOON_SCALE, r = 0.045 * S;
  return Array.from({ length: n }, (_, i) => { const a = (i / Math.max(2, n)) * Math.PI * 2 + 0.5; return { x: Math.sin(a) * r, z: Math.cos(a) * r, y: 0.03 * S, face: a, sit: false }; });
}
/** Hauteur de l'assise des bancs de l'hélicoptère au-dessus de ses patins, échelle de la nacelle de la montgolfière */
export const HELI_SEAT = 0.114, BALLOON_SCALE = 2;
