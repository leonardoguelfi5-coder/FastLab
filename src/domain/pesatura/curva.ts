import { percentualeCC, pesoAPercentualeCC } from './calcoli'
import type { CampionePesatura, Peso, Sensore } from './tipi'

/**
 * La curva di ritenzione idrica dei vasi: la % della capacità di campo (y) in funzione della lettura del sensore (x).
 * `lineare` è y = a + b·x, `logaritmico` è y = a + b·ln|x|. Si adatta con i minimi quadrati, ed è tutto puro.
 */

export type ModelloCurva = 'lineare' | 'logaritmico'

export interface PuntoCurva {
  lettura: number
  pcc: number
}

/** `n` sono i punti usati nell'adattamento; `min` e `max` gli estremi delle letture usate (non dei loro logaritmi). */
export interface Curva {
  modello: ModelloCurva
  a: number
  b: number
  r2: number | null
  n: number
  min: number
  max: number
}

/** Un vaso con il peso secco e la capacità di campo della replica 1 e i punti dell'asciugatura, in ordine di tempo. */
export interface Vaso {
  campione: CampionePesatura
  secco: number | null
  cc: number | null
  punti: PuntoCurva[]
}

/** Il tensiometro ha una risposta che si appiattisce: per la tensione si usa il logaritmo. */
export const modelloPer = (s: Sensore): ModelloCurva => (s.tipo === 'tensione' ? 'logaritmico' : 'lineare')

const MINIMO_PUNTI = 3

/** Gli istanti si confrontano come date: le stringhe con fusi orari diversi non sono ordinabili alfabeticamente. */
const istante = (s: string): number => {
  const t = Date.parse(s)
  return Number.isNaN(t) ? 0 : t
}

export function vasiDaPesi(campioni: CampionePesatura[], pesi: Peso[]): Vaso[] {
  return campioni.map((campione) => {
    const suoi = pesi.filter((p) => p.campione_id === campione.id)
    const secco = suoi.find((p) => p.tipo === 'secco' && p.replica === 1)?.valore ?? null
    const cc = suoi.find((p) => p.tipo === 'capacita_campo' && p.replica === 1)?.valore ?? null
    const punti: PuntoCurva[] = []
    if (secco !== null && cc !== null) {
      const asciugature = suoi
        .filter((p) => p.tipo === 'asciugatura' && p.lettura !== null)
        .sort((x, y) => istante(x.misurato_il) - istante(y.misurato_il))
      for (const p of asciugature) {
        const pcc = percentualeCC(p.valore, secco, cc)
        // con una CC che non supera il secco la % non esiste: il punto non entra nella curva
        if (pcc !== null) punti.push({ lettura: p.lettura as number, pcc })
      }
    }
    return { campione, secco, cc, punti }
  })
}

/** La x che entra nella regressione: la lettura stessa o il logaritmo del suo valore assoluto. */
const trasforma = (modello: ModelloCurva, lettura: number): number =>
  modello === 'logaritmico' ? Math.log(Math.abs(lettura)) : lettura

export function adattaCurva(punti: PuntoCurva[], modello: ModelloCurva): Curva | null {
  const validi = punti.filter(
    (p) => Number.isFinite(p.lettura) && Number.isFinite(p.pcc) && !(modello === 'logaritmico' && p.lettura === 0),
  )
  const xs = validi.map((p) => trasforma(modello, p.lettura))
  // le x distinte si contano dopo la trasformazione: nel logaritmico −10 e 10 danno lo stesso punto
  if (new Set(xs).size < MINIMO_PUNTI) return null

  const n = validi.length
  const ys = validi.map((p) => p.pcc)
  const mediaX = xs.reduce((s, x) => s + x, 0) / n
  const mediaY = ys.reduce((s, y) => s + y, 0) / n
  let sxx = 0
  let sxy = 0
  let ssTot = 0
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mediaX) ** 2
    sxy += (xs[i] - mediaX) * (ys[i] - mediaY)
    ssTot += (ys[i] - mediaY) ** 2
  }
  const b = sxy / sxx
  const a = mediaY - b * mediaX
  let ssRes = 0
  for (let i = 0; i < n; i++) ssRes += (ys[i] - (a + b * xs[i])) ** 2

  const letture = validi.map((p) => p.lettura)
  return {
    modello,
    a,
    b,
    r2: ssTot === 0 ? null : 1 - ssRes / ssTot,
    n,
    min: Math.min(...letture),
    max: Math.max(...letture),
  }
}

/** La % CC che la curva prevede per una lettura. Nel logaritmico una lettura a zero dà un valore non finito. */
export function pccDaLettura(c: Curva, lettura: number): number {
  return c.a + c.b * trasforma(c.modello, lettura)
}

const MENO = '−'

/** Un numero con `decimali` cifre e la virgola, senza il segno (lo scrive chi chiama). */
const cifre = (n: number, decimali: number): string => Math.abs(n).toFixed(decimali).replace('.', ',')

