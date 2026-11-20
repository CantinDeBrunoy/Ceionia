import { hash2 } from '../core/rng';
import { isEnglish, tr } from '../i18n';

/**
 * L'identité des habitants qu'on voit (les passants d'`Agents`) : rien n'est sauvegardé, tout se déduit. Le prénom vient du
 * numéro de l'habitant, le nom de famille de sa maison (toute la maisonnée le partage) ; les deux listes changent avec l'âge du
 * village et la langue. La phrase de la fiche dit ce qui lui manque, d'après les vrais besoins du village et sa situation
 * (travail, maison, saison) : voir `citizenWish`
 */

/** Prénoms, par âge (0 à 5), en français puis en anglais : un homme, une femme, en alternance (voir `firstName`) */
const FIRST: [string[], string[]][] = [
  [['Bor', 'Ara', 'Kaël', 'Mira', 'Tarn', 'Oka', 'Dagh', 'Séfa', 'Rok', 'Nouri', 'Ush', 'Wéna', 'Grah', 'Tala', 'Torv', 'Yéna', 'Lio', 'Saba', 'Éko', 'Ilun'],
    ['Bor', 'Ara', 'Kael', 'Mira', 'Tarn', 'Oka', 'Dagh', 'Sefa', 'Rok', 'Nuri', 'Ush', 'Wena', 'Grah', 'Tala', 'Torv', 'Yena', 'Lio', 'Saba', 'Eko', 'Ilun']],
  [['Marcus', 'Livia', 'Cassius', 'Julia', 'Thalès', 'Daphné', 'Lucius', 'Octavia', 'Cyrus', 'Hélène', 'Titus', 'Aurélia', 'Nikias', 'Phèdre', 'Gaius', 'Sabina', 'Ariston', 'Lydia'],
    ['Marcus', 'Livia', 'Cassius', 'Julia', 'Thales', 'Daphne', 'Lucius', 'Octavia', 'Cyrus', 'Helen', 'Titus', 'Aurelia', 'Nikias', 'Phaedra', 'Gaius', 'Sabina', 'Ariston', 'Lydia']],
  [['Guillaume', 'Aliénor', 'Thibaut', 'Ysabeau', 'Gauthier', 'Mahaut', 'Perceval', 'Blanche', 'Enguerrand', 'Héloïse', 'Bertrand', 'Clémence', 'Godefroy', 'Jehanne', 'Arnaud', 'Aude', 'Hugues', 'Bérengère'],
    ['William', 'Eleanor', 'Theobald', 'Isabel', 'Walter', 'Matilda', 'Percival', 'Blanche', 'Godfrey', 'Joan', 'Bertram', 'Agnes', 'Edmund', 'Alice', 'Roland', 'Maud', 'Hugh', 'Rosamund']],
  [['Émile', 'Louise', 'Jules', 'Marguerite', 'Victor', 'Berthe', 'Gaston', 'Augustine', 'Léon', 'Eugénie', 'Albert', 'Céleste', 'Firmin', 'Joséphine', 'Octave', 'Adèle'],
    ['Arthur', 'Edith', 'Albert', 'Florence', 'Henry', 'Mabel', 'Walter', 'Ada', 'George', 'Clara', 'Frederick', 'Beatrice', 'Percy', 'Violet', 'Ernest', 'Harriet']],
  [['Lucas', 'Camille', 'Hugo', 'Jade', 'Nathan', 'Léa', 'Théo', 'Manon', 'Yanis', 'Sarah', 'Bastien', 'Emma', 'Rayan', 'Zoé', 'Malik', 'Lina'],
    ['Jack', 'Emily', 'Noah', 'Olivia', 'Liam', 'Mia', 'Ethan', 'Grace', 'Leo', 'Ava', 'Oscar', 'Ruby', 'Sam', 'Isla', 'Omar', 'Zara']],
  [['Orion', 'Nova', 'Kaï', 'Lyra', 'Zéphyr', 'Véga', 'Atlas', 'Astra', 'Sol', 'Rhéa', 'Élio', 'Io', 'Tycho', 'Nyx', 'Castor', 'Séléné'],
    ['Orion', 'Nova', 'Kai', 'Lyra', 'Zephyr', 'Vega', 'Atlas', 'Astra', 'Sol', 'Rhea', 'Elio', 'Io', 'Tycho', 'Nyx', 'Castor', 'Selene']],
];

