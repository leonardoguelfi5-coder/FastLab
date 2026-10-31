import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
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
  ultimaMisuraPerStrumento: vi.fn(),
}))
vi.mock('@/lib/toastSalvato', () => ({ toastSalvato: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(() => 'id-toast'), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }) }))

import { toast } from 'sonner'
import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { caricaConfig } from '@/api/esperimenti'
import { misureDelGiorno, misurePianta, salvaMisura } from '@/api/misure'
import { chiavi } from '@/api/query'
import { chiaveBozza, leggiBozza } from '@/components/scheda/bozza'
import { strumentoDaCatalogo } from '@/domain/catalogo'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import type { ConfigEsperimento, Misura, Parametro, ValoriMisura } from '@/domain/tipi'
import { toastSalvato } from '@/lib/toastSalvato'
import { useCampoStore } from '@/store/campo'
import { FineGiro } from './FineGiro'
import { MisuraPianta } from './MisuraPianta'

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session
const OGGI = '2026-10-28'
const IERI = '2026-10-27'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

let config: ConfigEsperimento
/** Le misure "nel database": le letture le filtrano, `salvaMisura` le scrive (upsert per id). */
let archivio: Misura[]

const idStrumento = (nome: string) => config.strumenti.find(s => s.nome === nome)!.id
const idPianta = (etichetta: string) => config.piante.find(p => p.etichetta === etichetta)!.id
const par = (nome: string): Parametro => config.parametri.find(p => p.nome === nome)!
const par2 = (id: string): Parametro => config.parametri.find(p => p.id === id)!

/** Una misura di oggi alle 09:12, di norma SPAD 38,1: con lo SPAD (un solo parametro) la pianta è "fatta". */
function misura(etichetta: string, extra: Partial<Misura> & { valori?: ValoriMisura } = {}): Misura {
  return {
    id: crypto.randomUUID(), pianta_id: idPianta(etichetta), strumento_id: idStrumento('SPAD'),
    data_rilievo: OGGI, ora: '09:12', valori: { [par('SPAD').id]: [38.1] }, ...extra,
  }
}

/** Una misura della pianta 35 (di norma: Termometro, oggi alle 09:12), per i test del modulo con il Termometro. */
function misuraT(extra: Partial<Misura> & { valori: ValoriMisura }): Misura {
  return {
    id: crypto.randomUUID(), pianta_id: idPianta('35'), strumento_id: idStrumento('Termometro'),
    data_rilievo: OGGI, ora: '09:12', ...extra,
  }
}

/** Il Ciras del catalogo (A, gs, E, Ci) aggiunto all'esperimento: il modello Hydrochar non lo ha. */
function aggiungiCiras() {
  const { strumento, parametri } = strumentoDaCatalogo(SEMI_CATALOGO.find(v => v.nome === 'Ciras')!, config.strumenti.length)
  config.strumenti.push(strumento)
  config.parametri.push(...parametri)
}

function Posizione() {
  const { pathname } = useLocation()
  return <p data-testid="posizione">{pathname}</p>
}

/** Il gesto "indietro" del telefono: torna alla voce precedente della cronologia, senza passare dall'app. */
function IndietroDiSistema() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate(-1)}>Indietro di sistema</button>
}

const percorso = (strumento: string, etichetta: string) =>
  `/esperimenti/E/misura/${idStrumento(strumento)}/${config.piante.find(p => p.etichetta === etichetta)?.id ?? etichetta}`

/** Apre la misura di una pianta con uno strumento, arrivando dalla scelta dello strumento (la voce precedente). */
function apri(etichetta = '1', strumento = 'SPAD', voce?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalida = vi.spyOn(client, 'invalidateQueries')
  const { unmount } = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/esperimenti/E/misura', voce ?? percorso(strumento, etichetta)]} initialIndex={1}>
        <Routes>
          <Route path="/esperimenti/:espId/misura/:strumentoId/fine" element={<FineGiro />} />
          <Route path="/esperimenti/:espId/misura/:strumentoId/:piantaId" element={<MisuraPianta />} />
          <Route path="*" element={null} />
        </Routes>
        <Posizione />
        <IndietroDiSistema />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { client, invalida, unmount }
}

/** Apre la misura con il Termometro (o un altro strumento) su una pianta, di norma la 35. */
const apriT = (etichetta = '35', strumento = 'Termometro') => apri(etichetta, strumento)

const posizione = () => screen.getByTestId('posizione').textContent
const campo = (nome: string) => screen.getByLabelText(nome) as HTMLInputElement
const pulsante = (nome: string | RegExp) => screen.getByRole('button', { name: nome })
/** Aspetta il modulo: compare solo con configurazione, misure della pianta e misure del giorno arrivate. */
const pronta = () => screen.findByRole('button', { name: /^Ora: / })
const salvate = () => vi.mocked(salvaMisura).mock.calls.map(([, m]) => m)
const dialogo = () => screen.findByRole('dialog', { name: 'Scartare i valori non salvati?' })
const chiudiDialogo = async () => waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
/** Più tardi di un doppio tocco. */
const piuTardi = (secondi = 1) => vi.setSystemTime(new Date(Date.now() + secondi * 1000))
/** Il toast d'errore dopo l'uscita resta finché non lo si chiude. */
const PERSISTENTE = { duration: Infinity, action: { label: 'Chiudi', onClick: expect.any(Function) } }
const bozzeSalvate = () => Object.keys(sessionStorage).filter(k => k.startsWith('fastlab-bozza:'))
const MANTIENI = 'Mantieni questo parametro uguale anche nelle prossime misure'
const mantieni = (nome: string) => {
  let el: HTMLElement | null = campo(nome)
  while (el && !within(el).queryByRole('checkbox')) el = el.parentElement
  return within(el!).getByRole('checkbox', { name: MANTIENI })
}
const UNA = 'Correggere quella delle 09:12 o aggiungerne una nuova?'
/**
 * Una scelta all'arrivo, come la fa chi rileva: dopo aver letto la domanda (più tardi di un doppio tocco), e poi con
 * il modulo che compare al suo posto (anche lui protetto dal doppio tocco).
 */
async function scegli(utente: ReturnType<typeof userEvent.setup>, nome: string) {
  const scelta = await screen.findByRole('button', { name: nome })
  piuTardi()
  await utente.click(scelta)
  piuTardi()
}
const pianta = (etichetta: string) => screen.findByRole('heading', { level: 2, name: `Pianta #${etichetta}` })
/** Come se alla pianta di prima si fosse spuntato "Mantieni" su Temp aria (Termometro, oggi) con quel valore. */
function mantenutaTempAria(valore: number, data = OGGI) {
  const ta = par('Temp aria').id
  useCampoStore.getState().setStrumento('E', idStrumento('Termometro'))
  useCampoStore.getState().setMantieni('E', idStrumento('Termometro'), data, ta, true)
  useCampoStore.getState().aggiornaMantenuti('E', { [ta]: [valore] })
}

