import { keepPreviousData, QueryClient, queryOptions, useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listaCatalogo } from './catalogo'
import { parametriConDati, pianteConDati, pianteNonEliminabili, strumentiConDati } from './configurazione'
import { caricaConfig, listaEsperimenti } from './esperimenti'
import { listaExportSalvati } from './exportSalvati'
import { listaFoto, spazioFoto, urlFoto, VALIDITA_URL_SECONDI } from './foto'
import { listaInviti, sonoAdmin } from './inviti'
import { listaNote } from './note'
import { caricaMisura, misureDelGiorno, misurePianta, misureStrumento, ultimaMisuraPerStrumento, ultimeMisurePiante } from './misure'
import type { Misura } from '@/domain/tipi'

/** Chiavi di cache delle query. Quelle delle misure iniziano tutte con 'misure': si invalidano insieme. */
export const chiavi = {
  esperimenti: ['esperimenti'] as const,
  config: (espId: string) => ['config', espId] as const,
  /** Sotto il prefisso della configurazione: invalidando `config(espId)` si rileggono anche questi. */
  parametriConDati: (espId: string) => ['config', espId, 'parametriConDati'] as const,
  pianteConDati: (espId: string) => ['config', espId, 'pianteConDati'] as const,
  pianteNonEliminabili: (espId: string) => ['config', espId, 'pianteNonEliminabili'] as const,
  strumentiConDati: (espId: string) => ['config', espId, 'strumentiConDati'] as const,
  /** Prefisso di tutte le misure: per invalidarle insieme. */
  misure: ['misure'] as const,
  misura: (id: string) => ['misure', 'una', id] as const,
  misureGiorno: (espId: string, data: string) => ['misure', 'giorno', espId, data] as const,
  misurePianta: (piantaId: string) => ['misure', 'pianta', piantaId] as const,
  /** Tutte le misure di uno strumento (Dataset ed Esporta): sotto il prefisso, la modifica e l'eliminazione le invalidano già. */
  misureStrumento: (espId: string, strumentoId: string) => ['misure', 'strumento', espId, strumentoId] as const,
  ultimeMisure: (espId: string) => ['misure', 'ultime', espId] as const,
  ultimeMisurePiante: (espId: string) => ['misure', 'ultimePiante', espId] as const,
  /** Le note del Diario di un esperimento (con i promemoria): fuori dalle misure, si invalidano a ogni salvataggio. */
  note: (espId: string) => ['note', espId] as const,
  /** Le foto di un esperimento: salvataggio, eliminazione e modifica la invalidano (con lo spazio, che sta sotto di lei). */
  foto: (espId: string) => ['foto', espId] as const,
  spazioFoto: (espId: string) => ['foto', espId, 'spazio'] as const,
  /** Gli URL firmati di un gruppo di percorsi: fuori dal prefisso `foto`, non si rileggono a ogni modifica di una foto. */
  urlFoto: (percorsi: readonly string[]) => ['urlFoto', [...percorsi].sort().join('|')] as const,
  /** Gli export salvati dell'utente in un esperimento: fuori dalle misure, si invalidano a ogni salvataggio o eliminazione. */
  exportSalvati: (espId: string) => ['exportSalvati', espId] as const,
  inviti: ['inviti'] as const,
  /** Il catalogo è condiviso tra gli esperimenti: fuori dal prefisso `config`, non si rilegge a ogni configurazione. */
  catalogo: ['catalogo'] as const,
  sonoAdmin: ['sonoAdmin'] as const,
}

/** QueryClient dell'app (creato e collegato a React in main.tsx). */
export function creaQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } })
}

export function useEsperimenti() {
  return useQuery({ queryKey: chiavi.esperimenti, queryFn: listaEsperimenti })
}

export function useConfig(espId: string | undefined) {
  return useQuery({
    queryKey: chiavi.config(espId ?? ''),
    queryFn: () => caricaConfig(espId as string),
    enabled: !!espId,
  })
}

/**
 * Gli id dei parametri con dati. Si rileggono a ogni apertura della pagina (`staleTime: 0`): da questo dipende se
 * offrire "Elimina" o "Archivia", e una risposta vecchia non deve decidere.
 */
export function useParametriConDati(espId: string | undefined) {
  return useQuery({
    queryKey: chiavi.parametriConDati(espId ?? ''),
    queryFn: () => parametriConDati(espId as string),
    enabled: !!espId,
    staleTime: 0,
  })
}

/** Gli id delle piante con almeno una misura: freschi a ogni apertura, come `useParametriConDati`. */
export function usePianteConDati(espId: string | undefined) {
  return useQuery({
    queryKey: chiavi.pianteConDati(espId ?? ''),
    queryFn: () => pianteConDati(espId as string),
    enabled: !!espId,
    staleTime: 0,
  })
}

