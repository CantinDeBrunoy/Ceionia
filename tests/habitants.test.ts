import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import '../src/i18n/en';
import { setLang } from '../src/i18n';
import { World, setMapSize } from '../src/world/world';
import { Sim } from '../src/sim/sim';
import { KindId } from '../src/build/catalog';
import { citizenName, citizenWish, familyName, firstName, WishCtx, WELL_FAR } from '../src/sim/citizens';

/** Un monde plat, et des bâtiments posés à la main */
function flat() {
  const w = new World();
  w.heights.fill(1);
  return w;
}
const put = (w: World, kind: KindId, x: number, z: number, age = 0, rot = 0) => { const id = w.nextId++; w.buildings.set(id, { id, kind, x, z, rot, auto: false, age }); w.occ[w.ci(x, z)] = id; return id; };

/** Un habitant content, dans un village où rien ne manque */
const ok: WishCtx = {
  id: 7, age: 2, child: false, working: true, resting: false, away: false, food: true, water: true, jobs: true, joy: true, health: true, room: true,
  guarded: true, posts: true, wellDist: 3, school: true, pretty: false, season: 1, rain: false, night: false,
};

describe('habitants : identité', () => {
  afterEach(() => setLang('fr', false));

  it('le nom change avec l’âge du village et la langue, pas d’un appel à l’autre', () => {
    const fr = [0, 1, 2, 3, 4, 5].map((a) => citizenName(12, 40, a, false));
    expect(new Set(fr).size).toBeGreaterThan(3);
    expect(citizenName(12, 40, 2, false)).toBe(fr[2]);
    setLang('en', false);
    expect(familyName(40, 0)).toMatch(/^of the /);
    expect(familyName(40, 2)).not.toBe((() => { setLang('fr', false); return familyName(40, 2); })());
  });

  it('toute la maisonnée porte le même nom de famille ; un prénom de femme pour une femme', () => {
    expect(citizenName(3, 9, 3, false).split(' ').slice(1)).toEqual(citizenName(4, 9, 3, true).split(' ').slice(1));
    // les listes alternent un homme, une femme : jamais le même prénom pour les deux
    for (let id = 0; id < 30; id++) expect(firstName(id, 2, true)).not.toBe(firstName(id, 2, false));
    expect(firstName(5, 1, true)).toMatch(/^(Livia|Julia|Daphné|Octavia|Hélène|Aurélia|Phèdre|Sabina|Lydia)$/);
  });
});

describe('habitants : ce qui leur manque', () => {
  it('les vrais manques du village passent avant les souhaits, dans l’ordre', () => {
    expect(citizenWish({ ...ok, food: false, water: false }).text).toMatch(/faim/);
    expect(citizenWish({ ...ok, water: false }).tone).toBe('need');
    expect(citizenWish({ ...ok, jobs: false, working: false }).text).toMatch(/travail/);
    // un habitant qui a déjà un métier ne se plaint pas du chômage des autres
    expect(citizenWish({ ...ok, jobs: false }).tone).not.toBe('need');
    expect(citizenWish({ ...ok, room: false }).text).toMatch(/maison libre/);
    expect(citizenWish({ ...ok, resting: true, food: false }).text).toMatch(/blessures/);
  });

  it('puis ses souhaits à lui : le puits loin, le froid, les fleurs devant chez lui', () => {
    expect(citizenWish({ ...ok, wellDist: WELL_FAR + 1 }).text).toBe('Le puits est loin de chez moi.');
    expect(citizenWish({ ...ok, wellDist: Infinity }).tone).toBe('happy');
    expect(citizenWish({ ...ok, season: 3 }).text).toMatch(/froid/);
    expect(citizenWish({ ...ok, pretty: true }).text).toMatch(/fleurs/);
  });
});

describe('habitants : pourquoi le village ne grandit pas', () => {
  beforeAll(() => setMapSize(96));

  it('six habitants sans travail : la fiche dit qu’il manque du travail (Chloé, v6)', () => {
    const w = flat();
    put(w, 'gather', 10, 10); for (let i = 0; i < 4; i++) put(w, 'house', 14 + i * 2, 10); put(w, 'well', 10, 14); put(w, 'farm', 12, 14);
    const sim = new Sim(w);
    sim.recalc();
    sim.pop = 6;
    sim.update(0.1, 0.3);
    const g = sim.growth();
    expect(g.full).toBe(false);
    expect(g.missing).toContain('jobs');
  });
});
