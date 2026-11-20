import type { World } from '../world/world';
import { KINDS, KindId, Building, sizeOf, lineOf } from '../build/catalog';
import { MISSIONS, Mission } from './missions';
import { kindOffered } from './diplomacy';
import { hash2 } from '../core/rng';
import { tr } from '../i18n';

/**
 * Les envies des habitants (fiche d'un habitant) : chacun a la sienne, tirée de son numéro et de son profil, et toujours vraie
 * autour de chez lui. Une décoration à deux pas de sa maison (banc, fleurs, fontaine…), un lieu trop loin ou absent (taverne,
 * bains, temple…), ou un bâtiment que le village ne connaît pas encore et qu'une expédition débloquerait : l'habitant devient
 * une raison de partir. Les déblocages se lisent dans le catalogue (`reqMission`) et dans les missions (`unlocks`), jamais dans
 * une liste écrite ici : une expédition qui ouvre les haies fera aussi demander des haies. Une envie comblée fait dire merci et
 * compte pour le bien-être du village (`WISH_JOY`, `World.wishesMet`, sauvegardé)
 */

export type WishType = 'decor' | 'place' | 'expedition';
export interface Wish { type: WishType; kind: KindId; mission?: string }

/** Les décorations qu'on aimerait à deux pas de chez soi (cases autour de la maison) */
export const DECOR_WANTS: KindId[] = ['bench', 'flowerbed', 'fountain', 'statue', 'lamp', 'hedge'];
export const DECOR_REACH = 3;
/** Les lieux qu'on aimerait à moins de `PLACE_REACH` cases de chez soi */
export const PLACES: KindId[] = ['gather', 'forum', 'tavern', 'baths', 'temple', 'theater', 'arena', 'circus', 'school', 'barber', 'stadium', 'waterpark', 'zoo', 'funfair', 'observatory', 'health'];
export const PLACE_REACH = 12;
/** Bien-être du village par envie comblée, et son plafond */
export const WISH_JOY = 0.1, WISH_JOY_MAX = 2;

/**
 * Ce que chaque profil préfère (ses envies pèsent trois fois plus) : le métier de l'habitant, ou `child` (un enfant), `old` (un
 * ancien)
 */
const PREF: Record<string, KindId[]> = {
  farmer: ['fountain', 'flowerbed', 'apiary', 'pen', 'hedge'], herder: ['pen', 'stable', 'fountain'], keeper: ['apiary', 'flowerbed'],
  merchant: ['forum', 'gather', 'tavern', 'lamp'], priest: ['temple', 'statue', 'flowerbed'], guard: ['lamp', 'tavern', 'arena'],
  firefighter: ['fountain', 'lamp'], healer: ['baths', 'flowerbed', 'fountain'], teacher: ['theater', 'school', 'observatory'],
  smith: ['tavern', 'arena'], miller: ['tavern', 'bench'], fisher: ['tavern', 'bench'], woodcutter: ['tavern', 'bench'], quarry: ['baths', 'tavern'],
  servant: ['theater', 'circus', 'bench'], child: ['school', 'circus', 'funfair', 'zoo', 'gather', 'fountain'], old: ['bench', 'baths', 'temple', 'flowerbed'],
};

/** La mission qui débloque ce genre (catalogue ou mission), si elle reste à faire et qu'on peut déjà la tenter à cet âge */
export function unlockingMission(w: World, k: KindId, age: number): Mission | null {
  const req = KINDS[k].reqMission;
  for (const m of MISSIONS) {
    if (m.id !== req && m.unlocks !== k) continue;
    if (w.missionDone(m.id)) return null;
    if (m.age > age || (m.requires?.missions ?? []).some((id) => !w.missionDone(id))) return null;
    return m;
  }
  return null;
}
/** Chaque mission qui débloque un bâtiment, et ce bâtiment (sa mission `unlocks`, sinon le genre dont c'est la `reqMission`) */
let unlockList: [Mission, KindId][] | null = null;
function unlocks() {
  if (unlockList) return unlockList;
  unlockList = [];
  for (const m of MISSIONS) {
    const k = m.unlocks ?? (Object.keys(KINDS) as KindId[]).find((x) => KINDS[x].reqMission === m.id);
    if (k) unlockList.push([m, k]);
  }
  return unlockList;
}