beforeEach(() => {
  vi.clearAllMocks()
  // Solo `Date`: i timer veri servono a React Query e a userEvent. 28 ottobre 2026, ore 10:00 (ora locale).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 28, 10, 0))
  localStorage.clear()
  sessionStorage.clear()
  useCampoStore.setState({ stato: {} })
  config = bozzaHydrochar(SEMI_CATALOGO)
  config.esperimento.id = 'E'
  archivio = []
  vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(caricaConfig).mockImplementation(async () => config)
  vi.mocked(misurePianta).mockImplementation(async id => archivio.filter(m => m.pianta_id === id))
  vi.mocked(misureDelGiorno).mockImplementation(async (_esp, data) => archivio.filter(m => m.data_rilievo === data))
  vi.mocked(salvaMisura).mockImplementation(async (_esp, m) => {
    archivio = [m, ...archivio.filter(x => x.id !== m.id)]
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('MisuraPianta: intestazione', () => {
  it('ha lo strumento come titolo, la freccia verso la scelta, "Pianta #1" con il trattamento e i soli campi dello strumento', async () => {
    apri('1')
    await pronta()
    expect(screen.getByRole('heading', { level: 1, name: '💚 SPAD' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/esperimenti/E/misura')
    expect(screen.getByRole('heading', { level: 2, name: 'Pianta #1' })).toBeInTheDocument()
    const trattamento = config.trattamenti.find(t => t.id === config.piante[0].trattamento_id)!
    expect(screen.getByText(trattamento.etichetta)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Oggi · 💚 SPAD' })).toBeInTheDocument()
    expect(campo('SPAD')).toBeInTheDocument()
    expect(screen.queryByLabelText('Temp aria')).not.toBeInTheDocument()
    // Niente storia: si misura e si va avanti.
    expect(screen.queryByRole('region', { name: 'Storia' })).not.toBeInTheDocument()
  })

  it('il numero della pianta è l\'unico testo grande: il campo "Vai alla pianta" no', async () => {
    apri('1')
    await pronta()
    expect(campo('Vai alla pianta').className).not.toContain('text-numero')
    expect(campo('Vai alla pianta').className).toContain('font-mono')
  })

  it('lo strumento della pagina diventa quello scelto: la home e la scelta riprendono da qui', async () => {
    useCampoStore.getState().setStrumento('E', idStrumento('Termometro'))
    apri('1', 'SPAD')
    await pronta()
    await waitFor(() => expect(useCampoStore.getState().dati('E').strumentoId).toBe(idStrumento('SPAD')))
  })

  it('finché le misure del giorno non arrivano non c\'è il modulo (la pianta dopo non si sa ancora)', async () => {
    vi.mocked(misureDelGiorno).mockReturnValue(new Promise(() => {}))
    apri('1')
    await pianta('1')
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    expect(screen.queryByRole('button', { name: /^Salva/ })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Caricamento…')
  })

  it('se le misure della pianta non si leggono non c\'è il modulo (i progressivi sarebbero sbagliati) e "Riprova" ci riprova', async () => {
    vi.mocked(misurePianta).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    apri('1')
    expect(await screen.findByRole('alert')).toHaveTextContent('Il server non risponde')
    expect(screen.getByRole('heading', { name: 'Pianta #1' })).toBeInTheDocument()
    expect(screen.queryByLabelText('SPAD')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Salva/ })).not.toBeInTheDocument()
    await utente.click(pulsante('Riprova'))
    expect(await pronta()).toBeInTheDocument()
    expect(campo('SPAD')).toBeInTheDocument()
  })

  it('se le misure del giorno non si leggono lo dice, con "Riprova"', async () => {
    vi.mocked(misureDelGiorno).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    apri('1')
    expect(await screen.findByRole('alert')).toHaveTextContent('Il server non risponde')
    expect(screen.queryByRole('button', { name: /^Salva/ })).not.toBeInTheDocument()
    await utente.click(pulsante('Riprova'))
    expect(await pronta()).toBeInTheDocument()
  })
})

describe('MisuraPianta: il giro', () => {
  it('dalla pianta 1, con la 2 e la 3 già fatte, "Salva e vai alla #4" salva e apre la 4', async () => {
    archivio = [misura('2'), misura('3')]
    const utente = userEvent.setup()
    apri('1')
    await pronta()
    await utente.type(campo('SPAD'), '41,2')
    await utente.click(pulsante('Salva e vai alla #4'))

    await waitFor(() => expect(posizione()).toBe(percorso('SPAD', '4')))
    await pianta('4')
    expect(salvate()).toHaveLength(1)
    expect(salvate()[0]).toMatchObject({ pianta_id: idPianta('1'), strumento_id: idStrumento('SPAD'), data_rilievo: OGGI })
    expect(salvate()[0].valori[par('SPAD').id]).toEqual([41.2])
    // Sulla 4 nessuna domanda: non ha misure.
    await pronta()
    expect(screen.queryByText(/aggiungerne una nuova/)).not.toBeInTheDocument()
  })

  it('c\'è anche "Salva", che resta sulla pianta', async () => {
    const utente = userEvent.setup()
    apri('1')
    await pronta()
    await utente.type(campo('SPAD'), '41')
    await utente.click(pulsante('Salva'))
    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('button', { name: '10:00 · SPAD 41' })).toBeInTheDocument()
    expect(posizione()).toBe(percorso('SPAD', '1'))
  })

  it('"Salva e vai" prende il posto della pianta: il gesto indietro torna alla scelta dello strumento', async () => {
    const utente = userEvent.setup()
    apri('1')
    await pronta()
    await utente.type(campo('SPAD'), '41')
    await utente.click(pulsante('Salva e vai alla #2'))
    await pianta('2')
    await utente.click(pulsante('Indietro di sistema'))
    expect(posizione()).toBe('/esperimenti/E/misura')
  })

  it('sull\'ultima pianta da misurare "Salva e termina" porta alla fine del giro: "SPAD: 54/56", mancano 12 e 33', async () => {
    archivio = config.piante.filter(p => !['12', '33', '56'].includes(p.etichetta)).map(p => misura(p.etichetta))
    const utente = userEvent.setup()
    apri('56')
    await pronta()
    expect(screen.queryByRole('button', { name: /Salva e vai/ })).not.toBeInTheDocument()
    // Anche qui si può salvare e restare.
    expect(pulsante('Salva')).toBeInTheDocument()
    await utente.type(campo('SPAD'), '40')
    await utente.click(pulsante('Salva e termina'))

    await waitFor(() => expect(posizione()).toBe(`/esperimenti/E/misura/${idStrumento('SPAD')}/fine`))
    expect(await screen.findByRole('heading', { level: 2, name: 'SPAD: 54/56' })).toBeInTheDocument()
    expect(screen.getByText('Mancano 12, 33')).toBeInTheDocument()
    expect(salvate()).toHaveLength(1)
  })

  it('un doppio tocco su "Salva e termina" non tocca "Vai alle mancanti": si resta sulla fine del giro', async () => {
    archivio = config.piante.filter(p => !['12', '33', '56'].includes(p.etichetta)).map(p => misura(p.etichetta))
    const utente = userEvent.setup()
    apri('56')
    await pronta()
    await utente.type(campo('SPAD'), '40')
    await utente.click(pulsante('Salva e termina'))
    const fine = `/esperimenti/E/misura/${idStrumento('SPAD')}/fine`
    await waitFor(() => expect(posizione()).toBe(fine))

    // Il secondo tocco, subito: nello stesso punto ora c'è "Vai alle mancanti".
    await utente.click(await screen.findByRole('button', { name: 'Vai alle mancanti' }))
    await utente.click(pulsante('Scegli un altro strumento'))
    expect(posizione()).toBe(fine)

    piuTardi()
    await utente.click(pulsante('Vai alle mancanti'))
    await pianta('12')
  })

  it('la fine del giro conta subito la pianta appena salvata, senza aspettare che le misure del giorno si rileggano', async () => {
    archivio = config.piante.filter(p => p.etichetta !== '56').map(p => misura(p.etichetta))
    const prima = archivio
    // La prima lettura arriva; quelle dopo il salvataggio no (rete lenta).
    vi.mocked(misureDelGiorno).mockImplementationOnce(async () => prima).mockImplementation(() => new Promise(() => {}))
    const utente = userEvent.setup()
    apri('56')
    await pronta()
    await utente.type(campo('SPAD'), '40')
    await utente.click(pulsante('Salva e termina'))

    expect(await screen.findByRole('heading', { level: 2, name: 'SPAD: 56/56' })).toBeInTheDocument()
    expect(screen.queryByText(/^Mancano/)).not.toBeInTheDocument()
  })

  it('la pianta dopo l\'ultima non da misurare: dalla 30, con tutte le altre dopo già fatte, "Salva e termina"', async () => {
    archivio = config.piante.filter(p => Number(p.etichetta) > 30).map(p => misura(p.etichetta))
    apri('30')
    await pronta()
    expect(pulsante('Salva e termina')).toBeInTheDocument()
  })

  it('se "Salva e termina" non riesce resta sulla pianta con l\'errore, senza andare alla fine', async () => {
    archivio = config.piante.filter(p => p.etichetta !== '56').map(p => misura(p.etichetta))
    vi.mocked(salvaMisura).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    apri('56')
    await pronta()
    await utente.type(campo('SPAD'), '40')
    await utente.click(pulsante('Salva e termina'))

    const errore = await screen.findByRole('alert')
    expect(errore).toHaveTextContent('Pianta #56 non salvata.')
    expect(posizione()).toBe(percorso('SPAD', '56'))
    expect(campo('SPAD')).toHaveValue('40')

    await utente.click(within(errore).getByRole('button', { name: 'Riprova' }))
    await waitFor(() => expect(posizione()).toBe(`/esperimenti/E/misura/${idStrumento('SPAD')}/fine`))
    const [primo, secondo] = salvate()
    expect(secondo.id).toBe(primo.id)
    expect(await screen.findByRole('heading', { level: 2, name: 'SPAD: 56/56' })).toBeInTheDocument()
  })

  it('il doppio tocco su "Salva e vai" crea una sola misura e non salta due piante', async () => {
    let finisci!: () => void
    vi.mocked(salvaMisura).mockImplementationOnce(async (_esp, m) => new Promise<void>(r => {
      finisci = () => { archivio = [m, ...archivio]; r() }
    }))
    const utente = userEvent.setup()
    apri('1')
    await pronta()
    await utente.type(campo('SPAD'), '41')
    const vai = pulsante('Salva e vai alla #2')
    act(() => {
      fireEvent.click(vai)
      fireEvent.click(vai)
    })
    expect(salvaMisura).toHaveBeenCalledTimes(1)
    await act(async () => finisci())
    await pianta('2')
    await pronta()

    // Il secondo tocco arriva sulla pianta 2, nello stesso punto: non la salva e non porta alla 3.
    await utente.type(campo('SPAD'), '42')
    await utente.click(pulsante('Salva e vai alla #3'))
    await act(async () => {})
    expect(salvaMisura).toHaveBeenCalledTimes(1)
    expect(posizione()).toBe(percorso('SPAD', '2'))

    piuTardi()
    await utente.click(pulsante('Salva e vai alla #3'))
    await waitFor(() => expect(posizione()).toBe(percorso('SPAD', '3')))
    expect(salvate().map(m => m.pianta_id)).toEqual([idPianta('1'), idPianta('2')])
    expect(archivio).toHaveLength(2)
  })
})

describe('MisuraPianta: arrivo su una pianta già misurata', () => {
  it('"Vai alla pianta" 2 chiede "Correggere quella delle 09:12 o aggiungerne una nuova?", senza modulo', async () => {
    archivio = [misura('2'), misura('3')]
    const utente = userEvent.setup()
    apri('1')
    await pronta()
    await utente.type(campo('Vai alla pianta'), '2{Enter}')

    await pianta('2')
    expect(await screen.findByText(UNA)).toBeInTheDocument()
    expect(screen.queryByLabelText('SPAD')).not.toBeInTheDocument()
    expect(pulsante('Correggi')).toBeInTheDocument()
    expect(pulsante('Nuova misura')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Salva/ })).not.toBeInTheDocument()
  })

  it('"Correggi" apre la misura delle 09:12 e la salva con lo stesso id: nessun doppione', async () => {
    const esistente = misura('2')
    archivio = [esistente, misura('3')]
    const utente = userEvent.setup()
    apri('2')
    await scegli(utente, 'Correggi')

    expect(screen.getByText('Modifica della misura delle 09:12')).toBeInTheDocument()
    expect(campo('SPAD')).toHaveValue('38,1')
    await utente.clear(campo('SPAD'))
    await utente.type(campo('SPAD'), '39')
    await utente.click(pulsante('Salva e vai alla #4'))

    await waitFor(() => expect(posizione()).toBe(percorso('SPAD', '4')))
    expect(salvate()).toHaveLength(1)
    expect(salvate()[0]).toMatchObject({ id: esistente.id, ora: '09:12' })
    expect(archivio.filter(m => m.pianta_id === idPianta('2'))).toHaveLength(1)
    expect(archivio.find(m => m.id === esistente.id)?.valori[par('SPAD').id]).toEqual([39])
  })

  it('"Nuova misura" apre un modulo vuoto con un id nuovo, mai quello della misura esistente', async () => {
    const esistente = misura('2')
    archivio = [esistente]
    const utente = userEvent.setup()
    apri('2')
    await scegli(utente, 'Nuova misura')

    expect(campo('SPAD')).toHaveValue('')
    expect(screen.getByText('Nuova misura')).toBeInTheDocument()
    await utente.type(campo('SPAD'), '40')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].id).toMatch(UUID)
    expect(salvate()[0].id).not.toBe(esistente.id)
    expect(archivio.find(m => m.id === esistente.id)).toEqual(esistente)
  })

  it('con più misure nel giorno le elenca per ora, ciascuna con il suo "Correggi"', async () => {
    const mattina = misura('2')
    const pomeriggio = misura('2', { ora: '15:40', valori: { [par('SPAD').id]: [41] } })
    archivio = [pomeriggio, mattina]
    const utente = userEvent.setup()
    apri('2')

    expect(await screen.findByText('Correggere una di quelle delle 09:12 e 15:40 o aggiungerne una nuova?')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Correggi/ }).map(b => b.textContent)).toEqual(['Correggi 09:12', 'Correggi 15:40'])
    await scegli(utente, 'Correggi 15:40')
    expect(screen.getByText('Modifica della misura delle 15:40')).toBeInTheDocument()
    expect(campo('SPAD')).toHaveValue('41')
  })

  it('due misure alla stessa ora si distinguono: "09:12 (1)" e "09:12 (2)" nella domanda, nell\'elenco e nei pulsanti', async () => {
    const prima = misura('2')
    const seconda = misura('2', { valori: { [par('SPAD').id]: [41] } })
    archivio = [prima, seconda]
    const utente = userEvent.setup()
    apri('2')

    expect(await screen.findByText('Correggere una di quelle delle 09:12 (1) e 09:12 (2) o aggiungerne una nuova?')).toBeInTheDocument()
    const elenco = screen.getByRole('list', { name: 'Misure già registrate' })
    expect(within(elenco).getAllByRole('listitem').map(li => li.textContent?.split(' · ')[0])).toEqual(['09:12 (1)', '09:12 (2)'])
    expect(screen.getAllByRole('button', { name: /^Correggi/ }).map(b => b.textContent)).toEqual(['Correggi 09:12 (1)', 'Correggi 09:12 (2)'])
    await scegli(utente, 'Correggi 09:12 (2)')
    expect(campo('SPAD')).toHaveValue('41')
  })

  it('una pianta fatta aperta apposta (da un collegamento) chiede anche lei', async () => {
    archivio = [misura('7')]
    apri('7')
    expect(await screen.findByText(UNA)).toBeInTheDocument()
  })

  it('le misure di un altro strumento o di un altro giorno non contano: nessuna domanda', async () => {
    archivio = [
      misura('2', { strumento_id: idStrumento('Termometro'), valori: { [par('Temp aria').id]: [24] } }),
      misura('2', { data_rilievo: IERI }),
    ]
    apri('2')
    await pronta()
    expect(screen.queryByText(/aggiungerne una nuova/)).not.toBeInTheDocument()
  })

  it('nel giro, arrivando su una pianta incompleta (Ciras con solo A e gs) si chiede', async () => {
    aggiungiCiras()
    archivio = [misura('33', {
      strumento_id: idStrumento('Ciras'), valori: { [par('A').id]: [12.3], [par('gs').id]: [0.21] },
    })]
    const utente = userEvent.setup()
    apri('32', 'Ciras')
    await pronta()
    expect(pulsante('Salva e vai alla #33')).toBeInTheDocument()
    await utente.type(campo('A'), '11')
    await utente.click(pulsante('Salva e vai alla #33'))

    await pianta('33')
    expect(await screen.findByText(UNA)).toBeInTheDocument()
    expect(screen.queryByLabelText('E')).not.toBeInTheDocument()
  })

  it('arrivando dopo "Salva e vai", un tocco immediato sulla scelta è il secondo di un doppio tocco: non sceglie', async () => {
    // La 2 ha solo Temp aria: è incompleta, il giro ci passa e chiede.
    archivio = [misura('2', { strumento_id: idStrumento('Termometro'), valori: { [par('Temp aria').id]: [24] } })]
    const utente = userEvent.setup()
    apri('1', 'Termometro')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Salva e vai alla #2'))
    await screen.findByText(UNA)

    await utente.click(pulsante('Nuova misura'))
    expect(screen.getByText(UNA)).toBeInTheDocument()

    piuTardi()
    await utente.click(pulsante('Nuova misura'))
    expect(screen.queryByText(UNA)).not.toBeInTheDocument()
    expect(campo('Temp pianta')).toHaveValue('')
  })

  it('"Vai alle mancanti" dalla fine del giro porta alla pianta incompleta e chiede', async () => {
    aggiungiCiras()
    const completa = (etichetta: string) => misura(etichetta, {
      strumento_id: idStrumento('Ciras'),
      valori: Object.fromEntries(['A', 'gs', 'E', 'Ci'].map(n => [par(n).id, [1]])),
    })
    archivio = [
      ...config.piante.filter(p => p.etichetta !== '33').map(p => completa(p.etichetta)),
      misura('33', { strumento_id: idStrumento('Ciras'), valori: { [par('A').id]: [12.3], [par('gs').id]: [0.21] } }),
    ]
    const utente = userEvent.setup()
    apri('', 'Ciras', `/esperimenti/E/misura/${idStrumento('Ciras')}/fine`)
    expect(await screen.findByRole('heading', { level: 2, name: 'Ciras: 55/56' })).toBeInTheDocument()
    piuTardi()
    await utente.click(pulsante('Vai alle mancanti'))

    await pianta('33')
    expect(await screen.findByText(UNA)).toBeInTheDocument()
  })

  it('anche arrivando da "Vai alle mancanti" un doppio tocco non salta la domanda', async () => {
    const termometro = (etichetta: string, valori: ValoriMisura) => misura(etichetta, { strumento_id: idStrumento('Termometro'), valori })
    archivio = [
      ...config.piante.filter(p => p.etichetta !== '2').map(p => termometro(p.etichetta, { [par('Temp aria').id]: [24], [par('Temp pianta').id]: [25] })),
      termometro('2', { [par('Temp aria').id]: [24] }),
    ]
    const utente = userEvent.setup()
    apri('', 'Termometro', `/esperimenti/E/misura/${idStrumento('Termometro')}/fine`)
    const vai = await screen.findByRole('button', { name: 'Vai alle mancanti' })
    piuTardi()
    await utente.click(vai)
    await pianta('2')

    // Il secondo tocco cade su "Nuova misura", che è al posto di "Vai alle mancanti": la domanda resta.
    await utente.click(await screen.findByRole('button', { name: 'Nuova misura' }))
    expect(screen.getByText(UNA)).toBeInTheDocument()
    piuTardi()
    await utente.click(pulsante('Nuova misura'))
    expect(screen.queryByText(UNA)).not.toBeInTheDocument()
  })

  it('il modulo scelto compare dove c\'era la scelta: un doppio tocco su "Nuova misura" non salva i valori mantenuti', async () => {
    mantenutaTempAria(26)
    archivio = [misura('2', { strumento_id: idStrumento('Termometro'), valori: { [par('Temp aria').id]: [24] } })]
    const utente = userEvent.setup()
    apri('2', 'Termometro')
    await screen.findByText(UNA)
    piuTardi()
    const nuova = pulsante('Nuova misura')
    act(() => {
      fireEvent.click(nuova)
    })
    // Il modulo nuovo ha già Temp aria (mantenuta): il secondo tocco cade su "Salva e vai alla #3".
    await utente.click(pulsante('Salva e vai alla #3'))
    await act(async () => {})
    expect(salvaMisura).not.toHaveBeenCalled()
    expect(campo('Temp aria')).toHaveValue('26')
    expect(posizione()).toBe(percorso('Termometro', '2'))
  })

  it('"Vai alle mancanti" porta su una pianta da fare protetta dal doppio tocco: un secondo tocco non la salva', async () => {
    mantenutaTempAria(26)
    archivio = config.piante.filter(p => p.etichetta !== '5').map(p => misura(p.etichetta, {
      strumento_id: idStrumento('Termometro'), valori: { [par('Temp aria').id]: [24], [par('Temp pianta').id]: [25] },
    }))
    const utente = userEvent.setup()
    apri('', 'Termometro', `/esperimenti/E/misura/${idStrumento('Termometro')}/fine`)
    const vai = await screen.findByRole('button', { name: 'Vai alle mancanti' })
    piuTardi()
    await utente.click(vai)
    await pianta('5')
    await pronta()
    expect(campo('Temp aria')).toHaveValue('26')
    // Si continua a misurare: il cursore è nel primo campo da compilare.
    await waitFor(() => expect(campo('Temp pianta')).toHaveFocus())
    await utente.click(pulsante('Salva e termina'))
    await act(async () => {})
    expect(salvaMisura).not.toHaveBeenCalled()
  })
})

