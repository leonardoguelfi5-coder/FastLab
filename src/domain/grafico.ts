import { formattaData, formattaGiornoMese, giorniTra } from '@/lib/date'
import { formattaMedia, formattaNumero } from '@/lib/numeri'
import type { NoteDellaData, ScalaGrafico, Serie } from './dataset'
import type { Nota } from './tipi'

/**
 * La geometria del grafico, tutta come funzioni pure: scale, tacche degli assi, percorsi delle linee, barre
 * dell'errore standard, marcatori e segni verticali delle note. `GraficoSvg` la disegna sia nell'app sia per
 * l'immagine dell'Excel, quindi il disegno è lo stesso; qui non c'è DOM, né date "di sistema", e si prova con i
 * numeri. Le serie vengono da `dataset.ts` (le stesse della tabella "Mostra i valori" e dell'export).
 */

/**
 * La tavolozza dei dati (DESIGN.md, "Colori dei dati"): otto colori in ordine fisso, validati su carta con lo script
 * della skill dataviz. Il posto è l'indice del trattamento nell'ordine della configurazione, non nel filtro. Niente
 * verde (è solo "salvato") e niente blu dell'inchiostro (è selezione e focus). Solo dentro i grafici.
 */
export const COLORI_SERIE = [
  '#0e8ca0', // 1 petrolio
  '#d9622b', // 2 arancio
  '#6a4fc8', // 3 viola
  '#b8860b', // 4 ocra
  '#c2457e', // 5 magenta
  '#2a8fc4', // 6 azzurro
  '#d03b3b', // 7 rosso
  '#9a6fd8', // 8 lilla
] as const

/**
 * Gli equivalenti esadecimali dei token che servono dentro il grafico: un SVG trasformato in immagine non legge le
 * variabili CSS, quindi i colori vanno scritti nel disegno. Convertiti da oklch (src/index.css).
 */
export const COLORI_GRAFICO = {
  carta: '#fcf9f5', // --carta
  foglio: '#fffefb', // --foglio, fondo dell'immagine
  grafite: '#191d24', // --grafite
  grafiteTenue: '#4e535c', // --grafite-tenue: testi di assi e legenda, e le serie dal nono trattamento
  riga: '#ddd8d1', // --riga: griglia orizzontale
  rigaForte: '#bdb6ae', // --riga-forte: asse X, cursore e segni delle note
} as const

/** Il carattere dei numeri e delle etichette (src/index.css, `--font-mono`). */
export const FONT_DATI = '"Geist Mono Variable", ui-monospace, Consolas, monospace'
/** La larghezza di un carattere monospazio a 11 px: serve a misurare etichette senza un DOM. */
export const LARGHEZZA_CARATTERE = 6.6
/** Il corpo del testo del grafico, in px. */
export const CORPO_TESTO = 11

/** Un poligono come percorso SVG, con due decimali: gli otto marcatori sono tutti pieni, così si colorano come le linee. */
const poligono = (punti: [number, number][]): string =>
  `M${punti.map(([x, y]) => `${Math.round(x * 100) / 100} ${Math.round(y * 100) / 100}`).join('L')}Z`
const ruota45 = (punti: [number, number][]): [number, number][] =>
  punti.map(([x, y]) => [(x - y) * Math.SQRT1_2, (x + y) * Math.SQRT1_2])
const CROCE: [number, number][] = [
  [-1.5, -4.4], [1.5, -4.4], [1.5, -1.5], [4.4, -1.5], [4.4, 1.5], [1.5, 1.5],
  [1.5, 4.4], [-1.5, 4.4], [-1.5, 1.5], [-4.4, 1.5], [-4.4, -1.5], [-1.5, -1.5],
]
const PENTAGONO: [number, number][] = [0, 1, 2, 3, 4].map(i => {
  const angolo = (-90 + 72 * i) * Math.PI / 180
  return [4.6 * Math.cos(angolo), 4.6 * Math.sin(angolo)]
})

/**
 * Gli otto marcatori, come percorsi centrati sull'origine e larghi circa 8 px: cerchio, quadrato, triangolo, rombo,
 * triangolo in giù, croce, x, pentagono. Mai solo colore: ogni serie ha la sua forma.
 */
