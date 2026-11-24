import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { curvePerSubstrato, vasiDaPesi, type PuntoCurva, type Vaso } from '@/domain/pesatura/curva'
import type { Sensore } from '@/domain/pesatura/tipi'
import { Calcolatore } from './Calcolatore'

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
const gruppiTdr = curvePerSubstrato(t1, 'lineare')
const tdr: Sensore = { tipo: 'tdr', unita: 'raw' }
const tensiometro: Sensore = { tipo: 'tensione', unita: 'hPa' }

const coppie = (hs: number[], wcs: number[]): PuntoCurva[] => hs.map((h, i) => ({ lettura: h, pcc: wcs[i] }))
const vaso = (id: string, substrato: string, punti: PuntoCurva[], letturaCC: number | null): Vaso => ({
  campione: { id, sessione_id: 'S', pianta_id: null, nome: id.toUpperCase(), substrato, ordine: 1 },
  secco: 1800, cc: 2600, letturaCC, punti,
})
const gruppiTens = curvePerSubstrato([
  vaso('a', 'HC', coppie([23.7, 23.9, 26.7, 42.9, 61.2], [100, 93.2, 86.5, 71.1, 51.9]), 23.7),
  vaso('b', 'HC', coppie([9.9, 15.5, 19.8, 30.7, 32.9, 64.3], [100, 92.7, 86.3, 76.3, 73.6, 55.5]), 9.9),
], 'potenza')

const risultato = () => within(screen.getByRole('region', { name: 'Risultato del calcolatore' }))
const apri = (gruppi = gruppiTdr, sensore: Sensore = tdr) => {
  render(<Calcolatore gruppi={gruppi} sensore={sensore} />)
  return userEvent.setup({ delay: null })
}

describe('Calcolatore', () => {
  it('senza un valore chiede di scriverlo', () => {
    apri()
    expect(screen.getByRole('heading', { name: 'Calcolatore' })).toBeInTheDocument()
    expect(risultato().getByText('Scrivi un valore per vedere il risultato.')).toBeInTheDocument()
  })

  it('% CC 60: la lettura della curva media, senza avvisi', async () => {
    const u = apri()
    await u.type(screen.getByLabelText(/^% di capacità di campo/), '60')
    expect(risultato().getByText('Curva media').closest('p, div, li')).toHaveTextContent('35,50')
    expect(risultato().getByText('T1').closest('li')).toHaveTextContent('35,50')
    expect(risultato().queryByText(/fuori dai valori misurati/)).not.toBeInTheDocument()
  })

  it('% CC 10: avviso accanto alla curva media', async () => {
    const u = apri()
    await u.type(screen.getByLabelText(/^% di capacità di campo/), '10')
    expect(risultato().getByText('Curva media').closest('p, div, li')).toHaveTextContent('fuori dai valori misurati')
  })

  it('verso lettura: 35,5 dà 60,0 %', async () => {
    const u = apri()
    await u.click(screen.getByRole('radio', { name: 'Lettura dello strumento' }))
    await u.type(screen.getByLabelText(/^TDR/), '35,5')
    expect(risultato().getByText('Curva media').closest('p, div, li')).toHaveTextContent('60,0 %')
  })

  it('cambiare verso svuota il campo e torna al messaggio', async () => {
    const u = apri()
    await u.type(screen.getByLabelText(/^% di capacità di campo/), '60')
    await u.click(screen.getByRole('radio', { name: 'Lettura dello strumento' }))
    expect(screen.getByLabelText(/^TDR/)).toHaveValue('')
    expect(risultato().getByText('Scrivi un valore per vedere il risultato.')).toBeInTheDocument()
  })

  it('tensiometro: −250 e 250 danno lo stesso risultato', async () => {
    const u = apri(gruppiTens, tensiometro)
    await u.click(screen.getByRole('radio', { name: 'Lettura dello strumento' }))
    const campo = screen.getByLabelText(/^Tensione \(hPa\)/)
    await u.type(campo, '-250')
    const negativo = screen.getByRole('region', { name: 'Risultato del calcolatore' }).textContent
    expect(negativo).toMatch(/%/)
    await u.clear(campo)
    await u.type(campo, '250')
    expect(screen.getByRole('region', { name: 'Risultato del calcolatore' }).textContent).toBe(negativo)
  })

  it('tensiometro, lettura 0: "—" senza eccezioni', async () => {
    const u = apri(gruppiTens, tensiometro)
    await u.click(screen.getByRole('radio', { name: 'Lettura dello strumento' }))
    await u.type(screen.getByLabelText(/^Tensione \(hPa\)/), '0')
    expect(risultato().getByText('Curva media').closest('p, div, li')).toHaveTextContent('—')
    expect(risultato().queryByText(/fuori dai valori misurati/)).not.toBeInTheDocument()
  })

  it('un substrato senza curva scrive "—"', async () => {
    const senza = curvePerSubstrato([vaso('x', 'Vuoto', [], null)], 'lineare')
    const u = apri(senza)
    await u.type(screen.getByLabelText(/^% di capacità di campo/), '60')
    expect(risultato().getByText('Curva media').closest('p, div, li')).toHaveTextContent('—')
    expect(risultato().getByText('X').closest('li')).toHaveTextContent('—')
  })

  it('un vaso senza nome si chiama «Vaso» e la sua posizione, non il suo id', async () => {
    const senzaNome = curvePerSubstrato(vasiDaPesi(
      [{ id: 'uuid-1234', sessione_id: 'S', pianta_id: null, nome: null, substrato: 'Torba', ordine: 2 }],
      [
        peso('secco', 750, null), peso('capacita_campo', 4850, 54),
        peso('asciugatura', 4030, 44.8, 1), peso('asciugatura', 3210, 35.2, 2), peso('asciugatura', 2390, 26.0, 3),
      ].map(p => ({ ...p, campione_id: 'uuid-1234' })),
    ), 'lineare')
    const u = apri(senzaNome)
    await u.type(screen.getByLabelText(/^% di capacità di campo/), '60')
    expect(risultato().getByText('Vaso 2')).toBeInTheDocument()
    expect(screen.queryByText('uuid-1234')).not.toBeInTheDocument()
  })
})
