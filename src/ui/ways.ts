import { tr } from '../i18n';
import { wayBadge, type Way, type WayBadge, type WayState } from '../sim/crossroads';
import { hudPic } from './pics';
import type { People } from '../world/archipelago';
import { crest } from './diploChoice';
import type { StaffState } from '../sim/staff';

/**
 * La carte du conflit des deux îles dans l'onglet (archipel et allié choisi) : `free`, à régler (le bouton ouvre la carte paix
 * ou guerre, ou mène à la bataille) ; `wait`, pas encore (ce qui manque) ; `taken`, réglé (comment)
 */
export interface ConflictWay { ally: People; badge: 'free' | 'wait' | 'taken'; button?: string; note?: string }

/** Ce que dit chaque voie : son illustration, son nom, une phrase d'envie, ce qu'elle ouvre */
const WAYS: Record<Way, { img: string; icon: string; title: string; pitch: string; gives: string[] }> = {
  hell: {
    img: './ui/portail.webp', icon: 'militaire', title: 'Les Enfers',
    pitch: 'Sous la grande place, la terre gronde autour du bâton du fondateur. Derrière l’arche noire de l’île au large, des démons attendent.',
    gives: ['Une troupe et un camp au Seuil', 'Les Enfers et leur roi'],
  },
  world: {
    img: './expeditions/dio-caravel.webp', icon: 'boussole', title: 'Explorer le monde',
    pitch: 'Au-delà de l’horizon, deux grandes îles et leurs peuples, rivaux depuis toujours. Allez à leur rencontre.',
    gives: ['Deux îles et leurs villes', 'Une alliance, de l’or, un conflit'],
  },
};

/** La voie des Enfers une fois le bâton du fondateur volé (`stolen`), puis repris (`back`) */
const STAFF_WAY: Record<'stolen' | 'back', { img: string; icon: string; title: string; pitch: string; gives: string[] }> = {
  stolen: {
    img: './ui/portail.webp', icon: 'militaire', title: 'Reprendre le bâton',
    pitch: 'Les démons ont emporté le bâton du fondateur sous terre. Il est au fond des Enfers, aux mains de leur roi.',
    gives: ['Une troupe et un camp au Seuil', 'Le bâton, chez le roi démon'],
  },
  back: {
    img: './ui/portail.webp', icon: 'militaire', title: 'Les Enfers',
    pitch: 'Le roi démon est tombé et le bâton du fondateur a retrouvé sa place.',
    gives: ['Les Enfers vaincus', 'Le bâton repris'],
  },
};

/** Le pavé d'état, en haut à droite de la carte */
const BADGE: Record<WayBadge, string> = { taken: 'Choix fait', free: 'Disponible', none: 'Pas sur cette carte' };

/**
 * L'onglet « Grands choix » des expéditions (« Voies » avant le 16 nov. 2026, nom refusé par l'auteur) : les deux voies du
 * grand choix de la fin de l'Antiquité, une carte chacune sur toute la hauteur de la fenêtre, dans l'habillage parchemin et or
 * de la carte du choix (styles « l'onglet Grands choix » de `hudTheme.css`) : le diorama en tête, le nom, une phrase d'envie,
 * ce qu'elle ouvre, et son état ; le bouton ou l'état calé en bas. Disponible, elle a son bouton (la voie non prise, ou les
 * deux après « Ni l'un ni l'autre ») ; ouverte, elle le dit ; impossible sur la carte, grisée. L'onglet n'existe qu'une fois
 * le grand choix fait (`waysTabShown`). Rien ne mène ici (ni message ni bulle) : le joueur le découvre en ouvrant les expéditions
 */
export function waysHtml(ways: { hell: WayState; world: WayState }, conflict: ConflictWay | null = null, staff: StaffState = 'home') {
  const card = (way: Way) => {
    // (le bâton du fondateur volé : la voie des Enfers devient « Reprendre le bâton », voir `docs/lore-enfers.md`)
    const st = ways[way], b = wayBadge(st), d = way === 'hell' && staff !== 'home' ? STAFF_WAY[staff] : WAYS[way];
    const label = way === 'hell' ? (st === 'ask' ? tr('Rouvrir le portail') : tr('Ouvrir le portail')) : tr('Explorer le monde');
    const go = b === 'free' ? `<button class="wyGo" data-way="${way}">${hudPic(d.icon, 26)}<span>${label}</span></button>`
      : `<p class="wyNote">${b === 'taken' ? tr(way === 'hell' ? 'Le portail est ouvert : vos troupes vous attendent dans les Enfers.' : 'Le monde s’est agrandi : les deux îles sont là, au large.')
        : tr(way === 'hell' ? 'Cette carte n’a pas d’île du portail.' : 'Ce monde ne peut plus s’agrandir.')}</p>${way === 'hell' && b === 'taken' && staff === 'back' ? `<p class="wyNote">${tr('Le bâton du fondateur est revenu sur la place du village.')}</p>` : ''}${b === 'taken'
        ? `<button class="wyReplay" data-replay="${way}" title="${tr('Revoir le film de ce choix')}">▶ ${tr('Revoir la cinématique')}</button>` : ''}`;
    return `<article class="wayCard ${way} st-${b}" data-wayc="${way}">
      <div class="wyArt"><img src="${d.img}" alt="" draggable="false" loading="lazy" decoding="async"></div>
      <span class="wyState">${b === 'taken' ? '✓ ' : ''}${tr(BADGE[b])}</span>
      <h4>${tr(d.title)}</h4>
      <p class="wyPitch">${tr(d.pitch)}</p>
      <ul class="wyGives">${d.gives.map((g) => `<li>${tr(g)}</li>`).join('')}</ul>
      <div class="wyFoot">${go}</div>
    </article>`;
  };
  // (le conflit des deux îles, une fois l'allié choisi : le blason des deux peuples en tête, la même tenue que les voies)
  const war = conflict ? `<article class="wayCard conflict st-${conflict.badge === 'wait' ? 'none' : conflict.badge}" data-wayc="conflict">
      <div class="wyArt wyCrests">${crest(conflict.ally, 96)}<span class="dcVs">⚔</span>${crest(conflict.ally === 'orient' ? 'asie' : 'orient', 96)}</div>
      <span class="wyState">${conflict.badge === 'taken' ? '✓ ' : ''}${tr(conflict.badge === 'taken' ? 'Choix fait' : conflict.badge === 'free' ? 'Disponible' : 'Pas encore')}</span>
      <h4>${tr('Le conflit des deux îles')}</h4>
      <p class="wyPitch">${tr('La paix par des pourparlers, ou la guerre aux côtés de notre allié, en trois chapitres du Médiéval au Moderne. Chacun est une condition du passage à l’âge suivant.')}</p>
      <ul class="wyGives"><li>${tr('Paix : un comptoir, une fête, un monument')}</li><li>${tr('Guerre : une bataille, butin et tribut d’or')}</li></ul>
      <div class="wyFoot">${conflict.button ? `<button class="wyGo" data-conflict="1">${hudPic('militaire', 26)}<span>${conflict.button}</span></button>` : `<p class="wyNote">${conflict.note ?? ''}</p>`}</div>
    </article>` : '';
  return `<div class="waysBox"><p class="wyLead">${tr('Deux grands choix, à faire quand vous voulez : l’un, l’autre ou les deux.')}</p><div class="wayCards${war ? ' three' : ''}">${card('hell')}${card('world')}${war}</div></div>`;
}
