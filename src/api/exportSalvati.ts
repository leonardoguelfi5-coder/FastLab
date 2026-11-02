import { supabase } from '@/lib/supabase'
import type { ExportSalvato } from '@/domain/tipi'
import { controllaRighe } from './righe'
import { daRigaExportSalvato, type RigaExportSalvato } from './mappers'

export type { ExportSalvato }

/**
 * Gli export salvati dell'utente in questo esperimento, ordinati per nome senza badare a maiuscole e accenti (il
 * database ordina per byte: le maiuscole prima). La RLS fa vedere a ognuno solo i suoi. Le scelte tornano come sono: le
 * legge la pagina con `leggiSceltaExport`, e l'API non dipende dal dominio dell'export.
 */
export async function listaExportSalvati(espId: string): Promise<ExportSalvato[]> {
  const { data, error } = await supabase.from('export_salvati').select('*').eq('esperimento_id', espId).order('nome')
  if (error) throw error
  return ((data ?? []) as RigaExportSalvato[])
    .map(daRigaExportSalvato)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' }))
}

/**
 * Salva un export con upsert per id: l'id lo genera il client, quindi un doppio tocco o un nuovo tentativo aggiornano la
 * stessa riga invece di duplicarla; per "sostituire" un export dallo stesso nome la pagina passa l'id di quello
 * esistente. Il nome si salva senza spazi ai bordi (l'indice unico lo confronta così, senza maiuscole). Il payload non
 * porta mai `creato_da` (non aggiornabile: lo firma il database). Un nome già usato da un altro export fallisce con 23505
 * (`export_salvati_nome_unico`, riconoscibile con `eNomeExportGiaUsato`); scelte non valide con 23514.
 */
export async function salvaExportSalvato(espId: string, e: { id: string; nome: string; scelte: unknown }): Promise<void> {
  const riga = { id: e.id, esperimento_id: espId, nome: e.nome.trim(), scelte: e.scelte }
  const { error } = await supabase.from('export_salvati').upsert(riga, { onConflict: 'id' })
  if (error) throw error
}

/** Elimina un export salvato; se non c'è più (eliminato altrove, o non è dell'utente) lancia `ELEMENTO_NON_TROVATO`. */
export async function eliminaExportSalvato(espId: string, id: string): Promise<void> {
  controllaRighe(await supabase.from('export_salvati').delete().eq('id', id).eq('esperimento_id', espId).select('id'))
}
