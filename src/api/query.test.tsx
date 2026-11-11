import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Misura } from '@/domain/tipi'

vi.mock('./esperimenti', () => ({ listaEsperimenti: vi.fn(), caricaConfig: vi.fn() }))
vi.mock('./misure', () => ({ misureDelGiorno: vi.fn(), misurePianta: vi.fn(), caricaMisura: vi.fn(), ultimaMisuraPerStrumento: vi.fn(), ultimeMisurePiante: vi.fn(), misureStrumento: vi.fn() }))
vi.mock('./exportSalvati', () => ({ listaExportSalvati: vi.fn() }))
vi.mock('./inviti', () => ({ sonoAdmin: vi.fn(), listaInviti: vi.fn() }))
vi.mock('./configurazione', () => ({ parametriConDati: vi.fn(), pianteConDati: vi.fn(), pianteNonEliminabili: vi.fn(), conteggiStrumenti: vi.fn() }))
vi.mock('./catalogo', () => ({ listaCatalogo: vi.fn() }))
vi.mock('./note', () => ({ listaNote: vi.fn() }))
vi.mock('./pesatura', () => ({ listaAnalisi: vi.fn(), listaPesatura: vi.fn() }))
vi.mock('./foto', () => ({ listaFoto: vi.fn(), urlFoto: vi.fn(), VALIDITA_URL_SECONDI: 3600 }))
vi.mock('./spazio', () => ({ spazioProgetto: vi.fn() }))
vi.mock('./persone', () => ({ ruoloIn: vi.fn(), membriDi: vi.fn() }))

import { listaCatalogo } from './catalogo'
import { conteggiStrumenti, parametriConDati, pianteConDati, pianteNonEliminabili } from './configurazione'
import { caricaConfig, listaEsperimenti } from './esperimenti'
import { listaInviti, sonoAdmin } from './inviti'
import { listaNote } from './note'
import { listaAnalisi, listaPesatura } from './pesatura'
import { listaFoto, urlFoto } from './foto'
import { spazioProgetto } from './spazio'
import { listaExportSalvati } from './exportSalvati'
import { caricaMisura, misureDelGiorno, misurePianta, misureStrumento, ultimaMisuraPerStrumento, ultimeMisurePiante } from './misure'
import {
  chiavi, creaQueryClient, useCatalogo, useConfig, useEsperimenti, useInviti, useMisura, useMisureGiorno, useMisurePianta,
  useFoto, useNote, useParametriConDati, usePianteNonEliminabili, useSpazioProgetto, useUrlFoto, usePianteConDati, useSonoAdmin, useConteggiStrumenti, useUltimeMisure, useUltimeMisurePiante,
  useAnalisiPesatura, usePesatura, useExportSalvati, useMisureStrumenti, useMisureStrumento, useUltimaData, ultimaDataConMisure,
} from './query'

import { accoda, impostaUtenteCoda } from '@/lib/coda/codaMisure'

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => { vi.clearAllMocks() })

