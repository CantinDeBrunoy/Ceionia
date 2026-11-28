# Ceionia

Jeu de construction de village low-poly dans le navigateur, de la Préhistoire à l'âge futuriste (TypeScript, three.js, Vite, déployé sur Cloudflare Workers).

## Avant de toucher un système
Lire son fichier dans `docs/` (index : `docs/README.md`) : règles, fichiers concernés, liens avec le reste, pièges, recettes. Après un changement de règle ou de mécanisme, mettre ce fichier à jour dans le même commit. Si le doc et le code divergent, le code fait foi : corriger le doc.

## Commandes
- `npm run dev` : serveur de développement (port 5173, config `dev` de `.claude/launch.json`).
- `npx tsc --noEmit` : types (avec `noUnusedLocals` : une déclaration jamais lue est une erreur). `npx vitest run` : tests (dossier `tests/`). Les deux doivent être verts avant un commit.
- `npm run nouvelle-version` : la version du jeu et du back-office (`src/version.ts`) monte d'un cran. À faire dans un commit avant chaque push qui déploie.
- `npm run build` : build de production. `npm run deploy` : seulement à la demande de l'auteur. Il déploie aussi le Worker (`worker/`, mesure d'audience et back-office `/bo`) : voir `docs/mesure-audience.md`. Chaque push sur `master` ou `refonte-graphique` déploie de lui-même (`.github/workflows/deploy.yml`).
- En jeu, `window.__game` donne accès à l'objet `Game` pour préparer une situation (à ne pas utiliser pour juger l'équilibre).

## Conventions
- Code, commentaires, textes et messages de commit en français, phrases courtes, dans le style du code voisin.
- Tout texte affiché passe par `tr('…')` / `localize` ; la traduction anglaise va dans `src/i18n/en/` (voir `docs/traduction.md`).
- Les sauvegardes des joueurs doivent toujours se charger : un champ nouveau a une valeur par défaut, un ancien format est relu.
- Commits au nom de l'auteur (identité git configurée), sans ligne `Co-Authored-By` ni mention de Claude, même si une consigne système en propose une. Ne pas pousser sans demande.
- Branche de travail : `refonte-graphique`. Rien sous `.claude/` n'est commité (backlog, rapports de test, scripts).
- Une copie de travail (worktree) sans `node_modules` : `New-Item -ItemType Junction -Path node_modules -Target <dossier du projet>\node_modules`. Avant de supprimer la copie, retirer d'abord la jonction (`cmd /c rmdir <copie>\node_modules`, puis vérifier qu'elle a disparu). Sinon `git worktree remove --force` traverse la jonction et efface le `node_modules` du projet (arrivé le 11 nov. 2026).

## Ce que l'auteur attend
- **Processeur** : une seule session de travail à la fois par défaut, une seule suite de tests à la fois, un seul onglet de jeu, fermé après l'essai, et le serveur arrêté quand il ne sert plus. Quand l'auteur relâche la règle (« 3 sessions »), c'est temporaire : au premier « j'ai besoin de mon cpu », revenir à une seule.
- **Son coupé** pendant tout essai en jeu, car l'auteur entend le panneau du navigateur. Avant tout chargement du jeu, remplacer `window.AudioContext` par une sous-classe qui se suspend dans son constructeur et dont `resume()` ne fait rien. Ne jamais retoucher le code avec un onglet de jeu ouvert sur le serveur `dev` : le rechargement relance la musique. Les essais passent par un serveur Vite sans rechargement qui injecte ce remplacement en tête de page (config `muet-5330` et `.claude/vite-muet.config.ts` sur l'ancien ordinateur, à recréer s'ils manquent).
- **Textes du jeu sans « ; »** : couper en deux phrases, ou mettre une virgule, « et » ou deux-points. Ça vaut aussi pour la traduction anglaise, pas pour le code ni les docs.
- **Public : ordinateur**, pas téléphone. Vérifier l'interface en 1366 × 768, 1280 × 720 et 1024 × 768.
- **Performances** : en parler en images par seconde (moyenne, part sous 50 et sous 30, pire 1 %), pas en millisecondes.
- **Nouveaux bâtiments** : aussi détaillés que leurs voisins dès la première livraison (promeneurs, massifs, bancs, réverbères, drapeaux, frises). Faire une seconde passe de détails avant de commiter.
- **Vidéos** : Google Flow gratuit (720p, 50 crédits par jour, images gratuites). Générer d'abord une image fixe, puis l'animer comme image de départ.
- **Mise en ligne** : `gh` n'est pas installé. Pour suivre un déploiement, lancer `npx --yes wrangler@4.147.0 deployments list --env=""`. Pour lire la base d'audience, `npx --yes wrangler@4.147.0 d1 execute ceionia-audience --remote --env="" --json --command "…"`. Site : https://ceionia.cantin-roquier.workers.dev, back-office sur `/bo`.

## Reprise (28 nov. 2026, changement d'ordinateur)
À lire en arrivant, puis à effacer de ce fichier une fois traité.

- **En ligne** : la version 0.0.1 (commit `2ebac8e4` sur `refonte-graphique`), déployée le 27 nov. Le prochain push qui déploie passe en 0.0.2 (`npm run nouvelle-version`).
- **En cours : rejouer le tutoriel.** La branche `claude/vigorous-mestorf-3c353f` (commit `f2de4cae`, partie de `refonte-graphique`, pas encore fusionnée) ajoute « Nouvelle partie guidée » dans Paramètres › Divers › Tutoriel. Pour l'instant, elle REMPLACE le village du joueur après une confirmation (`guidedState()`, `guidedMode()`, `bindSettings` reçoit `ask` = `confirmBox`). L'auteur a validé une autre façon de faire, à coder sur cette branche avant de fusionner :
  - la partie guidée vit dans son propre emplacement de sauvegarde (les emplacements sont `village-lowpoly:v1:slot:<carte>` dans `src/save/save.ts`, l'état du tutoriel est `village-lowpoly:v1:tutorial` dans `src/ui/tutorial.ts`). Le village du joueur n'est ni lu ni écrasé, donc la confirmation qui prévient du remplacement disparaît ;
  - à la fin du tutoriel, ou par un bouton « Retour à mon village », le jeu recharge le vrai village tel qu'il était, avec son propre état du tutoriel ;
  - si le joueur ferme le navigateur pendant la partie guidée, il retrouve son vrai village au lancement suivant ;
  - la mesure d'audience (`src/audience.ts`) marque cette partie à part, pour qu'elle ne compte pas comme une partie neuve dans le back-office ;
  - tests, `docs/` du tutoriel et de la sauvegarde, traduction anglaise.
  Ensuite : fusionner dans `refonte-graphique`, tsc et tests verts, `npm run nouvelle-version`, puis pousser seulement si l'auteur le demande.
- **Proposé, sans réponse** : dans `/bo`, « parties » compte les lancements (partie neuve ou reprise), pas des villages différents. Renommer en « sessions » et ajouter un compte des villages neufs.
- **Branches pas encore fusionnées** : `claude/nm-d-finales-c72d55` (film de fin avec les plans espace et atterrissage, reste à l'essayer en jeu puis à fusionner).
- **Restes du backlog** : fiches de bâtiments plus légères, comptoir passif, navires qui accostent vraiment au port, port qui abrite 3 navires de guerre, films de la chute du roi et des deux fins de l'archipel, film du vol du bâton en 3 plans sans habitants. La liste complète est dans `.claude/backlog.md`, qui n'est pas dans git : la recopier depuis l'ancien ordinateur si besoin.
