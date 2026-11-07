/**
 * Qualité graphique : les réglages effectifs d'un niveau de qualité, et le contrôleur du réglage « Auto » qui baisse par
 * paliers (finesse de l'image, ombres, distance d'affichage des bêtes et des arbres détaillés, halo, brume) quand les images
 * traînent, et remonte doucement quand tout est stable. Logique pure (pas de three.js) : testable
 */

export type Preset = 'high' | 'medium' | 'low';

/** Réglages graphiques effectifs */
export interface GfxParams {
  /** finesse de l'image : pixels par point d'écran, au plus (plafonnée ensuite par l'écran) */
  pixelRatio: number;
  /** carte des ombres (texels de côté) */
  shadowSize: number;
  /** la carte des ombres ne se refait qu'une image sur `shadowEvery` quand la vue ne bouge pas */
  shadowEvery: number;
  /** part de la distance de base à laquelle les bêtes articulées restent affichées et animées à chaque image */
  faunaDetail: number;
  /** distance à partir de laquelle les arbres passent en version simplifiée */
  vegLod: number;
  /** halo lumineux de nuit (bloom) */
  glow: boolean;
  /** brume */
  mist: boolean;
  /** densité des particules (fumées, embruns…) */
  density: number;
}

/** Réglages de chaque niveau choisi à la main */
export const PRESETS: Record<Preset, GfxParams> = {
  high: { pixelRatio: 1.5, shadowSize: 2048, shadowEvery: 2, faunaDetail: 1, vegLod: 48, glow: true, mist: true, density: 1 },
  medium: { pixelRatio: 1.25, shadowSize: 1536, shadowEvery: 2, faunaDetail: 0.8, vegLod: 40, glow: false, mist: true, density: 0.7 },
  low: { pixelRatio: 1, shadowSize: 1024, shadowEvery: 3, faunaDetail: 0.6, vegLod: 32, glow: false, mist: false, density: 0.35 },
};

/** Paliers du réglage « Auto » : chacun rogne un peu plus, du plus discret (l'image un peu moins fine) au plus visible */
export const MAX_LEVEL = 6;

/** Réglages effectifs au palier `level` (0 : le préréglage tel quel) partant du préréglage `base` */
export function paramsAt(base: Preset, level: number): GfxParams {
  const p = { ...PRESETS[base] };
  const L = Math.max(0, Math.min(MAX_LEVEL, Math.round(level)));
  if (L >= 1) p.pixelRatio *= 0.9;
  if (L >= 2) { p.pixelRatio = PRESETS[base].pixelRatio * 0.8; p.shadowEvery = Math.max(p.shadowEvery, 3); p.glow = false; }
  if (L >= 3) { p.pixelRatio = PRESETS[base].pixelRatio * 0.72; p.shadowSize = Math.max(1024, p.shadowSize / 2); p.faunaDetail *= 0.85; }
  if (L >= 4) { p.pixelRatio = PRESETS[base].pixelRatio * 0.65; p.faunaDetail = PRESETS[base].faunaDetail * 0.7; p.vegLod *= 0.8; p.mist = false; p.density = Math.min(p.density, 0.5); }
  if (L >= 5) { p.pixelRatio = PRESETS[base].pixelRatio * 0.58; p.shadowSize = 1024; p.shadowEvery = 4; p.faunaDetail = PRESETS[base].faunaDetail * 0.6; p.vegLod = PRESETS[base].vegLod * 0.7; p.density = 0.35; }
  if (L >= 6) { p.pixelRatio = Math.max(0.5, PRESETS[base].pixelRatio * 0.5); p.shadowSize = 768; p.faunaDetail = PRESETS[base].faunaDetail * 0.5; p.vegLod = PRESETS[base].vegLod * 0.6; }
  // la finesse ne descend jamais sous un demi-pixel par point : au-delà, l'image devient une bouillie
  p.pixelRatio = Math.max(0.5, Math.round(p.pixelRatio * 100) / 100);
  return p;
}

/**
 * Contrôleur du réglage « Auto » : une moyenne glissante du temps d'image ; au-dessus de `slowMs` pendant `patience`
 * secondes, on descend d'un palier (puis on attend un peu avant d'en redescendre un) ; sous `fastMs` pendant longtemps, on
 * remonte d'un palier. Un palier remonté qui fait aussitôt traîner les images n'est plus retenté qu'après une attente
 * doublée : pas de va-et-vient visible
 */
export class AdaptiveQuality {
  level = 0;
  /** moyenne glissante du temps d'image (ms) */
  avg = 16;
  private slowFor = 0;
  private fastFor = 0;
  private cooldown = 0;
  /** secondes de calme qu'il faut avant de remonter d'un palier (doublées à chaque remontée qui a dû être reprise) */
  private calmNeeded: number;
  /** la dernière remontée (secondes depuis) : si l'on redescend aussitôt, la remontée était prématurée */
  private sinceUp = Infinity;

  constructor(readonly max = MAX_LEVEL, readonly slowMs = 28, readonly fastMs = 15, readonly patience = 2, calm = 10) {
    this.calmNeeded = calm;
  }

  /** Une image de `ms` : renvoie le nouveau palier si l'on vient d'en changer, sinon -1 */
  step(ms: number): number {
    // un à-coup isolé (pose d'un bâtiment, chargement) ne compte pas comme une lenteur durable
    const m = Math.min(ms, 100), dt = m / 1000;
    this.avg += (m - this.avg) * 0.06;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.sinceUp += dt;
    // le temps de repos après un changement de palier ne compte ni comme lenteur ni comme calme : on juge le nouveau palier
    if (this.cooldown > 0) { this.slowFor = 0; this.fastFor = 0; }
    else if (this.avg > this.slowMs) { this.slowFor += dt; this.fastFor = 0; }
    else if (this.avg < this.fastMs) { this.fastFor += dt; this.slowFor = 0; }
    else { this.slowFor = 0; this.fastFor = 0; }
    if (this.slowFor >= this.patience && this.cooldown <= 0 && this.level < this.max) {
      this.level++;
      this.slowFor = 0;
      this.cooldown = 3;
      // on avait remonté il y a peu : la machine n'en veut pas, on attendra deux fois plus avant de réessayer
      if (this.sinceUp < 20) this.calmNeeded = Math.min(120, this.calmNeeded * 2);
      return this.level;
    }
    if (this.fastFor >= this.calmNeeded && this.cooldown <= 0 && this.level > 0) {
      this.level--;
      this.fastFor = 0;
      this.cooldown = 5;
      this.sinceUp = 0;
      return this.level;
    }
    return -1;
  }
}
