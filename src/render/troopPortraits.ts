import * as THREE from 'three';
import { makeSoldier, soldierStep } from './soldiers';
import { makeRider, rideStep, armorStep } from './riders';
import { makeHoverTank, hoverStep } from './futureTroops';
import { troopLook } from './battleUnits';
import { mats } from './materials';
import { TROOPS, type TroopKind } from '../sim/army';

/**
 * Les portraits des troupes pour la barre du bas : le modèle 3D du soldat de l'époque (celui de la bataille), en pied, de
 * trois quarts face, sur fond transparent, sous une lumière douce. Un portrait par sorte et par âge, fait à la demande (un
 * par moment de répit du navigateur, jamais pendant une image), gardé en cache sous forme d'URL d'image. Un seul petit
 * moteur de rendu hors écran sert à tous ; il est libéré quand la file est vide depuis un moment, et refait au besoin.
 *
 * Un dessin peut remplacer le portrait fait au rendu : `public/troops/{clé}.webp`, déclaré dans `TROOP_ART` (clé :
 * `soldier-1`, `archer-3`… voir `portraitKey`). Taille conseillée : 168 × 224 px (3:4), fond transparent, le soldat en pied.
 */

/** Largeur et hauteur d'un portrait (px) : de quoi rester net à deux fois la taille de la carte */
export const PORTRAIT_W = 168, PORTRAIT_H = 224;

/** Les dessins fournis (`public/troops/{clé}.webp`) qui remplacent le portrait fait au rendu */
export const TROOP_ART = new Set<string>([]);

/** La clé d'un portrait : la sorte et l'âge du modèle (une troupe ne se recrute pas avant son âge d'origine) */
export function portraitKey(kind: TroopKind, age: number) {
  return `${kind}-${Math.min(5, Math.max(TROOPS[kind].age, age))}`;
}

const done = new Map<string, string>();
const queue: { key: string; kind: TroopKind; age: number }[] = [];
const queued = new Set<string>();
/** le rendu hors écran a échoué (pas de WebGL) : on garde les pictos */
let broken = false;
let pumping = false;
let idleTimer = 0;

/**
 * L'image du portrait d'une troupe à cet âge (URL), ou null tant qu'il n'est pas prêt (il est alors mis en file ; la barre
 * du bas, redessinée plusieurs fois par seconde, le prend dès qu'il l'est)
 */
export function troopPortrait(kind: TroopKind, age: number): string | null {
  const key = portraitKey(kind, age);
  if (TROOP_ART.has(key)) return `./troops/${key}.webp`;
  const url = done.get(key);
  if (url || broken) return url ?? null;
  if (!queued.has(key) && typeof document !== 'undefined') {
    queued.add(key);
    queue.push({ key, kind, age: +key.split('-')[1] });
    clearTimeout(idleTimer);
    pump();
  }
  return null;
}

/** Un portrait à chaque moment de répit du navigateur */
function pump() {
  if (pumping || !queue.length) return;
  pumping = true;
  const next = () => {
    const job = queue.shift();
    if (!job) { pumping = false; return; }
    void render(job).finally(() => { pumping = false; if (queue.length) pump(); else scheduleRelease(); });
  };
  const ric = (window as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(next, { timeout: 800 }); else window.setTimeout(next, 120);
}

// ---------- Le petit moteur de rendu, partagé ----------

interface Stage { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; body: THREE.Material; glow: THREE.Material }
let stage: Stage | null = null;

function makeStage(): Stage | null {
  try {
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(1);
    renderer.setSize(PORTRAIT_W, PORTRAIT_H, false);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.NeutralToneMapping;
    const scene = new THREE.Scene();
    // lumière douce : un ciel chaud, une clé de trois quarts, un contre-jour léger qui détache la silhouette
    scene.add(new THREE.HemisphereLight(0xfff4e2, 0x6a5848, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-2, 3, 4);
    const rim = new THREE.DirectionalLight(0xffe2b0, 1.1);
    rim.position.set(3, 2, -3);
    scene.add(key, rim);
    const camera = new THREE.PerspectiveCamera(22, PORTRAIT_W / PORTRAIT_H, 0.01, 100);
    // les matériaux du jeu portent la neige, l'eau, les lumières de la nuit : le portrait prend des matériaux simples
    const body = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0 });
    const glow = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7, metalness: 0, emissive: new THREE.Color(0xffc46b), emissiveIntensity: 0.25 });
    return { renderer, scene, camera, body, glow };
  } catch {
    return null;
  }
}

