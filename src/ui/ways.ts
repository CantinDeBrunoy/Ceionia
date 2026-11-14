import { tr } from '../i18n';
import type { Way, WayState } from '../sim/crossroads';
import { pic } from './pics';

/**
 * L'onglet « Voies » des expéditions : les deux voies du grand choix de la fin de l'Antiquité, en cartes comme les missions.
 * Celle qui reste à prendre a son bouton (la voie non prise, ou les deux après « Ni l'un ni l'autre ») ; celle qui est prise
 * le dit. Rien ne mène ici (ni message ni bulle) : le joueur le découvre en ouvrant les expéditions
 */
export function waysHtml(ways: { hell: WayState; world: WayState }) {
  const card = (way: Way) => {
    const st = ways[way], hell = way === 'hell', taken = st === 'taken';
    if (st === 'none') return '';
    const text = hell
      ? st === 'ask' ? tr('Le portail de l’île au large est ouvert, mais vous n’affrontez pas ses démons.') : taken ? tr('Le portail est ouvert : défendez son île contre les démons, puis passez dans les Enfers.') : tr('Au large, une île porte une arche de pierre noire. Ouvrez le portail : des démons rôdent de l’autre côté.')
      : taken ? tr('Le monde s’est agrandi : deux grandes îles et leurs peuples, au-delà de l’horizon.') : tr('Au-delà de l’horizon, d’autres îles et d’autres peuples. La carte s’agrandit, votre île reste telle quelle.');
    const label = hell ? (st === 'ask' ? tr('Affronter les démons') : tr('Ouvrir le portail')) : tr('Explorer le monde');
    return `<div class="mission way${taken ? ' done' : ''}" data-wayc="${way}">
      <div class="mart ${hell ? 'river' : 'sea'} dio"><img class="dioImg" src="./expeditions/dio-${hell ? 'portal' : 'caravel'}.webp" alt="" loading="lazy" decoding="async"></div>
      <div class="mbody">
        <div class="mhead"><b class="mbadge">${pic(hell ? '🌀' : '🧭', 30)}</b><div class="grow"><h4>${hell ? tr('Les Enfers') : tr('Explorer le monde')}</h4><small>${tr('Facultatif')}${taken ? ` · ✓ ${tr('voie prise')}` : ''}</small></div></div>
        <p class="mtext">${text}</p>
        ${taken ? '' : `<button class="sendBtn" data-way="${way}">${pic(hell ? '🌀' : '🧭', 17)} ${label}</button>`}
      </div></div>`;
  };
  return `<p class="hint waysHint">${tr('Deux grandes voies, à prendre quand vous voulez, l’une, l’autre ou les deux.')}</p><div class="missions">${card('hell')}${card('world')}</div>`;
}