describe('MisuraPianta: valori non salvati e bozze', () => {
  it('una bozza non salvata ha la precedenza sulla domanda: si riprende con i suoi valori', async () => {
    archivio = [misura('2')]
    const utente = userEvent.setup()
    const primo = apri('2')
    await scegli(utente, 'Nuova misura')
    await utente.type(campo('SPAD'), '44')
    // Uscita senza passare dall'app (gesto indietro, ricarica): i valori restano nella bozza.
    primo.unmount()

    apri('2')
    await pronta()
    expect(screen.queryByText(UNA)).not.toBeInTheDocument()
    expect(screen.getByText('Bozza ripristinata.')).toBeInTheDocument()
    expect(campo('SPAD')).toHaveValue('44')
  })

  it('anche la bozza di una correzione si riprende senza domanda, sulla stessa misura', async () => {
    const esistente = misura('2')
    archivio = [esistente]
    const utente = userEvent.setup()
    const primo = apri('2')
    await scegli(utente, 'Correggi')
    await utente.clear(campo('SPAD'))
    await utente.type(campo('SPAD'), '45')
    primo.unmount()

    apri('2')
    await pronta()
    expect(screen.queryByText(UNA)).not.toBeInTheDocument()
    expect(screen.getByText('Modifica della misura delle 09:12')).toBeInTheDocument()
    expect(campo('SPAD')).toHaveValue('45')
    await utente.click(pulsante('Salva'))
    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].id).toBe(esistente.id)
  })

  it('la freccia indietro con valori scritti chiede se scartarli', async () => {
    const utente = userEvent.setup()
    apri('1')
    await pronta()
    await utente.type(campo('SPAD'), '41')
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))

    await utente.click(within(await dialogo()).getByRole('button', { name: 'Continua a modificare' }))
    await chiudiDialogo()
    expect(posizione()).toBe(percorso('SPAD', '1'))
    expect(campo('SPAD')).toHaveValue('41')

    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    await utente.click(within(await dialogo()).getByRole('button', { name: 'Scarta' }))
    await waitFor(() => expect(posizione()).toBe('/esperimenti/E/misura'))
  })

  it('"Vai alla pianta" con valori scritti chiede se scartarli prima di cambiare pianta', async () => {
    const utente = userEvent.setup()
    apri('1')
    await pronta()
    await utente.type(campo('SPAD'), '41')
    await utente.type(campo('Vai alla pianta'), '5{Enter}')

    await utente.click(within(await dialogo()).getByRole('button', { name: 'Continua a modificare' }))
    await chiudiDialogo()
    expect(posizione()).toBe(percorso('SPAD', '1'))

    await utente.click(pulsante('Vai'))
    await utente.click(within(await dialogo()).getByRole('button', { name: 'Scarta' }))
    await waitFor(() => expect(posizione()).toBe(percorso('SPAD', '5')))
    expect(salvaMisura).not.toHaveBeenCalled()
  })
})

