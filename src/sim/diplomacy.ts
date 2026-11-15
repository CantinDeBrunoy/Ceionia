import type { World } from '../world/world';
import type { People, RivalIsle } from '../world/archipelago';
import type { KindId } from '../build/catalog';
import { tr } from '../i18n';
import { archipelagoOn } from '../world/expand';

/**
 * La diplomatie de l'archipel (voir `docs/diplomatie.md`) : les deux peuples des îles rivales, l'allié qu'on choisit parmi eux
 * à la fin de la cinématique des îles, et leur conflit, qu'on règle au Médiéval par la paix (une ambassade, puis la
 * cinématique de la paix) ou par la guerre (une expédition militaire, puis la bataille) : il doit l'être pour passer à
 * l'Industriel. Rien de ceci n'existe sans l'archipel accepté (`archipelagoOn`)
 */

/** Voie choisie pour le dénouement : la paix (une chaîne de pourparlers) ou la guerre aux côtés de l'allié */
export type Path = 'peace' | 'war';
/**
 * Le conflit entre les deux îles : en cours, réglé par notre paix, gagné par la guerre, ou réglé d'office par un traité
 * entre les deux îles (une partie déjà au Moderne ou au-delà, voir `settleLate`)
 */
export type Conflict = 'open' | 'peace' | 'won' | 'treaty';

export interface DiploState {
  /** peuples rencontrés (tous les deux dès que l'allié est choisi) */
  met: People[];
  /** l'île alliée, choisie sur la carte du choix de l'allié (définitif) */
  ally: People | null;
  /** la voie du dénouement (null : pas encore choisie) */
  path: Path | null;
  conflict: Conflict;
  /** la carte du dénouement s'est ouverte d'elle-même (une seule fois ; on la rouvre ensuite depuis le panneau des âges) */
  asked: boolean;
  /** paix : le comptoir chez l'île rivale est ouvert */
  post: boolean;
  /** paix : la fête des trois peuples a eu lieu */
  feast: boolean;
  /** guerre : la bataille (aucune ; troupes débarquées, prête ; perdue, à rejouer après `retry`) */
  battle: 'none' | 'ready' | 'lost';
  /** guerre : heure des expéditions (`exp.clock`, secondes de jeu) à partir de laquelle la bataille perdue se rejoue */
  retry: number;
  /** paix : la cinématique de la paix est à jouer (une fois) */
  cine: boolean;
}

export const newDiplo = (): DiploState => ({ met: [], ally: null, path: null, conflict: 'open', asked: false, post: false, feast: false, battle: 'none', retry: 0, cine: false });

const PEOPLES: People[] = ['orient', 'asie'];
const PATHS: Path[] = ['peace', 'war'];
const CONFLICTS: Conflict[] = ['open', 'peace', 'won', 'treaty'];

/** Relit l'état sauvegardé (ancienne partie : état vierge) */
export function readDiplo(d: any): DiploState {
  const s = newDiplo();
  if (!d || typeof d !== 'object') return s;
  s.met = Array.isArray(d.met) ? PEOPLES.filter((p) => d.met.includes(p)) : [];
  s.ally = PEOPLES.includes(d.ally) ? d.ally : null;
  // (un allié sans rencontre n'a pas de sens : la rencontre est sous-entendue)
  if (s.ally && !s.met.length) s.met = [...PEOPLES];
  // (l'ancienne neutralité n'existe plus : la voie est à choisir de nouveau)
  s.path = PATHS.includes(d.path) ? d.path : null;
  s.conflict = CONFLICTS.includes(d.conflict) ? d.conflict : 'open';
  // (une ancienne partie restée neutre revoit la carte du dénouement)
  s.asked = d.asked === true && d.path !== 'neutral';
  s.post = d.post === true;
  s.feast = d.feast === true;
  s.battle = d.battle === 'ready' || d.battle === 'lost' ? d.battle : 'none';
  s.retry = Number.isFinite(+d.retry) ? Math.max(0, +d.retry) : 0;
  s.cine = d.cine === true;
  return s;
}

