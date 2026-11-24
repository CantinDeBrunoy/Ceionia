import type { Effect, Mission } from './missions';
import type { BoonKind } from './diplomacy';

/**
 * Les expéditions facultatives sur les îles des deux peuples de l'archipel (demande de l'auteur, 20 nov. 2026 ; voir
 * `docs/expeditions.md` et `docs/diplomatie.md`) : quatre chez notre allié, quatre chez son rival. Toutes au Médiéval,
 * l'âge où le conflit se règle : chacune donne un avantage pour la voie qu'on choisira (des troupes pour la bataille, des
 * chances pour la paix, voir `Boons`), en plus de ses gains. L'équipe traverse en bateau et va sur la vraie île (`Choice.visit`,
 * mis en scène par `ExpeditionScene.tripSetup`). Les textes ne nomment pas le peuple : ils sont traduits tels quels
 */

const boon = (kind: BoonKind, n: number): Effect => ({ t: 'boon', kind, n });
const gold = (n: number): Effect => ({ t: 'gold', n });
const joy = (n: number, days?: number): Effect => ({ t: 'need', need: 'joy', n, days });
const jobs = (n: number, days?: number): Effect => ({ t: 'need', need: 'jobs', n, days });
const food = (n: number, days?: number): Effect => ({ t: 'need', need: 'food', n, days });
const hurt = (n: number, days: number): Effect => ({ t: 'injured', n, days });

/** Savoir-faire des îles : les outils des artisans alliés (l'équipement se fabrique plus vite), les semences volées (champs) */
export const SMITHS_PERK = 'isleSmiths', SMITHS_CRAFT = 1.3;
export const SEEDS_PERK = 'isleSeeds', SEEDS_FIELDS = 1.15;

/**
 * Les visites retirées (retour de l'auteur, 24 nov. 2026 : toutes faites, la guerre devenait bien trop facile) : rebâtir après
 * la tempête, la régate, le transfuge, le sabotage. Gardées dans la liste pour les anciennes parties (une équipe en route, un
 * récit, l'id dans `exp.done`), mais plus proposées (`isleOffered`, `ISLE_OFFERED`). Il reste une visite par avantage : la
 * foire (des alliés), les maîtres artisans (des soldats), l'espionnage du port (des ennemis en moins), plus les semences
 */
export const RETIRED_ISLE = new Set(['isleRebuild', 'isleRegatta', 'isleDefector', 'isleSabotage']);