/** È negativo solo se lo resta dopo l'arrotondamento: −0,04 si scrive 0,0, non −0,0. */
const negativo = (n: number, decimali: number): boolean => Number(n.toFixed(decimali)) < 0

/** Per esempio `%CC = 112,4 − 18,3 · ln(kPa)  (R² 0,97, n 14)`. La lettura si indica con l'unità del sensore. */
export function equazione(c: Curva, sensore: Sensore): string {
  const variabile = sensore.unita.trim() || 'lettura'
  const termine = c.modello === 'logaritmico' ? `ln(${variabile})` : variabile
  const a = `${negativo(c.a, 1) ? MENO : ''}${cifre(c.a, 1)}`
  const segnoB = negativo(c.b, 1) ? MENO : '+'
  const r2 = c.r2 === null ? '' : `R² ${cifre(c.r2, 2)}, `
  return `%CC = ${a} ${segnoB} ${cifre(c.b, 1)} · ${termine}  (${r2}n ${c.n})`
}

export interface CurveSubstrato {
  substrato: string
  vasi: Vaso[]
  media: Curva | null
}

export const SENZA_SUBSTRATO = 'Senza substrato'

const nomeSubstrato = (s: string | null): string => s?.trim() || SENZA_SUBSTRATO

/** I substrati nell'ordine in cui compaiono i vasi. La curva media si adatta a tutti i punti dei vasi messi insieme. */
export function curvePerSubstrato(vasi: Vaso[], modello: ModelloCurva): CurveSubstrato[] {
  const gruppi = new Map<string, Vaso[]>()
  for (const v of vasi) {
    const nome = nomeSubstrato(v.campione.substrato)
    const elenco = gruppi.get(nome)
    if (elenco) elenco.push(v)
    else gruppi.set(nome, [v])
  }
  return [...gruppi].map(([substrato, suoi]) => ({
    substrato,
    vasi: suoi,
    media: adattaCurva(
      suoi.flatMap((v) => v.punti),
      modello,
    ),
  }))
}

/** `vaso` è l'id del campione; l'ordine è quello di `CurveSubstrato.vasi`. */
export interface PesoTarget {
  vaso: string
  peso: number | null
  fuoriCampo: boolean
}

/** `fuoriCampo` è true se almeno uno dei pesi che fanno la media è estrapolato. */
export interface RispostaConsulta {
  substrato: string
  vasi: PesoTarget[]
  media: number | null
  fuoriCampo: boolean
}

function risposta(substrato: string, vasi: PesoTarget[]): RispostaConsulta {
  const pesi = vasi.flatMap((v) => (v.peso === null ? [] : [v.peso]))
  return {
    substrato,
    vasi,
    media: pesi.length === 0 ? null : pesi.reduce((s, p) => s + p, 0) / pesi.length,
    fuoriCampo: vasi.some((v) => v.fuoriCampo),
  }
}

/** Il peso del vaso a p % CC, oppure `null` se mancano secco o CC o se la CC non supera il secco (dati impossibili). */
function pesoDelVaso(v: Vaso, p: number): number | null {
  if (v.secco === null || v.cc === null || v.cc <= v.secco) return null
  const peso = pesoAPercentualeCC(p, v.secco, v.cc)
  return Number.isFinite(peso) ? peso : null
}

/** Il peso di ogni vaso a p % della sua capacità di campo: non dipende dalla curva, quindi non è mai fuori campo. */
export function consultaPerCC(gruppi: CurveSubstrato[], p: number): RispostaConsulta[] {
  return gruppi.map((g) =>
    risposta(
      g.substrato,
      g.vasi.map((v) => ({ vaso: v.campione.id, peso: pesoDelVaso(v, p), fuoriCampo: false })),
    ),
  )
}

/**
 * Il peso di ogni vaso a una lettura del sensore: la % CC viene dalla curva del vaso o, se il vaso non ne ha una, dalla
 * curva media del suo substrato. `fuoriCampo` segnala un peso estrapolato oltre le letture misurate da quella curva.
 */
export function consultaPerLettura(gruppi: CurveSubstrato[], lettura: number, modello: ModelloCurva): RispostaConsulta[] {
  return gruppi.map((g) =>
    risposta(
      g.substrato,
      g.vasi.map((v): PesoTarget => {
        const curva = adattaCurva(v.punti, modello) ?? g.media
        const peso = curva === null ? null : pesoDelVaso(v, pccDaLettura(curva, lettura))
        if (curva === null || peso === null) return { vaso: v.campione.id, peso: null, fuoriCampo: false }
        return { vaso: v.campione.id, peso, fuoriCampo: lettura < curva.min || lettura > curva.max }
      }),
    ),
  )
}

/** Le % CC della tabella già pronta sotto il riquadro di consultazione. */
export const PERCENTUALI_TABELLA = [100, 80, 60, 50, 40] as const
