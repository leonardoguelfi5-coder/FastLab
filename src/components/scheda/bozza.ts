import type { Misura, ValoriMisura } from '@/domain/tipi'

/**
 * Un modulo della scheda pianta non ancora salvato, tenuto nel localStorage del browser. Serve quando si esce senza
 * passare dall'app (gesto indietro del telefono, menu, ricarica) e anche quando l'app si chiude (Piano E, Task E5: con
 * poco segnale un salvataggio può non arrivare, e chi chiude l'app non deve perdere i valori): riaprendo lo stesso
 * modulo i valori tornano. Si cancella dopo un salvataggio riuscito, quando si sceglie di scartarli, quando accede un
 * utente diverso (`assegnaBozze`) e all'avvio se non è stata toccata da `GIORNI_BOZZA` giorni (`pulisciBozzeVecchie`).
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
 * L'inizio di ogni chiave scritta qui (bozze e modulo aperto) e dalle bozze delle note: le bozze sono di chi le ha
 * scritte, e al cambio di utente si cancellano tutte insieme (vedi `assegnaBozze`).
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

/** La misura che si stava correggendo, o `null` (la misura nuova, o il localStorage non si legge). */
export function leggiAperto(chiave: string): string | null {
  try { return localStorage.getItem(chiave) } catch { return null }
}

