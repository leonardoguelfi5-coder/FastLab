import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { curvePerSubstrato, PERCENTUALI_TABELLA, type Vaso } from '@/domain/pesatura/curva'
import { ConsultaCurva } from './ConsultaCurva'

const vaso = (id: string, substrato: string, secco: number, cc: number, punti: [number, number][]): Vaso => ({
  campione: { id, sessione_id: 'S', pianta_id: null, nome: id, substrato, ordine: 1 },
  secco, cc, punti: punti.map(([lettura, pcc]) => ({ lettura, pcc })),
})
// lineare: pcc = 100 − 2·lettura, letture misurate da 10 a 30
const gruppi = curvePerSubstrato([
  vaso('V1', 'Torba', 100, 200, [[10, 80], [20, 60], [30, 40]]),
  vaso('V2', 'Torba', 100, 300, [[10, 80], [20, 60], [30, 40]]),
], 'lineare')
const sensore = { tipo: 'umidita' as const, unita: '%' }

function apri() {
  render(<ConsultaCurva gruppi={gruppi} sensore={sensore} unita="g" />)
  return userEvent.setup({ delay: null })
}
const risultato = () => within(screen.getByRole('region', { name: 'Peso dei vasi' }))

describe('ConsultaCurva', () => {
  it('per % di capacità di campo: peso di ogni vaso e media del substrato', async () => {
    const u = apri()
    await u.type(screen.getByLabelText(/^% di capacità di campo/), '50')
    // V1: 100 + 0,5·100 = 150; V2: 100 + 0,5·200 = 200; media 175
    expect(risultato().getByText('V1').closest('li')).toHaveTextContent('150 g')
    expect(risultato().getByText('V2').closest('li')).toHaveTextContent('200 g')
    expect(risultato().getByText('Torba').closest('section')).toHaveTextContent('Media 175 g')
    expect(risultato().queryByText(/fuori dai valori misurati/)).not.toBeInTheDocument()
  })

  it('per lettura del sensore, con l\'avviso accanto ai pesi estrapolati', async () => {
    const u = apri()
    await u.click(screen.getByRole('radio', { name: /Lettura/ }))
    await u.type(screen.getByLabelText(/^Umidità \(%\)/), '40')
    // lettura 40 > 30 misurato: pcc = 20 → V1 120 g, estrapolato
    expect(risultato().getByText('V1').closest('li')).toHaveTextContent('120 g')
    expect(risultato().getByText('V1').closest('li')).toHaveTextContent('fuori dai valori misurati')
    expect(risultato().getByText('Torba').closest('section')).toHaveTextContent('Media 130 g')
  })

  it('una lettura dentro il campo misurato non ha avvisi', async () => {
    const u = apri()
    await u.click(screen.getByRole('radio', { name: /Lettura/ }))
    await u.type(screen.getByLabelText(/^Umidità \(%\)/), '20')
    expect(risultato().getByText('V1').closest('li')).toHaveTextContent('160 g')
    expect(risultato().queryByText('fuori dai valori misurati')).not.toBeInTheDocument()
  })

  it('senza un valore chiede di scriverlo', () => {
    apri()
    expect(risultato().getByText(/Scrivi un valore/)).toBeInTheDocument()
  })

  it('la tabella sotto ha una colonna per ogni percentuale di PERCENTUALI_TABELLA', () => {
    apri()
    const tabella = within(screen.getByRole('table'))
    for (const p of PERCENTUALI_TABELLA) expect(tabella.getByRole('columnheader', { name: `${p} %` })).toBeInTheDocument()
    // V1: secco 100, CC 200 → 100 % = 200, 60 % = 160; V2: CC 300 → 100 % = 300; media del 100 % = 250
    expect(tabella.getByRole('row', { name: /^V1/ })).toHaveTextContent(/200.*160/)
    expect(tabella.getByRole('row', { name: /^V2/ })).toHaveTextContent('300')
    expect(tabella.getByRole('row', { name: /^Media/ })).toHaveTextContent('250')
  })
})
