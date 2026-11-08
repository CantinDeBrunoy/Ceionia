# Audit des popups et superpositions (2026-11-08)

Retour utilisateur : « j'ai trop de popup partout sur mon écran ». Public : enfants / casual.
Document de travail. Base : 7096cc4. « Après » = état après la passe (file `src/ui/notifs.ts`).

## 1. Inventaire (du plus gênant au plus discret)

| # | Élément | Où | Déclencheur | Avant | Après |
|---|---|---|---|---|---|
| 1 | Toast `#toast` (un seul élément réécrit) | `ui.toast`, ~70 appels : main.ts, tools.ts, command.ts, ui.ts, tutorial.ts, kingdomStage.ts | tout (refus de pose, départ d'équipe, retour, incendie, sauvegarde, bravo, tutoriel fini…) | un message écrase l'autre (nouvelles perdues), 2,6 s ou 12 s, par-dessus tutoriel / alerte / aides | file `#toasts` : 2 au plus (1 si bannière ou téléphone), priorité, ×N, 3 à 6,5 s, info -> cloche |
| 2 | Bannières `#banner` (nouvel âge, Monde des Enfers, Monde souterrain, royaume) | ui.banner | changement d'âge ou de monde | à chaque entrée, 4,2 s, avec toast et conseil en plus | Enfers et souterrain : 1re fois seulement ; 3,2 s ; attend la fermeture d'une fenêtre ; 1 seul toast avec |
| 3 | Fenêtre « nouveaux bâtiments » (`showNewAge`) | ui.ts | 4,6 s après le passage d'âge | modale | inchangée (c'est une fenêtre voulue), délai 3,6 s (juste après la bannière) |
| 4 | Aides militaires `#warTip` | warTips.ts | moments utiles (portail, île, Enfers, base, royaume) | visibles en même temps que toast / bannière / alerte | se taisent tant qu'un toast, une bannière ou l'alerte d'incursion est à l'écran (déjà : tutoriel, fenêtre, cinématique, aides coupées) |
| 5 | Conseil `#msg` + `#helpBtn` | ui.renderMessage | état du village | visible aussi en commandement | caché pendant le commandement (île, Enfers) et pendant le tutoriel ; réglage `ceionia.aides` respecté |
| 6 | Tutoriel `#tuto`, `#tutoRing` | tutorial.ts | partie neuve | bulle + toast de bienvenue + conseil | bulle seule (bienvenue et fin du tutoriel -> cloche) |
| 7 | Alerte d'incursion `#warAlert` | command.alert | incursion en cours | doublon avec le toast « Incursion ! » | le toast d'incursion devient une ligne de la cloche ; l'avertissement qui la précède reste ; les toasts passent sous l'alerte |
| 8 | Notification de décision d'expédition (`expEvent`) + carte clignotante + badge | ui.expEvent | équipe en attente | toast 12 s | toast d'action (6,5 s, clic mène à la décision) ; carte et badge inchangés. Le choix du joueur n'est plus répété en toast |
| 9 | Récit de retour / `showReport` (modale) | ui.ts | retour d'équipe | modale + toast « l'équipe rentre » | modale seule (le toast devient une ligne de la cloche) |
| 10 | Nouvelles de guerre `war.news` | main.ts | raid, contre-attaque, zone, boss… | tous en toast | raid (avertissement), perte, contre-attaque, boss, zone perdue : toast ; vague repoussée, zone conquise, soins, troupes : cloche |
| 11 | Incendies, urgences, pertes | main.ts (fires, emergencies, losses) | événements | tous en toast | début d'incendie, cambriolage, malaise, perte : toast danger ; « éteint » : cloche |
| 12 | Éruption / tremblement | main.ts | volcan | 2 toasts | « La terre tremble » (action, mène au volcan) ; l'éruption : cloche |
| 13 | Fiche `#info` | ui.renderInfo | outil en main | fiche en bas à droite (+ animation `popIn`/`hintBounce` quand tenue) | inchangée : c'est la réponse directe à l'outil, pas un popup automatique |
| 14 | Badges d'amélioration `upBadges` | render | bâtiment améliorable | flèches 3D | inchangés ; déjà masquables (réglage) |
| 15 | Bulle de curseur `#cursorHint` (route libre) | ui.ts | outil Route | inchangée | inchangée (consigne d'outil, suit la souris) |
| 16 | Toasts de geste (« pas assez de pierre », démolir, etc.) | tools.ts, command.ts | clic du joueur | idem toasts | restent à l'écran (niveau `notice`), dédoublonnés 10 s, jamais retenus par une fenêtre |
| 17 | Sauvegarde / auto-sauvegarde, brouillard dissipé, « Bon retour », ligne ouverte, départ d'équipes | ui.ts, main.ts | divers | toast | cloche seulement |

Non inventorié car absent du code actuel : alertes de contamination (seulement le ruban `tstate`, fixe), quotas, avertissements d'âge (texte dans le HUD, pas de popup).

## 2. Règles appliquées

1. File unique (`NotifQueue`) : 2 messages visibles au plus (1 sur téléphone ≤ 600 px ou si une bannière est à l'écran), empilés en haut au centre sous la barre ; priorité décision > danger > geste du joueur ; un message plus important fait partir les plus faibles après 1,2 s de lecture.
2. Durée 3 à 5 s selon le texte (6,5 s si un clic mène quelque part, et le message reste tant que la souris est dessus) ; au-delà de 8 s d'attente un message est périmé (cloche seulement).
3. Doublons : même texte en moins de 10 s = « ×N » s'il est encore à l'écran, sinon silence.
4. Information (bravo, sauvegarde, départs…) : cloche seulement. Niveaux : `info`, `notice`, `danger`, `action` ; devinés d'après le texte si l'appelant n'a rien dit (`levelOf`).
5. Cloche (`#bBell`) : compteur de non lus, historique des 30 derniers, ouvrir marque lu, « Tout effacer ».
6. Pendant une fenêtre ouverte : les messages automatiques attendent puis sortent groupés à la fermeture (au plus 2 à l'écran, le reste en cloche) ; la réponse à un geste du joueur passe toujours ; les bannières attendent aussi.
7. Une seule aide à la fois : les aides militaires se taisent si un toast, une bannière ou l'alerte est visible ; le conseil se tait en commandement et pendant le tutoriel.
8. Accessibilité : `#toasts` est `role="status" aria-live="polite"` ; la cloche a `aria-expanded` ; animations coupées avec `prefers-reduced-motion`.

## 3. Mesures (navigateur intégré, 1024 x 768, scénarios simulés)

Éléments flottants visibles en même temps (pic ; toasts, bannière, conseil, tutoriel, aide militaire, alerte, fenêtre) :

| Scénario | Avant | Après |
|---|---|---|
| Début de partie avec tutoriel | 3 (toast + tutoriel + conseil) | 1 (le tutoriel) |
| Rafale de 11 nouvelles (expéditions, rail, incendie, cambriolage, lave, décision) | 1 toast qui écrase les autres (nouvelles perdues) + conseil = 2 | 2 toasts empilés + conseil = 3, mais plus aucune nouvelle écrasée, le reste dans la cloche |
| Combat dans les Enfers (arrivée + contre-attaque + roi) | 4 (toast, bannière, conseil, aide) pendant plus de 5 s | 3 avant le correctif final du conseil, attendu 2 après (non remesuré : voir plus bas) |
| Nouvel âge | 3 (bannière, conseil, aide) puis fenêtre | 1 à 2, puis fenêtre |
| Téléphone (375 px) : rafale de 5 messages | non mesuré | 1 toast à la fois, 7 dans la cloche |

## 4. Limites de la vérification

- Le navigateur intégré est partagé avec d'autres agents : mon onglet a été redirigé deux fois, et le volet masqué suspend les animations et la boucle de jeu (mesures de pic approximatives, bannière comptée par sa classe).
- Les scénarios sont simulés par appels directs (`onNews`, `war.news.push`, `sim.onAgeUp`, `enterHell`), pas joués : aucune vraie expédition en route, aucune vraie incursion.
- Après le dernier correctif (conseil caché en commandement, 1 seul toast sous bannière) le combat dans les Enfers n'a pas été remesuré.
- Non vu à l'écran : le panneau de la cloche ouvert (capture masquée par des fenêtres empilées), l'ordre exact des toasts dans un vrai tour chargé, le comportement de la file pendant la fenêtre des expéditions.