export const ISLE_MISSIONS: Mission[] = [
  // ---------------- Chez notre allié ----------------
  {
    id: 'isleFair', age: 2, mandatory: false, icon: '🎪', title: 'La foire de nos alliés', isle: { when: 'ally', to: 'ally' },
    intro: 'C’est jour de foire chez nos alliés : étals, épices, jongleurs et dés sur la place du marché. On y vend bien, et l’on s’y fait des amis.',
    choices: [
      {
        label: 'Troquer nos étoffes', text: 'Sûr : nos plus belles étoffes contre leur or.',
        dest: 'river', sea: true, scene: 'voyage', visit: { to: 'ally', at: 'marche', look: 'fair' }, doing: 'troque ses étoffes sur la place du marché allié', party: 3, work: 30, risk: 0.08, carry: 'sacks',
        win: [boon('allies', 2), boon('peace', 5), gold(6), joy(2, 4)], lose: [],
        winText: 'Nos étoffes ont fait fureur : de l’or plein les bourses, et des amis sur tous les étals. Nos alliés s’en souviendront, à la guerre comme à la paix.',
        loseText: 'Il pleuvait sur la foire : personne n’a voulu de nos étoffes.',
      },
      {
        label: 'Parier aux jeux de dés', text: 'Audacieux : on mise gros devant toute la foire.',
        dest: 'river', sea: true, scene: 'voyage', visit: { to: 'ally', at: 'marche', look: 'dice' }, doing: 'joue aux dés sur la place du marché allié', party: 2, work: 24, risk: 0.3, carry: 'sacks',
        win: [boon('allies', 2), boon('peace', 5), gold(15), joy(3, 4)], lose: [joy(-1, 3)],
        winText: 'Six et six ! Toute la foire a acclamé nos joueurs, qui rentrent les poches pleines d’or. Nos alliés n’ont plus que notre nom à la bouche.',
        loseText: 'Les dés n’ont pas été tendres : nos joueurs rentrent les poches vides, et l’on se moque un peu d’eux.',
      },
    ],
  },
  {
    id: 'isleRebuild', age: 2, mandatory: false, icon: '🔨', title: 'Rebâtir après la tempête', isle: { when: 'ally', to: 'ally' },
    intro: 'Une tempête a brisé le port de nos alliés : la jetée est à terre, des barques ont coulé. Leur donner un coup de main, c’est gagner leur cœur.',
    choices: [
      {
        label: 'Porter du bois et des vivres', text: 'Sûr : on décharge, ils rebâtissent.',
        dest: 'river', sea: true, scene: 'voyage', visit: { to: 'ally', at: 'port', look: 'cargo' }, doing: 'décharge du bois et des vivres sur le port allié', party: 4, work: 40, risk: 0.1, carry: 'sacks',
        win: [boon('allies', 4), boon('peace', 10), gold(4)], lose: [],
        winText: 'Le bois et les vivres ont été déchargés sur le quai, sous les vivats. Nos alliés n’oublieront pas qui est venu quand tout était à terre.',
        loseText: 'La mer était encore trop grosse : impossible d’accoster, il a fallu rentrer avec la cargaison.',
      },
      {
        label: 'Prêter nos charpentiers', text: 'Plus risqué : on rebâtit la jetée de nos mains.',
        dest: 'river', sea: true, scene: 'voyage', visit: { to: 'ally', at: 'port', look: 'carpentry' }, doing: 'rebâtit la jetée du port allié', party: 4, work: 32, risk: 0.25, carry: 'sacks',
        win: [boon('allies', 4), boon('peace', 10), gold(10), jobs(2, 6)], lose: [hurt(1, 2)],
        winText: 'La jetée est debout, plus solide qu’avant : nos alliés nous ont couverts d’or et de remerciements. Leurs marins se battraient pour nous.',
        loseText: 'Une poutre a cédé : un charpentier blessé. La jetée attendra.',
      },
    ],
  },
  {
    id: 'isleSmiths', age: 2, mandatory: false, icon: '⚒', title: 'Chez leurs maîtres artisans', isle: { when: 'ally', to: 'ally' },
    intro: 'Les forgerons de nos alliés ont des tours de main que nous ignorons. Apprendre chez eux, c’est mieux équiper nos équipes, et armer quelques soldats de plus.',
    choices: [
      {
        label: 'Des apprentis pour une saison', text: 'Sûr mais long : nos apprentis suivent leurs maîtres.',
        dest: 'river', sea: true, scene: 'voyage', visit: { to: 'ally', at: 'temple', look: 'forge' }, doing: 'apprend le métier chez les forgerons alliés', party: 3, work: 50, risk: 0.08, carry: 'sacks',
        win: [boon('ours', 3), { t: 'perk', id: SMITHS_PERK }], lose: [],
        winText: 'Nos apprentis rentrent avec leurs outils et leurs secrets : l’équipement se fabrique plus vite, et l’on a forgé de quoi armer trois soldats de plus.',
        loseText: 'Les maîtres n’ont rien voulu montrer : nos apprentis rentrent comme ils sont partis.',
      },
      {
        label: 'Un secret contre un secret', text: 'Rapide : on échange nos recettes contre les leurs.',
        dest: 'river', sea: true, scene: 'voyage', visit: { to: 'ally', at: 'temple', look: 'swap' }, doing: 'échange ses secrets de forge avec les maîtres alliés', party: 2, work: 26, risk: 0.3, carry: 'sacks',
        win: [boon('ours', 3), { t: 'perk', id: SMITHS_PERK }, jobs(1, 6)], lose: [joy(-1, 3)],
        winText: 'Secret contre secret : chacun repart plus savant. L’équipement se fabrique plus vite, et trois soldats de plus sont armés.',
        loseText: 'Les maîtres ont trouvé nos secrets bien minces : ils ont gardé les leurs.',
      },
    ],
  },
  {
    id: 'isleRegatta', age: 2, mandatory: false, icon: '⛵', title: 'La régate des deux rives', isle: { when: 'ally', to: 'ally' },
    intro: 'Nos alliés lancent une course de voiliers autour d’une petite île. Leurs meilleurs marins y seront : les battre, ou seulement bien courir, c’est gagner leur estime.',
    choices: [
      {
        label: 'Prendre le large', text: 'Sûr : le grand tour, loin des écueils.',
        dest: 'river', sea: true, scene: 'voyage', visit: { to: 'ally', at: 'islet', look: 'race' }, doing: 'court la régate autour de la petite île', party: 3, work: 30, risk: 0.15, carry: 'sacks',
        win: [boon('allies', 2), boon('peace', 5), gold(5), joy(3, 5)], lose: [],
        winText: 'Une belle course, coque contre coque jusqu’à la bouée : leurs marins nous ont porté un toast. De vrais amis de la mer.',
        loseText: 'Le vent est tombé : notre voilier est arrivé le dernier, bien après les autres.',
      },
      {
        label: 'Raser les récifs', text: 'Audacieux : on coupe au plus court, entre les rochers.',
        dest: 'river', sea: true, scene: 'voyage', visit: { to: 'ally', at: 'islet', look: 'reef' }, doing: 'court la régate en rasant les récifs', party: 3, work: 24, risk: 0.35, carry: 'sacks',
        win: [boon('allies', 2), boon('peace', 5), gold(12), joy(4, 5)], lose: [hurt(1, 2)],
        winText: 'Victoire ! Notre voilier a filé entre les récifs et coupé la ligne le premier. Le prix est à nous, et leurs marins ne parlent que de nous.',
        loseText: 'La coque a touché un récif : un marin blessé, et la course perdue.',
      },
    ],
  },
  // ---------------- Chez le rival de notre allié ----------------
  {
    id: 'isleSpy', age: 2, mandatory: false, icon: '🔭', title: 'Espionner leur port', isle: { when: 'open', to: 'rival' },
    intro: 'Combien de navires dans le port de nos rivaux, et que craignent-ils ? Bien renseigné, on débarque plus sûrement… ou l’on parle mieux de paix.',
    choices: [
      {
        label: 'Compter les navires depuis le large', text: 'Prudent : on reste au large, la longue-vue à l’œil.',
        dest: 'river', sea: true, scene: 'voyage', visit: { to: 'rival', at: 'offport', look: 'spyglass' }, doing: 'compte les navires du port rival depuis le large', danger: ['water'], party: 2, work: 34, risk: 0.12, carry: 'sacks',
        win: [boon('foes', 4), boon('peace', 10)], lose: [],
        winText: 'Les navires sont comptés, leurs feux notés : on sait où frapper, et ce qu’ils redoutent. De quoi débarquer plus sûrement, ou parler de paix plus juste.',
        loseText: 'La brume a tout caché : on n’a rien vu du port.',
      },
      {
        label: 'Se glisser sur le quai', text: 'Audacieux : on accoste, on écoute les marins.',
        dest: 'river', sea: true, scene: 'voyage', visit: { to: 'rival', at: 'port', look: 'eavesdrop' }, doing: 'se glisse sur le quai rival pour écouter les marins', danger: ['water'], party: 2, work: 28, risk: 0.3, carry: 'sacks',
        win: [boon('foes', 5), boon('peace', 10), gold(4)], lose: [hurt(1, 2), boon('peace', -5)],
        winText: 'Sur le quai, on a tout entendu : les navires prêts, ceux qui fuient, et la lassitude des marins. Une bourse oubliée est même rentrée avec nous.',
        loseText: 'Repérés ! Il a fallu fuir sous les cris, un blessé, et nos rivaux nous en veulent.',
      },
    ],
  },
  {
    id: 'isleDefector', age: 2, mandatory: false, icon: '🧳', title: 'Le transfuge', isle: { when: 'open', to: 'rival' },
    intro: 'Un vieil artisan de nos rivaux veut passer chez nous. Il connaît leur chef, et il est las de la guerre : chez nous, il plaidera pour la paix.',
    choices: [
      {
        label: 'L’attendre sur la plage', text: 'Prudent : il nous rejoint à la barque, à la nuit.',
        dest: 'river', sea: true, scene: 'voyage', visit: { to: 'rival', at: 'plage', look: 'beach' }, doing: 'attend le transfuge sur la plage rivale', party: 3, work: 36, risk: 0.15, carry: 'guests',
        win: [boon('peace', 15), boon('foes', 3), jobs(2)], lose: [],
        winText: 'Le transfuge est venu à la nuit, son baluchon sur l’épaule. Il dit tout de la garde de son chef, et plaide déjà pour la paix. Ses mains d’artisan font merveille au village.',
        loseText: 'Il n’est pas venu : la garde veillait trop. Peut-être une autre nuit.',
      },
      {
        label: 'Aller le chercher en ville', text: 'Audacieux : on passe la porte, on le ramène.',
        dest: 'river', sea: true, scene: 'voyage', visit: { to: 'rival', at: 'gate', look: 'escort' }, doing: 'va chercher le transfuge jusqu’aux portes de la ville rivale', party: 3, work: 30, risk: 0.35, carry: 'guests',
        win: [boon('peace', 15), boon('foes', 3), jobs(2), { t: 'diplo', act: 'scoutChief' }], lose: [hurt(1, 2), boon('peace', -5)],
        winText: 'On l’a ramené de la ville même, sous le nez des gardes. Il a vu leur chef de près : il dit tout, et plaide pour la paix.',
        loseText: 'Les gardes nous ont surpris à la porte : un blessé, et le transfuge est resté là-bas.',
      },
    ],
  },
  {
    id: 'isleSabotage', age: 2, mandatory: false, icon: '🎯', title: 'Saboter leur flotte', isle: { when: 'war', to: 'rival' },
    intro: 'Avant la bataille, leurs navires peuvent tomber à l’eau… sans nous. Une nuit, une barque, et leur flotte sera moins forte au jour de l’assaut.',
    choices: [
      {
        label: 'Couper les amarres', text: 'Prudent : la nuit, on coupe les cordes, la marée fait le reste.',
        dest: 'river', sea: true, scene: 'voyage', visit: { to: 'rival', at: 'port', look: 'ropes' }, doing: 'coupe les amarres des navires rivaux', danger: ['water'], party: 3, work: 30, risk: 0.2, carry: 'sacks',
        win: [boon('foes', 6)], lose: [hurt(1, 2)],
        winText: 'Au matin, leurs navires dérivaient au large, loin du port : autant de soldats qui manqueront à la bataille.',
        loseText: 'Une sentinelle a crié : il a fallu fuir, un blessé.',
      },
      {
        label: 'Des brûlots dans le port', text: 'Audacieux : une barque en feu lancée sur leurs navires.',
        dest: 'river', sea: true, scene: 'voyage', visit: { to: 'rival', at: 'offport', look: 'fireship' }, doing: 'lance un brûlot sur la flotte rivale', danger: ['water', 'weather'], party: 3, work: 26, risk: 0.4, carry: 'sacks',
        win: [boon('foes', 9)], lose: [hurt(2, 3)],
        winText: 'Le brûlot a filé droit sur leur flotte : trois navires en flammes, la garnison du port à l’eau pour l’éteindre. Elle manquera à la bataille.',
        loseText: 'Le vent a tourné : le brûlot est revenu sur nous, deux brûlés.',
      },
    ],
  },
  {
    id: 'isleSeeds', age: 2, mandatory: false, icon: '🌿', title: 'Le secret de leurs jardins', isle: { when: 'ally', to: 'rival' },
    intro: 'Les jardins du palais de nos rivaux donnent des récoltes que nous n’avons jamais vues. Leurs semences chez nous, et nos champs donneraient bien plus… mais ils ne nous le pardonneraient pas.',
    choices: [
      {
        label: 'Acheter un sac en cachette', text: 'Prudent : un jardinier nous le vend, sans bruit.',
        dest: 'river', sea: true, scene: 'voyage', visit: { to: 'rival', at: 'palais', look: 'buy' }, doing: 'achète des semences en cachette au jardinier du palais rival', party: 2, work: 30, risk: 0.15, carry: 'sacks',
        win: [{ t: 'perk', id: SEEDS_PERK }, boon('peace', -5)], lose: [],
        winText: 'Le sac de semences est au village : nos champs donneront davantage. Mais nos rivaux ont su qu’on les avait achetées, et ils nous en veulent un peu.',
        loseText: 'Le jardinier a pris peur : il n’est pas venu.',
      },
      {
        label: 'Voler les plants du palais', text: 'Audacieux : on entre au jardin, on arrache les plus beaux.',
        dest: 'river', sea: true, scene: 'voyage', visit: { to: 'rival', at: 'palais', look: 'steal' }, doing: 'vole des plants dans le jardin du palais rival', party: 2, work: 24, risk: 0.35, carry: 'sacks',
        win: [{ t: 'perk', id: SEEDS_PERK }, food(3, 6), boon('peace', -10)], lose: [hurt(1, 2), boon('peace', -10)],
        winText: 'Les plus beaux plants du palais sont dans nos champs, et une première récolte déjà sur nos tables. Nos rivaux crient au vol : la paix sera plus dure à faire.',
        loseText: 'Pris la main dans le jardin : un blessé dans la fuite, et nos rivaux crient au vol.',
      },
    ],
  },
];

/** Les visites encore proposées (sans celles retirées) */
export const ISLE_OFFERED = ISLE_MISSIONS.filter((m) => !RETIRED_ISLE.has(m.id));
