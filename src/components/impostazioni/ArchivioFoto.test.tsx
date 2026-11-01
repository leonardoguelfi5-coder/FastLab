import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/api/foto', () => ({
  listaFoto: vi.fn(), urlFoto: vi.fn(), archiviaFileFoto: vi.fn(), spazioFoto: vi.fn(), VALIDITA_URL_SECONDI: 3600,
}))
vi.mock('@/api/note', () => ({ listaNote: vi.fn() }))
vi.mock('@/lib/toastSalvato', () => ({ toastSalvato: vi.fn() }))

import { archiviaFileFoto, listaFoto, spazioFoto, urlFoto } from '@/api/foto'
import { listaNote } from '@/api/note'
import type { ConfigEsperimento, Foto } from '@/domain/tipi'
import { toastSalvato } from '@/lib/toastSalvato'
import { useArchivioSessione } from './archivioSessione'
import { SezioneSpazioFoto } from './SezioneSpazioFoto'

const E = 'e0000000-0000-4000-8000-000000000001'
const NOME = 'Hydrochar 2026'
const idDi = (c: string) => `${c.repeat(8)}-0000-4000-8000-000000000000`
const foto = (c: string, extra: Partial<Foto> = {}): Foto => ({
  id: idDi(c), data: '2026-10-28', percorso: `${E}/${idDi(c)}.jpg`, larghezza: 1, altezza: 1, byte: 3,
  pianta_id: null, nota_id: null, archiviata: false, archiviata_il: null, ...extra,
})
const config = (stato: 'in_corso' | 'concluso'): ConfigEsperimento => ({
  esperimento: { id: E, nome: NOME, data_inizio: null, note: '', stato },
  fattori: [], parametri: [], strumenti: [], trattamenti: [], piante: [],
})

/** Le foto "nel database": la lista le legge, `archiviaFileFoto` le segna. */
let db: Foto[]

function apri(stato: 'in_corso' | 'concluso' = 'concluso') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalida = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><SezioneSpazioFoto espId={E} config={config(stato)} /></MemoryRouter>
    </QueryClientProvider>,
  )
  return { utente: userEvent.setup({ delay: null }), invalida }
}
const sezione = () => within(screen.getByRole('region', { name: 'Spazio delle foto' }))
const scarica = () => sezione().getByRole('button', { name: 'Scarica le foto (.zip)' })
const libera = () => sezione().queryByRole('button', { name: 'Libera lo spazio' })
const dialogo = () => within(screen.getByRole('dialog'))
const confermaLibera = () => dialogo().getByRole('button', { name: 'Libera lo spazio' })

