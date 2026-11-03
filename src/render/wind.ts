/**
 * Vent du moment, partagé par tout ce qui s'y plie : le cap vers lequel il souffle (radians, comme atan2(dx, dz)), sa force
 * (0 … 1) et sa direction unitaire. Il tourne lentement au fil des heures et forcit sous la pluie ; les fumées s'inclinent
 * dans son sens, les éoliennes se tournent face à lui
 */
export const wind = { heading: 0.9, speed: 0.5, dx: Math.sin(0.9), dz: Math.cos(0.9) };

/** Fait tourner le vent : `t` en secondes de jeu, `rain` la pluie (0 … 1) */
export function stepWind(t: number, rain: number) {
  wind.heading = 0.9 + Math.sin(t * 0.011) * 1.3 + Math.sin(t * 0.0047 + 1.7) * 0.9;
  wind.speed = Math.min(1, 0.45 + 0.2 * Math.sin(t * 0.037 + 0.4) + rain * 0.35);
  wind.dx = Math.sin(wind.heading);
  wind.dz = Math.cos(wind.heading);
}