describe('misure in coda sovrapposte alle letture (Piano E, Task E6)', () => {
  const m = (id: string, extra: Partial<Misura> = {}): Misura => ({
    id, pianta_id: 'p1', strumento_id: 's1', data_rilievo: '2026-10-28', ora: '09:00', valori: {}, ...extra,
  })
  const DATI = { etichetta: '1', strumento: 'SPAD', sulServer: false }
  beforeEach(() => {
    localStorage.clear()
    impostaUtenteCoda('u1')
  })
  afterEach(() => impostaUtenteCoda(null))

  it('useMisureGiorno: la misura in coda c\'è anche se il server non l\'ha ancora; vince la coda sullo stesso id', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue([m('a', { ora: '08:00' }), m('b', { valori: { v: [1] } })])
    accoda('u1', 'E', m('b', { valori: { v: [2] } }), DATI)
    accoda('u1', 'E', m('c', { ora: '10:00' }), DATI)
    accoda('u1', 'F', m('d'), DATI)
    accoda('u1', 'E', m('e', { data_rilievo: '2026-10-27' }), DATI)
    const { result } = renderHook(() => useMisureGiorno('E', '2026-10-28'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map(x => x.id)).toEqual(['a', 'b', 'c'])
    expect(result.current.data?.[1].valori).toEqual({ v: [2] })
  })

  it('useMisureGiorno: si aggiorna appena una misura entra in coda, senza rileggere il server', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue([])
    const { result } = renderHook(() => useMisureGiorno('E', '2026-10-28'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    act(() => accoda('u1', 'E', m('c'), DATI))
    expect(result.current.data?.map(x => x.id)).toEqual(['c'])
    expect(misureDelGiorno).toHaveBeenCalledTimes(1)
  })

  it('le voci di un altro utente non si vedono', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue([])
    accoda('u2', 'E', m('c'), DATI)
    const { result } = renderHook(() => useMisureGiorno('E', '2026-10-28'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })

  it('useMisurePianta: le misure in coda della pianta, dalla più recente', async () => {
    vi.mocked(misurePianta).mockResolvedValue([m('a', { data_rilievo: '2026-10-27' })])
    accoda('u1', 'E', m('c'), DATI)
    accoda('u1', 'E', m('x', { pianta_id: 'p2' }), DATI)
    const { result } = renderHook(() => useMisurePianta('p1'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map(x => x.id)).toEqual(['c', 'a'])
  })

  it('useMisura: una misura in coda si apre dalla coda, anche se il server non la trova', async () => {
    vi.mocked(caricaMisura).mockRejectedValue(new Error('Misura non trovata.'))
    accoda('u1', 'E', m('c', { valori: { v: [3] } }), DATI)
    const { result } = renderHook(() => useMisura('c'), { wrapper: wrapper() })
    expect(result.current.data).toEqual(m('c', { valori: { v: [3] } }))
    await waitFor(() => expect(caricaMisura).toHaveBeenCalled())
    expect(result.current.data).toEqual(m('c', { valori: { v: [3] } }))
  })
})

describe('chiavi delle foto', () => {
  it('l\'elenco e lo spazio stanno sotto lo stesso prefisso, per invalidarli insieme; gli URL fuori', () => {
    expect(chiavi.foto('E')).toEqual(['foto', 'E'])
    // Lo spazio sta sotto le foto: "Libera lo spazio" e ogni foto nuova o eliminata lo rileggono.
    expect(chiavi.spazio('E').slice(0, 2)).toEqual(chiavi.foto('E'))
    expect(chiavi.urlFoto(['a'])[0]).not.toBe('foto')
  })
  it('la chiave degli URL non dipende dall\'ordine dei percorsi, ma dal loro insieme', () => {
    expect(chiavi.urlFoto(['b', 'a'])).toEqual(chiavi.urlFoto(['a', 'b']))
    expect(chiavi.urlFoto(['a'])).not.toEqual(chiavi.urlFoto(['a', 'b']))
  })
})

describe('chiavi', () => {
  it('sono stabili e distinte per esperimento, data e pianta', () => {
    expect(chiavi.esperimenti).toEqual(['esperimenti'])
    expect(chiavi.config('E')).toEqual(['config', 'E'])
    expect(chiavi.config('E')).not.toEqual(chiavi.config('F'))
    expect(chiavi.misureGiorno('E', '2026-10-28')).not.toEqual(chiavi.misureGiorno('E', '2026-10-29'))
    expect(chiavi.misurePianta('p1')).not.toEqual(chiavi.misurePianta('p2'))
    expect(chiavi.inviti).toEqual(['inviti'])
  })

  it('le chiavi delle misure condividono un prefisso, per invalidarle insieme', () => {
    expect(chiavi.misureGiorno('E', '2026-10-28')[0]).toBe('misure')
    expect(chiavi.misurePianta('p1')[0]).toBe('misure')
    expect(chiavi.misura('m1')[0]).toBe('misure')
    expect(chiavi.ultimeMisure('E')[0]).toBe('misure')
    expect(chiavi.ultimeMisure('E')).not.toEqual(chiavi.ultimeMisure('F'))
    expect(chiavi.ultimeMisurePiante('E')[0]).toBe('misure')
    expect(chiavi.ultimeMisurePiante('E')).not.toEqual(chiavi.ultimeMisure('E'))
    expect(chiavi.ultimeMisurePiante('E')).not.toEqual(chiavi.ultimeMisurePiante('F'))
    expect(chiavi.misura('m1')).not.toEqual(chiavi.misura('m2'))
    expect(chiavi.misure).toEqual(['misure'])
  })

  it('le misure di uno strumento stanno sotto il prefisso delle misure (modifica ed eliminazione le invalidano già)', () => {
    expect(chiavi.misureStrumento('E', 's1')).toEqual(['misure', 'strumento', 'E', 's1'])
    expect(chiavi.misureStrumento('E', 's1')[0]).toBe(chiavi.misure[0])
    expect(chiavi.misureStrumento('E', 's1')).not.toEqual(chiavi.misureStrumento('E', 's2'))
    expect(chiavi.misureStrumento('E', 's1')).not.toEqual(chiavi.misureStrumento('F', 's1'))
  })

  it('gli export salvati hanno una chiave per esperimento, fuori dal prefisso delle misure', () => {
    expect(chiavi.exportSalvati('E')).toEqual(['exportSalvati', 'E'])
    expect(chiavi.exportSalvati('E')).not.toEqual(chiavi.exportSalvati('F'))
    expect(chiavi.exportSalvati('E')[0]).not.toBe(chiavi.misure[0])
  })

  it('i parametri e le piante con dati stanno sotto la configurazione: si invalidano con lei', () => {
    expect(chiavi.parametriConDati('E').slice(0, 2)).toEqual(chiavi.config('E'))
    expect(chiavi.pianteConDati('E').slice(0, 2)).toEqual(chiavi.config('E'))
    expect(chiavi.conteggiStrumenti('E').slice(0, 2)).toEqual(chiavi.config('E'))
    expect(chiavi.parametriConDati('E')).not.toEqual(chiavi.pianteConDati('E'))
    expect(chiavi.conteggiStrumenti('E')).not.toEqual(chiavi.parametriConDati('E'))
  })

  it('le note hanno una chiave per esperimento, fuori dal prefisso delle misure e della configurazione', () => {
    expect(chiavi.note('E')).toEqual(['note', 'E'])
    expect(chiavi.note('E')).not.toEqual(chiavi.note('F'))
    expect(chiavi.note('E')[0]).not.toBe(chiavi.misure[0])
    expect(chiavi.note('E')[0]).not.toBe(chiavi.config('E')[0])
  })

  it('il catalogo è condiviso tra esperimenti: la sua chiave sta fuori dal prefisso della configurazione', () => {
    expect(chiavi.catalogo).toEqual(['catalogo'])
    expect(chiavi.catalogo[0]).not.toBe(chiavi.config('E')[0])
  })
})

describe('hook di lettura', () => {
  it('useEsperimenti legge l\'elenco', async () => {
    vi.mocked(listaEsperimenti).mockResolvedValue([])
    const { result } = renderHook(() => useEsperimenti(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })

  it('useConfig carica la configurazione dell\'esperimento', async () => {
    const config = { esperimento: { id: 'E' } }
    vi.mocked(caricaConfig).mockResolvedValue(config as never)
    const { result } = renderHook(() => useConfig('E'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(caricaConfig).toHaveBeenCalledWith('E')
    expect(result.current.data).toBe(config)
  })

  it('useConfig senza esperimento non interroga il database', () => {
    const { result } = renderHook(() => useConfig(undefined), { wrapper: wrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(caricaConfig).not.toHaveBeenCalled()
  })

  it('useMisureGiorno legge le misure del giorno', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue([])
    const { result } = renderHook(() => useMisureGiorno('E', '2026-10-28'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(misureDelGiorno).toHaveBeenCalledWith('E', '2026-10-28')
  })

  it('useMisureGiorno senza esperimento non interroga il database', () => {
    const { result } = renderHook(() => useMisureGiorno(undefined, '2026-10-28'), { wrapper: wrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(misureDelGiorno).not.toHaveBeenCalled()
  })

  it('useUltimeMisure legge le ultime date per strumento', async () => {
    const ultime = new Map([['s1', '2026-10-21']])
    vi.mocked(ultimaMisuraPerStrumento).mockResolvedValue(ultime)
    const { result } = renderHook(() => useUltimeMisure('E'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(ultimaMisuraPerStrumento).toHaveBeenCalledWith('E')
    expect(result.current.data).toBe(ultime)
  })

  it('useUltimeMisure senza esperimento non interroga il database', () => {
    const { result } = renderHook(() => useUltimeMisure(undefined), { wrapper: wrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(ultimaMisuraPerStrumento).not.toHaveBeenCalled()
  })

  it('useUltimeMisurePiante legge le ultime misure per pianta e strumento', async () => {
    const misure = [{ id: 'm1', pianta_id: 'p1', strumento_id: 's1', data_rilievo: '2026-10-21', ora: '09:00', valori: {} }]
    vi.mocked(ultimeMisurePiante).mockResolvedValue(misure)
    const { result } = renderHook(() => useUltimeMisurePiante('E'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(ultimeMisurePiante).toHaveBeenCalledWith('E')
    expect(result.current.data).toBe(misure)
  })

  it('useUltimeMisurePiante senza esperimento non interroga il database', () => {
    const { result } = renderHook(() => useUltimeMisurePiante(undefined), { wrapper: wrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(ultimeMisurePiante).not.toHaveBeenCalled()
  })

  it('useMisurePianta legge la storia della pianta', async () => {
    vi.mocked(misurePianta).mockResolvedValue([])
    const { result } = renderHook(() => useMisurePianta('p1'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(misurePianta).toHaveBeenCalledWith('p1')
  })

  it('useMisura legge una misura per id', async () => {
    const misura = { id: 'm1' }
    vi.mocked(caricaMisura).mockResolvedValue(misura as never)
    const { result } = renderHook(() => useMisura('m1'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(caricaMisura).toHaveBeenCalledWith('m1')
    expect(result.current.data).toBe(misura)
  })

  it('useMisura senza id non interroga il database', () => {
    const { result } = renderHook(() => useMisura(undefined), { wrapper: wrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(caricaMisura).not.toHaveBeenCalled()
  })

  it('useMisura non tiene la misura in cache dopo la chiusura: riaprendola si rilegge', async () => {
    vi.mocked(caricaMisura).mockResolvedValueOnce({ id: 'm1', ora: '09:12' } as never)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const conClient = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const prima = renderHook(() => useMisura('m1'), { wrapper: conClient })
    await waitFor(() => expect(prima.result.current.isSuccess).toBe(true))
    prima.unmount()
    await waitFor(() => expect(client.getQueryData(chiavi.misura('m1'))).toBeUndefined())
  })

  it('useInviti legge l\'elenco degli inviti', async () => {
    const inviti = [{ id: 'i1', email: 'a@b.it', codice: 'K7M2QX4P', creato_il: '2026-10-28T09:00:00Z', usato_il: null }]
    vi.mocked(listaInviti).mockResolvedValue(inviti)
    const { result } = renderHook(() => useInviti(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe(inviti)
  })

  it('useCatalogo legge le voci del catalogo', async () => {
    const voci = [{ id: 'c1', nome: 'SPAD', icona: '💚', descrizione: '', archiviato: false, parametri: [] }]
    vi.mocked(listaCatalogo).mockResolvedValue(voci)
    const { result } = renderHook(() => useCatalogo(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe(voci)
  })

  it('useNote legge le note dell\'esperimento', async () => {
    const note = [{ id: 'n1', data: '2026-11-01', testo: 'Irrigato', promemoria: false, fatto_il: null, pianta_ids: [], trattamento_ids: [] }]
    vi.mocked(listaNote).mockResolvedValue(note)
    const { result } = renderHook(() => useNote('E'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(listaNote).toHaveBeenCalledWith('E')
    expect(result.current.data).toBe(note)
  })

  it('useNote senza esperimento non interroga il database', () => {
    const { result } = renderHook(() => useNote(undefined), { wrapper: wrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(listaNote).not.toHaveBeenCalled()
  })

  it('le chiavi della Pesatura sono per esperimento', () => {
    expect(chiavi.analisiPesatura('E')).toEqual(['analisiPesatura', 'E'])
    expect(chiavi.pesatura('E')).toEqual(['pesatura', 'E'])
  })

  it('useAnalisiPesatura e usePesatura leggono per esperimento, e senza esperimento non interrogano nessuno', async () => {
    const dati = { sessioni: [], campioni: [], pesi: [] }
    vi.mocked(listaAnalisi).mockResolvedValue([])
    vi.mocked(listaPesatura).mockResolvedValue(dati)
    const analisi = renderHook(() => useAnalisiPesatura('E'), { wrapper: wrapper() })
    const pesatura = renderHook(() => usePesatura('E'), { wrapper: wrapper() })
    await waitFor(() => expect(analisi.result.current.isSuccess && pesatura.result.current.isSuccess).toBe(true))
    expect(listaAnalisi).toHaveBeenCalledWith('E')
    expect(listaPesatura).toHaveBeenCalledWith('E')
    expect(pesatura.result.current.data).toBe(dati)

    vi.mocked(listaAnalisi).mockClear()
    vi.mocked(listaPesatura).mockClear()
    expect(renderHook(() => useAnalisiPesatura(undefined), { wrapper: wrapper() }).result.current.fetchStatus).toBe('idle')
    expect(renderHook(() => usePesatura(undefined), { wrapper: wrapper() }).result.current.fetchStatus).toBe('idle')
    expect(listaAnalisi).not.toHaveBeenCalled()
    expect(listaPesatura).not.toHaveBeenCalled()
  })

  it('useFoto legge le foto dell\'esperimento, e senza esperimento non interroga nessuno', async () => {
    const foto = [{ id: 'f1', data: '2026-11-01', percorso: 'E/f1.jpg', larghezza: 1600, altezza: 1200, byte: 1, pianta_id: null, nota_id: null, archiviata: false, archiviata_il: null }]
    vi.mocked(listaFoto).mockResolvedValue(foto)
    const { result } = renderHook(() => useFoto('E'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(listaFoto).toHaveBeenCalledWith('E')
    expect(result.current.data).toBe(foto)

    vi.mocked(listaFoto).mockClear()
    const senza = renderHook(() => useFoto(undefined), { wrapper: wrapper() })
    expect(senza.result.current.fetchStatus).toBe('idle')
    expect(listaFoto).not.toHaveBeenCalled()
  })

  it('useUrlFoto chiede gli URL dei percorsi, e senza percorsi non chiede niente', async () => {
    const urls = new Map([['E/f1.jpg', 'https://s/f1']])
    vi.mocked(urlFoto).mockResolvedValue(urls)
    const { result } = renderHook(() => useUrlFoto(['E/f1.jpg']), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(urlFoto).toHaveBeenCalledWith(['E/f1.jpg'])
    expect(result.current.data).toBe(urls)

    vi.mocked(urlFoto).mockClear()
    const vuoto = renderHook(() => useUrlFoto([]), { wrapper: wrapper() })
    expect(vuoto.result.current.fetchStatus).toBe('idle')
    expect(urlFoto).not.toHaveBeenCalled()
  })

  it('useUrlFoto si rinnova da solo ogni 50 minuti: gli URL valgono un\'ora e una galleria può restare aperta più a lungo', async () => {
    vi.mocked(urlFoto).mockResolvedValue(new Map())
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() => useUrlFoto(['E/f1.jpg']), {
      wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const osservatore = client.getQueryCache().find({ queryKey: chiavi.urlFoto(['E/f1.jpg']) })?.observers[0]
    expect(osservatore?.options.refetchInterval).toBe(50 * 60 * 1000)
  })

  it('useSpazioProgetto legge lo spazio del progetto e si rilegge a ogni apertura', async () => {
    const spazio = { database_byte: 30, foto_byte: 20, esperimento: null }
    vi.mocked(spazioProgetto).mockResolvedValue(spazio)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
    const conClient = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const prima = renderHook(() => useSpazioProgetto('E'), { wrapper: conClient })
    await waitFor(() => expect(prima.result.current.data).toEqual(spazio))
    expect(spazioProgetto).toHaveBeenCalledWith('E')
    prima.unmount()
    renderHook(() => useSpazioProgetto('E'), { wrapper: conClient })
    await waitFor(() => expect(spazioProgetto).toHaveBeenCalledTimes(2))
  })

  it('useSonoAdmin legge il ruolo', async () => {
    vi.mocked(sonoAdmin).mockResolvedValue(true)
    const { result } = renderHook(() => useSonoAdmin(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe(true)
  })
})

describe('parametri e piante con dati', () => {
  it('useParametriConDati e usePianteConDati leggono gli id con dati', async () => {
    vi.mocked(parametriConDati).mockResolvedValue(new Set(['par1']))
    vi.mocked(pianteConDati).mockResolvedValue(new Set(['p1']))
    const avvolgi = wrapper()
    const parametri = renderHook(() => useParametriConDati('E'), { wrapper: avvolgi })
    const piante = renderHook(() => usePianteConDati('E'), { wrapper: avvolgi })
    await waitFor(() => expect(parametri.result.current.data).toEqual(new Set(['par1'])))
    await waitFor(() => expect(piante.result.current.data).toEqual(new Set(['p1'])))
    expect(parametriConDati).toHaveBeenCalledWith('E')
    expect(pianteConDati).toHaveBeenCalledWith('E')
  })

  it('si rileggono a ogni apertura: mai offrire "Elimina" su dati vecchi', async () => {
    vi.mocked(parametriConDati).mockResolvedValue(new Set())
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
    const conClient = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const prima = renderHook(() => useParametriConDati('E'), { wrapper: conClient })
    await waitFor(() => expect(prima.result.current.isSuccess).toBe(true))
    prima.unmount()
    const dopo = renderHook(() => useParametriConDati('E'), { wrapper: conClient })
    await waitFor(() => expect(parametriConDati).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(dopo.result.current.isFetching).toBe(false))
  })

  it('useConteggiStrumenti legge i conteggi degli strumenti con misure e si rilegge a ogni apertura', async () => {
    const conteggi = new Map([['pa1', { misure: 3, piante: 2, prima: '2026-10-14', ultima: '2026-11-03' }]])
    vi.mocked(conteggiStrumenti).mockResolvedValue(conteggi)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
    const conClient = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const prima = renderHook(() => useConteggiStrumenti('E'), { wrapper: conClient })
    await waitFor(() => expect(prima.result.current.data).toEqual(conteggi))
    expect(conteggiStrumenti).toHaveBeenCalledWith('E')
    prima.unmount()
    renderHook(() => useConteggiStrumenti('E'), { wrapper: conClient })
    await waitFor(() => expect(conteggiStrumenti).toHaveBeenCalledTimes(2))
  })

  it('senza esperimento non interrogano il database', () => {
    renderHook(() => useParametriConDati(undefined), { wrapper: wrapper() })
    renderHook(() => usePianteConDati(undefined), { wrapper: wrapper() })
    renderHook(() => useConteggiStrumenti(undefined), { wrapper: wrapper() })
    renderHook(() => useSpazioProgetto(undefined), { wrapper: wrapper() })
    expect(conteggiStrumenti).not.toHaveBeenCalled()
    expect(spazioProgetto).not.toHaveBeenCalled()
    expect(parametriConDati).not.toHaveBeenCalled()
    expect(pianteConDati).not.toHaveBeenCalled()
  })
})

describe('piante non eliminabili', () => {
  const conClient = (client: QueryClient) =>
    ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>

  it('la chiave sta sotto la configurazione (si rilegge a ogni modifica delle piante) e non coincide con quella delle piante con dati', () => {
    expect(chiavi.pianteNonEliminabili('E').slice(0, 2)).toEqual(chiavi.config('E'))
    expect(chiavi.pianteNonEliminabili('E')).not.toEqual(chiavi.pianteConDati('E'))
    expect(chiavi.pianteNonEliminabili('E')).not.toEqual(chiavi.pianteNonEliminabili('F'))
  })

  it('usePianteNonEliminabili legge gli id (misure, note e foto)', async () => {
    vi.mocked(pianteNonEliminabili).mockResolvedValue(new Set(['p1', 'p2']))
    const { result } = renderHook(() => usePianteNonEliminabili('E'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.data).toEqual(new Set(['p1', 'p2'])))
    expect(pianteNonEliminabili).toHaveBeenCalledWith('E')
  })

  it('non resta in cache dopo la chiusura della pagina: salvando misure, note o foto altrove non c\'è una copia vecchia che offra "Elimina"', async () => {
    vi.mocked(pianteNonEliminabili).mockResolvedValueOnce(new Set(['p1'])).mockResolvedValueOnce(new Set(['p1', 'p2']))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
    const prima = renderHook(() => usePianteNonEliminabili('E'), { wrapper: conClient(client) })
    await waitFor(() => expect(prima.result.current.data).toEqual(new Set(['p1'])))
    prima.unmount()
    await new Promise(r => setTimeout(r, 20))
    expect(client.getQueryData(chiavi.pianteNonEliminabili('E'))).toBeUndefined()

    const dopo = renderHook(() => usePianteNonEliminabili('E'), { wrapper: conClient(client) })
    // Alla riapertura non c'è nulla da mostrare finché la risposta nuova non arriva.
    expect(dopo.result.current.data).toBeUndefined()
    await waitFor(() => expect(dopo.result.current.data).toEqual(new Set(['p1', 'p2'])))
    expect(pianteNonEliminabili).toHaveBeenCalledTimes(2)
  })

  it('senza esperimento non interroga il database', () => {
    renderHook(() => usePianteNonEliminabili(undefined), { wrapper: wrapper() })
    expect(pianteNonEliminabili).not.toHaveBeenCalled()
  })
})

describe('creaQueryClient', () => {
  it('restituisce un QueryClient nuovo a ogni chiamata', () => {
    const a = creaQueryClient()
    expect(a).toBeInstanceOf(QueryClient)
    expect(creaQueryClient()).not.toBe(a)
  })
})

describe('letture della copia sul telefono (Piano E, Task E7)', () => {
  afterEach(() => vi.useRealTimers())

  /** Monta l'hook, aspetta la lettura, lo smonta e lascia passare 10 minuti: la lettura c'è ancora? */
  async function restaDopoDieciMinuti(usa: () => unknown, chiave: readonly unknown[]): Promise<boolean> {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const avvolgi = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { unmount } = renderHook(usa, { wrapper: avvolgi })
    await waitFor(() => expect(client.getQueryState(chiave)?.status).toBe('success'))
    unmount()
    act(() => { vi.advanceTimersByTime(10 * 60 * 1000) })
    return client.getQueryData(chiave) !== undefined
  }

  it('esperimenti, configurazione, giorno, pianta e ultime misure restano in memoria senza una pagina (la copia è fatta di quello che c\'è)', async () => {
    vi.mocked(listaEsperimenti).mockResolvedValue([])
    vi.mocked(caricaConfig).mockResolvedValue({} as never)
    vi.mocked(misureDelGiorno).mockResolvedValue([])
    vi.mocked(misurePianta).mockResolvedValue([])
    vi.mocked(ultimaMisuraPerStrumento).mockResolvedValue(new Map())
    expect(await restaDopoDieciMinuti(() => useEsperimenti(), chiavi.esperimenti)).toBe(true)
    expect(await restaDopoDieciMinuti(() => useConfig('E'), chiavi.config('E'))).toBe(true)
    expect(await restaDopoDieciMinuti(() => useMisureGiorno('E', '2026-11-04'), chiavi.misureGiorno('E', '2026-11-04'))).toBe(true)
    expect(await restaDopoDieciMinuti(() => useMisurePianta('p1'), chiavi.misurePianta('p1'))).toBe(true)
    expect(await restaDopoDieciMinuti(() => useUltimeMisure('E'), chiavi.ultimeMisure('E'))).toBe(true)
    expect(await restaDopoDieciMinuti(() => useUltimaData('E'), chiavi.ultimeMisure('E'))).toBe(true)
  })

  it('le altre letture no: dopo 5 minuti senza una pagina spariscono, come sempre', async () => {
    vi.mocked(listaNote).mockResolvedValue([])
    expect(await restaDopoDieciMinuti(() => useNote('E'), chiavi.note('E'))).toBe(false)
  })
})

describe('ultimaDataConMisure', () => {
  it('è la data più recente tra tutti gli strumenti', () => {
    expect(ultimaDataConMisure(new Map([['s1', '2026-10-21'], ['s2', '2026-11-03'], ['s3', '2026-09-30']]))).toBe('2026-11-03')
  })
  it('con un solo strumento è la sua data', () => {
    expect(ultimaDataConMisure(new Map([['s1', '2026-10-21']]))).toBe('2026-10-21')
  })
  it('senza misure è null (niente da mostrare: le settimane finiscono oggi)', () => {
    expect(ultimaDataConMisure(new Map())).toBeNull()
  })
})

describe('useUltimaData', () => {
  it('dà l\'ultima data con misure tra tutti gli strumenti, la stessa per Dataset ed Esporta', async () => {
    vi.mocked(ultimaMisuraPerStrumento).mockResolvedValue(new Map([['s1', '2026-10-21'], ['s2', '2026-10-28']]))
    const { result } = renderHook(() => useUltimaData('E'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(ultimaMisuraPerStrumento).toHaveBeenCalledWith('E')
    expect(result.current.data).toBe('2026-10-28')
  })

  it('senza misure è null, non undefined: si distingue dal "non ancora letta"', async () => {
    vi.mocked(ultimaMisuraPerStrumento).mockResolvedValue(new Map())
    const { result } = renderHook(() => useUltimaData('E'), { wrapper: wrapper() })
    expect(result.current.data).toBeUndefined()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })

  it('condivide la lettura con useUltimeMisure: una sola chiamata al database', async () => {
    vi.mocked(ultimaMisuraPerStrumento).mockResolvedValue(new Map([['s1', '2026-10-21']]))
    const { result } = renderHook(() => ({ a: useUltimeMisure('E'), b: useUltimaData('E') }), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.b.isSuccess && result.current.a.isSuccess).toBe(true))
    expect(ultimaMisuraPerStrumento).toHaveBeenCalledTimes(1)
  })

  it('senza esperimento non interroga il database', () => {
    const { result } = renderHook(() => useUltimaData(undefined), { wrapper: wrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(ultimaMisuraPerStrumento).not.toHaveBeenCalled()
  })
})

describe('useMisureStrumento', () => {
  it('legge le misure di quello strumento', async () => {
    const misure = [{ id: 'm1' }]
    vi.mocked(misureStrumento).mockResolvedValue(misure as never)
    const { result } = renderHook(() => useMisureStrumento('E', 's1'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(misureStrumento).toHaveBeenCalledWith('E', 's1')
    expect(result.current.data).toBe(misure)
  })

  it('senza esperimento o senza strumento non interroga il database', () => {
    const a = renderHook(() => useMisureStrumento(undefined, 's1'), { wrapper: wrapper() })
    const b = renderHook(() => useMisureStrumento('E', undefined), { wrapper: wrapper() })
    expect(a.result.current.fetchStatus).toBe('idle')
    expect(b.result.current.fetchStatus).toBe('idle')
    expect(misureStrumento).not.toHaveBeenCalled()
  })
})

describe('useMisureStrumenti', () => {
  const dueMisure = (id: string) => [{ id, strumento_id: id }] as unknown as Misura[]

  it('dà i dati solo quando tutte le letture sono arrivate, per id di strumento', async () => {
    let finisciS2: (m: Misura[]) => void = () => {}
    vi.mocked(misureStrumento).mockImplementation(async (_e, id) =>
      id === 's2' ? new Promise(ok => { finisciS2 = ok }) : dueMisure(id))
    const { result } = renderHook(() => useMisureStrumenti('E', ['s1', 's2']), { wrapper: wrapper() })

    await waitFor(() => expect(misureStrumento).toHaveBeenCalledTimes(2))
    // s1 è arrivata, s2 no: niente dati a metà.
    expect(result.current.dati).toBeUndefined()
    expect(result.current.isPending).toBe(true)

    finisciS2(dueMisure('s2'))
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect([...result.current.dati!.keys()]).toEqual(['s1', 's2'])
    expect(result.current.dati!.get('s2')).toEqual(dueMisure('s2'))
    expect(result.current.isError).toBe(false)
  })

  it('con un errore dà il primo errore e nessun dato', async () => {
    const errore = new Error('rete')
    vi.mocked(misureStrumento).mockImplementation(async (_e, id) => { if (id === 's2') throw errore; return dueMisure(id) })
    const { result } = renderHook(() => useMisureStrumenti('E', ['s1', 's2']), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBe(errore)
    expect(result.current.dati).toBeUndefined()
  })

  it('refetch rilegge tutte le misure', async () => {
    vi.mocked(misureStrumento).mockImplementation(async (_e, id) => dueMisure(id))
    const { result } = renderHook(() => useMisureStrumenti('E', ['s1', 's2']), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.dati).toBeDefined())
    expect(misureStrumento).toHaveBeenCalledTimes(2)

    await act(async () => { await result.current.refetch() })

    expect(misureStrumento).toHaveBeenCalledTimes(4)
  })

  it('dopo un nuovo disegno (anche con un elenco di ids nuovo ma uguale) i dati sono lo stesso oggetto', async () => {
    vi.mocked(misureStrumento).mockImplementation(async (_e, id) => dueMisure(id))
    const { result, rerender } = renderHook(() => useMisureStrumenti('E', ['s1', 's2']), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.dati).toBeDefined())
    const dati = result.current.dati
    rerender()
    rerender()
    expect(result.current.dati).toBe(dati)
  })

  it('cambiando gli strumenti i dati cambiano', async () => {
    vi.mocked(misureStrumento).mockImplementation(async (_e, id) => dueMisure(id))
    const { result, rerender } = renderHook(({ ids }) => useMisureStrumenti('E', ids), { wrapper: wrapper(), initialProps: { ids: ['s1'] } })
    await waitFor(() => expect(result.current.dati).toBeDefined())
    rerender({ ids: ['s1', 's2'] })
    await waitFor(() => expect([...(result.current.dati?.keys() ?? [])]).toEqual(['s1', 's2']))
  })

  it('senza strumenti da leggere i dati sono una mappa vuota, subito', () => {
    const { result } = renderHook(() => useMisureStrumenti('E', []), { wrapper: wrapper() })
    expect(result.current.isPending).toBe(false)
    expect(result.current.dati?.size).toBe(0)
    expect(misureStrumento).not.toHaveBeenCalled()
  })

  it('senza esperimento non interroga il database', () => {
    const { result } = renderHook(() => useMisureStrumenti(undefined, ['s1']), { wrapper: wrapper() })
    expect(result.current.dati).toBeUndefined()
    expect(misureStrumento).not.toHaveBeenCalled()
  })

  it('condivide la cache con useMisureStrumento: stessa chiave, una sola lettura', async () => {
    vi.mocked(misureStrumento).mockImplementation(async (_e, id) => dueMisure(id))
    const { result } = renderHook(() => ({ uno: useMisureStrumento('E', 's1'), tutti: useMisureStrumenti('E', ['s1']) }), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.uno.isSuccess && result.current.tutti.dati !== undefined).toBe(true))
    expect(misureStrumento).toHaveBeenCalledTimes(1)
  })
})

describe('useExportSalvati', () => {
  it('legge gli export salvati dell\'esperimento', async () => {
    const lista = [{ id: 'x1', nome: 'A', scelte: {}, aggiornato_il: 'x' }]
    vi.mocked(listaExportSalvati).mockResolvedValue(lista)
    const { result } = renderHook(() => useExportSalvati('E'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(listaExportSalvati).toHaveBeenCalledWith('E')
    expect(result.current.data).toBe(lista)
  })

  it('senza esperimento non interroga il database', () => {
    const { result } = renderHook(() => useExportSalvati(undefined), { wrapper: wrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(listaExportSalvati).not.toHaveBeenCalled()
  })
})
