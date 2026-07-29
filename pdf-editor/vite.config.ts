import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative paths so /origen/ works on static hosting
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
  },
})
