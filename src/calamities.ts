import * as THREE from 'three';
import { World, N, VEG_FIELD } from './world/world';
import type { GameTime } from './core/time';
import type { Environment } from './render/env';
import { rulesOf } from './sim/difficulty';
import { hasPerk, SAT_CALAM_WARN } from './sim/legacy';
import { CALAMITIES, CalamityKind, FloodSite, REPAIR_DAYS, QUAKE_R, STAR_ORE, STAR_PERK, floodSite, harmOf, impacts, nameOf, planAge, quakeCenter, quakeVictims, rockfalls, ruinedFields } from './sim/calamity';
import { FloodView } from './render/flood';
import { RepairsView } from './render/repairs';
import { QuakeView } from './render/quake';
import { MeteorView, FALL } from './render/meteors';
import { sizeOf, type Building } from './build/catalog';
import type { AudioEngine } from './audio/audio';
import { tr, nplural } from './i18n';
import { peacePerks, AID_REPAIR } from './sim/concession';

/** Ce que les catastrophes demandent au jeu */
export interface CalamityHost {
  world: World;
  time: GameTime;
  env: Environment;
  audio: AudioEngine;
  /** l'âge du village */
  age(): number;
  /** un message ; `act` : ce que fait un clic dessus */
  toast(msg: string, act?: () => void, level?: 'info' | 'danger'): void;
  /** mène la vue au point (à la demande du joueur : un clic sur un message) */
  goTo(x: number, z: number, dist: number): void;
  /** relève la vue vers le ciel (à la demande du joueur) */
  lookUp(): void;
  /** une nuit d'étoiles filantes, pour accompagner les bolides */
  shower(): void;
  /** met le feu à ce bâtiment (`Game.ignite` : il ne prend pas si les catastrophes sont coupées) */
  ignite(id: number): void;
  /** le village a un observatoire : les astronomes annoncent la pluie de météorites au soir */
  astronomers(): boolean;
}

/** La crue, d'étape en étape (secondes de jeu) : l'averse qui dure, l'annonce, la montée, l'eau qui reste, le retrait */
const FLOOD_RAIN = 15, FLOOD_WARN = 20, FLOOD_RISE = 15, FLOOD_HOLD = 60, FLOOD_EBB = 30;
/** Une crue qui attend sa pluie depuis tant de jours (joueur qui impose le beau temps) cède la place à une autre catastrophe */
const WAIT_DAYS = 3;
/** Le séisme : les bêtes s'agitent tant de secondes avant, la terre tremble tant de secondes, les dégâts au bout de tant */
const QUAKE_WARN = 8, QUAKE_SHAKE = 10, QUAKE_HIT = 2.5;
/** La pluie de météorites : la nuit noire qu'elle attend, l'annonce, l'écart entre deux bolides, le calme après le dernier */
const METEOR_NIGHT = 0.85, METEOR_WARN = 6, METEOR_GAP: [number, number] = [5, 11], METEOR_AFTER = 8;

type FloodPhase = 'rain' | 'warn' | 'rise' | 'hold' | 'ebb';
interface Shower { t: number; plan: { at: number; x: number; z: number; hit: number | null; iron: boolean; done: boolean }[]; fires: number; irons: number; trees: boolean }
interface Quake { x: number; z: number; t: number; shaking: boolean; hit: boolean; hurt: number; falls: number }
interface Flood { site: FloodSite; phase: FloodPhase; t: number; told: boolean; drowned: number; ruined: number; hurt: number }

export interface Incident { key: string; icon: string; title: string; status: string; progress: number; x: number; z: number }

/**
 * Les catastrophes naturelles en jeu : leur programme (une au plus par âge, voir `sim/calamity.ts`), leur annonce, leur mise
 * en scène, leurs dégâts et leur compte rendu ; les réparations des bâtiments abîmés. La vue n'est jamais arrachée au joueur :
 * un message cliquable et une carte d'incident (l'œil) mènent sur place
 */
export class Calamities {
  group = new THREE.Group();
  /** catastrophes que le joueur laisse venir (réglages ; absentes des anciens réglages : toutes) */
  enabled: Record<CalamityKind, boolean> = { flood: true, quake: true, meteor: true };
  floodView: FloodView;
  repairs: RepairsView;
  quakeView: QuakeView;
  meteorView: MeteorView;
  /** la catastrophe tirée, qui attend son heure (la pluie pour la crue, la nuit pour les météorites) */
  private pending: CalamityKind | null = null;
  private waited = 0;
  private flood: Flood | null = null;
  private quake: Quake | null = null;
  private shower: Shower | null = null;
  /** les astronomes ont annoncé la pluie de cette nuit */
  private foretold = false;