/**
 * Gli id delle piante che non si possono eliminare (misure, note collegate o foto). Da questo dipende se offrire
 * "Rimuovi", e misure, note e foto si salvano in altre pagine: nessuna di quelle invalida questa chiave, quindi non si
 * tiene una copia (`gcTime: 0`, come `useMisura`). Chiusa la pagina la query sparisce, e riaprendola non c'è nulla da
 * mostrare finché la risposta nuova non arriva. Dentro le Impostazioni la chiave sta sotto la configurazione: ogni
 * modifica delle piante la rilegge.
 */
export function usePianteNonEliminabili(espId: string | undefined) {
  return useQuery({
    queryKey: chiavi.pianteNonEliminabili(espId ?? ''),
    queryFn: () => pianteNonEliminabili(espId as string),
    enabled: !!espId,
    staleTime: 0,
    gcTime: 0,
  })
}

/** Gli id degli strumenti con almeno una misura: freschi a ogni apertura, da questo dipende se offrire "Elimina". */
export function useStrumentiConDati(espId: string | undefined) {
  return useQuery({
    queryKey: chiavi.strumentiConDati(espId ?? ''),
    queryFn: () => strumentiConDati(espId as string),
    enabled: !!espId,
    staleTime: 0,
  })
}

export function useMisureGiorno(espId: string | undefined, data: string) {
  return useQuery({
    queryKey: chiavi.misureGiorno(espId ?? '', data),
    queryFn: () => misureDelGiorno(espId as string, data),
    enabled: !!espId,
  })
}

/**
 * La data dell'ultima misura di ogni strumento. Sotto il prefisso `misure`: la modifica e l'eliminazione di una misura
 * invalidano tutto il prefisso, e il salvataggio dal modulo della pianta la invalida a parte; così "ultima volta" non
 * resta indietro.
 */
export function useUltimeMisure(espId: string | undefined) {
  return useQuery({
    queryKey: chiavi.ultimeMisure(espId ?? ''),
    queryFn: () => ultimaMisuraPerStrumento(espId as string),
    enabled: !!espId,
  })
}

/**
 * La data più recente con misure fra TUTTI gli strumenti dell'esperimento, o `null` se non ce ne sono. È la fine delle
 * "ultime N settimane" di un esperimento concluso (`fineDelleSettimane`): una sola definizione, così Dataset ed Esporta
 * contano le stesse settimane. Le date sono AAAA-MM-GG, quindi il confronto fra testi è quello fra date.
 */
export function ultimaDataConMisure(ultime: ReadonlyMap<string, string>): string | null {
  let ultima: string | null = null
  for (const data of ultime.values()) if (ultima === null || data > ultima) ultima = data
  return ultima
}

/**
 * `ultimaDataConMisure` dell'esperimento. Legge la stessa query di `useUltimeMisure` (stessa chiave, una sola chiamata
 * al database; `select` trasforma il risultato), quindi si tiene aggiornata con le stesse invalidazioni. `data` è
 * `undefined` finché non arriva, poi una data o `null` (nessuna misura): chi la usa aspetta prima di calcolare il periodo.
 */
export function useUltimaData(espId: string | undefined) {
  return useQuery({
    queryKey: chiavi.ultimeMisure(espId ?? ''),
    queryFn: () => ultimaMisuraPerStrumento(espId as string),
    enabled: !!espId,
    select: ultimaDataConMisure,
  })
}

/**
 * Le misure più recenti di ogni pianta per strumento. Sotto il prefisso `misure`: la modifica o l'eliminazione di una
 * misura invalida tutto il prefisso, e il salvataggio dal modulo (`ModuloOggi`) invalida questa chiave in modo
 * esplicito, così i valori mostrati non restano indietro.
 */
export function useUltimeMisurePiante(espId: string | undefined) {
  return useQuery({
    queryKey: chiavi.ultimeMisurePiante(espId ?? ''),
    queryFn: () => ultimeMisurePiante(espId as string),
    enabled: !!espId,
  })
}

/**
 * Tutte le misure di uno strumento, a pagine (vedi `misureStrumento`). Dataset mostra uno strumento alla volta ed
 * Esporta ne legge uno per strumento scelto, con le stesse chiavi: la cache è condivisa. Sotto il prefisso `misure`:
 * modifica ed eliminazione le rileggono, e il salvataggio dal modulo (`ModuloOggi`) invalida questa chiave in modo
 * esplicito.
 */
export function useMisureStrumento(espId: string | undefined, strumentoId: string | undefined) {
  return useQuery({
    queryKey: chiavi.misureStrumento(espId ?? '', strumentoId ?? ''),
    queryFn: () => misureStrumento(espId as string, strumentoId as string),
    enabled: !!espId && !!strumentoId,
  })
}

/** Le misure di più strumenti insieme (Esporta), per id di strumento. */
export interface MisureStrumenti {
  /** Solo quando tutte le letture sono arrivate: mai dati a metà. Senza strumenti da leggere, una mappa vuota. */
  dati: Map<string, Misura[]> | undefined
  /** Finché manca almeno una lettura. */
  isPending: boolean
  isError: boolean
  /** Il primo errore, nell'ordine degli strumenti. */
  error: unknown
  /** Rilegge tutte le letture. */
  refetch: () => Promise<unknown>
}

