import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

// Come le altre pagine: veri hook e vera cache di React Query, livello API finto, client Supabase mai raggiunto.
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
vi.mock('@/api/configurazione', () => ({
  salvaParametro: vi.fn(), parametriConDati: vi.fn(), pianteConDati: vi.fn(), strumentiConDati: vi.fn(), eliminaOArchiviaParametro: vi.fn(),
  archiviaParametro: vi.fn(), archiviaStrumento: vi.fn(),
  salvaStrumento: vi.fn(), eliminaStrumento: vi.fn(), aggiungiPiante: vi.fn(), aggiornaPianta: vi.fn(), eliminaPianta: vi.fn(),
  aggiornaTrattamento: vi.fn(),
}))
vi.mock('@/api/catalogo', () => ({
  listaCatalogo: vi.fn(), salvaVoceCatalogo: vi.fn(), archiviaVoceCatalogo: vi.fn(), copieDiProprieta: vi.fn(), applicaAggiornamento: vi.fn(),
}))
vi.mock('@/lib/toastSalvato', () => ({ toastSalvato: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(() => 'id-toast'), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }) }))

import { toast } from 'sonner'
import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { aggiornaEsperimento, caricaConfig } from '@/api/esperimenti'
import { listaCatalogo, salvaVoceCatalogo } from '@/api/catalogo'
import {
  aggiornaPianta, aggiornaTrattamento, aggiungiPiante, archiviaParametro, archiviaStrumento, eliminaOArchiviaParametro,
  eliminaStrumento, eliminaPianta, parametriConDati, pianteConDati, salvaParametro, salvaStrumento, strumentiConDati,
} from '@/api/configurazione'
import { chiavi } from '@/api/query'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import type { ConfigEsperimento, Parametro, Strumento } from '@/domain/tipi'
import { toastSalvato } from '@/lib/toastSalvato'
import { Impostazioni } from './Impostazioni'

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session

/** La configurazione "nel database": le funzioni dell'API finta la leggono e la cambiano. */
let config: ConfigEsperimento

const par = (nome: string): Parametro => config.parametri.find(p => p.nome === nome)!
const strum = (nome: string): Strumento => config.strumenti.find(s => s.nome === nome)!
const idPianta = (etichetta: string) => config.piante.find(p => p.etichetta === etichetta)!.id
const idTrattamento = (etichetta: string) => config.trattamenti.find(t => t.etichetta === etichetta)!.id

function Posizione() {
  return <p data-testid="posizione">{useLocation().pathname}</p>
}

function apri() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/esperimenti/E', '/esperimenti/E/impostazioni']} initialIndex={1}>
        <Routes>
          <Route path="/esperimenti/:espId/impostazioni" element={<Impostazioni />} />
          <Route path="*" element={<p>Schermata in campo</p>} />
        </Routes>
        <Posizione />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { client, utente: userEvent.setup({ delay: null }) }
}

const sezione = (nome: string) => within(screen.getByRole('region', { name: nome }))
/** Aspetta la pagina caricata (configurazione e dati delle piante e dei parametri). */
async function pronta() {
  await screen.findByRole('region', { name: 'Generale' })
  await waitFor(() => expect(screen.queryByText('Controllo dei dati in corso…')).not.toBeInTheDocument())
}
/** La riga (espandibile) di una pianta, dall'etichetta. */
const rigaPianta = (etichetta: string) =>
  sezione('Piante').getByRole('button', { name: new RegExp(`^#${etichetta}(?!\\d)`) })
/** La riga di uno strumento (con la sua icona davanti, se c'è): aperto, i suoi valori hanno righe che iniziano col loro nome. */
const rigaStrumento = (nome: string) =>
  sezione('Strumenti').getAllByRole('button', { name: new RegExp(`^(\\S+ )?${nome}`) })[0]
/** Il contenuto aperto di una voce espandibile. */
const aperta = (riga: HTMLElement) => within(riga.closest('li') as HTMLElement)
/** La riga di un valore dentro lo strumento (o la tabella) aperto. */
const rigaValore = (dentro: ReturnType<typeof aperta>, nome: string) => dentro.getByRole('button', { name: new RegExp(`^${nome}`) })
const tabella = () => sezione('Tabella fenologica')

beforeEach(() => {
  vi.clearAllMocks()
  config = bozzaHydrochar(SEMI_CATALOGO)
  config.esperimento.id = 'E'
  config.esperimento.note = 'serra 2'
  vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(caricaConfig).mockImplementation(async () => structuredClone(config))
  // Temp aria ha dati; la pianta 1 ha misure.
  vi.mocked(parametriConDati).mockImplementation(async () => new Set([par('Temp aria').id]))
  vi.mocked(pianteConDati).mockImplementation(async () => new Set([idPianta('1')]))
  // Le misure della pianta 1 sono col Termometro; gli altri strumenti non ne hanno.
  vi.mocked(strumentiConDati).mockImplementation(async () => new Set([strum('Termometro').id]))
  vi.mocked(listaCatalogo).mockResolvedValue(SEMI_CATALOGO)
  vi.mocked(salvaVoceCatalogo).mockResolvedValue(undefined)

  vi.mocked(aggiornaEsperimento).mockImplementation(async (_e, patch) => {
    config.esperimento = { ...config.esperimento, ...patch }
  })
  vi.mocked(aggiornaTrattamento).mockImplementation(async (_e, id, etichetta) => {
    config.trattamenti = config.trattamenti.map(t => (t.id === id ? { ...t, etichetta } : t))
  })
  vi.mocked(aggiornaPianta).mockImplementation(async (_e, p) => {
    config.piante = config.piante.map(x => (x.id === p.id ? p : x))
  })
  vi.mocked(aggiungiPiante).mockImplementation(async (_e, nuove) => { config.piante = [...config.piante, ...nuove] })
  vi.mocked(eliminaPianta).mockImplementation(async (_e, id) => { config.piante = config.piante.filter(p => p.id !== id) })
  vi.mocked(salvaParametro).mockImplementation(async (_e, p) => {
    config.parametri = config.parametri.some(x => x.id === p.id)
      ? config.parametri.map(x => (x.id === p.id ? p : x))
      : [...config.parametri, p]
  })
  vi.mocked(eliminaOArchiviaParametro).mockImplementation(async (_e, p) => {
    config.parametri = config.parametri.filter(x => x.id !== p.id)
    // Come il database: il collegamento ai parametri eliminati sparisce con loro (on delete cascade).
    config.strumenti = config.strumenti.map(st => ({ ...st, parametri: st.parametri.filter(pp => pp.parametro_id !== p.id) }))
    return 'eliminato'
  })
  vi.mocked(salvaStrumento).mockImplementation(async (_e, p) => {
    config.strumenti = config.strumenti.some(x => x.id === p.id)
      ? config.strumenti.map(x => (x.id === p.id ? p : x))
      : [...config.strumenti, p]
  })
  vi.mocked(eliminaStrumento).mockImplementation(async (_e, id) => { config.strumenti = config.strumenti.filter(p => p.id !== id) })
  vi.mocked(archiviaStrumento).mockImplementation(async (_e, id) => {
    config.strumenti = config.strumenti.map(x => (x.id === id ? { ...x, archiviato: true } : x))
  })
  vi.mocked(archiviaParametro).mockImplementation(async (_e, id) => {
    config.parametri = config.parametri.map(x => (x.id === id ? { ...x, archiviato: true } : x))
  })
})

