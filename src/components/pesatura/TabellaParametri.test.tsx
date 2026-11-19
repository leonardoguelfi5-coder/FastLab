import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { curvePerSubstrato, vasiDaPesi, type CurveSubstrato, type Vaso } from '@/domain/pesatura/curva'
import type { Sensore } from '@/domain/pesatura/tipi'
import { TabellaParametri } from './TabellaParametri'

const vaso = (id: string, punti: [number, number][], letturaCC: number | null): Vaso => ({
  campione: { id, sessione_id: 'S', pianta_id: null, nome: id, substrato: 'Torba', ordine: 1 },
  secco: 100, cc: 200, letturaCC, punti: punti.map(([lettura, pcc]) => ({ lettura, pcc })),
})
// potenza: pcc = 100·(lettura/10)^−0,5
const potenza = (h: number) => 100 * Math.pow(h / 10, -0.5)
const punti: [number, number][] = [10, 20, 40, 80, 160].map(h => [-h, potenza(h)])
const tensione: Sensore = { tipo: 'tensione', unita: 'hPa' }

function apri(gruppo: CurveSubstrato, sensore: Sensore = tensione) {
  render(<TabellaParametri gruppo={gruppo} sensore={sensore} />)
}

describe('TabellaParametri', () => {
  it('ha le intestazioni del sensore a tensione', () => {
    apri(curvePerSubstrato([vaso('A', punti, -23.7)], 'potenza')[0])
    for (const nome of ['Vaso', 'a', 'b', 'R²', 'h a CC, curva (hPa)', 'h a CC, misurato (hPa)', 'n']) {
      expect(screen.getByRole('columnheader', { name: nome })).toBeInTheDocument()
    }
  })

  it('con un sensore TDR la lettura è "TDR"', () => {
    const g = curvePerSubstrato([vaso('A', [[10, 80], [20, 60], [30, 40]], 5)], 'lineare')[0]
    apri(g, { tipo: 'tdr', unita: '%' })
    expect(screen.getByRole('columnheader', { name: 'TDR a CC, retta (%)' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'TDR a CC, misurata (%)' })).toBeInTheDocument()
  })

  it('scrive la riga del vaso con la virgola e il meno vero, e la curva media in grassetto', () => {
    apri(curvePerSubstrato([vaso('A', punti, -23.7)], 'potenza')[0])
    const celle = within(screen.getByRole('row', { name: /^A / })).getAllByRole('cell').map(c => c.textContent)
    expect(celle).toEqual(['316,23', '−0,5000', '1,000', '10,0', '23,7', '5'])
    const media = screen.getByRole('row', { name: /^Curva media/ })
    expect(within(media).getByRole('rowheader')).toHaveClass('font-semibold')
    expect(within(media).getAllByRole('cell').map(c => c.textContent)).toEqual(['316,23', '−0,5000', '1,000', '10,0', '—', '5'])
  })

  it('un vaso senza curva e senza lettura mostra "—"', () => {
    apri(curvePerSubstrato([vaso('A', punti, -23.7), vaso('B', [[-10, 90]], null)], 'potenza')[0])
    const celle = within(screen.getByRole('row', { name: /^B / })).getAllByRole('cell').map(c => c.textContent)
    expect(celle).toEqual(['—', '—', '—', '—', '—', '1'])
  })

  describe('con il sensore TDR', () => {
    const raw: Sensore = { tipo: 'tdr', unita: 'raw' }
    const peso = (tipo: 'secco' | 'capacita_campo' | 'asciugatura', valore: number, lettura: number | null, i = 0) => ({
      id: `${tipo}${i}`, campione_id: 't1', replica: 1, tipo, valore, lettura, misurato_il: `2026-11-1${i}T10:00:00Z`, creato_da: 'io',
    })
    const t1 = vasiDaPesi(
      [{ id: 't1', sessione_id: 'S', pianta_id: null, nome: 'T1', substrato: 'Torba', ordine: 1 }],
      [
        peso('secco', 750, null), peso('capacita_campo', 4850, 54),
        peso('asciugatura', 4030, 44.8, 1), peso('asciugatura', 3210, 35.2, 2), peso('asciugatura', 2390, 26.0, 3), peso('asciugatura', 1570, 17.5, 4),
      ],
    )

    it('le colonne sono m e q (non a e b), poi R² e le letture a CC', () => {
      apri(curvePerSubstrato(t1, 'lineare')[0], raw)
      const nomi = screen.getAllByRole('columnheader').map(c => c.textContent)
      expect(nomi).toEqual(['Vaso', 'm', 'q', 'R²', 'TDR a CC, retta (raw)', 'TDR a CC, misurata (raw)', 'n'])
    })

    it('m e q a 4 cifre significative, R² a 3 decimali', () => {
      apri(curvePerSubstrato(t1, 'lineare')[0], raw)
      const celle = within(screen.getByRole('row', { name: /^T1 / })).getAllByRole('cell').map(c => c.textContent)
      expect(celle).toEqual(['2,178', '−17,31', '1,000', '53,9', '54,0', '5'])
    })
  })
})
