import * as THREE from 'three';
import { HellMap, HELL_ZONES } from './world/hell';
import { Hell, HellEvent, HellUnit } from './sim/hell';
import { HellView } from './render/hellView';
import { TroopKind, troopStats } from './sim/army';
import type { KingFight } from './sim/kingdom';

/**
 * Le monde des Enfers à l'écran : la vue de la carte et de la faction (que la guerre fait vivre, voir `sim/war.ts`). On y
 * entre par le portail de l'île (ou `__game.enterHell()`) ; le contrôle des troupes y commande les unités du joueur ; au
 * royaume, la vue montre le combat du roi (`fight`)
 */
export class HellMode {
  view: HellView;

  constructor(readonly map: HellMap, readonly hell: Hell, fight: KingFight | null = null) {
    this.view = new HellView(this.map, this.hell);
    this.view.fight = fight;
  }

  get scene() { return this.view.scene; }

  /** Une image : la vue joue ce qui s'est passé au combat (`events`) */
  update(dt: number, events: HellEvent[], camera: THREE.PerspectiveCamera, target: THREE.Vector3, dist: number) {
    this.view.update(dt, camera, target, dist, events);
  }

  /** Nom de la zone sous un point */
  zoneName(z: number) { return HELL_ZONES[this.map.zoneAt(z)].name; }

  /** Essai (mode développeur) : `n` unités du joueur hors de l'armée, au portail (ou au point donné), en petite formation */
  addTroop(n = 6, kind: TroopKind = 'soldier', x = this.map.arrival[0], z = this.map.arrival[1], age = 1): HellUnit[] {
    const out: HellUnit[] = [];
    for (let i = 0; i < n; i++) out.push(this.hell.addPlayerUnit(kind, troopStats(kind, age), x + ((i % 3) - 1) * 0.6, z + Math.floor(i / 3) * 0.6));
    return out;
  }
}
