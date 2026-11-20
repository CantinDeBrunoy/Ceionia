import { KINDS, KindId, Building } from '../build/catalog';
import { YIELD, REFINE_CRUDE, FUEL_PER_CRUDE, CAR_FUEL, Resource, Cost, costOf, costLabel, refundOf } from './economy';
import { tr } from '../i18n';
import { railBoost, allServed } from './freight';
import { perkYield } from './legacy';
import type { World } from '../world/world';

/**
 * Le livre de comptes du village : pour chaque ressource, ce que chaque sorte de bâtiment en produit et en consomme par jour,
 * et le solde. Les mêmes règles que `Expeditions.daily` (rendement par âge × gare de marchandises, raffinerie, voitures),
 * écrites ici pour l'affichage : la fiche d'une ressource, la fiche d'un bâtiment, le goulot de l'âge suivant.
 * Demande de Karim (testeur v6, stratège) : « un jeu de gestion qui ne me donne pas ses chiffres, je le joue à l'aveugle ».
 */

/** Une ligne du livre : une sorte de bâtiment, combien le village en a, et ce qu'ils font ensemble par jour */
export interface LedgerRow { kind: KindId; n: number; v: number }
export interface Ledger { prod: LedgerRow[]; use: LedgerRow[]; net: number }

/** Les ressources qu'un bâtiment produit (positif) ou consomme (négatif) par jour, sans tenir compte du stock */
export type Flow = Partial<Record<Resource, number>>;

/**
 * Ce que fait un bâtiment par jour à cet âge (`boost` : la gare de marchandises voisine, 1 sans elle). La raffinerie compte à
 * pleine capacité (le brut qu'elle peut traiter, le carburant qu'elle en tire) ; l'usine automobile brûle son carburant
 * (rien en ressources illimitées)
 */
export function flowOf(kind: KindId, age: number, boost = 1, unlimited = false): Flow {
  const out: Flow = {}, y = YIELD[kind];
  for (const r of Object.keys(y ?? {}) as Resource[]) { const v = (y![r]![age] ?? 0) * boost; if (v) out[r] = v; }
  if (kind === 'refinery') { out.crude = -REFINE_CRUDE * boost; out.fuel = REFINE_CRUDE * FUEL_PER_CRUDE * boost; }
  if (kind === 'carworks' && !unlimited) out.fuel = (out.fuel ?? 0) - CAR_FUEL;
  return out;
}

/** Ce que fait par jour ce bâtiment du village (son âge, sa gare de marchandises) */
export function flowOfBuilding(w: World, b: Building, st = allServed(w)): Flow {
  const boosted = YIELD[b.kind] || b.kind === 'refinery';
  return flowOf(b.kind, b.age, boosted ? railBoost(w, b, st) * perkYield(w, b.kind) : 1, w.unlimited);
}

/**
 * Le livre d'une ressource. Le brut que les raffineries prennent est ce qu'elles traitent vraiment (toute leur capacité tant
 * qu'il y a du brut en réserve, sinon ce que tirent les puits) ; le carburant qu'elles en tirent suit
 */
export function ledgerOf(w: World, r: Resource): Ledger {
  const st = allServed(w), prod = new Map<KindId, LedgerRow>(), use = new Map<KindId, LedgerRow>();
  const add = (m: Map<KindId, LedgerRow>, k: KindId, v: number) => { const row = m.get(k) ?? { kind: k, n: 0, v: 0 }; row.n++; row.v += v; m.set(k, row); };
  let drawn = 0, cap = 0;
  for (const b of w.buildings.values()) {
    const f = flowOfBuilding(w, b, st);
    if (b.kind === 'refinery') { cap -= f.crude ?? 0; continue; }
    if (YIELD[b.kind]?.crude) drawn += f.crude ?? 0;
    const v = f[r];
    if (v) add(v > 0 ? prod : use, b.kind, v);
  }
  // la raffinerie : ce qu'elle traite vraiment, partagé entre les raffineries selon leur capacité
  if (cap && (r === 'crude' || r === 'fuel')) {
    const done = Math.min(cap, w.crude >= 1 ? cap : drawn);
    for (const b of w.buildings.values()) {
      if (b.kind !== 'refinery') continue;
      const part = done * (-(flowOfBuilding(w, b, st).crude ?? 0) / cap);
      if (r === 'crude') add(use, b.kind, -part); else add(prod, b.kind, part * FUEL_PER_CRUDE);
    }
    // (une raffinerie à l'arrêt, sans brut, se compte quand même : on la voit dans la liste, à 0)
    const m = r === 'crude' ? use : prod;
    if (!done) for (const b of w.buildings.values()) if (b.kind === 'refinery') add(m, b.kind, 0);
  }
  const rows = (m: Map<KindId, LedgerRow>) => [...m.values()].sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const p = rows(prod), u = rows(use);
  return { prod: p, use: u, net: p.reduce((s, x) => s + x.v, 0) + u.reduce((s, x) => s + x.v, 0) };
}

/** Le bâtiment qui produit chaque matière de construction, à conseiller quand elle manque */
export const MAKER: Partial<Record<Resource, KindId>> = { wood: 'lumber', stone: 'quarry', ore: 'mine', brick: 'brickworks' };

