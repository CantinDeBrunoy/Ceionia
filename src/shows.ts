import * as THREE from 'three';
import type { World } from './world/world';
import type { Agents } from './sim/agents';
import type { BuildingView } from './render/buildings';
import type { AudioEngine } from './audio/audio';
import { sizeOf, type Building } from './build/catalog';
import { FRONT } from './build/placement';
import { archipelagoOn } from './sim/diplomacy';
import {
  SHOWS, showFor, showBlock, showStarted, showReward, showJoyFor, showRoom, showScale, showWait, planMatch, matchK, type ShowDef,
} from './sim/shows';
import { teamColors, footSpots, type Kit, type ShowView } from './render/shows/common';
import { MatchView } from './render/shows/football';
import { tr } from './i18n';

/** Ce que les spectacles demandent au jeu */
export interface ShowHost {
  world: World;
  agents: Agents;
  buildings: BuildingView;
  audio: AudioEngine;
  camera: THREE.Camera;
  /** la population et le logement (de nouveaux habitants arrivent après la fête) */
  sim: { pop: number; housing: { cap: number } };
  dayLen(): number;
  /** il pleut fort (les habitants s'abritent) */
  raining(): boolean;
  /** le joueur n'est pas au village (Enfers, commandement de l'île) */
  away(): boolean;
  toast(msg: string, act?: () => void): void;
  banner(title: string, sub: string): void;
  /** mène la vue au point */
  goTo(x: number, z: number, dist: number): void;
}

/** Ce que la scène en cours donne au directeur : le tableau d'affichage, et le résultat à la fin */
interface Act {
  view: ShowView;
  /** le texte du tableau au-dessus du bâtiment (HTML), ou rien */
  board(): string;
  /** le résultat : le bien-être ×k, le titre de la bannière, les nouveaux habitants (s'il en vient), un record */
  result(): { k: number; title: string; newcomers: boolean; line?: string };
}

interface Run { def: ShowDef; b: Building; act: Act; fans: number[]; hidden: Set<number>; t: number; door: [number, number] }

/** Les supporters marchent jusqu'à l'entrée au plus tant de secondes de jeu, puis ceux qui restent entrent quand même */
const GATHER_MAX = 14;
/** les barres du haut, sous lesquelles reste le tableau d'affichage */
const HUD_BARS = ['#agePanel', '#resPanel', '#needsBox', '#timePanel'];

/**
 * Le directeur des spectacles : un seul à la fois au village. Il enrôle les habitants qui viennent en spectateurs (ils marchent
 * de chez eux jusqu'à l'entrée et y entrent), pose la scène sur le bâtiment (`render/shows/`), tient le tableau d'affichage
 * au-dessus, et à la fin donne la récompense, l'annonce, et renvoie chacun chez soi
 */
export class ShowDirector {
  run: Run | null = null;
  private board: HTMLDivElement | null = null;
  private v = new THREE.Vector3();
  private hudBottom = 0;
  private hudT = 0;

  constructor(private h: ShowHost) {}

  /** Ce qui empêche de lancer le geste de ce bâtiment maintenant (texte), ou null */
  blocked(b: Building) {
    const d = showFor(b);
    if (!d) return tr('Rien à lancer ici');
    const w = this.h.world;
    return showBlock(w.shows, d, w.exp.clock, this.h.dayLen(), { running: !!this.run, raining: this.h.raining(), away: this.h.away() });
  }

