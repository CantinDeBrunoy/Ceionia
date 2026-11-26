# Mesure d'audience et back-office

> Fichiers : `src/audience.ts` (côté jeu : identifiant, signaux, refus), `worker/index.ts` (le Worker : `/api/ping`, `/bo`,
> purge planifiée), `worker/ping.ts` (forme et validation d'un signal, jours de Paris, plafonds), `worker/stats.ts` (rapport
> calculé par D1, purge), `worker/auth.ts` (connexion et session signée), `worker/bo.ts` (pages HTML), `worker/d1.ts` (types),
> `migrations/` (schéma D1), `wrangler.jsonc`, `.github/workflows/deploy.yml` (migrations avant le déploiement),
> `vite.config.ts` (`__BUILD__`, proxy `/api`), `public/polices/` (polices servies par le jeu)
> Tests : `tests/mesureAudience.test.ts` (sur une vraie base SQLite en mémoire, `node:sqlite`)
> Voir aussi : [interface.md](interface.md) (Paramètres › Divers, Crédits), [sauvegarde.md](sauvegarde.md)

## En bref
Pour savoir combien de joueurs différents jouent, combien de temps et jusqu'à quel âge ils vont, le jeu envoie un petit signal
anonyme pendant une partie. Un Worker Cloudflare le range dans une base D1. L'auteur lit les chiffres sur `/bo`, protégée par
une clé. Le joueur peut refuser la mesure (Paramètres › Divers), et les Crédits disent ce qui est mesuré, pourquoi, et combien
de temps c'est gardé.

## Ce qui est mesuré
Un signal (`POST /api/ping`, texte JSON de moins de 600 octets) contient :

