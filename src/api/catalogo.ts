import { supabase } from '@/lib/supabase'
import { SENZA_SESSIONE } from '@/lib/errori'
import type { CopiaStrumento, PianoAggiornamento } from '@/domain/catalogo'
import type { VoceCatalogo } from '@/domain/tipi'
import { aggiornaParametroDaCatalogo, collegaParametri, parametriConDati, salvaParametro } from './configurazione'
import { controllaRighe } from './righe'
import {
  aRigaCatalogo, daRigaCatalogo, daRigaParametro, daRigheStrumenti,
  type RigaCatalogo, type RigaParametro, type RigaStrumento, type RigaStrumentoParametro,
} from './mappers'

/**
 * Le voci del catalogo strumenti (condiviso tra tutti gli utenti), senza le archiviate, ordinate per nome. Il database
 * ordina per byte (le maiuscole prima); qui si riordina senza badare a maiuscole e accenti. L'ordinamento è stabile:
 * a parità di nome resta l'ordine del database.
 */
export async function listaCatalogo(): Promise<VoceCatalogo[]> {
  const { data, error } = await supabase.from('catalogo_strumenti').select('*').eq('archiviato', false).order('nome')
  if (error) throw error
  return ((data ?? []) as RigaCatalogo[])
    .map(daRigaCatalogo)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' }))
}

/**
 * Crea o aggiorna una voce del catalogo (upsert per id). Il payload non porta mai creato_da (non aggiornabile: chi
 * inserisce firma la voce dal default del database) né le date. Un nome già usato da un'altra voce non archiviata
 * fallisce con 23505 (`catalogo_strumenti_nome_unico`).
 */
export async function salvaVoceCatalogo(v: VoceCatalogo): Promise<void> {
  const { error } = await supabase.from('catalogo_strumenti').upsert(aRigaCatalogo(v), { onConflict: 'id' })
  if (error) throw error
}

/** Archivia una voce del catalogo (le voci non si eliminano): sparisce dall'elenco, le copie negli esperimenti restano. */
export async function archiviaVoceCatalogo(id: string): Promise<void> {
  controllaRighe(await supabase.from('catalogo_strumenti').update({ archiviato: true }).eq('id', id).select('id'))
}

/**
 * Le copie di una voce del catalogo negli esperimenti di cui l'utente della sessione è proprietario (anche conclusi):
 * solo queste si possono aggiornare dal catalogo, quelle degli altri non cambiano mai (spec §5.10). Il filtro su
 * `creato_da` è nella query e non affidato alla sola RLS, che lascia vedere anche gli esperimenti di cui si è membri.
 * Ogni copia porta tutti i parametri collegati allo strumento (archiviati compresi), i parametri con dati
 * dell'esperimento e il massimo `ordine` dei suoi parametri. Esperimenti per nome, strumenti per `ordine`.
 */
export async function copieDiProprieta(catalogoId: string): Promise<CopiaStrumento[]> {
  const { data: sessione, error: erroreSessione } = await supabase.auth.getSession()
  if (erroreSessione) throw erroreSessione
  const uid = sessione?.session?.user.id
  if (!uid) throw new Error(SENZA_SESSIONE)

  const esperimenti = await supabase.from('esperimenti').select('id, nome').eq('creato_da', uid).order('nome')
  if (esperimenti.error) throw esperimenti.error
  const propri = (esperimenti.data ?? []) as { id: string; nome: string }[]
  if (propri.length === 0) return []

  const strumenti = await supabase.from('strumenti').select('*').eq('catalogo_id', catalogoId)
    .in('esperimento_id', propri.map(e => e.id))
  if (strumenti.error) throw strumenti.error
  const righeStrumenti = (strumenti.data ?? []) as RigaStrumento[]
  if (righeStrumenti.length === 0) return []

  // Solo gli esperimenti con almeno una copia, nell'ordine letto; i loro strumenti per `ordine`.
  const conCopie = propri.filter(e => righeStrumenti.some(s => s.esperimento_id === e.id))
  const strumentiDi = (espId: string) => righeStrumenti.filter(s => s.esperimento_id === espId).sort((a, b) => a.ordine - b.ordine)
  const [collegamenti, parametri, ...conDati] = await Promise.all([
    supabase.from('strumento_parametri').select('*').in('strumento_id', conCopie.flatMap(e => strumentiDi(e.id).map(s => s.id))),
    supabase.from('parametri').select('*').in('esperimento_id', conCopie.map(e => e.id)),
    ...conCopie.map(e => parametriConDati(e.id)),
  ])
  if (collegamenti.error) throw collegamenti.error
  if (parametri.error) throw parametri.error
  const righeCollegamenti = (collegamenti.data ?? []) as RigaStrumentoParametro[]
  const righeParametri = (parametri.data ?? []) as RigaParametro[]

  return conCopie.flatMap((e, i) => {
    const delEsperimento = righeParametri.filter(p => p.esperimento_id === e.id)
    const perId = new Map(delEsperimento.map(p => [p.id, daRigaParametro(p)]))
    const ordineMassimo = Math.max(-1, ...delEsperimento.map(p => p.ordine))
    const suoi = daRigheStrumenti(strumentiDi(e.id), righeCollegamenti)
    return suoi.map((strumento): CopiaStrumento => ({
      espId: e.id,
      esperimentoNome: e.nome,
      strumento,
      parametri: strumento.parametri
        .flatMap(pp => perId.get(pp.parametro_id) ?? [])
        .sort((a, b) => a.ordine - b.ordine),
      conDati: conDati[i],
      ordineMassimo,
    }))
  })
}

/**
 * Applica un piano di aggiornamento dal catalogo (`pianoAggiornamento`): prima le modifiche, che toccano solo i campi
 * del catalogo di parametri che devono esistere ancora, poi i parametri nuovi, ciascuno creato e collegato in coda al
 * suo strumento (senza riscrivere lo strumento né togliere collegamenti). Si ferma al primo errore e lo lancia: le
 * operazioni già fatte restano, e rileggendo le copie il piano successivo le trova già applicate.
 */
export async function applicaAggiornamento(piano: PianoAggiornamento): Promise<void> {
  for (const m of piano.modifiche) await aggiornaParametroDaCatalogo(m.espId, m.parametro)
  for (const a of piano.aggiunte) {
    await salvaParametro(a.espId, a.parametro)
    await collegaParametri(a.espId, a.strumentoId, [a.collegamento])
  }
}
