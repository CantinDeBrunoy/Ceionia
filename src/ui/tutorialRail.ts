import { KINDS, KindId } from '../build/catalog';
import { BRICK_PRICE } from '../sim/economy';
import { tr, fmt } from '../i18n';
import type { Chapter, Step, StepText } from './tutorial';
import type { UI } from './ui';
import { CHAPTER_TEXT } from './tutorialChapters';

/**
 * Le chapitre « La première ligne » : la première fois, un joueur se perdait en traçant sa ligne de train (le conseil caché,
 * la gare centrale au bout du rayon, « Nouvelle ligne » au bas de la fiche, la gare suivante cachée sous le panneau du tracé,
 * le train qu'on ne voyait pas partir). La bulle le mène geste après geste : les deux gares, l'outil des lignes, les gares à
 * relier, la voie, le premier train. S'il bloque, « Relier pour moi » prépare la ligne entre les deux gares les plus proches.
 * Lancé une fois, à l'âge industriel, dans un village sans ligne (voir `Game.watchRail`) ; rejoué depuis l'onglet Chemin de fer
 */

/** Ce que le chapitre lit et fait dans la partie (fourni par le jeu, voir `main.ts`) */
export interface RailHost {
  root: HTMLElement;
  age(): number;
  /** bâtiments de ce genre debout ; toutes les gares (petites, centrale, maglev) */
  count(k: KindId): number;
  stations(): number;
  bricks(): number;
  /** lignes du village */
  lines(): number;
  /** le genre du bâtiment en main (null : aucun) ; le lâcher */
  holding(): KindId | null;
  drop(): void;
  /** la fiche ouverte est celle d'une gare */
  stationCard(): boolean;
  /** les arrêts de la ligne en cours de tracé (null : pas de tracé) ; ce qui empêche de la valider */
  editing(): number[] | null;
  trouble(): string | null;
  /** la gare à cliquer : la gare centrale, ou la plus proche du dernier arrêt ; le marqueur doré posé sur elle (null : aucun) */
  nextStop(): number | null;
  pin(id: number | null): Element | null;
  /** la vue va sur ces bâtiments (tous à l'écran) */
  look(ids: number[]): void;
  /** le tracé, rouvert depuis la gare centrale */
  openLine(): void;
  /** « Relier pour moi » : le tracé prêt entre les deux gares les plus proches (faux : aucune paire ne se relie) */
  forMe(): boolean;
  /** le train de la dernière ligne : parti au moins une fois, et ce qui l'arrête ('' : rien) ; null sans ligne */
  train(): { running: boolean; why: string } | null;
  follow(): void;
  following(): boolean;
  /** le joueur n'est pas au village (Enfers, sous terre, île du portail) */
  away(): boolean;
}

/** Un bâtiment sur la carte : son coin et son côté */
export interface Spot { id: number; x: number; z: number; size: number }

/**
 * Les paires de gares, de la plus proche à la plus lointaine (distance entre leurs milieux) ; la gare centrale d'une paire
 * passe en premier (la ligne part d'elle). `first` : l'identifiant de la gare centrale
 */
export function stationPairs(list: Spot[], first: number | null = null): [Spot, Spot][] {
  const mid = (s: Spot) => [s.x + s.size / 2, s.z + s.size / 2];
  const out: { p: [Spot, Spot]; d: number }[] = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const [ax, az] = mid(list[i]), [bx, bz] = mid(list[j]);
    const p: [Spot, Spot] = list[j].id === first ? [list[j], list[i]] : [list[i], list[j]];
    out.push({ p, d: Math.hypot(ax - bx, az - bz) });
  }
  return out.sort((a, b) => a.d - b.d || a.p[0].id - b.p[0].id || a.p[1].id - b.p[1].id).map((o) => o.p);
}

/**
 * Le guidage se lance-t-il de lui-même ? À l'âge industriel, hors bac à sable, dans un village sans ligne (une ancienne partie
 * qui a déjà la sienne ne le voit pas) qui a sa briqueterie ou déjà une gare
 */
export function railWanted(o: { sandbox: boolean; age: number; lines: number; kiln: number; stations: number }): boolean {
  return !o.sandbox && o.age >= 3 && o.lines === 0 && (o.kiln > 0 || o.stations > 0);
}

/** après ce temps (ms) sur l'étape sans y arriver, la bulle propose « Relier pour moi » */
export const STUCK_MS = 12000;

const step = (id: string, t: StepText, s: Omit<Step, 'id' | 't'>): Step => ({ id, t, ...s });