  constructor(private h: CalamityHost) {
    this.floodView = new FloodView(h.world);
    this.repairs = new RepairsView(h.world);
    this.quakeView = new QuakeView(h.world);
    this.meteorView = new MeteorView(h.world);
    this.group.add(this.floodView.group, this.repairs.group, this.quakeView.group, this.meteorView.group);
  }

  /** Une catastrophe en cours (annonce comprise) */
  get busy() { return !!this.flood || !!this.quake || !!this.shower; }

  /** `gdt` : temps de jeu (tout se fige en pause) ; `dt` : temps réel (houle, poussière) */
  update(gdt: number, dt: number) {
    this.repair(gdt);
    this.schedule(gdt);
    this.stepFlood(gdt, dt);
    this.stepQuake(gdt);
    this.quakeView.update(gdt, dt);
    this.stepShower(gdt);
    this.meteorView.update(gdt, dt, this.h.world.starIron);
    this.repairs.update(dt);
  }

  /** Les réparations avancent ; un bâtiment réparé donne de nouveau tout */
  private repair(gdt: number) {
    const w = this.h.world;
    for (const [id, d] of w.damaged) {
      d.t -= gdt;
      if (d.t > 0) continue;
      w.damaged.delete(id);
      w.ageVersion++;
      const b = w.buildings.get(id);
      if (b) this.h.toast(tr('🔨 Réparations terminées : {b}', { b: nameOf(b) }), undefined, 'info');
    }
  }

  /** Abîme un bâtiment : il ne donne que la moitié pendant une journée de réparations */
  damage(id: number) {
    const w = this.h.world, b = w.buildings.get(id);
    if (!b || w.damaged.has(id)) return false;
    // (le dispensaire de la concession : l'allié envoie de l'aide, les réparations vont deux fois plus vite)
    const T = this.h.time.dayLen * REPAIR_DAYS * (peacePerks(w, { dispensary: [...w.buildings.values()].some((x) => x.kind === 'dispensary') ? 1 : 0 }).aid ? AID_REPAIR : 1);
    w.damaged.set(id, { t: T, T });
    w.ageVersion++;
    const s = sizeOf(b);
    this.repairs.burst(b.x + s / 2, b.z + s / 2, s);
    return true;
  }

  /** Le programme : un sort tiré à chaque âge ; le jour venu, une des catastrophes laissées par le joueur */
  private schedule(gdt: number) {
    const w = this.h.world, age = this.h.age();
    if (!w.calam || w.calam.age !== age) w.calam = { age, due: planAge(rulesOf(w.difficulty).calamity.chance, this.h.time.dayLen) };
    if (!w.disasters || this.busy) return;
    if (!this.pending) {
      if (w.calam.due < 0) return;
      w.calam.due = Math.max(0, w.calam.due - gdt);
      if (w.calam.due > 0) return;
      const kinds = CALAMITIES.filter((k) => this.enabled[k] && this.can(k));
      if (!kinds.length) return;
      this.pending = kinds[Math.floor(Math.random() * kinds.length)];
      this.waited = 0;
    }
    // la catastrophe tirée a été coupée entre-temps : on en tirera une autre
    if (!this.enabled[this.pending]) { this.pending = null; return; }
    this.waited += gdt;
    if (this.waited > this.h.time.dayLen * WAIT_DAYS) { this.pending = null; return; }
    if (this.time(this.pending)) this.start(this.pending);
  }

  /** La catastrophe peut-elle avoir lieu sur cette carte (une eau qui déborde pour la crue) */
  private can(k: CalamityKind) {
    if (k === 'flood') return !!floodSite(this.h.world);
    return k === 'quake' || k === 'meteor';
  }

