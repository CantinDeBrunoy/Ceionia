import { readFileSync } from 'fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { isleOrigins, zoneOrigins } from '../src/build/zones';
import { War, waveForce, clockText, invasionTroops } from '../src/sim/war';
import { DEMON_POWER, INVASION_DELAY, INVASION_WAVES, INVASION_GAP } from '../src/sim/hell';
import { TroopKind, troopStats } from '../src/sim/army';
import { sumPower } from '../src/sim/hellBalance';
import type { Difficulty } from '../src/sim/difficulty';

// (l'invasion en trois vagues, retirée du jeu, reste éprouvée ici : voir `War.waves`)
War.wavesDefault = true;
// (les essais de l'île : la garnison s'y tient, plus de passage direct aux Enfers)
War.directDefault = false;

/**
 * L'invasion du portail : annoncée une fois (tour + caserne + garnison), trois vagues de plus en plus grosses à repousser
 * avant d'ouvrir les Enfers ; ensuite, plus aucune vague
 */

beforeAll(() => setMapSize(192));

/** Une île avec ou sans ses défenses (le portail ouvert) */
const island = (towers = 1, barracks = 1, difficulty: Difficulty = 'normal') => {
  const w = new World();
  newWorld(w, 3, 2026, GEN);
  w.difficulty = difficulty;
  w.exp.done.push('portal');
  if (towers) {
    const t = isleOrigins(w, 'watchtower')[0];
    w.place('watchtower', t % N, Math.floor(t / N), 0, true, 1, false);
  }
  if (barracks) {
    const c = isleOrigins(w, 'barracks').find((k) => w.canPlace('barracks', k % N, Math.floor(k / N)) === null)!;
    w.place('barracks', c % N, Math.floor(c / N), 0, true, 1, false);
  }
  return w;
};
const enlist = (war: War, n: number, age = 1) => {
  for (let i = 0; i < n; i++) {
    const kind: TroopKind = i % 4 === 3 ? 'archer' : 'soldier', st = troopStats(kind, age);
    war.army.troops.push({ id: war.army.nextId++, kind, hp: st.hp, maxHp: st.hp, where: 'isle', heal: 0 });
  }
};
/** Une guerre dont le joueur a choisi d'affronter les démons */
const pveWar = (w: World) => { const v = new War(w); v.acceptPve(); return v; };
const tick = (war: War, s: number, until?: () => boolean) => { for (let i = 0; i < s * 10; i++) { war.update(0.1, 1); if (until?.()) return; } };
const said = (war: War, kind: string) => war.news.filter((n) => n.kind === kind).length;

