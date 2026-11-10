import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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
vi.mock('@/api/foto', () => ({
  listaFoto: vi.fn(), urlFoto: vi.fn(), caricaFoto: vi.fn(), eliminaFoto: vi.fn(), aggiornaFoto: vi.fn(),
  VALIDITA_URL_SECONDI: 3600,
}))
vi.mock('@/lib/immagini', () => ({ dataDiScatto: vi.fn() }))
vi.mock('@/lib/toastSalvato', () => ({ toastSalvato: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(() => 'id-toast'), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn(), warning: vi.fn() }) }))

import { toast } from 'sonner'
import { useSessione } from '@/api/auth'
import { caricaConfig } from '@/api/esperimenti'
import { aggiornaFoto, caricaFoto, eliminaFoto, listaFoto, urlFoto } from '@/api/foto'
import { sonoAdmin } from '@/api/inviti'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import type { ConfigEsperimento, Foto as FotoTipo } from '@/domain/tipi'
import { ATTESA_ANNULLA_MS } from '@/lib/eliminaConAnnulla'
import { dataDiScatto } from '@/lib/immagini'
import { Foto } from './Foto'

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session

let config: ConfigEsperimento
/** Le foto "nel database": le funzioni dell'API finta le leggono e le cambiano. */
let db: FotoTipo[]

const idPianta = (etichetta: string) => config.piante.find(p => p.etichetta === etichetta)!.id
const trattamentoDi = (etichetta: string) => config.trattamenti.find(t => t.id === config.piante.find(p => p.etichetta === etichetta)!.trattamento_id)!

const foto = (id: string, extra: Partial<FotoTipo> = {}): FotoTipo => ({
  id, data: '2026-10-28', percorso: `E/${id}.jpg`, larghezza: 1600, altezza: 1200, byte: 200000,
  pianta_id: null, nota_id: null, archiviata: false, archiviata_il: null, ...extra,
})

function apri() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalida = vi.spyOn(client, 'invalidateQueries')
  const resa = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/esperimenti/E', '/esperimenti/E/foto']} initialIndex={1}>
        <Routes>
          <Route path="/esperimenti/:espId/foto" element={<Foto />} />
          <Route path="*" element={<p>Schermata in campo</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { client, invalida, resa, utente: userEvent.setup({ delay: null }) }
}

const miniature = () => within(screen.getByRole('list', { name: 'Foto' })).getAllByRole('button')
const miniatura = (nome: string | RegExp) => screen.getByRole('button', { name: nome })
const visore = () => screen.getByRole('dialog')
const nelVisore = () => within(visore())
const attesa = () => screen.findByRole('list', { name: 'Foto' })

/** L'azione "Annulla" del toast di eliminazione mostrato per ultimo. */
function azioneAnnulla() {
  const [, opzioni] = vi.mocked(toast).mock.calls.at(-1) as unknown as [string, { action: { label: string; onClick: () => void } }]
  return opzioni.action
}

beforeEach(() => {
  vi.clearAllMocks()
  config = bozzaHydrochar(SEMI_CATALOGO)
  config.esperimento.id = 'E'
  db = []
  vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(caricaConfig).mockResolvedValue(config)
  vi.mocked(dataDiScatto).mockResolvedValue(null)
  vi.mocked(listaFoto).mockImplementation(async () => structuredClone(db))
  vi.mocked(urlFoto).mockImplementation(async percorsi => new Map(percorsi.map(p => [p, `https://storage/${p}?firma=1`])))
  vi.mocked(aggiornaFoto).mockImplementation(async (_e, id, patch) => { db = db.map(f => (f.id === id ? { ...f, ...patch } : f)) })
  vi.mocked(eliminaFoto).mockImplementation(async (_e, f) => { db = db.filter(x => x.id !== f.id); return { fileRimosso: true } })
  vi.mocked(caricaFoto).mockImplementation(async (_e, d) => {
    const nuova = foto(d.id, { data: d.data, pianta_id: d.piantaId ?? null, nota_id: d.notaId ?? null })
    db.unshift(nuova)
    return nuova
  })
})

afterEach(() => { vi.useRealTimers() })

