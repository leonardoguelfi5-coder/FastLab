import { supabase } from '@/lib/supabase'
import type { VoceCatalogo } from '@/domain/tipi'
import { controllaRighe } from './righe'
import { aRigaCatalogo, daRigaCatalogo, type RigaCatalogo } from './mappers'

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
