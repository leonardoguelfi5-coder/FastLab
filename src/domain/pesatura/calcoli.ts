import type { TipoAnalisi, TipoPeso, UnitaPeso } from './tipi'

/**
 * Le formule della Pesatura, tutte pure. Chi non può calcolare un valore (divisione per zero o dati incoerenti) riceve
 * `null`, mai `NaN` né `Infinity`: l'interfaccia mostra un trattino invece di un numero sbagliato.
 */

/** Porta un peso in grammi: il rapporto del tampone è in mL per g, quindi il calcolo parte sempre dai grammi. */
export function inGrammi(valore: number, unita: UnitaPeso): number {
  return unita === 'mg' ? valore / 1000 : valore
}

/** I mL di tampone da aggiungere a un'aliquota: peso in g × rapporto (mL/g). `null` se il rapporto non è impostato. */
export function mlTampone(valore: number, unita: UnitaPeso, rapporto: number | null): number | null {
  if (rapporto === null) return null
  return inGrammi(valore, unita) * rapporto
}

/** RWC % = (fresco − secco) / (turgido − secco) × 100. `null` se turgido e secco non differiscono (o sono invertiti). */
export function rwc(fresco: number, turgido: number, secco: number): number | null {
  const denominatore = turgido - secco
  if (denominatore <= 0) return null
  return ((fresco - secco) / denominatore) * 100
}

/** Sostanza secca % = secco / fresco × 100. `null` se il fresco non è positivo. */
export function sostanzaSecca(fresco: number, secco: number): number | null {
  if (fresco <= 0) return null
  return (secco / fresco) * 100
}

/** % della capacità di campo = (peso − secco) / (CC − secco) × 100. `null` se la CC non supera il secco. */
export function percentualeCC(peso: number, secco: number, cc: number): number | null {
  const denominatore = cc - secco
  if (denominatore <= 0) return null
  return ((peso - secco) / denominatore) * 100
}

/** L'inverso di `percentualeCC`: il peso del vaso a p % di CC = secco + p/100 × (CC − secco). */
export function pesoAPercentualeCC(p: number, secco: number, cc: number): number {
  return secco + (p / 100) * (cc - secco)
}

/**
 * Le incoerenze fra i pesi di una replica. Si confrontano solo le coppie di cui ci sono entrambi i valori, così si può
 * controllare mentre la replica è ancora incompleta.
 */
export function controllaReplica(tipo: TipoAnalisi, pesi: Partial<Record<TipoPeso, number>>): string[] {
  const { fresco, turgido, secco, capacita_campo: cc } = pesi
  const messaggi: string[] = []
  if (tipo === 'rwc' || tipo === 'sostanza_secca') {
    if (fresco !== undefined && secco !== undefined && secco > fresco) messaggi.push('Il peso secco è maggiore del fresco.')
  }
  if (tipo === 'rwc') {
    if (fresco !== undefined && turgido !== undefined && turgido < fresco) messaggi.push('Il peso turgido è minore del fresco.')
    if (turgido !== undefined && secco !== undefined && secco > turgido) messaggi.push('Il peso secco è maggiore del turgido.')
  }
  if (tipo === 'vasi') {
    if (secco !== undefined && cc !== undefined && cc <= secco) {
      messaggi.push('La capacità di campo deve essere maggiore del peso secco.')
    }
  }
  return messaggi
}

/** Un vaso in asciugatura non può pesare meno del suo peso secco. */
export function controllaAsciugatura(peso: number, secco: number): string | null {
  return peso < secco ? 'Il vaso pesa meno del peso secco.' : null
}
