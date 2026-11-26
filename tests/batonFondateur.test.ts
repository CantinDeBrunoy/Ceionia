import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync } from 'node:fs';
import { World, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { STAFF_KINDS, STAFF_PERK, STAFF_YIELD, readStaff, staffNow, staffOfOld, staffOfOpen, staffYield, theftBeforePortal } from '../src/sim/staff';
import { perkYield, SULFUR_MINE } from '../src/sim/legacy';
import { claimKingdom, KINGDOM_PERK } from '../src/sim/kingdom';
import { THEFT_PLAN, THEFT_TOTAL, THEFT_CAPTIONS, theftShotAt, theftShotStart, theftCaptionAt, riftOpenAt, theftBlackAt, theftTintAt, GRAB_AT, STAFF_FILM, STAFF_FILM_WAIT, staffFilmCaptionAt } from '../src/staffCine';
import { readFileSync } from 'node:fs';
import { END_PLAN, endShotStart, staffRiseAt } from '../src/kingdomEnd';
import { goalLine } from '../src/sim/objective';
import { waysHtml } from '../src/ui/ways';
import { MUSIC } from '../src/audio/audio';
import { STAFF_SLOTS } from '../src/render/founderStaff';
import { tr, setLang } from '../src/i18n';
import '../src/i18n/en';

/** Une partie neuve sur le continent de 192 */
function village(seed = 2026) {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, seed, GEN);
  return w;
}
/** Relit une sauvegarde du monde (comme au chargement), `drop` : les champs à retirer (une sauvegarde d'avant eux) */
function reload(w: World, drop: string[] = []) {
  const d = JSON.parse(JSON.stringify(w.toJSON())) as Record<string, unknown>;
  for (const k of drop) delete d[k];
  const back = new World();
  back.fromJSON(d);
  return back;
}

describe('le bâton du fondateur : son état et les sauvegardes', () => {
  beforeAll(() => setMapSize(192));

  it('une partie neuve a son bâton sur la place, et le garde à la sauvegarde', () => {
    const w = village();
    expect(w.staff).toBe('home');
    expect(reload(w).staff).toBe('home');
    w.staff = 'stolen';
    expect(reload(w).staff).toBe('stolen');
    w.staff = 'back';
    expect(reload(w).staff).toBe('back');
  });

  it('une sauvegarde d’avant lui le relit vide (null), à déduire de la partie', () => {
    const w = village();
    expect(reload(w, ['staff']).staff).toBeNull();
    expect(readStaff(undefined)).toBeNull();
    expect(readStaff('n’importe quoi')).toBeNull();
    expect(readStaff('stolen')).toBe('stolen');
  });

  it('les anciennes parties : repris si le roi est tombé, volé si les Enfers ont été vus, sinon sur la place', () => {
    expect(staffOfOld({ kingFallen: true, hellSeen: true })).toBe('back');
    expect(staffOfOld({ kingFallen: true, hellSeen: false })).toBe('back');
    expect(staffOfOld({ kingFallen: false, hellSeen: true })).toBe('stolen');
    expect(staffOfOld({ kingFallen: false, hellSeen: false })).toBe('home');
    // (le royaume tombé l'emporte toujours : mode développeur, sauvegarde bricolée)
    expect(staffNow('stolen', true)).toBe('back');
    expect(staffNow('home', true)).toBe('back');
    expect(staffNow('stolen', false)).toBe('stolen');
  });
});

describe('le bâton du fondateur : quand le vol se joue', () => {
  it('plus avant la carte du grand choix : le bâton reste sur la place tant qu’on ne prend pas les Enfers', () => {
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).not.toContain('theftBeforeChoice');
    // (la carte s'ouvre sans rien jouer avant elle)
    expect(main).toMatch(/private showGrandChoice\(\) \{ this\.worldChoice\.show\(\); \}/);
  });

  it('avant la cinématique du portail, seulement si le bâton est encore sur la place', () => {
    expect(theftBeforePortal('home')).toBe(true);
    expect(theftBeforePortal('stolen')).toBe(false);
    expect(theftBeforePortal('back')).toBe(false);
    // (la cinématique du portail commence par le vol : `playPortalCine` le joue d'abord, puis le film du portail)
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).toMatch(/theftBeforePortal\([^)]*\) && this\.mode === 'surface'\) \{ this\.stealStaff\(\(\) => this\.portalStage\.play\(\)\)/);
  });

  it('les anciennes parties : les Enfers déjà ouverts avec le bâton sur la place, il est volé, sans cinématique', () => {
    expect(staffOfOpen('home', true)).toBe('stolen');
    // pas encore ouverts (grand choix à faire, « Explorer le monde », « Ni l'un ni l'autre », bac à sable en attente) : sur la place
    expect(staffOfOpen('home', false)).toBe('home');
    // déjà volé, ou repris : rien ne change
    expect(staffOfOpen('stolen', true)).toBe('stolen');
    expect(staffOfOpen('stolen', false)).toBe('stolen');
    expect(staffOfOpen('back', true)).toBe('back');
  });

  it('les anciennes parties : un bâton volé le reste au chargement', () => {
    const w = village();
    w.staff = 'stolen';
    const back = reload(w);
    expect(back.staff).toBe('stolen');
    expect(staffOfOpen(back.staff!, false)).toBe('stolen');
    expect(staffNow(back.staff!, false)).toBe('stolen');
  });
});

