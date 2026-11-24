import type { DiploState } from './diplomacy';
import type { TroopKind } from './army';
import type { BattleKind } from './rivalBattle';

/**
 * La campagne de l'île rivale (voie de la guerre ; retour de joueurs, 22 nov. 2026 : « le mode exploration va trop vite » ;
 * décision de l'auteur : s'inspirer des Enfers, avant-postes et attaques). Après les éclaireurs, au lieu d'une seule bataille :
 * le débarquement (la plage : un camp et une caserne avancée y sont posés), deux avant-postes (le port, la tour du rempart),
 * puis l'assaut des remparts et du palais. Dès le camp posé, la ville rivale fait des sorties contre lui ; tombé, le dernier
 * avant-poste pris est reperdu. Le corps expéditionnaire garde ses pertes d'une bataille à l'autre, la caserne avancée le
 * refait peu à peu. Règles pures : `Game` lance les batailles (`RivalBattle` avec `kind`), voir `docs/diplomatie.md`
 */

/** Ce qu'on tient sur l'île rivale, dans l'ordre où on le prend : la plage (le camp), le port, la tour du rempart */
export type Front = 'plage' | 'port' | 'tour';
export const FRONTS: Front[] = ['plage', 'port', 'tour'];

export interface CampState {
  /** ce qu'on tient (la plage d'abord : c'est le camp) */
  held: Front[];
  /** les pertes du corps expéditionnaire pas encore refaites : fantassins, archers */
  lost: [number, number];
  /** heure (`exp.clock`) de la prochaine sortie rivale contre le camp ; 0 : aucune prévue */
  raid: number;
  /** sorties déjà repoussées (chacune grossit la suivante) */
  raids: number;
  /** heure de la dernière recrue formée par la caserne avancée */
  train: number;
  /** la sortie qui vient est annoncée */
  warned: boolean;
}

/** Le corps expéditionnaire au complet au Médiéval (fantassins, archers), avant les soldats armés sur les îles (`boons.ours`) */
export const CORPS: [number, number] = [15, 10];
/**
 * Le corps grandit avec les âges (le fil des âges, `sim/saga.ts`) : chaque passage d'âge apporte des recrues, 25 hommes au
 * Médiéval, 30 à l'Industriel, 35 au Moderne. Les pertes restent des pertes : les recrues comblent d'abord les rangs
 */
export function corpsBase(age: number): [number, number] { return age >= 4 ? [21, 14] : age >= 3 ? [18, 12] : CORPS; }
/** Les sorties rivales (jours de jeu) : la première après le débarquement, puis l'écart, le préavis, et le délai avant qu'elle se règle seule */
export const RAID_FIRST = 1, RAID_EVERY = 3, RAID_WARN = 0.5, RAID_GRACE = 0.5;
/**
 * L'âge où chaque bataille de la campagne s'ouvre (le fil des âges) : le débarquement au Médiéval, le port et la tour à
 * l'Industriel, l'assaut au Moderne. Avant, la campagne attend le passage d'âge
 */
export const BATTLE_AGE: Record<'landing' | 'port' | 'tour' | 'assault', number> = { landing: 2, port: 3, tour: 3, assault: 4 };
/** La caserne avancée forme une recrue tous les `TRAIN_DAYS` jours de jeu */
export const TRAIN_DAYS = 0.15;
/** Laissée seule, la garnison du camp ne compte que cette part du corps (les autres sont ailleurs sur l’île) */
export const HOLD_SHARE = 0.6;

export const newCamp = (): CampState => ({ held: [], lost: [0, 0], raid: 0, raids: 0, train: 0, warned: false });

/** Relit l'état sauvegardé (ancienne partie : rien de tenu, le corps au complet) */
export function readCamp(c: any): CampState {
  const s = newCamp();
  if (!c || typeof c !== 'object') return s;
  // (dans l'ordre, sans trou : le port ne se tient pas sans la plage)
  const held = Array.isArray(c.held) ? c.held : [];
  for (const f of FRONTS) { if (!held.includes(f)) break; s.held.push(f); }
  const n = (v: unknown) => (Number.isFinite(+(v as number)) ? Math.max(0, Math.round(+(v as number))) : 0);
  if (Array.isArray(c.lost)) { const m = corpsBase(4); s.lost = [Math.min(m[0] + 6, n(c.lost[0])), Math.min(m[1], n(c.lost[1]))]; }
  s.raid = s.held.length ? Math.max(0, +c.raid || 0) : 0;
  s.raids = n(c.raids);
  s.train = Math.max(0, +c.train || 0);
  s.warned = c.warned === true;
  return s;
}

const engaged = (d: DiploState) => d.path === 'war' && d.conflict === 'open' && d.battle !== 'none';

/** Le corps au complet à cet âge (les soldats armés chez l'allié en plus) */
export function corpsMax(d: Pick<DiploState, 'boons'>, age = 2): [number, number] { const b = corpsBase(age); return [b[0] + Math.max(0, Math.floor(d.boons.ours)), b[1]]; }
/** Le corps debout : fantassins, archers. Avant le camp, il est toujours au complet (chaque débarquement part du village) */
export function corps(d: Pick<DiploState, 'boons' | 'camp'>, age = 2): [number, number] {
  const m = corpsMax(d, age);
  if (!d.camp.held.length) return m;
  return [Math.max(0, m[0] - d.camp.lost[0]), Math.max(0, m[1] - d.camp.lost[1])];
}
/** Le corps en troupes de l'âge (le chevalier dès le Médiéval) ; au moins un homme, pour que la bataille ait lieu */
export function corpsTroops(d: Pick<DiploState, 'boons' | 'camp'>, age: number): TroopKind[] {
  const [s, a] = corps(d, age), melee: TroopKind = age >= 2 ? 'knight' : 'soldier';
  return [...Array(Math.max(s, s + a ? 0 : 1)).fill(melee), ...Array(a).fill('archer')];
}