/** Ricorda la misura in correzione; `null` (la misura nuova) toglie il ricordo. */
export function scriviAperto(chiave: string, misuraId: string | null): void {
  try {
    if (misuraId === null) localStorage.removeItem(chiave)
    else localStorage.setItem(chiave, misuraId)
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

/** La bozza salvata, o `null` se non c'è, è rovinata o il localStorage non si può leggere. */
export function leggiBozza(chiave: string): Bozza | null {
  try {
    const testo = localStorage.getItem(chiave)
    if (!testo) return null
    const b: unknown = JSON.parse(testo, leggi)
    if (!eOggetto(b) || typeof b.id !== 'string' || !eOggetto(b.valori)) return null
    return { id: b.id, valori: b.valori as ValoriMisura, ora: typeof b.ora === 'string' ? b.ora : null }
  } catch {
    return null
  }
}

/**
 * Scrive la bozza con `scritta_il` (adesso: la pulizia conta dall'ultima scrittura); se il localStorage non si può
 * usare (navigazione privata, spazio finito) non fa nulla.
 */
export function scriviBozza(chiave: string, b: Bozza): void {
  try { localStorage.setItem(chiave, JSON.stringify(conScrittaIl(b), scrivi)) } catch { /* resta solo nel modulo */ }
}

export function cancellaBozza(chiave: string): void {
  try { localStorage.removeItem(chiave) } catch { /* niente da togliere */ }
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

/** Di chi sono le bozze del browser: l'id dell'ultimo utente che vi ha avuto accesso. */
const CHIAVE_UTENTE = `${PREFISSO_BOZZE}utente`

/** Una bozza non toccata da più di tanti giorni si toglie all'avvio (`pulisciBozzeVecchie`). */
export const GIORNI_BOZZA = 14
const GIORNO_MS = 24 * 60 * 60 * 1000

/** Il campo con l'istante (ISO) dell'ultima scrittura, in ogni bozza di misura e di nota. */
const SCRITTA_IL = 'scritta_il'

/** L'oggetto da scrivere come bozza, con l'istante di adesso (o quello dato). */
export function conScrittaIl<T extends object>(b: T, adesso: number = Date.now()): T & { scritta_il: string } {
  return { ...b, [SCRITTA_IL]: new Date(adesso).toISOString() } as T & { scritta_il: string }
}

/** Le chiavi che iniziano con `PREFISSO_BOZZE` in uno storage (lette prima di toccarle: togliendo, gli indici cambiano). */
function chiaviBozze(storage: Storage): string[] {
  const chiavi: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const chiave = storage.key(i)
    if (chiave?.startsWith(PREFISSO_BOZZE)) chiavi.push(chiave)
  }
  return chiavi
}

/** Toglie da uno storage tutte le bozze, i ricordi dei moduli aperti e il proprietario. */
function togliBozze(storage: Storage): void {
  for (const chiave of chiaviBozze(storage)) storage.removeItem(chiave)
}

/**
 * I ricordi del modulo aperto (`chiaveAperto`, e `nota-aperta:<espId>` delle note) contengono solo un id, senza data:
 * valgono finché c'è la bozza a cui puntano. Questa è la chiave di quella bozza, o `null` se la chiave non è un ricordo.
 */
function bozzaDelRicordo(chiave: string, id: string): string | null {
  const resto = chiave.slice(PREFISSO_BOZZE.length)
  if (resto.startsWith('aperto:')) return `${PREFISSO_BOZZE}${resto.slice('aperto:'.length)}:${id}`
  // La forma delle chiavi delle note sta in `src/components/note/bozzaNota.ts`.
  if (resto.startsWith('nota-aperta:')) return `${PREFISSO_BOZZE}nota:${resto.slice('nota-aperta:'.length)}:${id}`
  return null
}

const eRicordo = (chiave: string) => bozzaDelRicordo(chiave, '') !== null

/** L'istante dell'ultima scrittura di una bozza, o `null` se non si legge (JSON rovinato, senza `scritta_il`). */
function scrittaIl(testo: string | null): number | null {
  if (testo === null) return null
  try {
    const b: unknown = JSON.parse(testo)
    if (!eOggetto(b) || typeof b[SCRITTA_IL] !== 'string') return null
    const quando = Date.parse(b[SCRITTA_IL])
    return Number.isFinite(quando) ? quando : null
  } catch {
    return null
  }
}

/**
 * Da chiamare all'avvio (`main.tsx`): toglie le bozze di misure e note non toccate da più di `GIORNI_BOZZA` giorni e
 * quelle illeggibili, poi i ricordi dei moduli aperti rimasti senza la loro bozza. Il proprietario resta. Nel
 * localStorage le bozze non scadono da sole come nel sessionStorage: senza pulizia resterebbero per sempre.
 */
export function pulisciBozzeVecchie(adesso: number): void {
  try {
    const limite = adesso - GIORNI_BOZZA * GIORNO_MS
    const chiavi = chiaviBozze(localStorage).filter(k => k !== CHIAVE_UTENTE)
    for (const chiave of chiavi.filter(k => !eRicordo(k))) {
      const quando = scrittaIl(localStorage.getItem(chiave))
      if (quando === null || quando < limite) localStorage.removeItem(chiave)
    }
    for (const chiave of chiavi.filter(eRicordo)) {
      const id = localStorage.getItem(chiave)
      const bozza = id === null ? null : bozzaDelRicordo(chiave, id)
      if (bozza === null || localStorage.getItem(bozza) === null) localStorage.removeItem(chiave)
    }
  } catch { /* senza localStorage non ci sono bozze */ }
}

/**
 * Sposta nel localStorage le bozze lasciate nel sessionStorage dalla versione dell'app di prima del Piano E, così il
 * rilascio non ne perde nessuna. Ognuna riceve `scritta_il` di adesso (prima non lo portavano). Si spostano solo se si
 * sa che sono dello stesso proprietario del localStorage, o se il localStorage non ne ha uno (le sue bozze senza
 * proprietario si tolgono: al primo accesso andrebbero via comunque). Altrimenti restano nel sessionStorage, e
 * decide `assegnaBozze` quando si sa chi accede. Una bozza che non entra (spazio finito) resta nel sessionStorage:
 * si toglie di lì solo dopo averla scritta. Nel localStorage vince la bozza che c'è già: è della versione nuova.
 */
export function spostaBozzeDallaSessione(adesso: number = Date.now()): void {
  try {
    const chiavi = chiaviBozze(sessionStorage).filter(k => k !== CHIAVE_UTENTE)
    const diSessione = sessionStorage.getItem(CHIAVE_UTENTE)
    if (chiavi.length === 0) {
      sessionStorage.removeItem(CHIAVE_UTENTE)
      return
    }
    if (diSessione === null) return
    const locale = localStorage.getItem(CHIAVE_UTENTE)
    if (locale !== null && locale !== diSessione) return
    if (locale === null) {
      togliBozze(localStorage)
      localStorage.setItem(CHIAVE_UTENTE, diSessione)
    }
    let rimaste = false
    for (const chiave of chiavi) {
      const testo = sessionStorage.getItem(chiave)
      try {
        if (testo !== null && localStorage.getItem(chiave) === null) localStorage.setItem(chiave, conDataDiOggi(chiave, testo, adesso))
        sessionStorage.removeItem(chiave)
      } catch {
        rimaste = true
      }
    }
    if (!rimaste) sessionStorage.removeItem(CHIAVE_UTENTE)
  } catch { /* restano dove sono */ }
}

/** Il testo di una bozza spostata, con `scritta_il`; un ricordo (solo un id) o un testo illeggibile passano com'erano. */
function conDataDiOggi(chiave: string, testo: string, adesso: number): string {
  if (eRicordo(chiave)) return testo
  try {
    const b: unknown = JSON.parse(testo)
    return eOggetto(b) ? JSON.stringify(conScrittaIl(b, adesso)) : testo
  } catch {
    return testo
  }
}

/**
 * Da chiamare quando si sa chi ha fatto l'accesso. Le bozze sono di chi le ha scritte: se accede un utente diverso
 * (o non si sa di chi siano) si cancellano tutte, perché chi accede dopo sullo stesso telefono non deve ritrovarsi i
 * valori di un altro né salvarli a suo nome. Con lo stesso utente restano: dopo una sessione scaduta o un'uscita la
 * stessa persona rientra e le ritrova. All'uscita non si chiama: chi esce non ha ancora un successore.
 * Le bozze della versione di prima rimaste nel sessionStorage seguono la stessa regola: passano a chi accede se sono
 * sue, altrimenti si cancellano.
 */
export function assegnaBozze(utente: string): void {
  try {
    if (localStorage.getItem(CHIAVE_UTENTE) !== utente) {
      togliBozze(localStorage)
      localStorage.setItem(CHIAVE_UTENTE, utente)
    }
  } catch { /* senza localStorage non ci sono bozze */ }
  try {
    if (sessionStorage.getItem(CHIAVE_UTENTE) === utente) spostaBozzeDallaSessione()
    else togliBozze(sessionStorage)
  } catch { /* niente da spostare */ }
}

/** Cancella tutte le bozze, il ricordo dei moduli aperti e il loro proprietario (anche quelle rimaste nel sessionStorage). */
export function cancellaTutteLeBozze(): void {
  try { togliBozze(localStorage) } catch { /* niente da togliere */ }
  try { togliBozze(sessionStorage) } catch { /* niente da togliere */ }
}