/** Libère le moteur de rendu quand la file est vide depuis 10 s (il sera refait au prochain portrait, au passage d'âge) */
function scheduleRelease() {
  clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    if (queue.length || pumping || !stage) return;
    stage.renderer.dispose();
    stage.renderer.forceContextLoss();
    (stage.body as THREE.Material).dispose();
    stage.glow.dispose();
    stage = null;
  }, 10000);
}

/** Le modèle de la troupe tel qu'en bataille, au repos, et ce qu'il faut ajouter à côté (les drones du pilote) */
function model(kind: TroopKind, age: number): THREE.Object3D[] {
  const look = troopLook(kind, age);
  if (look.mount) {
    const r = look.mount === 'hover' ? makeHoverTank(0) : makeRider(look.era, 0);
    if (r.hover) hoverStep(r, 0.4, 0, -0.06, 0, 0);
    else if (r.turret) armorStep(r, 0, 0, -0.1, 0);
    else rideStep(r, 0, 0, 'rest');
    return [r.root];
  }
  // (le pilote de drones vient sans ses drones : ils volent trop loin de lui, le portrait rapetissait le pilote)
  const s = makeSoldier(look.era, 0, false, look.role);
  soldierStep(s, 0.6, 'guard');
  return [s.root];
}

async function render(job: { key: string; kind: TroopKind; age: number }) {
  if (!stage) stage = makeStage();
  if (!stage) { broken = true; return; }
  const { renderer, scene, camera, body, glow } = stage;
  let parts: THREE.Object3D[];
  try { parts = model(job.kind, job.age); } catch { queued.delete(job.key); return; }
  const pivot = new THREE.Group();
  for (const p of parts) pivot.add(p);
  // les matériaux du jeu cèdent la place aux matériaux simples du portrait (les géométries, partagées, ne sont pas touchées)
  pivot.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.material === mats.body) m.material = body;
    else if (m.material === mats.glow) m.material = glow;
    m.castShadow = false;
  });
  // de trois quarts face (le modèle regarde vers +z ; la caméra est devant, un peu au-dessus)
  pivot.rotation.y = 0.55;
  scene.add(pivot);
  pivot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(pivot), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const fov = THREE.MathUtils.degToRad(camera.fov), aspect = camera.aspect;
  // la hauteur visible tient le modèle entier (en largeur aussi : le cheval, le char), avec une petite marge
  const h = Math.max(size.y, size.x / aspect * 0.9, size.z / aspect * 0.7) * 1.04;
  const dist = h / 2 / Math.tan(fov / 2) + size.z / 2;
  const elev = 0.16;
  camera.position.set(c.x, c.y + Math.sin(elev) * dist, c.z + Math.cos(elev) * dist);
  camera.lookAt(c.x, c.y - size.y * 0.02, c.z);
  camera.near = dist / 20; camera.far = dist * 4;
  camera.updateProjectionMatrix();
  try {
    // les shaders du petit moteur se compilent d'abord sans bloquer (KHR_parallel_shader_compile) : compilés au premier
    // rendu, ils figeaient le jeu 0,3 à 0,9 s à l'arrivée sur l'île (la barre de l'île demande les portraits)
    await renderer.compileAsync(scene, camera);
    renderer.render(scene, camera);
    // (l'image est copiée à l'appel de toBlob : la scène peut être vidée tout de suite)
    const wait = new Promise<Blob | null>((ok) => renderer.domElement.toBlob(ok, 'image/webp', 0.92));
    scene.remove(pivot);
    const blob = await wait;
    if (blob) done.set(job.key, URL.createObjectURL(blob));
    else broken = !done.size;
  } catch {
    scene.remove(pivot);
    broken = !done.size;
  }
}
