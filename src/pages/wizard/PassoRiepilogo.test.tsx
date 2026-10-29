import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/api/esperimenti', () => ({ caricaConfig: vi.fn(), creaEsperimento: vi.fn() }))

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

describe('PassoRiepilogo: parametri in nessuna passata', () => {
  it('li nomina in un avviso che non blocca la creazione', () => {
    const b = conPiante(['1'])
    b.parametri.push(parametro(' SPAD '), parametro('Note', { tipo: 'testo' }))
    rendi(b)

    expect(screen.getByText(
      '"SPAD", "Note" non sono in nessuna passata: non si potranno misurare finché non li aggiungi a una passata (anche dopo, dalle impostazioni).',
    )).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crea esperimento' })).toBeEnabled()
  })

  it('con un parametro solo l\'avviso è al singolare', () => {
    const b = conPiante(['1'])
    b.parametri.push(parametro('SPAD'))
    rendi(b)

    expect(screen.getByText(
      '"SPAD" non è in nessuna passata: non si potrà misurare finché non lo aggiungi a una passata (anche dopo, dalle impostazioni).',
    )).toBeInTheDocument()
  })

  it('senza parametri fuori dalle passate non c\'è l\'avviso', () => {
    rendi(conPiante(['1']))
    expect(screen.queryByText(/in nessuna passata/)).not.toBeInTheDocument()
  })
})
