import * as THREE from 'three';
import { Parts } from '../parts';
import { mats } from '../materials';
import { makeFolk, folkStep, type Folk, type FolkPose } from '../folk';
import { tr } from '../../i18n';
import { Sparks, disposeTree, glowSprite, puffTexture, type ShowView } from './common';
import { robe } from './rite';

/**
 * La représentation au théâtre (repère du bâtiment, 2 × 2, l'entrée face à +z). Les spectateurs font la queue devant
 * l'entrée, pendant que les lumières de la façade s'allument une à une : torches de l'Antiquité et du Moyen Âge, réverbères
 * de l'opéra, guirlandes d'ampoules ensuite. Les portes s'ouvrent (une cloche), ils entrent un à un. Au théâtre antique et sur
 * les tréteaux, la scène se voit d'en haut : les comédiens costumés y jouent deux actes, le chœur danse dans l'orchestre ;
 * dans une salle fermée, on devine la scène aux lueurs de couleur qui passent par la porte. Pour finir, le public ressort et
 * se tient devant la façade, la troupe vient saluer devant l'entrée et on lui lance des fleurs
 */

/** la queue (au moins, au plus), l'entrée du public, un acte, l'entracte, le rappel (secondes de jeu) */
const QUEUE_MIN = 5, QUEUE_MAX = 18, ENTER = 5, ACT = 11, BREAK = 3, BOWS = 9;
/** la scène qu'on voit d'en haut (repère du modèle, voir `theater` de models.ts) : places des comédiens, plancher, sens du jeu */
const STAGES: Record<number, { x: number[]; z: number; y: number; face: number; chorus?: { cz: number; r: number; y: number } }> = {
  1: { x: [-0.36, 0.36], z: 0.44, y: 0.14, face: Math.PI, chorus: { cz: 0.1, r: 0.27, y: 0.036 } },
  2: { x: [-0.38, 0.02, 0.4], z: -0.4, y: 0.16, face: 0 },
};
/** les costumes de la troupe */
const COSTUMES = [0xb8443a, 0x3a6ab8, 0xe8b83a, 0x8a4ab8, 0x3a9a6a, 0xf2ead8];
/** les lampes de la façade, le long de son bord ; le salut de la troupe, devant l'entrée */
const LAMPS = 7, LAMP_Z = 0.97, BOW_Z = 1.14;
/** les titres des pièces (tirés au hasard) */
const TITLES = ['Les Masques du roi', 'La Farce du meunier', 'Le Songe du berger', 'La Flûte de cristal', 'Nuit d’orage', 'Le Voyage des étoiles'];
const FLOWERS = [0xf24a6a, 0xffffff, 0xf2d04a, 0xf28aa8, 0xb48ad8, 0xff8a3a];

interface Actor { f: Folk; x: number; z: number; y: number; heading: number; ph: number; home: [number, number, number, number]; chorus: boolean; a: number }
interface Flower { m: THREE.Group; t: number; dur: number; from: THREE.Vector3; to: THREE.Vector3; spin: number }

export interface PlayEvents { bell?: () => void; applause?: (k: number) => void; roar?: (k: number) => void; music?: () => void }

export class PlayView implements ShowView {
  group = new THREE.Group();
  done = false;
  phase: 'queue' | 'enter' | 'act1' | 'break' | 'act2' | 'bows' = 'queue';
  crowd: 'wait' | 'in' | 'show' | 'out' = 'wait';
  title: string;
  private t = 0;
  private T = 0;
  private came = false;
  private lamps: { glow: THREE.Sprite; head: THREE.Mesh; on: number; base: number }[] = [];
  private bulbs: THREE.Points | null = null;
  private bulbOn = -1;
  private stageGlow: THREE.Sprite[] = [];
  private actors: Actor[] = [];
  private flowers: Flower[] = [];
  private flowerGeo: THREE.BufferGeometry[] = [];
  private thrown = 0;
  private sparks = new Sparks(300, 0.05);
  private speaker = 0;
  private speakT = 0;
  private laughT = 4;
  private rnd: () => number;
  private stage: (typeof STAGES)[1] | null;
  private age: number;
  /** les lampes de la façade, posées sur le terrain (il peut monter devant le théâtre, posé plus bas) */
  private front = new THREE.Group();