/** Ce qu'on écrit dans la sauvegarde : rien tant que rien n'a bougé */
export function saveDiplo(s: DiploState): DiploState | undefined {
  const e = newDiplo();
  return (Object.keys(e) as (keyof DiploState)[]).some((k) => JSON.stringify(s[k]) !== JSON.stringify(e[k])) ? s : undefined;
}

/**
 * L'archipel est-il accepté ? La seule question à poser pour savoir si la partie a les îles rivales (celle de l'agrandissement,
 * `world/expand.ts` : leur place n'existe que dans une partie agrandie par « Explorer le monde », ou née archipel)
 */
export { archipelagoOn };

/** L'autre peuple */
export const rivalOf = (p: People): People => (p === 'orient' ? 'asie' : 'orient');

/** Le peuple rival de l'allié (null tant qu'on n'a pas d'allié) : celui chez qui la paix ouvre un comptoir */
export function rivalPeople(d: DiploState): People | null { return d.ally ? rivalOf(d.ally) : null; }

/** Nom d'un peuple, en clair (pour les textes) */
export function peopleName(p: People) { return p === 'orient' ? tr('les Sablais') : tr('les Jadéens'); }
/** Nom de son île */
export function isleName(p: People) { return p === 'orient' ? tr('l’île des Sables') : tr('l’île de Jade'); }

/** L'île d'un peuple (null sans archipel) */
export function isleOf(w: Pick<World, 'isles'>, p: People): RivalIsle | null {
  return w.isles?.rivals.find((r) => r.people === p) ?? null;
}

/** La case est-elle sur cette île rivale ? (l'union de ses lobes, à quelques cases près : la terre est vérifiée à part) */
export function onRival(isle: RivalIsle, x: number, z: number) {
  return isle.lobes.some((l) => Math.hypot(x - l.x, z - l.z) <= l.r + 3);
}

// ---------------- Les étapes ----------------

/**
 * Les missions de la diplomatie (voir `MISSIONS`) : l'ambassade de la paix (une seule expédition, suivie de la cinématique de
 * la paix ; elle garde l'id `truce` de l'ancienne trêve, pour que les anciennes parties gardent ce qu'elle a ouvert), et
 * l'expédition militaire de la guerre, qui débarque les troupes pour la bataille. Le premier contact (`contact`) et les
 * anciens pourparlers (`envoys`, `feast`) n'existent plus. Pour revenir à une chaîne, ajouter ses ids à `PEACE_CHAIN`
 */
export const PEACE_CHAIN = ['truce'] as const;
export const PEACE_MISSION = 'truce';
export const WAR_MISSION = 'allywar';
const DIPLO_MISSIONS = new Set<string>([...PEACE_CHAIN, WAR_MISSION]);

/** L'âge du dénouement : le Médiéval ; le conflit doit y être réglé pour passer à l'Industriel */
export const ENDGAME_AGE = 2;

/**
 * Le crochet « port et comptoir installés chez l'allié » (session de l'or et du comptoir : `allyPostReady(world)` de
 * `sim/allyLand.ts`). Tant qu'il n'est pas branché, il répond oui : la carte du dénouement vient dès l'allié choisi
 */
let postReady: (w: World) => boolean = () => true;
export function bindPostReady(f: (w: World) => boolean) { postReady = f; }
export const allyPostReadyNow = (w: World) => postReady(w);

/** Une mission de la diplomatie est-elle proposée dans cette partie ? (les autres le sont toujours) */
export function missionOffered(w: Pick<World, 'isles' | 'diplo' | 'exp'>, id: string): boolean {
  if (!DIPLO_MISSIONS.has(id)) return true;
  if (!archipelagoOn(w)) return false;
  // (une étape déjà réussie reste dans la liste, en petit : ce qu'on a fait)
  if (w.exp.done.includes(id)) return true;
  const d = w.diplo;
  if (!d.ally || d.conflict !== 'open') return false;
  // (la guerre : tant que les troupes ne sont pas débarquées ; ensuite c'est la bataille)
  if (id === WAR_MISSION) return d.path === 'war' && d.battle === 'none';
  return d.path === 'peace';
}

