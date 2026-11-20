import { registerDict } from '../index';

/** Textes français -> anglais : les habitants (fiche d'un habitant, arrivées de nouveaux venus) */
registerDict('citizens', {
  // ce que dit un habitant
  'Je suis en expédition, loin du village.': 'I’m away on an expedition, far from the village.',
  'Je me remets de mes blessures, encore quelques jours.': 'I’m getting over my wounds, a few more days.',
  'J’ai faim : les greniers sont presque vides.': 'I’m hungry: the granaries are nearly empty.',
  'J’ai soif : il manque de l’eau au village.': 'I’m thirsty: the village is short of water.',
  'Je n’ai pas de travail : il manque des lieux où travailler.': 'I have no work: we need more places to work.',
  'Je tousse depuis des jours, et personne pour me soigner.': 'I’ve been coughing for days, and no one to treat me.',
  'On s’ennuie, ici : pas de lieu où se retrouver le soir.': 'It’s dull here: nowhere to meet up in the evening.',
  'J’aimerais aller à l’école, mais il n’y en a pas.': 'I’d like to go to school, but there isn’t one.',
  'Ma cousine voudrait venir vivre ici, mais il n’y a plus de maison libre.': 'My cousin would like to come and live here, but there’s no free house left.',
  'Le puits est loin de chez moi.': 'The well is far from my home.',
  'Ma rue est loin des pompiers et des gardes, ça m’inquiète.': 'My street is far from the firemen and the guards, and it worries me.',
  'Brr, qu’il fait froid. Vivement le printemps.': 'Brr, it’s cold. Bring on the spring.',
  'J’ai froid. Vivement le printemps.': 'I’m cold. Bring on the spring.',
  'Quelle pluie ! Je reste au sec.': 'What rain! I’m staying dry.',
  'J’aime les fleurs devant chez moi.': 'I love the flowers in front of my home.',
  'J’ai joué toute la journée !': 'I played all day!',
  'Plus tard, je partirai en expédition.': 'One day, I’ll go on an expedition.',
  'Le village me plaît, on y vit bien.': 'I like this village. Life is good here.',
  'Belle journée pour travailler.': 'A fine day for work.',
  'On mange bien, on dort au sec : que demander de plus ?': 'We eat well, we sleep dry: what more could we want?',
  'J’aimerais un banc pour regarder passer les gens.': 'I’d like a bench to watch people go by.',
  // son métier
  'Cultive la terre': 'Farms the land', 'Coupe du bois': 'Cuts wood', 'Extrait la pierre': 'Quarries stone', 'Pêche': 'Fishes',
  'Fabrique et répare': 'Makes and mends', 'Moud le grain': 'Grinds grain', 'Officie au temple': 'Serves at the temple', 'Soigne les malades': 'Cares for the sick',
  'Enseigne': 'Teaches', 'Monte la garde': 'Stands guard', 'Lutte contre le feu': 'Fights fires', 'Tient un étal': 'Keeps a stall',
  'Garde les bêtes': 'Tends the animals', 'Élève des abeilles': 'Keeps bees', 'Accueille le public': 'Welcomes visitors', 'Travaille': 'Works',
  'Enfant': 'Child', 'Cultive la terre · aux champs': 'Farms the land · in the fields', 'Sans métier': 'No trade',
  // ce qu'il fait
  'Se repose chez soi, blessé': 'Resting at home, wounded', 'Chez soi': 'At home', 'Au travail, à l’intérieur': 'At work, indoors',
  'À l’intérieur d’un bâtiment': 'Inside a building', 'Court éteindre un incendie': 'Running to put out a fire', 'Rentre chez soi': 'Heading home',
  'En chemin': 'On the way', 'Aux champs': 'In the fields', 'Se repose': 'Resting', 'Discute': 'Chatting', 'Joue': 'Playing', 'Court': 'Running',
  'Se promène': 'Strolling', 'S’entraîne': 'Training', 'Flâne': 'Idling',
  // sa maison
  'Campe sur la place du village': 'Camps on the village square', 'Sans toit': 'Homeless', '{home}, famille {family}': '{home}, family {family}',
  'Famille {family} : {names}': 'Family {family}: {names}',
  // fiche : boutons, arrivées
  'Suivre': 'Follow', 'Ne plus suivre': 'Stop following', 'Sa maison': 'Home',
  'Tant qu’il manque au village {list}, personne de nouveau n’y arrive.': 'As long as the village lacks {list}, no newcomers will arrive.',
  'Le village est plein : il faut des maisons pour accueillir du monde.': 'The village is full: it needs houses to take people in.',
  'de quoi manger': 'food', 'de l’eau': 'water', 'du travail': 'work', 'des soins': 'care', 'du bien-être': 'well-being',
  'du travail ({n})': 'work ({n})', 'des soins ({n})': 'care ({n})',
  'Village plein : bâtissez des maisons pour accueillir de nouveaux habitants.': 'Village full: build houses to take in new villagers.',
  'Personne de nouveau n’arrive : il manque {list}.': 'No newcomers are arriving: the village lacks {list}.',
  'De nouveaux habitants arrivent : le prochain est en route.': 'New villagers are arriving: the next one is on the way.',
  '(Plus lentement : le village se remet d’un manque.)': '(More slowly: the village is recovering from a shortage.)',
});
