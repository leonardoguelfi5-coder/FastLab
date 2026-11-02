const due = (n: number): string => String(n).padStart(2, '0')

/** Data locale (non UTC) nel formato AAAA-MM-GG. */
export function oggiLocale(d: Date = new Date()): string {
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`
}

/**
 * La data locale AAAA-MM-GG di un istante ISO (come `fatto_il`, che si scrive in UTC). Serve per "fatto il GG/MM":
 * tagliare la stringa UTC darebbe il giorno prima per un istante tra mezzanotte e le 1 o le 2 di notte in Italia.
 */
export function dataLocaleDa(iso: string): string {
  return oggiLocale(new Date(iso))
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

/** Da quanto è una data, a parole: "oggi", "ieri", "3 giorni fa"; una data futura (rilievo in anticipo) è "il 30/10". */
export function daQuanto(data: string, oggi: string): string {
  const giorni = giorniTra(data, oggi)
  if (giorni < 0) return `il ${formattaGiornoMese(data)}`
  if (giorni === 0) return 'oggi'
  if (giorni === 1) return 'ieri'
  return `${giorni} giorni fa`
}

/**
 * La data AAAA-MM-GG spostata di `giorni` giorni di calendario (negativo per tornare indietro). Si lavora in UTC sulla
 * sola data, quindi l'ora legale non sposta niente. `setUTCFullYear` e non `Date.UTC`, che porterebbe gli anni sotto
 * il 100 al Novecento.
 */
export function spostaGiorni(data: string, giorni: number): string {
  const [anno, mese, giorno] = data.slice(0, 10).split('-').map(Number)
  const d = new Date(0)
  d.setUTCFullYear(anno, mese - 1, giorno + giorni)
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${due(d.getUTCMonth() + 1)}-${due(d.getUTCDate())}`
}

const FORMA_DATA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Vero se il testo è una data vera AAAA-MM-GG, dall'anno 1 al 9999 (come accetta il database): `2026-02-30` no.
 * Serve per le date che arrivano da fuori, come la URL.
 */
export function eDataValida(s: string): boolean {
  if (!FORMA_DATA.test(s) || s.startsWith('0000')) return false
  return spostaGiorni(s, 0) === s
}
