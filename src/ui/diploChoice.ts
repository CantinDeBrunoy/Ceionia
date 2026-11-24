import { tr } from '../i18n';
import { hudPic } from './pics';
import type { People } from '../world/archipelago';
import { DiploState, Path, isleName, peopleName, rivalOf, talkRisk, TALK_RISK, type Intel } from '../sim/diplomacy';
import type { Road } from '../sim/diploRoad';
import type { KindId } from '../build/catalog';

/**
 * Les cartes de la diplomatie de l'archipel, dans le style de la carte du choix du portail (parchemin bordé d'or, titre en
 * Fraunces, deux ou trois grands choix) :
 * - **le choix de l'allié**, à la fin de la cinématique des îles : les deux peuples côte à côte, chacun avec son blason, son
 *   île et ses mœurs ; le choix est obligatoire et définitif (la carte n'a pas de croix) ;
 * - **le dénouement**, au Médiéval (une fois l'allié installé chez lui) : négocier la paix (des pourparlers, une trêve, puis
 *   la paix au Moderne) ou aider notre allié (des éclaireurs, puis la campagne de l'île rivale). Le conflit se joue en trois
 *   chapitres, un par âge (`sim/saga.ts`), chacun une condition du passage d'âge. Elle s'ouvre d'elle-même une fois, quand le
 *   reste du passage est rempli ; « Plus tard » la referme. On la rouvre depuis la condition du panneau des âges, le conseil,
 *   l'onglet « Grands choix » ou la ligne en tête du rayon Vie ; on peut changer de voie tant que la bataille n'est pas
 *   engagée et la trêve pas signée
 */
export class DiploChoice {
  private el: HTMLElement;
  private mode: 'ally' | 'path' | 'tactic' | 'battle' | 'road' | 'raid' = 'ally';
  /** la sortie en cours : ce qui serait reperdu si le camp tombait */
  private stake = '';
  /** le choix tactique en cours de la bataille (1 : les remparts ; 2 : l'assaut final) */
  private step: 1 | 2 = 1;

