import type { World } from '../world/world';
import { tr } from '../i18n';

/**
 * Malaises et cambriolages sans secours (retour de joueurs, décision de l'auteur du 22 nov. 2026 : « donner des conséquences
 * aux malaises et aux cambriolages »). Un habitant fait un malaise loin de tout hôpital, ou un voleur entre chez lui loin de
 * tout poste de police : la carte de l'incident attend `UNAIDED_WAIT` secondes de jeu (un poste bâti à portée entre-temps
 * arrive à temps), puis le malheur frappe, mesuré selon la difficulté. En Facile, jamais de décès et de petits larcins ;
 * au bac à sable, rien
 */
export const UNAIDED_WAIT = 25;

/** Un malaise sans soins : soins en moins (`n`) pendant `days` jours, et parfois un décès (Normal seulement) */
export interface SickToll { n: number; days: number; dies: boolean }
/** Ce que le voleur emporte */
export interface Loot { wood: number; stone: number; gold: number }

/** Chance qu'un malade sans soins ne s'en remette pas, en Normal */
export const DEATH_CHANCE = 0.25;
/** Un village plus petit ne perd pas d'habitant à un malaise (il ne s'en relèverait pas) */
export const DEATH_MIN_POP = 12;

export function sickToll(w: Pick<World, 'difficulty' | 'sandbox'>, rnd: () => number = Math.random): SickToll {
  if (w.sandbox || w.difficulty === 'sandbox') return { n: 0, days: 0, dies: false };
  if (w.difficulty === 'normal') return { n: 3, days: 2, dies: rnd() < DEATH_CHANCE };
  return { n: 2, days: 1, dies: false };
}

/** Part du stock emportée et plafond, par matière : petits larcins en Facile, un peu plus en Normal (l'or aussi) */
const THEFT = { easy: { k: 0.02, max: 10, gold: 0 }, normal: { k: 0.05, max: 30, gold: 10 } } as const;

export function theftToll(w: Pick<World, 'difficulty' | 'sandbox' | 'unlimited' | 'wood' | 'stone' | 'gold'>): Loot {
  const none = { wood: 0, stone: 0, gold: 0 };
  if (w.sandbox || w.unlimited || w.difficulty === 'sandbox') return none;
  const r = w.difficulty === 'normal' ? THEFT.normal : THEFT.easy;
  const take = (have: number, max: number) => (have >= 1 ? Math.max(1, Math.min(max, Math.floor(have * r.k), Math.floor(have))) : 0);
  return { wood: take(w.wood, r.max), stone: take(w.stone, r.max), gold: r.gold ? Math.min(Math.floor(w.gold * r.k), r.gold) : 0 };
}

/** Le voleur se sert dans les réserves */
export function applyTheft(w: World, loot: Loot) {
  w.wood = Math.max(0, w.wood - loot.wood);
  w.stone = Math.max(0, w.stone - loot.stone);
  w.gold = Math.max(0, w.gold - loot.gold);
  w.version++;
}

/** Le malade sans soins pèse sur les soins du village un temps (horloge des expéditions, `exp.clock`) */
export function applySick(w: World, toll: SickToll, dayLen: number) {
  if (toll.n > 0) w.ills.push({ n: toll.n, until: w.exp.clock + toll.days * dayLen });
}

/** Soins en moins en ce moment (les malades sans soins qui ne sont pas remis) */
export function ailing(w: Pick<World, 'ills' | 'exp'>): number {
  let n = 0;
  for (const i of w.ills) if (i.until > w.exp.clock) n += i.n;
  return n;
}

/** Relit les malades d'une sauvegarde (absents : aucun) */
export function readIlls(d: unknown): { n: number; until: number }[] {
  return Array.isArray(d) ? d.filter((i) => i && Number.isFinite(i.n) && Number.isFinite(i.until) && i.n > 0).map((i) => ({ n: +i.n, until: +i.until })) : [];
}

/**
 * Le deuil d'un village sans cimetière (demande de l'auteur du 24 nov. 2026) : un défunt qui n'a pas où reposer coûte
 * `MOURN.n` de bien-être pendant `MOURN.days` jours. Avec un cimetière, un cortège l'y mène et rien n'est perdu. Les décès
 * n'arrivent qu'en Normal : en Facile, le cimetière n'apporte qu'un peu de bien-être
 */
export const MOURN = { n: 2, days: 2 } as const;

/** Le village a-t-il un cimetière (de tout âge, n'importe où) ? */
export function hasCemetery(w: Pick<World, 'buildings'>): boolean {
  for (const b of w.buildings.values()) if (b.kind === 'cemetery') return true;
  return false;
}

/** Le village porte le deuil d'un défunt sans sépulture */
export function applyMourning(w: World, dayLen: number) {
  w.mourning.push({ n: MOURN.n, until: w.exp.clock + MOURN.days * dayLen });
}

/** Bien-être en moins en ce moment (les deuils qui ne sont pas finis) */
export function grief(w: Pick<World, 'mourning' | 'exp'>): number {
  let n = 0;
  for (const i of w.mourning) if (i.until > w.exp.clock) n += i.n;
  return n;
}

/**
 * Le message qui dit au joueur ce que le malaise sans soins a coûté. Un décès : ce qui l'aurait évité (un hôpital à portée),
 * et ce qu'il advient du défunt (`rest` : il repose au cimetière ; sinon le village en porte le deuil)
 */
export function sickNews(toll: SickToll, died: boolean, rest = false): string {
  if (died && rest) return tr('🕯️ Sans soins à temps, le malade n’a pas survécu. Un hôpital à portée des maisons l’aurait sauvé. Ses proches le mènent au cimetière, où il repose en paix.');
  if (died) return tr('🕯️ Sans soins à temps, le malade n’a pas survécu. Un hôpital à portée des maisons l’aurait sauvé. Faute de cimetière où reposer, le village porte son deuil {d} : bien-être −{n}.', { n: MOURN.n, d: tr('{n} jours', { n: MOURN.days }) });
  return tr('🤒 Sans soins à temps, le malade reste alité {d} : santé −{n}. Un hôpital à portée des maisons l’aurait soigné.', { n: toll.n, d: toll.days > 1 ? tr('{n} jours', { n: toll.days }) : tr('une journée') });
}

/** Le message qui dit au joueur ce que le cambriolage a coûté */
export function theftNews(loot: Loot): string {
  const parts = [
    loot.wood ? tr('{n} bois', { n: loot.wood }) : '', loot.stone ? tr('{n} pierre', { n: loot.stone }) : '', loot.gold ? tr('{n} or', { n: loot.gold }) : '',
  ].filter(Boolean);
  if (!parts.length) return tr('🕵️ Le cambrioleur s’est enfui les mains vides. Un poste de police à portée l’aurait arrêté.');
  const list = parts.length > 1 ? tr('{list} et {last}', { list: parts.slice(0, -1).join(', '), last: parts[parts.length - 1] }) : parts[0];
  return tr('🕵️ Le cambrioleur s’est enfui avec {list}. Un poste de police à portée l’aurait arrêté.', { list });
}
