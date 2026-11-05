import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
vi.mock('@/api/note', () => ({
  listaNote: vi.fn(), salvaNota: vi.fn(), eliminaNota: vi.fn(), segnaFatto: vi.fn(),
}))
vi.mock('@/api/foto', () => ({
  listaFoto: vi.fn(), urlFoto: vi.fn(), caricaFoto: vi.fn(), eliminaFoto: vi.fn(), aggiornaFoto: vi.fn(),
  VALIDITA_URL_SECONDI: 3600,
}))
vi.mock('@/lib/immagini', () => ({ dataDiScatto: vi.fn() }))
vi.mock('@/lib/toastSalvato', () => ({ toastSalvato: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(() => 'id-toast'), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }) }))

import { toast } from 'sonner'
import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { caricaConfig } from '@/api/esperimenti'
import { eliminaNota, listaNote, salvaNota, segnaFatto } from '@/api/note'
import { caricaFoto, listaFoto, urlFoto } from '@/api/foto'
import { dataDiScatto } from '@/lib/immagini'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import type { ConfigEsperimento, Foto, Nota } from '@/domain/tipi'
import { ATTESA_ANNULLA_MS } from '@/lib/eliminaConAnnulla'
import { formattaData, oggiLocale } from '@/lib/date'
import { scriviBozzaNota } from '@/components/note/bozzaNota'
import { spuntaPromemoriaConAnnulla } from '@/components/note/spuntaPromemoriaConAnnulla'
import { statoVuoto } from '@/components/note/statoNota'
import { toastSalvato } from '@/lib/toastSalvato'
import { Diario } from './Diario'

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session
const FUTURO = '2099-01-15'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

let config: ConfigEsperimento
/** Le note "nel database": le funzioni dell'API finta le leggono e le cambiano. */
let db: Nota[]
/** Le foto "nel database". */
let fotoDb: Foto[]

const idPianta = (etichetta: string) => config.piante.find(p => p.etichetta === etichetta)!.id
const idTrattamento = (etichetta: string) => config.trattamenti.find(t => t.etichetta === etichetta)!.id

const nota = (id: string, extra: Partial<Nota> = {}): Nota => ({
  id, data: '2026-10-28', testo: `Testo ${id}`, promemoria: false, fatto_il: null, pianta_ids: [], trattamento_ids: [], ...extra,
})

const fotoDi = (id: string, extra: Partial<Foto> = {}): Foto => ({
  id, data: '2026-10-27', percorso: `E/${id}.jpg`, larghezza: 1600, altezza: 1200, byte: 200000,
  pianta_id: null, nota_id: null, archiviata: false, archiviata_il: null, ...extra,
})

function Posizione() {
  const { pathname, state } = useLocation()
  return <><p data-testid="posizione">{pathname}</p><p data-testid="stato">{JSON.stringify(state)}</p></>
}

/** `stato`: lo stato di navigazione con cui si arriva al Diario (da Oggi o dalla scheda di una pianta). */
function apri(stato?: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const resa = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/esperimenti/E', { pathname: '/esperimenti/E/diario', state: stato ?? null }]} initialIndex={1}>
        <Routes>
          <Route path="/esperimenti/:espId/diario" element={<Diario />} />
          <Route path="*" element={<p>Schermata in campo</p>} />
        </Routes>
        <Posizione />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { client, resa, utente: userEvent.setup({ delay: null }) }
}

const elenco = () => screen.getByRole('list', { name: 'Note del diario' })
const righe = () => within(elenco()).getAllByRole('listitem')
/** La riga di una nota, trovata dal suo testo. */
const riga = (testo: string | RegExp) => righe().find(r => within(r).queryByText(testo))!
const nuovaNota = () => screen.findByRole('button', { name: '+ Nuova nota' })
const salva = () => screen.getByRole('button', { name: 'Salva' })

/** L'azione "Annulla" del toast di eliminazione mostrato per ultimo. */
function azioneAnnulla() {
  const [, opzioni] = vi.mocked(toast).mock.calls.at(-1) as unknown as [string, { action: { label: string; onClick: () => void } }]
  return opzioni.action
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  config = bozzaHydrochar(SEMI_CATALOGO)
  config.esperimento.id = 'E'
  db = []
  fotoDb = []
  vi.mocked(dataDiScatto).mockResolvedValue(null)
  vi.mocked(listaFoto).mockImplementation(async () => structuredClone(fotoDb))
  vi.mocked(urlFoto).mockImplementation(async percorsi => new Map(percorsi.map(p => [p, `https://storage/${p}`])))
  vi.mocked(caricaFoto).mockImplementation(async (_e, d) => {
    const nuova = fotoDi(d.id, { data: d.data, nota_id: d.notaId ?? null })
    fotoDb.unshift(nuova)
    return nuova
  })
  vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(caricaConfig).mockResolvedValue(config)
  vi.mocked(listaNote).mockImplementation(async () => structuredClone(db))
  vi.mocked(salvaNota).mockImplementation(async (_e, n) => {
    const i = db.findIndex(x => x.id === n.id)
    if (i >= 0) db[i] = { ...n, fatto_il: db[i].fatto_il }
    else db.unshift(n)
  })
  vi.mocked(eliminaNota).mockImplementation(async (_e, id) => { db = db.filter(n => n.id !== id) })
  vi.mocked(segnaFatto).mockImplementation(async (_e, id, fatto) => {
    db = db.map(n => (n.id === id ? { ...n, fatto_il: fatto ? new Date().toISOString() : null } : n))
  })
})

afterEach(() => { vi.useRealTimers() })

