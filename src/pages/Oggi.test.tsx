import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

// Si prova la pagina con i veri hook e la vera cache: si finge solo il livello API (e il client Supabase, mai raggiunto).
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/api/auth', () => ({
  accedi: vi.fn(), registrati: vi.fn(), esci: vi.fn(), useSessione: vi.fn(),
}))
vi.mock('@/api/inviti', () => ({
  sonoAdmin: vi.fn(), listaInviti: vi.fn(), creaInvito: vi.fn(), revocaInvito: vi.fn(),
}))
vi.mock('@/api/esperimenti', () => ({
  listaEsperimenti: vi.fn(), caricaConfig: vi.fn(), creaEsperimento: vi.fn(), aggiornaEsperimento: vi.fn(),
}))
vi.mock('@/api/misure', () => ({
  misureDelGiorno: vi.fn(), misurePianta: vi.fn(), caricaMisura: vi.fn(), salvaMisura: vi.fn(), eliminaMisura: vi.fn(),
  ultimaMisuraPerStrumento: vi.fn(),
}))
vi.mock('@/api/note', () => ({
  listaNote: vi.fn(), salvaNota: vi.fn(), eliminaNota: vi.fn(), segnaFatto: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(() => 'id-toast'), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }) }))

import { toast } from 'sonner'
import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { caricaConfig } from '@/api/esperimenti'
import { misureDelGiorno, ultimaMisuraPerStrumento } from '@/api/misure'
import { eliminaNota, listaNote, segnaFatto } from '@/api/note'
import { eliminaNotaConAnnulla } from '@/components/note/eliminaNotaConAnnulla'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import type { ConfigEsperimento, Misura, Nota } from '@/domain/tipi'
import { ATTESA_ANNULLA_MS } from '@/lib/eliminaConAnnulla'
import { ESPERIMENTO_NON_TROVATO } from '@/lib/errori'
import { useCampoStore } from '@/store/campo'
import { Oggi } from './Oggi'

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session
const OGGI = '2026-10-28'
const IERI = '2026-10-27'

/** L'esperimento di prova ("E"): il modello Hydrochar, 56 piante in 8 trattamenti (il Controllo ne ha 14, gli altri 6) e quattro strumenti. */
function esperimento(): ConfigEsperimento {
  const config = bozzaHydrochar(SEMI_CATALOGO)
  config.esperimento.id = 'E'
  return config
}

let config: ConfigEsperimento
/** Le note "nel database". */
let noteDb: Nota[]

const nota = (id: string, extra: Partial<Nota> = {}): Nota => ({
  id, data: OGGI, testo: `Testo ${id}`, promemoria: true, fatto_il: null, pianta_ids: [], trattamento_ids: [], ...extra,
})

const strumento = (nome: string) => config.strumenti.find(s => s.nome === nome)!
const parametroSpad = () => config.parametri.find(p => p.catalogo_chiave === 'spad')!
const idPianta = (n: number) => config.piante.find(p => p.etichetta === String(n))!.id

/** Una misura che compila tutti i parametri dello strumento: la pianta risulta "fatta". */
function misuraCompleta(n: number, nomeStrumento: string, extra: Partial<Misura> = {}): Misura {
  const s = strumento(nomeStrumento)
  const valori: Misura['valori'] = {}
  for (const sp of s.parametri) {
    const p = config.parametri.find(x => x.id === sp.parametro_id)!
    valori[p.id] = Array.from({ length: p.n_letture }, () => 40)
  }
  return {
    id: `m${n}-${nomeStrumento}`, pianta_id: idPianta(n), strumento_id: s.id,
    data_rilievo: OGGI, ora: '09:12', valori, ...extra,
  }
}

const misureDi = (nomeStrumento: string, quante: number, extra: Partial<Misura> = {}): Misura[] =>
  Array.from({ length: quante }, (_, i) => misuraCompleta(i + 1, nomeStrumento, extra))

/** Una misura SPAD con un valore scelto. */
const spad = (n: number, valore: number, extra: Partial<Misura> = {}): Misura =>
  ({ ...misuraCompleta(n, 'SPAD'), valori: { [parametroSpad().id]: [valore] }, ...extra })

