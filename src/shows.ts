import * as THREE from 'three';
import type { World } from './world/world';
import type { Agents } from './sim/agents';
import type { BuildingView } from './render/buildings';
import type { AudioEngine } from './audio/audio';
import { sizeOf, type Building } from './build/catalog';
import { FRONT } from './build/placement';
import { archipelagoOn } from './sim/diplomacy';
import {
  SHOWS, showFor, showBlock, showStarted, showReward, showJoyFor, showRoom, showScale, showWait, planMatch, matchK,
  planRace, raceRecord, planTourney, showGold, type ShowDef,
} from './sim/shows';
import { teamColors, footSpots, trackSpots, type Kit, type ShowView } from './render/shows/common';
import { MatchView } from './render/shows/football';
import { RaceView } from './render/shows/race';
import { FireworksView } from './render/shows/fireworks';
import { FeastView } from './render/shows/feast';
import { RiteView } from './render/shows/rite';
import { PlayView } from './render/shows/play';
import { TourneyView } from './render/shows/tourney';
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
  /** baisse la vue jusqu'à cette inclinaison (radians au-dessus de l'horizon), si elle est plus haute */
  tilt(pitch: number): void;
  /** la fête du village sur cette place (festivities.ts : le feu, la ronde, le festin, les fusées selon l'âge) */
  feast(b: Building): void;
}

/** Ce que la scène en cours donne au directeur : le tableau d'affichage, et le résultat à la fin */
interface Act {
  view: ShowView;
  /** le texte du tableau au-dessus du bâtiment (HTML), ou rien */
  board(): string;
  /** le résultat : le bien-être ×k, le titre de la bannière, les nouveaux habitants (s'il en vient), un record */
  result(): { k: number; title: string; newcomers: boolean; line?: string };
}

