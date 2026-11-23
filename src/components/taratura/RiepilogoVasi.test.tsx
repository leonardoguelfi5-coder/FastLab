import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { percentualeCCCalcolata, precisioneDeiPesi } from '@/domain/pesatura/calcoli'
import type { CampionePesatura, Peso, SessionePesatura, TipoPeso } from '@/domain/pesatura/tipi'
import { formattaCifre } from '@/lib/numeri'
import { RiepilogoVasi } from './RiepilogoVasi'

const sessione: SessionePesatura = {
  id: 'S', esperimento_id: 'E', titolo: 'Taratura', tipo: 'vasi', unita: 'g',
  impostazioni: { repliche: 1, rapportoTampone: null, sensore: { tipo: 'tdr', unita: 'raw' } },
  data: '2026-11-10', nota: null, conclusa: false,
}
const v1: CampionePesatura = { id: 'V1', sessione_id: 'S', pianta_id: null, nome: 'V1', substrato: 'Torba', ordine: 1 }
const peso = (id: string, tipo: TipoPeso, valore: number, lettura: number | null, giorno: number, creato_da = 'io'): Peso => ({
  id, campione_id: 'V1', replica: 1, tipo, valore, lettura, misurato_il: `2026-11-1${giorno}T10:00:00Z`, creato_da,
})
const secco = peso('s', 'secco', 750, null, 0)
const cc = peso('c', 'capacita_campo', 4850, 54, 1)
const p1 = peso('a1', 'asciugatura', 4030, 44.8, 2)
const p2 = peso('a2', 'asciugatura', 3210, 35.2, 3)
const tutti = [secco, cc, p1, p2]

function apri(props: Partial<Parameters<typeof RiepilogoVasi>[0]> = {}) {
  const onSalva = vi.fn<(p: Peso) => Promise<void>>().mockResolvedValue(undefined)
  const onElimina = vi.fn<(p: Peso) => Promise<void>>().mockResolvedValue(undefined)
  render(
    <RiepilogoVasi
      sessione={sessione} campioni={[v1]} pesi={tutti} puoAggiungere puoCorreggere={() => true} senzaRete={false}
      onSalva={onSalva} onElimina={onElimina} {...props}
    />,
  )
  return { u: userEvent.setup({ delay: null }), onSalva, onElimina }
}
const riga = (testo: string) => screen.getByText(testo).closest('li') as HTMLElement

