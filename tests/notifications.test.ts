import { describe, it, expect } from 'vitest';
import { NotifQueue, durationOf, levelOf, DEDUP_MS, HISTORY_MAX } from '../src/ui/notifs';

const q = () => new NotifQueue();

describe('la file des notifications', () => {
  it('jamais plus de deux messages à la fois (un seul sur un téléphone) ; les autres attendent', () => {
    const n = q();
    n.push('Un', 0, { level: 'notice' }); n.push('Deux', 0, { level: 'notice' }); n.push('Trois', 0, { level: 'notice' });
    expect(n.visible.map((v) => v.text)).toEqual(['Un', 'Deux']);
    expect(n.waiting.map((v) => v.text)).toEqual(['Trois']);
    // un message disparu laisse sa place au suivant
    n.tick(6000);
    expect(n.visible.map((v) => v.text)).toEqual(['Trois']);
    const m = q(); m.max = 1;
    m.push('A', 0, { level: 'danger' }); m.push('B', 0, { level: 'danger' });
    expect(m.visible).toHaveLength(1);
  });

  it('la durée suit la longueur du texte : de 3 à 5 s', () => {
    expect(durationOf('Court', 'notice')).toBe(3000);
    expect(durationOf('x'.repeat(200), 'notice')).toBe(5000);
    expect(durationOf('Un texte de longueur moyenne pour un message', 'danger')).toBeGreaterThanOrEqual(3000);
    expect(durationOf('Court', 'action')).toBeGreaterThan(5000);
  });

  it('regroupe les doublons (×3) et ne répète pas un message dit il y a moins de 10 s', () => {
    const n = q();
    n.push('Pas assez de pierre', 0); n.push('Pas assez de pierre', 500); n.push('Pas assez de pierre', 900);
    expect(n.visible).toHaveLength(1);
    expect(n.visible[0].count).toBe(3);
    // disparu mais dit depuis peu : on se tait
    n.tick(9000);
    expect(n.visible).toHaveLength(0);
    expect(n.push('Pas assez de pierre', 9500)).toBeNull();
    expect(n.visible).toHaveLength(0);
    // passé 10 s, il peut revenir
    expect(n.push('Pas assez de pierre', DEDUP_MS + 1000)).not.toBeNull();
    expect(n.visible).toHaveLength(1);
  });

  it('l’information va seulement dans la cloche, jamais à l’écran', () => {
    const n = q();
    expect(n.push('Partie sauvegardée', 0, { level: 'info' })).toBeNull();
    expect(n.visible).toHaveLength(0);
    expect(n.history).toHaveLength(1);
    expect(n.unread).toBe(1);
    n.markRead();
    expect(n.unread).toBe(0);
    n.clearHistory();
    expect(n.history).toHaveLength(0);
  });

  it('priorité : la décision passe devant le danger, devant le geste du joueur', () => {
    const n = q();
    n.push('Geste 1', 0, { level: 'notice' }); n.push('Geste 2', 0, { level: 'notice' });
    n.push('Incendie', 100, { level: 'danger' }); n.push('Décision', 100, { level: 'action', act: () => {} });
    // la file est pleine : les deux nouveaux attendent, dans l’ordre décision puis danger
    expect(n.waiting.map((w) => w.text)).toEqual(['Décision', 'Incendie']);
    // les plus faibles s’effacent vite (après un instant de lecture) pour céder la place
    n.tick(1400);
    expect(n.visible.map((v) => v.text)).toEqual(['Décision', 'Incendie']);
  });

  it('l’historique garde les 30 derniers messages', () => {
    const n = q();
    for (let i = 0; i < HISTORY_MAX + 10; i++) n.push(`Message ${i}`, i * 20_000, { level: 'info' });
    expect(n.history).toHaveLength(HISTORY_MAX);
    expect(n.history[0].text).toBe(`Message ${HISTORY_MAX + 9}`);
    expect(n.unread).toBe(HISTORY_MAX);
  });

  it('pendant une fenêtre ouverte : les messages automatiques attendent, le geste du joueur passe ; à la fermeture ils sortent groupés', () => {
    const n = q();
    n.setBlocked(true, 0);
    n.push('Incendie', 10, { level: 'danger' });
    n.push('Une équipe vous attend', 20, { level: 'action', act: () => {} });
    n.push('Autre danger', 30, { level: 'danger' });
    expect(n.visible).toHaveLength(0);
    n.push('Impossible à fabriquer', 40, { level: 'notice' });
    expect(n.visible.map((v) => v.text)).toEqual(['Impossible à fabriquer']);
    n.setBlocked(false, 5000);
    n.tick(5000);
    // au plus deux à l’écran, les plus utiles d’abord ; le reste est dans la cloche
    expect(n.visible.length).toBeLessThanOrEqual(2);
    expect(n.held).toHaveLength(0);
    expect(n.history.map((h) => h.text)).toContain('Autre danger');
  });

  it('un clic ferme le message ; la souris dessus d’un message qui mène quelque part le garde', () => {
    const n = q();
    const a = n.push('Une décision attend', 0, { act: () => {} })!;
    n.tick(a.until + 100, new Set([a.id]));
    expect(n.visible).toHaveLength(1);
    n.tick(a.until + 200);
    expect(n.visible).toHaveLength(0);
    const b = n.push('Autre chose', 20_000, { level: 'notice' })!;
    n.dismiss(b.id);
    expect(n.visible).toHaveLength(0);
  });

  it('le niveau deviné : refus et consignes restent des messages, les annonces rassurantes vont dans la cloche', () => {
    expect(levelOf('Pas assez de bois', false)).toBe('notice');
    expect(levelOf('Partie sauvegardée', false)).toBe('info');
    expect(levelOf('Bon retour dans votre village !', false)).toBe('info');
    expect(levelOf('🔥 Incursion ! 3 démons attaquent', true)).toBe('danger');
    expect(levelOf('Une décision vous attend', true)).toBe('action');
  });
});
