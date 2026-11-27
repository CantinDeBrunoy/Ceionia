/**
 * Mesure d'audience : les pages HTML du back-office `/bo` (connexion et rapport), en français, sans script.
 * Voir docs/mesure-audience.md
 */
import { duration, PAGE, type Report } from './stats';
import { VERSION } from '../src/version';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const n = (x: number) => Math.round(x).toLocaleString('fr-FR');
// (un seul formateur, réutilisé : en créer un par ligne coûtait cher en temps de calcul)
const WHEN = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const when = (sec: number) => WHEN.format(new Date(sec * 1000));
const dayLabel = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

const STYLE = `
:root { --bg: #f6f3ec; --card: #fffdf8; --ink: #2b2620; --soft: #776c5d; --line: #e3dccd; --bar: #c4813b; --bar2: #5f8a6a; }
@media (prefers-color-scheme: dark) { :root { --bg: #1d1b18; --card: #282521; --ink: #efe8dc; --soft: #a79c8b; --line: #3b3630; --bar: #d99a52; --bar2: #7fae8a; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1060px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 17px; margin: 28px 0 10px; }
.sub { color: var(--soft); margin: 0 0 18px; } .sub a { color: inherit; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; }
.card b { display: block; font-size: 26px; font-variant-numeric: tabular-nums; }
.card span { color: var(--soft); font-size: 13px; }
.bars { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; }
.row { display: grid; grid-template-columns: 130px 1fr 70px; gap: 10px; align-items: center; margin: 4px 0; }
.row i { display: block; height: 16px; background: var(--bar); border-radius: 3px; min-width: 1px; }
.row em { font-style: normal; text-align: right; font-variant-numeric: tabular-nums; }
.days { display: flex; align-items: flex-end; gap: 3px; height: 150px; padding-top: 18px; }
.days a { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; font-size: 11px; color: var(--soft); }
.days a { text-decoration: none; } .days a:hover i { filter: brightness(1.15); } .days a.on i { background: var(--bar); }
.days i { display: block; width: 100%; background: var(--bar2); border-radius: 3px 3px 0 0; min-height: 1px; }
.days b { font-weight: 600; color: var(--ink); font-size: 11px; }
.axis { display: flex; gap: 3px; font-size: 10px; color: var(--soft); } .axis span { flex: 1; text-align: center; overflow: hidden; }
.scroll { overflow-x: auto; background: var(--card); border: 1px solid var(--line); border-radius: 10px; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { color: var(--soft); font-weight: 600; font-size: 13px; }
code { font-size: 13px; }
.btn { display: inline-block; padding: 10px 16px; border-radius: 8px; background: var(--ink); color: var(--bg); text-decoration: none; font-weight: 600; }
button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 0; background: var(--bar); color: #fff; cursor: pointer; }
.err { color: #c0392b; }
.inline { display: inline; } .link { background: none; color: inherit; padding: 0; text-decoration: underline; font-size: inherit; }
.stack { display: flex; height: 16px; border-radius: 3px; overflow: hidden; min-width: 1px; }
.stack a { display: block; height: 100%; min-width: 2px; border-right: 1px solid var(--card); }
.stack a.dim { opacity: 0.18; } .stack a:hover { filter: brightness(1.15); }
a.who { color: inherit; text-decoration: none; } a.who:hover { text-decoration: underline; }
.focus { background: var(--card); border: 2px solid var(--line); border-radius: 10px; padding: 12px 14px; margin: 14px 0; }
.focus h2 { margin: 0 0 8px; } .focus .sub { margin: 8px 0 0; }
.id { color: var(--soft); font-size: 11px; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: -1px; }
.pages { display: flex; gap: 14px; margin-top: 10px; } .pages a { color: inherit; }
`;

const page = (title: string, body: string, head = '') => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">${head}<title>${title}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;

/** Pourquoi la page de connexion revient : rien, trop d'essais, `state` faux ou échu, connexion annulée, compte refusé, GitHub en panne */
export type LoginNote = '' | 'lent' | 'expire' | 'annule' | 'refuse' | 'github';
const NOTES: Record<LoginNote, string> = {
  '': '',
  lent: 'Trop d’essais. Réessayez dans une minute.',
  expire: 'La connexion a expiré ou n’a pas été lancée depuis cette page. Recommencez.',
  annule: 'Connexion annulée sur GitHub.',
  refuse: 'Ce compte GitHub n’a pas accès au back-office.',
  github: 'GitHub ne répond pas comme prévu. Réessayez dans un moment.',
};

