import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/api/auth', () => ({ accedi: vi.fn(), registrati: vi.fn(), esci: vi.fn(), useSessione: vi.fn() }))
vi.mock('@/api/inviti', () => ({ sonoAdmin: vi.fn(), listaInviti: vi.fn(), creaInvito: vi.fn(), revocaInvito: vi.fn() }))
vi.mock('@/api/esperimenti', () => ({ listaEsperimenti: vi.fn(), caricaConfig: vi.fn(), aggiornaEsperimento: vi.fn() }))
vi.mock('@/api/configurazione', () => ({
  parametriConDati: vi.fn(), pianteConDati: vi.fn(), pianteNonEliminabili: vi.fn(), conteggiStrumenti: vi.fn(),
}))
vi.mock('@/api/foto', () => ({ listaFoto: vi.fn(), VALIDITA_URL_SECONDI: 3600 }))
vi.mock('@/api/spazio', () => ({ spazioProgetto: vi.fn() }))
vi.mock('@/api/catalogo', () => ({ listaCatalogo: vi.fn() }))
vi.mock('@/api/persone', () => ({ ruoloIn: vi.fn(), membriDi: vi.fn(), aggiungiMembro: vi.fn(), togliMembro: vi.fn() }))
vi.mock('@/lib/toastSalvato', () => ({ toastSalvato: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }) }))

import { toast } from 'sonner'
import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { caricaConfig, listaEsperimenti } from '@/api/esperimenti'
import { parametriConDati, pianteConDati, pianteNonEliminabili, conteggiStrumenti } from '@/api/configurazione'
import { listaFoto } from '@/api/foto'
import { spazioProgetto } from '@/api/spazio'
import { listaCatalogo } from '@/api/catalogo'
import { aggiungiMembro, membriDi, ruoloIn, togliMembro, type Membro } from '@/api/persone'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import type { ConfigEsperimento } from '@/domain/tipi'
import type { Ruolo } from '@/domain/ruoli'
import { toastSalvato } from '@/lib/toastSalvato'
import { Impostazioni } from './IndiceImpostazioni'
import { ImpostazioniSezione } from './PaginaSezione'

const SESSIONE = { user: { id: 'io', email: 'io@example.it' } } as Session
const ELENCO: Membro[] = [
  { utente_id: 'io', email: 'io@example.it', ruolo: 'proprietario', sei_tu: true },
  { utente_id: 'u2', email: 'anna@example.it', ruolo: 'rilevatore', sei_tu: false },
  { utente_id: 'u3', email: 'luca@example.it', ruolo: 'lettore', sei_tu: false },
]

let config: ConfigEsperimento
let membri: Membro[]

const posizione = () => screen.getByTestId('posizione')
function Posizione() {
  return <p data-testid="posizione">{useLocation().pathname}</p>
}

function apri(percorso: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[percorso]}>
        <Routes>
          <Route path="/esperimenti/:espId/impostazioni" element={<Impostazioni />} />
          <Route path="/esperimenti/:espId/impostazioni/:sezione" element={<ImpostazioniSezione />} />
          <Route path="*" element={<p>altrove</p>} />
        </Routes>
        <Posizione />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup({ delay: null })
}

beforeEach(() => {
  vi.clearAllMocks()
  config = bozzaHydrochar(SEMI_CATALOGO)
  config.esperimento.id = 'E'
  membri = structuredClone(ELENCO)
  vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(listaEsperimenti).mockResolvedValue([])
  vi.mocked(caricaConfig).mockImplementation(async () => structuredClone(config))
  vi.mocked(parametriConDati).mockResolvedValue(new Set())
  vi.mocked(pianteConDati).mockResolvedValue(new Set())
  vi.mocked(pianteNonEliminabili).mockResolvedValue(new Set())
  vi.mocked(conteggiStrumenti).mockResolvedValue(new Map())
  vi.mocked(listaFoto).mockResolvedValue([])
  vi.mocked(listaCatalogo).mockResolvedValue([])
  vi.mocked(spazioProgetto).mockResolvedValue({
    database_byte: 38_400_000, foto_byte: 210_000_000,
    esperimento: { misure: 3120, note: 14, foto: 85, dati_byte: 1_830_000, foto_byte: 29_000_000 },
  })
  vi.mocked(ruoloIn).mockResolvedValue('proprietario')
  vi.mocked(membriDi).mockImplementation(async () => structuredClone(membri))
  vi.mocked(aggiungiMembro).mockResolvedValue(undefined)
  vi.mocked(togliMembro).mockResolvedValue(undefined)
})

