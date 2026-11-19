import { arrotondaCifre, decimaliMassimi, formattaCifre } from '@/lib/numeri'
import { inGrammi, percentualeCC, pesoAPercentualeCC } from './calcoli'
import type { CampionePesatura, Peso, Sensore, UnitaPeso } from './tipi'

/**
 * La curva di ritenzione idrica dei vasi: la % della capacità di campo (y) in funzione della lettura del sensore (x).
 * `lineare` è y = a + b·x, con i minimi quadrati; `potenza` è y = a·h^b con h = |x|, con i minimi quadrati non lineari
 * sulle y (Levenberg–Marquardt, come `scipy.optimize.curve_fit`). È tutto puro.
 */

export type ModelloCurva = 'lineare' | 'potenza'

export interface PuntoCurva {
  lettura: number
  pcc: number
}

/** `n` sono i punti usati nell'adattamento; `min` e `max` gli estremi delle letture usate (nella potenza, di |lettura|). */
export interface Curva {
  modello: ModelloCurva
  a: number
  b: number
  r2: number | null
  n: number
  min: number
  max: number
}

/**
 * Un vaso con il peso secco e la capacità di campo della replica 1 e i punti della curva, in ordine di tempo: la CC al
 * 100 % (se ha la lettura) e poi l'asciugatura. `letturaCC` è la lettura alla CC: null nelle sessioni che non la chiedevano.
 */
export interface Vaso {
  campione: CampionePesatura
  secco: number | null
  cc: number | null
  letturaCC: number | null
  punti: PuntoCurva[]
}

/** Il tensiometro segue una legge di potenza, come nella taratura tensiometrica del substrato. */
export const modelloPer = (s: Sensore): ModelloCurva => (s.tipo === 'tensione' ? 'potenza' : 'lineare')

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
    const pesoCC = suoi.find((p) => p.tipo === 'capacita_campo' && p.replica === 1)
    const cc = pesoCC?.valore ?? null
    const letturaCC = pesoCC?.lettura ?? null
    const punti: PuntoCurva[] = []
    if (secco !== null && cc !== null) {
      // la capacità di campo è il 100 % per definizione, se la CC supera il secco (altrimenti la % non esiste)
      if (letturaCC !== null && cc > secco) punti.push({ lettura: letturaCC, pcc: 100 })
      const asciugature = suoi
        .filter((p) => p.tipo === 'asciugatura' && p.lettura !== null)
        .sort((x, y) => istante(x.misurato_il) - istante(y.misurato_il))
      for (const p of asciugature) {
        const pcc = percentualeCC(p.valore, secco, cc)
        // con una CC che non supera il secco la % non esiste: il punto non entra nella curva
        if (pcc !== null) punti.push({ lettura: p.lettura as number, pcc })
      }
    }
    return { campione, secco, cc, letturaCC, punti }
  })
}

/** La retta dei minimi quadrati y = a + b·x; null se le x distinte sono meno di due. */
function retta(xs: number[], ys: number[]): { a: number; b: number } | null {
  if (new Set(xs).size < 2) return null
  const n = xs.length
  const mediaX = xs.reduce((s, x) => s + x, 0) / n
  const mediaY = ys.reduce((s, y) => s + y, 0) / n
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mediaX) ** 2
    sxy += (xs[i] - mediaX) * (ys[i] - mediaY)
  }
  const b = sxy / sxx
  return { a: mediaY - b * mediaX, b }
}

/** R² = 1 − SSres/SStot sulle y misurate; null se le y sono tutte uguali. */
function rQuadro(ys: number[], ssRes: number): number | null {
  const mediaY = ys.reduce((s, y) => s + y, 0) / ys.length
  const ssTot = ys.reduce((s, y) => s + (y - mediaY) ** 2, 0)
  return ssTot === 0 ? null : 1 - ssRes / ssTot
}

function adattaLineare(punti: PuntoCurva[]): Curva | null {
  const validi = punti.filter((p) => Number.isFinite(p.lettura) && Number.isFinite(p.pcc))
  const xs = validi.map((p) => p.lettura)
  const ys = validi.map((p) => p.pcc)
  const r = new Set(xs).size < MINIMO_PUNTI ? null : retta(xs, ys)
  if (r === null) return null
  const { a, b } = r
  const ssRes = xs.reduce((s, x, i) => s + (ys[i] - (a + b * x)) ** 2, 0)
  return { modello: 'lineare', a, b, r2: rQuadro(ys, ssRes), n: validi.length, min: Math.min(...xs), max: Math.max(...xs) }
}

