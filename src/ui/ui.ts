import { ToolController, ToolId } from '../build/tools';
import { KINDS, KIND_ORDER, AGES, KindId, SEASONS } from '../build/catalog';
import { Sim } from '../sim/sim';
import { GameTime } from '../core/time';
import { Environment, WeatherKind } from '../render/env';
import { AudioEngine } from '../audio/audio';
import { CameraRig } from '../core/camera';
import { loadSlot, SaveData } from '../save/save';
import { MAPS, genHeights } from '../world/mapgen';
import { N } from '../world/world';

export interface UIHost {
  tools: ToolController;
  sim: Sim;
  time: GameTime;
  env: Environment;
  audio: AudioEngine;
  cam: CameraRig;
  applySettings(): void;
  saveNow(): void;
  exportSave(): void;
  importFile(f: File): void;
  newGame(): void;
  toMenu(): void;
  setPhoto(on: boolean): void;
  capture(): void;
}

const TOOL_INFO: Record<string, { icon: string; label: string; key?: string }> = {
  none: { icon: '👆', label: 'Voir', key: 'Échap' },
  raise: { icon: '⛰️', label: 'Monter', key: '1' },
  lower: { icon: '⬇️', label: 'Baisser', key: '2' },
  flatten: { icon: '➖', label: 'Aplanir', key: '3' },
  cliff: { icon: '🧱', label: 'Falaise', key: '4' },
  dig: { icon: '🌊', label: 'Eau', key: '5' },
  forest: { icon: '🌲', label: 'Forêt', key: '6' },
  field: { icon: '🌾', label: 'Champ', key: '7' },
  garden: { icon: '🌷', label: 'Jardin', key: '8' },
  erase: { icon: '🧽', label: 'Gomme', key: '9' },
  road: { icon: '🛤️', label: 'Route', key: 'R' },
  bulldoze: { icon: '💥', label: 'Démolir', key: 'X' },
  move: { icon: '✋', label: 'Déplacer', key: 'M' },
};

const TABS = [
  { id: 'relief', icon: '⛰️', label: 'Relief', tools: ['none', 'raise', 'lower', 'flatten', 'cliff', 'dig'] },
  { id: 'nature', icon: '🌳', label: 'Nature', tools: ['none', 'forest', 'field', 'garden', 'erase'] },
  { id: 'build', icon: '🏘️', label: 'Bâtir', tools: ['none', 'road', 'bulldoze', 'move'] },
];

const SEASON_ICON = ['🌸', '☀️', '🍂', '❄️'];
const WEATHER_ICON: Record<WeatherKind, string> = { clear: '', rain: '🌧️', snow: '🌨️', fog: '🌫️' };

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

export class UI {
  root: HTMLElement;
  tab = 'build';
  private lastAge = -1;
  private toastTimer = 0;
  private bannerTimer = 0;
  private openReq = false;

