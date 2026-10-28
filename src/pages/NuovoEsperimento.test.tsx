import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
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
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { toast } from 'sonner'
import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { caricaConfig, creaEsperimento } from '@/api/esperimenti'
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

function vaiAllaPagina(indirizzo: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalida = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[indirizzo]}>
        <Routes>
          <Route path="/esperimenti/nuovo" element={<NuovoEsperimento />} />
          <Route path="/esperimenti/:espId" element={<PaginaEsperimento />} />
          <Route path="/" element={<p>Elenco esperimenti</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { invalida }
}

const titoloPasso = () => screen.getByRole('heading', { level: 2 })

async function avanti(utente: Utente, volte = 1) {
  for (let i = 0; i < volte; i++) await utente.click(screen.getByRole('button', { name: 'Avanti' }))
}

/** Il valore mostrato nel riepilogo accanto a una voce (Trattamenti, Piante, …). */
function conteggio(voce: string) {
  return within(screen.getByText(voce, { selector: 'dt' }).parentElement as HTMLElement).getByRole('definition')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useSessione).mockReturnValue({ sessione: { user: { email: 'a@b.it' } } as Session, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
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
    expect(screen.queryByRole('button', { name: 'Indietro' })).not.toBeInTheDocument()
  })

  it('"Parti dal modello Hydrochar" compila la bozza con il modello', async () => {
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo')
    await utente.click(screen.getByRole('button', { name: /Parti dal modello Hydrochar/ }))
    expect(screen.getByLabelText('Nome')).toHaveValue('Hydrochar × Cuore di Bue')
  })

  it('Avanti e Indietro passano da un passo all\'altro e i dati restano', async () => {
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo')
    await utente.click(screen.getByRole('button', { name: /Parti da zero/ }))
    await utente.type(screen.getByLabelText('Nome'), 'Prova concime')

    await avanti(utente)
    expect(titoloPasso()).toHaveTextContent('Fattori e piante')
    expect(titoloPasso()).toHaveFocus()
    await avanti(utente)
    expect(titoloPasso()).toHaveTextContent('Parametri')
    await avanti(utente)
    expect(titoloPasso()).toHaveTextContent('Passate')
    await avanti(utente)
    expect(titoloPasso()).toHaveTextContent('Riepilogo')
    expect(screen.queryByRole('button', { name: 'Avanti' })).not.toBeInTheDocument()

    for (let i = 0; i < 4; i++) await utente.click(screen.getByRole('button', { name: 'Indietro' }))
    expect(titoloPasso()).toHaveTextContent('Generale')
    expect(screen.getByLabelText('Nome')).toHaveValue('Prova concime')
  })
})

