import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { chiavi } from '@/api/query'
import type { Misura } from '@/domain/tipi'
import {
  avviaCachePersistente, cancellaCache, CHIAVE_CACHE, DURATA_IN_MEMORIA_MS, ePersistente, LIMITE_CACHE, ripristinaCache,
  salvaCache, VALIDITA_CACHE_MS, VERSIONE_DATI_CACHE,
} from './cachePersistente'

const ADESSO = Date.parse('2026-11-04T09:12:00')
const ORA = 60 * 60 * 1000
const misura = (id: string, piantaId = 'p35', extra: Partial<Misura> = {}): Misura => ({
  id, pianta_id: piantaId, strumento_id: 'spad', data_rilievo: '2026-11-04', ora: '09:12', valori: { spad: [38.1] }, ...extra,
})

/** Un QueryClient con i dati dati, letti all'istante `letto` (di default un'ora prima di ADESSO). */
function clientCon(dati: [readonly unknown[], unknown][], letto = ADESSO - ORA): QueryClient {
  const client = new QueryClient()
  for (const [chiave, valore] of dati) client.setQueryData(chiave, valore, { updatedAt: letto })
  return client
}

const CONFIG = { esperimento: { id: 'E', nome: 'Pomodori' }, fattori: [], trattamenti: [], piante: [{ id: 'p35' }], parametri: [], strumenti: [] }

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('l\'elenco chiuso', () => {
  it('ci sono esperimenti, configurazione, misure del giorno, misure della pianta, ultime misure per strumento', () => {
    expect(ePersistente(chiavi.esperimenti)).toBe(true)
    expect(ePersistente(chiavi.config('E'))).toBe(true)
    expect(ePersistente(chiavi.misureGiorno('E', '2026-11-04'))).toBe(true)
    expect(ePersistente(chiavi.misurePianta('p35'))).toBe(true)
    expect(ePersistente(chiavi.ultimeMisure('E'))).toBe(true)
  })

  it('c\'è il ruolo nell\'esperimento (Piano E, Task E9): senza rete il lettore resta lettore', () => {
    expect(ePersistente(chiavi.ruolo('E'))).toBe(true)
    expect(ePersistente(['config', '', 'ruolo'])).toBe(false)
    expect(ePersistente(['config', 'E', 'altro'])).toBe(false)
  })

  it('non ci sono chi ha dati e chi no, misure per strumento, foto, URL firmati, note, inviti, catalogo e il resto', () => {
    for (const chiave of [
      chiavi.parametriConDati('E'), chiavi.pianteConDati('E'), chiavi.pianteNonEliminabili('E'), chiavi.conteggiStrumenti('E'),
      chiavi.misureStrumento('E', 'spad'), chiavi.misura('m1'), chiavi.ultimeMisurePiante('E'), chiavi.foto('E'),
      chiavi.spazio('E'), chiavi.urlFoto(['E/f1.jpg']), chiavi.note('E'), chiavi.exportSalvati('E'), chiavi.inviti,
      chiavi.catalogo, chiavi.sonoAdmin,
    ]) expect(ePersistente(chiave), JSON.stringify(chiave)).toBe(false)
  })

  it('le chiavi escluse non finiscono nel salvataggio', () => {
    const client = clientCon([
      [chiavi.config('E'), CONFIG],
      [chiavi.parametriConDati('E'), ['segreto-parametri']],
      [chiavi.misureStrumento('E', 'spad'), [misura('segreto-strumento')]],
      [chiavi.foto('E'), [{ id: 'segreto-foto' }]],
      [chiavi.urlFoto(['E/f1.jpg']), { 'E/f1.jpg': 'https://segreto-url' }],
      [chiavi.note('E'), [{ id: 'segreto-nota' }]],
      [chiavi.catalogo, [{ id: 'segreto-catalogo' }]],
    ])
    salvaCache(client, 'u1', 'v1', ADESSO)
    const testo = localStorage.getItem(CHIAVE_CACHE) ?? ''
    expect(testo).toContain('Pomodori')
    expect(testo).not.toContain('segreto')

    const nuovo = new QueryClient()
    ripristinaCache(nuovo, 'u1', ADESSO)
    expect(nuovo.getQueryData(chiavi.config('E'))).toEqual(CONFIG)
    expect(nuovo.getQueryCache().getAll()).toHaveLength(1)
  })

  it('solo le letture riuscite: una in errore o ancora in attesa non si salva', async () => {
    const client = clientCon([[chiavi.esperimenti, [{ id: 'E' }]]])
    await client.prefetchQuery({ queryKey: chiavi.config('E'), queryFn: () => Promise.reject(new Error('no')), retry: false })
    void client.prefetchQuery({ queryKey: chiavi.config('F'), queryFn: () => new Promise(() => {}) })
    salvaCache(client, 'u1', 'v1', ADESSO)
    const nuovo = new QueryClient()
    ripristinaCache(nuovo, 'u1', ADESSO)
    expect(nuovo.getQueryCache().getAll().map(q => q.queryKey)).toEqual([chiavi.esperimenti])
  })
})

