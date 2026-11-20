import { tr } from '../i18n';
import { KINDS, Building, sizeOf } from '../build/catalog';
import type { NeedId } from '../sim/sim';
import { citizenName, citizenWish, familyName, jobText, WishCtx } from '../sim/citizens';
import { folkTraits } from '../render/folk';
import { hash2 } from '../core/rng';
import { ic } from './icons';
import type { UIHost } from './ui';

/**
 * La fiche d'un habitant choisi d'un clic (dans la même carte que celle d'un bâtiment, `#selCard`) : son visage, son nom, sa
 * maison et sa famille, son métier, ce qu'il fait, et une phrase sur ce qui lui manque, tirée des vrais besoins du village
 * (voir `citizenWish`) ; les boutons « Suivre » et « Sa maison »
 */

/** Habits du portrait, par âge (les tons des passants) */
const CLOTH = [
  [0xb98a5e, 0xa07850, 0xc9a070], [0xf1e6d0, 0x9ec4d6, 0xe8b4a8], [0xc86a5a, 0x6f9f78, 0x8c7fb8, 0xd8b45a],
  [0x6f7a8a, 0x8a6f5f, 0x5f7f95, 0xb08a6a], [0xf09ab0, 0x7fc4e8, 0xf5d36a, 0x9fd49a], [0xe8ecf2, 0x9fe8f0, 0xd8c8f4, 0xa8f0d0],
];
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Le visage de l'habitant : épaules dans l'habit de son époque, cou, tête de sa peau, cheveux (longs pour une femme) */
export function portrait(id: number, age: number, child: boolean): string {
  const t = folkTraits(id, child), pal = CLOTH[Math.max(0, Math.min(5, age))], cloth = hex(pal[Math.floor(hash2(id, 1, 7) * pal.length)]);
  const skin = hex(t.skin), hair = hex(t.hair), r = child ? 11 : 13, cy = child ? 30 : 27;
  const long = t.woman ? `<path d="M${32 - r - 2} ${cy}c0-10 5-${r + 3} ${r + 2}-${r + 3}s${r + 2} ${r - 7} ${r + 2} ${r + 3}v${r + 6}h-${2 * r + 4}z" fill="${hair}"/>` : '';
  const top = t.woman ? `<path d="M${32 - r} ${cy - 2}c1-8 6-${r - 1} ${r}-${r - 1}s${r - 1} ${r - 9} ${r} ${r - 1}c-5-3-11-4-${2 * r}-0z" fill="${hair}"/>`
    : t.old ? `<path d="M${32 - r} ${cy}c-1-4 2-6 4-6M${32 + r} ${cy}c1-4-2-6-4-6" stroke="${hair}" stroke-width="3" fill="none"/>`
      : `<path d="M${32 - r} ${cy - 1}c0-8 6-${r} ${r}-${r}s${r} ${r - 8} ${r} ${r}c-4-4-9-5-${2 * r}-0z" fill="${hair}"/>`;
  return `<svg class="face" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="31" fill="#f6e8c8"/>${long}
    <path d="M${child ? 16 : 10} 64c0-13 9-${child ? 17 : 20} 22-${child ? 17 : 20}s22 ${child ? 4 : 7} 22 ${child ? 17 : 20}z" fill="${cloth}"/>
    <rect x="28" y="${cy + r - 3}" width="8" height="7" fill="${skin}"/><circle cx="32" cy="${cy}" r="${r}" fill="${skin}"/>${top}
    <circle cx="${32 - r * 0.38}" cy="${cy + 1}" r="1.6" fill="#2a2a2e"/><circle cx="${32 + r * 0.38}" cy="${cy + 1}" r="1.6" fill="#2a2a2e"/>
    <path d="M${32 - r * 0.32} ${cy + r * 0.42}q${r * 0.32} ${r * 0.28} ${r * 0.64} 0" stroke="#7a3a2a" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;
}

/** Ce qu'il fait en ce moment, en clair */
function doing(h: UIHost, c: NonNullable<ReturnType<UIHost['agents']['citizen']>>): string {
  if (c.mission) return tr('En expédition');
  if (c.resting) return tr('Se repose chez soi, blessé');
  if (c.hidden) {
    const b = h.world.buildingAt(Math.floor(c.x), Math.floor(c.z));
    return b?.id === c.home ? tr('Chez soi') : b && b.id === c.job ? tr('Au travail, à l’intérieur') : tr('À l’intérieur d’un bâtiment');
  }
  if (c.state === 'walking') return c.urgent ? tr('Court éteindre un incendie') : c.goingHome ? tr('Rentre chez soi') : tr('En chemin');
  if (c.state === 'doing') {
    if (c.field) return tr('Aux champs');
    return tr(({ sit: 'Se repose', work: 'Au travail', cheer: 'Discute', play: 'Joue', run: 'Court', stroll: 'Se promène', box: 'S’entraîne' } as Record<string, string>)[c.act ?? ''] ?? 'Flâne');
  }
  return tr('Chez soi');
}

/** Distance (cases) de la maison au puits ou au château d'eau le plus proche ; Infinity s'il n'y en a pas */
function wellDist(h: UIHost, home: Building | undefined): number {
  if (!home) return Infinity;
  let best = Infinity;
  for (const b of h.world.buildings.values()) if (b.kind === 'well' || b.kind === 'watertower') best = Math.min(best, Math.hypot(b.x - home.x, b.z - home.z));
  return best;
}

/** Des fleurs, une fontaine, une statue, une mare ou un bassin à coraux à deux cases de la maison */
function pretty(h: UIHost, home: Building | undefined): boolean {
  if (!home) return false;
  const s = sizeOf(home);
  for (let z = home.z - 2; z < home.z + s + 2; z++) for (let x = home.x - 2; x < home.x + s + 2; x++) {
    const b = h.world.buildingAt(x, z);
    if (b && (b.kind === 'flowerbed' || b.kind === 'fountain' || b.kind === 'statue' || b.kind === 'pond' || b.kind === 'coralpool')) return true;
  }
  return false;
}

/** Les manques qui retiennent les nouveaux venus, en clair (« du travail, des soins ») */
export function missingText(list: NeedId[]): string {
  const T: Record<string, string> = { food: 'de quoi manger', water: 'de l’eau', jobs: 'du travail', health: 'des soins', joy: 'du bien-être' };
  return list.map((k) => tr(T[k])).join(', ');
}

/** La carte d'un habitant : sa clé (on ne la refait que si elle change) et son HTML ; null s'il n'est plus montré */
export function citizenCard(h: UIHost, id: number): { key: string; html: string } | null {
  const c = h.agents.citizen(id);
  if (!c) return null;
  const sim = h.sim, age = sim.age, t = folkTraits(c.id, c.child);
  const home = h.world.buildings.get(c.home), work = c.job !== null ? h.world.buildings.get(c.job) : undefined;
  const name = citizenName(c.id, c.home, age, t.woman);
  const homeName = home ? (home.kind === 'gather' ? tr('Campe sur la place du village') : KINDS[home.kind].names[Math.max(home.age, KINDS[home.kind].minAge)]) : tr('Sans toit');
  const job = c.child ? tr('Enfant') : c.hand ? tr('Cultive la terre · aux champs') : c.jobKind && work ? `${jobText(c.jobKind)} · ${KINDS[work.kind].names[Math.max(work.age, KINDS[work.kind].minAge)]}` : tr('Sans métier');
  const cov = sim.coverage, posts = cov.stations.fire.length + cov.stations.police.length > 0;
  const guarded = !!home && !cov.uncoveredFire.includes(home) && !cov.uncoveredPolice.includes(home);
  const ctx: WishCtx = {
    id: c.id, age, child: c.child, working: c.job !== null || c.hand, resting: c.resting, away: c.mission,
    food: sim.food.ok, water: sim.water.ok, jobs: sim.jobs.ok, joy: sim.joy.ok, health: sim.health.ok, room: sim.housing.ok,
    guarded, posts, wellDist: wellDist(h, home), school: sim.built('school') > 0, pretty: pretty(h, home),
    season: h.time.season, rain: h.env.rainK > 0.6, night: h.time.hour >= 20.5 || h.time.hour < 5.5,
  };
  const wish = citizenWish(ctx), now = doing(h, c), followed = h.citizenCam === c.id;
  const g = sim.growth();
  // un manque qui freine le village : on dit aussi qu'il retient les nouveaux venus
  const block = wish.tone === 'need' && g.missing.length ? `<p class="cnote">${tr('Tant qu’il manque au village {list}, personne de nouveau n’y arrive.', { list: missingText(g.missing) })}</p>`
    : wish.tone === 'need' && g.full ? `<p class="cnote">${tr('Le village est plein : il faut des maisons pour accueillir du monde.')}</p>` : '';
  const key = `cit|${c.id}|${age}|${name}|${homeName}|${job}|${now}|${wish.text}|${block}|${followed}`;
  const html = `<div class="ihead"><div class="xth">${portrait(c.id, age, c.child)}</div><div class="grow"><h4>${name}</h4><small class="xsub">${job}</small></div><button class="x" data-act="close" title="${tr('Fermer (Échap)')}" aria-label="${tr('Fermer')}">${ic('close', 16, 2)}</button></div>
    <blockquote class="cwish t-${wish.tone}">« ${wish.text} »</blockquote>${block}
    <p class="stat">${ic('house', 14, 2)} ${home && home.kind !== 'gather' ? tr('{home}, famille {family}', { home: homeName, family: familyName(c.home, age) }) : homeName}</p>
    <p class="stat">${ic('eye', 14, 2)} ${now}</p>
    <div class="acts xacts"><button data-act="follow" class="${followed ? '' : 'primary'}">${ic('eye', 16, 2)} ${tr(followed ? 'Ne plus suivre' : 'Suivre')}</button>${home ? `<button data-act="home">${ic('house', 16, 2)} ${tr('Sa maison')}</button>` : ''}</div>`;
  return { key, html };
}