/**
 * Le piante 1 a 7 sono nel Controllo (le altre sette del trattamento non hanno misure). Le prime sei hanno 40, 41, 39,
 * 40, 42, 38 (media 40, deviazione standard campionaria √2 ≈ 1,414, soglia = max(5 ds ≈ 7,07; 20% di 40 = 8) = 8): la 7 con 80 è molto
 * fuori dal gruppo. Per le altre piante le "altre" includono l'80, quindi la deviazione standard è enorme e nessuna scatta.
 */
const controlloConUnaStonata = (): Misura[] =>
  [40, 41, 39, 40, 42, 38, 80].map((v, i) => spad(i + 1, v))

function Posizione() {
  const { pathname, search, state } = useLocation()
  return <><p data-testid="posizione">{pathname + search}</p><p data-testid="stato">{JSON.stringify(state)}</p></>
}

function vaiAllaPagina() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/esperimenti/E/oggi']}>
        <Routes>
          <Route path="/esperimenti/:espId/oggi" element={<Oggi />} />
          <Route path="*" element={<Posizione />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return client
}

/** La riga di uno strumento (il pulsante che lo avvia). */
const riga = (nome: string) => screen.getByRole('button', { name: nome })
const aspettaStrumenti = () => screen.findByRole('list', { name: 'Strumenti' })
/** Aspetta che le due letture siano partite e finite, così un "niente da mostrare" non è solo "non ancora". */
async function lettureFinite() {
  await vi.waitFor(() => {
    expect(misureDelGiorno).toHaveBeenCalled()
    expect(ultimaMisuraPerStrumento).toHaveBeenCalled()
  })
  await act(async () => { await new Promise(r => setTimeout(r, 20)) })
}

