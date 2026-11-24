import { describe, it, expect, beforeAll } from 'vitest';
import { setMapSize, World } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { War } from '../src/sim/war';
import { HellMap, Z_EMBER, Z_RIVER, zoneOfZ } from '../src/world/hell';
import { Hell, HellBuilding } from '../src/sim/hell';
import { HellBase, RAISE_R, HellBaseSave } from '../src/sim/hellBase';
import { troopStats } from '../src/sim/army';

/**
 * Le camp sur les ruines (retour de l'auteur, 24 nov. 2026) : une forteresse abattue, le camp avancé se dresse de lui-même sur
 * ses ruines et devient le point de ralliement ; à l'inverse, un camp abattu devient le fort des démons (ou, au Seuil, des
 * ruines qu'ils occupent), et il faut le reprendre
 */
const setup = () => { const m = new HellMap(1), h = new Hell(m), b = new HellBase(h, m); return { m, h, b }; };
const run = (h: Hell, b: HellBase, t: number) => {
  const seen: string[] = [];
  for (let i = 0; i < t * 10; i++) { h.step(0.1); b.step(0.1); h.events.length = 0; for (const e of b.events.splice(0)) seen.push(e.type); }
  return seen;
};
const fortOf = (h: Hell, zone: number) => [...h.buildings.values()].find((x) => x.side === 'hell' && x.zone === zone && x.kind === 'fortress')!;
/** Abat la forteresse d'une zone (et sa garnison) ; rend les événements de la base du pas d'après */
const conquer = (h: Hell, b: HellBase, zone: number) => {
  for (const u of h.garrison(zone)) u.hp = 0;
  h.damage(fortOf(h, zone), 1e6, -1);
  const hellSeen = h.events.map((e) => e.type);
  b.step(0.1);
  const raised = h.events.filter((e) => e.type === 'raised');
  return { seen: b.events.splice(0).map((e) => e.type), hellSeen, raised };
};

describe('le camp sur les ruines', () => {
  it('une forteresse abattue : le camp se dresse de lui-même sur ses ruines, sans rien payer', () => {
    const { h, b } = setup();
    expect(b.camp(Z_EMBER)).toBeNull();
    const r = conquer(h, b, Z_EMBER);
    expect(r.hellSeen).toContain('conquered');
    const camp = b.camp(Z_EMBER)!, fort = fortOf(h, Z_EMBER);
    expect(camp).not.toBeNull();
    expect(Math.hypot(camp.site.x - fort.site.x, camp.site.z - fort.site.z)).toBeLessThanOrEqual(RAISE_R);
    expect(r.seen).toContain('raised');
    // (la vue le fait sortir de terre)
    expect(r.raised.length).toBe(1);
    // le plus avancé : il devient le point de ralliement
    expect(b.front()).toBe(camp);
    expect(zoneOfZ(Math.floor(b.spawnPoint()[1]))).toBe(Z_EMBER);
    // une seule fois : un camp déjà là n'est pas doublé
    expect(b.raise(Z_EMBER)).toBeNull();
  });

  it('un camp abattu devient le fort des démons : la forteresse se relève à sa place ; l’abattre relève le camp', () => {
    const { h, b } = setup();
    conquer(h, b, Z_EMBER);
    const camp = b.camp(Z_EMBER)!;
    h.damage(camp, 1e6, -1);
    const seen = run(h, b, 0.2);
    expect(seen).toContain('zoneLost');
    expect(h.conquered[Z_EMBER]).toBe(false);
    const fort = fortOf(h, Z_EMBER);
    expect(fort.down).toBe(false);
    // (ses ruines ne restent pas sous la forteresse relevée)
    expect(b.buildings(true).some((x) => x.zone === Z_EMBER && x.kind === 'camp')).toBe(false);
    // la reprendre : le camp se dresse de nouveau
    const r = conquer(h, b, Z_EMBER);
    expect(r.seen).toContain('raised');
    expect(b.camp(Z_EMBER)).not.toBeNull();
  });

  it('au Seuil : les démons occupent les ruines du camp ; il se relève quand on les en chasse', () => {
    const { m, h, b } = setup();
    const camp = b.build('camp', m.arrival[0], m.arrival[1] + 3) as HellBuilding;
    const demon = h.spawn('imp', camp.site.x + 1.5, camp.site.z + 1.5, Z_EMBER);
    h.damage(camp, 1e6, -1);
    expect(run(h, b, 0.2)).toContain('occupied');
    expect(b.occupied).not.toBeNull();
    expect(b.camp(0)).toBeNull();
    // un démon s'y tient : nos troupes ont beau être là, rien ne se relève
    demon.hp = 1e6; demon.maxHp = 1e6;
    const t = h.addPlayerUnit('soldier', troopStats('soldier', 1), camp.site.x, camp.site.z - 2);
    t.hp = 1e6; t.maxHp = 1e6; t.stats = { ...t.stats, dmg: 0 };
    run(h, b, 1);
    expect(b.camp(0)).toBeNull();
    // chassé : le camp se relève sur ses ruines
    demon.hp = 0;
    const seen = run(h, b, 0.5);
    expect(seen).toContain('raised');
    expect(b.camp(0)).not.toBeNull();
    expect(b.occupied).toBeNull();
  });

  it('se sauvegarde ; une ancienne sauvegarde (sans ruines occupées) se relit', () => {
    const { m, h, b } = setup();
    b.occupied = { x: 32.5, z: 10.5 };
    const s = JSON.parse(JSON.stringify(b.save())) as HellBaseSave;
    expect(HellBase.load(h, m, s).occupied).toEqual({ x: 32.5, z: 10.5 });
    delete s.occupied;
    expect(HellBase.load(h, m, s).occupied).toBeNull();
  });

  beforeAll(() => setMapSize(192));
  it('en partie : le camp de la zone conquise reçoit les recrues, et une partie en cours se recharge', () => {
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    w.difficulty = 'normal';
    w.portalWoken = true;
    const war = new War(w);
    war.wake();
    war.welcome(1);
    war.hellInView = true;
    const tick = (s: number) => { for (let i = 0; i < s * 10; i++) war.update(0.1, 1); };
    tick(1);
    const f = war.faction!;
    for (const u of f.garrison(Z_EMBER)) u.hp = 0;
    f.damage(fortOf(f, Z_EMBER), 1e6, -1);
    tick(0.5);
    expect(war.base!.camp(Z_EMBER)).not.toBeNull();
    expect(war.news.some((n) => n.text.includes('⛺'))).toBe(true);
    // une recrue arrive au camp sur les ruines
    w.exp.gear.spear = 1;
    expect(war.recruitHell('soldier', 1, 200)).toBeNull();
    const before = new Set(war.troopsIn(f).map((u) => u.id));
    tick(15);
    const fresh = war.troopsIn(f).filter((u) => !before.has(u.id));
    expect(fresh.length).toBe(1);
    expect(zoneOfZ(Math.floor(fresh[0].z))).toBe(Z_EMBER);
    // la partie se recharge : le camp est toujours là, et l'on peut prendre la zone suivante
    const again = new War(w);
    again.load(JSON.parse(JSON.stringify(war.save())));
    again.ensureFaction();
    expect(again.base!.camp(Z_EMBER)).not.toBeNull();
    expect(again.faction!.conquered[Z_EMBER]).toBe(true);
    expect(again.faction!.frontier).toBeGreaterThanOrEqual(Z_RIVER);
  });
});