describe('Foto: la galleria', () => {
  it('ha il titolo «Foto» e la freccia indietro alla home dell\'esperimento', async () => {
    apri()
    expect(await screen.findByRole('heading', { level: 1, name: 'Foto' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/esperimenti/E')
  })

  it('senza foto lo dice, spiega come aggiungerne e non mostra i filtri', async () => {
    apri()
    expect(await screen.findByText('Nessuna foto.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Foto' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Cerca pianta')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Aggiungi foto' })).toBeInTheDocument()
  })

  it('un errore di lettura si mostra con Riprova', async () => {
    vi.mocked(listaFoto).mockRejectedValueOnce(new Error('Il server non risponde.'))
    const { utente } = apri()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await utente.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(await screen.findByText('Nessuna foto.')).toBeInTheDocument()
  })

  it('raggruppa per giorno, dal più recente, con la data nel font dei dati e il numero di foto', async () => {
    db = [
      foto('a', { data: '2026-10-30' }), foto('b', { data: '2026-10-28' }), foto('c', { data: '2026-10-28' }),
    ]
    apri()
    await attesa()
    const titoli = screen.getAllByRole('heading', { level: 2 })
    expect(titoli.map(t => t.textContent)).toEqual(['30/10/2026', '28/10/2026'])
    expect(titoli[0].className).toMatch(/font-mono/)
    expect(screen.getByText('3 foto')).toBeInTheDocument()
    expect(miniature()).toHaveLength(3)
  })

  it('le miniature usano gli URL firmati, caricati a richiesta, e hanno un nome con data e pianta', async () => {
    db = [foto('a', { pianta_id: idPianta('35') }), foto('b', { data: '2026-10-27' })]
    apri()
    await attesa()
    await waitFor(() => expect(document.querySelectorAll('img')).toHaveLength(2))
    const immagini = Array.from(document.querySelectorAll('img'))
    expect(immagini.map(i => i.getAttribute('src'))).toEqual(['https://storage/E/a.jpg?firma=1', 'https://storage/E/b.jpg?firma=1'])
    expect(immagini.every(i => i.getAttribute('loading') === 'lazy')).toBe(true)
    expect(miniatura('Foto del 28/10/2026, pianta 35')).toBeInTheDocument()
    expect(miniatura('Foto del 27/10/2026')).toBeInTheDocument()
    expect(urlFoto).toHaveBeenCalledWith(['E/a.jpg', 'E/b.jpg'])
  })

  it('una foto archiviata non ha il file: segnaposto, e l\'URL non si chiede', async () => {
    db = [foto('a'), foto('z', { archiviata: true })]
    apri()
    await attesa()
    await waitFor(() => expect(urlFoto).toHaveBeenCalled())
    expect(urlFoto).toHaveBeenCalledWith(['E/a.jpg'])
    expect(vi.mocked(urlFoto).mock.calls.flat(2)).not.toContain('E/z.jpg')
    expect(screen.getAllByText('Archiviata nel .zip')).toHaveLength(1)
    expect(document.querySelectorAll('img')).toHaveLength(1)
  })

  it('il segnaposto di una foto archiviata dice il giorno dell\'archiviazione', async () => {
    db = [foto('z', { archiviata: true, archiviata_il: '2026-11-03T12:00:00Z' })]
    apri()
    await attesa()
    expect(screen.getByText('Archiviata nel .zip del 03/11')).toBeInTheDocument()
  })

  it('le miniature sono bersagli da almeno 44 px', async () => {
    db = [foto('a')]
    apri()
    await attesa()
    expect(miniature()[0].className).toMatch(/aspect-square/)
    expect(miniature()[0].className).toMatch(/min-h-11/)
  })
})

describe('Foto: i filtri', () => {
  beforeEach(() => {
    db = [
      foto('a', { pianta_id: idPianta('1') }),
      foto('b', { pianta_id: idPianta('35') }),
      foto('c', { pianta_id: idPianta('12') }),
      foto('d'),
    ]
  })

  it('per pianta: si scrive l\'etichetta e restano le foto di quelle piante', async () => {
    const { utente } = apri()
    await attesa()
    await utente.type(screen.getByLabelText('Cerca pianta'), '35')
    expect(miniature()).toHaveLength(1)
    expect(miniatura(/pianta 35/)).toBeInTheDocument()
    expect(screen.getByText('1 foto')).toBeInTheDocument()
  })

  it('per trattamento: restano le foto delle piante di quel trattamento', async () => {
    const { utente } = apri()
    await attesa()
    const t = trattamentoDi('35')
    const nPiante = config.piante.filter(p => p.trattamento_id === t.id).map(p => p.etichetta)
    const attese = db.filter(f => f.pianta_id && nPiante.includes(config.piante.find(p => p.id === f.pianta_id)!.etichetta))
    await utente.click(screen.getByRole('button', { name: t.etichetta }))
    expect(screen.getByRole('button', { name: t.etichetta })).toHaveAttribute('aria-pressed', 'true')
    expect(miniature()).toHaveLength(attese.length)
    expect(miniatura(/pianta 35/)).toBeInTheDocument()
  })

  it('«Tutti» toglie il filtro del trattamento', async () => {
    const { utente } = apri()
    await attesa()
    const t = trattamentoDi('35')
    await utente.click(screen.getByRole('button', { name: t.etichetta }))
    await utente.click(screen.getByRole('button', { name: 'Tutti i trattamenti' }))
    expect(miniature()).toHaveLength(4)
  })

  it('senza risultati lo dice e «Azzera i filtri» rimette tutto', async () => {
    const { utente } = apri()
    await attesa()
    await utente.type(screen.getByLabelText('Cerca pianta'), '999')
    expect(screen.getByText('Nessuna foto con questi filtri.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Foto' })).not.toBeInTheDocument()
    await utente.click(screen.getByRole('button', { name: 'Azzera i filtri' }))
    expect(miniature()).toHaveLength(4)
    expect(screen.getByLabelText('Cerca pianta')).toHaveValue('')
  })

  it('cambiare i filtri non rilegge gli URL delle foto', async () => {
    const { utente } = apri()
    await attesa()
    await waitFor(() => expect(urlFoto).toHaveBeenCalledTimes(1))
    await utente.type(screen.getByLabelText('Cerca pianta'), '35')
    expect(urlFoto).toHaveBeenCalledTimes(1)
  })
})

describe('Foto: aggiungere', () => {
  it('«+ Aggiungi foto» sta nella barra delle azioni', async () => {
    apri()
    const pulsante = await screen.findByRole('button', { name: '+ Aggiungi foto' })
    expect(pulsante.closest('[data-slot="barra-azioni"]')).not.toBeNull()
  })

  it('le foto scelte si caricano senza pianta, e dopo la galleria le mostra', async () => {
    const { utente } = apri()
    await screen.findByText('Nessuna foto.')
    await utente.click(screen.getByRole('button', { name: '+ Aggiungi foto' }))
    expect(screen.getByRole('button', { name: 'Scatta' })).toBeInTheDocument()
    fireEvent.change(document.querySelector('input[type="file"][multiple]')!, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } })

    await waitFor(() => expect(caricaFoto).toHaveBeenCalledTimes(1))
    expect(vi.mocked(caricaFoto).mock.calls[0][1]).toMatchObject({ piantaId: null, notaId: null })
    await waitFor(() => expect(miniature()).toHaveLength(1))
  })

  it('lo stato del caricamento si vede nella pagina, non nella barra', async () => {
    let finisci!: () => void
    vi.mocked(caricaFoto).mockImplementationOnce(() => new Promise(ok => { finisci = () => ok(foto('x')) }))
    apri()
    await screen.findByText('Nessuna foto.')
    fireEvent.change(document.querySelector('input[type="file"][capture]')!, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } })
    const stato = await screen.findByText('Caricamento 1 di 1…')
    expect(stato.closest('[data-slot="barra-azioni"]')).toBeNull()
    await act(async () => { finisci() })
  })
})

