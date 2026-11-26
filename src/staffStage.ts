import * as THREE from 'three';
import type { CameraRig } from './core/camera';
import type { FounderStaff } from './render/founderStaff';
import { STAFF_K, staffParts } from './render/founderStaff';
import { Parts } from './render/parts';
import { mats } from './render/materials';
import { demonParts } from './render/battleUnits';
import type { DemonKind } from './sim/hell';
import { CLOSE_AT, GRAB_AT, STAFF_FILM, STAFF_FILM_WAIT, THEFT_LIFT, riftOpenAt, staffFilmCaptionAt, theftBlackAt, theftCaptionAt, theftShakeAt, theftShotAt, theftShotStart, theftTintAt } from './staffCine';
import { KINGDOM_TEXT } from './ui/kingdom';
import { tr } from './i18n';
import { skipAsk } from './ui/skipAsk';

/**
 * La mise en scène du vol du bâton du fondateur (partition dans `staffCine.ts`). D'abord **le film** (`public/vol/`, WebM
 * puis MP4 de secours), opaque par-dessus le jeu, comme celui du portail. Sans film (fichiers absents ou illisibles, lecture
 * refusée, rien au bout de `STAFF_FILM_WAIT`), **le remplacement en direct** sur la grande place : la vue descend
 * vers le bâton, le ciel s'assombrit, la terre tremble et une faille rouge s'ouvre à côté de lui ; trois démons en sortent, le
 * chef arrache le bâton, et tous redescendent avec lui ; la faille se referme sur une brûlure. Les démons, la faille et ses
 * braises sont des maillages à part, dans les matériaux communs (`mats.body`, `mats.glow` : aucun shader neuf à préparer en
 * pleine cinématique). Habillage des autres cinématiques (`#staffCine` partage les styles de `#kingCine`)
 */
export interface StaffStageHost {
  cam: CameraRig;
  scene: THREE.Scene;
  ui: { root: HTMLElement };
  /** hauteur du sol de la surface */
  groundY(x: number, z: number): number;
  staff: FounderStaff;
  audio: { sfxRumble(dur: number): void; sfxRoar(k?: number): void };
  /** remet la place à jour (le monument et son bâton), juste avant le remplacement en direct */
  sync(): void;
}

/** Mouvement doux (départ et arrivée lents) */
const ease = (k: number) => { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); };
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
/** l'orientation de la vue d'ensemble (celle du monument du bâton) */
const YAW = 0.75;

/** Un démon de la cinématique : ses pièces en maillages à part, à animer à la main */
interface Demon { root: THREE.Group; arms: THREE.Object3D[]; legs: THREE.Object3D[]; wings: THREE.Object3D[]; sc: number }

/** La taille des démons à la surface (le modèle mesure 1 de haut ; un habitant en fait 0,16 environ) */
const SIZE: Partial<Record<DemonKind, number>> = { chief: 0.3, brute: 0.34, imp: 0.2 };

function makeDemon(kind: DemonKind): Demon {
  const root = new THREE.Group(), d: Demon = { root, arms: [], legs: [], wings: [], sc: SIZE[kind] ?? 0.3 };
  const def = demonParts(kind);
  for (const [name, p] of Object.entries(def)) {
    if (!p) continue;
    const m = new THREE.Mesh(p.geo, name === 'glow' ? mats.glow : mats.body);
    m.castShadow = true;
    const pivot = new THREE.Group();
    pivot.position.copy(p.pivot);
    pivot.add(m);
    root.add(pivot);
    if (name === 'armL' || name === 'armR') d.arms.push(pivot);
    else if (name === 'legL' || name === 'legR') d.legs.push(pivot);
    else if (name === 'wingL' || name === 'wingR') d.wings.push(pivot);
  }
  root.scale.setScalar(d.sc);
  return d;
}

