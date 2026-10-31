const due = (n: number): string => String(n).padStart(2, '0')

/** Data locale (non UTC) nel formato AAAA-MM-GG. */
export function oggiLocale(d: Date = new Date()): string {
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`
}

/** Ora locale nel formato HH:MM. */
export function oraLocale(d: Date = new Date()): string {
  return `${due(d.getHours())}:${due(d.getMinutes())}`
}

/** Da AAAA-MM-GG a GG/MM/AAAA, senza passare da Date (niente fusi orari). */
export function formattaData(iso: string): string {
  const [anno, mese, giorno] = iso.slice(0, 10).split('-')
  return `${giorno}/${mese}/${anno}`
}

/** Da AAAA-MM-GG a GG/MM (giorno e mese), per le righe dove l'anno è chiaro: "ultima volta 21/10". */
export function formattaGiornoMese(iso: string): string {
  const [, mese, giorno] = iso.slice(0, 10).split('-')
  return `${giorno}/${mese}`
}

const dataUtc = (iso: string): number => {
  const [anno, mese, giorno] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(anno, mese - 1, giorno)
}

/**
 * Giorni di calendario da `da` a `a` (AAAA-MM-GG); negativo se `a` precede `da`. Si contano i giorni sulla data,
 * non le ore: il cambio dell'ora legale (giorni da 23 o 25 ore) non sposta il risultato.
 */
export function giorniTra(da: string, a: string): number {
  return Math.round((dataUtc(a) - dataUtc(da)) / 86_400_000)
}
