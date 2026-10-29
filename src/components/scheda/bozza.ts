import type { Misura, ValoriMisura } from '@/domain/tipi'

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
  strumentoId: string
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
  return PREFISSO_BOZZE + [c.espId, c.piantaId, c.strumentoId, c.dataRilievo, c.misuraId ?? 'nuova'].join(':')
}

/**
 * Dove si ricorda quale modulo era aperto in un riquadro (esperimento, pianta, strumento, data): la correzione di una
 * misura, se ne aveva una bozza. Assente vale "la misura nuova". Si scrive e si cancella insieme alla bozza.
 */
export function chiaveAperto(c: Omit<ChiaveBozza, 'misuraId'>): string {
  return PREFISSO_BOZZE + ['aperto', c.espId, c.piantaId, c.strumentoId, c.dataRilievo].join(':')
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
 * Vero se, aprendo il riquadro di questa pianta, strumento e data, si riprenderebbe da solo un modulo lasciato a metà:
 * la correzione di una delle misure del giorno (`idMisureDelGiorno`) che era aperta con la sua bozza, o la bozza della
 * misura nuova. Sono le stesse regole con cui `RiquadroOggi` sceglie il modulo da riaprire.
 */
export function bozzaDaRiprendere(c: Omit<ChiaveBozza, 'misuraId'>, idMisureDelGiorno: string[]): boolean {
  const aperta = leggiAperto(chiaveAperto(c))
  if (aperta !== null && idMisureDelGiorno.includes(aperta) && leggiBozza(chiaveBozza({ ...c, misuraId: aperta }))?.id === aperta) return true
  return leggiBozza(chiaveBozza({ ...c, misuraId: null })) !== null
}

/**
 * Cancella la bozza di correzione di una misura, alla data con cui la scheda la apre (quella salvata), e il ricordo che
 * quel modulo era aperto. Da chiamare quando la misura è stata corretta o eliminata altrove (la pagina di modifica):
 * senza, la scheda riproporrebbe i valori vecchi sopra la modifica appena fatta. Le bozze di altre misure restano.
 */
export function cancellaBozzaCorrezione(espId: string, m: Misura): void {
  const base = { espId, piantaId: m.pianta_id, strumentoId: m.strumento_id, dataRilievo: m.data_rilievo }
  cancellaBozza(chiaveBozza({ ...base, misuraId: m.id }))
  const aperto = chiaveAperto(base)
  if (leggiAperto(aperto) === m.id) scriviAperto(aperto, null)
}

/** Di chi sono le bozze della scheda del browser: l'id dell'ultimo utente che vi ha avuto accesso. */
const CHIAVE_UTENTE = `${PREFISSO_BOZZE}utente`

/**
 * Da chiamare quando si sa chi ha fatto l'accesso. Le bozze sono di chi le ha scritte: se accede un utente diverso
 * (o non si sa di chi siano) si cancellano tutte, perché chi accede dopo sullo stesso telefono non deve ritrovarsi i
 * valori di un altro né salvarli a suo nome. Con lo stesso utente restano: dopo una sessione scaduta o un'uscita la
 * stessa persona rientra e le ritrova. All'uscita non si chiama: chi esce non ha ancora un successore.
 */
export function assegnaBozze(utente: string): void {
  try {
    if (sessionStorage.getItem(CHIAVE_UTENTE) === utente) return
    cancellaTutteLeBozze()
    sessionStorage.setItem(CHIAVE_UTENTE, utente)
  } catch { /* senza sessionStorage non ci sono bozze */ }
}

/** Cancella tutte le bozze della scheda del browser, il ricordo dei moduli aperti e il loro proprietario. */
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
