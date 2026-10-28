const NUMERO = /^-?\d+([.,]\d*)?$/

/**
 * Legge un numero digitato dall'utente (virgola o punto decimale).
 * Restituisce `null` se il testo è vuoto, `NaN` se non è un numero valido.
 */
export function parseNumero(raw: string): number | null {
  const testo = raw.trim()
  if (testo === '') return null
  if (!NUMERO.test(testo)) return NaN
  return Number(testo.replace(',', '.'))
}

/** Numero con virgola decimale; stringa vuota per `null`. */
export function formattaNumero(n: number | null): string {
  if (n === null) return ''
  return String(n).replace('.', ',')
}