/** Pourquoi une mission de la diplomatie ne peut pas partir (null : rien ne l'empêche de ce côté-là) */
export function missionWhy(w: Pick<World, 'isles' | 'diplo' | 'exp'>, id: string): string | null {
  if (!DIPLO_MISSIONS.has(id)) return null;
  if (!archipelagoOn(w)) return tr('Il faut d’abord explorer le monde.');
  if (w.exp.done.includes(id)) return tr('C’est fait : cette étape ne se refait pas.');
  const d = w.diplo;
  if (!d.ally) return tr('Il faut d’abord choisir votre allié.');
  if (d.conflict !== 'open') return tr('Le conflit des deux îles est déjà réglé.');
  if (id === WAR_MISSION) {
    if (d.path !== 'war') return tr('Il faut d’abord choisir d’aider notre allié.');
    if (d.battle !== 'none') return tr('Les troupes ont déjà débarqué : la bataille les attend.');
    return null;
  }
  if (d.path !== 'peace') return tr('Il faut d’abord choisir la voie de la paix.');
  return null;
}

/**
 * Ce que font les effets de la diplomatie (`Effect` `diplo`) au retour d'une expédition réussie : `post` (le comptoir chez
 * le rival), `truce` (la paix signée), `feast` (la fête des trois peuples), `landing` (les troupes débarquées : la bataille
 * est prête). `meet` et `victory` ne servent plus qu'aux anciennes parties
 */
export type DiploAct = 'meet' | 'post' | 'truce' | 'feast' | 'landing' | 'victory';
export function applyDiplo(d: DiploState, act: DiploAct) {
  if (act === 'meet') d.met = [...PEOPLES];
  else if (act === 'post') d.post = true;
  // la paix signée : le conflit est réglé, la cinématique de la paix est à jouer (une fois)
  else if (act === 'truce') { if (d.conflict === 'open') { d.conflict = 'peace'; d.cine = true; } d.path = 'peace'; }
  else if (act === 'feast') d.feast = true;
  else if (act === 'landing') { if (d.path === 'war' && d.conflict === 'open') d.battle = 'ready'; }
  else if (act === 'victory') winAllyWar(d);
}

/**
 * La carte du choix de l'allié est à montrer : l'archipel accepté, aucun allié encore. Elle s'ouvre à la fin de la
 * cinématique des îles, puis au calme tant que le choix manque (une partie rechargée, une ancienne partie)
 */
export function allyPending(w: Pick<World, 'isles' | 'diplo'>) {
  return archipelagoOn(w) && !w.diplo.ally;
}

/** Choisir son allié (une seule fois) : les deux peuples sont alors rencontrés */
export function chooseAlly(d: DiploState, p: People) {
  if (d.ally || !PEOPLES.includes(p)) return false;
  d.ally = p;
  d.met = [...PEOPLES];
  return true;
}

/**
 * Le dénouement est ouvert : un allié, le conflit en cours, et au Médiéval, le port et le comptoir installés chez l'allié
 * (`bindPostReady`). Une partie déjà à l'Industriel (passée avant cette règle) l'a aussi, tout de suite ; au-delà, le conflit
 * est réglé d'office (`settleLate`)
 */
export function endgameOpen(w: World, age: number) {
  if (!archipelagoOn(w) || !w.diplo.ally || w.diplo.conflict !== 'open') return false;
  return (age === ENDGAME_AGE && postReady(w)) || age === ENDGAME_AGE + 1;
}

/** Pourquoi la carte du dénouement ne s'ouvre pas encore (null : elle peut) */
export function endgameWhy(w: World, age: number): string | null {
  if (!archipelagoOn(w)) return null;
  if (!w.diplo.ally) return tr('Il faut d’abord choisir votre allié.');
  if (w.diplo.conflict !== 'open') return tr('Le conflit des deux îles est déjà réglé.');
  if (age < ENDGAME_AGE) return tr('Le conflit des deux îles se règle au Médiéval.');
  if (age === ENDGAME_AGE && !postReady(w)) return tr('Installez d’abord un port et un comptoir sur l’île de votre allié.');
  return null;
}

