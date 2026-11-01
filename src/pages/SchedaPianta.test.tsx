import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

// Si prova la pagina con i veri hook e la vera cache di React Query: si finge il livello API (le misure stanno in un
// "database" in memoria, `archivio`), e il client Supabase non si raggiunge mai.
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
  ultimaMisuraPerStrumento: vi.fn(), ultimeMisurePiante: vi.fn(),
}))
vi.mock('@/api/note', () => ({
  listaNote: vi.fn(), salvaNota: vi.fn(), eliminaNota: vi.fn(), segnaFatto: vi.fn(),
}))
vi.mock('@/api/foto', () => ({
  listaFoto: vi.fn(), urlFoto: vi.fn(), caricaFoto: vi.fn(), eliminaFoto: vi.fn(), aggiornaFoto: vi.fn(), spazioFoto: vi.fn(),
  VALIDITA_URL_SECONDI: 3600,
}))
vi.mock('@/lib/immagini', () => ({ dataDiScatto: vi.fn() }))
vi.mock('@/lib/toastSalvato', () => ({ toastSalvato: vi.fn() }))

import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { caricaConfig } from '@/api/esperimenti'
import { caricaFoto, listaFoto, urlFoto } from '@/api/foto'
import { listaNote } from '@/api/note'
import { eliminaNotaConAnnulla } from '@/components/note/eliminaNotaConAnnulla'
import { eliminaFotoConAnnulla } from '@/components/foto/eliminaFotoConAnnulla'
import { misureDelGiorno, misurePianta, salvaMisura, ultimaMisuraPerStrumento } from '@/api/misure'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import type { ConfigEsperimento, Foto, Misura, Nota, Parametro, ValoriMisura } from '@/domain/tipi'
import { dataDiScatto } from '@/lib/immagini'
import { useCampoStore } from '@/store/campo'
import { MisuraPianta } from './MisuraPianta'
import { SchedaPianta } from './SchedaPianta'

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session
/** Oggi, nei test: 28 ottobre 2026. */
const OGGI = '2026-10-28'

let config: ConfigEsperimento
/** Le misure "nel database": le letture le filtrano. */
let archivio: Misura[]
/** Le foto "nel database". */
let fotoDb: Foto[]
/** Le note "nel database". */
let noteDb: Nota[]

const strumento = (nome: string) => config.strumenti.find(s => s.nome === nome)!
const par = (nome: string): Parametro => config.parametri.find(p => p.nome === nome)!
const pianta = (etichetta: string | number) => config.piante.find(p => p.etichetta === String(etichetta))!

let contatore = 0
/** Una misura della pianta `n` con uno strumento: `valori` per nome del parametro. */
function misura(
  n: number | string, nomeStrumento: string, valori: Record<string, ValoriMisura[string]>, data: string, ora = '09:00',
): Misura {
  contatore += 1
  return {
    id: `m-${contatore}`, pianta_id: pianta(n).id, strumento_id: strumento(nomeStrumento).id, data_rilievo: data, ora,
    valori: Object.fromEntries(Object.entries(valori).map(([nome, v]) => [par(nome).id, v])),
  }
}
const spad = (n: number | string, valore: number, data: string, ora?: string) => misura(n, 'SPAD', { SPAD: [valore] }, data, ora)

const notaDi = (id: string, extra: Partial<Nota> = {}): Nota => ({
  id, data: '2026-10-27', testo: `Testo ${id}`, promemoria: false, fatto_il: null, pianta_ids: [], trattamento_ids: [], ...extra,
})

const fotoDi = (id: string, extra: Partial<Foto> = {}): Foto => ({
  id, data: '2026-10-27', percorso: `E/${id}.jpg`, larghezza: 1600, altezza: 1200, byte: 200000,
  pianta_id: null, nota_id: null, archiviata: false, ...extra,
})

function Posizione() {
  const { pathname } = useLocation()
  return <p data-testid="posizione">{pathname}</p>
}

/** La pagina di modifica di una misura, finta: mostra lo stato con cui la storia della pianta l'ha aperta. */
function StatoArrivo() {
  return <p data-testid="arrivo">{JSON.stringify(useLocation().state)}</p>
}

function apri(etichetta: string | number = '35') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const id = config.piante.find(p => p.etichetta === String(etichetta))?.id ?? String(etichetta)
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/esperimenti/E/piante', `/esperimenti/E/piante/${id}`]} initialIndex={1}>
        <Routes>
          <Route path="/esperimenti/:espId/piante/:piantaId" element={<SchedaPianta />} />
          <Route path="/esperimenti/:espId/misure/:misuraId" element={<StatoArrivo />} />
          <Route path="/esperimenti/:espId/diario" element={<StatoArrivo />} />
          <Route path="/esperimenti/:espId/misura/:strumentoId/:piantaId" element={<MisuraPianta />} />
          <Route path="*" element={null} />
        </Routes>
        <Posizione />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return client
}

const posizione = () => screen.getByTestId('posizione').textContent
const pulsante = (nome: string | RegExp) => screen.getByRole('button', { name: nome })
/** Più tardi di un doppio tocco. */
const piuTardi = (secondi = 1) => vi.setSystemTime(new Date(Date.now() + secondi * 1000))
/** Aspetta che la scheda abbia le misure: compare la sezione degli ultimi valori. */
const pronta = () => screen.findByRole('region', { name: 'Ultimi valori' })
/** Le righe dei valori di uno strumento, nella sezione "Ultimi valori". */
const righe = async (nomeStrumento: string) =>
  within(await screen.findByRole('list', { name: nomeStrumento })).getAllByRole('listitem')
/** Il testo di una riga, con il testo per i lettori di schermo. */
const testo = (riga: HTMLElement) => riga.textContent

