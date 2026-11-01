import type { World } from '../world/world';
import { Danger, GearId, Stock, emptyStock, GEAR_BY } from './gear';

/**
 * Expéditions : à chaque âge, des missions à choix (au moins une obligatoire pour passer à l'âge suivant). Une petite équipe
 * d'habitants part sur la carte (forêt, plaine, rivière, montagne, grotte, au-delà des collines), agit sur place et revient ;
 * selon le choix et la chance, le village y gagne des bêtes, du minerai, des savoir-faire… ou des blessés et des soucis
 */

/** Où l'équipe se rend */
export type DestKind = 'plain' | 'forest' | 'river' | 'mountain' | 'cave' | 'far';
/** Besoins que l'expédition peut améliorer (ou dégrader) */
export type NeedKey = 'food' | 'water' | 'jobs' | 'joy';
/** Bêtes que l'on peut ramener et élever près des fermes */
export type HerdKind = 'sheep' | 'cow' | 'pig' | 'horse';
/**
 * Ce que l'on voit l'équipe faire sur place : apprivoiser une harde, pêcher en barque ou depuis la berge, miner, cueillir,
 * traquer, bâtir (enclos, voie ferrée), ou camper
 */
export type Scene = 'herd' | 'boat' | 'fish' | 'mine' | 'gather' | 'hunt' | 'build' | 'rails' | 'camp';

export type Effect =
  /** bêtes ramenées : elles paissent ensuite près des fermes */
  | { t: 'herd'; kinds: HerdKind[] }
  | { t: 'ore'; n: number }
  /** capacité d'un besoin : pour toujours, ou pendant quelques jours */
  | { t: 'need'; need: NeedKey; n: number; days?: number }
  /** savoir-faire durable (« seeds » : les champs donnent davantage) */
  | { t: 'perk'; id: string }
  /** habitants blessés, qui se reposent chez eux quelques jours */
  | { t: 'injured'; n: number; days: number };

export interface Choice {
  label: string;
  text: string;
  dest: DestKind;
  /** taille de l'équipe */
  party: number;
  /** temps passé sur place (secondes de jeu) */
  work: number;
  /** probabilité d'échec */
  risk: number;
  /** ce que l'équipe rapporte, visible au retour : des bêtes qui la suivent, un chariot, des sacs sur le dos */
  carry?: 'animals' | 'cart' | 'sacks';
  /** ce que l'équipe fait sur place */
  scene: Scene;
  /** dangers rencontrés (sinon ceux de la destination) : l'équipement qui les pare rend le choix plus sûr */
  danger?: Danger[];
  win: Effect[];
  lose: Effect[];
  winText: string;
  loseText: string;
}

export interface Mission {
  id: string;
  age: number;
  /** obligatoire pour passer à l'âge suivant */
  mandatory: boolean;
  icon: string;
  title: string;
  intro: string;
  choices: Choice[];
}

const food = (n: number, days?: number): Effect => ({ t: 'need', need: 'food', n, days });
const jobs = (n: number, days?: number): Effect => ({ t: 'need', need: 'jobs', n, days });
const joy = (n: number, days?: number): Effect => ({ t: 'need', need: 'joy', n, days });
const hurt = (n: number, days: number): Effect => ({ t: 'injured', n, days });

