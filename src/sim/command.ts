import type { Hell, HellUnit, HellBuilding, HellOrder } from './hell';

/**
 * Le contrôle direct des troupes, côté logique (sans écran ni souris) : la sélection (une unité au clic, un rectangle, toutes
 * celles d'une sorte), les groupes rappelés d'une touche, les ordres (se déplacer en formation, attaquer une cible, attaquer en
 * marchant, tenir, se replier). La même pour les Enfers et pour l'île du portail : on lui donne la simulation où l'on commande
 */

/** Écart entre deux soldats d'une formation (cases) */
export const SPACING = 0.75;

/**
 * Places d'une formation de `n` unités autour d'un point, en rangs face à la direction de marche (`fx`, `fz` : de là où
 * l'on vient vers le but) ; le premier rang est le plus proche du but
 */
export function formation(n: number, x: number, z: number, fx = 0, fz = 1): [number, number][] {
  if (n <= 0) return [];
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.6))), rows = Math.ceil(n / cols);
  const d = Math.hypot(fx, fz) || 1, ax = fx / d, az = fz / d, px = -az, pz = ax;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), inRow = r === rows - 1 ? n - r * cols : cols, c = i % cols;
    const side = (c - (inRow - 1) / 2) * SPACING, back = (r - (rows - 1) / 2) * SPACING;
    out.push([x + px * side - ax * back, z + pz * side - az * back]);
  }
  return out;
}

/** Les unités du joueur qu'on peut commander, vivantes */
export const commandable = (h: Hell, ok: (u: HellUnit) => boolean = () => true) => h.alive('player').filter(ok);

/** L'unité du joueur sous un point (la plus proche, à `r` cases au plus de son bord) */
export function unitAt(units: HellUnit[], x: number, z: number, r = 0.45): HellUnit | null {
  let best: HellUnit | null = null, bd = r;
  for (const u of units) {
    const d = Math.hypot(u.x - x, u.z - z) - u.stats.radius;
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}

/** L'ennemi (démon ou bâtiment démoniaque) sous un point */
export function foeAt(h: Hell, x: number, z: number, r = 0.5): HellUnit | HellBuilding | null {
  let best: HellUnit | HellBuilding | null = null, bd = r;
  for (const u of h.alive('hell')) {
    const d = Math.hypot(u.x - x, u.z - z) - u.stats.radius;
    if (d < bd) { bd = d; best = u; }
  }
  for (const b of h.buildings.values()) {
    if (b.down || b.side !== 'hell') continue;
    const d = Math.hypot(b.site.x - x, b.site.z - z) - b.site.r;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

/** Rectangle à l'écran (pixels) */
export interface Rect { x0: number; y0: number; x1: number; y1: number }
/** Les unités dont la projection à l'écran tombe dans le rectangle (`screen` : null hors de la vue) */
export function inRect(units: HellUnit[], r: Rect, screen: (u: HellUnit) => [number, number] | null): HellUnit[] {
  const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1), y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1);
  return units.filter((u) => { const p = screen(u); return !!p && p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1; });
}

/** La sélection, ses groupes, l'ordre armé (attaquer en marchant : touche A puis clic) */
export class Command {
  selected = new Set<number>();
  groups: Record<number, number[]> = {};
  /** l'ordre « attaquer en marchant » attend son clic */
  armed: 'attack' | null = null;
  /** le dernier ordre donné, pour l'interface (marque au sol) */
  lastOrder: { x: number; z: number; kind: HellOrder['kind']; t: number } | null = null;

  /** Ne garde que les unités encore là */
  prune(alive: Set<number>) {
    for (const id of [...this.selected]) if (!alive.has(id)) this.selected.delete(id);
    for (const k of Object.keys(this.groups)) this.groups[+k] = this.groups[+k].filter((id) => alive.has(id));
  }

  select(ids: number[], add = false) {
    if (!add) this.selected.clear();
    for (const id of ids) this.selected.add(id);
    this.armed = null;
  }
  /** Ajoute ou retire (Maj+clic) */
  toggle(id: number) { if (this.selected.has(id)) this.selected.delete(id); else this.selected.add(id); }
  clear() { this.selected.clear(); this.armed = null; }

  /** Toutes les unités de la même sorte que celle donnée, parmi celles qu'on voit (double-clic) */
  sameKind(units: HellUnit[], kind: string, add = false) { this.select(units.filter((u) => u.kind === kind).map((u) => u.id), add); }

  /** Ctrl+chiffre : le groupe prend la sélection ; chiffre : le rappelle (vide : rien) */
  setGroup(n: number) { this.groups[n] = [...this.selected]; }
  recall(n: number) {
    const g = this.groups[n];
    if (!g?.length) return false;
    this.select(g);
    return true;
  }

  ids() { return [...this.selected]; }

  /** Déplacer : chaque unité prend sa place dans la formation autour du but */
  move(h: Hell, x: number, z: number, attack = false) {
    const us = this.ids().map((id) => h.units.get(id)).filter((u): u is HellUnit => !!u && u.hp > 0);
    if (!us.length) return 0;
    const cx = us.reduce((s, u) => s + u.x, 0) / us.length, cz = us.reduce((s, u) => s + u.z, 0) / us.length;
    // les archers derrière, les soldats et chevaliers devant
    us.sort((a, b) => a.stats.range - b.stats.range || a.id - b.id);
    const slots = formation(us.length, x, z, x - cx, z - cz);
    us.forEach((u, i) => {
      const [sx, sz] = h.map.walkableAt(slots[i][0], slots[i][1]) ? slots[i] : [x, z];
      h.order([u.id], attack ? { kind: 'attack', x: sx, z: sz } : { kind: 'move', x: sx, z: sz });
    });
    this.lastOrder = { x, z, kind: attack ? 'attack' : 'move', t: 0 };
    this.armed = null;
    return us.length;
  }
  /** Attaquer une cible désignée */
  attack(h: Hell, target: number) {
    const ids = this.ids();
    h.order(ids, { kind: 'attack', target });
    const e = h.entity(target);
    if (e) this.lastOrder = 'site' in e ? { x: e.site.x, z: e.site.z, kind: 'attack', t: 0 } : { x: e.x, z: e.z, kind: 'attack', t: 0 };
    this.armed = null;
    return ids.length;
  }
  hold(h: Hell) { h.order(this.ids(), { kind: 'hold' }); this.armed = null; return this.selected.size; }
  retreat(h: Hell) { h.order(this.ids(), { kind: 'retreat' }); this.armed = null; return this.selected.size; }

  /**
   * L'ordre du clic droit (ou de l'appui long) en un point : sur un ennemi, l'attaquer ; ailleurs, s'y rendre (en combattant si
   * l'attaque en marchant est armée)
   */
  orderAt(h: Hell, x: number, z: number) {
    if (!this.selected.size) return null;
    const foe = foeAt(h, x, z);
    if (foe) { this.attack(h, foe.id); return 'attack' as const; }
    const attack = this.armed === 'attack';
    this.move(h, x, z, attack);
    return attack ? ('attackMove' as const) : ('move' as const);
  }
}