export const MARCATORI = [
  'M-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0Z',
  'M-4-4h8v8h-8Z',
  poligono([[0, -4.6], [4.4, 3.4], [-4.4, 3.4]]),
  poligono([[0, -4.8], [4.8, 0], [0, 4.8], [-4.8, 0]]),
  poligono([[0, 4.6], [4.4, -3.4], [-4.4, -3.4]]),
  poligono(CROCE),
  poligono(ruota45(CROCE)),
  poligono(PENTAGONO),
] as const

/** Quanto sta fuori dall'area dei dati (a destra e a sinistra) il primo e l'ultimo giorno: i marcatori non si tagliano. */
const RIENTRO = 10
/** Distanza minima fra due tacche dell'asse X: due date più vicine non si sovrappongono. */
const DISTANZA_TACCHE_X = 56
/** Quanto vicino a un segno di nota basta toccare per sceglierlo (px): un bersaglio da dito. */
export const MASSIMA_DISTANZA_NOTA = 24
const ALTEZZA_RIGA_LEGENDA = 16

// ---- tacche degli assi ----

export interface Tacche { min: number; max: number; valori: number[] }

const PASSI = [1, 2, 5]

/**
 * Le tacche "tonde" (passi di 1, 2 o 5 per una potenza di dieci) per coprire da `min` a `max` con al più `quante`
 * tacche; il dominio si allarga alla prima e all'ultima. Il passo è il più piccolo che ci sta: più tacche, ma leggibili.
 * Tutti i valori uguali: più o meno il 10% (più o meno 1 se sono zero), altrimenti l'asse sarebbe un punto solo.
 */
export function tacche(min: number, max: number, quante: number): Tacche {
  let basso = Number.isFinite(min) ? min : Number.isFinite(max) ? max : 0
  let alto = Number.isFinite(max) ? max : basso
  if (basso > alto) [basso, alto] = [alto, basso]
  if (basso === alto) {
    const scarto = basso === 0 ? 1 : Math.abs(basso) * 0.1
    basso -= scarto
    alto += scarto
  }
  const massime = Math.max(2, Math.floor(quante))
  // La tolleranza evita che 0,003 / 0,001 = 2,9999999999999996 faccia scendere la prima tacca di un passo.
  const EPS = 1e-9
  const grandezza = Math.floor(Math.log10(alto - basso))
  for (let esp = grandezza - 4; esp <= grandezza + 2; esp++) {
    for (const m of PASSI) {
      const passo = m * 10 ** esp
      const k0 = Math.floor(basso / passo + EPS)
      const k1 = Math.ceil(alto / passo - EPS)
      if (k1 - k0 + 1 > massime) continue
      const decimali = Math.max(0, -esp)
      const valori = Array.from({ length: k1 - k0 + 1 }, (_, i) => Number(((k0 + i) * passo).toFixed(decimali)))
      return { min: valori[0], max: valori[valori.length - 1], valori }
    }
  }
  // Non si arriva qui con dati finiti (un passo abbastanza grande c'è sempre), ma l'asse non deve mai rompersi.
  return { min: basso, max: alto, valori: [basso, alto] }
}

/**
 * Il dominio dell'asse verticale per la scala del parametro: percentuale da 0 a 100 fisso, conteggio da 0, valore dai
 * dati. Mai un doppio asse: una scala sola per grafico.
 */
export function dominioVerticale(scala: ScalaGrafico, min: number, max: number, quante: number): Tacche {
  switch (scala) {
    case 'percentuale': return tacche(0, 100, quante)
    case 'conteggio': return tacche(0, max > 0 ? max : 1, quante)
    case 'valore': return tacche(min, max, quante)
  }
}

// ---- le serie: stile ed etichetta ----

/** L'etichetta di una serie, per la legenda, la lettura e il riassunto. */
export function etichettaSerie(serie: Serie): string {
  if (serie.tipo === 'pianta') return `Pianta ${serie.pianta.etichetta} (${serie.trattamento.etichetta})`
  return serie.riferimento ? `Media ${serie.trattamento.etichetta}` : serie.trattamento.etichetta
}

