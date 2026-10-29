import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

// Si prova la pagina con i veri hook e la vera cache di React Query (così si vedono anche invalidazioni e
// ricaricamenti): si finge il livello API, che è quello che i hook chiamano, e il client Supabase non si raggiunge mai.
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
}))
vi.mock('@/lib/toastSalvato', () => ({ toastSalvato: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(() => 'id-toast'), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }) }))

import { toast } from 'sonner'
import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { caricaConfig } from '@/api/esperimenti'
import { misurePianta, salvaMisura } from '@/api/misure'
import { chiavi } from '@/api/query'
import { chiaveBozza, leggiBozza } from '@/components/scheda/bozza'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import type { ConfigEsperimento, Misura, Parametro, ValoriMisura } from '@/domain/tipi'
import { toastSalvato } from '@/lib/toastSalvato'
import { useCampoStore } from '@/store/campo'
import { SchedaPianta } from './SchedaPianta'

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session
const OGGI = '2026-10-28'
const IERI = '2026-10-27'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

let config: ConfigEsperimento
/** Le misure "nel database": `misurePianta` le legge, `salvaMisura` le scrive (upsert per id). */
let archivio: Misura[]

const idStrumento = (nome: string) => config.strumenti.find(p => p.nome === nome)!.id
const idPianta = (etichetta: string) => config.piante.find(p => p.etichetta === etichetta)!.id
const par = (nome: string): Parametro => config.parametri.find(p => p.nome === nome)!
const par2 = (id: string): Parametro => config.parametri.find(p => p.id === id)!

/** Una misura della pianta 35 (di norma: Termometro, oggi alle 09:12). */
function misura(extra: Partial<Misura> & { valori: ValoriMisura }): Misura {
  return {
    id: crypto.randomUUID(), pianta_id: idPianta('35'), strumento_id: idStrumento('Termometro'),
    data_rilievo: OGGI, ora: '09:12', ...extra,
  }
}

function Posizione() {
  const { pathname } = useLocation()
  return <p data-testid="posizione">{pathname}</p>
}

/** La pagina di modifica di una misura, finta: mostra lo stato con cui la storia della pianta l'ha aperta. */
function StatoArrivo() {
  return <p data-testid="arrivo">{JSON.stringify(useLocation().state)}</p>
}

/** Il gesto "indietro" del telefono: torna alla voce precedente della cronologia, senza passare dall'app. */
function IndietroDiSistema() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate(-1)}>Indietro di sistema</button>
}

/**
 * Apre la scheda della pianta con lo strumento già scelto nella schermata in campo (`null`: nessuno strumento), arrivando
 * dalla schermata in campo (è la voce precedente della cronologia).
 */
function apri(etichetta = '35', strumento: string | null = 'Termometro') {
  if (strumento) useCampoStore.getState().setStrumento('E', idStrumento(strumento))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalida = vi.spyOn(client, 'invalidateQueries')
  const id = config.piante.find(p => p.etichetta === etichetta)?.id ?? etichetta
  const { unmount } = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/esperimenti/E', `/esperimenti/E/piante/${id}`]} initialIndex={1}>
        <Routes>
          <Route path="/esperimenti/:espId/piante/:piantaId" element={<SchedaPianta />} />
          <Route path="/esperimenti/:espId/misure/:misuraId" element={<StatoArrivo />} />
          <Route path="*" element={null} />
        </Routes>
        <Posizione />
        <IndietroDiSistema />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { client, invalida, unmount }
}