describe('salvaCache e ripristinaCache', () => {
  it('ripristina i dati dello stesso utente e della stessa versione, con le mappe (ultime misure per strumento)', () => {
    const client = clientCon([
      [chiavi.esperimenti, [{ id: 'E', nome: 'Pomodori' }]],
      [chiavi.config('E'), CONFIG],
      [chiavi.misureGiorno('E', '2026-11-04'), [misura('m1')]],
      [chiavi.misurePianta('p35'), [misura('m1')]],
      [chiavi.ultimeMisure('E'), new Map([['spad', '2026-11-04'], ['termo', '2026-11-03']])],
    ])
    salvaCache(client, 'u1', 'v1', ADESSO)

    const nuovo = new QueryClient()
    expect(ripristinaCache(nuovo, 'u1', ADESSO)).toEqual({ letteIl: ADESSO - ORA })
    expect(nuovo.getQueryData(chiavi.esperimenti)).toEqual([{ id: 'E', nome: 'Pomodori' }])
    expect(nuovo.getQueryData(chiavi.config('E'))).toEqual(CONFIG)
    expect(nuovo.getQueryData(chiavi.misureGiorno('E', '2026-11-04'))).toEqual([misura('m1')])
    expect(nuovo.getQueryData(chiavi.misurePianta('p35'))).toEqual([misura('m1')])
    const ultime = nuovo.getQueryData(chiavi.ultimeMisure('E'))
    expect(ultime).toBeInstanceOf(Map)
    expect([...(ultime as Map<string, string>)]).toEqual([['spad', '2026-11-04'], ['termo', '2026-11-03']])
  })

  it('i dati ripristinati restano quelli letti allora e sono vecchi: si rileggono appena servono', () => {
    salvaCache(clientCon([[chiavi.config('E'), CONFIG]], ADESSO - 5_000), 'u1', 'v1', ADESSO)
    const nuovo = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } })
    ripristinaCache(nuovo, 'u1', ADESSO)
    const query = nuovo.getQueryCache().find({ queryKey: chiavi.config('E'), exact: true })
    expect(query?.state.dataUpdatedAt).toBe(ADESSO - 5_000)
    expect(query?.state.isInvalidated).toBe(true)
    expect(query?.state.fetchStatus).toBe('idle')
  })

  it('un dato già in memoria più recente non si sovrascrive', () => {
    salvaCache(clientCon([[chiavi.config('E'), CONFIG]], ADESSO - ORA), 'u1', 'v1', ADESSO)
    const nuovo = clientCon([[chiavi.config('E'), { ...CONFIG, esperimento: { id: 'E', nome: 'Nuovo' } }]], ADESSO)
    ripristinaCache(nuovo, 'u1', ADESSO)
    expect(nuovo.getQueryData<typeof CONFIG>(chiavi.config('E'))?.esperimento.nome).toBe('Nuovo')
  })

  it('un altro utente non ripristina nulla, e la copia si toglie', () => {
    salvaCache(clientCon([[chiavi.config('E'), CONFIG]]), 'u1', 'v1', ADESSO)
    const nuovo = new QueryClient()
    expect(ripristinaCache(nuovo, 'u2', ADESSO)).toBeNull()
    expect(nuovo.getQueryCache().getAll()).toHaveLength(0)
    expect(localStorage.getItem(CHIAVE_CACHE)).toBeNull()
  })

  it('una build nuova dell\'app (un deploy) conserva i dati: la prima apertura senza rete li ha', () => {
    salvaCache(clientCon([[chiavi.config('E'), CONFIG]]), 'u1', 'build-di-ieri', ADESSO)
    const nuovo = new QueryClient()
    expect(ripristinaCache(nuovo, 'u1', ADESSO)).not.toBeNull()
    expect(nuovo.getQueryData(chiavi.config('E'))).toEqual(CONFIG)
  })

  it('una versione dei dati diversa (VERSIONE_DATI_CACHE, cambiata a mano) non ripristina nulla, e la copia si toglie', () => {
    expect(VERSIONE_DATI_CACHE).toBe(1)
    salvaCache(clientCon([[chiavi.config('E'), CONFIG]]), 'u1', 'v1', ADESSO)
    const copia = JSON.parse(localStorage.getItem(CHIAVE_CACHE) as string)
    expect(copia.v).toBe(VERSIONE_DATI_CACHE)
    localStorage.setItem(CHIAVE_CACHE, JSON.stringify({ ...copia, v: VERSIONE_DATI_CACHE + 1 }))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const nuovo = new QueryClient()
    expect(ripristinaCache(nuovo, 'u1', ADESSO)).toBeNull()
    expect(nuovo.getQueryCache().getAll()).toHaveLength(0)
    expect(localStorage.getItem(CHIAVE_CACHE)).toBeNull()
  })

  it('una lettura salvata con una forma che non torna (un deploy che l\'ha cambiata senza la costante) non arriva alle pagine', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    salvaCache(clientCon([
      [chiavi.esperimenti, { non: 'un elenco' }],
      [chiavi.config('E'), { ...CONFIG, piante: 'rotte' }],
      [chiavi.config('F'), { ...CONFIG, esperimento: { id: 'F', nome: 'Buona' } }],
      [chiavi.misureGiorno('E', '2026-11-04'), [misura('m1'), { id: 'm2' }]],
      [chiavi.misurePianta('p35'), [misura('m1')]],
      [chiavi.misurePianta('p36'), [{ ...misura('m3'), valori: null }]],
      [chiavi.ultimeMisure('E'), [['spad', '2026-11-04']]],
      [chiavi.ultimeMisure('F'), new Map([['spad', '2026-11-04']])],
    ]), 'u1', 'v1', ADESSO)
    const nuovo = new QueryClient()
    ripristinaCache(nuovo, 'u1', ADESSO)
    expect(nuovo.getQueryData(chiavi.esperimenti)).toBeUndefined()
    expect(nuovo.getQueryData(chiavi.config('E'))).toBeUndefined()
    expect(nuovo.getQueryData(chiavi.config('F'))).toBeDefined()
    expect(nuovo.getQueryData(chiavi.misureGiorno('E', '2026-11-04'))).toBeUndefined()
    expect(nuovo.getQueryData(chiavi.misurePianta('p35'))).toEqual([misura('m1')])
    expect(nuovo.getQueryData(chiavi.misurePianta('p36'))).toBeUndefined()
    expect(nuovo.getQueryData(chiavi.ultimeMisure('E'))).toBeUndefined()
    expect(nuovo.getQueryData(chiavi.ultimeMisure('F'))).toBeInstanceOf(Map)
  })

  it('il ruolo si ripristina se è un ruolo noto o null (non membro); un valore sconosciuto non arriva alle pagine', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    salvaCache(clientCon([
      [chiavi.ruolo('E'), 'lettore'],
      [chiavi.ruolo('F'), null],
      [chiavi.ruolo('G'), 'collaboratore'],
      [chiavi.ruolo('H'), { ruolo: 'proprietario' }],
    ]), 'u1', 'v1', ADESSO)
    const nuovo = new QueryClient()
    ripristinaCache(nuovo, 'u1', ADESSO)
    expect(nuovo.getQueryData(chiavi.ruolo('E'))).toBe('lettore')
    expect(nuovo.getQueryState(chiavi.ruolo('F'))).toMatchObject({ status: 'success', data: null })
    expect(nuovo.getQueryState(chiavi.ruolo('G'))).toBeUndefined()
    expect(nuovo.getQueryState(chiavi.ruolo('H'))).toBeUndefined()
  })

  it('scade dopo 7 giorni: la copia intera, e ogni lettura più vecchia di 7 giorni', () => {
    const client = clientCon([[chiavi.config('E'), CONFIG]], ADESSO - ORA)
    client.setQueryData(chiavi.esperimenti, [{ id: 'E' }], { updatedAt: ADESSO - VALIDITA_CACHE_MS - ORA })
    salvaCache(client, 'u1', 'v1', ADESSO)
    const nuovo = new QueryClient()
    ripristinaCache(nuovo, 'u1', ADESSO)
    expect(nuovo.getQueryData(chiavi.esperimenti)).toBeUndefined()
    expect(nuovo.getQueryData(chiavi.config('E'))).toEqual(CONFIG)

    // Il giorno dopo la scadenza della lettura più recente, nemmeno la configurazione.
    const tardi = new QueryClient()
    expect(ripristinaCache(tardi, 'u1', ADESSO + VALIDITA_CACHE_MS)).toBeNull()
    expect(tardi.getQueryCache().getAll()).toHaveLength(0)
    expect(localStorage.getItem(CHIAVE_CACHE)).toBeNull()
  })

  it('oltre il limite di 2 MB si tolgono per prime le misure delle piante lette da più tempo', () => {
    // Circa 300 kB per pianta: 10 piante non stanno nei 2 MB.
    const valori = { note: 'x'.repeat(300_000) } as Misura['valori']
    const client = clientCon([[chiavi.config('E'), CONFIG], [chiavi.misureGiorno('E', '2026-11-04'), [misura('m1')]]])
    for (let i = 0; i < 10; i++) {
      client.setQueryData(chiavi.misurePianta(`p${i}`), [misura(`m${i}`, `p${i}`, { valori })], { updatedAt: ADESSO - (10 - i) * ORA })
    }
    salvaCache(client, 'u1', 'v1', ADESSO)
    expect((localStorage.getItem(CHIAVE_CACHE) ?? '').length).toBeLessThanOrEqual(LIMITE_CACHE)

    const nuovo = new QueryClient()
    ripristinaCache(nuovo, 'u1', ADESSO)
    expect(nuovo.getQueryData(chiavi.config('E'))).toEqual(CONFIG)
    expect(nuovo.getQueryData(chiavi.misureGiorno('E', '2026-11-04'))).toEqual([misura('m1')])
    const piante = Array.from({ length: 10 }, (_, i) => nuovo.getQueryData(chiavi.misurePianta(`p${i}`)) !== undefined)
    // Restano le più recenti (le ultime dell'elenco), e se ne è tolta almeno una.
    const prima = piante.indexOf(true)
    expect(prima).toBeGreaterThan(0)
    expect(piante.slice(prima).every(Boolean)).toBe(true)
  })

  it('se anche senza le piante si supera il limite non si salva nulla (mai una copia a metà della configurazione)', () => {
    salvaCache(clientCon([[chiavi.config('E'), CONFIG]]), 'u1', 'v1', ADESSO)
    const grande = { ...CONFIG, piante: [{ id: 'x'.repeat(LIMITE_CACHE + 10) }] }
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    salvaCache(clientCon([[chiavi.config('E'), grande]]), 'u1', 'v1', ADESSO)
    expect(localStorage.getItem(CHIAVE_CACHE)).toBeNull()
  })

  it('con il localStorage pieno o assente non lancia, e non lascia una copia vecchia', () => {
    salvaCache(clientCon([[chiavi.config('E'), CONFIG]]), 'u1', 'v1', ADESSO)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('pieno', 'QuotaExceededError') })
    expect(() => salvaCache(clientCon([[chiavi.config('E'), CONFIG]]), 'u1', 'v1', ADESSO)).not.toThrow()
    expect(localStorage.getItem(CHIAVE_CACHE)).toBeNull()

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('vietato') })
    expect(ripristinaCache(new QueryClient(), 'u1', ADESSO)).toBeNull()
  })

  it('una copia illeggibile si ignora e si toglie, senza eccezioni', () => {
    for (const testo of ['{rotto', '[]', '{"v":1,"utente":"u1","build":"v1","salvataIl":1,"query":"no"}', 'null']) {
      localStorage.setItem(CHIAVE_CACHE, testo)
      expect(ripristinaCache(new QueryClient(), 'u1', ADESSO)).toBeNull()
      expect(localStorage.getItem(CHIAVE_CACHE)).toBeNull()
    }
  })

  it('una voce con una chiave fuori dall\'elenco (copia scritta a mano o da un\'altra versione) non si ripristina', () => {
    salvaCache(clientCon([[chiavi.config('E'), CONFIG]]), 'u1', 'v1', ADESSO)
    const copia = JSON.parse(localStorage.getItem(CHIAVE_CACHE) as string)
    copia.query.push({ ...copia.query[0], k: ['note', 'E'], h: '["note","E"]' })
    localStorage.setItem(CHIAVE_CACHE, JSON.stringify(copia))
    const nuovo = new QueryClient()
    ripristinaCache(nuovo, 'u1', ADESSO)
    expect(nuovo.getQueryData(chiavi.note('E'))).toBeUndefined()
    expect(nuovo.getQueryData(chiavi.config('E'))).toEqual(CONFIG)
  })

  it('le letture ripristinate restano in memoria anche senza una pagina che le usa (non spariscono dopo 5 minuti)', () => {
    vi.useFakeTimers({ now: ADESSO })
    salvaCache(clientCon([[chiavi.config('E'), CONFIG]]), 'u1', 'v1', ADESSO)
    const nuovo = new QueryClient()
    ripristinaCache(nuovo, 'u1', ADESSO)
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(nuovo.getQueryData(chiavi.config('E'))).toEqual(CONFIG)
    vi.advanceTimersByTime(DURATA_IN_MEMORIA_MS)
    expect(nuovo.getQueryData(chiavi.config('E'))).toBeUndefined()
  })

  it('cancellaCache toglie la copia', () => {
    salvaCache(clientCon([[chiavi.config('E'), CONFIG]]), 'u1', 'v1', ADESSO)
    cancellaCache()
    expect(localStorage.getItem(CHIAVE_CACHE)).toBeNull()
    expect(ripristinaCache(new QueryClient(), 'u1', ADESSO)).toBeNull()
  })
})

