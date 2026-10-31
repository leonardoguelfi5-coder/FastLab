// Cifre con separatore decimale finale ("24,") o iniziale (",5").
const NUMERO = /^-?(\d+([.,]\d*)?|[.,]\d+)$/

/**
 * Legge un numero digitato dall'utente (virgola o punto decimale, anche senza lo zero davanti: ",5").
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

/**
 * Una media o un valore calcolato da mostrare: virgola decimale e al massimo due decimali (senza zeri inutili),
 * perché una media di letture può avere tante cifre ("41,2333333") che sul telefono non dicono nulla in più.
 */
export function formattaMedia(n: number): string {
  const arrotondato = Math.round(n * 100) / 100
  // -0 (da un valore minuscolo negativo) si scriverebbe "-0"
  return formattaNumero(Object.is(arrotondato, -0) ? 0 : arrotondato)
}

/** Un valore calcolato con la sua unità di misura, se ce l'ha: "24,5 °C", "41,2". */
export function formattaConUnita(n: number, unita: string | null): string {
  return `${formattaMedia(n)}${unita ? ` ${unita}` : ''}`
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