describe('l’invasion : quand elle est annoncée', () => {
  it('jamais sans tour de garde, sans caserne ou sans garnison', () => {
    for (const [t, b, n] of [[0, 1, 5], [1, 0, 5], [1, 1, 0], [1, 1, 1]]) {
      const war = pveWar(island(t, b));
      enlist(war, n);
      tick(war, 20);
      expect(war.inv, `${t} tour, ${b} caserne, ${n} soldats`).toBe('wait');
      expect(said(war, 'invasion')).toBe(0);
      expect(war.nextWaveIn()).toBeNull();
    }
  });

  it('pas de vague sans choix : tout prêt, le joueur décide ; « Affronter » lance la première vague après 10 s', () => {
    const war = pveWar(island());
    enlist(war, 3);
    tick(war, 2);
    expect(war.inv).toBe('ready');
    expect(said(war, 'invasionReady')).toBe(1);
    // des minutes passent (« Se préparer d'abord » : la carte se ferme, rien ne change côté simulation) : rien ne vient
    tick(war, 200);
    expect(war.inv).toBe('ready');
    expect(war.isle!.raid).toBeNull();
    expect(war.nextWaveIn()).toBeNull();
    expect(said(war, 'invasion')).toBe(0);
    expect(said(war, 'invasionReady')).toBe(1);
    war.callWave();
    tick(war, 5);
    expect(war.isle!.raid).toBeNull();
    // le choix : le compte à rebours de 10 s, puis la grosse vague
    expect(INVASION_DELAY).toBe(10);
    expect(war.startInvasion()).toBe(true);
    expect(war.startInvasion()).toBe(false);
    expect(war.inv).toBe('coming');
    expect(said(war, 'invasion')).toBe(1);
    const left = war.nextWaveIn()!;
    expect(left).toBeGreaterThan(INVASION_DELAY - 1);
    expect(left).toBeLessThanOrEqual(INVASION_DELAY);
    // pas de nouvelle annonce pendant l'attente ; la vague annoncée est celle qui arrive
    tick(war, 3);
    expect(said(war, 'invasion')).toBe(1);
    const plan = [...war.faction!.planned!];
    tick(war, 30, () => !!war.isle!.raid);
    expect(war.inv).toBe('raid');
    expect(said(war, 'invasionStart')).toBe(1);
    expect(war.faction!.activeRaid!.units.map((u) => u.kind)).toEqual(plan);
    // la première repoussée : la deuxième dans INVASION_GAP s, celle qui est annoncée, puis la troisième
    tick(war, 200, () => war.inv !== 'raid');
    expect(war.inv).toBe('coming');
    expect(war.invStep()).toBe(2);
    expect(said(war, 'repelled')).toBe(1);
    expect(war.nextWaveIn()!).toBeGreaterThan(INVASION_GAP - 2);
    const plan2 = [...war.faction!.planned!];
    tick(war, INVASION_GAP + 2, () => !!war.isle!.raid);
    expect(war.faction!.activeRaid!.units.map((u) => u.kind)).toEqual(plan2);
    // les trois repoussées : faite, l'île sûre, et plus rien ne vient
    tick(war, 600, () => war.inv === 'done');
    expect(war.inv).toBe('done');
    expect(said(war, 'invasionStart')).toBe(INVASION_WAVES);
    expect(said(war, 'invasionDone')).toBe(1);
    expect(said(war, 'secured')).toBe(0);
    expect(war.faction!.raidsRepelled).toBe(INVASION_WAVES);
    tick(war, 600);
    expect(war.isle!.raid).toBeNull();
    expect(war.nextWaveIn()).toBeNull();
    expect(war.faction!.wave).toBe(INVASION_WAVES);
    expect(said(war, 'invasion')).toBe(1);
  }, 90000);

  it('la garnison la déclenche : à Facile, deux soldats suffisent', () => {
    expect(invasionTroops('normal')).toBe(3);
    const war = pveWar(island(1, 1, 'easy'));
    enlist(war, 2);
    tick(war, 2);
    expect(war.inv).toBe('ready');
  });

  it('défaite : elle est ré-annoncée quand la garnison est de nouveau là, sans plus', () => {
    const war = pveWar(island());
    enlist(war, 3);
    tick(war, 2);
    war.startInvasion();
    war.faction!.nextRaid = war.faction!.time;
    tick(war, 2);
    expect(war.inv).toBe('raid');
    // la garnison est balayée, la tour tombe : la vague est perdue
    for (const u of war.isle!.sim.alive('player')) u.hp = 0;
    for (const b of war.isle!.defs.values()) war.isle!.sim.damage(b, 1e6, -1);
    tick(war, 30, () => war.inv !== 'raid');
    expect(war.inv).toBe('wait');
    expect(war.hellWhy()).not.toBeNull();
  }, 60000);

  it('une vague perdue au milieu de l’invasion : elle reprend à cette vague, pas à la première', () => {
    const war = pveWar(island());
    enlist(war, 3);
    tick(war, 2);
    war.faction!.raidsRepelled = 1;
    expect(war.invStep()).toBe(2);
    war.startInvasion();
    war.faction!.nextRaid = war.faction!.time;
    tick(war, 2);
    expect(war.inv).toBe('raid');
    for (const u of war.isle!.sim.alive('player')) u.hp = 0;
    for (const b of war.isle!.defs.values()) war.isle!.sim.damage(b, 1e6, -1);
    tick(war, 30, () => war.inv !== 'raid');
    expect(war.inv).toBe('wait');
    expect(war.invStep()).toBe(2);
  }, 60000);
});

