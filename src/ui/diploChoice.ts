import { tr } from '../i18n';
import { hudPic, pic } from './pics';
import type { People } from '../world/archipelago';
import { DiploState, Path, isleName, peopleName, rivalOf, talkRisk, TALK_RISK, type Intel } from '../sim/diplomacy';
import type { Road } from '../sim/diploRoad';
import type { KindId } from '../build/catalog';
import { PAY_GOLD, type NavalChoice, type NavalKind, type NavalOption } from '../sim/navalBattle';
import { MIN_FLEET } from '../sim/fleet';
import type { Scheme, Tactic3 } from '../sim/rivalBattle';
import { DELIVERIES, DELIVERY_COST, SURPRISE_CHOICES, TRIALS, type GamesStage, type SurpriseId, type TrialId, type TrialPick, type GamesEnd } from '../sim/islandGames';
import type { Victors } from '../sim/diplomacy';

/** Ce que la carte du plan de la bataille des deux îles montre : notre flotte, l'héliport, la batterie */
export interface EpicInfo { ships: number; air: boolean; battery: boolean }
/** Ce que la carte des Jeux des îles montre, à l'étape du moment */
export interface GamesView {
  stage: GamesStage; site: boolean; delivered: number; deliverWhy: string | null;
  welcome: number; share: number; hosting: boolean; pending: SurpriseId | null;
  trial: TrialId | null; chances: Record<TrialPick, number>; medals: number; ceremony: boolean; gold: number;
}

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
  private mode: 'ally' | 'path' | 'tactic' | 'battle' | 'road' | 'raid' | 'naval' | 'epic' | 'victors' | 'games' = 'ally';
  private epic: EpicInfo = { ships: 0, air: false, battery: false };
  /** la carte de choix de la bataille navale : le temps (1, 2, 3), la bataille, l'âge, les options */
  private nav: { step: 1 | 2 | 3; kind: NavalKind; age: number; options: NavalOption[] } | null = null;
  /** la sortie en cours : ce qui serait reperdu si le camp tombait */
  private stake = '';
  /** le choix tactique en cours de la bataille (1 : les remparts ; 2 : l'assaut final) */
  private step: 1 | 2 | 3 = 1;

  constructor(root: HTMLElement, private host: { diplo(): DiploState; why?(): string | null; click(): void; ally(p: People): void; path(p: Path): void; tactic?(c: string): void; battle?(): void; road?(): Road | null; mission?(id: string): void; hold?(): void; build?(k: KindId): void; sign?(): void;
    /** la bataille navale du moment (le bras de mer, le blocus, l'escorte), un choix tactique pendant, le chantier naval pour armer des navires */
    naval?(): void; navalTactic?(c: NavalChoice): void; fleet?(): void;
    /** la flotte : navires à flot (pour la carte des éclaireurs revenus) ; la bataille navale attend-elle avant le débarquement ? */
    afloat?(): number; seaFirst?(): boolean;
    /** la bataille des deux îles : le plan choisi ; la paix des vainqueurs */
    epicPlan?(s: Scheme): void; victors?(v: Victors): void;
    /** les Jeux des îles : ce qu'on montre, et un geste (livrer, ouvrir, une surprise, une épreuve, la cérémonie, la fin) */
    games?(): GamesView | null; gamesAct?(a: string, id?: string): void }) {
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
      if (b.dataset.nav) this.host.navalTactic?.(b.dataset.nav as NavalChoice);
      else if (a === 'plan' && b.dataset.id) this.host.epicPlan?.(b.dataset.id as Scheme);
      else if (a === 'victors' && b.dataset.id) this.host.victors?.(b.dataset.id as Victors);
      else if (a.startsWith('g:')) this.host.gamesAct?.(a.slice(2), b.dataset.id);
      else if (b.dataset.tac) this.host.tactic?.(b.dataset.tac);
      else if (a === 'naval') this.host.naval?.();
      else if (a === 'fleet') this.host.fleet?.();
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
  /** Un choix tactique de la bataille navale (le jeu est en pause tant qu'il attend) */
  showNaval(step: 1 | 2 | 3, kind: NavalKind, age: number, options: NavalOption[]) { this.mode = 'naval'; this.nav = { step, kind, age, options }; this.render(); this.el.style.display = ''; }
  /** Un choix tactique de la bataille de l'archipel (le jeu est en pause tant qu'il attend) */
  showTactic(step: 1 | 2 | 3, info?: EpicInfo) { this.mode = 'tactic'; this.step = step; if (info) this.epic = info; this.render(); this.el.style.display = ''; }
  /** La bataille des deux îles : le plan, avant tout (la mer vient ensuite) */
  showEpicPlan(info: EpicInfo) { this.mode = 'epic'; this.epic = info; this.render(); this.el.style.display = ''; }
  /** La guerre gagnée : « La paix des vainqueurs », reconstruire leur ville ou le tribut */
  showVictors() { this.mode = 'victors'; this.render(); this.el.style.display = ''; }
  /** Les Jeux des îles : la carte de l'étape du moment (rien à montrer : rien ne s'ouvre) */
  showGames() { if (!this.host.games?.()) return false; this.mode = 'games'; this.render(); this.el.style.display = ''; return true; }

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
    if (this.mode === 'epic' || this.mode === 'victors' || this.mode === 'games') {
      const ally = d.ally ?? 'orient';
      if (this.mode === 'epic') this.el.innerHTML = epicHtml(ally, this.epic);
      else if (this.mode === 'victors') this.el.innerHTML = victorsHtml(ally);
      else { const g = this.host.games?.(); if (g) this.el.innerHTML = gamesHtml(ally, g); }
      return;
    }
    if (this.mode === 'tactic' && this.step === 3) {
      this.el.innerHTML = rampartsHtml(d.ally ?? 'orient', this.epic);
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
    if (this.mode === 'naval' && this.nav) { this.el.innerHTML = navalHtml(this.nav, d.ally ?? 'orient'); return; }
    if (this.mode === 'battle') {
      const ally = d.ally ?? 'orient', rival = rivalOf(ally);
      // (chantier B : la bataille du bras de mer vient avant le débarquement ; sans flotte, d'abord armer des navires)
      const sea = this.host.seaFirst?.() ?? false, ships = this.host.afloat?.() ?? 0;
      const go = !sea ? choice('battle', 'pcGo', hudPic('militaire', 34), tr('Débarquer'), tr('prendre la plage et y poser un camp. Le port, la tour et la ville viendront aux âges suivants'))
        : ships >= MIN_FLEET ? choice('naval', 'pcGo', pic('⛵', 34), tr('Livrer bataille en mer'), tr('notre flotte et {ally} contre leur flotte : la mer gagnée, nos troupes débarqueront', { ally: peopleName(ally) }))
          : choice('fleet', 'pcGo', pic('⛵', 34), tr('Armer des navires de guerre'), tr('leur flotte garde la côte : il faut {m} navires au moins (le chantier naval). Nous en avons {n}', { m: MIN_FLEET, n: ships }));
      const learnt = d.intel.map((i) => `<li>${INTEL[i]()}</li>`).join('') + warBoons(d).map((l) => `<li class="dcBoon">${l}</li>`).join('');
      this.el.innerHTML = `<div class="dcCrests">${crest(ally, 64)}<span class="dcVs">⚔</span>${crest(rival, 64)}</div>
        <h4>${d.saga.sea.includes('strait') ? tr('La mer est à nous') : tr('Les éclaireurs sont de retour')}</h4>
        <p class="pcSub">${d.saga.sea.includes('strait') ? tr('Notre flotte tient le bras de mer. Nos troupes et celles de nos alliés sont prêtes à débarquer.') : tr('La côte de {isle} est reconnue. Nos troupes et celles de {ally} sont prêtes à débarquer.', { isle: isleName(rival), ally: peopleName(ally) })}</p>
        ${learnt ? `<ul class="dcIntel">${learnt}</ul>` : ''}
        <div class="pcBtns dcCol">
          ${go}
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
        ${choice('peace', 'pcGo', hudPic('parchemin', 34), tr('Négocier la paix'), tr('deux pourparlers, {r} % d’échec chacun, pour une trêve, puis la paix des îles', { r: Math.round(talkRisk(d) * 100) }), d.path === 'peace', !!why)}
        ${choice('war', 'pcNo', hudPic('militaire', 34), tr('Aider notre allié'), tr('des éclaireurs, puis une campagne en trois chapitres : butin et tribut d’or'), d.path === 'war', !!why)}
        ${boonsNote(d)}
        ${choice('later', 'pcNo dcLater', hudPic('sablier', 34), tr('Plus tard'), tr('attendre et continuer à jouer'))}
      </div>
      <small class="pcNote">${tr('Le conflit se joue en trois chapitres, un par âge du Médiéval au Moderne, chacun une condition du passage d’âge. Arrivés plus tard, on les joue à la suite. Pour y revenir : la condition « le conflit des deux îles », ou l’onglet « Grands choix » des expéditions.')}</small>`;
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
    if (s.go === 'naval') return `<button data-a="naval" class="dcStep now pcGo">${body}</button>`;
    if (s.go === 'fleet') return `<button data-a="fleet" class="dcStep now pcGo">${body}</button>`;
    if (s.go === 'build') return `<button data-a="build" data-k="${s.kind}" class="dcStep now pcGo">${body}</button>`;
    if (s.go === 'sign') return `<button data-a="sign" class="dcStep now pcGo">${body}</button>`;
    if (s.go === 'games') return `<button data-a="g:open" class="dcStep now pcGo">${body}</button>`;
    return `<button data-a="mission" data-id="${s.id}" class="dcStep now pcGo">${body}</button>`;
  };
  // les chapitres : celui de l'étape du moment est déplié (ses étapes), les autres tiennent sur une ligne (une arrivée tardive
  // en a plusieurs à rattraper : la fenêtre doit tenir sur un petit écran)
  const nowAge = r.steps.find((s) => s.state === 'now')?.age ?? r.chapters.find((c) => c.state === 'now')?.age;
  const chapter = (c: Road['chapters'][number]) => {
    const open = c.state === 'now' && c.age === nowAge;
    const head = `<div class="dcChap ${c.state}"><i aria-hidden="true">${c.state === 'done' ? '✓' : open ? '▾' : '▸'}</i><b>${c.title}</b><small>${c.sub}</small></div>`;
    if (!open) return head;
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

/** Le pavillon des pirates, en écu : noir, la tête de mort et les tibias blancs */
export function pirateCrest(size = 40) {
  const shield = 'M20 3 L35 8 V20 C35 29 28 35 20 38 C12 35 5 29 5 20 V8 Z';
  return `<svg class="dcCrest" width="${size}" height="${size}" viewBox="0 0 40 41" aria-hidden="true"><path d="${shield}" fill="#1e1c1a" stroke="#d9a955" stroke-width="2"/><path d="M12 27 L28 33 M28 27 L12 33" stroke="#efe8d8" stroke-width="2.6" stroke-linecap="round"/><circle cx="20" cy="18" r="6.5" fill="#efe8d8"/><rect x="16.5" y="21.5" width="7" height="4" rx="1" fill="#efe8d8"/><circle cx="17.6" cy="17.6" r="1.7" fill="#1e1c1a"/><circle cx="22.4" cy="17.6" r="1.7" fill="#1e1c1a"/></svg>`;
}

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

/** Ce que dit chaque choix de la bataille navale : son picto, son titre, ce qu'il fait */
const NAVAL_TEXT: Record<NavalChoice, (age: number) => [string, string, string]> = {
  line: () => [hudPic('militaire', 34), tr('En ligne de file'), tr('toute la bordée porte, mais on encaisse aussi plus')],
  crescent: () => [hudPic('route', 34), tr('En croissant'), tr('on enveloppe l’ennemi : bon contre une flotte plus petite')],
  wind: () => [hudPic('boussole', 34), tr('Profiter du vent'), tr('nous tirerons les premiers, mais la manœuvre prend du temps')],
  wide: () => [hudPic('boussole', 34), tr('Par le large'), tr('nous tirerons les premiers, mais la manœuvre prend du temps')],
  cannonade: () => [hudPic('securite', 34), tr('Canonnade à distance'), tr('lent et sûr : peu de pertes')],
  board: () => [hudPic('militaire', 34), tr('À l’abordage'), tr('rapide et risqué : un navire pris compte double')],
  contact: () => [hudPic('militaire', 34), tr('Au contact'), tr('rapide et risqué : un navire pris compte double')],
  fireship: () => [pic('🔥', 34), tr('Le brûlot'), tr('un coup décisif : deux navires ennemis en feu, mais l’un des nôtres est sacrifié')],
  torpedo: () => [hudPic('eclair', 34), tr('La torpille'), tr('un coup décisif : un navire ennemi coulé, un autre touché, mais l’un des nôtres est sacrifié')],
  pursue: () => [hudPic('militaire', 34), tr('Poursuivre'), tr('plus de navires ennemis coulés, un peu plus de dégâts chez nous')],
  return: () => [hudPic('village', 34), tr('Rentrer au port'), tr('on garde la flotte comme elle est')],
  tight: () => [hudPic('securite', 34), tr('Serrer le convoi'), tr('sûr : l’escorte couvre les marchands')],
  scout: () => [hudPic('longue-vue', 34), tr('Éclairer en avant'), tr('on voit venir les pirates : le choix suivant portera plus')],
  repel: () => [hudPic('militaire', 34), tr('Repousser'), tr('la canonnade contre les pirates')],
  lure: () => [hudPic('route', 34), tr('Leurrer'), tr('un de nos navires attire les pirates loin du convoi')],
  pay: (age) => [pic('💰', 34), tr('Payer le passage'), tr('{n} or, et aucun combat', { n: PAY_GOLD[Math.min(5, Math.max(2, age))] })],
};
const NAVAL_WHY: Record<string, () => string> = { two: () => tr('il faut au moins deux de nos navires'), gold: () => tr('pas assez d’or') };

/** La carte d'un choix de la bataille navale : le titre du temps, ce qui se passe, les options (la première en or) */
function navalHtml(n: { step: 1 | 2 | 3; kind: NavalKind; age: number; options: NavalOption[] }, ally: People) {
  const esc = n.kind === 'convoy', rival = rivalOf(ally);
  const head = n.step === 1 ? tr('L’approche') : n.step === 2 ? (esc ? tr('Les pirates attaquent') : tr('L’engagement')) : tr('La flotte rivale rompt');
  const sub = n.step === 1
    ? esc ? tr('Le convoi lève l’ancre. Des voiles noires rôdent au large. Comment l’escorter ?') : n.kind === 'blockade' ? tr('L’escadre du port de {isle} sort à notre rencontre. Dans quel ordre l’aborder ?', { isle: isleName(rival) }) : n.kind === 'isles' ? tr('Leurs vedettes et leurs batteries côtières gardent {isle}. Dans quel ordre les aborder ?', { isle: isleName(rival) }) : tr('{rival} sortent leur flotte à notre rencontre. Dans quel ordre l’aborder ?', { rival: cap(peopleName(rival)) })
    : n.step === 2 ? esc ? tr('Les pirates fondent sur le convoi. Que faire ?') : tr('Les deux lignes sont à portée de canon. Comment combattre ?')
      : tr('Leurs navires tournent la poupe. Les poursuivre, ou rentrer ?');
  const opts = n.options.map((o, i) => {
    const [icon, title, what] = NAVAL_TEXT[o.id](n.age);
    const why = o.why ? NAVAL_WHY[o.why]?.() ?? o.why : '';
    return `<button data-a="nav" data-nav="${o.id}" class="${i === 0 ? 'pcGo' : 'pcNo'}"${o.why ? ' disabled' : ''}>${icon}<span><b>${title}</b><small>${why ? `🔒 ${why}` : what}</small></span></button>`;
  }).join('');
  return `<div class="dcCrests">${crest(ally, 56)}<span class="dcVs">${esc ? '🛡' : '⚓'}</span>${esc ? pirateCrest(56) : crest(rival, 56)}</div>
    <h4>${head}</h4>
    <p class="pcSub">${sub.replace(/ ([?!:])/g, '\u00a0$1')}</p>
    <div class="pcBtns dcCol">${opts}</div>
    <small class="pcNote">${tr('La bataille attend votre choix.')}</small>`;
}

// ---------- Le Moderne : la bataille des deux îles et les Jeux des îles (chantier D) ----------

const btn = (a: string, cls: string, icon: string, title: string, sub: string, id?: string, off = false) =>
  `<button data-a="${a}"${id ? ` data-id="${id}"` : ''} class="${cls}"${off ? ' disabled' : ''}>${icon}<span><b>${title}</b><small>${sub}</small></span></button>`;
const nb = (t: string) => t.replace(/ ([?!:])/g, ' $1');

/** La carte du plan de la bataille des deux îles : débarquer en force, le siège, le coup de main ; puis la mer */
function epicHtml(ally: People, e: EpicInfo) {
  const rival = rivalOf(ally);
  const sea = e.ships >= MIN_FLEET ? tr('Ensuite la mer : nos {n} navires de guerre contre leurs vedettes et leurs batteries côtières.', { n: e.ships })
    : tr('Sans flotte ({n} navires sur {m}), la mer est à eux : leurs batteries côtières tireront sur nos troupes.', { n: e.ships, m: MIN_FLEET });
  return `<div class="dcCrests">${crest(ally, 64)}<span class="dcVs">⚔</span>${crest(rival, 64)}</div>
    <h4>${tr('La bataille des deux îles')}</h4>
    <p class="pcSub">${nb(tr('Le fort et la ville de garnison sont prêts. Il est temps de prendre {isle}. Quel plan ?', { isle: isleName(rival) }))}</p>
    <div class="pcBtns dcCol">
      ${btn('plan', 'pcGo', hudPic('militaire', 34), tr('Débarquer en force'), tr('deux plages : {ally} prend le passage à revers', { ally: peopleName(ally) }), 'force')}
      ${btn('plan', 'pcNo', pic('💥', 34), tr('Le siège'), tr('bombarder d’abord : plus long, moins de pertes'), 'siege')}
      ${btn('plan', 'pcNo', hudPic('longue-vue', 34), tr('Le coup de main'), tr('de nuit, par le col : moins d’hommes, mais la porte surprise'), 'raid')}
      ${btn('later', 'pcNo dcLater', hudPic('sablier', 34), tr('Plus tard'), tr('préparer encore la tête de pont : la bataille attendra'))}
    </div>
    <small class="pcNote">${sea}</small>`;
}

/** Le choix des remparts : l'appui aérien (l'héliport), la batterie qui pilonne (la batterie côtière), le bélier blindé */
function rampartsHtml(ally: People, e: EpicInfo) {
  const opt = (id: Tactic3, icon: string, title: string, sub: string, why: string | null, first: boolean) =>
    `<button data-a="tac" data-tac="${id}" class="${first ? 'pcGo' : 'pcNo'}"${why ? ' disabled' : ''}>${icon}<span><b>${title}</b><small>${why ? `🔒 ${why}` : sub}</small></span></button>`;
  const airWhy = e.air ? null : tr('il faut l’héliport militaire de la tête de pont'), batWhy = e.battery ? null : tr('il faut la batterie côtière de la tête de pont');
  const first = !airWhy ? 'air' : !batWhy ? 'pound' : 'armor';
  return `<div class="dcCrests">${crest(ally, 64)}<span class="dcVs">⚔</span>${crest(rivalOf(ally), 64)}</div>
    <h4>${tr('Les remparts')}</h4>
    <p class="pcSub">${nb(tr('Le passage est à nous. La porte est fermée et les casemates tirent. Comment prendre les remparts ?'))}</p>
    <div class="pcBtns dcCol">
      ${opt('air', hudPic('eclair', 34), tr('Appui aérien'), tr('nos avions bombardent les casemates, puis les défenseurs'), airWhy, first === 'air')}
      ${opt('pound', pic('💥', 34), tr('La batterie pilonne'), tr('30 secondes d’obus sur les casemates, puis sur la porte'), batWhy, first === 'pound')}
      ${opt('armor', hudPic('militaire', 34), tr('Le bélier blindé'), tr('nos blindés foncent sur la porte, qui en sort entamée'), null, first === 'armor')}
    </div>
    <small class="pcNote">${tr('La bataille attend votre choix.')}</small>`;
}

/** La dernière carte de la guerre : reconstruire leur ville, ou le tribut */
function victorsHtml(ally: People) {
  const rival = rivalOf(ally);
  return `<div class="dcCrests">${crest(ally, 64)}<span class="dcVs">🏆</span>${crest(rival, 64)}</div>
    <h4>${tr('La paix des vainqueurs')}</h4>
    <p class="pcSub">${nb(tr('{rival} ont déposé les armes. Que faire de leur ville ?', { rival: cap(peopleName(rival)) }))}</p>
    <div class="pcBtns dcCol">
      ${btn('victors', 'pcGo', hudPic('village', 34), tr('Reconstruire leur ville'), tr('elle se relève en quelques jours et devient amicale : un peu d’or chaque jour'), 'rebuild')}
      ${btn('victors', 'pcNo', pic('💰', 34), tr('Le tribut'), tr('deux fois plus d’or chaque jour, mais leur ville reste en ruine plus longtemps, et méfiante'), 'tribute')}
    </div>
    <small class="pcNote">${tr('Ce choix est définitif.')}</small>`;
}

/** Les titres des épreuves et des surprises des Jeux */
const TRIAL_NAME: Record<TrialId, () => [string, string]> = {
  regatta: () => [tr('La régate'), tr('dans le bras de mer, les voiliers des trois peuples. Nos navires de guerre comptent')],
  race: () => [tr('La course'), tr('autour du stade et par les routes de la concession. Nos transports comptent')],
  tourney: () => [tr('Le tournoi'), tr('lutte et javelot, entre les meilleurs des trois peuples. Nos soldats comptent')],
};
const PICK_TEXT: Record<TrialPick, () => [string, string]> = {
  fair: () => [tr('Le jeu d’équipe'), tr('prudent et régulier')],
  bold: () => [tr('Tout pour la victoire'), tr('plus risqué, mais la médaille d’or au bout')],
  guest: () => [tr('Laisser gagner l’invité'), tr('pas de médaille, mais l’accueil y gagne')],
};
const SURPRISE_TEXT: Record<SurpriseId, () => [string, string]> = {
  storm: () => [tr('Un orage sur le stade'), tr('Le ciel se fend au-dessus des tribunes pleines.')],
  late: () => [tr('Un pavillon en retard'), tr('Le pavillon de nos rivaux d’hier n’est pas fini, et la foule arrive.')],
  guest: () => [tr('Un visiteur de marque'), tr('Un grand voyageur d’au-delà des mers débarque pour les Jeux.')],
};
const SURPRISE_PICK: Record<string, () => [string, string]> = {
  shelter: () => [tr('Abriter la foule'), tr('des toiles sur les tribunes')],
  wait: () => [tr('Attendre qu’il passe'), tr('la foule se mouille')],
  help: () => [tr('Nos ouvriers l’aident'), tr('il sera prêt à temps')],
  open: () => [tr('Ouvrir sans lui'), tr('le pavillon suivra')],
  receive: () => [tr('Le recevoir au palais'), tr('une fête en son honneur')],
  crowd: () => [tr('Le laisser dans la foule'), tr('il verra les Jeux comme tout le monde')],
};

/** La carte des Jeux des îles, à l'étape du moment */
function gamesHtml(ally: People, g: GamesView) {
  const rival = rivalOf(ally);
  const head = `<div class="dcCrests">${crest(ally, 56)}<span class="dcVs">🏟</span>${crest(rival, 56)}</div><h4>${tr('Les Jeux des îles')}</h4>`;
  const bar = (v: number, label: string) => `<div class="dcGauge"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i><span>${label}</span></div>`;
  const foot = `<div class="dcFoot"><button data-a="later" class="dcLink">${tr('Fermer')}</button></div>`;
  if (g.stage === 'build') {
    const c = DELIVERY_COST;
    const go = !g.site ? btn('g:site', 'pcGo', pic('🏟️', 34), tr('Bâtir le site des Jeux'), tr('dans la concession de notre allié'))
      : btn('g:deliver', 'pcGo', pic('🧱', 34), tr('Livrer au chantier'), g.deliverWhy ? `🔒 ${g.deliverWhy}` : tr('{b} briques, {o} minerai, {g} or', { b: c.bricks, o: c.ore, g: c.gold }), undefined, !!g.deliverWhy);
    return `${head}<p class="pcSub">${nb(tr('La candidature est acceptée. Le chantier se livre en trois fois.'))}</p>
      ${bar(g.delivered / DELIVERIES, tr('Chantier : {n}/{m} livraisons', { n: g.delivered, m: DELIVERIES }))}
      <div class="pcBtns dcCol">${go}</div>${foot}`;
  }
  if (g.stage === 'host' && g.pending) {
    const [t, sub] = SURPRISE_TEXT[g.pending]();
    const opts = SURPRISE_CHOICES[g.pending].map((o, i) => {
      const [a, b] = SURPRISE_PICK[o.id](), cost = o.gold ? tr(' · {n} or', { n: o.gold }) : '', off = (o.gold ?? 0) > g.gold;
      return btn('g:surprise', i ? 'pcNo' : 'pcGo', pic(i ? '🙂' : '🎪', 34), a, off ? `🔒 ${tr('pas assez d’or')}` : b + cost, o.id, off);
    }).join('');
    return `${head}<p class="pcSub"><b>${t}</b> · ${nb(sub)}</p><div class="pcBtns dcCol">${opts}</div>`;
  }
  if (g.stage === 'host') {
    if (!g.hosting) return `${head}<p class="pcSub">${nb(tr('Le stade est prêt. Les visiteurs des trois peuples n’attendent que l’ouverture.'))}</p>
      <div class="pcBtns dcCol">${btn('g:host', 'pcGo', pic('🎪', 34), tr('Ouvrir les Jeux'), tr('un jour et demi d’accueil : logements, nourriture, transports'))}</div>${foot}`;
    return `${head}<p class="pcSub">${nb(tr('Les visiteurs sont là. La jauge lit le village : logements, nourriture, bien-être, transports.'))}</p>
      ${bar(g.welcome / 100, tr('Accueil : {n} sur 100', { n: g.welcome }))}${bar(g.share, tr('Le séjour : {p} %', { p: Math.round(g.share * 100) }))}${foot}`;
  }
  if (g.stage === 'trials' && g.trial) {
    const [t, sub] = TRIAL_NAME[g.trial](), n = TRIALS.indexOf(g.trial) + 1;
    const opts = (['fair', 'bold', 'guest'] as TrialPick[]).map((p, i) => {
      const [a, b] = PICK_TEXT[p]();
      return btn('g:trial', i ? 'pcNo' : 'pcGo', pic(p === 'guest' ? '🤝' : p === 'bold' ? '🥇' : '🏅', 34), a, p === 'guest' ? b : tr('{b} · {c} % de chances', { b, c: Math.round(g.chances[p] * 100) }), p);
    }).join('');
    return `${head}<p class="pcSub"><b>${tr('Épreuve {n}/{m} : {t}', { n, m: TRIALS.length, t })}</b> · ${nb(sub)}</p>
      <div class="pcBtns dcCol">${opts}</div><small class="pcNote">${tr('Médailles : {n}', { n: g.medals })}</small>`;
  }
  const end: GamesEnd[] = ['treaty', 'union'];
  if (g.stage === 'ceremony' && !g.ceremony) return `${head}<p class="pcSub">${nb(tr('Les épreuves sont jouées : {n} médailles pour nous. Reste la cérémonie de clôture.', { n: g.medals }))}</p>
    <div class="pcBtns dcCol">${btn('g:ceremony', 'pcGo', pic('🎆', 34), tr('La cérémonie de clôture'), tr('le défilé des trois flottes, les feux d’artifice, les trois drapeaux'))}</div>${foot}`;
  if (g.stage === 'ceremony') return `${head}<p class="pcSub">${nb(tr('Les deux chefs se tiennent sous les trois drapeaux. Que signeront-ils ?'))}</p>
    <div class="pcBtns dcCol">
      ${btn('g:end', 'pcGo', hudPic('parchemin', 34), tr('Le traité des îles'), tr('le commerce libre entre les trois peuples : plus d’or chaque jour'), end[0])}
      ${btn('g:end', 'pcNo', hudPic('equipe', 34), tr('L’union des îles'), tr('les trois peuples fraternels : les visites des îles toujours sûres, le centre de recherche commun double'), end[1])}
    </div><small class="pcNote">${tr('Ce choix est définitif.')}</small>`;
  return `${head}<p class="pcSub">${tr('Les Jeux des îles ont eu lieu.')}</p>${foot}`;
}
