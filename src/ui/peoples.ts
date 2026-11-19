import { tr } from '../i18n';
import { hudPic, pic } from './pics';
import { crest } from './diploChoice';
import { isleName, peopleName } from '../sim/diplomacy';
import { MOOD_NAMES, type Gesture, type PeopleCard, type PeoplesView } from '../sim/peoples';
import type { People } from '../world/archipelago';

/**
 * Le corps du panneau « Peuples » (fenêtre ouverte par le bouton rond `#bPeoples` de la barre du haut, `UI.openPeoples`) :
 * une fiche par peuple côte à côte, dans l'habillage parchemin et or. Les gestes portent leur rang (`data-g`, « 0:2 » : la
 * fiche 0, le geste 2) ; `UI` les mène où il faut. Sans archipel : deux blasons voilés et comment rencontrer ces peuples
 */
export function peoplesHtml(v: PeoplesView): string {
  if (!v.open) {
    const veil = `<article class="ppCard veil"><header><span class="ppCrest">${crest('orient', 64)}<i>?</i></span><div><h4>${tr('Un peuple inconnu')}</h4><small>${tr('Quelque part au large')}</small></div></header></article>`;
    return `<p class="ppLead">${v.hint ?? ''}</p><div class="ppCards">${veil}${veil.replace('orient', 'asie')}</div>`;
  }
  const lead = v.cards.some((c) => c.role === 'free')
    ? tr('Les Sablais et les Jadéens se font la guerre. Choisissez votre allié : le reste en découle.')
    : tr('Vos voisins de l’archipel, ce qu’ils pensent de vous, et ce que vous pouvez faire avec eux.');
  return `<p class="ppLead">${lead}</p><div class="ppCards">${v.cards.map((c, i) => cardHtml(c, i)).join('')}</div>`;
}

const ROLE = { free: 'À rencontrer', ally: 'Votre allié', rival: 'Leur ennemi' } as const;
const GESTURE_PIC: Record<Gesture['id'], string> = { ally: 'equipe', trade: '💰', visit: 'boussole', scouts: 'longue-vue', peace: 'parchemin', war: 'militaire' };
const MOOD_PIC = ['inquiet', 'inquiet', 'neutre', 'content', 'content'];

function cardHtml(c: PeopleCard, i: number) {
  const dots = [0, 1, 2, 3, 4].map((k) => `<i class="${k <= c.mood ? 'on' : ''}"></i>`).join('');
  const acts = c.gestures.map((g, k) => {
    const cls = g.done ? 'done' : g.on ? 'on' : 'off';
    const mark = g.done ? '<span class="ppTick">✓</span>' : !g.on ? hudPic('cadenas', 16, 'ppLock') : '';
    return `<button class="ppAct ${cls}" data-g="${i}:${k}"${g.on ? '' : ' disabled'}>${g.id === 'trade' ? pic(GESTURE_PIC[g.id], 28) : hudPic(GESTURE_PIC[g.id], 28)}<span><b>${g.label}</b>${g.why ? `<small>${g.why}</small>` : ''}</span>${mark}</button>`;
  }).join('');
  return `<article class="ppCard ${c.role}">
    <header><span class="ppCrest">${crest(c.people, 64)}</span><div><h4>${cap(peopleName(c.people))}</h4><small>${cap(isleName(c.people))} · ${ways(c.people)}</small></div><span class="ppRole">${tr(ROLE[c.role])}</span></header>
    <div class="ppMood m${c.mood}">${hudPic(MOOD_PIC[c.mood], 26)}<div><span class="ppGauge">${dots}</span><b>${tr(MOOD_NAMES[c.mood])}</b><small>${c.moodWhy}</small></div></div>
    <div class="ppStatus ${c.tone}">${c.status}</div>
    <div class="ppActs">${acts}</div>
  </article>`;
}

/** Leurs mœurs, en quelques mots (comme sur la carte du choix de l'allié) */
const ways = (p: People) => (p === 'orient' ? tr('marchands et navigateurs') : tr('artisans et jardiniers'));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