/** La somma dei quadrati dei residui di y = a·x^b. */
const sommaQuadrati = (xs: number[], ys: number[], a: number, b: number): number =>
  xs.reduce((s, x, i) => s + (ys[i] - a * x ** b) ** 2, 0)

const ITERAZIONI_MASSIME = 200
const TOLLERANZA = 1e-12
const LAMBDA_MASSIMO = 1e10

const finito = (a: number, b: number, ss: number): { a: number; b: number; ss: number } | null =>
  Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(ss) ? { a, b, ss } : null

/**
 * Levenberg–Marquardt su (a, b) per y = a·x^b, con x > 0: a ogni passo risolve (JᵀJ + λ·diag(JᵀJ))·δ = Jᵀr. Un passo che
 * riduce la somma dei quadrati si accetta e λ cala; uno che non la riduce si scarta e λ cresce. Converge quando la somma
 * cala di meno di `TOLLERANZA` in proporzione, oppure quando nemmeno un passo cortissimo la riduce più (λ oltre
 * `LAMBDA_MASSIMO`: è il minimo, alla precisione dei calcoli, come con i punti esatti). Se dopo `ITERAZIONI_MASSIME`
 * passi la somma sta ancora calando non converge (con dati a gradino a e b scappano verso l'infinito): null, come per un
 * risultato non finito.
 */
function levenbergMarquardt(xs: number[], ys: number[], a0: number, b0: number): { a: number; b: number; ss: number } | null {
  let a = a0
  let b = b0
  let ss = sommaQuadrati(xs, ys, a, b)
  let lambda = 1e-3
  for (let k = 0; k < ITERAZIONI_MASSIME; k++) {
    // JᵀJ = [[s11, s12], [s12, s22]] e Jᵀr = [g1, g2], con J_i = [x^b, a·x^b·ln x] e r_i = y − a·x^b
    let s11 = 0
    let s12 = 0
    let s22 = 0
    let g1 = 0
    let g2 = 0
    for (let i = 0; i < xs.length; i++) {
      const xAllaB = xs[i] ** b
      const ja = xAllaB
      const jb = a * xAllaB * Math.log(xs[i])
      const r = ys[i] - a * xAllaB
      s11 += ja * ja
      s12 += ja * jb
      s22 += jb * jb
      g1 += ja * r
      g2 += jb * r
    }
    const m11 = s11 * (1 + lambda)
    const m22 = s22 * (1 + lambda)
    const det = m11 * m22 - s12 * s12
    const da = (g1 * m22 - s12 * g2) / det
    const db = (m11 * g2 - s12 * g1) / det
    const nuova = sommaQuadrati(xs, ys, a + da, b + db)
    // con un sistema singolare la nuova somma non è un numero: il confronto è falso e il passo si scarta
    if (nuova < ss) {
      const calo = (ss - nuova) / ss
      a += da
      b += db
      ss = nuova
      lambda /= 10
      if (calo < TOLLERANZA) return finito(a, b, ss)
    } else {
      lambda *= 10
      if (lambda > LAMBDA_MASSIMO) return finito(a, b, ss)
    }
  }
  return null
}

function adattaPotenza(punti: PuntoCurva[]): Curva | null {
  // la potenza non è definita a h = 0: quei punti non entrano
  const validi = punti
    .filter((p) => Number.isFinite(p.lettura) && Number.isFinite(p.pcc))
    .map((p) => ({ h: Math.abs(p.lettura), y: p.pcc }))
    .filter((p) => p.h > 0)
  const hs = validi.map((p) => p.h)
  // le h distinte si contano in valore assoluto: −10 e 10 danno lo stesso punto
  if (new Set(hs).size < MINIMO_PUNTI) return null
  const ys = validi.map((p) => p.y)

  // la partenza: la retta di ln y su ln h (la linea di tendenza "potenza" di Excel), sui soli punti con y > 0
  const positivi = validi.filter((p) => p.y > 0)
  const partenza = retta(positivi.map((p) => Math.log(p.h)), positivi.map((p) => Math.log(p.y)))
  if (partenza === null) return null
  const finale = levenbergMarquardt(hs, ys, Math.exp(partenza.a), partenza.b)
  // con a ≤ 0 la curva darebbe WC ≤ 0 a ogni h: non è una curva di ritenzione (e la media geometrica non esisterebbe)
  if (finale === null || finale.a <= 0) return null

  return {
    modello: 'potenza', a: finale.a, b: finale.b, r2: rQuadro(ys, finale.ss), n: validi.length, min: Math.min(...hs), max: Math.max(...hs),
  }
}