describe('les Enfers restent fermés tant que l’invasion n’est pas repoussée', () => {
  it('refusés avant (avec la phrase), permis après', () => {
    const war = pveWar(island());
    enlist(war, 3);
    tick(war, 2);
    expect(war.hellWhy()).toBe('Affrontez d’abord les démons de l’île.');
    war.startInvasion();
    expect(war.hellWhy()).toBe('Repoussez d’abord l’invasion du portail.');
    // « Envoyer aux Enfers » : personne ne passe
    war.sendThroughPortal(war.isle!.sim.alive('player'));
    expect(war.crossing.size).toBe(0);
    war.inv = 'done';
    expect(war.hellWhy()).toBeNull();
    war.sendThroughPortal(war.isle!.sim.alive('player'));
    expect(war.crossing.size).toBeGreaterThan(0);
  });

  it('sans portail ouvert (mode développeur) rien n’est refusé', () => {
    const war = new War(new World());
    expect(war.hellWhy()).toBeNull();
  });

  it('le guidage : choisir les troupes, puis les envoyer, puis plus rien dès qu’on a franchi le portail', () => {
    const war = pveWar(island());
    enlist(war, 3);
    tick(war, 2);
    expect(war.guideStep(0)).toBeNull();
    war.inv = 'done';
    expect(war.guideStep(0)).toBe('select');
    expect(war.guideStep(3)).toBe('send');
    war.visited = true;
    expect(war.guideStep(3)).toBeNull();
  });
});

