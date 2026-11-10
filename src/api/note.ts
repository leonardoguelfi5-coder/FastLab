import { supabase } from '@/lib/supabase'
import type { Nota } from '@/domain/tipi'
import { controllaRighe } from './righe'
import { aRigaNota, daRigaNota, type RigaNota } from './mappers'

/** Le righe di note che si chiedono in una volta (PostgREST può darne di meno: `max_rows`). */
const PAGINA_NOTE = 1000

/**
 * Le note dell'esperimento con i loro collegamenti, dalla data più recente e, a parità di data, dall'ultima creata.
 * Si legge a pagine e ci si ferma solo davanti a una pagina vuota: il server può restituire meno righe di quelle
 * chieste (`max_rows` sotto le mille), e fermarsi a una pagina "corta" perderebbe in silenzio le note più vecchie.
 * La pagina successiva parte da quante righe sono arrivate davvero. Un inserimento concorrente può spostare una riga
 * da una pagina all'altra: si tengono le note per `id`, una sola volta.
 */
export async function listaNote(espId: string): Promise<Nota[]> {
  const note = new Map<string, Nota>()
  for (let da = 0; ; ) {
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
    if (righe.length === 0) return [...note.values()]
    for (const r of righe) if (!note.has(r.id)) note.set(r.id, daRigaNota(r))
    da += righe.length
  }
}

type TabellaCollegamenti = 'note_piante' | 'note_trattamenti'
type ColonnaCollegamenti = 'pianta_id' | 'trattamento_id'

/**
 * Salva una nota e sostituisce i suoi collegamenti. Prima la nota (upsert per id, quindi un doppio tocco o un nuovo
 * tentativo non la duplicano), poi si leggono i collegamenti che ha già, poi si scrivono TUTTI i nuovi (piante e
 * trattamenti), e solo alla fine si tolgono quelli non più presenti. Così, se un passo fallisce, la nota resta con
 * l'unione dei collegamenti vecchi e nuovi, mai con meno: passando da Piante a Trattamenti, un errore sui trattamenti
 * non la lascia senza collegamenti (che vorrebbe dire "tutto l'esperimento") prima che quelli nuovi siano scritti.
 */
export async function salvaNota(espId: string, nota: Nota): Promise<void> {
  const { error } = await supabase.from('note').upsert(aRigaNota(espId, nota), { onConflict: 'id' })
  if (error) throw error

  // Un id ripetuto farebbe fallire l'upsert ("non si può toccare due volte la stessa riga").
  const voci: { tabella: TabellaCollegamenti; colonna: ColonnaCollegamenti; ids: string[] }[] = [
    { tabella: 'note_piante', colonna: 'pianta_id', ids: [...new Set(nota.pianta_ids)] },
    { tabella: 'note_trattamenti', colonna: 'trattamento_id', ids: [...new Set(nota.trattamento_ids)] },
  ]

  const esistenti = []
  for (const v of voci) esistenti.push(await leggiCollegamenti(espId, nota.id, v.tabella, v.colonna))

  for (const v of voci) {
    if (v.ids.length === 0) continue
    const { error: e } = await supabase
      .from(v.tabella)
      .upsert(v.ids.map(id => ({ nota_id: nota.id, [v.colonna]: id, esperimento_id: espId })), { onConflict: `nota_id,${v.colonna}` })
    if (e) throw e
  }

  // Si cancella solo ciò che è stato davvero tolto, con i suoi id: niente `not in` con tutti quelli che restano
  // (con centinaia di piante l'indirizzo della richiesta diventerebbe lunghissimo). Gli id sono uuid (solo cifre
  // esadecimali e trattini): sicuri nella lista del filtro `in`.
  for (const [i, v] of voci.entries()) {
    const restano = new Set(v.ids)
    const tolti = esistenti[i].filter(id => !restano.has(id))
    if (tolti.length === 0) continue
    const { error: e } = await supabase
      .from(v.tabella).delete().eq('nota_id', nota.id).eq('esperimento_id', espId).in(v.colonna, tolti)
    if (e) throw e
  }
}

/** Gli id a cui una nota è collegata adesso nel database, in una delle due tabelle dei collegamenti. */
async function leggiCollegamenti(
  espId: string,
  notaId: string,
  tabella: TabellaCollegamenti,
  colonna: ColonnaCollegamenti,
): Promise<string[]> {
  const { data, error } = await supabase.from(tabella).select(colonna).eq('nota_id', notaId).eq('esperimento_id', espId)
  if (error) throw error
  return ((data ?? []) as unknown as Record<string, string>[]).map(r => r[colonna])
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
