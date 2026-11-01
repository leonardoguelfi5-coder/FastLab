import { vi } from 'vitest'
import type { supabase } from '@/lib/supabase'

type Client = typeof supabase

export interface Risultato { data?: unknown; error?: unknown }
/** Una risposta fissa, oppure calcolata dai metodi già chiamati su quella stessa query (es. fallire solo su `upsert`). */
export type Risposta = Risultato | ((metodi: string[]) => Risultato)
export interface Chiamata { sorgente: string; metodo: string; args: unknown[] }

/**
 * Query builder finto: ogni metodo registra la chiamata e restituisce lo stesso builder,
 * e `await` restituisce il risultato configurato (come fa PostgREST).
 */
function costruisciQuery(sorgente: string, risultato: (metodi: string[]) => Risultato, registro: Chiamata[]): unknown {
  const metodi: string[] = []
  const query: unknown = new Proxy({}, {
    get(_bersaglio, prop) {
      if (prop === 'then') {
        return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null, ...risultato(metodi) }).then(ok, ko)
      }
      return (...args: unknown[]) => {
        metodi.push(String(prop))
        registro.push({ sorgente, metodo: String(prop), args })
        return query
      }
    },
  })
  return query
}

const risolvi = (r: Risposta | undefined, metodi: string[]): Risultato => (typeof r === 'function' ? r(metodi) : r ?? {})

/** Una risposta dello Storage: fissa, o calcolata dagli argomenti della chiamata e da quante volte quel metodo è già stato chiamato. */
export type RispostaStorage = Risultato | ((args: unknown[], volta: number) => Risultato | Promise<Risultato>)

/**
 * Il bucket finto dello Storage: ogni metodo (`upload`, `remove`, `list`, `createSignedUrls`...) registra la chiamata nello
 * stesso elenco delle query (sorgente `storage:<bucket>`), così si verifica anche l'ordine tra database e Storage.
 */
function costruisciBucket(nome: string, risposte: Map<string, RispostaStorage>, volte: Map<string, number>, registro: Chiamata[]): unknown {
  return new Proxy({}, {
    get(_bersaglio, prop) {
      return async (...args: unknown[]) => {
        const metodo = String(prop)
        registro.push({ sorgente: `storage:${nome}`, metodo, args })
        const volta = volte.get(metodo) ?? 0
        volte.set(metodo, volta + 1)
        const r = risposte.get(metodo)
        return { data: null, error: null, ...(typeof r === 'function' ? await r(args, volta) : r ?? {}) }
      }
    },
  })
}

/**
 * Sostituisce `from` e `rpc` del client Supabase (già mockato con vi.mock) con builder finti.
 * `risponde(sorgente, risultato)` imposta la risposta di una tabella o di una RPC (`rpc:nome`);
 * le chiamate registrate sono in `chiamate`, nell'ordine in cui avvengono.
 * Se il client finto ha anche `storage.from` (un `vi.fn()`), lo sostituisce con un bucket finto: `storage.risponde(metodo,
 * risposta)` ne imposta le risposte, `storage.di(metodo)` dà le chiamate.
 */
export function simulaSupabase(client: Client) {
  const risultati = new Map<string, Risposta>()
  const chiamate: Chiamata[] = []

  vi.mocked(client.from).mockImplementation(((tabella: string) =>
    costruisciQuery(tabella, m => risolvi(risultati.get(tabella), m), chiamate)) as never)

  vi.mocked(client.rpc).mockImplementation(((nome: string, args?: unknown) => {
    const sorgente = `rpc:${nome}`
    chiamate.push({ sorgente, metodo: 'rpc', args: [args] })
    return costruisciQuery(sorgente, m => risolvi(risultati.get(sorgente), m), chiamate)
  }) as never)

  const risposteStorage = new Map<string, RispostaStorage>()
  // Quante volte è stato chiamato ogni metodo: `storage.from()` crea un bucket nuovo a ogni chiamata, il conteggio no.
  const volteStorage = new Map<string, number>()
  if (client.storage?.from) {
    vi.mocked(client.storage.from).mockImplementation(((nome: string) =>
      costruisciBucket(nome, risposteStorage, volteStorage, chiamate)) as never)
  }

  return {
    chiamate,
    storage: {
      risponde(metodo: string, risposta: RispostaStorage) { risposteStorage.set(metodo, risposta) },
      /** Le chiamate registrate per un metodo dello Storage, nell'ordine. */
      di(metodo: string): Chiamata[] { return chiamate.filter(c => c.sorgente.startsWith('storage:') && c.metodo === metodo) },
    },
    risponde(sorgente: string, risultato: Risposta) { risultati.set(sorgente, risultato) },
    /** Le chiamate registrate per una tabella o RPC. */
    di(sorgente: string): Chiamata[] { return chiamate.filter(c => c.sorgente === sorgente) },
  }
}
