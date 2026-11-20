import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import '../src/i18n/en';
import { setLang } from '../src/i18n';
import { World, setMapSize } from '../src/world/world';
import { Sim } from '../src/sim/sim';
import { KINDS, KindId } from '../src/build/catalog';
import { citizenName, citizenWish, familyName, firstName, WishCtx, WELL_FAR } from '../src/sim/citizens';
import { wishFor, wishMet, sitesOf, unlockingMission, Wish, WISH_JOY, WISH_JOY_MAX } from '../src/sim/wishes';

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
    expect(citizenWish({ ...ok, room: false, cousins: true }).text).toMatch(/maison libre/);
    // le village plein ne fait parler de logement que ceux dont la famille attend
    expect(citizenWish({ ...ok, room: false, cousins: false }).text).not.toMatch(/maison libre/);
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

describe('habitants : envies variées', () => {
  beforeAll(() => setMapSize(96));

  it('un manque du village ne fait parler que la part des habitants qu’il touche', () => {
    const say = (share: number) => Array.from({ length: 200 }, (_, id) => citizenWish({ ...ok, id, food: false, share: { food: share, water: 0, health: 0, joy: 0 } }).tone === 'need').filter(Boolean).length;
    expect(say(0)).toBe(0);
    expect(say(1)).toBe(200);
    expect(say(0.25)).toBeGreaterThan(25);
    expect(say(0.25)).toBeLessThan(80);
  });

  it('une envie à lui passe avant les petits souhaits, un merci avant tout', () => {
    expect(citizenWish({ ...ok, own: 'Une envie.' })).toEqual({ text: 'Une envie.', tone: 'wish' });
    expect(citizenWish({ ...ok, own: 'Une envie.', thanks: 'Merci !' }).tone).toBe('happy');
    expect(citizenWish({ ...ok, own: 'Une envie.', food: false }).tone).toBe('need');
  });

  it('les envies sont vraies autour de sa maison, variées d’un habitant à l’autre, et une envie comblée se voit', () => {
    const w = flat(), home = put(w, 'house', 40, 40, 2);
    const b = w.buildings.get(home)!;
    let sites = sitesOf(w);
    const wishes = new Set<string>();
    for (let id = 1; id < 60; id++) { const x = wishFor(w, sites, b, id, 2, ['']); if (x) wishes.add(`${x.type}:${x.kind}`); }
    expect(wishes.size).toBeGreaterThan(5);
    expect([...wishes].some((x) => x.startsWith('decor:'))).toBe(true);
    expect([...wishes].some((x) => x.startsWith('place:'))).toBe(true);
    expect([...wishes].some((x) => x.startsWith('expedition:'))).toBe(true);
    // un banc posé à deux pas comble l'envie d'un banc
    const bench: Wish = { type: 'decor', kind: 'bench' };
    expect(wishMet(w, sites, b, bench)).toBe(false);
    put(w, 'bench', 42, 41, 2);
    sites = sitesOf(w);
    expect(wishMet(w, sites, b, bench)).toBe(true);
    // et plus personne de cette maison n'a envie d'un banc
    for (let id = 1; id < 60; id++) expect(wishFor(w, sites, b, id, 2, ['old'])?.kind).not.toBe('bench');
  });

  it('les bâtiments à débloquer se lisent dans le catalogue et les missions, et la mission réussie comble l’envie', () => {
    const w = flat(), b = w.buildings.get(put(w, 'house', 30, 30, 0))!;
    const m = unlockingMission(w, 'apiary', 0);
    expect(m?.id).toBe(KINDS.apiary.reqMission);
    const sites = sitesOf(w), wish: Wish = { type: 'expedition', kind: 'apiary', mission: m!.id };
    expect(wishMet(w, sites, b, wish)).toBe(false);
    w.exp.done.push(m!.id);
    expect(wishMet(w, sites, b, wish)).toBe(true);
    expect(unlockingMission(w, 'apiary', 0)).toBeNull();
  });

  it('les envies comblées : un petit bien-être plafonné, gardé dans la sauvegarde (0 pour une ancienne partie)', () => {
    const w = flat(), sim = new Sim(w);
    sim.recalc(); sim.update(0.1, 0.3);
    const base = sim.joy.cap;
    w.wishesMet = 5; sim.update(0.1, 0.3);
    expect(sim.joy.cap - base).toBeCloseTo(5 * WISH_JOY);
    w.wishesMet = 999; sim.update(0.1, 0.3);
    expect(sim.joy.cap - base).toBeCloseTo(WISH_JOY_MAX);
    const back = new World(); back.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(back.wishesMet).toBe(999);
    const old = JSON.parse(JSON.stringify(w.toJSON())); delete old.wishes;
    const again = new World(); again.fromJSON(old);
    expect(again.wishesMet).toBe(0);
  });
});