beforeEach(() => {
  vi.clearAllMocks()
  // Solo `Date`: i timer veri servono a React Query e a userEvent. 28 ottobre 2026, ore 10:00 (ora locale).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 28, 10, 0))
  localStorage.clear()
  useCampoStore.setState({ stato: {} })
  config = esperimento()
  vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(caricaConfig).mockResolvedValue(config)
  vi.mocked(misureDelGiorno).mockResolvedValue([])
  vi.mocked(ultimaMisuraPerStrumento).mockResolvedValue(new Map())
  noteDb = []
  vi.mocked(listaNote).mockImplementation(async () => structuredClone(noteDb))
  vi.mocked(segnaFatto).mockImplementation(async (_e, id, fatto) => {
    noteDb = noteDb.map(n => (n.id === id ? { ...n, fatto_il: fatto ? new Date().toISOString() : null } : n))
  })
  vi.mocked(eliminaNota).mockImplementation(async (_e, id) => { noteDb = noteDb.filter(n => n.id !== id) })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Oggi: intestazione', () => {
  it('ha il titolo "Oggi", la freccia indietro alla home e la data di oggi in testa', async () => {
    vaiAllaPagina()
    expect(await screen.findByRole('heading', { level: 1, name: 'Oggi' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/esperimenti/E')
    const data = await screen.findByText('28/10/2026')
    expect(data).toHaveClass('font-mono')
  })

  it('la data è il giorno di calendario anche se la data di rilievo è un\'altra', async () => {
    useCampoStore.getState().setData('E', IERI)
    vaiAllaPagina()
    expect(await screen.findByText('28/10/2026')).toBeInTheDocument()
    expect(screen.queryByText('27/10/2026')).not.toBeInTheDocument()
  })
})

describe('Oggi: gli strumenti', () => {
  it('mostra gli strumenti non archiviati nell\'ordine dello strumento, con l\'icona decorativa', async () => {
    strumento('Metro').archiviato = true
    vaiAllaPagina()
    const elenco = await aspettaStrumenti()
    const nomi = within(elenco).getAllByRole('button').map(b => b.textContent)
    expect(nomi).toHaveLength(3)
    expect(nomi[0]).toContain('Termometro')
    expect(nomi[1]).toContain('SPAD')
    expect(nomi[2]).toContain('Tabella fenologica')
    expect(riga('SPAD').querySelector('[aria-hidden] svg, svg[aria-hidden]')).not.toBeNull()
  })

  it('senza strumenti attivi dice che non ce ne sono e rimanda alle Impostazioni', async () => {
    for (const s of config.strumenti) s.archiviato = true
    vaiAllaPagina()
    expect(await screen.findByText(/non ha strumenti attivi/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Impostazioni/ })).toHaveAttribute('href', '/esperimenti/E/impostazioni/strumenti')
    expect(screen.queryByRole('list', { name: 'Strumenti' })).not.toBeInTheDocument()
  })

  it('un giro iniziato dice "34/56"', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue(misureDi('SPAD', 34))
    vaiAllaPagina()
    await aspettaStrumenti()
    expect(await within(riga('SPAD')).findByText('34/56')).toBeInTheDocument()
  })

  it('un giro finito dice "fatto ✓"', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue(misureDi('SPAD', 56))
    vaiAllaPagina()
    await aspettaStrumenti()
    expect(await within(riga('SPAD')).findByText('fatto ✓')).toBeInTheDocument()
  })

  it('uno strumento non iniziato oggi dice quando è stato misurato l\'ultima volta: "ultima 14/10 (14 giorni fa)"', async () => {
    vi.mocked(ultimaMisuraPerStrumento).mockResolvedValue(new Map([[strumento('SPAD').id, '2026-10-14']]))
    vaiAllaPagina()
    await aspettaStrumenti()
    expect(await within(riga('SPAD')).findByText('ultima 14/10 (14 giorni fa)')).toBeInTheDocument()
  })

  it('accorda ieri e un giorno solo: "ultima 27/10 (ieri)"', async () => {
    vi.mocked(ultimaMisuraPerStrumento).mockResolvedValue(new Map([[strumento('SPAD').id, IERI]]))
    vaiAllaPagina()
    await aspettaStrumenti()
    expect(await within(riga('SPAD')).findByText('ultima 27/10 (ieri)')).toBeInTheDocument()
  })

  it('uno strumento senza misure dice "mai misurato"', async () => {
    vaiAllaPagina()
    await aspettaStrumenti()
    expect(await within(riga('Metro')).findByText('mai misurato')).toBeInTheDocument()
  })

  it('il progresso è quello di oggi, non della data di rilievo; il banner avverte della data scelta', async () => {
    useCampoStore.getState().setData('E', IERI)
    vi.mocked(misureDelGiorno).mockImplementation(async (_e, data) =>
      (data === OGGI ? misureDi('SPAD', 34) : misureDi('SPAD', 10, { data_rilievo: IERI })))
    vaiAllaPagina()
    await aspettaStrumenti()
    expect(await within(riga('SPAD')).findByText('34/56')).toBeInTheDocument()
    expect(misureDelGiorno).toHaveBeenCalledWith('E', OGGI)
    expect(screen.getByRole('status')).toHaveTextContent('Stai registrando con data 27/10/2026, non oggi.')
  })

  it('mentre le letture caricano non mostra nessun dato', async () => {
    vi.mocked(misureDelGiorno).mockReturnValue(new Promise(() => {}))
    vi.mocked(ultimaMisuraPerStrumento).mockReturnValue(new Promise(() => {}))
    vaiAllaPagina()
    await aspettaStrumenti()
    await vi.waitFor(() => expect(misureDelGiorno).toHaveBeenCalled())
    expect(screen.queryByText(/^\d+\/\d+$|^ultima|mai misurato|fatto/)).not.toBeInTheDocument()
    expect(riga('SPAD')).toHaveTextContent(/^SPAD…$/)
  })

  it('se arrivano solo le ultime date non dice nulla sul progresso, e viceversa non dice "mai misurato"', async () => {
    vi.mocked(ultimaMisuraPerStrumento).mockReturnValue(new Promise(() => {}))
    vi.mocked(misureDelGiorno).mockResolvedValue(misureDi('SPAD', 34))
    vaiAllaPagina()
    await aspettaStrumenti()
    expect(await within(riga('SPAD')).findByText('34/56')).toBeInTheDocument()
    expect(screen.queryByText('mai misurato')).not.toBeInTheDocument()
  })

  it('se le ultime date non arrivano restano i progressi di oggi, senza "mai misurato"', async () => {
    vi.mocked(ultimaMisuraPerStrumento).mockRejectedValue(new TypeError('Failed to fetch'))
    vi.mocked(misureDelGiorno).mockResolvedValue(misureDi('SPAD', 34))
    vaiAllaPagina()
    await aspettaStrumenti()
    await lettureFinite()
    expect(within(riga('SPAD')).getByText('34/56')).toBeInTheDocument()
    expect(screen.queryByText(/ultima|mai misurato/)).not.toBeInTheDocument()
  })
})

