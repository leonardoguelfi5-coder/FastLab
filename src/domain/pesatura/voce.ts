import { formattaNumero } from '@/lib/numeri'
import type { UnitaPeso } from './tipi'

/**
 * La dettatura a voce della Pesata: dal testo riconosciuto (in `it-IT`) al numero e al comando. Un numero ambiguo o
 * parziale ("zero virgola", "cinquanta tre") non si legge: meglio un bip e ripetere che salvare un numero inventato.
 */

const UNITA = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove']
const DIECI_DICIANNOVE = [
  'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove',
]
const DECINE = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta']

/** I modi di scrivere un numero da 1 a 99: "ventuno" e "ventotto" perdono la vocale delle decine. */
function sotto100(n: number): string[] {
  if (n < 10) return [UNITA[n]]
  if (n < 20) return [DIECI_DICIANNOVE[n - 10]]
  const decina = DECINE[Math.floor(n / 10)]
  const u = n % 10
  if (u === 0) return [decina]
  if (u === 1 || u === 8) return [decina.slice(0, -1) + UNITA[u]]
  return [decina + UNITA[u]]
}

/** Da 1 a 999. Davanti a "otto" e "ottanta" cento si elide ("centotto") ma si accetta anche intero ("centootto"). */
function sotto1000(n: number): string[] {
  if (n < 100) return sotto100(n)
  const centinaia = Math.floor(n / 100)
  const resto = n % 100
  const cento = centinaia === 1 ? 'cento' : `${UNITA[centinaia]}cento`
  if (resto === 0) return [cento]
  return sotto100(resto).flatMap(r => (r.startsWith('ott') ? [cento.slice(0, -1) + r, cento + r] : [cento + r]))
}

/** Da 1 a 9999: "mille…", "duemila…". */
function sotto10000(n: number): string[] {
  if (n < 1000) return sotto1000(n)
  const migliaia = Math.floor(n / 1000)
  const resto = n % 1000
  const mille = migliaia === 1 ? 'mille' : `${UNITA[migliaia]}mila`
  return resto === 0 ? [mille] : sotto1000(resto).map(r => mille + r)
}

let parole: Map<string, number> | null = null

/** Le parole da zero a novemilanovecentonovantanove, senza accenti. Si costruiscono alla prima dettatura. */
function paroleNumeri(): Map<string, number> {
  if (!parole) {
    parole = new Map([['zero', 0]])
    for (let n = 1; n < 10_000; n++) for (const p of sotto10000(n)) parole.set(p, n)
  }
  return parole
}

/** Minuscole, senza accenti ("cinquantatré" → "cinquantatre", "umidità" → "umidita"), divise sugli spazi. */
function parti(testo: string): string[] {
  const pulito = testo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  return pulito === '' ? [] : pulito.split(/\s+/)
}

const CIFRE = /^\d+$/
// "2.350", "1.234.567": il punto separa le migliaia solo con gruppi di esattamente tre cifre e senza uno zero davanti.
const MIGLIAIA = /^[1-9]\d{0,2}(\.\d{3})+$/
const DECIMALE = /^\d+[.,]\d+$/

/** Un numero intero detto in una parola sola ("cinquantatre") o scritto in cifre ("53"). */
function intero(parola: string): number | null {
  if (CIFRE.test(parola)) return Number(parola)
  return paroleNumeri().get(parola) ?? null
}

/** Un numero scritto in cifre dal riconoscimento: "53", "0,12", "0.12", "2.350". */
function cifre(parola: string): number | null {
  if (CIFRE.test(parola)) return Number(parola)
  if (MIGLIAIA.test(parola)) return Number(parola.replaceAll('.', ''))
  if (DECIMALE.test(parola)) return Number(parola.replace(',', '.'))
  return null
}

/** Le cifre dopo "virgola": una cifra per parola ("uno due" → "12") oppure un numero intero ("dodici" → "12"). */
function decimali(dopo: string[]): string | null {
  if (dopo.length === 0) return null
  if (dopo.length === 1) {
    const n = intero(dopo[0])
    return n === null ? null : CIFRE.test(dopo[0]) ? dopo[0] : String(n)
  }
  let risultato = ''
  for (const p of dopo) {
    const n = intero(p)
    if (n === null || n > 9 || (CIFRE.test(p) && p.length !== 1)) return null
    risultato += String(n)
  }
  return risultato
}

function senzaSegno(p: string[]): number | null {
  if (p.length === 0) return null
  const virgola = p.indexOf('virgola')
  if (virgola === -1) {
    if (p.length !== 1) return null
    return cifre(p[0]) ?? intero(p[0])
  }
  // Prima della virgola un numero solo, dopo le sue cifre.
  if (virgola !== 1) return null
  const parteIntera = intero(p[0])
  const parteDecimale = decimali(p.slice(2))
  if (parteIntera === null || parteDecimale === null) return null
  return Number(`${parteIntera}.${parteDecimale}`)
}

function numero(p: string[]): number | null {
  if (p[0] === 'meno') {
    const n = senzaSegno(p.slice(1))
    return n === null ? null : -n
  }
  if (p.length === 1 && p[0].startsWith('-')) {
    const n = senzaSegno([p[0].slice(1)])
    return n === null ? null : -n
  }
  return senzaSegno(p)
}

/**
 * Il numero di una frase: cifre come le scrive il riconoscimento ("53", "0,12", "2.350"), parole da zero a
 * novemilanovecentonovantanove, "virgola" per i decimali e "meno" davanti. Null se non è un numero solo e intero.
 */
export function leggiNumeroParlato(testo: string): number | null {
  return numero(parti(testo))
}

export type Comando =
  | { tipo: 'avanti'; valore: number; lettura: number | null }
  | { tipo: 'indietro' }
  | { tipo: 'non_capito' }

const NON_CAPITO: Comando = { tipo: 'non_capito' }
const NOMI_LETTURA = ['umidita', 'tensione']

/**
 * Il comando di una frase: "indietro" ovunque, "<numero> avanti" e, con la lettura del sensore (asciugatura),
 * "peso <numero> <umidità|tensione> <numero> avanti". Tutto il resto non è capito. Il peso non è mai negativo.
 */
export function leggiComando(testo: string, conLettura: boolean): Comando {
  const p = parti(testo.replace(/[.!?]+\s*$/, ''))
  if (p.includes('indietro')) return { tipo: 'indietro' }
  if (p.length < 2 || p[p.length - 1] !== 'avanti') return NON_CAPITO
  const prima = p.slice(0, -1)
  let valore: number | null
  let lettura: number | null = null
  if (conLettura) {
    if (prima[0] !== 'peso') return NON_CAPITO
    const nomi = prima.flatMap((x, i) => (NOMI_LETTURA.includes(x) ? [i] : []))
    if (nomi.length !== 1) return NON_CAPITO
    valore = numero(prima.slice(1, nomi[0]))
    lettura = numero(prima.slice(nomi[0] + 1))
    if (lettura === null) return NON_CAPITO
  } else {
    valore = numero(prima)
  }
  if (valore === null || valore < 0) return NON_CAPITO
  return { tipo: 'avanti', valore, lettura }
}

/**
 * La conferma detta dopo un salvataggio: "53 salvato, prossimo P12" oppure "53 salvato, pesata finita". L'unità non
 * si dice (è quella della sessione, già sullo schermo): la frase resta breve tra un campione e l'altro.
 */
export function fraseSalvato(valore: number, _unita: UnitaPeso, prossimo: string | null): string {
  return `${formattaNumero(valore)} salvato, ${prossimo === null ? 'pesata finita' : `prossimo ${prossimo}`}`
}