/** La faille : une déchirure noire et jagged, la lave au fond, des dalles soulevées sur ses bords (longue selon x, de -0,5 à 0,5) */
function riftMesh(): THREE.Group {
  const g = new THREE.Group(), p = new Parts();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const u = -0.5 + (i + 0.5) / n, w = 0.28 * Math.sin(((i + 0.5) / n) * Math.PI) + 0.04, a = (i % 2 ? 0.18 : -0.14);
    // le bord noir (cendres), les parois sombres qui descendent, puis la lave au fond et sa veine claire
    p.add(new THREE.BoxGeometry(1 / n + 0.03, 0.01, w + 0.08), u, 0.002, 0, 0x1a1210, a);
    for (const sd of [-1, 1]) p.add(new THREE.BoxGeometry(1 / n + 0.02, 0.004, w * 0.22), u, 0.009, sd * w * 0.36, 0x3a1810, a, false, sd * 0.35);
    p.add(new THREE.BoxGeometry(1 / n + 0.02, 0.006, w * 0.5), u, 0.006, 0, i % 3 ? 0xd8401a : 0xe8601e, a, true);
    p.add(new THREE.BoxGeometry(1 / n + 0.01, 0.007, w * 0.14), u, 0.007, 0, 0xffc040, a, true);
    // les dalles de terre soulevées, de part et d'autre
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.07, 0.025, 0.05), u + (i % 2) * 0.02, 0.008, s * (w * 0.5 + 0.04), i % 2 ? 0x4a3a2a : 0x5a4632, a + s * 0.2, false, s * 0.5);
  }
  const { body, glow } = p.build(false);
  g.add(new THREE.Mesh(body, mats.body));
  if (glow) g.add(new THREE.Mesh(glow, mats.glow));
  return g;
}

/** Une braise qui monte de la faille */
interface Ember { m: THREE.Mesh; x: number; z: number; t: number; v: number }

export class StaffStage {
  private t = 0;
  /** `film` : la vidéo (ou l'attente de ses premières images) ; `live` : le remplacement en direct */
  private phase: 'film' | 'live' = 'film';
  /** le temps passé à attendre le film, et s'il joue */
  private filmT = 0;
  private rolling = false;
  /** la vue d'avant, à rendre à la fin (le film revu depuis « Grands choix ») */
  private keep: { x: number; z: number; yaw: number; pitch: number; dist: number } | null = null;
  private el: { root: HTMLElement; veil: HTMLElement; cap: HTMLElement; tint: HTMLElement; glow: HTMLElement; film: HTMLElement; video: HTMLVideoElement } | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private group: THREE.Group | null = null;
  private rift: THREE.Group | null = null;
  private demons: { chief: Demon; brute: Demon; imp: Demon } | null = null;
  private held: THREE.Mesh | null = null;
  private embers: Ember[] = [];
  /** les repères : le pied du bâton, le centre de la faille, la droite de l'écran et la direction de la vue */
  private pts: { s: THREE.Vector3; r: THREE.Vector3; right: THREE.Vector3; fwd: THREE.Vector3 } | null = null;
  private onDone: (() => void) | null = null;
  private said = { rumble: false, roar: false, close: false, filmRumble: 0 };

  constructor(private host: StaffStageHost) {}

  get playing() { return !!this.el; }

  /**
   * Lance la cinématique ; `done` est appelé à sa fin (ou si on la passe). Le film d'abord ; sans lui, le remplacement en
   * direct, et sans grande place il n'y a rien à montrer : `done` tout de suite. `keepView` : la vue d'avant est rendue à la
   * fin (le film revu)
   */
  play(done: () => void, opts: { keepView?: boolean } = {}): boolean {
    if (this.el) return false;
    this.onDone = done;
    this.t = 0; this.filmT = 0; this.rolling = false; this.phase = 'film';
    this.keep = opts.keepView ? this.host.cam.view() : null;
    this.said = { rumble: false, roar: false, close: false, filmRumble: 0 };
    document.body.classList.add('cinematic');
    this.buildUi();
    this.startFilm();
    return true;
  }

