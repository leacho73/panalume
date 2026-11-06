import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import oldSafari from './build/old-safari.js';

// Relative base so the app works behind HA ingress at any path.
export default defineConfig({
  base: './',
  plugins: [svelte(), oldSafari()],
  // Older tablets too: Safari 14+ (e.g. iPads that stop at iPadOS 15).
  build: { target: ['es2020', 'safari14'], cssCodeSplit: false },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8099', ws: true },
      '/ha': 'http://localhost:8099',
    },
  },
});
