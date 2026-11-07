/*
 * Banc de mesure : lance Chrome (profil à part, sans limite d'images par seconde), ouvre le jeu servi en local, bâtit un
 * village de test et mesure les scénarios de tools/bench/page.js, avec ou sans bridage du processeur (protocole de
 * débogage, Emulation.setCPUThrottlingRate) pour imiter une machine modeste.
 *
 *   node tools/bench/run.mjs [--url http://localhost:5202/] [--throttle 1,4] [--seconds 3] [--out rapport.json]
 *                            [--chrome "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"] [--no-ablation]
 *                            [--only "près"] [--seed 2026] [--profile dossier] [--headless]
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]] : null)).filter(Boolean));
const url = args.url ?? 'http://localhost:5202/';
const throttles = String(args.throttle ?? '1,4').split(',').map(Number);
const seconds = Number(args.seconds ?? 3);
const chrome = args.chrome ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const seed = Number(args.seed ?? 2026);
const port = 9333 + Math.floor(Math.random() * 100);
const profile = args.profile ?? mkdtempSync(join(tmpdir(), 'ceionia-bench-'));

const page = readFileSync(join(here, 'page.js'), 'utf8');

/** Math.random reproductible et partie lancée d'office sur le continent, dès le chargement */
const boot = `(() => {
  let s = ${seed} >>> 0;
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  if (!sessionStorage.getItem('bench-started')) { sessionStorage.setItem('bench-started', '1'); sessionStorage.setItem('village-lowpoly:autostart', '3|new|normal'); }
})();`;

const flags = [
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--window-size=1296,860', '--disable-frame-rate-limit', '--disable-gpu-vsync', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling', '--window-position=0,0',
];
if (args.headless) flags.push('--headless=new', '--use-angle=swiftshader');
const proc = spawn(chrome, [...flags, 'about:blank'], { stdio: 'ignore' });
const kill = () => { try { proc.kill(); } catch { /* déjà fermé */ } };
process.on('exit', kill);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function target() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const t = list.find((x) => x.type === 'page');
      if (t) return t.webSocketDebuggerUrl;
    } catch { /* pas encore prêt */ }
    await sleep(200);
  }
  throw new Error('Chrome ne répond pas');
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.wait = new Map(); ws.onmessage = (e) => { const m = JSON.parse(e.data); const w = this.wait.get(m.id); if (w) { this.wait.delete(m.id); m.error ? w[1](new Error(m.error.message)) : w[0](m.result); } }; }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.wait.set(id, [res, rej])); }
  async eval(expression, awaitPromise = false) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
}

const ws = new WebSocket(await target());
await new Promise((r) => (ws.onopen = r));
const cdp = new CDP(ws);
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: boot });
await cdp.send('Page.navigate', { url });
for (let i = 0; i < 300 && !(await cdp.eval('!!window.__game')); i++) await sleep(500);
if (!(await cdp.eval('!!window.__game'))) throw new Error('le jeu ne démarre pas');
await sleep(1500);
for (let i = 0; i < 20 && (await cdp.eval('document.hidden')); i++) { await cdp.send('Page.bringToFront'); await sleep(500); }
if (await cdp.eval('document.hidden')) throw new Error('la page est cachée : pas d’images (fenêtre Chrome masquée ?)');
await cdp.eval(page);
await cdp.eval('(() => { window.__game.saveNow = () => {}; Storage.prototype.setItem = () => {}; })()');
const gpuInfo = await cdp.eval(`(() => { const gl = document.getElementById('view').getContext('webgl2'); const d = gl.getExtension('WEBGL_debug_renderer_info'); return { renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), timer: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') }; })()`);
console.log('GPU :', gpuInfo.renderer, gpuInfo.timer ? '(chronomètre GPU)' : '(pas de chronomètre GPU)');

const only = args.only ? String(args.only) : null;
const report = { url, seed, gpu: gpuInfo, date: new Date().toISOString(), runs: {} };
const fmt = (v) => (v == null ? '–' : typeof v === 'number' ? String(v) : v);
for (const th of throttles) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: th });
  const scen = only ? `__bench.SCENARIOS.filter((s) => ${JSON.stringify(only.split(','))}.some((p) => s.name.includes(p)))` : '__bench.SCENARIOS';
  const ablateOn = args['ablate-on'] ? `${scen}.map((s) => s.name).filter((n) => ${JSON.stringify(String(args['ablate-on']).split(','))}.some((p) => n.includes(p)))` : 'undefined';
  const res = await cdp.eval(`__bench.run({ seconds: ${seconds}, scenarios: ${scen}, ablation: ${args['no-ablation'] ? 'false' : 'true'}, ablateOn: ${ablateOn} })`, true);
  report.runs[`x${th}`] = res;
  console.log(`\n### Processeur bridé ×${th}\n`);
  console.log('| scénario | CPU ms (p95) | image ms (p95) | GPU ms | appels | triangles | rendu | faune | végé. | villageois | trafic |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [name, m] of Object.entries(res.scenarios)) {
    console.log(`| ${name} | ${m.cpu} (${m.cpuP95}) | ${m.wall} (${m.wallP95}) | ${fmt(m.gpu)} | ${fmt(m.calls)} | ${fmt(m.tris)} | ${fmt(m.subs.rendu)} | ${fmt(m.subs.faune)} | ${fmt(m.subs['végétation'])} | ${fmt(m.subs.villageois)} | ${fmt(m.subs.trafic)} |`);
  }
  for (const [name, ab] of Object.entries(res.ablation ?? {})) {
    console.log(`\nAblation « ${name} » (ce que chaque poste coûte) :`);
    console.log('| poste | CPU ms | GPU ms | image ms | appels | triangles |');
    console.log('|---|---|---|---|---|---|');
    for (const [k, v] of Object.entries(ab)) if (k !== 'base') console.log(`| ${k} | ${v.cpu} | ${fmt(v.gpu)} | ${v.wall} | ${v.calls} | ${v.tris} |`);
  }
  if (res.hitches) console.log('\nÀ-coups :', JSON.stringify(res.hitches));
  for (const [name, m] of Object.entries(res.scenarios)) console.log(`\n${name} — sous-systèmes : ${JSON.stringify(m.subs)}\n  en scène : ${JSON.stringify(m.counts)}`);
}
if (args.out) writeFileSync(String(args.out), JSON.stringify(report, null, 1));
kill();
process.exit(0);
