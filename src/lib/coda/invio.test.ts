import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: vi.fn() } } }))
vi.mock('@/api/misure', () => ({ salvaMisura: vi.fn() }))
vi.mock('@/lib/toastSalvato', () => ({ toastSalvato: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }))

import { toast } from 'sonner'
import { salvaMisura } from '@/api/misure'
import { supabase } from '@/lib/supabase'
import { chiavi } from '@/api/query'
import type { Misura } from '@/domain/tipi'
import { ErroreRete } from '@/lib/rete'
import { toastSalvato } from '@/lib/toastSalvato'
import { accoda, aggiornaVoce, chiaveCoda, impostaUtenteCoda, vociDi } from './codaMisure'
import { attesaDopo, avviaInvioAutomatico, eDefinitivo, inviaCoda } from './invio'

const OGGI = '2026-10-28'
const misura = (id: string, extra: Partial<Misura> = {}): Misura => ({
  id, pianta_id: `p-${id}`, strumento_id: 'spad', data_rilievo: OGGI, ora: '09:12', valori: { spad: [38.1] }, ...extra,
})
const metti = (id: string, etichetta = id, extra: Partial<Misura> = {}) =>
  accoda('u1', 'E', misura(id, extra), { etichetta, strumento: '💚 SPAD', sulServer: false })
const errorePg = (code: string, status: number) => ({ code, message: `errore ${code}`, details: '', hint: '', status })
/** Il messaggio di PostgreSQL quando l'upsert trova una riga che la using dell'update non lascia toccare. */
const MSG_USING = 'new row violates row-level security policy (USING expression) for table "misure"'

let client: QueryClient
/** Le misure arrivate al server, nell'ordine. */
let arrivate: Misura[]

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 28, 10, 0))
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  arrivate = []
  vi.mocked(salvaMisura).mockImplementation(async (_esp, m) => { arrivate.push(m) })
  sessioneDi('u1')
  impostaUtenteCoda('u1')
})