describe('Impostazioni: dal piano', () => {
  it('un valore con dati ha il tipo bloccato e "Archivia il valore"; uno senza dati ha "Elimina il valore"', async () => {
    vi.mocked(parametriConDati).mockImplementation(async () => new Set([par('N frutti').id]))
    const { utente } = apri()
    await pronta()

    await utente.click(rigaValore(tabella(), 'N fruttiNumero'))
    const nFrutti = aperta(rigaValore(tabella(), 'N fruttiNumero'))
    expect(nFrutti.getByLabelText('Tipo')).toBeDisabled()
    expect(nFrutti.getByText('Il tipo non si può cambiare: ci sono già dati.')).toBeInTheDocument()
    expect(nFrutti.getByRole('button', { name: 'Archivia il valore «N frutti»' })).toBeEnabled()
    expect(nFrutti.queryByRole('button', { name: /^Elimina il valore/ })).not.toBeInTheDocument()

    await utente.click(rigaValore(tabella(), 'Note'))
    const note = aperta(rigaValore(tabella(), 'Note'))
    expect(note.getByLabelText('Tipo')).toBeEnabled()
    expect(note.getByRole('button', { name: 'Elimina il valore «Note»' })).toBeEnabled()
    expect(note.queryByRole('button', { name: /^Archivia il valore/ })).not.toBeInTheDocument()
  })

  it('"Aggiungi dal catalogo" Ciras salva i suoi 4 valori con la chiave del catalogo e poi lo strumento', async () => {
    const ciras = SEMI_CATALOGO.find(v => v.nome === 'Ciras')!
    const { utente } = apri()
    await pronta()

    await utente.click(sezione('Strumenti').getByRole('button', { name: '+ Aggiungi dal catalogo' }))
    await utente.click(await screen.findByRole('button', { name: 'Aggiungi «Ciras»' }))

    await waitFor(() => expect(salvaStrumento).toHaveBeenCalledTimes(1))
    const [esp, strumento] = vi.mocked(salvaStrumento).mock.calls[0]
    expect(esp).toBe('E')
    expect(strumento).toMatchObject({ nome: 'Ciras', tipo: 'strumento', catalogo_id: ciras.id, ordine: 4, archiviato: false })
    expect(strumento.parametri).toHaveLength(4)
    const salvati = vi.mocked(salvaParametro).mock.calls.map(([, p]) => p)
    expect(salvati.map(p => [p.nome, p.catalogo_chiave])).toEqual([['A', 'a'], ['gs', 'gs'], ['E', 'e'], ['Ci', 'ci']])
    // Dopo il massimo `ordine` dei parametri dell'esperimento (10), e prima dello strumento.
    expect(salvati.map(p => p.ordine)).toEqual([11, 12, 13, 14])
    expect(strumento.parametri.map(pp => pp.parametro_id)).toEqual(salvati.map(p => p.id))
    const ultimoParametro = Math.max(...vi.mocked(salvaParametro).mock.invocationCallOrder)
    expect(ultimoParametro).toBeLessThan(vi.mocked(salvaStrumento).mock.invocationCallOrder[0])
    await waitFor(() => expect(toastSalvato).toHaveBeenCalledWith('Strumento «Ciras» salvato.'))
    expect(await screen.findByRole('button', { name: /^🍃 Ciras/ })).toHaveTextContent('A · gs · E · Ci')
  })

  it('"Archivia" su uno strumento con misure lo archivia (nessun delete); "Elimina" compare solo senza misure', async () => {
    const termometro = strum('Termometro').id
    const { utente } = apri()
    await pronta()

    await utente.click(rigaStrumento('Termometro'))
    const termometroAperto = aperta(rigaStrumento('Termometro'))
    expect(termometroAperto.queryByRole('button', { name: 'Elimina strumento' })).not.toBeInTheDocument()
    await utente.click(termometroAperto.getByRole('button', { name: 'Archivia strumento' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Archiviare lo strumento «Termometro»?' })
    expect(archiviaStrumento).not.toHaveBeenCalled()
    await utente.click(within(dialogo).getByRole('button', { name: 'Archivia' }))

    await waitFor(() => expect(archiviaStrumento).toHaveBeenCalledWith('E', termometro))
    expect(eliminaStrumento).not.toHaveBeenCalled()
    expect(eliminaOArchiviaParametro).not.toHaveBeenCalled()
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Strumento «Termometro» archiviato.'))
    await waitFor(() => expect(sezione('Strumenti').queryByRole('button', { name: /^🌡 Termometro/ })).not.toBeInTheDocument())
    expect(sezione('Strumenti').getByRole('button', { name: 'Strumenti archiviati (1)' })).toBeInTheDocument()

    await utente.click(rigaStrumento('SPAD'))
    expect(aperta(rigaStrumento('SPAD')).getByRole('button', { name: 'Elimina strumento' })).toBeEnabled()
  })

  it('la tabella fenologica ha valori di ogni tipo; in uno strumento semplice il tipo è bloccato su numero', async () => {
    const { utente } = apri()
    await pronta()

    expect(rigaValore(tabella(), 'Palchi')).toHaveTextContent('Lista ripetuta')
    expect(rigaValore(tabella(), 'Note')).toHaveTextContent('Testo')
    await utente.click(rigaValore(tabella(), 'Note'))
    expect(aperta(rigaValore(tabella(), 'Note')).getByLabelText('Tipo')).toBeEnabled()

    await utente.click(rigaStrumento('Termometro'))
    const tempAria = rigaValore(aperta(rigaStrumento('Termometro')), 'Temp aria')
    await utente.click(tempAria)
    const campo = aperta(tempAria).getByLabelText('Tipo')
    expect(campo).toBeDisabled()
    expect(campo).toHaveValue('numero')
    expect(aperta(tempAria).getByText(/Uno strumento misura numeri/)).toBeInTheDocument()
  })

  it('la pianta con dati non ha "Rimuovi" e lo dice', async () => {
    const { utente } = apri()
    await pronta()

    await utente.click(rigaPianta('1'))
    const uno = aperta(rigaPianta('1'))
    expect(uno.queryByRole('button', { name: 'Rimuovi' })).not.toBeInTheDocument()
    expect(uno.getByText('Ha dati: non si può rimuovere')).toBeInTheDocument()
    expect(uno.getByLabelText('Trattamento')).toBeDisabled()

    await utente.click(rigaPianta('2'))
    const due = aperta(rigaPianta('2'))
    expect(due.getByRole('button', { name: 'Rimuovi' })).toBeEnabled()
    expect(due.getByLabelText('Trattamento')).toBeEnabled()
  })

  it('"Aggiungi 3 piante a «S1»" aggiunge le piante 57, 58, 59 in fondo all\'ordine', async () => {
    const { utente } = apri()
    await pronta()

    const piante = sezione('Piante')
    await utente.selectOptions(piante.getByLabelText('Trattamento delle nuove piante'), 'S1')
    await utente.type(piante.getByLabelText('Quante piante'), '3')
    await utente.click(piante.getByRole('button', { name: 'Aggiungi 3 piante a «S1»' }))

    await waitFor(() => expect(aggiungiPiante).toHaveBeenCalledTimes(1))
    const [esp, nuove] = vi.mocked(aggiungiPiante).mock.calls[0]
    expect(esp).toBe('E')
    expect(nuove.map(p => [p.etichetta, p.trattamento_id, p.ordine, p.blocco])).toEqual([
      ['57', idTrattamento('S1'), 56, null],
      ['58', idTrattamento('S1'), 57, null],
      ['59', idTrattamento('S1'), 58, null],
    ])
    await waitFor(() => expect(toastSalvato).toHaveBeenCalledWith('3 piante aggiunte a «S1».'))
    expect(await screen.findByRole('button', { name: /^#59/ })).toBeInTheDocument()
  })
})

describe('Impostazioni: generale e trattamenti', () => {
  it('salva nome, data, note e "Esperimento concluso"', async () => {
    const { utente } = apri()
    await pronta()
    const generale = sezione('Generale')
    const salva = generale.getByRole('button', { name: 'Salva' })
    expect(salva).toBeDisabled()

    await utente.clear(generale.getByLabelText('Nome'))
    await utente.type(generale.getByLabelText('Nome'), '  Hydrochar 2026 ')
    await utente.click(generale.getByRole('switch', { name: 'Esperimento concluso' }))
    await utente.click(salva)

    await waitFor(() => expect(aggiornaEsperimento).toHaveBeenCalledWith('E', {
      nome: 'Hydrochar 2026', data_inizio: null, note: 'serra 2', stato: 'concluso',
    }))
    await waitFor(() => expect(toastSalvato).toHaveBeenCalled())
    await waitFor(() => expect(generale.getByRole('button', { name: 'Salva' })).toBeDisabled())
    expect(generale.getByLabelText('Nome')).toHaveValue('Hydrochar 2026')
  })

  it('senza nome non salva', async () => {
    const { utente } = apri()
    await pronta()
    const generale = sezione('Generale')
    await utente.clear(generale.getByLabelText('Nome'))
    expect(generale.getByText('Dai un nome all\'esperimento.')).toBeInTheDocument()
    expect(generale.getByRole('button', { name: 'Salva' })).toBeDisabled()
  })

  it('i fattori sono in sola lettura; l\'etichetta di un trattamento si rinomina, ma non uguale a un\'altra', async () => {
    const { utente } = apri()
    await pronta()
    const trattamenti = sezione('Trattamenti')
    expect(trattamenti.getByText('I fattori non si modificano dopo la creazione.')).toBeInTheDocument()
    expect(trattamenti.getByText('Controllo, S1, W1, S1W1')).toBeInTheDocument()

    const s1 = idTrattamento('S1')
    const campo = trattamenti.getByDisplayValue('S1')
    const riga = within(campo.closest('li') as HTMLElement)
    await utente.clear(campo)
    await utente.type(campo, ' w1 ')
    expect(riga.getByText('C\'è già un trattamento con questa etichetta.')).toBeInTheDocument()
    await utente.click(riga.getByRole('button', { name: 'Salva' }))
    expect(aggiornaTrattamento).not.toHaveBeenCalled()

    await utente.clear(campo)
    await utente.type(campo, ' Stress S1 ')
    await utente.click(riga.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(aggiornaTrattamento).toHaveBeenCalledWith('E', s1, 'Stress S1'))
  })
})

describe('Impostazioni: piante', () => {
  it('un\'etichetta già usata (anche con spazi o maiuscole) dà un errore e non salva', async () => {
    config.piante[3].etichetta = 'B3-12'
    const prima = { ...config.piante[1] }
    const { utente } = apri()
    await pronta()

    await utente.click(rigaPianta('2'))
    const due = aperta(rigaPianta('2'))
    const etichetta = due.getByLabelText('Etichetta')
    await utente.clear(etichetta)
    await utente.type(etichetta, ' b3-12 ')
    expect(due.getByText('C\'è già una pianta con questa etichetta.')).toBeInTheDocument()
    await utente.click(due.getByRole('button', { name: 'Salva' }))
    expect(aggiornaPianta).not.toHaveBeenCalled()

    await utente.clear(etichetta)
    await utente.type(etichetta, ' 102 ')
    await utente.type(due.getByLabelText('Blocco'), ' B ')
    await utente.click(due.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(aggiornaPianta).toHaveBeenCalledWith('E', { ...prima, etichetta: '102', blocco: 'B' }))
  })

  it('"Rimuovi" su una pianta senza dati chiede conferma e la elimina', async () => {
    const due = idPianta('2')
    const { utente } = apri()
    await pronta()

    await utente.click(rigaPianta('2'))
    await utente.click(aperta(rigaPianta('2')).getByRole('button', { name: 'Rimuovi' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Rimuovere la pianta #2?' })
    expect(eliminaPianta).not.toHaveBeenCalled()
    await utente.click(within(dialogo).getByRole('button', { name: 'Rimuovi' }))

    await waitFor(() => expect(eliminaPianta).toHaveBeenCalledWith('E', due))
    await waitFor(() => expect(sezione('Piante').queryByRole('button', { name: /^#2(?!\d)/ })).not.toBeInTheDocument())
  })

  it('un numero di piante non valido non propone di aggiungerne altre', async () => {
    const { utente } = apri()
    await pronta()
    const piante = sezione('Piante')
    await utente.type(piante.getByLabelText('Quante piante'), '300')
    expect(piante.getByText('Scrivi un numero intero da 1 a 200.')).toBeInTheDocument()
    expect(piante.getByRole('button', { name: /^Aggiungi piante a «/ })).toBeDisabled()
  })

  it('dopo un errore di rete il nuovo tentativo riusa le stesse piante: niente doppioni', async () => {
    // Il primo inserimento arriva al database ma la risposta no; il secondo trova le stesse piante (23505).
    vi.mocked(aggiungiPiante)
      .mockImplementationOnce(async (_e, nuove) => {
        config.piante = [...config.piante, ...nuove]
        throw new TypeError('Failed to fetch')
      })
      .mockRejectedValueOnce({ code: '23505', message: 'duplicate key value violates unique constraint' })
    const { utente } = apri()
    await pronta()

    const piante = sezione('Piante')
    await utente.type(piante.getByLabelText('Quante piante'), '2')
    await utente.click(piante.getByRole('button', { name: /^Aggiungi 2 piante/ }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Il server non risponde')))
    await utente.click(piante.getByRole('button', { name: /^Aggiungi 2 piante/ }))

    await waitFor(() => expect(toastSalvato).toHaveBeenCalledWith('2 piante aggiunte a «Controllo».'))
    const [primo, secondo] = vi.mocked(aggiungiPiante).mock.calls.map(([, nuove]) => nuove)
    expect(secondo).toEqual(primo)
    expect(config.piante.map(p => p.etichetta).slice(-3)).toEqual(['56', '57', '58'])
  })

  it('il trattamento si cambia solo senza dati, e si ricontrolla al salvataggio', async () => {
    const { utente } = apri()
    await pronta()

    await utente.click(rigaPianta('2'))
    const due = aperta(rigaPianta('2'))
    await utente.selectOptions(due.getByLabelText('Trattamento'), 'S1')
    // Nel frattempo la pianta 2 ha ricevuto una misura: il trattamento non si cambia più.
    vi.mocked(pianteConDati).mockResolvedValue(new Set([idPianta('1'), idPianta('2')]))
    await utente.click(due.getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'La pianta #2 ha già dei dati: il trattamento non si può più cambiare.'))
    expect(aggiornaPianta).not.toHaveBeenCalled()
  })
})

describe('Impostazioni: valori degli strumenti', () => {
  it('togliere da uno strumento un valore con dati lo archivia (nessun delete); il collegamento resta', async () => {
    const tempAria = par('Temp aria').id
    const { utente } = apri()
    await pronta()

    await utente.click(rigaStrumento('Termometro'))
    const termometro = aperta(rigaStrumento('Termometro'))
    await utente.click(rigaValore(termometro, 'Temp aria'))
    await utente.click(termometro.getByRole('button', { name: 'Archivia il valore «Temp aria»' }))

    await waitFor(() => expect(archiviaParametro).toHaveBeenCalledWith('E', tempAria))
    expect(eliminaOArchiviaParametro).not.toHaveBeenCalled()
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Valore «Temp aria» archiviato.'))
    await waitFor(() => expect(termometro.queryByRole('button', { name: /^Temp aria/ })).not.toBeInTheDocument())
    // Lo strumento non si salva da sé: il collegamento al valore archiviato resta com'è nel database.
    expect(salvaStrumento).not.toHaveBeenCalled()
    expect(strum('Termometro').parametri.some(pp => pp.parametro_id === tempAria)).toBe(true)
    expect(termometro.getByRole('button', { name: 'Salva' })).toBeDisabled()
  })

  it('togliere un valore senza dati lo elimina, dopo una conferma', async () => {
    const { utente } = apri()
    await pronta()

    await utente.click(rigaStrumento('Termometro'))
    const termometro = aperta(rigaStrumento('Termometro'))
    await utente.click(rigaValore(termometro, 'Temp pianta'))
    await utente.click(termometro.getByRole('button', { name: 'Elimina il valore «Temp pianta»' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminare il valore «Temp pianta»?' })
    expect(eliminaOArchiviaParametro).not.toHaveBeenCalled()
    await utente.click(within(dialogo).getByRole('button', { name: 'Elimina' }))

    await waitFor(() => expect(eliminaOArchiviaParametro).toHaveBeenCalledWith('E', expect.objectContaining({ nome: 'Temp pianta' })))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Valore eliminato.'))
    expect(archiviaParametro).not.toHaveBeenCalled()
  })

  it('finché non si sa se un valore ha dati si archivia, non si elimina', async () => {
    vi.mocked(parametriConDati).mockReturnValue(new Promise(() => undefined))
    const { utente } = apri()
    await screen.findByRole('region', { name: 'Generale' })

    await utente.click(rigaStrumento('SPAD'))
    const spad = aperta(rigaStrumento('SPAD'))
    await utente.click(rigaValore(spad, 'SPAD'))
    expect(spad.getByRole('button', { name: 'Archivia il valore «SPAD»' })).toBeEnabled()
    expect(spad.queryByRole('button', { name: /^Elimina il valore/ })).not.toBeInTheDocument()
  })

  it('un valore nuovo si salva con lo strumento: prima il valore, poi lo strumento con il collegamento', async () => {
    const { utente } = apri()
    await pronta()

    await utente.click(rigaStrumento('Metro'))
    const metro = aperta(rigaStrumento('Metro'))
    await utente.click(metro.getByRole('button', { name: 'Aggiungi valore' }))
    await utente.type(metro.getByLabelText('Nome'), ' Diametro ')
    expect(rigaStrumento('Metro')).toHaveTextContent('Modifiche non salvate')
    await utente.click(metro.getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(toastSalvato).toHaveBeenCalledWith('Strumento «Metro» salvato.'))
    expect(salvaParametro).toHaveBeenCalledTimes(1)
    const nuovo = vi.mocked(salvaParametro).mock.calls[0][1]
    // Dopo il massimo `ordine` dell'esperimento, non solo dello strumento.
    expect(nuovo).toMatchObject({ nome: 'Diametro', ordine: 11, archiviato: false, tipo: 'numero' })
    const [, strumento] = vi.mocked(salvaStrumento).mock.calls[0]
    expect(strumento.parametri.map(pp => pp.parametro_id)).toEqual([par('Altezza').id, nuovo.id])
    expect(vi.mocked(salvaParametro).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(salvaStrumento).mock.invocationCallOrder[0])
    await waitFor(() => expect(rigaStrumento('Metro')).not.toHaveTextContent('Modifiche non salvate'))
  })

  it('"Salva" che fallisce sul secondo passo lascia la bozza e mostra l\'errore; il nuovo "Salva" riprova', async () => {
    vi.mocked(salvaStrumento).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { utente } = apri()
    await pronta()

    await utente.click(rigaStrumento('Metro'))
    const metro = aperta(rigaStrumento('Metro'))
    await utente.click(metro.getByRole('button', { name: 'Aggiungi valore' }))
    await utente.type(metro.getByLabelText('Nome'), 'Diametro')
    await utente.click(metro.getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Il server non risponde')))
    expect(toastSalvato).not.toHaveBeenCalled()
    // Il valore è già nel database, lo strumento no: la bozza resta com'è e si può riprovare.
    expect(salvaParametro).toHaveBeenCalledTimes(1)
    expect(metro.getByLabelText('Nome')).toHaveValue('Diametro')
    expect(rigaStrumento('Metro')).toHaveTextContent('Modifiche non salvate')
    expect(metro.getByRole('button', { name: 'Salva' })).toBeEnabled()

    await utente.click(metro.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(toastSalvato).toHaveBeenCalledWith('Strumento «Metro» salvato.'))
    expect(salvaStrumento).toHaveBeenCalledTimes(2)
    const [primo, secondo] = vi.mocked(salvaStrumento).mock.calls.map(([, s]) => s)
    expect(secondo).toEqual(primo)
    // Il valore, già nel database, non si riscrive; se lo si riscrivesse sarebbe lo stesso (upsert per id).
    const id = vi.mocked(salvaParametro).mock.calls[0][1].id
    expect(vi.mocked(salvaParametro).mock.calls.filter(([, p]) => p.id === id).length).toBeLessThanOrEqual(2)
    await waitFor(() => expect(config.parametri.filter(p => p.nome === 'Diametro')).toHaveLength(1))
  })

  it('"Salva" che fallisce sul primo passo non salva lo strumento', async () => {
    vi.mocked(salvaParametro).mockRejectedValueOnce({ code: '23505', message: 'duplicate key' })
    const { utente } = apri()
    await pronta()

    await utente.click(rigaStrumento('Metro'))
    const metro = aperta(rigaStrumento('Metro'))
    await utente.click(metro.getByRole('button', { name: 'Aggiungi valore' }))
    await utente.type(metro.getByLabelText('Nome'), 'Diametro')
    await utente.click(metro.getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Esiste già un elemento con questo nome o etichetta.'))
    expect(salvaStrumento).not.toHaveBeenCalled()
    expect(metro.getByLabelText('Nome')).toHaveValue('Diametro')
  })

  it('un valore con il nome di un altro valore dell\'esperimento non si salva', async () => {
    const { utente } = apri()
    await pronta()

    await utente.click(rigaStrumento('Metro'))
    const metro = aperta(rigaStrumento('Metro'))
    await utente.click(metro.getByRole('button', { name: 'Aggiungi valore' }))
    await utente.type(metro.getByLabelText('Nome'), 'temp aria')
    expect(metro.getByText('C\'è già un parametro che si chiama "Temp aria".')).toBeInTheDocument()
    expect(metro.getByRole('button', { name: 'Salva' })).toBeDisabled()
  })

  it('un errore di rete lascia i valori scritti e lo dice', async () => {
    vi.mocked(salvaStrumento).mockRejectedValue(new TypeError('Failed to fetch'))
    const { utente } = apri()
    await pronta()

    await utente.click(rigaStrumento('Metro'))
    const metro = aperta(rigaStrumento('Metro'))
    await utente.type(metro.getByLabelText('Nome dello strumento'), ' lungo')
    await utente.click(metro.getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Il server non risponde')))
    expect(metro.getByLabelText('Nome dello strumento')).toHaveValue('Metro lungo')
    expect(metro.getByRole('button', { name: 'Salva' })).toBeEnabled()
    expect(toastSalvato).not.toHaveBeenCalled()
  })

  it('un ricaricamento in background non cancella quel che si sta scrivendo', async () => {
    const { client, utente } = apri()
    await pronta()

    await utente.click(rigaStrumento('Metro'))
    await utente.type(aperta(rigaStrumento('Metro')).getByLabelText('Nome dello strumento'), ' lungo')
    await act(() => client.invalidateQueries({ queryKey: chiavi.config('E') }))
    await waitFor(() => expect(caricaConfig).toHaveBeenCalledTimes(2))
    expect(aperta(rigaStrumento('Metro lungo')).getByLabelText('Nome dello strumento')).toHaveValue('Metro lungo')
  })

  it('"Annulla le modifiche" torna ai valori salvati', async () => {
    const { utente } = apri()
    await pronta()

    await utente.click(rigaStrumento('Metro'))
    const metro = aperta(rigaStrumento('Metro'))
    await utente.type(metro.getByLabelText('Nome dello strumento'), ' lungo')
    await utente.click(metro.getByRole('button', { name: 'Annulla le modifiche' }))
    expect(metro.getByLabelText('Nome dello strumento')).toHaveValue('Metro')
    expect(rigaStrumento('Metro')).not.toHaveTextContent('Modifiche non salvate')
  })

  it('salvando uno strumento, i valori eliminati nel frattempo non si mandano', async () => {
    const tempAria = par('Temp aria').id
    const { utente } = apri()
    await pronta()

    await utente.click(rigaStrumento('Termometro'))
    const termometro = aperta(rigaStrumento('Termometro'))
    await utente.type(termometro.getByLabelText('Nome dello strumento'), ' mattino')
    await utente.click(rigaValore(termometro, 'Temp pianta'))
    await utente.click(termometro.getByRole('button', { name: 'Elimina il valore «Temp pianta»' }))
    await utente.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Elimina' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Valore eliminato.'))

    await utente.click(termometro.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(salvaStrumento).toHaveBeenCalledTimes(1))
    const [, salvato] = vi.mocked(salvaStrumento).mock.calls[0]
    expect(salvato.nome).toBe('Termometro mattino')
    expect(salvato.parametri.map(pp => pp.parametro_id)).toEqual([tempAria])
  })

  it('i valori archiviati si ripristinano dall\'elenco, che dice a quale strumento appartengono', async () => {
    par('Note').archiviato = true
    par('Temp pianta').archiviato = true
    const prima = { ...par('Temp pianta') }
    const { utente } = apri()
    await pronta()

    expect(rigaValore(tabella(), 'Palchi')).toBeInTheDocument()
    expect(tabella().queryByRole('button', { name: /^Note/ })).not.toBeInTheDocument()
    const strumenti = sezione('Strumenti')
    await utente.click(strumenti.getByRole('button', { name: 'Valori archiviati (2)' }))
    const riga = within(strumenti.getByText('Temp pianta', { selector: 'span' }).closest('li') as HTMLElement)
    expect(riga.getByText(/Termometro/)).toBeInTheDocument()
    expect(within(strumenti.getByText('Note', { selector: 'span' }).closest('li') as HTMLElement).getByText(/Tabella fenologica/)).toBeInTheDocument()
    await utente.click(riga.getByRole('button', { name: 'Ripristina' }))

    await waitFor(() => expect(salvaParametro).toHaveBeenCalledWith('E', { ...prima, archiviato: false }))
    await utente.click(rigaStrumento('Termometro'))
    expect(await aperta(rigaStrumento('Termometro')).findByRole('button', { name: /^Temp pianta/ })).toBeInTheDocument()
  })
})

describe('Impostazioni: giro di correzione, aggiungere dal catalogo e eliminare', () => {
  it('"Aggiungi «Ciras»" con un valore omonimo già presente non salva: la bozza resta, con l\'errore', async () => {
    par('SPAD').nome = 'gs'
    const { utente } = apri()
    await pronta()

    await utente.click(sezione('Strumenti').getByRole('button', { name: '+ Aggiungi dal catalogo' }))
    await utente.click(await screen.findByRole('button', { name: 'Aggiungi «Ciras»' }))

    const riga = await screen.findByRole('button', { name: /^🍃 Ciras/ })
    expect(riga).toHaveTextContent('Non salvato')
    expect(aperta(riga).getByText('C\'è già un parametro che si chiama "gs".')).toBeInTheDocument()
    expect(aperta(riga).getByRole('button', { name: 'Salva' })).toBeDisabled()
    expect(salvaParametro).not.toHaveBeenCalled()
    expect(salvaStrumento).not.toHaveBeenCalled()
  })

  it('"Aggiungi «Calibro»" con uno strumento omonimo non collegato non salva', async () => {
    strum('Metro').nome = 'Calibro'
    const { utente } = apri()
    await pronta()

    await utente.click(sezione('Strumenti').getByRole('button', { name: '+ Aggiungi dal catalogo' }))
    await utente.click(await screen.findByRole('button', { name: 'Aggiungi «Calibro»' }))

    const riga = await screen.findByRole('button', { name: /^📐 Calibro/ })
    expect(aperta(riga).getByText('C\'è già uno strumento che si chiama "Calibro".')).toBeInTheDocument()
    expect(salvaParametro).not.toHaveBeenCalled()
    expect(salvaStrumento).not.toHaveBeenCalled()
  })

  it('eliminando un valore se ne toglie anche il collegamento dalla bozza: nessuna modifica fantasma', async () => {
    const { utente } = apri()
    await pronta()

    await utente.click(rigaStrumento('Termometro'))
    const termometro = aperta(rigaStrumento('Termometro'))
    const nome = termometro.getByLabelText('Nome dello strumento')
    await utente.type(nome, ' x')
    await utente.type(nome, '{Backspace}{Backspace}')
    expect(rigaStrumento('Termometro')).not.toHaveTextContent('Modifiche non salvate')
    await utente.click(rigaValore(termometro, 'Temp pianta'))
    await utente.click(termometro.getByRole('button', { name: 'Elimina il valore «Temp pianta»' }))
    await utente.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Elimina' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Valore eliminato.'))
    await waitFor(() => expect(termometro.queryByRole('button', { name: /^Temp pianta/ })).not.toBeInTheDocument())
    expect(rigaStrumento('Termometro')).not.toHaveTextContent('Modifiche non salvate')
    expect(termometro.getByRole('button', { name: 'Salva' })).toBeDisabled()
  })

  it('"Elimina strumento" non c\'è finché non si sa quali valori hanno dati, né se quella lettura fallisce', async () => {
    vi.mocked(parametriConDati).mockRejectedValue(new TypeError('Failed to fetch'))
    const { utente } = apri()
    await screen.findByRole('region', { name: 'Generale' })
    await sezione('Strumenti').findByRole('alert')

    await utente.click(rigaStrumento('SPAD'))
    const spad = aperta(rigaStrumento('SPAD'))
    expect(spad.queryByRole('button', { name: 'Elimina strumento' })).not.toBeInTheDocument()
    expect(spad.getByRole('button', { name: 'Archivia strumento' })).toBeEnabled()
  })

  it('prima di eliminare uno strumento si ricontrollano i dati dei suoi valori: se ne hanno, non si elimina', async () => {
    const { utente } = apri()
    await pronta()

    await utente.click(rigaStrumento('SPAD'))
    await utente.click(aperta(rigaStrumento('SPAD')).getByRole('button', { name: 'Elimina strumento' }))
    // Nel frattempo il valore SPAD ha ricevuto una misura.
    vi.mocked(parametriConDati).mockResolvedValue(new Set([par('SPAD').id]))
    await utente.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Elimina' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/«SPAD».*valori con dati.*Archivialo/)))
    expect(eliminaStrumento).not.toHaveBeenCalled()
    expect(eliminaOArchiviaParametro).not.toHaveBeenCalled()
    expect(aperta(rigaStrumento('SPAD')).getByRole('button', { name: 'Archivia strumento' })).toBeEnabled()
  })

  it('la conferma di "Archivia strumento" avverte delle modifiche non salvate', async () => {
    const { utente } = apri()
    await pronta()

    await utente.click(rigaStrumento('Metro'))
    const metro = aperta(rigaStrumento('Metro'))
    await utente.click(metro.getByRole('button', { name: 'Archivia strumento' }))
    let dialogo = await screen.findByRole('dialog', { name: 'Archiviare lo strumento «Metro»?' })
    expect(within(dialogo).queryByText(/modifiche non salvate/)).not.toBeInTheDocument()
    await utente.click(within(dialogo).getByRole('button', { name: 'Annulla' }))

    await utente.type(metro.getByLabelText('Nome dello strumento'), ' lungo')
    await utente.click(metro.getByRole('button', { name: 'Archivia strumento' }))
    dialogo = await screen.findByRole('dialog', { name: 'Archiviare lo strumento «Metro lungo»?' })
    expect(within(dialogo).getByText(/Le modifiche non salvate di questo strumento andranno perse\./)).toBeInTheDocument()
  })
})

describe('Impostazioni: valori senza strumento', () => {
  it('un valore che non sta in nessuno strumento (di prima della v3) si vede e si può archiviare, mai eliminare', async () => {
    const note = par('Note').id
    const fenologica = config.strumenti.find(s => s.tipo === 'fenologico')!
    fenologica.parametri = fenologica.parametri.filter(pp => pp.parametro_id !== note)
    vi.mocked(parametriConDati).mockImplementation(async () => new Set([note]))
    const { utente } = apri()
    await pronta()

    const senza = within(sezione('Strumenti').getByRole('list', { name: 'Valori senza strumento' }))
    expect(senza.getByText('Note')).toBeInTheDocument()
    expect(senza.getByText(/ha dati/)).toBeInTheDocument()
    expect(senza.queryByRole('button', { name: /^Elimina/ })).not.toBeInTheDocument()
    await utente.click(senza.getByRole('button', { name: 'Archivia il valore «Note»' }))

    await waitFor(() => expect(archiviaParametro).toHaveBeenCalledWith('E', note))
    expect(eliminaOArchiviaParametro).not.toHaveBeenCalled()
    await waitFor(() => expect(sezione('Strumenti').queryByRole('list', { name: 'Valori senza strumento' })).not.toBeInTheDocument())
    expect(sezione('Strumenti').getByRole('button', { name: 'Valori archiviati (1)' })).toBeInTheDocument()
  })

  it('senza valori fuori dagli strumenti l\'elenco non c\'è', async () => {
    apri()
    await pronta()
    expect(sezione('Strumenti').queryByRole('list', { name: 'Valori senza strumento' })).not.toBeInTheDocument()
  })
})

describe('Impostazioni: sotto-campi delle liste (tabella fenologica)', () => {
  it('a un valore lista con dati non si toglie un sotto-campo', async () => {
    vi.mocked(parametriConDati).mockImplementation(async () => new Set([par('Palchi').id]))
    const { utente } = apri()
    await pronta()

    await utente.click(rigaValore(tabella(), 'Palchi'))
    const voce = aperta(rigaValore(tabella(), 'Palchi'))
    await utente.click(voce.getByRole('button', { name: 'Togli il sotto-campo 1' }))
    expect(voce.getByText(/Un sotto-campo con dati non si può togliere/)).toBeInTheDocument()
    expect(tabella().getByRole('button', { name: 'Salva' })).toBeDisabled()
  })

  it('finché non si sa se un valore lista ha dati, i sotto-campi non si tolgono', async () => {
    vi.mocked(parametriConDati).mockReturnValue(new Promise(() => undefined))
    const { utente } = apri()
    await screen.findByRole('region', { name: 'Generale' })

    await utente.click(rigaValore(tabella(), 'Palchi'))
    const voce = aperta(rigaValore(tabella(), 'Palchi'))
    await utente.click(voce.getByRole('button', { name: 'Togli il sotto-campo 1' }))
    expect(voce.getByText(/Un sotto-campo con dati non si può togliere/)).toBeInTheDocument()
    expect(tabella().getByRole('button', { name: 'Salva' })).toBeDisabled()
  })

  it('anche con dati in errore i sotto-campi non si tolgono', async () => {
    vi.mocked(parametriConDati).mockRejectedValue(new TypeError('Failed to fetch'))
    const { utente } = apri()
    await screen.findByRole('region', { name: 'Generale' })
    await tabella().findByRole('alert')

    await utente.click(rigaValore(tabella(), 'Palchi'))
    const voce = aperta(rigaValore(tabella(), 'Palchi'))
    await utente.click(voce.getByRole('button', { name: '+ Sotto-campo' }))
    await utente.type(voce.getByLabelText('Nome del sotto-campo 2'), 'N gemme')
    await utente.click(voce.getByRole('button', { name: 'Togli il sotto-campo 1' }))
    expect(voce.getByText(/Un sotto-campo con dati non si può togliere/)).toBeInTheDocument()
    expect(tabella().getByRole('button', { name: 'Salva' })).toBeDisabled()
  })

  it('togliendo un sotto-campo si ricontrolla sul server se nel frattempo sono arrivati dati', async () => {
    const { utente } = apri()
    await pronta()

    await utente.click(rigaValore(tabella(), 'Palchi'))
    const voce = aperta(rigaValore(tabella(), 'Palchi'))
    // Un secondo sotto-campo, così la lista resta valida dopo aver tolto il primo.
    await utente.click(voce.getByRole('button', { name: '+ Sotto-campo' }))
    await utente.type(voce.getByLabelText('Nome del sotto-campo 2'), 'N gemme')
    await utente.click(voce.getByRole('button', { name: 'Togli il sotto-campo 1' }))
    vi.mocked(parametriConDati).mockResolvedValue(new Set([par('Palchi').id]))
    await utente.click(tabella().getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'Il parametro «Palchi» ha già dei dati: i suoi sotto-campi non si possono togliere.'))
    expect(salvaParametro).not.toHaveBeenCalled()
    expect(salvaStrumento).not.toHaveBeenCalled()
  })
})

describe('Impostazioni: strumenti', () => {
  it('"Elimina strumento" elimina anche i suoi valori senza dati, dopo una conferma che lo dice', async () => {
    const spad = strum('SPAD').id
    const { utente } = apri()
    await pronta()

    await utente.click(rigaStrumento('SPAD'))
    await utente.click(aperta(rigaStrumento('SPAD')).getByRole('button', { name: 'Elimina strumento' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminare lo strumento «SPAD»?' })
    expect(within(dialogo).getByText(/Si eliminano anche i suoi valori \(SPAD\)/)).toBeInTheDocument()
    expect(eliminaStrumento).not.toHaveBeenCalled()
    await utente.click(within(dialogo).getByRole('button', { name: 'Elimina' }))

    await waitFor(() => expect(eliminaStrumento).toHaveBeenCalledWith('E', spad))
    await waitFor(() => expect(eliminaOArchiviaParametro).toHaveBeenCalledWith('E', expect.objectContaining({ nome: 'SPAD' })))
    // Prima lo strumento (se ha misure il database rifiuta), poi i suoi valori.
    expect(vi.mocked(eliminaStrumento).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(eliminaOArchiviaParametro).mock.invocationCallOrder[0])
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Strumento eliminato.'))
    await waitFor(() => expect(sezione('Strumenti').queryByRole('button', { name: /^💚 SPAD/ })).not.toBeInTheDocument())
  })

  it('"Elimina strumento" con misure arrivate nel frattempo spiega e rimanda ad "Archivia"', async () => {
    vi.mocked(eliminaStrumento).mockRejectedValue({ code: '23503', message: 'violates foreign key constraint' })
    const { utente } = apri()
    await pronta()

    await utente.click(rigaStrumento('SPAD'))
    await utente.click(aperta(rigaStrumento('SPAD')).getByRole('button', { name: 'Elimina strumento' }))
    await utente.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Elimina' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/«SPAD» ha già delle misure.*archivi/i)))
    expect(eliminaOArchiviaParametro).not.toHaveBeenCalled()
    expect(rigaStrumento('SPAD')).toBeInTheDocument()
    expect(aperta(rigaStrumento('SPAD')).getByRole('button', { name: 'Archivia strumento' })).toBeEnabled()
  })

  it('"Elimina strumento" non c\'è finché non si sa quali strumenti hanno misure, né se la lettura fallisce', async () => {
    let rispondi!: (s: Set<string>) => void
    vi.mocked(strumentiConDati).mockReturnValue(new Promise(r => { rispondi = r }))
    const { utente } = apri()
    await screen.findByRole('region', { name: 'Generale' })

    await utente.click(rigaStrumento('SPAD'))
    const spad = aperta(rigaStrumento('SPAD'))
    expect(spad.queryByRole('button', { name: 'Elimina strumento' })).not.toBeInTheDocument()
    expect(spad.getByRole('button', { name: 'Archivia strumento' })).toBeEnabled()

    await act(async () => { rispondi(new Set()) })
    expect(await spad.findByRole('button', { name: 'Elimina strumento' })).toBeEnabled()
  })

  it('con la lettura delle misure in errore non c\'è "Elimina" e c\'è "Riprova"', async () => {
    vi.mocked(strumentiConDati).mockRejectedValue(new TypeError('Failed to fetch'))
    const { utente } = apri()
    await screen.findByRole('region', { name: 'Generale' })
    await sezione('Strumenti').findByRole('alert')

    await utente.click(rigaStrumento('SPAD'))
    expect(aperta(rigaStrumento('SPAD')).queryByRole('button', { name: 'Elimina strumento' })).not.toBeInTheDocument()
    expect(sezione('Strumenti').getByRole('button', { name: 'Riprova' })).toBeInTheDocument()
  })

  it('un archiviato si ripristina con "Ripristina"', async () => {
    strum('Metro').archiviato = true
    const prima = structuredClone(strum('Metro'))
    const { utente } = apri()
    await pronta()

    const strumenti = sezione('Strumenti')
    expect(strumenti.queryByRole('button', { name: /^📏 Metro/ })).not.toBeInTheDocument()
    await utente.click(strumenti.getByRole('button', { name: 'Strumenti archiviati (1)' }))
    await utente.click(within(strumenti.getByText('📏 Metro', { selector: 'span' }).closest('li') as HTMLElement).getByRole('button', { name: 'Ripristina' }))

    await waitFor(() => expect(salvaStrumento).toHaveBeenCalledWith('E', { ...prima, archiviato: false }))
    expect(await strumenti.findByRole('button', { name: /^📏 Metro/ })).toBeInTheDocument()
  })

  it('uno strumento si modifica e si salva', async () => {
    const prima = structuredClone(strum('SPAD'))
    const { utente } = apri()
    await pronta()

    await utente.click(rigaStrumento('SPAD'))
    const voce = aperta(rigaStrumento('SPAD'))
    expect(voce.getByRole('button', { name: 'Salva' })).toBeDisabled()
    await utente.type(voce.getByLabelText('Nome dello strumento'), ' fogliare')
    await utente.click(voce.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(salvaStrumento).toHaveBeenCalledWith('E', { ...prima, nome: 'SPAD fogliare' }))
    // Nessun valore è cambiato: nessun valore si riscrive.
    expect(salvaParametro).not.toHaveBeenCalled()
  })

  it('il nome di uno strumento non può essere uguale a quello di un altro', async () => {
    const { utente } = apri()
    await pronta()

    await utente.click(rigaStrumento('Metro'))
    const voce = aperta(rigaStrumento('Metro'))
    await utente.clear(voce.getByLabelText('Nome dello strumento'))
    await utente.type(voce.getByLabelText('Nome dello strumento'), ' spad ')
    expect(voce.getByText('C\'è già uno strumento che si chiama "SPAD".')).toBeInTheDocument()
    expect(voce.getByRole('button', { name: 'Salva' })).toBeDisabled()
  })

  it('"Gestisci il catalogo" porta al catalogo', async () => {
    apri()
    await pronta()
    expect(sezione('Strumenti').getByRole('link', { name: 'Gestisci il catalogo' })).toHaveAttribute('href', '/catalogo')
  })

  it('dal catalogo si possono aggiungere solo le voci che l\'esperimento non ha già, anche se archiviate', async () => {
    strum('Metro').archiviato = true
    const { utente } = apri()
    await pronta()

    await utente.click(sezione('Strumenti').getByRole('button', { name: '+ Aggiungi dal catalogo' }))
    expect(await screen.findByRole('button', { name: 'Aggiungi «Ciras»' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '«Termometro» è già nell\'esperimento' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '«Metro» è già nell\'esperimento' })).toBeDisabled()
  })

  it('un errore nel salvare dal catalogo lascia lo strumento in elenco, non salvato, e il nuovo "Salva" riprova', async () => {
    vi.mocked(salvaStrumento).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { utente } = apri()
    await pronta()

    await utente.click(sezione('Strumenti').getByRole('button', { name: '+ Aggiungi dal catalogo' }))
    await utente.click(await screen.findByRole('button', { name: 'Aggiungi «Calibro»' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Il server non risponde')))
    const riga = await screen.findByRole('button', { name: /^📐 Calibro/ })
    expect(riga).toHaveTextContent('Non salvato')

    await utente.click(aperta(riga).getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(toastSalvato).toHaveBeenCalledWith('Strumento «Calibro» salvato.'))
    expect(vi.mocked(salvaStrumento).mock.calls[1][1]).toEqual(vi.mocked(salvaStrumento).mock.calls[0][1])
    await waitFor(() => expect(sezione('Strumenti').getAllByRole('button', { name: /^📐 Calibro/ })).toHaveLength(1))
    expect(sezione('Strumenti').getByRole('button', { name: /^📐 Calibro/ })).not.toHaveTextContent('Non salvato')
  })

  it('uno strumento arrivato in configurazione nonostante un errore non compare due volte', async () => {
    vi.mocked(salvaStrumento).mockImplementationOnce(async (_e, p) => {
      config.strumenti = [...config.strumenti, p]
      throw new TypeError('Failed to fetch')
    })
    const { utente } = apri()
    await pronta()

    await utente.click(sezione('Strumenti').getByRole('button', { name: '+ Aggiungi dal catalogo' }))
    await utente.click(await screen.findByRole('button', { name: 'Aggiungi «Calibro»' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    await waitFor(() => expect(caricaConfig).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(sezione('Strumenti').getAllByRole('button', { name: /^📐 Calibro/ })).toHaveLength(1))
    expect(sezione('Strumenti').getByRole('button', { name: /^📐 Calibro/ })).not.toHaveTextContent('Non salvato')
  })

  it('"Scarta" uno strumento non salvato toglie anche i valori già scritti nel database dal tentativo andato male', async () => {
    vi.mocked(salvaStrumento).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { utente } = apri()
    await pronta()

    await utente.click(sezione('Strumenti').getByRole('button', { name: '+ Aggiungi dal catalogo' }))
    await utente.click(await screen.findByRole('button', { name: 'Aggiungi «Calibro»' }))
    const riga = await screen.findByRole('button', { name: /^📐 Calibro/ })
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    await waitFor(() => expect(caricaConfig).toHaveBeenCalledTimes(2))
    await utente.click(aperta(riga).getByRole('button', { name: 'Scarta' }))

    await waitFor(() => expect(eliminaOArchiviaParametro).toHaveBeenCalledWith('E', expect.objectContaining({ nome: 'Diametro' })))
    expect(sezione('Strumenti').queryByRole('button', { name: /^📐 Calibro/ })).not.toBeInTheDocument()
  })
})

describe('Impostazioni: nuovo strumento', () => {
  /** Apre "+ Nuovo strumento" e compila «Penetrometro» con un valore. */
  async function compilaPenetrometro(utente: ReturnType<typeof userEvent.setup>) {
    await utente.click(sezione('Strumenti').getByRole('button', { name: '+ Aggiungi dal catalogo' }))
    await utente.click(await screen.findByRole('button', { name: '+ Nuovo strumento' }))
    const modulo = within(screen.getByRole('region', { name: 'Nuovo strumento' }))
    await utente.type(modulo.getByLabelText('Nome dello strumento'), 'Penetrometro')
    await utente.click(modulo.getByRole('button', { name: 'Aggiungi valore' }))
    await utente.type(modulo.getByLabelText('Nome'), 'Resistenza')
    return modulo
  }

  it('entra nel catalogo, poi la copia si aggiunge all\'esperimento collegata alla voce', async () => {
    const { utente } = apri()
    await pronta()
    const modulo = await compilaPenetrometro(utente)
    await utente.click(modulo.getByRole('button', { name: 'Salva nel catalogo e aggiungi' }))

    await waitFor(() => expect(salvaStrumento).toHaveBeenCalledTimes(1))
    expect(salvaVoceCatalogo).toHaveBeenCalledTimes(1)
    const voce = vi.mocked(salvaVoceCatalogo).mock.calls[0][0]
    expect(voce).toMatchObject({ nome: 'Penetrometro', parametri: [{ chiave: 'resistenza', nome: 'Resistenza' }] })
    const [, strumento] = vi.mocked(salvaStrumento).mock.calls[0]
    expect(strumento).toMatchObject({ nome: 'Penetrometro', catalogo_id: voce.id })
    expect(vi.mocked(salvaParametro).mock.calls[0][1]).toMatchObject({ nome: 'Resistenza', catalogo_chiave: 'resistenza', ordine: 11 })
    expect(vi.mocked(salvaVoceCatalogo).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(salvaStrumento).mock.invocationCallOrder[0])
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Nuovo strumento' })).not.toBeInTheDocument())
    expect(await sezione('Strumenti').findByRole('button', { name: /^Penetrometro/ })).toBeInTheDocument()
  })

  it('con il catalogo irraggiungibile la copia entra nell\'esperimento, non collegata, e lo dice', async () => {
    vi.mocked(salvaVoceCatalogo).mockRejectedValue(new TypeError('Failed to fetch'))
    const { utente } = apri()
    await pronta()
    const modulo = await compilaPenetrometro(utente)
    await utente.click(modulo.getByRole('button', { name: 'Salva nel catalogo e aggiungi' }))

    await waitFor(() => expect(salvaStrumento).toHaveBeenCalledTimes(1))
    expect(vi.mocked(salvaStrumento).mock.calls[0][1]).toMatchObject({ nome: 'Penetrometro', catalogo_id: null })
    expect(vi.mocked(salvaParametro).mock.calls[0][1].catalogo_chiave).toBeNull()
    expect(await sezione('Strumenti').findByText(/non è collegato al catalogo/)).toBeInTheDocument()
  })

  it('con un nome già nel catalogo il modulo resta aperto e nulla entra nell\'esperimento', async () => {
    vi.mocked(salvaVoceCatalogo).mockRejectedValue({ code: '23505', message: 'catalogo_strumenti_nome_unico' })
    const { utente } = apri()
    await pronta()
    const modulo = await compilaPenetrometro(utente)
    await utente.click(modulo.getByRole('button', { name: 'Salva nel catalogo e aggiungi' }))

    expect(await modulo.findByText('Nel catalogo c\'è già uno strumento con questo nome.')).toBeInTheDocument()
    expect(modulo.getByLabelText('Nome dello strumento')).toHaveValue('Penetrometro')
    expect(salvaStrumento).not.toHaveBeenCalled()
    expect(salvaParametro).not.toHaveBeenCalled()
  })

  it('senza nome o con un valore senza nome non si salva', async () => {
    const { utente } = apri()
    await pronta()
    await utente.click(sezione('Strumenti').getByRole('button', { name: '+ Aggiungi dal catalogo' }))
    await utente.click(await screen.findByRole('button', { name: '+ Nuovo strumento' }))
    const modulo = within(screen.getByRole('region', { name: 'Nuovo strumento' }))
    expect(modulo.getByText('Uno strumento non ha nome.')).toBeInTheDocument()
    expect(modulo.getByRole('button', { name: 'Salva nel catalogo e aggiungi' })).toBeDisabled()
  })
})

describe('Impostazioni: tabella fenologica', () => {
  it('"Elimina la tabella fenologica" c\'è solo senza misure e toglie anche le sue voci', async () => {
    const id = strum('Tabella fenologica').id
    const { utente } = apri()
    await pronta()

    await utente.click(tabella().getByRole('button', { name: 'Elimina la tabella fenologica' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminare la tabella fenologica?' })
    await utente.click(within(dialogo).getByRole('button', { name: 'Elimina' }))

    await waitFor(() => expect(eliminaStrumento).toHaveBeenCalledWith('E', id))
    await waitFor(() => expect(eliminaOArchiviaParametro).toHaveBeenCalledTimes(7))
    expect(await tabella().findByRole('button', { name: 'Crea la tabella fenologica' })).toBeInTheDocument()
  })

  it('se la tabella ha misure arrivate nel frattempo, l\'eliminazione spiega che si archiviano i valori', async () => {
    vi.mocked(eliminaStrumento).mockRejectedValue({ code: '23503', message: 'violates foreign key constraint' })
    const { utente } = apri()
    await pronta()

    await utente.click(tabella().getByRole('button', { name: 'Elimina la tabella fenologica' }))
    await utente.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Elimina' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/La tabella fenologica ha già delle misure.*archivia/)))
    expect(eliminaOArchiviaParametro).not.toHaveBeenCalled()
  })

  it('con misure la tabella non si elimina: i suoi valori con dati si archiviano', async () => {
    vi.mocked(strumentiConDati).mockResolvedValue(new Set([strum('Tabella fenologica').id]))
    apri()
    await pronta()
    expect(tabella().queryByRole('button', { name: 'Elimina la tabella fenologica' })).not.toBeInTheDocument()
    expect(tabella().queryByRole('button', { name: /^Archivia/ })).not.toBeInTheDocument()
  })

  it('se manca, "Crea la tabella fenologica" ne prepara una vuota che si salva con le sue voci', async () => {
    config.strumenti = config.strumenti.filter(s => s.tipo !== 'fenologico')
    config.parametri = config.parametri.filter(p => ['Temp aria', 'Temp pianta', 'SPAD', 'Altezza'].includes(p.nome))
    const { utente } = apri()
    await pronta()

    expect(tabella().queryByLabelText('Nome dello strumento')).not.toBeInTheDocument()
    await utente.click(tabella().getByRole('button', { name: 'Crea la tabella fenologica' }))
    expect(tabella().getByLabelText('Nome dello strumento')).toHaveValue('Tabella fenologica')
    expect(tabella().getByText('Lo strumento "Tabella fenologica" non ha valori.')).toBeInTheDocument()
    expect(tabella().getByRole('button', { name: 'Salva' })).toBeDisabled()

    await utente.click(tabella().getByRole('button', { name: 'Aggiungi valore' }))
    await utente.type(tabella().getByLabelText('Nome'), 'Note')
    await utente.selectOptions(tabella().getByLabelText('Tipo'), 'testo')
    await utente.click(tabella().getByRole('switch', { name: /Obbligatorio/ }))
    await utente.click(tabella().getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(salvaStrumento).toHaveBeenCalledTimes(1))
    const [, tabellaSalvata] = vi.mocked(salvaStrumento).mock.calls[0]
    expect(tabellaSalvata).toMatchObject({ nome: 'Tabella fenologica', tipo: 'fenologico', ordine: 3 })
    expect(tabellaSalvata.parametri).toEqual([expect.objectContaining({ obbligatorio: true, ordine: 0 })])
    expect(vi.mocked(salvaParametro).mock.calls[0][1]).toMatchObject({ nome: 'Note', tipo: 'testo' })
    await waitFor(() => expect(toastSalvato).toHaveBeenCalledWith('Strumento «Tabella fenologica» salvato.'))
  })

  it('le voci della tabella hanno "Obbligatorio" e "Progressivo"; quelle di uno strumento semplice no', async () => {
    const { utente } = apri()
    await pronta()

    await utente.click(rigaValore(tabella(), 'Palchi'))
    const palchi = aperta(rigaValore(tabella(), 'Palchi'))
    expect(palchi.getByRole('switch', { name: /Obbligatorio/ })).toBeInTheDocument()
    expect(palchi.getByRole('switch', { name: /Progressivo/ })).toBeInTheDocument()

    await utente.click(rigaStrumento('Metro'))
    const metro = aperta(rigaStrumento('Metro'))
    await utente.click(rigaValore(metro, 'Altezza'))
    expect(metro.queryByRole('switch', { name: /Obbligatorio/ })).not.toBeInTheDocument()
    expect(metro.queryByRole('switch', { name: /Progressivo/ })).not.toBeInTheDocument()
  })
})

describe('Impostazioni: uscita', () => {
  it('senza modifiche la freccia torna subito alla home dell\'esperimento', async () => {
    const { utente } = apri()
    await pronta()

    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    expect(screen.getByTestId('posizione')).toHaveTextContent(/^\/esperimenti\/E$/)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('chiede conferma prima di uscire con uno strumento modificato e non salvato', async () => {
    const { utente } = apri()
    await pronta()

    await utente.click(rigaStrumento('Metro'))
    await utente.type(aperta(rigaStrumento('Metro')).getByLabelText('Nome dello strumento'), ' lungo')
    // Chiuso l'editor, la modifica resta (e lo si vede).
    await utente.click(rigaStrumento('Metro lungo'))
    expect(rigaStrumento('Metro lungo')).toHaveTextContent('Modifiche non salvate')

    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Scartare le modifiche non salvate?' })
    await utente.click(within(dialogo).getByRole('button', { name: 'Continua a modificare' }))
    expect(screen.getByTestId('posizione')).toHaveTextContent('/esperimenti/E/impostazioni')

    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    await utente.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Scarta' }))
    await waitFor(() => expect(screen.getByTestId('posizione')).toHaveTextContent(/^\/esperimenti\/E$/))
  })

  it('senza modifiche "Gestisci il catalogo" porta subito al catalogo', async () => {
    const { utente } = apri()
    await pronta()

    await utente.click(sezione('Strumenti').getByRole('link', { name: 'Gestisci il catalogo' }))
    expect(screen.getByTestId('posizione')).toHaveTextContent(/^\/catalogo$/)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('con una modifica non salvata "Gestisci il catalogo" chiede conferma: si resta con la modifica, o si scarta e si va', async () => {
    const { utente } = apri()
    await pronta()

    await utente.click(rigaStrumento('Metro'))
    await utente.type(aperta(rigaStrumento('Metro')).getByLabelText('Nome dello strumento'), ' lungo')

    await utente.click(sezione('Strumenti').getByRole('link', { name: 'Gestisci il catalogo' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Scartare le modifiche non salvate?' })
    await utente.click(within(dialogo).getByRole('button', { name: 'Continua a modificare' }))
    expect(screen.getByTestId('posizione')).toHaveTextContent('/esperimenti/E/impostazioni')
    expect(aperta(rigaStrumento('Metro lungo')).getByLabelText('Nome dello strumento')).toHaveValue('Metro lungo')

    await utente.click(sezione('Strumenti').getByRole('link', { name: 'Gestisci il catalogo' }))
    await utente.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Scarta' }))
    await waitFor(() => expect(screen.getByTestId('posizione')).toHaveTextContent(/^\/catalogo$/))
  })
})

describe('Impostazioni: uscita, tabella fenologica', () => {
  it('chiede conferma anche con una voce della tabella modificata e non salvata', async () => {
    const { utente } = apri()
    await pronta()

    await utente.click(rigaValore(tabella(), 'Note'))
    await utente.type(aperta(rigaValore(tabella(), 'Note')).getByLabelText('Nome'), ' libere')
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    expect(await screen.findByRole('dialog', { name: 'Scartare le modifiche non salvate?' })).toBeInTheDocument()
    expect(screen.getByTestId('posizione')).toHaveTextContent('/esperimenti/E/impostazioni')
  })
})
