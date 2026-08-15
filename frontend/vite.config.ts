/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build output goes directly into the Go module's embed target
// (backend/internal/webui/dist) — see that package's doc comment for why it
// can't simply be a top-level backend/dist (go:embed can't reach outside
// the embedding file's own directory tree).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../backend/internal/webui/dist',
    emptyOutDir: true,
  },
  server: {
    // Same-origin in production (the Go binary serves both), but `npm run
    // dev` runs on its own port — proxy /api so cookies and relative fetch
    // calls behave identically to production without CORS.
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