/** Une sortie rivale vient-elle sur le camp ? (le camp posé, l'heure passée) */
export function raidDue(d: DiploState, clock: number) { return engaged(d) && d.camp.held.includes('plage') && d.camp.raid > 0 && clock >= d.camp.raid; }
/** Sa force : les sorties déjà repoussées, plus les avant-postes tenus */
export function raidLevel(d: Pick<DiploState, 'camp'>) { return d.camp.raids + Math.max(0, d.camp.held.length - 1); }

/** La bataille de la campagne qui suit ce qu'on tient : le débarquement, le port, la tour, puis l'assaut */
export function campaignNext(d: Pick<DiploState, 'camp'>): 'landing' | 'port' | 'tour' | 'assault' {
  const h = d.camp.held;
  return !h.includes('plage') ? 'landing' : !h.includes('port') ? 'port' : !h.includes('tour') ? 'tour' : 'assault';
}
/** Cette bataille s'ouvre-t-elle à cet âge ? (sinon, elle attend le passage d'âge) */
export const battleOpen = (d: Pick<DiploState, 'camp'>, age: number) => BATTLE_AGE[campaignNext(d)] <= age;

/**
 * La campagne a-t-elle une étape en cours à cet âge ? Une bataille ouverte, ou, au Médiéval, la première sortie à repousser
 * (l'étape « Tenir le camp »). Sinon les sorties attendent : un joueur lent n'est jamais pressé (le plan du nouveau monde)
 */
export function campaignBusy(d: Pick<DiploState, 'camp'>, age: number) {
  const c = d.camp;
  return battleOpen(d, age) || (age === 2 && c.held.length === 1 && c.raids === 0);
}

/**
 * La bataille qui vient : la défense du camp si une sortie arrive ; sinon le débarquement, le port, la tour, l'assaut, chacun
 * à son âge (`BATTLE_AGE`) ; null hors de la campagne (pas de guerre engagée), ou quand la suite attend l'âge suivant
 */
export function nextBattle(d: DiploState, clock: number, age = 4): BattleKind | null {
  if (!engaged(d)) return null;
  if (raidDue(d, clock)) return 'defend';
  return battleOpen(d, age) ? campaignNext(d) : null;
}

/**
 * Le pas de la campagne, au fil du temps : la caserne avancée refait le corps ; la sortie qui vient s'annonce (renvoie 'warn'
 * une fois). Sans étape en cours à cet âge (`campaignBusy`), la sortie est repoussée : elle viendra `RAID_FIRST` jours après
 * la reprise
 */
export function stepCamp(d: DiploState, clock: number, dayLen: number, age = 4): 'warn' | null {
  const c = d.camp;
  if (!engaged(d) || !c.held.includes('plage')) return null;
  const every = TRAIN_DAYS * dayLen;
  if (c.lost[0] + c.lost[1] <= 0) c.train = clock;
  while (c.lost[0] + c.lost[1] > 0 && clock >= c.train + every) {
    c.train += every;
    // (le plus entamé d'abord, en part du corps)
    const m = corpsMax(d, age), k = c.lost[0] / m[0] >= c.lost[1] / m[1] ? 0 : 1;
    c.lost[k]--;
  }
  if (!campaignBusy(d, age)) { c.raid = Math.max(c.raid, clock + RAID_FIRST * dayLen); c.warned = false; return null; }
  if (c.raid > 0 && !c.warned && clock >= c.raid - RAID_WARN * dayLen && clock < c.raid) { c.warned = true; return 'warn'; }
  return null;
}

/**
 * L'issue d'une bataille de la campagne (sauf l'assaut gagné : `claimVictory`, et les autres perdues : `loseAllyBattle`, que
 * `Game` appelle) : ce qu'on tient, les pertes du corps, la prochaine sortie. Renvoie ce qui est reperdu (la défense perdue)
 */
export function campaignResult(d: DiploState, kind: BattleKind, won: boolean, survivors: [number, number], clock: number, dayLen: number, age = 2): Front | null {
  const c = d.camp, m = corpsMax(d, age);
  c.lost = [Math.max(0, m[0] - survivors[0]), Math.max(0, m[1] - survivors[1])];
  c.train = clock;
  if (kind === 'defend') {
    c.warned = false;
    if (won) { c.raids++; c.raid = clock + RAID_EVERY * dayLen; return null; }
    // le camp tombé : le dernier avant-poste tenu est reperdu (la plage elle-même s'il n'y en a pas : il faudra redébarquer)
    const lost = c.held.pop() ?? null;
    c.raid = c.held.length ? clock + RAID_EVERY * dayLen : 0;
    if (!c.held.length) c.lost = [0, 0];
    return lost;
  }
  if (!won) return null;
  const f: Front | null = kind === 'landing' ? 'plage' : kind === 'port' ? 'port' : kind === 'tour' ? 'tour' : null;
  if (f && !c.held.includes(f)) c.held.push(f);
  // le camp posé : la première sortie viendra
  if (kind === 'landing') { c.raid = clock + RAID_FIRST * dayLen; c.warned = false; }
  return null;
}