  /** Son heure est venue : la crue après une bonne averse (on la fait venir, sauf l'hiver ou si le joueur impose le temps) */
  private time(k: CalamityKind) {
    const env = this.h.env;
    if (k === 'flood') {
      if (this.h.time.season === 3) return false;
      if (!env.manualWeather) env.wantKind = 'rain';
      return env.weatherKind === 'rain' && env.rainK > 0.75;
    }
    if (k === 'meteor') {
      // au soir, les astronomes l'annoncent (s'il y a un observatoire) ; elle vient en pleine nuit
      const hr = this.h.time.hour;
      if (!this.foretold && hr >= 17.5 && hr < 21 && (this.h.astronomers() || this.sat)) {
        this.foretold = true;
        this.h.toast(this.h.astronomers() ? tr('🔭 Les astronomes annoncent une pluie de météorites pour cette nuit.') : tr('🛰️ Les satellites annoncent une pluie de météorites pour cette nuit.'), undefined, 'info');
      }
      return env.night > METEOR_NIGHT;
    }
    return k === 'quake';
  }

  /** Lance la catastrophe (`now` : en mode développeur, sans attendre la pluie) ; false si elle ne peut pas avoir lieu */
  start(k: CalamityKind, now = false) {
    if (this.busy) return false;
    if (k === 'flood') {
      const site = floodSite(this.h.world);
      if (!site) return false;
      this.flood = { site, phase: now ? 'warn' : 'rain', t: 0, told: false, drowned: 0, ruined: 0, hurt: 0 };
      if (now && !this.h.env.manualWeather) this.h.env.wantKind = 'rain';
    } else if (k === 'quake') {
      const [x, z] = quakeCenter(this.h.world);
      this.quake = { x, z, t: 0, shaking: false, hit: false, hurt: 0, falls: 0 };
      this.h.toast(this.sat ? tr('🛰️ Les satellites voient la terre se tendre : un séisme dans une demi-minute ! Cliquez ici pour voir.') : tr('🐾 Les bêtes s’agitent, les oiseaux s’envolent : la terre va trembler ! Cliquez ici pour voir.'), () => this.h.goTo(x, z, 34), 'danger');
    } else if (k === 'meteor') {
      const w = this.h.world, list = impacts(w, harmOf(w));
      if (!list.length) return false;
      let at = METEOR_WARN;
      const plan = list.map((i) => { const p = { ...i, at, done: false }; at += METEOR_GAP[0] + Math.random() * (METEOR_GAP[1] - METEOR_GAP[0]); return p; });
      this.shower = { t: 0, plan, fires: 0, irons: 0, trees: false };
      this.foretold = false;
      // un ciel dégagé pour le spectacle (sauf temps imposé par le joueur)
      if (!this.h.env.manualWeather) this.h.env.wantKind = 'clear';
      this.h.shower();
      this.h.toast(tr('☄️ Une pluie de météorites traverse le ciel ! Cliquez ici pour lever les yeux.'), () => this.h.lookUp(), 'danger');
    } else return false;
    this.pending = null;
    if (this.h.world.calam) this.h.world.calam.due = -1;
    return true;
  }

