# Comment marche Ceionia

Le manuel interne du jeu : un fichier par système, avec ses règles, sa place dans le code, ses liens avec le reste et ses pièges. Il sert à retrouver vite comment une chose fonctionne avant d'ajouter une fonctionnalité ou de corriger un bug.

**Règle d'entretien** : un changement qui touche une règle ou un mécanisme met à jour le fichier du système dans le même commit. Un doc faux est pire qu'un doc absent : en cas de doute, le code fait foi, et on corrige le doc.

Le `README.md` à la racine décrit le jeu côté joueur (contenu, bâtiments, contrôles) ; ici, on décrit le fonctionnement.

## Les systèmes

### Moteur et architecture
- [architecture.md](architecture.md) : démarrage, classe `Game`, boucle de jeu, modes (surface, souterrain, Enfers, île), temps de jeu, caméra, dossiers du code.
- [sauvegarde.md](sauvegarde.md) : format, clés du `localStorage`, compatibilité des anciennes parties, export / import.
- [rendu-modeles.md](rendu-modeles.md) : comment un bâtiment devient un modèle 3D selon l'âge, instanciation, niveaux de détail, matériaux, réglages graphiques.
- [interface.md](interface.md) : HUD, menus, onglets et rayons de construction, fiches, notifications, réglages.
- [traduction.md](traduction.md) : `tr`, `localize`, fichiers anglais (voir aussi `src/i18n/README.md`).
- [chargement-performances.md](chargement-performances.md) : écran de chargement, préparation des shaders, coûts connus, régime normal (mesures, ce qui est fait, ce qui reste).
- [audio.md](audio.md) : musique (morceaux enregistrés par âge, menu, Enfers, fin ; musique générative en repli), ambiances, bruitages de proximité (forge, bêtes, foule, volcan…), effets, réglages de volume.

### Le monde
- [monde-carte.md](monde-carte.md) : grille, hauteurs, génération du continent par graine, contrées, cases et leurs couches.
- [iles.md](iles.md) : l'archipel des cartes de 384 cases, les villes de décor des deux peuples rivaux (plan, modèles par âge, points nommés pour la bataille).
- [eau-rivieres.md](eau-rivieres.md) : niveau de la mer, lacs, rivières et torrents, comment les cours d'eau se tracent et se redirigent, ponts et franchissements.
- [vegetation-biomes.md](vegetation-biomes.md) : biomes, climat, arbres, herbe, rochers, saisons sur le décor.
- [outils-terrain.md](outils-terrain.md) : sculpter le relief, falaises, eau, montagnes, volcans et lave, failles, grottes, gomme.
- [ciel-meteo.md](ciel-meteo.md) : jour et nuit, saisons, pluie, neige, orages, arc-en-ciel, aurore, étoiles filantes.
- [saisons.md](saisons.md) : la fiche de chaque saison (sol, arbres, végétation basse, eau, lumière, effets), palettes par arbre, transitions.

### Construire
- [batiments-catalogue.md](batiments-catalogue.md) : le catalogue (`KINDS`), tailles, coûts, âges, rayons, évolutions, déblocages.
- [placement-construction.md](placement-construction.md) : poser, tourner, déplacer, démolir, annuler ; règles de placement et refus.
- [routes.md](routes.md) : routes en ligne et libres, routes automatiques, rendu des routes, piétons et voies.
- [remparts.md](remparts.md) : murailles, portes, tours, chemin de ronde.