describe('Diario: l\'elenco', () => {
  it('ha il titolo "Diario" e la freccia indietro alla home dell\'esperimento', async () => {
    apri()
    expect(await screen.findByRole('heading', { level: 1, name: 'Diario' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/esperimenti/E')
  })

  it('senza note lo dice e spiega i promemoria', async () => {
    apri()
    expect(await screen.findByText('Nessuna nota.')).toBeInTheDocument()
    expect(screen.getByText(/promemoria/i)).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Note del diario' })).not.toBeInTheDocument()
  })

  it('mostra le note nell\'ordine dato (le più recenti prima), con data, testo e collegamento', async () => {
    db = [
      nota('a', { data: '2026-10-30', testo: 'Foglie gialle' }),
      nota('b', { data: '2026-10-28', testo: 'Irrigato', trattamento_ids: [idTrattamento('Controllo + HC')] }),
      nota('c', { data: '2026-10-20', testo: 'Pianta 3 stentata', pianta_ids: [idPianta('3')] }),
    ]
    apri()
    await screen.findByRole('list', { name: 'Note del diario' })
    expect(righe()).toHaveLength(3)
    expect(righe()[0]).toHaveTextContent('30/10/2026')
    expect(righe()[0]).toHaveTextContent('Foglie gialle')
    expect(righe()[0]).toHaveTextContent('Tutto l\'esperimento')
    expect(righe()[1]).toHaveTextContent('Controllo + HC')
    expect(righe()[2]).toHaveTextContent('Pianta 3')
  })

  it('un promemoria da fare porta la parola "Promemoria" e la spunta; uno fatto è barrato con "fatto il GG/MM"', async () => {
    db = [
      nota('a', { testo: 'Concimare', promemoria: true, data: FUTURO }),
      nota('b', { testo: 'Pesare i vasi', promemoria: true, data: '2026-10-25', fatto_il: '2026-10-31T10:00:00' }),
      nota('c', { testo: 'Solo una nota' }),
    ]
    apri()
    await screen.findByRole('list', { name: 'Note del diario' })
    expect(riga('Concimare')).toHaveTextContent('Promemoria')
    expect(within(riga('Concimare')).getByRole('button', { name: /^Segna fatto/ })).toBeInTheDocument()
    expect(riga('Pesare i vasi')).toHaveTextContent('fatto il 31/10')
    expect(within(riga('Pesare i vasi')).getByText('Pesare i vasi')).toHaveClass('line-through')
    expect(within(riga('Pesare i vasi')).getByRole('button', { name: /^Riapri/ })).toBeInTheDocument()
    expect(within(riga('Solo una nota')).queryByRole('button', { name: /fatto|Riapri/i })).not.toBeInTheDocument()
    expect(riga('Solo una nota')).not.toHaveTextContent('Promemoria')
  })

  it('toccando la riga si apre (il testo non è più troncato) e compaiono Modifica ed Elimina', async () => {
    db = [nota('a', { testo: 'Un testo lungo' })]
    const { utente } = apri()
    const toggle = await screen.findByRole('button', { name: /Un testo lungo/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(within(riga('Un testo lungo')).getByText('Un testo lungo')).toHaveClass('line-clamp-3')
    expect(within(riga('Un testo lungo')).queryByRole('button', { name: 'Modifica' })).not.toBeInTheDocument()
    await utente.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(within(riga('Un testo lungo')).getByText('Un testo lungo')).not.toHaveClass('line-clamp-3')
    expect(within(riga('Un testo lungo')).getByRole('button', { name: 'Modifica' })).toBeInTheDocument()
    expect(within(riga('Un testo lungo')).getByRole('button', { name: 'Elimina' })).toBeInTheDocument()
    await utente.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('se le note non arrivano lo dice e si può riprovare', async () => {
    vi.mocked(listaNote).mockRejectedValueOnce(new Error('rete'))
    const { utente } = apri()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await utente.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(await screen.findByText('Nessuna nota.')).toBeInTheDocument()
  })
})

describe('Diario: nuova nota', () => {
  it('"+ Nuova nota" apre l\'editor con la data di oggi e il pulsante Salva spento finché non c\'è testo', async () => {
    const { utente } = apri()
    await utente.click(await nuovaNota())
    expect(screen.getByRole('heading', { level: 1, name: 'Nuova nota' })).toBeInTheDocument()
    expect(screen.getByLabelText('Data')).toHaveValue(oggiLocale())
    expect(salva()).toBeDisabled()
    await utente.type(screen.getByLabelText('Nota'), 'Foglie gialle')
    expect(salva()).toBeEnabled()
  })

  it('salva con un id nuovo (uuid), di oggi, per tutto l\'esperimento, e torna all\'elenco con il toast "salvato"', async () => {
    const { utente } = apri()
    await utente.click(await nuovaNota())
    await utente.type(screen.getByLabelText('Nota'), '  Foglie gialle ')
    await utente.click(salva())

    await waitFor(() => expect(salvaNota).toHaveBeenCalledTimes(1))
    const [esp, salvata] = vi.mocked(salvaNota).mock.calls[0]
    expect(esp).toBe('E')
    expect(salvata.id).toMatch(UUID)
    expect(salvata).toMatchObject({
      data: oggiLocale(), testo: 'Foglie gialle', promemoria: false, fatto_il: null, pianta_ids: [], trattamento_ids: [],
    })
    expect(toastSalvato).toHaveBeenCalledWith('Nota salvata.')
    // l'elenco è riletto e mostra la nota
    expect(await screen.findByRole('list', { name: 'Note del diario' })).toBeInTheDocument()
    expect(riga('Foglie gialle')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Diario' })).toBeInTheDocument()
    expect(localStorage.length).toBe(0)
  })

  it('un doppio tocco su Salva salva una volta sola', async () => {
    let finisci!: () => void
    vi.mocked(salvaNota).mockImplementationOnce(() => new Promise<void>(ok => { finisci = ok }))
    const { utente } = apri()
    await utente.click(await nuovaNota())
    await utente.type(screen.getByLabelText('Nota'), 'Una nota')
    const pulsante = salva()
    fireEvent.click(pulsante)
    fireEvent.click(pulsante)
    expect(salvaNota).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Salvataggio…' })).toBeDisabled()
    await act(async () => finisci())
  })

  it('con una data futura la casella "Ricordamelo quel giorno" si spunta da sola e la nota si salva come promemoria', async () => {
    const { utente } = apri()
    await utente.click(await nuovaNota())
    await utente.type(screen.getByLabelText('Nota'), 'Concimare')
    const casella = screen.getByRole('checkbox', { name: 'Ricordamelo quel giorno' })
    expect(casella).not.toBeChecked()
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: FUTURO } })
    expect(casella).toBeChecked()
    await utente.click(salva())
    await waitFor(() => expect(salvaNota).toHaveBeenCalled())
    expect(vi.mocked(salvaNota).mock.calls[0][1]).toMatchObject({ data: FUTURO, promemoria: true })
  })

  it('la casella si può togliere a mano e allora la data non la rimette; tornando a oggi la casella spuntata da sola si toglie', async () => {
    const { utente } = apri()
    await utente.click(await nuovaNota())
    await utente.type(screen.getByLabelText('Nota'), 'Concimare')
    const casella = screen.getByRole('checkbox', { name: 'Ricordamelo quel giorno' })
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: FUTURO } })
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: oggiLocale() } })
    expect(casella).not.toBeChecked()

    fireEvent.change(screen.getByLabelText('Data'), { target: { value: FUTURO } })
    await utente.click(casella)
    expect(casella).not.toBeChecked()
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2099-02-01' } })
    expect(casella).not.toBeChecked()
    await utente.click(salva())
    await waitFor(() => expect(salvaNota).toHaveBeenCalled())
    expect(vi.mocked(salvaNota).mock.calls[0][1]).toMatchObject({ data: '2099-02-01', promemoria: false })
  })

  it('anche una nota di oggi si può segnare come promemoria con la casella', async () => {
    const { utente } = apri()
    await utente.click(await nuovaNota())
    await utente.type(screen.getByLabelText('Nota'), 'Da ricordare')
    await utente.click(screen.getByRole('checkbox', { name: 'Ricordamelo quel giorno' }))
    await utente.click(salva())
    await waitFor(() => expect(salvaNota).toHaveBeenCalled())
    expect(vi.mocked(salvaNota).mock.calls[0][1].promemoria).toBe(true)
  })

  it('senza la data il salvataggio resta fermo e lo dice', async () => {
    const { utente } = apri()
    await utente.click(await nuovaNota())
    await utente.type(screen.getByLabelText('Nota'), 'Una nota')
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '' } })
    expect(salva()).toBeDisabled()
    expect(screen.getByText('Scegli la data.')).toBeInTheDocument()
  })
})