  /** La crue, étape par étape */
  private stepFlood(gdt: number, dt: number) {
    const f = this.flood, w = this.h.world;
    if (!f) { this.floodView.update(dt, 0); return; }
    const s = f.site, harm = harmOf(w);
    // l'averse continue tant que l'eau n'a pas commencé à baisser
    if (f.phase !== 'ebb' && !this.h.env.manualWeather) this.h.env.wantKind = 'rain';
    // catastrophes coupées en pleine crue : l'eau se retire tout de suite
    if (!w.disasters && f.phase !== 'ebb' && f.phase !== 'rain' && f.phase !== 'warn') { f.phase = 'ebb'; f.t = FLOOD_EBB * (1 - this.floodK(f)); }
    if (!w.disasters && (f.phase === 'rain' || f.phase === 'warn')) { this.flood = null; this.floodView.set(null); return; }
    f.t += gdt;
    const where = s.lake ? tr('le lac') : s.pond ? tr('l’étang') : tr('la rivière');
    const go = () => this.h.goTo(s.x, s.z, 30);
    if (f.phase === 'rain' && f.t >= FLOOD_RAIN) {
      f.phase = 'warn'; f.t = 0;
    }
    if (f.phase === 'warn' && !f.told) f.told = true, this.h.toast(this.sat ? tr('🛰️ Les satellites voient les eaux monter : {where} va déborder dans une minute ! Cliquez ici pour voir.', { where }) : tr('🌊 Les eaux montent : {where} va déborder ! Cliquez ici pour voir.', { where }), go, 'danger');
    if (f.phase === 'warn' && f.t >= this.floodWarn) {
      f.phase = 'rise'; f.t = 0;
      this.floodView.set(s);
      this.h.audio.sfxSplash(1);
      // les champs sous l'eau ne donnent plus rien (pas au bac à sable : le spectacle seul)
      // (les digues et tranchées de l'expédition « Le village sous le volcan » gardent les champs et les bâtiments au sec)
      if (harm !== 'none' && !this.dikes) { for (const k of s.cells) if (w.veg[k] === VEG_FIELD) { w.flooded[k] = 1; f.drowned++; } w.ageVersion++; }
    }
    if (f.phase === 'rise' && f.t >= FLOOD_RISE) {
      f.phase = 'hold'; f.t = 0;
      // les bâtiments de la berge sont abîmés (dégâts complets)
      if (harm === 'full' && !this.dikes) for (const id of s.buildings) if (this.damage(id)) f.hurt++;
    }
    if (f.phase === 'hold' && f.t >= FLOOD_HOLD) { f.phase = 'ebb'; f.t = 0; }
    if (f.phase === 'ebb' && f.t >= FLOOD_EBB) {
      // l'eau partie : un champ noyé sur trois est à resemer (dégâts complets)
      if (harm === 'full' && w.disasters && !this.dikes) for (const k of ruinedFields(w, s.cells)) {
        w.veg[k] = 0; f.ruined++;
        const x = k % N, z = Math.floor(k / N);
        w.markVeg(x, z, x, z);
      }
      if (f.ruined) { w.vegDirty = true; w.version++; }
      w.flooded.fill(0);
      w.ageVersion++;
      this.flood = null;
      this.floodView.set(null);
      this.h.toast(this.floodReport(f), go, f.ruined || f.hurt ? 'danger' : 'info');
      return;
    }
    if (f.phase !== 'rain' && f.phase !== 'warn') this.floodView.update(dt, this.floodK(f));
    else this.floodView.update(dt, 0);
  }

  /** Le séisme : les bêtes fuient, la terre tremble, la poussière monte, des rochers dévalent ; des bâtiments sont abîmés */
  private stepQuake(gdt: number) {
    const q = this.quake, w = this.h.world;
    if (!q) return;
    q.t += gdt;
    if (!q.shaking && q.t >= this.quakeWarn) {
      q.shaking = true;
      this.h.audio.sfxRumble(QUAKE_SHAKE);
      this.quakeView.crack(q.x, q.z);
    }
    if (!q.shaking) return;
    const s = q.t - this.quakeWarn;
    // de la poussière monte des bâtiments secoués
    for (const b of w.buildings.values()) {
      const sz = sizeOf(b), cx = b.x + sz / 2, cz = b.z + sz / 2;
      if (Math.hypot(cx - q.x, cz - q.z) < QUAKE_R * 1.4 && Math.random() < gdt * 2) this.quakeView.puff(cx, cz, sz);
    }
    if (!q.hit && s >= QUAKE_HIT) {
      q.hit = true;
      // les dégâts (complets seulement, et catastrophes toujours permises)
      if (harmOf(w) === 'full' && w.disasters) for (const id of quakeVictims(w, q.x, q.z)) if (this.damage(id)) q.hurt++;
      if (q.hurt) this.h.audio.sfxDestroy();
      for (const [x, z] of rockfalls(w, q.x, q.z)) { this.quakeView.rockfall(x, z); q.falls++; }
    }
    if (s >= QUAKE_SHAKE) {
      this.quake = null;
      const parts: string[] = [];
      if (q.hurt) parts.push(nplural(q.hurt, 'bâtiment abîmé', 'bâtiments abîmés'));
      if (q.falls) parts.push(nplural(q.falls, 'éboulement', 'éboulements'));
      const tip = q.hurt ? ' ' + tr('Les bâtiments des âges moderne et futuriste sont bâtis pour résister aux séismes.') : '';
      this.h.toast((parts.length ? tr('🌍 Le séisme est passé : {what}.', { what: parts.join(', ') }) : tr('🌍 Le séisme est passé sans dégâts.')) + tip, () => this.h.goTo(q.x, q.z, 34), q.hurt ? 'danger' : 'info');
    }
  }

