import type { BozzaEsperimento } from '@/domain/tipi'
import { righeDaBozza, type RigaTrattamento } from './righeTrattamenti'

/** Lo stato di lavoro della procedura guidata. */
export interface Lavoro {
  bozza: BozzaEsperimento
  righe: RigaTrattamento[]
  /** Impronta della bozza di partenza: se quella attuale è diversa, ci sono modifiche da non perdere. */
  iniziale: string
  /** Si è già provato a creare l'esperimento con questa bozza (la risposta può essersi persa per strada). */
  tentato: boolean
}

export function impronta(bozza: BozzaEsperimento, righe: RigaTrattamento[]): string {
  return JSON.stringify({ bozza, righe })
}

/** Lavoro che parte da una bozza (vuota, modello o copia), senza modifiche. */
export function nuovoLavoro(bozza: BozzaEsperimento): Lavoro {
  const righe = righeDaBozza(bozza)
  return { bozza, righe, iniziale: impronta(bozza, righe), tentato: false }
}

export function modificato(l: Lavoro): boolean {
  return impronta(l.bozza, l.righe) !== l.iniziale
}

/**
 * Chiave in sessionStorage: per utente (chi accede dopo sulla stessa scheda non vede la bozza di un altro)
 * e per modo di partenza (`nuovo`, `hydrochar`, `da:<id>`).
 */
export function chiaveBozza(utente: string, modo: string): string {
  return `fastlab:bozza:${utente}:${modo}`
}

// 2: la bozza porta `strumenti` (con tipo e archiviato) al posto della forma del Piano 1, che non si rilegge.
const VERSIONE = 2

// Se lo storage non c'è o è pieno la procedura funziona lo stesso: la bozza resta solo in memoria.
export function salvaBozza(chiave: string, l: Lavoro): void {
  try {
    sessionStorage.setItem(chiave, JSON.stringify({ versione: VERSIONE, ...l }))
  } catch { /* storage non disponibile */ }
}

export function rimuoviBozza(chiave: string): void {
  try {
    sessionStorage.removeItem(chiave)
  } catch { /* storage non disponibile */ }
}

function bozzaValida(b: unknown): b is BozzaEsperimento {
  if (typeof b !== 'object' || b === null) return false
  const o = b as Record<string, unknown>
  return typeof o.esperimento === 'object' && o.esperimento !== null
    && ['fattori', 'trattamenti', 'piante', 'parametri', 'strumenti'].every(k => Array.isArray(o[k]))
}

/** La bozza salvata, oppure null se non c'è o non è leggibile (es. salvata da una versione diversa dell'app). */
export function leggiBozza(chiave: string): Lavoro | null {
  try {
    const testo = sessionStorage.getItem(chiave)
    if (!testo) return null
    const d = JSON.parse(testo) as Record<string, unknown>
    if (d.versione !== VERSIONE || !bozzaValida(d.bozza) || !Array.isArray(d.righe) || typeof d.iniziale !== 'string') return null
    return { bozza: d.bozza, righe: d.righe as RigaTrattamento[], iniziale: d.iniziale, tentato: d.tentato === true }
  } catch {
    return null
  }
}
