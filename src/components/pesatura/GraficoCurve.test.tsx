import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { COLORI_SERIE, MARCATORI } from '@/domain/grafico'
import { curvePerSubstrato, type Vaso } from '@/domain/pesatura/curva'
import { GraficoCurve } from './GraficoCurve'

const vaso = (id: string, substrato: string, punti: [number, number][]): Vaso => ({
  campione: { id, sessione_id: 'S', pianta_id: null, nome: id, substrato, ordine: 1 },
  secco: 100, cc: 200, punti: punti.map(([lettura, pcc]) => ({ lettura, pcc })),
})
const gruppi = curvePerSubstrato([
  vaso('V1', 'Torba', [[5, 90], [20, 60], [60, 30]]),
  vaso('V2', 'Torba', [[6, 95], [25, 55], [70, 25]]),
  vaso('V3', 'Sabbia', [[3, 80], [10, 40], [30, 10]]),
], 'logaritmico')
const sensore = { tipo: 'tensione' as const, unita: 'kPa' }

describe('GraficoCurve', () => {
  it('assi con l\'unità del sensore e % CC, legenda per substrato', () => {
    const { container } = render(<GraficoCurve gruppi={gruppi} sensore={sensore} />)
    const testo = container.textContent ?? ''
    expect(testo).toContain('Tensione (kPa)')
    expect(testo).toContain('% CC')
    expect(testo).toContain('Torba')
    expect(testo).toContain('Sabbia')
    expect(container.querySelector('svg')).toHaveAttribute('role', 'img')
  })

  it('una linea sottile per vaso, una spessa per la media di ogni substrato', () => {
    const { container } = render(<GraficoCurve gruppi={gruppi} sensore={sensore} />)
    expect(container.querySelectorAll('path[data-vaso]')).toHaveLength(3)
    const medie = container.querySelectorAll('path[data-media]')
    expect(medie).toHaveLength(2)
    const sottile = Number(container.querySelector('path[data-vaso]')?.getAttribute('stroke-width'))
    expect(Number(medie[0].getAttribute('stroke-width'))).toBeGreaterThan(sottile)
  })

  it('colori da COLORI_SERIE e forme dei marcatori diverse per substrato', () => {
    const { container } = render(<GraficoCurve gruppi={gruppi} sensore={sensore} />)
    const media = (n: string) => container.querySelector(`path[data-media="${n}"]`)
    expect(media('Torba')).toHaveAttribute('stroke', COLORI_SERIE[0])
    expect(media('Sabbia')).toHaveAttribute('stroke', COLORI_SERIE[1])
    const forma = (n: string) => container.querySelector(`path[data-marcatore="${n}"]`)?.getAttribute('d')
    expect(forma('Torba')).toBe(MARCATORI[0])
    expect(forma('Sabbia')).toBe(MARCATORI[1])
    expect(forma('Torba')).not.toBe(forma('Sabbia'))
  })

  it('perImmagine disegna fondo e titolo nell\'immagine', () => {
    const { container } = render(<GraficoCurve gruppi={gruppi} sensore={sensore} perImmagine titolo="Curve dei vasi" />)
    expect(container.textContent).toContain('Curve dei vasi')
    expect(container.querySelector('svg')).toHaveAttribute('width', '800')
  })

  it('senza punti dice che non c\'è nulla da disegnare', () => {
    const { container } = render(<GraficoCurve gruppi={curvePerSubstrato([vaso('V1', 'Torba', [])], 'lineare')} sensore={sensore} />)
    expect(container.textContent).toContain('Nessun dato da disegnare')
  })
})
