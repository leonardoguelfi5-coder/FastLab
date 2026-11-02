import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
// La serie per trattamento si prova con la vera funzione, ma contata: non deve rifarsi a ogni tocco del grafico.
vi.mock('@/domain/dataset', async importOriginal => {
  const originale = await importOriginal<typeof import('@/domain/dataset')>()
  return { ...originale, serieTrattamenti: vi.fn(originale.serieTrattamenti) }
})

import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { caricaConfig } from '@/api/esperimenti'
import { misureStrumento, ultimaMisuraPerStrumento } from '@/api/misure'
import { listaNote } from '@/api/note'
import { serieTrattamenti } from '@/domain/dataset'
import { configDiEsempio, parametro } from '@/domain/test-helpers'
import type { ConfigEsperimento, Misura, Nota, Pianta, Strumento } from '@/domain/tipi'
import { useCampoStore } from '@/store/campo'
import { Dataset } from './Dataset'

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session

/*
 * L'esperimento di prova: i 4 trattamenti di `configDiEsempio` (Controllo + No, Controllo + Sì, S1 + No, S1 + Sì) con
 * cinque piante (1 e 2 nel primo, 3 nel secondo, 13 nel terzo, A4 nel quarto) e quattro strumenti:
 * - Crescita: Altezza (numero, cm) e Vecchio (archiviato);
 * - Fenologici: Palchi (lista) e Note (testo);
 * - Umidità: un solo parametro;
 * - Vuoto: nessuna misura.
 */
let config: ConfigEsperimento
let db: Misura[]
let note: Nota[]

const trattamento = (etichetta: string) => config.trattamenti.find(t => t.etichetta === etichetta)!
const strumento = (nome: string): Strumento => config.strumenti.find(s => s.nome === nome)!
const par = (nome: string) => config.parametri.find(p => p.nome === nome)!
const pianta = (etichetta: string): Pianta => config.piante.find(p => p.etichetta === etichetta)!

function creaConfig(): ConfigEsperimento {
  const base = configDiEsempio()
  const [tCN, tCS, tSN, tSS] = base.trattamenti
  const umidita = parametro('Umidità', { unita: '%', ordine: 5 })
  const piante: Pianta[] = [['1', tCN], ['2', tCN], ['3', tCS], ['13', tSN], ['A4', tSS]]
    .map(([etichetta, t], i) => ({ id: crypto.randomUUID(), trattamento_id: (t as typeof tCN).id, etichetta: etichetta as string, blocco: null, ordine: i }))
  const [crescita, feno] = base.strumenti
  return {
    ...base,
    esperimento: { ...base.esperimento, id: 'E' },
    piante,
    parametri: [...base.parametri, umidita],
    strumenti: [
      { ...crescita, nome: 'Crescita' },
      feno,
      { id: crypto.randomUUID(), nome: 'Umidità', icona: null, ordine: 2, tipo: 'strumento', archiviato: false, catalogo_id: null,
        parametri: [{ parametro_id: umidita.id, obbligatorio: false, ordine: 0 }] },
      { id: crypto.randomUUID(), nome: 'Vuoto', icona: null, ordine: 3, tipo: 'strumento', archiviato: false, catalogo_id: null,
        parametri: [{ parametro_id: umidita.id, obbligatorio: false, ordine: 0 }] },
    ],
  }
}

let n = 0
function misuraAltezza(etichetta: string, data: string, valore: number): Misura {
  n += 1
  return {
    id: `m${n}`, pianta_id: pianta(etichetta).id, strumento_id: strumento('Crescita').id, data_rilievo: data, ora: '09:00',
    valori: { [par('Altezza').id]: [valore] },
  }
}

/**
 * Tre rilievi (1, 8 e 15 ottobre). Controllo + No (piante 1 e 2): 41 ± 1, 45 ± 1, 49 ± 1 con n 2. Le altre piante
 * hanno una sola misura per giorno (una pianta per trattamento: nessun errore standard).
 */
function misureDiProva(): Misura[] {
  return [
    ['2026-10-01', 40, 42, 30, 50, 60], ['2026-10-08', 44, 46, 32, 52, 62], ['2026-10-15', 48, 50, 34, 54, 64],
  ].flatMap(([data, v1, v2, v3, v13, a4]) => [
    misuraAltezza('1', data as string, v1 as number), misuraAltezza('2', data as string, v2 as number),
    misuraAltezza('3', data as string, v3 as number), misuraAltezza('13', data as string, v13 as number),
    misuraAltezza('A4', data as string, a4 as number),
  ])
}

const nota = (id: string, data: string, testo: string, extra: Partial<Nota> = {}): Nota =>
  ({ id, data, testo, promemoria: false, fatto_il: null, pianta_ids: [], trattamento_ids: [], ...extra })

