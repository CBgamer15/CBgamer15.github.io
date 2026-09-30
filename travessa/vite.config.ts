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
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Keep the 3D stack out of the menu's critical path.
        manualChunks(id: string) {
          if (id.includes('node_modules/three') || id.includes('@react-three')) return 'three'
          if (id.includes('@supabase')) return 'supabase'
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