describe('Diario: il collegamento', () => {
  async function conTesto() {
    const resa = apri()
    await resa.utente.click(await nuovaNota())
    await resa.utente.type(screen.getByLabelText('Nota'), 'Una nota')
    return resa
  }
  const scelta = (nome: string) => screen.getByRole('radio', { name: nome })

  it('di base è tutto l\'esperimento; la scelta è una sola tra Esperimento, Trattamenti e Piante', async () => {
    await conTesto()
    const gruppo = screen.getByRole('radiogroup', { name: 'Collegata a' })
    expect(within(gruppo).getAllByRole('radio').map(r => r.textContent)).toEqual(['Esperimento', 'Trattamenti', 'Piante'])
    expect(scelta('Esperimento')).toBeChecked()
    expect(scelta('Trattamenti')).not.toBeChecked()
    expect(screen.queryByRole('checkbox', { name: /^Controllo/ })).not.toBeInTheDocument()
  })

  it('le frecce spostano la scelta e il focus; in tabulazione entra solo la scelta attiva', async () => {
    const { utente } = await conTesto()
    expect(scelta('Esperimento')).toHaveAttribute('tabindex', '0')
    expect(scelta('Piante')).toHaveAttribute('tabindex', '-1')
    scelta('Esperimento').focus()
    await utente.keyboard('{ArrowRight}')
    expect(scelta('Trattamenti')).toBeChecked()
    expect(scelta('Trattamenti')).toHaveFocus()
    await utente.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(scelta('Piante')).toBeChecked()
  })

  it('con Trattamenti si scelgono uno o più trattamenti; senza nessuno non si salva', async () => {
    const { utente } = await conTesto()
    await utente.click(scelta('Trattamenti'))
    expect(salva()).toBeDisabled()
    expect(screen.getByText('Scegli almeno un trattamento.')).toBeInTheDocument()
    await utente.click(screen.getByRole('checkbox', { name: /^Controllo \+ HC/ }))
    await utente.click(screen.getByRole('checkbox', { name: /^Controllo\b(?! \+)/ }))
    await utente.click(salva())
    await waitFor(() => expect(salvaNota).toHaveBeenCalled())
    const salvata = vi.mocked(salvaNota).mock.calls[0][1]
    expect([...salvata.trattamento_ids].sort()).toEqual([idTrattamento('Controllo'), idTrattamento('Controllo + HC')].sort())
    expect(salvata.pianta_ids).toEqual([])
  })

  it('con Piante si cerca e si scelgono le piante; le scelte restano cambiando ricerca e si salvano solo quelle', async () => {
    const { utente } = await conTesto()
    await utente.click(scelta('Piante'))
    expect(salva()).toBeDisabled()
    expect(screen.getByText('Scegli almeno una pianta.')).toBeInTheDocument()

    await utente.type(screen.getByRole('searchbox', { name: 'Cerca pianta' }), '3')
    await utente.click(await screen.findByRole('checkbox', { name: '3' }))
    await utente.clear(screen.getByRole('searchbox', { name: 'Cerca pianta' }))
    await utente.type(screen.getByRole('searchbox', { name: 'Cerca pianta' }), '12')
    await utente.click(await screen.findByRole('checkbox', { name: '12' }))
    expect(screen.getByText(/Piante scelte/)).toHaveTextContent('3, 12')
    await utente.click(salva())
    await waitFor(() => expect(salvaNota).toHaveBeenCalled())
    const salvata = vi.mocked(salvaNota).mock.calls[0][1]
    expect([...salvata.pianta_ids].sort()).toEqual([idPianta('3'), idPianta('12')].sort())
    expect(salvata.trattamento_ids).toEqual([])
  })

  it('cambiare scelta non porta con sé i collegamenti dell\'altra: si salva solo quella attiva', async () => {
    const { utente } = await conTesto()
    await utente.click(scelta('Trattamenti'))
    await utente.click(screen.getByRole('checkbox', { name: /^Controllo \+ HC/ }))
    await utente.click(scelta('Esperimento'))
    await utente.click(salva())
    await waitFor(() => expect(salvaNota).toHaveBeenCalled())
    expect(vi.mocked(salvaNota).mock.calls[0][1]).toMatchObject({ trattamento_ids: [], pianta_ids: [] })
  })
})