interface Run {
  def: ShowDef; b: Building; act: Act; fans: number[]; hidden: Set<number>; t: number; door: [number, number];
  /** les spectateurs sont tous là (la scène l'a su) ; ils sont ressortis (le théâtre) ; l'attente avant le prochain qui entre */
  ready: boolean; out: boolean; inT: number;
}

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
    // (le bâtiment est posé à la hauteur de sa parcelle ; devant sa façade, le terrain peut monter ou descendre)
    const ground = (x: number, z: number) => {
      const gg = h.buildings.entries.get(b.id)?.group ?? g;
      gg.updateMatrixWorld();
      const p = new THREE.Vector3(x, 0, z).applyMatrix4(gg.matrixWorld);
      return Math.min(0.6, Math.max(-0.1, (w.surfaceAt(p.x, p.z) - p.y) / (gg.scale.y || 1)));
    };
    const kit: Kit = { age: b.age, seed, scale: showScale(b), ...cols, spots: [], ground };
    const act = this.stage(d, b, kit);
    g.add(act.view.group);
    // les spectateurs viennent de chez eux jusqu'à l'entrée
    const s = sizeOf(b), f = FRONT[b.rot], cx = b.x + s / 2, cz = b.z + s / 2;
    const door: [number, number] = [cx + f[0] * (s / 2 + 0.4), cz + f[1] * (s / 2 + 0.4)];
    const n = Math.min(d.fans, h.agents.available());
    const fans = n > 0 ? h.agents.recruit(n) ?? [] : [];
    if (fans.length) {
      h.agents.partyGo(fans, door[0], door[1], 0.45);
      // pour un spectacle qui se regarde de dehors : chacun sa place, en arc devant le bâtiment (ou tout autour), tourné vers lui
      if (d.watch) this.ring(fans, b, d.watch.r, d.watch.arc);
      // au théâtre : la queue devant l'entrée, en file qui part de la porte
      if (d.queue) fans.forEach((id, i) => {
        const k = 0.15 + i * 0.2, side = (i % 2 ? 1 : -1) * 0.06, r = RIGHT_OF(f);
        const x = door[0] + f[0] * k + r[0] * side, z = door[1] + f[1] * k + r[1] * side;
        h.agents.memberGo(id, x, z, Math.atan2(-f[0], -f[1]));
      });
    }
    // l'arène se dessine sans ses combattants : la scène a les siens
    if (d.bare) { h.buildings.bare.add(b.id); h.buildings.refresh(b); }
    this.run = { def: d, b, act, fans, hidden: new Set(), t: 0, door, ready: false, out: false, inT: 0 };
    showStarted(w.shows, d, w.exp.clock, h.dayLen());
    this.frame(d, b);
    h.audio.sfxClick();
    return null;
  }

  /** Les spectateurs à leur place, en arc devant le bâtiment (à `r` cases de son bord, sur `arc` radians), tournés vers lui */
  private ring(fans: number[], b: Building, r0: number, arc: number) {
    const s = sizeOf(b), f = FRONT[b.rot], cx = b.x + s / 2, cz = b.z + s / 2, full = arc >= Math.PI * 1.9;
    fans.forEach((id, i) => {
      const a = Math.atan2(f[1], f[0]) + (full ? (i / fans.length) * Math.PI * 2 : ((i + 0.5) / fans.length - 0.5) * arc), r = s / 2 + r0 + (i % 2) * 0.35;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      this.h.agents.memberGo(id, x, z, Math.atan2(cx - x, cz - z));
    });
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
        board: () => `${chip(kit.home)}<b class="tm">${esc(home)}</b><span class="sc">${view.score[0]} – ${view.score[1]}</span><b class="tm">${esc(away)}</b>${chip(kit.away)}<small>${view.phase === 'enter' ? tr('Entrée des équipes') : view.phase === 'half' ? tr('Mi-temps') : view.phase === 'end' ? tr('Fin du match') : `${view.minute}′`}</small>`,
        result: () => {
          const [x, y] = view.score;
          return { k: matchK(view.score), newcomers: x > y, title: x > y ? tr('Victoire {a} – {b} !', { a: x, b: y }) : x === y ? tr('Match nul {a} – {b}', { a: x, b: y }) : tr('Défaite {a} – {b}', { a: x, b: y }) };
        },
      };
    }
    if (d.id === 'race') {
      const big = sizeOf(b) >= 3;
      // (le plan réduit d'un ancien stade a sa propre piste : pas d'échelle)
      kit.spots = trackSpots(big);
      kit.scale = 1;
      const times = planRace(rng(kit.seed));
      const view = new RaceView(times, big, kit, { gun: () => a.sfxClash('shot'), roar: (k) => a.sfxCrowd(k), whistle: () => a.sfxWhistle(false) });
      return {
        view,
        board: () => view.board(),
        result: () => {
          const best = Math.min(...times), rec = raceRecord(w.shows, best), old = w.shows.record, win = view.winner();
          if (rec) w.shows.record = best;
          return {
            k: rec ? 2 : 1, newcomers: false,
            title: rec ? tr('Record du village : {name} en {t} s !', { name: win.name, t: secs(best) }) : tr('{name} gagne en {t} s', { name: win.name, t: secs(best) }),
            line: rec && old ? tr('l’ancien record était de {t} s', { t: secs(old) }) : !rec && old ? tr('record du village : {t} s', { t: secs(old) }) : undefined,
          };
        },
      };
    }
    if (d.id === 'fireworks') {
      const view = new FireworksView(kit, { bang: (k) => a.sfxBang(k), whistle: () => a.sfxRocket(), roar: (k) => a.sfxCrowd(k) });
      return { view, board: () => view.board(), result: () => ({ k: 1, newcomers: true, title: tr('Quel feu d’artifice !') }) };
    }
    if (d.id === 'feast') {
      const view = new FeastView(b.age, { start: () => this.h.feast(b), roar: (k) => a.sfxCrowd(k) });
      return { view, board: () => view.board(), result: () => ({ k: 1, newcomers: true, title: tr('Belle fête au village !') }) };
    }
    if (d.id === 'rite') {
      const view = new RiteView(b.age, kit.seed, { chant: (n) => a.sfxChant(n), bell: (k) => a.sfxBell(k), roar: (k) => a.sfxCrowd(k) }, kit.ground);
      return {
        view, board: () => view.board(),
        result: () => ({ k: 1, newcomers: false, title: tr('Une belle fête au temple'), line: view.offered ? tr('{n} offrandes déposées', { n: view.offered }) : undefined }),
      };
    }
    if (d.id === 'play') {
      const view = new PlayView(b.age, kit.seed, { bell: () => a.sfxBell(0.7), applause: (k) => a.sfxApplause(k), roar: (k) => a.sfxCrowd(k), music: () => a.sfxFeast() }, kit.ground);
      return { view, board: () => view.board(), result: () => ({ k: 1, newcomers: false, title: tr('« {title} » : un triomphe !', { title: view.title }) }) };
    }
    if (d.id === 'tourney') {
      const plan = planTourney(rng(kit.seed));
      const view = new TourneyView(b.age, plan.rounds, kit, {
        hit: (k) => { if (k === 'fist') a.sfxKick(0.9); else { a.sfxClash('blade'); if (k === 'joust') a.sfxKick(1); } },
        bell: () => a.sfxBell(0.8),
        roar: (k) => a.sfxCrowd(k),
      });
      return { view, board: () => view.board(), result: () => ({ k: 1, newcomers: false, title: tr('{name} remporte le tournoi !', { name: view.winner() }) }) };
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
    this.crowd(r, dt);
    // le bâtiment peut être refait (passage d'âge, saison) : la scène suit son nouveau groupe, comme les bêtes du zoo
    const g = h.buildings.entries.get(r.b.id)?.group;
    if (g && r.act.view.group.parent !== g) g.add(r.act.view.group);
    // le cœur du feu d'artifice se tourne vers la caméra (son œil, dans le repère du bâtiment)
    if (g && r.act.view instanceof FireworksView) { g.updateMatrixWorld(); r.act.view.eye.copy(h.camera.position); g.worldToLocal(r.act.view.eye); }
    r.act.view.update(dt);
    this.showBoard(r);
    if (r.act.view.done) this.finish();
  }

  /**
   * Les spectateurs : ceux qui regardent de dehors font leur geste en arrivant (lever les bras, s'agenouiller) et la scène le
   * sait (l'offrande du temple) ; au théâtre, ils attendent en file puis entrent un à un quand la scène ouvre les portes, et
   * ressortent à la fin devant la façade ; ailleurs, ils entrent à mesure qu'ils arrivent (ceux qui traînent, au bout d'un
   * moment). (`r.hidden` : ceux dont on s'est occupé, entrés ou arrivés à leur place)
   */
  private crowd(r: Run, dt: number) {
    const ag = this.h.agents, v = r.act.view, d = r.def;
    if (!r.ready && (r.t > GATHER_MAX || r.fans.every((id) => ag.memberDone(id)))) { r.ready = true; v.ready?.(); }
    if (d.watch) {
      r.fans.forEach((id, i) => { if (!r.hidden.has(id) && ag.memberDone(id)) { ag.partyAct([id], d.watch!.act); r.hidden.add(id); v.arrived?.(i); } });
      return;
    }
    if (d.queue) {
      const st = v.crowd ?? 'wait';
      if (st === 'in' || st === 'show') {
        // un à un, de la tête de la file ; tous les autres d'un coup quand le spectacle commence
        r.inT -= dt;
        for (const id of r.fans) if (!r.hidden.has(id) && (st === 'show' || (r.inT <= 0 && ag.memberDone(id)))) { ag.partyHide([id], true); r.hidden.add(id); r.inT = 0.45; if (st === 'in') break; }
      } else if (st === 'out' && !r.out) {
        // ils ressortent par l'entrée, se tiennent en arc devant la façade et applaudissent
        r.out = true;
        ag.partyHide(r.fans, false); ag.partyPlace(r.fans, r.door[0], r.door[1]);
        this.ring(r.fans, r.b, 0.7, 1.8);
        r.hidden.clear();
      }
      if (r.out) for (const id of r.fans) if (!r.hidden.has(id) && ag.memberDone(id)) { ag.partyAct([id], 'cheer'); r.hidden.add(id); }
      return;
    }
    for (const id of r.fans) if (!r.hidden.has(id) && (ag.memberDone(id) || r.t > GATHER_MAX)) { ag.partyHide([id], true); r.hidden.add(id); }
  }

  /** La fin : la récompense, l'annonce, et chacun rentre chez soi */
  private finish() {
    const r = this.run!, h = this.h, w = h.world, d = r.def, res = r.act.result();
    const n = showJoyFor(d, r.b, res.k);
    showReward(w.shows, d, n, w.exp.clock, h.dayLen());
    const days = d.joyDays === 1 ? tr('un jour') : d.joyDays === 1.5 ? tr('un jour et demi') : tr('{n} jours', { n: d.joyDays });
    const parts = [d.need === 'health' ? tr('+{n} soins pendant {d}', { n, d: days }) : tr('+{n} bien-être pendant {d}', { n, d: days })];
    if (res.newcomers && d.newcomers) {
      const k = showRoom(d.newcomers, h.sim.pop, h.sim.housing.cap);
      if (k > 0) { h.sim.pop += k; parts.push(k === 1 ? tr('un nouvel habitant attiré par la fête') : tr('{n} nouveaux habitants attirés par la fête', { n: k })); }
    }
    const g = archipelagoOn(w) ? showGold(d.id, r.b.age, r.fans.length) : 0;
    if (g > 0) { w.gold += g; parts.push(tr('recette : {n} or', { n: g })); }
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
    if (r.def.bare) { this.h.buildings.bare.delete(r.b.id); if (this.h.world.buildings.has(r.b.id)) this.h.buildings.refresh(r.b); }
    if (r.fans.length) {
      if (!r.def.watch && !r.out) { ag.partyHide(r.fans, false); ag.partyPlace(r.fans, r.door[0], r.door[1]); }
      ag.dismiss(r.fans);
    }
    this.run = null;
    this.showBoard(null);
  }

  /** La vue va au spectacle en cours (bouton « Voir le spectacle ») */
  goSee() {
    const b = this.run?.b;
    if (!b) return;
    this.frame(this.run!.def, b);
  }

  /**
   * La vue sur le spectacle : le bâtiment au milieu de l'écran ; pour un feu d'artifice, de plus loin, plus rasante, et visée
   * un peu au-delà du parc dans le sens du regard : il faut voir le ciel au-dessus, et le parc en bas de l'écran
   */
  private frame(d: ShowDef, b: Building) {
    const s = sizeOf(b), cx = b.x + s / 2, cz = b.z + s / 2;
    // (devant le temple et le théâtre, la vue vise un peu en avant de la façade : c'est là que tout se passe)
    const f = FRONT[b.rot], ahead = d.queue || (d.watch && d.watch.arc < 6) ? s * 0.3 : 0;
    if (!d.sky) { this.h.goTo(cx + f[0] * ahead, cz + f[1] * ahead, s >= 3 ? 6.5 : 5); return; }
    const v = this.h.camera.getWorldDirection(this.v), L = Math.hypot(v.x, v.z) || 1;
    this.h.goTo(cx + (v.x / L) * 3.2, cz + (v.z / L) * 3.2, 13);
    this.h.tilt(0.42);
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

/** la droite de la façade (perpendiculaire au sens `f` de l'entrée) */
const RIGHT_OF = (f: readonly number[]): [number, number] => [-f[1], f[0]];
const rng = (seed: number) => { let s = (seed % 2147483646) + 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
/** « 46,12 » : un temps au centième, à la virgule française */
const secs = (t: number) => t.toFixed(2).replace('.', tr(','));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export { SHOWS };
