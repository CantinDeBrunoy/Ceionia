# Village Lowpoly

Jeu de construction contemplatif en navigateur : on sculpte le terrain, on bâtit un village et on le regarde traverser **5 âges** (Préhistoire → Moderne) et **4 saisons**. Bâtiments, relief, cultures et sons sont procéduraux (géométrie low-poly, sons Web Audio) ; arbres, buissons, rochers et animaux de ferme ou sauvages sont des modèles Quaternius (voir Crédits).

## Installation et lancement

```bash
npm install
npm run dev        # serveur de développement (http://localhost:5173)
npm run build      # vérification TypeScript + build statique dans dist/
npm run preview    # sert le dossier dist/
npm test           # tests automatiques (génération, sauvegarde, eau, volcans, récoltes)
```

Le dossier `dist/` est 100 % statique (déployable tel quel).

## Contrôles

| Action | Souris / clavier | Tactile |
|---|---|---|
| Utiliser l'outil | clic gauche (glisser pour sculpter, tracer une route…) | un doigt |
| Tourner la caméra | clic droit + glisser, ou A / E (Q / E en QWERTY) | deux doigts (rotation) |
| Déplacer la caméra | clic milieu ou Maj + clic droit, ou ZQSD / flèches (WASD en QWERTY) | deux doigts (glisser) |
| Zoom | molette, ou + / − du pavé numérique | pincement |
| Relief | 1 monter, 2 baisser, 3 aplanir, 4 falaise, 5 creuser (eau), 0 montagne ; volcan (un clic) depuis l'onglet | onglet Relief |
| Nature | 6 forêt, 7 champ, 8 jardin, 9 gomme ; rochers, grotte et faille (un clic) depuis l'onglet | onglet Nature |
| Monde souterrain | clic sur une grotte ou une faille (outil « Voir »), ou U / bouton ⛏️ ; sous terre : T torches, U remonter | toucher l'entrée, boutons de la barre |
| Bâtir | B bâtiment, R route, X démolir, M déplacer, T tourner | onglet Bâtir (le bâtiment est posé au relâchement du doigt) |
| Taille du pinceau | [ et ] (^ et $ en AZERTY) | curseur « Taille » |
| Annuler / rétablir | Ctrl+Z / Ctrl+Y | boutons ↩️ ↪️ |
| Pause | Espace | bouton ⏸ |
| Mode photo | P (H masque l'interface) | bouton 📷 |

Réglages (⚙️) : vitesse, durée du jour et des saisons, choix manuel de la saison et de l'heure, météo (auto, clair, pluie, neige, brume), **graphismes** (haute avec halo de nuit, normale, réduite sans brume et avec moins de particules), **catastrophes naturelles** (activées ou non), **routes auto** (activées ou non), volumes audio, sauvegarde, export/import JSON, nouvelle partie.

## Principe de jeu

Le village a des **besoins** (nourriture, eau, logement, travail, bien-être) satisfaits par la présence de bâtiments, de champs, de jardins ou d'une rivière proche. Si un besoin manque, la population cesse simplement de croître (message doux dans le HUD). Quand la population et les bâtiments requis sont atteints, le village passe à l'âge suivant et les bâtiments « évoluent » avec une animation.

- **Pêche** : le **ponton de pêche** (coin de pêche, puis ponton, pêcherie, conserverie, port) se pose au bord de l'eau (mer, rivière ou lac de montagne) et nourrit le village ; ses pêcheurs vont au bout du platelage et une barque rame alentour.
- **Routes automatiques** (réglage, activées par défaut) : à la pose d'un bâtiment, un chemin part de sa porte jusqu'à la route la plus proche (ou, au tout début, jusqu'au bâtiment voisin). Mesurées : rien si le bâtiment touche déjà une route, rien pour un lampadaire, jamais plus de 14 cases ; le tracé contourne champs, jardins, forêts, pentes et eau, et ne longe pas une route existante. Un hameau qui atteint trois bâtiments se relie une fois au village s'il est à moins de 18 cases. Le chemin s'annule avec le bâtiment (Ctrl+Z).
- **Ponts** : une route peut franchir l'eau peu profonde (rivière, mare, lac) ; elle devient un pont sur pilotis avec garde-corps, de bois puis de pierre et d'acier. Les habitants et les charrettes l'empruntent ; une passerelle enjambe les torrents. Sans pont, habitants et animaux contournent l'eau et les lacs, où l'on ne bâtit pas.
- **Pluie et sécheresse** : la pluie humidifie les sols, l'été les assèche ; les champs donnent jusqu'à 110 % après la pluie et à peine plus de la moitié en pleine sécheresse.
- **Cendres fertiles** : un champ semé sur une ancienne coulée de lave donne double récolte.
- **Minerai** : les âges industriel et moderne demandent du minerai (12 puis 30), extrait d'un clic sur les filons des parois du monde souterrain.
- **Catastrophes** (réglage, activées par défaut) : de temps en temps la terre tremble et un volcan se réveille de lui-même ; ses coulées engloutissent ce qu'elles touchent. La foudre (pendant les orages) et les bombes de lave mettent le feu aux bâtiments : les habitants accourent et, avec un puits ou de l'eau à quelques cases, éteignent l'incendie ; sinon le bâtiment brûle. Désactivées, rien n'est détruit et les feux finissent par s'éteindre.

## Monde

Quatre cartes : **Île flottante**, **Vallée** et **Plateaux** (96 × 96 cases), et le **Continent** (192 × 192, quatre fois plus grand) qui les réunit (plateaux en gradins au nord-ouest, montagnes enneigées d'où descend une rivière, île volcanique au sud-ouest) et ajoute de nouvelles contrées : un grand lac et son îlot, des mesas dans le désert à l'est, un archipel tropical au sud-est. Sur une si grande carte, seule la zone retouchée du relief est recalculée (sculpture fluide) et les teintes de saison changent par bandes.

Chaque carte se partage entre cinq **biomes**, déduits d'un climat propre à la carte (axe froid → chaud, humidité, altitude, proximité de l'eau) :

- **Tempéré** : prairies fleuries, bouleaux et sapins, moutons, chevaux sauvages, biches, renards ;
- **Taïga** : sapins (enneigés l'hiver et sur les sommets), meutes de loups, cerfs, lamas sur les hauteurs ;
- **Désert** : dunes, cactus, arbres morts, grès rosé, lamas ;
- **Tropical** : palmiers, fougères, fleurs vives, coraux dans les lagons ;
- **Marais** : mares d'eau dormante, saules, roseaux, nénuphars, grenouilles.

Le biome suit le relief : une montagne sculptée se couvre de taïga, la forêt plantée au désert devient des cactus.

**Hautes montagnes** : les chaînes se hérissent de pics (jusqu'à environ 15 de haut sur le Continent, 12 sur la Vallée et les Plateaux, 10 sur l'Île), étagées en forêt, roche nue au-dessus de la limite des arbres puis neiges éternelles. Les **volcans** dominent leur île : un grand cône au cratère à fond plat où bouillonne un lac de lave ; l'outil Volcan bâtit un cône d'autant plus haut que le pinceau est large. Avec l'outil « Voir », **un clic sur un volcan déclenche une éruption** : grondement et secousses, explosion, bombes de lave et fontaine au-dessus du cratère, panache de cendres rougeoyant, coulées qui descendent les flancs puis refroidissent en croûte sombre, lueur orangée la nuit ; animaux et oiseaux détalent. Les coulées laissent des **champs de lave** noirs (les arbres y brûlent ; les routes sont épargnées, et les bâtiments, champs et jardins aussi quand les catastrophes sont désactivées) que la mousse, l'herbe puis la forêt regagnent en trois saisons. Au pied des volcans fument des fumerolles et des **sources chaudes** turquoise.

**Eaux de montagne** : les creux d'altitude se remplissent jusqu'à leur point de débordement et deviennent des **lacs de montagne** (quelques cuvettes fermées par une moraine sont creusées à la génération ; un creux sculpté en hauteur se remplit aussi, s'il n'y a ni bâtiment, ni route, ni champ, ni arbres au fond). Des **torrents** descendent des sommets et des déversoirs des lacs jusqu'à la mer, en **cascades** écumantes sur les à-pics, avec des embruns à leur pied ; lacs et torrents gèlent l'hiver. Dans les **rivières**, des stries claires filent vers l'aval, dans le sens de la pente de la vallée. Sur les replats des neiges éternelles, la neige tourne à la **glace** bleutée.

**Atmosphère** : brume du matin qui stagne dans les creux (plus épaisse à l'automne et par brouillard), nuages cotonneux accrochés aux plus hauts sommets, **arc-en-ciel** quand la pluie cesse, **orages** l'été (éclairs, illumination, tonnerre qui roule avec la distance), **aurores boréales** les nuits d'hiver. La nuit, fenêtres, lave, lucioles et éclairs rayonnent d'un léger **halo** (désactivé en qualité réduite) ; les creux du relief sont un peu ombrés.

**Jardins** : chaque zone peinte à l'outil Jardin devient un lieu de rencontre qui change avec les âges et s'organise selon sa taille et sa forme (un petit jardin reste simple, un grand se remplit). **Préhistoire** : lieu de rassemblement en terre battue, feux entourés de rondins (broche au-dessus du plus grand), boucherie, taille du silex, séchoirs à viande, peaux tendues, tipis et menhir dans les grands camps ; les flammes dansent, fument et éclairent la nuit. **Antiquité** : pelouse, bassin (statue et colonnades dans les grands jardins), allées de gravier bordées de cyprès, oliviers, bancs de marbre, amphores, carrés d'herbes, autel. **Moyen Âge** : sur une zone longue, un **tournoi** — deux chevaliers caparaçonnés chargent lance couchée le long de la lice, tentes rayées aux couleurs des champions, gradins sous auvent, bannières ; sur une petite zone, des lices d'entraînement (quintaine, cibles de tir à l'arc). **Âge industriel** : jardin **à la française** sur un terrain rectangulaire (fontaine, allées en croix, parterres bordés de buis, topiaires, statues, réverbères à gaz) ou **à l'anglaise** sur une zone aux contours libres (allée sinueuse, étang, kiosque à musique, fabrique, bosquets, massifs). **Époque moderne** : un parc avec **aire de jeux** sur sol souple (toboggan, balançoires et bascule qui bougent, tourniquet, jeu à ressort, bac à sable, dôme à grimper), arbres, bancs, tables de pique-nique, fontaine. Les habitants y prennent place : assis au coin du feu ou sur un banc, à l'ouvrage, debout dans les gradins à acclamer les jouteurs ; les enfants courent sur la pelouse et jouent sur les jeux.

**Végétation** : formes de diorama, procédurales — feuillus ronds et touffus (grappe de boules de feuillage, sombres dessous, sur un tronc évasé), sapins à étages de cônes facettés (calottes de neige l'hiver et en altitude), buissons ronds, rochers arrondis et facettés ; herbe d'un vert franc, eau turquoise. Les palmiers, cactus, saules et arbres morts des autres biomes restent des modèles Quaternius.

**Villages et chemins** : les routes sont de vrais chemins de terre qui serpentent (les virages s'arrondissent, un escalier de cases devient une courbe), aux bords doux, liserés de terre plus sombre et semés de cailloux ; pavés plus droits à l'âge industriel, asphalte et trottoirs à l'époque moderne. Des lanternes sur poteau les bordent dès l'Antiquité (puis réverbères à gaz, puis lampadaires), la terre est battue devant les ateliers, le marché, les fermes et les moulins, et tonneaux, caisses et sacs traînent au pied des maisons. Au Moyen Âge, les maisons ont un rez-de-chaussée de pierre et un étage à colombages en encorbellement, sous des toits raides bleu-vert, bleus ou de tuile, avec une tourelle d'angle ou une lucarne ; le moulin à vent est une tour octogonale à colombages aux ailes en treillis, la forge abrite son foyer rougeoyant sous un appentis, le marché aligne des étals sous des auvents rayés. Les habitants ne se marchent pas dessus : chaque place (bout du ponton, abords du puits ou du feu, banc, quart de case sur un chemin ou dans un champ) n'accueille qu'une personne à la fois.

**Village vivant** : les habitants vont aux champs, à l'atelier, au bout des pontons pour pêcher, à la lisière pour couper du bois ; des enfants jouent en courant près des lieux de rencontre. Des charrettes (puis des voitures) parcourent les routes en tenant leur droite, des barques pêchent autour des pontons, des voiliers croisent au large à partir du Moyen Âge.

**Sons** : murmure des torrents et grondement des cascades à leur approche, vent qui forcit en altitude, cris de mouettes près des côtes et d'aigles en montagne, crépitement des feux, plouf des poissons, tonnerre, grondement d'un volcan qui se réveille, coups de pioche sous terre.

**Petites touches de vie** : fumée des cheminées (plus épaisse l'hiver, au lever et à l'heure du dîner ; noire au-dessus des forges et des usines), lucioles des nuits d'été, feuilles mortes en automne et pétales au printemps, poissons qui sautent, nuées d'étourneaux au crépuscule, aigles qui tournoient autour des pics, bouquetins sur les hauts pâturages, mouettes au-dessus des rivages.

La faune interagit avec la flore et entre elle : les herbivores broutent (l'herbe et les fleurs repoussent ensuite) et vont boire au bord de l'eau ; renards et loups chassent lapins, poules, biches, moutons et lamas, qui détalent en troupeau ; les lapins grignotent les jardins ; les abeilles butinent et font fleurir les prairies ; les oiseaux chanteurs se posent à la cime des arbres et s'envolent à l'approche d'un danger ; les dauphins traquent les bancs de poissons.

Les prairies et les sous-bois sont semés de détails : arbres isolés, buissons, fougères, champignons (plus nombreux à l'automne), souches et troncs moussus, touffes de fleurs, cailloux ; ossements blanchis au désert.

### Monde souterrain

Sous chaque carte s'étend un réseau de galeries façon Minecraft : grandes cavernes et tunnels sinueux, tous reliés aux **grottes** (une ou deux par carte, arche rocheuse creusée dans un versant) et aux **failles** (ravins profonds façon Minecraft, parois à pic et filons de minerai, une lueur violette au fond). On y descend en cliquant sur une entrée ; un puits de lumière marque chaque sortie. Les zones suivent le biome du dessus :

- **Galeries** (tempéré) : stalagmites, filons de charbon, fer, or, redstone, lapis, diamant et émeraude ;
- **Grotte de cristal** et **grotte de glace** (taïga) : forêts de cristaux lumineux ;
- **Grotte luxuriante** (marais, tropiques) : champignons géants phosphorescents, fougères ;
- **Cavernes de magma** (désert, volcans) : basalte et lacs de lave ; lacs souterrains ailleurs.

Seules les lueurs (cristaux, champignons, lave, puits de jour, torches) et la lanterne au centre de la vue éclairent les galeries. Les créatures y vivent leur vie : les zombies suivent la lanterne en traînant des pieds, les squelettes leur cherchent querelle, les araignées bondissent sur les slimes et les champignons vivants, deux petits slimes fusionnent en un gros qui finit par se diviser, les fantômes fuient la lumière, les chauves-souris tournoient sous la voûte. Les torches (posées et retirées d'un clic, sauvegardées) font fuir les monstres et attirent les champignons vivants, qui viennent y danser ; un clic sur une créature la fait détaler. Un clic sur un **filon** l'extrait : charbon (1), fer et lapis (2), or et rubis (3), diamant et émeraude (5 unités de minerai) ; les filons exploités ne reviennent pas.

## Crédits

Modèles 3D de [Quaternius](https://quaternius.com), licence **CC0** (domaine public), récupérés sur [Poly Pizza](https://poly.pizza/u/Quaternius) et placés dans `public/models/` : mouton, vache, cochon, poule, biche et cerf. Faune marine de Quaternius également (dauphin, baleine, raie manta, poissons), comme les modèles des biomes : palmiers, cactus, saule, sapin enneigé, arbre mort, nénuphars, renard, loup, cheval, lama et grenouille. Détails et souterrain, Quaternius encore : tronc moussu, souche, fougère, fleurs, champignon, minéral, toile d'araignée, et les créatures animées (zombie, squelette, araignée, slime, champignon vivant « Mushnub », fantôme). Habitants : aventuriers du pack **KayKit Adventurers** de [Kay Lousberg](https://kaylousberg.com) (CC0, barbare, chevalier, mage, voleurs ; armes retirées et animations réduites à l'essentiel) jusqu'au Moyen Âge, puis **Mini Characters** de [Kenney](https://kenney.nl) (CC0). Autres modèles CC0 récupérés sur Poly Pizza : épave de navire par Kenney, coraux par MiniPoly, algues par Mohabins, cristaux par iPoly3D, crâne, cage thoracique et os par Kay Lousberg. Bâtiments, tous CC0 : chaumières, maisons à colombages, forge, marché, église, moulin à vent, château et puits du pack **KayKit Medieval Hexagon** de [Kay Lousberg](https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0) (Antiquité et Moyen Âge, la cathédrale industrielle aussi) ; résidences, bureaux et tours de **KayKit City Builder Bits** ([GitHub](https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0), époque moderne) ; usines, gare et éolienne du **City Kit (Industrial)** et maisons du **City Kit (Suburban)** de [Kenney](https://opengameart.org/content/city-kit-industrial) (ces dernières recolorées en maisons de brique). Couleurs de leur atlas cuites en couleurs de sommets, mis à l'échelle de leur parcelle. Huttes, fermes, pontons, lampadaires, temples et places des autres âges restent procéduraux. Chaque modèle absent ou illisible est remplacé par sa version procédurale.

## Sauvegarde

Sauvegarde automatique toutes les 15 s (et à la fermeture de l'onglet) dans `localStorage`, un emplacement par carte ; elle garde aussi les champs de lave, les cendres fertiles, le minerai et les filons exploités (les anciennes sauvegardes se chargent sans). Export/import JSON depuis les réglages ou le menu principal. Les sauvegardes des anciennes cartes 48 × 48 ne se chargent plus : la carte repart de zéro.

## Structure du code

```
src/
  main.ts          boot, classe Game, boucle de jeu, raccourcis clavier
  core/            caméra orbitale + entrées souris/tactile, temps de jeu, RNG/maths
  world/           grille et heightmap (World), bruit simplex, génération des 3 cartes, pinceaux de relief, monde souterrain (galeries, zones, bassins), plan des jardins selon l'âge
  build/           catalogue (bâtiments, âges), outils (placement fantôme, routes, démolition, undo/redo), routes automatiques, orientation auto
  sim/             besoins/population/âges (Sim), habitants instanciés + pathfinding (Agents)
  render/          modèles procéduraux par âge, terrain/eau, routes, végétation instanciée par tuiles (biomes, niveaux de détail), grottes et failles, faune et ses interactions, bâtiments, jardins (décor par âge, joutes et jeux animés), ciel/météo, saisons, monde souterrain (décor, lumières, créatures),
                   éruptions, lacs, torrents et passerelles, atmosphère (brume, nuages des sommets, arc-en-ciel, orages, aurores), vie ambiante, incendies,
                   trafic (charrettes, barques, voiliers), halo de nuit ; le monde souterrain est chargé à part
tests/             tests automatiques (Vitest)
  audio/           musique générative et ambiances Web Audio
  ui/              HUD, barre d'outils, réglages, menu de sélection de carte
  save/            sérialisation, localStorage, export/import
```

Voir `TODO.md` pour les simplifications connues.