/**
 * Choisir (ou changer) sa voie tant que le conflit dure et que la bataille n'est pas engagée : la paix ouvre l'ambassade, la
 * guerre l'expédition militaire
 */
export function choosePath(d: DiploState, p: Path) {
  if (!d.ally || d.conflict !== 'open' || !PATHS.includes(p) || d.battle !== 'none') return false;
  d.path = p;
  return true;
}

/** La guerre est engagée aux côtés de l'allié, pas encore gagnée */
export function warEngaged(d: DiploState) { return d.path === 'war' && d.conflict === 'open'; }

/**
 * La condition du passage à l'Industriel, dans le panneau des âges (`Sim.ageProgress`) : le conflit des deux îles réglé, par
 * la paix (l'ambassade) ou par la guerre (la bataille gagnée). Seulement avec l'archipel. Une partie déjà à l'Industriel
 * avec un conflit ouvert la retrouve vers le Moderne (la carte s'ouvre tout de suite). Son libellé la fait reconnaître par
 * le panneau (`reqOf` → `conflict` : un clic rouvre la carte) et par le conseil (`Sim.messageConflict`)
 */
export const CONFLICT_LABEL = 'le conflit des deux îles, réglé';
export function conflictItem(w: Pick<World, 'isles' | 'diplo'>, next: number): { have: number; need: number } | null {
  if (!archipelagoOn(w)) return null;
  const open = w.diplo.conflict === 'open';
  if (next === ENDGAME_AGE + 1 || (next === ENDGAME_AGE + 2 && open)) return { have: open ? 0 : 1, need: 1 };
  return null;
}

/**
 * Une partie déjà au Moderne ou au-delà avec un conflit ouvert (une ancienne partie, ou un archipel accepté tard) n'est jamais
 * bloquée : le conflit est réglé d'office, par un traité entre les deux îles. Renvoie vrai s'il vient de l'être
 */
export function settleLate(d: DiploState, age: number, on: boolean) {
  if (!on || age < ENDGAME_AGE + 2 || d.conflict !== 'open') return false;
  d.conflict = 'treaty';
  d.battle = 'none';
  return true;
}

/** Le passage d'âge peut-il se faire ? Pas pendant une bataille. Renvoie le refus, ou null */
export function ageGate(battle: boolean): string | null {
  return battle ? tr('Une bataille est en cours : on ne change pas d’âge avant son issue.') : null;
}

// ---------------- Le conflit en décor (session « conflit naval ») ----------------

/**
 * L'état du conflit tel que le lit le conflit naval vivant (session « conflit naval » : `ConflictState` de
 * `sim/navalConflict.ts`, même forme) : la guerre tant qu'il dure (des escarmouches), la paix (la nôtre) ou le traité (des
 * navires de commerce), la victoire de l'allié (ses patrouilles) ; null sans archipel. La seule fonction à brancher sur
 * `NavalConflict.state`
 */
export type ConflictState = { kind: 'war' } | { kind: 'peace' } | { kind: 'won'; winner: People } | { kind: 'treaty' };
export function conflictState(w: Pick<World, 'isles' | 'diplo'>): ConflictState | null {
  if (!archipelagoOn(w)) return null;
  const d = w.diplo;
  if (d.conflict === 'won' && d.ally) return { kind: 'won', winner: d.ally };
  return d.conflict === 'peace' ? { kind: 'peace' } : d.conflict === 'treaty' ? { kind: 'treaty' } : { kind: 'war' };
}

// ---------------- La guerre : la bataille, les récompenses ----------------

/**
 * Les récompenses de la guerre gagnée : un gros butin d'or (une fois), un tribut d'or chaque jour de l'île vaincue, et un
 * monument de la victoire à bâtir (bâtiment à créer)
 */
