import { describe, expect, it } from 'vitest'

// Il vecchio font è stato sostituito da Atkinson Hyperlegible (Piano E, Task E2): nessun file deve più importarlo.
const sorgenti = import.meta.glob(['/src/**/*.{ts,tsx,css}', '!/src/**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('font', () => {
  it('nessun sorgente importa i pacchetti del vecchio font', () => {
    const conVecchio = Object.entries(sorgenti).filter(([, testo]) => /fontsource-variable\/geist/.test(testo)).map(([file]) => file)
    expect(conVecchio).toEqual([])
  })

  it('main.tsx importa i due font nuovi', () => {
    const main = sorgenti['/src/main.tsx']
    expect(main).toContain('@fontsource-variable/atkinson-hyperlegible-next/index.css')
    expect(main).toContain('@fontsource-variable/atkinson-hyperlegible-mono/index.css')
  })
})