describe('Diario: modificare una nota', () => {
  it('Modifica apre l\'editor con i valori della nota; salvando riusa lo stesso id e dice "aggiornata"', async () => {
    db = [nota('a', { testo: 'Foglie gialle', pianta_ids: [idPianta('3')] })]
    const { utente } = apri()
    await utente.click(await screen.findByRole('button', { name: /Foglie gialle/ }))
    await utente.click(within(riga('Foglie gialle')).getByRole('button', { name: 'Modifica' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Modifica nota' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nota')).toHaveValue('Foglie gialle')
    expect(screen.getByRole('radio', { name: 'Piante' })).toBeChecked()
    expect(screen.getByText(/Piante scelte/)).toHaveTextContent('3')
    expect(salva()).toBeDisabled()

    await utente.type(screen.getByLabelText('Nota'), ' e secche')
    await utente.click(salva())
    await waitFor(() => expect(salvaNota).toHaveBeenCalled())
    expect(vi.mocked(salvaNota).mock.calls[0][1]).toMatchObject({ id: 'a', testo: 'Foglie gialle e secche', pianta_ids: [idPianta('3')] })
    expect(toastSalvato).toHaveBeenCalledWith('Nota aggiornata.')
    expect(await screen.findByText('Foglie gialle e secche')).toBeInTheDocument()
  })

  it('spostare in avanti la data di un promemoria già fatto lo riapre, prima di salvare la nota', async () => {
    db = [nota('a', { testo: 'Pesare', promemoria: true, data: '2026-10-25', fatto_il: '2026-10-31T10:00:00' })]
    const { utente } = apri()
    await utente.click(await screen.findByRole('button', { name: /Pesare/ }))
    await utente.click(within(riga('Pesare')).getByRole('button', { name: 'Modifica' }))
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: FUTURO } })
    await utente.click(salva())
    await waitFor(() => expect(salvaNota).toHaveBeenCalled())
    expect(segnaFatto).toHaveBeenCalledWith('E', 'a', false)
    expect(vi.mocked(segnaFatto).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(salvaNota).mock.invocationCallOrder[0])
  })

  it('con la spunta da Oggi ancora in attesa, spostare la data non riapre niente: errore chiaro, bozza e nota restano', async () => {
    db = [nota('a', { testo: 'Pesare', promemoria: true, data: '2026-10-25', fatto_il: null })]
    const { utente, client } = apri()
    await screen.findByRole('button', { name: /Pesare/ })
    // La spunta di Oggi: la nota risulta fatta in cache, il salvataggio vero parte tra 5 secondi.
    act(() => spuntaPromemoriaConAnnulla(client, 'E', db[0]))
    await utente.click(await screen.findByRole('button', { name: /Pesare/ }))
    await utente.click(within(riga('Pesare')).getByRole('button', { name: 'Modifica' }))
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: FUTURO } })
    await utente.click(salva())

    expect(await screen.findByRole('alert')).toHaveTextContent('Il promemoria è appena stato segnato fatto')
    expect(segnaFatto).not.toHaveBeenCalled()
    expect(salvaNota).not.toHaveBeenCalled()
    // L'editor e la data scritta restano: si riprova dopo l'Annulla o quando il salvataggio è finito.
    expect(screen.getByLabelText('Data')).toHaveValue(FUTURO)

    // Annulla il toast: niente salvataggio in ritardo che sporchi gli altri test.
    const [, opzioni] = vi.mocked(toast).mock.calls.at(-1) as unknown as [string, { action: { onClick: () => void } }]
    act(() => opzioni.action.onClick())
  })

  it('cambiare il testo di un promemoria fatto, senza toccare la data, non toglie la spunta', async () => {
    db = [nota('a', { testo: 'Pesare', promemoria: true, data: '2026-10-25', fatto_il: '2026-10-31T10:00:00' })]
    const { utente } = apri()
    await utente.click(await screen.findByRole('button', { name: /Pesare/ }))
    await utente.click(within(riga('Pesare')).getByRole('button', { name: 'Modifica' }))
    await utente.type(screen.getByLabelText('Nota'), ' i vasi')
    await utente.click(salva())
    await waitFor(() => expect(salvaNota).toHaveBeenCalled())
    expect(segnaFatto).not.toHaveBeenCalled()
  })
})

describe('Diario: la spunta', () => {
  it('"Segna fatto" salva la spunta e la riga si barra con "fatto il"; "Riapri" la toglie', async () => {
    db = [nota('a', { testo: 'Concimare', promemoria: true, data: '2026-10-28' })]
    const { utente } = apri()
    await utente.click(await screen.findByRole('button', { name: /^Segna fatto/ }))
    expect(segnaFatto).toHaveBeenCalledWith('E', 'a', true)
    await waitFor(() => expect(riga('Concimare')).toHaveTextContent(/fatto il \d\d\/\d\d/))
    expect(within(riga('Concimare')).getByText('Concimare')).toHaveClass('line-through')

    await utente.click(within(riga('Concimare')).getByRole('button', { name: /^Riapri/ }))
    expect(segnaFatto).toHaveBeenLastCalledWith('E', 'a', false)
    await waitFor(() => expect(riga('Concimare')).not.toHaveTextContent('fatto il'))
    expect(within(riga('Concimare')).getByText('Concimare')).not.toHaveClass('line-through')
  })

  it('se il salvataggio della spunta fallisce, la riga torna com\'era e c\'è un errore', async () => {
    db = [nota('a', { testo: 'Concimare', promemoria: true })]
    vi.mocked(segnaFatto).mockRejectedValueOnce(new Error('rete'))
    const { utente } = apri()
    await utente.click(await screen.findByRole('button', { name: /^Segna fatto/ }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ duration: Infinity })))
    expect(riga('Concimare')).not.toHaveTextContent('fatto il')
    expect(within(riga('Concimare')).getByRole('button', { name: /^Segna fatto/ })).toBeInTheDocument()
  })
})

