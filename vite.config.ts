import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// NOTE: the Gemini API key is intentionally NOT injected into the browser bundle.
// It is only read on the server (api/analyze.ts or server.ts).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    // HMR can be disabled (e.g. in AI Studio) with DISABLE_HMR=true.
    hmr: process.env.DISABLE_HMR !== 'true',
  },
});
