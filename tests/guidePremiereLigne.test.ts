import { describe, it, expect, vi, afterEach } from 'vitest';
import { chapterDue } from '../src/ui/tutorial';
import { railChapter, railWanted, stationPairs, STUCK_MS, type RailHost } from '../src/ui/tutorialRail';
import { CHAPTER_TEXT } from '../src/ui/tutorialChapters';
import type { UI } from '../src/ui/ui';

/** un hôte factice : un village qu'on fait avancer à la main */
function host(over: Partial<RailHost> = {}) {
  const s = { terminal: 0, kiln: 1, stations: 0, lines: 0, edit: null as number[] | null, card: false, forMe: 0, look: [] as number[][] };
  const h: RailHost = {
    root: { querySelector: () => null } as unknown as HTMLElement,
    age: () => 3, count: (k) => (k === 'terminal' ? s.terminal : k === 'brickworks' ? s.kiln : 0), stations: () => s.stations,
    bricks: () => 50, lines: () => s.lines, holding: () => null, drop: () => {}, stationCard: () => s.card,
    editing: () => s.edit, trouble: () => null, nextStop: () => 7, pin: () => null, look: (ids) => { s.look.push(ids); },
    openLine: () => { s.edit = [7]; }, forMe: () => { s.forMe++; s.edit = [7, 8]; return true; },
    train: () => (s.lines ? { running: true, why: '' } : null), follow: () => {}, following: () => false, away: () => false,
    ...over,
  };
  return { s, h };
}
const ui = { buildAnchor: () => ({ el: null, hidden: null }) } as unknown as UI;

afterEach(() => { vi.useRealTimers(); });

describe('guidage de la première ligne de train', () => {
  it('se lance seul à l’âge industriel, une fois, dans un village sans ligne', () => {
    const base = { sandbox: false, age: 3, lines: 0, kiln: 1, stations: 0 };
    expect(railWanted(base)).toBe(true);
    expect(railWanted({ ...base, kiln: 0, stations: 1 })).toBe(true);
    // pas avant d'avoir de quoi faire des briques, ni avant l'âge industriel, ni au bac à sable
    expect(railWanted({ ...base, kiln: 0 })).toBe(false);
    expect(railWanted({ ...base, age: 2 })).toBe(false);
    expect(railWanted({ ...base, sandbox: true })).toBe(false);
    // une ancienne partie qui a déjà sa ligne ne le voit pas
    expect(railWanted({ ...base, lines: 1 })).toBe(false);
    // une seule fois, même le tutoriel passé ; pas s'il est désactivé à l'accueil
    expect(chapterDue({ on: false, step: 3, end: 'skip' }, 'rail')).toBe(true);
    expect(chapterDue({ on: false, step: 0, end: 'done', seen: ['rail'] }, 'rail')).toBe(false);
    expect(chapterDue({ on: false, step: 0, end: 'skip', off: true }, 'rail')).toBe(false);
  });

  it('« Relier pour moi » prend les deux gares les plus proches, la gare centrale en premier', () => {
    const st = [{ id: 1, x: 0, z: 0, size: 3 }, { id: 2, x: 40, z: 0, size: 2 }, { id: 3, x: 10, z: 0, size: 2 }];
    const pairs = stationPairs(st, 1);
    expect(pairs.map(([a, b]) => [a.id, b.id])).toEqual([[1, 3], [2, 3], [1, 2]]);
    // la gare centrale passe devant, même bâtie après
    expect(stationPairs([{ id: 4, x: 0, z: 0, size: 2 }, { id: 9, x: 5, z: 0, size: 3 }], 9)[0].map((s) => s.id)).toEqual([9, 4]);
    expect(stationPairs([{ id: 1, x: 0, z: 0, size: 3 }])).toEqual([]);
  });

  it('six étapes dans l’ordre, chacune attend son geste', () => {
    const { s, h } = host();
    const c = railChapter(ui, h, () => {});
    expect(c.steps.map((x) => x.id)).toEqual(['railTerminal', 'railStation', 'railOpen', 'railPick', 'railTrack', 'railTrain']);
    const [terminal, station, open, pick, track, train] = c.steps;
    terminal.begin!();
    expect(terminal.check()).toEqual([false]);
    s.terminal = 1; s.stations = 1;
    expect(terminal.check()).toEqual([true]);
    expect(station.check()).toEqual([false]);
    s.stations = 2;
    expect(station.check()).toEqual([true]);
    open.begin!();
    expect(open.check()).toEqual([false, false]);
    s.card = true;
    expect(open.check()).toEqual([true, false]);
    s.edit = [7];
    expect(open.check()).toEqual([true, true]);
    pick.begin!();
    expect(pick.check()).toEqual([true, false]);
    s.edit = [7, 8];
    expect(pick.check()).toEqual([true, true]);
    track.begin!();
    expect(track.check()).toEqual([false]);
    s.edit = null; s.lines = 1;
    expect(track.check()).toEqual([true]);
    // la dernière se lit : le joueur regarde partir le train, puis « Terminer »
    expect(train.read).toBe(true);
    expect(train.check()).toEqual([true]);
  });

  it('sans briqueterie, la bulle le dit et montre sa vignette', () => {
    const { s, h } = host();
    s.kiln = 0;
    const c = railChapter(ui, h, () => {});
    c.steps[0].begin!();
    expect(c.steps[0].note!()).toContain('briques');
  });

  it('qui bloque se voit proposer « Relier pour moi », qui prépare la ligne et passe à la validation', () => {
    vi.useFakeTimers({ toFake: ['performance'] });
    const { s, h } = host();
    s.terminal = 1; s.stations = 2;
    const jumped: string[] = [];
    const c = railChapter(ui, h, (id) => jumped.push(id));
    const open = c.steps[2];
    open.begin!();
    expect(open.act!()).toBeNull();
    vi.advanceTimersByTime(STUCK_MS + 100);
    const act = open.act!();
    expect(act?.label).toBe(CHAPTER_TEXT.rail.forMe);
    act!.run();
    expect(s.forMe).toBe(1);
    expect(s.edit).toEqual([7, 8]);
    expect(jumped).toEqual(['railTrack']);
    // à la validation, la bulle dit que le jeu a choisi les gares
    expect(c.steps[4].text!()).toBe(CHAPTER_TEXT.rail.track.helped);
  });

  it('le tracé refermé en route : « Reprendre le tracé » le rouvre', () => {
    const { s, h } = host();
    const c = railChapter(ui, h, () => {});
    const pick = c.steps[3];
    pick.begin!();
    expect(pick.note!()).toBe(CHAPTER_TEXT.rail.pick.closed);
    pick.act!()!.run();
    expect(s.edit).toEqual([7]);
    expect(pick.note!()).toBe('');
  });

  it('rejoué avec une ligne déjà là, il attend une ligne de plus', () => {
    const { s, h } = host();
    s.lines = 1; s.terminal = 1; s.stations = 2;
    const c = railChapter(ui, h, () => {});
    c.steps[0].begin!();
    c.steps[4].begin!();
    expect(c.steps[4].check()).toEqual([false]);
    s.lines = 2;
    expect(c.steps[4].check()).toEqual([true]);
  });
});
