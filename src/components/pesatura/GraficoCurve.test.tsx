import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { COLORI_GRAFICO, COLORI_SERIE, MARCATORI } from '@/domain/grafico'
import { curvePerSubstrato, type Vaso } from '@/domain/pesatura/curva'
import { GraficoCurve } from './GraficoCurve'

const vaso = (id: string, nome: string, punti: [number, number][]): Vaso => ({
  campione: { id, sessione_id: 'S', pianta_id: null, nome, substrato: 'Torba', ordine: 1 },
  secco: 100, cc: 200, letturaCC: null, punti: punti.map(([lettura, pcc]) => ({ lettura, pcc })),
})
const vasiTorba = [
  vaso('V1', 'Vaso A', [[-5, 90], [-20, 60], [-60, 30]]),
  vaso('V2', 'Vaso B', [[-6, 95], [-25, 55], [-70, 25]]),
  vaso('V3', 'Vaso C', [[-6, 95]]),
]
const gruppo = curvePerSubstrato(vasiTorba, 'potenza')[0]
const sensore = { tipo: 'tensione' as const, unita: 'hPa' }
const disegna = (g = gruppo) => render(<GraficoCurve gruppo={g} sensore={sensore} />).container

describe('GraficoCurve', () => {
  it('assi: % della capacità di campo e lettura del sensore; la x parte da 0', () => {
    const c = disegna()
    const testo = c.textContent ?? ''
    expect(testo).toContain('% della capacità di campo')
    expect(testo).toContain('Tensione (hPa)')
    expect(c.querySelector('svg')).toHaveAttribute('role', 'img')
    const tacceX = [...c.querySelectorAll('line[data-tacca-x]')]
    expect(tacceX[0]).toHaveAttribute('data-tacca-x', '0')
  })

  it('una curva sottile per ogni vaso con curva, nessuna per quello senza, e una media', () => {
    const c = disegna()
    expect(gruppo.curve.filter(x => x !== null)).toHaveLength(2)
    expect(c.querySelectorAll('path[data-curva-vaso]')).toHaveLength(2)
    expect(c.querySelector('path[data-curva-vaso="V3"]')).toBeNull()
    expect(c.querySelectorAll('path[data-media]')).toHaveLength(1)
  })

  it('colore e marcatore per vaso, media grafite spessa', () => {
    const c = disegna()
    expect(c.querySelector('path[data-curva-vaso="V1"]')).toHaveAttribute('stroke', COLORI_SERIE[0])
    expect(c.querySelector('path[data-curva-vaso="V2"]')).toHaveAttribute('stroke', COLORI_SERIE[1])
    expect(c.querySelector('path[data-marcatore="V1"]')?.getAttribute('d')).toBe(MARCATORI[0])
    expect(c.querySelector('path[data-marcatore="V2"]')?.getAttribute('d')).toBe(MARCATORI[1])
    expect(c.querySelector('path[data-marcatore="V3"]')?.getAttribute('d')).toBe(MARCATORI[2])
    const media = c.querySelector('path[data-media]')
    expect(media).toHaveAttribute('stroke', COLORI_GRAFICO.grafite)
    expect(media).toHaveAttribute('stroke-width', '3')
  })

  it('le curve stanno dentro un clipPath dell\'area del grafico', () => {
    const c = disegna()
    const gruppoCurve = c.querySelector('g[clip-path]')
    expect(gruppoCurve).not.toBeNull()
    const id = /url\(#(.+)\)/.exec(gruppoCurve!.getAttribute('clip-path') ?? '')?.[1]
    expect(id).toBeTruthy()
    expect(c.querySelector(`clipPath[id="${id}"] rect`)).not.toBeNull()
    expect(gruppoCurve!.querySelector('path[data-media]')).not.toBeNull()
  })

  it('i punti con lettura negativa si disegnano a |h| (x positiva)', () => {
    const c = disegna()
    const m = c.querySelector('path[data-marcatore="V1"]')?.getAttribute('transform') ?? ''
    const x = Number(/translate\(([-\d.]+) /.exec(m)?.[1])
    expect(x).toBeGreaterThan(48)
  })

  it('legenda: i vasi e la curva media con R²', () => {
    const testo = disegna().textContent ?? ''
    expect(testo).toContain('Vaso A')
    expect(testo).toContain('Vaso B')
    expect(testo).toMatch(/Curva media \(R² 0,\d{3}\)/)
    const senza = disegna({ ...gruppo, media: null }).textContent ?? ''
    expect(senza).not.toContain('Curva media')
  })

  it('un substrato senza curve: punti sì, curve no, nessun errore', () => {
    const g = curvePerSubstrato([vaso('V1', 'Vaso A', [[-5, 90], [-20, 60]])], 'potenza')[0]
    const c = disegna(g)
    expect(c.querySelectorAll('path[data-marcatore]')).toHaveLength(2)
    expect(c.querySelectorAll('path[data-curva-vaso]')).toHaveLength(0)
    expect(c.querySelectorAll('path[data-media]')).toHaveLength(0)
  })

  it('perImmagine disegna fondo e titolo nell\'immagine, anche con renderToStaticMarkup', () => {
    const html = renderToStaticMarkup(<GraficoCurve gruppo={gruppo} sensore={sensore} perImmagine titolo="Torba" />)
    expect(html).toContain('Torba')
    expect(html).toContain('width="800"')
    expect(html).toMatch(/clip-path="url\(#[^")]+\)"/)
  })

  it('senza punti dice che non c\'è nulla da disegnare', () => {
    const g = curvePerSubstrato([vaso('V1', 'Vaso A', [])], 'lineare')[0]
    expect(disegna(g).textContent).toContain('Nessun dato da disegnare')
  })

  it('con il TDR e letture positive la x parte da 0', () => {
    const g = curvePerSubstrato([vaso('T', 'T', [[40, 20], [50, 50], [60, 80]])], 'lineare')[0]
    const c = render(<GraficoCurve gruppo={g} sensore={{ tipo: 'tdr', unita: 'raw' }} />).container
    expect([...c.querySelectorAll('line[data-tacca-x]')][0]).toHaveAttribute('data-tacca-x', '0')
  })
})
