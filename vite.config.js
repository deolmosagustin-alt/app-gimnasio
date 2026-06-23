import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Aumentamos el límite para que no rompa el despliegue
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Esto ayuda a que el despliegue sea más estable
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      }
    }
  }
})