describe('MisuraPianta: vai alla pianta', () => {
  it('"Vai alla pianta" sulla pianta attuale non chiede e non tocca i valori scritti: svuota solo il campo', async () => {
    const utente = userEvent.setup()
    apri('1')
    await pronta()
    await utente.type(campo('SPAD'), '41')
    await utente.type(campo('Vai alla pianta'), '01{Enter}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(campo('Vai alla pianta')).toHaveValue('')
    expect(campo('SPAD')).toHaveValue('41')
    expect(posizione()).toBe(percorso('SPAD', '1'))
  })

  it('" 01 " apre la pianta 1', async () => {
    const utente = userEvent.setup()
    apri('5')
    await pronta()
    await utente.type(campo('Vai alla pianta'), ' 01 ')
    await utente.click(pulsante('Vai'))
    await waitFor(() => expect(posizione()).toBe(percorso('SPAD', '1')))
    await pianta('1')
  })

  it('con etichette numeriche la tastiera è numerica, con il tasto "Vai"', async () => {
    apri('1')
    await pronta()
    expect(campo('Vai alla pianta')).toHaveAttribute('inputmode', 'numeric')
    expect(campo('Vai alla pianta')).toHaveAttribute('enterkeyhint', 'go')
  })

  it('una pianta che non c\'è: resta qui e lo dice, con il testo selezionato', async () => {
    const utente = userEvent.setup()
    apri('1')
    await pronta()
    await utente.type(campo('Vai alla pianta'), ' 999 {Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('Nessuna pianta con etichetta «999» in questo esperimento.')
    expect(campo('Vai alla pianta')).toHaveAttribute('aria-invalid', 'true')
    expect(posizione()).toBe(percorso('SPAD', '1'))
    await utente.keyboard('7')
    expect(campo('Vai alla pianta')).toHaveValue('7')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('a campo vuoto "Vai" è spento', async () => {
    apri('1')
    await pronta()
    expect(pulsante('Vai')).toBeDisabled()
  })
})

describe('MisuraPianta: mantieni', () => {
  it('spuntata Temp aria nel giro Termometro, la pianta dopo la ha già compilata con il segno "mantenuto"', async () => {
    const utente = userEvent.setup()
    apri('1', 'Termometro')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.type(campo('Temp pianta'), '25')
    await utente.click(mantieni('Temp aria'))
    await utente.click(pulsante('Salva e vai alla #2'))

    await pianta('2')
    await pronta()
    expect(campo('Temp aria')).toHaveValue('24,5')
    expect(campo('Temp aria')).toHaveAccessibleDescription(expect.stringContaining('mantenuto'))
    expect(campo('Temp pianta')).toHaveValue('')
    await waitFor(() => expect(campo('Temp pianta')).toHaveFocus())
  })

  it('cambiando strumento la spunta si azzera: tornando al Termometro la pianta non è precompilata', async () => {
    const utente = userEvent.setup()
    const primo = apri('1', 'Termometro')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(mantieni('Temp aria'))
    await utente.click(pulsante('Salva e vai alla #2'))
    await pianta('2')
    await pronta()
    expect(campo('Temp aria')).toHaveValue('24,5')
    primo.unmount()

    // Un giro con lo SPAD, poi di nuovo il Termometro.
    const secondo = apri('3', 'SPAD')
    await pronta()
    secondo.unmount()
    apri('3', 'Termometro')
    await pronta()
    expect(campo('Temp aria')).toHaveValue('')
    expect(mantieni('Temp aria')).not.toBeChecked()
    expect(screen.queryByText('mantenuto')).not.toBeInTheDocument()
  })

  it('una lista (Palchi) non ha la casella', async () => {
    apri('1', 'Tabella fenologica')
    await pronta()
    const palchi = screen.getByRole('group', { name: 'Palchi' })
    expect(within(palchi).queryByRole('checkbox', { name: MANTIENI })).not.toBeInTheDocument()
    expect(screen.getAllByRole('checkbox', { name: MANTIENI }).length).toBeGreaterThan(0)
  })
})

describe('MisuraPianta: data di rilievo', () => {
  it('con la data di ieri c\'è l\'avviso, il giro guarda le misure di ieri e la misura si salva con quella data', async () => {
    useCampoStore.getState().setData('E', IERI)
    // Oggi la 2 è fatta, ieri no: il giro di ieri passa dalla 2.
    archivio = [misura('2')]
    const utente = userEvent.setup()
    apri('1')
    await pronta()
    expect(screen.getByText('Stai registrando con data 27/10/2026, non oggi.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '27/10/2026 · 💚 SPAD' })).toBeInTheDocument()
    expect(misureDelGiorno).toHaveBeenCalledWith('E', IERI)
    await utente.type(campo('SPAD'), '40')
    await utente.click(pulsante('Salva e vai alla #2'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].data_rilievo).toBe(IERI)
    // La 2 ha una misura di oggi, non di ieri: nessuna domanda.
    await pianta('2')
    await pronta()
    expect(screen.queryByText(/aggiungerne una nuova/)).not.toBeInTheDocument()
  })

  it('a mezzanotte con valori scritti il modulo resta sul giorno in cui li si è scritti', async () => {
    vi.setSystemTime(new Date(2026, 9, 28, 23, 50))
    const utente = userEvent.setup()
    apri('1')
    await pronta()
    await utente.type(campo('SPAD'), '41')

    vi.setSystemTime(new Date(2026, 9, 29, 7, 30))
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    Reflect.deleteProperty(document, 'visibilityState')

    expect(campo('SPAD')).toHaveValue('41')
    expect(screen.getByText('Stai registrando con data 28/10/2026, non oggi.')).toBeInTheDocument()
    await utente.click(pulsante('Salva'))
    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].data_rilievo).toBe(OGGI)
  })
})

describe('MisuraPianta: casi limite', () => {
  it('uno strumento archiviato lo dice, senza modulo, e riporta alla scelta', async () => {
    config.strumenti.find(s => s.nome === 'SPAD')!.archiviato = true
    useCampoStore.getState().setStrumento('E', idStrumento('Termometro'))
    apri('1', 'SPAD')
    expect(await screen.findByText('Lo strumento «SPAD» è archiviato: non si misura più.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Scegli un altro strumento' })).toHaveAttribute('href', '/esperimenti/E/misura')
    expect(screen.queryByRole('button', { name: /^Salva/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('SPAD')).not.toBeInTheDocument()
    // La scelta di prima resta com'era.
    expect(useCampoStore.getState().dati('E').strumentoId).toBe(idStrumento('Termometro'))
  })

  it('uno strumento che non c\'è lo dice e riporta alla scelta', async () => {
    apri('1', 'SPAD', `/esperimenti/E/misura/strumento-cancellato/${idPianta('1')}`)
    expect(await screen.findByText('Questo strumento non esiste in questo esperimento.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Scegli un altro strumento' })).toHaveAttribute('href', '/esperimenti/E/misura')
    expect(screen.queryByRole('button', { name: /^Salva/ })).not.toBeInTheDocument()
  })

  it('una pianta che non c\'è lo dice, senza modulo', async () => {
    apri('inesistente')
    expect(await screen.findByText('Questa pianta non esiste in questo esperimento.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Salva/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Torna alla scelta dello strumento' })).toHaveAttribute('href', '/esperimenti/E/misura')
  })

  it('se la configurazione non si carica spiega cosa è successo, con "Riprova"', async () => {
    vi.mocked(caricaConfig).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    apri('1')
    expect(await screen.findByRole('alert')).toHaveTextContent('Il server non risponde')
    await utente.click(pulsante('Riprova'))
    expect(await pronta()).toBeInTheDocument()
  })
})

describe('MisuraPianta: salvataggio', () => {
  it('"Salva e vai alla #36" salva una volta sola anche con due tocchi rapidi, poi apre la #36', async () => {
    let finisci!: () => void
    vi.mocked(salvaMisura).mockImplementationOnce(() => new Promise<void>(r => { finisci = r }))
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')

    const vai = pulsante('Salva e vai alla #36')
    // Due tocchi prima che React ridisegni: il pulsante non è ancora disabilitato.
    act(() => {
      fireEvent.click(vai)
      fireEvent.click(vai)
    })

    expect(salvaMisura).toHaveBeenCalledTimes(1)
    const [espId, m] = vi.mocked(salvaMisura).mock.calls[0]
    expect(espId).toBe('E')
    expect(m.id).toMatch(UUID)
    expect(m).toMatchObject({ pianta_id: idPianta('35'), strumento_id: idStrumento('Termometro'), data_rilievo: OGGI })
    expect(m.ora).toMatch(/^\d{2}:\d{2}$/)
    expect(m.ora).toBe('10:00')
    expect(m.valori[par('Temp aria').id]).toEqual([24.5])
    expect(m).not.toHaveProperty('creato_da')

    // Mentre salva i pulsanti sono disabilitati.
    expect(pulsante('Salvataggio…')).toBeDisabled()
    expect(pulsante('Salva')).toBeDisabled()

    await act(async () => finisci())
    await waitFor(() => expect(posizione()).toBe(percorso('Termometro', '36')))
    expect(await screen.findByRole('heading', { name: 'Pianta #36' })).toBeInTheDocument()
    expect(salvaMisura).toHaveBeenCalledTimes(1)
  })

  it('se il salvataggio fallisce spiega cosa è successo, i valori restano e "Riprova" usa lo stesso id', async () => {
    vi.mocked(salvaMisura).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Salva e vai alla #36'))

    const errore = await screen.findByRole('alert')
    expect(errore).toHaveTextContent('Pianta #35 non salvata.')
    expect(errore).toHaveTextContent('Il server non risponde')
    expect(campo('Temp aria')).toHaveValue('24,5')
    expect(posizione()).toBe(percorso('Termometro', '35'))
    expect(toastSalvato).not.toHaveBeenCalled()

    await utente.click(within(errore).getByRole('button', { name: 'Riprova' }))

    expect(salvaMisura).toHaveBeenCalledTimes(2)
    const [primo, secondo] = salvate()
    expect(secondo.id).toBe(primo.id)
    expect(secondo.valori).toEqual(primo.valori)
    // "Riprova" ripete l'azione scelta: salvata, si va alla pianta dopo.
    await waitFor(() => expect(posizione()).toBe(percorso('Termometro', '36')))
  })

  it('un nuovo tentativo tiene l\'ora del primo, anche se nel frattempo il tempo è trascorso', async () => {
    vi.mocked(salvaMisura).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Salva'))
    await screen.findByRole('alert')
    expect(pulsante('Ora: 10:00')).toBeInTheDocument()

    vi.setSystemTime(new Date(2026, 9, 28, 10, 7))
    await utente.click(pulsante('Riprova'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(2))
    expect(salvate().map(m => m.ora)).toEqual(['10:00', '10:00'])
  })

  it('con un valore fuori dall\'intervallo il primo tocco avvisa e il pulsante diventa "Salva comunque", il secondo salva', async () => {
    par('Temp aria').valore_max = 40
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '45')
    await utente.click(pulsante('Salva'))

    expect(salvaMisura).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('«Temp aria» = 45 °C è fuori dall\'intervallo atteso (≤ 40).')
    expect(pulsante('Salva comunque')).toBeInTheDocument()
    expect(pulsante('Salva comunque e vai alla #36')).toBeInTheDocument()

    piuTardi()
    await utente.click(pulsante('Salva comunque'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].valori[par('Temp aria').id]).toEqual([45])
  })

  it('cambiando un valore dopo l\'avviso si torna a "Salva": il nuovo valore va ricontrollato', async () => {
    par('Temp aria').valore_max = 40
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '45')
    await utente.click(pulsante('Salva e vai alla #36'))
    expect(pulsante('Salva comunque e vai alla #36')).toBeInTheDocument()

    await utente.type(campo('Temp aria'), '46')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(pulsante('Salva e vai alla #36')).toBeInTheDocument()
    await utente.click(pulsante('Salva e vai alla #36'))
    expect(salvaMisura).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('«Temp aria» = 46 °C')
  })

  it('senza nessun valore non salva e dice "Nessun valore inserito.", con il focus sul messaggio', async () => {
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.click(pulsante('Salva e vai alla #36'))

    const errori = screen.getByRole('alert')
    expect(errori).toHaveTextContent('Nessun valore inserito.')
    expect(errori).toHaveFocus()
    expect(salvaMisura).not.toHaveBeenCalled()
    expect(posizione()).toBe(percorso('Termometro', '35'))
  })

  it('un numero lasciato a metà ("-") blocca il salvataggio e il messaggio nomina il campo', async () => {
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '-')
    await utente.type(campo('Temp pianta'), '25')
    await utente.click(pulsante('Salva'))

    expect(screen.getByRole('alert')).toHaveTextContent('«Temp aria»: numero non valido.')
    expect(screen.getByRole('alert')).toHaveFocus()
    expect(salvaMisura).not.toHaveBeenCalled()
  })

  it('se riesce: toast "Pianta #35 salvata ✓" e invalidazione di misure della pianta, del giorno, "ultima volta" ed esperimenti', async () => {
    const utente = userEvent.setup()
    const { invalida } = apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Salva e vai alla #36'))

    await waitFor(() => expect(toastSalvato).toHaveBeenCalledWith('Pianta #35 salvata ✓'))
    expect(toastSalvato).toHaveBeenCalledTimes(1)
    expect(invalida).toHaveBeenCalledWith({ queryKey: chiavi.misurePianta(idPianta('35')) })
    expect(invalida).toHaveBeenCalledWith({ queryKey: chiavi.misureGiorno('E', OGGI) })
    // "ultima volta" nella scelta dello strumento: questa misura può essere la più recente del suo strumento.
    expect(invalida).toHaveBeenCalledWith({ queryKey: chiavi.ultimeMisure('E') })
    expect(invalida).toHaveBeenCalledWith({ queryKey: chiavi.esperimenti })
  })

  it('con la data di rilievo di ieri la misura si salva con quella data', async () => {
    useCampoStore.getState().setData('E', IERI)
    const utente = userEvent.setup()
    const { invalida } = apriT('35')
    await pronta()
    expect(screen.getByText('Stai registrando con data 27/10/2026, non oggi.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '27/10/2026 · 🌡 Termometro' })).toBeInTheDocument()

    await utente.type(campo('Temp aria'), '21')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].data_rilievo).toBe(IERI)
    await waitFor(() => expect(invalida).toHaveBeenCalledWith({ queryKey: chiavi.misureGiorno('E', IERI) }))
  })

  it('"Salva" resta sulla pianta: la misura compare tra quelle di oggi e il modulo ricomincia con un id nuovo', async () => {
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.type(campo('Temp pianta'), '25,1')
    await utente.click(mantieni('Temp aria'))
    await utente.click(pulsante('Salva'))

    expect(await screen.findByRole('button', { name: '10:00 · Temp aria 24,5 °C · Temp pianta 25,1 °C' })).toBeInTheDocument()
    expect(toastSalvato).toHaveBeenCalledWith('Pianta #35 salvata ✓')
    expect(posizione()).toBe(percorso('Termometro', '35'))
    // Il modulo nuovo parte da valoriIniziali: Temp aria è mantenuta (spuntata), Temp pianta no.
    expect(campo('Temp aria')).toHaveValue('24,5')
    expect(campo('Temp pianta')).toHaveValue('')
    expect(mantieni('Temp aria')).toBeChecked()
    expect(mantieni('Temp pianta')).not.toBeChecked()
    expect(screen.getByText('Nuova misura')).toBeInTheDocument()

    await utente.type(campo('Temp pianta'), '26')
    piuTardi()
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(2))
    const [prima, seconda] = salvate()
    expect(seconda.id).toMatch(UUID)
    expect(seconda.id).not.toBe(prima.id)
  })

  it('subito dopo "Salva" un tocco sul modulo nuovo, nello stesso punto, non salva: è il secondo di un doppio tocco', async () => {
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(mantieni('Temp aria'))
    await utente.click(pulsante('Salva'))
    await screen.findByRole('button', { name: '10:00 · Temp aria 24,5 °C' })
    expect(salvaMisura).toHaveBeenCalledTimes(1)

    // Il modulo nuovo ha già Temp aria (mantenuta): un tocco troppo vicino salverebbe una seconda misura uguale.
    await utente.click(pulsante('Salva'))
    await act(async () => {})
    expect(salvaMisura).toHaveBeenCalledTimes(1)

    piuTardi()
    await utente.click(pulsante('Salva'))
    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(2))
  })

  it('appena arrivati sulla #36 con "Salva e vai", un tocco immediato su "Salva e vai alla #37" non salva la #36', async () => {
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(mantieni('Temp aria'))
    await utente.click(pulsante('Salva e vai alla #36'))
    await screen.findByRole('heading', { name: 'Pianta #36' })
    await pronta()

    await utente.click(pulsante('Salva e vai alla #37'))
    await act(async () => {})
    expect(salvaMisura).toHaveBeenCalledTimes(1)
    expect(posizione()).toBe(percorso('Termometro', '36'))

    piuTardi()
    await utente.click(pulsante('Salva e vai alla #37'))
    await waitFor(() => expect(posizione()).toBe(percorso('Termometro', '37')))
    expect(salvate().map(m => m.pianta_id)).toEqual([idPianta('35'), idPianta('36')])
  })

  it('una misura nuova non scrive i parametri lasciati vuoti: nei valori solo quelli compilati', async () => {
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(Object.keys(salvate()[0].valori)).toEqual([par('Temp aria').id])
  })

  it('correggere una misura che non aveva un parametro non crea la sua chiave vuota; uno svuotato resta', async () => {
    const ta = par('Temp aria').id
    const tp = par('Temp pianta').id
    const vecchia = misuraT({ ora: '09:12', valori: { [ta]: [24.5] } })
    archivio = [vecchia]
    const utente = userEvent.setup()
    apriT('35')
    await scegli(utente, 'Correggi')
    await utente.type(campo('Temp aria'), '25')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].valori).toEqual({ [ta]: [25] })
    expect(salvate()[0].valori).not.toHaveProperty(tp)
  })

  it('un esperimento concluso resta modificabile', async () => {
    config.esperimento.stato = 'concluso'
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Salva'))
    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
  })

  it('l\'ora si può cambiare: "Ora: 10:00" apre il campo e la misura si salva con l\'ora scelta', async () => {
    const utente = userEvent.setup()
    apriT('35')
    await utente.click(await pronta())
    const ora = screen.getByLabelText('Ora')
    expect(ora).toHaveValue('10:00')
    fireEvent.change(ora, { target: { value: '08:30' } })
    // Svuotare il selettore non è un'ora: resta quella di prima.
    fireEvent.change(ora, { target: { value: '' } })
    expect(ora).toHaveValue('08:30')

    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].ora).toBe('08:30')
  })

  it('se si esce dalla pagina mentre salva e il salvataggio fallisce, lo dice comunque', async () => {
    let fallisci!: (e: unknown) => void
    vi.mocked(salvaMisura).mockImplementationOnce(() => new Promise<void>((_r, rifiuta) => { fallisci = rifiuta }))
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Salva e vai alla #36'))
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    expect(posizione()).toBe('/esperimenti/E/misura')

    await act(async () => fallisci(new TypeError('Failed to fetch')))

    expect(toast.error).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(
      /^Pianta #35 non salvata\. Il server non risponde\. .*\(vedi README\)\. I valori sono rimasti: riapri la pianta per riprovare\.$/,
    ), PERSISTENTE)
    expect(posizione()).toBe('/esperimenti/E/misura')
    // Durante il salvataggio l'uscita non chiede di scartare: i valori erano già partiti.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('il messaggio dopo l\'uscita dice il vero: riaprendo la pianta i valori ci sono, anche quelli solo precompilati (mantenuti)', async () => {
    mantenutaTempAria(26)
    let fallisci!: (e: unknown) => void
    vi.mocked(salvaMisura).mockImplementationOnce(() => new Promise<void>((_r, rifiuta) => { fallisci = rifiuta }))
    const utente = userEvent.setup()
    const { unmount } = apriT('35')
    await pronta()
    // Temp aria è mantenuta: si salva senza toccare nulla.
    await utente.click(pulsante('Salva e vai alla #36'))
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    await act(async () => fallisci(new Error('boom')))
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      'Pianta #35 non salvata. Errore imprevisto: boom. I valori sono rimasti: riapri la pianta per riprovare.',
      PERSISTENTE,
    )
    unmount()

    mantenutaTempAria(30)
    apriT('35')
    await pronta()
    expect(screen.getByText('Bozza ripristinata.')).toBeInTheDocument()
    expect(campo('Temp aria')).toHaveValue('26')
    await utente.click(pulsante('Salva'))
    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(2))
    const [primo, secondo] = salvate()
    expect(secondo.id).toBe(primo.id)
  })
})

