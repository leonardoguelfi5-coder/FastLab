import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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
vi.mock('@/api/catalogo', () => ({
  listaCatalogo: vi.fn(), salvaVoceCatalogo: vi.fn(), archiviaVoceCatalogo: vi.fn(), copieDiProprieta: vi.fn(), applicaAggiornamento: vi.fn(),
}))
vi.mock('@/lib/toastSalvato', () => ({ toastSalvato: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(() => 'id-toast'), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }) }))
// nuovoId vero, ma osservabile: l'id di una voce nuova viene da lì (mai crypto.randomUUID diretto).
vi.mock('@/lib/id', async importOriginal => {
  const vero = await importOriginal<typeof import('@/lib/id')>()
  return { nuovoId: vi.fn(vero.nuovoId) }
})

import { toast } from 'sonner'
import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { applicaAggiornamento, archiviaVoceCatalogo, copieDiProprieta, listaCatalogo, salvaVoceCatalogo } from '@/api/catalogo'
import { chiavi } from '@/api/query'
import { strumentoDaCatalogo, type CopiaStrumento } from '@/domain/catalogo'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import type { VoceCatalogo } from '@/domain/tipi'
import { nuovoId } from '@/lib/id'
import { toastSalvato } from '@/lib/toastSalvato'
import { Catalogo } from './Catalogo'

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session

const ciras = SEMI_CATALOGO.find(v => v.nome === 'Ciras') as VoceCatalogo
const spad = SEMI_CATALOGO.find(v => v.nome === 'SPAD') as VoceCatalogo

function Posizione() {
  return <p data-testid="posizione">{useLocation().pathname}</p>
}

function apri() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/catalogo']}>
        <Routes>
          <Route path="/catalogo" element={<Catalogo />} />
          <Route path="*" element={<p>Altra pagina</p>} />
        </Routes>
        <Posizione />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { client, utente: userEvent.setup({ delay: null }) }
}

type Utente = ReturnType<typeof apri>['utente']

const pronta = () => screen.findByRole('list', { name: 'Catalogo strumenti' })
const rigaVoce = (nome: string) => within(screen.getByRole('list', { name: 'Catalogo strumenti' })).getByRole('button', { name: new RegExp(nome) })
const apriVoce = async (utente: Utente, nome: string) => {
  await pronta()
  await utente.click(rigaVoce(nome))
  await screen.findByLabelText('Nome dello strumento')
}
const salva = (utente: Utente) => utente.click(screen.getByRole('button', { name: 'Salva' }))
const casella = () => screen.getByRole('checkbox', { name: 'Aggiorna anche i miei esperimenti' })
/** L'ultima voce passata a `salvaVoceCatalogo`. */
const salvata = () => vi.mocked(salvaVoceCatalogo).mock.calls.at(-1)?.[0] as VoceCatalogo

/** Una copia di Ciras in un esperimento, come la restituirebbe `copieDiProprieta`, con le correzioni a mano date. */
function copiaCiras(ritocchi: Record<string, Partial<CopiaStrumento['parametri'][number]>> = {}): CopiaStrumento {
  const { strumento, parametri } = strumentoDaCatalogo(ciras, 0)
  return {
    espId: 'E1',
    esperimentoNome: 'Serra 2',
    strumento,
    parametri: parametri.map(p => ({ ...p, ...(ritocchi[p.catalogo_chiave as string] ?? {}) })),
    conDati: new Set(),
    ordineMassimo: parametri.length - 1,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(listaCatalogo).mockResolvedValue(SEMI_CATALOGO)
  vi.mocked(salvaVoceCatalogo).mockResolvedValue(undefined)
  vi.mocked(archiviaVoceCatalogo).mockResolvedValue(undefined)
  vi.mocked(copieDiProprieta).mockResolvedValue([])
  vi.mocked(applicaAggiornamento).mockResolvedValue(undefined)
})

