import { defineConfig } from 'vite';

// `npm run dev` serves on your LAN too (--host), so you can open it on a phone.
export default defineConfig({
  server: { port: 5173 },
  build: { target: 'esnext' },   // the page uses top-level await
});