  constructor(root: HTMLElement, private host: { diplo(): DiploState; why?(): string | null; click(): void; ally(p: People): void; path(p: Path): void; tactic?(c: string): void; battle?(): void; road?(): Road | null; mission?(id: string): void; hold?(): void; build?(k: KindId): void; sign?(): void }) {
    this.el = document.createElement('div');
    this.el.id = 'diploChoice';
    this.el.className = 'panel';
    this.el.style.display = 'none';
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (!b) return;
      this.host.click();
      const a = b.dataset.a!;
      this.hide();
      if (b.dataset.tac) this.host.tactic?.(b.dataset.tac);
      else if (a === 'mission' && b.dataset.id) this.host.mission?.(b.dataset.id);
      else if (a === 'change') this.showPath();
      else if (a === 'hold') this.host.hold?.();
      else if (a === 'orient' || a === 'asie') this.host.ally(a);
      else if (a === 'peace' || a === 'war') this.host.path(a);
      else if (a === 'battle') this.host.battle?.();
      else if (a === 'build' && b.dataset.k) this.host.build?.(b.dataset.k as KindId);
      else if (a === 'sign') this.host.sign?.();
    });
    root.append(this.el);
  }

  get visible() { return this.el.style.display !== 'none'; }

  /** La carte du choix de l'allié */
  showAlly() { this.mode = 'ally'; this.render(); this.el.style.display = ''; }
  /** La carte du dénouement */
  showPath() { this.mode = 'path'; this.render(); this.el.style.display = ''; }
  /**
   * Les éclaireurs sont revenus : ce qu'ils ont appris, et « Lancer l'assaut » (ou « Plus tard »). Avant, la bataille partait
   * seule à leur retour, et l'on ne comprenait pas ce qui arrivait (demande de l'auteur, 17 nov. 2026)
   */
  showBattle() { this.mode = 'battle'; this.render(); this.el.style.display = ''; }
  /**
   * La feuille de route de la voie prise (retour de joueurs, 22 nov. 2026 : « perdu » après le choix) : les étapes qui
   * déclenchent la suite, dans l'ordre, et les visites facultatives sur les îles qui la préparent. Rien à montrer : rien ne s'ouvre
   */
  showRoad() { if (!this.host.road?.()) return false; this.mode = 'road'; this.render(); this.el.style.display = ''; return true; }
  /**
   * Une sortie rivale fond sur le camp de la plage (la campagne de l'île rivale) : la défendre soi-même, ou laisser la
   * garnison tenir seule (le combat se règle sans nous, avec une partie du corps). `stake` : ce qui serait reperdu
   */
  showRaid(stake: string) { this.mode = 'raid'; this.stake = stake; this.render(); this.el.style.display = ''; }
  /** Un choix tactique de la bataille de l'archipel (le jeu est en pause tant qu'il attend) */
  showTactic(step: 1 | 2) { this.mode = 'tactic'; this.step = step; this.render(); this.el.style.display = ''; }

  private render() {
    const d = this.host.diplo();
    // (`off` : la voie ne se prend pas encore, la carte dit pourquoi)
    const choice = (a: string, cls: string, icon: string, title: string, sub: string, on = false, off = false) => `<button data-a="${a}" class="${cls}${on ? ' on' : ''}"${off ? ' disabled' : ''}>${icon}<span><b>${title}</b><small>${sub}</small></span></button>`;
    if (this.mode === 'ally') {
      const card = (p: People) => choice(p, 'pcGo dcPeople', crest(p), cap(peopleName(p)), p === 'orient'
        ? tr('{isle}, ses dunes, ses palmiers et ses coupoles blanches. Un peuple de marchands et de navigateurs.', { isle: cap(isleName(p)) })
        : tr('{isle}, ses forêts humides, ses pitons et ses pagodes. Un peuple d’artisans et de jardiniers.', { isle: cap(isleName(p)) }));
      this.el.innerHTML = `<div class="dcCrests">${crest('orient', 64)}${crest('asie', 64)}</div>
        <h4>${tr('Choisissez votre allié')}</h4>
        <p class="pcSub">${tr('Les Sablais et les Jadéens se font la guerre. Avec lequel de ces peuples ferez-vous alliance ?')}</p>
        <div class="pcBtns dcCol">${card('orient')}${card('asie')}</div>
        <small class="pcNote">${tr('Ce choix est définitif. Votre allié accueillera votre cosmodrome.')}</small>`;
      return;
    }
    if (this.mode === 'tactic') {
      const ally = d.ally ?? 'orient', tac = (id: string, cls: string, icon: string, title: string, sub: string) => `<button data-a="tac" data-tac="${id}" class="${cls}">${hudPic(icon, 34)}<span><b>${title}</b><small>${sub}</small></span></button>`;
      const one = this.step === 1;
      this.el.innerHTML = `<div class="dcCrests">${crest(ally, 64)}<span class="dcVs">⚔</span>${crest(rivalOf(ally), 64)}</div>
        <h4>${one ? tr('Les remparts') : tr('L’assaut final')}</h4>
        <p class="pcSub">${(one ? tr('La plage est à nous. La porte principale est fermée, des archers tiennent les murs. Comment prendre les remparts ?') : tr('Les remparts sont tombés. Reste le palais, sa garde et le chef rival.')).replace(/ ([?!:;])/g, ' $1')}</p>
        <div class="pcBtns dcCol">${one
          ? tac('ram', 'pcGo', 'militaire', tr('Le bélier contre la porte'), tr('un assaut direct : la porte cédera plus vite')) + tac('climb', 'pcNo', 'route', tr('Escalader par le côté'), tr('une brèche loin de la porte, sans l’enfoncer')) + tac('bombard', 'pcNo', 'eclair', tr('La flotte alliée bombarde'), tr('30 secondes : des boulets sur la porte et ses défenseurs'))
          : tac('charge', 'pcGo', 'militaire', tr('Assaut immédiat'), tr('sans attendre, tant que l’élan est là')) + tac('regroup', 'pcNo', 'sante', tr('Regrouper et soigner'), tr('30 secondes : les blessures se referment')) + tac('allyLead', 'pcNo', 'equipe', tr('Laisser l’allié ouvrir la voie'), tr('ses troupes partent devant, les nôtres suivent'))}</div>
        <small class="pcNote">${tr('La bataille attend votre choix.')}</small>`;
      return;
    }
    if (this.mode === 'battle') {
      const ally = d.ally ?? 'orient', rival = rivalOf(ally);
      const learnt = d.intel.map((i) => `<li>${INTEL[i]()}</li>`).join('') + warBoons(d).map((l) => `<li class="dcBoon">${l}</li>`).join('');
      this.el.innerHTML = `<div class="dcCrests">${crest(ally, 64)}<span class="dcVs">⚔</span>${crest(rival, 64)}</div>
        <h4>${tr('Les éclaireurs sont de retour')}</h4>
        <p class="pcSub">${tr('La côte de {isle} est reconnue. Nos troupes et celles de {ally} sont prêtes à débarquer.', { isle: isleName(rival), ally: peopleName(ally) })}</p>
        ${learnt ? `<ul class="dcIntel">${learnt}</ul>` : ''}
        <div class="pcBtns dcCol">
          ${choice('battle', 'pcGo', hudPic('militaire', 34), tr('Débarquer'), tr('prendre la plage et y poser un camp. Le port, la tour et la ville viendront aux âges suivants'))}
          ${choice('later', 'pcNo dcLater', hudPic('sablier', 34), tr('Plus tard'), tr('préparer encore le village : la bataille attendra'))}
        </div>
        <small class="pcNote">${tr('Pour débarquer plus tard : le bouton des Peuples, ou la condition « le conflit des deux îles ».')}</small>`;
      return;
    }
    if (this.mode === 'raid') {
      const ally = d.ally ?? 'orient', rival = rivalOf(ally);
      this.el.innerHTML = `<div class="dcCrests">${crest(ally, 64)}<span class="dcVs">⚔</span>${crest(rival, 64)}</div>
        <h4>${tr('Le camp est attaqué !')}</h4>
        <p class="pcSub">${tr('{rival} font une sortie contre notre camp de la plage.', { rival: cap(peopleName(rival)) })}</p>
        <div class="pcBtns dcCol">
          ${choice('battle', 'pcGo', hudPic('militaire', 34), tr('Défendre le camp'), tr('tout notre corps, à vos ordres'))}
          ${choice('hold', 'pcNo', hudPic('sablier', 34), tr('Laisser la garnison tenir'), tr('le combat se règle seul, avec une partie du corps'))}
        </div>
        <small class="pcNote">${tr('Si le camp tombe, nous perdrons {what}.', { what: this.stake })}</small>`;
      return;
    }
    if (this.mode === 'road') { const r = this.host.road?.(); if (r) { this.el.innerHTML = roadHtml(r); return; } }
    const ally = d.ally ?? 'orient', rival = rivalOf(ally), why = this.host.why?.() ?? null;
    this.el.innerHTML = `<div class="dcCrests">${crest(ally, 64)}<span class="dcVs">⚔</span>${crest(rival, 64)}</div>
      <h4>${tr('Le conflit des deux îles')}</h4>
      <p class="pcSub">${tr('Nos alliés, {ally}, sont toujours en guerre contre {rival}. Que fera notre village ?', { ally: peopleName(ally), rival: peopleName(rival) })}</p>
      <div class="pcBtns dcCol">
        ${why ? `<p class="dcWhy">${why}</p>` : ''}
        ${choice('peace', 'pcGo', hudPic('parchemin', 34), tr('Négocier la paix'), tr('deux pourparlers, {r} % d’échec chacun, pour une trêve, puis la paix au Moderne', { r: Math.round(talkRisk(d) * 100) }), d.path === 'peace', !!why)}
        ${choice('war', 'pcNo', hudPic('militaire', 34), tr('Aider notre allié'), tr('des éclaireurs, puis une campagne jusqu’au Moderne : butin et tribut d’or'), d.path === 'war', !!why)}
        ${boonsNote(d)}
        ${choice('later', 'pcNo dcLater', hudPic('sablier', 34), tr('Plus tard'), tr('attendre et continuer à jouer'))}
      </div>
      <small class="pcNote">${tr('Le conflit se joue en trois chapitres, du Médiéval au Moderne. Chacun est une condition du passage à l’âge suivant. Pour y revenir : la condition « le conflit des deux îles », ou l’onglet « Grands choix » des expéditions.')}</small>`;
  }

  hide() { this.el.style.display = 'none'; }
}

