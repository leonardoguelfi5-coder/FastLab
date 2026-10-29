import type { ValoriMisura } from '@/domain/tipi'

/**
 * Un modulo della scheda pianta non ancora salvato, tenuto nel sessionStorage della scheda del browser. Serve
 * quando si esce senza passare dall'app (gesto indietro del telefono, menu, ricarica): riaprendo lo stesso modulo
 * i valori tornano. Si cancella dopo un salvataggio riuscito o quando si sceglie di scartarli.
 */
export interface Bozza {
  /** L'id con cui il modulo salva: lo stesso anche dopo la ripresa, così un tentativo già arrivato al server non si duplica. */
  id: string
  valori: ValoriMisura
  ora: string | null
}

export interface ChiaveBozza {
  espId: string
  piantaId: string
  passataId: string
  dataRilievo: string
  /** La misura che si corregge; `null` per la misura nuova. */
  misuraId: string | null
}

/**
 * L'inizio di ogni chiave scritta qui (bozze e modulo aperto): le bozze sono di chi le ha scritte, e all'uscita o al
 * cambio di utente si cancellano tutte insieme (vedi `cancellaTutteLeBozze`).
 */
export const PREFISSO_BOZZE = 'fastlab-bozza:'

export function chiaveBozza(c: ChiaveBozza): string {
  return PREFISSO_BOZZE + [c.espId, c.piantaId, c.passataId, c.dataRilievo, c.misuraId ?? 'nuova'].join(':')
}

/**
 * Dove si ricorda quale modulo era aperto in un riquadro (esperimento, pianta, passata, data): la correzione di una
 * misura, se ne aveva una bozza. Assente vale "la misura nuova". Si scrive e si cancella insieme alla bozza.
 */
export function chiaveAperto(c: Omit<ChiaveBozza, 'misuraId'>): string {
  return PREFISSO_BOZZE + ['aperto', c.espId, c.piantaId, c.passataId, c.dataRilievo].join(':')
}

/** La misura che si stava correggendo, o `null` (la misura nuova, o il sessionStorage non si legge). */
export function leggiAperto(chiave: string): string | null {
  try { return sessionStorage.getItem(chiave) } catch { return null }
}

/** Ricorda la misura in correzione; `null` (la misura nuova) toglie il ricordo. */
export function scriviAperto(chiave: string, misuraId: string | null): void {
  try {
    if (misuraId === null) sessionStorage.removeItem(chiave)
    else sessionStorage.setItem(chiave, misuraId)
  } catch { /* si riapre la misura nuova */ }
}

// Un numero non valido ("-" lasciato a metà è NaN) in JSON diventerebbe null, cioè un campo vuoto che si salva:
// lo si scrive come segnaposto, così torna non valido e il salvataggio resta fermo finché non si corregge.
const NON_VALIDO = '$nonValido'
const scrivi = (_chiave: string, v: unknown) => (typeof v === 'number' && !Number.isFinite(v) ? { [NON_VALIDO]: true } : v)
const leggi = (_chiave: string, v: unknown) =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 1 && (v as Record<string, unknown>)[NON_VALIDO] === true
    ? NaN
    : v

const eOggetto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** La bozza salvata, o `null` se non c'è, è rovinata o il sessionStorage non si può leggere. */
export function leggiBozza(chiave: string): Bozza | null {
  try {
    const testo = sessionStorage.getItem(chiave)
    if (!testo) return null
    const b: unknown = JSON.parse(testo, leggi)
    if (!eOggetto(b) || typeof b.id !== 'string' || !eOggetto(b.valori)) return null
    return { id: b.id, valori: b.valori as ValoriMisura, ora: typeof b.ora === 'string' ? b.ora : null }
  } catch {
    return null
  }
}

/** Scrive la bozza; se il sessionStorage non si può usare (navigazione privata, spazio finito) non fa nulla. */
export function scriviBozza(chiave: string, b: Bozza): void {
  try { sessionStorage.setItem(chiave, JSON.stringify(b, scrivi)) } catch { /* resta solo nel modulo */ }
}

export function cancellaBozza(chiave: string): void {
  try { sessionStorage.removeItem(chiave) } catch { /* niente da togliere */ }
}

/**
 * Cancella tutte le bozze della scheda del browser (e il ricordo dei moduli aperti). Si chiama quando la sessione
 * finisce o passa a un altro utente: chi accede dopo, sullo stesso telefono, non deve ritrovarsi i valori di un altro.
 */
export function cancellaTutteLeBozze(): void {
  try {
    const chiavi: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const chiave = sessionStorage.key(i)
      if (chiave?.startsWith(PREFISSO_BOZZE)) chiavi.push(chiave)
    }
    for (const chiave of chiavi) sessionStorage.removeItem(chiave)
  } catch { /* niente da togliere */ }
}