describe('MisuraPianta: salvataggio finito dopo l\'uscita dalla pagina', () => {
  /** Salva (senza aspettare la risposta) ed esce dalla pagina con la freccia indietro. */
  async function salvaEdEsci(utente: ReturnType<typeof userEvent.setup>) {
    let fine!: { riesci: () => void; fallisci: (e: unknown) => void }
    vi.mocked(salvaMisura).mockImplementationOnce(async (_esp, m) => new Promise<void>((riesci, fallisci) => {
      fine = {
        riesci: () => { archivio = [m, ...archivio]; riesci() },
        fallisci,
      }
    }))
    await utente.click(pulsante(/^Salva e vai/))
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    return fine
  }
  const bozzaNuova = (data = OGGI) =>
    leggiBozza(chiaveBozza({ espId: 'E', piantaId: idPianta('35'), strumentoId: idStrumento('Termometro'), dataRilievo: data, misuraId: null }))

  it('con una data che non è oggi il messaggio dice con quale data riaprire la pianta', async () => {
    useCampoStore.getState().setData('E', IERI)
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '21')
    const fine = await salvaEdEsci(utente)
    await act(async () => fine.fallisci(new Error('boom')))

    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      'Pianta #35 non salvata. Errore imprevisto: boom. I valori sono rimasti: riapri la pianta con data 27/10/2026 per riprovare.',
      PERSISTENTE,
    )
    expect(bozzaNuova(IERI)?.valori[par('Temp aria').id]).toEqual([21])
  })

  it('un fallimento tardivo non sovrascrive la bozza di un modulo aperto dopo, rientrando, e non promette i suoi valori', async () => {
    mantenutaTempAria(26)
    const utente = userEvent.setup()
    const primo = apriT('35')
    await pronta()
    // Temp aria è mantenuta: si salva senza toccare nulla, quindi senza bozza.
    const fine = await salvaEdEsci(utente)
    primo.unmount()

    // Si rientra sulla pianta mentre il primo tentativo è ancora in volo: un modulo nuovo, con un altro id.
    apriT('35')
    await pronta()
    await utente.type(campo('Temp pianta'), '25')
    const nuova = bozzaNuova()!
    await act(async () => fine.fallisci(new Error('boom')))

    const [tentativo] = salvate()
    expect(nuova.id).not.toBe(tentativo.id)
    expect(bozzaNuova()).toEqual(nuova)
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      'Pianta #35 non salvata. Errore imprevisto: boom. Controlla i valori della pianta e salvali di nuovo.',
      PERSISTENTE,
    )
  })

  it('un salvataggio tardivo riuscito non cancella la bozza di un modulo aperto dopo, rientrando', async () => {
    mantenutaTempAria(26)
    const utente = userEvent.setup()
    const primo = apriT('35')
    await pronta()
    const fine = await salvaEdEsci(utente)
    primo.unmount()

    apriT('35')
    await pronta()
    await utente.type(campo('Temp pianta'), '25')
    const nuova = bozzaNuova()!
    await act(async () => fine.riesci())

    expect(toastSalvato).toHaveBeenCalledWith('Pianta #35 salvata ✓')
    expect(bozzaNuova()).toEqual(nuova)
  })
})

