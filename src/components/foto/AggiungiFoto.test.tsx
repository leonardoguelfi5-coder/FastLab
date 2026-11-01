import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/api/foto', () => ({ caricaFoto: vi.fn(), listaFoto: vi.fn(), spazioFoto: vi.fn(), urlFoto: vi.fn(), VALIDITA_URL_SECONDI: 3600 }))
vi.mock('@/lib/immagini', () => ({ dataDiScatto: vi.fn() }))
vi.mock('@/lib/toastSalvato', () => ({ toastSalvato: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn(), warning: vi.fn() }) }))

import { toast } from 'sonner'
import { caricaFoto } from '@/api/foto'
import { chiavi } from '@/api/query'
import type { Foto } from '@/domain/tipi'
import { dataDiScatto } from '@/lib/immagini'
import { OPZIONI_ERRORE_TARDIVO } from '@/lib/toastErrore'
import { toastSalvato } from '@/lib/toastSalvato'
import { AggiungiFoto } from './AggiungiFoto'

const E = 'e0000000-0000-4000-8000-000000000001'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const jpg = (nome: string) => new File(['x'], nome, { type: 'image/jpeg' })
const salvata = (id: string): Foto => ({
  id, data: '2026-10-28', percorso: `${E}/${id}.jpg`, larghezza: 1, altezza: 1, byte: 1, pianta_id: null, nota_id: null, archiviata: false, archiviata_il: null,
})

/** Una promessa che si risolve (o si rifiuta) quando lo decide il test: serve a guardare gli stati intermedi. */
function differita<T>() {
  let ok!: (v: T) => void
  let ko!: (e: unknown) => void
  const promessa = new Promise<T>((a, b) => { ok = a; ko = b })
  return { promessa, ok, ko }
}

function apri(props: Partial<React.ComponentProps<typeof AggiungiFoto>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalida = vi.spyOn(client, 'invalidateQueries')
  const resa = render(
    <QueryClientProvider client={client}>
      <AggiungiFoto espId={E} {...props} />
    </QueryClientProvider>,
  )
  return { client, invalida, resa, utente: userEvent.setup({ delay: null }) }
}

const inputScatto = () => document.querySelector<HTMLInputElement>('input[type="file"][capture]')!
const inputGalleria = () => document.querySelector<HTMLInputElement>('input[type="file"][multiple]')!
const scegli = (input: HTMLInputElement, ...files: File[]) => fireEvent.change(input, { target: { files } })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(dataDiScatto).mockResolvedValue(null)
  vi.mocked(caricaFoto).mockImplementation(async (_e, d) => salvata(d.id))
})

afterEach(() => { vi.useRealTimers() })

