import { vi } from 'vitest'
import type { supabase } from '@/lib/supabase'

type Client = typeof supabase

export interface Risultato { data?: unknown; error?: unknown }
export interface Chiamata { sorgente: string; metodo: string; args: unknown[] }

/**
 * Query builder finto: ogni metodo registra la chiamata e restituisce lo stesso builder,
 * e `await` restituisce il risultato configurato (come fa PostgREST).
 */
function costruisciQuery(sorgente: string, risultato: () => Risultato, registro: Chiamata[]): unknown {
  const query: unknown = new Proxy({}, {
    get(_bersaglio, prop) {
      if (prop === 'then') {
        return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null, ...risultato() }).then(ok, ko)
      }
      return (...args: unknown[]) => {
        registro.push({ sorgente, metodo: String(prop), args })
        return query
      }
    },
  })
  return query
}

/**
 * Sostituisce `from` e `rpc` del client Supabase (già mockato con vi.mock) con builder finti.
 * `risponde(sorgente, risultato)` imposta la risposta di una tabella o di una RPC (`rpc:nome`);
 * le chiamate registrate sono in `chiamate`, nell'ordine in cui avvengono.
 */
export function simulaSupabase(client: Client) {
  const risultati = new Map<string, Risultato>()
  const chiamate: Chiamata[] = []

  vi.mocked(client.from).mockImplementation(((tabella: string) =>
    costruisciQuery(tabella, () => risultati.get(tabella) ?? {}, chiamate)) as never)

  vi.mocked(client.rpc).mockImplementation(((nome: string, args?: unknown) => {
    const sorgente = `rpc:${nome}`
    chiamate.push({ sorgente, metodo: 'rpc', args: [args] })
    return costruisciQuery(sorgente, () => risultati.get(sorgente) ?? {}, chiamate)
  }) as never)

  return {
    chiamate,
    risponde(sorgente: string, risultato: Risultato) { risultati.set(sorgente, risultato) },
    /** Le chiamate registrate per una tabella o RPC. */
    di(sorgente: string): Chiamata[] { return chiamate.filter(c => c.sorgente === sorgente) },
  }
}
