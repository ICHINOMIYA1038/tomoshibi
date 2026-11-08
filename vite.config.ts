import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// tomoshibi.gikyokutosyokan.com 配信想定
// サブドメインのルート配信なので base は '/'
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: { port: 5173, host: '127.0.0.1' },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        lightingLab: resolve(import.meta.dirname, 'lighting-lab/index.html'),
      },
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
})