  /** Le film introuvable, illisible ou trop lent : le vol joué en direct sur la grande place */
  private toLive() {
    const c = this.el;
    if (!c || this.phase !== 'film') return;
    c.video.pause(); c.video.removeAttribute('src'); c.video.load();
    c.film.style.display = 'none';
    c.veil.style.opacity = '1';
    this.setCap('', '', 0);
    // (la place remise à jour : le monument montre son bâton le temps de la cinématique)
    const h = this.host;
    h.sync();
    const foot = h.staff.staffWorld();
    if (!foot) { this.finish(); return; }
    this.phase = 'live'; this.t = 0;
    const right = new THREE.Vector3(Math.cos(YAW), 0, -Math.sin(YAW)), fwd = new THREE.Vector3(Math.sin(YAW), 0, Math.cos(YAW));
    // la faille s'ouvre à côté du bâton, du côté le plus loin du milieu de la place (pas dans sa fontaine ni sur ses étals),
    // un peu repoussée vers le dehors
    const ct = h.staff.center, out = new THREE.Vector3(foot.x - ct.x, 0, foot.z - ct.z).normalize();
    const side = [-1, 1].map((k) => foot.clone().addScaledVector(right, k * 0.42)).sort((a, b) => Math.hypot(b.x - ct.x, b.z - ct.z) - Math.hypot(a.x - ct.x, a.z - ct.z))[0];
    const r = side.addScaledVector(out, 0.12);
    r.y = h.groundY(r.x, r.z) + 0.004;
    this.pts = { s: foot.clone(), r, right, fwd };
    this.build3d();
  }

  /** Une image (temps réel, plafonné) ; la caméra est posée après sa propre mise à jour */
  step(dt: number) {
    if (!this.el) return;
    if (this.phase === 'film') { this.stepFilm(dt); return; }
    if (!this.pts) return;
    this.t += dt;
    const t = this.t, c = this.el, h = this.host;
    c.tint.style.opacity = String(theftTintAt(t));
    // (le noir du départ se lève, celui de la fin tombe)
    c.veil.style.opacity = String(Math.max(theftBlackAt(t), 1 - t / THEFT_LIFT));
    const open = riftOpenAt(t);
    c.glow.style.opacity = String(open * 0.9);
    const cap = theftCaptionAt(t);
    this.setCap(cap ? tr(cap.text) : '', cap?.sub ? tr(cap.sub) : '', cap ? cap.alpha : 0);
    const cur = theftShotAt(t);
    if (!cur) { this.finish(); return; }
    // les sons : le grondement quand la faille s'ouvre, le cri des démons, le grondement de la fermeture
    if (!this.said.rumble && cur.shot === 'rift') { this.said.rumble = true; h.audio.sfxRumble(2.4); }
    if (!this.said.roar && cur.shot === 'demons' && cur.local > 0.6) { this.said.roar = true; h.audio.sfxRoar(0.7); }
    if (!this.said.close && cur.shot === 'gone' && cur.local > CLOSE_AT) { this.said.close = true; h.audio.sfxRumble(1.4); }
    this.animate(t, dt, open);
    this.camera(cur.shot, cur.k, t);
  }

  /** Le film : ses bandeaux et ses bruitages au temps de la vidéo ; rien au bout de `STAFF_FILM_WAIT`, le direct */
  private stepFilm(dt: number) {
    const c = this.el!, h = this.host;
    this.filmT += dt;
    if (!this.rolling) { if (this.filmT > STAFF_FILM_WAIT) this.toLive(); return; }
    const t = c.video.currentTime || 0;
    const cap = staffFilmCaptionAt(t);
    this.setCap(cap ? tr(cap.text) : '', cap?.sub ? tr(cap.sub) : '', cap ? cap.alpha : 0);
    const rb = STAFF_FILM.rumble;
    if (this.said.filmRumble < rb.length && t >= rb[this.said.filmRumble]) { h.audio.sfxRumble(this.said.filmRumble ? 1.4 : 2.4); this.said.filmRumble++; }
    if (!this.said.roar && t >= STAFF_FILM.roar) { this.said.roar = true; h.audio.sfxRoar(0.7); }
  }

