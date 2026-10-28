import { QueryClient, useQuery } from '@tanstack/react-query'
import { caricaConfig, listaEsperimenti } from './esperimenti'
import { listaInviti, sonoAdmin } from './inviti'
import { misureDelGiorno, misurePianta } from './misure'

/** Chiavi di cache delle query. Quelle delle misure iniziano tutte con 'misure': si invalidano insieme. */
export const chiavi = {
  esperimenti: ['esperimenti'] as const,
  config: (espId: string) => ['config', espId] as const,
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

export function useMisureGiorno(espId: string | undefined, data: string) {
  return useQuery({
    queryKey: chiavi.misureGiorno(espId ?? '', data),
    queryFn: () => misureDelGiorno(espId as string, data),
    enabled: !!espId,
  })
}

export function useMisurePianta(piantaId: string | undefined) {
  return useQuery({
    queryKey: chiavi.misurePianta(piantaId ?? ''),
    queryFn: () => misurePianta(piantaId as string),
    enabled: !!piantaId,
  })
}

export function useInviti() {
  return useQuery({ queryKey: chiavi.inviti, queryFn: listaInviti })
}

export function useSonoAdmin() {
  return useQuery({ queryKey: chiavi.sonoAdmin, queryFn: sonoAdmin })
}
