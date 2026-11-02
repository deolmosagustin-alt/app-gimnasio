import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// El service worker (src/sw-plantilla.js) sale como /sw.js con la lista de
// los archivos de este armado, para guardarlos al instalarse y que la app
// abra sin señal. Los lectores de PDF y Excel quedan afuera (pesan y sólo se
// usan para importar): se guardan la primera vez que se usan.
function serviceWorker() {
  return {
    name: 'modusfit-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const archivos = Object.values(bundle)
        .map((f) => f.fileName)
        .filter((n) => n.startsWith('assets/') && !n.endsWith('.map') && !/^assets\/(pdf|xlsx|jszip)/.test(n))
        .map((n) => `/${n}`)
        .sort()
      const version = createHash('sha256').update(archivos.join('|')).digest('hex').slice(0, 12)
      const plantilla = readFileSync(new URL('./src/sw-plantilla.js', import.meta.url), 'utf8')
      const cabeza = `self.__ARCHIVOS__ = ${JSON.stringify(archivos)};\nself.__VERSION__ = "${version}";\n`
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: cabeza + plantilla })
    },
  }
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  build: {
    // Esto es lo que realmente silencia el error en Vercel
    chunkSizeWarningLimit: 2000,
    // Explícito: el armado de Vercel salía sin comprimir (4,2 MB de JS con
    // los comentarios adentro, y el CSS igual) mientras que el de la máquina
    // sale comprimido (2,2 MB). La app de Android baja ese archivo al abrir:
    // con esto pesa la mitad en cualquier entorno.
    minify: 'oxc',
    cssMinify: 'lightningcss',
    rollupOptions: {
      output: {
        manualChunks: undefined, // Quitamos la división manual para simplificar
      },
    },
  }
})