beforeEach(() => {
  useArchivioSessione.setState({ scaricati: {} })
  vi.clearAllMocks()
  db = [foto('b'), foto('a')]
  vi.mocked(listaFoto).mockImplementation(async () => structuredClone(db))
  vi.mocked(listaNote).mockResolvedValue([])
  vi.mocked(spazioFoto).mockResolvedValue({ esperimento: 6, progetto: 6 })
  vi.mocked(urlFoto).mockImplementation(async percorsi => new Map(percorsi.map(p => [p, `https://storage/${p}`])))
  vi.mocked(archiviaFileFoto).mockImplementation(async (_e, daArchiviare) => {
    db = db.map(f => (daArchiviare.some(d => d.id === f.id) ? { ...f, archiviata: true, archiviata_il: '2026-11-03T12:00:00Z' } : f))
    return daArchiviare.length
  })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  URL.createObjectURL = vi.fn(() => 'blob:zip') as never
  URL.revokeObjectURL = vi.fn() as never
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

/** Scarica lo zip e aspetta che il download sia completo. */
async function scaricaTutto(utente: ReturnType<typeof apri>['utente']) {
  await waitFor(() => expect(scarica()).toBeEnabled())
  await utente.click(scarica())
  await waitFor(() => expect(libera()).toBeInTheDocument())
}

describe('archivio .zip: esperimento non concluso', () => {
  it('spiega in una riga che l\'archivio si fa a esperimento concluso, e dove si conclude', async () => {
    apri('in_corso')
    expect(await sezione().findByText(/quando l'esperimento è concluso/)).toHaveTextContent(/Esperimento concluso/)
    expect(sezione().queryByRole('button', { name: 'Scarica le foto (.zip)' })).not.toBeInTheDocument()
    expect(libera()).not.toBeInTheDocument()
  })
})

describe('archivio .zip: scarica', () => {
  it('il pulsante c\'è solo per un esperimento concluso, e non spiega il passo che serve a concluderlo', async () => {
    apri()
    expect(await sezione().findByRole('button', { name: 'Scarica le foto (.zip)' })).toBeInTheDocument()
    expect(sezione().queryByText(/quando l'esperimento è concluso/)).not.toBeInTheDocument()
  })

  it('mostra a che punto è, «Preparazione 0 di 2…», finché non ha finito', async () => {
    let finisci!: () => void
    const cancello = new Promise<void>(r => { finisci = r })
    vi.mocked(fetch).mockImplementation((async () => {
      await cancello
      return new Response(new Uint8Array([1]), { status: 200 })
    }) as never)
    const { utente } = apri()
    await waitFor(() => expect(scarica()).toBeEnabled())
    await utente.click(scarica())
    expect(await sezione().findByText('Preparazione 0 di 2…')).toBeInTheDocument()
    expect(scarica()).toBeDisabled()
    finisci()
    await waitFor(() => expect(sezione().queryByText(/Preparazione/)).not.toBeInTheDocument())
  })

  it('a download riuscito dice quante foto ci sono nello zip e offre «Libera lo spazio»', async () => {
    const { utente } = apri()
    expect(libera()).not.toBeInTheDocument()
    await scaricaTutto(utente)
    expect(sezione().getByText(/2 foto nel \.zip/)).toBeInTheDocument()
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1)
  })

  it('senza un download riuscito «Libera lo spazio» non c\'è', async () => {
    apri()
    await waitFor(() => expect(scarica()).toBeEnabled())
    expect(libera()).not.toBeInTheDocument()
  })

  it('se una foto non si scarica mostra l\'errore con «Riprova»: lo zip incompleto non abilita «Libera»', async () => {
    vi.mocked(fetch).mockImplementation((async () => new Response('no', { status: 500 })) as never)
    const { utente } = apri()
    await waitFor(() => expect(scarica()).toBeEnabled())
    await utente.click(scarica())

    expect(await sezione().findByRole('alert')).toHaveTextContent('Una foto non si è scaricata')
    expect(libera()).not.toBeInTheDocument()
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()

    vi.mocked(fetch).mockImplementation((async () => new Response(new Uint8Array([1]), { status: 200 })) as never)
    await utente.click(sezione().getByRole('button', { name: 'Riprova' }))
    await waitFor(() => expect(libera()).toBeInTheDocument())
    expect(sezione().queryByRole('alert')).not.toBeInTheDocument()
  })

  it('senza foto da scaricare lo dice e non offre il download', async () => {
    db = [foto('a', { archiviata: true, archiviata_il: '2026-11-03T12:00:00Z' })]
    apri()
    expect(await sezione().findByText(/Non ci sono foto da scaricare/)).toBeInTheDocument()
    expect(scarica()).toBeDisabled()
  })

  it('non è un\'azione verde: nessun colore di successo sul testo del download', async () => {
    const { utente } = apri()
    await scaricaTutto(utente)
    expect(sezione().getByText(/2 foto nel \.zip/).className).not.toMatch(/success|green|verde/)
  })
})

describe('archivio .zip: libera lo spazio', () => {
  it('chiede il nome dell\'esperimento: il pulsante resta spento finché non corrisponde (maiuscole sì, spazi ai bordi no)', async () => {
    const { utente } = apri()
    await scaricaTutto(utente)
    await utente.click(libera()!)

    expect(confermaLibera()).toBeDisabled()
    const campo = dialogo().getByLabelText(/Nome dell'esperimento/)
    await utente.type(campo, 'hydrochar 2026')
    expect(confermaLibera()).toBeDisabled()
    await utente.clear(campo)
    await utente.type(campo, 'Hydrochar 202')
    expect(confermaLibera()).toBeDisabled()
    await utente.clear(campo)
    await utente.type(campo, `  ${NOME}  `)
    expect(confermaLibera()).toBeEnabled()
    expect(archiviaFileFoto).not.toHaveBeenCalled()
  })

  it('annullando non si tocca niente e «Libera» resta disponibile', async () => {
    const { utente } = apri()
    await scaricaTutto(utente)
    await utente.click(libera()!)
    await utente.click(dialogo().getByRole('button', { name: 'Annulla' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(archiviaFileFoto).not.toHaveBeenCalled()
    expect(libera()).toBeInTheDocument()
  })

  it('archivia solo le foto dello zip: una foto aggiunta dopo il download non si tocca', async () => {
    const { utente, invalida } = apri()
    await scaricaTutto(utente)
    db = [foto('c'), ...db] // aggiunta dopo il download
    await utente.click(libera()!)
    await utente.type(dialogo().getByLabelText(/Nome dell'esperimento/), NOME)
    await utente.click(confermaLibera())

    await waitFor(() => expect(toastSalvato).toHaveBeenCalledWith('Spazio liberato: 2 foto archiviate.'))
    expect(vi.mocked(archiviaFileFoto).mock.calls[0][1].map(f => f.id).sort()).toEqual([idDi('a'), idDi('b')])
    expect(db.find(f => f.id === idDi('c'))?.archiviata).toBe(false)
    expect(invalida).toHaveBeenCalledWith({ queryKey: ['foto', E] })
    // Finito: il dialogo si chiude e «Libera» sparisce (il download è stato usato).
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(libera()).not.toBeInTheDocument()
  })

  it('con una sola foto il toast è al singolare', async () => {
    db = [foto('a')]
    const { utente } = apri()
    await scaricaTutto(utente)
    await utente.click(libera()!)
    await utente.type(dialogo().getByLabelText(/Nome dell'esperimento/), NOME)
    await utente.click(confermaLibera())
    await waitFor(() => expect(toastSalvato).toHaveBeenCalledWith('Spazio liberato: 1 foto archiviata.'))
  })

  it('un errore a metà mostra l\'errore con «Riprova» nel dialogo; un nuovo tentativo completa', async () => {
    vi.mocked(archiviaFileFoto).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { utente } = apri()
    await scaricaTutto(utente)
    await utente.click(libera()!)
    await utente.type(dialogo().getByLabelText(/Nome dell'esperimento/), NOME)
    await utente.click(confermaLibera())

    expect(await dialogo().findByRole('alert')).toHaveTextContent('Il server non risponde')
    expect(toastSalvato).not.toHaveBeenCalled()
    // Il download vale ancora: il nome è già scritto, basta riprovare.
    await utente.click(dialogo().getByRole('button', { name: 'Riprova' }))
    await waitFor(() => expect(toastSalvato).toHaveBeenCalledWith('Spazio liberato: 2 foto archiviate.'))
    expect(archiviaFileFoto).toHaveBeenCalledTimes(2)
    expect(libera()).not.toBeInTheDocument()
  })

  it('mentre libera il pulsante è spento e il dialogo non si chiude', async () => {
    let finisci!: () => void
    vi.mocked(archiviaFileFoto).mockImplementationOnce(async (_e, d) => {
      await new Promise<void>(r => { finisci = r })
      return d.length
    })
    const { utente } = apri()
    await scaricaTutto(utente)
    await utente.click(libera()!)
    await utente.type(dialogo().getByLabelText(/Nome dell'esperimento/), NOME)
    await utente.click(confermaLibera())

    expect(await dialogo().findByText('Libero lo spazio…')).toBeInTheDocument()
    expect(confermaLibera()).toBeDisabled()
    await utente.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    finisci()
    await waitFor(() => expect(toastSalvato).toHaveBeenCalled())
  })
})