| Champ | Sens |
|---|---|
| `p` | joueur : UUID tiré au hasard, gardé dans le `localStorage` (clé `ceionia.audience`, avec sa date de création), retiré au bout de 13 mois |
| `s` | partie : UUID tiré à chaque lancement (partie neuve ou reprise) |
| `k` | `start` au lancement, `tick` toutes les 60 s de jeu, `age` à chaque passage d'âge |
| `t` | secondes de jeu depuis le signal précédent |
| `a` | âge du village (0 Préhistoire … 5 Futuriste) |
| `m` | `normal`, `sandbox`, `hell` (Enfers), `isle` (commandement sur l'île) |
| `d` | difficulté : `normal`, `easy`, `sandbox` |
| `l` | langue : `fr`, `en` |
| `b` | version du build (`AAAA-MM-JJ.commit`, `__BUILD__` de `vite.config.ts`) |
| `r` | au lancement : `new` ou `continue` |

**Jamais** : nom, empreinte du navigateur, contenu de la partie. **L'adresse IP** n'est jamais écrite : elle sert seulement de
clé aux limiteurs de Cloudflare, qui comptent en mémoire quelques secondes. Le jeu ne contacte aucun autre site : les polices
(Fraunces, Manrope, licence SIL OFL 1.1, `public/polices/OFL-*.txt`) sont servies par le jeu, plus par Google Fonts.

**Conservation** : 13 mois. L'identifiant du joueur est tiré de nouveau au bout de 13 mois (`ID_DAYS`, `src/audience.ts`).
Une tâche planifiée du Worker, chaque nuit, efface les parties et les jours de plus de 13 mois, et les joueurs sans visite
depuis 13 mois (`KEEP_DAYS`, `worker/ping.ts`, `purge`). Au refus, l'identifiant est effacé du navigateur.

## Côté jeu
- `startAudience` est appelé par `Game.startAudience`, dans `boot` › `start`, une fois l'écran de chargement parti : il n'y a
  pas de `Game` au menu (retour au menu = rechargement de la page), donc rien ne part au menu.
- Une horloge de 5 s (`setInterval`, sans lien avec les images par seconde) ajoute le temps écoulé quand l'onglet est visible
  **et** qu'un geste du joueur (souris, clavier, toucher, molette) a eu lieu dans les 2 dernières minutes (`IDLE_AFTER`) : un
  joueur parti l'onglet ouvert ne compte plus. Au plus 10 s par pas (ordinateur en veille). À 60 s, un `tick` part. L'onglet
  caché : le reste part tout de suite, puis le compte s'arrête. Un passage d'âge (`sim.onAgeUp`) envoie un signal `age`.
- Envoi par `navigator.sendBeacon` (texte brut, sans requête préalable), sinon `fetch` avec `keepalive`. Toute erreur est
  avalée : rien de visible si le serveur ne répond pas.
- Refus : `setAudienceOff` (bouton « Mesure d'audience » de Paramètres › Divers). Il arrête aussi les envois de la partie en
  cours et efface l'identifiant (`{ off: true }` seul). Réactivée, un identifiant neuf est tiré. Ce choix est gardé à part des
  réglages (`ceionia.audience`), pour ne pas toucher au format des sauvegardes.
- Rien ne part en développement (`npm run dev`) ni dans les tests (`import.meta.env.MODE === 'test'`). Pour l'essayer en
  développement : `?mesure` dans l'adresse, avec `wrangler dev --env essai` sur le port 8787 (Vite y renvoie `/api`).

## Côté serveur
- `wrangler.jsonc` : `main: worker/index.ts`, et `assets.run_worker_first: ["/api/*", "/bo", "/bo/*"]`. Seules ces adresses
  passent par le Worker. Tout le reste (le jeu) est servi directement par les fichiers statiques, avec
  `not_found_handling: single-page-application` : le jeu ne ralentit pas et ne coûte pas d'appel au Worker.
- **Sans base** : tant que `d1_databases` n'est pas déclaré au premier niveau de `wrangler.jsonc`, le Worker accepte les
  signaux et les ignore (204), et `/bo` le dit. Le déploiement automatique marche donc avant la création de la base.
- `recordPing` : un `SELECT` sur la partie, puis une transaction (`batch`) de trois `INSERT … ON CONFLICT` : le joueur, la
  partie, le jour. **Seul un signal `start` crée une partie**, et il ne crédite rien. Un `tick` ou un `age` d'une partie
  inconnue est refusé (409). Une partie qui appartient à un autre joueur aussi (409).
- Contre les abus, dans l'ordre (`ping`) :
  1. méthode `POST` seulement (405) ;
  2. un en-tête `Origin` d'un autre site est refusé (403) : une page tierce ne peut pas faire envoyer de signaux par ses
     visiteurs (un script sans `Origin` passe aux limites suivantes) ;
  3. 30 signaux par minute et par adresse IP (`PING_IP`, 429), la limite qui ne dépend pas du client ;
  4. corps lu en flux, coupé au-delà de 1 200 octets, même sans `content-length` (413, `readBody`) ;
  5. validation stricte (`parsePing` : UUID, listes fermées, entiers bornés, version `[A-Za-z0-9._-]{1,32}`, 400) ;
  6. 10 signaux par minute et par joueur (`PING_LIMIT`, 429) ;
  7. plafonds par jour (heure de Paris) : 3 000 nouveaux joueurs et 15 000 nouvelles parties (`MAX_NEW_PLAYERS_DAY`,
     `MAX_NEW_SESSIONS_DAY`, 429). Au-delà, plus aucune écriture de création jusqu'à minuit : le quota d'écritures D1 de
     l'offre gratuite (100 000 lignes par jour) reste hors d'atteinte ;
  8. secondes créditées bornées à 120 et au temps réel écoulé depuis le signal précédent de la partie, plus 10 s
     (`creditedSeconds`) : un faux joueur ne rapporte du temps qu'en attendant vraiment ;
  9. une base en panne répond 503, sans erreur non gérée.
- Au bac à sable, l'âge de départ se choisit : il ne compte pas dans l'âge le plus haut du joueur (`max_age` reste à -1 s'il
  n'a joué qu'au bac à sable).
- Les limiteurs (`ratelimits` de `wrangler.jsonc`) sont approximatifs et propres à chaque lieu de Cloudflare : ce sont des
  freins, pas des comptes exacts. Les plafonds par jour, eux, sont comptés dans la base.

### Schéma D1 (base `ceionia-audience`)
- `players` : `id`, `first_at`, `last_at` (secondes Unix), `seconds`, `max_age` (hors bac à sable, -1 sinon), `lang`,
  `version`, `sessions` (compteur gardé, le rapport compte les parties par `COUNT(*)`).
- `sessions` : `id`, `player`, `started_at`, `last_at`, `seconds`, `start_age`, `max_age`, `mode` (le dernier), `difficulty`,
  `launch` (`new` ou `continue`), `version`.
- `days` : `day` (AAAA-MM-JJ, heure de Paris), `player`, `seconds`. Sert aux joueurs par jour.
- `0002_index_rapport.sql` : index sur `last_at`, `first_at`, `started_at` et `seconds`, pour le rapport, les plafonds et la
  purge.

### Le back-office `/bo`
- **Connexion** : formulaire POST seulement (la clé n'est jamais dans l'adresse, `/bo?key=` est ignoré). 5 essais par minute
  et par adresse IP (`BO_LOGIN`, 429). La bonne clé pose un cookie de session signé `échéance.HMAC` (`worker/auth.ts`), valable
  7 jours, `HttpOnly`, `Secure`, `SameSite=Strict`, limité à `/bo`. Il ne contient pas la clé et ne permet pas de la retrouver.
  **Révoquer toutes les sessions** : changer le secret `BO_SALT` (ou la clé). Déconnexion : bouton (POST `/bo/sortie`).
- **Calcul** (`loadReport`) : tout est calculé par D1, en un seul aller-retour (`batch`) : comptes et sommes, médianes
  (`ORDER BY seconds LIMIT 1 ou 2 OFFSET n/2`), répartition des âges (`GROUP BY`), 30 derniers jours (`GROUP BY day`), et une
  page de 100 joueurs (`?page=`). Le Worker ne reçoit que ces totaux : son temps de calcul ne grandit pas avec la base. Un seul
  formateur de dates par module (`Intl.DateTimeFormat`), réutilisé. Essai local : 20 000 joueurs et 60 000 parties, page en
  130 ms, requêtes comprises.
- **Affiche** : joueurs différents aujourd'hui, sur 7 jours, en tout (selon la dernière visite) ; parties lancées ; joueurs
  sans une minute de jeu (une hausse soudaine trahit une rafale de faux joueurs) ; temps total, moyen et médian par joueur et
  par partie ; joueurs par âge le plus haut atteint (et « bac à sable seul ») ; joueurs par jour sur 30 jours ; la liste des
  joueurs (identifiant court, première et dernière visite, temps, parties, âge max, langue), par pages.
- Page sans script, `noindex`, `no-store`, CSP stricte. Sans `BO_KEY` posé : 503.

## Mise en service
**Dans cet ordre**, la base d'abord : chaque push sur `master` ou `refonte-graphique` déploie
(`.github/workflows/deploy.yml`). Fusionner avant ne casse rien (le Worker ignore les signaux), mais rien n'est compté.

1. Créer la base (une fois), en Europe de l'Ouest :
   `npx wrangler@4.147.0 d1 create ceionia-audience --location weur`
2. Déclarer la base au **premier niveau** de `wrangler.jsonc` (le modèle est en commentaire), avec l'id affiché :
   `"d1_databases": [{ "binding": "DB", "database_name": "ceionia-audience", "database_id": "<id>", "migrations_dir": "migrations" }],`
   (deux espaces d'indentation : le workflow cherche cette ligne pour appliquer les migrations).
3. Appliquer le schéma : `npx wrangler@4.147.0 d1 migrations apply ceionia-audience --remote --env=""`
4. Choisir une clé longue et aléatoire (par exemple `openssl rand -base64 32`, ou un gestionnaire de mots de passe), puis la
   poser, avec le sel (wrangler les demande, ils n'apparaissent nulle part) :
   `npx wrangler@4.147.0 secret put BO_KEY`
   `npx wrangler@4.147.0 secret put BO_SALT`
5. Donner au jeton `CLOUDFLARE_API_TOKEN` de GitHub le droit « D1 : modifier » (le workflow applique les migrations avant
   chaque déploiement).
6. Commiter `wrangler.jsonc`, fusionner, pousser : le workflow applique les migrations puis déploie (ou `npm run deploy` à la
   main).
7. Ouvrir https://ceionia.cantin-roquier.workers.dev/bo et entrer la clé.
8. Conseillé : une alerte d'usage D1 et Workers dans le tableau de bord Cloudflare.

Une nouvelle migration : un fichier `migrations/000N_….sql`. Le workflow l'applique au prochain push.

## Essai en local
1. `npx vite build` (le Worker sert `dist`), `.dev.vars` avec `BO_KEY=…` et `BO_SALT=…` (fichier ignoré par git).
2. `npx wrangler@4.147.0 d1 migrations apply ceionia-audience --local --env essai`
3. `npx wrangler@4.147.0 dev --env essai --port 8787` : le jeu de production sur http://127.0.0.1:8787 (il envoie ses signaux),
   et http://127.0.0.1:8787/bo. L'environnement `essai` de `wrangler.jsonc` déclare une base locale. Il n'est jamais déployé.
4. Des données d'essai : `npx wrangler@4.147.0 d1 execute ceionia-audience --local --env essai --file essai.sql` (une
   instruction fait 100 Ko au plus : des lots de 100 lignes).
La base locale vit dans `.wrangler/` (ignoré par git).

## Pièges et invariants
- Le Worker ne doit répondre qu'aux adresses de `run_worker_first` : élargir la liste ferait passer chaque fichier du jeu par
  lui (plus lent, et des appels facturés).
- `AGE_NAMES` (`worker/ping.ts`) suit `AGES` de `src/build/catalog.ts` (un test les compare) : un âge ajouté se reporte dans les
  deux, la validation refuse sinon les signaux de ce nouvel âge.
- Un champ ajouté au signal : le lire dans `parsePing` (les champs inconnus sont ignorés), l'ajouter au schéma par une nouvelle
  migration, et garder les anciens builds valides (champ facultatif).
- Le signal de lancement perdu (réseau coupé à ce moment), la partie n'est pas comptée : ses `tick` sont refusés. C'est le prix
  du refus des parties inconnues.
- Les tests du Worker passent par `node:sqlite` (Node 22.13 ou plus).