beforeEach(() => {
  vi.clearAllMocks()
  contatore = 0
  // Solo `Date`: i timer veri servono a React Query e a userEvent. 28 ottobre 2026, ore 10:00 (ora locale).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 28, 10, 0))
  localStorage.clear()
  sessionStorage.clear()
  useCampoStore.setState({ stato: {} })
  config = bozzaHydrochar(SEMI_CATALOGO)
  config.esperimento.id = 'E'
  archivio = []
  fotoDb = []
  noteDb = []
  vi.mocked(listaNote).mockImplementation(async () => structuredClone(noteDb))
  vi.mocked(dataDiScatto).mockResolvedValue(null)
  vi.mocked(listaFoto).mockImplementation(async () => structuredClone(fotoDb))
  vi.mocked(urlFoto).mockImplementation(async percorsi => new Map(percorsi.map(p => [p, `https://storage/${p}`])))
  vi.mocked(caricaFoto).mockImplementation(async (_e, d) => {
    const nuova = fotoDi(d.id, { data: d.data, pianta_id: d.piantaId ?? null })
    fotoDb.unshift(nuova)
    return nuova
  })
  vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(caricaConfig).mockImplementation(async () => config)
  vi.mocked(misurePianta).mockImplementation(async id => archivio.filter(m => m.pianta_id === id))
  vi.mocked(misureDelGiorno).mockImplementation(async (_esp, data) => archivio.filter(m => m.data_rilievo === data))
  vi.mocked(salvaMisura).mockImplementation(async (_esp, m) => { archivio = [m, ...archivio.filter(x => x.id !== m.id)] })
  // L'ultima data di ogni strumento nell'esperimento, come la dà il database.
  vi.mocked(ultimaMisuraPerStrumento).mockImplementation(async () => {
    const ultime = new Map<string, string>()
    for (const m of archivio) {
      const prima = ultime.get(m.strumento_id)
      if (prima === undefined || m.data_rilievo > prima) ultime.set(m.strumento_id, m.data_rilievo)
    }
    return ultime
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SchedaPianta: intestazione', () => {
  it('mostra l\'esperimento in alto, la freccia verso l\'elenco, "Pianta #35" e il trattamento', async () => {
    apri('35')
    expect(await screen.findByRole('heading', { level: 1, name: 'Hydrochar × Cuore di Bue' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/esperimenti/E/piante')
    const titolo = screen.getByRole('heading', { level: 2, name: 'Pianta #35' })
    expect(titolo).toBeInTheDocument()
    expect(titolo.parentElement).toHaveTextContent('Trattamento: W1')
  })

  it('non contiene più il modulo di misura: si misura da "Misura questa pianta"', async () => {
    apri('35')
    await pronta()
    expect(screen.queryByLabelText('Temp aria')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Salva/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Ora: / })).not.toBeInTheDocument()
    expect(screen.queryByText(/Stai registrando con data/)).not.toBeInTheDocument()
  })

  it('una pianta che non c\'è lo dice, senza azione', async () => {
    apri('inesistente')
    expect(await screen.findByText('Questa pianta non esiste in questo esperimento.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Misura questa pianta' })).not.toBeInTheDocument()
  })

  it('se la configurazione non si carica spiega cosa è successo, con "Riprova"', async () => {
    vi.mocked(caricaConfig).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    apri('35')
    expect(await screen.findByRole('alert')).toHaveTextContent('Il server non risponde')
    await utente.click(pulsante('Riprova'))
    expect(await pronta()).toBeInTheDocument()
  })

  it('se le misure della pianta non si caricano lo dice senza mostrare numeri, e "Riprova" ci riprova', async () => {
    vi.mocked(misurePianta).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    apri('35')
    expect(await screen.findByRole('alert')).toHaveTextContent('Il server non risponde')
    expect(screen.getByRole('heading', { name: 'Pianta #35' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Ultimi valori' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Storia' })).not.toBeInTheDocument()
    await utente.click(pulsante('Riprova'))
    expect(await pronta()).toBeInTheDocument()
  })

  it('finché le misure arrivano c\'è "Caricamento…" e nessun valore', async () => {
    vi.mocked(misurePianta).mockImplementation(() => new Promise(() => {}))
    apri('35')
    expect(await screen.findByRole('heading', { name: 'Pianta #35' })).toBeInTheDocument()
    expect(screen.getByText('Caricamento…')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Ultimi valori' })).not.toBeInTheDocument()
  })
})

describe('SchedaPianta: ultimi valori', () => {
  it('per ogni strumento l\'icona e il nome, poi i valori: "SPAD 41,2 · 3 giorni fa"', async () => {
    archivio = [
      spad(35, 41.2, '2026-10-25'),
      misura(35, 'Termometro', { 'Temp aria': [24.5], 'Temp pianta': [25.1] }, OGGI),
    ]
    apri('35')
    const sezione = await pronta()
    // Gli strumenti seguono il loro ordine: Termometro, poi SPAD.
    const gruppi = within(sezione).getAllByRole('heading', { level: 4 }).map(h => h.textContent)
    expect(gruppi).toEqual(['🌡Termometro', '💚SPAD'])
    const [tempAria, tempPianta] = await righe('Termometro')
    expect(tempAria).toHaveTextContent('Temp aria 24,5 °C · oggi')
    expect(tempPianta).toHaveTextContent('Temp pianta 25,1 °C · oggi')
    expect((await righe('SPAD'))[0]).toHaveTextContent('SPAD 41,2 · 3 giorni fa')
    // Lo strumento senza misure non compare.
    expect(within(sezione).queryByRole('heading', { name: /Metro/ })).not.toBeInTheDocument()
  })

  it('il "da quanto" parla di oggi e di ieri, e di una data futura dice solo la data', async () => {
    archivio = [
      spad(35, 41.2, '2026-10-27'),
      misura(35, 'Metro', { Altezza: [80] }, OGGI),
      misura(35, 'Termometro', { 'Temp aria': [20] }, '2026-10-30'),
    ]
    apri('35')
    await pronta()
    expect((await righe('SPAD'))[0]).toHaveTextContent('SPAD 41,2 · ieri')
    expect((await righe('Metro'))[0]).toHaveTextContent('Altezza 80 cm · oggi')
    expect((await righe('Termometro'))[0]).toHaveTextContent('Temp aria 20 °C · il 30/10')
  })

  it('"oggi" è la data locale e si aggiorna a mezzanotte', async () => {
    vi.setSystemTime(new Date(2026, 9, 28, 23, 50))
    archivio = [spad(35, 41.2, '2026-10-27')]
    apri('35')
    await pronta()
    expect((await righe('SPAD'))[0]).toHaveTextContent('SPAD 41,2 · ieri')

    // Il telefono riaperto il mattino dopo: la pagina torna visibile e oggi è il 29.
    vi.setSystemTime(new Date(2026, 9, 29, 7, 30))
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    Reflect.deleteProperty(document, 'visibilityState')

    expect((await righe('SPAD'))[0]).toHaveTextContent('SPAD 41,2 · 2 giorni fa')
  })

  it('la freccia dice se il valore è salito o sceso rispetto alla misura precedente, anche a voce', async () => {
    archivio = [
      spad(35, 41.2, '2026-10-25'), spad(35, 38.0, '2026-10-20'),
      misura(35, 'Termometro', { 'Temp aria': [20], 'Temp pianta': [30] }, '2026-10-25'),
      misura(35, 'Termometro', { 'Temp aria': [24], 'Temp pianta': [30] }, '2026-10-20'),
    ]
    apri('35')
    await pronta()
    const [su] = await righe('SPAD')
    expect(within(su).getByText('in aumento rispetto al 20/10')).toBeInTheDocument()
    const [giu, uguale] = await righe('Termometro')
    expect(within(giu).getByText('in calo rispetto al 20/10')).toBeInTheDocument()
    // Uguale alla volta prima, o senza una volta prima: nessuna freccia.
    expect(testo(uguale)).not.toMatch(/rispetto/)
  })

  it('senza una misura precedente non c\'è freccia', async () => {
    archivio = [spad(35, 41.2, '2026-10-25')]
    apri('35')
    await pronta()
    expect(testo((await righe('SPAD'))[0])).not.toMatch(/rispetto/)
  })

  it('più misure nello stesso giorno diventano la media del giorno', async () => {
    archivio = [spad(35, 40, '2026-10-27', '09:00'), spad(35, 42, '2026-10-27', '15:00')]
    apri('35')
    await pronta()
    expect((await righe('SPAD'))[0]).toHaveTextContent('SPAD 41 · ieri')
  })

  it('le letture ripetute di una misura sono mediate', async () => {
    par('SPAD').n_letture = 3
    archivio = [misura(35, 'SPAD', { SPAD: [40, 41, null] }, '2026-10-27')]
    apri('35')
    await pronta()
    expect((await righe('SPAD'))[0]).toHaveTextContent('SPAD 40,5 · ieri')
  })

  it('una lista mostra quanti elementi ha (i palchi), e testo e parametri archiviati non compaiono', async () => {
    par('Temp pianta').archiviato = true
    archivio = [
      misura(35, 'Tabella fenologica', {
        Palchi: [{ n: 1, valori: { n_foglie: 5 } }, { n: 2, valori: { n_foglie: 7 } }], Note: 'Prima fioritura',
      }, '2026-10-27'),
      misura(35, 'Termometro', { 'Temp aria': [24.5], 'Temp pianta': [25.1] }, OGGI),
    ]
    apri('35')
    await pronta()
    expect(await righe('Tabella fenologica')).toHaveLength(1)
    expect((await righe('Tabella fenologica'))[0]).toHaveTextContent('Palchi 2 · ieri')
    expect(await righe('Termometro')).toHaveLength(1)
    const sezione = screen.getByRole('region', { name: 'Ultimi valori' })
    expect(within(sezione).queryByText(/Note|Prima fioritura|Temp pianta/)).not.toBeInTheDocument()
  })

  it('una pianta senza misure lo dice, e la storia anche', async () => {
    apri('35')
    const sezione = await pronta()
    expect(within(sezione).getByText('Ancora nessun valore da mostrare.')).toBeInTheDocument()
    expect(within(await screen.findByRole('region', { name: 'Storia' })).getByText('Ancora nessuna misura per questa pianta.')).toBeInTheDocument()
  })
})

describe('SchedaPianta: confronto con il trattamento', () => {
  /** La W1 ha le piante 33-38: le altre cinque misurate il 27/10 con SPAD 40, 41, 39, 40, 40 (media 40, ds 0,707). */
  function altreDellaW1(data = '2026-10-27') {
    return [33, 34, 36, 37, 38].map((n, i) => spad(n, [40, 41, 39, 40, 40][i], data))
  }

  it('sotto il valore c\'è la media del trattamento, piccola, e nessun segno se la pianta è nel gruppo', async () => {
    archivio = [spad(35, 41.2, '2026-10-27'), ...altreDellaW1()]
    apri('35')
    await pronta()
    const [riga] = await righe('SPAD')
    await waitFor(() => expect(riga).toHaveTextContent('media trattamento 40'))
    expect(riga).toHaveTextContent('SPAD 41,2 · ieri')
    expect(screen.queryByText('fuori dal gruppo')).not.toBeInTheDocument()
  })

  it('molto lontano dalle altre piante (oltre 5 deviazioni standard e oltre il 20% della media) compare "fuori dal gruppo", a parole', async () => {
    // Le altre: 40, 41, 39, 40, 40 (media 40, ds 0,71): soglia = max(5 ds = 3,5; 20% = 8) = 8. Il 49 è a 9.
    archivio = [spad(35, 49, '2026-10-27'), ...altreDellaW1()]
    apri('35')
    await pronta()
    const [riga] = await righe('SPAD')
    expect(await within(riga).findByText('fuori dal gruppo')).toBeInTheDocument()
    expect(riga).toHaveTextContent('media trattamento 40')
  })

  it('oltre 5 deviazioni standard ma entro il 20% della media non è fuori', async () => {
    // Le altre: 40, 41, 39, 40, 40 (ds 0,71): il 44 è a 4 dalla media, oltre 5 ds (3,5) ma sotto il 20% (8).
    archivio = [spad(35, 44, '2026-10-27'), ...altreDellaW1()]
    apri('35')
    await pronta()
    const [riga] = await righe('SPAD')
    await waitFor(() => expect(riga).toHaveTextContent('media trattamento 40'))
    expect(screen.queryByText('fuori dal gruppo')).not.toBeInTheDocument()
  })

  it.each([
    ['47,9 (scarto 7,9) è appena dentro il 20% della media', 47.9, false],
    ['48,1 (scarto 8,1) è appena oltre il 20% della media', 48.1, true],
  ])('confine del 20%%: %s', async (_nome, valore, fuori) => {
    // Le altre: 39, 40, 41 (media 40, ds 1): 5 ds = 5, il 20% della media è 8 e prevale.
    archivio = [spad(35, valore, '2026-10-27'), spad(33, 39, '2026-10-27'), spad(34, 40, '2026-10-27'), spad(36, 41, '2026-10-27')]
    apri('35')
    await pronta()
    const [riga] = await righe('SPAD')
    await waitFor(() => expect(riga).toHaveTextContent('media trattamento 40'))
    if (fuori) expect(await within(riga).findByText('fuori dal gruppo')).toBeInTheDocument()
    else expect(screen.queryByText('fuori dal gruppo')).not.toBeInTheDocument()
  })

  it.each([
    ['89 (scarto 49) è appena dentro 5 deviazioni standard', 89, false],
    ['91 (scarto 51) è appena oltre 5 deviazioni standard', 91, true],
  ])('confine delle 5 deviazioni standard: %s', async (_nome, valore, fuori) => {
    // Le altre: 30, 40, 50 (media 40, ds 10): 5 ds = 50 prevale sul 20% della media (8).
    archivio = [spad(35, valore, '2026-10-27'), spad(33, 30, '2026-10-27'), spad(34, 40, '2026-10-27'), spad(36, 50, '2026-10-27')]
    apri('35')
    await pronta()
    const [riga] = await righe('SPAD')
    await waitFor(() => expect(riga).toHaveTextContent('media trattamento 40'))
    if (fuori) expect(await within(riga).findByText('fuori dal gruppo')).toBeInTheDocument()
    else expect(screen.queryByText('fuori dal gruppo')).not.toBeInTheDocument()
  })

  it('con meno di 3 altre piante mostra la media ma non giudica', async () => {
    archivio = [spad(35, 100, '2026-10-27'), spad(33, 40, '2026-10-27'), spad(34, 41, '2026-10-27')]
    apri('35')
    await pronta()
    const [riga] = await righe('SPAD')
    await waitFor(() => expect(riga).toHaveTextContent('media trattamento 40,5'))
    expect(screen.queryByText('fuori dal gruppo')).not.toBeInTheDocument()
  })

  it('senza altre piante misurate quel giorno non c\'è nessun confronto', async () => {
    archivio = [spad(35, 41.2, '2026-10-27'), ...altreDellaW1('2026-10-26')]
    apri('35')
    await pronta()
    const [riga] = await righe('SPAD')
    await waitFor(() => expect(misureDelGiorno).toHaveBeenCalledWith('E', '2026-10-27'))
    await act(async () => {})
    expect(riga).not.toHaveTextContent('media trattamento')
  })

  it('contano solo le piante dello stesso trattamento', async () => {
    // Piante della Controllo con valori lontani, il 27/10: non entrano nella media della W1.
    archivio = [
      spad(35, 41.2, '2026-10-27'), ...altreDellaW1(),
      spad(1, 90, '2026-10-27'), spad(2, 95, '2026-10-27'), spad(3, 99, '2026-10-27'),
    ]
    apri('35')
    await pronta()
    const [riga] = await righe('SPAD')
    await waitFor(() => expect(riga).toHaveTextContent('media trattamento 40'))
  })

  it('il confronto usa le misure della data dell\'ultimo valore, una richiesta per data', async () => {
    archivio = [
      spad(35, 41.2, '2026-10-27'), ...altreDellaW1(),
      misura(35, 'Termometro', { 'Temp aria': [24], 'Temp pianta': [25] }, '2026-10-27'),
      misura(35, 'Metro', { Altezza: [70] }, '2026-10-20'),
    ]
    apri('35')
    await pronta()
    await waitFor(() => expect(misureDelGiorno).toHaveBeenCalledTimes(2))
    expect(vi.mocked(misureDelGiorno).mock.calls.map(c => c[1]).sort()).toEqual(['2026-10-20', '2026-10-27'])
    expect(vi.mocked(misureDelGiorno)).toHaveBeenCalledWith('E', '2026-10-27')
  })

  it('le liste non si confrontano: nessuna richiesta per i palchi', async () => {
    archivio = [misura(35, 'Tabella fenologica', { Palchi: [{ n: 1, valori: { n_foglie: 5 } }] }, '2026-10-27')]
    apri('35')
    await pronta()
    await act(async () => {})
    expect(misureDelGiorno).not.toHaveBeenCalled()
    expect(screen.queryByText(/media trattamento/)).not.toBeInTheDocument()
  })

  it('finché le misure del giorno non arrivano il valore c\'è e la media no: nessun numero falso', async () => {
    vi.mocked(misureDelGiorno).mockImplementation(() => new Promise(() => {}))
    archivio = [spad(35, 41.2, '2026-10-27'), ...altreDellaW1()]
    apri('35')
    await pronta()
    expect((await righe('SPAD'))[0]).toHaveTextContent('SPAD 41,2 · ieri')
    await act(async () => {})
    expect(screen.queryByText(/media trattamento/)).not.toBeInTheDocument()
  })

  it('se le misure del giorno non si leggono il valore resta, senza confronto e senza allarmi', async () => {
    vi.mocked(misureDelGiorno).mockRejectedValue(new TypeError('Failed to fetch'))
    archivio = [spad(35, 41.2, '2026-10-27'), ...altreDellaW1()]
    apri('35')
    await pronta()
    await waitFor(() => expect(misureDelGiorno).toHaveBeenCalled())
    await act(async () => {})
    expect((await righe('SPAD'))[0]).toHaveTextContent('SPAD 41,2 · ieri')
    expect(screen.queryByText(/media trattamento/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('SchedaPianta: avvisi di dati mancanti', () => {
  const avvisi = async () => within(await screen.findByRole('list', { name: 'Dati mancanti' })).getAllByRole('listitem').map(li => li.textContent)

  it('"SPAD non misurato da 8 giorni" se l\'esperimento ha una misura più recente', async () => {
    archivio = [spad(35, 41.2, '2026-10-20'), spad(34, 40, '2026-10-27')]
    apri('35')
    await pronta()
    expect(await avvisi()).toEqual(['SPAD non misurato da 8 giorni'])
  })

  it('un solo giorno è "da 1 giorno"', async () => {
    archivio = [spad(35, 41.2, '2026-10-27'), spad(34, 40, '2026-10-28')]
    apri('35')
    await pronta()
    expect(await avvisi()).toEqual(['SPAD non misurato da 1 giorno'])
  })

  it('"mai misurato" se la pianta non ha misure dello strumento ma altre piante sì; gli strumenti che nessuno ha usato non contano', async () => {
    archivio = [misura(35, 'Termometro', { 'Temp aria': [24] }, OGGI), spad(34, 40, '2026-10-27'), misura(34, 'Termometro', { 'Temp aria': [24] }, OGGI)]
    apri('35')
    await pronta()
    expect(await avvisi()).toEqual(['SPAD mai misurato'])
  })

  it('più strumenti in ritardo: un avviso per ognuno, nell\'ordine degli strumenti', async () => {
    archivio = [
      spad(35, 41.2, '2026-10-20'), misura(35, 'Termometro', { 'Temp aria': [20] }, '2026-10-26'),
      spad(34, 40, '2026-10-27'), misura(34, 'Termometro', { 'Temp aria': [24] }, OGGI),
    ]
    apri('35')
    await pronta()
    expect(await avvisi()).toEqual(['Termometro non misurato da 2 giorni', 'SPAD non misurato da 8 giorni'])
  })

  it('una pianta aggiornata non ha avvisi', async () => {
    archivio = [spad(35, 41.2, '2026-10-27'), spad(34, 40, '2026-10-27')]
    apri('35')
    await pronta()
    await waitFor(() => expect(ultimaMisuraPerStrumento).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.queryByRole('list', { name: 'Dati mancanti' })).not.toBeInTheDocument()
  })

  it('uno strumento archiviato non dà avvisi', async () => {
    strumento('SPAD').archiviato = true
    archivio = [spad(35, 41.2, '2026-10-20'), spad(34, 40, '2026-10-27')]
    apri('35')
    await pronta()
    await act(async () => {})
    expect(screen.queryByRole('list', { name: 'Dati mancanti' })).not.toBeInTheDocument()
  })

  it('finché le date degli strumenti non arrivano, e se non arrivano, non c\'è nessun avviso', async () => {
    vi.mocked(ultimaMisuraPerStrumento).mockRejectedValue(new TypeError('Failed to fetch'))
    archivio = [spad(35, 41.2, '2026-10-20'), spad(34, 40, '2026-10-27')]
    apri('35')
    await pronta()
    await waitFor(() => expect(ultimaMisuraPerStrumento).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.queryByRole('list', { name: 'Dati mancanti' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('SchedaPianta: storia', () => {
  it('elenca le misure per giorno (dal più recente), con l\'icona dello strumento e i parametri archiviati', async () => {
    par('SPAD').archiviato = true
    const oggi = misura(35, 'Termometro', { 'Temp aria': [24.5], 'Temp pianta': [null] }, OGGI, '09:12')
    const vecchiaSpad = misura(35, 'SPAD', { SPAD: [38.1] }, '2026-10-21', '09:00')
    const temp = misura(35, 'Termometro', { 'Temp aria': [22] }, '2026-10-21', '08:30')
    archivio = [oggi, vecchiaSpad, temp]
    apri('35')
    const storia = await screen.findByRole('region', { name: 'Storia' })

    const giorni = within(storia).getAllByRole('heading', { level: 4 }).map(h => h.textContent)
    expect(giorni).toEqual(['28/10/2026', '21/10/2026'])
    const voci = within(storia).getAllByRole('link')
    expect(voci.map(r => r.getAttribute('href'))).toEqual([oggi, temp, vecchiaSpad].map(m => `/esperimenti/E/misure/${m.id}`))
    expect(voci[0]).toHaveAccessibleName('09:12 · Termometro · Temp aria 24,5 °C')
    expect(voci[1]).toHaveAccessibleName('08:30 · Termometro · Temp aria 22 °C')
    expect(voci[2]).toHaveAccessibleName('09:00 · SPAD · SPAD (archiviato) 38,1')
    expect(voci[2]).toHaveTextContent('💚')
  })

  it('toccando una riga si apre la modifica della misura, sapendo di arrivare dalla scheda', async () => {
    const vecchia = misura(35, 'Termometro', { 'Temp aria': [22] }, '2026-10-21', '08:30')
    archivio = [vecchia]
    const utente = userEvent.setup()
    apri('35')
    await utente.click(await screen.findByRole('link', { name: '08:30 · Termometro · Temp aria 22 °C' }))

    expect(posizione()).toBe(`/esperimenti/E/misure/${vecchia.id}`)
    expect(screen.getByTestId('arrivo')).toHaveTextContent('{"daScheda":true}')
  })
})

describe('SchedaPianta: dati della pianta', () => {
  it('etichetta, trattamento e livello di ogni fattore; senza blocco la riga non c\'è', async () => {
    apri('35')
    const dati = await screen.findByRole('region', { name: 'Dati della pianta' })
    expect(within(dati).getByText('Etichetta').nextElementSibling).toHaveTextContent('35')
    expect(within(dati).getByText('Trattamento').nextElementSibling).toHaveTextContent('W1')
    expect(within(dati).getByText('Stress').nextElementSibling).toHaveTextContent('W1')
    expect(within(dati).getByText('Hydrochar').nextElementSibling).toHaveTextContent('No')
    expect(within(dati).queryByText('Blocco')).not.toBeInTheDocument()
  })

  it('con un blocco lo mostra', async () => {
    pianta(35).blocco = 'B2'
    apri('35')
    const dati = await screen.findByRole('region', { name: 'Dati della pianta' })
    expect(within(dati).getByText('Blocco').nextElementSibling).toHaveTextContent('B2')
  })

  it('si vedono anche prima che le misure siano arrivate', async () => {
    vi.mocked(misurePianta).mockImplementation(() => new Promise(() => {}))
    apri('35')
    expect(await screen.findByRole('region', { name: 'Dati della pianta' })).toBeInTheDocument()
  })
})

describe('SchedaPianta: misura questa pianta', () => {
  it('chiede lo strumento, solo tra quelli attivi, e porta alla misura di quella pianta', async () => {
    strumento('Metro').archiviato = true
    const utente = userEvent.setup()
    apri('35')
    await pronta()
    await utente.click(pulsante('Misura questa pianta'))

    expect(screen.getByText('Con quale strumento?')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Misura questa pianta' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button').map(b => b.textContent).filter(t => t !== 'Menu')).toEqual(
      expect.arrayContaining(['🌡Termometro', '💚SPAD', '🌱Tabella fenologica', 'Annulla']),
    )
    expect(screen.queryByRole('button', { name: 'Metro' })).not.toBeInTheDocument()

    piuTardi()
    await utente.click(pulsante('SPAD'))
    await waitFor(() => expect(posizione()).toBe(`/esperimenti/E/misura/${strumento('SPAD').id}/${pianta(35).id}`))
  })

  it('un tocco subito dopo l\'apertura della scelta è il secondo di un doppio tocco: non sceglie', async () => {
    const utente = userEvent.setup()
    apri('35')
    await pronta()
    await utente.click(pulsante('Misura questa pianta'))
    await utente.click(pulsante('Termometro'))
    expect(posizione()).toBe(`/esperimenti/E/piante/${pianta(35).id}`)

    piuTardi()
    await utente.click(pulsante('Termometro'))
    await waitFor(() => expect(posizione()).toBe(`/esperimenti/E/misura/${strumento('Termometro').id}/${pianta(35).id}`))
  })

  it('"Annulla" richiude la scelta senza andare da nessuna parte', async () => {
    const utente = userEvent.setup()
    apri('35')
    await pronta()
    await utente.click(pulsante('Misura questa pianta'))
    piuTardi()
    await utente.click(pulsante('Annulla'))

    expect(screen.queryByText('Con quale strumento?')).not.toBeInTheDocument()
    expect(pulsante('Misura questa pianta')).toBeInTheDocument()
    expect(posizione()).toBe(`/esperimenti/E/piante/${pianta(35).id}`)
  })

  /** Come se alla pianta di prima si fosse spuntato "Mantieni" su Temp aria: il modulo si apre già con un valore valido. */
  function mantenutaTempAria(valore: number) {
    const ta = par('Temp aria').id
    useCampoStore.getState().setMantieni('E', strumento('Termometro').id, OGGI, ta, true)
    useCampoStore.getState().aggiornaMantenuti('E', { [ta]: [valore] })
  }
  const salva = () => screen.findByRole('button', { name: 'Salva' })

  it('dopo la scelta dello strumento un tocco immediato sul modulo non salva: è il secondo di un doppio tocco', async () => {
    mantenutaTempAria(26)
    const utente = userEvent.setup()
    apri('35')
    await pronta()
    await utente.click(pulsante('Misura questa pianta'))
    piuTardi()
    await utente.click(pulsante('Termometro'))
    await waitFor(() => expect(posizione()).toBe(`/esperimenti/E/misura/${strumento('Termometro').id}/${pianta(35).id}`))

    // Il modulo è già lì (le misure della pianta sono in cache) e "Salva" sta dove c'era la scelta.
    await utente.click(await salva())
    await act(async () => {})
    expect(salvaMisura).not.toHaveBeenCalled()

    piuTardi()
    await utente.click(await salva())
    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
  })

  it('con un solo strumento attivo un tocco immediato sul modulo non salva', async () => {
    for (const s of config.strumenti) s.archiviato = s.nome !== 'Termometro'
    mantenutaTempAria(26)
    const utente = userEvent.setup()
    apri('35')
    await pronta()
    await utente.click(pulsante('Misura questa pianta'))
    await waitFor(() => expect(posizione()).toBe(`/esperimenti/E/misura/${strumento('Termometro').id}/${pianta(35).id}`))

    await utente.click(await salva())
    await act(async () => {})
    expect(salvaMisura).not.toHaveBeenCalled()

    piuTardi()
    await utente.click(await salva())
    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
  })

  it('con un solo strumento attivo non chiede: va diretto alla misura', async () => {
    for (const s of config.strumenti) s.archiviato = s.nome !== 'SPAD'
    const utente = userEvent.setup()
    apri('35')
    await pronta()
    await utente.click(pulsante('Misura questa pianta'))
    await waitFor(() => expect(posizione()).toBe(`/esperimenti/E/misura/${strumento('SPAD').id}/${pianta(35).id}`))
  })

  it('senza strumenti attivi lo dice, con la strada per le Impostazioni, e non offre la misura', async () => {
    for (const s of config.strumenti) s.archiviato = true
    apri('35')
    await pronta()
    expect(screen.getByText('Questo esperimento non ha strumenti attivi.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Aggiungine uno dalle Impostazioni' })).toHaveAttribute('href', '/esperimenti/E/impostazioni')
    expect(screen.queryByRole('button', { name: 'Misura questa pianta' })).not.toBeInTheDocument()
  })

  it('l\'azione c\'è anche prima che le misure arrivino', async () => {
    vi.mocked(misurePianta).mockImplementation(() => new Promise(() => {}))
    apri('35')
    expect(await screen.findByRole('button', { name: 'Misura questa pianta' })).toBeInTheDocument()
  })
})

describe('SchedaPianta: le foto', () => {
  const sezioneFoto = () => screen.findByRole('region', { name: 'Foto' })

  it('la sezione «Foto» ha solo «Aggiungi foto»: le miniature stanno nella Storia, non due volte', async () => {
    fotoDb = [fotoDi('a', { pianta_id: pianta(35).id }), fotoDi('b', { pianta_id: pianta(35).id, data: '2026-10-20' })]
    apri('35')
    const sezione = await sezioneFoto()
    expect(within(sezione).getByRole('button', { name: 'Aggiungi foto' })).toBeInTheDocument()
    // Le miniature ci sono nella Storia...
    const storia = within(await screen.findByRole('region', { name: 'Storia' }))
    expect(await storia.findAllByRole('button', { name: /^Foto del / })).toHaveLength(2)
    // ...e nella sezione «Foto» no, né l\'elenco né il testo di una galleria vuota.
    expect(within(sezione).queryByRole('button', { name: /^Foto del / })).not.toBeInTheDocument()
    expect(within(sezione).queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Foto del / })).toHaveLength(2)
    // Non c\'è un filtro per una pianta precisa nella galleria: niente collegamento che porterebbe alle foto di altre piante.
    expect(within(sezione).queryByRole('link')).not.toBeInTheDocument()
  })

  it('«Aggiungi foto» carica le foto collegate a questa pianta e compaiono nella Storia', async () => {
    const utente = userEvent.setup()
    apri('35')
    const sezione = await sezioneFoto()
    await utente.click(within(sezione).getByRole('button', { name: 'Aggiungi foto' }))
    expect(screen.getByRole('button', { name: 'Scatta' })).toBeInTheDocument()
    fireEvent.change(document.querySelector('input[type="file"][capture]')!, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } })

    await waitFor(() => expect(caricaFoto).toHaveBeenCalledTimes(1))
    expect(vi.mocked(caricaFoto).mock.calls[0][0]).toBe('E')
    expect(vi.mocked(caricaFoto).mock.calls[0][1]).toMatchObject({ piantaId: pianta(35).id, notaId: null })
    const storia = within(await screen.findByRole('region', { name: 'Storia' }))
    expect(await storia.findByRole('button', { name: 'Foto del 28/10/2026, pianta 35' })).toBeInTheDocument()
  })

  it('lo stato del caricamento sta nella sezione, con l\'errore e «Riprova»', async () => {
    vi.mocked(caricaFoto).mockRejectedValueOnce(new Error('Il server non risponde.'))
    const utente = userEvent.setup()
    apri('35')
    const sezione = await sezioneFoto()
    fireEvent.change(document.querySelector('input[type="file"][capture]')!, { target: { files: [new File(['x'], 'rotta.jpg', { type: 'image/jpeg' })] } })
    expect(await within(sezione).findByRole('alert')).toHaveTextContent('Il server non risponde.')
    await utente.click(within(sezione).getByRole('button', { name: 'Riprova rotta.jpg' }))
    await waitFor(() => expect(within(sezione).queryByRole('alert')).not.toBeInTheDocument())
    expect(caricaFoto).toHaveBeenCalledTimes(2)
  })

  it('c\'è anche se le foto non si leggono', async () => {
    vi.mocked(listaFoto).mockRejectedValue(new TypeError('Failed to fetch'))
    apri('35')
    const sezione = await sezioneFoto()
    expect(within(sezione).getByRole('button', { name: 'Aggiungi foto' })).toBeInTheDocument()
  })
})

describe('SchedaPianta: note e foto nella storia', () => {
  const storia = () => screen.findByRole('region', { name: 'Storia' })
  const trattamentoDi = (n: number) => pianta(n).trattamento_id

  it('mostra nella stessa linea del tempo, per data, misure, note e foto della pianta', async () => {
    archivio = [misura(35, 'SPAD', { SPAD: [38.1] }, '2026-10-21', '09:00')]
    noteDb = [
      notaDi('n1', { data: '2026-10-27', testo: 'Foglie ingiallite', pianta_ids: [pianta(35).id] }),
      notaDi('n2', { data: '2026-10-21', testo: 'Dopo la misura' }),
    ]
    fotoDb = [fotoDi('f1', { data: '2026-10-27', pianta_id: pianta(35).id })]
    apri('35')
    const dentro = within(await storia())
    expect(await dentro.findByText('Foglie ingiallite')).toBeInTheDocument()

    expect(dentro.getAllByRole('heading', { level: 4 }).map(h => h.textContent)).toEqual(['27/10/2026', '21/10/2026'])
    const giorni = dentro.getAllByRole('listitem').filter(li => li.querySelector('h4'))
    expect(within(giorni[0]).getByText('Foglie ingiallite')).toBeInTheDocument()
    expect(await within(giorni[0]).findByRole('button', { name: 'Foto del 27/10/2026, pianta 35' })).toBeInTheDocument()
    expect(within(giorni[1]).getByText('Dopo la misura')).toBeInTheDocument()
    expect(within(giorni[1]).getByRole('link', { name: /SPAD/ })).toBeInTheDocument()
  })

  it('una giornata con la sola nota o la sola foto compare lo stesso', async () => {
    noteDb = [notaDi('n1', { data: '2026-10-20', testo: 'Solo una nota' })]
    fotoDb = [fotoDi('f1', { data: '2026-10-10', pianta_id: pianta(35).id })]
    apri('35')
    const dentro = within(await storia())
    expect(await dentro.findByText('Solo una nota')).toBeInTheDocument()
    await dentro.findByRole('button', { name: 'Foto del 10/10/2026, pianta 35' })
    expect(dentro.getAllByRole('heading', { level: 4 }).map(h => h.textContent)).toEqual(['20/10/2026', '10/10/2026'])
    expect(dentro.queryByText('Ancora nessuna misura per questa pianta.')).not.toBeInTheDocument()
  })

  it('le note arrivano anche via trattamento ed esperimento, con il collegamento indicato; le altre no', async () => {
    noteDb = [
      notaDi('diretta', { testo: 'Diretta', pianta_ids: [pianta(35).id, pianta(2).id] }),
      notaDi('trattamento', { testo: 'Del trattamento', trattamento_ids: [trattamentoDi(35)] }),
      notaDi('esperimento', { testo: 'Di tutto' }),
      notaDi('altra', { testo: 'Di un\'altra pianta', pianta_ids: [pianta(1).id] }),
      notaDi('altro-trattamento', { testo: 'Di un altro trattamento', trattamento_ids: [trattamentoDi(1)] }),
    ]
    apri('35')
    const dentro = within(await storia())
    await dentro.findByText('Diretta')
    expect(dentro.getByText('Del trattamento')).toBeInTheDocument()
    expect(dentro.getByText('Di tutto')).toBeInTheDocument()
    expect(dentro.queryByText('Di un\'altra pianta')).not.toBeInTheDocument()
    expect(dentro.queryByText('Di un altro trattamento')).not.toBeInTheDocument()

    const riga = (testo: string) => dentro.getByText(testo).closest('li') as HTMLElement
    expect(within(riga('Diretta')).getByText('Piante 2, 35')).toHaveClass('font-mono')
    expect(within(riga('Del trattamento')).getByText('W1')).toHaveClass('font-mono')
    expect(within(riga('Di tutto')).getByText('Tutto l\'esperimento')).toHaveClass('font-mono')
  })

  it('una nota è un tocco che la apre nel Diario; un promemoria si riconosce, e fatto è barrato', async () => {
    noteDb = [
      notaDi('a', { testo: 'Da ricordare', promemoria: true, fatto_il: '2026-10-27T08:00:00.000Z' }),
    ]
    const utente = userEvent.setup()
    apri('35')
    const collegamento = await within(await storia()).findByRole('link', { name: /Da ricordare/ })
    expect(collegamento).toHaveAttribute('href', '/esperimenti/E/diario')
    expect(collegamento).toHaveTextContent(/^Promemoria · /)
    expect(within(collegamento).getByText('Da ricordare')).toHaveClass('line-through')
    await utente.click(collegamento)
    expect(posizione()).toBe('/esperimenti/E/diario')
    expect(screen.getByTestId('arrivo')).toHaveTextContent('{"apriNota":"a"}')
  })

  it('le miniature delle foto aprono il visore, che scorre solo tra le foto di quel giorno', async () => {
    fotoDb = [
      fotoDi('a', { pianta_id: pianta(35).id }), fotoDi('b', { pianta_id: pianta(35).id }),
      fotoDi('c', { pianta_id: pianta(35).id, data: '2026-10-20' }),
    ]
    const utente = userEvent.setup()
    apri('35')
    const dentro = within(await storia())
    const miniature = await dentro.findAllByRole('button', { name: 'Foto del 27/10/2026, pianta 35' })
    expect(miniature).toHaveLength(2)
    await utente.click(miniature[0])
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Foto 1 di 2')
  })

  it('le foto di altre piante non compaiono', async () => {
    fotoDb = [fotoDi('a', { pianta_id: pianta(1).id }), fotoDi('b')]
    apri('35')
    await pronta()
    await waitFor(() => expect(listaFoto).toHaveBeenCalled())
    await waitFor(() => expect(vi.mocked(listaFoto).mock.results.length).toBeGreaterThan(0))
    await act(async () => { await Promise.all(vi.mocked(listaFoto).mock.results.map(r => r.value)) })
    expect(within(await storia()).queryByRole('button', { name: /^Foto del / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Foto del / })).not.toBeInTheDocument()
  })

  it('le note e le foto in attesa di eliminazione non compaiono, nemmeno se gli elenchi vengono riletti', async () => {
    // Id propri: lo stato "in attesa" è del modulo e dura 5 secondi, anche oltre la fine del test.
    noteDb = [notaDi('nota-da-eliminare', { testo: 'Da eliminare' }), notaDi('nota-che-resta', { testo: 'Resta' })]
    fotoDb = [
      fotoDi('foto-da-eliminare', { pianta_id: pianta(35).id }),
      fotoDi('foto-che-resta', { pianta_id: pianta(35).id, data: '2026-10-20' }),
    ]
    const client = apri('35')
    const dentro = within(await storia())
    await dentro.findByText('Da eliminare')
    await dentro.findByRole('button', { name: 'Foto del 20/10/2026, pianta 35' })

    await act(async () => {
      eliminaNotaConAnnulla(client, 'E', noteDb[0])
      eliminaFotoConAnnulla(client, 'E', fotoDb[0])
      await client.invalidateQueries()
    })
    await waitFor(() => expect(dentro.queryByText('Da eliminare')).not.toBeInTheDocument())
    expect(dentro.getByText('Resta')).toBeInTheDocument()
    expect(dentro.queryByRole('button', { name: 'Foto del 27/10/2026, pianta 35' })).not.toBeInTheDocument()
    expect(dentro.getByRole('button', { name: 'Foto del 20/10/2026, pianta 35' })).toBeInTheDocument()
  })

  it('se le note non si leggono lo dice con «Riprova» e le misure restano; poi compaiono', async () => {
    archivio = [misura(35, 'SPAD', { SPAD: [38.1] }, '2026-10-21', '09:00')]
    vi.mocked(listaNote).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    noteDb = [notaDi('n1', { testo: 'Arrivata dopo', data: '2026-10-21' })]
    const utente = userEvent.setup()
    apri('35')
    const dentro = within(await storia())
    expect(await dentro.findByRole('alert')).toHaveTextContent('Il server non risponde')
    expect(dentro.getByRole('link', { name: /SPAD/ })).toBeInTheDocument()
    await utente.click(dentro.getByRole('button', { name: 'Riprova' }))
    expect(await dentro.findByText('Arrivata dopo')).toBeInTheDocument()
    expect(dentro.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('se le foto non si leggono lo dice con «Riprova» e le misure restano; poi compaiono', async () => {
    archivio = [misura(35, 'SPAD', { SPAD: [38.1] }, '2026-10-21', '09:00')]
    vi.mocked(listaFoto).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fotoDb = [fotoDi('f1', { data: '2026-10-21', pianta_id: pianta(35).id })]
    const utente = userEvent.setup()
    apri('35')
    const dentro = within(await storia())
    expect(await dentro.findByRole('alert')).toHaveTextContent('Il server non risponde')
    expect(dentro.getByRole('link', { name: /SPAD/ })).toBeInTheDocument()
    await utente.click(dentro.getByRole('button', { name: 'Riprova' }))
    expect(await dentro.findByRole('button', { name: 'Foto del 21/10/2026, pianta 35' })).toBeInTheDocument()
    expect(dentro.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('senza misure, note e foto dice che non c\'è nulla', async () => {
    apri('35')
    expect(within(await storia()).getByText('Ancora nessuna misura per questa pianta.')).toBeInTheDocument()
  })
})

describe('SchedaPianta: «Aggiungi nota»', () => {
  it('porta all\'editor del Diario già collegato a questa pianta, con il ritorno alla scheda', async () => {
    const utente = userEvent.setup()
    apri('35')
    await utente.click(await screen.findByRole('link', { name: 'Aggiungi nota' }))
    expect(posizione()).toBe('/esperimenti/E/diario')
    expect(JSON.parse(screen.getByTestId('arrivo').textContent!)).toEqual({
      nuovaPerPianta: pianta(35).id, ritorno: `/esperimenti/E/piante/${pianta(35).id}`,
    })
  })

  it('c\'è anche se le misure non si caricano', async () => {
    vi.mocked(misurePianta).mockRejectedValue(new TypeError('Failed to fetch'))
    apri('35')
    expect(await screen.findByRole('link', { name: 'Aggiungi nota' })).toBeInTheDocument()
  })
})