  /** La WebM, puis le MP4 de secours ; illisibles, introuvables ou refusés : le remplacement en direct */
  private startFilm() {
    const c = this.el!, video = c.video;
    let fallback = false;
    const live = () => { if (this.el?.video === video) this.toLive(); };
    const fail = () => {
      if (!fallback && !video.currentSrc.endsWith('.mp4')) {
        fallback = true;
        video.src = STAFF_FILM.mp4;
        void video.play().catch(live);
        return;
      }
      live();
    };
    video.addEventListener('error', fail);
    video.querySelectorAll('source')[1]?.addEventListener('error', fail);
    video.addEventListener('playing', () => { if (this.el?.video === video) this.rolling = true; });
    video.addEventListener('ended', () => { if (this.el?.video === video && this.phase === 'film') this.finish(); });
    void video.play().catch(live);
  }

  /** Passer : tout de suite à la fin (le bâton est volé) */
  skip() { if (this.el) this.finish(); }

  // ---------- La vue ----------

  private camera(shot: string, k: number, t: number) {
    const P = this.pts!, mid = P.s.clone().lerp(P.r, 0.45);
    let dist: number, pitch: number, yaw = YAW;
    if (shot === 'calm') { const e = ease(k); dist = mix(7, 2.3, e); pitch = mix(0.95, 0.5, e); yaw = YAW - 0.35 * (1 - e); }
    else if (shot === 'rift') { dist = mix(2.3, 2.1, k); pitch = 0.5; }
    else if (shot === 'demons') { const e = ease(k); dist = mix(2.1, 1.8, e); pitch = mix(0.5, 0.4, e); yaw = YAW + 0.12 * e; }
    else { const e = ease(k); dist = mix(1.8, 3, e); pitch = mix(0.4, 0.6, e); yaw = YAW + 0.12 - 0.05 * e; }
    // le tremblement de la terre
    const sh = theftShakeAt(t) * 0.05;
    const x = mid.x + Math.sin(t * 47) * sh, z = mid.z + Math.cos(t * 53) * sh;
    const c = this.host.cam, md = c.minDist, mp = c.minPitch;
    c.minDist = 0.3; c.minPitch = 0.01;
    c.jump({ x, z, dist, pitch, yaw }, this.host.groundY(mid.x, mid.z) + 0.12 + Math.sin(t * 61) * sh * 0.5);
    c.minDist = md; c.minPitch = mp;
  }

  // ---------- La faille, les démons, le bâton ----------

