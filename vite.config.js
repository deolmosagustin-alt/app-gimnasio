import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Esto es lo que realmente silencia el error en Vercel
    chunkSizeWarningLimit: 2000, 
    rollupOptions: {
      output: {
        manualChunks: undefined, // Quitamos la división manual para simplificar
      },
    },
  }
})