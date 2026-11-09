import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest';

export default defineConfig({
  base: './',
  plugins: [crx({ manifest })],
  build: {
    target: 'chrome120',
    rollupOptions: {
      input: { viewer: 'viewer.html', wiki: 'wiki.html' },
    },
  },
});