  private build3d() {
    const P = this.pts!, g = new THREE.Group();
    this.group = g;
    const rift = riftMesh();
    rift.position.copy(P.r);
    rift.rotation.y = YAW;
    rift.scale.set(0.001, 1, 0.001);
    g.add(rift);
    this.rift = rift;
    this.demons = { chief: makeDemon('chief'), brute: makeDemon('brute'), imp: makeDemon('imp') };
    for (const d of Object.values(this.demons)) { d.root.visible = false; g.add(d.root); }
    // le bâton qu'on anime : le vrai se cache sur son monument
    const q = new Parts();
    staffParts(q, 0, 0, 0);
    const { body, glow } = q.build();
    const m = new THREE.Mesh(body, mats.body);
    m.castShadow = true;
    if (glow) m.add(new THREE.Mesh(glow, mats.glow));
    m.scale.setScalar(STAFF_K * (this.host.staff.staffScale() ?? 1));
    m.position.copy(P.s);
    m.rotation.y = YAW;
    g.add(m);
    this.held = m;
    this.host.staff.hide(true);
    // les braises
    const eg = new THREE.OctahedronGeometry(0.012, 0), ec = new THREE.Color(0xffb040);
    eg.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: eg.attributes.position.count }, () => [ec.r, ec.g, ec.b]).flat(), 3));
    for (let i = 0; i < 22; i++) {
      const em = new THREE.Mesh(eg, mats.glow);
      em.visible = false;
      g.add(em);
      this.embers.push({ m: em, x: (Math.random() - 0.5) * 0.7, z: (Math.random() - 0.5) * 0.12, t: Math.random() * 1.5, v: 0.25 + Math.random() * 0.35 });
    }
    this.host.scene.add(g);
  }

  private animate(t: number, dt: number, open: number) {
    const P = this.pts!, D = this.demons!, rift = this.rift!, held = this.held!;
    rift.scale.set(Math.max(0.001, open) * 0.75, 1, Math.max(0.001, open) * 0.9);
    // les braises montent de la faille tant qu'elle est ouverte
    for (const e of this.embers) {
      e.t += dt * e.v;
      if (e.t > 1) { e.t -= 1; e.x = (Math.random() - 0.5) * 0.7; }
      e.m.visible = open > 0.15;
      const p = P.r.clone().addScaledVector(P.right, e.x * open * 0.9).addScaledVector(P.fwd, e.z);
      e.m.position.set(p.x + Math.sin(t * 3 + e.x * 9) * 0.02, P.r.y + e.t * 0.5, p.z);
      e.m.scale.setScalar(1 - e.t * 0.8);
    }
    const dS = theftShotStart('demons'), dG = theftShotStart('gone');
    const ld = t - dS, lg = t - dG;
    // où chaque démon se tient (le long de la faille) ; ils sortent l'un après l'autre
    const spot = (u: number, f = 0) => P.r.clone().addScaledVector(P.right, u).addScaledVector(P.fwd, f);
    const place = (d: Demon, at: THREE.Vector3, rise: number, face: THREE.Vector3) => {
      d.root.visible = rise > 0.01;
      d.root.position.set(at.x, P.r.y - (1 - rise) * d.sc * 1.1, at.z);
      d.root.rotation.y = Math.atan2(face.x - at.x, face.z - at.z);
    };
    const toCam = (at: THREE.Vector3) => at.clone().addScaledVector(P.fwd, 2);
    const rise = (start: number, dur: number) => ease((ld - start) / dur);
    const sink = (start: number, dur: number) => 1 - ease((lg - start) / dur);
    // le chef : il sort, marche jusqu'au bâton, l'arrache, revient et redescend avec lui
    const grabP = P.s.clone().addScaledVector(P.right, 0.11).addScaledVector(P.fwd, 0.02);
    const out = spot(-0.08);
    let chiefAt = out.clone(), walking = false;
    const goT = ld - 1.2, backT = ld - (GRAB_AT + 0.6);
    if (goT > 0 && ld < GRAB_AT) { chiefAt = out.clone().lerp(grabP, ease(goT / (GRAB_AT - 1.2))); walking = true; }
    if (ld >= GRAB_AT) chiefAt = grabP.clone();
    if (backT > 0) { chiefAt = grabP.clone().lerp(out, ease(backT / 1.2)); walking = backT < 1.2; }
    if (lg > 0) chiefAt = out.clone();
    const chiefRise = lg > 0 ? sink(0.4, 1.4) : rise(0, 1.0);
    place(D.chief, chiefAt, chiefRise, ld < GRAB_AT ? grabP.clone().addScaledVector(P.right, -1) : toCam(chiefAt));
    if (ld > 0.2 && ld < GRAB_AT && !walking) D.chief.root.rotation.y = Math.atan2(P.fwd.x, P.fwd.z);
    // la brute, à droite de la faille : elle sort, frappe le sol, rugit vers la vue
    place(D.brute, spot(0.26, -0.04), lg > 0 ? sink(0.2, 1.3) : rise(0.5, 1.1), toCam(spot(0.26)));
    // le diablotin : il jaillit et tourne en l'air au-dessus de la faille
    const ia = t * 2.4;
    const impAt = spot(Math.sin(ia) * 0.25, Math.cos(ia) * 0.12);
    place(D.imp, impAt, lg > 0 ? sink(0, 1.2) : rise(0.9, 0.8), impAt.clone().add(new THREE.Vector3(Math.cos(ia), 0, -Math.sin(ia))));
    if (D.imp.root.visible) D.imp.root.position.y += 0.18 * (lg > 0 ? sink(0, 1.2) : rise(0.9, 0.8)) + Math.sin(t * 6) * 0.02;
    // les membres : la marche, les bras levés (le cri, la prise), les ailes qui battent
    for (const d of [D.chief, D.brute, D.imp]) {
      const sw = d === D.chief && walking ? Math.sin(t * 11) * 0.6 : 0;
      d.legs.forEach((l, i) => { l.rotation.x = i ? sw : -sw; });
      const raise = d === D.brute ? Math.max(0, Math.sin(Math.max(0, ld - 1.4) * 2.2)) * 1.6 : d === D.chief && ld >= GRAB_AT - 0.3 && ld < GRAB_AT + 0.7 ? 2.2 : 0.3;
      d.arms.forEach((a, i) => { a.rotation.x = -raise + (i ? -sw : sw) * 0.5; });
      d.wings.forEach((w, i) => { w.rotation.y = (i ? 1 : -1) * (0.4 + Math.sin(t * 18) * 0.5); });
    }
    // le bâton : sur son monument, puis dans la main du chef (au-dessus de la tête, puis porté à l'épaule), et sous terre
    if (ld < GRAB_AT) { held.position.copy(P.s); held.rotation.set(0, YAW, 0); }
    else {
      const c = D.chief.root, sc = D.chief.sc;
      const side = new THREE.Vector3(Math.cos(c.rotation.y), 0, -Math.sin(c.rotation.y));
      const lift = ld < GRAB_AT + 0.7 ? 0.95 : 0.55;
      const pick = ease((ld - GRAB_AT) / 0.35);
      const hand = c.position.clone().addScaledVector(side, -0.2 * sc);
      hand.y += lift * sc - 0.1;
      held.position.copy(P.s.clone().lerp(hand, pick));
      held.rotation.set(0, c.rotation.y, mix(0, 0.35, pick));
      held.visible = c.visible || ld < GRAB_AT + 0.5;
    }
  }

  private finish() {
    this.close();
    // (le film revu : la vue d'avant)
    const k = this.keep;
    this.keep = null;
    if (k) this.host.cam.jump(k, this.host.groundY(k.x, k.z));
    const done = this.onDone;
    this.onDone = null;
    done?.();
  }

  private close() {
    if (this.keyHandler) { window.removeEventListener('keydown', this.keyHandler, true); this.keyHandler = null; }
    if (this.el) { this.el.video.pause(); this.el.video.removeAttribute('src'); this.el.video.load(); this.el.root.remove(); }
    this.el = null;
    if (this.group) {
      this.host.scene.remove(this.group);
      this.group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    }
    this.group = null; this.rift = null; this.demons = null; this.held = null; this.embers = []; this.pts = null;
    this.host.staff.hide(false);
    document.body.classList.remove('cinematic');
  }

  // ---------- L'habillage : voile, teinte, bandeaux, « Passer » ----------

  private buildUi() {
    const root = document.createElement('div');
    root.id = 'staffCine';
    root.innerHTML = `<div class="sc-tint"></div><div class="sc-glow"></div><div class="kc-veil" style="background:#000"></div>
      <div class="scFilm"><video muted playsinline preload="auto" disablepictureinpicture aria-hidden="true">
        <source src="${STAFF_FILM.webm}" type="video/webm"><source src="${STAFF_FILM.mp4}" type="video/mp4"></video></div><div class="kc-bar t"></div><div class="kc-bar b"></div><div class="kc-cap"><b></b><small></small></div>
      <button class="kc-skip" type="button">${KINGDOM_TEXT.skip}</button>`;
    this.host.ui.root.appendChild(root);
    // (un clic n'importe où passe, en deux temps : le premier appui demande « Vraiment passer ? », voir `skipAsk`)
    const ask = skipAsk(root, () => this.skip());
    root.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); ask(); });
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'Space') return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat) ask();
    };
    window.addEventListener('keydown', this.keyHandler, true);
    this.el = { root, veil: root.querySelector('.kc-veil')!, cap: root.querySelector('.kc-cap')!, tint: root.querySelector('.sc-tint')!, glow: root.querySelector('.sc-glow')!, film: root.querySelector('.scFilm')!, video: root.querySelector('video')! };
    // (la lueur de la faille, à sa place à l'écran : posée une fois, la vue bouge peu)
    this.el.glow.style.setProperty('--gx', '58%');
    this.el.glow.style.setProperty('--gy', '62%');
  }

  private setCap(text: string, sub: string, alpha: number) {
    const c = this.el;
    if (!c) return;
    const b = c.cap.querySelector('b')!, s = c.cap.querySelector('small')!;
    if (b.textContent !== text) b.textContent = text;
    if (s.textContent !== sub) s.textContent = sub;
    c.cap.style.opacity = String(alpha);
  }
}

