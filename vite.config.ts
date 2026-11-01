import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  // three.js à part : il change rarement, le navigateur le garde en cache d'une version à l'autre
  build: { chunkSizeWarningLimit: 700, rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
});
