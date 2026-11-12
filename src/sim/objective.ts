import type { Hell } from './hell';
import { Z_KINGDOM, zoneAgeText, zoneThe } from '../world/hell';
import { tr, nplural } from '../i18n';

/**
 * Le prochain objectif dans les Enfers : ce que le joueur doit abattre pour ouvrir la zone suivante. Le jeu en tire le marqueur
 * (flèche ou anneau, avec la distance), le bouton « Centrer » et la phrase de la frise du front
 */
export interface HellGoal {
  /** avant-poste (sur le chemin), forteresse (ferme la zone), citadelle du royaume, zone fermée par l'âge, ou tout est fini */
  kind: 'outpost' | 'fortress' | 'kingdom' | 'locked' | 'done';
  /** la zone à conquérir */
  zone: number;
  /** où regarder (absent : zone fermée par l'âge, ou fini) */
  x?: number;
  z?: number;
}

/**
 * L'objectif vu depuis `from` (le centre des troupes, ou le portail) : la zone à conquérir est la première non conquise ; on vise
 * l'avant-poste d'entrée tant qu'il tient et qu'il est bien plus près que la forteresse, sinon la forteresse (le royaume : sa citadelle)
 */
export function nextGoal(h: Hell, from: [number, number]): HellGoal {
  if (h.victory) return { kind: 'done', zone: Z_KINGDOM };
  const zone = h.conquestFrontier;
  // l'âge du village n'ouvre pas encore cette zone : rien à viser
  if (h.gate && zone > h.frontier) return { kind: 'locked', zone };
  const at = (b: { site: { x: number; z: number } }) => Math.hypot(b.site.x - from[0], b.site.z - from[1]);
  const here = h.standing(zone).filter((b) => b.side === 'hell');
  const main = here.find((b) => b.kind === 'fortress' || b.kind === 'kingdom');
  const posts = here.filter((b) => b.kind === 'outpost').sort((a, b) => at(a) - at(b));
  if (posts.length && (!main || at(posts[0]) + 5 < at(main))) return { kind: 'outpost', zone, x: posts[0].site.x, z: posts[0].site.z };
  if (main) return { kind: main.kind === 'kingdom' ? 'kingdom' : 'fortress', zone, x: main.site.x, z: main.site.z };
  return { kind: 'done', zone };
}

/** « Objectif : abattre la forteresse (à 24 cases) » : une phrase courte */
export function goalLine(g: HellGoal, dist: number | null): string {
  const d = dist === null ? '' : ` ${tr('(à {n})', { n: nplural(Math.max(1, Math.round(dist)), 'case', 'cases') })}`;
  switch (g.kind) {
    case 'outpost': return `${tr('Objectif : abattre l’avant-poste')}${d}`;
    case 'fortress': return `${tr('Objectif : abattre la forteresse')}${d}`;
    case 'kingdom': return `${tr('Objectif : abattre la citadelle du royaume')}${d}`;
    case 'locked': return tr('Zone suivante fermée : il faut {age}', { age: zoneAgeText(g.zone) });
    default: return tr('Les Enfers sont vaincus');
  }
}

/** Le nom de la zone visée avec son article (pour les infobulles) */
export const goalZone = (g: HellGoal) => zoneThe(g.zone);
