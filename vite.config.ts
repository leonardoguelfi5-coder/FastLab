/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
  },
})
