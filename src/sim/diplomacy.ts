import type { World } from '../world/world';
import type { People, RivalIsle } from '../world/archipelago';
import type { KindId } from '../build/catalog';
import { tr } from '../i18n';
import { archipelagoOn } from '../world/expand';
import { newCamp, readCamp, type CampState } from './campaign';
import { newSaga, readSaga, conflictAge, FIRST_CHAPTER, type SagaState } from './saga';

/**
 * La diplomatie de l'archipel (voir `docs/diplomatie.md`) : les deux peuples des îles rivales, l'allié qu'on choisit parmi eux
 * à la fin de la cinématique des îles, et leur conflit, qu'on choisit au Médiéval de régler par la paix (des pourparlers)
 * ou par la guerre (des éclaireurs, puis la campagne de l'île rivale). Il s'étale sur trois chapitres, le Médiéval,
 * l'Industriel et le Moderne (`sim/saga.ts`) : chacun est une condition du passage à l'âge suivant, le dernier règle le
 * conflit. Rien de ceci n'existe sans l'archipel accepté (`archipelagoOn`)
 */

/** Voie choisie pour le dénouement : la paix (une chaîne de pourparlers) ou la guerre aux côtés de l'allié */
export type Path = 'peace' | 'war';
/**
 * Le conflit entre les deux îles : en cours, réglé par notre paix, gagné par la guerre, ou réglé d'office par un traité
 * entre les deux îles (une partie déjà au Futuriste, voir `settleLate`)
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
  /**
   * la carte du dénouement s'est ouverte d'elle-même (une seule fois, quand le reste du passage à l'Industriel est rempli ;
   * « Plus tard » la referme, on la rouvre depuis le panneau des âges ou l'onglet « Grands choix »)
   */
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
  /** guerre : ce que les éclaireurs ont appris (il prépare la bataille) */
  intel: Intel[];
  /**
   * ce que les expéditions facultatives des îles ont gagné pour le dénouement (voir `Boons`) : des troupes pour la bataille,
   * des chances pour la paix
   */
  boons: Boons;
  /** guerre : la campagne de l'île rivale, après les éclaireurs (ce qu'on tient, le corps, les sorties ; voir `sim/campaign.ts`) */
  camp: CampState;
  /** les chapitres du conflit, un par âge, du Médiéval au Moderne, et la trêve de la paix (voir `sim/saga.ts`) */
  saga: SagaState;
}

/**
 * Les avantages des expéditions facultatives des îles (`ISLE_MISSIONS`), pour la voie qu'on choisira (demande de l'auteur,
 * 20 nov. 2026 : « un avantage concret pour la voie choisie ») : `allies`, des troupes alliées en plus à la bataille ; `ours`,
 * des soldats à nous en plus ; `foes`, des ennemis en moins ; `peace`, des points de pourcentage ôtés au risque des
 * pourparlers (négatif : on les a fâchés). Sauvegardés, bornés par `BOON_MAX`
 */
export interface Boons { allies: number; ours: number; foes: number; peace: number }
export type BoonKind = keyof Boons;
export const BOON_KINDS: BoonKind[] = ['allies', 'ours', 'foes', 'peace'];
export const BOON_MAX: Boons = { allies: 12, ours: 6, foes: 15, peace: 45 };
/** La bonne volonté ne descend pas plus bas (le vol des semences, refait, ne ferme pas la paix pour de bon) */
export const PEACE_MIN = -20;
const noBoons = (): Boons => ({ allies: 0, ours: 0, foes: 0, peace: 0 });

/**
 * Le risque d'échec des pourparlers de la paix (décision de l'auteur, 20 nov. 2026 : 30 %, pour que la bonne volonté
 * compte) : sans blessé, l'étape se retente. Chaque point de `boons.peace` en ôte un point de pourcentage
 */
export const TALK_RISK = 0.3;
export function talkRisk(d: Pick<DiploState, 'boons'>) { return Math.max(0, Math.min(0.6, TALK_RISK - d.boons.peace / 100)); }

/** Ajoute un avantage, borné ; rien une fois le conflit réglé (il ne servirait plus) */
export function addBoon(d: DiploState, kind: BoonKind, n: number) {
  if (d.conflict !== 'open') return;
  d.boons[kind] = Math.max(kind === 'peace' ? PEACE_MIN : 0, Math.min(BOON_MAX[kind], d.boons[kind] + n));
}

/** Les avantages comptent-ils encore ? Seulement tant que le conflit dure (avec l'archipel et un allié) */
export function boonsMatter(w: Pick<World, 'isles' | 'diplo'>) { return archipelagoOn(w) && !!w.diplo.ally && w.diplo.conflict === 'open'; }

/**
 * Quand une expédition des îles est proposée (`Mission.isle`) : `ally`, dès l'allié choisi ; `open`, tant que le conflit dure
 * (et réussie, elle reste dans la liste) ; `war`, sur la voie de la guerre, avant la victoire
 */
