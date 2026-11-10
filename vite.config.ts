import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { configDefaults } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // Il service worker (Piano E, Task E7): tutta la build in cache, così l'app si apre senza rete e una pagina aperta
    // resta coerente con la sua versione dopo un deploy (anche il chunk di exceljs). Nei test non serve.
    mode !== 'test' && VitePWA({
      strategies: 'generateSW',
      // La versione nuova aspetta: si attiva alla prossima apertura dell'app o con "Nuova versione · Aggiorna"
      // (src/lib/aggiornamento.ts), mai a metà lavoro.
      registerType: 'prompt',
      // La registrazione la fa src/main.tsx con `virtual:pwa-register`.
      injectRegister: false,
      // Resta public/manifest.webmanifest, con il suo `id`.
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        // Il chunk di exceljs è di circa 930 kB: il limite di 2 MB di Workbox lo terrebbe dentro, ma con poco margine.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
        // Nessuna regola a runtime: il service worker non tocca mai Supabase (database, autenticazione, Storage).
        // scripts/controlla-sw.mjs lo verifica dopo la build.
      },
    }),
  ],
  define: {
    // La versione dell'app (data e ora della build): la copia delle letture sul telefono di un'altra build si scarta.
    __VERSIONE__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    globals: false,
    // Su Windows+OneDrive i worker in parallelo rallentano molto: 5 s di default non bastano per il primo test di un file.
    testTimeout: 15_000,
    // Fuso fisso: i test sulle date locali (mezzanotte, ora legale) devono dare lo stesso esito su ogni macchina e distinguere i bug da UTC.
    env: { TZ: 'Europe/Rome' },
    // Le worktree degli agenti (.claude/) contengono un'altra copia dei test: non vanno raccolte.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
}))