  /** Lance le geste de ce bâtiment ; le texte de ce qui l'empêche, ou null si c'est parti */
  launch(b: Building): string | null {
    const why = this.blocked(b);
    if (why) return why;
    const d = showFor(b)!, w = this.h.world, h = this.h;
    const g = h.buildings.entries.get(b.id)?.group;
    if (!g) return tr('Rien à lancer ici');
    const seed = (Math.floor(w.exp.clock * 13) ^ (b.id * 2654435761)) >>> 0;
    const cols = teamColors(w.blason);
    const kit: Kit = { age: b.age, seed, scale: showScale(b), ...cols, spots: [] };
    const act = this.stage(d, b, kit);
    g.add(act.view.group);
    // les spectateurs viennent de chez eux jusqu'à l'entrée
    const s = sizeOf(b), f = FRONT[b.rot], cx = b.x + s / 2, cz = b.z + s / 2;
    const door: [number, number] = [cx + f[0] * (s / 2 + 0.4), cz + f[1] * (s / 2 + 0.4)];
    const n = Math.min(d.fans, h.agents.available());
    const fans = n > 0 ? h.agents.recruit(n) ?? [] : [];
    if (fans.length) h.agents.partyGo(fans, door[0], door[1], 0.45);
    this.run = { def: d, b, act, fans, hidden: new Set(), t: 0, door };
    showStarted(w.shows, d, w.exp.clock, h.dayLen());
    h.goTo(cx, cz, s >= 3 ? 6.5 : 5);
    h.audio.sfxClick();
    return null;
  }

  /** La scène du geste, et comment la lire */
  private stage(d: ShowDef, b: Building, kit: Kit): Act {
    const a = this.h.audio, w = this.h.world;
    if (d.id === 'match') {
      kit.spots = footSpots(b.age);
      const plan = planMatch(rng(kit.seed));
      const home = w.isleName, away = tr(AWAY_TEAMS[kit.seed % AWAY_TEAMS.length]);
      const view = new MatchView(plan, kit, {
        whistle: (long) => a.sfxWhistle(long),
        kick: (k) => a.sfxKick(k),
        roar: (k) => a.sfxCrowd(k),
        goal: (side) => this.h.toast(side === 0 ? tr('⚽ But pour {team} !', { team: home }) : tr('⚽ But pour {team}', { team: away })),
      });
      const chip = (c: number) => `<i style="background:#${c.toString(16).padStart(6, '0')}"></i>`;
      return {
        view,
        board: () => `${chip(kit.home)}<b>${esc(home)}</b><span class="sc">${view.score[0]} – ${view.score[1]}</span><b>${esc(away)}</b>${chip(kit.away)}<small>${view.phase === 'enter' ? tr('Entrée des équipes') : view.phase === 'half' ? tr('Mi-temps') : view.phase === 'end' ? tr('Fin du match') : `${view.minute}′`}</small>`,
        result: () => {
          const [x, y] = view.score;
          return { k: matchK(view.score), newcomers: x > y, title: x > y ? tr('Victoire {a} – {b} !', { a: x, b: y }) : x === y ? tr('Match nul {a} – {b}', { a: x, b: y }) : tr('Défaite {a} – {b}', { a: x, b: y }) };
        },
      };
    }
    throw new Error(`spectacle inconnu : ${d.id}`);
  }

  /** À chaque image : `dt` en secondes de jeu (rien n'avance en pause) */
  update(dt: number) {
    const r = this.run;
    if (!r) { this.showBoard(null); return; }
    const h = this.h, ag = h.agents;
    // le bâtiment démoli en plein spectacle : on rentre, sans récompense
    if (!h.world.buildings.has(r.b.id)) { this.stop(); return; }
    r.t += dt;
    this.hudT -= 1 / 60;
    // les spectateurs entrent à mesure qu'ils arrivent (ceux qui traînent entrent au bout d'un moment)
    for (const id of r.fans) if (!r.hidden.has(id) && (ag.memberDone(id) || r.t > GATHER_MAX)) { ag.partyHide([id], true); r.hidden.add(id); }
    r.act.view.update(dt);
    this.showBoard(r);
    if (r.act.view.done) this.finish();
  }

