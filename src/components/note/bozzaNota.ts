import { conScrittaIl, PREFISSO_BOZZE } from '@/components/scheda/bozza'
import type { StatoNota } from './statoNota'

/**
 * Una nota del Diario non ancora salvata, nel localStorage del browser, come le bozze delle misure: serve quando si
 * esce senza passare dall'app (gesto indietro del telefono, ricarica, app chiusa) e si cancella dopo un salvataggio
 * riuscito o quando si sceglie di scartarla. Le chiavi iniziano con `PREFISSO_BOZZE`, quindi cambiando utente vanno via
 * insieme alle altre bozze; porta `scritta_il` e dopo 14 giorni senza modifiche la toglie `pulisciBozzeVecchie`.
 */
export interface BozzaNota {
  /** L'id con cui la nota si salva: lo stesso anche dopo la ripresa, così un tentativo già arrivato al server non si duplica. */
  id: string
  /** Era la modifica di una nota già salvata (e non una nota nuova). */
  esistente: boolean
  stato: StatoNota
}

/** `fastlab-bozza:nota:<espId>:<id>` (Piano C, Task C3). */
export const chiaveBozzaNota = (espId: string, id: string): string => `${PREFISSO_BOZZE}nota:${espId}:${id}`

/**
 * Dove si ricorda quale nota era aperta nel Diario di un esperimento: riaprendo la pagina si riprende da lì. Se cambia
 * la forma di questa chiave o di `chiaveBozzaNota`, va cambiata anche `bozzaDelRicordo` in `scheda/bozza.ts`.
 */
const chiaveNotaAperta = (espId: string): string => `${PREFISSO_BOZZE}nota-aperta:${espId}`

const eOggetto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const eElencoDiTesti = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string')

function eStato(s: unknown): s is StatoNota {
  return eOggetto(s)
    && typeof s.testo === 'string' && typeof s.data === 'string'
    && (s.collegamento === 'esperimento' || s.collegamento === 'trattamenti' || s.collegamento === 'piante')
    && eElencoDiTesti(s.trattamento_ids) && eElencoDiTesti(s.pianta_ids)
    && typeof s.promemoria === 'boolean' && typeof s.promemoriaAMano === 'boolean'
}

/** La bozza di quella nota, o `null` se non c'è, è rovinata o il localStorage non si può leggere. */
export function leggiBozzaNota(espId: string, id: string): BozzaNota | null {
  try {
    const testo = localStorage.getItem(chiaveBozzaNota(espId, id))
    if (!testo) return null
    const b: unknown = JSON.parse(testo)
    if (!eOggetto(b) || b.id !== id || typeof b.esistente !== 'boolean' || !eStato(b.stato)) return null
    return { id, esistente: b.esistente, stato: b.stato }
  } catch {
    return null
  }
}

/** Scrive la bozza e ricorda che quella nota è aperta; senza localStorage non fa nulla (resta solo nell'editor). */
export function scriviBozzaNota(espId: string, b: BozzaNota): void {
  try {
    localStorage.setItem(chiaveBozzaNota(espId, b.id), JSON.stringify(conScrittaIl(b)))
    localStorage.setItem(chiaveNotaAperta(espId), b.id)
  } catch { /* resta solo nell'editor */ }
}

/** Toglie la bozza e, se era quella la nota aperta, anche il ricordo. */
export function cancellaBozzaNota(espId: string, id: string): void {
  try {
    localStorage.removeItem(chiaveBozzaNota(espId, id))
    if (localStorage.getItem(chiaveNotaAperta(espId)) === id) localStorage.removeItem(chiaveNotaAperta(espId))
  } catch { /* niente da togliere */ }
}

/** L'id della nota che era aperta con una bozza, o `null`. */
export function notaAperta(espId: string): string | null {
  try { return localStorage.getItem(chiaveNotaAperta(espId)) } catch { return null }
}
