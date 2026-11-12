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

/** Le parti di un numero come si scrive, senza il rumore della virgola mobile (0,1 + 0,2 resta 0,3). */
function parti(n: number): { cifre: string; decimali: number } {
  const testo = String(Number(Math.abs(n).toPrecision(15)))
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(testo)
  if (!m) return { cifre: '0', decimali: 0 }
  return { cifre: m[1] + (m[2] ?? ''), decimali: Math.max(0, (m[2]?.length ?? 0) - Number(m[3] ?? 0)) }
}

/** Quanti decimali ha un numero come si scrive: 0,412 → 3, 24,5 → 1, 2350 → 0. */
export function decimaliDi(n: number): number {
  return Number.isFinite(n) ? parti(n).decimali : 0
}

/** Il massimo dei decimali di più numeri (la precisione dei dati, cioè dello strumento); 0 senza numeri. */
export function decimaliMassimi(xs: Iterable<number>): number {
  let d = 0
  for (const x of xs) d = Math.max(d, decimaliDi(x))
  return d
}

/**
 * Le cifre significative di un numero come si scrive: dalla prima cifra diversa da zero all'ultima. 0,062 → 2,
 * 0,412 → 3, 2350 → 4 (gli zeri finali di un intero si contano: sono cifre lette), 0 → 1.
 */
export function cifreSignificativeDi(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.max(1, parti(n).cifre.replace(/^0+/, '').length)
}

/** Il massimo delle cifre significative di più numeri: un risultato ne ha quante il dato che ne ha di più. */
export function cifreMassime(xs: Iterable<number>): number {
  let c = 1
  for (const x of xs) c = Math.max(c, cifreSignificativeDi(x))
  return c
}

/** Arrotondato a `decimali` cifre dopo la virgola (anche 0). */
export function arrotondaDecimali(n: number, decimali: number): number {
  if (!Number.isFinite(n)) return n
  const r = Number(n.toFixed(Math.min(20, Math.max(0, decimali))))
  return Object.is(r, -0) ? 0 : r
}

/** Quanti decimali servono per scrivere `n` con `cifre` cifre significative (0 se le cifre stanno tutte prima della virgola). */
export function decimaliPerCifre(n: number, cifre: number): number {
  if (n === 0 || !Number.isFinite(n)) return Math.max(0, cifre - 1)
  const ordine = Math.floor(Math.log10(Math.abs(n)))
  let d = cifre - 1 - ordine
  // 9,996 con 3 cifre diventa 10,0: l'arrotondamento sale di un ordine, e i decimali scendono di uno.
  if (d >= 0 && Math.abs(Number(n.toFixed(Math.min(20, d)))) >= 10 ** (ordine + 1)) d -= 1
  return Math.max(0, d)
}

/** Arrotondato a `cifre` cifre significative: 91,428 con 3 → 91,4; 12 345 con 3 → 12 300. */
export function arrotondaCifre(n: number, cifre: number): number {
  if (n === 0 || !Number.isFinite(n)) return n
  const d = decimaliPerCifre(n, cifre)
  if (d > 0) return arrotondaDecimali(n, d)
  const passo = 10 ** Math.max(0, Math.floor(Math.log10(Math.abs(n))) + 1 - cifre)
  const r = Math.round(n / passo) * passo
  return Object.is(r, -0) ? 0 : r
}

/** Con esattamente `decimali` cifre dopo la virgola, zeri compresi (sono cifre lette): 19,80 con 2 → "19,80". */
export function formattaDecimali(n: number, decimali: number): string {
  if (!Number.isFinite(n)) return String(n)
  const r = arrotondaDecimali(n, decimali)
  return r.toFixed(Math.min(20, Math.max(0, decimali))).replace('.', ',')
}

/** Con `cifre` cifre significative, zeri compresi: 90 con 3 → "90,0"; 0,017 con 2 → "0,017". */
export function formattaCifre(n: number, cifre: number): string {
  if (!Number.isFinite(n)) return String(n)
  return formattaDecimali(arrotondaCifre(n, cifre), decimaliPerCifre(n, cifre))
}

/**
 * Una media, un errore standard o una differenza di dati: con gli stessi decimali dei dati (la precisione dello
 * strumento), come chiede l'utente. `decimali` lo dà `decimaliMassimi` dei dati da cui viene.
 */
export function formattaMedia(n: number, decimali: number): string {
  return formattaDecimali(n, decimali)
}

/** Una media con la sua unità di misura, se ce l'ha: "24,5 °C", "41,2". */
export function formattaConUnita(n: number, decimali: number, unita: string | null): string {
  return `${formattaMedia(n, decimali)}${unita ? ` ${unita}` : ''}`
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
