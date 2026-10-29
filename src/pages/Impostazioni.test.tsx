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
  salvaParametro: vi.fn(), parametriConDati: vi.fn(), pianteConDati: vi.fn(), eliminaOArchiviaParametro: vi.fn(),
  salvaPassata: vi.fn(), eliminaPassata: vi.fn(), aggiungiPiante: vi.fn(), aggiornaPianta: vi.fn(), eliminaPianta: vi.fn(),
  aggiornaTrattamento: vi.fn(),
}))
vi.mock('@/lib/toastSalvato', () => ({ toastSalvato: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(() => 'id-toast'), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }) }))

import { toast } from 'sonner'
import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { aggiornaEsperimento, caricaConfig } from '@/api/esperimenti'
import {
  aggiornaPianta, aggiornaTrattamento, aggiungiPiante, eliminaOArchiviaParametro, eliminaPassata, eliminaPianta,
  parametriConDati, pianteConDati, salvaParametro, salvaPassata,
} from '@/api/configurazione'
import { chiavi } from '@/api/query'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import type { ConfigEsperimento, Parametro } from '@/domain/tipi'
import { toastSalvato } from '@/lib/toastSalvato'
import { Impostazioni } from './Impostazioni'

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session

/** La configurazione "nel database": le funzioni dell'API finta la leggono e la cambiano. */
let config: ConfigEsperimento

const par = (nome: string): Parametro => config.parametri.find(p => p.nome === nome)!
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
const rigaParametro = (nome: string) => sezione('Parametri').getByRole('button', { name: new RegExp(`^${nome}`) })
// Aperta, una passata mostra anche i pulsanti "Sposta «…» su/giù" dei suoi parametri.
const rigaPassata = (nome: string) => sezione('Passate').getByRole('button', { name: new RegExp(`^(?!Sposta).*${nome}`) })
/** Il contenuto aperto di una voce espandibile. */
const aperta = (riga: HTMLElement) => within(riga.closest('li') as HTMLElement)

beforeEach(() => {
  vi.clearAllMocks()
  config = bozzaHydrochar()
  config.esperimento.id = 'E'
  config.esperimento.note = 'serra 2'
  vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(caricaConfig).mockImplementation(async () => structuredClone(config))
  // Temp aria ha dati; la pianta 1 ha misure.
  vi.mocked(parametriConDati).mockImplementation(async () => new Set([par('Temp aria').id]))
  vi.mocked(pianteConDati).mockImplementation(async () => new Set([idPianta('1')]))

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
    return 'eliminato'
  })
  vi.mocked(salvaPassata).mockImplementation(async (_e, p) => {
    config.passate = config.passate.some(x => x.id === p.id)
      ? config.passate.map(x => (x.id === p.id ? p : x))
      : [...config.passate, p]
  })
  vi.mocked(eliminaPassata).mockImplementation(async (_e, id) => { config.passate = config.passate.filter(p => p.id !== id) })
})

