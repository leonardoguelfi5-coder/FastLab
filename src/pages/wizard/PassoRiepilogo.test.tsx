import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/api/esperimenti', () => ({ caricaConfig: vi.fn(), creaEsperimento: vi.fn() }))

import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import { conPiante, parametro } from '@/domain/test-helpers'
import type { BozzaEsperimento } from '@/domain/tipi'
import { PassoRiepilogo } from './PassoRiepilogo'

function rendi(bozza: BozzaEsperimento) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <PassoRiepilogo bozza={bozza} giaTentato={false} onTentativo={() => {}} onCreato={() => {}} onPassoPrecedente={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PassoRiepilogo: parametri in nessuno strumento', () => {
  it('li nomina in un avviso che non blocca la creazione', () => {
    const b = conPiante(['1'])
    b.parametri.push(parametro(' SPAD '), parametro('Note', { tipo: 'testo' }))
    rendi(b)

    expect(screen.getByText(
      '"SPAD", "Note" non sono in nessuno strumento: non si potranno misurare finché non li aggiungi a uno strumento (anche dopo, dalle impostazioni).',
    )).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crea esperimento' })).toBeEnabled()
  })

  it('con un parametro solo l\'avviso è al singolare', () => {
    const b = conPiante(['1'])
    b.parametri.push(parametro('SPAD'))
    rendi(b)

    expect(screen.getByText(
      '"SPAD" non è in nessuno strumento: non si potrà misurare finché non lo aggiungi a uno strumento (anche dopo, dalle impostazioni).',
    )).toBeInTheDocument()
  })

  it('senza parametri fuori dagli strumenti non c\'è l\'avviso', () => {
    rendi(conPiante(['1']))
    expect(screen.queryByText(/in nessuno strumento/)).not.toBeInTheDocument()
  })
})

/** Il valore mostrato nel riepilogo accanto a una voce (Strumenti, Voci fenologiche, …). */
const conteggio = (voce: string) =>
  within(screen.getByText(voce, { selector: 'dt' }).parentElement as HTMLElement).getByRole('definition')

describe('PassoRiepilogo: conteggi', () => {
  it('conta gli strumenti (senza la tabella fenologica) e le sue voci, non più parametri e passate', () => {
    rendi(bozzaHydrochar(SEMI_CATALOGO))

    expect(conteggio('Strumenti')).toHaveTextContent('3')
    expect(conteggio('Voci fenologiche')).toHaveTextContent('7')
    expect(conteggio('Piante')).toHaveTextContent('56')
    expect(screen.queryByText('Parametri', { selector: 'dt' })).not.toBeInTheDocument()
    expect(screen.queryByText('Passate', { selector: 'dt' })).not.toBeInTheDocument()
  })

  it('senza tabella fenologica le voci fenologiche sono 0', () => {
    rendi(conPiante(['1']))
    expect(conteggio('Strumenti')).toHaveTextContent('1')
    expect(conteggio('Voci fenologiche')).toHaveTextContent('0')
  })

  it('i parametri archiviati non contano tra le voci fenologiche', () => {
    const b = bozzaHydrochar(SEMI_CATALOGO)
    const tabella = b.strumenti.find(s => s.tipo === 'fenologico')!
    const note = b.parametri.find(p => p.id === tabella.parametri.at(-1)!.parametro_id)!
    note.archiviato = true
    rendi(b)
    expect(conteggio('Voci fenologiche')).toHaveTextContent('6')
  })

  it('gli errori della bozza sono elencati (es. due tabelle fenologiche)', () => {
    const b = bozzaHydrochar(SEMI_CATALOGO)
    b.strumenti.push({ ...b.strumenti[3], id: 'seconda', nome: 'Altra tabella' })
    rendi(b)
    expect(within(screen.getByRole('list', { name: 'Da sistemare' })).getByText('Può esserci una sola tabella fenologica.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crea esperimento' })).toBeDisabled()
  })
})
