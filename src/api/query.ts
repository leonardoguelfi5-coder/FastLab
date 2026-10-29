import { QueryClient, queryOptions, useQuery } from '@tanstack/react-query'
import { parametriConDati, pianteConDati } from './configurazione'
import { caricaConfig, listaEsperimenti } from './esperimenti'
import { listaInviti, sonoAdmin } from './inviti'
import { caricaMisura, misureDelGiorno, misurePianta } from './misure'

/** Chiavi di cache delle query. Quelle delle misure iniziano tutte con 'misure': si invalidano insieme. */
export const chiavi = {
  esperimenti: ['esperimenti'] as const,
  config: (espId: string) => ['config', espId] as const,
  /** Sotto il prefisso della configurazione: invalidando `config(espId)` si rileggono anche questi. */
  parametriConDati: (espId: string) => ['config', espId, 'parametriConDati'] as const,
  pianteConDati: (espId: string) => ['config', espId, 'pianteConDati'] as const,
  /** Prefisso di tutte le misure: per invalidarle insieme. */
  misure: ['misure'] as const,
  misura: (id: string) => ['misure', 'una', id] as const,
  misureGiorno: (espId: string, data: string) => ['misure', 'giorno', espId, data] as const,
  misurePianta: (piantaId: string) => ['misure', 'pianta', piantaId] as const,
  inviti: ['inviti'] as const,
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

export function useMisureGiorno(espId: string | undefined, data: string) {
  return useQuery({
    queryKey: chiavi.misureGiorno(espId ?? '', data),
    queryFn: () => misureDelGiorno(espId as string, data),
    enabled: !!espId,
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

export function useInviti() {
  return useQuery({ queryKey: chiavi.inviti, queryFn: listaInviti })
}

export function useSonoAdmin() {
  return useQuery({ queryKey: chiavi.sonoAdmin, queryFn: sonoAdmin })
}