describe('Catalogo: l\'elenco', () => {
  it('ha il titolo "Catalogo strumenti" e una riga per voce: icona, nome, valori con unità e descrizione', async () => {
    apri()
    await pronta()

    expect(screen.getByRole('heading', { level: 1, name: 'Catalogo strumenti' })).toBeInTheDocument()
    const riga = rigaVoce('Ciras')
    expect(riga).toHaveTextContent('🍃 Ciras')
    // I valori sono dati: Geist Mono con cifre tabellari.
    expect(within(riga).getByText(/^A µmol/)).toHaveClass('font-mono', 'tabular-nums')
    expect(riga).toHaveTextContent('A µmol m⁻² s⁻¹ · gs mol m⁻² s⁻¹ · E mmol m⁻² s⁻¹ · Ci µmol mol⁻¹')
    expect(riga).toHaveTextContent('Scambi gassosi della foglia.')
    expect(screen.getAllByRole('listitem')).toHaveLength(SEMI_CATALOGO.length)
  })

  it('la freccia indietro porta alla home degli esperimenti', async () => {
    const { utente } = apri()
    await pronta()
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    expect(screen.getByTestId('posizione')).toHaveTextContent('/')
    expect(screen.getByText('Altra pagina')).toBeInTheDocument()
  })

  it('con il catalogo vuoto spiega a cosa serve e offre di crearne il primo', async () => {
    vi.mocked(listaCatalogo).mockResolvedValue([])
    apri()

    expect(await screen.findByText(/Il catalogo è vuoto/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Nuovo strumento' })).toBeEnabled()
  })

  it('se il catalogo non si carica mostra l\'errore e "Riprova" lo rilegge', async () => {
    vi.mocked(listaCatalogo).mockRejectedValueOnce({ message: 'Failed to fetch' })
    const { utente } = apri()

    expect(await screen.findByRole('alert')).toHaveTextContent('Il server non risponde')
    await utente.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(await pronta()).toBeInTheDocument()
  })
})

describe('Catalogo: salvare una voce', () => {
  it('toccando una voce si apre l\'editor con nome, icona, descrizione e valori', async () => {
    const { utente } = apri()
    await apriVoce(utente, 'Ciras')

    expect(screen.getByLabelText('Nome dello strumento')).toHaveValue('Ciras')
    expect(screen.getByLabelText('Icona')).toHaveValue('🍃')
    expect(screen.getByLabelText('Descrizione (facoltativa)')).toHaveValue('Scambi gassosi della foglia.')
    const valori = within(screen.getByRole('list', { name: 'Valori' }))
    expect(valori.getAllByRole('button').map(b => b.textContent)).toEqual([
      expect.stringMatching(/^A/), expect.stringMatching(/^gs/), expect.stringMatching(/^E/), expect.stringMatching(/^Ci/),
    ])
    // Con la voce aperta l'elenco non c'è più e il pulsante è "Salva", spento finché non si cambia qualcosa.
    expect(screen.queryByRole('list', { name: 'Catalogo strumenti' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salva' })).toBeDisabled()
  })

  it('senza la casella salva solo la voce: nessuna lettura delle copie', async () => {
    const { utente } = apri()
    await apriVoce(utente, 'SPAD')
    expect(casella()).not.toBeChecked()

    await utente.type(screen.getByLabelText('Descrizione (facoltativa)'), ' Clorofilla.')
    await salva(utente)

    await waitFor(() => expect(salvaVoceCatalogo).toHaveBeenCalledTimes(1))
    expect(salvata()).toEqual({ ...spad, descrizione: 'Contenuto di clorofilla della foglia. Clorofilla.' })
    expect(copieDiProprieta).not.toHaveBeenCalled()
    expect(applicaAggiornamento).not.toHaveBeenCalled()
    expect(toastSalvato).toHaveBeenCalledWith('Catalogo aggiornato.')
    // Dopo il salvataggio si torna all'elenco, riletto.
    expect(await pronta()).toBeInTheDocument()
    expect(listaCatalogo).toHaveBeenCalledTimes(2)
  })

  it('la casella ha l\'aiuto in chiaro e non è spuntata di base', async () => {
    const { utente } = apri()
    await apriVoce(utente, 'Ciras')

    expect(casella()).not.toBeChecked()
    expect(screen.getByText('Solo gli esperimenti di cui sei proprietario. I valori con misure o ritoccati a mano non cambiano.')).toBeInTheDocument()
    expect(casella()).toHaveAccessibleDescription('Solo gli esperimenti di cui sei proprietario. I valori con misure o ritoccati a mano non cambiano.')
  })

  it('rinominare un valore ne conserva la chiave', async () => {
    const { utente } = apri()
    await apriVoce(utente, 'Ciras')

    await utente.click(within(screen.getByRole('list', { name: 'Valori' })).getByRole('button', { name: /^A/ }))
    await utente.clear(screen.getByLabelText('Nome'))
    await utente.type(screen.getByLabelText('Nome'), 'Assimilazione')
    await salva(utente)

    await waitFor(() => expect(salvaVoceCatalogo).toHaveBeenCalled())
    expect(salvata().parametri.map(p => [p.chiave, p.nome])).toEqual([
      ['a', 'Assimilazione'], ['gs', 'gs'], ['e', 'E'], ['ci', 'Ci'],
    ])
  })

  it('un valore aggiunto riceve una chiave nuova dal nome, libera', async () => {
    const { utente } = apri()
    await apriVoce(utente, 'SPAD')

    await utente.click(screen.getByRole('button', { name: 'Aggiungi valore' }))
    await utente.type(screen.getByLabelText('Nome'), 'SPAD!')
    await salva(utente)

    await waitFor(() => expect(salvaVoceCatalogo).toHaveBeenCalled())
    expect(salvata().parametri.map(p => [p.chiave, p.nome])).toEqual([['spad', 'SPAD'], ['spad_2', 'SPAD!']])
  })

  it('con la casella: salva la voce, legge le copie, applica il piano con la voce di prima e dice "Catalogo aggiornato."', async () => {
    // La copia ha il nome di A ritoccato a mano: quel campo è un saltato, il resto del piano è vuoto.
    vi.mocked(copieDiProprieta).mockResolvedValue([copiaCiras({ a: { nome: 'A mia' } })])
    const { utente, client } = apri()
    const invalida = vi.spyOn(client, 'invalidateQueries')
    await apriVoce(utente, 'Ciras')

    await utente.click(casella())
    await utente.click(within(screen.getByRole('list', { name: 'Valori' })).getByRole('button', { name: /^gs/ }))
    await utente.clear(screen.getByLabelText('Nome'))
    await utente.type(screen.getByLabelText('Nome'), 'gsw')
    await salva(utente)

    await waitFor(() => expect(applicaAggiornamento).toHaveBeenCalledTimes(1))
    expect(copieDiProprieta).toHaveBeenCalledWith(ciras.id)
    const piano = vi.mocked(applicaAggiornamento).mock.calls[0][0]
    expect(piano.modifiche).toHaveLength(1)
    expect(piano.modifiche[0]).toMatchObject({ espId: 'E1', campi: { nome: 'gsw' } })
    expect(piano.saltati).toEqual([])
    expect(toastSalvato).toHaveBeenCalledWith('Catalogo aggiornato.')
    expect(screen.queryByText('Non aggiornati:')).not.toBeInTheDocument()
    expect(await pronta()).toBeInTheDocument()
    // Si rileggono il catalogo e la configurazione dell'esperimento toccato.
    expect(invalida).toHaveBeenCalledWith({ queryKey: chiavi.catalogo })
    expect(invalida).toHaveBeenCalledWith({ queryKey: chiavi.config('E1') })
  })

  it('con la casella e un saltato: sotto l\'elenco compare "Non aggiornati:" con la stringa, e si chiude', async () => {
    vi.mocked(copieDiProprieta).mockResolvedValue([copiaCiras({ a: { nome: 'A mia' } })])
    const { utente } = apri()
    await apriVoce(utente, 'Ciras')

    await utente.click(casella())
    await utente.click(within(screen.getByRole('list', { name: 'Valori' })).getByRole('button', { name: /^A/ }))
    await utente.clear(screen.getByLabelText('Nome'))
    await utente.type(screen.getByLabelText('Nome'), 'Assimilazione')
    await salva(utente)

    expect(await screen.findByText('Non aggiornati:')).toBeInTheDocument()
    expect(screen.getByText('Serra 2 · Ciras · A mia: nome modificato a mano')).toBeInTheDocument()
    expect(toastSalvato).toHaveBeenCalledWith('Catalogo aggiornato.')

    await utente.click(screen.getByRole('button', { name: 'Chiudi' }))
    expect(screen.queryByText('Non aggiornati:')).not.toBeInTheDocument()
  })

  it('l\'elenco dei saltati resta finché non si cambia voce', async () => {
    vi.mocked(copieDiProprieta).mockResolvedValue([copiaCiras({ a: { nome: 'A mia' } })])
    const { utente } = apri()
    await apriVoce(utente, 'Ciras')
    await utente.click(casella())
    await utente.click(within(screen.getByRole('list', { name: 'Valori' })).getByRole('button', { name: /^A/ }))
    await utente.clear(screen.getByLabelText('Nome'))
    await utente.type(screen.getByLabelText('Nome'), 'Assimilazione')
    await salva(utente)
    await screen.findByText('Non aggiornati:')

    await utente.click(rigaVoce('SPAD'))
    await screen.findByLabelText('Nome dello strumento')
    expect(screen.queryByText('Non aggiornati:')).not.toBeInTheDocument()
  })

  it('se gli esperimenti non si aggiornano lo dice, e "Riprova" rifà solo quella parte con la voce di prima', async () => {
    vi.mocked(copieDiProprieta).mockResolvedValue([copiaCiras()])
    vi.mocked(applicaAggiornamento).mockRejectedValueOnce({ message: 'Failed to fetch' })
    const { utente } = apri()
    await apriVoce(utente, 'Ciras')

    await utente.click(casella())
    await utente.click(within(screen.getByRole('list', { name: 'Valori' })).getByRole('button', { name: /^A/ }))
    await utente.clear(screen.getByLabelText('Nome'))
    await utente.type(screen.getByLabelText('Nome'), 'Assimilazione')
    await salva(utente)

    const avviso = await screen.findByRole('alert')
    expect(avviso).toHaveTextContent(/^Catalogo salvato, ma i tuoi esperimenti non sono stati aggiornati: Il server non risponde/)
    expect(toastSalvato).not.toHaveBeenCalled()
    expect(salvaVoceCatalogo).toHaveBeenCalledTimes(1)

    await utente.click(within(avviso).getByRole('button', { name: 'Riprova' }))

    await waitFor(() => expect(applicaAggiornamento).toHaveBeenCalledTimes(2))
    // Il catalogo non si salva di nuovo, e il piano è calcolato con la voce di prima: non è vuoto.
    expect(salvaVoceCatalogo).toHaveBeenCalledTimes(1)
    expect(copieDiProprieta).toHaveBeenCalledTimes(2)
    const piano = vi.mocked(applicaAggiornamento).mock.calls[1][0]
    expect(piano.modifiche).toHaveLength(1)
    expect(piano.modifiche[0]).toMatchObject({ espId: 'E1', campi: { nome: 'Assimilazione' } })
    expect(toastSalvato).toHaveBeenCalledWith('Catalogo aggiornato.')
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('se non si leggono nemmeno le copie vale lo stesso messaggio, con "Riprova"', async () => {
    vi.mocked(copieDiProprieta).mockRejectedValueOnce({ message: 'Failed to fetch' })
    const { utente } = apri()
    await apriVoce(utente, 'SPAD')
    await utente.click(casella())
    await utente.type(screen.getByLabelText('Nome dello strumento'), ' 2')
    await salva(utente)

    expect(await screen.findByRole('alert')).toHaveTextContent('Catalogo salvato, ma i tuoi esperimenti non sono stati aggiornati')
    expect(applicaAggiornamento).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Riprova' })).toBeEnabled()
  })

  it('se il salvataggio della voce fallisce non si toccano gli esperimenti: l\'errore resta nell\'editor e si può riprovare', async () => {
    vi.mocked(salvaVoceCatalogo).mockRejectedValueOnce({ message: 'Failed to fetch' })
    const { utente } = apri()
    await apriVoce(utente, 'Ciras')
    await utente.click(casella())
    await utente.type(screen.getByLabelText('Nome dello strumento'), ' 2')
    await salva(utente)

    expect(await screen.findByRole('alert')).toHaveTextContent('Il server non risponde')
    expect(copieDiProprieta).not.toHaveBeenCalled()
    expect(applicaAggiornamento).not.toHaveBeenCalled()
    expect(toastSalvato).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Nome dello strumento')).toHaveValue('Ciras 2')

    await salva(utente)
    await waitFor(() => expect(applicaAggiornamento).toHaveBeenCalledTimes(1))
    expect(copieDiProprieta).toHaveBeenCalledTimes(1)
    expect(salvaVoceCatalogo).toHaveBeenCalledTimes(2)
  })

  it('un nome già nel catalogo lascia l\'editor aperto con il messaggio del database', async () => {
    vi.mocked(salvaVoceCatalogo).mockRejectedValueOnce({ code: '23505', message: 'duplicate key value violates unique constraint "catalogo_strumenti_nome_unico"' })
    const { utente } = apri()
    await apriVoce(utente, 'SPAD')
    await utente.clear(screen.getByLabelText('Nome dello strumento'))
    await utente.type(screen.getByLabelText('Nome dello strumento'), 'Ciras')
    await salva(utente)

    expect(await screen.findByRole('alert')).toHaveTextContent('Nel catalogo c\'è già uno strumento con questo nome.')
    expect(screen.getByLabelText('Nome dello strumento')).toHaveValue('Ciras')
  })

  it('durante il salvataggio il pulsante è spento: un doppio tocco non salva due volte', async () => {
    let finisci: () => void = () => {}
    vi.mocked(salvaVoceCatalogo).mockImplementation(() => new Promise<void>(r => { finisci = r }))
    const { utente } = apri()
    await apriVoce(utente, 'SPAD')
    await utente.type(screen.getByLabelText('Nome dello strumento'), ' 2')

    await salva(utente)
    expect(screen.getByRole('button', { name: 'Salvataggio…' })).toBeDisabled()
    await utente.click(screen.getByRole('button', { name: 'Salvataggio…' }))
    expect(salvaVoceCatalogo).toHaveBeenCalledTimes(1)

    finisci()
    expect(await pronta()).toBeInTheDocument()
  })

  it('senza nome o senza valori il pulsante resta spento e si dice cosa manca', async () => {
    const { utente } = apri()
    await apriVoce(utente, 'SPAD')

    await utente.clear(screen.getByLabelText('Nome dello strumento'))
    expect(screen.getByRole('button', { name: 'Salva' })).toBeDisabled()
    expect(screen.getByText('Uno strumento non ha nome.')).toBeInTheDocument()
    await salva(utente)
    expect(salvaVoceCatalogo).not.toHaveBeenCalled()
  })
})

describe('Catalogo: una voce nuova', () => {
  it('"+ Nuovo strumento" apre l\'editor vuoto, senza la casella (una voce nuova non ha copie)', async () => {
    const { utente } = apri()
    await pronta()
    await utente.click(screen.getByRole('button', { name: '+ Nuovo strumento' }))

    expect(screen.getByLabelText('Nome dello strumento')).toHaveValue('')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archivia dal catalogo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salva' })).toBeDisabled()
  })

  it('si salva con un id nuovo da nuovoId e chiavi dai nomi; senza lettura delle copie', async () => {
    const { utente } = apri()
    await pronta()
    await utente.click(screen.getByRole('button', { name: '+ Nuovo strumento' }))
    vi.mocked(nuovoId).mockClear()

    await utente.type(screen.getByLabelText('Nome dello strumento'), 'Penetrometro')
    await utente.type(screen.getByLabelText('Descrizione (facoltativa)'), 'Resistenza del frutto.')
    await utente.click(screen.getByRole('button', { name: 'Aggiungi valore' }))
    await utente.type(screen.getByLabelText('Nome'), 'Resistenza')
    await utente.type(screen.getByLabelText('Unità'), 'N')
    await salva(utente)

    await waitFor(() => expect(salvaVoceCatalogo).toHaveBeenCalledTimes(1))
    const voce = salvata()
    expect(voce.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(SEMI_CATALOGO.map(v => v.id)).not.toContain(voce.id)
    expect(voce).toMatchObject({
      nome: 'Penetrometro', icona: null, descrizione: 'Resistenza del frutto.', archiviato: false,
      parametri: [{ chiave: 'resistenza', nome: 'Resistenza', unita: 'N', n_letture: 1, valore_min: null, valore_max: null }],
    })
    expect(copieDiProprieta).not.toHaveBeenCalled()
    expect(toastSalvato).toHaveBeenCalledWith('Strumento aggiunto al catalogo.')
  })

  it('dopo un errore il nuovo tentativo riusa lo stesso id: è la stessa voce, non un\'altra', async () => {
    vi.mocked(salvaVoceCatalogo).mockRejectedValueOnce({ message: 'Failed to fetch' })
    const { utente } = apri()
    await pronta()
    await utente.click(screen.getByRole('button', { name: '+ Nuovo strumento' }))
    await utente.type(screen.getByLabelText('Nome dello strumento'), 'Penetrometro')
    await utente.click(screen.getByRole('button', { name: 'Aggiungi valore' }))
    await utente.type(screen.getByLabelText('Nome'), 'Resistenza')

    await salva(utente)
    await screen.findByRole('alert')
    await salva(utente)

    await waitFor(() => expect(salvaVoceCatalogo).toHaveBeenCalledTimes(2))
    expect(vi.mocked(salvaVoceCatalogo).mock.calls[1][0].id).toBe(vi.mocked(salvaVoceCatalogo).mock.calls[0][0].id)
  })
})

describe('Catalogo: dopo il salvataggio e l\'errore sugli esperimenti', () => {
  it('torna all\'elenco con il catalogo già riletto: riaprendo subito la voce si parte dalla versione salvata', async () => {
    // Il catalogo "nel database": la rilettura dopo il salvataggio restituisce la voce nuova.
    let db = SEMI_CATALOGO
    vi.mocked(listaCatalogo).mockImplementation(async () => db)
    vi.mocked(salvaVoceCatalogo).mockImplementation(async v => { db = db.map(x => (x.id === v.id ? v : x)) })
    const { utente } = apri()
    await apriVoce(utente, 'SPAD')
    await utente.clear(screen.getByLabelText('Nome dello strumento'))
    await utente.type(screen.getByLabelText('Nome dello strumento'), 'SPAD 502')
    await salva(utente)

    // Subito, senza attese: la riga è già quella nuova.
    await screen.findByRole('list', { name: 'Catalogo strumenti' })
    await utente.click(rigaVoce('SPAD 502'))
    expect(await screen.findByLabelText('Nome dello strumento')).toHaveValue('SPAD 502')
  })

  it('l\'errore sugli esperimenti resta aprendo un\'altra voce o una voce nuova', async () => {
    vi.mocked(copieDiProprieta).mockResolvedValue([copiaCiras()])
    vi.mocked(applicaAggiornamento).mockRejectedValueOnce({ message: 'Failed to fetch' })
    const { utente } = apri()
    await apriVoce(utente, 'Ciras')
    await utente.click(casella())
    await utente.type(screen.getByLabelText('Nome dello strumento'), ' 2')
    await salva(utente)
    await screen.findByRole('alert')

    // L'editor non mostra l'avviso, ma tornando all'elenco c'è ancora, aprendo una voce come una voce nuova.
    await utente.click(rigaVoce('SPAD'))
    await screen.findByLabelText('Nome dello strumento')
    await utente.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Catalogo salvato, ma i tuoi esperimenti non sono stati aggiornati')
    await utente.click(screen.getByRole('button', { name: '+ Nuovo strumento' }))
    await utente.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Catalogo salvato, ma i tuoi esperimenti non sono stati aggiornati')

    // Il Riprova resta disponibile in elenco e lo risolve.
    await utente.click(await screen.findByRole('button', { name: 'Riprova' }))
    await waitFor(() => expect(applicaAggiornamento).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('salvare un\'altra voce senza casella non cancella l\'errore ancora da riprovare', async () => {
    vi.mocked(copieDiProprieta).mockResolvedValue([copiaCiras()])
    vi.mocked(applicaAggiornamento).mockRejectedValueOnce({ message: 'Failed to fetch' })
    const { utente } = apri()
    await apriVoce(utente, 'Ciras')
    await utente.click(casella())
    await utente.type(screen.getByLabelText('Nome dello strumento'), ' 2')
    await salva(utente)
    await screen.findByRole('alert')

    await utente.click(rigaVoce('SPAD'))
    await utente.type(await screen.findByLabelText('Nome dello strumento'), ' 2')
    await salva(utente)

    expect(await pronta()).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Catalogo salvato, ma i tuoi esperimenti non sono stati aggiornati')
  })
})

describe('Catalogo: archiviare', () => {
  it('chiede conferma con il testo del piano e poi archivia la voce', async () => {
    const { utente } = apri()
    await apriVoce(utente, 'Ciras')

    await utente.click(screen.getByRole('button', { name: 'Archivia dal catalogo' }))
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo).toHaveTextContent('Archiviare "Ciras"? Non comparirà più tra gli strumenti da aggiungere; gli esperimenti che lo usano non cambiano.')
    expect(archiviaVoceCatalogo).not.toHaveBeenCalled()

    await utente.click(within(dialogo).getByRole('button', { name: 'Archivia' }))

    await waitFor(() => expect(archiviaVoceCatalogo).toHaveBeenCalledWith(ciras.id))
    // Neutro: il segno verde è dei salvataggi.
    expect(toast.success).toHaveBeenCalledWith('Strumento archiviato.')
    expect(toastSalvato).not.toHaveBeenCalled()
    expect(await pronta()).toBeInTheDocument()
    expect(listaCatalogo).toHaveBeenCalledTimes(2)
  })

  it('"Annulla" nella conferma lascia tutto com\'è', async () => {
    const { utente } = apri()
    await apriVoce(utente, 'Ciras')

    await utente.click(screen.getByRole('button', { name: 'Archivia dal catalogo' }))
    await utente.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Annulla' }))

    expect(archiviaVoceCatalogo).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Nome dello strumento')).toBeInTheDocument()
  })

  it('se l\'archiviazione fallisce lo dice nell\'editor e la voce resta', async () => {
    vi.mocked(archiviaVoceCatalogo).mockRejectedValueOnce({ message: 'Failed to fetch' })
    const { utente } = apri()
    await apriVoce(utente, 'Ciras')

    await utente.click(screen.getByRole('button', { name: 'Archivia dal catalogo' }))
    await utente.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Archivia' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Il server non risponde')
    expect(screen.getByLabelText('Nome dello strumento')).toBeInTheDocument()
    expect(toastSalvato).not.toHaveBeenCalled()
  })
})

describe('Catalogo: modifiche non salvate', () => {
  it('con modifiche, la freccia indietro chiede se scartarle: "Continua a modificare" resta, "Scarta" esce', async () => {
    const { utente } = apri()
    await apriVoce(utente, 'SPAD')
    await utente.type(screen.getByLabelText('Nome dello strumento'), ' 2')

    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo).toHaveTextContent('Scartare le modifiche non salvate?')
    expect(screen.getByTestId('posizione')).toHaveTextContent('/catalogo')

    await utente.click(within(dialogo).getByRole('button', { name: 'Continua a modificare' }))
    expect(screen.getByTestId('posizione')).toHaveTextContent('/catalogo')
    expect(screen.getByLabelText('Nome dello strumento')).toHaveValue('SPAD 2')

    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    await utente.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Scarta' }))
    expect(screen.getByText('Altra pagina')).toBeInTheDocument()
  })

  it('senza modifiche la freccia indietro esce subito', async () => {
    const { utente } = apri()
    await apriVoce(utente, 'SPAD')

    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Altra pagina')).toBeInTheDocument()
  })

  it('"Annulla" nell\'editor torna all\'elenco; con modifiche chiede prima conferma', async () => {
    const { utente } = apri()
    await apriVoce(utente, 'SPAD')
    await utente.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(await pronta()).toBeInTheDocument()

    await utente.click(rigaVoce('SPAD'))
    await utente.type(await screen.findByLabelText('Nome dello strumento'), ' 2')
    await utente.click(screen.getByRole('button', { name: 'Annulla' }))
    const dialogo = await screen.findByRole('dialog')
    expect(screen.queryByRole('list', { name: 'Catalogo strumenti' })).not.toBeInTheDocument()
    await utente.click(within(dialogo).getByRole('button', { name: 'Scarta' }))
    expect(await pronta()).toBeInTheDocument()
    expect(salvaVoceCatalogo).not.toHaveBeenCalled()
  })
})