export interface StileSerie {
  colore: string
  /** `stroke-dasharray`, `null` = linea piena. */
  tratteggio: string | null
  /** Una serie di riferimento: sottile e al 40%. */
  tenue: boolean
  spessore: number
  /** Il percorso del marcatore (uno di `MARCATORI`). */
  marcatore: string
}

/**
 * Lo stile di ogni serie. Il colore e il marcatore seguono il posto del trattamento (dal nono in poi: grafite tenue
 * tratteggiata e marcatori a rotazione, uno diverso dall'altro finché sono meno di otto). Le piante cercate hanno il
 * colore del loro trattamento e marcatori diversi fra loro, nell'ordine in cui compaiono. Le serie di riferimento
 * sono sottili, tratteggiate e al 40%.
 */
export function stili(serie: Serie[]): StileSerie[] {
  let senzaPosto = 0
  let piante = 0
  return serie.map(s => {
    const indiceMarcatore = s.tipo === 'pianta' ? piante++ : s.posto !== null ? s.posto : senzaPosto++
    const marcatore = MARCATORI[indiceMarcatore % MARCATORI.length]
    const colore = s.posto !== null ? COLORI_SERIE[s.posto] : COLORI_GRAFICO.grafiteTenue
    if (s.riferimento) return { colore, tratteggio: '3 3', tenue: true, spessore: 1, marcatore }
    return { colore, tratteggio: s.posto === null ? '6 4' : null, tenue: false, spessore: 2, marcatore }
  })
}

// ---- impaginazione ----

export interface OpzioniImpagina {
  larghezza: number
  altezza: number
  scala: ScalaGrafico
  /** L'unità del parametro, sulla tacca alta dell'asse Y (per la percentuale è `%`). */
  unita?: string | null
  /** Per l'immagine: lascia posto al titolo in alto e alla legenda in basso. */
  perImmagine?: boolean
}

export interface PuntoDisegnato { data: string; x: number; y: number; media: number; es: number | null; n: number }
/** Una barra dell'errore standard: dal valore più alto al più basso, con un cappuccio alle estremità. */
export interface BarraErrore { x: number; yAlto: number; yBasso: number }
export interface SerieDisegnata {
  indice: number
  /** Una chiave stabile per React, diversa anche fra una serie e il suo riferimento. */
  chiave: string
  etichetta: string
  stile: StileSerie
  /** Il percorso della linea; `null` con meno di due punti (resta il marcatore). */
  linea: string | null
  punti: PuntoDisegnato[]
  barre: BarraErrore[]
}
export interface TaccaX { data: string; x: number; etichetta: string }
export interface TaccaY { valore: number; y: number; etichetta: string }
export interface SegnoNota { data: string; x: number; quante: number; note: Nota[] }
export interface VoceLegenda {
  indice: number
  etichetta: string
  /** L'etichetta come si scrive nell'immagine, con "(nessun dato)" per una serie senza punti. */
  testo: string
  stile: StileSerie
  senzaDati: boolean
  /** Dove sta nell'immagine (marcatore a `x`, testo a `x + 14`); nell'app la legenda è HTML. */
  x: number
  y: number
}

export interface Impaginazione {
  larghezza: number
  altezza: number
  scala: ScalaGrafico
  perImmagine: boolean
  /** Il rettangolo dei dati. */
  area: { sinistra: number; alto: number; destra: number; basso: number }
  /** Nessun punto in nessuna serie: al posto del grafico va un messaggio. */
  vuoto: boolean
  tacchex: TaccaX[]
  tacchey: TaccaY[]
  serie: SerieDisegnata[]
  segni: SegnoNota[]
  /** Le date che si possono scegliere (punti e note) con la loro x. */
  giorni: { data: string; x: number }[]
  legenda: VoceLegenda[]
  titolo: { x: number; y: number } | null
}

const tra = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
const arrotonda = (n: number) => Math.round(n * 100) / 100

/** Dispone la legenda dell'immagine: a capo quando la riga è piena. Restituisce le voci e quante righe servono. */
function disponiLegenda(
  voci: Omit<VoceLegenda, 'x' | 'y'>[], larghezza: number,
): { posizioni: { x: number; riga: number }[]; righe: number } {
  const MARGINE = 12
  let x = MARGINE
  let riga = 0
  const posizioni = voci.map(v => {
    const larghezzaVoce = 14 + v.testo.length * LARGHEZZA_CARATTERE + 18
    if (x > MARGINE && x + larghezzaVoce > larghezza - MARGINE) { x = MARGINE; riga++ }
    const p = { x, riga }
    x += larghezzaVoce
    return p
  })
  return { posizioni, righe: voci.length === 0 ? 0 : riga + 1 }
}