describe('le film du vol : la vidéo, sinon le direct', () => {
  it('ses fichiers, à côté de ceux du portail', () => {
    expect(STAFF_FILM.webm).toBe('./vol/vol.webm');
    expect(STAFF_FILM.mp4).toBe('./vol/vol.mp4');
    expect(STAFF_FILM_WAIT).toBeGreaterThan(2);
  });

  it('ses bandeaux tiennent dans le film, un seul à la fois, sans point-virgule', () => {
    let last = -1;
    for (const c of STAFF_FILM.captions) {
      expect(c.at).toBeGreaterThan(last);
      expect(c.at + c.dur).toBeLessThanOrEqual(STAFF_FILM.dur);
      expect(staffFilmCaptionAt(c.at + c.dur / 2)?.text).toBe(c.text);
      expect(c.text + (c.sub ?? '')).not.toContain(';');
      last = c.at + c.dur;
    }
    expect(staffFilmCaptionAt(STAFF_FILM.dur + 1)).toBeNull();
    for (const t of [...STAFF_FILM.rumble, STAFF_FILM.roar]) { expect(t).toBeGreaterThan(0); expect(t).toBeLessThan(STAFF_FILM.dur); }
  });

  it('le direct reste là tant que la vidéo n’existe pas', () => {
    const stage = readFileSync('src/staffStage.ts', 'utf8');
    expect(stage).toContain('toLive');
    expect(stage).toContain('STAFF_FILM.mp4');
  });

  it('revoir la cinématique des Enfers rejoue les deux parties à la suite', () => {
    const ui = readFileSync('src/ui/ui.ts', 'utf8');
    expect(ui).toMatch(/h\.replayTheft\(portal\)/);
  });
});

describe('le bâton du fondateur : la reconquête et son bonus', () => {
  it('la chute du roi le rend au village, une seule fois', () => {
    const purse = { ore: 0, exp: { perks: [] as string[], gear: {} as Record<string, number>, bonus: { joy: 0 } as Record<string, number> }, isleGuard: { waves: 0 } };
    const r = claimKingdom(purse as never);
    expect(r?.staff).toBe(true);
    expect(purse.exp.perks).toContain(STAFF_PERK);
    expect(purse.exp.perks).toContain(KINGDOM_PERK);
    expect(claimKingdom(purse as never)).toBeNull();
    expect(purse.exp.perks.filter((p) => p === STAFF_PERK)).toHaveLength(1);
  });

  it('bois, pierre, minerai et briques +20 %, cumulé aux autres savoir-faire', () => {
    const none = { exp: { perks: [] as string[] } }, staff = { exp: { perks: [STAFF_PERK] } }, both = { exp: { perks: [STAFF_PERK, 'sulfur'] } };
    expect(STAFF_YIELD).toBeCloseTo(1.2);
    for (const k of STAFF_KINDS) {
      expect(staffYield(none, k)).toBe(1);
      expect(staffYield(staff, k)).toBeCloseTo(STAFF_YIELD);
      expect(perkYield(staff, k)).toBeCloseTo(STAFF_YIELD);
    }
    expect(perkYield(staff, 'house')).toBe(1);
    expect(perkYield(both, 'mine')).toBeCloseTo(SULFUR_MINE * STAFF_YIELD);
    expect(perkYield(none, 'lumber')).toBe(1);
  });
});

