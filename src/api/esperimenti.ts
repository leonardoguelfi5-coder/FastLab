import { supabase } from '@/lib/supabase'
import type { BozzaEsperimento, ConfigEsperimento, Esperimento } from '@/domain/tipi'
import { daRigheConfig, type RigheConfig } from './mappers'

/** Una riga dell'elenco esperimenti (RPC riepilogo_esperimenti). */
export interface RiepilogoEsperimento {
  id: string
  nome: string
  stato: Esperimento['stato']
  data_inizio: string | null
  n_piante: number
  n_trattamenti: number
  /** Ultima data di rilievo, null se non ci sono ancora misure. */
  ultima_data: string | null
  /** Piante distinte con almeno una misura nell'ultima data. */
  piante_ultima_data: number
}

export async function listaEsperimenti(): Promise<RiepilogoEsperimento[]> {
  const { data, error } = await supabase.rpc('riepilogo_esperimenti')
  if (error) throw error
  return (data ?? []) as RiepilogoEsperimento[]
}

/** Legge tutta la configurazione di un esperimento (esperimento, fattori, trattamenti, piante, parametri, passate). */
export async function caricaConfig(espId: string): Promise<ConfigEsperimento> {
  const figlie = (tabella: string) => supabase.from(tabella).select('*').eq('esperimento_id', espId)
  const [esperimento, fattori, livelli, trattamenti, trattamentoLivelli, piante, parametri, passate, passataParametri] =
    await Promise.all([
      supabase.from('esperimenti').select('*').eq('id', espId).maybeSingle(),
      figlie('fattori'),
      figlie('livelli'),
      figlie('trattamenti'),
      figlie('trattamento_livelli'),
      figlie('piante'),
      figlie('parametri'),
      figlie('passate'),
      figlie('passata_parametri'),
    ])

  for (const r of [esperimento, fattori, livelli, trattamenti, trattamentoLivelli, piante, parametri, passate, passataParametri]) {
    if (r.error) throw r.error
  }
  if (!esperimento.data) throw new Error('Esperimento non trovato o non accessibile.')

  const righe: RigheConfig = {
    esperimento: esperimento.data,
    fattori: fattori.data ?? [],
    livelli: livelli.data ?? [],
    trattamenti: trattamenti.data ?? [],
    trattamento_livelli: trattamentoLivelli.data ?? [],
    piante: piante.data ?? [],
    parametri: parametri.data ?? [],
    passate: passate.data ?? [],
    passata_parametri: passataParametri.data ?? [],
  }
  return daRigheConfig(righe)
}

/** Crea un esperimento completo (un solo statement atomico) e ne restituisce l'id. Solo via RPC: un insert diretto fallisce sotto RLS. */
export async function creaEsperimento(b: BozzaEsperimento): Promise<string> {
  const { data, error } = await supabase.rpc('crea_esperimento', { bozza: b })
  if (error) throw error
  return data as string
}

const CAMPI_MODIFICABILI = ['nome', 'data_inizio', 'note', 'stato'] as const

export async function aggiornaEsperimento(espId: string, patch: Partial<Omit<Esperimento, 'id'>>): Promise<void> {
  // Solo i campi noti: mai id né creato_da (nessun UPDATE su quella colonna).
  const campi: Partial<Omit<Esperimento, 'id'>> = {}
  for (const k of CAMPI_MODIFICABILI) {
    if (k in patch) Object.assign(campi, { [k]: patch[k] })
  }
  if (Object.keys(campi).length === 0) return

  const { error } = await supabase.from('esperimenti').update(campi).eq('id', espId)
  if (error) throw error
}