  constructor(root: HTMLElement, private host: UIHost) {
    this.root = root;
    root.innerHTML = `
      <div id="topbar">
        <div id="agePanel" class="panel"><div id="ageName"></div><div id="ageSub"></div><div class="bar"><i id="ageBar"></i></div><div id="ageReq"></div></div>
        <div id="needs" class="panel"></div>
        <div id="timePanel" class="panel">
          <div id="clock"></div>
          <button id="bPause" title="Pause (Espace)">⏸</button>
          <button id="bSpeed" title="Vitesse">×1</button>
          <button id="bPhoto" title="Mode photo (P)">📷</button>
          <button id="bSettings" title="Réglages">⚙️</button>
        </div>
        <div id="msg" class="panel"></div>
      </div>
      <div id="side" class="panel">
        <button id="bUndo" title="Annuler (Ctrl+Z)">↩️</button>
        <button id="bRedo" title="Rétablir (Ctrl+Y)">↪️</button>
        <button id="bRot" title="Tourner le bâtiment (T)">🔄</button>
        <button id="bHome" title="Vue d'ensemble">🎯</button>
      </div>
      <div id="bottom">
        <div id="brush" class="panel"><span>Taille</span><input id="rad" type="range" min="1" max="8" step="0.5" value="3"><span id="radv">3</span></div>
        <div id="items" class="panel"></div>
        <div id="cats" class="panel"></div>
      </div>
      <div id="toast"></div>
      <div id="bannerWrap"><div id="banner" class="panel"><h2></h2><p></p></div></div>
      <div id="photoBar" class="panel"><button id="pCap">📷 Capturer</button><button id="pExit">Quitter</button></div>
    `;
    const needs = $('#needs');
    needs.innerHTML = ['🍞|food|Nourriture', '💧|water|Eau', '🏠|housing|Logement', '🔨|jobs|Travail', '😊|joy|Bien-être']
      .map((s) => { const [i, k, l] = s.split('|'); return `<div class="need" id="n-${k}" title="${l}"><b>${i}</b><div class="bar"><i></i></div><span>${l}</span></div>`; }).join('') + `<div class="pop" id="pop">0<small>habitants</small></div>`;

    $('#agePanel').onclick = () => { this.openReq = !this.openReq; $('#agePanel').classList.toggle('open', this.openReq); };
    $('#bPause').onclick = () => { host.time.paused = !host.time.paused; host.audio.sfxClick(); };
    $('#bSpeed').onclick = () => {
      const seq = [1, 2, 4];
      host.time.speed = seq[(seq.indexOf(host.time.speed) + 1) % seq.length] ?? 1;
      host.time.paused = false; host.applySettings();
    };
    $('#bSettings').onclick = () => this.openSettings();
    $('#bPhoto').onclick = () => host.setPhoto(true);
    $('#pExit').onclick = () => host.setPhoto(false);
    $('#pCap').onclick = () => host.capture();
    $('#bUndo').onclick = () => host.tools.undo();
    $('#bRedo').onclick = () => host.tools.redo();
    $('#bRot').onclick = () => host.tools.rotate();
    $('#bHome').onclick = () => host.cam.reset();
    const rad = $<HTMLInputElement>('#rad');
    rad.oninput = () => { host.tools.radius = +rad.value; $('#radv').textContent = rad.value; };

    this.renderCats();
    this.renderItems();
  }

  private renderCats() {
    const c = $('#cats');
    c.innerHTML = TABS.map((t) => `<button data-t="${t.id}" class="${t.id === this.tab ? 'active' : ''}">${t.icon} ${t.label}</button>`).join('');
    c.querySelectorAll('button').forEach((b) => (b.onclick = () => { this.tab = (b as HTMLElement).dataset.t!; this.renderCats(); this.renderItems(); this.host.audio.sfxClick(); }));
  }