export const MISSIONS: Mission[] = [
  // ---------------- Préhistoire ----------------
  {
    id: 'herd', age: 0, mandatory: true, icon: '🐑', title: 'Apprivoiser des bêtes',
    intro: 'Des bêtes sauvages paissent loin du camp. Si l’on en ramenait quelques-unes, on pourrait les garder près des fermes : du lait, de la laine et de la viande toute l’année.',
    choices: [
      {
        label: 'Suivre le troupeau dans la plaine', text: 'Long mais sûr : on marche avec les moutons jusqu’à ce qu’ils se laissent approcher.',
        dest: 'plain', scene: 'herd', party: 3, work: 24, risk: 0.15, carry: 'animals',
        win: [{ t: 'herd', kinds: ['sheep', 'sheep', 'sheep', 'sheep'] }, food(3)], lose: [],
        winText: 'Après des jours de marche, le troupeau a suivi les chasseurs jusqu’au camp. Les moutons broutent maintenant près des fermes.',
        loseText: 'Un orage a dispersé le troupeau. Les chasseurs rentrent bredouilles, mais ils retenteront leur chance.',
      },
      {
        label: 'Bâtir un enclos de branchages en lisière', text: 'On rabat les bêtes de la forêt dans un enclos : il faut des bras, et les sangliers sont farouches.',
        dest: 'forest', scene: 'herd', party: 4, work: 30, risk: 0.25, carry: 'animals',
        win: [{ t: 'herd', kinds: ['pig', 'pig', 'pig', 'sheep', 'sheep'] }, food(4)], lose: [hurt(1, 2)],
        winText: 'L’enclos a tenu : sangliers et moutons ont été menés au village, et ils s’y plaisent.',
        loseText: 'Un sanglier a forcé l’enclos et blessé un chasseur. Il se repose à la hutte.',
      },
      {
        label: 'Attirer les aurochs avec du sel', text: 'Rapide mais risqué : près de la rivière, les aurochs viennent lécher le sel… quand ils sont d’humeur.',
        dest: 'river', scene: 'herd', danger: ['beast', 'water'], party: 2, work: 14, risk: 0.4, carry: 'animals',
        win: [{ t: 'herd', kinds: ['cow', 'cow', 'sheep'] }, food(4)], lose: [hurt(1, 3), joy(-2, 2)],
        winText: 'Le sel a fait merveille : deux aurochs, doux comme des agneaux, ont suivi les chasseurs jusqu’au camp.',
        loseText: 'Un aurochs a chargé ! Un chasseur est blessé, et le camp a eu très peur.',
      },
    ],
  },
  {
    id: 'berries', age: 0, mandatory: false, icon: '🍇', title: 'La grande cueillette',
    intro: 'Les baies mûrissent au fond des bois et le long de l’eau : de quoi faire des réserves pour quelques jours.',
    choices: [
      {
        label: 'Partir en forêt', text: 'Des buissons à perte de vue, à condition d’arriver avant les oiseaux.',
        dest: 'forest', scene: 'gather', party: 2, work: 16, risk: 0.15, carry: 'sacks',
        win: [food(4, 4)], lose: [],
        winText: 'Les paniers débordent de baies et de noisettes : on mange bien pour quelques jours.',
        loseText: 'Les oiseaux étaient passés avant : il ne restait presque rien.',
      },
      {
        label: 'Remonter la rivière', text: 'Baies, poissons… et peut-être une baignade.',
        dest: 'river', scene: 'gather', party: 2, work: 12, risk: 0.2, carry: 'sacks',
        win: [food(3, 4), joy(1, 4)], lose: [hurt(1, 1)],
        winText: 'Baies, poissons et une baignade : tout le monde rentre content.',
        loseText: 'Une glissade sur les galets : une cheville foulée, rien de grave.',
      },
    ],
  },
  {
    id: 'flint', age: 0, mandatory: false, icon: '⛏️', title: 'Le silex de la falaise',
    intro: 'Au pied de la montagne, la falaise est pleine de silex. Avec de meilleurs outils, tout le monde travaillerait mieux.',
    choices: [
      {
        label: 'Escalader la falaise', text: 'Les plus beaux rognons sont en hauteur.',
        dest: 'mountain', scene: 'mine', party: 3, work: 20, risk: 0.25, carry: 'sacks',
        win: [jobs(3)], lose: [hurt(1, 2)],
        winText: 'Des rognons de silex magnifiques : haches et grattoirs pour tout le village.',
        loseText: 'Une pierre a roulé : un grimpeur est blessé.',
      },
      {
        label: 'Ramasser des galets à la rivière', text: 'Plus petits, mais sans danger.',
        dest: 'river', scene: 'gather', party: 2, work: 14, risk: 0.1, carry: 'sacks',
        win: [jobs(2)], lose: [],
        winText: 'Des galets de silex, petits mais tranchants : de bons outils pour tous.',
        loseText: 'Rien que du calcaire tendre… il faudra chercher ailleurs.',
      },
    ],
  },
  // ---------------- Antiquité ----------------
  {
    id: 'seeds', age: 1, mandatory: true, icon: '🌾', title: 'Le blé des collines',
    intro: 'Un marchand raconte qu’au-delà des collines, un village cultive un blé qui pousse deux fois plus haut. Il faudrait en rapporter des semences.',
    choices: [
      {
        label: 'Partir avec des poteries à échanger', text: 'Le plus long chemin, mais on arrive en amis.',
        dest: 'far', scene: 'camp', party: 3, work: 18, risk: 0.1, carry: 'sacks',
        win: [{ t: 'perk', id: 'seeds' }, joy(1)], lose: [],
        winText: 'Les poteries ont fait forte impression : les sacs de semences sont arrivés. Les champs donneront davantage.',
        loseText: 'Les gens des collines ont refusé l’échange. Il faudra revenir avec d’autres cadeaux.',
      },
      {
        label: 'Descendre la rivière en pirogue', text: 'Rapide… si l’on passe les rapides.',
        dest: 'river', scene: 'boat', party: 2, work: 12, risk: 0.3, carry: 'sacks',
        win: [{ t: 'perk', id: 'seeds' }, food(2)], lose: [hurt(1, 2)],
        winText: 'Le courant a porté les pirogues jusqu’au village voisin, et les semences sont rentrées bien sèches.',
        loseText: 'Une pirogue a chaviré dans les rapides : un rameur blessé, les semences perdues.',
      },
      {
        label: 'Passer par le col de la montagne', text: 'Le raccourci des chèvres : on pourrait y trouver autre chose.',
        dest: 'mountain', scene: 'camp', party: 3, work: 16, risk: 0.3, carry: 'cart',
        win: [{ t: 'perk', id: 'seeds' }, { t: 'ore', n: 3 }], lose: [hurt(1, 3)],
        winText: 'Par le col, on a trouvé les semences… et des pierres vertes qui sentent le cuivre !',
        loseText: 'Le col était pris dans la brume ; un marcheur s’est blessé en chutant.',
      },
    ],
  },
  {
    id: 'horses', age: 1, mandatory: false, icon: '🐎', title: 'Les chevaux sauvages',
    intro: 'Une harde de chevaux galope dans la plaine. Montés ou attelés, ils changeraient la vie du village.',
    choices: [
      {
        label: 'Les approcher patiemment', text: 'Des jours à se faire accepter de la harde.',
        dest: 'plain', scene: 'herd', party: 3, work: 26, risk: 0.2, carry: 'animals',
        win: [{ t: 'herd', kinds: ['horse', 'horse'] }, jobs(2)], lose: [],
        winText: 'Deux chevaux ont accepté le licol : les charrettes rouleront plus vite.',
        loseText: 'La harde s’est enfuie au galop au premier bruit.',
      },
      {
        label: 'Les rabattre dans un vallon', text: 'Plus rapide, mais un cheval affolé, ça rue.',
        dest: 'far', scene: 'herd', danger: ['beast'], party: 4, work: 18, risk: 0.35, carry: 'animals',
        win: [{ t: 'herd', kinds: ['horse', 'horse', 'horse'] }, jobs(3)], lose: [hurt(1, 2)],
        winText: 'Trois chevaux rabattus et calmés : on se dispute déjà pour les monter.',
        loseText: 'Un coup de sabot : un cavalier blessé, et la harde envolée.',
      },
    ],
  },
  {
    id: 'fishing', age: 1, mandatory: false, icon: '🐟', title: 'Les grands bancs',
    intro: 'Les anciens disent que plus loin sur l’eau, les bancs de poissons sont immenses.',
    choices: [
      {
        label: 'Pêcher depuis la berge', text: 'Tranquille, à l’ombre des saules.',
        dest: 'river', scene: 'fish', party: 2, work: 14, risk: 0.1, carry: 'sacks',
        win: [food(3, 5)], lose: [],
        winText: 'Des paniers de poissons : on fume, on sale, on se régale.',
        loseText: 'Pas une touche de la journée…',
      },
      {
        label: 'Chercher les grands bancs au loin', text: 'Plus de poisson, plus de chemin.',
        dest: 'river', scene: 'boat', danger: ['water', 'weather'], party: 3, work: 20, risk: 0.25, carry: 'sacks',
        win: [food(5, 6), joy(1, 6)], lose: [hurt(1, 1)],
        winText: 'Les grands bancs existent bien : de quoi nourrir le village une semaine !',
        loseText: 'Un orage a renversé les filets ; un pêcheur s’est entaillé la main.',
      },
    ],
  },
  // ---------------- Moyen Âge ----------------
  {
    id: 'mine', age: 2, mandatory: true, icon: '⚒️', title: 'Le filon de la montagne',
    intro: 'Les forgerons manquent de fer. Au cœur de la montagne, dit-on, un filon brille dans le noir.',
    choices: [
      {
        label: 'Creuser une galerie', text: 'Du travail de mineur, long et solide.',
        dest: 'mountain', scene: 'mine', party: 4, work: 30, risk: 0.2, carry: 'cart',
        win: [{ t: 'ore', n: 10 }, jobs(2)], lose: [{ t: 'ore', n: 3 }, hurt(1, 2)],
        winText: 'La galerie a percé le filon : le chariot rentre chargé de minerai, les forges vont chanter.',
        loseText: 'Un éboulement a bloqué la galerie. Un mineur blessé, et seulement quelques pierres de minerai.',
      },
      {
        label: 'Explorer la grande grotte', text: 'On raconte qu’elle cache un trésor… et qu’on s’y perd.',
        dest: 'cave', scene: 'mine', party: 3, work: 20, risk: 0.35, carry: 'cart',
        win: [{ t: 'ore', n: 14 }, joy(2)], lose: [hurt(2, 2)],
        winText: 'Au fond de la grotte, un filon gros comme un tonneau ! Le village fête ses explorateurs.',
        loseText: 'Les torches se sont éteintes dans la grotte ; deux explorateurs se sont blessés en ressortant.',
      },
      {
        label: 'Acheter du minerai aux mineurs nomades', text: 'Sans danger, mais ils voudront des vivres.',
        dest: 'far', scene: 'camp', party: 2, work: 12, risk: 0.05, carry: 'cart',
        win: [{ t: 'ore', n: 6 }, food(-2, 3)], lose: [],
        winText: 'Les nomades ont échangé leur minerai contre des vivres : il faudra se serrer un peu la ceinture.',
        loseText: 'Les nomades avaient déjà levé le camp.',
      },
    ],
  },
  {
    id: 'wolf', age: 2, mandatory: false, icon: '🐺', title: 'Le loup des bois',
    intro: 'Un loup rôde autour des enclos la nuit. Les bergers ne dorment plus.',
    choices: [
      {
        label: 'Le chasser avec les chiens', text: 'Il faudra le pister loin dans la forêt.',
        dest: 'forest', scene: 'hunt', danger: ['beast'], party: 3, work: 18, risk: 0.3,
        win: [joy(3)], lose: [hurt(1, 2)],
        winText: 'Le loup est parti loin dans la montagne : les bergers dorment enfin.',
        loseText: 'Le loup s’est défendu : un chasseur mordu, et le loup toujours là.',
      },
      {
        label: 'Bâtir des enclos de pierre sèche', text: 'Pas de chasse : on protège les bêtes.',
        dest: 'plain', scene: 'build', party: 2, work: 24, risk: 0.05, carry: 'cart',
        win: [joy(2), food(1)], lose: [],
        winText: 'De beaux enclos de pierre : le loup peut toujours rôder.',
        loseText: 'Les pierres manquaient : les enclos attendront.',
      },
    ],
  },
  {
    id: 'fair', age: 2, mandatory: false, icon: '🎪', title: 'Les jongleurs du carrefour',
    intro: 'Une troupe de jongleurs et de musiciens passe dans la région. Il faudrait aller les chercher au grand carrefour.',
    choices: [
      {
        label: 'Aller à leur rencontre', text: 'Une belle balade, avec un peu de chance au bout.',
        dest: 'far', scene: 'camp', danger: ['weather'], party: 2, work: 10, risk: 0.15,
        win: [joy(5, 5)], lose: [],
        winText: 'La troupe est arrivée en musique : fête au village pendant des jours !',
        loseText: 'Ils étaient déjà partis vers une autre ville…',
      },
    ],
  },
  // ---------------- Âge industriel ----------------
  {
    id: 'railway', age: 3, mandatory: true, icon: '🚂', title: 'Le tracé du chemin de fer',
    intro: 'Le chemin de fer arrive dans la région. Des géomètres doivent repérer le meilleur tracé jusqu’au village.',
    choices: [
      {
        label: 'Par la plaine, en contournant tout', text: 'Le plus long, le plus sûr.',
        dest: 'plain', scene: 'rails', party: 3, work: 26, risk: 0.1,
        win: [jobs(4), joy(1)], lose: [],
        winText: 'Le tracé le plus long, mais le plus sûr : les ouvriers arrivent en nombre.',
        loseText: 'Les relevés étaient faux : il faudra recommencer.',
      },
      {
        label: 'Percer un tunnel sous la montagne', text: 'Audacieux, et les déblais pourraient rapporter.',
        dest: 'mountain', scene: 'mine', party: 4, work: 30, risk: 0.35, carry: 'cart',
        win: [jobs(5), { t: 'ore', n: 8 }], lose: [hurt(2, 3)],
        winText: 'Le tunnel est percé ! En prime, les déblais regorgent de charbon et de fer.',
        loseText: 'Un éboulement dans le tunnel : deux ouvriers blessés.',
      },
      {
        label: 'Jeter un pont sur la rivière', text: 'Un ouvrage d’art qu’on viendra voir de loin.',
        dest: 'river', scene: 'build', danger: ['water', 'fall'], party: 3, work: 22, risk: 0.2,
        win: [jobs(4), joy(2)], lose: [hurt(1, 2)],
        winText: 'Le pont de fer enjambe la rivière : on vient l’admirer de toute la région !',
        loseText: 'Une poutre a glissé : un ouvrier blessé.',
      },
    ],
  },
  {
    id: 'coal', age: 3, mandatory: false, icon: '🏭', title: 'Prospection de charbon',
    intro: 'Les machines ont faim. On murmure qu’une veine de charbon affleure quelque part.',
    choices: [
      {
        label: 'Sonder la montagne', text: 'Des carottages patients.',
        dest: 'mountain', scene: 'mine', party: 3, work: 22, risk: 0.15, carry: 'cart',
        win: [{ t: 'ore', n: 8 }], lose: [],
        winText: 'Une belle veine : les wagonnets rentrent pleins.',
        loseText: 'Rien que de la roche stérile.',
      },
      {
        label: 'Descendre dans la grotte', text: 'Plus riche, plus dangereux.',
        dest: 'cave', scene: 'mine', party: 3, work: 18, risk: 0.3, carry: 'cart',
        win: [{ t: 'ore', n: 12 }], lose: [hurt(1, 2)],
        winText: 'La grotte cachait une veine énorme !',
        loseText: 'Un coup de grisou : un prospecteur blessé.',
      },
    ],
  },
  // ---------------- Époque moderne ----------------
  {
    id: 'summit', age: 4, mandatory: true, icon: '🏔️', title: 'Expédition au sommet',
    intro: 'Des scientifiques veulent installer une station météo au sommet de la plus haute montagne. Le village fournit le guide et les porteurs.',
    choices: [
      {
        label: 'Par la crête, en un jour', text: 'Vite fait, si le vent le permet.',
        dest: 'mountain', scene: 'camp', party: 3, work: 20, risk: 0.35, carry: 'sacks',
        win: [joy(4), jobs(2)], lose: [hurt(1, 2)],
        winText: 'Drapeau au sommet ! La station envoie déjà ses premières mesures.',
        loseText: 'Le vent a forcé la cordée à redescendre ; un porteur s’est tordu la cheville.',
      },
      {
        label: 'Par la vallée, avec un camp de base', text: 'Lentement mais sûrement.',
        dest: 'far', scene: 'camp', danger: ['weather', 'fall'], party: 4, work: 30, risk: 0.1, carry: 'sacks',
        win: [joy(3), jobs(3)], lose: [],
        winText: 'La station est installée, et le village a sa photo dans le journal.',
        loseText: 'Le mauvais temps a tout reporté.',
      },
    ],
  },
  {
    id: 'reef', age: 4, mandatory: false, icon: '🐠', title: 'Le récif',
    intro: 'Des plongeurs aimeraient étudier le récif, plus loin sur la côte.',
    choices: [
      {
        label: 'Partir avec les plongeurs', text: 'Masques, tubas et pique-nique.',
        dest: 'river', scene: 'boat', party: 2, work: 16, risk: 0.1,
        win: [joy(3)], lose: [],
        winText: 'Des photos magnifiques : tout le village veut aller voir les poissons.',
        loseText: 'L’eau était trouble : on n’a rien vu.',
      },
    ],
  },
];

