import { ErroreApp, ESPERIMENTO_NON_TROVATO, FOTO_ESPERIMENTO_NON_RIMOSSE, SOLO_PROPRIETARIO_ELIMINA } from '@/lib/errori'
import { eUuid } from '@/lib/percorsi'
import { supabase } from '@/lib/supabase'
import type { Ruolo } from '@/domain/ruoli'
import type { BozzaEsperimento, ConfigEsperimento, Esperimento } from '@/domain/tipi'
import { controllaRighe } from './righe'
import { eliminaFileEsperimento } from './foto'
import { ruoloIn } from './persone'
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
  /**
   * Il ruolo di chi guarda (dalla migration 0016). Manca in una copia sul telefono scritta prima, e in una risposta di
   * un database senza la 0016: chi lo usa lo tratta come "non noto", mai come un permesso.
   */
  ruolo?: Ruolo | null
}

export async function listaEsperimenti(): Promise<RiepilogoEsperimento[]> {
  const { data, error } = await supabase.rpc('riepilogo_esperimenti')
  if (error) throw error
  return (data ?? []) as RiepilogoEsperimento[]
}

/** Legge tutta la configurazione di un esperimento (esperimento, fattori, trattamenti, piante, parametri, strumenti). */
export async function caricaConfig(espId: string): Promise<ConfigEsperimento> {
  // Un id che non è un uuid (un link sbagliato) non si chiede nemmeno: il database darebbe un errore di formato.
  if (!eUuid(espId)) throw new Error(ESPERIMENTO_NON_TROVATO)
  const figlie = (tabella: string) => supabase.from(tabella).select('*').eq('esperimento_id', espId)
  const [esperimento, fattori, livelli, trattamenti, trattamentoLivelli, piante, parametri, strumenti, strumentoParametri] =
    await Promise.all([
      supabase.from('esperimenti').select('*').eq('id', espId).maybeSingle(),
      figlie('fattori'),
      figlie('livelli'),
      figlie('trattamenti'),
      figlie('trattamento_livelli'),
      figlie('piante'),
      figlie('parametri'),
      figlie('strumenti'),
      figlie('strumento_parametri'),
    ])

  for (const r of [esperimento, fattori, livelli, trattamenti, trattamentoLivelli, piante, parametri, strumenti, strumentoParametri]) {
    if (r.error) throw r.error
  }
  if (!esperimento.data) throw new Error(ESPERIMENTO_NON_TROVATO)

  const righe: RigheConfig = {
    esperimento: esperimento.data,
    fattori: fattori.data ?? [],
    livelli: livelli.data ?? [],
    trattamenti: trattamenti.data ?? [],
    trattamento_livelli: trattamentoLivelli.data ?? [],
    piante: piante.data ?? [],
    parametri: parametri.data ?? [],
    strumenti: strumenti.data ?? [],
    strumento_parametri: strumentoParametri.data ?? [],
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

  controllaRighe(await supabase.from('esperimenti').update(campi).eq('id', espId).select('id'))
}

/**
 * Elimina un esperimento con tutto ciò che contiene. Prima toglie dallo Storage i file delle sue foto: il database
 * cancella a cascata le righe ma non può toccare lo Storage, e dopo l'eliminazione nessuno ne sarebbe più membro, quindi
 * i file resterebbero per sempre (e occuperebbero lo spazio). Se i file non si tolgono, l'esperimento non si elimina e
 * l'errore lo dice: si può riprovare, e i file già tolti non si ritrovano.
 *
 * Il caso opposto è senza rimedio: se i file si tolgono ma poi la riga dell'esperimento non si elimina (rete, permessi),
 * l'esperimento resta con le foto rotte (righe senza file). Per questo la UI deve chiedere una conferma forte prima di
 * chiamarla, e dire che le foto andranno perse anche se l'eliminazione non finisce.
 */
export async function eliminaEsperimento(espId: string): Promise<void> {
  if (!eUuid(espId)) throw new Error(ESPERIMENTO_NON_TROVATO)
  // Prima dei file: un rilevatore toglierebbe i file delle sue foto e poi sarebbe rifiutato sulla riga, lasciando foto
  // senza file. Il database rifiuta comunque; qui si evita il danno a metà.
  if (await ruoloIn(espId) !== 'proprietario') throw new ErroreApp(SOLO_PROPRIETARIO_ELIMINA)
  try {
    await eliminaFileEsperimento(espId)
  } catch (cause) {
    throw new Error(FOTO_ESPERIMENTO_NON_RIMOSSE, { cause })
  }
  controllaRighe(await supabase.from('esperimenti').delete().eq('id', espId).select('id'))
}