describe('Oggi: far partire la misura', () => {
  it('il tocco su uno strumento porta alla prima pianta da misurare e lo ricorda come ultimo scelto', async () => {
    const utente = userEvent.setup()
    vaiAllaPagina()
    await aspettaStrumenti()
    await utente.click(riga('SPAD'))
    expect(screen.getByTestId('posizione')).toHaveTextContent(`/esperimenti/E/misura/${strumento('SPAD').id}/${idPianta(1)}`)
    expect(useCampoStore.getState().dati('E', OGGI).strumentoId).toBe(strumento('SPAD').id)
  })

  it('riprende dalla prima pianta non fatta', async () => {
    const utente = userEvent.setup()
    vi.mocked(misureDelGiorno).mockResolvedValue(misureDi('SPAD', 34))
    vaiAllaPagina()
    await aspettaStrumenti()
    await within(riga('SPAD')).findByText('34/56')
    await utente.click(riga('SPAD'))
    expect(screen.getByTestId('posizione')).toHaveTextContent(`/esperimenti/E/misura/${strumento('SPAD').id}/${idPianta(35)}`)
  })

  it('con il giro finito porta alla fine del giro', async () => {
    const utente = userEvent.setup()
    vi.mocked(misureDelGiorno).mockResolvedValue(misureDi('SPAD', 56))
    vaiAllaPagina()
    await aspettaStrumenti()
    await within(riga('SPAD')).findByText('fatto ✓')
    await utente.click(riga('SPAD'))
    expect(screen.getByTestId('posizione')).toHaveTextContent(`/esperimenti/E/misura/${strumento('SPAD').id}/fine`)
  })

  it('con una data di rilievo diversa da oggi riprende dal giro di quella data, quella su cui si registra', async () => {
    const utente = userEvent.setup()
    useCampoStore.getState().setData('E', IERI)
    vi.mocked(misureDelGiorno).mockImplementation(async (_e, data) =>
      (data === OGGI ? misureDi('SPAD', 34) : misureDi('SPAD', 10, { data_rilievo: IERI })))
    vaiAllaPagina()
    await aspettaStrumenti()
    await within(riga('SPAD')).findByText('34/56')
    await utente.click(riga('SPAD'))
    expect(screen.getByTestId('posizione')).toHaveTextContent(`/esperimenti/E/misura/${strumento('SPAD').id}/${idPianta(11)}`)
  })

  it('se le misure non arrivano la pagina si usa lo stesso: si parte dalla prima pianta', async () => {
    const utente = userEvent.setup()
    vi.mocked(misureDelGiorno).mockRejectedValue(new TypeError('Failed to fetch'))
    vaiAllaPagina()
    await aspettaStrumenti()
    await lettureFinite()
    await utente.click(riga('SPAD'))
    expect(screen.getByTestId('posizione')).toHaveTextContent(`/esperimenti/E/misura/${strumento('SPAD').id}/${idPianta(1)}`)
  })
})

