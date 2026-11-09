import { supabase } from '@/lib/supabase'
import { eRuolo, type Ruolo } from '@/domain/ruoli'

/*
 * Le persone di un esperimento e il loro ruolo (Piano E, Task E9, migration 0016; i ruoli in `src/domain/ruoli.ts`). La
 * guardia vera è il database: le RPC controllano chi chiama e rifiutano con SOLO_PROPRIETARIO, UTENTE_NON_TROVATO,
 * RUOLO_NON_VALIDO e ULTIMO_PROPRIETARIO (messaggi in `src/lib/errori.ts`).
 */
export { eRuolo, RUOLI, type Ruolo } from '@/domain/ruoli'

/** Una persona dell'esperimento (RPC `membri_di`), nell'ordine del database: proprietari, rilevatori, lettori, poi email. */
export interface Membro {
  utente_id: string
  /** Dal profilo; `null` solo per un utente senza profilo (non dovrebbe esistere: lo crea la registrazione). */
  email: string | null
  ruolo: Ruolo
  /** La riga di chi guarda. */
  sei_tu: boolean
}

/** Un ruolo arrivato dal database: uno dei tre, mai un permesso inventato per un valore che l'app non conosce. */
function ruoloLetto(v: unknown, dove: string): Ruolo {
  if (!eRuolo(v)) throw new Error(`${dove}: ruolo sconosciuto (${String(v)})`)
  return v
}

/** Il ruolo di chi chiama nell'esperimento, o `null` se non ne è membro (RPC `ruolo_in`). */
export async function ruoloIn(espId: string): Promise<Ruolo | null> {
  const { data, error } = await supabase.rpc('ruolo_in', { p: espId })
  if (error) throw error
  if (data === null || data === undefined) return null
  return ruoloLetto(data, 'ruolo_in')
}

/** Le persone dell'esperimento. Per chi non ne è membro nessuna riga (non un errore). */
export async function membriDi(espId: string): Promise<Membro[]> {
  const { data, error } = await supabase.rpc('membri_di', { p: espId })
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    utente_id: String(r.utente_id),
    email: typeof r.email === 'string' ? r.email : null,
    ruolo: ruoloLetto(r.ruolo, 'membri_di'),
    sei_tu: r.sei_tu === true,
  }))
}

/**
 * Aggiunge un collega già registrato con il ruolo dato; se è già nell'esperimento ne cambia il ruolo. Solo il
 * proprietario. L'email si confronta nel database senza badare a maiuscole e spazi; qui si tolgono solo gli spazi ai lati.
 */
export async function aggiungiMembro(espId: string, email: string, ruolo: Ruolo): Promise<void> {
  const { error } = await supabase.rpc('aggiungi_membro', { p: espId, p_email: email.trim(), p_ruolo: ruolo })
  if (error) throw error
}

/** Toglie una persona (il proprietario) o se stessi ("Lascia l'esperimento"). Le sue misure, note e foto restano. */
export async function togliMembro(espId: string, utenteId: string): Promise<void> {
  const { error } = await supabase.rpc('togli_membro', { p: espId, p_utente: utenteId })
  if (error) throw error
}

/** Chi ha creato o modificato per ultimo le voci del catalogo: da id utente a email (RPC `autori_catalogo`). */
export async function autoriCatalogo(): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc('autori_catalogo')
  if (error) throw error
  return new Map(((data ?? []) as { utente_id: string; email: string }[]).map(r => [r.utente_id, r.email]))
}