  /** La fin : la récompense, l'annonce, et chacun rentre chez soi */
  private finish() {
    const r = this.run!, h = this.h, w = h.world, d = r.def, res = r.act.result();
    const n = showJoyFor(d, r.b, res.k);
    showReward(w.shows, d, n, w.exp.clock, h.dayLen());
    const parts = [tr('+{n} bien-être pendant {d}', { n, d: d.joyDays === 1 ? tr('un jour') : d.joyDays === 1.5 ? tr('un jour et demi') : tr('{n} jours', { n: d.joyDays }) })];
    if (res.newcomers && d.newcomers) {
      const k = showRoom(d.newcomers, h.sim.pop, h.sim.housing.cap);
      if (k > 0) { h.sim.pop += k; parts.push(k === 1 ? tr('un nouvel habitant attiré par la fête') : tr('{n} nouveaux habitants attirés par la fête', { n: k })); }
    }
    if (d.id === 'match' && archipelagoOn(w)) { const g = 2 + Math.floor(r.fans.length / 3); w.gold += g; parts.push(tr('recette : {n} or', { n: g })); }
    if (res.line) parts.push(res.line);
    h.banner(`${d.icon} ${res.title}`, parts.join(' · '));
    this.stop();
  }

  /** Arrête le spectacle (fini, ou bâtiment démoli) : la scène disparaît, les spectateurs ressortent et rentrent */
  stop() {
    const r = this.run;
    if (!r) return;
    const ag = this.h.agents;
    r.act.view.group.removeFromParent();
    r.act.view.dispose();
    if (r.fans.length) { ag.partyHide(r.fans, false); ag.partyPlace(r.fans, r.door[0], r.door[1]); ag.dismiss(r.fans); }
    this.run = null;
    this.showBoard(null);
  }

  /** La vue va au spectacle en cours (bouton « Voir le spectacle ») */
  goSee() {
    const b = this.run?.b;
    if (!b) return;
    const s = sizeOf(b);
    this.h.goTo(b.x + s / 2, b.z + s / 2, s >= 3 ? 6.5 : 5);
  }

  /** Le geste de ce bâtiment pour sa fiche : son texte, s'il a lieu en ce moment, ce qui l'empêche, le temps d'attente */
  status(b: Building) {
    const d = showFor(b);
    if (!d) return null;
    const here = this.run?.b.id === b.id, w = this.h.world;
    return { def: d, here, why: here ? null : this.blocked(b), wait: showWait(w.shows, d.id, w.exp.clock) };
  }

  /** Le tableau d'affichage, au-dessus du bâtiment, suivi à l'écran */
  private showBoard(r: Run | null) {
    const html = r?.act.board() ?? '';
    if (!html) { if (this.board) this.board.style.display = 'none'; return; }
    if (!this.board) {
      this.board = document.createElement('div');
      this.board.className = 'showBoard';
      (document.getElementById('ui') ?? document.body).appendChild(this.board);
    }
    const b = r!.b, s = sizeOf(b), p = this.v.set(b.x + s / 2, this.h.world.surfaceAt(b.x + s / 2, b.z + s / 2) + (s >= 3 ? 1.25 : 0.9), b.z + s / 2).project(this.h.camera);
    const el = this.board;
    if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) { el.style.display = 'none'; return; }
    el.style.display = '';
    if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
    el.style.left = `${((p.x + 1) / 2) * innerWidth}px`;
    // (toujours en dessous des barres du haut : vue de près, le haut du stade sort de l'écran ; leur bas, relu chaque seconde)
    if (this.hudT <= 0) { this.hudT = 1; this.hudBottom = Math.max(0, ...HUD_BARS.map((q) => document.querySelector(q)?.getBoundingClientRect().bottom ?? 0)); }
    el.style.top = `${Math.max(this.hudBottom + 8 + el.offsetHeight, ((1 - p.y) / 2) * innerHeight)}px`;
  }
}

/** Les équipes qui viennent jouer au village */
const AWAY_TEAMS = ['Racing des Collines', 'Union du Fleuve', 'Olympique des Marais', 'Étoile du Nord', 'Sporting des Falaises', 'Athletic de la Plaine'];

const rng = (seed: number) => { let s = (seed % 2147483646) + 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export { SHOWS };
