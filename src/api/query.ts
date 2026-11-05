import { useCallback, useMemo } from 'react'
import { keepPreviousData, QueryClient, queryOptions, useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { DURATA_IN_MEMORIA_MS } from '@/lib/cachePersistente'
import type { VoceCoda } from '@/lib/coda/codaMisure'
import { conCoda, perOraCrescente, piuRecentiPrima } from '@/lib/coda/sovrapponi'
import { useVociCoda } from '@/lib/coda/useCoda'
import { listaCatalogo } from './catalogo'
import { conteggiStrumenti, parametriConDati, pianteConDati, pianteNonEliminabili } from './configurazione'
import { caricaConfig, listaEsperimenti } from './esperimenti'
import { listaExportSalvati } from './exportSalvati'
import { listaFoto, urlFoto, VALIDITA_URL_SECONDI } from './foto'
import { listaInviti, sonoAdmin } from './inviti'
import { listaNote } from './note'
import { spazioProgetto } from './spazio'
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
  conteggiStrumenti: (espId: string) => ['config', espId, 'conteggiStrumenti'] as const,
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
  /** Lo spazio del progetto visto da un esperimento: sotto le foto, "Libera lo spazio" e ogni foto lo rileggono. */
  spazio: (espId: string) => ['foto', espId, 'spazio'] as const,
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

/*
 * Le letture dell'elenco chiuso della copia sul telefono (`src/lib/cachePersistente.ts`: esperimenti, configurazione,
 * misure del giorno e della pianta, ultime misure per strumento) restano in memoria un giorno anche senza una pagina
 * che le usa (`gcTime: DURATA_IN_MEMORIA_MS`), non 5 minuti: la copia è fatta di quello che c'è in memoria, e una
 * pianta letta all'inizio del giro deve esserci ancora alla fine, anche senza rete.
 */

export function useEsperimenti() {
  return useQuery({ queryKey: chiavi.esperimenti, queryFn: listaEsperimenti, gcTime: DURATA_IN_MEMORIA_MS })
}

export function useConfig(espId: string | undefined) {
  return useQuery({
    queryKey: chiavi.config(espId ?? ''),
    queryFn: () => caricaConfig(espId as string),
    enabled: !!espId,
    gcTime: DURATA_IN_MEMORIA_MS,
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

/**
 * Quante misure ha ogni strumento (solo quelli che ne hanno), di quante piante e in che date: da questo dipende se
 * "Elimina" elimina o spiega perché non si può. Fresco a ogni apertura, come `useParametriConDati`.
 */
export function useConteggiStrumenti(espId: string | undefined) {
  return useQuery({
    queryKey: chiavi.conteggiStrumenti(espId ?? ''),
    queryFn: () => conteggiStrumenti(espId as string),
    enabled: !!espId,
    staleTime: 0,
  })
}

/** Le voci in coda di un esperimento, con un riferimento che cambia solo quando cambiano loro. */
function useVociDi(espId: string | undefined): VoceCoda[] {
  const voci = useVociCoda()
  return useMemo(() => voci.filter(v => v.espId === espId), [voci, espId])
}

/**
 * Le misure del giorno, con sopra quelle ancora in coda d'invio (Piano E, Task E6: `conCoda`): una misura salvata senza
 * rete si vede subito come fatta, e una rilettura del server che non l'ha ancora non la toglie. La cache tiene solo i
 * dati del server; la sovrapposizione la fa `select`, che si rifà quando la coda cambia.
 */
export function useMisureGiorno(espId: string | undefined, data: string) {
  const voci = useVociDi(espId)
  const select = useCallback(
    (misure: Misura[]) => conCoda(misure, voci, m => m.data_rilievo === data, perOraCrescente),
    [voci, data],
  )
  return useQuery({
    queryKey: chiavi.misureGiorno(espId ?? '', data),
    queryFn: () => misureDelGiorno(espId as string, data),
    enabled: !!espId,
    gcTime: DURATA_IN_MEMORIA_MS,
    select,
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
    gcTime: DURATA_IN_MEMORIA_MS,
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
    gcTime: DURATA_IN_MEMORIA_MS,
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
  // Gli ids contano per il loro contenuto, non per l'array (chi chiama ne passa uno nuovo a ogni disegno): così `combine`
  // resta lo stesso e React Query ridà la stessa `Map` finché le letture non cambiano. Chi la usa in un `useMemo`
  // (Esporta ricalcola la cartella, mezzo secondo con migliaia di misure) non la rifà a ogni disegno.
  const chiave = strumentoIds.join('\u0000')
  const ids = useMemo(() => (chiave === '' ? [] : chiave.split('\u0000')), [chiave])
  const combine = useCallback((risultati: UseQueryResult<Misura[]>[]): MisureStrumenti => {
    const errore = risultati.find(r => r.isError)
    const pronti = !!espId && risultati.every(r => r.data !== undefined)
    return {
      dati: pronti ? new Map(ids.map((id, i) => [id, risultati[i].data as Misura[]])) : undefined,
      isPending: !pronti,
      isError: errore !== undefined,
      error: errore?.error,
      refetch: () => Promise.all(risultati.map(r => r.refetch())),
    }
  }, [espId, ids])
  return useQueries({
    queries: ids.map(id => ({
      queryKey: chiavi.misureStrumento(espId ?? '', id),
      queryFn: () => misureStrumento(espId as string, id),
      enabled: !!espId,
    })),
    combine,
  })
}

/** Chiave e lettura delle misure di una pianta: le stesse per `useMisurePianta` e per caricarle in anticipo. */
export function opzioniMisurePianta(piantaId: string) {
  return queryOptions({ queryKey: chiavi.misurePianta(piantaId), queryFn: () => misurePianta(piantaId), gcTime: DURATA_IN_MEMORIA_MS })
}

/** Le misure di una pianta con sopra quelle ancora in coda, come `useMisureGiorno`. */
export function useMisurePianta(piantaId: string | undefined) {
  const voci = useVociCoda()
  const select = useCallback(
    (misure: Misura[]) => conCoda(misure, voci, m => m.pianta_id === piantaId, piuRecentiPrima),
    [voci, piantaId],
  )
  return useQuery({ ...opzioniMisurePianta(piantaId ?? ''), enabled: !!piantaId, select })
}

/**
 * Una misura per id (la pagina di modifica). Non resta in cache dopo la chiusura della pagina: il modulo parte dai
 * valori letti all'apertura, e una copia vecchia (rimasta dopo una correzione fatta dalla scheda) li farebbe
 * partire sbagliati, con il rischio di riscrivere sopra una modifica appena fatta.
 */
export function useMisura(id: string | undefined): UseQueryResult<Misura> {
  const query = useQuery({
    queryKey: chiavi.misura(id ?? ''),
    queryFn: () => caricaMisura(id as string),
    enabled: !!id,
    gcTime: 0,
  })
  // Una misura ancora in coda si apre dalla coda (è la sua versione più recente), anche se il server non l'ha ancora.
  const inCoda = useVociCoda().find(v => v.misura.id === id)?.misura
  return inCoda ? ({ ...query, data: inCoda } as UseQueryResult<Misura>) : query
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

/** Lo spazio di tutto il progetto (database e foto) e i conteggi dell'esperimento (Impostazioni). Sempre fresco all'apertura. */
export function useSpazioProgetto(espId: string | undefined) {
  return useQuery({
    queryKey: chiavi.spazio(espId ?? ''),
    queryFn: () => spazioProgetto(espId as string),
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