describe('RiepilogoVasi', () => {
  it('mostra il substrato, il vaso, la CC con la lettura e la % CC di ogni punto', () => {
    apri()
    expect(screen.getByRole('heading', { name: 'Torba' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'V1' })).toBeInTheDocument()
    expect(riga('Secco')).toHaveTextContent('750 g')
    expect(riga('Capacità di campo')).toHaveTextContent('4850 g')
    expect(riga('Capacità di campo')).toHaveTextContent('54')
    const attesa = percentualeCCCalcolata(3210, 750, 4850, precisioneDeiPesi(tutti))
    expect(attesa?.valore).toBeCloseTo(60)
    expect(riga('3210 g')).toHaveTextContent(`${formattaCifre(attesa!.valore, attesa!.cifre)} %`)
    expect(riga('3210 g')).toHaveTextContent('35,2')
  })

  it('Modifica della CC: campi compilati, la nuova lettura si salva con lo stesso id e la stessa data', async () => {
    const { u, onSalva } = apri()
    await u.click(screen.getByRole('button', { name: 'Modifica Capacità di campo, V1' }))
    const modulo = within(screen.getByRole('form', { name: 'Modifica Capacità di campo, V1' }))
    expect(modulo.getByLabelText(/^Peso/)).toHaveValue('4850')
    const lettura = modulo.getByLabelText(/^TDR \(raw\)/)
    expect(lettura).toHaveValue('54')
    await u.clear(lettura)
    await u.type(lettura, '55')
    await u.click(modulo.getByRole('button', { name: 'Salva' }))
    expect(onSalva).toHaveBeenCalledWith({ ...cc, lettura: 55 })
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })

  it('Modifica del secco: niente lettura, si salva lettura null', async () => {
    const { u, onSalva } = apri()
    await u.click(screen.getByRole('button', { name: 'Modifica Secco, V1' }))
    const modulo = within(screen.getByRole('form', { name: 'Modifica Secco, V1' }))
    expect(modulo.queryByLabelText(/^TDR/)).not.toBeInTheDocument()
    const campo = modulo.getByLabelText(/^Peso/)
    await u.clear(campo)
    await u.type(campo, '760')
    await u.click(modulo.getByRole('button', { name: 'Salva' }))
    expect(onSalva).toHaveBeenCalledWith({ ...secco, valore: 760, lettura: null })
  })

  it('Annulla chiude il modulo senza salvare', async () => {
    const { u, onSalva } = apri()
    await u.click(screen.getByRole('button', { name: 'Modifica Secco, V1' }))
    await u.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(onSalva).not.toHaveBeenCalled()
  })

  it('Aggiungi pesata crea un punto di asciugatura nuovo', async () => {
    const { u, onSalva } = apri()
    await u.click(screen.getByRole('button', { name: 'Aggiungi pesata, V1' }))
    const modulo = within(screen.getByRole('form', { name: 'Nuova pesata, V1' }))
    expect(modulo.getByLabelText(/^Peso/)).toHaveValue('')
    await u.type(modulo.getByLabelText(/^Peso/), '2500')
    await u.type(modulo.getByLabelText(/^TDR \(raw\)/), '26')
    await u.click(modulo.getByRole('button', { name: 'Salva' }))
    expect(onSalva).toHaveBeenCalledTimes(1)
    const nuovo = onSalva.mock.calls[0][0]
    expect(nuovo).toMatchObject({ campione_id: 'V1', tipo: 'asciugatura', replica: 1, valore: 2500, lettura: 26 })
    expect(tutti.map(p => p.id)).not.toContain(nuovo.id)
    expect(nuovo.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(Number.isNaN(Date.parse(nuovo.misurato_il))).toBe(false)
  })

  it('senza lettura Salva chiede di scriverla e non salva', async () => {
    const { u, onSalva } = apri()
    await u.click(screen.getByRole('button', { name: 'Aggiungi pesata, V1' }))
    await u.type(screen.getByLabelText(/^Peso/), '2500')
    await u.click(screen.getByRole('button', { name: 'Salva' }))
    expect(screen.getByText('Scrivi la lettura del sensore.')).toBeInTheDocument()
    expect(onSalva).not.toHaveBeenCalled()
  })

  it('senza peso Salva chiede di scriverlo', async () => {
    const { u, onSalva } = apri()
    await u.click(screen.getByRole('button', { name: 'Modifica Secco, V1' }))
    await u.clear(screen.getByLabelText(/^Peso/))
    await u.click(screen.getByRole('button', { name: 'Salva' }))
    expect(screen.getByText('Scrivi il peso.')).toBeInTheDocument()
    expect(onSalva).not.toHaveBeenCalled()
  })

  it('Elimina chiede conferma: Elimina chiama onElimina, Tieni la pesata no', async () => {
    const { u, onElimina } = apri()
    const elimina = within(riga('3210 g')).getByRole('button', { name: /^Elimina .*, V1$/ })
    await u.click(elimina)
    expect(screen.getByRole('dialog', { name: 'Eliminare questa pesata?' })).toHaveTextContent('Non si può annullare.')
    await u.click(screen.getByRole('button', { name: 'Tieni la pesata' }))
    expect(onElimina).not.toHaveBeenCalled()
    await u.click(elimina)
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Elimina' }))
    expect(onElimina).toHaveBeenCalledWith(p2)
  })

  it('una CC senza lettura dice «manca la lettura»', () => {
    apri({ pesi: [secco, { ...cc, lettura: null }, p1] })
    expect(riga('Capacità di campo')).toHaveTextContent('manca la lettura')
  })

  it('un vaso senza secco: «da pesare» con Pesa, e le % CC dei punti «—»', async () => {
    const { u, onSalva } = apri({ pesi: [cc, p1, p2] })
    expect(riga('Secco')).toHaveTextContent('da pesare')
    expect(riga('3210 g')).toHaveTextContent('% CC—')
    await u.click(screen.getByRole('button', { name: 'Pesa Secco, V1' }))
    const modulo = within(screen.getByRole('form', { name: 'Pesa Secco, V1' }))
    expect(modulo.getByLabelText(/^Peso/)).toHaveValue('')
    expect(modulo.queryByLabelText(/^TDR/)).not.toBeInTheDocument()
    await u.type(modulo.getByLabelText(/^Peso/), '750')
    await u.click(modulo.getByRole('button', { name: 'Salva' }))
    expect(onSalva.mock.calls[0][0]).toMatchObject({ campione_id: 'V1', tipo: 'secco', replica: 1, valore: 750, lettura: null })
  })

  it('senza permesso di aggiungere niente Pesa né Aggiungi pesata', () => {
    apri({ pesi: [cc], puoAggiungere: false })
    expect(riga('Secco')).toHaveTextContent('da pesare')
    expect(screen.queryByRole('button', { name: /^Pesa/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Aggiungi pesata/ })).not.toBeInTheDocument()
  })

  it('Modifica ed Elimina solo sui pesi che posso correggere', () => {
    apri({ pesi: [secco, { ...cc, creato_da: 'altro' }, p1, { ...p2, creato_da: 'altro' }], puoCorreggere: id => id === 'io' })
    expect(within(riga('Capacità di campo')).queryByRole('button')).not.toBeInTheDocument()
    expect(within(riga('3210 g')).queryByRole('button')).not.toBeInTheDocument()
    expect(within(riga('Secco')).getByRole('button', { name: 'Modifica Secco, V1' })).toBeInTheDocument()
    expect(within(riga('Secco')).getByRole('button', { name: 'Elimina Secco, V1' })).toBeInTheDocument()
    expect(within(riga('4030 g')).getAllByRole('button')).toHaveLength(2)
  })

  it('senza rete i pulsanti che scrivono sono disattivati', () => {
    apri({ pesi: [cc, p1], senzaRete: true })
    const pulsanti = screen.getAllByRole('button')
    expect(pulsanti.length).toBeGreaterThanOrEqual(6)
    for (const b of pulsanti) expect(b).toBeDisabled()
  })

  it('se onSalva non riesce il messaggio resta nel modulo con i campi', async () => {
    const onSalva = vi.fn<(p: Peso) => Promise<void>>().mockRejectedValue(new Error('qualcosa'))
    const { u } = apri({ onSalva })
    await u.click(screen.getByRole('button', { name: 'Modifica Capacità di campo, V1' }))
    const modulo = within(screen.getByRole('form', { name: 'Modifica Capacità di campo, V1' }))
    const lettura = modulo.getByLabelText(/^TDR \(raw\)/)
    await u.clear(lettura)
    await u.type(lettura, '55')
    await u.click(modulo.getByRole('button', { name: 'Salva' }))
    expect(await modulo.findByRole('alert')).toHaveTextContent('Errore imprevisto: qualcosa')
    expect(modulo.getByLabelText(/^TDR \(raw\)/)).toHaveValue('55')
    expect(modulo.getByLabelText(/^Peso/)).toHaveValue('4850')
  })

  it('senza campioni lo dice', () => {
    apri({ campioni: [] })
    expect(screen.getByText('Questa sessione non ha vasi.')).toBeInTheDocument()
  })
})