  /** `ground` : la hauteur du terrain en (x, z) du repère du bâtiment, au-dessus de son sol (devant la façade, la troupe, les fleurs) */
  constructor(age: number, seed: number, private ev: PlayEvents = {}, private ground: (x: number, z: number) => number = () => 0) {
    let s = (seed >>> 0) || 13;
    this.rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    this.age = Math.min(5, Math.max(1, age));
    this.title = tr(TITLES[Math.floor(this.rnd() * TITLES.length)]);
    this.stage = STAGES[this.age] ?? null;
    this.group.add(this.sparks.points);
    this.lights();
    this.troupe(seed);
  }

  /** Les lampes de la façade, éteintes : torches, réverbères, globes et guirlande selon l'âge */
  private lights() {
    const a = this.age, p = new Parts(), torch = a <= 2, H = torch ? 0.3 : 0.36;
    const xs = Array.from({ length: LAMPS }, (_, i) => -0.84 + (i * 1.68) / (LAMPS - 1));
    for (const x of xs) {
      if (torch) { p.cyl(0.008, 0.011, H, 5, x, 0, LAMP_Z, a === 2 ? 0x5a3e28 : 0x8a6a48); p.cyl(0.02, 0.012, 0.03, 6, x, H, LAMP_Z, 0x3c3c42); }
      else {
        p.cyl(0.007, 0.012, H, 6, x, 0, LAMP_Z, a >= 4 ? 0xd8dce2 : 0x2f3a34);
        p.cyl(0.022, 0.026, 0.012, 6, x, 0, LAMP_Z, a >= 4 ? 0xb8bcc4 : 0x2f3a34);
        if (a === 3) { p.cone(0.03, 0.03, 4, x, H + 0.045, LAMP_Z, 0x2f3a34); p.box(0.008, 0.02, 0.06, x, H - 0.02, LAMP_Z, 0x2f3a34); }
      }
    }
    // aux torches : des fanions de couleur tendus de l'une à l'autre (la fête du spectacle)
    if (torch) for (let i = 0; i < LAMPS - 1; i++) for (let k = 1; k < 5; k++) {
      const u = k / 5, x = xs[i] + (xs[i + 1] - xs[i]) * u, y = H - 0.02 - Math.sin(u * Math.PI) * 0.05;
      p.add(new THREE.ConeGeometry(0.014, 0.035, 3).rotateX(Math.PI), x, y - 0.018, LAMP_Z, COSTUMES[(i + k) % COSTUMES.length]);
    }
    if (torch) for (let i = 0; i < LAMPS - 1; i++) for (let k = 0; k < 5; k++) {
      const u0 = k / 5, u1 = (k + 1) / 5, x0 = xs[i] + (xs[i + 1] - xs[i]) * u0, x1 = xs[i] + (xs[i + 1] - xs[i]) * u1;
      const y0 = H - 0.02 - Math.sin(u0 * Math.PI) * 0.05, y1 = H - 0.02 - Math.sin(u1 * Math.PI) * 0.05, L = Math.hypot(x1 - x0, y1 - y0);
      p.add(new THREE.BoxGeometry(L, 0.003, 0.003).rotateZ(Math.atan2(y1 - y0, x1 - x0)), (x0 + x1) / 2, (y0 + y1) / 2, LAMP_Z, 0x6a5c4c);
    }
    // l'affiche de la pièce, sur un chevalet à côté de l'entrée : un masque peint sur fond de couleur
    {
      const x = 0.42, z = LAMP_Z + 0.12, c = COSTUMES[this.rnd() * COSTUMES.length | 0];
      for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.008, 0.2, 0.008).rotateZ(s * 0.12), x + s * 0.035, 0.1, z, 0x6a4a30);
      p.add(new THREE.BoxGeometry(0.008, 0.18, 0.008).rotateX(-0.3), x, 0.09, z - 0.03, 0x6a4a30);
      p.box(0.11, 0.14, 0.006, x, 0.07, z + 0.006, 0xf4ecd8);
      p.box(0.094, 0.124, 0.004, x, 0.078, z + 0.01, c);
      p.add(new THREE.SphereGeometry(0.026, 8, 6).scale(0.85, 1, 0.3), x, 0.15, z + 0.013, 0xf8f4ea);
      for (const s of [-1, 1]) p.box(0.01, 0.006, 0.003, x + s * 0.01, 0.156, z + 0.021, 0x2a2622);
      p.box(0.07, 0.008, 0.004, x, 0.095, z + 0.013, 0xf2c23a);
    }
    const posts = new THREE.Mesh(p.build(false).body, mats.body);
    posts.castShadow = true;
    this.front.position.y = this.ground(0, LAMP_Z);
    this.group.add(this.front);
    this.front.add(posts);
    xs.forEach((x, i) => {
      const head = new THREE.Mesh(torch ? new THREE.ConeGeometry(0.022, 0.06, 6) : new THREE.SphereGeometry(a === 3 ? 0.024 : 0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0x3a3a3a, fog: false }));
      head.position.set(x, H + (torch ? 0.045 : 0.02), LAMP_Z);
      this.front.add(head);
      const glow = glowSprite(torch ? 0xff9a40 : a >= 5 ? 0x9ae8ff : 0xffe0a0, 0.0001, 0.7);
      glow.position.copy(head.position);
      this.front.add(glow);
      // (les lampes s'allument du milieu vers les bords)
      this.lamps.push({ glow, head, on: 0.8 + Math.abs(i - (LAMPS - 1) / 2) * 0.7, base: torch ? 0.34 : 0.3 });
    });
    // la guirlande d'ampoules, de lampe en lampe (dès l'âge industriel)
    if (!torch) {
      const pos: number[] = [];
      for (let i = 0; i < LAMPS - 1; i++) for (let k = 1; k < 7; k++) {
        const u = k / 7, x = xs[i] + (xs[i + 1] - xs[i]) * u;
        pos.push(x, H + 0.005 - Math.sin(u * Math.PI) * 0.06, LAMP_Z);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0.15), 3));
      this.bulbs = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.045, map: puffTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.front.add(this.bulbs);
    }
    // la lumière de la scène : au-dessus des planches qu'on voit, ou par la porte d'une salle fermée
    const spots: [number, number, number][] = this.stage ? this.stage.x.map((x) => [x, this.stage!.y + 0.3, this.stage!.z] as [number, number, number]) : [[0, 0.22, 0.92], [-0.3, 0.3, 0.9], [0.3, 0.3, 0.9]].map(([x, y, z]) => [x, y + this.ground(x, z), z] as [number, number, number]);
    for (const [x, y, z] of spots) { const g = glowSprite(0xfff0c8, 0.0001, 0); g.position.set(x, y, z); this.group.add(g); this.stageGlow.push(g); }
  }

  /** La troupe : les comédiens costumés (sur la scène, si on la voit), le chœur de l'Antiquité qui danse dans l'orchestre */
  private troupe(seed: number) {
    const st = this.stage, n = st ? st.x.length : 4;
    for (let i = 0; i < n; i++) {
      const f = makeFolk({ age: this.age, v: seed + i * 23, size: 0.95, woman: i % 2 === 1, role: this.age === 2 && i === 1 ? 'juggler' : undefined });
      robe(f, COSTUMES[(i + seed) % COSTUMES.length], i % 2 ? 0xf2c23a : 0xf6f2ea);
      const home: Actor['home'] = st ? [st.x[i], st.y, st.z, st.face] : [0, 0, BOW_Z, 0];
      this.actors.push({ f, x: home[0], y: home[1], z: home[2], heading: home[3], ph: i, home, chorus: false, a: 0 });
      f.root.visible = !!st;
      this.group.add(f.root);
    }
    if (st?.chorus) for (let i = 0; i < 4; i++) {
      const f = makeFolk({ age: 1, v: seed + 77 + i * 7, size: 0.9, woman: i % 2 === 0 });
      robe(f, 0xf8f6f0, 0xf2c23a);
      const a = i * (Math.PI / 2);
      this.actors.push({ f, x: 0, y: st.chorus.y, z: st.chorus.cz, heading: 0, ph: i * 1.7, home: [0, st.chorus.y, st.chorus.cz, 0], chorus: true, a });
      this.group.add(f.root);
    }
  }

  /** la file est là (ou on ne l'attend plus) : les portes s'ouvrent un peu après */
  ready() { this.came = true; }

  update(dt: number) {
    if (this.done) return;
    this.t += dt; this.T += dt;
    const ph = this.phase;
    if (ph === 'queue' && (this.t > QUEUE_MAX || (this.came && this.t > QUEUE_MIN))) { this.go('enter'); this.crowd = 'in'; this.ev.bell?.(); }
    else if (ph === 'enter' && this.t > ENTER) { this.go('act1'); this.crowd = 'show'; this.ev.music?.(); }
    else if (ph === 'act1' && this.t > ACT) { this.go('break'); this.ev.applause?.(0.6); }
    else if (ph === 'break' && this.t > BREAK) { this.go('act2'); this.ev.music?.(); }
    else if (ph === 'act2' && this.t > ACT) { this.go('bows'); this.crowd = 'out'; this.bows(); }
    else if (ph === 'bows' && this.t > BOWS) { this.done = true; return; }
    this.stepLights(dt);
    this.stepActors(dt);
    this.stepFlowers(dt);
    this.sparks.update(dt);
    // des rires et des bravos pendant le jeu
    if ((this.phase === 'act1' || this.phase === 'act2') && (this.laughT -= dt) <= 0) { this.laughT = 3 + this.rnd() * 4; this.ev.applause?.(0.25); }
  }

  private go(p: PlayView['phase']) { this.phase = p; this.t = 0; }

  /** Les lampes s'allument une à une pendant la queue, puis vacillent (les torches) ou brillent ; la lumière de la scène */
  private stepLights(dt: number) {
    const lit = this.phase !== 'queue' ? 99 : this.t;
    for (const [i, l] of this.lamps.entries()) {
      const k = Math.max(0, Math.min(1, (lit - l.on) * 3));
      const flick = this.age <= 2 ? 1 + Math.sin(this.T * 11 + i * 2.3) * 0.12 + Math.sin(this.T * 6.1 + i) * 0.08 : 1;
      l.glow.scale.setScalar(Math.max(0.0001, l.base * k * flick));
      (l.head.material as THREE.MeshBasicMaterial).color.setHex(k > 0.5 ? (this.age <= 2 ? 0xffa040 : this.age >= 5 ? 0xbaf4ff : 0xfff2c8) : 0x3a3a3a);
      if (this.age <= 2) l.head.scale.set(1, k > 0.5 ? flick * 1.2 : 0.6, 1);
    }
    // la guirlande s'allume d'un coup, en clignotant, quand toutes les lampes brillent
    if (this.bulbs) {
      const on = lit > this.lamps.reduce((m, l) => Math.max(m, l.on), 0) + 0.6;
      const blink = this.phase === 'bows' ? Math.floor(this.T * 4) % 2 : 0;
      const state = on ? 1 + blink : 0;
      if (state !== this.bulbOn) {
        this.bulbOn = state;
        const c = this.bulbs.geometry.getAttribute('color') as THREE.BufferAttribute;
        for (let i = 0; i < c.count; i++) {
          const warm = this.age >= 5 ? [[0.4, 1.4, 1.6], [1.6, 0.5, 1.4]][i % 2] : [1.7, 1.4, 0.7];
          const v = on ? (blink && i % 2 ? 0.3 : 1) : 0.12;
          c.setXYZ(i, warm[0] * v, warm[1] * v, warm[2] * v);
        }
        c.needsUpdate = true;
      }
    }
    // la lumière de la scène : pendant les actes, elle change de couleur au fil des scènes
    const playing = this.phase === 'act1' || this.phase === 'act2';
    this.stageGlow.forEach((g, i) => {
      const want = playing ? (this.stage ? 0.38 : 0.45 + Math.sin(this.T * 1.3 + i * 2) * 0.12) : this.phase === 'bows' ? 0.25 : 0;
      const cur = g.scale.x;
      const k = cur + (want - cur) * Math.min(1, dt * 2);
      g.scale.setScalar(Math.max(0.0001, k));
      g.material.opacity = Math.min(0.55, k * 1.3);
      if (!this.stage) g.material.color.setHSL(((this.T * 0.05 + i * 0.33) % 1), 0.8, 0.65);
    });
  }

  /** Les comédiens jouent : l'un parle, les autres écoutent, on change de place ; le chœur tourne autour de l'autel */
  private stepActors(dt: number) {
    const playing = this.phase === 'act1' || this.phase === 'act2';
    if (playing && (this.speakT -= dt) <= 0) {
      this.speakT = 2 + this.rnd() * 2;
      const cast = this.actors.filter((a) => !a.chorus);
      this.speaker = Math.floor(this.rnd() * cast.length);
      // de temps en temps, un comédien change de place sur les planches
      const mover = cast[Math.floor(this.rnd() * cast.length)];
      if (this.stage && mover) mover.x = mover.home[0] + (this.rnd() - 0.5) * 0.14;
    }
    let ci = 0;
    for (const [i, a] of this.actors.entries()) {
      let pose: FolkPose = 'idle';
      if (this.phase === 'bows') {
        pose = 'idle';
      } else if (a.chorus) {
        // le chœur : une ronde autour de l'autel, au pas, pendant les actes
        if (playing) { a.a += dt * 0.6; pose = 'walk'; }
        const st = this.stage!.chorus!;
        a.x = Math.cos(a.a) * st.r; a.z = st.cz + Math.sin(a.a) * st.r * 0.75;
        a.heading = Math.atan2(-Math.sin(a.a), Math.cos(a.a));
        ci++;
      } else if (playing) {
        pose = i === this.speaker ? (Math.sin(this.T * 0.7 + i) > 0.6 ? 'cheer' : 'talk') : 'idle';
      }
      a.ph += dt * (pose === 'walk' ? 6 : pose === 'cheer' ? 4 : 2.5);
      folkStep(a.f, a.ph, pose);
      // le salut : penchés en avant, ensemble
      a.f.body.rotation.x = this.phase === 'bows' ? Math.max(0, Math.sin(this.t * 1.6)) * 0.7 : 0;
      a.f.root.position.set(a.x, a.y, a.z);
      a.f.root.rotation.set(0, a.heading, 0);
    }
    void ci;
  }

  /** La troupe vient saluer devant l'entrée, et les premières fleurs volent */
  private bows() {
    const n = this.actors.length;
    this.actors.forEach((a, i) => {
      a.x = (i - (n - 1) / 2) * 0.12; a.z = BOW_Z + (i % 2) * 0.03; a.y = this.ground(a.x, a.z) + 0.01; a.heading = 0;
      a.f.root.visible = true;
    });
    this.ev.applause?.(1);
    this.ev.roar?.(0.6);
    this.sparks.burst(40, 0, 0.35, BOW_Z, 0xfff2c8, 0.5, 1.4, 0.4, 0.4, this.rnd);
  }

  /** Les fleurs lancées par le public, de l'arc devant la façade vers la troupe ; elles restent au sol */
  private stepFlowers(dt: number) {
    if (this.phase === 'bows' && this.thrown < 28 && this.t > 1 && this.rnd() < dt * 7) this.throwOne();
    for (const f of this.flowers) {
      if (f.t >= f.dur) continue;
      f.t = Math.min(f.dur, f.t + dt);
      const u = f.t / f.dur;
      f.m.position.lerpVectors(f.from, f.to, u);
      f.m.position.y += Math.sin(u * Math.PI) * 0.45;
      f.m.rotation.set(u * f.spin, u * f.spin * 0.6, 0);
      if (u >= 1) f.m.rotation.set(Math.PI / 2, f.spin, 0);
    }
  }

  private throwOne() {
    if (!this.flowerGeo.length) {
      for (const c of FLOWERS) { const p = new Parts(); p.box(0.006, 0.06, 0.006, 0, -0.06, 0, 0x3a8a3a); p.box(0.03, 0.006, 0.012, 0.012, -0.04, 0, 0x4a9a4a); p.sphere(0.024, 0, 0.0, 0, c, 1); this.flowerGeo.push(p.build(false).body); }
    }
    const a = (this.rnd() - 0.5) * 1.8, r = 1.6 + this.rnd() * 0.3, n = this.actors.length;
    const from = new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r);
    const to = new THREE.Vector3((this.rnd() - 0.5) * (n * 0.12 + 0.1), 0, BOW_Z + 0.06 + this.rnd() * 0.14);
    from.y = this.ground(from.x, from.z) + 0.18; to.y = this.ground(to.x, to.z) + 0.012;
    const m = new THREE.Group();
    const mesh = new THREE.Mesh(this.flowerGeo[this.thrown % this.flowerGeo.length], mats.body);
    mesh.castShadow = true;
    m.add(mesh);
    m.position.copy(from);
    this.group.add(m);
    this.flowers.push({ m, t: 0, dur: 0.7 + this.rnd() * 0.3, from, to, spin: 4 + this.rnd() * 6 });
    this.thrown++;
  }

  board() {
    if (this.phase === 'queue') return `🎭 <b>${tr('Les spectateurs font la queue')}</b><small>${tr('« {title} »', { title: this.title })}</small>`;
    if (this.phase === 'enter') return `🎭 <b>${tr('Les portes s’ouvrent')}</b><small>${tr('« {title} »', { title: this.title })}</small>`;
    if (this.phase === 'break') return `🎭 <b>${tr('Entracte')}</b>`;
    if (this.phase === 'bows') return `🎭 <b>${tr('Bravo ! La troupe salue')}</b>`;
    return `🎭 <b>${tr('« {title} »', { title: this.title })}</b><small>${tr(this.phase === 'act1' ? 'Premier acte' : 'Second acte')}</small>`;
  }

  dispose() {
    this.sparks.dispose();
    for (const l of this.lamps) { l.glow.material.dispose(); (l.head.material as THREE.Material).dispose(); }
    for (const g of this.stageGlow) g.material.dispose();
    if (this.bulbs) { this.bulbs.geometry.dispose(); (this.bulbs.material as THREE.Material).dispose(); }
    for (const g of this.flowerGeo) g.dispose();
    disposeTree(this.group);
  }
}
