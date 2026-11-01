import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('./esperimenti', () => ({ listaEsperimenti: vi.fn(), caricaConfig: vi.fn() }))
vi.mock('./misure', () => ({ misureDelGiorno: vi.fn(), misurePianta: vi.fn(), caricaMisura: vi.fn(), ultimaMisuraPerStrumento: vi.fn(), ultimeMisurePiante: vi.fn() }))
vi.mock('./inviti', () => ({ sonoAdmin: vi.fn(), listaInviti: vi.fn() }))
vi.mock('./configurazione', () => ({ parametriConDati: vi.fn(), pianteConDati: vi.fn(), pianteNonEliminabili: vi.fn(), strumentiConDati: vi.fn() }))
vi.mock('./catalogo', () => ({ listaCatalogo: vi.fn() }))
vi.mock('./note', () => ({ listaNote: vi.fn() }))
vi.mock('./foto', () => ({ listaFoto: vi.fn(), urlFoto: vi.fn(), spazioFoto: vi.fn(), VALIDITA_URL_SECONDI: 3600 }))

import { listaCatalogo } from './catalogo'
import { parametriConDati, pianteConDati, pianteNonEliminabili, strumentiConDati } from './configurazione'
import { caricaConfig, listaEsperimenti } from './esperimenti'
import { listaInviti, sonoAdmin } from './inviti'
import { listaNote } from './note'
import { listaFoto, spazioFoto, urlFoto } from './foto'
import { caricaMisura, misureDelGiorno, misurePianta, ultimaMisuraPerStrumento, ultimeMisurePiante } from './misure'
import {
  chiavi, creaQueryClient, useCatalogo, useConfig, useEsperimenti, useInviti, useMisura, useMisureGiorno, useMisurePianta,
  useFoto, useNote, useParametriConDati, usePianteNonEliminabili, useSpazioFoto, useUrlFoto, usePianteConDati, useSonoAdmin, useStrumentiConDati, useUltimeMisure, useUltimeMisurePiante,
} from './query'

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => { vi.clearAllMocks() })

describe('chiavi delle foto', () => {
  it('l\'elenco e lo spazio stanno sotto lo stesso prefisso, per invalidarli insieme; gli URL fuori', () => {
    expect(chiavi.foto('E')).toEqual(['foto', 'E'])
    expect(chiavi.spazioFoto('E').slice(0, 2)).toEqual(chiavi.foto('E'))
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

  it('i parametri e le piante con dati stanno sotto la configurazione: si invalidano con lei', () => {
    expect(chiavi.parametriConDati('E').slice(0, 2)).toEqual(chiavi.config('E'))
    expect(chiavi.pianteConDati('E').slice(0, 2)).toEqual(chiavi.config('E'))
    expect(chiavi.strumentiConDati('E').slice(0, 2)).toEqual(chiavi.config('E'))
    expect(chiavi.parametriConDati('E')).not.toEqual(chiavi.pianteConDati('E'))
    expect(chiavi.strumentiConDati('E')).not.toEqual(chiavi.parametriConDati('E'))
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

  it('useSpazioFoto legge lo spazio occupato', async () => {
    vi.mocked(spazioFoto).mockResolvedValue({ esperimento: 10, progetto: 30 })
    const { result } = renderHook(() => useSpazioFoto('E'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ esperimento: 10, progetto: 30 })
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

  it('useStrumentiConDati legge gli id degli strumenti con misure e si rilegge a ogni apertura', async () => {
    vi.mocked(strumentiConDati).mockResolvedValue(new Set(['pa1']))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
    const conClient = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const prima = renderHook(() => useStrumentiConDati('E'), { wrapper: conClient })
    await waitFor(() => expect(prima.result.current.data).toEqual(new Set(['pa1'])))
    expect(strumentiConDati).toHaveBeenCalledWith('E')
    prima.unmount()
    renderHook(() => useStrumentiConDati('E'), { wrapper: conClient })
    await waitFor(() => expect(strumentiConDati).toHaveBeenCalledTimes(2))
  })

  it('senza esperimento non interrogano il database', () => {
    renderHook(() => useParametriConDati(undefined), { wrapper: wrapper() })
    renderHook(() => usePianteConDati(undefined), { wrapper: wrapper() })
    renderHook(() => useStrumentiConDati(undefined), { wrapper: wrapper() })
    expect(strumentiConDati).not.toHaveBeenCalled()
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
