import { supabase } from '@/lib/supabase'
import type { Nota } from '@/domain/tipi'
import { controllaRighe } from './righe'
import { aRigaNota, daRigaNota, type RigaNota } from './mappers'

/** Le righe di note che si leggono in una volta: il massimo che PostgREST restituisce di norma. */
const PAGINA_NOTE = 1000

/**
 * Le note dell'esperimento con i loro collegamenti, dalla data più recente e, a parità di data, dall'ultima creata.
 * Si legge a pagine (PostgREST ne dà al massimo mille per volta): oltre quel numero le più vecchie non sparirebbero
 * in silenzio dal Diario. L'`id` chiude l'ordinamento, così due pagine non si sovrappongono né saltano righe.
 */
export async function listaNote(espId: string): Promise<Nota[]> {
  const note: Nota[] = []
  for (let da = 0; ; da += PAGINA_NOTE) {
    const { data, error } = await supabase
      .from('note')
      .select('*, note_piante(pianta_id), note_trattamenti(trattamento_id)')
      .eq('esperimento_id', espId)
      .order('data', { ascending: false })
      .order('creato_il', { ascending: false })
      .order('id', { ascending: false })
      .range(da, da + PAGINA_NOTE - 1)
    if (error) throw error
    const righe = (data ?? []) as RigaNota[]
    note.push(...righe.map(daRigaNota))
    if (righe.length < PAGINA_NOTE) return note
  }
}

/**
 * Salva una nota e sostituisce i suoi collegamenti. Come `salvaStrumento`: prima la nota (upsert per id, quindi un
 * doppio tocco o un nuovo tentativo non la duplicano), poi i collegamenti nuovi, infine si tolgono quelli non più
 * presenti. Se un passo fallisce la nota resta con più collegamenti, mai con meno.
 */
export async function salvaNota(espId: string, nota: Nota): Promise<void> {
  const { error } = await supabase.from('note').upsert(aRigaNota(espId, nota), { onConflict: 'id' })
  if (error) throw error

  await sostituisciCollegamenti(espId, nota.id, 'note_piante', 'pianta_id', nota.pianta_ids)
  await sostituisciCollegamenti(espId, nota.id, 'note_trattamenti', 'trattamento_id', nota.trattamento_ids)
}

/** Fa coincidere i collegamenti di una nota in una tabella con gli id dati: aggiunge i nuovi, toglie gli altri. */
async function sostituisciCollegamenti(
  espId: string,
  notaId: string,
  tabella: 'note_piante' | 'note_trattamenti',
  colonna: 'pianta_id' | 'trattamento_id',
  idsDati: string[],
): Promise<void> {
  // Un id ripetuto farebbe fallire l'upsert ("non si può toccare due volte la stessa riga").
  const ids = [...new Set(idsDati)]

  if (ids.length > 0) {
    const { error } = await supabase
      .from(tabella)
      .upsert(ids.map(id => ({ nota_id: notaId, [colonna]: id, esperimento_id: espId })), { onConflict: `nota_id,${colonna}` })
    if (error) throw error
  }

  // Gli id sono uuid (solo cifre esadecimali e trattini): sicuri nella lista del filtro `in`.
  let elimina = supabase.from(tabella).delete().eq('nota_id', notaId).eq('esperimento_id', espId)
  if (ids.length > 0) elimina = elimina.not(colonna, 'in', `(${ids.join(',')})`)
  const { error } = await elimina
  if (error) throw error
}

/** Elimina una nota dell'esperimento (i suoi collegamenti spariscono con lei, le sue foto restano senza nota). */
export async function eliminaNota(espId: string, id: string): Promise<void> {
  controllaRighe(await supabase.from('note').delete().eq('id', id).eq('esperimento_id', espId).select('id'))
}

/**
 * Segna un promemoria come fatto (`fatto_il` = adesso) o toglie la spunta. È l'unico punto che scrive `fatto_il` su
 * una nota che resta un promemoria. Una nota eliminata nel frattempo fa fallire l'operazione.
 */
export async function segnaFatto(espId: string, id: string, fatto: boolean): Promise<void> {
  const fatto_il = fatto ? new Date().toISOString() : null
  controllaRighe(await supabase.from('note').update({ fatto_il }).eq('id', id).eq('esperimento_id', espId).select('id'))
}