describe('MisuraPianta: passaggio alla pianta successiva', () => {
  it('Temp aria (mantenuta con la spunta) è già compilata sulla #36, con il segno "mantenuto", e il cursore è sul primo campo vuoto', async () => {
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.type(campo('Temp pianta'), '25,1')
    await utente.click(mantieni('Temp aria'))
    await utente.click(pulsante('Salva e vai alla #36'))

    await screen.findByRole('heading', { name: 'Pianta #36' })
    await pronta()
    expect(campo('Temp aria')).toHaveValue('24,5')
    expect(campo('Temp aria')).toHaveAccessibleDescription(expect.stringContaining('mantenuto'))
    expect(screen.getAllByText('mantenuto')).toHaveLength(1)
    expect(campo('Temp pianta')).toHaveValue('')
    expect(mantieni('Temp aria')).toBeChecked()
    await waitFor(() => expect(campo('Temp pianta')).toHaveFocus())
    expect(pulsante('Salva e vai alla #37')).toBeInTheDocument()
  })

  it('senza la spunta la #36 parte vuota: niente si ricorda da solo', async () => {
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Salva e vai alla #36'))

    await screen.findByRole('heading', { name: 'Pianta #36' })
    await pronta()
    expect(campo('Temp aria')).toHaveValue('')
    expect(screen.queryByText('mantenuto')).not.toBeInTheDocument()
  })

  it('scrivendo un altro valore sulla #36 il segno "mantenuto" sparisce, e il nuovo valore è quello che si mantiene', async () => {
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(mantieni('Temp aria'))
    await utente.click(pulsante('Salva e vai alla #36'))
    await screen.findByRole('heading', { name: 'Pianta #36' })
    await pronta()
    expect(screen.getByText('mantenuto')).toBeInTheDocument()

    await utente.clear(campo('Temp aria'))
    await utente.type(campo('Temp aria'), '26')
    expect(screen.queryByText('mantenuto')).not.toBeInTheDocument()
    piuTardi()
    await utente.click(pulsante('Salva e vai alla #37'))
    await screen.findByRole('heading', { name: 'Pianta #37' })
    await pronta()
    expect(campo('Temp aria')).toHaveValue('26')
  })

  it('togliendo la spunta sulla #36 il segno "mantenuto" sparisce subito e la #37 parte senza Temp aria', async () => {
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(mantieni('Temp aria'))
    await utente.click(pulsante('Salva e vai alla #36'))
    await screen.findByRole('heading', { name: 'Pianta #36' })
    await pronta()

    expect(screen.getByText('mantenuto')).toBeInTheDocument()
    await utente.click(mantieni('Temp aria'))
    expect(screen.queryByText('mantenuto')).not.toBeInTheDocument()
    piuTardi()
    await utente.click(pulsante('Salva e vai alla #37'))
    await screen.findByRole('heading', { name: 'Pianta #37' })
    await pronta()
    expect(campo('Temp aria')).toHaveValue('')
    expect(mantieni('Temp aria')).not.toBeChecked()
  })

  it('una bozza ripresa sulla #36 tiene il segno "mantenuto" sul valore che viene dai mantenuti', async () => {
    const utente = userEvent.setup()
    const primo = apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(mantieni('Temp aria'))
    await utente.click(pulsante('Salva e vai alla #36'))
    await screen.findByRole('heading', { name: 'Pianta #36' })
    await pronta()
    await utente.type(campo('Temp pianta'), '25')
    primo.unmount()

    // Ricaricando la pagina la bozza torna con Temp aria uguale a prima: deve ancora dire da dove viene.
    apriT('36')
    await pronta()
    expect(screen.getByText('Bozza ripristinata.')).toBeInTheDocument()
    expect(campo('Temp aria')).toHaveValue('24,5')
    expect(campo('Temp aria')).toHaveAccessibleDescription(expect.stringContaining('mantenuto'))
    expect(screen.getAllByText('mantenuto')).toHaveLength(1)

    // Se il valore della bozza non è più quello mantenuto, il segno non c'è.
    await utente.clear(campo('Temp aria'))
    await utente.type(campo('Temp aria'), '30')
    expect(screen.queryByText('mantenuto')).not.toBeInTheDocument()
  })

  it('con tutti i campi già compilati dai mantenuti il cursore va sul primo campo, non su una casella', async () => {
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.type(campo('Temp pianta'), '25,1')
    await utente.click(mantieni('Temp aria'))
    await utente.click(mantieni('Temp pianta'))
    await utente.click(pulsante('Salva e vai alla #36'))
    await screen.findByRole('heading', { name: 'Pianta #36' })
    await pronta()
    expect(campo('Temp pianta')).toHaveValue('25,1')
    await waitFor(() => expect(campo('Temp aria')).toHaveFocus())
  })

  it('cambiando data di rilievo la spunta si azzera: la pianta non è più precompilata', async () => {
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(mantieni('Temp aria'))
    await utente.click(pulsante('Salva e vai alla #36'))
    await screen.findByRole('heading', { name: 'Pianta #36' })
    await pronta()
    expect(campo('Temp aria')).toHaveValue('24,5')

    // Il rilievo passa a ieri (come dalla scelta dello strumento): il modulo ricomincia e i mantenuti di oggi non valgono.
    act(() => useCampoStore.getState().setData('E', IERI))
    await pronta()
    expect(campo('Temp aria')).toHaveValue('')
    expect(mantieni('Temp aria')).not.toBeChecked()
    expect(screen.queryByText('mantenuto')).not.toBeInTheDocument()
  })

  it('i mantenuti di un altro strumento non precompilano questo: seguono lo strumento con cui si misura', async () => {
    mantenutaTempAria(26)
    // Rifatti per un altro strumento: quelli del Termometro non valgono più.
    useCampoStore.getState().setMantieni('E', idStrumento('SPAD'), OGGI, par('SPAD').id, true)
    apriT('35')
    await pronta()
    expect(campo('Temp aria')).toHaveValue('')
    expect(mantieni('Temp aria')).not.toBeChecked()
  })

  it('spuntare dal riquadro registra lo strumento e la data del riquadro', async () => {
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.click(mantieni('Temp aria'))
    expect(useCampoStore.getState().mantenutiPer('E', idStrumento('Termometro'), OGGI)?.parametri).toEqual([par('Temp aria').id])
  })

  it('la casella c\'è per numeri, testo e sì/no e non per le liste ripetute', async () => {
    apriT('35', 'Tabella fenologica')
    await pronta()
    expect(screen.getByRole('group', { name: 'Palchi' })).toBeInTheDocument()
    // Fenologici: N frutti, ecc. sono numeri, Note è testo; Palchi e Infiorescenze sono liste.
    const numeroDiCaselle = screen.getAllByRole('checkbox', { name: MANTIENI }).length
    const nonListe = config.strumenti.find(st => st.nome === 'Tabella fenologica')!.parametri
      .map(pp => par2(pp.parametro_id)).filter(p => p.tipo !== 'lista' && !p.archiviato).length
    expect(numeroDiCaselle).toBe(nonListe)
  })

  it('correggendo una misura già salvata non c\'è la casella', async () => {
    archivio = [misuraT({ valori: { [par('Temp aria').id]: [24.5] } })]
    const utente = userEvent.setup()
    apriT('35')
    await scegli(utente, 'Nuova misura')
    expect(screen.getAllByRole('checkbox', { name: MANTIENI })).toHaveLength(2)
    await utente.click(pulsante(/^09:12 · /))
    expect(screen.getByText('Modifica della misura delle 09:12')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('arrivando sulla pianta il cursore non si sposta da solo', async () => {
    apriT('35')
    await pronta()
    expect(campo('Temp aria')).not.toHaveFocus()
  })

  it('sull\'ultima pianta non c\'è "Salva e vai", solo "Salva"', async () => {
    apriT('56')
    await pronta()
    expect(screen.queryByRole('button', { name: /Salva e vai/ })).not.toBeInTheDocument()
    expect(pulsante('Salva')).toBeInTheDocument()
  })

  it('cambiando pianta un "Annulla" rimasto in sospeso sparisce con la lista', async () => {
    archivio = [misuraT({
      strumento_id: idStrumento('Tabella fenologica'), data_rilievo: '2026-10-21',
      valori: { [par('Palchi').id]: [{ n: 1, valori: { n_foglie: 5 } }] },
    })]
    const utente = userEvent.setup()
    apriT('35', 'Tabella fenologica')
    await pronta()
    await utente.click(within(screen.getByRole('group', { name: 'Palchi' })).getByRole('button', { name: 'Rimuovi ultimo' }))
    expect(toast).toHaveBeenCalledWith('Palchi 1 rimosso.', expect.anything())
    await utente.type(campo('N frutti'), '4')
    await utente.click(pulsante('Salva e vai alla #36'))

    await screen.findByRole('heading', { name: 'Pianta #36' })
    // Il toast si chiude quando la lista della #35 si smonta, nella pulizia di un effetto: React la esegue dopo aver
    // mostrato la #36, in un passo a parte. Si aspetta quel passo invece di contare che sia già avvenuto (sotto carico
    // non lo è: era il motivo per cui questo test a volte falliva).
    await waitFor(() => expect(toast.dismiss).toHaveBeenCalledWith('id-toast'))
  })
})

describe('MisuraPianta: valori precompilati', () => {
  it('i parametri progressivi (Palchi) ripartono dai valori della volta precedente', async () => {
    archivio = [
      misuraT({
        strumento_id: idStrumento('Tabella fenologica'), data_rilievo: '2026-10-14', ora: '09:00',
        valori: { [par('Palchi').id]: [{ n: 1, valori: { n_foglie: 4 } }], [par('N palchi totali').id]: [1] },
      }),
      misuraT({
        strumento_id: idStrumento('Tabella fenologica'), data_rilievo: '2026-10-21', ora: '09:00',
        valori: {
          [par('Palchi').id]: [{ n: 1, valori: { n_foglie: 5 } }, { n: 2, valori: { n_foglie: 7 } }],
          [par('N palchi totali').id]: [2],
          [par('N fiori fioriti').id]: [6],
        },
      }),
    ]
    const utente = userEvent.setup()
    apriT('35', 'Tabella fenologica')
    await pronta()

    expect(within(screen.getByRole('group', { name: 'Palchi 1' })).getByLabelText('N foglie')).toHaveValue('5')
    expect(within(screen.getByRole('group', { name: 'Palchi 2' })).getByLabelText('N foglie')).toHaveValue('7')
    expect(campo('N palchi totali')).toHaveValue('2')
    // N fiori fioriti non è progressivo: si misura da capo.
    expect(campo('N fiori fioriti')).toHaveValue('')

    await utente.type(campo('N fiori fioriti'), '4')
    // Oggi c'è un palco in più.
    await utente.click(pulsante('+ Palchi'))
    await utente.type(within(screen.getByRole('group', { name: 'Palchi 3' })).getByLabelText('N foglie'), '9')
    await utente.type(campo('N palchi totali'), '3')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    const valori = salvate()[0].valori
    expect(valori[par('Palchi').id]).toEqual([
      { n: 1, valori: { n_foglie: 5 } }, { n: 2, valori: { n_foglie: 7 } }, { n: 3, valori: { n_foglie: 9 } },
    ])
    expect(valori[par('N fiori fioriti').id]).toEqual([4])
    expect(valori[par('N palchi totali').id]).toEqual([3])
    // Il modulo successivo riparte dalla misura appena salvata, non da quella del 21/10.
    expect(await screen.findByRole('button', { name: /^10:00 · N palchi totali 3/ })).toBeInTheDocument()
    expect(campo('N palchi totali')).toHaveValue('3')
    expect(within(screen.getByRole('group', { name: 'Palchi 3' })).getByLabelText('N foglie')).toHaveValue('9')
  })
})

describe('MisuraPianta: più misure nello stesso giorno', () => {
  function dueMisure() {
    const ta = par('Temp aria').id
    const tp = par('Temp pianta').id
    const mattina = misuraT({ ora: '09:12', valori: { [ta]: [24.5], [tp]: [25.1], 'chiave-di-un-altro-strumento': 'da tenere' } })
    const pomeriggio = misuraT({ ora: '15:40', valori: { [ta]: [27], [tp]: [28.3] } })
    // Una misura di un altro strumento e una di ieri non sono "di oggi per questo strumento".
    const spad = misuraT({ strumento_id: idStrumento('SPAD'), ora: '11:00', valori: { [par('SPAD').id]: [38.1] } })
    const ieri = misuraT({ data_rilievo: IERI, ora: '09:00', valori: { [ta]: [20] } })
    archivio = [pomeriggio, spad, ieri, mattina]
    return { mattina, pomeriggio, ta, tp }
  }

  it('l\'arrivo e poi il modulo elencano le misure di oggi dello strumento, in ordine di ora', async () => {
    dueMisure()
    const utente = userEvent.setup()
    apriT('35')
    // All'arrivo: la domanda, con le due misure di questo strumento e di oggi (non quella dello SPAD né quella di ieri).
    const domanda = await screen.findByRole('list', { name: 'Misure già registrate' })
    expect(within(domanda).getAllByRole('listitem').map(li => li.textContent)).toEqual([
      '09:12 · Temp aria 24,5 °C · Temp pianta 25,1 °C', '15:40 · Temp aria 27 °C · Temp pianta 28,3 °C',
    ])
    await scegli(utente, 'Nuova misura')
    const elenco = screen.getByRole('list', { name: 'Misure già registrate' })
    expect(within(elenco).getAllByRole('button')).toHaveLength(2)
    const [prima, seconda] = within(elenco).getAllByRole('button')
    expect(prima).toHaveAccessibleName('09:12 · Temp aria 24,5 °C · Temp pianta 25,1 °C')
    expect(seconda).toHaveAccessibleName('15:40 · Temp aria 27 °C · Temp pianta 28,3 °C')
    expect(screen.getByText('Nuova misura')).toBeInTheDocument()
  })

  it('toccando una misura la si corregge: il salvataggio usa il suo id e tiene le chiavi di altri strumenti', async () => {
    const { mattina, ta, tp } = dueMisure()
    const utente = userEvent.setup()
    apriT('35')
    await scegli(utente, 'Correggi 09:12')

    expect(screen.getByText('Modifica della misura delle 09:12')).toBeInTheDocument()
    expect(campo('Temp aria')).toHaveValue('24,5')
    expect(campo('Temp pianta')).toHaveValue('25,1')
    expect(pulsante('Ora: 09:12')).toBeInTheDocument()
    expect(pulsante('+ Nuova misura')).toBeInTheDocument()

    await utente.type(campo('Temp pianta'), '25,3')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvaMisura).toHaveBeenCalledWith('E', {
      id: mattina.id, pianta_id: idPianta('35'), strumento_id: idStrumento('Termometro'), data_rilievo: OGGI, ora: '09:12',
      valori: { [ta]: [24.5], [tp]: [25.3], 'chiave-di-un-altro-strumento': 'da tenere' },
    })
    // Dopo la correzione si torna a una misura nuova.
    expect(await screen.findByText('Nuova misura')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '09:12 · Temp aria 24,5 °C · Temp pianta 25,3 °C' })).toBeInTheDocument()
  })

  it('"+ Nuova misura" lascia la correzione e torna al modulo della misura nuova (non con l\'id della corretta)', async () => {
    const { mattina } = dueMisure()
    const utente = userEvent.setup()
    apriT('35')
    await scegli(utente, 'Correggi 09:12')
    await utente.click(pulsante('+ Nuova misura'))
    // Il modulo nuovo compare dove c'era il pulsante: un tocco subito dopo sarebbe il secondo di un doppio tocco.
    piuTardi()

    expect(screen.getByText('Nuova misura')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Nuova misura' })).not.toBeInTheDocument()
    expect(campo('Temp pianta')).toHaveValue('')
    await utente.type(campo('Temp pianta'), '30')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].id).not.toBe(mattina.id)
    expect(salvate()[0].ora).toBe('10:00')
  })
})