/** La sessione salvata da supabase-js, con cui partono le richieste: di `id`, o nessuna. */
function sessioneDi(id: string | null) {
  vi.mocked(supabase.auth.getSession).mockResolvedValue(
    { data: { session: id ? { user: { id } } : null }, error: null } as never,
  )
}
afterEach(() => {
  impostaUtenteCoda(null)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('eDefinitivo', () => {
  it.each([
    ['RLS', errorePg('42501', 403)],
    // Piano E, Task E9: un rilevatore che corregge la misura di un altro (l'upsert passa l'insert e si ferma sulla using
    // dell'update), o chi è lettore o è stato tolto dall'esperimento.
    ['RLS, misura di un altro', { ...errorePg('42501', 403), message: MSG_USING }],
    ['RLS, chi non scrive piu\'', { ...errorePg('42501', 403), message: 'new row violates row-level security policy for table "misure"' }],
    ['doppione', errorePg('23505', 409)],
    ['pianta tolta (chiave esterna)', errorePg('23503', 409)],
    ['dato non valido', errorePg('22P02', 400)],
    ['guardia del database', { code: 'P0001', message: 'PARAMETRO_CON_DATI', details: '', hint: '' }],
    ['400 di PostgREST senza codice del database', { code: 'PGRST204', message: 'colonna', status: 400 }],
    ['403', { message: 'vietato', status: 403 }],
  ])('%s: definitivo, non si ritenta', (_nome, e) => {
    expect(eDefinitivo(e)).toBe(true)
  })

  it.each([
    ['ErroreRete per limite', new ErroreRete('limite')],
    ['ErroreRete per rete', new ErroreRete('rete')],
    ['ErroreRete ricopiato da PostgREST', { message: 'ErroreRete: Rete debole: la richiesta non è arrivata.', code: '', status: 0 }],
    ['Failed to fetch', new TypeError('Failed to fetch')],
    ['500', { message: 'Internal Server Error', status: 500 }],
    ['503 database in pausa', { code: 'PGRST002', message: 'schema cache', status: 503 }],
    ['408', { message: 'timeout', status: 408 }],
    ['429', { message: 'troppe richieste', status: 429 }],
    ['sessione scaduta', { code: 'PGRST301', message: 'JWT expired', status: 401 }],
    // Senza token PostgREST risponde 401 con il codice dei permessi: è la sessione che manca, non il dato sbagliato.
    ['401 senza sessione, con 42501', { code: '42501', message: 'permission denied for table misure', status: 401 }],
    ['statement timeout', errorePg('57014', 500)],
    ['un errore sconosciuto', new Error('boh')],
  ])('%s: di passaggio, si ritenta', (_nome, e) => {
    expect(eDefinitivo(e)).toBe(false)
  })
})

describe('attesaDopo', () => {
  it('2, 5, 15, 30, 60 secondi e poi sempre 60', () => {
    expect([1, 2, 3, 4, 5, 6, 20].map(attesaDopo)).toEqual([2000, 5000, 15000, 30000, 60000, 60000, 60000])
  })
})

describe('inviaCoda', () => {
  it('manda la voce con l\'upsert, la toglie, aggiorna la cache e solo allora dà il verde', async () => {
    metti('m1', '35')
    client.setQueryData<Misura[]>(chiavi.misurePianta('p-m1'), [])
    client.setQueryData<Misura[]>(chiavi.misureGiorno('E', OGGI), [])
    const invalida = vi.spyOn(client, 'invalidateQueries')
    let arriva: () => void = () => {}
    vi.mocked(salvaMisura).mockImplementationOnce((_esp, m) => new Promise(ok => { arriva = () => { arrivate.push(m); ok() } }))

    const invio = inviaCoda('u1', client)
    await vi.waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(toastSalvato).not.toHaveBeenCalled()
    expect(vociDi('u1')[0].stato).toBe('invio')

    arriva()
    await expect(invio).resolves.toMatchObject({ inviate: 1, rifiutate: 0 })
    expect(salvaMisura).toHaveBeenCalledWith('E', misura('m1'))
    expect(vociDi('u1')).toEqual([])
    expect(toastSalvato).toHaveBeenCalledWith('Pianta #35 salvata ✓')
    expect(client.getQueryData(chiavi.misurePianta('p-m1'))).toEqual([misura('m1')])
    expect(client.getQueryData(chiavi.misureGiorno('E', OGGI))).toEqual([misura('m1')])
    // Le altre letture sono vecchie ma non si rileggono adesso (con poco segnale sarebbero altre richieste).
    expect(invalida).toHaveBeenCalledWith({ queryKey: chiavi.ultimeMisure('E'), refetchType: 'none' })
    expect(invalida).toHaveBeenCalledWith({ queryKey: chiavi.ultimeMisurePiante('E'), refetchType: 'none' })
    expect(invalida).toHaveBeenCalledWith({ queryKey: chiavi.esperimenti, refetchType: 'none' })
    expect(invalida).toHaveBeenCalledWith({ queryKey: chiavi.misureStrumento('E', 'spad'), refetchType: 'none' })
  })

  it('una correzione che sposta la misura di giorno la toglie dalla cache del giorno di prima', async () => {
    client.setQueryData<Misura[]>(chiavi.misureGiorno('E', OGGI), [misura('m1')])
    client.setQueryData<Misura[]>(chiavi.misureGiorno('E', '2026-10-27'), [])
    accoda('u1', 'E', misura('m1', { data_rilievo: '2026-10-27' }), { etichetta: '1', strumento: 'SPAD', sulServer: true })
    await inviaCoda('u1', client)
    expect(client.getQueryData(chiavi.misureGiorno('E', OGGI))).toEqual([])
    expect(client.getQueryData(chiavi.misureGiorno('E', '2026-10-27'))).toEqual([misura('m1', { data_rilievo: '2026-10-27' })])
  })

  it('più misure inviate insieme: un toast solo', async () => {
    metti('m1')
    metti('m2')
    metti('m3')
    await expect(inviaCoda('u1', client)).resolves.toMatchObject({ inviate: 3 })
    expect(arrivate.map(m => m.id)).toEqual(['m1', 'm2', 'm3'])
    expect(toastSalvato).toHaveBeenCalledTimes(1)
    expect(toastSalvato).toHaveBeenCalledWith('3 misure inviate ✓')
  })

  it('un errore di rete ferma il giro e pianifica il prossimo tentativo; niente verde', async () => {
    metti('m1')
    metti('m2')
    vi.mocked(salvaMisura).mockRejectedValueOnce(new ErroreRete('limite'))

    await expect(inviaCoda('u1', client)).resolves.toMatchObject({ inviate: 0, fermato: true })

    expect(salvaMisura).toHaveBeenCalledTimes(1)
    const [v1, v2] = vociDi('u1')
    expect(v1).toMatchObject({ stato: 'attesa', tentativi: 1, prossimoTentativo: Date.now() + 2000, errore: 'Rete debole: riprova.' })
    expect(v1.forseSulServer).toBe(true)
    expect(v2).toMatchObject({ stato: 'attesa', tentativi: 0 })
    expect(toastSalvato).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('le attese crescono a ogni errore di passaggio', async () => {
    metti('m1')
    vi.mocked(salvaMisura).mockRejectedValue(new ErroreRete('rete'))
    for (const attesa of [2000, 5000, 15000]) {
      await inviaCoda('u1', client, { forza: true })
      expect(vociDi('u1')[0].prossimoTentativo).toBe(Date.now() + attesa)
    }
    expect(vociDi('u1')[0].tentativi).toBe(3)
  })

  it('senza forza le voci che aspettano non partono prima del loro momento; con forza sì', async () => {
    metti('m1')
    const [v] = vociDi('u1')
    aggiornaVoce('u1', 'm1', v.revisione, x => ({ ...x, tentativi: 1, prossimoTentativo: Date.now() + 2000 }))
    await inviaCoda('u1', client)
    expect(salvaMisura).not.toHaveBeenCalled()
    vi.setSystemTime(Date.now() + 2000)
    await inviaCoda('u1', client)
    expect(salvaMisura).toHaveBeenCalledTimes(1)
  })

  it('una misura rifiutata resta con il motivo, non ferma le altre e non si ritenta', async () => {
    metti('m1', '35')
    metti('m2', '36')
    vi.mocked(salvaMisura).mockRejectedValueOnce(errorePg('23503', 409))

    await expect(inviaCoda('u1', client)).resolves.toMatchObject({ inviate: 1, rifiutate: 1 })

    expect(arrivate.map(m => m.id)).toEqual(['m2'])
    const [rifiutata] = vociDi('u1')
    expect(rifiutata).toMatchObject({ stato: 'rifiutata', prossimoTentativo: null })
    expect(rifiutata.errore).toBe('La pianta o lo strumento non c\'è più nell\'esperimento.')
    expect(toastSalvato).toHaveBeenCalledWith('Pianta #36 salvata ✓')
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Pianta #35 non inviata'), expect.anything())

    await inviaCoda('u1', client, { forza: true })
    expect(salvaMisura).toHaveBeenCalledTimes(2)
  })

  it('rilevatore che corregge la misura di un altro (42501 dall\'upsert): non inviata con il motivo, mai ritentata', async () => {
    metti('m1', '35')
    metti('m2', '36')
    vi.mocked(salvaMisura).mockRejectedValueOnce({ code: '42501', message: MSG_USING, details: null, hint: null, status: 403 })

    await expect(inviaCoda('u1', client)).resolves.toMatchObject({ inviate: 1, rifiutate: 1, fermato: false })

    const [rifiutata] = vociDi('u1')
    expect(rifiutata).toMatchObject({ stato: 'rifiutata', prossimoTentativo: null })
    expect(rifiutata.misura.id).toBe('m1')
    expect(rifiutata.errore).toBe('Questa misura l\'ha salvata un\'altra persona: puoi correggere solo le tue.')
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Pianta #35 non inviata'), expect.anything())

    // Né da sola né con "Invia ora": un rifiuto non si ritenta.
    await inviaCoda('u1', client)
    await inviaCoda('u1', client, { forza: true })
    expect(salvaMisura).toHaveBeenCalledTimes(2)
  })

  it('lettore o tolto dall\'esperimento (42501 dall\'insert): non inviata, con il motivo dei permessi', async () => {
    metti('m1', '35')
    vi.mocked(salvaMisura).mockRejectedValueOnce(
      { code: '42501', message: 'new row violates row-level security policy for table "misure"', details: null, hint: null, status: 403 })

    await inviaCoda('u1', client)

    const [rifiutata] = vociDi('u1')
    expect(rifiutata).toMatchObject({ stato: 'rifiutata', prossimoTentativo: null })
    expect(rifiutata.errore).toBe('Non hai il permesso di salvare misure in questo esperimento: chiedi al proprietario.')
  })

  it('un solo invio alla volta: una seconda chiamata durante l\'invio non manda di nuovo la stessa misura', async () => {
    metti('m1')
    let arriva: () => void = () => {}
    vi.mocked(salvaMisura).mockImplementationOnce(() => new Promise(ok => { arriva = ok }))
    const prima = inviaCoda('u1', client)
    const seconda = inviaCoda('u1', client)
    await vi.waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    arriva()
    await Promise.all([prima, seconda])
    expect(salvaMisura).toHaveBeenCalledTimes(1)
  })

  it('una misura accodata durante l\'invio di un\'altra parte nello stesso giro', async () => {
    metti('m1')
    let arriva: () => void = () => {}
    vi.mocked(salvaMisura).mockImplementationOnce((_e, m) => new Promise(ok => { arriva = () => { arrivate.push(m); ok() } }))
    const giro = inviaCoda('u1', client)
    await vi.waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    metti('m2')
    void inviaCoda('u1', client)
    arriva()
    await giro
    await vi.waitFor(() => expect(arrivate.map(m => m.id)).toEqual(['m1', 'm2']))
    expect(vociDi('u1')).toEqual([])
  })

  it('una correzione fatta mentre partiva la versione di prima resta in coda e parte dopo', async () => {
    metti('m1')
    let arriva: () => void = () => {}
    vi.mocked(salvaMisura).mockImplementationOnce((_e, m) => new Promise(ok => { arriva = () => { arrivate.push(m); ok() } }))
    const giro = inviaCoda('u1', client)
    await vi.waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    accoda('u1', 'E', misura('m1', { valori: { spad: [40] } }), { etichetta: '1', strumento: 'SPAD', sulServer: false })
    arriva()
    await giro
    await vi.waitFor(() => expect(arrivate).toHaveLength(2))
    expect(arrivate[1].valori).toEqual({ spad: [40] })
    expect(vociDi('u1')).toEqual([])
  })

  it('una lettura del giorno partita prima dell\'invio e arrivata dopo non cancella la misura appena arrivata', async () => {
    client.setQueryData<Misura[]>(chiavi.misureGiorno('E', OGGI), [])
    client.setQueryData<Misura[]>(chiavi.misurePianta('p-m1'), [])
    // Le letture partono prima che la misura arrivi al server: risponderanno senza di lei.
    const risposte: ((v: Misura[]) => void)[] = []
    const lenta = () => new Promise<Misura[]>(r => { risposte.push(r) })
    const letture = [
      client.fetchQuery({ queryKey: chiavi.misureGiorno('E', OGGI), queryFn: lenta, staleTime: 0 }).catch(() => undefined),
      client.fetchQuery({ queryKey: chiavi.misurePianta('p-m1'), queryFn: lenta, staleTime: 0 }).catch(() => undefined),
    ]
    metti('m1')
    await inviaCoda('u1', client)
    for (const r of risposte) r([])
    await Promise.all(letture)

    expect(vociDi('u1')).toEqual([])
    expect(client.getQueryData(chiavi.misureGiorno('E', OGGI))).toEqual([misura('m1')])
    expect(client.getQueryData(chiavi.misurePianta('p-m1'))).toEqual([misura('m1')])
  })

  it('una voce tolta mentre era in viaggio (da un\'altra scheda) non torna nella cache e non ha verde', async () => {
    client.setQueryData<Misura[]>(chiavi.misureGiorno('E', OGGI), [])
    metti('m1')
    vi.mocked(salvaMisura).mockImplementationOnce(async () => { localStorage.removeItem(chiaveCoda('u1')) })
    await inviaCoda('u1', client)
    expect(client.getQueryData(chiavi.misureGiorno('E', OGGI))).toEqual([])
    expect(toastSalvato).not.toHaveBeenCalled()
  })

  it('l\'utente cambia durante l\'invio della prima voce: la seconda non parte', async () => {
    metti('m1')
    metti('m2')
    vi.mocked(salvaMisura).mockImplementationOnce(async (_e, m) => {
      arrivate.push(m)
      impostaUtenteCoda('u2')
    })
    await inviaCoda('u1', client)
    expect(arrivate.map(m => m.id)).toEqual(['m1'])
    expect(vociDi('u1').map(v => v.misura.id)).toEqual(['m2'])
  })

  it.each([
    ['di un altro utente', () => sessioneDi('u2')],
    ['assente (senza rete con il token scaduto)', () => sessioneDi(null)],
    ['che non si legge', () => vi.mocked(supabase.auth.getSession).mockRejectedValue(new ErroreRete('rete'))],
  ])('con la sessione salvata %s non invia, e la voce resta com\'è', async (_nome, imposta) => {
    metti('m1')
    imposta()
    await inviaCoda('u1', client, { forza: true })
    expect(salvaMisura).not.toHaveBeenCalled()
    expect(vociDi('u1')[0]).toMatchObject({ stato: 'attesa', tentativi: 0, errore: null, inViaggio: null })
  })

  it('una correzione accodata mentre parte la versione di prima: in viaggio finché l\'invio non risponde', async () => {
    metti('m1')
    let arriva: () => void = () => {}
    vi.mocked(salvaMisura).mockImplementationOnce((_e, m) => new Promise(ok => { arriva = () => { arrivate.push(m); ok() } }))
    const giro = inviaCoda('u1', client)
    await vi.waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    const { revisione } = vociDi('u1')[0]
    accoda('u1', 'E', misura('m1', { valori: { spad: [40] } }), { etichetta: '1', strumento: 'SPAD', sulServer: false })
    expect(vociDi('u1')[0]).toMatchObject({ stato: 'attesa', inViaggio: revisione })
    arriva()
    await giro
    expect(vociDi('u1')).toEqual([])
    expect(arrivate.map(m => m.valori.spad)).toEqual([[38.1], [40]])
  })

  it('non invia a nome di un altro utente: solo le voci dell\'utente con la sessione', async () => {
    metti('m1')
    impostaUtenteCoda('u2')
    await inviaCoda('u1', client, { forza: true })
    expect(salvaMisura).not.toHaveBeenCalled()
    await inviaCoda('u2', client, { forza: true })
    expect(salvaMisura).not.toHaveBeenCalled()
    expect(vociDi('u1')).toHaveLength(1)
  })

  it('un rifiuto arrivato mentre l\'utente usciva non rende rifiutata la misura (era la sessione, non il dato)', async () => {
    metti('m1')
    vi.mocked(salvaMisura).mockImplementationOnce(async () => {
      impostaUtenteCoda(null)
      throw errorePg('42501', 403)
    })
    await inviaCoda('u1', client)
    expect(vociDi('u1')[0]).toMatchObject({ stato: 'attesa', errore: null })
  })

  it('una voce rimasta "in invio" (app chiusa a metà) riparte', async () => {
    metti('m1')
    const [v] = vociDi('u1')
    aggiornaVoce('u1', 'm1', v.revisione, x => ({ ...x, stato: 'invio' }))
    await inviaCoda('u1', client)
    expect(arrivate.map(m => m.id)).toEqual(['m1'])
  })

  it('senza rete (navigator.onLine falso) non prova; con forza ("Invia ora") sì', async () => {
    metti('m1')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await inviaCoda('u1', client)
    expect(salvaMisura).not.toHaveBeenCalled()
    await inviaCoda('u1', client, { forza: true })
    expect(salvaMisura).toHaveBeenCalledTimes(1)
  })

  it('con navigator.locks invia dentro il blocco "fastlab-coda" (una sola scheda alla volta)', async () => {
    metti('m1')
    const request = vi.fn(async (_nome: string, fn: () => Promise<unknown>) => fn())
    Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true })
    try {
      await inviaCoda('u1', client)
    } finally {
      Reflect.deleteProperty(navigator, 'locks')
    }
    expect(request).toHaveBeenCalledWith('fastlab-coda', expect.any(Function))
    expect(arrivate).toHaveLength(1)
  })
})

describe('avviaInvioAutomatico', () => {
  let ferma: () => void = () => {}
  afterEach(() => ferma())

  it('riparte al ritorno della rete', async () => {
    metti('m1')
    impostaUtenteCoda(null)
    ferma = avviaInvioAutomatico(client)
    vi.mocked(salvaMisura).mockClear()
    impostaUtenteCoda('u1')
    await vi.waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(vociDi('u1')).toEqual([])

    metti('m2')
    vi.mocked(salvaMisura).mockClear()
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
  })

  it('riparte quando l\'app torna visibile', async () => {
    ferma = avviaInvioAutomatico(client)
    await Promise.resolve()
    metti('m1')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(arrivate.map(m => m.id)).toEqual(['m1']))
  })

  it('ritenta da solo dopo l\'attesa di un errore di rete', async () => {
    vi.useRealTimers()
    vi.useFakeTimers()
    metti('m1')
    vi.mocked(salvaMisura).mockRejectedValueOnce(new ErroreRete('rete'))
    ferma = avviaInvioAutomatico(client)
    await vi.advanceTimersByTimeAsync(10)
    expect(salvaMisura).toHaveBeenCalledTimes(1)
    expect(vociDi('u1')).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1500)
    expect(salvaMisura).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(salvaMisura).toHaveBeenCalledTimes(2)
    expect(vociDi('u1')).toEqual([])
  })

  it('all\'accesso di un altro utente non invia le voci del primo', async () => {
    metti('m1')
    impostaUtenteCoda(null)
    ferma = avviaInvioAutomatico(client)
    impostaUtenteCoda('u2')
    await new Promise(ok => setTimeout(ok, 20))
    expect(salvaMisura).not.toHaveBeenCalled()
  })
})