describe('Diario: elimina con Annulla', () => {
  // Lo stato "in attesa" è del modulo, non della pagina: ogni test lo lascia vuoto facendo scadere ciò che ha sospeso.
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(async () => { await act(() => vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS * 2)) })

  it('la nota sparisce subito, compare il toast "Nota eliminata." con Annulla e nulla è ancora cancellato', async () => {
    db = [nota('a', { testo: 'Da togliere' }), nota('b', { testo: 'Da tenere' })]
    const { utente } = apri()
    await utente.click(await screen.findByRole('button', { name: /Da togliere/ }))
    await utente.click(within(riga('Da togliere')).getByRole('button', { name: 'Elimina' }))
    expect(screen.queryByText('Da togliere')).not.toBeInTheDocument()
    expect(screen.getByText('Da tenere')).toBeInTheDocument()
    expect(toast).toHaveBeenCalledWith('Nota eliminata.', expect.objectContaining({ duration: ATTESA_ANNULLA_MS }))
    expect(azioneAnnulla().label).toBe('Annulla')
    expect(eliminaNota).not.toHaveBeenCalled()
    // un'eliminazione non è un salvataggio: toast neutro
    expect(toastSalvato).not.toHaveBeenCalled()
  })

  it('"Annulla" rimette la nota al suo posto e non cancella mai nulla', async () => {
    db = [nota('a', { testo: 'Prima' }), nota('b', { testo: 'Da togliere' }), nota('c', { testo: 'Ultima' })]
    const { utente } = apri()
    await utente.click(await screen.findByRole('button', { name: /Da togliere/ }))
    await utente.click(within(riga('Da togliere')).getByRole('button', { name: 'Elimina' }))
    expect(screen.queryByText('Da togliere')).not.toBeInTheDocument()

    act(() => azioneAnnulla().onClick())
    await waitFor(() => expect(righe()).toHaveLength(3))
    expect(righe().map(r => r.textContent)).toEqual([
      expect.stringContaining('Prima'), expect.stringContaining('Da togliere'), expect.stringContaining('Ultima'),
    ])
    await act(() => vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS * 2))
    expect(eliminaNota).not.toHaveBeenCalled()
    expect(db).toHaveLength(3)
  })

  it('dopo 5 secondi elimina davvero e la nota resta fuori dall\'elenco', async () => {
    db = [nota('a', { testo: 'Da togliere' }), nota('b', { testo: 'Da tenere' })]
    const { utente } = apri()
    await utente.click(await screen.findByRole('button', { name: /Da togliere/ }))
    await utente.click(within(riga('Da togliere')).getByRole('button', { name: 'Elimina' }))

    await act(() => vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS - 100))
    expect(eliminaNota).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(eliminaNota).toHaveBeenCalledWith('E', 'a')
    expect(screen.queryByText('Da togliere')).not.toBeInTheDocument()
    expect(riga('Da tenere')).toBeInTheDocument()
    expect(db.map(n => n.id)).toEqual(['b'])
  })

  it('se l\'eliminazione vera fallisce la nota ricompare con un errore', async () => {
    db = [nota('a', { testo: 'Da togliere' })]
    vi.mocked(eliminaNota).mockRejectedValueOnce(new Error('rete'))
    const { utente } = apri()
    await utente.click(await screen.findByRole('button', { name: /Da togliere/ }))
    await utente.click(within(riga('Da togliere')).getByRole('button', { name: 'Elimina' }))
    await act(() => vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS))
    expect(eliminaNota).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Da togliere')).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('La nota non è stata eliminata'), expect.anything())
    expect(db).toHaveLength(1)
  })

  it('lasciando la pagina prima dei 5 secondi, l\'eliminazione avviene comunque', async () => {
    db = [nota('a', { testo: 'Da togliere' })]
    const { resa, utente } = apri()
    await utente.click(await screen.findByRole('button', { name: /Da togliere/ }))
    await utente.click(within(riga('Da togliere')).getByRole('button', { name: 'Elimina' }))
    resa.unmount()
    expect(eliminaNota).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS))
    expect(eliminaNota).toHaveBeenCalledWith('E', 'a')
    expect(db).toHaveLength(0)
  })

  it('salvando un\'altra nota nei 5 secondi la nota in eliminazione non riappare', async () => {
    db = [nota('a', { testo: 'Da togliere' })]
    const { utente } = apri()
    await utente.click(await screen.findByRole('button', { name: /Da togliere/ }))
    await utente.click(within(riga('Da togliere')).getByRole('button', { name: 'Elimina' }))
    await utente.click(await nuovaNota())
    await utente.type(screen.getByLabelText('Nota'), 'Un\'altra')
    await utente.click(salva())
    expect(await screen.findByText('Un\'altra')).toBeInTheDocument()
    expect(screen.queryByText('Da togliere')).not.toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS))
    expect(eliminaNota).toHaveBeenCalledWith('E', 'a')
  })
})

describe('Diario: errori e bozza', () => {
  it('un errore di rete nel salvataggio lascia la bozza e l\'editor com\'è; riprovando si salva con lo stesso id', async () => {
    vi.mocked(salvaNota).mockRejectedValueOnce(new Error('Failed to fetch'))
    const { utente } = apri()
    await utente.click(await nuovaNota())
    await utente.type(screen.getByLabelText('Nota'), 'Non perdere questo')
    await utente.click(salva())
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText('Nota')).toHaveValue('Non perdere questo')
    expect(toastSalvato).not.toHaveBeenCalled()
    const chiaviBozza = Object.keys(localStorage).filter(k => k.startsWith('fastlab-bozza:nota:E:'))
    expect(chiaviBozza).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(chiaviBozza[0])!).stato.testo).toBe('Non perdere questo')

    await utente.click(salva())
    await waitFor(() => expect(salvaNota).toHaveBeenCalledTimes(2))
    expect(vi.mocked(salvaNota).mock.calls[1][1].id).toBe(vi.mocked(salvaNota).mock.calls[0][1].id)
    expect(toastSalvato).toHaveBeenCalledWith('Nota salvata.')
    expect(Object.keys(localStorage).filter(k => k.startsWith('fastlab-bozza:nota:E:'))).toHaveLength(0)
  })

  it('scrivendo, la bozza si aggiorna nel localStorage con la chiave fastlab-bozza:nota:<espId>:<id>', async () => {
    const { utente } = apri()
    await utente.click(await nuovaNota())
    await utente.type(screen.getByLabelText('Nota'), 'Ciao')
    const chiavi = Object.keys(localStorage).filter(k => k.startsWith('fastlab-bozza:nota:E:'))
    expect(chiavi).toHaveLength(1)
    expect(chiavi[0]).toMatch(/^fastlab-bozza:nota:E:[0-9a-f-]{36}$/)
  })

  it('riaprendo la pagina dopo un\'uscita senza passare dall\'app, la nota a metà torna com\'era', async () => {
    const prima = apri()
    await prima.utente.click(await nuovaNota())
    await prima.utente.type(screen.getByLabelText('Nota'), 'A metà')
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: FUTURO } })
    prima.resa.unmount()

    apri()
    expect(await screen.findByRole('heading', { level: 1, name: 'Nuova nota' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nota')).toHaveValue('A metà')
    expect(screen.getByLabelText('Data')).toHaveValue(FUTURO)
    expect(screen.getByRole('checkbox', { name: 'Ricordamelo quel giorno' })).toBeChecked()
    expect(screen.getByText(/Bozza ripresa/)).toBeInTheDocument()
    // ha qualcosa da salvare anche senza altre modifiche
    expect(salva()).toBeEnabled()
  })

  it('la modifica di una nota esistente, interrotta, si riprende; se la nota nel frattempo è sparita si salva come nuova', async () => {
    db = [nota('a', { testo: 'Originale' })]
    const prima = apri()
    await prima.utente.click(await screen.findByRole('button', { name: /Originale/ }))
    await prima.utente.click(within(riga('Originale')).getByRole('button', { name: 'Modifica' }))
    await prima.utente.type(screen.getByLabelText('Nota'), ' ritoccata')
    prima.resa.unmount()

    db = []
    apri()
    expect(await screen.findByRole('heading', { level: 1, name: 'Nuova nota' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nota')).toHaveValue('Originale ritoccata')
    await userEvent.click(salva())
    await waitFor(() => expect(salvaNota).toHaveBeenCalled())
    expect(vi.mocked(salvaNota).mock.calls[0][1].id).toBe('a')
  })

  it('una bozza con piante che non esistono più le lascia fuori', async () => {
    const prima = apri()
    await prima.utente.click(await nuovaNota())
    await prima.utente.type(screen.getByLabelText('Nota'), 'Con piante')
    await prima.utente.click(screen.getByRole('radio', { name: 'Piante' }))
    await prima.utente.type(screen.getByRole('searchbox', { name: 'Cerca pianta' }), '3')
    await prima.utente.click(await screen.findByRole('checkbox', { name: '3' }))
    prima.resa.unmount()
    const chiave = Object.keys(localStorage).find(k => /^fastlab-bozza:nota:E:/.test(k))!
    const b = JSON.parse(localStorage.getItem(chiave)!)
    b.stato.pianta_ids.push('pianta-che-non-c-e')
    localStorage.setItem(chiave, JSON.stringify(b))

    apri()
    await screen.findByLabelText('Nota')
    await userEvent.click(salva())
    await waitFor(() => expect(salvaNota).toHaveBeenCalled())
    expect(vi.mocked(salvaNota).mock.calls[0][1].pianta_ids).toEqual([idPianta('3')])
  })
})

describe('Diario: uscire mentre si salva', () => {
  it('con il salvataggio in viaggio la freccia indietro non esce e non chiede di scartare; la bozza resta', async () => {
    let finisci!: () => void
    vi.mocked(salvaNota).mockImplementationOnce(() => new Promise<void>(ok => { finisci = ok }))
    const { utente } = apri()
    await utente.click(await nuovaNota())
    await utente.type(screen.getByLabelText('Nota'), 'Non perdere');
    fireEvent.click(salva())
    await screen.findByRole('button', { name: 'Salvataggio…' })

    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('posizione')).toHaveTextContent('/esperimenti/E/diario')
    expect(Object.keys(localStorage).filter(k => k.startsWith('fastlab-bozza:nota:E:'))).toHaveLength(1)
    await act(async () => finisci())
  })

  it('se il salvataggio fallisce dopo che la pagina non c\'è più, la bozza torna e un toast che resta lo dice', async () => {
    let fallisci!: (e: Error) => void
    vi.mocked(salvaNota).mockImplementationOnce(() => new Promise<void>((_ok, ko) => { fallisci = ko }))
    const { utente, resa } = apri()
    await utente.click(await nuovaNota())
    await utente.type(screen.getByLabelText('Nota'), 'Non perdere')
    fireEvent.click(salva())
    await screen.findByRole('button', { name: 'Salvataggio…' })
    // l'uscita senza passare dall'app toglie la bozza? No: qui si simula il caso peggiore, bozza già tolta
    localStorage.clear()
    resa.unmount()

    await act(async () => fallisci(new Error('Failed to fetch')))
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Riapri il Diario'), expect.objectContaining({ duration: Infinity }),
    )
    const chiave = Object.keys(localStorage).find(k => /^fastlab-bozza:nota:E:/.test(k))
    expect(chiave).toBeDefined()
    expect(JSON.parse(localStorage.getItem(chiave!)!).stato.testo).toBe('Non perdere')

    // riaprendo il Diario la nota è lì
    apri()
    expect(await screen.findByLabelText('Nota')).toHaveValue('Non perdere')
  })
})