describe('AggiungiFoto: la scelta', () => {
  it('ha un pulsante che apre le due scelte, Scatta e Dalla galleria', async () => {
    const { utente } = apri()
    expect(screen.queryByRole('button', { name: 'Scatta' })).not.toBeInTheDocument()
    await utente.click(screen.getByRole('button', { name: 'Aggiungi foto' }))
    expect(screen.getByRole('button', { name: 'Scatta' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dalla galleria' })).toBeInTheDocument()
  })

  it('Scatta apre la fotocamera (capture) e Dalla galleria permette più foto', () => {
    apri()
    expect(inputScatto()).toHaveAttribute('accept', 'image/*')
    expect(inputScatto()).toHaveAttribute('capture', 'environment')
    expect(inputScatto()).not.toHaveAttribute('multiple')
    expect(inputGalleria()).toHaveAttribute('accept', 'image/*')
    expect(inputGalleria()).not.toHaveAttribute('capture')
  })

  it('scegliere Scatta o Dalla galleria apre il selettore di file giusto e chiude le scelte', async () => {
    const { utente } = apri()
    const scatto = vi.spyOn(inputScatto(), 'click').mockImplementation(() => {})
    const galleria = vi.spyOn(inputGalleria(), 'click').mockImplementation(() => {})

    await utente.click(screen.getByRole('button', { name: 'Aggiungi foto' }))
    await utente.click(screen.getByRole('button', { name: 'Scatta' }))
    expect(scatto).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Dalla galleria' })).not.toBeInTheDocument()

    await utente.click(screen.getByRole('button', { name: 'Aggiungi foto' }))
    await utente.click(screen.getByRole('button', { name: 'Dalla galleria' }))
    expect(galleria).toHaveBeenCalledTimes(1)
  })

  it('Esc chiude le scelte', async () => {
    const { utente } = apri()
    await utente.click(screen.getByRole('button', { name: 'Aggiungi foto' }))
    await utente.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Scatta' })).not.toBeInTheDocument()
  })

  it('il pulsante non può inviare un modulo in cui si trova', () => {
    apri()
    expect(screen.getByRole('button', { name: 'Aggiungi foto' })).toHaveAttribute('type', 'button')
  })
})

describe('AggiungiFoto: il caricamento', () => {
  it('carica ogni foto con un id nuovo, il collegamento dato e la data di oggi se la foto non ne ha una', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 1, 15, 0))
    apri({ piantaId: 'p1', notaId: 'n1' })

    scegli(inputGalleria(), jpg('a.jpg'), jpg('b.jpg'))

    await waitFor(() => expect(caricaFoto).toHaveBeenCalledTimes(2))
    const [prima, seconda] = vi.mocked(caricaFoto).mock.calls.map(c => c[1])
    expect(vi.mocked(caricaFoto).mock.calls[0][0]).toBe(E)
    expect(prima.id).toMatch(UUID)
    expect(seconda.id).toMatch(UUID)
    expect(prima.id).not.toBe(seconda.id)
    expect(prima).toMatchObject({ data: '2026-11-01', piantaId: 'p1', notaId: 'n1' })
    expect(prima.file).toBeInstanceOf(File)
  })

  it('usa la data di scatto della foto, se c\'è', async () => {
    vi.mocked(dataDiScatto).mockResolvedValueOnce('2026-10-20').mockResolvedValueOnce(null)
    apri()
    scegli(inputGalleria(), jpg('a.jpg'), jpg('b.jpg'))
    await waitFor(() => expect(caricaFoto).toHaveBeenCalledTimes(2))
    expect(vi.mocked(caricaFoto).mock.calls[0][1].data).toBe('2026-10-20')
    expect(vi.mocked(caricaFoto).mock.calls[1][1].data).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('la data di oggi si calcola quando la foto parte, non quando la si sceglie', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 1, 23, 59))
    const primo = differita<Foto>()
    vi.mocked(caricaFoto).mockImplementationOnce(() => primo.promessa)
    apri()

    scegli(inputGalleria(), jpg('a.jpg'), jpg('b.jpg'))
    await waitFor(() => expect(caricaFoto).toHaveBeenCalledTimes(1))
    vi.setSystemTime(new Date(2026, 10, 2, 0, 1))
    await act(async () => { primo.ok(salvata('x')) })

    await waitFor(() => expect(caricaFoto).toHaveBeenCalledTimes(2))
    expect(vi.mocked(caricaFoto).mock.calls[0][1].data).toBe('2026-11-01')
    expect(vi.mocked(caricaFoto).mock.calls[1][1].data).toBe('2026-11-02')
  })

  it('le foto vanno una alla volta e ognuna mostra «Caricamento 2 di 3…» nel suo turno', async () => {
    const attese = [differita<Foto>(), differita<Foto>(), differita<Foto>()]
    attese.forEach(a => vi.mocked(caricaFoto).mockImplementationOnce(() => a.promessa))
    apri()

    scegli(inputGalleria(), jpg('a.jpg'), jpg('b.jpg'), jpg('c.jpg'))
    expect(await screen.findByText('Caricamento 1 di 3…')).toBeInTheDocument()
    expect(caricaFoto).toHaveBeenCalledTimes(1)
    expect(screen.getAllByText('In attesa')).toHaveLength(2)

    await act(async () => { attese[0].ok(salvata('a')) })
    expect(await screen.findByText('Caricamento 2 di 3…')).toBeInTheDocument()
    expect(caricaFoto).toHaveBeenCalledTimes(2)

    await act(async () => { attese[1].ok(salvata('b')) })
    expect(await screen.findByText('Caricamento 3 di 3…')).toBeInTheDocument()
    await act(async () => { attese[2].ok(salvata('c')) })

    await waitFor(() => expect(screen.queryByText(/Caricamento/)).not.toBeInTheDocument())
  })

  it('a caricamento finito un solo toast verde «salvato», con quante foto', async () => {
    apri()
    scegli(inputGalleria(), jpg('a.jpg'), jpg('b.jpg'))
    await waitFor(() => expect(toastSalvato).toHaveBeenCalledTimes(1))
    expect(toastSalvato).toHaveBeenCalledWith('2 foto salvate.')
    expect(toast.error).not.toHaveBeenCalled()

    vi.mocked(toastSalvato).mockClear()
    scegli(inputScatto(), jpg('c.jpg'))
    await waitFor(() => expect(toastSalvato).toHaveBeenCalledWith('Foto salvata.'))
  })

  it('dopo ogni foto salvata rilegge le foto dell\'esperimento (e lo spazio, che sta sotto la stessa chiave)', async () => {
    const { invalida } = apri()
    scegli(inputGalleria(), jpg('a.jpg'), jpg('b.jpg'))
    await waitFor(() => expect(toastSalvato).toHaveBeenCalled())
    const chiamate = invalida.mock.calls.filter(c => JSON.stringify(c[0]?.queryKey) === JSON.stringify(chiavi.foto(E)))
    expect(chiamate.length).toBeGreaterThanOrEqual(2)
  })

  it('il campo si svuota dopo la scelta: la stessa foto si può scegliere di nuovo', async () => {
    apri()
    scegli(inputScatto(), jpg('a.jpg'))
    await waitFor(() => expect(toastSalvato).toHaveBeenCalled())
    expect(inputScatto().value).toBe('')
  })

  it('una scelta vuota non fa nulla', () => {
    apri()
    scegli(inputGalleria())
    expect(caricaFoto).not.toHaveBeenCalled()
  })

  it('mentre carica, chiudere la scheda del browser chiede conferma; a fine caricamento no', async () => {
    const attesa = differita<Foto>()
    vi.mocked(caricaFoto).mockImplementationOnce(() => attesa.promessa)
    apri()
    scegli(inputScatto(), jpg('a.jpg'))
    await screen.findByText('Caricamento 1 di 1…')

    const durante = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(durante)
    expect(durante.defaultPrevented).toBe(true)

    await act(async () => { attesa.ok(salvata('a')) })
    await waitFor(() => expect(toastSalvato).toHaveBeenCalled())
    const dopo = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dopo)
    expect(dopo.defaultPrevented).toBe(false)
  })
})

