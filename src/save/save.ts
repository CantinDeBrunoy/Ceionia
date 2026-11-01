import { MAPS } from '../world/mapgen';

export interface Settings {
  dayLen: number;
  seasonLen: number;
  speed: number;
  musicVol: number;
  sfxVol: number;
  /** son activé : coupé par défaut tant que le joueur ne l'a pas allumé dans les réglages */
  music?: boolean;
  sfx?: boolean;
  /** qualité graphique : halo, brume et densité des particules */
  quality?: Quality;
  /** catastrophes naturelles : lave et incendies détruisent les bâtiments, le volcan se réveille de lui-même */
  disasters?: boolean;
  /** routes posées d'elles-mêmes jusqu'aux nouveaux bâtiments */
  autoRoads?: boolean;
}

export type Quality = 'high' | 'medium' | 'low';

export interface SaveData {
  v: 1;
  map: number;
  seed: number;
  world: any;
  age: number;
  pop: number;
  seasonT: number;
  hour: number;
  settings: Settings;
  savedAt: number;
}

const KEY = (map: number) => `village-lowpoly:v1:slot:${map}`;
const SETTINGS_KEY = 'village-lowpoly:v1:settings';

export function saveSlot(d: SaveData): boolean {
  try { localStorage.setItem(KEY(d.map), JSON.stringify(d)); return true; } catch { return false; }
}

export function loadSlot(map: number): SaveData | null {
  try {
    const s = localStorage.getItem(KEY(map));
    if (!s) return null;
    return validate(JSON.parse(s));
  } catch { return null; }
}

export function deleteSlot(map: number) {
  try { localStorage.removeItem(KEY(map)); } catch { /* ignore */ }
}

export function validate(d: any): SaveData {
  if (!d || d.v !== 1 || typeof d.map !== 'number' || !d.world || !Array.isArray(d.world.heights)) throw new Error('Fichier de sauvegarde invalide');
  // les cartes sont passées de 48 à 96 cases de côté : les anciennes sauvegardes ne se chargent plus
  if (!MAPS[d.map] || d.world.n !== MAPS[d.map].size) throw new Error('Sauvegarde d’une ancienne version (carte plus petite)');
  return d as SaveData;
}

export function exportSave(d: SaveData) {
  const blob = new Blob([JSON.stringify(d)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `village-lowpoly-carte${d.map + 1}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export async function readSaveFile(file: File): Promise<SaveData> {
  const text = await file.text();
  return validate(JSON.parse(text));
}

export function loadSettings(): Partial<Settings> {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; }
}
export function saveSettings(s: Settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