/** Le tacche dell'asse X: date vere, al più una ogni `DISTANZA_TACCHE_X` px, tenendo la prima e l'ultima se possibile. */
function tacchePerX(giorni: { data: string; x: number }[]): TaccaX[] {
  const scelte: { data: string; x: number }[] = []
  for (const g of giorni) {
    if (scelte.length === 0 || g.x - scelte[scelte.length - 1].x >= DISTANZA_TACCHE_X) scelte.push(g)
  }
  const ultimo = giorni[giorni.length - 1]
  if (ultimo && scelte[scelte.length - 1] !== ultimo) {
    if (ultimo.x - scelte[scelte.length - 1].x >= DISTANZA_TACCHE_X) scelte.push(ultimo)
    else if (scelte.length > 1 && ultimo.x - scelte[scelte.length - 2].x >= DISTANZA_TACCHE_X) scelte[scelte.length - 1] = ultimo
  }
  return scelte.map(g => ({ data: g.data, x: g.x, etichetta: formattaGiornoMese(g.data) }))
}

/**
 * Impagina il grafico: dalle serie del Dataset e dai segni delle note alle coordinate di tutto ciò che si disegna.
 *
 * - Asse X per giorni veri: due date a un giorno di distanza stanno vicine, due a dieci giorni lontane; con una sola
 *   data i punti stanno al centro. Il dominio è quello delle date delle SERIE: una nota (un promemoria futuro) fuori
 *   da quelle date non ha segno e non allunga l'asse.
 * - Asse Y: una scala sola, che contiene anche media ± errore standard; la tacca alta porta l'unità.
 * - Linee: un solo percorso per serie, tra i punti che ci sono (un giorno senza misura non spezza né inventa nulla).
 * - Barre: ± errore standard; nessuna se è `null` (n = 1 e sì/no) o zero.
 * - Con `perImmagine` lascia posto al titolo in alto e alla legenda, a capo, in basso.
 */
