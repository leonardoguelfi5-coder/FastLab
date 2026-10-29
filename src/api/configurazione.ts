import { supabase } from '@/lib/supabase'
import type { Parametro, Passata, Pianta } from '@/domain/tipi'
import { aRigaParametro, aRigaPassata, aRigaPassataParametro, aRigaPianta } from './mappers'

/** Crea o aggiorna un parametro (upsert per id). Cambiare il tipo di un parametro con dati fallisce con PARAMETRO_CON_DATI. */
export async function salvaParametro(espId: string, p: Parametro): Promise<void> {
  const { error } = await supabase.from('parametri').upsert(aRigaParametro(espId, p), { onConflict: 'id' })
  if (error) throw error
}

/** Ids dei parametri dell'esperimento che compaiono in almeno una misura: non si possono eliminare. */
export async function parametriConDati(espId: string): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('parametri_con_dati', { p_esperimento: espId })
  if (error) throw error
  return new Set((data ?? []) as string[])
}

/** Ids delle piante dell'esperimento con almeno una misura: non si possono eliminare. */
export async function pianteConDati(espId: string): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('piante_con_dati', { p_esperimento: espId })
  if (error) throw error
  return new Set((data ?? []) as string[])
}

/**
 * Elimina il parametro se non ha dati, altrimenti lo archivia. Se nel frattempo arriva una
 * misura che lo usa, l'eliminazione fallisce con PARAMETRO_CON_DATI (guardia del database).
 */
export async function eliminaOArchiviaParametro(espId: string, p: Parametro): Promise<'eliminato' | 'archiviato'> {
  const conDati = await parametriConDati(espId)
  if (conDati.has(p.id)) {
    const { error } = await supabase.from('parametri').update({ archiviato: true }).eq('id', p.id).eq('esperimento_id', espId)
    if (error) throw error
    return 'archiviato'
  }
  const { error } = await supabase.from('parametri').delete().eq('id', p.id).eq('esperimento_id', espId)
  if (error) throw error
  return 'eliminato'
}

/**
 * Salva una passata e sostituisce i suoi parametri. Prima si scrive la passata, poi i
 * collegamenti nuovi o modificati, infine si tolgono quelli non più presenti: se un passo
 * fallisce la passata resta con più collegamenti, mai con meno.
 */
export async function salvaPassata(espId: string, p: Passata): Promise<void> {
  const { error: erroreRiga } = await supabase.from('passate').upsert(aRigaPassata(espId, p), { onConflict: 'id' })
  if (erroreRiga) throw erroreRiga

  if (p.parametri.length > 0) {
    const { error } = await supabase
      .from('passata_parametri')
      .upsert(p.parametri.map(pp => aRigaPassataParametro(espId, p.id, pp)), { onConflict: 'passata_id,parametro_id' })
    if (error) throw error
  }

  // Gli id sono uuid (solo cifre esadecimali e trattini): sicuri nella lista del filtro `in`.
  let elimina = supabase.from('passata_parametri').delete().eq('passata_id', p.id).eq('esperimento_id', espId)
  if (p.parametri.length > 0) {
    elimina = elimina.not('parametro_id', 'in', `(${p.parametri.map(pp => pp.parametro_id).join(',')})`)
  }
  const { error } = await elimina
  if (error) throw error
}

/** Elimina una passata dell'esperimento (con i suoi collegamenti). Fallisce con 23503 se ha già misure. */
export async function eliminaPassata(espId: string, id: string): Promise<void> {
  const { error } = await supabase.from('passate').delete().eq('id', id).eq('esperimento_id', espId)
  if (error) throw error
}

export async function aggiungiPiante(espId: string, piante: Pianta[]): Promise<void> {
  if (piante.length === 0) return
  const { error } = await supabase.from('piante').insert(piante.map(p => aRigaPianta(espId, p)))
  if (error) throw error
}

export async function aggiornaPianta(espId: string, p: Pianta): Promise<void> {
  const { id, esperimento_id, ...campi } = aRigaPianta(espId, p)
  const { error } = await supabase.from('piante').update(campi).eq('id', id).eq('esperimento_id', esperimento_id)
  if (error) throw error
}

/** Elimina una pianta dell'esperimento. Fallisce con 23503 se ha già misure. */
export async function eliminaPianta(espId: string, id: string): Promise<void> {
  const { error } = await supabase.from('piante').delete().eq('id', id).eq('esperimento_id', espId)
  if (error) throw error
}

/** Rinomina un trattamento dell'esperimento. Fallisce con 23505 se l'etichetta c'è già. */
export async function aggiornaTrattamento(espId: string, id: string, etichetta: string): Promise<void> {
  const { error } = await supabase.from('trattamenti').update({ etichetta }).eq('id', id).eq('esperimento_id', espId)
  if (error) throw error
}
