/**
 * Profil en long du tablier d'un petit pont : plat au-dessus de l'eau (et un peu sur les rives), rampes douces jusqu'au pied
 * du chemin aux deux bouts, jamais sous le sol.
 * `S` : abscisses (longueur cumulée) des points de l'axe ; `wet` : le point est au-dessus de l'eau ; `ground` : hauteur du sol
 * sous chaque point ; `deckY` : hauteur voulue du tablier ; `y0`, `y1` : hauteur des deux pieds de rampe.
 * Renvoie les hauteurs et l'intervalle [a, b] (en abscisse) du tablier plat, vide (a > b) s'il n'y a pas d'eau.
 */
export function deckProfile(S: number[], wet: boolean[], ground: number[], deckY: number, y0: number, y1: number): { y: number[]; a: number; b: number; deck: number } {
  const n = S.length, iw = wet.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  if (!iw.length) return { y: ground.map((g) => g + 0.03), a: 1, b: 0, deck: deckY };
  const a = Math.max(0, S[iw[0]] - 0.12), b = Math.min(S[n - 1], S[iw[iw.length - 1]] + 0.12);
  // le tablier ne passe jamais sous le sol (ruisseau dont la rive est plus haute que l'eau)
  let dk = deckY;
  for (let i = 0; i < n; i++) if (S[i] >= a && S[i] <= b) dk = Math.max(dk, ground[i] + 0.03);
  const sm = (t: number) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
  const y = S.map((s, i) => {
    if (s >= a && s <= b) return dk;
    let v: number;
    if (s < a) { const t = sm(s / a); v = dk * t + y0 * (1 - t); } else { const t = sm((s - b) / Math.max(0.001, S[n - 1] - b)); v = dk * (1 - t) + y1 * t; }
    return Math.max(v, ground[i] + 0.03);
  });
  return { y, a, b, deck: dk };
}