export function impagina(serie: Serie[], noteDelleDate: NoteDellaData[], opzioni: OpzioniImpagina): Impaginazione {
  const larghezza = Math.max(120, opzioni.larghezza)
  const altezza = Math.max(120, opzioni.altezza)
  const perImmagine = opzioni.perImmagine === true
  const stile = stili(serie)

  // La legenda dell'immagine decide l'altezza che resta al grafico.
  const vociBase = serie.map((s, indice) => {
    const senzaDati = s.punti.length === 0
    const etichetta = etichettaSerie(s)
    return { indice, etichetta, testo: senzaDati ? `${etichetta} (nessun dato)` : etichetta, stile: stile[indice], senzaDati }
  })
  const { posizioni, righe } = perImmagine ? disponiLegenda(vociBase, larghezza) : { posizioni: [], righe: 0 }
  const altezzaLegenda = righe === 0 ? 0 : righe * ALTEZZA_RIGA_LEGENDA + 8
  const alto = perImmagine ? 36 : 16
  const basso = Math.max(alto + 40, altezza - 22 - altezzaLegenda)
  const legenda: VoceLegenda[] = vociBase.map((v, i) => ({
    ...v,
    x: posizioni[i]?.x ?? 0,
    y: altezza - altezzaLegenda + 11 + (posizioni[i]?.riga ?? 0) * ALTEZZA_RIGA_LEGENDA,
  }))
  const titolo = perImmagine ? { x: 12, y: 20 } : null

  const tuttiIPunti = serie.flatMap(s => s.punti)
  if (tuttiIPunti.length === 0) {
    return {
      larghezza, altezza, scala: opzioni.scala, perImmagine, area: { sinistra: 40, alto, destra: larghezza - 14, basso },
      vuoto: true, tacchex: [], tacchey: [],
      serie: serie.map((s, indice) => ({
        indice, chiave: chiaveSerie(s), etichetta: etichettaSerie(s), stile: stile[indice], linea: null, punti: [], barre: [],
      })),
      segni: [], giorni: [], legenda, titolo,
    }
  }

  // Asse Y: la scala contiene anche i baffi dell'errore standard.
  const alti = tuttiIPunti.map(p => p.media + (p.es ?? 0))
  const bassi = tuttiIPunti.map(p => p.media - (p.es ?? 0))
  const quante = tra(Math.floor((basso - alto) / 40) + 1, 3, 6)
  const dominio = dominioVerticale(opzioni.scala, Math.min(...bassi), Math.max(...alti), quante)
  const unita = opzioni.scala === 'percentuale' ? '%' : opzioni.unita ?? null
  const etichetteY = dominio.valori.map((v, i) =>
    formattaNumero(v) + (i === dominio.valori.length - 1 && unita ? ` ${unita}` : ''))
  const sinistra = tra(Math.ceil(Math.max(...etichetteY.map(e => e.length)) * LARGHEZZA_CARATTERE) + 12, 34, larghezza * 0.4)
  const destra = larghezza - 14
  const yDi = (v: number) => basso - ((v - dominio.min) / (dominio.max - dominio.min)) * (basso - alto)

  // Asse X: giorni veri sulle date delle serie.
  const date = [...new Set(tuttiIPunti.map(p => p.data))].sort()
  const primo = date[0]
  const ultimoGiorno = date[date.length - 1]
  const giorniTotali = giorniTra(primo, ultimoGiorno)
  const x0 = sinistra + RIENTRO
  const x1 = destra - RIENTRO
  const xDi = (data: string) => giorniTotali === 0 ? (sinistra + destra) / 2 : x0 + (giorniTra(primo, data) / giorniTotali) * (x1 - x0)

  const disegnate: SerieDisegnata[] = serie.map((s, indice) => {
    const punti = s.punti.map(p => ({ data: p.data, x: xDi(p.data), y: yDi(p.media), media: p.media, es: p.es, n: p.n }))
    return {
      indice,
      chiave: chiaveSerie(s),
      etichetta: etichettaSerie(s),
      stile: stile[indice],
      linea: punti.length < 2 ? null : punti.map((p, i) => `${i === 0 ? 'M' : 'L'}${arrotonda(p.x)} ${arrotonda(p.y)}`).join(''),
      punti,
      barre: s.punti.flatMap((p, i): BarraErrore[] =>
        p.es === null || !(p.es > 0) ? [] : [{ x: punti[i].x, yAlto: yDi(p.media + p.es), yBasso: yDi(p.media - p.es) }]),
    }
  })

  // Segni delle note: solo nel dominio delle date delle serie, estremi compresi.
  const segni: SegnoNota[] = noteDelleDate
    .filter(n => n.data >= primo && n.data <= ultimoGiorno && n.note.length > 0)
    .map(n => ({ data: n.data, x: xDi(n.data), quante: n.note.length, note: n.note }))

  const dateScelte = [...new Set([...date, ...segni.map(s => s.data)])].sort()
  const giorni = dateScelte.map(data => ({ data, x: xDi(data) }))

  return {
    larghezza, altezza, scala: opzioni.scala, perImmagine,
    area: { sinistra, alto, destra, basso },
    vuoto: false,
    tacchex: tacchePerX(date.map(data => ({ data, x: xDi(data) }))),
    tacchey: dominio.valori.map((valore, i) => ({ valore, y: yDi(valore), etichetta: etichetteY[i] })),
    serie: disegnate,
    segni,
    giorni,
    legenda,
    titolo,
  }
}

function chiaveSerie(s: Serie): string {
  if (s.tipo === 'pianta') return `p:${s.pianta.id}`
  return `${s.riferimento ? 'r' : 't'}:${s.trattamento.id}`
}

/** Il percorso delle barre dell'errore standard di una serie, con il cappuccio (6 px) in cima e in fondo. */
export function percorsoBarre(barre: BarraErrore[]): string {
  return barre.map(b => {
    const x = arrotonda(b.x)
    const alto = arrotonda(b.yAlto)
    const basso = arrotonda(b.yBasso)
    return `M${x} ${alto}V${basso}M${arrotonda(x - 3)} ${alto}H${arrotonda(x + 3)}M${arrotonda(x - 3)} ${basso}H${arrotonda(x + 3)}`
  }).join('')
}