describe('le PvE est un choix : « Affronter les démons » ou « Fermer le portail »', () => {
  /** Le portail vient de s'ouvrir : rien n'est choisi */
  const fresh = () => {
    const war = new War(island());
    enlist(war, 3);
    tick(war, 2);
    return war;
  };

  it('avant le choix : aucun PvE (ni annonce, ni vague, ni message qui martèle), les Enfers fermés', () => {
    const war = fresh();
    expect(war.pve).toBe('ask');
    expect(war.choiceSeen).toBe(false);
    tick(war, 300);
    expect(war.inv).toBe('wait');
    expect(said(war, 'invasionReady')).toBe(0);
    expect(war.isle!.raid).toBeNull();
    expect(war.nextWaveIn()).toBeNull();
    expect(war.hellWhy()).toBe('Le portail est refermé : rouvrez-le quand vous voulez.');
  });

  it('« Affronter » enclenche le PvE : guidage (tour, caserne, garnison), puis l’invasion prête avec son bouton', () => {
    const war = fresh();
    expect(war.acceptPve()).toBe(true);
    expect(war.acceptPve()).toBe(false);
    expect(war.choiceSeen).toBe(true);
    tick(war, 2);
    expect(war.inv).toBe('ready');
    expect(war.hellWhy()).toBe('Affrontez d’abord les démons de l’île.');
  });

  it('« Fermer » : le portail se referme, plus de vague ni de passage, mais le jeu n’est bloqué sur rien', () => {
    const war = fresh();
    expect(war.closePortal()).toBe(true);
    expect(war.closePortal()).toBe(false);
    expect(said(war, 'portalSealed')).toBe(1);
    expect(war.closed).toBe(true);
    expect(war.world.portalOpen).toBe(true);
    tick(war, 300);
    expect(war.isle!.raid).toBeNull();
    war.callWave();
    tick(war, 5);
    expect(war.isle!.raid).toBeNull();
    expect(war.hellWhy()).toBe('Le portail est refermé : rouvrez-le quand vous voulez.');
    war.sendThroughPortal(war.isle!.sim.alive('player'));
    expect(war.crossing.size).toBe(0);
    // le jeu continue : la mission du portail reste faite, l'âge ne demande rien de l'île
    expect(war.world.exp.done).toContain('portal');
  });

  it('rouvrir plus tard (« Affronter ») remet le PvE en route', () => {
    const war = fresh();
    war.closePortal();
    tick(war, 20);
    expect(war.acceptPve()).toBe(true);
    expect(war.closed).toBe(false);
    tick(war, 2);
    expect(war.inv).toBe('ready');
  });

  it('on referme à tout moment : le compte à rebours s’arrête, rouvert l’invasion est ré-annoncée à la même vague', () => {
    const war = pveWar(island());
    enlist(war, 3);
    tick(war, 2);
    war.startInvasion();
    expect(war.closePortal()).toBe(true);
    expect(war.inv).toBe('wait');
    expect(war.nextWaveIn()).toBeNull();
    tick(war, 60);
    expect(war.isle!.raid).toBeNull();
    war.acceptPve();
    tick(war, 2);
    expect(war.inv).toBe('ready');
    expect(war.invStep()).toBe(1);
  });

  it('refermer en pleine vague : les démons repartent, ni victoire ni défaite ; rouvert, on reprend à cette vague', () => {
    const war = pveWar(island());
    enlist(war, 3);
    tick(war, 2);
    war.startInvasion();
    tick(war, INVASION_DELAY + 2, () => !!war.isle!.raid);
    expect(war.inv).toBe('raid');
    const f = war.faction!, won = f.raidsRepelled, lost = f.raidsLost;
    expect(war.closePortal()).toBe(true);
    expect(war.isle!.raid).toBeNull();
    expect(war.isle!.raiders().length).toBe(0);
    expect(f.activeRaid).toBeNull();
    tick(war, 10);
    expect([f.raidsRepelled, f.raidsLost]).toEqual([won, lost]);
    expect(said(war, 'lost') + said(war, 'repelled')).toBe(0);
    war.acceptPve();
    tick(war, 2);
    expect(war.inv).toBe('ready');
    expect(war.invStep()).toBe(won + 1);
  });

  it('refermer après l’invasion : les troupes des Enfers rentrent, la base attend, les Enfers fermés ; rouvert, tout est là', () => {
    const war = pveWar(island());
    enlist(war, 3);
    war.skipInvasion();
    tick(war, 1);
    const t = war.army.troops[0];
    t.where = 'hell';
    war.army.queue.push({ kind: 'soldier', left: 500, at: 'hell', gear: [] });
    expect(war.hellPresence()).toBe(true);
    const time = war.faction!.time;
    expect(war.closePortal()).toBe(true);
    tick(war, 5);
    expect(war.army.troops.every((x) => x.where === 'isle')).toBe(true);
    expect(war.army.queue.every((r) => r.at !== 'hell')).toBe(true);
    expect(war.news.some((n) => n.text.includes('ne se referme'))).toBe(true);
    // les Enfers ne bougent plus, on n'y va plus, on n'y recrute plus
    expect(war.faction!.time).toBe(time);
    expect(war.hellPresence()).toBe(false);
    expect(war.hellWhy()).toBe('Le portail est refermé : rouvrez-le quand vous voulez.');
    expect(war.recruitHell('soldier', 1, 50)).toBe('Le portail est refermé : rouvrez-le quand vous voulez.');
    // l'invasion faite le reste : rouvert, aucune vague, les Enfers ouverts
    war.acceptPve();
    tick(war, 30);
    expect(war.inv).toBe('done');
    expect(war.isle!.raid).toBeNull();
    expect(war.hellWhy()).toBeNull();
    expect(war.faction!.time).toBeGreaterThan(time);
  });

  it('le portail éteint (royaume tombé) ne se referme pas : il n’y a plus rien à refermer', () => {
    const war = pveWar(island());
    war.skipInvasion();
    tick(war, 1);
    war.faction!.victory = true;
    expect(war.closePortal()).toBe(false);
    expect(war.pve).toBe('on');
  });

  it('une partie refermée en pleine invasion se sauvegarde et se relit (le format ne change pas)', () => {
    const war = pveWar(island());
    enlist(war, 3);
    tick(war, 2);
    war.startInvasion();
    war.closePortal();
    const s = JSON.parse(JSON.stringify(war.save())) as Record<string, unknown>;
    expect([s.pve, s.invasion, s.raid]).toEqual(['off', 'wait', null]);
    const back = new War(island());
    back.load(s);
    tick(back, 1);
    expect(back.closed).toBe(true);
    expect(back.inv).toBe('wait');
  });

  it('la sauvegarde garde le choix ; une ancienne sauvegarde sans choix : la carte une fois si rien n’est engagé, sinon PvE en cours', () => {
    const war = fresh();
    war.closePortal();
    const s = JSON.parse(JSON.stringify(war.save())) as Record<string, unknown>;
    expect(s.pve).toBe('off');
    const load = (o: Record<string, unknown>, w = island()) => { const b = new War(w); b.load(o); tick(b, 1); return b; };
    const back = load(s);
    expect(back.closed).toBe(true);
    expect(back.choiceSeen).toBe(true);
    // sans l'état neuf : le portail refermé de la version d'avant reste fermé
    expect(load({ ...s, pve: undefined, sealed: true }).pve).toBe('off');
    // portail ouvert, rien de commencé, choix jamais fait : « ask » (la carte s'ouvre une fois)
    const empty = new War(island(0, 0));
    tick(empty, 1);
    const e = load({ ...JSON.parse(JSON.stringify(empty.save())), pve: undefined, choiceSeen: undefined }, island(0, 0));
    expect(e.pve).toBe('ask');
    expect(e.choiceSeen).toBe(false);
    // une partie qui a déjà des défenses ou une invasion faite joue le PvE : rien ne change
    const played = load({ ...s, pve: undefined, sealed: undefined, invasion: 'done' });
    expect(played.pve).toBe('on');
    expect(played.hellWhy()).toBeNull();
  });
});