describe('Diario: la mezzanotte', () => {
  const MEZZANOTTE = () => new Date(2026, 10, 1, 23, 59, 0)

  it('la casella spuntata da sola per "domani" si toglie quando arriva domani, e si salva ciò che mostra', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: MEZZANOTTE() })
    const { utente } = apri()
    await utente.click(await nuovaNota())
    await utente.type(screen.getByLabelText('Nota'), 'Concimare')
    const casella = screen.getByRole('checkbox', { name: 'Ricordamelo quel giorno' })
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-11-02' } })
    expect(casella).toBeChecked()

    await act(() => vi.advanceTimersByTimeAsync(2 * 60_000))
    expect(oggiLocale()).toBe('2026-11-02')
    await waitFor(() => expect(casella).not.toBeChecked())
    await utente.click(salva())
    await waitFor(() => expect(salvaNota).toHaveBeenCalled())
    expect(vi.mocked(salvaNota).mock.calls[0][1]).toMatchObject({ data: '2026-11-02', promemoria: false })
  })

  it('la casella toccata a mano resta com\'è a mezzanotte', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: MEZZANOTTE() })
    const { utente } = apri()
    await utente.click(await nuovaNota())
    await utente.type(screen.getByLabelText('Nota'), 'Concimare')
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-11-02' } })
    const casella = screen.getByRole('checkbox', { name: 'Ricordamelo quel giorno' })
    await utente.click(casella)
    await utente.click(casella)
    expect(casella).toBeChecked()
    await act(() => vi.advanceTimersByTimeAsync(2 * 60_000))
    expect(casella).toBeChecked()
  })

  it('riprendendo il giorno dopo una bozza di ieri, la casella mostra ciò che si salva oggi', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date(2026, 10, 2, 8, 0, 0) })
    scriviBozzaNota('E', {
      id: 'n1', esistente: false,
      stato: { ...statoVuoto('2026-11-01'), testo: 'Di ieri', data: '2026-11-02', promemoria: true },
    })
    apri()
    expect(await screen.findByLabelText('Nota')).toHaveValue('Di ieri')
    expect(screen.getByRole('checkbox', { name: 'Ricordamelo quel giorno' })).not.toBeChecked()
    await userEvent.click(salva())
    await waitFor(() => expect(salvaNota).toHaveBeenCalled())
    expect(vi.mocked(salvaNota).mock.calls[0][1]).toMatchObject({ data: '2026-11-02', promemoria: false })
  })
})

