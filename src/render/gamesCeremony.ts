import * as THREE from 'three';
import { World, SEA } from '../world/world';
import type { People } from '../world/archipelago';
import { warshipKind } from '../sim/navalConflict';
import { shipClass } from '../sim/fleet';
import { warshipModel } from './warships';
import { ourShipModel } from './models/ourShips';
import { Parts } from './parts';
import { mats } from './materials';
import { TEAM_FLAG } from './teamPaint';
import type { NavalFrame } from './navalBattleView';

/**
 * La cérémonie de clôture des Jeux des îles (chantier D) : le défilé des navires des trois peuples dans le bras de mer (nos
 * navires de guerre en tête, pavoisés, puis ceux de l'allié, puis ceux de nos rivaux d'hier), et les trois grands mâts de
 * leurs drapeaux devant le site des Jeux, qui claquent au vent. Les feux d'artifice sont ceux de la fête (`Game.festAt`).
 * Décor seulement, environ 30 s ; `Game.playCeremony` mène la caméra
 */

const DUR = 30;
/** Les couleurs des drapeaux des deux peuples (le nôtre est au blason) */
const PEOPLE_FLAG: Record<People, [number, number]> = { orient: [0x2aa8a0, 0xf4e6c4], asie: [0xc0392e, 0xe8b84a] };

interface Sail { root: THREE.Group; lane: number; start: number; k: number }

export class GamesCeremony {
  readonly group = new THREE.Group();
  private ships: Sail[] = [];
  private flags: THREE.Object3D[] = [];
  t = 0;

  /** `frame` : le bras de mer (le repère de la bataille navale) ; `site` : le site des Jeux (où se dressent les trois mâts) */
  constructor(private world: World, private frame: NavalFrame, site: [number, number], ally: People, rival: People, age: number) {
    const a = Math.max(4, age);
    // le défilé : trois des nôtres, trois de l'allié, trois de nos rivaux d'hier, en file sur deux rangs
    const add = (body: THREE.BufferGeometry, glow: THREE.BufferGeometry | null, lane: number, start: number, k: number) => {
      const root = new THREE.Group(), m = new THREE.Mesh(body, mats.body);
      m.castShadow = true;
      root.add(m);
      if (glow) root.add(new THREE.Mesh(glow, mats.glow));
      // le grand pavois : une guirlande de fanions de la proue au mât
      root.add(this.bunting());
      root.scale.setScalar(k);
      this.group.add(root);
      this.ships.push({ root, lane, start, k });
    };
    const ours = ourShipModel(shipClass(a));
    for (let i = 0; i < 3; i++) add(ours.body, ours.glow, i % 2 ? 1.8 : -1.8, -i * 5, 1.8);
    for (const [j, p] of ([ally, rival] as People[]).entries()) for (let i = 0; i < 3; i++) {
      const m = warshipModel(warshipKind(p, a, i), p);
      add(m.body, m.glow, i % 2 ? 1.8 : -1.8, -16 - j * 15 - i * 5, 1.7);
    }
    // les trois mâts devant le site des Jeux : le nôtre au milieu, plus haut
    const g = this.world.hAt(site[0], site[1]);
    const mast = (dx: number, h: number, colors: [number, number] | null) => {
      const p = new Parts();
      p.cyl(0.05, 0.07, h, 8, 0, 0, 0, 0xe8e8e4);
      p.sphere(0.08, 0, h + 0.02, 0, 0xe8b84a);
      p.cyl(0.22, 0.26, 0.12, 10, 0, 0, 0, 0xc8c2b4);
      const built = p.build(false), root = new THREE.Group();
      root.add(new THREE.Mesh(built.body, mats.body));
      root.position.set(site[0] + dx, g, site[1] + 2.4);
      // le drapeau : une toile qui claque (elle pivote autour de la hampe et ondule)
      const f = new Parts(), w = 1.3, hh = 0.8;
      if (colors) { f.box(w, hh / 2, 0.02, w / 2, -hh / 2, 0, colors[0]); f.box(w, hh / 2, 0.02, w / 2, -hh, 0, colors[1]); }
      else f.box(w, hh, 0.02, w / 2, -hh, 0, TEAM_FLAG);
      const flag = new THREE.Group(), fb = f.build(false);
      flag.add(new THREE.Mesh(fb.body, mats.body));
      flag.position.set(0, h - 0.05, 0);
      root.add(flag);
      this.flags.push(flag);
      this.group.add(root);
    };
    mast(-2.2, 5, PEOPLE_FLAG[ally]); mast(0, 6, null); mast(2.2, 5, PEOPLE_FLAG[rival]);
  }

  /** La guirlande de fanions d'un navire pavoisé (couleurs alternées) */
  private bunting() {
    const p = new Parts(), cols = [0xd84a3e, 0xf2d27a, 0x3a7ac8, 0xf4f4f0, 0x2aa8a0];
    for (let i = 0; i < 9; i++) {
      const u = i / 8, z = 0.5 - u * 0.9, y = 0.42 + Math.sin(u * Math.PI) * 0.12;
      p.add(new THREE.ConeGeometry(0.03, 0.07, 3).rotateX(Math.PI), 0, y, z, cols[i % cols.length]);
    }
    const b = p.build(false), m = new THREE.Mesh(b.body, mats.body);
    return m;
  }

  /** Où est le navire à cet instant (le repère du bras de mer : il file le long de l'axe) */
  private at(x: number, z: number): [number, number] {
    const f = this.frame;
    return [f.cx + (f.ux * x - f.uz * z) * f.k, f.cz + (f.uz * x + f.ux * z) * f.k];
  }
  /** Le milieu du défilé à cet instant (la caméra le suit) */
  focus(): [number, number] { return this.at(-34 + (this.t / DUR) * 52 - 12, 0); }

  get done() { return this.t >= DUR; }

  update(dt: number) {
    this.t += dt;
    const head = Math.atan2(this.frame.ux, this.frame.uz);
    for (const s of this.ships) {
      const x = -34 + (this.t / DUR) * 60 + s.start, [wx, wz] = this.at(x, s.lane);
      s.root.position.set(wx, SEA + Math.sin(this.t * 1.2 + s.start) * 0.015, wz);
      s.root.rotation.set(Math.sin(this.t * 0.9 + s.start) * 0.02, head, 0);
      s.root.visible = x > -40 && x < 40;
    }
    // les drapeaux claquent : un pivot qui hésite, un frisson rapide
    this.flags.forEach((f, i) => { f.rotation.y = 0.5 + Math.sin(this.t * 1.7 + i) * 0.35; f.rotation.z = Math.sin(this.t * 6 + i * 2) * 0.04; });
  }

  dispose() { this.group.clear(); this.ships = []; this.flags = []; }
}