export type IsleWhen = 'ally' | 'open' | 'war';
export function isleWhy(w: Pick<World, 'isles' | 'diplo' | 'exp'>, id: string, when: IsleWhen): string | null {
  if (!archipelagoOn(w)) return tr('Il faut d’abord explorer le monde.');
  const d = w.diplo;
  if (!d.ally) return tr('Il faut d’abord choisir votre allié.');
  if (when === 'ally') return null;
  if (d.conflict !== 'open') return tr('Le conflit des deux îles est déjà réglé.');
  if (when === 'war' && d.path !== 'war') return tr('Seulement sur la voie de la guerre.');
  void id;
  return null;
}
export function isleOffered(w: Pick<World, 'isles' | 'diplo' | 'exp'>, id: string, when: IsleWhen): boolean {
  if (!archipelagoOn(w) || !w.diplo.ally) return false;
  if (w.exp.done.includes(id)) return true;
  if (when === 'war') return w.diplo.path === 'war' && w.diplo.conflict === 'open';
  return when === 'ally' || w.diplo.conflict === 'open';
}

export const newDiplo = (): DiploState => ({ met: [], ally: null, path: null, conflict: 'open', asked: false, post: false, feast: false, battle: 'none', retry: 0, cine: false, intel: [], boons: noBoons(), camp: newCamp(), saga: newSaga() });

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
  s.intel = Array.isArray(d.intel) ? INTELS.filter((x) => d.intel.includes(x)) : [];
  // (les avantages des expéditions des îles : nouveaux le 20 nov. 2026, à zéro dans les anciennes parties)
  for (const k of BOON_KINDS) { const v = Math.round(+d.boons?.[k] || 0); s.boons[k] = Math.max(k === 'peace' ? PEACE_MIN : 0, Math.min(BOON_MAX[k], v)); }
  // (la campagne de l'île rivale : nouvelle le 23 nov. 2026 ; une ancienne partie aux éclaireurs revenus reprend au débarquement)
  s.camp = readCamp(d.camp);
  // (les chapitres du fil des âges : nouveaux le 24 nov. 2026 ; une ancienne partie n'en a aucun de noté, voir `catchUp`)
  s.saga = readSaga(d.saga);
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
 * Les missions de la diplomatie (voir `MISSIONS`) : la paix en deux pourparlers (décision de l'auteur : « on en fait que
 * 2 »), les émissaires (`envoys` : le comptoir chez le rival) puis l'ambassade de la paix (`truce` : la paix signée, la fête,
 * le monument, puis la cinématique de la paix) ; et l'expédition militaire de la guerre, qui débarque les troupes pour la
 * bataille. Le premier contact (`contact`) et l'ancienne fête (`feast`) n'existent plus
 */
export const PEACE_CHAIN = ['envoys', 'truce'] as const;
export const PEACE_MISSION = 'truce';
export const WAR_MISSION = 'allywar';
const DIPLO_MISSIONS = new Set<string>([...PEACE_CHAIN, WAR_MISSION]);

/**
 * L'âge où s'ouvre le dénouement : le Médiéval (on y choisit sa voie). Le conflit se joue ensuite en trois chapitres, jusqu'au
 * Moderne (`sim/saga.ts`)
 */
export const ENDGAME_AGE = FIRST_CHAPTER;

/**
 * Le crochet « port et comptoir installés chez l'allié » : `allyPostReady(world)` de `sim/allyLand.ts`, branché par `Game` au
 * démarrage (`allyLand.ts` lit ce module : l'importer ici ferait une boucle). Non branché (tests), il répond oui
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
  // (les émissaires partent avec le premier convoi escorté : chantier B)
  if (id === PEACE_CHAIN[0] && !d.saga.sea.includes('convoy') && !d.saga.truce) return tr('Il faut d’abord escorter le premier convoi (la feuille de route du conflit).');
  return null;
}

/**
 * Ce que font les effets de la diplomatie (`Effect` `diplo`) au retour d'une expédition réussie : `post` (le comptoir chez
 * le rival), `truce` (la paix signée), `feast` (la fête des trois peuples), `landing` (les troupes débarquées : la bataille
 * est prête). `meet` et `victory` ne servent plus qu'aux anciennes parties
 */