/**
 * La feuille de route (voir `sim/diploRoad.ts`) : « La suite », les étapes numérotées (celle du moment en bouton d'or), puis
 * « Pour se préparer », les visites facultatives sur les îles en petites tuiles (ce qu'elles rapportent pour cette voie)
 */
export function roadHtml(r: Road) {
  const war = r.path === 'war';
  const step = (s: Road['steps'][number], i: number) => {
    const go = s.state === 'now' && s.go !== 'wait', mark = s.state === 'done' ? '✓' : String(i + 1);
    const body = `<i class="dcNum">${mark}</i><em class="dcIco" aria-hidden="true">${s.icon}</em><span><b>${s.title}</b><small>${s.sub}</small></span>`;
    if (!go) return `<div class="dcStep ${s.state}">${body}</div>`;
    if (s.go === 'battle') return `<button data-a="battle" class="dcStep now pcGo">${body}</button>`;
    if (s.go === 'build') return `<button data-a="build" data-k="${s.kind}" class="dcStep now pcGo">${body}</button>`;
    if (s.go === 'sign') return `<button data-a="sign" class="dcStep now pcGo">${body}</button>`;
    return `<button data-a="mission" data-id="${s.id}" class="dcStep now pcGo">${body}</button>`;
  };
  // les chapitres : celui de l'âge est déplié (ses étapes), les autres tiennent sur une ligne
  const chapter = (c: Road['chapters'][number]) => {
    const head = `<div class="dcChap ${c.state}"><i aria-hidden="true">${c.state === 'done' ? '✓' : c.state === 'now' ? '▾' : '▸'}</i><b>${c.title}</b><small>${c.sub}</small></div>`;
    if (c.state !== 'now') return head;
    return head + `<div class="dcSteps">${r.steps.filter((s) => s.age === c.age).map(step).join('')}</div>`;
  };
  const prep = r.prep.map((p) => `<button data-a="mission" data-id="${p.id}" class="dcPrepIt${p.done ? ' done' : ''}"${p.done ? ' disabled' : ''}><em aria-hidden="true">${p.done ? '✓' : p.icon}</em><span><b>${p.title}</b><small>${p.running ? tr('en route') : p.gain}</small></span></button>`).join('');
  return `<div class="dcCrests">${crest(r.ally, 56)}<span class="dcVs">${war ? '⚔' : '🕊'}</span>${crest(r.rival, 56)}</div>
    <h4>${war ? tr('La voie de la guerre') : tr('La voie de la paix')}</h4>
    <p class="pcSub">${war ? tr('Avec {ally}, contre {rival}.', { ally: peopleName(r.ally), rival: peopleName(r.rival) }) : tr('Réconcilier {ally} et {rival}.', { ally: peopleName(r.ally), rival: peopleName(r.rival) })}</p>
    ${r.alert ? `<button data-a="battle" class="dcAlert pcGo"><em aria-hidden="true">🔥</em><span><b>${r.alert}</b><small>${tr('Défendre le camp')}</small></span></button>` : ''}
    <h5 class="dcH">${tr('La suite')}</h5>
    ${r.chapters.map(chapter).join('')}
    ${r.notes.length ? `<p class="dcNotes">${r.notes.join('<br>')}</p>` : ''}
    ${prep ? `<h5 class="dcH">${tr('Pour se préparer')} <small>${tr('facultatif')}</small></h5><div class="dcPrep">${prep}</div>` : ''}
    <div class="dcFoot">${r.canChange ? `<button data-a="change" class="dcLink">${tr('Changer de voie')}</button>` : ''}<button data-a="later" class="dcLink">${tr('Fermer')}</button></div>
    <small class="pcNote">${tr('Pour revoir cette fenêtre : le bouton des Peuples, en haut.')}</small>`;
}