### Le village
- [besoins-population.md](besoins-population.md) : besoins, croissance, logement, santé, bien-être, conseil du moment.
- [economie-ressources.md](economie-ressources.md) : ressources, production, stocks, coûts, briques, pétrole et carburant.
- [ages.md](ages.md) : les âges, conditions de passage, ce qui change à chaque âge.
- [objectifs.md](objectifs.md) : les petits objectifs avec récompense entre les conditions d'âge (pastille de la barre du haut).
- [difficulte.md](difficulte.md) : la table des réglages par difficulté.
- [blason.md](blason.md) : le blason du village (deux couleurs, emblème, forme), sur tous ses drapeaux et ses troupes ; la fenêtre de choix ; la peinture par couleurs sentinelles.
- [spectacles.md](spectacles.md) : les gestes des bâtiments (la fête du village, la fête au temple, la représentation, le tournoi, le match, la course, le feu d'artifice) : un bouton sur la fiche, le village qui vient, un spectacle animé, une récompense et un délai.
- [habitants.md](habitants.md) : habitants instanciés, trajets, recherche de chemin, patrouilles et sentinelles.
- [incidents.md](incidents.md) : incendies, cambriolages, interventions des secours, événements.
- [catastrophes.md](catastrophes.md) : les catastrophes naturelles (une au plus par âge) : crues, séismes, pluies de météorites et fer céleste ; bâtiments abîmés et leurs réparations.
- [bac-a-sable.md](bac-a-sable.md) : le mode bac à sable.
- [grand-choix.md](grand-choix.md) : la carte à trois choix de la fin de l'Antiquité (les Enfers, explorer le monde, ni l'un ni l'autre), l'onglet « Grands choix » des expéditions, la cinématique de la traversée.
- [tutoriel.md](tutoriel.md) : étapes, déclencheurs, verrous, chapitres de l'île et des Enfers.
- [ouverture.md](ouverture.md) : la cinématique d'ouverture d'une partie neuve (des nomades aux sédentaires) : le film qui tient lieu d'écran de chargement, son fondu de remplacement, le plan en direct, le réglage.

### Expéditions
- [expeditions.md](expeditions.md) : départ, déroulé, imprévus, retour, gains, suivi par la caméra, véhicules.
- [equipement.md](equipement.md) : pièces, fabrication, exigences des missions.
- [flotte.md](flotte.md) : nos navires de guerre (armés au chantier naval, réparés, modernisés), la bataille navale réglée par des choix tactiques (le bras de mer, le blocus du port) et l'escorte du convoi contre les pirates, étapes des chapitres du conflit.
- [diplomatie.md](diplomatie.md) : les îles rivales (archipel accepté) : choix de l'allié après la cinématique ; au Médiéval, la paix (pourparlers, trêve) ou la guerre (éclaireurs, campagne de l'île rivale), en trois chapitres du Médiéval au Moderne, chacun une condition d'âge (`sim/saga.ts`) ; la concession chez l'allié et la tête de pont chez le rival (zones bornées, fort, ville de garnison, port marchand) ; cosmodrome chez l'allié.
- [monde-souterrain.md](monde-souterrain.md) : retiré côté joueur ; ce qui en reste (moteur de rendu repris par les Enfers, données gardées pour les sauvegardes).

### La guerre
- [portail-ile.md](portail-ile.md) : ouverture du portail, choix du PvE, île, garnison, invasion.
- [enfers.md](enfers.md) : la cinématique du portail (premier passage), carte des Enfers, zones, bastions, objectif, base avancée.
- [armee-combat.md](armee-combat.md) : unités par âge, recrutement, commandement, simulation des combats.
- [fin-du-royaume.md](fin-du-royaume.md) : le roi démon, la chute du royaume, la mise en scène.
- [lore-enfers.md](lore-enfers.md) : le bâton du fondateur, la raison de descendre aux Enfers : sur la place à chaque âge, volé par les démons avant le grand choix (cinématique en direct), repris au roi, et son bonus.

### Transports, vie, fin de partie
- [chemin-de-fer.md](chemin-de-fer.md) : gares, voies, trains, fret, bonus de proximité.
- [trafic.md](trafic.md) : véhicules, bateaux, aéronefs, services ; le conflit vivant entre les îles rivales (escarmouches, incursions, commerce, patrouilles).
- [faune.md](faune.md) : animaux par biome, comportements, enclos, zoo.
- [fin-de-partie.md](fin-de-partie.md) : fusée, voyage, parade, écran de fin.

## Modèle d'un fichier

```markdown
# <Système>

> Fichiers : `src/…/x.ts` (rôle en quelques mots), …
> Tests : `tests/….test.ts`, …
> Voir aussi : [autre.md](autre.md), …

## En bref
Trois à six lignes : à quoi ça sert dans le jeu et le principe.

## Règles du jeu
Ce que le joueur vit : conditions, coûts, durées, valeurs chiffrées, avec le nom de la constante et son fichier.

## Fonctionnement dans le code
Les données (structures, champs, unités : cases, heures de jeu, secondes réelles), les étapes du calcul, qui appelle quoi et
quand (boucle de jeu, événements). Références sous la forme `fichier.ts` › `fonction` ou `Classe.méthode` (pas de numéros de
ligne : ils bougent).

## Liens avec les autres systèmes

## Pièges et invariants
Ce qui casse facilement, compatibilité des sauvegardes, cas limites déjà corrigés.

## Pour modifier
Des recettes : « ajouter un bâtiment », « changer un coût »… les fichiers à toucher, dans l'ordre.
```