describe('Oggi: da sistemare', () => {
  const sezione = () => screen.findByRole('region', { name: 'Da sistemare' })

  it('spiega in breve cosa sono i valori da sistemare', async () => {
    vaiAllaPagina()
    await aspettaStrumenti()
    expect(screen.getByText('Valori molto lontani dalla media del loro trattamento: forse un errore di battitura.')).toBeInTheDocument()
  })

  it('senza valori sospetti dice "Nessun valore da controllare."', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue(misureDi('SPAD', 7))
    vaiAllaPagina()
    expect(await screen.findByText('Nessun valore da controllare.')).toBeInTheDocument()
    expect(within(await sezione()).queryByRole('link')).not.toBeInTheDocument()
  })

  it('mostra il valore molto fuori dal gruppo con pianta, strumento, valore e media del trattamento', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue(controlloConUnaStonata())
    vaiAllaPagina()
    const voce = await within(await sezione()).findByRole('link')
    expect(within(await sezione()).getAllByRole('link')).toHaveLength(1)
    expect(within(voce).getByText('Pianta 7')).toBeInTheDocument()
    // Strumento e parametro hanno lo stesso nome ("SPAD"): non si ripete.
    expect(within(voce).getByText('SPAD')).toBeInTheDocument()
    expect(within(voce).getByText('80')).toBeInTheDocument()
    expect(within(voce).getByText('media trattamento 40')).toBeInTheDocument()
    expect(screen.queryByText('Nessun valore da controllare.')).not.toBeInTheDocument()
  })

  it('il segno è a parole, non solo colore: "fuori dal gruppo" con l\'icona di attenzione', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue(controlloConUnaStonata())
    vaiAllaPagina()
    const voce = await within(await sezione()).findByRole('link')
    const segno = within(voce).getByText('fuori dal gruppo')
    expect(segno.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('il tocco apre la modifica della misura che porta il valore, con lo stato per tornare a Oggi', async () => {
    const utente = userEvent.setup()
    vi.mocked(misureDelGiorno).mockResolvedValue(controlloConUnaStonata())
    vaiAllaPagina()
    await utente.click(await within(await sezione()).findByRole('link'))
    expect(screen.getByTestId('posizione')).toHaveTextContent('/esperimenti/E/misure/m7-SPAD')
    expect(JSON.parse(screen.getByTestId('stato').textContent!)).toEqual({ daScheda: true })
  })

  it('tocca la misura dell\'ultima ora se la pianta ne ha più di una oggi', async () => {
    const utente = userEvent.setup()
    // La pianta 7 ha 80 alle 08:00 e 80 alle 11:00 (media giornaliera 80): si apre la più recente.
    vi.mocked(misureDelGiorno).mockResolvedValue([
      ...controlloConUnaStonata().slice(0, 6),
      spad(7, 80, { id: 'prima', ora: '08:00' }),
      spad(7, 80, { id: 'dopo', ora: '11:00' }),
    ])
    vaiAllaPagina()
    await utente.click(await within(await sezione()).findByRole('link'))
    expect(screen.getByTestId('posizione')).toHaveTextContent('/esperimenti/E/misure/dopo')
  })

  it('le misure di un altro giorno non contano', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue(controlloConUnaStonata().map(m => ({ ...m, data_rilievo: IERI })))
    vaiAllaPagina()
    expect(await screen.findByText('Nessun valore da controllare.')).toBeInTheDocument()
  })

  it('con l\'unità del parametro la scrive accanto al valore e alla media', async () => {
    parametroSpad().unita = 'SPAD'
    vi.mocked(misureDelGiorno).mockResolvedValue(controlloConUnaStonata())
    vaiAllaPagina()
    const voce = await within(await sezione()).findByRole('link')
    expect(within(voce).getByText('80 SPAD')).toBeInTheDocument()
    expect(within(voce).getByText('media trattamento 40 SPAD')).toBeInTheDocument()
  })

  it('mentre le misure caricano non dice "Nessun valore da controllare."', async () => {
    vi.mocked(misureDelGiorno).mockReturnValue(new Promise(() => {}))
    vaiAllaPagina()
    await aspettaStrumenti()
    await vi.waitFor(() => expect(misureDelGiorno).toHaveBeenCalled())
    expect(screen.queryByText('Nessun valore da controllare.')).not.toBeInTheDocument()
    expect(within(await sezione()).getByRole('status')).toHaveTextContent('Caricamento…')
  })

  it('se le misure non arrivano lo dice e permette di riprovare, senza dire che va tutto bene', async () => {
    const utente = userEvent.setup()
    vi.mocked(misureDelGiorno).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vaiAllaPagina()
    const avviso = await within(await sezione()).findByRole('alert')
    expect(avviso).toHaveTextContent('Rete debole')
    expect(screen.queryByText('Nessun valore da controllare.')).not.toBeInTheDocument()
    vi.mocked(misureDelGiorno).mockResolvedValue([])
    await utente.click(within(avviso).getByRole('button', { name: 'Riprova' }))
    expect(await screen.findByText('Nessun valore da controllare.')).toBeInTheDocument()
  })
})

describe('Oggi: caricamento ed errori', () => {
  it('mentre la configurazione carica mostra "Caricamento…" e non le sezioni', () => {
    vi.mocked(caricaConfig).mockReturnValue(new Promise(() => {}))
    vaiAllaPagina()
    expect(screen.getByRole('status')).toHaveTextContent('Caricamento…')
    expect(screen.queryByRole('list', { name: 'Strumenti' })).not.toBeInTheDocument()
    expect(misureDelGiorno).not.toHaveBeenCalled()
  })

  it('se la configurazione non arriva lo dice e permette di riprovare', async () => {
    const utente = userEvent.setup()
    vi.mocked(caricaConfig).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vaiAllaPagina()
    const avviso = await screen.findByRole('alert')
    expect(avviso).toHaveTextContent('Rete debole')
    await utente.click(within(avviso).getByRole('button', { name: 'Riprova' }))
    expect(await aspettaStrumenti()).toBeInTheDocument()
  })

  it('un esperimento che non c\'è rimanda all\'elenco', async () => {
    vi.mocked(caricaConfig).mockRejectedValue(new Error(ESPERIMENTO_NON_TROVATO))
    vaiAllaPagina()
    expect(await screen.findByRole('link', { name: 'I miei esperimenti' })).toHaveAttribute('href', '/')
  })
})