describe('Impostazioni: dal piano', () => {
  it('il parametro con dati ha il tipo bloccato e "Archivia"; quello senza dati ha "Elimina"', async () => {
    const { utente } = apri()
    await pronta()

    await utente.click(rigaParametro('Temp aria'))
    const tempAria = aperta(rigaParametro('Temp aria'))
    expect(tempAria.getByLabelText('Tipo')).toBeDisabled()
    expect(tempAria.getByText('Il tipo non si può cambiare: ci sono già dati.')).toBeInTheDocument()
    expect(tempAria.getByRole('button', { name: 'Archivia' })).toBeEnabled()
    expect(tempAria.queryByRole('button', { name: 'Elimina' })).not.toBeInTheDocument()

    await utente.click(rigaParametro('SPAD'))
    const spad = aperta(rigaParametro('SPAD'))
    expect(spad.getByLabelText('Tipo')).toBeEnabled()
    expect(spad.getByRole('button', { name: 'Elimina' })).toBeEnabled()
    expect(spad.queryByRole('button', { name: 'Archivia' })).not.toBeInTheDocument()
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

describe('Impostazioni: parametri', () => {
  it('"Elimina" su un parametro senza dati chiede conferma e lo elimina', async () => {
    const { utente } = apri()
    await pronta()

    await utente.click(rigaParametro('SPAD'))
    await utente.click(aperta(rigaParametro('SPAD')).getByRole('button', { name: 'Elimina' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminare il parametro «SPAD»?' })
    await utente.click(within(dialogo).getByRole('button', { name: 'Elimina' }))

    await waitFor(() => expect(eliminaOArchiviaParametro).toHaveBeenCalledWith('E', expect.objectContaining({ nome: 'SPAD' })))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Parametro eliminato.'))
  })

  it('"Archivia" su un parametro con dati lo archivia e lo dice', async () => {
    vi.mocked(eliminaOArchiviaParametro).mockImplementation(async (_e, p) => {
      config.parametri = config.parametri.map(x => (x.id === p.id ? { ...x, archiviato: true } : x))
      return 'archiviato'
    })
    const { utente } = apri()
    await pronta()

    await utente.click(rigaParametro('Temp aria'))
    await utente.click(aperta(rigaParametro('Temp aria')).getByRole('button', { name: 'Archivia' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Parametro archiviato.'))
    await waitFor(() => expect(sezione('Parametri').queryByRole('button', { name: /^Temp aria/ })).not.toBeInTheDocument())
    expect(sezione('Parametri').getByRole('button', { name: 'Parametri archiviati (1)' })).toBeInTheDocument()
  })

  it('un archiviato si ripristina con "Ripristina"', async () => {
    par('Note').archiviato = true
    const prima = { ...par('Note') }
    const { utente } = apri()
    await pronta()

    const parametri = sezione('Parametri')
    expect(parametri.queryByRole('button', { name: /^Note/ })).not.toBeInTheDocument()
    await utente.click(parametri.getByRole('button', { name: 'Parametri archiviati (1)' }))
    const riga = within(parametri.getByText('Note').closest('li') as HTMLElement)
    await utente.click(riga.getByRole('button', { name: 'Ripristina' }))

    await waitFor(() => expect(salvaParametro).toHaveBeenCalledWith('E', { ...prima, archiviato: false }))
    expect(await parametri.findByRole('button', { name: /^Note/ })).toBeInTheDocument()
  })

  it('"+ Parametro" ne crea uno non salvato in fondo all\'ordine; si salva con il suo "Salva"', async () => {
    const { utente } = apri()
    await pronta()

    await utente.click(sezione('Parametri').getByRole('button', { name: '+ Parametro' }))
    const nuovo = rigaParametro('Senza nome')
    expect(nuovo).toHaveTextContent('Non salvato')
    const voce = aperta(nuovo)
    await utente.type(voce.getByLabelText('Nome'), 'altezza')
    expect(voce.getByText('C\'è già un parametro che si chiama "Altezza".')).toBeInTheDocument()
    expect(voce.getByRole('button', { name: 'Salva' })).toBeDisabled()

    await utente.clear(voce.getByLabelText('Nome'))
    await utente.type(voce.getByLabelText('Nome'), ' Diametro ')
    await utente.click(voce.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(salvaParametro).toHaveBeenCalledWith('E', expect.objectContaining({
      nome: 'Diametro', ordine: 11, archiviato: false,
    })))
    await waitFor(() => expect(rigaParametro('Diametro')).not.toHaveTextContent('Non salvato'))
  })

  it('a un parametro lista con dati non si toglie un sotto-campo', async () => {
    vi.mocked(parametriConDati).mockImplementation(async () => new Set([par('Palchi').id]))
    const { utente } = apri()
    await pronta()

    await utente.click(rigaParametro('Palchi'))
    const voce = aperta(rigaParametro('Palchi'))
    await utente.click(voce.getByRole('button', { name: 'Togli il sotto-campo 1' }))
    expect(voce.getByText(/Un sotto-campo con dati non si può togliere/)).toBeInTheDocument()
    expect(voce.getByRole('button', { name: 'Salva' })).toBeDisabled()
  })

  it('un errore di rete lascia i valori scritti e lo dice', async () => {
    vi.mocked(salvaParametro).mockRejectedValue(new TypeError('Failed to fetch'))
    const { utente } = apri()
    await pronta()

    await utente.click(rigaParametro('Altezza'))
    const voce = aperta(rigaParametro('Altezza'))
    await utente.type(voce.getByLabelText('Nome'), ' pianta')
    await utente.click(voce.getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Il server non risponde')))
    expect(voce.getByLabelText('Nome')).toHaveValue('Altezza pianta')
    expect(voce.getByRole('button', { name: 'Salva' })).toBeEnabled()
    expect(toastSalvato).not.toHaveBeenCalled()
  })

  it('un ricaricamento in background non cancella quel che si sta scrivendo', async () => {
    const { client, utente } = apri()
    await pronta()

    await utente.click(rigaParametro('Altezza'))
    await utente.type(aperta(rigaParametro('Altezza')).getByLabelText('Nome'), ' pianta')
    await act(() => client.invalidateQueries({ queryKey: chiavi.config('E') }))
    await waitFor(() => expect(caricaConfig).toHaveBeenCalledTimes(2))
    expect(aperta(rigaParametro('Altezza')).getByLabelText('Nome')).toHaveValue('Altezza pianta')
  })

  it('le azioni distruttive aspettano di sapere quali parametri e piante hanno dati', async () => {
    let rispondiParametri!: (s: Set<string>) => void
    let rispondiPiante!: (s: Set<string>) => void
    vi.mocked(parametriConDati).mockReturnValue(new Promise(r => { rispondiParametri = r }))
    vi.mocked(pianteConDati).mockReturnValue(new Promise(r => { rispondiPiante = r }))
    const { utente } = apri()
    await screen.findByRole('region', { name: 'Generale' })

    await utente.click(rigaParametro('SPAD'))
    const spad = aperta(rigaParametro('SPAD'))
    expect(spad.getByRole('button', { name: 'Elimina' })).toBeDisabled()
    expect(spad.getByLabelText('Tipo')).toBeDisabled()
    await utente.click(rigaPianta('2'))
    const due = aperta(rigaPianta('2'))
    expect(due.getByRole('button', { name: 'Rimuovi' })).toBeDisabled()
    expect(due.getByLabelText('Trattamento')).toBeDisabled()

    await act(async () => {
      rispondiParametri(new Set())
      rispondiPiante(new Set())
    })
    await waitFor(() => expect(due.getByRole('button', { name: 'Rimuovi' })).toBeEnabled())
    expect(due.getByLabelText('Trattamento')).toBeEnabled()
    expect(spad.getByRole('button', { name: 'Elimina' })).toBeEnabled()
    expect(spad.getByLabelText('Tipo')).toBeEnabled()
  })
})

describe('Impostazioni: passate', () => {
  it('"Elimina passata" con misure fallisce con il messaggio del database', async () => {
    vi.mocked(eliminaPassata).mockRejectedValue({ code: '23503', message: 'violates foreign key constraint' })
    const { utente } = apri()
    await pronta()

    await utente.click(rigaPassata('SPAD'))
    await utente.click(aperta(rigaPassata('SPAD')).getByRole('button', { name: 'Elimina passata' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminare la passata «SPAD»?' })
    await utente.click(within(dialogo).getByRole('button', { name: 'Elimina' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Questo elemento ha dati collegati e non può essere eliminato.'))
    expect(eliminaPassata).toHaveBeenCalledWith('E', config.passate[1].id)
    expect(rigaPassata('SPAD')).toBeInTheDocument()
  })

  it('una passata si modifica e si salva; "+ Passata" non si salva senza nome e parametri', async () => {
    const prima = structuredClone(config.passate[1])
    const { utente } = apri()
    await pronta()

    await utente.click(rigaPassata('SPAD'))
    const voce = aperta(rigaPassata('SPAD'))
    await utente.type(voce.getByLabelText('Nome della passata'), ' fogliare')
    await utente.click(voce.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(salvaPassata).toHaveBeenCalledWith('E', { ...prima, nome: 'SPAD fogliare' }))

    await utente.click(sezione('Passate').getByRole('button', { name: '+ Passata' }))
    const nuova = aperta(rigaPassata('Senza nome'))
    expect(nuova.getByText('Una passata non ha nome.')).toBeInTheDocument()
    expect(nuova.getByRole('button', { name: 'Salva' })).toBeDisabled()
  })
})

describe('Impostazioni: uscita', () => {
  it('senza modifiche la freccia torna subito alla schermata in campo', async () => {
    const { utente } = apri()
    await pronta()

    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    expect(screen.getByTestId('posizione')).toHaveTextContent(/^\/esperimenti\/E$/)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('chiede conferma prima di uscire con un parametro modificato e non salvato', async () => {
    const { utente } = apri()
    await pronta()

    await utente.click(rigaParametro('Altezza'))
    await utente.type(aperta(rigaParametro('Altezza')).getByLabelText('Nome'), ' pianta')
    // Chiuso l'editor, la modifica resta (e lo si vede).
    await utente.click(rigaParametro('Altezza'))
    expect(rigaParametro('Altezza pianta')).toHaveTextContent('Modifiche non salvate')

    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Scartare le modifiche non salvate?' })
    await utente.click(within(dialogo).getByRole('button', { name: 'Continua a modificare' }))
    expect(screen.getByTestId('posizione')).toHaveTextContent('/esperimenti/E/impostazioni')

    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    await utente.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Scarta' }))
    await waitFor(() => expect(screen.getByTestId('posizione')).toHaveTextContent(/^\/esperimenti\/E$/))
  })
})