describe('Diario: uscire con modifiche', () => {
  it('senza modifiche la freccia indietro esce subito; l\'editor si chiude senza domande', async () => {
    const { utente } = apri()
    await utente.click(await nuovaNota())
    await utente.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Diario' })).toBeInTheDocument()
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('posizione')).toHaveTextContent('/esperimenti/E')
  })

  it('con modifiche, la freccia indietro chiede se scartare; "Continua a modificare" lascia tutto com\'è', async () => {
    const { utente } = apri()
    await utente.click(await nuovaNota())
    await utente.type(screen.getByLabelText('Nota'), 'Qualcosa')
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo).toHaveTextContent('Scartare le modifiche non salvate?')
    await utente.click(within(dialogo).getByRole('button', { name: 'Continua a modificare' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nota')).toHaveValue('Qualcosa')
    expect(screen.getByTestId('posizione')).toHaveTextContent('/esperimenti/E/diario')
  })

  it('"Scarta" esce e cancella la bozza', async () => {
    const { utente } = apri()
    await utente.click(await nuovaNota())
    await utente.type(screen.getByLabelText('Nota'), 'Qualcosa')
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    await utente.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Scarta' }))
    expect(screen.getByTestId('posizione')).toHaveTextContent('/esperimenti/E')
    expect(screen.getByTestId('posizione')).not.toHaveTextContent('diario')
    expect(localStorage.length).toBe(0)
  })

  it('"Annulla" nell\'editor con modifiche chiede conferma; scartando torna all\'elenco e la bozza va via', async () => {
    const { utente } = apri()
    await utente.click(await nuovaNota())
    await utente.type(screen.getByLabelText('Nota'), 'Qualcosa')
    await utente.click(screen.getByRole('button', { name: 'Annulla' }))
    await utente.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Scarta' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Diario' })).toBeInTheDocument()
    expect(localStorage.length).toBe(0)
  })

  it('il browser chiede conferma prima di chiudere la scheda solo se c\'è una nota non salvata', async () => {
    const { utente } = apri()
    await utente.click(await nuovaNota())
    const pulita = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(pulita)
    expect(pulita.defaultPrevented).toBe(false)
    await utente.type(screen.getByLabelText('Nota'), 'Qualcosa')
    const sporca = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(sporca)
    expect(sporca.defaultPrevented).toBe(true)
  })
})