/** Noms de famille (ou de clan, à la Préhistoire), par âge, en français puis en anglais */
const FAMILY: [string[], string[]][] = [
  [['de l’Ours', 'du Loup', 'du Cerf', 'de l’Aigle', 'du Saumon', 'de la Loutre', 'du Bison', 'du Corbeau', 'du Lynx', 'de la Grue'],
    ['of the Bear', 'of the Wolf', 'of the Stag', 'of the Eagle', 'of the Salmon', 'of the Otter', 'of the Bison', 'of the Raven', 'of the Lynx', 'of the Crane']],
  [['Antonius', 'Valerius', 'Cornelius', 'Fabius', 'Claudius', 'Aemilius', 'Flavius', 'Sergius', 'Dorios', 'Kallias'],
    ['Antonius', 'Valerius', 'Cornelius', 'Fabius', 'Claudius', 'Aemilius', 'Flavius', 'Sergius', 'Dorios', 'Kallias']],
  [['Lefèvre', 'Meunier', 'Boulanger', 'Tisserand', 'Charpentier', 'Fournier', 'Mercier', 'Vigneron', 'Chevalier', 'Pelletier'],
    ['Smith', 'Miller', 'Baker', 'Weaver', 'Carpenter', 'Fletcher', 'Thatcher', 'Cooper', 'Knight', 'Tanner']],
  [['Martin', 'Durand', 'Moreau', 'Laurent', 'Girard', 'Rousseau', 'Fontaine', 'Lemoine', 'Blanchard', 'Gauthier'],
    ['Hughes', 'Turner', 'Hardy', 'Collins', 'Shaw', 'Bennett', 'Ward', 'Wright', 'Hobbs', 'Clarke']],
  [['Petit', 'Leroy', 'Bonnet', 'Garnier', 'Faure', 'Benali', 'Nguyen', 'Da Silva', 'Lambert', 'Ortega'],
    ['Taylor', 'Brown', 'Patel', 'Walker', 'Evans', 'Khan', 'Murphy', 'Lee', 'Nowak', 'Okafor']],
  [['Altaïr', 'Kepler', 'Solaris', 'Méridien', 'Cassini', 'Halley', 'Lumen', 'Vesper', 'Hubble', 'Aurore'],
    ['Altair', 'Kepler', 'Solaris', 'Meridian', 'Cassini', 'Halley', 'Lumen', 'Vesper', 'Hubble', 'Aurora']],
];

const listOf = (t: [string[], string[]][], age: number) => t[Math.max(0, Math.min(t.length - 1, age))][isEnglish() ? 1 : 0];

/** Le prénom d'un habitant (son numéro) à cet âge du village : un prénom de femme pour une femme (`folkTraits`) */
export function firstName(id: number, age: number, woman: boolean): string {
  const l = listOf(FIRST, age), half = l.length >> 1;
  return l[Math.floor(hash2(id, 0, 313) * half) * 2 + (woman ? 1 : 0)];
}

/** Le nom de famille d'une maison (son numéro de bâtiment) à cet âge : toute la maisonnée le porte */
export function familyName(home: number, age: number): string {
  const l = listOf(FAMILY, age);
  return l[Math.floor(hash2(home, 0, 317) * l.length)];
}

/** Prénom et nom (« Mira du Loup », « Guillaume Meunier ») */
export const citizenName = (id: number, home: number, age: number, woman: boolean) => `${firstName(id, age, woman)} ${familyName(home, age)}`;

/** Ce que l'on sait d'un habitant et de son village pour lui faire dire ce qui lui manque */
export interface WishCtx {
  /** identifiant (varie les phrases d'un habitant à l'autre) */
  id: number;
  age: number;
  child: boolean;
  /** il a un métier (ou une parcelle aux champs) */
  working: boolean;
  /** blessé, au repos ; en expédition */
  resting: boolean;
  away: boolean;
  /** les besoins du village comblés (voir `Sim`), et s'il reste de la place pour d'autres */
  food: boolean; water: boolean; jobs: boolean; joy: boolean; health: boolean; room: boolean;
  /** des pompiers et la police jusqu'à sa maison (`computeCoverage`) ; un poste existe au village */
  guarded: boolean; posts: boolean;
  /** distance de sa maison au puits le plus proche (cases ; Infinity sans puits), une école au village */
  wellDist: number; school: boolean;
  /** des fleurs, une fontaine ou une statue à deux cases de chez lui */
  pretty: boolean;
  /** saison (0 printemps … 3 hiver), il pleut fort, il fait nuit */
  season: number; rain: boolean; night: boolean;
}