export const WAR_SPOILS = { loot: 60, tribute: 2, monument: 'victory' } as const;
/** Après une défaite, la bataille se rejoue au bout de ce délai (jours de jeu) : les troupes se refont chez l'allié */
export const RETRY_DAYS = 2;

/** La bataille peut-elle se livrer maintenant ? (troupes débarquées, ou défaite et délai écoulé) ; `clock` : `exp.clock` */
export function battleReady(d: DiploState, clock: number) {
  return warEngaged(d) && (d.battle === 'ready' || (d.battle === 'lost' && clock >= d.retry));
}

/** Une bataille perdue : retraite, nouvel essai dans `RETRY_DAYS` jours (`dayLen` : secondes de jeu par jour) */
export function loseAllyBattle(d: DiploState, clock: number, dayLen: number) {
  if (!warEngaged(d)) return false;
  d.battle = 'lost';
  d.retry = clock + RETRY_DAYS * dayLen;
  return true;
}

/**
 * La bataille de l'archipel : `Game.startAllyBattle` la lance (voir `sim/rivalBattle.ts`) ; ce crochet ne sert plus qu'aux
 * anciennes références (rien à faire ici)
 */
export function startAllyBattle(_w: World): boolean { return false; }

/** La bataille gagnée : le conflit est réglé par les armes */
export function winAllyWar(d: DiploState) {
  if (d.path !== 'war' || d.conflict !== 'open') return false;
  d.conflict = 'won';
  d.battle = 'none';
  return true;
}

/** La victoire (la bataille gagnée) : le conflit réglé, et le butin d'or du vaincu versé une fois ; le tribut suit chaque jour */
export function claimVictory(w: Pick<World, 'diplo' | 'gold'>) {
  if (!winAllyWar(w.diplo)) return false;
  w.gold += WAR_SPOILS.loot;
  return true;
}

/** Le tribut quotidien de l'île vaincue (or par jour de jeu ; zéro tant que la guerre n'est pas gagnée) */
export function tributePerDay(d: DiploState) { return d.conflict === 'won' ? WAR_SPOILS.tribute : 0; }

// ---------------- Les récompenses de la paix ----------------

/**
 * Le comptoir chez l'île rivale (pour la session de l'or) : le peuple qui l'accueille, une fois les émissaires reçus ;
 * null sinon
 */
export function rivalPost(w: Pick<World, 'isles' | 'diplo'>): People | null {
  return archipelagoOn(w) && w.diplo.post ? rivalPeople(w.diplo) : null;
}

/** Les bâtiments de la diplomatie, et la mission qui les ouvre */
export const DIPLO_KINDS: Partial<Record<KindId, string>> = { concord: 'truce' };

/** Le bâtiment est-il proposé dans cette partie ? (le monument de la concorde : seulement sur la voie de la paix) */
export function kindOffered(w: Pick<World, 'isles' | 'diplo' | 'exp'>, k: KindId) {
  const m = DIPLO_KINDS[k];
  if (!m) return true;
  return archipelagoOn(w) && (w.exp.done.includes(m) || w.diplo.path === 'peace');
}

// ---------------- Le cosmodrome ----------------

/**
 * Où le cosmodrome peut se poser : sur l'île alliée quand l'archipel est accepté, sur l'île principale sinon (le reste de
 * la carte en est exclu par ailleurs). Renvoie le refus, ou null
 */
export function spaceportWhy(w: Pick<World, 'isles' | 'diplo'>, x: number, z: number, s: number): string | null {
  if (!archipelagoOn(w)) return null;
  const ally = w.diplo.ally;
  if (!ally) return tr('Le cosmodrome se bâtit sur l’île de votre allié : choisissez d’abord votre allié.');
  const isle = isleOf(w, ally)!;
  const corners = [[x, z], [x + s - 1, z], [x, z + s - 1], [x + s - 1, z + s - 1]];
  if (!corners.every(([cx, cz]) => onRival(isle, cx + 0.5, cz + 0.5))) return tr('Le cosmodrome se bâtit sur l’île de votre allié ({isle}).', { isle: isleName(ally) });
  return null;
}