  renderItems() {
    const t = TABS.find((x) => x.id === this.tab)!;
    const age = this.host.sim.age;
    let html = t.tools.map((id) => { const i = TOOL_INFO[id]; return `<button data-tool="${id}"><b>${i.icon}</b>${i.label}<kbd>${i.key ?? ''}</kbd></button>`; }).join('');
    if (t.id === 'build') {
      html += KIND_ORDER.map((k) => {
        const d = KINDS[k];
        const locked = d.minAge > age;
        const name = d.names[Math.max(age, d.minAge)];
        return `<button data-kind="${k}" class="${locked ? 'locked' : ''}" title="${d.desc}"><b>${d.icon}</b>${locked ? '???' : name}${locked ? `<small>${AGES[d.minAge].name}</small>` : `<kbd>${d.size === 2 ? '2×2' : ''}</kbd>`}</button>`;
      }).join('');
    }
    const items = $('#items');
    items.innerHTML = html;
    items.querySelectorAll<HTMLButtonElement>('button[data-tool]').forEach((b) => (b.onclick = () => { this.host.tools.setTool(b.dataset.tool as ToolId); this.host.audio.sfxClick(); }));
    items.querySelectorAll<HTMLButtonElement>('button[data-kind]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.kind as KindId;
      if (KINDS[k].minAge > this.host.sim.age) { this.toast(`Disponible à l'âge : ${AGES[KINDS[k].minAge].name}`); return; }
      this.host.tools.rotManual = false;
      this.host.tools.setTool('build', k);
      this.host.audio.sfxClick();
    }));
    this.refreshTools();
  }

  /** Surligne l'outil actif, affiche/masque le réglage de pinceau */
  refreshTools() {
    const tl = this.host.tools;
    this.root.querySelectorAll<HTMLButtonElement>('#items button').forEach((b) => {
      const on = b.dataset.tool ? b.dataset.tool === tl.tool : tl.tool === 'build' && b.dataset.kind === tl.kind;
      b.classList.toggle('active', on);
    });
    const brush = ['raise', 'lower', 'flatten', 'cliff', 'dig', 'forest', 'field', 'garden', 'erase'].includes(tl.tool);
    $('#brush').style.display = brush ? 'flex' : 'none';
    // l'onglet suit l'outil
    const tabOf = (['raise', 'lower', 'flatten', 'cliff', 'dig'].includes(tl.tool) ? 'relief' : ['forest', 'field', 'garden', 'erase'].includes(tl.tool) ? 'nature' : tl.tool === 'none' ? this.tab : 'build');
    if (tabOf !== this.tab) { this.tab = tabOf; this.renderCats(); this.renderItems(); }
    $<HTMLInputElement>('#rad').value = String(tl.radius);
    $('#radv').textContent = String(tl.radius);
    $('#bRot').style.display = tl.tool === 'build' || tl.tool === 'move' ? '' : 'none';
  }

  toast(msg: string) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('show'), 2600);
  }

  banner(title: string, sub: string) {
    const b = $('#banner');
    $('h2', b).textContent = title;
    $('p', b).textContent = sub;
    b.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => b.classList.remove('show'), 4200);
  }

  update() {
    const { sim, time, env } = this.host;
    if (sim.age !== this.lastAge) { this.lastAge = sim.age; this.renderItems(); }
    $('#ageName').textContent = AGES[sim.age].name;
    $('#ageSub').textContent = AGES[sim.age].tagline;
    const ap = sim.ageProgress();
    $('#ageBar').style.width = ap ? `${Math.round(ap.ratio * 100)}%` : '100%';
    $('#ageReq').innerHTML = ap
      ? `<b>Vers : ${AGES[ap.next].name}</b><br>` + ap.items.map((i) => `<span class="${i.have >= i.need ? 'ok' : ''}">${i.have >= i.need ? '✓' : '•'} ${i.label} ${Math.min(i.have, 999)}/${i.need}</span>`).join('<br>')
      : 'Dernier âge atteint : profitez de votre village !';
    const set = (k: string, n: { cap: number; demand: number; ok: boolean }, housing = false) => {
      const el = $('#n-' + k);
      const fill = housing ? (n.cap > 0 ? Math.min(1, sim.pop / n.cap) : 0) : n.demand <= 0 ? 1 : Math.min(1, n.cap / n.demand);
      $('i', el).style.width = `${Math.round(fill * 100)}%`;
      el.classList.toggle('warn', !n.ok);
      el.title = housing ? `Logements : ${Math.floor(sim.pop)} / ${n.cap}` : `Capacité ${Math.floor(n.cap * 10) / 10} / besoin ${Math.ceil(n.demand * 10) / 10}`;
    };
    set('food', sim.food); set('water', sim.water); set('housing', sim.housing, true); set('jobs', sim.jobs); set('joy', sim.joy);
    $('#pop').innerHTML = `${Math.floor(sim.pop)}<small>habitants</small>`;
    $('#msg').textContent = sim.message;
    const hh = Math.floor(time.hour), mm = Math.floor((time.hour % 1) * 60);
    $('#clock').innerHTML = `${SEASON_ICON[time.season]} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}<small>${SEASONS[time.season]} ${WEATHER_ICON[env.weatherKind] && env.weatherK > 0.3 ? WEATHER_ICON[env.weatherKind] : ''}</small>`;
    $('#bPause').textContent = time.paused ? '▶️' : '⏸';
    $('#bSpeed').textContent = `×${time.speed}`;
    ($('#bUndo') as HTMLButtonElement).disabled = !this.host.tools.undoStack.length;
    ($('#bRedo') as HTMLButtonElement).disabled = !this.host.tools.redoStack.length;
  }

  // ---------------- Réglages ----------------
  openSettings() {
    const h = this.host, t = h.time, a = h.audio;
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `
      <div class="modal panel">
        <h3>Réglages</h3>
        <h4>Temps</h4>
        <div class="row"><label>Vitesse</label>
          <button data-sp="0">⏸ Pause</button><button data-sp="1">×1</button><button data-sp="2">×2</button><button data-sp="4">×4</button></div>
        <div class="row"><label>Durée du jour</label><input id="sDay" type="range" min="30" max="400" step="10" value="${t.dayLen}"><span id="vDay">${t.dayLen}s</span></div>
        <div class="row"><label>Durée saison</label><input id="sSeason" type="range" min="30" max="600" step="10" value="${t.seasonLen}"><span id="vSeason">${t.seasonLen}s</span></div>
        <h4>Saison et heure (mode photo)</h4>
        <div class="row">${SEASONS.map((s, i) => `<button data-season="${i}" class="${t.season === i ? 'active' : ''}">${SEASON_ICON[i]} ${s}</button>`).join('')}</div>
        <div class="row"><label>Heure</label><input id="sHour" type="range" min="0" max="23.9" step="0.1" value="${t.hour.toFixed(1)}"><span id="vHour">${Math.floor(t.hour)}h</span></div>
        <h4>Météo</h4>
        <div class="row">
          ${[['auto', 'Auto'], ['clear', '☀️ Clair'], ['rain', '🌧️ Pluie'], ['snow', '🌨️ Neige'], ['fog', '🌫️ Brume']].map(([k, l]) => `<button data-w="${k}" class="${(h.env.manualWeather ?? 'auto') === k ? 'active' : ''}">${l}</button>`).join('')}
        </div>
        <h4>Audio</h4>
        <div class="row"><label>Musique</label><input id="sMusic" type="range" min="0" max="1" step="0.05" value="${a.musicVol}"><button id="mMusic" class="${a.muteMusic ? 'active' : ''}">${a.muteMusic ? '🔇' : '🔊'}</button></div>
        <div class="row"><label>Sons</label><input id="sSfx" type="range" min="0" max="1" step="0.05" value="${a.sfxVol}"><button id="mSfx" class="${a.muteSfx ? 'active' : ''}">${a.muteSfx ? '🔇' : '🔊'}</button></div>
        <h4>Partie</h4>
        <div class="row">
          <button id="gSave">💾 Sauvegarder</button><button id="gExport">⬇️ Exporter JSON</button><button id="gImport">⬆️ Importer JSON</button>
        </div>
        <div class="row"><button id="gNew">🆕 Nouvelle partie (cette carte)</button><button id="gMenu">🏠 Menu principal</button></div>
        <div class="row"><span class="grow"></span><button id="gClose" class="active">Fermer</button></div>
        <input type="file" id="fImport" accept="application/json,.json" style="display:none">
      </div>`;
    this.root.appendChild(ov);
    const q = <T extends HTMLElement>(s: string) => $(s, ov) as T;
    const close = () => { ov.remove(); };
    ov.addEventListener('pointerdown', (e) => { if (e.target === ov) close(); });
    q('#gClose').onclick = close;
    ov.querySelectorAll<HTMLButtonElement>('[data-sp]').forEach((b) => (b.onclick = () => {
      const v = +b.dataset.sp!;
      if (v === 0) t.paused = true; else { t.paused = false; t.speed = v; }
      h.applySettings();
    }));
    const rng = (id: string, fn: (v: number) => void, out?: string, fmt = (v: number) => `${v}`) => {
      const el = q<HTMLInputElement>(id);
      el.oninput = () => { fn(+el.value); if (out) q(out).textContent = fmt(+el.value); h.applySettings(); };
    };
    rng('#sDay', (v) => (t.dayLen = v), '#vDay', (v) => `${v}s`);
    rng('#sSeason', (v) => (t.seasonLen = v), '#vSeason', (v) => `${v}s`);
    rng('#sHour', (v) => (t.hour = v), '#vHour', (v) => `${Math.floor(v)}h`);
    ov.querySelectorAll<HTMLButtonElement>('[data-season]').forEach((b) => (b.onclick = () => {
      t.setSeason(+b.dataset.season!);
      ov.querySelectorAll('[data-season]').forEach((x) => x.classList.toggle('active', x === b));
      h.applySettings();
    }));
    ov.querySelectorAll<HTMLButtonElement>('[data-w]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.w!;
      h.env.setWeather(k === 'auto' ? null : (k as WeatherKind));
      if (k === 'auto') h.env.wantKind = 'clear';
      ov.querySelectorAll('[data-w]').forEach((x) => x.classList.toggle('active', x === b));
    }));
    rng('#sMusic', (v) => (a.musicVol = v));
    rng('#sSfx', (v) => (a.sfxVol = v));
    q('#mMusic').onclick = () => { a.muteMusic = !a.muteMusic; q('#mMusic').textContent = a.muteMusic ? '🔇' : '🔊'; q('#mMusic').classList.toggle('active', a.muteMusic); h.applySettings(); };
    q('#mSfx').onclick = () => { a.muteSfx = !a.muteSfx; q('#mSfx').textContent = a.muteSfx ? '🔇' : '🔊'; q('#mSfx').classList.toggle('active', a.muteSfx); h.applySettings(); };
    q('#gSave').onclick = () => { h.saveNow(); this.toast('Partie sauvegardée'); };
    q('#gExport').onclick = () => h.exportSave();
    const fi = q<HTMLInputElement>('#fImport');
    q('#gImport').onclick = () => fi.click();
    fi.onchange = () => { if (fi.files?.[0]) h.importFile(fi.files[0]); };
    q('#gNew').onclick = () => { if (confirm('Recommencer cette carte ? La sauvegarde actuelle sera remplacée.')) h.newGame(); };
    q('#gMenu').onclick = () => h.toMenu();
  }
}

