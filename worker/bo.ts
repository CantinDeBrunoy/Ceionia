/**
 * Mesure d'audience : les pages HTML du back-office `/bo` (connexion et rapport), en français, sans script.
 * Voir docs/mesure-audience.md
 */
import { duration, PAGE, type Report } from './stats';

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
.days div { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; font-size: 11px; color: var(--soft); }
.days i { display: block; width: 100%; background: var(--bar2); border-radius: 3px 3px 0 0; min-height: 1px; }
.days b { font-weight: 600; color: var(--ink); font-size: 11px; }
.axis { display: flex; gap: 3px; font-size: 10px; color: var(--soft); } .axis span { flex: 1; text-align: center; overflow: hidden; }
.scroll { overflow-x: auto; background: var(--card); border: 1px solid var(--line); border-radius: 10px; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { color: var(--soft); font-weight: 600; font-size: 13px; }
code { font-size: 13px; }
form { display: flex; margin: 0; gap: 8px; flex-wrap: wrap; } input { font: inherit; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: var(--ink); min-width: 240px; }
button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 0; background: var(--bar); color: #fff; cursor: pointer; }
.err { color: #c0392b; }
.inline { display: inline; } .link { background: none; color: inherit; padding: 0; text-decoration: underline; font-size: inherit; }
.pages { display: flex; gap: 14px; margin-top: 10px; } .pages a { color: inherit; }
`;

const page = (title: string, body: string) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${title}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;

/** La page de connexion (clé `BO_KEY`) ; `error` : clé refusée, `slow` : trop d'essais */
export function loginPage(error = false, slow = false): string {
  return page('Ceionia : back-office', `<h1>Ceionia : back-office</h1>
<p class="sub">La mesure d'audience du jeu. Entrez la clé pour voir les chiffres.</p>
${error ? '<p class="err">Clé incorrecte.</p>' : ''}${slow ? '<p class="err">Trop d’essais. Réessayez dans une minute.</p>' : ''}
<form method="post" action="/bo"><input type="password" name="key" placeholder="Clé" autofocus required><button>Entrer</button></form>`);
}

/** La page sans base : le Worker tourne, la base D1 n'est pas encore branchée (voir docs/mesure-audience.md) */
export function noDbPage(): string {
  return page('Ceionia : back-office', `<h1>Ceionia : back-office</h1><p class="sub">La base D1 n’est pas encore branchée : les signaux sont ignorés. Voir la mise en service dans docs/mesure-audience.md.</p>`);
}

/** La page du rapport */
export function reportPage(r: Report): string {
  const t = r.time;
  const card = (v: string, label: string) => `<div class="card"><b>${v}</b><span>${label}</span></div>`;
  const maxAge = Math.max(1, ...r.ages.map((a) => a.players), r.sandboxOnly);
  const ageRow = (name: string, x: number) => `<div class="row"><span>${esc(name)}</span><i style="width:${(x / maxAge) * 100}%"></i><em>${x}</em></div>`;
  const maxDay = Math.max(1, ...r.days.map((d) => d.players));
  const list = r.list, pages = Math.max(1, Math.ceil(r.players.total / PAGE));
  return page('Ceionia : audience', `<h1>Ceionia : audience</h1>
<div class="sub">Aujourd'hui : ${dayLabel(r.today)} (heure de Paris). Mesure anonyme, sans nom ni adresse IP enregistrée. <form class="inline" method="post" action="/bo/sortie"><button class="link">Se déconnecter</button></form></div>

<h2>Joueurs différents</h2>
<div class="grid">${card(n(r.players.today), "aujourd'hui")}${card(n(r.players.week), '7 derniers jours')}${card(n(r.players.total), 'en tout')}
${card(n(r.sessions.today), "parties lancées aujourd'hui")}${card(n(r.sessions.total), 'parties lancées en tout')}${card(n(r.players.idle), 'sans une minute de jeu')}</div>
<p class="sub">« Sans une minute de jeu » : partis avant le premier signal de la minute, ou faux joueurs envoyés par un script. Une hausse soudaine trahit une rafale.</p>

<h2>Temps de jeu</h2>
<div class="grid">${card(duration(t.total), 'en tout')}${card(duration(t.perPlayer.mean), 'moyen par joueur')}${card(duration(t.perPlayer.median), 'médian par joueur')}
${card(duration(t.perSession.mean), 'moyen par partie')}${card(duration(t.perSession.median), 'médian par partie')}</div>
<p class="sub">Le temps compte pendant une partie (pas au menu), onglet visible, avec un geste du joueur (souris, clavier) dans les 2 dernières minutes.</p>

<h2>Âge le plus haut atteint par joueur</h2>
<div class="bars">${r.ages.map((a) => ageRow(a.name, a.players)).join('')}${ageRow('Bac à sable seul', r.sandboxOnly)}</div>
<p class="sub">Là où chacun s'est arrêté, hors bac à sable (où l'on choisit son âge de départ).</p>

<h2>Joueurs par jour, sur 30 jours</h2>
<div class="bars"><div class="days">${r.days.map((d) => `<div title="${dayLabel(d.day)} : ${d.players} joueur(s), ${duration(d.seconds)}">${d.players ? `<b>${d.players}</b>` : ''}<i style="height:${(d.players / maxDay) * 100}%"></i></div>`).join('')}</div>
<div class="axis">${r.days.map((d, i) => `<span>${i % 5 === 4 || i === 29 ? dayLabel(d.day) : ''}</span>`).join('')}</div></div>

<h2>Joueurs, du dernier venu au plus ancien (page ${r.page + 1} sur ${pages})</h2>
<div class="scroll"><table><thead><tr><th>Joueur</th><th>Première visite</th><th>Dernière visite</th><th>Temps total</th><th>Parties</th><th>Âge max</th><th>Langue</th></tr></thead><tbody>
${list.map((p) => `<tr><td><code>${esc(p.id.slice(0, 8))}</code></td><td>${when(p.first_at)}</td><td>${when(p.last_at)}</td><td>${duration(p.seconds)}</td><td>${p.sessions}</td><td>${p.max_age < 0 ? 'bac à sable' : esc(r.ages[p.max_age]?.name ?? String(p.max_age))}</td><td>${esc(p.lang)}</td></tr>`).join('')}
</tbody></table></div>
<div class="pages">${r.page > 0 ? `<a href="/bo?page=${r.page - 1}">← Page précédente</a>` : ''}${r.page + 1 < pages ? `<a href="/bo?page=${r.page + 1}">Page suivante →</a>` : ''}</div>`);
}