export function adattaCurva(punti: PuntoCurva[], modello: ModelloCurva): Curva | null {
  return modello === 'potenza' ? adattaPotenza(punti) : adattaLineare(punti)
}

/** La % CC che la curva prevede per una lettura. Nella potenza una lettura a zero dà un valore non finito. */
export function pccDaLettura(c: Curva, lettura: number): number {
  return c.modello === 'potenza' ? c.a * Math.abs(lettura) ** c.b : c.a + c.b * lettura
}

/** La lettura a cui la curva dà `pcc` (nella potenza, |h|); null se non esiste. Con 100 è la lettura a CC della curva. */
export function letturaAPercentuale(c: Curva, pcc: number): number | null {
  if (c.b === 0) return null
  if (c.modello === 'lineare') return (pcc - c.a) / c.b
  return pcc / c.a <= 0 ? null : (pcc / c.a) ** (1 / c.b)
}

const mediaDi = (valori: number[]): number => valori.reduce((s, v) => s + v, 0) / valori.length

/**
 * La curva media dei vasi. Nella potenza si media in scala logaritmica: a ogni h, ln WC medio = media(ln a) + media(b)·ln h,
 * quindi a è la media geometrica degli a (e^media(ln a); sono sempre > 0, `adattaPotenza` scarta le curve con a ≤ 0).
 * Nella retta a (l'intercetta q, anche negativa) e b (la pendenza m) sono medie aritmetiche. In tutte e due b è la media
 * dei b, R² la media degli R², n la somma, min e max gli estremi.
 */
export function mediaDeiParametri(curve: Curva[]): Curva | null {
  if (curve.length === 0) return null
  const r2 = curve.flatMap((c) => (c.r2 === null ? [] : [c.r2]))
  return {
    modello: curve[0].modello,
    a: curve[0].modello === 'potenza' ? Math.exp(mediaDi(curve.map((c) => Math.log(c.a)))) : mediaDi(curve.map((c) => c.a)),
    b: mediaDi(curve.map((c) => c.b)),
    r2: r2.length === 0 ? null : mediaDi(r2),
    n: curve.reduce((s, c) => s + c.n, 0),
    min: Math.min(...curve.map((c) => c.min)),
    max: Math.max(...curve.map((c) => c.max)),
  }
}

const MENO = '−'

/** Un numero con `decimali` cifre e la virgola, senza il segno (lo scrive chi chiama). */
const cifre = (n: number, decimali: number): string => Math.abs(n).toFixed(decimali).replace('.', ',')

/** È negativo solo se lo resta dopo l'arrotondamento: −0,04 si scrive 0,0, non −0,0. */
const negativo = (n: number, decimali: number): boolean => Number(n.toFixed(decimali)) < 0

/** Un numero con `decimali` cifre, la virgola e il segno meno se serve. */
export const conSegno = (n: number, decimali: number): string => `${negativo(n, decimali) ? MENO : ''}${cifre(n, decimali)}`

/** Un numero con `cifre` cifre significative, la virgola e il segno meno se serve (−0,5000; 2,178; −17,31). */
export const conCifre = (n: number, cifre: number): string => `${arrotondaCifre(n, cifre) < 0 ? MENO : ''}${formattaCifre(Math.abs(n), cifre)}`

/**
 * Per esempio `WC = 649,17 · h^−0,6033  (h in hPa; R² 0,966, n 5)` per la potenza, con a a 2 decimali, b a 4 ed R² a 3;
 * `%CC = 2,178 · TDR − 17,31  (R² 0,999, n 5)` per la retta del TDR, con m e q a 4 cifre significative ed R² a 3 decimali.
 */