const posizione = () => screen.getByTestId('posizione').textContent
const campo = (nome: string) => screen.getByLabelText(nome) as HTMLInputElement
/** La casella "Mantieni questo parametro uguale" sotto il campo del parametro. */
const MANTIENI = 'Mantieni questo parametro uguale anche nelle prossime misure'
const mantieni = (nome: string) => {
  let el: HTMLElement | null = campo(nome)
  while (el && !within(el).queryByRole('checkbox')) el = el.parentElement
  return within(el!).getByRole('checkbox', { name: MANTIENI })
}
/** Come se alla pianta di prima si fosse spuntato "Mantieni" su Temp aria (Termometro, oggi) con quel valore. */
function mantenutaTempAria(valore: number, data = OGGI) {
  const ta = par('Temp aria').id
  useCampoStore.getState().setMantieni('E', idStrumento('Termometro'), data, ta, true)
  useCampoStore.getState().aggiornaMantenuti('E', { [ta]: [valore] })
}
const pulsante = (nome: string | RegExp) => screen.getByRole('button', { name: nome })
/** Aspetta che la scheda sia pronta: il modulo compare solo con configurazione e misure arrivate. */
const pronta = () => screen.findByRole('button', { name: /^Ora: / })
const salvate = () => vi.mocked(salvaMisura).mock.calls.map(([, m]) => m)
const dialogo = () => screen.findByRole('dialog', { name: 'Scartare i valori non salvati?' })
const chiudiDialogo = async () => waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
/** Più tardi di un doppio tocco: il tocco che conferma un avviso deve arrivare dopo mezzo secondo. */
const piuTardi = (secondi = 1) => vi.setSystemTime(new Date(Date.now() + secondi * 1000))
/** Il toast d'errore dopo l'uscita resta finché non lo si chiude. */
const PERSISTENTE = { duration: Infinity, action: { label: 'Chiudi', onClick: expect.any(Function) } }
const bozzeSalvate = () => Object.keys(sessionStorage).filter(k => k.startsWith('fastlab-bozza:'))

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
  vi.mocked(salvaMisura).mockImplementation(async (_esp, m) => {
    archivio = [m, ...archivio.filter(x => x.id !== m.id)]
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SchedaPianta: salvataggio', () => {
  it('"Salva e vai alla #36" salva una volta sola anche con due tocchi rapidi, poi apre la #36', async () => {
    let finisci!: () => void
    vi.mocked(salvaMisura).mockImplementationOnce(() => new Promise<void>(r => { finisci = r }))
    const utente = userEvent.setup()
    apri('35')
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
    await waitFor(() => expect(posizione()).toBe(`/esperimenti/E/piante/${idPianta('36')}`))
    expect(await screen.findByRole('heading', { name: 'Pianta #36' })).toBeInTheDocument()
    expect(salvaMisura).toHaveBeenCalledTimes(1)
  })

  it('se il salvataggio fallisce spiega cosa è successo, i valori restano e "Riprova" usa lo stesso id', async () => {
    vi.mocked(salvaMisura).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    apri('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Salva e vai alla #36'))

    const errore = await screen.findByRole('alert')
    expect(errore).toHaveTextContent('Pianta #35 non salvata.')
    expect(errore).toHaveTextContent('Il server non risponde')
    expect(campo('Temp aria')).toHaveValue('24,5')
    expect(posizione()).toBe(`/esperimenti/E/piante/${idPianta('35')}`)
    expect(toastSalvato).not.toHaveBeenCalled()

    await utente.click(within(errore).getByRole('button', { name: 'Riprova' }))

    expect(salvaMisura).toHaveBeenCalledTimes(2)
    const [primo, secondo] = salvate()
    expect(secondo.id).toBe(primo.id)
    expect(secondo.valori).toEqual(primo.valori)
    // "Riprova" ripete l'azione scelta: salvata, si va alla pianta dopo.
    await waitFor(() => expect(posizione()).toBe(`/esperimenti/E/piante/${idPianta('36')}`))
  })

  it('un nuovo tentativo tiene l\'ora del primo, anche se nel frattempo il tempo è trascorso', async () => {
    vi.mocked(salvaMisura).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    apri('35')
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
    apri('35')
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
    apri('35')
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
    apri('35')
    await pronta()
    await utente.click(pulsante('Salva e vai alla #36'))

    const errori = screen.getByRole('alert')
    expect(errori).toHaveTextContent('Nessun valore inserito.')
    expect(errori).toHaveFocus()
    expect(salvaMisura).not.toHaveBeenCalled()
    expect(posizione()).toBe(`/esperimenti/E/piante/${idPianta('35')}`)
  })

  it('un numero lasciato a metà ("-") blocca il salvataggio e il messaggio nomina il campo', async () => {
    const utente = userEvent.setup()
    apri('35')
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
    const { invalida } = apri('35')
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
    const { invalida } = apri('35')
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
    apri('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.type(campo('Temp pianta'), '25,1')
    await utente.click(mantieni('Temp aria'))
    await utente.click(pulsante('Salva'))

    expect(await screen.findByRole('button', { name: '10:00 · Temp aria 24,5 °C · Temp pianta 25,1 °C' })).toBeInTheDocument()
    expect(toastSalvato).toHaveBeenCalledWith('Pianta #35 salvata ✓')
    expect(posizione()).toBe(`/esperimenti/E/piante/${idPianta('35')}`)
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
    apri('35')
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
    apri('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(mantieni('Temp aria'))
    await utente.click(pulsante('Salva e vai alla #36'))
    await screen.findByRole('heading', { name: 'Pianta #36' })
    await pronta()

    await utente.click(pulsante('Salva e vai alla #37'))
    await act(async () => {})
    expect(salvaMisura).toHaveBeenCalledTimes(1)
    expect(posizione()).toBe(`/esperimenti/E/piante/${idPianta('36')}`)

    piuTardi()
    await utente.click(pulsante('Salva e vai alla #37'))
    await waitFor(() => expect(posizione()).toBe(`/esperimenti/E/piante/${idPianta('37')}`))
    expect(salvate().map(m => m.pianta_id)).toEqual([idPianta('35'), idPianta('36')])
  })

  it('una misura nuova non scrive i parametri lasciati vuoti: nei valori solo quelli compilati', async () => {
    const utente = userEvent.setup()
    apri('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(Object.keys(salvate()[0].valori)).toEqual([par('Temp aria').id])
  })

  it('correggere una misura che non aveva un parametro non crea la sua chiave vuota; uno svuotato resta', async () => {
    const ta = par('Temp aria').id
    const tp = par('Temp pianta').id
    const vecchia = misura({ ora: '09:12', valori: { [ta]: [24.5] } })
    archivio = [vecchia]
    const utente = userEvent.setup()
    apri('35')
    await utente.click(await screen.findByRole('button', { name: '09:12 · Temp aria 24,5 °C' }))
    await utente.type(campo('Temp aria'), '25')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].valori).toEqual({ [ta]: [25] })
    expect(salvate()[0].valori).not.toHaveProperty(tp)
  })

  it('un esperimento concluso resta modificabile', async () => {
    config.esperimento.stato = 'concluso'
    const utente = userEvent.setup()
    apri('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Salva'))
    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
  })

  it('l\'ora si può cambiare: "Ora: 10:00" apre il campo e la misura si salva con l\'ora scelta', async () => {
    const utente = userEvent.setup()
    apri('35')
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

  it('se si esce dalla scheda mentre salva e il salvataggio fallisce, lo dice comunque', async () => {
    let fallisci!: (e: unknown) => void
    vi.mocked(salvaMisura).mockImplementationOnce(() => new Promise<void>((_r, rifiuta) => { fallisci = rifiuta }))
    const utente = userEvent.setup()
    apri('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Salva e vai alla #36'))
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    expect(posizione()).toBe('/esperimenti/E/piante')

    await act(async () => fallisci(new TypeError('Failed to fetch')))

    expect(toast.error).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(
      /^Pianta #35 non salvata\. Il server non risponde\. .*\(vedi README\)\. I valori sono rimasti: riapri la pianta per riprovare\.$/,
    ), PERSISTENTE)
    expect(posizione()).toBe('/esperimenti/E/piante')
    // Durante il salvataggio l'uscita non chiede di scartare: i valori erano già partiti.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('il messaggio dopo l\'uscita dice il vero: riaprendo la pianta i valori ci sono, anche quelli solo precompilati (mantenuti)', async () => {
    mantenutaTempAria(26)
    let fallisci!: (e: unknown) => void
    vi.mocked(salvaMisura).mockImplementationOnce(() => new Promise<void>((_r, rifiuta) => { fallisci = rifiuta }))
    const utente = userEvent.setup()
    const { unmount } = apri('35')
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
    apri('35')
    await pronta()
    expect(screen.getByText('Bozza ripristinata.')).toBeInTheDocument()
    expect(campo('Temp aria')).toHaveValue('26')
    await utente.click(pulsante('Salva'))
    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(2))
    const [primo, secondo] = salvate()
    expect(secondo.id).toBe(primo.id)
  })
})

