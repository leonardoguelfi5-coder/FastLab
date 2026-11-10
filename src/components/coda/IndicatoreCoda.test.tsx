import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

vi.mock('@/lib/supabase', () => ({
  // La sessione con cui partono gli invii della coda d'invio: dell'utente u1 dei test.
  supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } }, error: null }) } },
}))
vi.mock('@/api/misure', () => ({ salvaMisura: vi.fn() }))
vi.mock('@/lib/toastSalvato', () => ({ toastSalvato: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }))

import { salvaMisura } from '@/api/misure'
import type { Misura } from '@/domain/tipi'
import { accoda, aggiornaVoce, impostaUtenteCoda, vociDi } from '@/lib/coda/codaMisure'
import { ErroreRete } from '@/lib/rete'
import { toastSalvato } from '@/lib/toastSalvato'
import { IndicatoreCoda } from './IndicatoreCoda'

const OGGI = '2026-10-28'
const misura = (id: string, extra: Partial<Misura> = {}): Misura => ({
  id, pianta_id: `p-${id}`, strumento_id: 'spad', data_rilievo: OGGI, ora: '09:12', valori: {}, ...extra,
})
const metti = (id: string, etichetta: string, extra: Partial<Misura> = {}) =>
  accoda('u1', 'E', misura(id, extra), { etichetta, strumento: '💚 SPAD', sulServer: false })
function rifiuta(id: string, errore: string) {
  const v = vociDi('u1').find(x => x.misura.id === id)!
  aggiornaVoce('u1', id, v.revisione, x => ({ ...x, stato: 'rifiutata', errore }))
}

function Posizione() {
  return <p data-testid="posizione">{useLocation().pathname}</p>
}

function mostra() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/campo']}>
        <Routes><Route path="*" element={<><IndicatoreCoda /><Posizione /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 28, 10, 0))
  impostaUtenteCoda('u1')
  vi.mocked(salvaMisura).mockResolvedValue()
})
afterEach(() => {
  impostaUtenteCoda(null)
  vi.useRealTimers()
})

