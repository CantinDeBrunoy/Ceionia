import { tr } from '../i18n';
import { mapDef } from '../world/mapgen';
import { AGES } from '../build/catalog';

export interface Settings {
  dayLen: number;
  seasonLen: number;
  speed: number;
  musicVol: number;
  sfxVol: number;
  /** volume des ambiances (nature et bruitages de proximité) ; absent : 0,5 */
  ambVol?: number;
  /** échelle des volumes (`VOL_V` de `audio.ts`) ; absente : ancienne échelle, plus forte, dont les volumes sont oubliés */
  volV?: number;
  /** musique activée ; lue seulement si `musicChosen` (les anciennes sauvegardes notaient `false` sans choix du joueur) */
  music?: boolean;
  /** le joueur a lui-même allumé ou coupé la musique ; absent = musique allumée */
  musicChosen?: boolean;
  /** sons et ambiances activés ; lu seulement si `sfxChosen` (les anciennes sauvegardes notaient `false` sans choix du joueur) */
  sfx?: boolean;
  /** le joueur a lui-même allumé ou coupé les sons ; absent = sons allumés */
  sfxChosen?: boolean;
  /** qualité graphique : halo, brume, densité des particules, finesse de l'image, ombres, distance d'affichage des détails */
  quality?: Quality;
  /** réglage « Auto » : palier atteint à la dernière partie (on repart de là) */
  autoLevel?: number;
  /** catastrophes naturelles : lave et incendies détruisent les bâtiments, le volcan se réveille de lui-même */
  disasters?: boolean;
  /** routes posées d'elles-mêmes jusqu'aux nouveaux bâtiments */
  autoRoads?: boolean;
  /** ressources illimitées : bois, pierre et minerai ne manquent jamais (rien ne se paie) */
  unlimited?: boolean;
  /** flèches d'amélioration au-dessus des bâtiments : masquées si vrai */
  hideUpBadges?: boolean;
  /** petits objectifs de la barre du haut masqués ; absent : affichés */
  hideGoals?: boolean;
  /** effets de la météo masqués (pluie, neige qui tombe, brouillard et brume) ; absents : affichés. Le temps qu'il fait continue */
  hideRain?: boolean;
  hideSnow?: boolean;
  hideFog?: boolean;
  /** catastrophes coupées une à une (crues, séismes, pluies de météorites) ; absentes : elles peuvent venir */
  noFlood?: boolean;
  noQuake?: boolean;
  noMeteor?: boolean;
  /** la cinématique d'ouverture coupée (une partie neuve commence sans elle) ; absent : elle se joue */
  noIntro?: boolean;
  /** sensibilité de la vue (`CameraRig.sens`, 0,4 à 2,5) ; absente : 1 */
  camSens?: number;
  /** la vue défile quand la souris touche le bord de l'écran ; absent : oui (décision de l'auteur, 22 nov. 2026) */
  edgeScroll?: boolean;
  /** les saisons éteintes (0 printemps … 3 hiver), que l'horloge saute ; absent : aucune */
  seasonsOff?: number[];
}

/** La sensibilité de la vue lue d'une sauvegarde : un nombre dans ses bornes, sinon 1 */
export const readCamSens = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 1);
/** Les saisons éteintes lues d'une sauvegarde : des indices de 0 à 3, sans doublon (n'importe quoi d'autre : aucune) */
export const readSeasonsOff = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < 4))] : []);

/** « auto » : la qualité s'ajuste d'elle-même aux images qui traînent (voir `render/adaptive`) */
export type Quality = 'auto' | 'high' | 'medium' | 'low';

export interface SaveData {
  v: 1;
  map: number;
  seed: number;
  world: any;
  age: number;
  pop: number;
  seasonT: number;
  hour: number;
  /** jours écoulés (écran de victoire) ; absent dans les anciennes sauvegardes : 0 */
  days?: number;
  /** la partie était en pause ; absent : en marche */
  paused?: boolean;
  settings: Settings;
  savedAt: number;
}

const KEY = (map: number) => `village-lowpoly:v1:slot:${map}`;
/** une sauvegarde illisible, mise de côté au lancement d'une partie (la nouvelle ne l'écrase pas) */
const ASIDE_KEY = (map: number) => `village-lowpoly:v1:aside:${map}`;
const SETTINGS_KEY = 'village-lowpoly:v1:settings';

export function saveSlot(d: SaveData): boolean {
  try { localStorage.setItem(KEY(d.map), JSON.stringify(d)); return true; } catch { return false; }
}

export function loadSlot(map: number): SaveData | null {
  return readSlot(map).save;
}

/** Lit l'emplacement sans rien changer : la sauvegarde, ou la raison pour laquelle elle est illisible (`error`) ; rien : deux null */
export function readSlot(map: number): { save: SaveData | null; error: string | null } {
  let s: string | null;
  try { s = localStorage.getItem(KEY(map)); } catch { return { save: null, error: null }; }
  if (!s) return { save: null, error: null };
  try { return { save: validate(JSON.parse(s)), error: null }; }
  catch (e) { return { save: null, error: e instanceof SyntaxError ? tr('Fichier de sauvegarde invalide') : (e as Error).message || tr('Fichier de sauvegarde invalide') }; }
}

/**
 * Lit l'emplacement au lancement d'une partie : une sauvegarde illisible est mise de côté (`asideSlot`), pour que la partie
 * neuve qui la remplace ne l'écrase pas ; `error` dit pourquoi, à montrer au joueur
 */