describe('SchedaPianta: salvataggio finito dopo l\'uscita dalla scheda', () => {
  /** Salva (senza aspettare la risposta) ed esce dalla scheda con la freccia indietro. */
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
    apri('35')
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
    const primo = apri('35')
    await pronta()
    // Temp aria è mantenuta: si salva senza toccare nulla, quindi senza bozza.
    const fine = await salvaEdEsci(utente)
    primo.unmount()

    // Si rientra nella scheda mentre il primo tentativo è ancora in volo: un modulo nuovo, con un altro id.
    apri('35')
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
    const primo = apri('35')
    await pronta()
    const fine = await salvaEdEsci(utente)
    primo.unmount()

    apri('35')
    await pronta()
    await utente.type(campo('Temp pianta'), '25')
    const nuova = bozzaNuova()!
    await act(async () => fine.riesci())

    expect(toastSalvato).toHaveBeenCalledWith('Pianta #35 salvata ✓')
    expect(bozzaNuova()).toEqual(nuova)
  })
})

describe('SchedaPianta: passaggio alla pianta successiva', () => {
  it('Temp aria (mantenuta con la spunta) è già compilata sulla #36, con il segno "mantenuto", e il cursore è sul primo campo vuoto', async () => {
    const utente = userEvent.setup()
    apri('35')
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
    apri('35')
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
    apri('35')
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
    apri('35')
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
    const primo = apri('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(mantieni('Temp aria'))
    await utente.click(pulsante('Salva e vai alla #36'))
    await screen.findByRole('heading', { name: 'Pianta #36' })
    await pronta()
    await utente.type(campo('Temp pianta'), '25')
    primo.unmount()

    // Ricaricando la pagina la bozza torna con Temp aria uguale a prima: deve ancora dire da dove viene.
    apri('36')
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
    apri('35')
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
    apri('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(mantieni('Temp aria'))
    await utente.click(pulsante('Salva e vai alla #36'))
    await screen.findByRole('heading', { name: 'Pianta #36' })
    await pronta()
    expect(campo('Temp aria')).toHaveValue('24,5')

    // Il rilievo passa a ieri (come dalla schermata in campo): il modulo ricomincia e i mantenuti di oggi non valgono.
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
    apri('35')
    await pronta()
    expect(campo('Temp aria')).toHaveValue('')
    expect(mantieni('Temp aria')).not.toBeChecked()
  })

  it('spuntare dal riquadro registra lo strumento e la data del riquadro', async () => {
    const utente = userEvent.setup()
    apri('35')
    await pronta()
    await utente.click(mantieni('Temp aria'))
    expect(useCampoStore.getState().mantenutiPer('E', idStrumento('Termometro'), OGGI)?.parametri).toEqual([par('Temp aria').id])
  })

  it('la casella c\'è per numeri, testo e sì/no e non per le liste ripetute', async () => {
    apri('35', 'Tabella fenologica')
    await pronta()
    expect(screen.getByRole('group', { name: 'Palchi' })).toBeInTheDocument()
    // Fenologici: N frutti, ecc. sono numeri, Note è testo; Palchi e Infiorescenze sono liste.
    const numeroDiCaselle = screen.getAllByRole('checkbox', { name: MANTIENI }).length
    const nonListe = config.strumenti.find(st => st.nome === 'Tabella fenologica')!.parametri
      .map(pp => par2(pp.parametro_id)).filter(p => p.tipo !== 'lista' && !p.archiviato).length
    expect(numeroDiCaselle).toBe(nonListe)
  })

  it('correggendo una misura già salvata non c\'è la casella', async () => {
    archivio = [misura({ valori: { [par('Temp aria').id]: [24.5] } })]
    const utente = userEvent.setup()
    apri('35')
    await pronta()
    expect(screen.getAllByRole('checkbox', { name: MANTIENI })).toHaveLength(2)
    await utente.click(pulsante(/^09:12 · /))
    expect(screen.getByText('Modifica della misura delle 09:12')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('aprendo una scheda dalla griglia il cursore non si sposta da solo', async () => {
    apri('35')
    await pronta()
    expect(campo('Temp aria')).not.toHaveFocus()
  })

  it('sull\'ultima pianta non c\'è "Salva e vai", solo "Salva"', async () => {
    apri('56')
    await pronta()
    expect(screen.queryByRole('button', { name: /Salva e vai/ })).not.toBeInTheDocument()
    expect(pulsante('Salva')).toBeInTheDocument()
  })

  it('cambiando pianta un "Annulla" rimasto in sospeso sparisce con la lista', async () => {
    archivio = [misura({
      strumento_id: idStrumento('Tabella fenologica'), data_rilievo: '2026-10-21',
      valori: { [par('Palchi').id]: [{ n: 1, valori: { n_foglie: 5 } }] },
    })]
    const utente = userEvent.setup()
    apri('35', 'Tabella fenologica')
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

describe('SchedaPianta: valori precompilati', () => {
  it('i parametri progressivi (Palchi) ripartono dai valori della volta precedente', async () => {
    archivio = [
      misura({
        strumento_id: idStrumento('Tabella fenologica'), data_rilievo: '2026-10-14', ora: '09:00',
        valori: { [par('Palchi').id]: [{ n: 1, valori: { n_foglie: 4 } }], [par('N palchi totali').id]: [1] },
      }),
      misura({
        strumento_id: idStrumento('Tabella fenologica'), data_rilievo: '2026-10-21', ora: '09:00',
        valori: {
          [par('Palchi').id]: [{ n: 1, valori: { n_foglie: 5 } }, { n: 2, valori: { n_foglie: 7 } }],
          [par('N palchi totali').id]: [2],
          [par('N fiori fioriti').id]: [6],
        },
      }),
    ]
    const utente = userEvent.setup()
    apri('35', 'Tabella fenologica')
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

describe('SchedaPianta: più misure nello stesso giorno', () => {
  function dueMisure() {
    const ta = par('Temp aria').id
    const tp = par('Temp pianta').id
    const mattina = misura({ ora: '09:12', valori: { [ta]: [24.5], [tp]: [25.1], 'chiave-di-un-altro-strumento': 'da tenere' } })
    const pomeriggio = misura({ ora: '15:40', valori: { [ta]: [27], [tp]: [28.3] } })
    // Una misura di un altro strumento e una di ieri non sono "di oggi per questo strumento".
    const spad = misura({ strumento_id: idStrumento('SPAD'), ora: '11:00', valori: { [par('SPAD').id]: [38.1] } })
    const ieri = misura({ data_rilievo: IERI, ora: '09:00', valori: { [ta]: [20] } })
    archivio = [pomeriggio, spad, ieri, mattina]
    return { mattina, pomeriggio, ta, tp }
  }

  it('sopra il modulo elenca le misure di oggi dello strumento, in ordine di ora', async () => {
    dueMisure()
    apri('35')
    const elenco = await screen.findByRole('list', { name: 'Misure già registrate' })
    expect(within(elenco).getAllByRole('button')).toHaveLength(2)
    const [prima, seconda] = within(elenco).getAllByRole('button')
    expect(prima).toHaveAccessibleName('09:12 · Temp aria 24,5 °C · Temp pianta 25,1 °C')
    expect(seconda).toHaveAccessibleName('15:40 · Temp aria 27 °C · Temp pianta 28,3 °C')
    expect(screen.getByText('Nuova misura')).toBeInTheDocument()
  })

  it('toccando una misura la si corregge: il salvataggio usa il suo id e tiene le chiavi di altri strumenti', async () => {
    const { mattina, ta, tp } = dueMisure()
    const utente = userEvent.setup()
    apri('35')
    await utente.click(await screen.findByRole('button', { name: '09:12 · Temp aria 24,5 °C · Temp pianta 25,1 °C' }))

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
    apri('35')
    await utente.click(await screen.findByRole('button', { name: /^09:12 · / }))
    await utente.click(pulsante('+ Nuova misura'))

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

describe('SchedaPianta: niente misure doppie', () => {
  it('"Scarta" sulla bozza ripresa tiene l\'id: un tentativo dato per fallito ma arrivato al server non si duplica', async () => {
    // Il primo tentativo scade (per l'app è fallito), ma potrebbe essere arrivato al server.
    vi.mocked(salvaMisura).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    const { unmount } = apri('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Salva'))
    await screen.findByRole('alert')
    unmount()

    apri('35')
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
    const mattina = misura({ ora: '09:12', valori: { [par('Temp aria').id]: [24.5] } })
    archivio = [mattina]
    vi.mocked(salvaMisura).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    apri('35')
    await pronta()
    await utente.type(campo('Temp pianta'), '25')
    await utente.click(pulsante('Salva'))
    await screen.findByRole('alert')

    await utente.click(pulsante(/^09:12 · /))
    await utente.click(within(await dialogo()).getByRole('button', { name: 'Scarta' }))
    await chiudiDialogo()
    await utente.click(pulsante('+ Nuova misura'))
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
    const { unmount } = apri('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Salva'))
    await screen.findByRole('alert')
    unmount()

    apri('35')
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

describe('SchedaPianta: intestazione e storia', () => {
  it('mostra l\'esperimento in alto, "Pianta #35" con il trattamento e il riquadro di oggi', async () => {
    apri('35')
    await pronta()
    expect(screen.getByRole('heading', { level: 1, name: 'Hydrochar × Cuore di Bue' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/esperimenti/E/piante')
    expect(screen.getByRole('heading', { level: 2, name: 'Pianta #35' })).toBeInTheDocument()
    expect(screen.getByText('W1')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Oggi · 🌡 Termometro' })).toBeInTheDocument()
    expect(screen.queryByText(/non oggi/)).not.toBeInTheDocument()
    expect(campo('Temp aria')).toBeInTheDocument()
    expect(campo('Temp pianta')).toBeInTheDocument()
    expect(screen.queryByLabelText('SPAD')).not.toBeInTheDocument()
  })

  it('la storia elenca le misure per giorno (dal più recente), con l\'icona dello strumento e i parametri archiviati', async () => {
    par('SPAD').archiviato = true
    const oggi = misura({ ora: '09:12', valori: { [par('Temp aria').id]: [24.5], [par('Temp pianta').id]: [null] } })
    const spad = misura({ strumento_id: idStrumento('SPAD'), data_rilievo: '2026-10-21', ora: '09:00', valori: { [par('SPAD').id]: [38.1] } })
    const temp = misura({ data_rilievo: '2026-10-21', ora: '08:30', valori: { [par('Temp aria').id]: [22] } })
    archivio = [oggi, spad, temp]
    apri('35')
    const storia = await screen.findByRole('region', { name: 'Storia' })

    const giorni = within(storia).getAllByRole('heading', { level: 4 }).map(h => h.textContent)
    expect(giorni).toEqual(['28/10/2026', '21/10/2026'])
    const righe = within(storia).getAllByRole('link')
    expect(righe.map(r => r.getAttribute('href'))).toEqual([oggi, temp, spad].map(m => `/esperimenti/E/misure/${m.id}`))
    expect(righe[0]).toHaveAccessibleName('09:12 · Termometro · Temp aria 24,5 °C')
    expect(righe[1]).toHaveAccessibleName('08:30 · Termometro · Temp aria 22 °C')
    expect(righe[2]).toHaveAccessibleName('09:00 · SPAD · SPAD (archiviato) 38,1')
    expect(righe[2]).toHaveTextContent('💚')
  })

  it('toccando una riga della storia si apre la modifica della misura, sapendo di arrivare dalla scheda', async () => {
    const vecchia = misura({ data_rilievo: '2026-10-21', ora: '08:30', valori: { [par('Temp aria').id]: [22] } })
    archivio = [vecchia]
    const utente = userEvent.setup()
    apri('35')
    await utente.click(await screen.findByRole('link', { name: '08:30 · Termometro · Temp aria 22 °C' }))

    expect(posizione()).toBe(`/esperimenti/E/misure/${vecchia.id}`)
    expect(screen.getByTestId('arrivo')).toHaveTextContent('{"daScheda":true}')
  })

  it('senza misure la storia lo dice', async () => {
    apri('35')
    const storia = await screen.findByRole('region', { name: 'Storia' })
    expect(within(storia).getByText('Ancora nessuna misura per questa pianta.')).toBeInTheDocument()
  })
})

describe('SchedaPianta: casi limite', () => {
  it('il riquadro di oggi usa lo strumento scelto, se è attivo', async () => {
    apri('35', 'SPAD')
    await pronta()
    expect(screen.getByRole('heading', { name: 'Oggi · 💚 SPAD' })).toBeInTheDocument()
    expect(posizione()).toBe(`/esperimenti/E/piante/${idPianta('35')}`)
  })

  it('senza uno strumento scelto usa il primo strumento attivo, senza sceglierlo', async () => {
    config.strumenti.find(s => s.nome === 'Termometro')!.archiviato = true
    apri('35', null)
    await pronta()
    expect(screen.getByRole('heading', { name: 'Oggi · 💚 SPAD' })).toBeInTheDocument()
    expect(posizione()).toBe(`/esperimenti/E/piante/${idPianta('35')}`)
    expect(useCampoStore.getState().dati('E').strumentoId).toBeNull()
  })

  it('con uno strumento scelto che non esiste più, o archiviato, usa il primo attivo', async () => {
    useCampoStore.getState().setStrumento('E', 'strumento-cancellato')
    const primo = apri('35', null)
    expect(await screen.findByRole('heading', { name: 'Oggi · 🌡 Termometro' })).toBeInTheDocument()
    primo.unmount()

    config.strumenti.find(s => s.nome === 'SPAD')!.archiviato = true
    apri('35', 'SPAD')
    expect(await screen.findByRole('heading', { name: 'Oggi · 🌡 Termometro' })).toBeInTheDocument()
  })

  it('senza strumenti attivi lo dice, senza modulo, e la storia resta', async () => {
    for (const s of config.strumenti) s.archiviato = true
    apri('35', null)
    expect(await screen.findByText('Questo esperimento non ha strumenti attivi: aggiungine uno dalle Impostazioni.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Salva/ })).not.toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Storia' })).toBeInTheDocument()
  })

  it('una pianta che non c\'è lo dice', async () => {
    apri('inesistente')
    expect(await screen.findByText('Questa pianta non esiste in questo esperimento.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Salva/ })).not.toBeInTheDocument()
  })

  it('se la configurazione non si carica spiega cosa è successo, con "Riprova"', async () => {
    vi.mocked(caricaConfig).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    apri('35')
    expect(await screen.findByRole('alert')).toHaveTextContent('Il server non risponde')
    await utente.click(pulsante('Riprova'))
    expect(await pronta()).toBeInTheDocument()
  })

  it('se le misure della pianta non si caricano non mostra il modulo (i progressivi sarebbero sbagliati) e "Riprova" ci riprova', async () => {
    vi.mocked(misurePianta).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    apri('35')
    expect(await screen.findByRole('alert')).toHaveTextContent('Il server non risponde')
    expect(screen.getByRole('heading', { name: 'Pianta #35' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Temp aria')).not.toBeInTheDocument()
    await utente.click(pulsante('Riprova'))
    expect(await pronta()).toBeInTheDocument()
  })
})

describe('SchedaPianta: data di rilievo cambiata mentre si corregge', () => {
  function misuraDiIeri() {
    const ieri = misura({ data_rilievo: IERI, ora: '09:00', valori: { [par('Temp aria').id]: [20] } })
    archivio = [ieri]
    useCampoStore.getState().setData('E', IERI)
    return ieri
  }

  it('"Usa oggi" lascia la correzione della misura di ieri: il salvataggio crea una misura di oggi e non tocca quella di ieri', async () => {
    const ieri = misuraDiIeri()
    const utente = userEvent.setup()
    apri('35')
    await utente.click(await screen.findByRole('button', { name: '09:00 · Temp aria 20 °C' }))
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
    apri('35')
    await utente.click(await screen.findByRole('button', { name: '09:00 · Temp aria 20 °C' }))
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

describe('SchedaPianta: mezzanotte con la data non scelta', () => {
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
    apri('35')
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
    apri('35')
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
    apri('35')
    await pronta()
    riapertoIlMattinoDopo()

    expect(await screen.findByRole('heading', { name: 'Oggi · 🌡 Termometro' })).toBeInTheDocument()
    expect(screen.queryByText(/non oggi/)).not.toBeInTheDocument()
    expect(useCampoStore.getState().stato.E.dataRilievo).toBeUndefined()
  })

  it('con una data scelta a mano non cambia nulla: resta quella', async () => {
    useCampoStore.getState().setData('E', '2026-10-20')
    const utente = userEvent.setup()
    apri('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    riapertoIlMattinoDopo()

    expect(campo('Temp aria')).toHaveValue('24,5')
    expect(screen.getByText('Stai registrando con data 20/10/2026, non oggi.')).toBeInTheDocument()
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe('2026-10-20')
  })
})

describe('SchedaPianta: valori non salvati', () => {
  function unaMisuraDiOggi() {
    const m = misura({ ora: '09:12', valori: { [par('Temp aria').id]: [24.5], [par('Temp pianta').id]: [25.1] } })
    archivio = [m]
    return m
  }

  it('toccando una misura di oggi con valori scritti chiede se scartarli; "Continua a modificare" li tiene', async () => {
    unaMisuraDiOggi()
    const utente = userEvent.setup()
    apri('35')
    await pronta()
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
    apri('35')
    await pronta()
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
    expect(posizione()).toBe('/esperimenti/E/piante')
  })

  it('"+ Nuova misura" con una correzione scritta chiede se scartarla', async () => {
    unaMisuraDiOggi()
    const utente = userEvent.setup()
    apri('35')
    await utente.click(await screen.findByRole('button', { name: /^09:12 · / }))
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
    apri('35')
    await utente.click(await pronta())
    fireEvent.change(screen.getByLabelText('Ora'), { target: { value: '08:30' } })
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))

    await utente.click(within(await dialogo()).getByRole('button', { name: 'Continua a modificare' }))
    await chiudiDialogo()
    expect(posizione()).toBe(`/esperimenti/E/piante/${idPianta('35')}`)
    expect(screen.getByLabelText('Ora')).toHaveValue('08:30')

    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    await utente.click(within(await dialogo()).getByRole('button', { name: 'Scarta' }))
    await waitFor(() => expect(posizione()).toBe('/esperimenti/E/piante'))
    expect(bozzeSalvate()).toEqual([])
  })

  it('chiudendo o ricaricando la pagina con valori scritti il browser chiede conferma', async () => {
    const utente = userEvent.setup()
    apri('35')
    await pronta()
    const prima = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(prima)
    expect(prima.defaultPrevented).toBe(false)

    await utente.type(campo('Temp aria'), '24,5')
    const dopo = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dopo)
    expect(dopo.defaultPrevented).toBe(true)
  })

  it('uscendo senza passare dall\'app (gesto indietro) i valori restano: riaprendo la scheda tornano, con "Scarta"', async () => {
    const utente = userEvent.setup()
    const { unmount } = apri('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Indietro di sistema'))
    expect(posizione()).toBe('/esperimenti/E')
    unmount()

    apri('35')
    await pronta()
    const avviso = screen.getByText('Bozza ripristinata.')
    expect(campo('Temp aria')).toHaveValue('24,5')

    await utente.click(within(avviso.parentElement!).getByRole('button', { name: 'Scarta' }))

    expect(screen.queryByText('Bozza ripristinata.')).not.toBeInTheDocument()
    expect(campo('Temp aria')).toHaveValue('')
    expect(bozzeSalvate()).toEqual([])
  })

  it('la bozza di una correzione si riapre tornando alla scheda, sulla stessa misura', async () => {
    const m = unaMisuraDiOggi()
    const tp = par('Temp pianta').id
    const utente = userEvent.setup()
    const { unmount } = apri('35')
    await utente.click(await screen.findByRole('button', { name: /^09:12 · / }))
    await utente.type(campo('Temp pianta'), '26')
    await utente.click(pulsante('Indietro di sistema'))
    unmount()

    apri('35')
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
    const primo = apri('35')
    await utente.click(await screen.findByRole('button', { name: /^09:12 · / }))
    await utente.type(campo('Temp pianta'), '26')
    primo.unmount()

    const secondo = apri('35')
    await pronta()
    await utente.click(within(screen.getByText('Bozza ripristinata.').parentElement!).getByRole('button', { name: 'Scarta' }))
    expect(screen.getByText('Modifica della misura delle 09:12')).toBeInTheDocument()
    expect(campo('Temp pianta')).toHaveValue('25,1')
    expect(bozzeSalvate()).toEqual([])
    secondo.unmount()

    apri('35')
    await pronta()
    expect(screen.getByText('Nuova misura')).toBeInTheDocument()
    expect(screen.queryByText('Bozza ripristinata.')).not.toBeInTheDocument()
  })

  it('se la misura in correzione non è più tra quelle del giorno si apre la misura nuova', async () => {
    const m = unaMisuraDiOggi()
    const utente = userEvent.setup()
    const { unmount } = apri('35')
    await utente.click(await screen.findByRole('button', { name: /^09:12 · / }))
    await utente.type(campo('Temp pianta'), '26')
    unmount()

    // Eliminata (o spostata a un altro giorno) da un'altra schermata.
    archivio = [{ ...m, data_rilievo: IERI }]
    apri('35')
    await pronta()
    expect(screen.queryByText(/Modifica della misura/)).not.toBeInTheDocument()
    expect(screen.queryByText('Bozza ripristinata.')).not.toBeInTheDocument()
    expect(campo('Temp pianta')).toHaveValue('')
  })

  it('una bozza ripresa salva con lo stesso id e la stessa ora del tentativo fallito: niente doppioni', async () => {
    vi.mocked(salvaMisura).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    const { unmount } = apri('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Salva'))
    await screen.findByRole('alert')
    unmount()

    piuTardi(300)
    apri('35')
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
    const { unmount } = apri('35')
    await pronta()
    await utente.type(campo('Temp aria'), '-')
    await utente.type(campo('Temp pianta'), '25')
    unmount()

    apri('35')
    await pronta()
    await utente.click(pulsante('Salva'))
    expect(screen.getByRole('alert')).toHaveTextContent('«Temp aria»: numero non valido.')
    expect(salvaMisura).not.toHaveBeenCalled()
  })

  it('dopo un salvataggio riuscito non resta nessuna bozza', async () => {
    const utente = userEvent.setup()
    apri('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    expect(bozzeSalvate()).toHaveLength(1)
    await utente.click(pulsante('Salva e vai alla #36'))
    await screen.findByRole('heading', { name: 'Pianta #36' })
    expect(bozzeSalvate()).toEqual([])
  })
})

describe('SchedaPianta: dettagli del passaggio tra piante', () => {
  it('un doppio tocco sull\'avviso non vale come conferma: serve un secondo tocco più tardi', async () => {
    par('Temp aria').valore_max = 40
    const utente = userEvent.setup()
    apri('35')
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
    const mattina = misura({ ora: '09:12', valori: { [ta]: [24.5] } })
    archivio = [mattina]
    const utente = userEvent.setup()
    apri('35')
    await pronta()
    expect(campo('Temp aria')).toHaveValue('26')

    await utente.click(pulsante(/^09:12 · /))
    await utente.type(campo('Temp aria'), '23')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].id).toBe(mattina.id)
    expect(useCampoStore.getState().dati('E').mantenuti?.valori[ta]).toEqual([26])
    expect(await screen.findByText('Nuova misura')).toBeInTheDocument()
    expect(campo('Temp aria')).toHaveValue('26')
  })

  it('le misure della pianta successiva si caricano già mentre si compila questa', async () => {
    apri('35')
    await pronta()
    await waitFor(() => expect(misurePianta).toHaveBeenCalledWith(idPianta('36')))
  })

  it('"Salva e vai" prende il posto della scheda: il gesto indietro torna alla schermata in campo', async () => {
    const utente = userEvent.setup()
    apri('35')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Salva e vai alla #36'))
    await screen.findByRole('heading', { name: 'Pianta #36' })

    await utente.click(pulsante('Indietro di sistema'))
    expect(posizione()).toBe('/esperimenti/E')
  })
})