describe('IndicatoreCoda', () => {
  it('senza voci non c\'è', () => {
    mostra()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('dice quante misure sono da inviare, al singolare e al plurale, e si aggiorna da solo', () => {
    metti('m1', '35')
    mostra()
    expect(screen.getByRole('button', { name: '1 misura da inviare' })).toBeInTheDocument()
    act(() => { metti('m2', '36'); metti('m3', '37') })
    expect(screen.getByRole('button', { name: '3 misure da inviare' })).toBeInTheDocument()
  })

  it('non mostra le voci di un altro utente', () => {
    accoda('u2', 'E', misura('m9'), { etichetta: '9', strumento: 'SPAD', sulServer: false })
    mostra()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('le rifiutate: "1 non inviata" in tono errore, prima di quelle da inviare', () => {
    metti('m1', '35')
    metti('m2', '36')
    rifiuta('m1', 'La pianta non c\'è più nell\'esperimento.')
    mostra()
    const pulsante = screen.getByRole('button', { name: '1 non inviata · 1 misura da inviare' })
    expect(within(pulsante).getByText('1 non inviata')).toHaveClass('text-errore')
  })

  it('apre il pannello: una riga per misura con pianta, strumento e ora, e il motivo delle rifiutate', async () => {
    const utente = userEvent.setup()
    metti('m1', '35')
    metti('m2', '36', { data_rilievo: '2026-10-27', ora: '18:40' })
    rifiuta('m2', 'La pianta non c\'è più nell\'esperimento.')
    mostra()
    await utente.click(screen.getByRole('button', { name: /da inviare/ }))
    const pannello = await screen.findByRole('dialog', { name: 'Misure da inviare' })
    const righe = within(pannello).getAllByRole('listitem')
    expect(righe[0]).toHaveTextContent('#35 · 💚 SPAD · 09:12')
    expect(righe[0]).toHaveTextContent('In attesa di rete')
    expect(righe[1]).toHaveTextContent('#36 · 💚 SPAD · 27/10/2026 18:40')
    expect(righe[1]).toHaveTextContent('Non inviata: La pianta non c\'è più nell\'esperimento.')
    expect(within(righe[1]).getByRole('link', { name: 'Apri la pianta' })).toHaveAttribute('href', '/esperimenti/E/piante/p-m2')
  })

  it('"Invia ora" manda le misure: toast verde solo all\'arrivo, poi l\'indicatore sparisce', async () => {
    const utente = userEvent.setup()
    metti('m1', '35')
    let arriva: () => void = () => {}
    vi.mocked(salvaMisura).mockImplementationOnce(() => new Promise(ok => { arriva = ok }))
    mostra()
    await utente.click(screen.getByRole('button', { name: '1 misura da inviare' }))
    await utente.click(await screen.findByRole('button', { name: 'Invia ora' }))
    expect(await screen.findByRole('button', { name: 'Invio…' })).toBeDisabled()
    expect(toastSalvato).not.toHaveBeenCalled()
    act(() => arriva())
    await waitFor(() => expect(toastSalvato).toHaveBeenCalledWith('Pianta #35 salvata ✓'))
    await waitFor(() => expect(screen.queryByRole('button', { name: /da inviare/ })).not.toBeInTheDocument())
  })

  it('"Invia ora" ritenta subito anche una misura che aspetta dopo un errore di rete', async () => {
    const utente = userEvent.setup()
    metti('m1', '35')
    const v = vociDi('u1')[0]
    aggiornaVoce('u1', 'm1', v.revisione, x => ({ ...x, tentativi: 2, prossimoTentativo: Date.now() + 60_000, errore: 'Rete debole: riprova.' }))
    vi.mocked(salvaMisura).mockRejectedValueOnce(new ErroreRete('rete'))
    mostra()
    await utente.click(screen.getByRole('button', { name: '1 misura da inviare' }))
    const pannello = await screen.findByRole('dialog', { name: 'Misure da inviare' })
    expect(pannello).toHaveTextContent('Ultimo tentativo: Rete debole: riprova.')
    await utente.click(within(pannello).getByRole('button', { name: 'Invia ora' }))
    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(vociDi('u1')[0].tentativi).toBe(3))
  })

  it('"Scarta" una rifiutata chiede conferma, poi la toglie dalla coda', async () => {
    const utente = userEvent.setup()
    metti('m1', '35')
    rifiuta('m1', 'No.')
    mostra()
    await utente.click(screen.getByRole('button', { name: '1 non inviata' }))
    await utente.click(within(await screen.findByRole('dialog', { name: 'Misure da inviare' })).getByRole('button', { name: 'Scarta' }))
    const conferma = await screen.findByRole('dialog', { name: 'Scartare la misura?' })
    expect(conferma).toHaveTextContent('Scartare la misura di #35 delle 09:12? I suoi valori andranno persi.')
    await utente.click(within(conferma).getByRole('button', { name: 'Annulla' }))
    expect(vociDi('u1')).toHaveLength(1)

    await utente.click(within(screen.getByRole('dialog', { name: 'Misure da inviare' })).getByRole('button', { name: 'Scarta' }))
    await utente.click(within(await screen.findByRole('dialog', { name: 'Scartare la misura?' })).getByRole('button', { name: 'Scarta' }))
    expect(vociDi('u1')).toEqual([])
  })

  it('"Apri la pianta" chiude il pannello e porta alla scheda', async () => {
    const utente = userEvent.setup()
    metti('m1', '35')
    rifiuta('m1', 'No.')
    mostra()
    await utente.click(screen.getByRole('button', { name: '1 non inviata' }))
    await utente.click(within(await screen.findByRole('dialog')).getByRole('link', { name: 'Apri la pianta' }))
    expect(screen.getByTestId('posizione')).toHaveTextContent('/esperimenti/E/piante/p-m1')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