describe('MisuraPianta: niente misure doppie', () => {
  it('"Scarta" sulla bozza ripresa tiene l\'id: un tentativo dato per fallito ma arrivato al server non si duplica', async () => {
    // Il primo tentativo scade (per l'app è fallito), ma potrebbe essere arrivato al server.
    vi.mocked(salvaMisura).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    const { unmount } = apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Salva'))
    await screen.findByRole('alert')
    unmount()

    apriT('35')
    await pronta()
    await utente.click(within(screen.getByText('Bozza ripristinata.').parentElement!).getByRole('button', { name: 'Scarta' }))
    expect(campo('Temp aria')).toHaveValue('')
    await utente.type(campo('Temp aria'), '25')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(2))
    const [primo, secondo] = salvate()
    expect(secondo.id).toBe(primo.id)
    expect(secondo.valori[par('Temp aria').id]).toEqual([25])
  })

  it('un giro in una correzione e "+ Nuova misura" tengono l\'id della misura nuova', async () => {
    const mattina = misuraT({ ora: '09:12', valori: { [par('Temp aria').id]: [24.5] } })
    archivio = [mattina]
    vi.mocked(salvaMisura).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    apriT('35')
    await scegli(utente, 'Nuova misura')
    await utente.type(campo('Temp pianta'), '25')
    await utente.click(pulsante('Salva'))
    await screen.findByRole('alert')

    await utente.click(pulsante(/^09:12 · /))
    await utente.click(within(await dialogo()).getByRole('button', { name: 'Scarta' }))
    await chiudiDialogo()
    await utente.click(pulsante('+ Nuova misura'))
    piuTardi()
    await utente.type(campo('Temp pianta'), '26')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(2))
    const [primo, secondo] = salvate()
    expect(secondo.id).toBe(primo.id)
    expect(secondo.id).not.toBe(mattina.id)
  })

  it('se la misura con quell\'id è già tra quelle di oggi (il tentativo era arrivato), "Scarta" non la riscrive', async () => {
    // Il primo tentativo arriva al server, ma la risposta no.
    vi.mocked(salvaMisura).mockImplementationOnce(async (_esp, m) => {
      archivio = [m, ...archivio]
      throw new TypeError('Failed to fetch')
    })
    const utente = userEvent.setup()
    const { unmount } = apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Salva'))
    await screen.findByRole('alert')
    unmount()

    apriT('35')
    await pronta()
    expect(pulsante('10:00 · Temp aria 24,5 °C')).toBeInTheDocument()
    await utente.click(within(screen.getByText('Bozza ripristinata.').parentElement!).getByRole('button', { name: 'Scarta' }))
    await utente.type(campo('Temp pianta'), '26')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(2))
    const [primo, secondo] = salvate()
    expect(secondo.id).not.toBe(primo.id)
    expect(archivio.find(m => m.id === primo.id)?.valori[par('Temp aria').id]).toEqual([24.5])
  })
})

describe('MisuraPianta: data di rilievo cambiata mentre si corregge', () => {
  function misuraDiIeri() {
    const ieri = misuraT({ data_rilievo: IERI, ora: '09:00', valori: { [par('Temp aria').id]: [20] } })
    archivio = [ieri]
    useCampoStore.getState().setData('E', IERI)
    return ieri
  }

  it('"Usa oggi" lascia la correzione della misura di ieri: il salvataggio crea una misura di oggi e non tocca quella di ieri', async () => {
    const ieri = misuraDiIeri()
    const utente = userEvent.setup()
    apriT('35')
    await scegli(utente, 'Correggi')
    expect(screen.getByText('Modifica della misura delle 09:00')).toBeInTheDocument()

    await utente.click(pulsante('Usa oggi'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Oggi · 🌡 Termometro' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Misure già registrate' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Modifica della misura/)).not.toBeInTheDocument()
    expect(pulsante('Ora: 10:00')).toBeInTheDocument()
    await utente.type(campo('Temp aria'), '22')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].id).not.toBe(ieri.id)
    expect(salvate()[0]).toMatchObject({ data_rilievo: OGGI, ora: '10:00' })
    expect(archivio.find(m => m.id === ieri.id)).toEqual(ieri)
  })

  it('con una correzione in corso "Usa oggi" chiede prima se scartarla', async () => {
    const ieri = misuraDiIeri()
    const utente = userEvent.setup()
    apriT('35')
    await scegli(utente, 'Correggi')
    await utente.type(campo('Temp aria'), '21')

    await utente.click(pulsante('Usa oggi'))
    await utente.click(within(await dialogo()).getByRole('button', { name: 'Continua a modificare' }))
    await chiudiDialogo()
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe(IERI)
    expect(screen.getByText('Modifica della misura delle 09:00')).toBeInTheDocument()
    expect(campo('Temp aria')).toHaveValue('21')

    await utente.click(pulsante('Usa oggi'))
    await utente.click(within(await dialogo()).getByRole('button', { name: 'Scarta' }))
    await chiudiDialogo()

    expect(useCampoStore.getState().dati('E').dataRilievo).toBe(OGGI)
    expect(await screen.findByRole('heading', { name: 'Oggi · 🌡 Termometro' })).toBeInTheDocument()
    expect(campo('Temp aria')).toHaveValue('')
    expect(bozzeSalvate()).toEqual([])
    expect(salvaMisura).not.toHaveBeenCalled()
    expect(archivio).toEqual([ieri])
  })
})

describe('MisuraPianta: mezzanotte con la data non scelta', () => {
  const DOMANI = '2026-10-29'

  /** Il telefono riaperto il mattino dopo: la pagina torna visibile e "oggi" è un altro giorno. */
  function riapertoIlMattinoDopo() {
    vi.setSystemTime(new Date(2026, 9, 29, 7, 30))
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
  }

  beforeEach(() => vi.setSystemTime(new Date(2026, 9, 28, 23, 50)))
  afterEach(() => { Reflect.deleteProperty(document, 'visibilityState') })

  it('con valori scritti il modulo resta, sul giorno in cui li si è scritti, con l\'avviso "non oggi"', async () => {
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    const prima = campo('Temp aria')

    riapertoIlMattinoDopo()

    // Lo stesso modulo, non uno ricreato dalla bozza.
    expect(campo('Temp aria')).toBe(prima)
    expect(campo('Temp aria')).toHaveValue('24,5')
    expect(screen.queryByText('Bozza ripristinata.')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '28/10/2026 · 🌡 Termometro' })).toBeInTheDocument()
    expect(screen.getByText('Stai registrando con data 28/10/2026, non oggi.')).toBeInTheDocument()

    await utente.click(pulsante('Salva'))
    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].data_rilievo).toBe(OGGI)
  })

  it('"Usa oggi" chiede prima se scartare i valori; scartati, si riparte dal giorno nuovo', async () => {
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    riapertoIlMattinoDopo()

    await utente.click(pulsante('Usa oggi'))
    await utente.click(within(await dialogo()).getByRole('button', { name: 'Continua a modificare' }))
    await chiudiDialogo()
    expect(campo('Temp aria')).toHaveValue('24,5')

    await utente.click(pulsante('Usa oggi'))
    await utente.click(within(await dialogo()).getByRole('button', { name: 'Scarta' }))
    await chiudiDialogo()
    expect(await screen.findByRole('heading', { name: 'Oggi · 🌡 Termometro' })).toBeInTheDocument()
    expect(campo('Temp aria')).toHaveValue('')
    expect(screen.queryByText(/non oggi/)).not.toBeInTheDocument()
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe(DOMANI)
    expect(bozzeSalvate()).toEqual([])
  })

  it('senza valori scritti si passa al giorno nuovo, senza fissare la data', async () => {
    apriT('35')
    await pronta()
    riapertoIlMattinoDopo()

    expect(await screen.findByRole('heading', { name: 'Oggi · 🌡 Termometro' })).toBeInTheDocument()
    expect(screen.queryByText(/non oggi/)).not.toBeInTheDocument()
    expect(useCampoStore.getState().stato.E.dataRilievo).toBeUndefined()
  })

  it('con una data scelta a mano non cambia nulla: resta quella', async () => {
    useCampoStore.getState().setData('E', '2026-10-20')
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    riapertoIlMattinoDopo()

    expect(campo('Temp aria')).toHaveValue('24,5')
    expect(screen.getByText('Stai registrando con data 20/10/2026, non oggi.')).toBeInTheDocument()
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe('2026-10-20')
  })
})

