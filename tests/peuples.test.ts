import { describe, it, expect } from 'vitest';
import { newDiplo, chooseAlly, choosePath, applyDiplo, winAllyWar, settleLate, WAR_MISSION } from '../src/sim/diplomacy';
import { peoplesView, type PeoplesCtx, type Gesture } from '../src/sim/peoples';
import { peoplesHtml } from '../src/ui/peoples';

/** Le monde minimal que lit le panneau : l'archipel (ou non), la diplomatie, les expéditions réussies */
const world = (arch = true) => ({ isles: arch ? ({} as any) : null, diplo: newDiplo(), exp: { done: [] as string[] } }) as any;
const ctx = (o: Partial<PeoplesCtx> = {}): PeoplesCtx => ({ age: 2, tradeOpen: false, postReady: true, canExplore: true, ...o });
const g = (gs: Gesture[], id: Gesture['id']) => gs.find((x) => x.id === id)!;

describe('le panneau Peuples', () => {
  it('sans archipel : les peuples sont inconnus, et le panneau dit comment les rencontrer', () => {
    const v = peoplesView(world(false), ctx({ age: 1 }));
    expect(v.hint).toMatch(/grand choix de la fin/);
    expect(peoplesView(world(false), ctx({ waysTab: true })).hint).toMatch(/onglet/);
    expect(v.open).toBe(false);
    expect(v.hint).toMatch(/Explorer le monde/);
    expect(peoplesHtml(v)).toContain('Un peuple inconnu');
    expect(peoplesView(world(false), ctx({ canExplore: false })).hint).toMatch(/ne peut plus/);
  });

  it('avant le choix de l’allié : chaque peuple propose l’alliance, le reste est grisé avec la raison', () => {
    const v = peoplesView(world(), ctx({ age: 1 }));
    expect(v.cards.map((c) => c.people)).toEqual(['orient', 'asie']);
    for (const c of v.cards) {
      expect(c.role).toBe('free');
      expect(g(c.gestures, 'ally').on).toBe(true);
      for (const id of ['trade', 'peace', 'war'] as const) expect(g(c.gestures, id)).toMatchObject({ on: false, why: 'Choisissez d’abord un allié' });
    }
  });

  it('l’allié choisi, à l’Antiquité : la paix et la guerre attendent le Médiéval, le commerce aussi', () => {
    const w = world();
    chooseAlly(w.diplo, 'asie');
    const [orient, asie] = peoplesView(w, ctx({ age: 1, postReady: false })).cards;
    expect(asie).toMatchObject({ role: 'ally', mood: 3 });
    expect(orient).toMatchObject({ role: 'rival', mood: 1, tone: 'war' });
    expect(g(asie.gestures, 'trade')).toMatchObject({ on: false, why: 'Au Médiéval : un comptoir sur leur île' });
    expect(g(orient.gestures, 'peace')).toMatchObject({ on: false, why: 'Au Médiéval' });
  });

  it('au Médiéval sans port ni comptoir chez l’allié : « après le port et le comptoir » ; puis bâtir le comptoir mène chez l’allié', () => {
    const w = world();
    chooseAlly(w.diplo, 'orient');
    const [ally, rival] = peoplesView(w, ctx({ postReady: false })).cards;
    expect(g(rival.gestures, 'peace').why).toMatch(/port et le comptoir/);
    expect(g(ally.gestures, 'trade')).toMatchObject({ on: true, go: 'post' });
    expect(g(peoplesView(w, ctx({ tradeOpen: true })).cards[0].gestures, 'trade')).toMatchObject({ on: true, go: 'trade' });
  });

  it('le dénouement ouvert : la paix et la guerre mènent à la carte ; les éclaireurs attendent la guerre', () => {
    const w = world();
    chooseAlly(w.diplo, 'orient');
    const rival = peoplesView(w, ctx()).cards[1];
    expect(g(rival.gestures, 'peace')).toMatchObject({ on: true, go: 'path' });
    expect(g(rival.gestures, 'war')).toMatchObject({ on: true, go: 'path' });
    expect(g(rival.gestures, 'scouts')).toMatchObject({ on: false, why: 'Sur la voie de la guerre' });
  });

  it('la voie de la guerre : les éclaireurs partent, puis la bataille ; l’humeur du rival tombe', () => {
    const w = world();
    chooseAlly(w.diplo, 'orient');
    choosePath(w.diplo, 'war');
    let rival = peoplesView(w, ctx()).cards[1];
    expect(rival.mood).toBe(0);
    expect(g(rival.gestures, 'scouts')).toMatchObject({ on: true, go: 'mission', mission: WAR_MISSION });
    // (la voie prise : la guerre rouvre sa feuille de route, la paix sert à changer de voie)
    expect(g(rival.gestures, 'war')).toMatchObject({ on: true, label: 'La suite de la guerre', go: 'path' });
    expect(g(rival.gestures, 'peace')).toMatchObject({ on: true, go: 'change' });
    applyDiplo(w.diplo, 'landing');
    rival = peoplesView(w, ctx()).cards[1];
    expect(g(rival.gestures, 'war')).toMatchObject({ on: true, label: 'À la bataille', go: 'path' });
    expect(g(rival.gestures, 'peace').on).toBe(false);
    winAllyWar(w.diplo);
    rival = peoplesView(w, ctx()).cards[1];
    expect(rival.status).toMatch(/tribut/);
    expect(g(rival.gestures, 'war')).toMatchObject({ done: true });
  });

  it('la voie de la paix : le geste mène au pourparler suivant ; la trêve apaise le rival, la paix signée le rend amical', () => {
    const w = world();
    chooseAlly(w.diplo, 'orient');
    choosePath(w.diplo, 'peace');
    expect(g(peoplesView(w, ctx()).cards[1].gestures, 'peace')).toMatchObject({ go: 'path', mission: 'envoys' });
    expect(g(peoplesView(w, ctx()).cards[1].gestures, 'war')).toMatchObject({ go: 'change' });
    w.exp.done.push('envoys');
    applyDiplo(w.diplo, 'post');
    const rival = peoplesView(w, ctx()).cards[1];
    expect(rival.mood).toBe(2);
    expect(g(rival.gestures, 'peace').mission).toBe('truce');
    applyDiplo(w.diplo, 'truce');
    // (la trêve, au Médiéval : les combats cessent, on ne revient plus à la guerre ; la paix vient au Moderne)
    const truce = peoplesView(w, ctx()).cards;
    expect(truce[1]).toMatchObject({ mood: 3, tone: 'peace' });
    expect(g(truce[1].gestures, 'peace')).toMatchObject({ on: true, go: 'path' });
    expect(g(truce[1].gestures, 'war').on).toBe(false);
    w.diplo.conflict = 'peace';
    const after = peoplesView(w, ctx()).cards;
    expect(after[1]).toMatchObject({ mood: 3, tone: 'peace' });
    expect(after[0].mood).toBe(4);
    expect(g(after[1].gestures, 'peace').done).toBe(true);
  });

  it('un traité (une ancienne partie réglée d’office) : rien à faire, et la fiche le dit', () => {
    const w = world();
    chooseAlly(w.diplo, 'asie');
    // (plus de règlement d'office : le conflit se mène à tout âge ; les anciennes parties gardent leur traité)
    expect(settleLate(w.diplo, 5, true)).toBe(false);
    w.diplo.conflict = 'treaty';
    const rival = peoplesView(w, ctx({ age: 5 })).cards[0];
    expect(rival.status).toMatch(/traité/);
    expect(rival.gestures.every((x) => !x.on)).toBe(true);
  });
});