export function equazione(c: Curva, sensore: Sensore): string {
  const unita = sensore.unita.trim()
  const r2 = c.r2 === null ? '' : `R² ${conSegno(c.r2, 3)}, `
  if (c.modello === 'potenza') {
    return `WC = ${conSegno(c.a, 2)} · h^${conSegno(c.b, 4)}  (${unita ? `h in ${unita}; ` : ''}${r2}n ${c.n})`
  }
  const variabile = sensore.tipo === 'tdr' ? 'TDR' : unita || 'lettura'
  const segnoQ = arrotondaCifre(c.a, 4) < 0 ? MENO : '+'
  return `%CC = ${conCifre(c.b, 4)} · ${variabile} ${segnoQ} ${formattaCifre(Math.abs(c.a), 4)}  (${r2}n ${c.n})`
}

/** `curve[i]` è la curva del vaso `vasi[i]`, null se il vaso non ne ha una. */
export interface CurveSubstrato {
  substrato: string
  vasi: Vaso[]
  curve: (Curva | null)[]
  media: Curva | null
  /** Il modello con cui sono state adattate le curve: vale anche quando nessun vaso ne ha una. */
  modello: ModelloCurva
}

export const SENZA_SUBSTRATO = 'Senza substrato'

const nomeSubstrato = (s: string | null): string => s?.trim() || SENZA_SUBSTRATO

/**
 * I substrati nell'ordine in cui compaiono i vasi, con la curva di ogni vaso. La curva media, nella potenza come nella
 * retta, è la media dei parametri dei vasi che hanno una curva (`mediaDeiParametri`).
 */
export function curvePerSubstrato(vasi: Vaso[], modello: ModelloCurva): CurveSubstrato[] {
  const gruppi = new Map<string, Vaso[]>()
  for (const v of vasi) {
    const nome = nomeSubstrato(v.campione.substrato)
    const elenco = gruppi.get(nome)
    if (elenco) elenco.push(v)
    else gruppi.set(nome, [v])
  }
  return [...gruppi].map(([substrato, suoi]) => {
    const curve = suoi.map((v) => adattaCurva(v.punti, modello))
    return {
      substrato,
      vasi: suoi,
      curve,
      modello,
      media: mediaDeiParametri(curve.filter((c): c is Curva => c !== null)),
    }
  })
}

/**
 * Una riga della tabella dei parametri. `letturaCCCurva` è la lettura a cui la curva dà il 100 %, `letturaCCMisurata`
 * quella letta alla CC (nella potenza tutte e due sono |h|). Un vaso senza curva ha a, b, R² e lettura dalla curva null
 * e come `n` i suoi punti.
 */
export interface RigaParametri {
  nome: string
  a: number | null
  b: number | null
  r2: number | null
  n: number
  letturaCCCurva: number | null
  letturaCCMisurata: number | null
  media: boolean
}

/** Le due intestazioni delle colonne "lettura a CC" della tabella dei parametri (app ed Excel): con l'unità del sensore. */
export function intestazioniLetturaCC(sensore: Sensore): { curva: string; misurato: string } {
  const unita = sensore.unita.trim()
  const potenza = sensore.tipo === 'tensione'
  const colonna = (come: string) => `${potenza ? 'h' : 'TDR'} a CC, ${come}${unita ? ` (${unita})` : ''}`
  return potenza ? { curva: colonna('curva'), misurato: colonna('misurato') } : { curva: colonna('retta'), misurato: colonna('misurata') }
}

