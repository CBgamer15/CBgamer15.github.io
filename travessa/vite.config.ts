import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // The lazy 3D chunk (three + r3f + drei) is ~1 MB raw / ~290 kB gzip and loads only on request.
    // No manualChunks: forcing a "three" chunk made the bundler pull shared code (React) into it,
    // so the menu preloaded the whole 3D stack. The dynamic imports split it correctly on their own.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