/**
 * Le misure di tutti gli strumenti scelti (`useQueries`): `dati` solo quando sono arrivate tutte, `error` il primo
 * errore, `refetch` le rilegge tutte. Stesse chiavi di `useMisureStrumento`, quindi stessa cache.
 */
export function useMisureStrumenti(espId: string | undefined, strumentoIds: readonly string[]): MisureStrumenti {
  return useQueries({
    queries: strumentoIds.map(id => ({
      queryKey: chiavi.misureStrumento(espId ?? '', id),
      queryFn: () => misureStrumento(espId as string, id),
      enabled: !!espId,
    })),
    combine: (risultati: UseQueryResult<Misura[]>[]): MisureStrumenti => {
      const errore = risultati.find(r => r.isError)
      const pronti = !!espId && risultati.every(r => r.data !== undefined)
      return {
        dati: pronti ? new Map(strumentoIds.map((id, i) => [id, risultati[i].data as Misura[]])) : undefined,
        isPending: !pronti,
        isError: errore !== undefined,
        error: errore?.error,
        refetch: () => Promise.all(risultati.map(r => r.refetch())),
      }
    },
  })
}

/** Chiave e lettura delle misure di una pianta: le stesse per `useMisurePianta` e per caricarle in anticipo. */
export function opzioniMisurePianta(piantaId: string) {
  return queryOptions({ queryKey: chiavi.misurePianta(piantaId), queryFn: () => misurePianta(piantaId) })
}

export function useMisurePianta(piantaId: string | undefined) {
  return useQuery({ ...opzioniMisurePianta(piantaId ?? ''), enabled: !!piantaId })
}

/**
 * Una misura per id (la pagina di modifica). Non resta in cache dopo la chiusura della pagina: il modulo parte dai
 * valori letti all'apertura, e una copia vecchia (rimasta dopo una correzione fatta dalla scheda) li farebbe
 * partire sbagliati, con il rischio di riscrivere sopra una modifica appena fatta.
 */
export function useMisura(id: string | undefined) {
  return useQuery({
    queryKey: chiavi.misura(id ?? ''),
    queryFn: () => caricaMisura(id as string),
    enabled: !!id,
    gcTime: 0,
  })
}

/** Le note dell'esperimento (Diario, promemoria di Oggi, storia della pianta), dalla data più recente. */
export function useNote(espId: string | undefined) {
  return useQuery({
    queryKey: chiavi.note(espId ?? ''),
    queryFn: () => listaNote(espId as string),
    enabled: !!espId,
  })
}

/** Le foto dell'esperimento (galleria, scheda della pianta, nota), dalla data più recente. */
export function useFoto(espId: string | undefined) {
  return useQuery({
    queryKey: chiavi.foto(espId ?? ''),
    queryFn: () => listaFoto(espId as string),
    enabled: !!espId,
  })
}

/**
 * Gli URL firmati dei file di questi percorsi, per percorso. In cache per 50 minuti: gli URL valgono un'ora, quindi
 * si rinnovano prima che scadano (anche da soli, con la pagina aperta). Se l'elenco dei percorsi cambia (una foto in più o in meno) tiene gli URL di prima
 * finché arrivano i nuovi, così le miniature non lampeggiano.
 */
export function useUrlFoto(percorsi: readonly string[]) {
  return useQuery({
    queryKey: chiavi.urlFoto(percorsi),
    queryFn: () => urlFoto([...percorsi]),
    enabled: percorsi.length > 0,
    staleTime: (VALIDITA_URL_SECONDI - 600) * 1000,
    // Una galleria lasciata aperta più di un'ora (il telefono in serra) rinnova gli URL prima che scadano.
    refetchInterval: (VALIDITA_URL_SECONDI - 600) * 1000,
    placeholderData: keepPreviousData,
  })
}

/** Lo spazio occupato dalle foto, dell'esperimento e del progetto (Impostazioni). Sempre fresco all'apertura. */
export function useSpazioFoto(espId: string | undefined) {
  return useQuery({
    queryKey: chiavi.spazioFoto(espId ?? ''),
    queryFn: () => spazioFoto(espId as string),
    enabled: !!espId,
    staleTime: 0,
  })
}

export function useInviti() {
  return useQuery({ queryKey: chiavi.inviti, queryFn: listaInviti })
}

/** Le voci del catalogo strumenti, senza le archiviate. */
export function useCatalogo() {
  return useQuery({ queryKey: chiavi.catalogo, queryFn: listaCatalogo })
}

export function useSonoAdmin() {
  return useQuery({ queryKey: chiavi.sonoAdmin, queryFn: sonoAdmin })
}

/** Gli export salvati dell'utente in questo esperimento, per nome (la pagina Esporta). */
export function useExportSalvati(espId: string | undefined) {
  return useQuery({
    queryKey: chiavi.exportSalvati(espId ?? ''),
    queryFn: () => listaExportSalvati(espId as string),
    enabled: !!espId,
  })
}