/** La mission obligatoire de l'âge (celle qui ouvre l'âge suivant) */
export const mandatoryFor = (age: number) => MISSIONS.find((m) => m.age === age && m.mandatory) ?? null;

/** État des expéditions, sauvegardé avec le monde */
export interface ExpState {
  /** missions réussies */
  done: string[];
  /** savoir-faire durables */
  perks: string[];
  /** bêtes ramenées, qui paissent près des fermes */
  herd: HerdKind[];
  /** bonus durables par besoin */
  bonus: Record<NeedKey, number>;
  /** effets passagers (jusqu'à l'horloge `until`, en secondes de jeu) */
  temp: { need: NeedKey; n: number; until: number }[];
  /** horloge des expéditions (secondes de jeu écoulées) */
  clock: number;
  /** équipement en réserve (celui des équipes en route n'y est pas) */
  gear: Stock;
  /** fabrication en cours, dans l'ordre, et avancement de la première pièce (secondes de jeu) */
  craft: GearId[];
  craftT: number;
}

export const newExpState = (): ExpState => ({ done: [], perks: [], herd: [], bonus: { food: 0, water: 0, jobs: 0, joy: 0 }, temp: [], clock: 0, gear: emptyStock(), craft: [], craftT: 0 });

/** Relit l'état sauvegardé (anciennes sauvegardes : état vierge) */
export function readExpState(d: any): ExpState {
  const s = newExpState();
  if (!d || typeof d !== 'object') return s;
  const ids = new Set(MISSIONS.map((m) => m.id));
  s.done = Array.isArray(d.done) ? d.done.filter((x: any) => ids.has(x)) : [];
  s.perks = Array.isArray(d.perks) ? d.perks.filter((x: any) => typeof x === 'string') : [];
  s.herd = Array.isArray(d.herd) ? d.herd.filter((x: any) => ['sheep', 'cow', 'pig', 'horse'].includes(x)) : [];
  for (const k of Object.keys(s.bonus) as NeedKey[]) s.bonus[k] = +d.bonus?.[k] || 0;
  s.temp = Array.isArray(d.temp) ? d.temp.filter((t: any) => t && t.need in s.bonus && isFinite(t.n) && isFinite(t.until)) : [];
  s.clock = +d.clock || 0;
  for (const k of Object.keys(s.gear) as GearId[]) s.gear[k] = Math.max(0, Math.floor(+d.gear?.[k] || 0));
  s.craft = Array.isArray(d.craft) ? d.craft.filter((x: any) => x in GEAR_BY) : [];
  s.craftT = +d.craftT || 0;
  return s;
}