describe('MisuraPianta: valori non salvati', () => {
  function unaMisuraDiOggi() {
    const m = misuraT({ ora: '09:12', valori: { [par('Temp aria').id]: [24.5], [par('Temp pianta').id]: [25.1] } })
    archivio = [m]
    return m
  }

  it('toccando una misura di oggi con valori scritti chiede se scartarli; "Continua a modificare" li tiene', async () => {
    unaMisuraDiOggi()
    const utente = userEvent.setup()
    apriT('35')
    await scegli(utente, 'Nuova misura')
    await utente.type(campo('Temp aria'), '30')
    await utente.click(pulsante(/^09:12 · /))

    const d = await dialogo()
    expect(d).toHaveTextContent('I valori inseriti per questa misura andranno persi.')
    await utente.click(within(d).getByRole('button', { name: 'Continua a modificare' }))
    await chiudiDialogo()
    expect(campo('Temp aria')).toHaveValue('30')
    expect(screen.getByText('Nuova misura')).toBeInTheDocument()

    await utente.click(pulsante(/^09:12 · /))
    await utente.click(within(await dialogo()).getByRole('button', { name: 'Scarta' }))
    await chiudiDialogo()
    expect(screen.getByText('Modifica della misura delle 09:12')).toBeInTheDocument()
    expect(campo('Temp aria')).toHaveValue('24,5')
    expect(bozzeSalvate()).toEqual([])
  })

  it('senza valori scritti si passa da una misura all\'altra e si esce senza domande', async () => {
    unaMisuraDiOggi()
    const utente = userEvent.setup()
    apriT('35')
    await scegli(utente, 'Nuova misura')
    await utente.click(pulsante(/^09:12 · /))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Modifica della misura delle 09:12')).toBeInTheDocument()
    await utente.click(pulsante('+ Nuova misura'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Nuova misura')).toBeInTheDocument()
    // Aprire il selettore dell'ora non è ancora una modifica.
    await utente.click(pulsante('Ora: 10:00'))
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(posizione()).toBe('/esperimenti/E/misura')
  })

  it('"+ Nuova misura" con una correzione scritta chiede se scartarla', async () => {
    unaMisuraDiOggi()
    const utente = userEvent.setup()
    apriT('35')
    await scegli(utente, 'Correggi')
    await utente.type(campo('Temp pianta'), '26')
    await utente.click(pulsante('+ Nuova misura'))

    await utente.click(within(await dialogo()).getByRole('button', { name: 'Scarta' }))
    await chiudiDialogo()
    expect(screen.getByText('Nuova misura')).toBeInTheDocument()
    expect(campo('Temp pianta')).toHaveValue('')
    expect(salvaMisura).not.toHaveBeenCalled()
  })

  it('la freccia indietro con l\'ora cambiata a mano chiede conferma; "Scarta" esce davvero', async () => {
    const utente = userEvent.setup()
    apriT('35')
    await utente.click(await pronta())
    fireEvent.change(screen.getByLabelText('Ora'), { target: { value: '08:30' } })
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))

    await utente.click(within(await dialogo()).getByRole('button', { name: 'Continua a modificare' }))
    await chiudiDialogo()
    expect(posizione()).toBe(percorso('Termometro', '35'))
    expect(screen.getByLabelText('Ora')).toHaveValue('08:30')

    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    await utente.click(within(await dialogo()).getByRole('button', { name: 'Scarta' }))
    await waitFor(() => expect(posizione()).toBe('/esperimenti/E/misura'))
    expect(bozzeSalvate()).toEqual([])
  })

  it('chiudendo o ricaricando la pagina con valori scritti il browser chiede conferma', async () => {
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    const prima = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(prima)
    expect(prima.defaultPrevented).toBe(false)

    await utente.type(campo('Temp aria'), '24,5')
    const dopo = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dopo)
    expect(dopo.defaultPrevented).toBe(true)
  })

  it('uscendo senza passare dall\'app (gesto indietro) i valori restano: riaprendo la pagina tornano, con "Scarta"', async () => {
    const utente = userEvent.setup()
    const { unmount } = apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Indietro di sistema'))
    expect(posizione()).toBe('/esperimenti/E/misura')
    unmount()

    apriT('35')
    await pronta()
    const avviso = screen.getByText('Bozza ripristinata.')
    expect(campo('Temp aria')).toHaveValue('24,5')

    await utente.click(within(avviso.parentElement!).getByRole('button', { name: 'Scarta' }))

    expect(screen.queryByText('Bozza ripristinata.')).not.toBeInTheDocument()
    expect(campo('Temp aria')).toHaveValue('')
    expect(bozzeSalvate()).toEqual([])
  })

  it('la bozza di una correzione si riapre tornando sulla pianta, sulla stessa misura', async () => {
    const m = unaMisuraDiOggi()
    const tp = par('Temp pianta').id
    const utente = userEvent.setup()
    const { unmount } = apriT('35')
    await scegli(utente, 'Correggi')
    await utente.type(campo('Temp pianta'), '26')
    await utente.click(pulsante('Indietro di sistema'))
    unmount()

    apriT('35')
    await pronta()
    expect(screen.getByText('Bozza ripristinata.')).toBeInTheDocument()
    expect(screen.getByText('Modifica della misura delle 09:12')).toBeInTheDocument()
    expect(campo('Temp pianta')).toHaveValue('26')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0]).toMatchObject({ id: m.id, ora: '09:12' })
    expect(salvate()[0].valori[tp]).toEqual([26])
    await waitFor(() => expect(bozzeSalvate()).toEqual([]))
  })

  it('"Scarta" sulla bozza di una correzione cancella anche il ricordo: la volta dopo si apre la misura nuova', async () => {
    unaMisuraDiOggi()
    const utente = userEvent.setup()
    const primo = apriT('35')
    await scegli(utente, 'Correggi')
    await utente.type(campo('Temp pianta'), '26')
    primo.unmount()

    const secondo = apriT('35')
    await pronta()
    await utente.click(within(screen.getByText('Bozza ripristinata.').parentElement!).getByRole('button', { name: 'Scarta' }))
    expect(screen.getByText('Modifica della misura delle 09:12')).toBeInTheDocument()
    expect(campo('Temp pianta')).toHaveValue('25,1')
    expect(bozzeSalvate()).toEqual([])
    secondo.unmount()

    // Senza il ricordo della correzione non si riprende nulla in silenzio: la pianta ha una misura di oggi, e si chiede.
    apriT('35')
    expect(await screen.findByText(UNA)).toBeInTheDocument()
    expect(screen.queryByText('Bozza ripristinata.')).not.toBeInTheDocument()
    expect(screen.queryByText(/Modifica della misura/)).not.toBeInTheDocument()
  })

  it('se la misura in correzione non è più tra quelle del giorno si apre la misura nuova', async () => {
    const m = unaMisuraDiOggi()
    const utente = userEvent.setup()
    const { unmount } = apriT('35')
    await scegli(utente, 'Correggi')
    await utente.type(campo('Temp pianta'), '26')
    unmount()

    // Eliminata (o spostata a un altro giorno) da un'altra schermata.
    archivio = [{ ...m, data_rilievo: IERI }]
    apriT('35')
    await pronta()
    expect(screen.queryByText(/Modifica della misura/)).not.toBeInTheDocument()
    expect(screen.queryByText('Bozza ripristinata.')).not.toBeInTheDocument()
    expect(campo('Temp pianta')).toHaveValue('')
  })

  it('una bozza ripresa salva con lo stesso id e la stessa ora del tentativo fallito: niente doppioni', async () => {
    vi.mocked(salvaMisura).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    const { unmount } = apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Salva'))
    await screen.findByRole('alert')
    unmount()

    piuTardi(300)
    apriT('35')
    await pronta()
    expect(screen.getByText('Bozza ripristinata.')).toBeInTheDocument()
    expect(pulsante('Ora: 10:00')).toBeInTheDocument()
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(2))
    const [primo, secondo] = salvate()
    expect(secondo.id).toBe(primo.id)
    expect(secondo.ora).toBe('10:00')
    await waitFor(() => expect(bozzeSalvate()).toEqual([]))
    expect(screen.queryByText('Bozza ripristinata.')).not.toBeInTheDocument()
  })

  it('un numero lasciato a metà nella bozza torna non valido: non diventa un campo vuoto che si salva', async () => {
    const utente = userEvent.setup()
    const { unmount } = apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '-')
    await utente.type(campo('Temp pianta'), '25')
    unmount()

    apriT('35')
    await pronta()
    await utente.click(pulsante('Salva'))
    expect(screen.getByRole('alert')).toHaveTextContent('«Temp aria»: numero non valido.')
    expect(salvaMisura).not.toHaveBeenCalled()
  })

  it('dopo un salvataggio riuscito non resta nessuna bozza', async () => {
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    expect(bozzeSalvate()).toHaveLength(1)
    await utente.click(pulsante('Salva e vai alla #36'))
    await screen.findByRole('heading', { name: 'Pianta #36' })
    expect(bozzeSalvate()).toEqual([])
  })
})

describe('MisuraPianta: dettagli del passaggio tra piante', () => {
  it('un doppio tocco sull\'avviso non vale come conferma: serve un secondo tocco più tardi', async () => {
    par('Temp aria').valore_max = 40
    const utente = userEvent.setup()
    apriT('35')
    await pronta()
    await utente.type(campo('Temp aria'), '45')
    await utente.click(pulsante('Salva e vai alla #36'))
    // Il secondo tocco del doppio tocco arriva sul pulsante che ora dice "Salva comunque…".
    await utente.click(pulsante('Salva comunque e vai alla #36'))
    expect(salvaMisura).not.toHaveBeenCalled()

    piuTardi()
    await utente.click(pulsante('Salva comunque e vai alla #36'))
    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
  })

  it('correggere una misura vecchia non cambia i valori mantenuti per la pianta dopo', async () => {
    const ta = par('Temp aria').id
    mantenutaTempAria(26)
    const mattina = misuraT({ ora: '09:12', valori: { [ta]: [24.5] } })
    archivio = [mattina]
    const utente = userEvent.setup()
    apriT('35')
    await scegli(utente, 'Nuova misura')
    expect(campo('Temp aria')).toHaveValue('26')

    await utente.click(pulsante(/^09:12 · /))
    piuTardi()
    await utente.type(campo('Temp aria'), '23')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].id).toBe(mattina.id)
    expect(useCampoStore.getState().dati('E').mantenuti?.valori[ta]).toEqual([26])
    expect(await screen.findByText('Nuova misura')).toBeInTheDocument()
    expect(campo('Temp aria')).toHaveValue('26')
  })

  it('le misure della pianta successiva si caricano già mentre si compila questa', async () => {
    apriT('35')
    await pronta()
    await waitFor(() => expect(misurePianta).toHaveBeenCalledWith(idPianta('36')))
  })
})