describe('Diario: le foto della nota', () => {
  const scegliFile = (nome = 'a.jpg') => fireEvent.change(
    document.querySelector('input[type="file"][capture]')!, { target: { files: [new File(['x'], nome, { type: 'image/jpeg' })] } },
  )
  const sezione = () => screen.getByRole('region', { name: 'Foto' })

  async function apriModifica(testo = 'Da correggere') {
    const r = apri()
    await r.utente.click(await screen.findByRole('button', { name: new RegExp(testo) }))
    await r.utente.click(within(riga(testo)).getByRole('button', { name: 'Modifica' }))
    return r
  }

  it('una nota nuova non ha ancora dove collegare le foto: dice di salvarla prima', async () => {
    const { utente } = apri()
    await utente.click(await nuovaNota())
    expect(within(sezione()).getByText(/Salva la nota/)).toBeInTheDocument()
    expect(within(sezione()).queryByRole('button', { name: 'Aggiungi foto' })).not.toBeInTheDocument()
  })

  it('una nota salvata mostra le sue miniature e non quelle delle altre', async () => {
    db = [nota('a', { testo: 'Da correggere' }), nota('b')]
    fotoDb = [fotoDi('f1', { nota_id: 'a' }), fotoDi('f2', { nota_id: 'b' }), fotoDi('f3')]
    await apriModifica()
    const miniature = await within(sezione()).findAllByRole('button', { name: /^Foto del / })
    expect(miniature).toHaveLength(1)
    await waitFor(() => expect(urlFoto).toHaveBeenCalledWith(['E/f1.jpg']))
  })

  it('«Aggiungi foto» carica le foto collegate alla nota, e non fa risultare la nota modificata', async () => {
    db = [nota('a', { testo: 'Da correggere' })]
    const { utente } = await apriModifica()
    await utente.click(within(sezione()).getByRole('button', { name: 'Aggiungi foto' }))
    scegliFile()

    await waitFor(() => expect(caricaFoto).toHaveBeenCalledTimes(1))
    expect(vi.mocked(caricaFoto).mock.calls[0][1]).toMatchObject({ notaId: 'a', piantaId: null })
    expect(await within(sezione()).findByRole('button', { name: `Foto del ${formattaData(oggiLocale())}` })).toBeInTheDocument()
    // La nota resta com\'era: nessuna bozza, e «Annulla» esce senza chiedere di scartare.
    expect(localStorage.length).toBe(0)
    await utente.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('con la nota modificata e non salvata, aggiungere una foto non tocca il testo scritto né la bozza', async () => {
    db = [nota('a', { testo: 'Da correggere' })]
    const { utente } = await apriModifica()
    await utente.type(screen.getByLabelText('Nota'), ' ancora')
    const bozza = Object.keys(localStorage).map(k => localStorage.getItem(k))

    scegliFile()

    await waitFor(() => expect(caricaFoto).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(toastSalvato).toHaveBeenCalledWith('Foto salvata.'))
    expect(screen.getByLabelText('Nota')).toHaveValue('Da correggere ancora')
    expect(Object.keys(localStorage).map(k => localStorage.getItem(k))).toEqual(bozza)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  describe('una foto in eliminazione', () => {
    beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
    afterEach(async () => { await act(() => vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS * 2)) })

    it('non riappare nella nota se l\'elenco viene riletto dal server nei 5 secondi', async () => {
      db = [nota('a', { testo: 'Da correggere' })]
      fotoDb = [fotoDi('nota-f1', { nota_id: 'a' }), fotoDi('nota-f2', { nota_id: 'a', data: '2026-10-20' })]
      const { utente, client } = await apriModifica()
      const miniature = await within(sezione()).findAllByRole('button', { name: /^Foto del / })
      expect(miniature).toHaveLength(2)

      await utente.click(miniature[0])
      await utente.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Elimina foto' }))
      await utente.keyboard('{Escape}')
      expect(within(sezione()).getAllByRole('button', { name: /^Foto del / })).toHaveLength(1)

      // Il server ha ancora le due foto. Si aspetta che la rilettura sia nella cache e che la pagina si sia ridisegnata.
      await act(async () => { await client.invalidateQueries({ queryKey: ['foto', 'E'] }) })
      await waitFor(() => expect(client.getQueryData<unknown[]>(['foto', 'E'])).toHaveLength(2))
      await act(() => vi.advanceTimersByTimeAsync(100))
      expect(within(sezione()).getAllByRole('button', { name: /^Foto del / })).toHaveLength(1)
      expect(within(sezione()).queryByRole('button', { name: 'Foto del 27/10/2026' })).not.toBeInTheDocument()
    })
  })
})

describe('Diario: l\'arrivo da Oggi e dalla scheda della pianta', () => {
  const scheda = () => `/esperimenti/E/piante/${idPianta('35')}`
  const dallaScheda = () => ({ nuovaPerPianta: idPianta('35'), ritorno: scheda() })
  const posizione = () => screen.getByTestId('posizione').textContent
  const scelta = (nome: string) => screen.getByRole('radio', { name: nome })

  it('da un promemoria di Oggi la nota si apre nell\'elenco, e solo quella', async () => {
    db = [nota('a', { testo: 'Altra' }), nota('b', { testo: 'Da guardare' })]
    apri({ apriNota: 'b' })
    await screen.findByRole('list', { name: 'Note del diario' })
    expect(within(riga('Da guardare')).getByRole('button', { name: 'Modifica' })).toBeInTheDocument()
    expect(within(riga('Altra')).queryByRole('button', { name: 'Modifica' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Nota')).not.toBeInTheDocument()
  })

  it('una nota che non c\'è più non rompe nulla: si vede l\'elenco com\'è', async () => {
    db = [nota('a', { testo: 'Altra' })]
    apri({ apriNota: 'sparita' })
    await screen.findByRole('list', { name: 'Note del diario' })
    expect(within(riga('Altra')).queryByRole('button', { name: 'Modifica' })).not.toBeInTheDocument()
  })

  it('«Aggiungi nota» dalla scheda apre l\'editor già collegato a quella pianta, senza nulla da scartare', async () => {
    apri(dallaScheda())
    expect(await screen.findByRole('heading', { level: 1, name: 'Nuova nota' })).toBeInTheDocument()
    expect(scelta('Piante')).toBeChecked()
    expect(screen.getByText(/Piante scelte/)).toHaveTextContent('Piante scelte: 35')
    expect(salva()).toBeDisabled()
    // Nessuna bozza né ricordo di nota aperta finché non si scrive: il collegamento iniziale non è una modifica.
    expect(localStorage.length).toBe(0)
  })

  it('lo stato di arrivo si consuma: ricaricando non si riapre da solo un editor, ma il ritorno resta', async () => {
    apri(dallaScheda())
    await screen.findByLabelText('Nota')
    await waitFor(() => expect(JSON.parse(screen.getByTestId('stato').textContent!)).toEqual({ ritorno: scheda() }))
  })

  it('salvando, la nota è collegata alla pianta e si torna alla scheda', async () => {
    const { utente } = apri(dallaScheda())
    await utente.type(await screen.findByLabelText('Nota'), 'Foglie arricciate')
    await utente.click(salva())
    await waitFor(() => expect(posizione()).toBe(scheda()))
    expect(salvaNota).toHaveBeenCalledTimes(1)
    expect(vi.mocked(salvaNota).mock.calls[0][1]).toMatchObject({
      testo: 'Foglie arricciate', pianta_ids: [idPianta('35')], trattamento_ids: [],
    })
    expect(toastSalvato).toHaveBeenCalledWith('Nota salvata.')
    expect(localStorage.length).toBe(0)
  })

  it('«Annulla» senza aver scritto nulla torna alla scheda, senza domande', async () => {
    const { utente } = apri(dallaScheda())
    await screen.findByLabelText('Nota')
    await utente.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(posizione()).toBe(scheda())
    expect(salvaNota).not.toHaveBeenCalled()
  })

  it('«Annulla» dopo aver scritto chiede se scartare; scartando si torna alla scheda e la bozza va via', async () => {
    const { utente } = apri(dallaScheda())
    await utente.type(await screen.findByLabelText('Nota'), 'Qualcosa')
    expect(localStorage.length).toBeGreaterThan(0)
    await utente.click(screen.getByRole('button', { name: 'Annulla' }))
    await utente.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Scarta' }))
    expect(posizione()).toBe(scheda())
    expect(localStorage.length).toBe(0)
  })

  it('la freccia indietro porta alla scheda (non alla home); con modifiche chiede prima di scartare', async () => {
    const { utente } = apri(dallaScheda())
    await utente.type(await screen.findByLabelText('Nota'), 'Qualcosa')
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', scheda())
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    await utente.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Scarta' }))
    expect(posizione()).toBe(scheda())
  })

  it('ritornando al Diario con la bozza (ricarica), riparte da lì, collegata alla pianta, e salvando torna alla scheda', async () => {
    const prima = apri(dallaScheda())
    await prima.utente.type(await screen.findByLabelText('Nota'), 'A metà')
    prima.resa.unmount()

    // Ricaricando, la rotta ha ancora il ritorno ma non più la richiesta di una nota nuova.
    const { utente } = apri({ ritorno: scheda() })
    expect(await screen.findByLabelText('Nota')).toHaveValue('A metà')
    expect(scelta('Piante')).toBeChecked()
    expect(screen.getByText(/Piante scelte/)).toHaveTextContent('Piante scelte: 35')
    await utente.click(salva())
    await waitFor(() => expect(posizione()).toBe(scheda()))
    expect(vi.mocked(salvaNota).mock.calls[0][1]).toMatchObject({ testo: 'A metà', pianta_ids: [idPianta('35')] })
  })

  it('una bozza già lasciata a metà ha la precedenza: non si perde e non si sovrascrive con la nota collegata', async () => {
    scriviBozzaNota('E', {
      id: 'vecchia', esistente: false,
      stato: { ...statoVuoto(oggiLocale()), testo: 'Scritta prima', collegamento: 'trattamenti', trattamento_ids: [idTrattamento('Controllo')] },
    })
    apri(dallaScheda())
    expect(await screen.findByLabelText('Nota')).toHaveValue('Scritta prima')
    expect(scelta('Trattamenti')).toBeChecked()
    expect(JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.endsWith('vecchia'))!)!).stato.testo).toBe('Scritta prima')
  })

  it('una pianta che non c\'è più si ignora: si vede l\'elenco', async () => {
    apri({ nuovaPerPianta: 'inesistente', ritorno: scheda() })
    expect(await screen.findByRole('button', { name: '+ Nuova nota' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Nota')).not.toBeInTheDocument()
  })

  it('un ritorno fuori dall\'esperimento si ignora: si esce verso la home', async () => {
    const { utente } = apri({ nuovaPerPianta: idPianta('35'), ritorno: 'https://altro.example/x' })
    await screen.findByLabelText('Nota')
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/esperimenti/E')
    await utente.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(posizione()).toBe('/esperimenti/E/diario')
  })

  it('le note aperte dall\'elenco dopo un arrivo dalla scheda non tornano alla scheda', async () => {
    db = [nota('a', { testo: 'Esistente' })]
    const { utente } = apri({ apriNota: 'a', ritorno: scheda() })
    await utente.click(within(await screen.findByRole('list', { name: 'Note del diario' })).getByRole('button', { name: 'Modifica' }))
    await utente.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(posizione()).toBe('/esperimenti/E/diario')
    expect(screen.getByRole('heading', { level: 1, name: 'Diario' })).toBeInTheDocument()
  })
})
