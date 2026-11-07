import * as THREE from 'three';
import { HellMap, HELL_ZONES } from './world/hell';
import { Hell, HellOrder, HellUnit, PLAYER_UNITS } from './sim/hell';
import { HellView } from './render/hellView';

/**
 * Le monde des Enfers en jeu : sa carte, sa faction, sa vue. Mode développeur pour l'instant (on y entre par
 * `__game.enterHell()`, sans portail) ; le contrôle des troupes y placera les unités du joueur (`addTroop`) et leur donnera
 * des ordres (`order`)
 */
export class HellMode {
  map: HellMap;
  hell: Hell;
  view: HellView;

  constructor(seed: number) {
    this.map = new HellMap(seed);
    this.hell = new Hell(this.map);
    this.view = new HellView(this.map, this.hell);
  }

  get scene() { return this.view.scene; }

  /** Un pas : la faction vit au temps du jeu (`gdt`, arrêté en pause), la vue au temps réel */
  update(dt: number, gdt: number, camera: THREE.PerspectiveCamera, target: THREE.Vector3, dist: number) {
    this.hell.step(Math.min(gdt, 0.25));
    this.view.update(dt, camera, target, dist);
  }

  /** Nom de la zone sous un point */
  zoneName(z: number) { return HELL_ZONES[this.map.zoneAt(z)].name; }

  /** Essai : `n` unités du joueur au portail (ou au point donné), en petite formation */
  addTroop(n = 6, kind: keyof typeof PLAYER_UNITS = 'soldier', x = this.map.arrival[0], z = this.map.arrival[1]): HellUnit[] {
    const out: HellUnit[] = [];
    for (let i = 0; i < n; i++) out.push(this.hell.addPlayerUnit(kind, PLAYER_UNITS[kind], x + ((i % 3) - 1) * 0.6, z + Math.floor(i / 3) * 0.6));
    return out;
  }

  /** Essai : ordre à toutes les unités du joueur */
  order(o: HellOrder) { this.hell.order(this.hell.alive('player').map((u) => u.id), o); }
}
