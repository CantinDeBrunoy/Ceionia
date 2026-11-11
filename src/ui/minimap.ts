import * as THREE from 'three';
import { N, VEG_FOREST, VEG_FIELD, VEG_GARDEN, VEG_ROCKS, BIOME_TAIGA, BIOME_DESERT, BIOME_TROPICAL, BIOME_MARSH, type World } from '../world/world';
import type { CameraRig } from '../core/camera';
import { tr } from '../i18n';

/** Pixels de la mini-carte par case */
const PX = 2;
/** Le fond (relief, eau, forêts, routes, bâtiments) se redessine au plus toutes les REDRAW_MS, et seulement si le monde a changé */
const REDRAW_MS = 1500;

/** Teinte du sol selon le biome : tempéré, taïga, désert, tropical, marais */
const GROUND: [number, number, number][] = [[150, 200, 110], [112, 150, 112], [226, 200, 140], [96, 182, 100], [128, 140, 92]];

/**
 * La mini-carte du coin bas droit : le continent vu du dessus (nord en haut), l'eau, les forêts, les champs, les routes et
 * les bâtiments, avec le cadre de ce que voit la caméra. Un clic (ou un glissé) y envoie la vue
 */
export class MiniMap {
  el: HTMLElement;
  private cv: HTMLCanvasElement;
  private base = document.createElement('canvas');
  private key = '';
  private drawnAt = -Infinity;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  /** (le monde et la caméra relus à chaque fois : une nouvelle partie peut les remplacer) */
  private get world() { return this.src.world; }
  private get cam() { return this.src.cam; }

