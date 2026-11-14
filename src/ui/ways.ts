import { tr } from '../i18n';
import { wayBadge, type Way, type WayBadge, type WayState } from '../sim/crossroads';
import { hudPic } from './pics';

/** Ce que dit chaque voie : son illustration, son nom, une phrase d'envie, ce qu'elle ouvre */
const WAYS: Record<Way, { img: string; icon: string; title: string; pitch: string; gives: string[] }> = {
  hell: {
    img: './ui/portail.webp', icon: 'militaire', title: 'Les Enfers',
    pitch: 'Derrière l’arche noire de l’île au large, des démons attendent. Tiendrez-vous l’île, puis oserez-vous passer de l’autre côté ?',
    gives: ['Une invasion en trois vagues', 'Les Enfers et leur roi'],
  },
  world: {
    img: './expeditions/dio-caravel.webp', icon: 'boussole', title: 'Explorer le monde',
    pitch: 'Au-delà de l’horizon, deux grandes îles et leurs peuples, rivaux depuis toujours. Allez à leur rencontre.',
    gives: ['Deux îles et leurs villes', 'Une alliance, de l’or, un conflit'],
  },
};

/** Le pavé d'état, en haut à droite de la carte */
const BADGE: Record<WayBadge, string> = { taken: 'Voie ouverte', free: 'Disponible', soon: 'Pas encore', none: 'Pas sur cette carte' };

/**
 * L'onglet « Voies » des expéditions : les deux voies du grand choix de la fin de l'Antiquité, une carte chacune, dans
 * l'habillage parchemin et or de la carte du choix (styles « l'onglet Voies » de `hudTheme.css`) : le diorama qui déborde en
 * haut, le nom, une phrase d'envie, ce qu'elle ouvre, et son état. Disponible, elle a son bouton (la voie non prise, ou les
 * deux après « Ni l'un ni l'autre ») ; ouverte, elle le dit ; avant le grand choix, « pas encore » ; impossible sur la carte,
 * grisée. Rien ne mène ici (ni message ni bulle) : le joueur le découvre en ouvrant les expéditions
 */
export function waysHtml(ways: { hell: WayState; world: WayState }, soon = false) {
  const card = (way: Way) => {
    const st = ways[way], b = wayBadge(st, soon), d = WAYS[way];
    const label = way === 'hell' ? (st === 'ask' ? tr('Rouvrir le portail') : tr('Ouvrir le portail')) : tr('Explorer le monde');
    const foot = b === 'free' ? `<button class="wyGo" data-way="${way}">${hudPic(d.icon, 26)}<span>${label}</span></button>`
      : `<p class="wyNote">${b === 'taken' ? tr(way === 'hell' ? 'Le portail est ouvert : les démons vous attendent sur l’île.' : 'Le monde s’est agrandi : les deux îles sont là, au large.')
        : b === 'soon' ? tr('Elle s’ouvrira à la fin de l’Antiquité.') : tr(way === 'hell' ? 'Cette carte n’a pas d’île du portail.' : 'Ce monde ne peut plus s’agrandir.')}</p>`;
    return `<article class="wayCard ${way} st-${b}" data-wayc="${way}">
      <div class="wyArt"><img src="${d.img}" alt="" draggable="false" loading="lazy" decoding="async"></div>
      <span class="wyState">${b === 'taken' ? '✓ ' : ''}${tr(BADGE[b])}</span>
      <h4>${tr(d.title)}</h4>
      <p class="wyPitch">${tr(d.pitch)}</p>
      <ul class="wyGives">${d.gives.map((g) => `<li>${tr(g)}</li>`).join('')}</ul>
      ${foot}
    </article>`;
  };
  return `<div class="waysBox"><p class="wyLead">${tr('Deux grandes voies, à prendre quand vous voulez : l’une, l’autre ou les deux.')}</p><div class="wayCards">${card('hell')}${card('world')}</div></div>`;
}