export type DiploAct = 'meet' | 'post' | 'truce' | 'feast' | 'landing' | 'victory' | Intel;
/** Ce que les éclaireurs ont appris, pour la bataille : la plage, la garnison, le chef, la porte faible */
export type Intel = 'scoutBeach' | 'scoutGarrison' | 'scoutChief' | 'scoutGate';
const INTELS: Intel[] = ['scoutBeach', 'scoutGarrison', 'scoutChief', 'scoutGate'];
export function applyDiplo(d: DiploState, act: DiploAct) {
  if (act === 'meet') d.met = [...PEOPLES];
  else if (act === 'post') d.post = true;
  // la paix signée : le conflit est réglé, la cinématique de la paix est à jouer (une fois)
  // la trêve signée (le chapitre du Médiéval de la paix) : la cinématique est à jouer (une fois) ; la paix vient au Moderne
  else if (act === 'truce') { if (d.conflict === 'open' && !d.saga.truce) { d.saga.truce = true; d.cine = true; } d.path = 'peace'; }
  else if (act === 'feast') d.feast = true;
  else if (act === 'landing') { if (d.path === 'war' && d.conflict === 'open') d.battle = 'ready'; }
  else if (act === 'victory') winAllyWar(d);
  else if (!d.intel.includes(act)) d.intel.push(act);
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
 * Le dénouement est ouvert : un allié, le conflit en cours, dès le Médiéval et à tout âge ensuite (une arrivée tardive le mène
 * jusqu'au bout, même au Futuriste), et le port et le comptoir installés chez l'allié (`bindPostReady`)
 */
export function endgameOpen(w: World, age: number) {
  if (!archipelagoOn(w) || !w.diplo.ally || w.diplo.conflict !== 'open') return false;
  return conflictAge(age) && postReady(w);
}

/**
 * La carte paix ou guerre s'ouvre-t-elle d'elle-même ? Comme le grand choix pour le Médiéval : au Médiéval, l'allié choisi,
 * le conflit à régler, toutes les autres conditions du passage à l'Industriel remplies (`othersDone` : le conflit est la
 * dernière qui manque), une fois par session (`shown` : « Plus tard » ne la fait pas revenir en boucle). Même sans port ni
 * comptoir chez l'allié : la carte dit alors ce qui manque (demande de l'auteur, 17 nov. 2026 : à 13/14, rien ne
 * s'ouvrait, et l'on ne savait pas quoi faire). Ensuite on la rouvre depuis la condition du panneau des âges, le conseil, ou
 * l'onglet « Grands choix »
 */
export function pathDue(w: World, age: number, othersDone: boolean, shown = false) {
  return othersDone && !shown && archipelagoOn(w) && !!w.diplo.ally && w.diplo.conflict === 'open' && conflictAge(age) && !w.diplo.path;
}

/** Pourquoi la carte du dénouement ne s'ouvre pas encore (null : elle peut) */
export function endgameWhy(w: World, age: number): string | null {
  if (!archipelagoOn(w)) return null;
  if (!w.diplo.ally) return tr('Il faut d’abord choisir votre allié.');
  if (w.diplo.conflict !== 'open') return tr('Le conflit des deux îles est déjà réglé.');
  if (age < FIRST_CHAPTER) return tr('Le conflit des deux îles s’ouvre au Médiéval.');
  if (!postReady(w)) return tr('Installez d’abord un port et un comptoir sur l’île de votre allié.');
  return null;
}

/**
 * Choisir (ou changer) sa voie tant que le conflit dure, que la bataille n'est pas engagée et que la trêve n'est pas signée :
 * la paix ouvre les pourparlers, la guerre les éclaireurs
 */
// (ni une fois la première bataille navale ou le premier convoi passés : chantier B)
export const canChangePath = (d: DiploState) => d.battle === 'none' && !d.saga.truce && !d.saga.sea.length;
export function choosePath(d: DiploState, p: Path) {
  if (!d.ally || d.conflict !== 'open' || !PATHS.includes(p) || !canChangePath(d)) return false;
  d.path = p;
  return true;
}

/** La guerre est engagée aux côtés de l'allié, pas encore gagnée */
export function warEngaged(d: DiploState) { return d.path === 'war' && d.conflict === 'open'; }

/**
 * Le règlement d'office d'un conflit ouvert à un âge avancé : il n'existe plus (bug de l'auteur, 24 nov. 2026 : « Explorer le
 * monde » au Futuriste ne laissait plus aucun moyen de régler le conflit). Le conflit se mène à tout âge (`conflictAge`). Les
 * parties déjà réglées ainsi gardent leur traité (`treaty`). Renvoie toujours faux, gardée pour qui l'appelle encore
 */
export function settleLate(_d: DiploState, _age: number, _on: boolean) { return false; }

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
  // (la trêve signée : les combats cessent, les navires de commerce reviennent)
  return d.conflict === 'peace' || d.saga.truce ? { kind: 'peace' } : d.conflict === 'treaty' ? { kind: 'treaty' } : { kind: 'war' };
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
  // l'obélisque de la victoire : seulement la guerre gagnée (il n'a pas d'expédition qui l'ouvre, c'est la bataille)
  if (k === 'triumph') return archipelagoOn(w) && w.diplo.conflict === 'won';
  // l'ambassade : la paix signée (« L'ambassade de la paix » réussie ; une mission ne débloque qu'un bâtiment, le monument)
  if (k === 'embassy') return archipelagoOn(w) && (w.diplo.conflict === 'peace' || w.exp.done.includes('truce'));
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

// (les chapitres : la condition du passage d'âge vit dans `sim/saga.ts`)
export { CONFLICT_LABEL, chapterItem } from './saga';