export function openSlot(map: number): { save: SaveData | null; error: string | null } {
  const r = readSlot(map);
  if (r.error) setAside(map);
  return r;
}

/**
 * Met de côté le contenu de l'emplacement (une seule copie : la plus récente) ; déplacé plutôt que copié, pour ne pas doubler
 * la place prise dans le stockage. false si le navigateur refuse (l'emplacement reste alors tel quel)
 */
export function setAside(map: number): boolean {
  try {
    const s = localStorage.getItem(KEY(map));
    if (!s) return false;
    localStorage.removeItem(KEY(map));
    try { localStorage.setItem(ASIDE_KEY(map), s); return true; }
    catch { localStorage.setItem(KEY(map), s); return false; }
  } catch { return false; }
}

/** La sauvegarde mise de côté (le texte brut), ou null */
export function asideSlot(map: number): string | null {
  try { return localStorage.getItem(ASIDE_KEY(map)); } catch { return null; }
}

/** Ce que la sauvegarde garde de l'horloge : date, heure, jours écoulés, pause */
export function clockOf(t: { seasonT: number; hour: number; days: number; paused: boolean }) {
  return { seasonT: t.seasonT, hour: t.hour, days: t.days, paused: t.paused };
}

/** Relit l'horloge d'une sauvegarde (les anciennes n'ont ni jours ni pause : jour 0, en marche) */
export function readClock(t: { seasonT: number; hour: number; days: number; paused: boolean }, d: Partial<Pick<SaveData, 'seasonT' | 'hour' | 'days' | 'paused'>>) {
  t.seasonT = d.seasonT!; t.hour = d.hour!;
  t.days = Number.isFinite(d.days) ? Math.max(0, Math.floor(d.days!)) : 0;
  t.paused = d.paused === true;
}

export function deleteSlot(map: number) {
  try { localStorage.removeItem(KEY(map)); } catch { /* ignore */ }
}

export function validate(d: any): SaveData {
  if (!d || d.v !== 1 || typeof d.map !== 'number' || !d.world || !Array.isArray(d.world.heights)) throw new Error(tr('Fichier de sauvegarde invalide'));
  // seule reste la carte du continent ; les cartes sont passées de 48 à 96 puis 192 cases de côté (les tailles d'aujourd'hui
  // sont dans `sizes` : une partie garde la sienne)
  const def = mapDef(d.map);
  if (!def) throw new Error(tr('Sauvegarde d’une carte qui n’existe plus (seul le continent reste)'));
  if (!def.sizes.includes(d.world.n)) throw new Error(tr('Sauvegarde d’une ancienne version (carte plus petite)'));
  // l'âge et la population sont repris tels quels au chargement : un âge hors de la liste (fichier abîmé ou retouché) faisait
  // planter la partie juste après ; on les ramène dans leurs bornes (âge entier de la liste, population positive)
  const age = Number(d.age), pop = Number(d.pop);
  d.age = Number.isFinite(age) ? Math.min(AGES.length - 1, Math.max(0, Math.round(age))) : 0;
  d.pop = Number.isFinite(pop) ? Math.max(0, pop) : 0;
  return d as SaveData;
}

export function exportSave(d: SaveData) {
  download(JSON.stringify(d), `ceionia-${new Date().toISOString().slice(0, 10)}.json`);
}

/** Télécharge la sauvegarde mise de côté, telle quelle (pour la réparer ou l'envoyer) ; false s'il n'y en a pas */
export function exportAside(map: number): boolean {
  const s = asideSlot(map);
  if (!s) return false;
  download(s, `ceionia-illisible-${new Date().toISOString().slice(0, 10)}.json`);
  return true;
}

function download(text: string, name: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/** Une sauvegarde pèse quelques mégaoctets : au-delà, ce n'en est pas une, et la lire saturerait la mémoire de l'onglet */
export const MAX_SAVE_FILE = 64 * 1024 * 1024;

export async function readSaveFile(file: File): Promise<SaveData> {
  if (file.size > MAX_SAVE_FILE) throw new Error(tr('Fichier de sauvegarde invalide'));
  const text = await file.text();
  return validate(JSON.parse(text));
}

/** Quand la partie a été sauvegardée, dit simplement (« sauvegardé il y a 5 min », « hier », « le 3 mars ») ; `now` pour les tests */
export function savedAgo(at: number, now = Date.now()): string {
  if (!Number.isFinite(at) || at <= 0) return '';
  const min = Math.floor((now - at) / 60000);
  if (min < 1) return tr('sauvegardé à l’instant');
  if (min < 60) return tr('sauvegardé il y a {n} min', { n: min });
  const d0 = new Date(now), d1 = new Date(at);
  // jours de calendrier entre les deux minuits (arrondis : un changement d'heure ne décale rien)
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(d0) - midnight(d1)) / 86400000);
  if (days <= 0) return tr('sauvegardé il y a {n} h', { n: Math.floor(min / 60) });
  if (days === 1) return tr('sauvegardé hier');
  if (days < 7) return tr('sauvegardé il y a {n} jours', { n: days });
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'].map((m) => tr(m));
  const y = d1.getFullYear() !== d0.getFullYear() ? ` ${d1.getFullYear()}` : '';
  return tr('sauvegardé le {d} {m}{y}', { d: d1.getDate() === 1 ? tr('1er') : d1.getDate(), m: mois[d1.getMonth()], y });
}

export function loadSettings(): Partial<Settings> {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; }
}
export function saveSettings(s: Settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
