import { supabase } from '@/lib/supabase'
import type { Misura } from '@/domain/tipi'
import { MISURA_NON_TROVATA } from '@/lib/errori'
import { aRigaMisura, daRigaMisura } from './mappers'

/** Misure di un esperimento in una data (AAAA-MM-GG), dalla più vecchia alla più recente. */
export async function misureDelGiorno(espId: string, data: string): Promise<Misura[]> {
  const { data: righe, error } = await supabase
    .from('misure')
    .select('*')
    .eq('esperimento_id', espId)
    .eq('data_rilievo', data)
    .order('ora', { ascending: true })
  if (error) throw error
  return (righe ?? []).map(daRigaMisura)
}

/** Tutte le misure di una pianta, dalla più recente. */
export async function misurePianta(piantaId: string): Promise<Misura[]> {
  const { data, error } = await supabase
    .from('misure')
    .select('*')
    .eq('pianta_id', piantaId)
    .order('data_rilievo', { ascending: false })
    .order('ora', { ascending: false })
  if (error) throw error
  return (data ?? []).map(daRigaMisura)
}

/** Una misura per id; lancia `MISURA_NON_TROVATA` se non c'è (o non è visibile a chi la chiede). */
export async function caricaMisura(id: string): Promise<Misura> {
  const { data, error } = await supabase.from('misure').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new Error(MISURA_NON_TROVATA)
  return daRigaMisura(data)
}

/**
 * Salva una misura con upsert per id: l'id lo genera il client una volta per modulo, quindi un
 * doppio tocco o un nuovo tentativo dopo un timeout aggiornano la stessa riga invece di duplicarla.
 */
export async function salvaMisura(espId: string, m: Misura): Promise<void> {
  const { error } = await supabase.from('misure').upsert(aRigaMisura(espId, m), { onConflict: 'id' })
  if (error) throw error
}

export async function eliminaMisura(id: string): Promise<void> {
  const { error } = await supabase.from('misure').delete().eq('id', id)
  if (error) throw error
}

/**
 * La data (AAAA-MM-GG) dell'ultima misura di ogni strumento dell'esperimento, per "ultima volta 21/10" nella scelta
 * dello strumento. Gli strumenti mai misurati non compaiono nella mappa. Calcolata dal database (`max` per strumento),
 * così non si scaricano le misure di tutta la stagione.
 */
export async function ultimaMisuraPerStrumento(espId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc('ultime_misure_per_strumento', { p_esperimento: espId })
  if (error) throw error
  return new Map(((data ?? []) as { strumento_id: string; ultima: string }[]).map(r => [r.strumento_id, r.ultima]))
}
