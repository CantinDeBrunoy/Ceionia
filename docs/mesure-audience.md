# Mesure d'audience et back-office

> Fichiers : `src/audience.ts` (côté jeu : identifiants, signaux, refus), `worker/index.ts` (le Worker : `/api/ping`, `/bo`),
> `worker/ping.ts` (forme et validation d'un signal), `worker/stats.ts` (chiffres du back-office), `worker/bo.ts` (pages HTML),
> `migrations/0001_mesure_audience.sql` (schéma D1), `wrangler.jsonc`, `vite.config.ts` (`__BUILD__`, proxy `/api`)
> Tests : `tests/mesureAudience.test.ts`
> Voir aussi : [interface.md](interface.md) (Paramètres › Divers, Crédits), [sauvegarde.md](sauvegarde.md)

## En bref
Pour savoir combien de joueurs différents jouent, combien de temps et jusqu'à quel âge ils vont, le jeu envoie un petit signal
anonyme pendant une partie. Un Worker Cloudflare le range dans une base D1. L'auteur lit les chiffres sur `/bo`, protégée par
une clé. Le joueur peut refuser la mesure (Paramètres › Divers), et les Crédits disent ce qui est mesuré et pourquoi.

## Ce qui est mesuré
Un signal (`POST /api/ping`, texte JSON de moins de 600 octets) contient :

| Champ | Sens |
|---|---|
| `p` | joueur : UUID tiré au hasard, gardé dans le `localStorage` (clé `ceionia.audience`) |
| `s` | partie : UUID tiré à chaque lancement (partie neuve ou reprise) |
| `k` | `start` au lancement, `tick` toutes les 60 s de jeu, `age` à chaque passage d'âge |
| `t` | secondes jouées, onglet visible, depuis le signal précédent |
| `a` | âge du village (0 Préhistoire … 5 Futuriste) |
| `m` | `normal`, `sandbox`, `hell` (Enfers), `isle` (commandement sur l'île) |
| `d` | difficulté : `normal`, `easy`, `sandbox` |
| `l` | langue : `fr`, `en` |
| `b` | version du build (`AAAA-MM-JJ.commit`, `__BUILD__` de `vite.config.ts`) |
| `r` | au lancement : `new` ou `continue` |

**Jamais** : nom, adresse IP (le Worker ne la lit pas, le limiteur de débit est indexé par l'identifiant du joueur), empreinte
du navigateur, contenu de la partie.

## Côté jeu
- `startAudience` est appelé par `Game.startAudience`, dans `boot` › `start`, une fois l'écran de chargement parti : il n'y a
  pas de `Game` au menu (retour au menu = rechargement de la page), donc rien ne part au menu.
- Une horloge de 5 s (`setInterval`, sans lien avec les images par seconde) ajoute le temps écoulé quand l'onglet est visible
  (au plus 10 s par pas : ordinateur en veille). À 60 s, un `tick` part. L'onglet caché : le reste part tout de suite, puis le
  compte s'arrête. Un passage d'âge (`sim.onAgeUp`) envoie un signal `age` avec le temps accumulé.
- Envoi par `navigator.sendBeacon` (texte brut, sans requête préalable), sinon `fetch` avec `keepalive`. Toute erreur est
  avalée : rien de visible si le serveur ne répond pas.
- Refus : `setAudienceOff` (bouton « Mesure d'audience » de Paramètres › Divers). Il arrête aussi les envois de la partie en
  cours. Il est gardé à part des réglages (`ceionia.audience`), pour ne pas toucher au format des sauvegardes.
- Rien ne part en développement (`npm run dev`) ni dans les tests (`import.meta.env.MODE === 'test'`). Pour l'essayer en
  développement : `?mesure` dans l'adresse, avec `wrangler dev` sur le port 8787 (Vite y renvoie `/api`).

## Côté serveur
- `wrangler.jsonc` : `main: worker/index.ts`, et `assets.run_worker_first: ["/api/*", "/bo", "/bo/*"]`. Seules ces adresses
  passent par le Worker. Tout le reste (le jeu) est servi directement par les fichiers statiques, avec
  `not_found_handling: single-page-application` : le jeu ne ralentit pas et ne coûte pas d'appel au Worker.
- `recordPing` : un `SELECT` sur la partie, puis une transaction (`batch`) de trois `INSERT … ON CONFLICT` : le joueur, la partie,
  le jour.
- Contre les abus : validation stricte (`parsePing` : UUID, listes fermées, entiers bornés, version `[A-Za-z0-9._-]{1,32}`),
  corps de 2 Ko au plus, 10 signaux par minute et par joueur (liaison `PING_LIMIT`, réponse 429), secondes créditées bornées à
  120 et au temps réel écoulé depuis le signal précédent de la partie plus 10 s (`creditedSeconds`). Une partie qui appartient
  à un autre joueur est refusée (409).
- Au bac à sable, l'âge de départ se choisit : il ne compte pas dans l'âge le plus haut du joueur (`max_age` reste à -1 s'il
  n'a joué qu'au bac à sable).

### Schéma D1 (base `ceionia-audience`)
- `players` : `id`, `first_at`, `last_at` (secondes Unix), `seconds`, `max_age` (hors bac à sable, -1 sinon), `lang`,
  `version`, `sessions`.
- `sessions` : `id`, `player`, `started_at`, `last_at`, `seconds`, `start_age`, `max_age`, `mode` (le dernier), `difficulty`,
  `launch` (`new`, `continue`, ou nul si le signal de lancement s'est perdu), `version`.
- `days` : `day` (AAAA-MM-JJ, heure de Paris), `player`, `seconds`. Sert aux joueurs par jour.

### Le back-office `/bo`
- Protégé par le secret `BO_KEY` : formulaire (POST) ou `/bo?key=…`. La bonne clé pose un cookie `HttpOnly`, `Secure`,
  `SameSite=Strict` de 30 jours (l'empreinte SHA-256 de la clé, jamais la clé) et renvoie sur `/bo` sans la clé dans
  l'adresse. `/bo/sortie` déconnecte. Sans `BO_KEY` posé : 503.
- Affiche (`buildReport`) : joueurs différents aujourd'hui, sur 7 jours, en tout (selon la dernière visite) ; parties lancées ;
  temps total, moyen et médian par joueur et par partie ; joueurs par âge le plus haut atteint (et « bac à sable seul ») ;
  joueurs par jour sur 30 jours ; la liste des joueurs (identifiant court, première et dernière visite, temps, parties, âge max,
  langue), les 500 derniers venus.
- Page sans script, `noindex`, `no-store`, CSP stricte.

## Mise en service
1. Créer la base (une fois), en Europe de l'Ouest :
   `npx wrangler@4.147.0 d1 create ceionia-audience --location weur`
   puis recopier le `database_id` affiché dans `wrangler.jsonc` (à la place de `A-REMPLIR`).
2. Appliquer le schéma : `npx wrangler@4.147.0 d1 migrations apply ceionia-audience --remote`
3. Poser la clé du back-office (wrangler la demande, elle n'apparaît nulle part) :
   `npx wrangler@4.147.0 secret put BO_KEY`
4. Déployer : `npm run deploy`
5. Ouvrir https://ceionia.cantin-roquier.workers.dev/bo et entrer la clé.

Une nouvelle migration : un fichier `migrations/0002_….sql`, puis l'étape 2 (`--local` pour l'essai).

## Essai en local
1. `npx vite build` (le Worker sert `dist`), `.dev.vars` avec `BO_KEY=une-cle` (fichier ignoré par git).
2. `npx wrangler@4.147.0 d1 migrations apply ceionia-audience --local`
3. `npx wrangler@4.147.0 dev --port 8787` : le jeu de production sur http://127.0.0.1:8787 (il envoie ses signaux), et
   http://127.0.0.1:8787/bo.
4. Des données d'essai : `npx wrangler@4.147.0 d1 execute ceionia-audience --local --file essai.sql`.
La base locale vit dans `.wrangler/` (ignoré par git).

## Pièges et invariants
- Le Worker ne doit répondre qu'aux adresses de `run_worker_first` : élargir la liste ferait passer chaque fichier du jeu par
  lui (plus lent, et des appels facturés).
- `AGE_NAMES` (`worker/ping.ts`) suit `AGES` de `src/build/catalog.ts` : un âge ajouté se reporte dans les deux, la validation
  refuse sinon les signaux de ce nouvel âge.
- Un champ ajouté au signal : le lire dans `parsePing` (les champs inconnus sont ignorés), l'ajouter au schéma par une nouvelle
  migration, et garder les anciens builds valides (champ facultatif).
- `npm run deploy` échoue tant que `database_id` vaut `A-REMPLIR`.