/** Un genre qu'on peut bâtir aujourd'hui (âge, âge maximal, proposé dans la partie, débloqué) */
function buildable(w: World, k: KindId, age: number) {
  const d = KINDS[k];
  if (d.minAge > age || (d.maxAge !== undefined && age > d.maxAge) || !kindOffered(w, k)) return false;
  return !d.reqMission || w.missionDone(d.reqMission);
}

/** Centres des bâtiments de chaque genre (avec leurs améliorations : un manoir est une maison), pour les distances */
export type Sites = Map<KindId, [number, number][]>;
export function sitesOf(w: World): Sites {
  const out: Sites = new Map();
  for (const b of w.buildings.values()) {
    const s = sizeOf(b), c: [number, number] = [b.x + s / 2, b.z + s / 2];
    for (const k of [...DECOR_WANTS, ...PLACES]) if (lineOf(k).includes(b.kind)) { const l = out.get(k) ?? []; l.push(c); out.set(k, l); }
  }
  return out;
}
/** Distance du centre de la maison au plus proche de ce genre (Infinity : aucun) */
function nearest(sites: Sites, k: KindId, x: number, z: number) {
  let best = Infinity;
  for (const [sx, sz] of sites.get(k) ?? []) best = Math.min(best, Math.hypot(sx - x, sz - z));
  return best;
}
/** Une décoration de ce genre à deux pas de la maison (son emprise, plus `DECOR_REACH` cases autour) */
function decorNear(w: World, k: KindId, home: Building) {
  const s = sizeOf(home), r = DECOR_REACH;
  for (let z = home.z - r; z < home.z + s + r; z++) for (let x = home.x - r; x < home.x + s + r; x++) if (w.buildingAt(x, z)?.kind === k) return true;
  return false;
}

/** L'envie est-elle comblée ? (la décoration est là, le lieu est à portée, l'expédition est réussie) */
export function wishMet(w: World, sites: Sites, home: Building | undefined, wish: Wish): boolean {
  if (wish.type === 'expedition') return !!wish.mission && w.missionDone(wish.mission);
  if (!home) return false;
  if (wish.type === 'decor') return decorNear(w, wish.kind, home);
  const s = sizeOf(home);
  return nearest(sites, wish.kind, home.x + s / 2, home.z + s / 2) <= PLACE_REACH;
}

/**
 * L'envie d'un habitant : parmi les envies vraies autour de chez lui (décoration absente à deux pas, lieu loin ou absent,
 * bâtiment qu'une expédition débloquerait), une tirée de son numéro (`id`) et de l'âge, celles de son profil pesant trois fois
 * plus ; null s'il n'a envie de rien
 */
