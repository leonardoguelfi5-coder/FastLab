import { createContext, useCallback, useContext, useEffect, useState } from 'react'

/** Uguaglianza profonda di dati semplici (oggetti, array, stringhe, numeri, booleani, null). */
export function uguali(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const x = a as Record<string, unknown>
  const y = b as Record<string, unknown>
  const chiavi = Object.keys(x)
  return chiavi.length === Object.keys(y).length && chiavi.every(k => Object.hasOwn(y, k) && uguali(x[k], y[k]))
}

/** Come una parte della pagina dice se ha modifiche non salvate: `chiave` la distingue dalle altre. */
type Segnala = (chiave: string, modificata: boolean) => void

/** Fornito dalla pagina delle impostazioni: raccoglie le modifiche non salvate di tutte le sezioni. */
export const ContestoModifiche = createContext<Segnala>(() => undefined)

/** Tiene la pagina informata delle modifiche non salvate di una sezione (e le toglie quando la sezione sparisce). */
export function useSegnalaModifiche(chiave: string, modificata: boolean) {
  const segnala = useContext(ContestoModifiche)
  useEffect(() => { segnala(chiave, modificata) }, [segnala, chiave, modificata])
  useEffect(() => () => segnala(chiave, false), [segnala, chiave])
}

function senza<T>(bozze: Record<string, T>, id: string): Record<string, T> {
  if (!Object.hasOwn(bozze, id)) return bozze
  const resto = { ...bozze }
  delete resto[id]
  return resto
}

/**
 * Le modifiche locali agli elementi di un elenco della configurazione, per id. Un elemento senza bozza mostra il valore
 * della configurazione, e lo segue se cambia; con una bozza mostra la bozza, che un ricaricamento in background non
 * tocca. Le bozze stanno nella sezione, non nell'editor: chiudere una voce o filtrare l'elenco non le perde.
 */
export function useBozze<T extends { id: string }>() {
  const [bozze, setBozze] = useState<Record<string, T>>({})

  const valore = useCallback((originale: T): T => bozze[originale.id] ?? originale, [bozze])
  const modificato = useCallback(
    (originale: T) => Object.hasOwn(bozze, originale.id) && !uguali(bozze[originale.id], originale),
    [bozze],
  )
  const cambia = useCallback((t: T) => setBozze(b => ({ ...b, [t.id]: t })), [])
  const scarta = useCallback((id: string) => setBozze(b => senza(b, id)), [])
  /** Cambia la bozza di un elemento solo se c'è già: un elemento senza modifiche locali segue la configurazione. */
  const modifica = useCallback(
    (id: string, cambio: (b: T) => T) => setBozze(b => (Object.hasOwn(b, id) ? { ...b, [id]: cambio(b[id]) } : b)),
    [],
  )
  /** Dopo un salvataggio riuscito: la bozza va via solo se è ancora quella inviata (nel frattempo si può aver scritto). */
  const salvata = useCallback((inviata: T) => setBozze(b => (b[inviata.id] === inviata ? senza(b, inviata.id) : b)), [])

  return { valore, modificato, cambia, modifica, scarta, salvata }
}