/** La page de connexion : un bouton vers GitHub (un lien, pas un formulaire : la CSP limite les formulaires au site) */
export function loginPage(note: LoginNote = ''): string {
  return page('Ceionia : back-office', `<h1>Ceionia : back-office</h1>
<p class="sub">La mesure d'audience du jeu. Connectez-vous avec le compte GitHub de l'auteur pour voir les chiffres.</p>
${note ? `<p class="err">${NOTES[note]}</p>` : ''}
<p><a class="btn" href="/bo/login">Se connecter avec GitHub</a></p>`);
}

/** Connexion réussie : la page renvoie elle-même vers /bo. (Une redirection directe venue de github.com serait vue comme
 * une navigation d'un autre site, et le navigateur n'enverrait pas le cookie `SameSite=Strict` tout juste posé) */
export function connectedPage(): string {
  return page('Ceionia : back-office', `<h1>Ceionia : back-office</h1><p class="sub">Connecté. <a href="/bo">Voir les chiffres</a></p>`,
    '<meta http-equiv="refresh" content="0;url=/bo">');
}

/** La page sans base : le Worker tourne, la base D1 n'est pas encore branchée (voir docs/mesure-audience.md) */
export function noDbPage(): string {
  return page('Ceionia : back-office', `<h1>Ceionia : back-office</h1><p class="sub">La base D1 n’est pas encore branchée : les signaux sont ignorés. Voir la mise en service dans docs/mesure-audience.md.</p>`);
}

/**
 * La couleur d'un joueur, d'après son rang d'arrivée : chaque nouveau venu tourne la teinte de l'angle d'or (137,5°), ce qui
 * écarte au mieux les couleurs de joueurs proches. La clarté change à chaque tour, pour que les teintes qui reviennent se
 * distinguent. Le rang ne bouge pas, sauf quand la purge efface les plus anciens
 */
export function playerColor(rank: number): string {
  const lum = [50, 38, 62][Math.floor(rank * 137.508 / 360) % 3];
  return `hsl(${Math.round((rank * 137.508) % 360)} 65% ${lum}%)`;
}

// les noms des joueurs : un animal et un adjectif (qui ne change pas au féminin), tirés de l'identifiant
const ANIMALS = ['Renard', 'Loutre', 'Hibou', 'Castor', 'Belette', 'Blaireau', 'Lynx', 'Marmotte', 'Héron', 'Chouette', 'Ours', 'Tortue',
  'Faucon', 'Biche', 'Loup', 'Hérisson', 'Corbeau', 'Grue', 'Chamois', 'Mouette', 'Bison', 'Salamandre', 'Cerf', 'Pie', 'Sanglier',
  'Hermine', 'Aigle', 'Fouine', 'Taupe', 'Lièvre', 'Martin-pêcheur', 'Libellule', 'Phoque', 'Bouquetin', 'Mésange', 'Ecureuil'];
const ADJECTIVES = ['agile', 'brave', 'calme', 'sage', 'rapide', 'timide', 'fidèle', 'habile', 'libre', 'drôle', 'tranquille', 'rouge',
  'jaune', 'rose', 'mauve', 'aimable', 'solide', 'robuste', 'féroce', 'farouche', 'modeste', 'énorme', 'minuscule', 'célèbre',
  'étrange', 'sauvage', 'paisible', 'intrépide', 'docile', 'magnifique'];