/** La phrase et son ton : `need` (un manque qui freine le village), `wish` (un souhait, sans effet), `happy` */
export interface Wish { text: string; tone: 'need' | 'wish' | 'happy' }

/** Un puits plus loin que ceci, de sa maison, se remarque (n'a aucun effet : les besoins n'ont pas de portée) */
export const WELL_FAR = 14;

/**
 * Ce que dit l'habitant, dans l'ordre : sa blessure, puis les manques qui bloquent le village (faim, soif, travail, soins,
 * bien-être, place), puis ses souhaits à lui (puits loin, rue sans garde, froid, pluie), sinon une phrase contente
 */
export function citizenWish(c: WishCtx): Wish {
  const need = (text: string): Wish => ({ text, tone: 'need' }), wish = (text: string): Wish => ({ text, tone: 'wish' });
  if (c.away) return wish(tr('Je suis en expédition, loin du village.'));
  if (c.resting) return wish(tr('Je me remets de mes blessures, encore quelques jours.'));
  if (!c.food) return need(tr('J’ai faim : les greniers sont presque vides.'));
  if (!c.water) return need(tr('J’ai soif : il manque de l’eau au village.'));
  if (!c.jobs && !c.working && !c.child) return need(tr('Je n’ai pas de travail : il manque des lieux où travailler.'));
  if (!c.health) return need(tr('Je tousse depuis des jours, et personne pour me soigner.'));
  if (!c.joy) return need(tr('On s’ennuie, ici : pas de lieu où se retrouver le soir.'));
  if (c.child && !c.school && c.age >= 1) return wish(tr('J’aimerais aller à l’école, mais il n’y en a pas.'));
  if (!c.room) return need(tr('Ma cousine voudrait venir vivre ici, mais il n’y a plus de maison libre.'));
  if (c.wellDist > WELL_FAR && Number.isFinite(c.wellDist)) return wish(tr('Le puits est loin de chez moi.'));
  if (c.posts && !c.guarded && c.age >= 1) return wish(tr('Ma rue est loin des pompiers et des gardes, ça m’inquiète.'));
  if (c.season === 3 && !c.night) return wish(tr(c.age >= 3 ? 'Brr, qu’il fait froid. Vivement le printemps.' : 'J’ai froid. Vivement le printemps.'));
  if (c.rain) return wish(tr('Quelle pluie ! Je reste au sec.'));
  if (c.pretty) return { text: tr('J’aime les fleurs devant chez moi.'), tone: 'happy' };
  const happy = c.child
    ? [tr('J’ai joué toute la journée !'), tr('Plus tard, je partirai en expédition.')]
    : [tr('Le village me plaît, on y vit bien.'), tr('Belle journée pour travailler.'), tr('On mange bien, on dort au sec : que demander de plus ?'), tr('J’aimerais un banc pour regarder passer les gens.')];
  return { text: happy[Math.floor(hash2(c.id, c.season, 41) * happy.length)], tone: 'happy' };
}

/** Ce que fait chaque métier, en quelques mots (fiche d'un habitant) */
const JOB_TEXT: Record<string, string> = {
  farmer: 'Cultive la terre', woodcutter: 'Coupe du bois', quarry: 'Extrait la pierre', fisher: 'Pêche', smith: 'Fabrique et répare',
  miller: 'Moud le grain', priest: 'Officie au temple', healer: 'Soigne les malades', teacher: 'Enseigne', guard: 'Monte la garde',
  firefighter: 'Lutte contre le feu', merchant: 'Tient un étal', herder: 'Garde les bêtes', keeper: 'Élève des abeilles', servant: 'Accueille le public',
};
export const jobText = (kind: string) => tr(JOB_TEXT[kind] ?? 'Travaille');