describe('l’interface du portail refermable', () => {
  it('le bandeau de l’île offre « Refermer » tant que le PvE est en cours ; la carte le confirme et redit qu’on peut changer d’avis', () => {
    const cmd = readFileSync('src/ui/command.ts', 'utf8'), card = readFileSync('src/ui/portalChoice.ts', 'utf8'), main = readFileSync('src/main.ts', 'utf8');
    expect(cmd).toMatch(/const shut = \(\) => w\.pve === 'on' && !w\.portalOut \? `<button data-a="pveChoice"/);
    expect(cmd).toMatch(/act \+= shut\(\)/);
    expect(main).toMatch(/if \(this\.war\.pve !== 'ask'\) this\.portalChoice\.show\(\)/);
    expect(card).toMatch(/if \(w\.pve === 'on'\) \{ this\.renderShut\(\); return; \}/);
    expect(card).toContain('Vous pourrez changer d’avis plus tard.');
    expect(card).not.toContain('ne se referme plus');
  });
});

describe('rien dans la progression ne dépend du PvE', () => {
  it('le passage d’âge, les missions et la fin de partie ne lisent ni l’invasion, ni les Enfers, ni les défenses de l’île', () => {
    const files = ['src/sim/sim.ts', 'src/sim/missions.ts', 'src/sim/expeditions.ts', 'src/ui/tutorial.ts'];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/isleSteps|isleSecured|isleGuard|raidsRepelled|war\.inv|hellWhy|isleDefenses|islandSecured/);
    }
  });
});

describe('les sauvegardes', () => {
  const reload = (war: War, edit?: (s: Record<string, unknown>) => void) => {
    const s = JSON.parse(JSON.stringify(war.save())) as Record<string, unknown>;
    edit?.(s);
    const w = island();
    const back = new War(w);
    back.load(s);
    enlist(back, 0);
    tick(back, 1);
    return back;
  };

  it('une sauvegarde sans l’état neuf passe pour faite si une vague a déjà été repoussée', () => {
    const war = pveWar(island());
    enlist(war, 3);
    tick(war, 1);
    war.faction!.raidsRepelled = 2;
    const back = reload(war, (s) => { delete s.invasion; delete s.visited; });
    expect(back.inv).toBe('done');
    expect(back.hellWhy()).toBeNull();
  });

  it('…ou si les Enfers ont déjà été visités (troupes sur place)', () => {
    const war = pveWar(island());
    enlist(war, 3);
    tick(war, 1);
    war.army.troops[0].where = 'hell';
    const back = reload(war, (s) => { delete s.invasion; delete s.visited; });
    expect(back.inv).toBe('done');
  });

  it('une partie sans rien de tel (portail ouvert, rien vu) attend l’invasion', () => {
    const war = pveWar(island());
    tick(war, 1);
    const back = reload(war, (s) => { delete s.invasion; });
    expect(back.inv).toBe('wait');
  });

  it('le choix « prête » se sauvegarde ; un compte à rebours en cours au chargement devient le choix (pas de vague surprise)', () => {
    const war = pveWar(island());
    enlist(war, 3);
    tick(war, 2);
    expect(reload(war).inv).toBe('ready');
    war.startInvasion();
    expect(war.inv).toBe('coming');
    const back = reload(war);
    expect(back.inv).toBe('ready');
    tick(back, 60);
    expect(back.isle!.raid).toBeNull();
    expect(back.inv).toBe('ready');
  });

  it('une invasion déjà lancée, repoussée ou comptée comme faite ne change pas', () => {
    const war = pveWar(island());
    enlist(war, 3);
    tick(war, 2);
    war.startInvasion();
    war.faction!.nextRaid = war.faction!.time;
    tick(war, 3, () => !!war.isle!.raid);
    expect(war.inv).toBe('raid');
    expect(reload(war).inv).toBe('raid');
    war.skipInvasion();
    expect(reload(war).inv).toBe('done');
  });

  it('entre deux vagues : rechargée, l’invasion attend « Affronter » et reprend à la vague suivante', () => {
    const war = pveWar(island());
    enlist(war, 3);
    tick(war, 2);
    war.startInvasion();
    war.faction!.nextRaid = war.faction!.time;
    tick(war, 200, () => war.faction!.raidsRepelled === 1 && war.inv === 'coming');
    expect(war.inv).toBe('coming');
    const back = reload(war);
    enlist(back, 3);
    tick(back, 1);
    expect(back.inv).toBe('ready');
    expect(back.invStep()).toBe(2);
    expect(back.startInvasion()).toBe(true);
    expect(back.faction!.planned!.length).toBe(back.faction!.planInvasion(2).length);
  });

  it('une partie d’avant les trois vagues, l’invasion déjà faite après une seule : l’île est sûre, plus aucune vague', () => {
    const war = pveWar(island());
    enlist(war, 3);
    tick(war, 1);
    war.inv = 'done';
    war.faction!.raidsRepelled = 1;
    war.faction!.nextRaid = war.faction!.time + 30;
    const back = reload(war, (s) => { (s.faction as { raidsRepelled: number }).raidsRepelled = 1; });
    tick(back, 300);
    expect(back.inv).toBe('done');
    expect(back.isle!.raid).toBeNull();
    expect(back.nextWaveIn()).toBeNull();
    expect(back.faction!.raidsRepelled).toBe(INVASION_WAVES);
  });
});

describe('le cor', () => {
  it('« Appeler la vague » : seulement entre deux vagues de l’invasion, avec des soldats ; jamais avant, ni après', () => {
    const war = pveWar(island());
    tick(war, 1);
    war.callWave();
    expect(war.faction!.nextRaid).toBeLessThan(0);
    expect(war.callWhy()).not.toBeNull();
    enlist(war, 3);
    tick(war, 2);
    war.startInvasion();
    war.faction!.nextRaid = war.faction!.time;
    tick(war, 200, () => war.faction!.raidsRepelled === 1 && war.inv === 'coming');
    expect(war.callWhy()).toBeNull();
    war.callWave();
    tick(war, 3, () => !!war.isle!.raid);
    expect(war.isle!.raid).not.toBeNull();
    expect(war.callWhy()).toBe('Une vague est déjà en cours.');
    war.skipInvasion();
    tick(war, 300, () => !war.isle!.raid);
    expect(war.callWhy()).toBe('Aucune vague n’est prévue pour le moment.');
    war.callWave();
    tick(war, 10);
    expect(war.isle!.raid).toBeNull();
  }, 60000);

});

describe('le bandeau', () => {
  it('le compte à rebours s’écrit en m:ss et la force se range en petite, moyenne, grosse', () => {
    expect(clockText(0)).toBe('0:00');
    expect(clockText(59.2)).toBe('1:00');
    expect(clockText(125)).toBe('2:05');
    expect(waveForce(['imp', 'imp'])).toBe('small');
    expect(waveForce(['imp', 'imp', 'imp', 'imp', 'archer', 'brute'])).toBe('big');
  });
});

describe('l’invasion est gagnable, et grosse', () => {
  const run = (difficulty: Difficulty, soldiers = 3) => {
    const war = pveWar(island(1, 1, difficulty));
    enlist(war, soldiers);
    tick(war, 2);
    war.startInvasion();
    // (la dernière vague, la plus grosse)
    const plan = war.faction!.planInvasion();
    war.faction!.nextRaid = war.faction!.time;
    tick(war, 3, () => !!war.isle!.raid);
    const start = war.isle!.sim.alive('player').length;
    tick(war, 900, () => war.inv === 'done' || war.faction!.raidsLost > 0);
    return { won: war.inv === 'done' && war.faction!.raidsLost === 0, plan, left: war.isle!.sim.alive('player').length, start };
  };

  it('une tour, une caserne et trois soldats de l’Antiquité la repoussent ; plus faible en Facile et au bac à sable', () => {
    const n = run('normal'), e = run('easy', 2), s = run('sandbox', 2);
    expect(n.won).toBe(true);
    expect(e.won).toBe(true);
    expect(s.won).toBe(true);
    expect(n.plan.length).toBe(5);
    expect(n.left).toBeGreaterThan(0);
    expect(e.plan.length).toBeLessThan(n.plan.length);
    expect(s.plan.length).toBeLessThan(n.plan.length);
  }, 120000);

  it('ses vagues grossissent ; la dernière pèse deux à trois fois la première vague normale', () => {
    const war = pveWar(island());
    tick(war, 1);
    const f = war.faction!;
    const first = sumPower(f.planRaid(), DEMON_POWER), big = sumPower(f.planInvasion(), DEMON_POWER);
    expect(big / first).toBeGreaterThanOrEqual(2);
    expect(big / first).toBeLessThanOrEqual(3.6);
    expect(waveForce(f.planInvasion())).toBe('big');
    const p = [1, 2, 3].map((k) => sumPower(f.planInvasion(k), DEMON_POWER));
    expect(p[0]).toBeLessThan(p[1]);
    expect(p[1]).toBeLessThan(p[2]);
    expect(INVASION_WAVES).toBe(3);
  });
});

describe('plus d’invasion : on va directement aux Enfers (retour de l’auteur, 17 nov. 2026)', () => {
  it('les démons affrontés, les Enfers sont ouverts tout de suite, et aucune vague ne vient jamais', () => {
    War.wavesDefault = false;
    try {
      const war = pveWar(island(0, 1));
      expect(war.waves).toBe(false);
      enlist(war, 3);
      tick(war, 1);
      expect(war.inv).toBe('done');
      expect(war.hellWhy()).toBeNull();
      // sans tour de garde ni attente : le guidage mène tout de suite aux Enfers
      expect(war.guideStep(0)).toBe('select');
      tick(war, 120);
      expect(said(war, 'invasion') + said(war, 'invasionStart') + said(war, 'raid')).toBe(0);
      expect(war.nextWaveIn()).toBeNull();
      expect(war.isle!.raid).toBeFalsy();
      // refermé puis rouvert : toujours ouverts, toujours sans vague
      war.closePortal(); tick(war, 1);
      expect(war.hellWhy()).not.toBeNull();
      war.acceptPve(); tick(war, 1);
      expect(war.hellWhy()).toBeNull();
      // une partie sauvegardée en attendant l'invasion (`wait`) l'a faite au chargement
      const back = new War(war.world);
      back.load({ ...war.save(), invasion: 'wait' });
      tick(back, 1);
      expect(back.inv).toBe('done');
    } finally { War.wavesDefault = true; }
  });
});