describe('avviaCachePersistente', () => {
  it('scrive 1 s dopo l\'ultimo cambio delle letture dell\'elenco, con l\'utente della sessione', () => {
    vi.useFakeTimers({ now: ADESSO })
    const client = new QueryClient()
    const ferma = avviaCachePersistente(client, { utente: () => 'u1', build: 'v1' })
    client.setQueryData(chiavi.config('E'), CONFIG)
    vi.advanceTimersByTime(500)
    client.setQueryData(chiavi.esperimenti, [{ id: 'E' }])
    vi.advanceTimersByTime(900)
    expect(localStorage.getItem(CHIAVE_CACHE)).toBeNull()
    vi.advanceTimersByTime(200)
    expect(localStorage.getItem(CHIAVE_CACHE)).toContain('Pomodori')
    ferma()
  })

  it('un cambio di una lettura fuori dall\'elenco non scrive', () => {
    vi.useFakeTimers({ now: ADESSO })
    const client = new QueryClient()
    const ferma = avviaCachePersistente(client, { utente: () => 'u1', build: 'v1' })
    client.setQueryData(chiavi.note('E'), [{ id: 'n1' }])
    vi.advanceTimersByTime(2_000)
    expect(localStorage.getItem(CHIAVE_CACHE)).toBeNull()
    ferma()
  })

  it('scrive subito quando l\'app va in secondo piano', () => {
    vi.useFakeTimers({ now: ADESSO })
    const client = new QueryClient()
    const ferma = avviaCachePersistente(client, { utente: () => 'u1', build: 'v1' })
    client.setQueryData(chiavi.config('E'), CONFIG)
    const stato = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(localStorage.getItem(CHIAVE_CACHE)).toContain('Pomodori')
    stato.mockRestore()
    ferma()
  })

  it('senza un utente con la sessione non scrive', () => {
    vi.useFakeTimers({ now: ADESSO })
    const client = new QueryClient()
    const ferma = avviaCachePersistente(client, { utente: () => null, build: 'v1' })
    client.setQueryData(chiavi.config('E'), CONFIG)
    vi.advanceTimersByTime(2_000)
    expect(localStorage.getItem(CHIAVE_CACHE)).toBeNull()
    ferma()
  })

  it('fermato, non scrive più', () => {
    vi.useFakeTimers({ now: ADESSO })
    const client = new QueryClient()
    const ferma = avviaCachePersistente(client, { utente: () => 'u1', build: 'v1' })
    client.setQueryData(chiavi.config('E'), CONFIG)
    ferma()
    vi.advanceTimersByTime(2_000)
    expect(localStorage.getItem(CHIAVE_CACHE)).toBeNull()
  })
})