describe('AggiungiFoto: gli errori', () => {
  it('un errore è della singola foto: le altre si caricano, la sua riga ha il messaggio e Riprova', async () => {
    vi.mocked(caricaFoto)
      .mockImplementationOnce(async (_e, d) => salvata(d.id))
      .mockRejectedValueOnce(new Error('Non riesco ad aprire questa foto: prova con un\'altra o con una foto in formato JPEG.'))
      .mockImplementationOnce(async (_e, d) => salvata(d.id))
    apri()

    scegli(inputGalleria(), jpg('a.jpg'), jpg('rotta.jpg'), jpg('c.jpg'))

    const riga = (await screen.findByText('rotta.jpg')).closest('li')!
    expect(within(riga).getByRole('alert')).toHaveTextContent('Non riesco ad aprire questa foto')
    expect(within(riga).getByRole('button', { name: 'Riprova rotta.jpg' })).toBeInTheDocument()
    expect(caricaFoto).toHaveBeenCalledTimes(3)
    // Una foto è andata male: le altre due sono salvate e il toast lo dice, la rotta resta in vista.
    await waitFor(() => expect(toastSalvato).toHaveBeenCalledWith('2 foto salvate.'))
    expect(screen.queryByText('a.jpg')).not.toBeInTheDocument()
    expect(screen.queryByText(/Caricamento/)).not.toBeInTheDocument()
  })

  it('senza nessuna foto salvata non c\'è nessun toast verde', async () => {
    vi.mocked(caricaFoto).mockRejectedValue(new Error('Il server non risponde.'))
    apri()
    scegli(inputScatto(), jpg('a.jpg'))
    await screen.findByRole('alert')
    expect(toastSalvato).not.toHaveBeenCalled()
    // L'errore è nella pagina: nessun toast che lo ripeta.
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('Riprova riusa lo stesso id della prima prova: la stessa foto non si duplica', async () => {
    vi.mocked(caricaFoto).mockRejectedValueOnce(new Error('Il server non risponde.'))
    const { utente } = apri({ piantaId: 'p1' })
    scegli(inputScatto(), jpg('a.jpg'))
    await utente.click(await screen.findByRole('button', { name: 'Riprova a.jpg' }))

    await waitFor(() => expect(caricaFoto).toHaveBeenCalledTimes(2))
    const [prima, seconda] = vi.mocked(caricaFoto).mock.calls.map(c => c[1])
    expect(seconda.id).toBe(prima.id)
    expect(seconda.file).toBe(prima.file)
    expect(seconda.piantaId).toBe('p1')
    await waitFor(() => expect(toastSalvato).toHaveBeenCalledWith('Foto salvata.'))
    expect(screen.queryByText('a.jpg')).not.toBeInTheDocument()
  })

  it('mentre ritenta la riga dice «Caricamento 1 di 1…» e l\'errore non si vede più', async () => {
    vi.mocked(caricaFoto).mockRejectedValueOnce(new Error('Il server non risponde.'))
    const attesa = differita<Foto>()
    vi.mocked(caricaFoto).mockImplementationOnce(() => attesa.promessa)
    const { utente } = apri()
    scegli(inputScatto(), jpg('a.jpg'))
    await utente.click(await screen.findByRole('button', { name: 'Riprova a.jpg' }))

    expect(await screen.findByText('Caricamento 1 di 1…')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await act(async () => { attesa.ok(salvata('a')) })
  })

  it('Togli lascia perdere una foto che non va', async () => {
    vi.mocked(caricaFoto).mockRejectedValue(new Error('Foto troppo grande.'))
    const { utente } = apri()
    scegli(inputScatto(), jpg('a.jpg'))
    await utente.click(await screen.findByRole('button', { name: 'Togli a.jpg' }))
    expect(screen.queryByText('a.jpg')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('i pulsanti delle righe sono alti almeno 44 px (classi del pulsante)', async () => {
    vi.mocked(caricaFoto).mockRejectedValue(new Error('x'))
    apri()
    scegli(inputScatto(), jpg('a.jpg'))
    const riprova = await screen.findByRole('button', { name: 'Riprova a.jpg' })
    expect(riprova.className).toMatch(/h-11|h-12|h-13|min-h-11/)
  })
})

describe('AggiungiFoto: uscire mentre carica', () => {
  it('un caricamento iniziato si porta a termine anche se la pagina si smonta, e il toast verde arriva lo stesso', async () => {
    const attese = [differita<Foto>(), differita<Foto>()]
    attese.forEach(a => vi.mocked(caricaFoto).mockImplementationOnce(() => a.promessa))
    const { resa } = apri()
    scegli(inputGalleria(), jpg('a.jpg'), jpg('b.jpg'))
    await screen.findByText('Caricamento 1 di 2…')

    resa.unmount()
    await act(async () => { attese[0].ok(salvata('a')) })
    await waitFor(() => expect(caricaFoto).toHaveBeenCalledTimes(2))
    await act(async () => { attese[1].ok(salvata('b')) })

    await waitFor(() => expect(toastSalvato).toHaveBeenCalledWith('2 foto salvate.'))
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('se una foto fallisce dopo lo smontaggio c\'è un toast di errore che resta, con il nome della foto', async () => {
    const attesa = differita<Foto>()
    vi.mocked(caricaFoto).mockImplementationOnce(() => attesa.promessa)
    const { resa } = apri()
    scegli(inputScatto(), jpg('IMG_0412.jpg'))
    await screen.findByText('Caricamento 1 di 1…')

    resa.unmount()
    await act(async () => { attesa.ko(new Error('Il server non risponde.')) })

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    const [testo, opzioni] = vi.mocked(toast.error).mock.calls[0]
    expect(testo).toContain('IMG_0412.jpg')
    expect(testo).toContain('Il server non risponde.')
    expect(opzioni).toEqual(OPZIONI_ERRORE_TARDIVO)
    expect(toastSalvato).not.toHaveBeenCalled()
  })

  it('una foto già fallita non sparisce in silenzio allo smontaggio: un toast che resta dice quante vanno aggiunte di nuovo', async () => {
    vi.mocked(caricaFoto).mockRejectedValue(new Error('Il server non risponde.'))
    const { resa } = apri()
    scegli(inputGalleria(), jpg('a.jpg'), jpg('b.jpg'))
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2))
    expect(toast.error).not.toHaveBeenCalled()

    resa.unmount()

    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith('2 foto non sono state caricate: aggiungile di nuovo.', OPZIONI_ERRORE_TARDIVO)
  })

  it('con una sola foto fallita il toast è al singolare', async () => {
    vi.mocked(caricaFoto).mockRejectedValue(new Error('Il server non risponde.'))
    const { resa } = apri()
    scegli(inputScatto(), jpg('a.jpg'))
    await screen.findByRole('alert')
    resa.unmount()
    expect(toast.error).toHaveBeenCalledWith('1 foto non è stata caricata: aggiungila di nuovo.', OPZIONI_ERRORE_TARDIVO)
  })

  it('smontando senza foto fallite, o dopo «Togli» e dopo un nuovo tentativo riuscito, non c\'è nessun toast', async () => {
    vi.mocked(caricaFoto).mockRejectedValueOnce(new Error('x')).mockRejectedValueOnce(new Error('y'))
    const { resa, utente } = apri()
    scegli(inputGalleria(), jpg('a.jpg'), jpg('b.jpg'))
    await utente.click(await screen.findByRole('button', { name: 'Togli a.jpg' }))
    await utente.click(await screen.findByRole('button', { name: 'Riprova b.jpg' }))
    await waitFor(() => expect(toastSalvato).toHaveBeenCalled())
    resa.unmount()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('smontare la pagina non lascia la protezione della chiusura della scheda una volta finito', async () => {
    const attesa = differita<Foto>()
    vi.mocked(caricaFoto).mockImplementationOnce(() => attesa.promessa)
    const { resa } = apri()
    scegli(inputScatto(), jpg('a.jpg'))
    await screen.findByText('Caricamento 1 di 1…')
    resa.unmount()
    await act(async () => { attesa.ok(salvata('a')) })
    await waitFor(() => expect(toastSalvato).toHaveBeenCalled())
    const evento = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(evento)
    expect(evento.defaultPrevented).toBe(false)
  })
})
