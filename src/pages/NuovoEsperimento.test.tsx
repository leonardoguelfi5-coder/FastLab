import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

// Si finge solo il livello API (e il client Supabase, mai raggiunto); hook e cache sono quelli veri.
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
vi.mock('@/api/catalogo', () => ({
  listaCatalogo: vi.fn(), salvaVoceCatalogo: vi.fn(), archiviaVoceCatalogo: vi.fn(), copieDiProprieta: vi.fn(), applicaAggiornamento: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { toast } from 'sonner'
import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { listaCatalogo, salvaVoceCatalogo } from '@/api/catalogo'
import { caricaConfig, creaEsperimento } from '@/api/esperimenti'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import { configDiEsempio } from '@/domain/test-helpers'
import type { BozzaEsperimento } from '@/domain/tipi'
import { NuovoEsperimento } from './NuovoEsperimento'

type Utente = ReturnType<typeof userEvent.setup>

/** I flussi completi rendono decine di campi: su jsdom (e su OneDrive) richiedono più dei 15 s di default. */
const LUNGO = 60_000

function PaginaEsperimento() {
  const { espId } = useParams()
  return <p>{`Pagina dell'esperimento ${espId}`}</p>
}

/** Al posto dei pulsanti del browser: l'indirizzo attuale e "indietro"/"avanti" nella cronologia. */
function Browser() {
  const posizione = useLocation()
  const navigate = useNavigate()
  return (
    <div>
      <p data-testid="indirizzo">{posizione.pathname + posizione.search}</p>
      <button type="button" onClick={() => navigate(-1)}>Indietro del browser</button>
      <button type="button" onClick={() => navigate(1)}>Avanti del browser</button>
    </div>
  )
}

function vaiAllaPagina(indirizzo: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalida = vi.spyOn(client, 'invalidateQueries')
  const { unmount } = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[indirizzo]}>
        <Routes>
          <Route path="/esperimenti/nuovo" element={<NuovoEsperimento />} />
          <Route path="/esperimenti/:espId" element={<PaginaEsperimento />} />
          <Route path="/" element={<p>Elenco esperimenti</p>} />
        </Routes>
        <Browser />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { invalida, unmount, client }
}

const titoloPasso = () => screen.getByRole('heading', { level: 2 })
const indirizzo = () => screen.getByTestId('indirizzo').textContent
const browser = (utente: Utente, verso: 'Indietro' | 'Avanti') =>
  utente.click(screen.getByRole('button', { name: `${verso} del browser` }))

async function avanti(utente: Utente, volte = 1) {
  for (let i = 0; i < volte; i++) await utente.click(screen.getByRole('button', { name: 'Avanti' }))
}

/** Il valore mostrato nel riepilogo accanto a una voce (Trattamenti, Piante, …). */
function conteggio(voce: string) {
  return within(screen.getByText(voce, { selector: 'dt' }).parentElement as HTMLElement).getByRole('definition')
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  vi.mocked(useSessione).mockReturnValue({ sessione: { user: { email: 'a@b.it' } } as Session, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(listaCatalogo).mockResolvedValue(SEMI_CATALOGO)
  vi.mocked(salvaVoceCatalogo).mockResolvedValue(undefined)
})

describe('NuovoEsperimento: inizio', () => {
  it('senza modello chiede come iniziare; "Parti da zero" apre i dati generali vuoti', async () => {
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo')

    expect(screen.getByRole('heading', { level: 1, name: 'Nuovo esperimento' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Avanti' })).not.toBeInTheDocument()
    await utente.click(screen.getByRole('button', { name: /Parti da zero/ }))

    expect(titoloPasso()).toHaveTextContent('Generale')
    expect(screen.getByText('Passo 1 di 5')).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Passo precedente' })).not.toBeInTheDocument()
  })

  it('finché non si sa chi è l\'utente non monta la procedura (né prepara una bozza con la chiave sbagliata)', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: null, caricamento: true })
    vaiAllaPagina('/esperimenti/nuovo?modello=hydrochar')

    expect(screen.getByRole('heading', { level: 1, name: 'Nuovo esperimento' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Caricamento…')
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument()
    expect(Object.keys(sessionStorage)).toEqual([])
  })

  it('"Parti dal modello Hydrochar" compila la bozza con il modello', async () => {
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo')
    // Il modello prende gli strumenti dal catalogo: il pulsante si abilita quando il catalogo è arrivato.
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /Parti dal modello Hydrochar/ })).toBeEnabled())
    await utente.click(screen.getByRole('button', { name: /Parti dal modello Hydrochar/ }))
    expect(screen.getByLabelText('Nome')).toHaveValue('Hydrochar × Cuore di Bue')
  })

  it('Avanti e Passo precedente passano da un passo all\'altro e i dati restano', async () => {
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo')
    await utente.click(screen.getByRole('button', { name: /Parti da zero/ }))
    await utente.type(screen.getByLabelText('Nome'), 'Prova concime')

    await avanti(utente)
    expect(titoloPasso()).toHaveTextContent('Fattori e piante')
    expect(titoloPasso()).toHaveFocus()
    await avanti(utente)
    expect(titoloPasso()).toHaveTextContent('Strumenti')
    await avanti(utente)
    expect(titoloPasso()).toHaveTextContent('Tabella fenologica')
    await avanti(utente)
    expect(titoloPasso()).toHaveTextContent('Riepilogo')
    expect(screen.queryByRole('button', { name: 'Avanti' })).not.toBeInTheDocument()

    for (let i = 0; i < 4; i++) await utente.click(screen.getByRole('button', { name: 'Passo precedente' }))
    expect(titoloPasso()).toHaveTextContent('Generale')
    expect(screen.getByLabelText('Nome')).toHaveValue('Prova concime')
  })
})

describe('NuovoEsperimento: la bozza non si perde', () => {
  it('il passo è nell\'indirizzo (con "da" che resta) e "indietro" del browser torna al passo prima', async () => {
    vi.mocked(caricaConfig).mockResolvedValue(configDiEsempio())
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo?da=esp-vecchio')
    await screen.findByLabelText('Nome')

    await avanti(utente, 2)
    expect(titoloPasso()).toHaveTextContent('Strumenti')
    expect(indirizzo()).toBe('/esperimenti/nuovo?da=esp-vecchio&passo=3')

    await browser(utente, 'Indietro')
    expect(titoloPasso()).toHaveTextContent('Fattori e piante')
    expect(indirizzo()).toBe('/esperimenti/nuovo?da=esp-vecchio&passo=2')
    await browser(utente, 'Indietro')
    expect(titoloPasso()).toHaveTextContent('Generale')
    expect(screen.getByLabelText('Nome')).toHaveValue('Copia di Esempio')
  })

  it('con modifiche la freccia Indietro chiede conferma: si può continuare o uscire senza salvare', async () => {
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo')
    await utente.click(screen.getByRole('button', { name: /Parti da zero/ }))
    await utente.type(screen.getByLabelText('Nome'), 'Prova')

    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    let dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('Uscire dalla creazione?')).toBeInTheDocument()
    expect(within(dialogo).getByText('Le modifiche non salvate andranno perse.')).toBeInTheDocument()

    await utente.click(within(dialogo).getByRole('button', { name: 'Continua a modificare' }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Nome')).toHaveValue('Prova')
    expect(indirizzo()).toBe('/esperimenti/nuovo')

    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    dialogo = await screen.findByRole('dialog')
    await utente.click(within(dialogo).getByRole('button', { name: 'Esci senza salvare' }))
    expect(await screen.findByText('Elenco esperimenti')).toBeInTheDocument()
    expect(sessionStorage.length).toBe(0)
  })

  it('senza modifiche la freccia Indietro esce subito', async () => {
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo?modello=hydrochar')
    await screen.findByLabelText('Nome')
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    expect(await screen.findByText('Elenco esperimenti')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('con modifiche chiudere o ricaricare la scheda chiede conferma al browser', async () => {
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo')
    await utente.click(screen.getByRole('button', { name: /Parti da zero/ }))

    const senzaModifiche = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(senzaModifiche)
    expect(senzaModifiche.defaultPrevented).toBe(false)

    await utente.type(screen.getByLabelText('Nome'), 'Prova')
    const conModifiche = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(conModifiche)
    expect(conModifiche.defaultPrevented).toBe(true)
  })

  it('tornando sulla pagina la bozza si ripristina; "Ricomincia" (confermato) riparte da capo', async () => {
    const utente = userEvent.setup({ delay: null })
    const { unmount } = vaiAllaPagina('/esperimenti/nuovo')
    await utente.click(screen.getByRole('button', { name: /Parti da zero/ }))
    await utente.type(screen.getByLabelText('Nome'), 'Prova salvata')
    expect(screen.queryByText('Bozza ripristinata.')).not.toBeInTheDocument()
    unmount()

    vaiAllaPagina('/esperimenti/nuovo')
    expect(screen.getByRole('status')).toHaveTextContent('Bozza ripristinata.')
    expect(screen.getByLabelText('Nome')).toHaveValue('Prova salvata')

    await utente.click(screen.getByRole('button', { name: 'Ricomincia' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('Ricominciare da capo?')).toBeInTheDocument()
    await utente.click(within(dialogo).getByRole('button', { name: 'Ricomincia' }))

    expect(await screen.findByRole('button', { name: /Parti da zero/ })).toBeInTheDocument()
    expect(screen.queryByText('Bozza ripristinata.')).not.toBeInTheDocument()
    expect(sessionStorage.length).toBe(0)
  })

  it('l\'avviso di ripristino si può chiudere e la bozza resta', async () => {
    const utente = userEvent.setup({ delay: null })
    const { unmount } = vaiAllaPagina('/esperimenti/nuovo')
    await utente.click(screen.getByRole('button', { name: /Parti da zero/ }))
    await utente.type(screen.getByLabelText('Nome'), 'Prova')
    unmount()

    vaiAllaPagina('/esperimenti/nuovo')
    await utente.click(screen.getByRole('button', { name: 'Chiudi l\'avviso' }))
    expect(screen.queryByText('Bozza ripristinata.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveValue('Prova')
  })

  it('la bozza salvata è di chi l\'ha scritta: un altro utente sulla stessa scheda non la vede', async () => {
    const utente = userEvent.setup({ delay: null })
    vi.mocked(useSessione).mockReturnValue({ sessione: { user: { id: 'u1', email: 'a@b.it' } } as Session, caricamento: false })
    const { unmount } = vaiAllaPagina('/esperimenti/nuovo')
    await utente.click(screen.getByRole('button', { name: /Parti da zero/ }))
    await utente.type(screen.getByLabelText('Nome'), 'Di u1')
    unmount()

    vi.mocked(useSessione).mockReturnValue({ sessione: { user: { id: 'u2', email: 'c@d.it' } } as Session, caricamento: false })
    vaiAllaPagina('/esperimenti/nuovo')
    expect(screen.getByRole('button', { name: /Parti da zero/ })).toBeInTheDocument()
    expect(screen.queryByText('Bozza ripristinata.')).not.toBeInTheDocument()
  })
})

describe('NuovoEsperimento: modello Hydrochar', () => {
  it('arriva al riepilogo con 56 piante e nessun errore; "Crea esperimento" crea e apre l\'esperimento', async () => {
    vi.mocked(creaEsperimento).mockResolvedValue('esp-nuovo')
    const utente = userEvent.setup({ delay: null })
    const { invalida } = vaiAllaPagina('/esperimenti/nuovo?modello=hydrochar')
    await screen.findByLabelText('Nome')

    expect(screen.getByLabelText('Nome')).toHaveValue('Hydrochar × Cuore di Bue')
    // Gli spazi ai bordi non arrivano nel database.
    await utente.type(screen.getByLabelText('Nome'), ' 2  ')
    await avanti(utente, 4)

    expect(titoloPasso()).toHaveTextContent('Riepilogo')
    expect(conteggio('Trattamenti')).toHaveTextContent('8')
    expect(conteggio('Piante')).toHaveTextContent('56')
    expect(conteggio('Strumenti')).toHaveTextContent('3')
    expect(conteggio('Voci fenologiche')).toHaveTextContent('7')
    expect(screen.queryByRole('list', { name: 'Da sistemare' })).not.toBeInTheDocument()
    expect(screen.getByText('Tutto pronto: puoi creare l\'esperimento.')).toBeInTheDocument()

    await utente.click(screen.getByRole('button', { name: 'Crea esperimento' }))

    expect(creaEsperimento).toHaveBeenCalledOnce()
    const bozza = vi.mocked(creaEsperimento).mock.calls[0][0] as BozzaEsperimento
    expect(bozza.piante).toHaveLength(56)
    expect(bozza.trattamenti).toHaveLength(8)
    expect(bozza.strumenti).toHaveLength(4)
    // Con il catalogo disponibile i tre strumenti sono copie collegate alle loro voci, con i valori collegati alle chiavi.
    const voce = (nome: string) => SEMI_CATALOGO.find(v => v.nome === nome)
    const valoriDi = (nome: string) => {
      const s = bozza.strumenti.find(x => x.nome === nome)
      return s?.parametri.map(pp => bozza.parametri.find(p => p.id === pp.parametro_id)?.catalogo_chiave)
    }
    expect(bozza.strumenti.filter(s => s.tipo === 'strumento').map(s => [s.nome, s.catalogo_id])).toEqual([
      ['Termometro', voce('Termometro')?.id], ['SPAD', voce('SPAD')?.id], ['Metro', voce('Metro')?.id],
    ])
    expect(valoriDi('Termometro')).toEqual(['temp_aria', 'temp_pianta'])
    expect(valoriDi('SPAD')).toEqual(['spad'])
    expect(valoriDi('Metro')).toEqual(['altezza'])
    expect(bozza.strumenti.find(s => s.tipo === 'fenologico')?.catalogo_id).toBeNull()
    expect(bozza.esperimento.nome).toBe('Hydrochar × Cuore di Bue 2')
    expect(await screen.findByText('Pagina dell\'esperimento esp-nuovo')).toBeInTheDocument()
    expect(invalida).toHaveBeenCalledWith({ queryKey: ['esperimenti'] })
    expect(toast.success).toHaveBeenCalledWith('Esperimento creato.', expect.objectContaining({ className: 'toast-salvato' }))
    expect(sessionStorage.length).toBe(0)

    // L'esperimento ha preso il posto del riepilogo nella cronologia: "indietro" porta al passo 4.
    expect(indirizzo()).toBe('/esperimenti/esp-nuovo')
    await browser(utente, 'Indietro')
    expect(indirizzo()).toBe('/esperimenti/nuovo?modello=hydrochar&passo=4')
  }, LUNGO)

  it('se la creazione fallisce mostra il messaggio e resta sul riepilogo con la bozza intatta', async () => {
    vi.mocked(creaEsperimento).mockRejectedValueOnce({ message: 'Failed to fetch' }).mockResolvedValue('esp-2')
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo?modello=hydrochar')
    await screen.findByLabelText('Nome')
    await avanti(utente, 4)

    await utente.click(screen.getByRole('button', { name: 'Crea esperimento' }))

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Il server non risponde')))
    expect(titoloPasso()).toHaveTextContent('Riepilogo')
    expect(conteggio('Piante')).toHaveTextContent('56')
    expect(screen.queryByText(/Pagina dell'esperimento/)).not.toBeInTheDocument()

    // Si può riprovare con la stessa bozza.
    await utente.click(screen.getByRole('button', { name: 'Crea esperimento' }))
    expect(await screen.findByText('Pagina dell\'esperimento esp-2')).toBeInTheDocument()
    const [primo, secondo] = vi.mocked(creaEsperimento).mock.calls.map(c => c[0])
    expect(secondo).toEqual(primo)
  }, LUNGO)

  it('se la prima risposta si è persa e riprovando l\'id risulta già usato, apre l\'esperimento già creato', async () => {
    vi.mocked(creaEsperimento)
      .mockRejectedValueOnce({ message: 'Failed to fetch' })
      .mockRejectedValueOnce({ code: '23505', message: 'duplicate key value violates unique constraint "esperimenti_pkey"' })
    vi.mocked(caricaConfig).mockResolvedValue(configDiEsempio())
    const utente = userEvent.setup({ delay: null })
    const { invalida } = vaiAllaPagina('/esperimenti/nuovo?modello=hydrochar')
    await screen.findByLabelText('Nome')
    await avanti(utente, 4)

    await utente.click(screen.getByRole('button', { name: 'Crea esperimento' }))
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledOnce())
    expect(caricaConfig).not.toHaveBeenCalled()

    await utente.click(screen.getByRole('button', { name: 'Crea esperimento' }))

    const bozza = vi.mocked(creaEsperimento).mock.calls[0][0] as BozzaEsperimento
    const id = bozza.esperimento.id
    expect(await screen.findByText(`Pagina dell'esperimento ${id}`)).toBeInTheDocument()
    expect(caricaConfig).toHaveBeenCalledExactlyOnceWith(id)
    expect(toast.error).toHaveBeenCalledOnce()
    expect(toast.success).toHaveBeenCalledWith('Esperimento creato.', expect.objectContaining({ className: 'toast-salvato' }))
    expect(invalida).toHaveBeenCalledWith({ queryKey: ['esperimenti'] })
    expect(sessionStorage.length).toBe(0)
  }, LUNGO)

  it('un id già usato al primo tentativo è un errore vero: lo mostra senza cercare l\'esperimento', async () => {
    vi.mocked(creaEsperimento).mockRejectedValue({ code: '23505', message: 'duplicate key' })
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo?modello=hydrochar')
    await screen.findByLabelText('Nome')
    await avanti(utente, 4)

    await utente.click(screen.getByRole('button', { name: 'Crea esperimento' }))
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Esiste già un elemento con questo nome o etichetta.'))
    expect(caricaConfig).not.toHaveBeenCalled()
    expect(titoloPasso()).toHaveTextContent('Riepilogo')
  }, LUNGO)

  it('se dopo un 23505 l\'esperimento non si riesce a leggere, resta l\'errore', async () => {
    vi.mocked(creaEsperimento)
      .mockRejectedValueOnce({ message: 'Failed to fetch' })
      .mockRejectedValueOnce({ code: '23505', message: 'duplicate key' })
    vi.mocked(caricaConfig).mockRejectedValue(new Error('Esperimento non trovato o non accessibile.'))
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo?modello=hydrochar')
    await screen.findByLabelText('Nome')
    await avanti(utente, 4)

    await utente.click(screen.getByRole('button', { name: 'Crea esperimento' }))
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledOnce())
    await utente.click(screen.getByRole('button', { name: 'Crea esperimento' }))

    await vi.waitFor(() => expect(toast.error).toHaveBeenLastCalledWith('Esiste già un elemento con questo nome o etichetta.'))
    expect(caricaConfig).toHaveBeenCalledOnce()
    expect(titoloPasso()).toHaveTextContent('Riepilogo')
  }, LUNGO)
})

describe('NuovoEsperimento: errori della bozza', () => {
  it('saltare il blocco del passo 2 con "avanti" del browser non basta: il riepilogo lo segnala', async () => {
    vi.mocked(caricaConfig).mockResolvedValue(configDiEsempio())
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo?da=esp-vecchio')
    await screen.findByLabelText('Nome')
    await avanti(utente, 2)
    await browser(utente, 'Indietro')

    await utente.click(screen.getByRole('button', { name: 'Togli il livello «S1»' }))
    expect(screen.getByRole('button', { name: 'Avanti' })).toBeDisabled()
    await browser(utente, 'Avanti')
    expect(titoloPasso()).toHaveTextContent('Strumenti')
    await avanti(utente, 2)

    const errori = screen.getByRole('list', { name: 'Da sistemare' })
    expect(within(errori).getByText('I fattori sono cambiati: premi «Genera trattamenti» per aggiornare la tabella.'))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crea esperimento' })).toBeDisabled()
  })

  it('con la bozza vuota "Crea esperimento" è disabilitato e gli errori sono elencati', async () => {
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo')
    await utente.click(screen.getByRole('button', { name: /Parti da zero/ }))
    await avanti(utente, 4)

    expect(screen.getByRole('button', { name: 'Crea esperimento' })).toBeDisabled()
    const errori = screen.getByRole('list', { name: 'Da sistemare' })
    for (const e of ['Dai un nome all\'esperimento.', 'Crea almeno un trattamento.', 'Aggiungi almeno una pianta.',
      'Aggiungi almeno uno strumento o la tabella fenologica.']) {
      expect(within(errori).getByText(e)).toBeInTheDocument()
    }
    expect(creaEsperimento).not.toHaveBeenCalled()
  })

  it('cambiare i fattori dopo aver generato i trattamenti blocca Avanti e spiega cosa fare', async () => {
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo?modello=hydrochar')
    await screen.findByLabelText('Nome')
    await avanti(utente)

    await utente.click(screen.getByRole('button', { name: 'Togli il livello «S1W1»' }))
    expect(screen.getByRole('button', { name: 'Avanti' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Avanti' }))
      .toHaveAccessibleDescription('I fattori sono cambiati: premi «Genera trattamenti» per aggiornare la tabella.')

    await utente.click(screen.getByRole('button', { name: 'Genera trattamenti' }))
    expect(screen.getByRole('button', { name: 'Avanti' }))
      .toHaveAccessibleDescription('La tabella dei trattamenti è cambiata: premi «Genera piante» per aggiornare l\'elenco.')

    await utente.click(screen.getByRole('button', { name: 'Genera piante' }))
    await utente.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Rigenera' }))
    expect(screen.getByRole('button', { name: 'Avanti' })).toBeEnabled()

    await avanti(utente, 3)
    expect(conteggio('Trattamenti')).toHaveTextContent('6')
    expect(conteggio('Piante')).toHaveTextContent('44')
  }, LUNGO)
})

describe('NuovoEsperimento: da zero', () => {
  /** Dal primo passo a "Strumenti": 1 fattore con 3 livelli, 2 piante per trattamento da 101. */
  async function finoAgliStrumenti(utente: Utente) {
    await utente.click(screen.getByRole('button', { name: /Parti da zero/ }))
    await utente.type(screen.getByLabelText('Nome'), 'Prova concime')
    await avanti(utente)

    await utente.click(screen.getByRole('button', { name: '+ Fattore' }))
    await utente.type(screen.getByLabelText('Nome del fattore'), 'Concime')
    for (const livello of ['0', '50', '100']) await utente.type(screen.getByLabelText('Nuovo livello'), `${livello}{Enter}`)
    await utente.click(screen.getByRole('button', { name: 'Genera trattamenti' }))
    for (const riga of [1, 2, 3]) {
      await utente.clear(screen.getByLabelText(`N piante del trattamento ${riga}`))
      await utente.type(screen.getByLabelText(`N piante del trattamento ${riga}`), '2')
    }
    await utente.clear(screen.getByLabelText('Numerazione da'))
    await utente.type(screen.getByLabelText('Numerazione da'), '101')
    await utente.click(screen.getByRole('button', { name: 'Genera piante' }))
    await avanti(utente)
    expect(titoloPasso()).toHaveTextContent('Strumenti')
  }

  it('Ciras dal catalogo, "+ Nuovo strumento" Penetrometro, senza tabella fenologica: la bozza arriva al database', async () => {
    vi.mocked(creaEsperimento).mockResolvedValue('esp-zero')
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo')
    await finoAgliStrumenti(utente)

    // Dal catalogo: compare con A, gs, E, Ci.
    await utente.click(await screen.findByRole('button', { name: 'Aggiungi «Ciras»' }))
    expect(within(screen.getByRole('list', { name: 'Strumenti' })).getByRole('button', { name: /^🍃 Ciras/ }))
      .toHaveTextContent('A · gs · E · Ci')

    // Uno nuovo: entra nel catalogo e nella bozza.
    await utente.click(screen.getByRole('button', { name: '+ Nuovo strumento' }))
    await utente.type(screen.getByLabelText('Nome dello strumento'), 'Penetrometro')
    await utente.click(screen.getByRole('button', { name: 'Aggiungi valore' }))
    await utente.type(screen.getByLabelText('Nome'), 'Resistenza')
    await utente.type(screen.getByLabelText('Unità'), 'kg/cm²')
    await utente.click(screen.getByRole('button', { name: 'Salva nel catalogo e aggiungi' }))
    expect(salvaVoceCatalogo).toHaveBeenCalledOnce()
    expect(await screen.findByRole('button', { name: /^Penetrometro/ })).toBeInTheDocument()

    await avanti(utente)
    expect(titoloPasso()).toHaveTextContent('Tabella fenologica')
    await utente.click(screen.getByRole('button', { name: 'Questo esperimento non ha rilievi fenologici' }))

    expect(titoloPasso()).toHaveTextContent('Riepilogo')
    expect(indirizzo()).toBe('/esperimenti/nuovo?passo=5')
    expect(conteggio('Trattamenti')).toHaveTextContent('3')
    expect(conteggio('Piante')).toHaveTextContent('6')
    expect(conteggio('Strumenti')).toHaveTextContent('2')
    expect(conteggio('Voci fenologiche')).toHaveTextContent('0')
    expect(sessionStorage.length).toBe(1)
    await utente.click(screen.getByRole('button', { name: 'Crea esperimento' }))

    expect(await screen.findByText('Pagina dell\'esperimento esp-zero')).toBeInTheDocument()
    expect(sessionStorage.length).toBe(0)
    const b = vi.mocked(creaEsperimento).mock.calls[0][0] as BozzaEsperimento
    expect(b.esperimento.nome).toBe('Prova concime')
    expect(b.fattori.map(f => [f.nome, f.livelli.map(l => l.nome)])).toEqual([['Concime', ['0', '50', '100']]])
    expect(b.trattamenti.map(t => t.etichetta)).toEqual(['0', '50', '100'])
    expect(b.piante.map(p => p.etichetta)).toEqual(['101', '102', '103', '104', '105', '106'])
    const voce = vi.mocked(salvaVoceCatalogo).mock.calls[0][0]
    expect(b.strumenti.map(s => [s.nome, s.tipo, s.catalogo_id])).toEqual([
      ['Ciras', 'strumento', SEMI_CATALOGO.find(v => v.nome === 'Ciras')?.id], ['Penetrometro', 'strumento', voce.id],
    ])
    expect(b.parametri.map(p => [p.nome, p.catalogo_chiave])).toEqual(
      [['A', 'a'], ['gs', 'gs'], ['E', 'e'], ['Ci', 'ci'], ['Resistenza', 'resistenza']])
    for (const s of b.strumenti) expect(s.parametri.every(pp => b.parametri.some(p => p.id === pp.parametro_id))).toBe(true)
  }, LUNGO)

  it('con la tabella fenologica: voci di ogni tipo, e il riepilogo le conta', async () => {
    vi.mocked(creaEsperimento).mockResolvedValue('esp-zero')
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo')
    await finoAgliStrumenti(utente)
    await utente.click(await screen.findByRole('button', { name: 'Aggiungi «Metro»' }))
    await avanti(utente)

    await utente.click(screen.getByRole('button', { name: 'Crea la tabella fenologica' }))
    await utente.click(screen.getByRole('button', { name: 'Aggiungi valore' }))
    await utente.type(screen.getByLabelText('Nome'), 'N frutti')
    await utente.click(screen.getByRole('button', { name: 'Aggiungi valore' }))
    await utente.type(screen.getByLabelText('Nome'), 'Note')
    await utente.selectOptions(screen.getByLabelText('Tipo'), 'testo')
    await avanti(utente)

    expect(conteggio('Strumenti')).toHaveTextContent('1')
    expect(conteggio('Voci fenologiche')).toHaveTextContent('2')
    await utente.click(screen.getByRole('button', { name: 'Crea esperimento' }))

    await screen.findByText('Pagina dell\'esperimento esp-zero')
    const b = vi.mocked(creaEsperimento).mock.calls[0][0] as BozzaEsperimento
    const tabella = b.strumenti.find(s => s.tipo === 'fenologico')
    expect(tabella?.nome).toBe('Tabella fenologica')
    expect(tabella?.parametri.map(pp => b.parametri.find(p => p.id === pp.parametro_id)?.nome)).toEqual(['N frutti', 'Note'])
    expect(b.parametri.find(p => p.nome === 'Note')?.tipo).toBe('testo')
  }, LUNGO)

  it('se il salvataggio nel catalogo fallisce lo strumento resta nella bozza, non collegato, e si può creare lo stesso', async () => {
    vi.mocked(creaEsperimento).mockResolvedValue('esp-zero')
    vi.mocked(salvaVoceCatalogo).mockRejectedValue({ message: 'Failed to fetch' })
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo')
    await finoAgliStrumenti(utente)

    await utente.click(await screen.findByRole('button', { name: '+ Nuovo strumento' }))
    await utente.type(screen.getByLabelText('Nome dello strumento'), 'Penetrometro')
    await utente.click(screen.getByRole('button', { name: 'Aggiungi valore' }))
    await utente.type(screen.getByLabelText('Nome'), 'Resistenza')
    await utente.click(screen.getByRole('button', { name: 'Salva nel catalogo e aggiungi' }))

    expect(await screen.findByText(/Il server non risponde/)).toBeInTheDocument()
    await avanti(utente)
    await utente.click(screen.getByRole('button', { name: 'Questo esperimento non ha rilievi fenologici' }))
    await utente.click(screen.getByRole('button', { name: 'Crea esperimento' }))

    await screen.findByText('Pagina dell\'esperimento esp-zero')
    const b = vi.mocked(creaEsperimento).mock.calls[0][0] as BozzaEsperimento
    expect(b.strumenti.map(s => [s.nome, s.catalogo_id])).toEqual([['Penetrometro', null]])
    expect(b.parametri.map(p => [p.nome, p.catalogo_chiave])).toEqual([['Resistenza', null]])
  }, LUNGO)
})

describe('NuovoEsperimento: salvataggio lento nel catalogo', () => {
  it('se finisce dopo un cambio di passo, lo strumento arriva alla bozza di adesso senza cancellare il resto', async () => {
    let finisci: () => void = () => {}
    vi.mocked(salvaVoceCatalogo).mockReturnValue(new Promise<void>(ok => { finisci = ok }))
    const utente = userEvent.setup({ delay: null })
    const { invalida } = vaiAllaPagina('/esperimenti/nuovo')
    await utente.click(screen.getByRole('button', { name: /Parti da zero/ }))
    await utente.type(screen.getByLabelText('Nome'), 'Prova')
    await avanti(utente, 2)
    expect(titoloPasso()).toHaveTextContent('Strumenti')

    await utente.click(await screen.findByRole('button', { name: '+ Nuovo strumento' }))
    await utente.type(screen.getByLabelText('Nome dello strumento'), 'Penetrometro')
    await utente.click(screen.getByRole('button', { name: 'Aggiungi valore' }))
    await utente.type(screen.getByLabelText('Nome'), 'Resistenza')
    await utente.click(screen.getByRole('button', { name: 'Salva nel catalogo e aggiungi' }))

    // Rete lenta: si va avanti e si prepara la tabella fenologica mentre il salvataggio è in corso.
    await avanti(utente)
    expect(titoloPasso()).toHaveTextContent('Tabella fenologica')
    await utente.click(screen.getByRole('button', { name: 'Crea la tabella fenologica' }))
    await utente.click(screen.getByRole('button', { name: 'Aggiungi valore' }))
    await utente.type(screen.getByLabelText('Nome'), 'N frutti')

    finisci()
    await vi.waitFor(() => expect(invalida).toHaveBeenCalledWith({ queryKey: ['catalogo'] }))

    // La tabella c'è ancora, con la sua voce, e lo strumento nuovo si è aggiunto.
    expect(screen.getByLabelText('Nome dello strumento')).toHaveValue('Tabella fenologica')
    expect(screen.getByRole('button', { name: /^N frutti/ })).toBeInTheDocument()
    await utente.click(screen.getByRole('button', { name: 'Passo precedente' }))
    expect(within(screen.getByRole('list', { name: 'Strumenti' })).getByRole('button', { name: /^Penetrometro/ })).toBeInTheDocument()
    await avanti(utente, 2)
    expect(conteggio('Strumenti')).toHaveTextContent('1')
    expect(conteggio('Voci fenologiche')).toHaveTextContent('1')
  }, LUNGO)
})

describe('NuovoEsperimento: catalogo e modello Hydrochar', () => {
  it('prima di costruire la bozza dal modello aspetta il catalogo; gli strumenti sono quelli del catalogo, collegati', async () => {
    let arriva: (voci: typeof SEMI_CATALOGO) => void = () => {}
    vi.mocked(listaCatalogo).mockReturnValue(new Promise(ok => { arriva = ok }))
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo?modello=hydrochar')

    expect(screen.getByRole('status')).toHaveTextContent('Caricamento…')
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument()

    arriva(SEMI_CATALOGO)
    expect(await screen.findByLabelText('Nome')).toHaveValue('Hydrochar × Cuore di Bue')
    expect(screen.queryByText(/Catalogo non raggiungibile/)).not.toBeInTheDocument()
    await avanti(utente, 2)
    for (const nome of ['Termometro', 'SPAD', 'Metro']) {
      expect(within(screen.getByRole('list', { name: 'Strumenti' })).getByRole('button', { name: new RegExp(nome) })).toBeInTheDocument()
    }
    // I tre strumenti vengono dal catalogo: non si possono aggiungere una seconda volta.
    expect(screen.getByRole('button', { name: '«Termometro» è già nell\'esperimento' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Aggiungi «Ciras»' })).toBeEnabled()
  })

  it('se il catalogo non si carica la bozza nasce dai semi, strumenti non collegati, con la riga che lo dice', async () => {
    vi.mocked(listaCatalogo).mockRejectedValue({ message: 'Failed to fetch' })
    vi.mocked(creaEsperimento).mockResolvedValue('esp-nuovo')
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo?modello=hydrochar')

    expect(await screen.findByText(
      'Catalogo non raggiungibile: gli strumenti del modello non sono collegati al catalogo.',
    )).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveValue('Hydrochar × Cuore di Bue')
    await avanti(utente, 4)
    expect(conteggio('Strumenti')).toHaveTextContent('3')
    expect(screen.getByText('Tutto pronto: puoi creare l\'esperimento.')).toBeInTheDocument()

    await utente.click(screen.getByRole('button', { name: 'Crea esperimento' }))
    await screen.findByText('Pagina dell\'esperimento esp-nuovo')
    const bozza = vi.mocked(creaEsperimento).mock.calls[0][0] as BozzaEsperimento
    expect(bozza.strumenti).toHaveLength(4)
    expect(bozza.strumenti.map(s => s.catalogo_id)).toEqual([null, null, null, null])
    expect(bozza.parametri.filter(p => p.catalogo_chiave !== null)).toHaveLength(4)
  }, LUNGO)

  it('dalla scelta iniziale il modello è disponibile solo quando il catalogo è arrivato (o ha fallito)', async () => {
    let arriva: (voci: typeof SEMI_CATALOGO) => void = () => {}
    vi.mocked(listaCatalogo).mockReturnValue(new Promise(ok => { arriva = ok }))
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo')

    expect(screen.getByRole('button', { name: /Parti dal modello Hydrochar/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Parti da zero/ })).toBeEnabled()
    arriva(SEMI_CATALOGO)
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /Parti dal modello Hydrochar/ })).toBeEnabled())
    await utente.click(screen.getByRole('button', { name: /Parti dal modello Hydrochar/ }))
    expect(screen.getByLabelText('Nome')).toHaveValue('Hydrochar × Cuore di Bue')
    expect(screen.queryByText(/Catalogo non raggiungibile/)).not.toBeInTheDocument()
  })

  it('dalla scelta iniziale con il catalogo in errore il modello si costruisce dai semi, con la riga informativa', async () => {
    vi.mocked(listaCatalogo).mockRejectedValue({ message: 'Failed to fetch' })
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo')

    await vi.waitFor(() => expect(screen.getByRole('button', { name: /Parti dal modello Hydrochar/ })).toBeEnabled())
    await utente.click(screen.getByRole('button', { name: /Parti dal modello Hydrochar/ }))
    expect(screen.getByLabelText('Nome')).toHaveValue('Hydrochar × Cuore di Bue')
    expect(screen.getByText(/Catalogo non raggiungibile/)).toBeInTheDocument()
  })

  it('con una bozza già salvata non aspetta il catalogo', async () => {
    const utente = userEvent.setup({ delay: null })
    const { unmount } = vaiAllaPagina('/esperimenti/nuovo?modello=hydrochar')
    await utente.type(await screen.findByLabelText('Nome'), ' 2')
    unmount()

    vi.mocked(listaCatalogo).mockReturnValue(new Promise(() => {}))
    vaiAllaPagina('/esperimenti/nuovo?modello=hydrochar')
    expect(screen.getByLabelText('Nome')).toHaveValue('Hydrochar × Cuore di Bue 2')
    expect(screen.getByRole('status')).toHaveTextContent('Bozza ripristinata.')
    // "Ricomincia" ricostruirebbe il modello: finché il catalogo non c'è non si può.
    expect(screen.getByRole('button', { name: 'Ricomincia' })).toBeDisabled()
  })

  it('la bozza dal modello si costruisce una volta sola: il catalogo che si aggiorna dopo non la rifà', async () => {
    const utente = userEvent.setup({ delay: null })
    const { client } = vaiAllaPagina('/esperimenti/nuovo?modello=hydrochar')
    await utente.type(await screen.findByLabelText('Nome'), ' 2')
    const prima = Object.values(sessionStorage)[0]
    expect(prima).toContain('Hydrochar × Cuore di Bue 2')

    vi.mocked(listaCatalogo).mockResolvedValue([])
    await client.invalidateQueries({ queryKey: ['catalogo'] })
    await vi.waitFor(() => expect(listaCatalogo).toHaveBeenCalledTimes(2))

    expect(screen.getByLabelText('Nome')).toHaveValue('Hydrochar × Cuore di Bue 2')
    expect(Object.values(sessionStorage)[0]).toBe(prima)
  })
})

describe('NuovoEsperimento: duplicazione', () => {
  it('con ?da= carica la configurazione e parte da una copia, con il nome "Copia di …"', async () => {
    vi.mocked(caricaConfig).mockResolvedValue(configDiEsempio())
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo?da=esp-vecchio')

    expect(await screen.findByLabelText('Nome')).toHaveValue('Copia di Esempio')
    expect(caricaConfig).toHaveBeenCalledWith('esp-vecchio')
    await avanti(utente, 4)

    expect(screen.getByText('Copia di Esempio')).toBeInTheDocument()
    expect(conteggio('Trattamenti')).toHaveTextContent('4')
    expect(conteggio('Piante')).toHaveTextContent('4')
    expect(conteggio('Strumenti')).toHaveTextContent('2')
    expect(conteggio('Voci fenologiche')).toHaveTextContent('0')
    expect(screen.getByRole('button', { name: 'Crea esperimento' })).toBeEnabled()
  })

  it('se la configurazione non si carica lo dice e permette di riprovare', async () => {
    vi.mocked(caricaConfig).mockRejectedValueOnce({ message: 'Failed to fetch' }).mockResolvedValue(configDiEsempio())
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo?da=esp-vecchio')

    expect(await screen.findByText(/Il server non risponde/)).toBeInTheDocument()
    await utente.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(await screen.findByLabelText('Nome')).toHaveValue('Copia di Esempio')
  })
})
