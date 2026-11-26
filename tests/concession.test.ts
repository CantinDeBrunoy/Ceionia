import { describe, it, expect, afterAll } from 'vitest';
import { World, setMapSize } from '../src/world/world';
import { newWorld, CONTINENT } from '../src/world/mapgen';
import { GEN, GEN_ARCH } from '../src/world/continent';
import { ARCH_N, MAIN_N, setZoneRelief, zoneSite, type RivalIsle } from '../src/world/archipelago';
import { townPlans, townPlan, townCells, forgetTowns } from '../src/world/rivalTown';
import { concession, forgetZones, ZONE_MIN, type Concession } from '../src/world/concession';
import { expandWorld } from '../src/world/expand';
import type { KindId } from '../src/build/catalog';
import { zoneLock, frontOpen, frontPerks, campPerks, garrisonBuilt } from '../src/sim/concession';
import { kindOffered, newDiplo } from '../src/sim/diplomacy';
import { corpsMax, campaignResult, stepCamp } from '../src/sim/campaign';
import { RivalBattle } from '../src/sim/rivalBattle';
import { souffle } from './souffle';

/**
 * Les concessions et la tête de pont (chantier C du nouveau monde) : la zone de chaque île rivale, sur 20 graines et les deux
 * peuples. Sur une carte neuve, sa limite (ria ou arête, un seul passage) est dans le relief, tirée d'un générateur à part :
 * le plan des villes ne bouge pas. Sur une ancienne carte, le relief ne change pas et la zone est trouvée quand même
 */
const SEEDS = [11, 4242, 7, 3, 99, 123, 2026, 31337, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987];

function archipel(seed: number, relief = true) {
  setMapSize(ARCH_N);
  setZoneRelief(relief);
  try {
    const w = new World();
    w.seed = seed;
    newWorld(w, CONTINENT, seed, GEN_ARCH);
    return w;
  } finally { setZoneRelief(true); }
}
const cellsOf = (w: World, z: Concession) => [...z.cells].map((k) => [k % ARCH_N, Math.floor(k / ARCH_N)] as [number, number]);
/** Une eau profonde à 5 cases au plus d'une case de la zone (le port, le quai, le débarquement) */
function deepNear(w: World, z: Concession) {
  for (const [x, zz] of cellsOf(w, z))
    for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) if (w.inCells(x + dx, zz + dz) && w.cellAvg(x + dx, zz + dz) < -0.6) return true;
  return false;
}
/** Les ouvertures de la limite : le long de sa ligne, les morceaux de terre basse où l'on passe (la ria et l'arête bloquent) */
function openings(w: World, q: RivalIsle) {
  const s = zoneSite(w.seed, q, w.isles!.main), v = q.village, runs: number[] = [];
  let run = 0;
  for (let sd = -s.half + 3.5; sd <= s.half - 3.5; sd += 0.5) {
    const at = (t: number) => w.cellAvg(Math.floor(v.x + s.ux * t - s.uz * sd), Math.floor(v.z + s.uz * t + s.ux * sd));
    // (l'arête : une crête de montagne, nettement plus haute que la zone, sauf au col ; la ria : de l'eau)
    const a = at(s.d0), open = a >= 0.08 && at(s.d0 - 4) >= 0.08 && at(s.d0 + 4) >= 0.08 && (s.limit === 'ria' || a < 3.6 && a - at(s.d0 + 4) < 1.3);
    if (open) run += 0.5; else if (run) { runs.push(run); run = 0; }
  }
  if (run) runs.push(run);
  // (un seul point d'échantillon ouvert n'est qu'une case de biais à cheval sur le bord de la limite)
  return runs.filter((r) => r >= 1);
}