/** Una riga per vaso, poi la "Curva media" se il substrato ne ha una (senza lettura misurata: non c'è un vaso medio). */
export function parametriDelSubstrato(g: CurveSubstrato): RigaParametri[] {
  const potenza = g.modello === 'potenza'
  const righe = g.vasi.map((v, i): RigaParametri => {
    const c = g.curve[i]
    const misurata = v.letturaCC === null ? null : potenza ? Math.abs(v.letturaCC) : v.letturaCC
    return {
      nome: v.campione.nome?.trim() || v.campione.id,
      a: c?.a ?? null,
      b: c?.b ?? null,
      r2: c?.r2 ?? null,
      n: c?.n ?? v.punti.length,
      letturaCCCurva: c ? letturaAPercentuale(c, 100) : null,
      letturaCCMisurata: misurata,
      media: false,
    }
  })
  if (g.media === null) return righe
  const m = g.media
  return [
    ...righe,
    { nome: 'Curva media', a: m.a, b: m.b, r2: m.r2, n: m.n, letturaCCCurva: letturaAPercentuale(m, 100), letturaCCMisurata: null, media: true },
  ]
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
 * curva media del suo substrato. `fuoriCampo` segnala un peso estrapolato oltre le letture misurate da quella curva
 * (nella potenza si confronta |lettura|, come le letture della curva).
 */
export function consultaPerLettura(gruppi: CurveSubstrato[], lettura: number): RispostaConsulta[] {
  return gruppi.map((g) =>
    risposta(
      g.substrato,
      g.vasi.map((v, i): PesoTarget => {
        const curva = g.curve[i] ?? g.media
        const peso = curva === null ? null : pesoDelVaso(v, pccDaLettura(curva, lettura))
        if (curva === null || peso === null) return { vaso: v.campione.id, peso: null, fuoriCampo: false }
        const x = curva.modello === 'potenza' ? Math.abs(lettura) : lettura
        return { vaso: v.campione.id, peso, fuoriCampo: x < curva.min || x > curva.max }
      }),
    ),
  )
}

/** Le % CC della tabella già pronta sotto il riquadro di consultazione. */
export const PERCENTUALI_TABELLA = [100, 80, 60, 50, 40] as const

/** `deficit` è la CC meno il peso target: l'acqua da togliere al vaso saturo per arrivare alla soglia. */
export interface SogliaVaso {
  vaso: string
  pesoTarget: number | null
  deficit: number | null
}

/**
 * La soglia al `pcc` % della CC: la lettura dalla retta media e, per ogni vaso, il peso target e il deficit d'acqua.
 * `fuoriCampo` dice che la lettura target cade oltre le letture misurate dalla retta media (è estrapolata).
 */
export interface Soglia {
  pcc: number
  letturaTarget: number | null
  fuoriCampo: boolean
  vasi: SogliaVaso[]
  pesoMedio: number | null
  deficitMedio: number | null
}

const mediaOpzionale = (valori: (number | null)[]): number | null => {
  const presenti = valori.flatMap((v) => (v === null ? [] : [v]))
  return presenti.length === 0 ? null : mediaDi(presenti)
}

/**
 * La lettura target viene dalla curva media; peso e deficit sono del vaso (suo secco, sua CC) e si mediano sui vasi che
 * li hanno. `letturaTarget` è null senza curva media o se la pendenza è nulla o il risultato non è finito.
 */
export function sogliaDelSubstrato(g: CurveSubstrato, pcc: number): Soglia {
  const lettura = g.media === null ? null : letturaAPercentuale(g.media, pcc)
  const vasi = g.vasi.map((v): SogliaVaso => {
    const pesoTarget = pesoDelVaso(v, pcc)
    return { vaso: v.campione.id, pesoTarget, deficit: pesoTarget === null || v.cc === null ? null : v.cc - pesoTarget }
  })
  const letturaTarget = lettura !== null && Number.isFinite(lettura) ? lettura : null
  return {
    pcc,
    letturaTarget,
    fuoriCampo: letturaTarget !== null && g.media !== null && (letturaTarget < g.media.min || letturaTarget > g.media.max),
    vasi,
    pesoMedio: mediaOpzionale(vasi.map((v) => v.pesoTarget)),
    deficitMedio: mediaOpzionale(vasi.map((v) => v.deficit)),
  }
}

/** Il deficit d'acqua: se il peso è in grammi (o mg, kg) è acqua, 1 g = 1 mL; altrimenti resta nell'unità della sessione. */
export function deficitInMl(deficit: number, unita: UnitaPeso): { valore: number; unita: string } {
  const grammi = inGrammi(deficit, unita)
  return grammi === null ? { valore: deficit, unita } : { valore: grammi, unita: 'mL' }
}

/** I decimali del TDR target: quelli delle letture misurate più uno (minimo 1), perché la retta ne ricava un valore più fine. */
export function decimaliLetturaTarget(gruppi: CurveSubstrato[]): number {
  const letture = gruppi.flatMap((g) =>
    g.vasi.flatMap((v) => [...v.punti.map((p) => p.lettura), ...(v.letturaCC === null ? [] : [v.letturaCC])]),
  )
  return Math.max(1, decimaliMassimi(letture) + 1)
}

/** I decimali del deficit: quelli dei pesi, spostati dell'ordine di grandezza se il deficit è convertito in mL (kg → g, mg → g). */
export function decimaliDeficit(decimaliPesi: number, unita: UnitaPeso): number {
  const fattore = inGrammi(1, unita)
  return fattore === null ? decimaliPesi : Math.max(0, decimaliPesi - Math.round(Math.log10(fattore)))
}
