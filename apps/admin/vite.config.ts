/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // The API serves the portal under /portal/ (VITE_BASE=/portal/); elsewhere it is served from the root.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  server: { port: 5174 },
  test: { environment: 'jsdom', globals: true, include: ['src/**/*.test.{ts,tsx}'], setupFiles: ['./src/test-setup.ts'] },
});