  /** La pluie de météorites : chaque bolide part `FALL` secondes avant son impact ; cratère, feu ou fer céleste */
  private stepShower(gdt: number) {
    const m = this.shower, w = this.h.world;
    if (!m) return;
    m.t += gdt;
    for (const p of m.plan) {
      if (p.done || m.t < p.at - FALL) continue;
      p.done = true;
      this.meteorView.fall(p.x, p.z, () => {
        this.h.audio.sfxBang(1);
        if (w.clearTrees(p.x, p.z, 1.2)) m.trees = true;
        // sur un bâtiment : il prend feu (un incendie ordinaire, que les pompiers éteignent)
        if (p.hit !== null && w.buildings.has(p.hit)) { this.h.ignite(p.hit); m.fires++; }
        if (p.iron) { const k = Math.floor(p.z) * N + Math.floor(p.x); if (!w.starIron.includes(k)) { w.starIron.push(k); m.irons++; } }
      });
    }
    const last = m.plan[m.plan.length - 1].at;
    if (m.t >= last + METEOR_AFTER && !this.meteorView.busy) {
      this.shower = null;
      const parts = [nplural(m.plan.length, 'impact', 'impacts')];
      if (m.fires) parts.push(nplural(m.fires, 'incendie', 'incendies'));
      const iron = m.irons ? ' ' + tr('Un fer céleste luit au fond d’un cratère : cliquez dessus pour le ramasser.') : '';
      const at = m.plan.find((p) => p.iron) ?? m.plan[0];
      this.h.toast(tr('☄️ La pluie de météorites est passée : {what}.', { what: parts.join(', ') }) + iron, () => this.h.goTo(at.x, at.z, 22), m.fires ? 'danger' : 'info');
    }
  }

  /** Un fer céleste sous le pointeur (case du monde), ou -1 */
  ironAt(x: number, z: number) {
    for (const k of this.h.world.starIron) if (Math.hypot((k % N) + 0.5 - x, Math.floor(k / N) + 0.5 - z) < 0.8) return k;
    return -1;
  }

  /** Ramasse le fer céleste sous le pointeur : du minerai, et le premier rejoint les trophées de la place ; false s'il n'y en a pas */
  collect(x: number, z: number) {
    const w = this.h.world, k = this.ironAt(x, z);
    if (k < 0) return false;
    w.starIron = w.starIron.filter((c) => c !== k);
    w.ore += STAR_ORE;
    this.h.audio.sfxGoldBurst();
    const first = !w.exp.perks.includes(STAR_PERK);
    if (first) w.exp.perks.push(STAR_PERK);
    this.h.toast(tr('✨ Fer céleste ramassé : +{n} minerai.', { n: STAR_ORE }) + (first ? ' ' + tr('La pierre étoilée rejoint les trophées de la grande place.') : ''), undefined, 'info');
    return true;
  }

  /** Secousse ressentie au point visé (0 … 1) : monte vite, tient, s'apaise ; s'efface à 70 cases de l'épicentre */
  shakeAt(x: number, z: number) {
    const q = this.quake;
    if (!q || !q.shaking) return 0;
    const s = q.t - this.quakeWarn, env = Math.min(1, s) * (s > QUAKE_SHAKE - 3 ? Math.max(0, (QUAKE_SHAKE - s) / 3) : 1);
    return env * Math.max(0, 1 - Math.hypot(x - q.x, z - q.z) / 70);
  }

  /** Les bêtes fuient l'épicentre dès l'annonce (centre et rayon), null sans séisme */
  alarm(): { x: number; z: number; r: number } | null {
    return this.quake ? { x: this.quake.x, z: this.quake.z, r: 30 } : null;
  }

  /** Hauteur de l'eau de la crue (0 … 1) */
  private floodK(f: Flood) {
    const ease = (x: number) => x * x * (3 - 2 * x);
    if (f.phase === 'rise') return ease(Math.min(1, f.t / FLOOD_RISE));
    if (f.phase === 'hold') return 1;
    if (f.phase === 'ebb') return 1 - ease(Math.min(1, f.t / FLOOD_EBB));
    return 0;
  }

  /** Le compte rendu de la crue */
  /** Les savoir-faire des expéditions (`legacy.ts`) : les satellites annoncent plus tôt, les digues gardent le village au sec */
  private get sat() { return hasPerk(this.h.world, 'satellites'); }
  private get dikes() { return hasPerk(this.h.world, 'dikes'); }
  /** Secondes entre l'annonce et la montée des eaux, entre les bêtes qui s'agitent et la secousse (×3 avec les satellites) */
  private get floodWarn() { return FLOOD_WARN * (this.sat ? SAT_CALAM_WARN : 1); }
  private get quakeWarn() { return QUAKE_WARN * (this.sat ? SAT_CALAM_WARN : 1); }