/** Une ressource qui bloque l'âge suivant : il en faut `need` en tout, il en manque `short`, et il faudrait `days` jours */
export interface Shortage { res: Resource; need: number; short: number; rate: number; days: number }

/**
 * Le goulot de l'âge suivant : les bâtiments qui manquent encore aux conditions de l'âge, payés au prix du jour, et le minerai
 * ou les briques à mettre en réserve. Une ressource « manque » quand le stock ne suffit pas et qu'il faudrait au moins un jour
 * pour la réunir au rythme actuel (ou qu'aucun bâtiment n'en produit). La plus longue à réunir d'abord. Rien en ressources
 * illimitées ni sans conditions d'âge (bac à sable, dernier âge)
 */
export function shortages(w: World, age: number, items: { have: number; need: number; kind?: KindId; label: string }[] | null): Shortage[] {
  if (!items || w.unlimited) return [];
  const need: Partial<Record<Resource, number>> = {};
  const owned = new Map<KindId, number>();
  for (const b of w.buildings.values()) owned.set(b.kind, (owned.get(b.kind) ?? 0) + 1);
  for (const it of items) {
    const left = it.need - it.have;
    if (left <= 0) continue;
    if (it.kind) {
      // (en Normal, le premier producteur est offert : `costOf` le sait par le nombre déjà bâti)
      for (let i = 0; i < left; i++) {
        const c: Cost | null = costOf(it.kind, age, w.difficulty, (owned.get(it.kind) ?? 0) + i);
        if (!c) continue;
        need.wood = (need.wood ?? 0) + c.wood; need.stone = (need.stone ?? 0) + c.stone;
        if (c.brick) need.brick = (need.brick ?? 0) + c.brick;
      }
    } else if (it.label.includes('minerai')) need.ore = (need.ore ?? 0) + it.need;
    else if (it.label.startsWith('briques')) need.brick = (need.brick ?? 0) + it.need;
  }
  const out: Shortage[] = [];
  for (const r of Object.keys(need) as Resource[]) {
    const n = need[r]!, short = n - w[r];
    if (short <= 0) continue;
    const rate = ledgerOf(w, r).net, days = rate > 0 ? short / rate : Infinity;
    if (days >= 1) out.push({ res: r, need: n, short: Math.ceil(short), rate, days });
  }
  return out.sort((a, b) => b.days - a.days);
}

/** Ce que rapporterait un producteur de plus de cette matière à cet âge (rendement de base, sans gare) */
export const makerYield = (r: Resource, age: number) => { const k = MAKER[r]; return k ? (YIELD[k]?.[r]?.[Math.max(age, KINDS[k].minAge)] ?? 0) : 0; };

/** Nom de la ressource dans une phrase (« Le bois manque ») */
const RES_THE: Partial<Record<Resource, string>> = { wood: 'Le bois', stone: 'La pierre', ore: 'Le minerai', brick: 'Les briques' };
const RES_VERB: Partial<Record<Resource, string>> = { brick: 'manquent' };

/**
 * Le conseil d'un goulot : « Le bois manque : un « Abri de bûcheron » de plus ne coûte que 6 pierre (+8 par jour). » ; `long`
 * dit aussi combien il en faut encore et en combien de jours (la fiche de la ressource). Rien à conseiller si le producteur
 * n'est pas encore ouvert (âge, expédition)
 */
export function shortText(w: World, age: number, s: Shortage, long = false): string {
  const the = tr(RES_THE[s.res] ?? s.res), verb = tr(RES_VERB[s.res] ?? 'manque');
  const head = long
    ? (s.rate > 0 ? tr('{the} {verb} : il en faut encore {n} pour l’âge suivant, environ {d} à ce rythme.', { the, verb, n: s.short, d: days(s.days) }) : tr('{the} {verb} : il en faut encore {n} pour l’âge suivant, et rien n’en produit.', { the, verb, n: s.short }))
    : tr('{the} {verb}.', { the, verb });
  const k = MAKER[s.res];
  if (!k) return head;
  const d = KINDS[k];
  if (d.minAge > age || (d.reqMission && !w.missionDone(d.reqMission))) return head;
  let owned = 0;
  for (const b of w.buildings.values()) if (b.kind === k) owned++;
  const c = costOf(k, age, w.difficulty, owned), name = d.names[Math.max(age, d.minAge)], n = makerYield(s.res, age);
  const more = owned ? tr('Un « {name} » de plus', { name }) : tr('Un « {name} »', { name });
  return `${head} ${c ? tr('{more} ne coûte que {cost} (+{n} par jour).', { more, cost: costLabel(c), n }) : tr('{more} ne coûte rien (+{n} par jour).', { more, n })}`;
}

/** « 1 jour », « 3 jours » (arrondi au jour supérieur) */
const days = (d: number) => { const n = Math.max(1, Math.ceil(d - 0.05)); return tr(n > 1 ? '{n} jours' : '{n} jour', { n }); };

/** Ce que rendrait la démolition de ces bâtiments (somme des `refundOf`), ou null : rien à rendre */
export function refundTotal(w: World, list: Building[]): Cost | null {
  const t: Cost = { wood: 0, stone: 0 };
  for (const b of list) { const r = refundOf(w, b); if (r) { t.wood += r.wood; t.stone += r.stone; if (r.brick) t.brick = (t.brick ?? 0) + r.brick; } }
  return t.wood || t.stone || t.brick ? t : null;
}