describe('indice delle Impostazioni', () => {
  it('una riga per pagina con il riassunto, `›` e un bersaglio di almeno 44 px', async () => {
    apri('/esperimenti/E/impostazioni')
    const indice = await screen.findByRole('navigation', { name: 'Impostazioni' })
    await waitFor(() => expect(within(indice).getByText('database 38 MB, foto 210 MB')).toBeInTheDocument())
    const righe = within(indice).getAllByRole('link')
    expect(righe.map(r => r.getAttribute('href'))).toEqual([
      'generale', 'trattamenti', 'piante', 'strumenti', 'fenologia', 'spazio', 'persone',
    ].map(s => `/esperimenti/E/impostazioni/${s}`))
    expect(within(indice).getByText('56 piante, 8 trattamenti')).toBeInTheDocument()
    expect(await within(indice).findByText('3 persone')).toBeInTheDocument()
    expect(within(indice).getByText('8 trattamenti')).toBeInTheDocument()
    for (const r of righe) expect(r.className).toMatch(/min-h-14/)
  })

  it('la freccia porta alla home dell\'esperimento', async () => {
    const utente = apri('/esperimenti/E/impostazioni')
    await screen.findByRole('navigation', { name: 'Impostazioni' })
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    expect(screen.getByText('altrove')).toBeInTheDocument()
  })

  it('una sezione che non esiste rimanda all\'indice', async () => {
    apri('/esperimenti/E/impostazioni/boh')
    await screen.findByRole('navigation', { name: 'Impostazioni' })
    expect(posizione()).toHaveTextContent(/^\/esperimenti\/E\/impostazioni$/)
  })

  it('una riga porta alla pagina', async () => {
    const utente = apri('/esperimenti/E/impostazioni')
    await utente.click(await screen.findByRole('link', { name: /^Persone/ }))
    expect(await screen.findByRole('region', { name: 'Persone' })).toBeInTheDocument()
  })
})