describe('Foto: il visore', () => {
  beforeEach(() => {
    db = [
      foto('a', { data: '2026-10-30' }),
      foto('b', { data: '2026-10-28', pianta_id: idPianta('35') }),
      foto('c', { data: '2026-10-20' }),
    ]
  })

  async function apriVisore(nome: string | RegExp = 'Foto del 28/10/2026, pianta 35') {
    const r = apri()
    await attesa()
    await r.utente.click(await screen.findByRole('button', { name: nome }))
    return r
  }

  it('toccando una miniatura si apre a schermo intero, come finestra con il suo nome', async () => {
    await apriVisore()
    const d = visore()
    expect(d).toHaveAttribute('aria-modal', 'true')
    expect(d).toHaveAccessibleName('Foto 2 di 3')
    expect(nelVisore().getByText('28/10/2026')).toBeInTheDocument()
    expect(nelVisore().getByText('2 / 3')).toBeInTheDocument()
    await waitFor(() => expect(nelVisore().getByRole('img')).toHaveAttribute('src', 'https://storage/E/b.jpg?firma=1'))
    expect(nelVisore().getByRole('img')).toHaveAccessibleName('Foto del 28/10/2026, pianta 35')
  })

  it('il fuoco entra nella finestra e Esc la chiude riportando il fuoco alla miniatura', async () => {
    const { utente } = await apriVisore()
    expect(visore().contains(document.activeElement)).toBe(true)
    await utente.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(miniatura('Foto del 28/10/2026, pianta 35'))
  })

  it('«Chiudi» chiude il visore', async () => {
    const { utente } = await apriVisore()
    await utente.click(nelVisore().getByRole('button', { name: 'Chiudi' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Tab resta dentro la finestra', async () => {
    const { utente } = await apriVisore()
    const dentro = () => visore().contains(document.activeElement)
    for (let i = 0; i < 25; i++) {
      await utente.tab()
      expect(dentro()).toBe(true)
    }
    for (let i = 0; i < 5; i++) {
      await utente.tab({ shift: true })
      expect(dentro()).toBe(true)
    }
  })

  it('le frecce della tastiera e i pulsanti scorrono tra le foto, senza girare in tondo', async () => {
    const { utente } = await apriVisore('Foto del 30/10/2026')
    expect(nelVisore().getByText('1 / 3')).toBeInTheDocument()
    expect(nelVisore().getByRole('button', { name: 'Foto precedente' })).toBeDisabled()

    await utente.keyboard('{ArrowRight}')
    expect(nelVisore().getByText('2 / 3')).toBeInTheDocument()
    await utente.click(nelVisore().getByRole('button', { name: 'Foto successiva' }))
    expect(nelVisore().getByText('3 / 3')).toBeInTheDocument()
    expect(nelVisore().getByRole('button', { name: 'Foto successiva' })).toBeDisabled()
    await utente.keyboard('{ArrowRight}')
    expect(nelVisore().getByText('3 / 3')).toBeInTheDocument()
    await utente.keyboard('{ArrowLeft}')
    expect(nelVisore().getByText('2 / 3')).toBeInTheDocument()
  })

  it('una strisciata del dito scorre tra le foto', async () => {
    await apriVisore('Foto del 30/10/2026')
    const area = nelVisore().getByTestId('area-foto')
    fireEvent.touchStart(area, { touches: [{ clientX: 300, clientY: 200 }] })
    fireEvent.touchEnd(area, { changedTouches: [{ clientX: 100, clientY: 210 }] })
    expect(nelVisore().getByText('2 / 3')).toBeInTheDocument()
    fireEvent.touchStart(area, { touches: [{ clientX: 100, clientY: 200 }] })
    fireEvent.touchEnd(area, { changedTouches: [{ clientX: 300, clientY: 200 }] })
    expect(nelVisore().getByText('1 / 3')).toBeInTheDocument()
    // Un tocco quasi fermo, o una scorsa in verticale, non cambia foto.
    fireEvent.touchStart(area, { touches: [{ clientX: 100, clientY: 100 }] })
    fireEvent.touchEnd(area, { changedTouches: [{ clientX: 110, clientY: 400 }] })
    expect(nelVisore().getByText('1 / 3')).toBeInTheDocument()
  })

  it('le frecce dentro un campo (la data) non cambiano foto', async () => {
    const { utente } = await apriVisore()
    const campo = nelVisore().getByLabelText('Data')
    campo.focus()
    await utente.keyboard('{ArrowRight}')
    expect(nelVisore().getByText('2 / 3')).toBeInTheDocument()
  })

  it('pulsanti del visore alti almeno 44 px', async () => {
    await apriVisore()
    for (const nome of ['Chiudi', 'Foto precedente', 'Foto successiva', 'Elimina foto']) {
      expect(nelVisore().getByRole('button', { name: nome }).className).toMatch(/size-11|size-12|h-11|h-12|h-13/)
    }
  })

  it('mentre è aperto la pagina sotto non scorre, e quando si chiude torna come prima', async () => {
    const { utente } = await apriVisore()
    expect(document.body.style.overflow).toBe('hidden')
    await utente.keyboard('{Escape}')
    expect(document.body.style.overflow).toBe('')
  })

  it('un URL rinnovato dopo un errore di caricamento riprova a mostrare l\'immagine', async () => {
    vi.mocked(urlFoto).mockImplementationOnce(async percorsi => new Map(percorsi.map(p => [p, `https://storage/${p}?firma=scaduta`])))
    const { utente, client } = await apriVisore()
    const immagine = await waitFor(() => {
      const i = nelVisore().getByRole('img')
      expect(i).toHaveAttribute('src', 'https://storage/E/b.jpg?firma=scaduta')
      return i
    })
    fireEvent.error(immagine)
    expect(await nelVisore().findByText('Foto non disponibile.')).toBeInTheDocument()
    expect(nelVisore().queryByRole('img')).not.toBeInTheDocument()

    // Gli URL si rinnovano: la stessa foto, con la firma nuova, si mostra di nuovo.
    await act(async () => { await client.invalidateQueries({ queryKey: ['urlFoto'] }) })
    await waitFor(() => expect(nelVisore().getByRole('img')).toHaveAttribute('src', 'https://storage/E/b.jpg?firma=1'))
    expect(utente).toBeTruthy()
  })

  it('anche una miniatura rotta si rimostra con l\'URL rinnovato', async () => {
    vi.mocked(urlFoto).mockImplementationOnce(async percorsi => new Map(percorsi.map(p => [p, `https://storage/${p}?firma=scaduta`])))
    const { client } = apri()
    await attesa()
    await waitFor(() => expect(document.querySelectorAll('img')).toHaveLength(3))
    fireEvent.error(document.querySelectorAll('img')[0])
    expect(await screen.findByText('Non disponibile')).toBeInTheDocument()

    await act(async () => { await client.invalidateQueries({ queryKey: ['urlFoto'] }) })
    await waitFor(() => expect(document.querySelectorAll('img')).toHaveLength(3))
    expect(screen.queryByText('Non disponibile')).not.toBeInTheDocument()
  })

  it('una foto archiviata mostra il segnaposto e non ha immagine', async () => {
    db = [foto('z', { archiviata: true })]
    const r = apri()
    await attesa()
    await r.utente.click(miniature()[0])
    expect(nelVisore().getByText('Archiviata nel .zip')).toBeInTheDocument()
    expect(nelVisore().queryByRole('img')).not.toBeInTheDocument()
  })

  it('il segnaposto del visore dice il giorno dell\'archiviazione', async () => {
    db = [foto('z', { archiviata: true, archiviata_il: '2026-11-03T12:00:00Z' })]
    const r = apri()
    await attesa()
    await r.utente.click(miniature()[0])
    expect(nelVisore().getByText('Archiviata nel .zip del 03/11')).toBeInTheDocument()
  })

  describe('la data', () => {
    // Il salvataggio parte da solo dopo una pausa: servono i timer finti (che avanzano anche da soli, per le promesse).
    beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
    afterEach(async () => { await act(() => vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS)) })
    const pausa = () => act(() => vi.advanceTimersByTimeAsync(1000))
    const scrivi = (valore: string) => fireEvent.change(nelVisore().getByLabelText('Data'), { target: { value: valore } })

    it('si salva da sola dopo una pausa, senza pulsante, e la foto mostra la data nuova', async () => {
      const { invalida } = await apriVisore()
      expect((nelVisore().getByLabelText('Data') as HTMLInputElement).value).toBe('2026-10-28')
      expect(nelVisore().queryByRole('button', { name: /Salva data/ })).not.toBeInTheDocument()

      scrivi('2026-10-25')
      expect(aggiornaFoto).not.toHaveBeenCalled()
      await pausa()

      await waitFor(() => expect(aggiornaFoto).toHaveBeenCalledWith('E', 'b', { data: '2026-10-25' }))
      expect(aggiornaFoto).toHaveBeenCalledTimes(1)
      expect(invalida).toHaveBeenCalledWith({ queryKey: ['foto', 'E'] })
      await waitFor(() => expect(nelVisore().getByText('25/10/2026')).toBeInTheDocument())
    })

    it('più modifiche ravvicinate salvano solo l\'ultima', async () => {
      await apriVisore()
      scrivi('2026-10-24')
      await act(() => vi.advanceTimersByTimeAsync(300))
      scrivi('2026-10-25')
      await pausa()
      await waitFor(() => expect(aggiornaFoto).toHaveBeenCalledTimes(1))
      expect(aggiornaFoto).toHaveBeenCalledWith('E', 'b', { data: '2026-10-25' })
    })

    it('chiudendo il visore prima della pausa la data scritta si salva subito: non si perde', async () => {
      const { utente } = await apriVisore()
      scrivi('2026-10-25')
      await utente.click(nelVisore().getByRole('button', { name: 'Chiudi' }))

      await waitFor(() => expect(aggiornaFoto).toHaveBeenCalledWith('E', 'b', { data: '2026-10-25' }))
      expect(aggiornaFoto).toHaveBeenCalledTimes(1)
    })

    it('scorrendo a un\'altra foto prima della pausa la data scritta si salva sulla foto giusta', async () => {
      const { utente } = await apriVisore()
      scrivi('2026-10-25')
      await utente.click(nelVisore().getByRole('button', { name: 'Foto successiva' }))

      await waitFor(() => expect(aggiornaFoto).toHaveBeenCalledWith('E', 'b', { data: '2026-10-25' }))
      expect((nelVisore().getByLabelText('Data') as HTMLInputElement).value).toBe('2026-10-20')
      await pausa()
      expect(aggiornaFoto).toHaveBeenCalledTimes(1)
    })

    it('una data vuota o incompleta non si salva, né da sola né uscendo', async () => {
      const { utente } = await apriVisore()
      scrivi('')
      await pausa()
      scrivi('0002-10-28')
      await pausa()
      await utente.click(nelVisore().getByRole('button', { name: 'Chiudi' }))
      await pausa()
      expect(aggiornaFoto).not.toHaveBeenCalled()
    })

    it('una data tornata uguale a quella salvata non scrive niente', async () => {
      const { utente } = await apriVisore()
      scrivi('2026-10-25')
      scrivi('2026-10-28')
      await pausa()
      await utente.click(nelVisore().getByRole('button', { name: 'Chiudi' }))
      expect(aggiornaFoto).not.toHaveBeenCalled()
    })

    it('un errore resta in vista con la data scritta e «Riprova»; non si ripete da solo', async () => {
      vi.mocked(aggiornaFoto).mockRejectedValueOnce(new Error('Il server non risponde.'))
      const { utente } = await apriVisore()
      scrivi('2026-10-25')
      await pausa()

      expect(await nelVisore().findByRole('alert')).toHaveTextContent('Il server non risponde.')
      expect((nelVisore().getByLabelText('Data') as HTMLInputElement).value).toBe('2026-10-25')
      await act(() => vi.advanceTimersByTimeAsync(5000))
      expect(aggiornaFoto).toHaveBeenCalledTimes(1)

      await utente.click(nelVisore().getByRole('button', { name: 'Riprova' }))
      await waitFor(() => expect(aggiornaFoto).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(nelVisore().queryByRole('alert')).not.toBeInTheDocument())
    })

    it('se uscendo il salvataggio fallisce, un toast che resta lo dice', async () => {
      vi.mocked(aggiornaFoto).mockRejectedValueOnce(new Error('Il server non risponde.'))
      const { utente } = await apriVisore()
      scrivi('2026-10-25')
      await utente.click(nelVisore().getByRole('button', { name: 'Chiudi' }))

      await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
      const [testo, opzioni] = vi.mocked(toast.error).mock.calls[0]
      expect(testo).toContain('La data della foto non è stata salvata')
      expect(opzioni).toMatchObject({ duration: Infinity })
    })
  })

  describe('il collegamento', () => {
    it('mostra la pianta collegata e permette di sceglierne un\'altra', async () => {
      const { utente } = await apriVisore()
      const scelta = nelVisore().getByLabelText('Pianta') as HTMLSelectElement
      expect(scelta.value).toBe(idPianta('35'))
      await utente.selectOptions(scelta, idPianta('12'))
      await waitFor(() => expect(aggiornaFoto).toHaveBeenCalledWith('E', 'b', { pianta_id: idPianta('12') }))
    })

    it('«Nessuna pianta» scollega la foto', async () => {
      const { utente } = await apriVisore()
      await utente.selectOptions(nelVisore().getByLabelText('Pianta'), '')
      await waitFor(() => expect(aggiornaFoto).toHaveBeenCalledWith('E', 'b', { pianta_id: null }))
    })

    it('una foto senza pianta parte da «Nessuna pianta»', async () => {
      const { utente } = await apriVisore('Foto del 30/10/2026')
      expect((nelVisore().getByLabelText('Pianta') as HTMLSelectElement).value).toBe('')
      await utente.selectOptions(nelVisore().getByLabelText('Pianta'), idPianta('1'))
      await waitFor(() => expect(aggiornaFoto).toHaveBeenCalledWith('E', 'a', { pianta_id: idPianta('1') }))
    })

    it('un errore resta in vista', async () => {
      vi.mocked(aggiornaFoto).mockRejectedValueOnce(new Error('Il server non risponde.'))
      const { utente } = await apriVisore()
      await utente.selectOptions(nelVisore().getByLabelText('Pianta'), '')
      expect(await nelVisore().findByRole('alert')).toHaveTextContent('Il server non risponde.')
    })

    it('una foto allegata a una nota lo dice', async () => {
      db = [foto('n', { nota_id: 'nota-1' })]
      const r = apri()
      await attesa()
      await r.utente.click(miniature()[0])
      expect(nelVisore().getByText('Allegata a una nota del Diario.')).toBeInTheDocument()
    })
  })

  describe('l\'eliminazione', () => {
    beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
    afterEach(async () => { await act(() => vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS * 2)) })

    it('la foto sparisce subito, il visore passa alla successiva e il toast dà 5 secondi per annullare', async () => {
      const { utente } = await apriVisore()
      await utente.click(nelVisore().getByRole('button', { name: 'Elimina foto' }))

      expect(toast).toHaveBeenCalledWith('Foto eliminata.', expect.objectContaining({ duration: ATTESA_ANNULLA_MS }))
      expect(eliminaFoto).not.toHaveBeenCalled()
      expect(nelVisore().getByText('2 / 2')).toBeInTheDocument()
      expect(nelVisore().getByText('20/10/2026')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Foto del 28/10/2026, pianta 35' })).not.toBeInTheDocument()
    })

    it('allo scadere elimina davvero e la foto non ricompare', async () => {
      const { utente } = await apriVisore()
      await utente.click(nelVisore().getByRole('button', { name: 'Elimina foto' }))
      await act(() => vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS))

      await waitFor(() => expect(eliminaFoto).toHaveBeenCalledTimes(1))
      expect(vi.mocked(eliminaFoto).mock.calls[0][0]).toBe('E')
      expect(vi.mocked(eliminaFoto).mock.calls[0][1]).toMatchObject({ id: 'b' })
      await waitFor(() => expect(db.map(f => f.id)).toEqual(['a', 'c']))
      expect(screen.queryByRole('button', { name: 'Foto del 28/10/2026, pianta 35' })).not.toBeInTheDocument()
    })

    it('«Annulla» rimette la foto al suo posto e non elimina mai', async () => {
      const { utente } = await apriVisore()
      await utente.click(nelVisore().getByRole('button', { name: 'Elimina foto' }))
      act(() => azioneAnnulla().onClick())
      await act(() => vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS * 2))

      expect(eliminaFoto).not.toHaveBeenCalled()
      expect(nelVisore().getByText('3 / 3')).toBeInTheDocument()
      // Chiuso il visore, la miniatura c'è.
      await utente.keyboard('{Escape}')
      expect(miniature()).toHaveLength(3)
    })

    it('eliminando l\'ultima foto che resta il visore si chiude', async () => {
      db = [foto('solo')]
      const r = apri()
      await attesa()
      await r.utente.click(miniature()[0])
      await r.utente.click(nelVisore().getByRole('button', { name: 'Elimina foto' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(await screen.findByText('Nessuna foto.')).toBeInTheDocument()
    })

    it('eliminando l\'ultima della fila il visore passa alla precedente', async () => {
      const { utente } = await apriVisore('Foto del 20/10/2026')
      await utente.click(nelVisore().getByRole('button', { name: 'Elimina foto' }))
      expect(nelVisore().getByText('2 / 2')).toBeInTheDocument()
      expect(nelVisore().getByText('28/10/2026')).toBeInTheDocument()
    })

    it('se l\'elenco viene riletto dal server nei 5 secondi la foto in eliminazione non riappare', async () => {
      const { utente, client } = await apriVisore()
      await utente.click(nelVisore().getByRole('button', { name: 'Elimina foto' }))
      await utente.keyboard('{Escape}')
      expect(miniature()).toHaveLength(2)

      // Il server ha ancora la foto: ha risposto prima dell'eliminazione vera. Si aspetta che la rilettura sia arrivata nella
      // cache (con 3 foto) e che la pagina si sia ridisegnata: senza, "non riappare" sarebbe vero per forza.
      await act(async () => { await client.invalidateQueries({ queryKey: ['foto', 'E'] }) })
      await waitFor(() => expect(client.getQueryData<unknown[]>(['foto', 'E'])).toHaveLength(3))
      await act(() => vi.advanceTimersByTimeAsync(100))
      expect(listaFoto).toHaveBeenCalledTimes(2)
      expect(eliminaFoto).not.toHaveBeenCalled()
      expect(miniature()).toHaveLength(2)
      expect(screen.queryByRole('button', { name: 'Foto del 28/10/2026, pianta 35' })).not.toBeInTheDocument()
    })

    it('eliminando dal visore il fuoco resta nella finestra, sulla foto che segue', async () => {
      const { utente } = await apriVisore()
      await utente.click(nelVisore().getByRole('button', { name: 'Elimina foto' }))
      expect(visore().contains(document.activeElement)).toBe(true)
      expect(document.activeElement).not.toBe(document.body)
    })

    it('eliminando l\'ultima foto il fuoco va al pulsante «+ Aggiungi foto», non sul body', async () => {
      db = [foto('solo')]
      const r = apri()
      await attesa()
      await r.utente.click(miniature()[0])
      await r.utente.click(nelVisore().getByRole('button', { name: 'Elimina foto' }))
      await screen.findByText('Nessuna foto.')
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '+ Aggiungi foto' })))
    })

    it('eliminando l\'ultima foto di un filtro il fuoco non finisce sul body', async () => {
      const r = apri()
      await attesa()
      await r.utente.type(screen.getByLabelText('Cerca pianta'), '35')
      await r.utente.click(miniature()[0])
      await r.utente.click(nelVisore().getByRole('button', { name: 'Elimina foto' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await waitFor(() => expect(document.activeElement).not.toBe(document.body))
    })

    it('se il file non si è tolto avvisa con un messaggio non verde', async () => {
      vi.mocked(eliminaFoto).mockResolvedValueOnce({ fileRimosso: false })
      const { utente } = await apriVisore()
      await utente.click(nelVisore().getByRole('button', { name: 'Elimina foto' }))
      await act(() => vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS))
      await waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(1))
      expect(vi.mocked(toast.warning).mock.calls[0][0]).toMatch(/il suo file è rimasto/)
    })
  })
})
