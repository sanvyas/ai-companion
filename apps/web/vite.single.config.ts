import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// One self-contained script + stylesheet (IIFE), with the prototype navigator on by default.
// Used by scripts/single-file.mjs to produce a page that can be hosted without a build server.
export default defineConfig({
  plugins: [react()],
  base: './',
  define: { 'import.meta.env.VITE_DEMO': JSON.stringify('1') },
  build: {
    outDir: 'dist-single',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    rollupOptions: { input: 'src/main.tsx', output: { format: 'iife', entryFileNames: 'app.js', assetFileNames: 'app[extname]', inlineDynamicImports: true } },
  },
});
