import { defineConfig } from 'vite';

// `npm run dev` serves on your LAN too (--host), so you can open it on a phone.
export default defineConfig({
  base: './',                    // works from any subpath, e.g. GitHub Pages at /ski_map/
  server: { port: 5173 },
  build: { target: 'esnext' },   // the page uses top-level await
});