function hash(id: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** Le nom d'un joueur, toujours le même pour un identifiant (la mesure est anonyme : un surnom, pas une personne) */
export function playerName(id: string): string {
  const h = hash(id, 7);
  return `${ANIMALS[h % ANIMALS.length]} ${ADJECTIVES[(h >>> 8) % ADJECTIVES.length]}`;
}

/** La page du rapport */
export function reportPage(r: Report): string {
  const t = r.time;
  const card = (v: string, label: string) => `<div class="card"><b>${v}</b><span>${label}</span></div>`;
  const maxAge = Math.max(1, ...r.ages.map((a) => a.players), r.sandboxOnly);
  const rank = new Map(r.reached.map((x, i) => [x.player, i]));
  const color = (id: string) => playerColor(rank.get(id) ?? hash(id, 0) % 997);
  // une barre par âge, un morceau de la couleur de chaque joueur arrêté là
  const who = (id: string) => `${playerName(id)} (${id.slice(0, 8)})`;
  // un clic sur un joueur le choisit (un lien, la page n'a pas de script) ; les autres pâlissent
  const focusId = r.focus?.player.id;
  // (un jour choisi : ses joueurs restent vifs, les autres pâlissent)
  const dayIds = r.day && !r.focus ? new Set(r.day.players.map((x) => x.player)) : null;
  const lit = (id: string) => (focusId ? id === focusId : dayIds ? dayIds.has(id) : true);
  const href = (id: string) => `/bo?joueur=${encodeURIComponent(id)}`;
  const seg = (id: string, title: string, size: string) =>
    `<a href="${href(id)}" title="${esc(title)}"${lit(id) ? '' : ' class="dim"'} style="${size};background:${color(id)}"></a>`;
  const ageRow = (name: string, age: number) => {
    const ids = r.reached.filter((x) => (age < 0 ? x.age < 0 : Math.min(x.age, r.ages.length - 1) === age)).map((x) => x.player);
    const parts = ids.map((id) => seg(id, who(id), 'flex:1')).join('');
    return `<div class="row"><span>${esc(name)}</span><div class="stack" style="width:${(ids.length / maxAge) * 100}%">${parts}</div><em>${ids.length}</em></div>`;
  };
  // le temps passé dans chaque âge : une barre par âge, un morceau coloré par joueur, à la taille de son temps
  const byAge = r.ages.map((_, i) => r.ageTime.filter((x) => x.age === i));
  const maxTime = Math.max(1, ...byAge.map((xs) => xs.reduce((s, x) => s + x.seconds, 0)));
  const timeRow = (name: string, xs: Report['ageTime']) => {
    const sum = xs.reduce((s, x) => s + x.seconds, 0);
    const parts = xs.map((x) => seg(x.player, `${who(x.player)} : ${duration(x.seconds)}`, `width:${(x.seconds / sum) * 100}%`)).join('');
    return `<div class="row"><span>${esc(name)}</span><div class="stack" style="width:${(sum / maxTime) * 100}%">${parts}</div><em title="${xs.length} joueur(s)">${sum ? duration(sum) : '–'}</em></div>`;
  };
  const maxDay = Math.max(1, ...r.days.map((d) => d.players));
  const ageName = (a: number) => (a < 0 ? 'bac à sable' : esc(r.ages[a]?.name ?? String(a)));
  const f = r.focus;
  const mine = f ? r.ageTime.filter((x) => x.player === f.player.id) : [];
  const d = r.day;
  const dayPanel = !d ? '' : `<div class="focus"><h2>Le ${dayLabel(d.day)} : ${d.players.length} joueur(s), ${duration(d.players.reduce((s, x) => s + x.seconds, 0))} de jeu</h2>
${d.players.length ? `<div class="scroll"><table><thead><tr><th>Joueur</th><th>Temps ce jour-là</th></tr></thead><tbody>
${d.players.map((x) => `<tr><td><a class="who" href="${href(x.player)}"><i class="dot" style="background:${color(x.player)}"></i>${esc(playerName(x.player))}</a> <code class="id">${esc(x.player.slice(0, 8))}</code></td><td>${duration(x.seconds)}</td></tr>`).join('')}
</tbody></table></div>` : '<div>Personne ce jour-là.</div>'}
<p class="sub">${r.focus ? '' : 'Ces joueurs restent vifs dans les barres, les autres pâlissent. '}Un clic sur un nom montre sa fiche. <a href="/bo">Tout voir</a></p></div>`;
  const focusPanel = !f ? '' : `<div class="focus"><h2><i class="dot" style="background:${color(f.player.id)}"></i>${esc(playerName(f.player.id))} <code class="id">${esc(f.player.id.slice(0, 8))}</code></h2>
<div>Venu le ${when(f.player.first_at)}, dernière visite le ${when(f.player.last_at)}. ${duration(f.player.seconds)} de jeu en ${f.player.sessions} partie(s), jusqu'à : ${ageName(f.player.max_age)}. Langue : ${esc(f.player.lang)}. Version : ${esc(f.player.version)}.</div>
<div>${mine.length ? 'Temps par âge : ' + mine.map((x) => `${ageName(x.age)} ${duration(x.seconds)}`).join(', ') + '.' : 'Pas de temps compté hors bac à sable.'}</div>
<div class="scroll" style="margin-top:8px"><table><thead><tr><th>Lancée</th><th>Dernier signal</th><th>Temps</th><th>Âges</th><th>Mode</th><th>Difficulté</th><th>Lancement</th><th>Version</th></tr></thead><tbody>
${f.sessions.map((x) => `<tr><td>${when(x.started_at)}</td><td>${when(x.last_at)}</td><td>${duration(x.seconds)}</td><td>${ageName(x.start_age)}${x.max_age > x.start_age ? ' → ' + ageName(x.max_age) : ''}</td><td>${esc(x.mode)}</td><td>${esc(x.difficulty)}</td><td>${x.launch === 'new' ? 'nouvelle partie' : x.launch === 'continue' ? 'sauvegarde reprise' : '–'}</td><td>${esc(x.version)}</td></tr>`).join('')}
</tbody></table></div>
<p class="sub">Ce joueur est mis en avant dans les barres, les autres pâlissent. <a href="/bo">Tout voir</a></p></div>`;
  const list = r.list, pages = Math.max(1, Math.ceil(r.players.total / PAGE));
  return page('Ceionia : audience', `<h1>Ceionia : audience</h1>
<div class="sub">Version du jeu en ligne : <b>${VERSION}</b> (bêta). Aujourd'hui : ${dayLabel(r.today)} (heure de Paris). Mesure anonyme, sans nom ni adresse IP enregistrée. <form class="inline" method="post" action="/bo/sortie"><button class="link">Se déconnecter</button></form></div>
${focusPanel}${dayPanel}

<h2>Joueurs différents</h2>
<div class="grid">${card(n(r.players.today), "aujourd'hui")}${card(n(r.players.week), '7 derniers jours')}${card(n(r.players.total), 'en tout')}
${card(n(r.sessions.today), "parties lancées aujourd'hui")}${card(n(r.sessions.total), 'parties lancées en tout')}${card(n(r.players.idle), 'sans une minute de jeu')}</div>
<p class="sub">« Sans une minute de jeu » : partis avant le premier signal de la minute, ou faux joueurs envoyés par un script. Une hausse soudaine trahit une rafale.</p>

<h2>Temps de jeu</h2>
<div class="grid">${card(duration(t.total), 'en tout')}${card(duration(t.perPlayer.mean), 'moyen par joueur')}${card(duration(t.perPlayer.median), 'médian par joueur')}
${card(duration(t.perSession.mean), 'moyen par partie')}${card(duration(t.perSession.median), 'médian par partie')}</div>
<p class="sub">Le temps compte pendant une partie (pas au menu), onglet visible, avec un geste du joueur (souris, clavier) dans les 2 dernières minutes.</p>

<h2>Âge le plus haut atteint par joueur</h2>
<div class="bars">${r.ages.map((a, i) => ageRow(a.name, i)).join('')}${ageRow('Bac à sable seul', -1)}</div>
<p class="sub">Là où chacun s'est arrêté, hors bac à sable (où l'on choisit son âge de départ).</p>

<h2>Temps passé dans chaque âge</h2>
<div class="bars">${r.ages.map((a, i) => timeRow(a.name, byAge[i])).join('')}</div>
<p class="sub">Chaque couleur est un joueur (la même partout sur la page, survol : son nom et son temps). Un joueur compte dans chaque âge qu'il a joué, hors bac à sable. Avant le 27 nov. 2026, le temps d'une partie est partagé à parts égales entre les âges qu'elle a traversés.</p>

<h2>Joueurs par jour, sur 30 jours</h2>
<div class="bars"><div class="days">${r.days.map((d) => `<a href="/bo?jour=${d.day}"${r.day?.day === d.day ? ' class="on"' : ''} title="${dayLabel(d.day)} : ${d.players} joueur(s), ${duration(d.seconds)}">${d.players ? `<b>${d.players}</b>` : ''}<i style="height:${(d.players / maxDay) * 100}%"></i></a>`).join('')}</div>
<div class="axis">${r.days.map((d, i) => `<span>${i % 5 === 4 || i === 29 ? dayLabel(d.day) : ''}</span>`).join('')}</div></div>

<h2>Joueurs, du dernier venu au plus ancien (page ${r.page + 1} sur ${pages})</h2>
<div class="scroll"><table><thead><tr><th>Joueur</th><th>Première visite</th><th>Dernière visite</th><th>Temps total</th><th>Parties</th><th>Âge max</th><th>Langue</th><th>Version</th></tr></thead><tbody>
${list.map((p) => `<tr><td><a class="who" href="${href(p.id)}"><i class="dot" style="background:${color(p.id)}"></i>${esc(playerName(p.id))}</a> <code class="id">${esc(p.id.slice(0, 8))}</code></td><td>${when(p.first_at)}</td><td>${when(p.last_at)}</td><td>${duration(p.seconds)}</td><td>${p.sessions}</td><td>${p.max_age < 0 ? 'bac à sable' : esc(r.ages[p.max_age]?.name ?? String(p.max_age))}</td><td>${esc(p.lang)}</td><td>${esc(p.version)}</td></tr>`).join('')}
</tbody></table></div>
<div class="pages">${r.page > 0 ? `<a href="/bo?page=${r.page - 1}">← Page précédente</a>` : ''}${r.page + 1 < pages ? `<a href="/bo?page=${r.page + 1}">Page suivante →</a>` : ''}</div>`);
}