function Posizione() {
  const { pathname, search } = useLocation()
  return <p data-testid="posizione">{pathname + search}</p>
}
function StatoDiario() {
  const { state } = useLocation()
  return <p data-testid="diario">{`Diario: ${JSON.stringify(state)}`}</p>
}

function apri(ricerca = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const resa = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/esperimenti/E/dataset${ricerca}`]}>
        <Routes>
          <Route path="/esperimenti/:espId/dataset" element={<><Dataset /><Posizione /></>} />
          <Route path="/esperimenti/:espId/diario" element={<StatoDiario />} />
          <Route path="/esperimenti/:espId/esporta" element={<Posizione />} />
          <Route path="*" element={<Posizione />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { client, resa, utente: userEvent.setup({ delay: null }) }
}

const posizione = () => screen.getByTestId('posizione').textContent ?? ''
const parametriUrl = () => new URLSearchParams(posizione().split('?')[1] ?? '')
const grafico = () => screen.findByRole('img', { name: /serie/ })
const legenda = () => within(screen.getByRole('list', { name: 'Legenda' }))
const chip = (nome: string | RegExp) => screen.getByRole('button', { name: nome })
const pannello = (nome: string) => screen.getByRole('group', { name: nome })
const areaGrafico = () => screen.getByRole('group', { name: /frecce/i })

beforeEach(() => {
  vi.clearAllMocks()
  // Solo `Date`: i timer veri servono a React Query e a userEvent. 28 ottobre 2026, ore 10:00 (ora locale).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 28, 10, 0))
  localStorage.clear()
  useCampoStore.setState({ stato: {} })
  config = creaConfig()
  db = misureDiProva()
  note = []
  vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(caricaConfig).mockImplementation(async () => config)
  vi.mocked(misureStrumento).mockImplementation(async (_e, strumentoId) => db.filter(m => m.strumento_id === strumentoId))
  vi.mocked(ultimaMisuraPerStrumento).mockImplementation(async () =>
    new Map([[strumento('Crescita').id, db.map(m => m.data_rilievo).sort().at(-1) ?? '']]))
  vi.mocked(listaNote).mockImplementation(async () => note)
})

afterEach(() => { vi.useRealTimers() })

describe('Dataset: pagina e filtri dalla URL', () => {
  it('ha il titolo «Dataset» e la freccia indietro alla home dell\'esperimento', async () => {
    apri()
    expect(await screen.findByRole('heading', { level: 1, name: 'Dataset' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/esperimenti/E')
  })

  it('senza URL parte dal primo strumento attivo, parametro compreso, e disegna le serie per trattamento', async () => {
    apri()
    await grafico()
    expect(chip('Crescita')).toBeInTheDocument()
    expect(chip('Altezza')).toBeInTheDocument()
    expect(chip('Trattamenti: tutti')).toBeInTheDocument()
    expect(chip('Tutto il periodo')).toBeInTheDocument()
    expect(legenda().getAllByRole('listitem').map(li => li.textContent)).toEqual([
      'Controllo + No', 'Controllo + Sì', 'S1 + No', 'S1 + Sì',
    ])
  })

  it('parte dallo strumento scelto in campo, se è attivo', async () => {
    useCampoStore.setState({ stato: { E: { strumentoId: strumento('Fenologici').id } } })
    apri()
    expect(await screen.findByRole('button', { name: 'Fenologici' })).toBeInTheDocument()
    expect(chip('Palchi')).toBeInTheDocument()
  })

  it('lo strumento archiviato scelto in campo non è il punto di partenza', async () => {
    config.strumenti[1] = { ...config.strumenti[1], archiviato: true }
    useCampoStore.setState({ stato: { E: { strumentoId: strumento('Fenologici').id } } })
    apri()
    expect(await screen.findByRole('button', { name: 'Crescita' })).toBeInTheDocument()
  })

  it('la barra dei filtri sta in alto, sempre visibile, e il parametro si sceglie solo se lo strumento ne ha più di uno', async () => {
    useCampoStore.setState({ stato: { E: { strumentoId: strumento('Umidità').id } } })
    apri()
    const barra = await screen.findByRole('group', { name: 'Filtri' })
    expect(barra.className).toContain('sticky')
    expect(within(barra).getByRole('button', { name: 'Umidità' })).toBeInTheDocument()
    expect(within(barra).queryByRole('button', { name: 'Altezza' })).toBeNull()
    expect(within(barra).getAllByRole('button').map(b => b.textContent)).toEqual([
      'Umidità', 'Trattamenti: tutti', 'Fattore: tutti', 'Tutto il periodo', 'Piante',
    ])
  })

  it('legge strumento, parametro, trattamenti, livelli, periodo e ricerca dalla URL', async () => {
    const livello = config.fattori[0].livelli[1] // S1
    apri(`?s=${strumento('Fenologici').id}&p=${par('Note').id}&t=${trattamento('S1 + Sì').id}&f=${livello.id}&per=4s&cerca=3`)
    expect(await screen.findByRole('button', { name: 'Fenologici' })).toBeInTheDocument()
    expect(chip('Note')).toBeInTheDocument()
    expect(chip('Trattamenti: S1 + Sì')).toBeInTheDocument()
    expect(chip('Stress: S1')).toBeInTheDocument()
    expect(chip('Ultime 4 settimane')).toBeInTheDocument()
    expect(chip('Piante: 3')).toBeInTheDocument()
  })

  it('scarta gli id manomessi e il periodo illeggibile', async () => {
    apri(`?s=zzz&p=123&t=non-un-uuid&f=${crypto.randomUUID()}&per=boh`)
    await grafico()
    expect(chip('Crescita')).toBeInTheDocument()
    expect(chip('Altezza')).toBeInTheDocument()
    expect(chip('Trattamenti: tutti')).toBeInTheDocument()
    expect(chip('Fattore: tutti')).toBeInTheDocument()
    expect(chip('Tutto il periodo')).toBeInTheDocument()
  })

  it('scrive i filtri nella URL senza aggiungere voci alla cronologia, e li ritrova con la stessa URL', async () => {
    const { utente, resa } = apri()
    await grafico()
    await utente.click(chip('Trattamenti: tutti'))
    await utente.click(within(pannello('Trattamenti')).getByRole('button', { name: 'Controllo + No' }))
    expect(parametriUrl().get('t')).toBe(trattamento('Controllo + No').id)
    expect(parametriUrl().get('s')).toBe(strumento('Crescita').id)
    expect(legenda().getAllByRole('listitem').map(li => li.textContent)).toEqual(['Controllo + No'])
    await utente.click(chip('Tutto il periodo'))
    await utente.click(within(pannello('Periodo')).getByRole('radio', { name: 'Ultime 4 settimane' }))
    expect(parametriUrl().get('per')).toBe('4s')

    // Un nuovo disegno con la stessa URL (indietro, link condiviso) dà la stessa vista.
    const url = posizione().replace('/esperimenti/E/dataset', '')
    resa.unmount()
    apri(url)
    await grafico()
    expect(chip('Trattamenti: Controllo + No')).toBeInTheDocument()
    expect(chip('Ultime 4 settimane')).toBeInTheDocument()
  })

  it('«Azzera» toglie i filtri ma tiene strumento e parametro', async () => {
    const { utente } = apri(`?per=4s&t=${trattamento('S1 + No').id}&cerca=3`)
    await grafico()
    await utente.click(screen.getByRole('button', { name: 'Azzera' }))
    expect(parametriUrl().get('per')).toBeNull()
    expect(parametriUrl().get('t')).toBeNull()
    expect(parametriUrl().get('cerca')).toBeNull()
    expect(parametriUrl().get('s')).toBe(strumento('Crescita').id)
    expect(screen.queryByRole('button', { name: 'Azzera' })).toBeNull()
  })

  it('legge solo le misure dello strumento scelto', async () => {
    const { utente } = apri()
    await grafico()
    expect(misureStrumento).toHaveBeenCalledTimes(1)
    expect(misureStrumento).toHaveBeenCalledWith('E', strumento('Crescita').id)

    await utente.click(chip('Crescita'))
    await utente.click(within(pannello('Strumento')).getByRole('radio', { name: 'Fenologici' }))
    await waitFor(() => expect(misureStrumento).toHaveBeenCalledWith('E', strumento('Fenologici').id))
    expect(misureStrumento).toHaveBeenCalledTimes(2)
    expect(parametriUrl().get('s')).toBe(strumento('Fenologici').id)
    expect(parametriUrl().get('p')).toBe(par('Palchi').id) // il parametro di prima non è dello strumento nuovo
  })
})

describe('Dataset: scelta singola con le frecce', () => {
  it('le frecce spostano la scelta senza chiudere il pannello e il fuoco segue; un tocco la conferma e chiude', async () => {
    const { utente } = apri()
    await grafico()
    await utente.click(chip('Crescita'))
    const radio = within(pannello('Strumento')).getByRole('radio', { name: 'Crescita' })
    radio.focus()
    await utente.keyboard('{ArrowDown}')
    // il pannello c'è ancora, lo strumento è già cambiato nella URL e il fuoco è sulla voce nuova
    expect(pannello('Strumento')).toBeInTheDocument()
    expect(parametriUrl().get('s')).toBe(strumento('Fenologici').id)
    const nuova = within(pannello('Strumento')).getByRole('radio', { name: 'Fenologici' })
    expect(nuova).toHaveAttribute('aria-checked', 'true')
    expect(nuova).toHaveFocus()
    await utente.keyboard('{ArrowUp}')
    expect(within(pannello('Strumento')).getByRole('radio', { name: 'Crescita' })).toHaveFocus()
    await utente.click(within(pannello('Strumento')).getByRole('radio', { name: 'Crescita' }))
    expect(screen.queryByRole('group', { name: 'Strumento' })).not.toBeInTheDocument()
  })

  it('Invio sulla voce a fuoco la conferma e chiude il pannello', async () => {
    const { utente } = apri()
    await grafico()
    await utente.click(chip('Crescita'))
    within(pannello('Strumento')).getByRole('radio', { name: 'Crescita' }).focus()
    await utente.keyboard('{Enter}')
    expect(screen.queryByRole('group', { name: 'Strumento' })).not.toBeInTheDocument()
  })
})

describe('Dataset: i pannelli dei filtri', () => {
  it('un pannello si apre e si chiude, uno alla volta, con aria-expanded', async () => {
    const { utente } = apri()
    await grafico()
    expect(chip('Trattamenti: tutti')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('group', { name: 'Trattamenti' })).toBeNull()

    await utente.click(chip('Trattamenti: tutti'))
    expect(chip('Trattamenti: tutti')).toHaveAttribute('aria-expanded', 'true')
    expect(pannello('Trattamenti')).toBeInTheDocument()

    await utente.click(chip('Tutto il periodo'))
    expect(chip('Trattamenti: tutti')).toHaveAttribute('aria-expanded', 'false')
    expect(chip('Tutto il periodo')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByRole('group', { name: 'Trattamenti' })).toBeNull()

    await utente.click(chip('Tutto il periodo'))
    expect(screen.queryByRole('group', { name: 'Periodo' })).toBeNull()
  })

  it('Esc chiude il pannello', async () => {
    const { utente } = apri()
    await grafico()
    await utente.click(chip('Trattamenti: tutti'))
    await utente.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Trattamenti' })).toBeNull()
  })

  it('strumenti: scelta singola, con gli archiviati in fondo', async () => {
    config.strumenti[2] = { ...config.strumenti[2], archiviato: true }
    const { utente } = apri()
    await grafico()
    await utente.click(chip('Crescita'))
    const nomi = within(pannello('Strumento')).getAllByRole('radio').map(r => r.textContent)
    expect(nomi).toEqual(['Crescita', 'Fenologici', 'Vuoto', 'Umidità (archiviato)'])
    expect(within(pannello('Strumento')).getByRole('radio', { name: 'Crescita' })).toHaveAttribute('aria-checked', 'true')
  })

  it('parametri: il testo si sceglie ma è «solo tabella», l\'archiviato sta in fondo', async () => {
    useCampoStore.setState({ stato: { E: { strumentoId: strumento('Fenologici').id } } })
    const { utente } = apri()
    await screen.findByRole('button', { name: 'Fenologici' })
    await utente.click(chip('Palchi'))
    expect(within(pannello('Parametro')).getAllByRole('radio').map(r => r.textContent)).toEqual(['Palchi', 'Note (solo tabella)'])
  })

  it('trattamenti: più scelte con aria-pressed, «Tutti» le toglie', async () => {
    const { utente } = apri()
    await grafico()
    await utente.click(chip('Trattamenti: tutti'))
    const p = within(pannello('Trattamenti'))
    expect(p.getByRole('button', { name: 'Tutti' })).toHaveAttribute('aria-pressed', 'true')
    await utente.click(p.getByRole('button', { name: 'Controllo + No' }))
    await utente.click(p.getByRole('button', { name: 'S1 + Sì' }))
    expect(p.getByRole('button', { name: 'Controllo + No' })).toHaveAttribute('aria-pressed', 'true')
    expect(p.getByRole('button', { name: 'Tutti' })).toHaveAttribute('aria-pressed', 'false')
    expect(parametriUrl().get('t')).toBe(`${trattamento('Controllo + No').id},${trattamento('S1 + Sì').id}`)
    expect(chip('Trattamenti: 2 di 4')).toBeInTheDocument()
    expect(legenda().getAllByRole('listitem').map(li => li.textContent)).toEqual(['Controllo + No', 'S1 + Sì'])

    await utente.click(p.getByRole('button', { name: 'Tutti' }))
    expect(parametriUrl().get('t')).toBeNull()
    expect(legenda().getAllByRole('listitem')).toHaveLength(4)
  })

  it('fattore: un livello per fattore, «Tutti» lo toglie; più fattori in «e»', async () => {
    const { utente } = apri()
    await grafico()
    const [stress, hydrochar] = config.fattori
    await utente.click(chip('Fattore: tutti'))
    const gruppoStress = within(screen.getByRole('group', { name: stress.nome }))
    await utente.click(gruppoStress.getByRole('button', { name: 'S1' }))
    expect(legenda().getAllByRole('listitem').map(li => li.textContent)).toEqual(['S1 + No', 'S1 + Sì'])
    await utente.click(gruppoStress.getByRole('button', { name: 'Controllo' }))
    expect(parametriUrl().get('f')).toBe(stress.livelli[0].id) // un solo livello per fattore
    await utente.click(within(screen.getByRole('group', { name: hydrochar.nome })).getByRole('button', { name: 'Sì' }))
    expect(parametriUrl().get('f')).toBe(`${stress.livelli[0].id},${hydrochar.livelli[1].id}`)
    expect(legenda().getAllByRole('listitem').map(li => li.textContent)).toEqual(['Controllo + Sì'])
    expect(chip('Fattori: 2')).toBeInTheDocument()
    await utente.click(gruppoStress.getByRole('button', { name: 'Tutti' }))
    expect(parametriUrl().get('f')).toBe(hydrochar.livelli[1].id)
  })

  it('periodo: «Ultime N settimane» e le date vere che coprono', async () => {
    const { utente } = apri()
    await grafico()
    await utente.click(chip('Tutto il periodo'))
    const p = within(pannello('Periodo'))
    expect(p.getAllByRole('radio').map(r => r.textContent)).toEqual([
      'Tutto', 'Ultime 2 settimane', 'Ultime 4 settimane', 'Ultime 8 settimane', 'Dal… al…',
    ])
    await utente.click(p.getByRole('radio', { name: 'Ultime 4 settimane' }))
    expect(parametriUrl().get('per')).toBe('4s')
    expect(p.getByText('Dal 01/10/2026 al 28/10/2026')).toBeInTheDocument() // 28 giorni compresi, fino a oggi
  })

  it('periodo «Dal… al…»: scrive nella URL solo date giuste, e dice quando l\'ordine è sbagliato', async () => {
    const { utente } = apri()
    await grafico()
    await utente.click(chip('Tutto il periodo'))
    const p = within(pannello('Periodo'))
    await utente.click(p.getByRole('radio', { name: 'Dal… al…' }))
    fireEvent.change(p.getByLabelText('Dal'), { target: { value: '2026-10-01' } })
    expect(parametriUrl().get('per')).toBeNull() // manca ancora la fine
    fireEvent.change(p.getByLabelText('Al'), { target: { value: '2026-10-08' } })
    expect(parametriUrl().get('per')).toBe('2026-10-01_2026-10-08')
    expect(chip('Dal 01/10 al 08/10')).toBeInTheDocument()

    fireEvent.change(p.getByLabelText('Dal'), { target: { value: '2026-10-20' } })
    expect(p.getByText('La data di inizio deve venire prima di quella di fine.')).toBeInTheDocument()
    expect(parametriUrl().get('per')).toBe('2026-10-01_2026-10-08') // resta l'ultima vista giusta
  })
})

describe('Dataset: periodo di un esperimento concluso', () => {
  beforeEach(() => { config.esperimento.stato = 'concluso' })

  it('le ultime 2 settimane finiscono all\'ultima misura, non a oggi', async () => {
    const { utente } = apri('?per=2s')
    await grafico()
    await utente.click(screen.getByRole('button', { name: 'Mostra i valori' }))
    const tabella = screen.getByRole('table')
    // 14 giorni da 15/10 compreso: restano l'8 e il 15, non l'1
    expect(within(tabella).getByText('15/10/2026')).toBeInTheDocument()
    expect(within(tabella).getByText('08/10/2026')).toBeInTheDocument()
    expect(within(tabella).queryByText('01/10/2026')).toBeNull()
  })

  it('finché l\'ultima data non è arrivata non mostra né calcola un intervallo', async () => {
    vi.mocked(ultimaMisuraPerStrumento).mockImplementation(() => new Promise(() => {}))
    const { utente } = apri('?per=2s')
    expect(await screen.findByText('Calcolo del periodo…')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mostra i valori' })).toBeNull()
    await utente.click(chip('Ultime 2 settimane'))
    expect(within(pannello('Periodo')).queryByText(/^Dal \d\d\/\d\d\/\d{4} al/)).toBeNull()
  })

  it('un esperimento in corso conta le settimane da oggi', async () => {
    config.esperimento.stato = 'in_corso'
    const { utente } = apri('?per=2s')
    await grafico()
    await utente.click(screen.getByRole('button', { name: 'Mostra i valori' }))
    // 28/10 meno 13 giorni = 15/10: solo il rilievo del 15
    const tabella = screen.getByRole('table')
    expect(within(tabella).getByText('15/10/2026')).toBeInTheDocument()
    expect(within(tabella).queryByText('08/10/2026')).toBeNull()
  })
})

describe('Dataset: ricerca delle piante', () => {
  it('corrispondenza esatta: 3 non trova la 13; le non trovate si dicono', async () => {
    const { utente } = apri()
    await grafico()
    await utente.click(chip('Piante'))
    const campo = within(pannello('Piante')).getByLabelText('Cerca piante')
    expect(campo).toHaveAttribute('placeholder', 'es. 3, 12, 35')
    await utente.type(campo, '3')
    expect(parametriUrl().get('cerca')).toBe('3')
    expect(legenda().getAllByRole('listitem').map(li => li.textContent)).toEqual(['Pianta 3 (Controllo + Sì)', 'Media Controllo + Sì'])
    expect(screen.queryByText(/Non trovat/)).toBeNull()

    await utente.type(campo, ', 99')
    expect(parametriUrl().get('cerca')).toBe('3, 99')
    expect(screen.getByText('Non trovata: 99')).toBeInTheDocument()
    expect(chip('Piante: 3, 99')).toBeInTheDocument()

    await utente.type(campo, ', 100')
    expect(screen.getByText('Non trovate: 99, 100')).toBeInTheDocument()
  })

  it('la ricerca vince su trattamenti e fattore, e lo dice', async () => {
    apri(`?t=${trattamento('Controllo + No').id}&cerca=A4`)
    await grafico()
    expect(screen.getByText('La ricerca sostituisce trattamenti e fattore.')).toBeInTheDocument()
    expect(legenda().getAllByRole('listitem').map(li => li.textContent)).toEqual(['Pianta A4 (S1 + Sì)', 'Media S1 + Sì'])
  })

  it('senza filtri di trattamento e fattore non dice nulla della precedenza', async () => {
    apri('?cerca=A4')
    await grafico()
    expect(screen.queryByText(/La ricerca sostituisce/)).toBeNull()
  })

  it('una pianta cercata solo non trovata lascia i filtri di prima e lo dice', async () => {
    apri('?cerca=99')
    await grafico()
    expect(screen.getByText('Non trovata: 99')).toBeInTheDocument()
    expect(legenda().getAllByRole('listitem')).toHaveLength(4)
  })

  it('dice quando si cercano più piante di quante il grafico ne disegna', async () => {
    config.piante = Array.from({ length: 10 }, (_, i) => ({
      id: crypto.randomUUID(), trattamento_id: config.trattamenti[0].id, etichetta: `P${i + 1}`, blocco: null, ordine: i,
    }))
    db = config.piante.map((p, i) => ({
      id: `x${i}`, pianta_id: p.id, strumento_id: strumento('Crescita').id, data_rilievo: '2026-10-01', ora: '09:00',
      valori: { [par('Altezza').id]: [40 + i] },
    }))
    apri(`?cerca=${encodeURIComponent(config.piante.map(p => p.etichetta).join(','))}`)
    await grafico()
    expect(screen.getByText('Il grafico mostra le prime 8 piante, altre 2 non sono disegnate. Cerca meno piante per vederle tutte.')).toBeInTheDocument()
  })

  it('una ricerca enorme nella URL viene limitata e lo dice', async () => {
    const enorme = Array.from({ length: 300 }, (_, i) => `Z${i}`).join(',')
    const { utente } = apri(`?cerca=${encodeURIComponent(enorme)}`)
    await grafico()
    await utente.click(chip(/^Piante/))
    expect(screen.getByText('Si cercano solo i primi 200 pezzi.')).toBeInTheDocument()
  })
})

describe('Dataset: grafico e valori', () => {
  it('prima il grafico; la tabella solo dopo «Mostra i valori», con gli stessi numeri', async () => {
    const { utente } = apri()
    await grafico()
    expect(screen.queryByRole('table')).toBeNull()
    const apre = screen.getByRole('button', { name: 'Mostra i valori' })
    expect(apre).toHaveAttribute('aria-expanded', 'false')

    await utente.click(apre)
    expect(apre).toHaveAttribute('aria-expanded', 'true')
    const tabella = screen.getByRole('table')
    const celle = within(tabella).getAllByRole('cell').map(c => c.textContent)
    // Controllo + No: due piante per giorno; tutte le altre una sola (nessun errore standard)
    for (const atteso of ['41 ± 1', '45 ± 1', '49 ± 1', '30', '32', '34', '50', '54', '60', '64']) expect(celle).toContain(atteso)
    expect(within(tabella).getAllByRole('cell', { name: 'n 2' })).toHaveLength(3)
    // dalla data più recente
    expect(within(tabella).getAllByTestId('data-gruppo').map(t => t.textContent)).toEqual(['15/10/2026', '08/10/2026', '01/10/2026'])

    // gli stessi numeri della lettura del grafico alla stessa data
    areaGrafico().focus()
    fireEvent.keyDown(areaGrafico(), { key: 'End' })
    const lettura = screen.getByTestId('lettura')
    expect(lettura).toHaveTextContent('15/10/2026')
    expect(lettura).toHaveTextContent('Controllo + No 49 ± 1 (n 2)')
    expect(lettura).toHaveTextContent('Controllo + Sì 34 (n 1)')
    expect(within(tabella).getByRole('row', { name: /Controllo \+ No.*49 ± 1.*n 2/ })).toBeInTheDocument()

    await utente.click(apre)
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('la tabella scorre in orizzontale dentro il suo contenitore', async () => {
    const { utente } = apri()
    await grafico()
    await utente.click(screen.getByRole('button', { name: 'Mostra i valori' }))
    const contenitore = screen.getByRole('table').closest('[data-slot="tabella-valori"]') as HTMLElement
    expect(contenitore.className).toContain('overflow-x-auto')
  })

  it('con le piante cercate, la tabella ha il valore della pianta e la media del trattamento in riferimento', async () => {
    const { utente } = apri('?cerca=1&per=2026-10-15_2026-10-15')
    await grafico()
    await utente.click(screen.getByRole('button', { name: 'Mostra i valori' }))
    const tabella = screen.getByRole('table')
    expect(within(tabella).getByRole('row', { name: /Pianta 1 \(Controllo \+ No\).*48.*n 1/ })).toBeInTheDocument()
    expect(within(tabella).getByRole('row', { name: /Media Controllo \+ No.*49 ± 1.*n 2/ })).toBeInTheDocument()
  })

  it('i sì/no sono percentuali, senza ± e con n', async () => {
    const vigore = parametro('Vigoroso', { tipo: 'sino', ordine: 7 })
    config.parametri.push(vigore)
    const feno = strumento('Fenologici')
    feno.parametri.push({ parametro_id: vigore.id, obbligatorio: false, ordine: 2 })
    db = ['1', '2'].map((e, i) => ({
      id: `s${i}`, pianta_id: pianta(e).id, strumento_id: feno.id, data_rilievo: '2026-10-01', ora: '09:00',
      valori: { [vigore.id]: i === 0 },
    }))
    const { utente } = apri(`?s=${feno.id}&p=${vigore.id}`)
    await grafico()
    await utente.click(screen.getByRole('button', { name: 'Mostra i valori' }))
    const tabella = screen.getByRole('table')
    expect(within(tabella).getByRole('cell', { name: '50%' })).toBeInTheDocument()
    expect(within(tabella).getByRole('cell', { name: 'n 2' })).toBeInTheDocument()
  })

  it('un parametro di testo non si disegna: la tabella è già aperta, con l\'ultimo testo del giorno', async () => {
    const feno = strumento('Fenologici')
    db = [
      { id: 't1', pianta_id: pianta('1').id, strumento_id: feno.id, data_rilievo: '2026-10-01', ora: '08:00', valori: { [par('Note').id]: 'foglie gialle' } },
      { id: 't2', pianta_id: pianta('1').id, strumento_id: feno.id, data_rilievo: '2026-10-01', ora: '11:00', valori: { [par('Note').id]: 'foglie secche' } },
    ]
    apri(`?s=${feno.id}&p=${par('Note').id}`)
    expect(await screen.findByText('Il testo non si disegna: ecco i valori.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mostra i valori' })).toBeNull()
    const tabella = screen.getByRole('table')
    expect(within(tabella).getByText('foglie secche')).toBeInTheDocument()
    expect(within(tabella).queryByText('foglie gialle')).toBeNull()
    expect(within(tabella).getByText('01/10/2026')).toBeInTheDocument()
  })

  it('non ricalcola le serie a ogni tocco del grafico né ad aprire la tabella', async () => {
    const { utente } = apri()
    await grafico()
    const prima = vi.mocked(serieTrattamenti).mock.calls.length
    expect(prima).toBeGreaterThan(0)
    areaGrafico().focus()
    fireEvent.keyDown(areaGrafico(), { key: 'ArrowRight' })
    fireEvent.pointerDown(areaGrafico(), { clientX: 100, clientY: 100 })
    await utente.click(screen.getByRole('button', { name: 'Mostra i valori' }))
    await utente.click(chip('Trattamenti: tutti'))
    expect(vi.mocked(serieTrattamenti).mock.calls.length).toBe(prima)
  })
})

describe('Dataset: note del Diario', () => {
  it('una nota si segna sul grafico e «Apri nel Diario» porta alla nota', async () => {
    note = [nota('n1', '2026-10-08', 'Irrigazione abbondante')]
    const { utente } = apri()
    await grafico()
    areaGrafico().focus()
    fireEvent.keyDown(areaGrafico(), { key: 'Home' })
    fireEvent.keyDown(areaGrafico(), { key: 'ArrowRight' })
    expect(screen.getByTestId('lettura')).toHaveTextContent('08/10/2026')
    expect(screen.getByTestId('lettura')).toHaveTextContent('Irrigazione abbondante')
    await utente.click(screen.getByRole('button', { name: 'Apri nel Diario' }))
    expect(screen.getByTestId('diario')).toHaveTextContent('{"apriNota":"n1"}')
  })

  it('le note di altre piante non compaiono quando si cercano solo certe piante', async () => {
    note = [nota('n1', '2026-10-08', 'Solo pianta 13', { pianta_ids: [pianta('13').id] })]
    apri('?cerca=1')
    await grafico()
    areaGrafico().focus()
    fireEvent.keyDown(areaGrafico(), { key: 'Home' })
    fireEvent.keyDown(areaGrafico(), { key: 'ArrowRight' })
    expect(screen.getByTestId('lettura')).not.toHaveTextContent('Solo pianta 13')
  })

  it('se le note non si leggono lo dice, e il grafico c\'è', async () => {
    vi.mocked(listaNote).mockRejectedValue(new Error('rete'))
    apri()
    await grafico()
    expect(await screen.findByText('Le note del Diario non si sono caricate, quindi non compaiono sul grafico.')).toBeInTheDocument()
  })
})

describe('Dataset: Scarica questa vista', () => {
  it('apre Esporta con gli stessi filtri', async () => {
    const { utente } = apri(`?per=4s&t=${trattamento('S1 + No').id}&cerca=A4,%203`)
    await grafico()
    const link = screen.getByRole('link', { name: 'Scarica questa vista' })
    const atteso = new URLSearchParams({
      s: strumento('Crescita').id, p: par('Altezza').id, t: trattamento('S1 + No').id, per: '4s', cerca: 'A4, 3',
    })
    expect(link).toHaveAttribute('href', `/esperimenti/E/esporta?${atteso.toString()}`)
    await utente.click(link)
    expect(posizione()).toBe(`/esperimenti/E/esporta?${atteso.toString()}`)
  })
})

describe('Dataset: stati', () => {
  it('mentre legge dice «Carico le misure»', async () => {
    vi.mocked(misureStrumento).mockImplementation(() => new Promise(() => {}))
    apri()
    expect(await screen.findByText('Carico le misure…')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
    expect(chip('Crescita')).toBeInTheDocument() // i filtri ci sono già
  })

  it('errore di lettura: lo dice con «Riprova», che rilegge', async () => {
    vi.mocked(misureStrumento).mockRejectedValueOnce(new Error('rete'))
    const { utente } = apri()
    const avviso = await screen.findByRole('alert')
    expect(within(avviso).getByRole('button', { name: 'Riprova' })).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
    await utente.click(within(avviso).getByRole('button', { name: 'Riprova' }))
    await grafico()
    expect(misureStrumento).toHaveBeenCalledTimes(2)
  })

  it('errore sulla configurazione: «Riprova»', async () => {
    vi.mocked(caricaConfig).mockRejectedValueOnce(new Error('rete'))
    const { utente } = apri()
    const avviso = await screen.findByRole('alert')
    await utente.click(within(avviso).getByRole('button', { name: 'Riprova' }))
    await grafico()
  })

  it('nessuno strumento: rimanda alle Impostazioni', async () => {
    config.strumenti = []
    apri()
    expect(await screen.findByText('Aggiungi uno strumento nelle Impostazioni.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Apri le Impostazioni' })).toHaveAttribute('href', '/esperimenti/E/impostazioni')
    expect(screen.queryByRole('group', { name: 'Filtri' })).toBeNull()
    expect(misureStrumento).not.toHaveBeenCalled()
  })

  it('nessuna misura per lo strumento', async () => {
    const { utente } = apri()
    await grafico()
    await utente.click(chip('Crescita'))
    await utente.click(within(pannello('Strumento')).getByRole('radio', { name: 'Vuoto' }))
    expect(await screen.findByText('Nessuna misura per questo strumento.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mostra i valori' })).toBeNull()
  })

  it('nessun dato con questi filtri: «Azzera i filtri» li toglie e torna il grafico', async () => {
    const { utente } = apri('?per=2030-01-01_2030-01-31')
    expect(await screen.findByText('Nessun dato con questi filtri.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mostra i valori' })).toBeNull()
    await utente.click(screen.getByRole('button', { name: 'Azzera i filtri' }))
    expect(parametriUrl().get('per')).toBeNull()
    await grafico()
  })

  it('un parametro senza nessuna misura e senza filtri non offre «Azzera i filtri»', async () => {
    const { utente } = apri()
    await grafico()
    await utente.click(chip('Altezza'))
    await utente.click(within(pannello('Parametro')).getByRole('radio', { name: 'Vecchio (archiviato)' }))
    expect(await screen.findByText('Nessun dato per questo parametro.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Azzera i filtri' })).toBeNull()
  })
})
