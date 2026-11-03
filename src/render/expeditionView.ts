import * as THREE from 'three';
import { World } from '../world/world';
import { Agents } from '../sim/agents';
import { Expeditions, ActiveExpedition } from '../sim/expeditions';
import { makeActor, play, hasModel, Actor } from './assets';
import { Parts } from './parts';
import { mats } from './materials';
import { ExpeditionScene, ANIMAL } from './expeditionScenes';

interface Follower { obj: THREE.Object3D; actor: Actor | null; gap: number; x: number; z: number; heading: number }

/** Couleurs des fanions, une par équipe */
export const TEAM_COLORS = [0xe0574a, 0x4f86d8, 0xe8b33a, 0x5aae62];

/** Fanion porté par le chef d'expédition */
function pennantGeo(color: number) {
  const p = new Parts();
  p.cyl(0.005, 0.006, 0.42, 4, 0, 0, 0, 0x7a6355);
  p.add(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0.42, 0, 0, 0.32, 0, 0.13, 0.37, 0], 3)), 0, 0, 0, color);
  p.add(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0.42, 0, 0.13, 0.37, 0, 0, 0.32, 0], 3)), 0, 0, 0, color);
  return p.build(false).body;
}

/** Chariot à bras chargé de minerai, avant = +z */
function cartGeo() {
  const p = new Parts();
  p.box(0.14, 0.06, 0.2, 0, 0.05, 0, 0x9a7452);
  for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 8).rotateZ(Math.PI / 2), s * 0.08, 0.04, 0, 0x5a3e2e);
  for (const s of [-1, 1]) p.box(0.012, 0.012, 0.16, s * 0.05, 0.08, 0.15, 0x7a6355);
  for (const [x, z, c] of [[-0.03, -0.04, 0x7d838c], [0.03, 0.03, 0x9aa3ad], [0, -0.01, 0xb08a5a], [0.035, -0.05, 0x8a8178]] as [number, number, number][]) p.sphere(0.035, x, 0.12, z, c, 0, 0.8);
  return p.build(false).body;
}

/** Sac sur le dos */
function sackGeo() {
  const p = new Parts();
  p.add(new THREE.IcosahedronGeometry(0.045, 0).scale(1, 1.2, 0.8), 0, 0, 0, 0xd9c4a0);
  return p.build(false).body;
}

/** Ce qu'une expédition montre sur la carte */
interface Show { key: string; pennant: THREE.Mesh; followers: Follower[]; sacks: THREE.Mesh[]; trail: number[]; scene: ExpeditionScene | null }

/**
 * Les expéditions sur la carte : un fanion au-dessus de chaque chef ; sur place, l'équipe fait vraiment son travail (voir
 * ExpeditionScene) ; au retour, ce qu'elle rapporte suit l'équipe — les bêtes en file, le chariot de minerai, des sacs sur le dos
 */
export class ExpeditionView {
  group = new THREE.Group();
  private shows = new Map<number, Show>();
  private pennantGeos = TEAM_COLORS.map(pennantGeo);
  private sackGeo = sackGeo();

  constructor(private world: World, private agents: Agents, private exp: Expeditions) {}

  update(dt: number) {
    const live = new Set<number>();
    for (const a of this.exp.active) {
      live.add(a.id);
      let sh = this.shows.get(a.id);
      if (!sh) {
        const pennant = new THREE.Mesh(this.pennantGeos[(a.id - 1) % TEAM_COLORS.length], mats.body);
        pennant.castShadow = true;
        this.group.add(pennant);
        sh = { key: '', pennant, followers: [], sacks: [], trail: [], scene: null };
        this.shows.set(a.id, sh);
      }
      const key = `${a.phase === 'back' || a.phase === 'home' ? 'back' : 'out'}|${a.ok}`;
      if (key !== sh.key) { sh.key = key; this.rebuild(a, sh); }
      // la scène de la mission (galets, bêtes, éboulis, voisins…) est posée dès le départ de l'expédition : on la voit
      // en attendant l'équipe ; elle est rangée au départ du retour
      const going = a.phase === 'gather' || a.phase === 'out' || a.phase === 'work';
      if (going && !sh.scene && a.entry < 0) sh.scene = new ExpeditionScene(this.world, this.agents, this.group, a);
      else if (!going && sh.scene) { sh.scene.dispose(a); sh.scene = null; }
      sh.scene?.update(dt, a);
      this.step(a, sh, dt);
    }
    // expéditions terminées : on range leurs objets
    for (const [id, sh] of this.shows) if (!live.has(id)) { this.clear(sh); this.group.remove(sh.pennant); this.shows.delete(id); }
  }

