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
  if (error) throw error
  return data as Invito
}

export async function revocaInvito(id: string): Promise<void> {
  const { error } = await supabase.from('inviti').delete().eq('id', id)
  if (error) throw error
}