/** Les avantages des expéditions des îles pour la bataille, une ligne chacun (vide : aucun) */
export function warBoons(d: Pick<DiploState, 'boons'>): string[] {
  const b = d.boons, out: string[] = [];
  if (b.allies > 0) out.push(tr('🛡️ Renforts alliés gagnés sur les îles : +{n} troupes', { n: b.allies }));
  if (b.ours > 0) out.push(tr('⚔️ Armés chez les forgerons alliés : +{n} de nos soldats', { n: b.ours }));
  if (b.foes > 0) out.push(tr('🎯 Flotte et garnison rivales affaiblies : −{n} ennemis', { n: b.foes }));
  return out;
}

/** Ce que les expéditions des îles ont gagné, sur la carte paix ou guerre : la paix plus sûre, la bataille plus facile */
function boonsNote(d: DiploState) {
  const war = warBoons(d), r = Math.round(talkRisk(d) * 100), base = Math.round(TALK_RISK * 100);
  const peace = r !== base ? tr('Paix : risque des pourparlers {base} % → {r} %, grâce à vos expéditions sur les îles.', { base, r }) : '';
  if (!war.length && !peace) return `<p class="dcBoons">${tr('Les expéditions facultatives sur les îles (Expéditions, au Médiéval) donnent des troupes pour la bataille ou des chances pour la paix.')}</p>`;
  return `<p class="dcBoons">${[peace, ...war.map((l) => tr('Guerre : {l}', { l }))].filter(Boolean).join('<br>')}</p>`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Ce que les éclaireurs ont appris, en une ligne chacun (traduit à l'affichage) */
const INTEL: Record<Intel, () => string> = {
  scoutBeach: () => tr('🏖️ La plage de débarquement est repérée : moins de gardes pour nous accueillir.'),
  scoutGarrison: () => tr('🛡️ La garnison est comptée : ses renforts sortiront plus tard.'),
  scoutGate: () => tr('🚪 Une porte est mal gardée : elle cédera plus vite.'),
  scoutChief: () => tr('👑 On sait où se tiendra le chef rival : il sera plus vite à terre.'),
};

/**
 * Le blason d'un peuple, dessiné : un écu turquoise et sable à coupole et croissant pour les Sablais, un écu rouge laqué à
 * toit de pagode pour les Jadéens
 */
export function crest(p: People, size = 40) {
  const shield = 'M20 3 L35 8 V20 C35 29 28 35 20 38 C12 35 5 29 5 20 V8 Z';
  const body = p === 'orient'
    ? `<path d="${shield}" fill="#2aa8a0" stroke="#d9a955" stroke-width="2"/><path d="M11 29 H29 V25 H11 Z" fill="#f4e6c4"/><path d="M13 25 C13 17 27 17 27 25 Z" fill="#f8f6f0"/><path d="M20 13 V17" stroke="#e8b84a" stroke-width="2"/><circle cx="20" cy="12" r="2" fill="#e8b84a"/>`
    : `<path d="${shield}" fill="#c0392e" stroke="#d9a955" stroke-width="2"/><path d="M9 18 Q20 12 31 18 L27 18 L27 20 L13 20 L13 18 Z" fill="#2f7a5a"/><path d="M11 25 Q20 20 29 25 L25 25 L25 30 L15 30 L15 25 Z" fill="#2f7a5a"/><path d="M20 9 V14" stroke="#e8b84a" stroke-width="2"/>`;
  return `<svg class="dcCrest" width="${size}" height="${size}" viewBox="0 0 40 41" aria-hidden="true">${body}</svg>`;
}
