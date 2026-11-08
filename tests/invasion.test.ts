import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { isleOrigins, zoneOrigins } from '../src/build/zones';
import { War, waveForce, clockText, invasionTroops } from '../src/sim/war';
import { DEMON_POWER, INVASION_DELAY } from '../src/sim/hell';
import { TroopKind, troopStats } from '../src/sim/army';
import { sumPower } from '../src/sim/hellBalance';
import type { Difficulty } from '../src/sim/difficulty';

/** L'invasion du portail : annoncée une fois (tour + caserne + garnison), grosse, à repousser avant d'ouvrir les Enfers */

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
const tick = (war: War, s: number, until?: () => boolean) => { for (let i = 0; i < s * 10; i++) { war.update(0.1, 1); if (until?.()) return; } };
const said = (war: War, kind: string) => war.news.filter((n) => n.kind === kind).length;

describe('l’invasion : quand elle est annoncée', () => {
  it('jamais sans tour de garde, sans caserne ou sans garnison', () => {
    for (const [t, b, n] of [[0, 1, 5], [1, 0, 5], [1, 1, 0], [1, 1, 1]]) {
      const war = new War(island(t, b));
      enlist(war, n);
      tick(war, 20);
      expect(war.inv, `${t} tour, ${b} caserne, ${n} soldats`).toBe('wait');
      expect(said(war, 'invasion')).toBe(0);
      expect(war.nextWaveIn()).toBeNull();
    }
  });

  it('pas de vague sans choix : tout prêt, le joueur décide ; « Affronter » lance la vague après 10 s', () => {
    const war = new War(island());
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
    // repoussée : faite, et elle ne se redéclenche pas
    tick(war, 400, () => war.inv === 'done');
    expect(war.inv).toBe('done');
    expect(said(war, 'invasionDone')).toBe(1);
    tick(war, 60);
    expect(said(war, 'invasion')).toBe(1);
    expect(war.faction!.raidsRepelled).toBe(1);
  }, 60000);

  it('la garnison la déclenche : à Facile, deux soldats suffisent', () => {
    expect(invasionTroops('normal')).toBe(3);
    const war = new War(island(1, 1, 'easy'));
    enlist(war, 2);
    tick(war, 2);
    expect(war.inv).toBe('ready');
  });

  it('défaite : elle est ré-annoncée quand la garnison est de nouveau là, sans plus', () => {
    const war = new War(island());
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
});

describe('les Enfers restent fermés tant que l’invasion n’est pas repoussée', () => {
  it('refusés avant (avec la phrase), permis après', () => {
    const war = new War(island());
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
    const war = new War(island());
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

describe('« Se préparer d’abord » referme le portail', () => {
  const ready = () => {
    const war = new War(island());
    enlist(war, 3);
    tick(war, 2);
    return war;
  };

  it('refermé : aucune vague, aucun passage, le bon message ; le portail reste « ouvert » pour le reste du jeu', () => {
    const war = ready();
    expect(war.closed).toBe(false);
    expect(war.sealPortal()).toBe(true);
    expect(said(war, 'portalSealed')).toBe(1);
    expect(war.sealPortal()).toBe(false);
    expect(war.closed).toBe(true);
    expect(war.world.portalOpen).toBe(true);
    tick(war, 300);
    expect(war.isle!.raid).toBeNull();
    expect(war.nextWaveIn()).toBeNull();
    war.callWave();
    tick(war, 5);
    expect(war.isle!.raid).toBeNull();
    expect(war.hellWhy()).toBe('Le portail est refermé : rouvrez-le depuis l’île.');
    war.sendThroughPortal(war.isle!.sim.alive('player'));
    expect(war.crossing.size).toBe(0);
  });

  it('rouvrir par le choix lance l’invasion (10 s) ; la carte ne revient pas seule', () => {
    const war = ready();
    war.sealPortal();
    tick(war, 120);
    // (la carte automatique, c'est `choiceSeen` : une fois par partie, que l'interface pose en l'ouvrant)
    war.choiceSeen = true;
    expect(war.inv).toBe('ready');
    expect(war.startInvasion()).toBe(true);
    expect(war.closed).toBe(false);
    expect(war.inv).toBe('coming');
    expect(war.nextWaveIn()!).toBeLessThanOrEqual(INVASION_DELAY);
    expect(war.hellWhy()).toBe('Repoussez d’abord l’invasion du portail.');
  });

  it('la sauvegarde et le rechargement gardent l’état ; une ancienne sauvegarde n’est pas scellée', () => {
    const war = ready();
    war.sealPortal();
    war.choiceSeen = true;
    const s = JSON.parse(JSON.stringify(war.save())) as Record<string, unknown>;
    expect(s.sealed).toBe(true);
    const back = new War(island());
    back.load(s);
    tick(back, 2);
    expect(back.closed).toBe(true);
    expect(back.choiceSeen).toBe(true);
    delete s.sealed; delete s.choiceSeen;
    const old = new War(island());
    old.load(s);
    tick(old, 2);
    expect(old.closed).toBe(false);
    expect(old.choiceSeen).toBe(false);
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
    const war = new War(island());
    enlist(war, 3);
    tick(war, 1);
    war.faction!.raidsRepelled = 2;
    const back = reload(war, (s) => { delete s.invasion; delete s.visited; });
    expect(back.inv).toBe('done');
    expect(back.hellWhy()).toBeNull();
  });

  it('…ou si les Enfers ont déjà été visités (troupes sur place)', () => {
    const war = new War(island());
    enlist(war, 3);
    tick(war, 1);
    war.army.troops[0].where = 'hell';
    const back = reload(war, (s) => { delete s.invasion; delete s.visited; });
    expect(back.inv).toBe('done');
  });

  it('une partie sans rien de tel (portail ouvert, rien vu) attend l’invasion', () => {
    const war = new War(island());
    tick(war, 1);
    const back = reload(war, (s) => { delete s.invasion; });
    expect(back.inv).toBe('wait');
  });

  it('le choix « prête » se sauvegarde ; un compte à rebours en cours au chargement devient le choix (pas de vague surprise)', () => {
    const war = new War(island());
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
    const war = new War(island());
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
});

describe('les vagues suivantes', () => {
  it('« Appeler la prochaine vague » : désactivé sans garnison ou pendant une vague, sans effet avant l’invasion', () => {
    const war = new War(island());
    tick(war, 1);
    war.callWave();
    expect(war.faction!.nextRaid).toBeLessThan(0);
    expect(war.callWhy()).not.toBeNull();
    war.inv = 'done';
    war.faction!.nextRaid = war.faction!.time + 200;
    expect(war.callWhy()).toBe('Il faut des soldats sur l’île pour appeler une vague.');
    enlist(war, 3);
    tick(war, 1);
    expect(war.callWhy()).toBeNull();
    war.callWave();
    tick(war, 3, () => !!war.isle!.raid);
    expect(war.isle!.raid).not.toBeNull();
    expect(war.callWhy()).toBe('Une vague est déjà en cours.');
  });

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
    const war = new War(island(1, 1, difficulty));
    enlist(war, soldiers);
    tick(war, 2);
    war.startInvasion();
    const plan = [...war.faction!.planned!];
    war.faction!.nextRaid = war.faction!.time;
    tick(war, 3, () => !!war.isle!.raid);
    const start = war.isle!.sim.alive('player').length;
    tick(war, 500, () => !war.isle!.raid);
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

  it('elle pèse deux à trois fois la première vague normale', () => {
    const war = new War(island());
    tick(war, 1);
    const f = war.faction!;
    const first = sumPower(f.planRaid(), DEMON_POWER), big = sumPower(f.planInvasion(), DEMON_POWER);
    expect(big / first).toBeGreaterThanOrEqual(2);
    expect(big / first).toBeLessThanOrEqual(3.6);
    expect(waveForce(f.planInvasion())).toBe('big');
  });
});