export function railChapter(ui: UI, h: RailHost, jump: (id: string) => void): Chapter {
  const R = CHAPTER_TEXT.rail, q = (s: string) => h.root.querySelector(s);
  const name = (k: KindId) => tr('« {name} »', { name: KINDS[k].names[Math.max(h.age(), KINDS[k].minAge)] });
  const say = (s: string) => fmt(s, { terminal: name('terminal'), station: name('station'), kiln: name('brickworks'), n: BRICK_PRICE.terminal ?? 30 });
  /** le début de l'étape, et les lignes du village à ce moment (rejoué, le chapitre attend une ligne de plus) */
  let t0 = 0, lines0 = 0, helped = false;
  const stuck = () => performance.now() - t0 > STUCK_MS;
  /** « Relier pour moi » : la ligne prête, la bulle passe au bouton Valider */
  const forMe = () => ({ label: R.forMe, run: () => { if (h.forMe()) { helped = true; jump('railTrack'); } } });
  const resume = () => ({ label: R.resume, run: () => h.openLine() });
  const made = () => h.lines() > lines0;
  /** la vignette de la gare à poser ; en main : rien (la bulle dit comment la poser), sinon l'onglet, le rayon, la vignette */
  const tile = (k: KindId) => (h.holding() === k ? null : ui.buildAnchor(k).el);
  const pinned = (id: number | null) => h.pin(id);

  const steps: Step[] = [
    step('railTerminal', R.terminal, {
      begin: () => { t0 = performance.now(); lines0 = h.lines(); helped = false; },
      text: () => say(R.terminal.text), tasks: () => R.terminal.tasks.map(say),
      check: () => [h.count('terminal') > 0],
      // (sans briqueterie, c'est elle qu'il faut d'abord : la vignette de la gare centrale est encore grisée)
      anchor: () => { pinned(null); return h.count('terminal') ? null : tile(h.count('brickworks') ? 'terminal' : 'brickworks'); },
      note: () => {
        if (h.count('terminal')) return '';
        if (!h.count('brickworks')) return say(R.terminal.kiln);
        if (h.bricks() < (BRICK_PRICE.terminal ?? 30)) return say(R.terminal.bricks);
        return h.holding() === 'terminal' ? R.place : '';
      },
    }),
    step('railStation', R.station, {
      text: () => say(R.station.text), tasks: () => R.station.tasks.map(say),
      check: () => [h.stations() >= 2],
      anchor: () => { pinned(null); return h.stations() >= 2 ? null : tile('station'); },
      note: () => (h.stations() < 2 && h.holding() === 'station' ? R.place : ''),
    }),
    // (le bâtiment en main rentre : le clic sur la gare ouvrirait sinon une pose de plus)
    step('railOpen', R.open, {
      begin: () => { t0 = performance.now(); if (h.holding()) h.drop(); const id = h.nextStop(); if (id !== null && !h.editing()) h.look([id]); },
      check: () => { const e = !!h.editing() || made(); return [h.stationCard() || e, e]; },
      // la fiche ouverte : son bouton « Nouvelle ligne » ; sinon la gare centrale, marquée d'or sur la carte
      anchor: () => {
        const b = h.stationCard() ? q('#selCard [data-act="newline"]') : null;
        if (b) { pinned(null); return b; }
        return pinned(h.editing() ? null : h.nextStop());
      },
      note: () => (stuck() ? R.stuck : ''),
      act: () => (stuck() && h.stations() >= 2 ? forMe() : null),
    }),
    step('railPick', R.pick, {
      begin: () => { t0 = performance.now(); const e = h.editing(), next = h.nextStop(); if (next !== null) h.look([...(e ?? []).slice(-1), next]); },
      check: () => { const n = made() ? 2 : h.editing()?.length ?? 0; return [n >= 1, n >= 2]; },
      anchor: () => pinned(h.editing() ? h.nextStop() : null),
      note: () => (!h.editing() && !made() ? R.pick.closed : stuck() ? R.stuck : ''),
      act: () => (!h.editing() && !made() ? resume() : stuck() ? forMe() : null),
    }),
    step('railTrack', R.track, {
      begin: () => { t0 = performance.now(); const e = h.editing(); if (e?.length) h.look(e); },
      text: () => (helped ? R.track.helped : R.track.text),
      check: () => [made()],
      anchor: () => { pinned(null); return h.editing() ? q('#railEdit [data-r="ok"]') : null; },
      note: () => (!h.editing() && !made() ? R.pick.closed : h.trouble() ? R.track.bad : ''),
      act: () => (!h.editing() && !made() ? resume() : h.trouble() ? forMe() : null),
    }),
    // (une étape à lire : la vue suit le train, le joueur le regarde partir avant de finir)
    step('railTrain', R.train, {
      read: true,
      begin: () => { pinned(null); h.follow(); },
      check: () => [!!h.train()?.running],
      anchor: () => null,
      note: () => { const t = h.train(); return t?.why ? t.why : t?.running ? R.train.done : ''; },
      act: () => (h.train() && !h.train()!.why && !h.following() ? { label: R.follow, run: () => h.follow() } : null),
    }),
  ];
  return { title: () => R.title, steps, live: () => h.age() >= 3, away: () => h.away() };
}