// ---- lettura: tocco, tastiera, riassunto ----

/** Le date che si possono scegliere con un tocco o con le frecce: quelle dei punti e quelle delle note. */
export function dateSelezionabili(imp: Impaginazione): string[] {
  return imp.giorni.map(g => g.data)
}

/** La data scelta da un tocco alla coordinata `x` (la più vicina; a pari distanza la prima); `null` senza dati. */
export function dataPiuVicina(imp: Impaginazione, x: number): string | null {
  let migliore: { data: string; distanza: number } | null = null
  for (const g of imp.giorni) {
    const distanza = Math.abs(g.x - x)
    if (migliore === null || distanza < migliore.distanza) migliore = { data: g.data, distanza }
  }
  return migliore?.data ?? null
}

export interface VoceLettura { indice: number; etichetta: string; stile: StileSerie; valore: string; n: number }
export interface LetturaDelGiorno { data: string; voci: VoceLettura[]; note: Nota[] }

/**
 * Un valore del grafico come si scrive: da 1 in su come `formattaMedia` (al più due decimali); sotto 1 in valore assoluto
 * tre cifre significative, perché parametri come la conduttanza stomatica hanno valori di decimi e centesimi e un errore
 * standard di 0,004 non deve diventare «0». Sempre con la virgola, senza zeri inutili e mai in notazione scientifica.
 */
export function formattaDato(n: number): string {
  const assoluto = Math.abs(n)
  if (assoluto >= 1 || assoluto === 0 || !Number.isFinite(n)) return formattaMedia(n)
  const decimali = Math.min(20, 2 - Math.floor(Math.log10(assoluto)))
  const testo = n.toFixed(decimali).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
  return testo.replace('.', ',')
}

/** Il valore di un punto come si scrive: `41,2 ± 0,8`, senza ± quando non c'è errore standard; `62,5%` per i sì/no. */
export function valoreScritto(punto: { media: number; es: number | null }, scala: ScalaGrafico): string {
  if (scala === 'percentuale') return `${formattaDato(punto.media)}%`
  return punto.es === null ? formattaDato(punto.media) : `${formattaDato(punto.media)} ± ${formattaDato(punto.es)}`
}

/** Che cosa dire di una data: per ogni serie con un punto quel giorno `valore ± ES` e n, e le note segnate quel giorno. */
export function letturaDelGiorno(imp: Impaginazione, data: string): LetturaDelGiorno {
  return {
    data,
    voci: imp.serie.flatMap((s): VoceLettura[] => {
      const p = s.punti.find(x => x.data === data)
      return p ? [{ indice: s.indice, etichetta: s.etichetta, stile: s.stile, valore: valoreScritto(p, imp.scala), n: p.n }] : []
    }),
    note: imp.segni.find(s => s.data === data)?.note ?? [],
  }
}

/**
 * L'etichetta di `role="img"` del grafico: titolo, quante serie e quali, il periodo e l'ultimo valore di ciascuna. Un
 * lettore di schermo non vede il disegno: la tabella "Mostra i valori" resta l'alternativa completa.
 */
export function riassuntoGrafico(imp: Impaginazione, titolo: string): string {
  if (imp.vuoto) return `${titolo}. Nessun dato da disegnare.`
  const conPunti = imp.serie.filter(s => s.punti.length > 0)
  const date = [...new Set(conPunti.flatMap(s => s.punti.map(p => p.data)))].sort()
  const ultimi = conPunti.map(s => {
    const p = s.punti[s.punti.length - 1]
    return `${s.etichetta} ${formattaDato(p.media)}${imp.scala === 'percentuale' ? '%' : ''}`
  })
  const periodo = date[0] === date[date.length - 1]
    ? `Il ${formattaData(date[0])}`
    : `Dal ${formattaData(date[0])} al ${formattaData(date[date.length - 1])}`
  return `${titolo}. ${imp.serie.length} serie: ${imp.serie.map(s => s.etichetta).join(', ')}. `
    + `${periodo}. Ultimi valori: ${ultimi.join('; ')}.`
}