describe('les concessions et la tête de pont : la zone de chaque île', () => {
  afterAll(() => { setMapSize(192); forgetTowns(); forgetZones(); });

  it('sur 20 graines, les deux peuples : plus de 300 cases, côté de notre île, hors de la ville, une eau profonde proche, la limite et un seul passage, le plan des villes inchangé', async () => {
    for (const seed of SEEDS) {
      await souffle();
      forgetTowns(); forgetZones();
      const w = archipel(seed);
      expect(w.zoneGen).toBe(1);
      const plans = JSON.stringify(townPlans(w));
      const m = w.isles!.main, mx = m.x + m.n / 2, mz = m.z + m.n / 2;
      for (const q of w.isles!.rivals) {
        const z = concession(w, q)!, where = `graine ${seed}, ${q.people}`;
        expect(z, where).toBeTruthy();
        expect(z.relief, where).toBe(true);
        expect(z.cells.size, where).toBeGreaterThanOrEqual(ZONE_MIN);
        // côté de notre île : vue du village, la zone est à un quart de tour au plus de la direction de notre île (elle s'en
        // écarte pour laisser à la ville sa plage et son port)
        const ang = Math.acos(((z.x - q.village.x) * (mx - q.village.x) + (z.z - q.village.z) * (mz - q.village.z)) / (Math.hypot(z.x - q.village.x, z.z - q.village.z) * Math.hypot(mx - q.village.x, mz - q.village.z)));
        expect(ang, where).toBeLessThanOrEqual(Math.PI / 2);
        const town = townCells(w, townPlan(w, q));
        expect(cellsOf(w, z).filter(([x, zz]) => town.has(w.ci(x, zz))).length, where).toBe(0);
        expect(deepNear(w, z), where).toBe(true);
        // la limite : une seule ouverture, étroite (le col ou la langue de terre), et la porte de la zone y donne
        const runs = openings(w, q);
        expect(runs.length, `${where} : ${runs.join(', ')}`).toBe(1);
        expect(runs[0], where).toBeLessThanOrEqual(6);
        const s = zoneSite(seed, q, w.isles!.main), px = q.village.x + s.ux * s.d0 - s.uz * s.pass, pz = q.village.z + s.uz * s.d0 + s.ux * s.pass;
        expect(Math.hypot(z.gate[0] - px, z.gate[1] - pz), where).toBeLessThan(6);
        // la plage du débarquement au bord de l'eau, le camp sur la zone
        const bx = Math.floor(z.beach[0]), bz = Math.floor(z.beach[1]);
        expect(z.cells.has(w.ci(bx, bz)) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => w.isWaterCell(bx + dx, bz + dz)), where).toBe(true);
        expect(z.cells.has(w.ci(Math.floor(z.camp[0]), Math.floor(z.camp[1]))), where).toBe(true);
        expect(z.edges.length, where).toBeGreaterThan(0);
      }
      // le plan des villes est celui d'une carte sans la zone dans le relief
      forgetTowns(); forgetZones();
      const old = archipel(seed, false);
      expect(old.zoneGen).toBe(0);
      expect(JSON.stringify(townPlans(old)), `graine ${seed}`).toBe(plans);
      // (et la zone s'y trouve aussi, bornée par le décor)
      for (const q of old.isles!.rivals) {
        const z = concession(old, q)!;
        expect(z.relief).toBe(false);
        expect(z.cells.size, `graine ${seed}, ${q.people}, ancienne carte`).toBeGreaterThanOrEqual(ZONE_MIN);
      }
    }
  }, 600000);

  it('une ancienne sauvegarde agrandie : le relief ne change pas au chargement, la zone est trouvée et bornée par un décor ; une partie agrandie aujourd’hui a la zone dans son relief', () => {
    for (const seed of [11, 4242]) {
      setMapSize(MAIN_N);
      const w = new World();
      w.seed = seed;
      newWorld(w, CONTINENT, seed, GEN);
      const save = JSON.parse(JSON.stringify(w.toJSON()));
      // l'agrandissement d'avant le chantier C : pas de zone dans le relief
      setZoneRelief(false);
      let old: any;
      try { old = JSON.parse(JSON.stringify(expandWorld(save, CONTINENT, seed))); } finally { setZoneRelief(true); }
      expect(old.zoneGen).toBeUndefined();
      forgetTowns(); forgetZones();
      setMapSize(ARCH_N);
      const e = new World();
      e.fromJSON(JSON.parse(JSON.stringify(old)));
      expect(e.zoneGen).toBe(0);
      expect(Array.from(e.heights, (v) => Math.round(v * 100))).toEqual(old.heights);
      for (const q of e.isles!.rivals) {
        const z = concession(e, q)!;
        expect(z.relief).toBe(false);
        expect(z.cells.size).toBeGreaterThanOrEqual(ZONE_MIN);
        expect(z.edges.length).toBeGreaterThan(10);
      }
      // réécrite, elle reste une ancienne carte
      expect(e.toJSON().zoneGen).toBeUndefined();
      // agrandie aujourd'hui : la zone est dans le relief des îles
      setMapSize(MAIN_N);
      const neu = expandWorld(JSON.parse(JSON.stringify(save)), CONTINENT, seed);
      expect(neu.zoneGen).toBe(1);
    }
  }, 600000);
});