describe('la cinématique du vol : sa partition', () => {
  it('quatre plans dans l’ordre, une quinzaine de secondes', () => {
    expect(THEFT_PLAN.map((p) => p.id)).toEqual(['calm', 'rift', 'demons', 'gone']);
    expect(THEFT_TOTAL).toBeGreaterThanOrEqual(12);
    expect(THEFT_TOTAL).toBeLessThanOrEqual(18);
    for (const p of THEFT_PLAN) {
      const t = theftShotStart(p.id);
      expect(theftShotAt(t + 0.01)!.shot).toBe(p.id);
      expect(theftShotAt(t + p.dur - 0.01)!.shot).toBe(p.id);
    }
    expect(theftShotAt(THEFT_TOTAL)).toBeNull();
    expect(GRAB_AT).toBeLessThan(THEFT_PLAN[2].dur);
  });

  it('chaque bandeau tient dans son plan, un seul à la fois', () => {
    for (const c of THEFT_CAPTIONS) {
      const dur = THEFT_PLAN.find((p) => p.id === c.shot)!.dur;
      expect(c.at + c.dur).toBeLessThanOrEqual(dur);
      expect(theftCaptionAt(theftShotStart(c.shot) + c.at + c.dur / 2)?.text).toBe(c.text);
      expect(c.text + (c.sub ?? '')).not.toContain(';');
    }
    for (let t = 0; t < THEFT_TOTAL; t += 0.05) expect([theftCaptionAt(t)].filter(Boolean).length).toBeLessThanOrEqual(1);
  });

  it('la faille : fermée au calme, ouverte quand les démons sortent, refermée à la fin', () => {
    expect(riftOpenAt(0)).toBe(0);
    expect(riftOpenAt(theftShotStart('rift') - 0.1)).toBe(0);
    expect(riftOpenAt(theftShotStart('demons') + 1)).toBe(1);
    expect(riftOpenAt(THEFT_TOTAL - 0.05)).toBe(0);
    expect(theftBlackAt(0)).toBe(0);
    expect(theftBlackAt(THEFT_TOTAL)).toBeCloseTo(1);
    expect(theftTintAt(0)).toBe(0);
    expect(theftTintAt(theftShotStart('demons'))).toBeGreaterThan(0.9);
  });

  it('son morceau à elle, présent dans aucune autre liste', () => {
    expect(MUSIC.theft).toEqual(['cine-vol']);
    for (const [k, list] of Object.entries(MUSIC)) if (k !== 'theft') expect(list).not.toContain('cine-vol');
    expect(existsSync('public/sons/musique/cine-vol.mp3')).toBe(true);
  });
});

describe('le bâton du fondateur : ce que voit le joueur', () => {
  it('une place par âge, sur la grande place', () => {
    expect(STAFF_SLOTS).toHaveLength(6);
    for (const [x, z] of STAFF_SLOTS) { expect(Math.abs(x)).toBeLessThan(1.3); expect(Math.abs(z)).toBeLessThan(1.3); }
  });

  it('l’onglet « Grands choix » : la voie des Enfers devient « Reprendre le bâton » une fois le bâton volé', () => {
    setLang('fr');
    const ways = { hell: 'open' as const, world: 'taken' as const };
    expect(waysHtml(ways)).not.toContain('Reprendre le bâton');
    // (sur la place, la menace qui gronde dessous)
    expect(waysHtml(ways)).toContain('la terre gronde');
    expect(waysHtml(ways, null, 'stolen')).toContain('Reprendre le bâton');
    expect(waysHtml({ hell: 'taken', world: 'taken' }, null, 'back')).toContain('Le bâton du fondateur est revenu sur la place du village.');
  });

  it('l’objectif du royaume dit le bâton', () => {
    setLang('fr');
    expect(goalLine({ kind: 'kingdom', zone: 6 }, null, true)).toBe('Objectif : abattre la citadelle et reprendre le bâton');
    expect(goalLine({ kind: 'kingdom', zone: 6 }, null)).toBe('Objectif : abattre la citadelle du royaume');
  });

  it('à la chute du roi, un plan de plus : le bâton remonte de terre', () => {
    expect(END_PLAN.at(-1)!.id).toBe('staff');
    expect(endShotStart('staff')).toBeGreaterThan(endShotStart('village'));
    expect(staffRiseAt(0)).toBe(0);
    expect(staffRiseAt(END_PLAN.at(-1)!.dur)).toBe(1);
    let last = 0;
    for (let t = 0; t <= 4; t += 0.1) { const k = staffRiseAt(t); expect(k).toBeGreaterThanOrEqual(last); last = k; }
  });

  it('les textes ont leur anglais', () => {
    setLang('en');
    for (const s of ['Reprendre le bâton', 'Le bâton du fondateur', 'Les démons surgissent', 'Le bâton est aux Enfers', 'Le bâton du fondateur revient sur la place',
      'Objectif : abattre la citadelle et reprendre le bâton', 'Le bâton', 'Au-delà, le bâton volé', 'Ici, le chef planta son bâton',
      'Sous la grande place, la terre gronde. Le portail de l’île au large s’ouvre : une petite troupe passe aussitôt chez les démons.',
      'Sous la grande place, la terre gronde autour du bâton du fondateur. Des démons rôdent de l’autre côté. Une petite troupe passe aussitôt, avec un camp et une caserne pour en recruter d’autres.',
      'Sous la grande place, la terre gronde autour du bâton du fondateur. Derrière l’arche noire de l’île au large, des démons attendent.',
      ...STAFF_FILM.captions.flatMap((c) => [c.text, c.sub ?? 'Le bâton'])]) expect(tr(s)).not.toBe(s);
    setLang('fr');
  });
});
