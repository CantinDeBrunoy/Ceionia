import { KindId, BuildCat } from '../build/catalog';

/**
 * Icônes au trait (SVG, couleur du texte) : interface, besoins, saisons, outils et bâtiments. Elles remplacent les emoji,
 * dont le rendu varie d'un système à l'autre et jure avec le thème
 */
const P: Record<string, string> = {
  // interface
  pointer: '<path d="M4 3l7 17 2.5-7.5L21 10z"/>',
  road: '<path d="M5 21L9 3M19 21L15 3M12 5v2M12 11v2M12 17v2"/>',
  demolish: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
  hand: '<path d="M18 11V7a2 2 0 0 0-4 0v4"/><path d="M14 10V5a2 2 0 0 0-4 0v5"/><path d="M10 10.5V7a2 2 0 0 0-4 0v7"/><path d="M18 9a2 2 0 1 1 4 0v5a8 8 0 0 1-8 8h-1c-2.6 0-4.3-.9-5.8-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  pickaxe: '<path d="M14 10L5 19"/><path d="M6 5c4-2 9-1.5 13 2"/><path d="M12 7l5 5"/><path d="M19 7c1.5 3 1.8 7 .5 10.5"/>',
  relief: '<path d="M8 4l4 8 4-5 6 14H2z"/>',
  tree: '<path d="M12 22v-5"/><path d="M12 2L6 10h3l-4 7h14l-4-7h3z"/>',
  houses: '<path d="M2 21h20"/><path d="M4 21V10l5-4 5 4v11"/><path d="M14 21v-7l3.5-3 3.5 3v7"/><path d="M8 21v-4h2v4"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  // équipement des expéditions
  spear: '<path d="M4 20L17 7"/><path d="M15 4l5 0 0 5-3 -2z"/><path d="M6 15l3 3"/>',
  bow: '<path d="M6 3c8 3 12 7 15 15"/><path d="M6 3L21 18"/><path d="M3 12l6-6"/><path d="M3 12h3M3 12v3"/>',
  sword: '<path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6M16 16l4 4M19 21l2-2"/>',
  rifle: '<path d="M2 14h13l6-5v3l-4 4H9l-2 4H4l1-4H2z"/><path d="M9 14v-2h4"/>',
  rope: '<circle cx="12" cy="10" r="6"/><circle cx="12" cy="10" r="2.5"/><path d="M15 15c1 3 3 5 6 6"/>',
  torch: '<path d="M10 22l2-10 2 10z"/><path d="M12 9c-2.5-1.5-2.5-4 0-7 2.5 3 2.5 5.5 0 7z"/>',
  boat: '<path d="M2 15h20l-3 5H5z"/><path d="M12 15V3l6 9h-6"/>',
  kit: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M12 10v7M8.5 13.5h7"/>',
  shield: '<path d="M12 3l8 3v6c0 4.8-3.4 7.9-8 9-4.6-1.1-8-4.2-8-9V6z"/><path d="M12 7.5v10M8 11.5h8"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  pen: '<path d="M3 20V9M9 20V9M15 20V9M21 20V9"/><path d="M2 12h20M2 17h20"/><path d="M3 9l0-2M9 9V7M15 9V7M21 9V7"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  camera: '<path d="M14.5 5h-5L8 7H4.5A1.5 1.5 0 0 0 3 8.5v9A1.5 1.5 0 0 0 4.5 19h15a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 19.5 7H16z"/><circle cx="12" cy="13" r="3.2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5l1.6 2.6 3-.6.6 3 2.6 1.6-1.4 2.9 1.4 2.9-2.6 1.6-.6 3-3-.6L12 21.5l-1.6-2.6-3 .6-.6-3-2.6-1.6 1.4-2.9-1.4-2.9 2.6-1.6.6-3 3 .6z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.5-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3"/><path d="M8 21v-7h8v7"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 20h16"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5"/><path d="M4 4h16"/>',
  restart: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  // besoins
  bread: '<path d="M5 11a7 5 0 0 1 14 0c0 1.2-.7 2-1.6 2.3V19H6.6v-5.7C5.7 13 5 12.2 5 11z"/><path d="M9.5 9.5l1 1M13 8.5l1 1"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  house: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  hammer: '<path d="M14 4l6 6-2 2-6-6z"/><path d="M13 7L4 16l3 3 9-9"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9.5h.01M15 9.5h.01"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
  // saisons et météo
  spring: '<path d="M12 21v-8"/><path d="M7 4l2.5 3L12 4l2.5 3L17 4v5a5 5 0 0 1-10 0z"/><path d="M12 18c-2 0-4-1-5-3M12 18c2 0 4-1 5-3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  leaf: '<path d="M5 19c0-9 6-15 15-15 0 9-6 15-15 15z"/><path d="M5 19l9-9"/>',
  snowflake: '<path d="M12 2v20M4 7l16 10M20 7L4 17"/><path d="M9 4l3 2 3-2M9 20l3-2 3 2"/>',
  rain: '<path d="M7 15a4 4 0 0 1 .5-8 5.5 5.5 0 0 1 10.5 1.5A3.5 3.5 0 0 1 17.5 15z"/><path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3"/>',
  snow: '<path d="M7 15a4 4 0 0 1 .5-8 5.5 5.5 0 0 1 10.5 1.5A3.5 3.5 0 0 1 17.5 15z"/><path d="M9 19h.01M13 19h.01M17 19h.01M11 21.5h.01M15 21.5h.01"/>',
  fog: '<path d="M3 9h18M5 13h14M3 17h18"/>',
  // rayons de construction
  wheat: '<path d="M12 22V9"/><path d="M12 9c-2-1-3-2.6-3-4.6 2 0 3 1.4 3 3 0-1.6 1-3 3-3 0 2-1 3.6-3 4.6z"/><path d="M12 14c-2-1-3-2.4-3-4.4 2 0 3 1.4 3 3 0-1.6 1-3 3-3 0 2-1 3.4-3 4.4z"/><path d="M12 19c-2-1-3-2.4-3-4.4 2 0 3 1.4 3 3 0-1.6 1-3 3-3 0 2-1 3.4-3 4.4z"/>',
  cross: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>',
  columns: '<path d="M3 21h18"/><path d="M4 10h16"/><path d="M12 3l9 5H3z"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8"/>',
  // bâtiments
  well: '<path d="M3 7l9-4 9 4"/><path d="M6 7v6M18 7v6M12 7v4"/><path d="M4 13h16v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
  lamp: '<path d="M12 22V10"/><path d="M9 22h6"/><path d="M8 6h8l-1 4H9z"/><path d="M12 6V3"/>',
  barn: '<path d="M3 21V10l4-5h10l4 5v11z"/><path d="M3 21h18"/><path d="M9 21v-6h6v6"/><path d="M9 15l6 6M15 15l-6 6"/>',
  fish: '<path d="M3 12c3-4 8-5 12-3l4-3v12l-4-3c-4 2-9 1-12-3z"/><path d="M8 11h.01"/>',
  anvil: '<path d="M4 8h12a4 4 0 0 1-4 4h-1v3h3v3H7v-3h3v-3H8a4 4 0 0 1-4-4z"/><path d="M16 8h4"/>',
  windmill: '<path d="M10 21l1-9h2l1 9z"/><path d="M12 9L6 3M12 9l6-6M12 9l-6 6M12 9l6 6"/>',
  hospital: '<path d="M3 21h18"/><path d="M5 21V8l7-4 7 4v13"/><path d="M12 8v6M9 11h6"/><path d="M10 21v-3h4v3"/>',
  book: '<path d="M2 5h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 5h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  campfire: '<path d="M12 3c2 3 4 4.5 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-4 0-7z"/><path d="M4 21l16-4M4 17l16 4"/>',
  castle: '<path d="M3 21V9h3V6h3v3h2V6h2v3h2V6h3v3h3v12z"/><path d="M10 21v-5a2 2 0 0 1 4 0v5"/>',
  horse: '<path d="M8 21v-5.5L4.5 13a1.6 1.6 0 0 1 .3-2.6L10 7l1-4 2.2 3C17 7 19.5 10.5 19.5 15v6"/><path d="M11 6.5c1.5-.5 2.6 0 3 1"/><circle cx="9.5" cy="10" r=".6"/>',
  hive: '<path d="M3 20h18"/><path d="M6 20c0-8.5 2.7-15 6-15s6 6.5 6 15"/><path d="M6.6 15.5h10.8M7.8 10.5h8.4"/><path d="M11 20v-2.2a1 1 0 0 1 2 0V20"/>',
  bath: '<path d="M3 12h18v2.5A5.5 5.5 0 0 1 15.5 20h-7A5.5 5.5 0 0 1 3 14.5z"/><path d="M6 12V6a2 2 0 0 1 3.8-.9"/><path d="M13 9c-1-1.2 1-2 0-3.5M17 9c-1-1.2 1-2 0-3.5"/><path d="M7 20l-1 2M17 20l1 2"/>',
  mug: '<path d="M5 9h10v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M15 12h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M5 9a2.5 2.5 0 0 1 3-3 3 3 0 0 1 5 0 2.3 2.3 0 0 1 2 3"/><path d="M9 13v4M11.5 13v4"/>',
  telescope: '<path d="M4 14.5l12-6 2 4-12 6z"/><path d="M16 8.5l3-1.5 2 4-3 1.5"/><path d="M2.5 15.3l1.5 3"/><path d="M11 15l-3.5 7M12 14.5l3.5 7.5"/>',
  // outils de terrain et de nature
  raise: '<path d="M3 20h18"/><path d="M5 20l7-9 7 9"/><path d="M12 3v5M9.5 5.5L12 3l2.5 2.5"/>',
  lower: '<path d="M3 14h4l5 6 5-6h4"/><path d="M12 3v8M9.5 8.5L12 11l2.5-2.5"/>',
  level: '<rect x="2" y="9" width="20" height="6" rx="2"/><path d="M10 12h4"/><path d="M7 9v6M17 9v6"/>',
  stairs: '<path d="M3 21h4v-4h4v-4h4V9h4V5h2"/>',
  waves: '<path d="M2 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  peaks: '<path d="M2 20l7-13 4 7 3-4 6 10z"/><path d="M7.5 10l1.5 1.5 1.5-1.5"/>',
  volcano: '<path d="M3 21l6-11h6l6 11z"/><path d="M10 6c0-2 2-2 2-4M14 6c0-1.5 1.5-2 1.5-3.5"/>',
  forest: '<path d="M8 21v-3M16 21v-4"/><path d="M8 3L4 11h2l-3 7h10l-3-7h2z"/><path d="M16 7l-3 6h2l-2 4h6l-2-4h2z"/>',
  rock: '<path d="M3 19l3-7 4-2 3 3 4-1 4 7z"/><path d="M10 10l1 4 2-1"/>',
  cave: '<path d="M2 20h20"/><path d="M4 20c0-8 3.5-14 8-14s8 6 8 14"/><path d="M9 20c0-4 1.3-7 3-7s3 3 3 7"/>',
  crack: '<path d="M3 4l5 5-2 3 5 4-1 4"/><path d="M14 4l2 4-3 2 4 4 3-1"/>',
  eraser: '<path d="M20 20H9l-6-6 10-10 8 8-7 8"/><path d="M7 12l6 6"/>',
  axe: '<path d="M14 3l7 7-4 4-7-7z"/><path d="M12 9L3 21"/>',
  train: '<rect x="5" y="3" width="14" height="13" rx="3"/><path d="M5 10h14M8 19l-2 3M16 19l2 3M9 13h.01M15 13h.01"/>',
  outpost: '<path d="M7 21l2-11h6l2 11"/><path d="M6 10h12l-1-3H7z"/><path d="M12 7V2l5 1.5-5 1.5"/><path d="M9.5 15h5"/><path d="M3 21h18"/>',
};

/** Icône au trait, de la couleur du texte */
export function ic(name: string, size = 20, stroke = 1.8): string {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? ''}</svg>`;
}

export const KIND_ICON: Record<KindId, string> = {
  house: 'house', well: 'well', lamp: 'lamp', farm: 'barn', pen: 'pen', pier: 'fish', workshop: 'anvil', mill: 'windmill',
  health: 'hospital', school: 'book', fire: 'flame', gather: 'campfire', temple: 'columns', landmark: 'castle',
  stable: 'horse', apiary: 'hive', baths: 'bath', tavern: 'mug', mine: 'pickaxe', observatory: 'telescope', outpost: 'outpost', lumber: 'axe', quarry: 'rock',
};
export const CAT_ICON: Record<BuildCat, string> = { home: 'house', prod: 'wheat', service: 'cross', life: 'columns' };
export const SEASON_ICONS = ['spring', 'sun', 'leaf', 'snowflake'];