  private floodReport(f: Flood) {
    const parts: string[] = [];
    if (f.drowned) parts.push(nplural(f.drowned, 'champ noyé', 'champs noyés'));
    if (f.ruined) parts.push(tr('{n} à resemer', { n: f.ruined }));
    if (f.hurt) parts.push(nplural(f.hurt, 'bâtiment abîmé', 'bâtiments abîmés'));
    const tip = f.ruined || f.hurt ? ' ' + tr('Un rempart le long de la berge, ou une berge relevée à l’outil de terrain, arrête l’eau.') : '';
    if (!parts.length && this.dikes) return tr('🌊 La crue s’est retirée : les digues ont tenu, rien n’est abîmé.');
    return parts.length ? tr('🌊 La crue s’est retirée : {what}.', { what: parts.join(', ') }) + tip : tr('🌊 La crue s’est retirée sans dégâts.');
  }

  /** Les catastrophes et réparations en cours, pour leurs cartes à gauche (l'œil y mène la vue) */
  incidents(): Incident[] {
    const out: Incident[] = [], w = this.h.world, f = this.flood, q = this.quake;
    if (q) out.push({ key: 'calam:quake', icon: '🌍', title: tr('Séisme'), status: q.shaking ? tr('La terre tremble') : tr('Les bêtes s’agitent'), progress: Math.min(1, q.t / (this.quakeWarn + QUAKE_SHAKE)), x: q.x, z: q.z });
    if (f && f.phase !== 'rain') {
      const st = f.phase === 'warn' ? tr('Les eaux montent') : f.phase === 'rise' ? tr('L’eau gagne les berges') : f.phase === 'hold' ? tr('Les berges sont sous l’eau') : tr('L’eau se retire');
      const progress = f.phase === 'warn' ? f.t / this.floodWarn : f.phase === 'ebb' ? f.t / FLOOD_EBB : f.phase === 'hold' ? f.t / FLOOD_HOLD : f.t / FLOOD_RISE;
      out.push({ key: 'calam:flood', icon: '🌊', title: f.site.lake ? tr('Crue : le lac déborde') : f.site.pond ? tr('Crue : l’étang déborde') : tr('Crue : la rivière déborde'), status: st, progress: Math.min(1, progress), x: f.site.x, z: f.site.z });
    }
    // les fers célestes à ramasser : une carte, l'œil mène au premier
    const m = this.shower;
    if (m) out.push({ key: 'calam:meteor', icon: '☄️', title: tr('Pluie de météorites'), status: m.t < METEOR_WARN ? tr('Des traînées de feu dans le ciel') : tr('Des bolides frappent le sol'), progress: Math.min(1, m.t / (m.plan[m.plan.length - 1].at + METEOR_AFTER)), x: m.plan[0].x, z: m.plan[0].z });
    if (w.starIron.length) {
      const k = w.starIron[0];
      out.push({ key: 'calam:iron', icon: '✨', title: w.starIron.length > 1 ? tr('{n} fers célestes à ramasser', { n: w.starIron.length }) : tr('Un fer céleste à ramasser'), status: tr('Cliquez dessus au fond du cratère'), progress: 0, x: (k % N) + 0.5, z: Math.floor(k / N) + 0.5 });
    }
    // les réparations : une seule carte ; l'œil mène au chantier le moins avancé
    let next: { b: Building; k: number } | null = null, n = 0;
    for (const [id, d] of w.damaged) {
      const b = w.buildings.get(id);
      if (!b) continue;
      n++;
      const k = 1 - d.t / d.T;
      if (!next || k < next.k) next = { b, k };
    }
    if (next) {
      const s = sizeOf(next.b);
      out.push({ key: 'calam:repair', icon: '🔨', title: n > 1 ? tr('Réparations : {n} bâtiments', { n }) : tr('Réparations : {b}', { b: nameOf(next.b).toLowerCase() }), status: tr('Un bâtiment abîmé ne donne que la moitié en attendant'), progress: next.k, x: next.b.x + s / 2, z: next.b.z + s / 2 });
    }
    return out;
  }
}
