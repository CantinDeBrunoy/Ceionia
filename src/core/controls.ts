/**
 * Comment le joueur déplace la vue, choisi au premier lancement et changé dans les paramètres (Partie › Contrôles) :
 * - `mouse` : la souris au bord de l'écran fait défiler la vue, et l'outil Voir la fait glisser au clic gauche ;
 * - `keys` : les lettres ZQSD (AZERTY) ou WASD (QWERTY) la déplacent, A / E ou Q / E la tournent.
 * Les flèches, la molette et le clic droit marchent dans les deux cas. Le choix vaut pour toutes les parties de ce
 * navigateur (`ceionia.controles`), pas pour une sauvegarde.
 */
export type CamControl = 'mouse' | 'keys';
export type KbLayout = 'azerty' | 'qwerty';
export interface Controls { mode: CamControl; layout: KbLayout }

export const CONTROLS_KEY = 'ceionia.controles';

/** Le choix retenu, ou null : le joueur n'a encore rien choisi (premier lancement) */
export function loadControls(): Controls | null {
  try {
    const v = JSON.parse(localStorage.getItem(CONTROLS_KEY) ?? 'null') as Partial<Controls> | null;
    if (!v || (v.mode !== 'mouse' && v.mode !== 'keys')) return null;
    return { mode: v.mode, layout: v.layout === 'qwerty' ? 'qwerty' : 'azerty' };
  } catch { return null; }
}

export function saveControls(c: Controls) {
  try { localStorage.setItem(CONTROLS_KEY, JSON.stringify(c)); } catch { /* sans stockage : on redemandera */ }
}

/**
 * La disposition du clavier : celle que donne le navigateur (Chrome, Edge : la lettre de la touche physique W), sinon celle de
 * la langue (AZERTY en français)
 */
export function guessLayout(lang: string, map?: { get(code: string): string | undefined } | null): KbLayout {
  const w = map?.get('KeyW')?.toLowerCase();
  if (w === 'z') return 'azerty';
  if (w === 'w') return 'qwerty';
  return lang === 'fr' ? 'azerty' : 'qwerty';
}

/** Les lettres des touches de la vue dans cette disposition (le jeu lit les touches physiques : W A S D, Q E) */
export function layoutKeys(layout: KbLayout) {
  return layout === 'azerty' ? { move: ['Z', 'Q', 'S', 'D'], turn: ['A', 'E'] } : { move: ['W', 'A', 'S', 'D'], turn: ['Q', 'E'] };
}