describe('ce qu’on bâtit dans les zones, et ce que ça apporte', () => {
  afterAll(() => { setMapSize(192); forgetTowns(); forgetZones(); });

  /** La première emprise de la zone où ce bâtiment se pose (null : aucune) */
  const spot = (w: World, k: KindId, z: Concession) => {
    for (const c of z.cells) { const x = c % ARCH_N, zz = Math.floor(c / ARCH_N); if (w.canPlace(k, x, zz) === null) return [x, zz] as const; }
    return null;
  };

  it('la concession chez l’allié, la tête de pont chez le rival une fois la plage prise, chaque liste à sa place', () => {
    forgetTowns(); forgetZones();
    const w = archipel(11);
    w.diplo.met = ['orient', 'asie']; w.diplo.ally = 'orient'; w.diplo.path = 'war';
    const ally = concession(w, w.isles!.rivals.find((q) => q.people === 'orient')!)!, front = concession(w, w.isles!.rivals.find((q) => q.people === 'asie')!)!;
    // la base arrière : dans la concession ; la tête de pont : fermée avant la plage
    expect(spot(w, 'allyBarracks', ally)).not.toBeNull();
    expect(spot(w, 'house', ally)).not.toBeNull();
    expect(spot(w, 'frontInfirmary', front)).toBeNull();
    expect(zoneLock(w, 'frontInfirmary')).toMatch(/plage/);
    const [cx, cz] = [...front.cells].map((c) => [c % ARCH_N, Math.floor(c / ARCH_N)] as const)[0];
    expect(w.playable(cx, cz)).toBe(false);
    // la plage prise : la tête de pont s'ouvre, seulement à la liste de guerre ; le camp garde sa place
    w.diplo.battle = 'ready'; w.diplo.camp.held = ['plage'];
    expect(frontOpen(w)).toBe(true);
    const inf = spot(w, 'frontInfirmary', front)!;
    expect(inf).not.toBeNull();
    expect(front.cells.has(w.ci(inf[0], inf[1]))).toBe(true);
    expect(w.canPlace('house', inf[0], inf[1])).toMatch(/guerre/);
    expect(w.canPlace('frontTower', Math.floor(front.camp[0]), Math.floor(front.camp[1]))).toMatch(/camp/);
    expect(w.canPlace('frontInfirmary', inf[0], inf[1])).toBeNull();
    // (la tête de pont : pas chez l'allié ; la base arrière : pas chez le rival)
    expect(spot(w, 'frontInfirmary', ally)).toBeNull();
    expect(spot(w, 'allyBarracks', front)).toBeNull();
    // le fort attend le port, la ville de garnison le fort
    expect(zoneLock(w, 'fort')).toMatch(/port/);
    w.diplo.camp.held = ['plage', 'port'];
    expect(zoneLock(w, 'fort')).toBeNull();
    expect(zoneLock(w, 'garrison')).toMatch(/fort/);
    // la paix : seulement sur sa voie, dans la concession
    expect(kindOffered(w, 'merchantPort')).toBe(false);
    expect(kindOffered(w, 'fort')).toBe(true);
    w.diplo.path = 'peace'; w.diplo.camp.held = []; w.diplo.battle = 'none';
    expect(kindOffered(w, 'merchantPort')).toBe(true);
    expect(kindOffered(w, 'fort')).toBe(false);
    expect(spot(w, 'exchangeHall', ally)).not.toBeNull();
    // le port marchand se pose au bord de l'eau
    expect(spot(w, 'merchantPort', ally)).not.toBeNull();
    // un ancien conflit réglé : la paix ouvre la concession, la victoire la tête de pont
    w.diplo.path = 'peace'; w.diplo.conflict = 'peace';
    expect(kindOffered(w, 'commonSchool')).toBe(true);
    w.diplo.path = 'war'; w.diplo.conflict = 'won';
    expect(frontOpen(w)).toBe(true);
    expect(kindOffered(w, 'garrison')).toBe(true);
  });

  it('le débarquement se fait sur la plage de la tête de pont, et le camp s’y pose', () => {
    forgetTowns(); forgetZones();
    const w = archipel(4242);
    for (const people of ['orient', 'asie'] as const) {
      const q = w.isles!.rivals.find((r) => r.people === people)!, z = concession(w, q)!;
      const b = new RivalBattle(w, people, 2, false, undefined, [], undefined, { kind: 'landing' });
      const [bx, bz] = b.toWorld(...b.goalAt.camp);
      expect(Math.hypot(bx - z.camp[0], bz - z.camp[1]), people).toBeLessThan(4);
    }
  });

  it('les effets : infirmerie, ville de garnison, hôpital allié, radar, fort, forge', () => {
    const perks = frontPerks({ isles: {} as any, diplo: { path: 'war', conflict: 'open' } as any }, { frontInfirmary: 1, fort: 1, garrison: 1, milHospital: 1, soldierClub: 1, allyHospital: 1, radar: 1, allyBarracks: 1, allyShipyard: 1 });
    expect(perks).toMatchObject({ infirmary: true, fort: true, garrison: true, hospital: true, radar: true, allies: 3, ships: 1 });
    expect(garrisonBuilt({ garrison: 1, garrisonHouse: 2 })).toBe(true);
    expect(garrisonBuilt({ milHospital: 1, soldierClub: 1, garrisonHouse: 1 })).toBe(false);
    const cp = campPerks(perks);
    // la ville de garnison : 8 hommes de plus au corps
    const d = newDiplo(); d.ally = 'orient'; d.path = 'war'; d.battle = 'ready'; d.camp.held = ['plage'];
    expect(corpsMax(d, 4, cp.bonus)[0] - corpsMax(d, 4)[0]).toBe(8);
    // l'hôpital allié : un tiers des tombés reviennent
    campaignResult(d, 'port', true, [0, 0], 0, 100, 3, cp);
    expect(d.camp.lost[0]).toBe(corpsMax(d, 3, cp.bonus)[0] - Math.floor(corpsMax(d, 3, cp.bonus)[0] / 3));
    // l'infirmerie : les pertes se refont deux fois plus vite
    const a = newDiplo(), b2 = newDiplo();
    for (const x of [a, b2]) { x.ally = 'orient'; x.path = 'war'; x.battle = 'ready'; x.camp.held = ['plage']; x.camp.lost = [10, 0]; x.camp.train = 0; }
    stepCamp(a, 100 * 0.6, 100, 2); stepCamp(b2, 100 * 0.6, 100, 2, cp);
    expect(10 - b2.camp.lost[0]).toBe(2 * (10 - a.camp.lost[0]));
    // le fort : le camp deux fois plus solide ; la forge : nos coups plus forts
    forgetTowns(); forgetZones();
    const w = archipel(11);
    const plain = new RivalBattle(w, 'asie', 2, false, undefined, [], undefined, { kind: 'defend' });
    const fort = new RivalBattle(w, 'asie', 2, false, undefined, [], undefined, { kind: 'defend', front: { fort: true, tower: true, forge: true } });
    expect(fort.camp!.maxHp).toBe(2 * plain.camp!.maxHp);
    expect(fort.troops()[0].stats.dmg).toBeGreaterThan(plain.troops()[0].stats.dmg);
  }, 120000);
});
