# Ponts sur les petits cours d'eau : diagnostic (avant de coder)

Captures « avant » : `avant-*.jpg` dans ce dossier (ruisseau encaissé droit à chaque âge, jonctions près du pont, rivière large, route en escalier, torrent, hiver de nuit).

## Cause commune

1. **La hauteur du tablier est tirée du niveau de l'eau, pas de la chaussée des rives.** `World.bridgeY` = niveau d'eau + 0,24 quelle que soit la rive. Sur une rivière large et plate (rives à 0,1) ça tombe juste ; sur un petit ruisseau encaissé (rives à 0,8 … 1,4, fond à −0,8) le tablier voulu est très en dessous des rives, et `deckProfile` le remonte alors jusqu'au **point de sol le plus haut de la portée** : le tablier se cale sur la rive la plus haute, surplombe l'autre rive de 0,5, et l'on rattrape par des rampes raides et des culées massives (captures 01 à 05). Les habitants et véhicules, eux, marchent à `max(bridgeY, sol)` : une autre hauteur que le tablier dessiné.
2. **Trois générateurs pour le même objet**, chacun avec sa règle de hauteur, de largeur, d'extrémités et de matériaux : `smoothBridge` (chaîne simple), `bridge()` par case (dès qu'une jonction touche une case d'eau : boîtes posées à plat, un seul garde-corps, rampes qui pendent, captures 06, 10, 13) et `Streams.buildBridges` (torrents : caisson de bois 1 × 0,5 posé à la hauteur du point le plus haut alentour, toujours en bois, même sur du bitume, captures 09 et 12).
3. **L'axe du pont est le chapelet des centres de cases**, lissé : une route en escalier donne un tablier qui serpente (captures 08 et 11), et le pont s'étend jusqu'à 4 cases sèches entre deux bras : un tablier sur l'herbe.

## Remède

Un seul module (`src/world/crossings.ts`) détecte chaque franchissement une fois (cases d'eau portées, tronçons entre rives et nœuds, axe simplifié par les milieux de bords) et calcule **un profil unique** : la corde entre les deux pieds de rampe (hauteur de la chaussée des rives), relevée juste ce qu'il faut au-dessus de l'eau (+0,24) et jamais sous le sol. `World.surfaceAt`, `bridgeY` et `passPoint` lisent ce même profil (habitants et véhicules sur le tablier). `roads.ts` ne fait plus que dessiner ce profil, avec un style par âge ; les torrents reçoivent une dalle ou une passerelle du même style, et le torrent passe sous la route.
