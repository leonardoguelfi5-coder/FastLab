import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErroreRete, fetchConLimite, LIMITE_CARICAMENTO_MS, LIMITE_RICHIESTA_MS } from './rete'
import { messaggioErrore } from './errori'

const URL_DB = 'https://progetto.supabase.co/rest/v1/misure?select=*'
const URL_FILE = 'https://progetto.supabase.co/storage/v1/object/foto/E/f1.jpg'

/**
 * Un fetch finto che non risponde finché non lo si fa rispondere: come il fetch vero, se il segnale si interrompe
 * rifiuta con il motivo del segnale (un `AbortError` se non ne ha uno).
 */
function fetchSospeso() {
  const risposte: ((r: Response) => void)[] = []
  const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((risolvi, rifiuta) => {
    const segnale = init?.signal
    if (segnale?.aborted) { rifiuta(segnale.reason); return }
    segnale?.addEventListener('abort', () => rifiuta(segnale.reason))
    risposte.push(risolvi)
  }))
  return { fetch, rispondi: (r = new Response('[]')) => risposte.shift()?.(r) }
}

/** Il motivo per cui una promessa rifiuta, senza lasciarla mai senza gestore (i timer finti la fanno rifiutare dopo). */
function esito<T>(p: Promise<T>): Promise<unknown> {
  return p.then(() => 'risolta', (e: unknown) => e)
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchConLimite', () => {
  it('i limiti: 12 s per database, RPC e autenticazione, 90 s per i caricamenti nello Storage', () => {
    expect(LIMITE_RICHIESTA_MS).toBe(12_000)
    expect(LIMITE_CARICAMENTO_MS).toBe(90_000)
  })

  it('una risposta entro il limite passa così com\'è, e il timer si libera', async () => {
    const { fetch, rispondi } = fetchSospeso()
    vi.stubGlobal('fetch', fetch)
    const risposta = new Response('[1]', { status: 200 })
    const p = fetchConLimite(URL_DB, { method: 'GET', headers: { a: 'b' } })
    await vi.advanceTimersByTimeAsync(11_000)
    rispondi(risposta)
    await expect(p).resolves.toBe(risposta)
    expect(vi.getTimerCount()).toBe(0)
    // Le opzioni del chiamante arrivano al fetch, con il segnale del limite in più.
    const init = fetch.mock.calls[0][1]!
    expect(init.method).toBe('GET')
    expect(init.headers).toEqual({ a: 'b' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('una richiesta senza risposta dopo 12 s diventa ErroreRete("limite"), che si dice "Rete debole"', async () => {
    const { fetch } = fetchSospeso()
    vi.stubGlobal('fetch', fetch)
    const p = esito(fetchConLimite(URL_DB, { method: 'POST', body: '{}' }))
    await vi.advanceTimersByTimeAsync(LIMITE_RICHIESTA_MS - 1)
    expect(fetch.mock.calls[0][1]!.signal!.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const e = await p
    expect(e).toBeInstanceOf(ErroreRete)
    expect((e as ErroreRete).motivo).toBe('limite')
    expect(messaggioErrore(e)).toBe('Rete debole: riprova.')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('vale anche senza opzioni e per un URL', async () => {
    const { fetch } = fetchSospeso()
    vi.stubGlobal('fetch', fetch)
    const p = esito(fetchConLimite(new URL(URL_DB)))
    await vi.advanceTimersByTimeAsync(LIMITE_RICHIESTA_MS)
    expect(await p).toMatchObject({ motivo: 'limite' })
  })

  it.each(['POST', 'PUT', 'put'])('il caricamento di un file (%s su /storage/v1/object/) non scade a 12 s ma a 90 s', async (metodo) => {
    const { fetch, rispondi } = fetchSospeso()
    vi.stubGlobal('fetch', fetch)
    const p = fetchConLimite(URL_FILE, { method: metodo, body: new Blob(['x']) })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetch.mock.calls[0][1]!.signal!.aborted).toBe(false)
    rispondi()
    await expect(p).resolves.toBeInstanceOf(Response)

    const scaduta = esito(fetchConLimite(URL_FILE, { method: metodo, body: new Blob(['x']) }))
    await vi.advanceTimersByTimeAsync(LIMITE_CARICAMENTO_MS)
    expect(await scaduta).toMatchObject({ motivo: 'limite' })
  })

  it('il caricamento verso un URL firmato (PUT su /storage/v1/object/upload/sign/) ha 90 s', async () => {
    const { fetch, rispondi } = fetchSospeso()
    vi.stubGlobal('fetch', fetch)
    const p = fetchConLimite('https://progetto.supabase.co/storage/v1/object/upload/sign/foto/E/f1.jpg?token=t', { method: 'PUT' })
    await vi.advanceTimersByTimeAsync(30_000)
    rispondi()
    await expect(p).resolves.toBeInstanceOf(Response)
  })

  it('le altre richieste allo Storage (eliminare, elencare con GET o DELETE) restano a 12 s', async () => {
    const { fetch } = fetchSospeso()
    vi.stubGlobal('fetch', fetch)
    const togli = esito(fetchConLimite('https://progetto.supabase.co/storage/v1/object/foto', { method: 'DELETE' }))
    const leggi = esito(fetchConLimite(URL_FILE))
    await vi.advanceTimersByTimeAsync(LIMITE_RICHIESTA_MS)
    expect(await togli).toMatchObject({ motivo: 'limite' })
    expect(await leggi).toMatchObject({ motivo: 'limite' })
  })

  it('il metodo di una Request vale come quello delle opzioni', async () => {
    const { fetch, rispondi } = fetchSospeso()
    vi.stubGlobal('fetch', fetch)
    const p = fetchConLimite(new Request(URL_FILE, { method: 'POST', body: 'x' }))
    await vi.advanceTimersByTimeAsync(30_000)
    rispondi()
    await expect(p).resolves.toBeInstanceOf(Response)
  })

  it('un errore di rete (TypeError del fetch) diventa ErroreRete("rete"), con l\'errore di partenza come causa', async () => {
    const originale = new TypeError('Failed to fetch')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(originale))
    const e = await esito(fetchConLimite(URL_DB))
    expect(e).toBeInstanceOf(ErroreRete)
    expect(e).toMatchObject({ motivo: 'rete', cause: originale })
    expect(messaggioErrore(e)).toBe('Rete debole: riprova.')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('un altro errore passa così com\'è', async () => {
    const strano = new Error('qualcos\'altro')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(strano))
    expect(await esito(fetchConLimite(URL_DB))).toBe(strano)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('un annullamento del chiamante resta un AbortError del chiamante, mai "Rete debole"', async () => {
    const { fetch } = fetchSospeso()
    vi.stubGlobal('fetch', fetch)
    const chiamante = new AbortController()
    const p = esito(fetchConLimite(URL_DB, { signal: chiamante.signal }))
    await vi.advanceTimersByTimeAsync(1_000)
    chiamante.abort()
    const e = await p
    expect(e).not.toBeInstanceOf(ErroreRete)
    expect(e).toBe(chiamante.signal.reason)
    expect((e as DOMException).name).toBe('AbortError')
    expect(messaggioErrore(e)).not.toContain('Rete debole')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('un segnale del chiamante già interrotto non fa partire nulla che scada', async () => {
    const { fetch } = fetchSospeso()
    vi.stubGlobal('fetch', fetch)
    const chiamante = new AbortController()
    chiamante.abort()
    expect(await esito(fetchConLimite(URL_DB, { signal: chiamante.signal }))).toBe(chiamante.signal.reason)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('il segnale di una Request si unisce a quello del limite', async () => {
    const { fetch } = fetchSospeso()
    vi.stubGlobal('fetch', fetch)
    const chiamante = new AbortController()
    const p = esito(fetchConLimite(new Request(URL_DB, { signal: chiamante.signal })))
    chiamante.abort()
    expect(await p).not.toBeInstanceOf(ErroreRete)
  })

  describe('senza AbortSignal.any (Safari prima della 17.4)', () => {
    beforeEach(() => {
      const originale = AbortSignal.any
      Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true, writable: true })
      return () => { Object.defineProperty(AbortSignal, 'any', { value: originale, configurable: true, writable: true }) }
    })

    it('il limite scade lo stesso', async () => {
      const { fetch } = fetchSospeso()
      vi.stubGlobal('fetch', fetch)
      const p = esito(fetchConLimite(URL_DB, { signal: new AbortController().signal }))
      await vi.advanceTimersByTimeAsync(LIMITE_RICHIESTA_MS)
      expect(await p).toMatchObject({ motivo: 'limite' })
    })

    it('l\'annullamento del chiamante arriva al fetch e resta del chiamante', async () => {
      const { fetch } = fetchSospeso()
      vi.stubGlobal('fetch', fetch)
      const chiamante = new AbortController()
      const p = esito(fetchConLimite(URL_DB, { signal: chiamante.signal }))
      chiamante.abort()
      const e = await p
      expect(e).toBe(chiamante.signal.reason)
      expect(fetch.mock.calls[0][1]!.signal!.aborted).toBe(true)
    })

    it('a richiesta finita l\'ascolto del segnale del chiamante si toglie', async () => {
      const { fetch, rispondi } = fetchSospeso()
      vi.stubGlobal('fetch', fetch)
      const chiamante = new AbortController()
      const aggiungi = vi.spyOn(chiamante.signal, 'addEventListener')
      const togli = vi.spyOn(chiamante.signal, 'removeEventListener')
      const p = fetchConLimite(URL_DB, { signal: chiamante.signal })
      rispondi()
      await p
      expect(aggiungi).toHaveBeenCalledOnce()
      expect(togli).toHaveBeenCalledWith('abort', aggiungi.mock.calls[0][1])
      expect(vi.getTimerCount()).toBe(0)
    })

    it('un segnale già interrotto si vede subito', async () => {
      const { fetch } = fetchSospeso()
      vi.stubGlobal('fetch', fetch)
      const chiamante = new AbortController()
      chiamante.abort()
      expect(await esito(fetchConLimite(URL_DB, { signal: chiamante.signal }))).toBe(chiamante.signal.reason)
    })
  })
})