export function wishFor(w: World, sites: Sites, home: Building | undefined, id: number, age: number, profile: string[]): Wish | null {
  if (!home) return null;
  const s = sizeOf(home), hx = home.x + s / 2, hz = home.z + s / 2, pref = new Set(profile.flatMap((p) => PREF[p] ?? []));
  const cand: [Wish, number][] = [], seen = new Set<KindId>();
  const add = (wish: Wish, weight: number) => { if (seen.has(wish.kind)) return; seen.add(wish.kind); cand.push([wish, weight * (pref.has(wish.kind) ? 3 : 1)]); };
  for (const k of [...DECOR_WANTS, ...PLACES]) {
    const m = unlockingMission(w, k, age);
    if (m) { add({ type: 'expedition', kind: k, mission: m.id }, 1.5); continue; }
    if (!buildable(w, k, age)) continue;
    if (DECOR_WANTS.includes(k)) { if (!decorNear(w, k, home)) add({ type: 'decor', kind: k }, 2); }
    else if (nearest(sites, k, hx, hz) > PLACE_REACH) add({ type: 'place', kind: k }, 2);
  }
  // les autres bâtiments qu'une expédition débloquerait (l'enclos, le rucher, l'écurie, l'usine automobile…)
  for (const [m, k] of unlocks()) {
    if (seen.has(k) || KINDS[k].minAge > age || !kindOffered(w, k) || unlockingMission(w, k, age)?.id !== m.id) continue;
    add({ type: 'expedition', kind: k, mission: m.id }, 1);
  }
  if (!cand.length) return null;
  const total = cand.reduce((n, [, x]) => n + x, 0);
  let r = hash2(id, age, 557) * total;
  for (const [wish, x] of cand) { r -= x; if (r <= 0) return wish; }
  return cand[cand.length - 1][0];
}

/** Pourquoi un lieu fait envie (la fin de la phrase) */
const PLACE_WHY: Partial<Record<KindId, string>> = {
  gather: 'pour retrouver les voisins', forum: 'pour faire mes courses', tavern: 'pour boire un verre après le travail', baths: 'pour se délasser le soir',
  temple: 'pour prier en paix', theater: 'pour voir un spectacle', arena: 'pour voir les champions', circus: 'pour rire un bon coup', school: 'pour apprendre à lire',
  barber: 'pour me faire beau', stadium: 'pour voir un match', waterpark: 'pour les chaudes journées', zoo: 'pour voir les bêtes du monde', funfair: 'pour les manèges',
  observatory: 'pour regarder les étoiles', health: 'pour se faire soigner sans aller loin',
};
/** Ce que dit une envie de décoration, genre par genre */
const DECOR_SAY: Partial<Record<KindId, string>> = {
  bench: 'Un banc près de chez moi, pour m’asseoir le soir, ce serait bien.', flowerbed: 'Il me faudrait des fleurs devant chez moi.',
  fountain: 'Une fontaine dans ma rue, pour la fraîcheur.', statue: 'Une statue sur la place, ça donnerait fière allure au quartier.',
  lamp: 'Ma rue est bien sombre la nuit. Un peu de lumière, s’il vous plaît.', hedge: 'Une haie autour du jardin, pour être un peu chez soi.',
};

/** Le nom du genre tel que le village le connaît à cet âge */
export const kindName = (k: KindId, age: number) => KINDS[k].names[Math.max(age, KINDS[k].minAge)];

/** La phrase d'une envie (son lieu est absent du village, ou loin : `far`) */
export function wishText(wish: Wish, age: number, far: boolean): string {
  const name = kindName(wish.kind, age);
  if (wish.type === 'decor') return tr(DECOR_SAY[wish.kind] ?? 'J’aimerais « {name} » près de chez moi.', { name });
  if (wish.type === 'place') {
    const why = tr(PLACE_WHY[wish.kind] ?? 'pour le plaisir');
    return far ? tr('« {name} » est bien loin de chez moi. Si seulement c’était plus près, {why}.', { name, why }) : tr('Il manque « {name} » au village. J’aimerais tant y aller, {why}.', { name, why });
  }
  const m = MISSIONS.find((x) => x.id === wish.mission);
  return tr('Si seulement nous avions « {name} »… L’expédition « {title} » pourrait nous l’apporter.', { name, title: m ? tr(m.title) : '' });
}

/** Le merci d'une envie comblée */
export function thanksText(wish: Wish, age: number): string {
  const name = kindName(wish.kind, age);
  if (wish.type === 'expedition') return tr('L’expédition a réussi ! Bientôt « {name} » au village, merci.', { name });
  if (wish.type === 'decor') return tr('Merci pour « {name} », je m’y arrête chaque jour.', { name });
  return tr('Merci ! « {name} » est tout près maintenant, j’y vais dès ce soir.', { name });
}
