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
vi.mock('@/api/misure', () => ({
  misureDelGiorno: vi.fn(), misurePianta: vi.fn(), caricaMisura: vi.fn(), salvaMisura: vi.fn(), eliminaMisura: vi.fn(),
  misureStrumento: vi.fn(), ultimaMisuraPerStrumento: vi.fn(), ultimeMisurePiante: vi.fn(),
}))
vi.mock('@/api/note', () => ({
  listaNote: vi.fn(), salvaNota: vi.fn(), eliminaNota: vi.fn(), segnaFatto: vi.fn(),
}))
vi.mock('@/api/exportSalvati', () => ({
  listaExportSalvati: vi.fn(), salvaExportSalvato: vi.fn(), eliminaExportSalvato: vi.fn(),
}))
vi.mock('@/lib/toastSalvato', () => ({ toastSalvato: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(() => 'id-toast'), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }) }))
// Il file vero è il lavoro del Task D8 (ha i suoi test): qui si prova la pagina che lo chiama, con le fasi in mano al test.
vi.mock('@/components/esporta/scaricaExcel', async importOriginal => ({
  ...(await importOriginal<typeof import('@/components/esporta/scaricaExcel')>()),
  scaricaExcel: vi.fn(),
}))
// Il riepilogo si calcola con la vera `costruisciCartella`, ma contata: non deve rifarsi a ogni tasto del campo "Nome".
vi.mock('@/domain/export/fogli', async importOriginal => {
  const originale = await importOriginal<typeof import('@/domain/export/fogli')>()
  return { ...originale, costruisciCartella: vi.fn(originale.costruisciCartella) }
})

import { toast } from 'sonner'
import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { caricaConfig } from '@/api/esperimenti'
import { eliminaExportSalvato, listaExportSalvati, salvaExportSalvato } from '@/api/exportSalvati'
import { misureStrumento, ultimaMisuraPerStrumento } from '@/api/misure'
import { listaNote } from '@/api/note'
import { scaricaExcel } from '@/components/esporta/scaricaExcel'
import { costruisciCartella } from '@/domain/export/fogli'
import { SCELTA_TUTTO, type SceltaExport } from '@/domain/export/scelte'
import { configDiEsempio, parametro } from '@/domain/test-helpers'
import type { ConfigEsperimento, ExportSalvato, Misura, Nota } from '@/domain/tipi'
import { ATTESA_ANNULLA_MS } from '@/lib/eliminaConAnnulla'
import { ErroreApp } from '@/lib/errori'
import { toastSalvato } from '@/lib/toastSalvato'
import { Esporta } from './Esporta'

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session

/*
 * L'esperimento di prova: i 4 trattamenti di `configDiEsempio` con una pianta ciascuna (etichette 1, 2, 3, 4) e tre
 * strumenti: Altezza (con misure), Fenologici (nessuna misura) e Calibro, archiviato. Altezza ha tre rilievi (1, 8 e 15
 * ottobre) per ognuna delle quattro piante: Dati 12 righe, Medie 12, Misure 12, un grafico; una nota del Diario.
 */
let config: ConfigEsperimento
let db: Misura[]
let note: Nota[]
let salvati: ExportSalvato[]

const par = (nome: string) => config.parametri.find(p => p.nome === nome)!
const strumento = (nome: string) => config.strumenti.find(s => s.nome === nome)!

function creaConfig(): ConfigEsperimento {
  const base = configDiEsempio()
  const diametro = parametro('Diametro', { unita: 'mm', ordine: 4 })
  return {
    ...base,
    esperimento: { ...base.esperimento, id: 'E', nome: 'Hydrochar' },
    parametri: [...base.parametri, diametro],
    strumenti: [
      ...base.strumenti,
      { id: crypto.randomUUID(), nome: 'Calibro', icona: '📐', ordine: 2, tipo: 'strumento', archiviato: true, catalogo_id: null,
        parametri: [{ parametro_id: diametro.id, obbligatorio: false, ordine: 0 }] },
    ],
  }
}

let n = 0
function misuraAltezza(etichetta: string, data: string, valore: number): Misura {
  n += 1
  return {
    id: `m${n}`, pianta_id: config.piante.find(p => p.etichetta === etichetta)!.id, strumento_id: strumento('Altezza').id,
    data_rilievo: data, ora: '09:00', valori: { [par('Altezza').id]: [valore] },
  }
}

function misureDiProva(): Misura[] {
  return ['2026-10-01', '2026-10-08', '2026-10-15'].flatMap((data, i) =>
    ['1', '2', '3', '4'].map(etichetta => misuraAltezza(etichetta, data, 40 + i * 4 + Number(etichetta))))
}

const unaNota = (extra: Partial<Nota> = {}): Nota =>
  ({ id: 'n1', data: '2026-10-10', testo: 'Irrigazione', promemoria: false, fatto_il: null, pianta_ids: [], trattamento_ids: [], ...extra })

const salvato = (id: string, nome: string, scelte: unknown): ExportSalvato => ({ id, nome, scelte, aggiornato_il: '2026-10-30T10:00:00Z' })

const SOLO_ALTEZZA = (): SceltaExport => ({
  v: 1, strumenti: { modo: 'scelti', ids: [strumento('Altezza').id] }, piante: { modo: 'tutte' },
  periodo: { modo: 'settimane', n: 12 }, come: { valori: true, medie: true, grafici: false, diario: false, info: false },
})

function Posizione() {
  const { pathname, search } = useLocation()
  return <p data-testid="posizione">{pathname + search}</p>
}