  constructor(parent: HTMLElement, private src: { world: World; cam: CameraRig }, private onGo?: () => void) {
    const el = (this.el = document.createElement('div'));
    el.id = 'miniMap';
    el.className = 'panel';
    el.title = tr('Mini-carte : cliquer pour y envoyer la vue');
    el.innerHTML = '<canvas></canvas><span class="mmN" aria-hidden="true">N</span>';
    parent.appendChild(el);
    this.cv = el.querySelector('canvas')!;
    // un clic, ou un glissé maintenu, déplace la vue sur le point visé
    let held = false;
    const go = (e: PointerEvent) => {
      const r = this.cv.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * N, z = ((e.clientY - r.top) / r.height) * N;
      this.cam.goTo(Math.max(0, Math.min(N, x)), Math.max(0, Math.min(N, z)), this.cam.dist);
      this.draw();
    };
    this.cv.addEventListener('pointerdown', (e) => { held = true; this.cv.setPointerCapture(e.pointerId); go(e); this.onGo?.(); });
    this.cv.addEventListener('pointermove', (e) => { if (held) go(e); });
    const up = () => { held = false; };
    this.cv.addEventListener('pointerup', up);
    this.cv.addEventListener('pointercancel', up);
    // le cadre de la vue suit la caméra à chaque image (et non au rythme de l'interface, 4 fois par seconde : il sautait)
    const loop = () => { this.follow(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  /** La position de la caméra au dernier dessin du cadre : on ne redessine que si elle a bougé */
  private camKey = '';
  private follow() {
    if (!this.el.offsetParent || this.drawnAt === -Infinity) return;
    const c = this.cam.camera, p = c.position, q = c.quaternion;
    const key = `${p.x.toFixed(3)}|${p.y.toFixed(3)}|${p.z.toFixed(3)}|${q.x.toFixed(4)}|${q.y.toFixed(4)}|${q.z.toFixed(4)}|${c.aspect.toFixed(3)}|${this.cv.clientWidth}`;
    if (key === this.camKey) return;
    this.camKey = key;
    this.draw();
  }

  /** Appelée à chaque mise à jour de l'interface : le cadre de la vue, et le fond quand le monde a changé */
  update() {
    if (!this.el.offsetParent) return;
    const now = performance.now(), w = this.world;
    const key = `${N}|${w.version}|${w.buildings.size}|${w.terrainDirty ? now : ''}`;
    if (key !== this.key && now - this.drawnAt > REDRAW_MS) { this.key = key; this.drawnAt = now; this.drawBase(); this.draw(); }
  }

  /** Le fond : une couleur par case, ombrée par la pente */
  private drawBase() {
    const w = this.world, S = N * PX, b = this.base;
    if (b.width !== S) { b.width = b.height = S; }
    const g = b.getContext('2d')!, img = g.createImageData(S, S);
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        const k = w.ci(x, z), h = w.cellAvg(x, z), v = w.veg[k];
        let c: [number, number, number];
        if (w.occ[k]) c = [205, 92, 70];
        else if (w.road[k]) c = [214, 204, 180];
        else if (w.isWet(x, z)) { const d = Math.min(1, Math.max(0, -h / 2.5)); c = [128 - 50 * d, 190 - 45 * d, 222 - 25 * d]; }
        else if (h < 0.3) c = [236, 220, 172];
        else if (v === VEG_FOREST) c = w.biome[k] === BIOME_TAIGA ? [62, 110, 80] : w.biome[k] === BIOME_TROPICAL ? [46, 140, 70] : [78, 142, 70];
        else if (v === VEG_FIELD) c = [226, 196, 96];
        else if (v === VEG_GARDEN) c = [130, 196, 110];
        else if (v === VEG_ROCKS) c = [168, 162, 150];
        else {
          const base = GROUND[w.biome[k]] ?? GROUND[0], rock = Math.min(1, Math.max(0, (h - 3.5) / 3)), snow = Math.min(1, Math.max(0, (h - 7) / 1.2));
          const mix = (a: number, r: number) => a + (r - a) * rock + (250 - (a + (r - a) * rock)) * snow;
          c = [mix(base[0], 150), mix(base[1], 146), mix(base[2], 138)];
          if (w.biome[k] === BIOME_DESERT || w.biome[k] === BIOME_MARSH) c = [mix(base[0], 170), mix(base[1], 160), mix(base[2], 140)];
        }
        // la pente éclairée du nord-ouest
        const sh = 1 + ((w.h(x, z) - w.h(x + 1, z + 1)) * 0.12);
        for (let py = 0; py < PX; py++)
          for (let px = 0; px < PX; px++) {
            const i = ((z * PX + py) * S + x * PX + px) * 4;
            img.data[i] = Math.min(255, c[0] * sh); img.data[i + 1] = Math.min(255, c[1] * sh); img.data[i + 2] = Math.min(255, c[2] * sh); img.data[i + 3] = 255;
          }
      }
    g.putImageData(img, 0, 0);
  }

  /** Le fond, puis le cadre de la vue : les quatre coins de l'écran projetés sur le sol */
  private draw() {
    // la toile à la taille affichée (fois la densité de l'écran) : le cadre glisse au sous-pixel près
    const cv = this.cv, S = Math.max(N * PX, Math.round(cv.clientWidth * (window.devicePixelRatio || 1))), K = S / N;
    if (cv.width !== S) { cv.width = cv.height = S; }
    const g = cv.getContext('2d')!;
    g.clearRect(0, 0, S, S);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.base, 0, 0, S, S);
    const cam = this.cam.camera, t = this.cam.target, far = this.cam.dist * 4;
    this.plane.constant = -t.y;
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => {
      this.ray.setFromCamera(new THREE.Vector2(x, y), cam);
      const r = this.ray.ray, hit = r.intersectPlane(this.plane, new THREE.Vector3());
      // au-dessus de l'horizon (ou trop loin) : le point s'arrête à une distance raisonnable dans la direction du regard
      if (!hit || hit.distanceTo(r.origin) > far) { const d = r.direction.clone().setY(0).normalize(); return [t.x + d.x * far * 0.5, t.z + d.z * far * 0.5]; }
      return [hit.x, hit.z];
    });
    const frame = () => { pts.forEach(([x, z], i) => (i ? g.lineTo(x * K, z * K) : g.moveTo(x * K, z * K))); g.closePath(); };
    // hors du champ de vision, la carte s'assombrit ; dedans, elle s'éclaircit : la zone vue saute aux yeux
    g.beginPath();
    g.rect(0, 0, S, S);
    frame();
    g.fillStyle = 'rgba(16, 26, 46, 0.34)';
    g.fill('evenodd');
    g.beginPath();
    frame();
    g.fillStyle = 'rgba(255, 255, 255, 0.3)';
    g.fill();
    g.lineWidth = 2 * K / PX;
    g.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    g.shadowColor = 'rgba(20, 30, 50, 0.5)';
    g.shadowBlur = 3 * K / PX;
    g.stroke();
    g.shadowBlur = 0;
    // le point visé
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(t.x * K, t.z * K, 2.5 * K / PX, 0, Math.PI * 2); g.fill();
  }
}