/** L'azione "Annulla" del toast mostrato per ultimo. */
function azioneAnnulla() {
  const [, opzioni] = vi.mocked(toast).mock.calls.at(-1) as unknown as [string, { action: { label: string; onClick: () => void } }]
  return opzioni.action
}

describe('Oggi: i promemoria', () => {
  // Lo stato "in attesa" è del modulo: ogni test lo lascia vuoto facendo scadere ciò che ha sospeso.
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 9, 28, 10, 0))
  })
  afterEach(async () => { await act(() => vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS * 2)) })

  const sezione = () => screen.findByRole('region', { name: 'Promemoria' })
  const spunta = (testo: string) => screen.getByRole('button', { name: `Segna fatto: ${testo}` })

  it('è la prima sezione, sopra gli strumenti, e mostra i promemoria con data di oggi o passata non fatti', async () => {
    noteDb = [
      nota('a', { testo: 'Annaffiare', data: OGGI }),
      nota('b', { testo: 'Scaduto', data: '2026-10-20' }),
      nota('c', { testo: 'Domani', data: '2026-10-29' }),
      nota('d', { testo: 'Già fatto', fatto_il: '2026-10-28T08:00:00.000Z' }),
      nota('e', { testo: 'Una nota semplice', promemoria: false }),
    ]
    vaiAllaPagina()
    const promemoria = within(await sezione())
    expect(promemoria.getAllByRole('listitem').map(li => li.textContent)).toEqual([
      expect.stringContaining('Scaduto'), expect.stringContaining('Annaffiare'),
    ])
    expect(screen.queryByText('Domani')).not.toBeInTheDocument()
    expect(screen.queryByText('Già fatto')).not.toBeInTheDocument()
    expect(screen.queryByText('Una nota semplice')).not.toBeInTheDocument()
    const titoli = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    expect(titoli.slice(0, 2)).toEqual(['Promemoria', 'Strumenti'])
  })

  it('senza promemoria la sezione non c\'è', async () => {
    noteDb = [nota('c', { data: '2026-10-29' })]
    vaiAllaPagina()
    await aspettaStrumenti()
    await vi.waitFor(() => expect(listaNote).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: 'Promemoria' })).not.toBeInTheDocument()
  })

  it('ogni riga dice la data, il testo e a cosa è collegata, nel font dei dati', async () => {
    noteDb = [nota('a', { testo: 'Controllare le foglie', data: '2026-10-26', pianta_ids: [idPianta(3)] })]
    vaiAllaPagina()
    const riga = within(await sezione()).getByRole('listitem')
    expect(within(riga).getByText('26/10/2026')).toHaveClass('font-mono')
    expect(within(riga).getByText('Controllare le foglie')).toBeInTheDocument()
    expect(within(riga).getByText('Pianta 3')).toHaveClass('font-mono')
  })

  it('il tocco sulla riga apre la nota nel Diario', async () => {
    noteDb = [nota('a', { testo: 'Controllare le foglie' })]
    const utente = userEvent.setup()
    vaiAllaPagina()
    await utente.click(within(await sezione()).getByRole('link', { name: /Controllare le foglie/ }))
    expect(screen.getByTestId('posizione')).toHaveTextContent('/esperimenti/E/diario')
    expect(JSON.parse(screen.getByTestId('stato').textContent!)).toEqual({ apriNota: 'a' })
  })

  it('la spunta ha un bersaglio di almeno 44 px ed è un pulsante a parte, fuori dal tocco che apre la nota', async () => {
    noteDb = [nota('a', { testo: 'Annaffiare' })]
    vaiAllaPagina()
    await sezione()
    expect(spunta('Annaffiare')).toHaveClass('size-11')
    expect(spunta('Annaffiare').closest('a')).toBeNull()
  })

  it('spuntare toglie subito il promemoria, mostra "Annulla" e salva solo dopo 5 secondi', async () => {
    noteDb = [nota('a', { testo: 'Annaffiare' }), nota('b', { testo: 'Concimare' })]
    const utente = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vaiAllaPagina()
    await sezione()
    await utente.click(spunta('Annaffiare'))

    expect(screen.queryByText('Annaffiare')).not.toBeInTheDocument()
    expect(screen.getByText('Concimare')).toBeInTheDocument()
    expect(toast).toHaveBeenCalledWith('Promemoria fatto.', expect.objectContaining({ duration: ATTESA_ANNULLA_MS }))
    expect(azioneAnnulla().label).toBe('Annulla')
    expect(segnaFatto).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS - 100))
    expect(segnaFatto).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(segnaFatto).toHaveBeenCalledExactlyOnceWith('E', 'a', true)
    expect(screen.queryByText('Annaffiare')).not.toBeInTheDocument()
  })

  it('"Annulla" rimette il promemoria e non scrive mai nulla', async () => {
    noteDb = [nota('a', { testo: 'Annaffiare' })]
    const utente = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vaiAllaPagina()
    await sezione()
    await utente.click(spunta('Annaffiare'))
    act(() => azioneAnnulla().onClick())

    expect(await screen.findByText('Annaffiare')).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS * 2))
    expect(segnaFatto).not.toHaveBeenCalled()
    expect(screen.getByText('Annaffiare')).toBeInTheDocument()
  })

  it('se il salvataggio vero fallisce il promemoria ricompare e l\'errore resta finché non lo si chiude', async () => {
    noteDb = [nota('a', { testo: 'Annaffiare' })]
    vi.mocked(segnaFatto).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vaiAllaPagina()
    await sezione()
    await utente.click(spunta('Annaffiare'))
    await act(() => vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS + 100))

    expect(await screen.findByText('Annaffiare')).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Il promemoria non è stato segnato come fatto'), expect.objectContaining({ duration: Infinity }),
    )
  })

  it('una rilettura dal server nei 5 secondi non fa riapparire il promemoria spuntato', async () => {
    noteDb = [nota('a', { testo: 'Annaffiare' })]
    const utente = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const client = vaiAllaPagina()
    await sezione()
    await utente.click(spunta('Annaffiare'))
    // Il server non sa ancora nulla: la rilettura riporta la nota da fare.
    await act(async () => { await client.invalidateQueries({ queryKey: ['note', 'E'] }); await vi.advanceTimersByTimeAsync(10) })
    expect(screen.queryByText('Annaffiare')).not.toBeInTheDocument()
  })

  it('una nota in attesa di eliminazione non compare, nemmeno se l\'elenco viene riletto', async () => {
    noteDb = [nota('a', { testo: 'Da eliminare' }), nota('b', { testo: 'Resta' })]
    const client = vaiAllaPagina()
    await sezione()
    await act(async () => { eliminaNotaConAnnulla(client, 'E', noteDb[0]); await vi.advanceTimersByTimeAsync(10) })
    expect(screen.queryByText('Da eliminare')).not.toBeInTheDocument()
    await act(async () => { await client.invalidateQueries({ queryKey: ['note', 'E'] }); await vi.advanceTimersByTimeAsync(10) })
    expect(screen.queryByText('Da eliminare')).not.toBeInTheDocument()
    expect(screen.getByText('Resta')).toBeInTheDocument()
    expect(eliminaNota).not.toHaveBeenCalled()
  })

  it('se le note non arrivano lo dice con «Riprova», senza nascondere gli strumenti', async () => {
    vi.mocked(listaNote).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vaiAllaPagina()
    const promemoria = within(await sezione())
    expect(await promemoria.findByRole('alert')).toHaveTextContent('Rete debole')
    expect(await aspettaStrumenti()).toBeInTheDocument()
    noteDb = [nota('a', { testo: 'Annaffiare' })]
    await utente.click(promemoria.getByRole('button', { name: 'Riprova' }))
    expect(await promemoria.findByText('Annaffiare')).toBeInTheDocument()
  })

  it('a mezzanotte un promemoria di domani passa tra quelli di oggi', async () => {
    noteDb = [nota('a', { testo: 'Domani', data: '2026-10-29' })]
    vi.setSystemTime(new Date(2026, 9, 28, 23, 59, 30))
    vaiAllaPagina()
    await aspettaStrumenti()
    await vi.waitFor(() => expect(listaNote).toHaveBeenCalled())
    expect(screen.queryByText('Domani')).not.toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(31_000))
    expect(await screen.findByText('Domani')).toBeInTheDocument()
  })
})
