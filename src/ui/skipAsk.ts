import { tr } from '../i18n';

/**
 * Passer une cinématique en deux temps (retour de l'auteur, 26 nov. 2026 : un clic de trop la coupait pour de bon). Le
 * premier appui (clic, Échap, Espace) demande : le bouton « Passer » devient « Vraiment passer ? » pendant `SKIP_ASK`
 * secondes. Un second appui dans ce délai passe. Un appui à moins de `SKIP_SAME` du premier est le même geste (le
 * `pointerdown` du fond puis le `click` du bouton, un double-clic) : il ne confirme pas
 */
export const SKIP_ASK = 4, SKIP_SAME = 0.3;

/** La règle seule, sans page : `press(maintenant en s)` rend « go » (passer), « ask » (demander) ou « same » (même geste) */
export class SkipGate {
  private at = -Infinity;
  press(now: number): 'go' | 'ask' | 'same' {
    const d = now - this.at;
    if (d < SKIP_SAME) return 'same';
    if (d <= SKIP_ASK) { this.at = -Infinity; return 'go'; }
    this.at = now;
    return 'ask';
  }
}

/**
 * Branche la règle sur le bouton « Passer » d'une cinématique (`.kc-skip`, `.tc-skip` ou `.skip` dans `root`) : la
 * fonction rendue s'appelle à chaque appui, et appelle `go` au second
 */
export function skipAsk(root: HTMLElement, go: () => void): () => void {
  const gate = new SkipGate();
  const btn = root.querySelector<HTMLElement>('.kc-skip, .tc-skip, .skip');
  const label = btn?.innerHTML ?? '';
  let timer = 0;
  const calm = () => { clearTimeout(timer); timer = 0; if (btn) { btn.innerHTML = label; btn.classList.remove('ask'); btn.removeAttribute('title'); } };
  return () => {
    const r = gate.press(performance.now() / 1000);
    if (r === 'go') { calm(); go(); return; }
    if (r === 'same' || !btn) return;
    clearTimeout(timer);
    btn.textContent = tr('Vraiment passer ?');
    btn.title = tr('Voulez-vous vraiment passer la cinématique ? Cliquez encore pour confirmer.');
    btn.classList.add('ask');
    timer = window.setTimeout(calm, SKIP_ASK * 1000);
  };
}