  private step(a: ActiveExpedition, sh: Show, dt: number) {
    const pos = this.agents.partyPositions(a.party);
    if (!pos.length) { sh.pennant.visible = false; return; }
    const w = this.world;
    // le fanion flotte au-dessus de l'épaule du chef, à pied, sur un ponton ou assis dans la barque
    const [lx, lz, lh] = pos[0], ly = this.agents.partyLeadY(a.party) ?? w.surfaceAt(lx, lz);
    sh.pennant.visible = true;
    sh.pennant.position.set(lx + Math.cos(lh) * 0.06, ly + 0.08, lz - Math.sin(lh) * 0.06);
    sh.pennant.rotation.y = lh + Math.PI / 2;
    // trace du dernier de la file
    const trail = sh.trail, [tx, tz] = pos[pos.length - 1], n = trail.length;
    if (!n || Math.hypot(tx - trail[n - 2], tz - trail[n - 1]) > 0.04) { trail.push(tx, tz); if (trail.length > 600) trail.splice(0, 2); }
    // la suite marche dans les pas du dernier
    for (const f of sh.followers) {
      const [fx, fz] = along(trail, f.gap);
      const dx = fx - f.x, dz = fz - f.z, moving = Math.hypot(dx, dz) > 0.002;
      if (moving) f.heading = Math.atan2(dx, dz);
      f.x = fx; f.z = fz;
      f.obj.position.set(fx, w.surfaceAt(fx, fz), fz);
      f.obj.rotation.y = f.heading;
      if (f.actor) { play(f.actor, moving ? ['Walk', 'WalkSlow', 'Idle'] : ['Idle', 'Idle_Eating', 'Eating']); f.actor.mixer.update(dt); }
    }
    // sacs sur le dos des porteurs
    sh.sacks.forEach((s, i) => {
      const p = pos[i];
      if (!p) { s.visible = false; return; }
      s.visible = true;
      s.position.set(p[0] - Math.sin(p[2]) * 0.05, w.surfaceAt(p[0], p[1]) + 0.2, p[1] - Math.cos(p[2]) * 0.05);
      s.rotation.y = p[2];
    });
  }

  private clear(sh: Show) {
    for (const f of sh.followers) { f.actor?.mixer.stopAllAction(); this.group.remove(f.obj); }
    for (const s of sh.sacks) this.group.remove(s);
    sh.followers = []; sh.sacks = [];
  }

  /** Au retour d'une expédition réussie : ce qu'elle rapporte */
  private rebuild(a: ActiveExpedition, sh: Show) {
    this.clear(sh);
    if (!(a.phase === 'back' || a.phase === 'home') || !a.ok) { sh.trail = []; return; }
    const pos = this.agents.partyPositions(a.party);
    const last = pos[pos.length - 1] ?? [a.dest[0], a.dest[1], 0];
    sh.trail = [last[0], last[1]];
    if (a.c.carry === 'animals') {
      const kinds = a.c.win.flatMap((e) => (e.t === 'herd' ? e.kinds : []));
      kinds.forEach((k, i) => {
        const [name, len] = ANIMAL[k];
        const actor = hasModel(name) ? makeActor(name, len) : null;
        const obj: THREE.Object3D = actor ? actor.root : new THREE.Mesh(new THREE.IcosahedronGeometry(len * 0.5, 0), mats.body);
        if (actor) actor.mixer.setTime(i * 0.7);
        this.group.add(obj);
        sh.followers.push({ obj, actor, gap: 0.32 + i * 0.3, x: last[0], z: last[1], heading: 0 });
      });
    } else if (a.c.carry === 'cart') {
      const cart = new THREE.Mesh(cartGeo(), mats.body);
      cart.castShadow = true;
      this.group.add(cart);
      sh.followers.push({ obj: cart, actor: null, gap: 0.3, x: last[0], z: last[1], heading: 0 });
    } else if (a.c.carry === 'sacks') {
      for (let i = 0; i < a.party.length; i++) { const s = new THREE.Mesh(this.sackGeo, mats.body); s.castShadow = true; this.group.add(s); sh.sacks.push(s); }
    }
  }
}

/** Point de la trace (x, z à la suite, le plus récent à la fin) à `gap` derrière le dernier de la file */
function along(t: number[], gap: number): [number, number] {
  let left = gap;
  for (let i = t.length - 2; i >= 2; i -= 2) {
    const d = Math.hypot(t[i] - t[i - 2], t[i + 1] - t[i - 1]);
    if (d >= left) { const k = left / d; return [t[i] + (t[i - 2] - t[i]) * k, t[i + 1] + (t[i - 1] - t[i + 1]) * k]; }
    left -= d;
  }
  return t.length ? [t[0], t[1]] : [0, 0];
}
