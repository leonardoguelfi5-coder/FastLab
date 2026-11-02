import { nomeSicuro } from '../archivioFoto'
import type { Cartella } from './fogli'

/**
 * Il riepilogo di Esporta ("Il file conterrà:") e il nome del file. Tutto viene dalla cartella di `costruisciCartella`,
 * la stessa che lo scrittore trasforma nel file: i conteggi del riepilogo sono quelli del file per costruzione.
 */

export interface VoceRiepilogo {
  foglio: string
  /** Righe di dati senza l'intestazione; per Grafici le immagini; per Diario le note; per Info le righe del foglio. */
  quante: number
  cosa: 'righe' | 'immagini' | 'note' | 'configurazione'
}

/** Una voce per foglio, nell'ordine dei fogli. */
export function riepilogoCartella(cartella: Cartella): VoceRiepilogo[] {
  return cartella.fogli.map((f): VoceRiepilogo => {
    switch (f.tipo) {
      case 'grafici': return { foglio: f.nome, quante: cartella.grafici.length, cosa: 'immagini' }
      case 'diario': return { foglio: f.nome, quante: f.righe.length, cosa: 'note' }
      case 'info': return { foglio: f.nome, quante: f.righe.length, cosa: 'configurazione' }
      default: return { foglio: f.nome, quante: f.righe.length, cosa: 'righe' }
    }
  })
}

/**
 * Un numero intero con il punto delle migliaia italiano: `3.584`. Non `toLocaleString('it-IT')`, che sotto le 10 000
 * non raggruppa (`3584`) e cambierebbe con il browser.
 */
export function migliaia(n: number): string {
  const segno = n < 0 ? '-' : ''
  return segno + String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

const PAROLE: Record<Exclude<VoceRiepilogo['cosa'], 'configurazione'>, [string, string]> = {
  righe: ['riga', 'righe'], immagini: ['immagine', 'immagini'], note: ['nota', 'note'],
}

/**
 * Le righe del riepilogo (`Dati: 896 righe`, `Misure: 3.584 righe`, `Grafici: 6 immagini`, `Diario: 12 note`, `Info`)
 * e la riga dei contenuti: gli strumenti, con i parametri tra parentesi quando sono più di uno
 * (`SPAD, Ciras (A, gs, E, Ci)`).
 */
export function testoRiepilogo(cartella: Cartella): { fogli: string[]; contenuti: string } {
  const fogli = riepilogoCartella(cartella).map(v => {
    if (v.cosa === 'configurazione') return v.foglio
    const [uno, molti] = PAROLE[v.cosa]
    return `${v.foglio}: ${migliaia(v.quante)} ${v.quante === 1 ? uno : molti}`
  })
  const contenuti = cartella.strumenti
    .map(s => (s.parametri.length > 1 ? `${s.nome} (${s.parametri.join(', ')})` : s.nome))
    .join(', ')
  return { fogli, contenuti }
}

/** Il nome del file: `FastLab_<nome sicuro dell'esperimento>_<AAAA-MM-GG>.xlsx`, con `nomeSicuro` del Piano C. */
export function nomeFileExcel(nomeEsperimento: string, oggi: string): string {
  return `FastLab_${nomeSicuro(nomeEsperimento) || 'esperimento'}_${oggi}.xlsx`
}
