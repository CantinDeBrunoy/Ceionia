import { it, expect } from 'vitest';

/**
 * Le cosmodrome bâti sur l'île de l'allié (archipel) : on ne le gagne pas à pied. Avant (retour de l'auteur, 17 nov. 2026),
 * l'expédition du lancement refusait de partir (« aucun chemin praticable ») ; une navette emmène maintenant l'équipe de
 * près du village au pied du pas de tir, et l'en ramène
 */
import { World, N, setMapSize, VEG_FOREST, VEG_ROCKS } from '../src/world/world';
import { newWorld, CONTINENT } from '../src/world/mapgen';
import { GEN_ARCH } from '../src/world/continent';
import { isleOf } from '../src/sim/diplomacy';
import { MISSIONS } from '../src/sim/missions';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { mulberry32 } from '../src/core/rng';
import type { KindId } from '../src/build/catalog';

it('le lancement part en navette vers le cosmodrome de l’île alliée, l’équipe y arrive et en revient', { timeout: 600000 }, () => {
  setMapSize(384);
  try {
    const w = new World();
    w.seed = 11;
    newWorld(w, CONTINENT, 11, GEN_ARCH);
    w.diplo.met = ['orient', 'asie']; w.diplo.ally = 'asie';
    // le cosmodrome chez l'allié
    const isle = isleOf(w, 'asie')!;
    let pad: [number, number] | null = null;
    for (let dz = -30; dz <= 30 && !pad; dz += 2) for (let dx = -30; dx <= 30 && !pad; dx += 2) {
      const x = Math.round(isle.x + dx), z = Math.round(isle.z + dz);
      if (w.canPlace('spaceport', x, z) === null) pad = [x, z];
    }
    expect(pad).not.toBeNull();
    w.place('spaceport', pad![0], pad![1], 0, true, 5, false);
    // un petit village sur l'île principale
    const main = w.isles!.main, cx = Math.floor(main.x + main.n / 2), cz = Math.floor(main.z + main.n / 2);
    let placed = 0;
    for (let r = 0; r < 60 && placed < 8; r += 2) for (let k = 0; k < 12 && placed < 8; k++) {
      const x = Math.round(cx + Math.cos(k) * r), z = Math.round(cz + Math.sin(k) * r);
      for (const kind of ['house', 'house', 'gather'] as KindId[]) if (placed < 8 && w.canPlace(kind, x, z) === null) { w.place(kind, x, z, 0, true, 5, false); placed++; }
    }
    expect(placed).toBeGreaterThan(4);
    const agents = new Agents(w);
    for (let i = 0; i < 20; i++) agents.update(0.1, 10, 5, false, 40, 0);
    const ex = new Expeditions(w, agents, () => 100, mulberry32(5));
    ex.pop = () => 60; ex.missing = () => [];
    const m = MISSIONS.find((x) => x.choices.some((c) => c.scene === 'launch'))!;
    const a = ex.start(m, 0, 5);
    expect(a, ex.lastFail ?? 'refusée').not.toBeNull();
    // (à l'âge futuriste, le drone de passagers du droneport)
    expect(a!.air?.kind).toBe('drone');
    // les deux aires de l'hélicoptère sont dégagées : ni arbre, ni rocher, ni eau sous ses pales (il se posait dans la forêt)
    for (const [x, z] of [a!.air!.pad, a!.air!.land]) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const i = w.ci(Math.floor(x) + dx, Math.floor(z) + dz);
      expect(w.veg[i] === VEG_FOREST || w.veg[i] === VEG_ROCKS || w.lake[i] || w.occ[i], `aire (${x}, ${z})`).toBeFalsy();
    }
    // le pied du pas de tir est sur l'île de l'allié
    expect(Math.hypot(a!.dest[0] - (pad![0] + 2), a!.dest[1] - (pad![1] + 2))).toBeLessThan(6);
    let worked = false;
    for (let i = 0; i < 40000 && ex.active.includes(a!); i++) {
      agents.update(0.05, 10, 5, false, 40, 0);
      ex.update(0.05);
      if (a!.wait) ex.decide(a!, 0);
      if (a!.phase === 'work' && !worked) {
        worked = true;
        // arrivée : l'équipe est au pied du cosmodrome, pas restée sur l'île principale
        const near = agents.partyPositions(a!.party).filter(Boolean).every((p) => Math.hypot(p[0] - a!.dest[0], p[1] - a!.dest[1]) < 8);
        expect(near).toBe(true);
      }
    }
    expect(worked).toBe(true);
    expect(ex.active.includes(a!)).toBe(false);
  } finally { setMapSize(192); }
  void N;
});