describe('Persone: il proprietario', () => {
  const pagina = () => apri('/esperimenti/E/impostazioni/persone')

  it('vede l\'elenco con email, ruolo a parole e "tu"', async () => {
    pagina()
    const elenco = await screen.findByRole('list', { name: 'Persone dell\'esperimento' })
    const righe = await within(elenco).findAllByRole('listitem')
    expect(righe).toHaveLength(3)
    expect(within(righe[0]).getByText('io@example.it')).toBeInTheDocument()
    expect(within(righe[0]).getByText('tu')).toBeInTheDocument()
    expect(within(righe[0]).getByText('Proprietario')).toBeInTheDocument()
    expect(within(righe[1]).getByLabelText('Ruolo di anna@example.it')).toHaveValue('rilevatore')
    expect(screen.getByText(/deve essere già registrato su FastLab/)).toBeInTheDocument()
  })

  it('aggiunge un collega con il ruolo (Rilevatore di default) e dice "Persone aggiornate ✓"', async () => {
    const utente = pagina()
    await utente.type(await screen.findByLabelText('Email del collega'), ' nuova@example.it ')
    expect(screen.getByLabelText('Ruolo')).toHaveValue('rilevatore')
    await utente.selectOptions(screen.getByLabelText('Ruolo'), 'lettore')
    await utente.click(screen.getByRole('button', { name: 'Aggiungi' }))
    await waitFor(() => expect(aggiungiMembro).toHaveBeenCalledWith('E', 'nuova@example.it', 'lettore'))
    await waitFor(() => expect(toastSalvato).toHaveBeenCalledWith('Persone aggiornate ✓'))
    expect(screen.getByLabelText('Email del collega')).toHaveValue('')
  })

  it.each([
    ['UTENTE_NON_TROVATO', 'Nessun utente registrato con questa email: chiedi all\'amministratore di invitarlo.'],
    ['SOLO_PROPRIETARIO', 'Solo il proprietario dell\'esperimento aggiunge, toglie o cambia il ruolo delle persone.'],
  ])('l\'errore %s si dice a parole e l\'email resta', async (codice, frase) => {
    vi.mocked(aggiungiMembro).mockRejectedValue({ message: codice })
    const utente = pagina()
    await utente.type(await screen.findByLabelText('Email del collega'), 'x@example.it')
    await utente.click(screen.getByRole('button', { name: 'Aggiungi' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(frase))
    expect(toastSalvato).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Email del collega')).toHaveValue('x@example.it')
  })

  it('cambia il ruolo di un altro', async () => {
    const utente = pagina()
    await utente.selectOptions(await screen.findByLabelText('Ruolo di anna@example.it'), 'proprietario')
    await waitFor(() => expect(aggiungiMembro).toHaveBeenCalledWith('E', 'anna@example.it', 'proprietario'))
    await waitFor(() => expect(toastSalvato).toHaveBeenCalledWith('Persone aggiornate ✓'))
  })

  it('toglie una persona dopo la conferma, che dice che le sue misure restano', async () => {
    const utente = pagina()
    await utente.click(await screen.findByRole('button', { name: /^Togli anna@example.it/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('Togliere anna@example.it dall\'esperimento? Le sue misure restano.')).toBeInTheDocument()
    expect(togliMembro).not.toHaveBeenCalled()
    await utente.click(within(dialogo).getByRole('button', { name: 'Togli' }))
    await waitFor(() => expect(togliMembro).toHaveBeenCalledWith('E', 'u2'))
    await waitFor(() => expect(toastSalvato).toHaveBeenCalledWith('Persone aggiornate ✓'))
  })

  it('l\'ultimo proprietario non si toglie: l\'errore è a parole', async () => {
    vi.mocked(togliMembro).mockRejectedValue({ message: 'ULTIMO_PROPRIETARIO' })
    const utente = pagina()
    await utente.click(await screen.findByRole('button', { name: /^Togli luca@example.it/ }))
    await utente.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Togli' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('almeno un proprietario')))
  })

  it('non ha "Lascia l\'esperimento" e non può togliere o cambiare se stesso', async () => {
    pagina()
    await screen.findByText('io@example.it')
    expect(screen.queryByRole('button', { name: 'Lascia l\'esperimento' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Ruolo di io@example.it')).not.toBeInTheDocument()
  })
})

describe.each(['rilevatore', 'lettore'] as const)('Persone: il %s', ruolo => {
  beforeEach(() => {
    membri = [
      { utente_id: 'io', email: 'io@example.it', ruolo, sei_tu: true },
      { utente_id: 'u1', email: 'capo@example.it', ruolo: 'proprietario', sei_tu: false },
    ]
  })

  it('vede l\'elenco, non aggiunge né toglie, e può lasciare l\'esperimento dopo una conferma', async () => {
    const utente = apri('/esperimenti/E/impostazioni/persone')
    expect(await screen.findByText('capo@example.it')).toBeInTheDocument()
    expect(screen.getByText(ruolo === 'lettore' ? 'Lettore: solo lettura' : 'Rilevatore: misure, note e foto')).toBeInTheDocument()
    expect(screen.queryByLabelText('Email del collega')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Togli/ })).not.toBeInTheDocument()

    await utente.click(screen.getByRole('button', { name: 'Lascia l\'esperimento' }))
    const dialogo = await screen.findByRole('dialog')
    expect(togliMembro).not.toHaveBeenCalled()
    await utente.click(within(dialogo).getByRole('button', { name: 'Lascia' }))
    await waitFor(() => expect(togliMembro).toHaveBeenCalledWith('E', 'io'))
    await waitFor(() => expect(posizione()).toHaveTextContent('/'))
    expect(screen.getByText('altrove')).toBeInTheDocument()
  })
})

describe('configurazione per ruolo', () => {
  const PAGINE = ['generale', 'trattamenti', 'piante', 'strumenti', 'fenologia'] as const

  it.each(PAGINE)('il proprietario modifica: %s ha i controlli', async pagina => {
    apri(`/esperimenti/E/impostazioni/${pagina}`)
    await screen.findByRole('region')
    expect(screen.queryByText('Solo il proprietario modifica la configurazione.')).not.toBeInTheDocument()
  })

  it.each([
    ...(['rilevatore', 'lettore'] as const).flatMap(r => PAGINE.map(p => [r, p] as const)),
  ])('%s: la pagina %s è da leggere, con la frase e nessun pulsante', async (ruolo: Ruolo, pagina) => {
    vi.mocked(ruoloIn).mockResolvedValue(ruolo)
    apri(`/esperimenti/E/impostazioni/${pagina}`)
    expect(await screen.findByText('Solo il proprietario modifica la configurazione.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Salva|Aggiungi|Rimuovi|Crea|Archivia|Elimina|Riordina/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('il rilevatore legge i dati: nome dell\'esperimento e stato, ma senza lo stato da cambiare', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('rilevatore')
    apri('/esperimenti/E/impostazioni/generale')
    expect(await screen.findByText(config.esperimento.nome)).toBeInTheDocument()
    expect(screen.getByText('in corso')).toBeInTheDocument()
  })

  it('ruolo ignoto (lettura fallita): i controlli restano, la guardia è il database', async () => {
    vi.mocked(ruoloIn).mockRejectedValue(new TypeError('Failed to fetch'))
    apri('/esperimenti/E/impostazioni/generale')
    expect(await screen.findByRole('switch', { name: 'Esperimento concluso' })).toBeInTheDocument()
  })

  it('Spazio: il rilevatore legge i numeri, senza archivio .zip né "Libera lo spazio"', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('rilevatore')
    apri('/esperimenti/E/impostazioni/spazio')
    expect(await screen.findByText(/Solo il proprietario scarica l'archivio/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Database del progetto' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /zip|Libera lo spazio/ })).not.toBeInTheDocument()
  })

  it('Spazio: il proprietario ha l\'archivio', async () => {
    apri('/esperimenti/E/impostazioni/spazio')
    await screen.findByRole('progressbar', { name: 'Database del progetto' })
    expect(screen.queryByText(/Solo il proprietario scarica/)).not.toBeInTheDocument()
  })
})