describe('NuovoEsperimento: modello Hydrochar', () => {
  it('arriva al riepilogo con 56 piante e nessun errore; "Crea esperimento" crea e apre l\'esperimento', async () => {
    vi.mocked(creaEsperimento).mockResolvedValue('esp-nuovo')
    const utente = userEvent.setup({ delay: null })
    const { invalida } = vaiAllaPagina('/esperimenti/nuovo?modello=hydrochar')

    expect(screen.getByLabelText('Nome')).toHaveValue('Hydrochar × Cuore di Bue')
    await avanti(utente, 4)

    expect(titoloPasso()).toHaveTextContent('Riepilogo')
    expect(conteggio('Trattamenti')).toHaveTextContent('8')
    expect(conteggio('Piante')).toHaveTextContent('56')
    expect(conteggio('Parametri')).toHaveTextContent('11')
    expect(conteggio('Passate')).toHaveTextContent('4')
    expect(screen.queryByRole('list', { name: 'Da sistemare' })).not.toBeInTheDocument()
    expect(screen.getByText('Tutto pronto: puoi creare l\'esperimento.')).toBeInTheDocument()

    await utente.click(screen.getByRole('button', { name: 'Crea esperimento' }))

    expect(creaEsperimento).toHaveBeenCalledOnce()
    const bozza = vi.mocked(creaEsperimento).mock.calls[0][0] as BozzaEsperimento
    expect(bozza.piante).toHaveLength(56)
    expect(bozza.trattamenti).toHaveLength(8)
    expect(await screen.findByText('Pagina dell\'esperimento esp-nuovo')).toBeInTheDocument()
    expect(invalida).toHaveBeenCalledWith({ queryKey: ['esperimenti'] })
    expect(toast.success).toHaveBeenCalledWith('Esperimento creato.')
  }, LUNGO)

  it('se la creazione fallisce mostra il messaggio e resta sul riepilogo con la bozza intatta', async () => {
    vi.mocked(creaEsperimento).mockRejectedValueOnce({ message: 'Failed to fetch' }).mockResolvedValue('esp-2')
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo?modello=hydrochar')
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
})

describe('NuovoEsperimento: errori della bozza', () => {
  it('con la bozza vuota "Crea esperimento" è disabilitato e gli errori sono elencati', async () => {
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo')
    await utente.click(screen.getByRole('button', { name: /Parti da zero/ }))
    await avanti(utente, 4)

    expect(screen.getByRole('button', { name: 'Crea esperimento' })).toBeDisabled()
    const errori = screen.getByRole('list', { name: 'Da sistemare' })
    for (const e of ['Dai un nome all\'esperimento.', 'Crea almeno un trattamento.', 'Aggiungi almeno una pianta.',
      'Aggiungi almeno un parametro.', 'Crea almeno una passata.']) {
      expect(within(errori).getByText(e)).toBeInTheDocument()
    }
    expect(creaEsperimento).not.toHaveBeenCalled()
  })

  it('cambiare i fattori dopo aver generato i trattamenti blocca Avanti e spiega cosa fare', async () => {
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo?modello=hydrochar')
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
  it('1 fattore con 3 livelli, 2 piante per trattamento da 101, 2 parametri e 1 passata', async () => {
    vi.mocked(creaEsperimento).mockResolvedValue('esp-zero')
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina('/esperimenti/nuovo')
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

    await utente.click(screen.getByRole('button', { name: '+ Parametro' }))
    await utente.type(screen.getByLabelText('Nome'), 'Altezza')
    await utente.type(screen.getByLabelText('Unità'), 'cm')
    await utente.click(screen.getByRole('button', { name: '+ Parametro' }))
    await utente.type(screen.getByLabelText('Nome'), 'Note')
    await utente.selectOptions(screen.getByLabelText('Tipo'), 'testo')
    await avanti(utente)

    await utente.click(screen.getByRole('button', { name: '+ Passata' }))
    await utente.type(screen.getByLabelText('Nome della passata'), 'Fenologici')
    for (const interruttore of screen.getAllByRole('switch', { name: /Incluso/ })) await utente.click(interruttore)
    await avanti(utente)

    expect(conteggio('Trattamenti')).toHaveTextContent('3')
    expect(conteggio('Piante')).toHaveTextContent('6')
    expect(conteggio('Parametri')).toHaveTextContent('2')
    expect(conteggio('Passate')).toHaveTextContent('1')
    await utente.click(screen.getByRole('button', { name: 'Crea esperimento' }))

    expect(await screen.findByText('Pagina dell\'esperimento esp-zero')).toBeInTheDocument()
    const b = vi.mocked(creaEsperimento).mock.calls[0][0] as BozzaEsperimento
    expect(b.esperimento.nome).toBe('Prova concime')
    expect(b.fattori.map(f => [f.nome, f.livelli.map(l => l.nome)])).toEqual([['Concime', ['0', '50', '100']]])
    expect(b.trattamenti.map(t => t.etichetta)).toEqual(['0', '50', '100'])
    expect(b.piante.map(p => p.etichetta)).toEqual(['101', '102', '103', '104', '105', '106'])
    expect(b.parametri.map(p => [p.nome, p.tipo, p.unita])).toEqual([['Altezza', 'numero', 'cm'], ['Note', 'testo', null]])
    expect(b.passate.map(p => [p.nome, p.parametri.map(pp => pp.parametro_id)]))
      .toEqual([['Fenologici', b.parametri.map(p => p.id)]])
  }, LUNGO)
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
    expect(conteggio('Parametri')).toHaveTextContent('3')
    expect(conteggio('Passate')).toHaveTextContent('2')
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