// ---------------- Menu principal ----------------
export interface MenuHost {
  start(map: number, mode: 'continue' | 'new'): void;
  importFile(f: File): void;
}

export function drawPreview(canvas: HTMLCanvasElement, heights: ArrayLike<number>) {
  const S = N + 1;
  canvas.width = canvas.height = S * 3;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(S * 3, S * 3);
  for (let y = 0; y < S * 3; y++)
    for (let x = 0; x < S * 3; x++) {
      const fx = Math.min(S - 1.001, x / 3), fz = Math.min(S - 1.001, y / 3);
      const ix = Math.floor(fx), iz = Math.floor(fz);
      const at = (a: number, b: number) => heights[Math.min(S - 1, b) * S + Math.min(S - 1, a)];
      const h = at(ix, iz);
      const dx = at(ix + 1, iz) - at(ix - 1 < 0 ? 0 : ix - 1, iz), dz = at(ix, iz + 1) - at(ix, iz - 1 < 0 ? 0 : iz - 1);
      const shade = 1 + (-dx * 0.6 - dz * 0.4) * 0.15;
      let r: number, gg: number, b: number;
      if (h < 0) { const d = Math.min(1, -h / 1.5); r = 170 - 80 * d; gg = 214 - 50 * d; b = 215 - 20 * d; }
      else if (h < 0.3) { r = 238; gg = 220; b = 170; }
      else { const k = Math.min(1, h / 5); r = 150 + 60 * k; gg = 207 - 20 * k; b = 126 + 30 * k; }
      const i = (y * S * 3 + x) * 4;
      img.data[i] = Math.min(255, r * shade); img.data[i + 1] = Math.min(255, gg * shade); img.data[i + 2] = Math.min(255, b * shade); img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
}

export function showMenu(root: HTMLElement, host: MenuHost): HTMLElement {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.id = 'menu';
  ov.innerHTML = `
    <h1>Village Lowpoly</h1>
    <p class="sub">Bâtissez, sculptez et regardez votre village traverser cinq âges et quatre saisons.</p>
    <div class="maps"></div>
    <div class="row" style="justify-content:center"><button id="mImport">⬆️ Importer une sauvegarde (JSON)</button></div>
    <input type="file" id="mFile" accept="application/json,.json" style="display:none">
    <p class="hint">Souris : clic gauche = outil, clic droit + glisser = tourner, molette = zoom, clic milieu ou Maj + clic droit = déplacer, WASD/flèches = déplacement, Q/E = rotation.<br>Tactile : un doigt = outil, deux doigts = déplacer / zoomer / tourner.</p>`;
  const maps = $('.maps', ov);
  for (const m of MAPS) {
    const save = loadSlot(m.id);
    const card = document.createElement('div');
    card.className = 'card panel';
    card.innerHTML = `<canvas></canvas><h3>${m.name}</h3><p>${m.desc}</p><div class="stat"></div><div class="btns"></div>`;
    const heights = save ? (save.world.heights as number[]).map((v) => v / 100) : genHeights(m.id, m.defaultSeed);
    drawPreview($('canvas', card) as HTMLCanvasElement, heights);
    if (save) $('.stat', card).textContent = `${AGES[save.age].name} · ${Math.floor(save.pop)} hab. · ${SEASONS[Math.floor(save.seasonT) % 4]}`;
    const btns = $('.btns', card);
    if (save) {
      btns.innerHTML = `<button class="active" data-m="continue">Continuer</button><button data-m="new">Nouvelle</button>`;
    } else btns.innerHTML = `<button class="active" data-m="new">Jouer</button>`;
    btns.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => {
      const mode = b.dataset.m as 'continue' | 'new';
      if (mode === 'new' && save && !confirm('Écraser la sauvegarde de cette carte ?')) return;
      host.start(m.id, mode);
    }));
    maps.appendChild(card);
  }
  const f = $<HTMLInputElement>('#mFile', ov);
  $('#mImport', ov).onclick = () => f.click();
  f.onchange = () => { if (f.files?.[0]) host.importFile(f.files[0]); };
  root.appendChild(ov);
  return ov;
}
export type { SaveData };