/** Bonus d'un besoin en ce moment : durable plus passager */
export function needBonus(s: ExpState, need: NeedKey) {
  let n = s.bonus[need];
  for (const t of s.temp) if (t.need === need && t.until > s.clock) n += t.n;
  return n;
}

/** Applique les effets au monde ; renvoie les blessés (que l'expédition renvoie se reposer chez eux) */
export function applyEffects(w: World, effects: Effect[], dayLen: number) {
  const s = w.exp;
  let injured = 0, days = 0;
  for (const e of effects) {
    if (e.t === 'herd') s.herd.push(...e.kinds);
    else if (e.t === 'ore') w.ore += e.n;
    else if (e.t === 'perk') { if (!s.perks.includes(e.id)) s.perks.push(e.id); }
    else if (e.t === 'need') { if (e.days) s.temp.push({ need: e.need, n: e.n, until: s.clock + e.days * dayLen }); else s.bonus[e.need] += e.n; }
    else if (e.t === 'injured') { injured += e.n; days = Math.max(days, e.days); }
  }
  w.version++;
  return { injured, days };
}

const NEED_ICON: Record<NeedKey, string> = { food: '🍞', water: '💧', jobs: '🔨', joy: '😊' };
const HERD_NAME: Record<HerdKind, [string, string]> = { sheep: ['mouton', 'moutons'], cow: ['vache', 'vaches'], pig: ['cochon', 'cochons'], horse: ['cheval', 'chevaux'] };
const PERK_NAME: Record<string, string> = { seeds: 'blé des collines : champs +30 %' };

/** Les effets en quelques mots (« 4 moutons · +3 🍞 · 1 blessé ») */
export function effectSummary(effects: Effect[]) {
  const out: string[] = [];
  for (const e of effects) {
    if (e.t === 'herd') {
      const n: Partial<Record<HerdKind, number>> = {};
      for (const k of e.kinds) n[k] = (n[k] ?? 0) + 1;
      for (const [k, c] of Object.entries(n) as [HerdKind, number][]) out.push(`${c} ${HERD_NAME[k][c > 1 ? 1 : 0]}`);
    } else if (e.t === 'ore') out.push(`+${e.n} minerai`);
    else if (e.t === 'need') out.push(`${e.n > 0 ? '+' : '−'}${Math.abs(e.n)} ${NEED_ICON[e.need]}${e.days ? ` (${e.days} j)` : ''}`);
    else if (e.t === 'perk') out.push(PERK_NAME[e.id] ?? e.id);
    else if (e.t === 'injured') out.push(`${e.n} blessé${e.n > 1 ? 's' : ''} (${e.days} j)`);
  }
  return out.join(' · ') || 'rien';
}
