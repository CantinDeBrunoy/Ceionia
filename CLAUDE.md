# Ceionia

Jeu de construction de village low-poly dans le navigateur, de la Préhistoire à l'âge futuriste (TypeScript, three.js, Vite, déployé sur Cloudflare Workers).

## Avant de toucher un système
Lire son fichier dans `docs/` (index : `docs/README.md`) : règles, fichiers concernés, liens avec le reste, pièges, recettes. Après un changement de règle ou de mécanisme, mettre ce fichier à jour dans le même commit. Si le doc et le code divergent, le code fait foi : corriger le doc.

## Commandes
- `npm run dev` : serveur de développement (port 5173, config `dev` de `.claude/launch.json`).
- `npx tsc --noEmit` : types. `npx vitest run` : tests (dossier `tests/`). Les deux doivent être verts avant un commit.
- `npm run build` : build de production. `npm run deploy` : seulement à la demande de l'auteur.
- En jeu, `window.__game` donne accès à l'objet `Game` pour préparer une situation (à ne pas utiliser pour juger l'équilibre).

## Conventions
- Code, commentaires, textes et messages de commit en français, phrases courtes, dans le style du code voisin.
- Tout texte affiché passe par `tr('…')` / `localize` ; la traduction anglaise va dans `src/i18n/en/` (voir `docs/traduction.md`).
- Les sauvegardes des joueurs doivent toujours se charger : un champ nouveau a une valeur par défaut, un ancien format est relu.
- Commits au nom de l'auteur (identité git configurée), sans ligne `Co-Authored-By` ni mention de Claude. Ne pas pousser sans demande.
- Branche de travail : `refonte-graphique`. Rien sous `.claude/` n'est commité (backlog, rapports de test, scripts).
- Une copie de travail (worktree) sans `node_modules` : `New-Item -ItemType Junction -Path node_modules -Target C:\Users\canti\Documents\projets\Ceionia\node_modules`.
