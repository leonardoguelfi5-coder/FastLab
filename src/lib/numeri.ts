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

const SOLO_CIFRE = /^\d+$/

/**
 * Legge un numero intero senza segno né decimali compreso tra `min` e `max` (estremi inclusi).
 * Restituisce `null` se il testo non è un intero valido o è fuori dall'intervallo.
 */
export function leggiIntero(raw: string, min: number, max: number): number | null {
  const testo = raw.trim()
  if (!SOLO_CIFRE.test(testo)) return null
  const n = Number(testo)
  return n >= min && n <= max ? n : null
}
