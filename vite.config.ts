/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import { execSync } from 'node:child_process';

/** la version du build, envoyée par la mesure d'audience (`src/audience.ts`) : le jour et le commit */
function build() {
  let sha = 'local';
  try { sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* hors git */ }
  return `${new Date().toISOString().slice(0, 10)}.${sha}`;
}

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(build()) },
  // la mesure d'audience essayée en développement (`?mesure`) : /api va au Worker de `wrangler dev`
  server: { proxy: { '/api': 'http://localhost:8787' } },
  // three.js à part : il change rarement, le navigateur le garde en cache d'une version à l'autre
  build: { chunkSizeWarningLimit: 700, rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
  // les copies de travail rangées dans .claude/ ont leurs propres tests : on ne lance que ceux du projet
  // (un délai large : en suite complète, plusieurs fichiers tournent en parallèle et certains tests dépassaient 5 s sans être en défaut ;
  // la moitié des cœurs seulement : à pleine charge, un long test sans pause bloquait son processus et vitest le croyait muet, « Timeout calling onTaskUpdate »)
  test: { exclude: [...configDefaults.exclude, '.claude/**'], testTimeout: 60000, maxWorkers: '50%' },
});