function apri(ricerca = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const resa = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/esperimenti/E/esporta${ricerca}`]}>
        <Routes>
          <Route path="/esperimenti/:espId/esporta" element={<Esporta />} />
          <Route path="*" element={<Posizione />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { client, resa, utente: userEvent.setup({ delay: null }) }
}

/** Apre la pagina e aspetta che la configurazione sia arrivata (compare l'elenco degli export salvati). */
async function apriCaricata(ricerca = '') {
  const aperta = apri(ricerca)
  await screen.findByRole('list', { name: 'Export salvati' })
  return aperta
}

const pulsante = (nome: string | RegExp) => screen.getByRole('button', { name: nome })
const scarica = () => pulsante('Scarica Excel')
const riepilogo = () => screen.getByRole('status', { name: 'Riepilogo' })
const elencoSalvati = () => within(screen.getByRole('list', { name: 'Export salvati' }))
const rigaSalvata = (nome: string) => elencoSalvati().getByText(nome).closest('li') as HTMLElement
const sezione = (nome: string) => within(screen.getByRole('region', { name: nome }))
/** Il riepilogo finito di calcolare: c'è la riga «Il file conterrà:» e non più «Conto le righe…». */
const riepilogoPronto = () => waitFor(() => expect(riepilogo()).toHaveTextContent('Il file conterrà:'))
const azioneAnnulla = () => {
  const [, opzioni] = vi.mocked(toast).mock.calls.at(-1) as unknown as [string, { action: { label: string; onClick: () => void } }]
  return opzioni.action
}

beforeEach(() => {
  vi.clearAllMocks()
  // Con timer finti ma che avanzano da soli: l'attesa di 5 secondi di "Annulla" si prova senza aspettarla davvero.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 10, 2, 10, 0)) // 2 novembre 2026, ore 10:00 (ora locale)
  config = creaConfig()
  db = misureDiProva()
  note = [unaNota()]
  salvati = []
  vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(caricaConfig).mockImplementation(async () => config)
  vi.mocked(misureStrumento).mockImplementation(async (_e, strumentoId) => db.filter(m => m.strumento_id === strumentoId))
  vi.mocked(ultimaMisuraPerStrumento).mockImplementation(async () =>
    new Map([[strumento('Altezza').id, db.map(m => m.data_rilievo).sort().at(-1) ?? '']]))
  vi.mocked(listaNote).mockImplementation(async () => note)
  vi.mocked(listaExportSalvati).mockImplementation(async () => salvati)
  vi.mocked(salvaExportSalvato).mockResolvedValue(undefined)
  vi.mocked(eliminaExportSalvato).mockResolvedValue(undefined)
  vi.mocked(scaricaExcel).mockResolvedValue(null)
})

// Lo stato "in attesa" delle eliminazioni è del modulo, non della pagina: ogni test lo lascia vuoto.
afterEach(async () => {
  await act(() => vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS * 2))
  vi.useRealTimers()
})

describe('Esporta: pagina e scelta iniziale', () => {
  it('ha il titolo «Esporta Excel» e la freccia indietro alla home dell\'esperimento', async () => {
    apri()
    expect(await screen.findByRole('heading', { level: 1, name: 'Esporta Excel' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/esperimenti/E')
  })

  it('senza URL parte da «Tutto l\'esperimento»: tutti gli strumenti, tutte le piante, tutto il periodo, tutti i fogli', async () => {
    apri()
    await riepilogoPronto()
    for (const nome of ['Altezza', 'Fenologici', 'Calibro (archiviato)']) {
      expect(sezione('1 · Cosa').getByRole('button', { name: nome })).toHaveAttribute('aria-pressed', 'true')
    }
    expect(sezione('2 · Quali piante').getByRole('radio', { name: 'Tutte' })).toBeChecked()
    expect(sezione('3 · Periodo').getByRole('radio', { name: 'Tutto' })).toBeChecked()
    expect(sezione('4 · Come').getByRole('button', { name: /Valori di ogni pianta/ })).toHaveAttribute('aria-pressed', 'true')
    expect(sezione('4 · Come').getByRole('button', { name: /Medie per trattamento/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Dalla vista del Dataset.')).not.toBeInTheDocument()
    expect(elencoSalvati().getByRole('button', { name: /Tutto l'esperimento/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('gli strumenti archiviati stanno in fondo, con «(archiviato)»', async () => {
    apri()
    await riepilogoPronto()
    const nomi = sezione('1 · Cosa').getAllByRole('button').map(b => b.textContent)
    expect(nomi).toEqual(['📏Altezza', '🌱Fenologici', '📐Calibro (archiviato)'])
  })
})

describe('Esporta: arrivo da «Scarica questa vista» del Dataset', () => {
  it('le scelte iniziali vengono dalla URL e compare «Dalla vista del Dataset.»', async () => {
    const [, t1] = config.trattamenti
    apri(`?s=${strumento('Altezza').id}&p=${par('Altezza').id}&t=${t1.id}&per=4s`)
    expect(await screen.findByText('Dalla vista del Dataset.')).toBeInTheDocument()
    expect(sezione('1 · Cosa').getByRole('button', { name: 'Altezza' })).toHaveAttribute('aria-pressed', 'true')
    expect(sezione('1 · Cosa').getByRole('button', { name: 'Fenologici' })).toHaveAttribute('aria-pressed', 'false')
    expect(sezione('2 · Quali piante').getByRole('radio', { name: 'Per trattamento…' })).toBeChecked()
    expect(sezione('2 · Quali piante').getByRole('button', { name: t1.etichetta })).toHaveAttribute('aria-pressed', 'true')
    expect(sezione('3 · Periodo').getByRole('radio', { name: 'Ultime 4 settimane' })).toBeChecked()
    await riepilogoPronto()
    // 28 giorni da oggi (2 novembre): 6 ottobre, così restano i rilievi dell'8 e del 15, per un solo trattamento
    expect(riepilogo()).toHaveTextContent('Dati: 2 righe')
  })

  it('le piante cercate nella vista diventano il campo «Piante…», con tutte quelle trovate', async () => {
    apri('?cerca=1,3')
    expect(await screen.findByText('Dalla vista del Dataset.')).toBeInTheDocument()
    expect(sezione('2 · Quali piante').getByRole('radio', { name: 'Piante…' })).toBeChecked()
    expect(sezione('2 · Quali piante').getByLabelText('Piante')).toHaveValue('1, 3')
    await riepilogoPronto()
    expect(riepilogo()).toHaveTextContent('Dati: 6 righe')
  })

  it('ids che non ci sono si scartano in silenzio e valgono le scelte di sempre', async () => {
    apri('?s=non-uno-strumento&t=neanche-questo&per=3s')
    await riepilogoPronto()
    expect(sezione('1 · Cosa').getByRole('button', { name: 'Fenologici' })).toHaveAttribute('aria-pressed', 'true')
    expect(sezione('2 · Quali piante').getByRole('radio', { name: 'Tutte' })).toBeChecked()
    expect(sezione('3 · Periodo').getByRole('radio', { name: 'Tutto' })).toBeChecked()
    expect(riepilogo()).toHaveTextContent('Dati: 12 righe')
  })

  it('cambiando una scelta la riga «Dalla vista del Dataset.» sparisce', async () => {
    const { utente } = apri(`?s=${strumento('Altezza').id}`)
    expect(await screen.findByText('Dalla vista del Dataset.')).toBeInTheDocument()
    await utente.click(sezione('1 · Cosa').getByRole('button', { name: 'Fenologici' }))
    expect(screen.queryByText('Dalla vista del Dataset.')).not.toBeInTheDocument()
  })
})

describe('Esporta: le quattro scelte', () => {
  it('Cosa: i chip si scelgono e togliendo l\'ultimo lo dice', async () => {
    const { utente } = apri()
    await riepilogoPronto()
    const cosa = sezione('1 · Cosa')
    await utente.click(cosa.getByRole('button', { name: 'Fenologici' }))
    await utente.click(cosa.getByRole('button', { name: /Calibro/ }))
    expect(cosa.getByRole('button', { name: 'Fenologici' })).toHaveAttribute('aria-pressed', 'false')
    await utente.click(cosa.getByRole('button', { name: 'Altezza' }))
    expect(cosa.getByText('Scegli almeno uno strumento.')).toBeInTheDocument()
    expect(scarica()).toBeDisabled()
    await utente.click(cosa.getByRole('button', { name: 'Altezza' }))
    expect(cosa.queryByText('Scegli almeno uno strumento.')).not.toBeInTheDocument()
  })

  it('Quali piante: per trattamento (almeno uno) e piante precise con le etichette che non ci sono', async () => {
    const { utente } = apri()
    await riepilogoPronto()
    const piante = sezione('2 · Quali piante')
    await utente.click(piante.getByRole('radio', { name: 'Per trattamento…' }))
    expect(piante.getByText('Scegli almeno un trattamento.')).toBeInTheDocument()
    expect(scarica()).toBeDisabled()
    await utente.click(piante.getByRole('button', { name: config.trattamenti[0].etichetta }))
    await utente.click(piante.getByRole('button', { name: config.trattamenti[2].etichetta }))
    await waitFor(() => expect(riepilogo()).toHaveTextContent('Dati: 6 righe'))
    expect(scarica()).toBeEnabled()

    await utente.click(piante.getByRole('radio', { name: 'Piante…' }))
    expect(piante.getByText('Scrivi almeno una pianta che c\'è.')).toBeInTheDocument()
    await utente.type(piante.getByLabelText('Piante'), '2, 99')
    expect(piante.getByText('Non trovata: 99')).toBeInTheDocument()
    await waitFor(() => expect(riepilogo()).toHaveTextContent('Dati: 3 righe'))
    // la ricerca è esatta: la 1 non trova la 11, e tornando ai trattamenti la scelta di prima è ancora lì
    await utente.click(piante.getByRole('radio', { name: 'Per trattamento…' }))
    expect(piante.getByRole('button', { name: config.trattamenti[0].etichetta })).toHaveAttribute('aria-pressed', 'true')
  })

  it('Periodo: «Ultime 4 settimane» conta da oggi, «Dal… al…» chiede due date in ordine', async () => {
    const { utente } = apri()
    await riepilogoPronto()
    const periodo = sezione('3 · Periodo')
    await utente.click(periodo.getByRole('radio', { name: 'Ultime 4 settimane' }))
    await waitFor(() => expect(riepilogo()).toHaveTextContent('Dati: 8 righe'))
    expect(riepilogo()).toHaveTextContent('Dal 06/10/2026 al 02/11/2026')

    await utente.click(periodo.getByRole('radio', { name: 'Dal… al…' }))
    expect(periodo.getByText('Scegli tutte e due le date.')).toBeInTheDocument()
    expect(scarica()).toBeDisabled()
    fireEvent.change(periodo.getByLabelText('Dal'), { target: { value: '2026-10-09' } })
    fireEvent.change(periodo.getByLabelText('Al'), { target: { value: '2026-10-02' } })
    expect(periodo.getByText('La data di inizio deve venire prima di quella di fine.')).toBeInTheDocument()
    expect(scarica()).toBeDisabled()
    fireEvent.change(periodo.getByLabelText('Al'), { target: { value: '2026-10-20' } })
    await waitFor(() => expect(riepilogo()).toHaveTextContent('Dati: 4 righe'))
    expect(scarica()).toBeEnabled()
  })

  it('Come: valori e medie si accendono e spengono, Grafici · Diario · Info si apre in tre caselle', async () => {
    const { utente } = apri()
    await riepilogoPronto()
    const come = sezione('4 · Come')
    expect(riepilogo()).toHaveTextContent('Medie: 12 righe')
    await utente.click(come.getByRole('button', { name: /Medie per trattamento/ }))
    expect(come.getByRole('button', { name: /Medie per trattamento/ })).toHaveAttribute('aria-pressed', 'false')
    await waitFor(() => expect(riepilogo()).not.toHaveTextContent('Medie:'))

    const altri = come.getByRole('button', { name: /Grafici · Diario · Info/ })
    expect(altri).toHaveAttribute('aria-expanded', 'false')
    await utente.click(altri)
    expect(altri).toHaveAttribute('aria-expanded', 'true')
    expect(riepilogo()).toHaveTextContent('Grafici: 1 immagine')
    await utente.click(come.getByRole('checkbox', { name: /Grafici/ }))
    await waitFor(() => expect(riepilogo()).not.toHaveTextContent('Grafici:'))
    expect(come.getByRole('checkbox', { name: /Diario/ })).toBeChecked()
    expect(come.getByRole('checkbox', { name: /Info/ })).toBeChecked()
  })

  it('Come: senza nessun contenuto non c\'è una scelta e lo dice', async () => {
    const { utente } = apri()
    await riepilogoPronto()
    const come = sezione('4 · Come')
    await utente.click(come.getByRole('button', { name: /Valori di ogni pianta/ }))
    await utente.click(come.getByRole('button', { name: /Medie per trattamento/ }))
    await utente.click(come.getByRole('button', { name: /Grafici · Diario · Info/ }))
    for (const nome of [/Grafici/, /Diario/, /Info/]) await utente.click(come.getByRole('checkbox', { name: nome }))
    expect(come.getByText('Scegli almeno un contenuto per il file.')).toBeInTheDocument()
    expect(scarica()).toBeDisabled()
    expect(pulsante('Salva questa scelta')).toBeDisabled()
  })

  it('i bersagli sono alti almeno 44 px (classi h-11 o più alte, min-h-11 per le righe)', async () => {
    apri()
    await riepilogoPronto()
    const piccoli = Array.from(document.querySelectorAll('button')).filter(b => !/(^|\s)(h-1[1-9]|h-[2-9]\d|min-h-1[1-9]|size-11|size-12)(\s|$)/.test(b.className))
    expect(piccoli.map(b => b.textContent)).toEqual([])
  })
})

describe('Esporta: il riepilogo', () => {
  it('«Il file conterrà:» e le righe del file, con i numeri e i contenuti', async () => {
    apri()
    await riepilogoPronto()
    const r = riepilogo()
    expect(r).toHaveTextContent('Dati: 12 righe')
    expect(r).toHaveTextContent('Medie: 12 righe')
    expect(r).toHaveTextContent('Misure: 12 righe')
    expect(r).toHaveTextContent('Grafici: 1 immagine')
    expect(r).toHaveTextContent('Diario: 1 nota')
    expect(r).toHaveTextContent('Info')
    expect(r).toHaveTextContent('Altezza (Altezza, Vecchio), Fenologici (Palchi, Note), Calibro')
    expect(r).toHaveAttribute('aria-live', 'polite')
  })

  it('mentre legge dice «Conto le righe…», e Scarica Excel non c\'è ancora da premere', async () => {
    const letture: (() => void)[] = []
    vi.mocked(misureStrumento).mockImplementation((_e, id) => new Promise<Misura[]>(r => { letture.push(() => r(db.filter(m => m.strumento_id === id))) }))
    apri()
    expect(await screen.findByText('Conto le righe…')).toBeInTheDocument()
    expect(scarica()).toBeDisabled()
    await act(async () => { letture.forEach(f => f()) })
    await riepilogoPronto()
    expect(screen.queryByText('Conto le righe…')).not.toBeInTheDocument()
    expect(scarica()).toBeEnabled()
  })

  it('senza righe dice «Nessun dato con queste scelte.» e il pulsante resta fermo', async () => {
    const { utente } = apri()
    await riepilogoPronto()
    const cosa = sezione('1 · Cosa')
    await utente.click(cosa.getByRole('button', { name: 'Altezza' }))
    await utente.click(cosa.getByRole('button', { name: /Calibro/ }))
    // i soli Fenologici: nessuna misura, e nemmeno una nota o un grafico da mettere nel file
    const come = sezione('4 · Come')
    await utente.click(come.getByRole('button', { name: /Grafici · Diario · Info/ }))
    await utente.click(come.getByRole('checkbox', { name: /Diario/ }))
    await utente.click(come.getByRole('checkbox', { name: /Info/ }))
    expect(await screen.findByText('Nessun dato con queste scelte.')).toBeInTheDocument()
    expect(scarica()).toBeDisabled()
  })

  it('un errore di lettura si dice, con «Riprova» che rilegge', async () => {
    vi.mocked(misureStrumento).mockRejectedValueOnce(new Error('rete'))
    const { utente } = apri()
    const errore = await within(await screen.findByRole('status', { name: 'Riepilogo' })).findByRole('alert')
    expect(errore).toBeInTheDocument()
    expect(scarica()).toBeDisabled()
    await utente.click(within(errore).getByRole('button', { name: 'Riprova' }))
    await riepilogoPronto()
    expect(scarica()).toBeEnabled()
  })

  it('un errore delle note blocca il riepilogo solo se il file ha Diario o Grafici', async () => {
    vi.mocked(listaNote).mockRejectedValue(new Error('rete'))
    const { utente } = apri()
    const errore = await within(await screen.findByRole('status', { name: 'Riepilogo' })).findByRole('alert')
    expect(errore).toBeInTheDocument()
    const come = sezione('4 · Come')
    await utente.click(come.getByRole('button', { name: /Grafici · Diario · Info/ }))
    await utente.click(come.getByRole('checkbox', { name: /Grafici/ }))
    await utente.click(come.getByRole('checkbox', { name: /Diario/ }))
    await riepilogoPronto()
    expect(riepilogo()).toHaveTextContent('Dati: 12 righe')
    expect(scarica()).toBeEnabled()
  })

  it('un esperimento concluso aspetta l\'ultima data prima di contare le settimane', async () => {
    config = { ...config, esperimento: { ...config.esperimento, stato: 'concluso' } }
    let finisci: (m: Map<string, string>) => void = () => {}
    vi.mocked(ultimaMisuraPerStrumento).mockImplementation(() => new Promise(r => { finisci = r }))
    const { utente } = apri()
    await screen.findByRole('heading', { level: 2, name: '3 · Periodo' })
    await utente.click(sezione('3 · Periodo').getByRole('radio', { name: 'Ultime 4 settimane' }))
    expect(await screen.findByText('Conto le righe…')).toBeInTheDocument()
    await act(async () => { finisci(new Map([[strumento('Altezza').id, '2026-10-15']])) })
    // le 4 settimane finiscono all'ultima misura (15 ottobre), non a oggi: dal 18 settembre al 15 ottobre, tutti e tre i rilievi
    await waitFor(() => expect(riepilogo()).toHaveTextContent('Dati: 12 righe'))
    expect(riepilogo()).toHaveTextContent('Dal 18/09/2026 al 15/10/2026')
  })

  it('i tasti del campo «Nome» non rifanno il conto del riepilogo', async () => {
    const { utente } = apri()
    await riepilogoPronto()
    await utente.click(pulsante('Salva questa scelta'))
    const chiamate = vi.mocked(costruisciCartella).mock.calls.length
    await utente.type(screen.getByLabelText('Nome'), 'SPAD ultimo mese')
    expect(vi.mocked(costruisciCartella).mock.calls.length).toBe(chiamate)
  })
})

describe('Esporta: export salvati', () => {
  it('«Tutto l\'esperimento» è sempre il primo e non si elimina; poi i salvati dell\'utente con la loro descrizione', async () => {
    salvati = [salvato('a', 'SPAD ultimo mese', SOLO_ALTEZZA())]
    await apriCaricata()
    const voci = await elencoSalvati().findAllByRole('listitem')
    expect(voci).toHaveLength(2)
    expect(voci[0]).toHaveTextContent('Tutto l\'esperimento')
    expect(within(voci[0]).queryByRole('button', { name: 'Elimina' })).not.toBeInTheDocument()
    expect(voci[1]).toHaveTextContent('SPAD ultimo mese')
    expect(voci[1]).toHaveTextContent('Altezza · tutte le piante · ultime 12 settimane · valori, medie')
    expect(within(voci[1]).getByRole('button', { name: 'Elimina' })).toBeInTheDocument()
  })

  it('toccarne uno applica le scelte (periodo relativo compreso) e non scarica', async () => {
    salvati = [salvato('a', 'SPAD ultimo mese', SOLO_ALTEZZA())]
    const { utente } = await apriCaricata()
    await utente.click(await elencoSalvati().findByRole('button', { name: /SPAD ultimo mese/ }))
    expect(sezione('1 · Cosa').getByRole('button', { name: 'Fenologici' })).toHaveAttribute('aria-pressed', 'false')
    expect(sezione('1 · Cosa').getByRole('button', { name: 'Altezza' })).toHaveAttribute('aria-pressed', 'true')
    // senza limiti sulle settimane: 12 è una scelta salvata valida, e resta relativa
    expect(sezione('3 · Periodo').getByRole('radio', { name: 'Ultime 12 settimane' })).toBeChecked()
    expect(sezione('4 · Come').getByRole('button', { name: /Medie per trattamento/ })).toHaveAttribute('aria-pressed', 'true')
    expect(elencoSalvati().getByRole('button', { name: /SPAD ultimo mese/ })).toHaveAttribute('aria-pressed', 'true')
    expect(elencoSalvati().getByRole('button', { name: /Tutto l'esperimento/ })).toHaveAttribute('aria-pressed', 'false')
    await riepilogoPronto()
    expect(riepilogo()).toHaveTextContent('Dati: 12 righe')
    expect(scaricaExcel).not.toHaveBeenCalled()
  })

  it('«Tutto l\'esperimento» rimette le scelte di partenza', async () => {
    salvati = [salvato('a', 'SPAD ultimo mese', SOLO_ALTEZZA())]
    const { utente } = await apriCaricata()
    await utente.click(await elencoSalvati().findByRole('button', { name: /SPAD ultimo mese/ }))
    await utente.click(elencoSalvati().getByRole('button', { name: /Tutto l'esperimento/ }))
    expect(sezione('1 · Cosa').getByRole('button', { name: 'Fenologici' })).toHaveAttribute('aria-pressed', 'true')
    expect(sezione('3 · Periodo').getByRole('radio', { name: 'Tutto' })).toBeChecked()
  })

  it('un export che non si legge più dice «Non più leggibile: eliminalo.» e non si applica', async () => {
    salvati = [salvato('a', 'Vecchio formato', { v: 7, qualcosa: true })]
    const { utente } = await apriCaricata()
    await elencoSalvati().findByText('Vecchio formato')
    const riga = rigaSalvata('Vecchio formato')
    expect(riga).toHaveTextContent('Non più leggibile: eliminalo.')
    expect(within(riga).queryByRole('button', { name: /Vecchio formato/ })).not.toBeInTheDocument()
    await utente.click(within(riga).getByRole('button', { name: 'Elimina' }))
    expect(screen.queryByText('Vecchio formato')).not.toBeInTheDocument()
  })

  it('gli ids che non ci sono più si dicono sulla riga e si scartano', async () => {
    const scelta: SceltaExport = {
      ...SOLO_ALTEZZA(),
      strumenti: { modo: 'scelti', ids: [strumento('Altezza').id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] },
      piante: { modo: 'piante', ids: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'] },
    }
    salvati = [salvato('a', 'Con ids persi', scelta)]
    const { utente } = await apriCaricata()
    await elencoSalvati().findByText('Con ids persi')
    const riga = rigaSalvata('Con ids persi')
    expect(riga).toHaveTextContent('1 strumento non c\'è più')
    expect(riga).toHaveTextContent('2 piante non ci sono più')
    await utente.click(within(riga).getByRole('button', { name: /Con ids persi/ }))
    // le piante non ci sono più: l'elenco vuoto torna a «tutte»
    expect(sezione('2 · Quali piante').getByRole('radio', { name: 'Tutte' })).toBeChecked()
    expect(sezione('1 · Cosa').getByRole('button', { name: 'Altezza' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('mentre si leggono dice «Carico gli export salvati…», e se la lettura fallisce «Riprova» (e «Tutto l\'esperimento» resta)', async () => {
    vi.mocked(listaExportSalvati).mockRejectedValueOnce(new Error('rete'))
    const { utente } = await apriCaricata()
    const errore = await screen.findAllByRole('alert')
    expect(errore.some(e => e.textContent?.includes('Riprova'))).toBe(true)
    expect(elencoSalvati().getByRole('button', { name: /Tutto l'esperimento/ })).toBeInTheDocument()
    salvati = [salvato('a', 'Torna', SOLO_ALTEZZA())]
    const dentro = errore.find(e => e.textContent?.includes('Riprova'))!
    await utente.click(within(dentro).getByRole('button', { name: 'Riprova' }))
    expect(await elencoSalvati().findByText('Torna')).toBeInTheDocument()
  })

  describe('Elimina con Annulla', () => {
    it('la riga sparisce subito, compare «Annulla» e nulla è ancora cancellato', async () => {
      salvati = [salvato('a', 'Da togliere', SOLO_ALTEZZA()), salvato('b', 'Da tenere', SOLO_ALTEZZA())]
      const { utente } = await apriCaricata()
      await elencoSalvati().findByText('Da togliere')
      await utente.click(within(rigaSalvata('Da togliere')).getByRole('button', { name: 'Elimina' }))
      expect(screen.queryByText('Da togliere')).not.toBeInTheDocument()
      expect(screen.getByText('Da tenere')).toBeInTheDocument()
      expect(toast).toHaveBeenCalledWith('Export eliminato.', expect.objectContaining({ duration: ATTESA_ANNULLA_MS }))
      expect(azioneAnnulla().label).toBe('Annulla')
      expect(eliminaExportSalvato).not.toHaveBeenCalled()
      // un'eliminazione non è un salvataggio: toast neutro
      expect(toastSalvato).not.toHaveBeenCalled()
    })

    it('«Annulla» rimette la riga al suo posto e non cancella mai nulla', async () => {
      salvati = [salvato('a', 'Prima', SOLO_ALTEZZA()), salvato('b', 'Da togliere', SOLO_ALTEZZA())]
      const { utente } = await apriCaricata()
      await elencoSalvati().findByText('Da togliere')
      await utente.click(within(rigaSalvata('Da togliere')).getByRole('button', { name: 'Elimina' }))
      act(() => azioneAnnulla().onClick())
      expect(await elencoSalvati().findByText('Da togliere')).toBeInTheDocument()
      await act(() => vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS * 2))
      expect(eliminaExportSalvato).not.toHaveBeenCalled()
    })

    it('dopo 5 secondi elimina davvero e la riga resta fuori', async () => {
      salvati = [salvato('a', 'Da togliere', SOLO_ALTEZZA()), salvato('b', 'Da tenere', SOLO_ALTEZZA())]
      const { utente } = await apriCaricata()
      await elencoSalvati().findByText('Da togliere')
      await utente.click(within(rigaSalvata('Da togliere')).getByRole('button', { name: 'Elimina' }))
      await act(() => vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS - 100))
      expect(eliminaExportSalvato).not.toHaveBeenCalled()
      salvati = salvati.filter(s => s.id !== 'a')
      await act(() => vi.advanceTimersByTimeAsync(200))
      expect(eliminaExportSalvato).toHaveBeenCalledWith('E', 'a')
      expect(screen.queryByText('Da togliere')).not.toBeInTheDocument()
      expect(screen.getByText('Da tenere')).toBeInTheDocument()
    })

    it('se l\'eliminazione vera fallisce la riga ricompare con un errore', async () => {
      salvati = [salvato('a', 'Da togliere', SOLO_ALTEZZA())]
      vi.mocked(eliminaExportSalvato).mockRejectedValueOnce(new Error('rete'))
      const { utente } = await apriCaricata()
      await elencoSalvati().findByText('Da togliere')
      await utente.click(within(rigaSalvata('Da togliere')).getByRole('button', { name: 'Elimina' }))
      await act(() => vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS))
      expect(await elencoSalvati().findByText('Da togliere')).toBeInTheDocument()
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('L\'export non è stato eliminato'), expect.anything())
    })
  })
})

describe('Esporta: Salva questa scelta', () => {
  async function apriIlCampo() {
    const aperta = apri()
    await riepilogoPronto()
    await aperta.utente.click(pulsante('Salva questa scelta'))
    return aperta
  }

  it('salva le scelte con un id nuovo e il nome senza spazi ai bordi, poi il toast verde «salvato» e il campo si chiude', async () => {
    const { utente } = await apriIlCampo()
    await utente.type(screen.getByLabelText('Nome'), '  SPAD ultimo mese  ')
    await utente.click(pulsante('Salva'))
    await waitFor(() => expect(salvaExportSalvato).toHaveBeenCalledTimes(1))
    const [espId, dati] = vi.mocked(salvaExportSalvato).mock.calls[0]
    expect(espId).toBe('E')
    expect(dati.nome).toBe('SPAD ultimo mese')
    expect(dati.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(dati.scelte).toEqual(SCELTA_TUTTO)
    expect(toastSalvato).toHaveBeenCalledWith(expect.stringContaining('SPAD ultimo mese'))
    await waitFor(() => expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument())
    expect(pulsante('Salva questa scelta')).toBeInTheDocument()
  })

  it('salva la scelta com\'è: strumenti scelti, periodo relativo che resta relativo', async () => {
    const { utente } = apri()
    await riepilogoPronto()
    await utente.click(sezione('1 · Cosa').getByRole('button', { name: 'Fenologici' }))
    await utente.click(sezione('3 · Periodo').getByRole('radio', { name: 'Ultime 4 settimane' }))
    await utente.click(pulsante('Salva questa scelta'))
    await utente.type(screen.getByLabelText('Nome'), 'Altezza 4 settimane')
    await utente.click(pulsante('Salva'))
    await waitFor(() => expect(salvaExportSalvato).toHaveBeenCalledTimes(1))
    expect(vi.mocked(salvaExportSalvato).mock.calls[0][1].scelte).toEqual({
      v: 1,
      strumenti: { modo: 'scelti', ids: [strumento('Altezza').id, strumento('Calibro').id] },
      piante: { modo: 'tutte' },
      periodo: { modo: 'settimane', n: 4 },
      come: SCELTA_TUTTO.come,
    })
  })

  it('un nome vuoto o di soli spazi non si salva e lo dice', async () => {
    const { utente } = await apriIlCampo()
    await utente.type(screen.getByLabelText('Nome'), '   ')
    await utente.click(pulsante('Salva'))
    expect(screen.getByText('Scrivi un nome per questo export.')).toBeInTheDocument()
    expect(salvaExportSalvato).not.toHaveBeenCalled()
  })

  it('un nome già usato chiede se sostituire; «Sostituisci» fa l\'upsert sull\'id di quello esistente', async () => {
    salvati = [salvato('esistente', 'SPAD ultimo mese', SOLO_ALTEZZA())]
    const { utente } = await apriIlCampo()
    await elencoSalvati().findByText('SPAD ultimo mese')
    await utente.type(screen.getByLabelText('Nome'), ' spad ultimo MESE ')
    await utente.click(pulsante('Salva'))
    expect(screen.getByText('C\'è già un export «SPAD ultimo mese». Sostituirlo?')).toBeInTheDocument()
    expect(salvaExportSalvato).not.toHaveBeenCalled()
    await utente.click(pulsante('Sostituisci'))
    await waitFor(() => expect(salvaExportSalvato).toHaveBeenCalledTimes(1))
    expect(vi.mocked(salvaExportSalvato).mock.calls[0][1]).toMatchObject({ id: 'esistente', nome: 'spad ultimo MESE', scelte: SCELTA_TUTTO })
    expect(toastSalvato).toHaveBeenCalled()
  })

  it('se il nome è di un export che si sta eliminando non si offre «Sostituisci»: si dice di annullare o aspettare', async () => {
    salvati = [salvato('vecchio', 'SPAD', SOLO_ALTEZZA())]
    const { utente } = apri()
    await riepilogoPronto()
    await elencoSalvati().findByText('SPAD')
    await utente.click(within(rigaSalvata('SPAD')).getByRole('button', { name: 'Elimina' }))
    // la riga è già fuori dall'elenco, ma nel database c'è ancora: il nome è occupato
    vi.mocked(salvaExportSalvato).mockRejectedValueOnce({ code: '23505', message: 'duplicate key value violates unique constraint "export_salvati_nome_unico"' })
    await utente.click(pulsante('Salva questa scelta'))
    await utente.type(screen.getByLabelText('Nome'), 'SPAD')
    await utente.click(pulsante('Salva'))
    expect(await screen.findByText('«SPAD» si sta eliminando: annulla l\'eliminazione o riprova tra qualche secondo.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sostituisci' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveValue('SPAD')
    expect(salvaExportSalvato).toHaveBeenCalledTimes(1)
    // passati i 5 secondi l'export non c'è più e lo stesso nome si salva
    salvati = []
    await act(() => vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS))
    await utente.click(pulsante('Salva'))
    await waitFor(() => expect(salvaExportSalvato).toHaveBeenCalledTimes(2))
  })

  it('con le scelte diventate non valide a campo aperto «Salva» dice di completarle e non salva', async () => {
    const { utente } = await apriIlCampo()
    await utente.type(screen.getByLabelText('Nome'), 'Prova')
    await utente.click(sezione('1 · Cosa').getByRole('button', { name: 'Altezza' }))
    await utente.click(sezione('1 · Cosa').getByRole('button', { name: 'Fenologici' }))
    await utente.click(sezione('1 · Cosa').getByRole('button', { name: /Calibro/ }))
    await utente.click(pulsante('Salva'))
    expect(screen.getByText('Completa le scelte prima di salvarle.')).toBeInTheDocument()
    expect(salvaExportSalvato).not.toHaveBeenCalled()
  })

  it('«Cambia nome» torna al campo con il nome scritto, senza salvare', async () => {
    salvati = [salvato('esistente', 'SPAD ultimo mese', SOLO_ALTEZZA())]
    const { utente } = await apriIlCampo()
    await elencoSalvati().findByText('SPAD ultimo mese')
    await utente.type(screen.getByLabelText('Nome'), 'SPAD ultimo mese')
    await utente.click(pulsante('Salva'))
    await utente.click(pulsante('Cambia nome'))
    expect(screen.getByLabelText('Nome')).toHaveValue('SPAD ultimo mese')
    expect(screen.queryByText(/Sostituirlo/)).not.toBeInTheDocument()
    expect(salvaExportSalvato).not.toHaveBeenCalled()
  })

  it('se il nome c\'è già ma l\'elenco era indietro, il database lo dice (23505) e si chiede lo stesso di sostituire', async () => {
    const { utente } = await apriIlCampo()
    // l'altro dispositivo ha salvato nel frattempo: l'elenco in cache non lo sa, il server sì
    vi.mocked(salvaExportSalvato).mockRejectedValueOnce({ code: '23505', message: 'duplicate key value violates unique constraint "export_salvati_nome_unico"' })
    salvati = [salvato('altrove', 'SPAD ultimo mese', SOLO_ALTEZZA())]
    await utente.type(screen.getByLabelText('Nome'), 'SPAD ultimo mese')
    await utente.click(pulsante('Salva'))
    expect(await screen.findByText('C\'è già un export «SPAD ultimo mese». Sostituirlo?')).toBeInTheDocument()
    await utente.click(pulsante('Sostituisci'))
    await waitFor(() => expect(salvaExportSalvato).toHaveBeenCalledTimes(2))
    expect(vi.mocked(salvaExportSalvato).mock.calls[1][1].id).toBe('altrove')
  })

  it('un errore di rete lascia il messaggio e il campo intatto, e riprovando si salva lo stesso export (stesso id)', async () => {
    vi.mocked(salvaExportSalvato).mockRejectedValueOnce(new Error('Failed to fetch'))
    const { utente } = await apriIlCampo()
    await utente.type(screen.getByLabelText('Nome'), 'Prova')
    await utente.click(pulsante('Salva'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Il server non risponde')
    expect(screen.getByLabelText('Nome')).toHaveValue('Prova')
    expect(toastSalvato).not.toHaveBeenCalled()
    await utente.click(pulsante('Salva'))
    await waitFor(() => expect(salvaExportSalvato).toHaveBeenCalledTimes(2))
    const [prima, dopo] = vi.mocked(salvaExportSalvato).mock.calls
    expect(dopo[1].id).toBe(prima[1].id)
    expect(toastSalvato).toHaveBeenCalledTimes(1)
  })

  it('un doppio tocco su «Salva» salva una volta sola', async () => {
    let finisci: () => void = () => {}
    vi.mocked(salvaExportSalvato).mockImplementation(() => new Promise<void>(r => { finisci = r }))
    const { utente } = await apriIlCampo()
    await utente.type(screen.getByLabelText('Nome'), 'Prova')
    await utente.dblClick(pulsante('Salva'))
    expect(salvaExportSalvato).toHaveBeenCalledTimes(1)
    await act(async () => { finisci() })
  })

  it('«Annulla» chiude il campo senza salvare', async () => {
    const { utente } = await apriIlCampo()
    await utente.type(screen.getByLabelText('Nome'), 'Prova')
    await utente.click(pulsante('Annulla'))
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument()
    expect(salvaExportSalvato).not.toHaveBeenCalled()
  })

  it('dopo il salvataggio il nuovo export compare nell\'elenco, segnato come quello in uso', async () => {
    const { utente } = await apriIlCampo()
    await utente.type(screen.getByLabelText('Nome'), 'Nuovo')
    vi.mocked(salvaExportSalvato).mockImplementation(async (_e, dati) => { salvati = [salvato(dati.id, dati.nome, dati.scelte)] })
    await utente.click(pulsante('Salva'))
    expect(await elencoSalvati().findByRole('button', { name: /Nuovo/ })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('Esporta: Scarica Excel', () => {
  /** Un download che il test fa avanzare a mano: le fasi arrivano da `onProgresso`, la fine da `finisci`. */
  function scaricamentoManuale() {
    const passaggi: { dati: Parameters<typeof scaricaExcel>[0]; finisci: (v: null | { nomeFile: string }) => void; fallisci: (e: unknown) => void }[] = []
    vi.mocked(scaricaExcel).mockImplementation(dati => new Promise(risolvi => {
      passaggi.push({ dati, finisci: v => risolvi(v as never), fallisci: e => risolvi(Promise.reject(e)) })
    }))
    return passaggi
  }

  it('passa all\'orchestratore le scelte, lo stesso «oggi» del riepilogo e un segnale', async () => {
    const passaggi = scaricamentoManuale()
    const { client, utente } = apri()
    await riepilogoPronto()
    await utente.click(scarica())
    expect(passaggi).toHaveLength(1)
    expect(passaggi[0].dati).toMatchObject({ queryClient: client, espId: 'E', scelta: SCELTA_TUTTO, oggi: '2026-11-02' })
    expect(passaggi[0].dati.segnale?.aborted).toBe(false)
    await act(async () => { passaggi[0].finisci(null) })
  })

  it('mostra la fase sotto il pulsante e tiene fermo il pulsante, poi lo libera', async () => {
    const passaggi = scaricamentoManuale()
    const { utente } = apri()
    await riepilogoPronto()
    await utente.click(scarica())
    expect(scarica()).toBeDisabled()
    expect(screen.getByText('Preparo i dati…')).toBeInTheDocument()

    await act(async () => { passaggi[0].dati.onProgresso?.({ fase: 'dati' }) })
    await act(async () => { passaggi[0].dati.onProgresso?.({ fase: 'grafici', numero: 3, totale: 12 }) })
    expect(screen.getByText('Disegno i grafici 3 di 12…')).toBeInTheDocument()
    expect(screen.queryByText('Preparo i dati…')).not.toBeInTheDocument()
    await act(async () => { passaggi[0].dati.onProgresso?.({ fase: 'file' }) })
    expect(screen.getByText('Scrivo il file…')).toBeInTheDocument()
    expect(scarica()).toBeDisabled()

    // la fase sta sotto il pulsante
    expect(scarica().compareDocumentPosition(screen.getByText('Scrivo il file…')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await act(async () => { passaggi[0].finisci({ nomeFile: 'FastLab_Hydrochar_2026-11-02.xlsx' }) })
    await waitFor(() => expect(scarica()).toBeEnabled())
    expect(screen.queryByText('Scrivo il file…')).not.toBeInTheDocument()
  })

  it('un secondo tocco mentre lavora non fa partire un altro download', async () => {
    const passaggi = scaricamentoManuale()
    const { utente } = apri()
    await riepilogoPronto()
    await utente.dblClick(scarica())
    await utente.click(scarica())
    expect(passaggi).toHaveLength(1)
    await act(async () => { passaggi[0].finisci(null) })
  })

  it('le fasi del download non rifanno il conto del riepilogo: la cartella si costruisce una volta sola', async () => {
    const passaggi = scaricamentoManuale()
    const { utente } = apri()
    await riepilogoPronto()
    const chiamate = vi.mocked(costruisciCartella).mock.calls.length
    await utente.click(scarica())
    for (const f of [{ fase: 'dati' }, { fase: 'grafici', numero: 1, totale: 2 }, { fase: 'grafici', numero: 2, totale: 2 }, { fase: 'file' }] as const) {
      await act(async () => { passaggi[0].dati.onProgresso?.(f) })
    }
    expect(vi.mocked(costruisciCartella).mock.calls.length).toBe(chiamate)
    await act(async () => { passaggi[0].finisci(null) })
    await waitFor(() => expect(scarica()).toBeEnabled())
    expect(vi.mocked(costruisciCartella).mock.calls.length).toBe(chiamate)
  })

  it('lasciando la pagina il download si interrompe: il segnale è interrotto e non resta nulla da mostrare', async () => {
    const passaggi = scaricamentoManuale()
    const { resa, utente } = apri()
    await riepilogoPronto()
    await utente.click(scarica())
    const segnale = passaggi[0].dati.segnale!
    expect(segnale.aborted).toBe(false)
    resa.unmount()
    expect(segnale.aborted).toBe(true)
    // l'orchestratore risponde `null` per un'interruzione: nessun errore e nessuna fase dopo l'uscita
    await act(async () => { passaggi[0].finisci(null) })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('lasciare la pagina senza un download in corso non interrompe nulla', async () => {
    const { resa } = apri()
    await riepilogoPronto()
    resa.unmount()
    expect(scaricaExcel).not.toHaveBeenCalled()
  })

  it('un errore resta visibile con «Riprova»; riprovando il pulsante si libera e il download riparte', async () => {
    const passaggi = scaricamentoManuale()
    const { utente } = apri()
    await riepilogoPronto()
    await utente.click(scarica())
    await act(async () => { passaggi[0].fallisci(new ErroreApp('Non sono riuscito a scrivere il file Excel: riprova.')) })
    const barra = await screen.findByText('Non sono riuscito a scrivere il file Excel: riprova.')
    expect(barra).toBeInTheDocument()
    expect(scarica()).toBeEnabled()
    expect(screen.queryByText('Preparo i dati…')).not.toBeInTheDocument()

    await utente.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(passaggi).toHaveLength(2)
    expect(screen.queryByText('Non sono riuscito a scrivere il file Excel: riprova.')).not.toBeInTheDocument()
    expect(scarica()).toBeDisabled()
    await act(async () => { passaggi[1].finisci({ nomeFile: 'x.xlsx' }) })
    await waitFor(() => expect(scarica()).toBeEnabled())
    expect(screen.queryByRole('button', { name: 'Riprova' })).not.toBeInTheDocument()
  })

  it('un errore di rete è tradotto, non il testo grezzo', async () => {
    vi.mocked(scaricaExcel).mockRejectedValueOnce(new Error('Failed to fetch'))
    const { utente } = apri()
    await riepilogoPronto()
    await utente.click(scarica())
    expect(await screen.findByText(/Il server non risponde/)).toBeInTheDocument()
  })

  it('«Scarica Excel» è l\'unico inchiostro pieno della pagina, anche con campo, conferma ed errore aperti', async () => {
    salvati = [salvato('esistente', 'SPAD', SOLO_ALTEZZA())]
    const { utente } = apri()
    await riepilogoPronto()
    await elencoSalvati().findByText('SPAD')
    await utente.click(pulsante('Salva questa scelta'))
    await utente.type(screen.getByLabelText('Nome'), 'SPAD')
    await utente.click(pulsante('Salva'))
    vi.mocked(scaricaExcel).mockRejectedValueOnce(new Error('rete'))
    await utente.click(scarica())
    await screen.findByRole('button', { name: 'Riprova' })
    await utente.click(sezione('4 · Come').getByRole('button', { name: /Grafici · Diario · Info/ }))
    const pieni = Array.from(document.querySelectorAll('button, a, input, label')).filter(el => el.classList.contains('bg-inchiostro'))
    expect(pieni.map(el => el.textContent)).toEqual(['Scarica Excel'])
  })
})
