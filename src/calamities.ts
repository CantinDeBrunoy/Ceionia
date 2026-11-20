import * as THREE from 'three';
import { World, N, VEG_FIELD } from './world/world';
import type { GameTime } from './core/time';
import type { Environment } from './render/env';
import { rulesOf } from './sim/difficulty';
import { CALAMITIES, CalamityKind, FloodSite, REPAIR_DAYS, QUAKE_R, floodSite, harmOf, nameOf, planAge, quakeCenter, quakeVictims, rockfalls, ruinedFields } from './sim/calamity';
import { FloodView } from './render/flood';
import { RepairsView } from './render/repairs';
import { QuakeView } from './render/quake';
import { sizeOf, type Building } from './build/catalog';
import type { AudioEngine } from './audio/audio';
import { tr, nplural } from './i18n';

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
}

/** La crue, d'étape en étape (secondes de jeu) : l'averse qui dure, l'annonce, la montée, l'eau qui reste, le retrait */
const FLOOD_RAIN = 15, FLOOD_WARN = 20, FLOOD_RISE = 15, FLOOD_HOLD = 60, FLOOD_EBB = 30;
/** Une crue qui attend sa pluie depuis tant de jours (joueur qui impose le beau temps) cède la place à une autre catastrophe */
const WAIT_DAYS = 3;
/** Le séisme : les bêtes s'agitent tant de secondes avant, la terre tremble tant de secondes, les dégâts au bout de tant */
const QUAKE_WARN = 8, QUAKE_SHAKE = 10, QUAKE_HIT = 2.5;

type FloodPhase = 'rain' | 'warn' | 'rise' | 'hold' | 'ebb';
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
  /** la catastrophe tirée, qui attend son heure (la pluie pour la crue, la nuit pour les météorites) */
  private pending: CalamityKind | null = null;
  private waited = 0;
  private flood: Flood | null = null;
  private quake: Quake | null = null;

  constructor(private h: CalamityHost) {
    this.floodView = new FloodView(h.world);
    this.repairs = new RepairsView(h.world);
    this.quakeView = new QuakeView(h.world);
    this.group.add(this.floodView.group, this.repairs.group, this.quakeView.group);
  }

  /** Une catastrophe en cours (annonce comprise) */
  get busy() { return !!this.flood || !!this.quake; }

  /** `gdt` : temps de jeu (tout se fige en pause) ; `dt` : temps réel (houle, poussière) */
  update(gdt: number, dt: number) {
    this.repair(gdt);
    this.schedule(gdt);
    this.stepFlood(gdt, dt);
    this.stepQuake(gdt);
    this.quakeView.update(gdt, dt);
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
    const T = this.h.time.dayLen * REPAIR_DAYS;
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
    if (k === 'quake') return true;
    return false;
  }

  /** Son heure est venue : la crue après une bonne averse (on la fait venir, sauf l'hiver ou si le joueur impose le temps) */
  private time(k: CalamityKind) {
    const env = this.h.env;
    if (k === 'flood') {
      if (this.h.time.season === 3) return false;
      if (!env.manualWeather) env.wantKind = 'rain';
      return env.weatherKind === 'rain' && env.rainK > 0.75;
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
      this.h.toast(tr('🐾 Les bêtes s’agitent, les oiseaux s’envolent : la terre va trembler ! Cliquez ici pour voir.'), () => this.h.goTo(x, z, 34), 'danger');
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
    if (f.phase === 'warn' && !f.told) f.told = true, this.h.toast(tr('🌊 Les eaux montent : {where} va déborder ! Cliquez ici pour voir.', { where }), go, 'danger');
    if (f.phase === 'warn' && f.t >= FLOOD_WARN) {
      f.phase = 'rise'; f.t = 0;
      this.floodView.set(s);
      this.h.audio.sfxSplash(1);
      // les champs sous l'eau ne donnent plus rien (pas au bac à sable : le spectacle seul)
      if (harm !== 'none') { for (const k of s.cells) if (w.veg[k] === VEG_FIELD) { w.flooded[k] = 1; f.drowned++; } w.ageVersion++; }
    }
    if (f.phase === 'rise' && f.t >= FLOOD_RISE) {
      f.phase = 'hold'; f.t = 0;
      // les bâtiments de la berge sont abîmés (dégâts complets)
      if (harm === 'full') for (const id of s.buildings) if (this.damage(id)) f.hurt++;
    }
    if (f.phase === 'hold' && f.t >= FLOOD_HOLD) { f.phase = 'ebb'; f.t = 0; }
    if (f.phase === 'ebb' && f.t >= FLOOD_EBB) {
      // l'eau partie : un champ noyé sur trois est à resemer (dégâts complets)
      if (harm === 'full' && w.disasters) for (const k of ruinedFields(w, s.cells)) {
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
    if (!q.shaking && q.t >= QUAKE_WARN) {
      q.shaking = true;
      this.h.audio.sfxRumble(QUAKE_SHAKE);
      this.quakeView.crack(q.x, q.z);
    }
    if (!q.shaking) return;
    const s = q.t - QUAKE_WARN;
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

  /** Secousse ressentie au point visé (0 … 1) : monte vite, tient, s'apaise ; s'efface à 70 cases de l'épicentre */
  shakeAt(x: number, z: number) {
    const q = this.quake;
    if (!q || !q.shaking) return 0;
    const s = q.t - QUAKE_WARN, env = Math.min(1, s) * (s > QUAKE_SHAKE - 3 ? Math.max(0, (QUAKE_SHAKE - s) / 3) : 1);
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
  private floodReport(f: Flood) {
    const parts: string[] = [];
    if (f.drowned) parts.push(nplural(f.drowned, 'champ noyé', 'champs noyés'));
    if (f.ruined) parts.push(tr('{n} à resemer', { n: f.ruined }));
    if (f.hurt) parts.push(nplural(f.hurt, 'bâtiment abîmé', 'bâtiments abîmés'));
    const tip = f.ruined || f.hurt ? ' ' + tr('Un rempart le long de la berge, ou une berge relevée à l’outil de terrain, arrête l’eau.') : '';
    return parts.length ? tr('🌊 La crue s’est retirée : {what}.', { what: parts.join(', ') }) + tip : tr('🌊 La crue s’est retirée sans dégâts.');
  }

  /** Les catastrophes et réparations en cours, pour leurs cartes à gauche (l'œil y mène la vue) */
  incidents(): Incident[] {
    const out: Incident[] = [], w = this.h.world, f = this.flood, q = this.quake;
    if (q) out.push({ key: 'calam:quake', icon: '🌍', title: tr('Séisme'), status: q.shaking ? tr('La terre tremble') : tr('Les bêtes s’agitent'), progress: Math.min(1, q.t / (QUAKE_WARN + QUAKE_SHAKE)), x: q.x, z: q.z });
    if (f && f.phase !== 'rain') {
      const st = f.phase === 'warn' ? tr('Les eaux montent') : f.phase === 'rise' ? tr('L’eau gagne les berges') : f.phase === 'hold' ? tr('Les berges sont sous l’eau') : tr('L’eau se retire');
      const progress = f.phase === 'warn' ? f.t / FLOOD_WARN : f.phase === 'ebb' ? f.t / FLOOD_EBB : f.phase === 'hold' ? f.t / FLOOD_HOLD : f.t / FLOOD_RISE;
      out.push({ key: 'calam:flood', icon: '🌊', title: f.site.lake ? tr('Crue : le lac déborde') : f.site.pond ? tr('Crue : l’étang déborde') : tr('Crue : la rivière déborde'), status: st, progress: Math.min(1, progress), x: f.site.x, z: f.site.z });
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
