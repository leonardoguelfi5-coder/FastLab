import { EMAIL_GIA_INVITATA, INVITO_GIA_USATO } from '@/lib/errori'
import { supabase } from '@/lib/supabase'

export interface Invito {
  id: string
  email: string
  /** Codice che l'amministratore passa al collega: serve insieme all'email per registrarsi. */
  codice: string
  creato_il: string
  usato_il: string | null
}

const COLONNE = 'id, email, codice, creato_il, usato_il'

/** Vero se l'utente corrente è amministratore (può gestire gli inviti). */
export async function sonoAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin')
  if (error) throw error
  return data === true
}

/** Inviti, i più recenti per primi. Solo l'amministratore li vede (RLS). */
export async function listaInviti(): Promise<Invito[]> {
  const { data, error } = await supabase.from('inviti').select(COLONNE).order('creato_il', { ascending: false })
  if (error) throw error
  return (data ?? []) as Invito[]
}

/** Crea un invito: il database genera il codice, che viene restituito insieme alla riga. */
export async function creaInvito(email: string): Promise<Invito> {
  // Il database accetta solo email già normalizzate (minuscole, senza spazi ai lati).
  const { data, error } = await supabase.from('inviti').insert({ email: email.trim().toLowerCase() }).select(COLONNE).single()
  // L'indice unico sull'email: l'invito c'è già, e il messaggio dice dove trovarlo.
  if (error?.code === '23505' && error.message.includes('inviti_email_unica')) throw new Error(EMAIL_GIA_INVITATA)
  if (error) throw error
  return data as Invito
}

/**
 * Revoca un invito non ancora usato. Uno usato nel frattempo (il collega si è appena registrato) o già revocato non
 * si tocca: nessuna riga eliminata, e lo si dice invece di dare la revoca per riuscita.
 */
export async function revocaInvito(id: string): Promise<void> {
  const { data, error } = await supabase.from('inviti').delete().eq('id', id).is('usato_il', null).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error(INVITO_GIA_USATO)
}
