import { ESPERIMENTO_NON_TROVATO } from '@/lib/errori'
import { comprimi } from '@/lib/immagini'
import { eUuid } from '@/lib/percorsi'
import { supabase } from '@/lib/supabase'
import { percorsoFoto } from '@/domain/foto'
import type { Foto } from '@/domain/tipi'
import { controllaRighe } from './righe'
import { aRigaFoto, daRigaFoto, type RigaFoto } from './mappers'

/** Il bucket privato dello Storage con i file delle foto (vedi la migration 20261101000012). */
const BUCKET = 'foto'

/** Quanto dura un URL firmato: un'ora; la cache lo rinnova prima che scada (vedi `useUrlFoto`). */
export const VALIDITA_URL_SECONDI = 3600

/** Le righe che si chiedono in una volta: PostgREST può darne di meno (`max_rows`), si legge finché non arriva una pagina vuota. */
const PAGINA = 1000
/** I percorsi per ogni richiesta di URL firmati e i file per ogni pagina di rimozione. */
const PERCORSI_PER_RICHIESTA = 100

/**
 * Un caricamento rifiutato perché il file c'è già. Il servizio Storage risponde 409 / "Duplicate" (a volte con stato HTTP
 * 400 e il 409 solo nel corpo): si guardano tutti e tre i punti.
 */
function eGiaEsistente(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  const { status, statusCode, message } = e as { status?: unknown; statusCode?: unknown; message?: unknown }
  return status === 409 || statusCode === '409' || statusCode === 409 ||
    (typeof message === 'string' && /already exists|duplicate/i.test(message))
}

export interface DatiFoto {
  /**
   * L'id della foto, generato dal chiamante con `nuovoId()` una volta sola per ogni foto scelta e riusato in un nuovo
   * tentativo: così il percorso è lo stesso e un tentativo ripetuto non lascia doppioni, né file né righe.
   */
  id: string
  file: Blob
  /** La data della foto (AAAA-MM-GG): di scatto o di oggi, la sceglie il chiamante. */
  data: string
  piantaId?: string | null
  notaId?: string | null
}

/**
 * Comprime una foto, la carica nello Storage e scrive la riga.
 *
 * Il file va prima della riga: una riga senza file mostrerebbe un'immagine rotta. Se la riga poi non si scrive, il file
 * appena caricato si toglie (best effort: l'errore che si vede è quello della riga), così non resta un file senza riga.
 * Il caricamento è con `upsert: false` (lo Storage non ha una policy di aggiornamento) e "esiste già" vale come riuscito:
 * è il file di un tentativo precedente con lo stesso id, quindi con la stessa foto. In quel caso, se la riga non si
 * scrive, il file non si tocca: non l'ha messo questo tentativo, e un nuovo tentativo con lo stesso id lo riusa. La riga
 * si scrive per id, quindi anche un tentativo ripetuto dopo una risposta persa non crea doppioni.
 */
export async function caricaFoto(espId: string, d: DatiFoto): Promise<Foto> {
  const { blob, larghezza, altezza } = await comprimi(d.file)
  const percorso = percorsoFoto(espId, d.id)

  const { error: erroreFile } = await supabase.storage.from(BUCKET).upload(percorso, blob, { contentType: 'image/jpeg', upsert: false })
  const nuovo = !erroreFile
  if (erroreFile && !eGiaEsistente(erroreFile)) throw erroreFile

  const foto: Foto = {
    id: d.id, data: d.data, percorso, larghezza, altezza, byte: blob.size,
    pianta_id: d.piantaId ?? null, nota_id: d.notaId ?? null, archiviata: false,
  }
  const { error } = await supabase.from('foto').upsert(aRigaFoto(espId, foto), { onConflict: 'id' })
  if (error) {
    if (nuovo) await togliFileSilenzioso(percorso)
    throw error
  }
  return foto
}

/** Toglie un file senza mai lanciare: serve dopo un errore, che è quello che deve arrivare a chi chiama. */
async function togliFileSilenzioso(percorso: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage.from(BUCKET).remove([percorso])
    return !error
  } catch {
    return false
  }
}

/** Le foto dell'esperimento, dalla data più recente e, a parità di data, dall'ultima caricata. Si legge a pagine fino a una pagina vuota. */
export async function listaFoto(espId: string): Promise<Foto[]> {
  const foto = new Map<string, Foto>()
  for (let da = 0; ; ) {
    const { data, error } = await supabase
      .from('foto')
      .select('*')
      .eq('esperimento_id', espId)
      .order('data', { ascending: false })
      .order('creato_il', { ascending: false })
      .order('id', { ascending: false })
      .range(da, da + PAGINA - 1)
    if (error) throw error
    const righe = (data ?? []) as RigaFoto[]
    if (righe.length === 0) return [...foto.values()]
    // Un inserimento concorrente può spostare una riga da una pagina all'altra: una sola volta per id.
    for (const r of righe) if (!foto.has(r.id)) foto.set(r.id, daRigaFoto(r))
    da += righe.length
  }
}

/**
 * Gli URL firmati (validità un'ora) dei file, per percorso. Un percorso senza URL (file tolto, accesso negato) manca dalla
 * mappa: l'interfaccia mostra un segnaposto. Un errore del servizio si propaga.
 */
export async function urlFoto(percorsi: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>()
  for (let i = 0; i < percorsi.length; i += PERCORSI_PER_RICHIESTA) {
    const gruppo = percorsi.slice(i, i + PERCORSI_PER_RICHIESTA)
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(gruppo, VALIDITA_URL_SECONDI)
    if (error) throw error
    for (const r of data ?? []) if (r.path && r.signedUrl && !r.error) urls.set(r.path, r.signedUrl)
  }
  return urls
}

/**
 * Elimina una foto: prima la riga, poi il file. Se la riga non si elimina non succede niente (il file resta, la foto
 * resta). Se è il file a non togliersi la riga è già andata e non si può più tornare indietro: non è un errore, ma si
 * segnala (`fileRimosso: false`) perché il chiamante lo dica. Una foto archiviata il file non ce l'ha più: si salta.
 */
export async function eliminaFoto(espId: string, foto: Foto): Promise<{ fileRimosso: boolean }> {
  controllaRighe(await supabase.from('foto').delete().eq('id', foto.id).eq('esperimento_id', espId).select('id'))
  if (foto.archiviata) return { fileRimosso: true }
  return { fileRimosso: await togliFileSilenzioso(foto.percorso) }
}

const CAMPI_MODIFICABILI = ['data', 'pianta_id', 'nota_id'] as const

/**
 * Cambia la data o il collegamento di una foto (il visore). Solo i campi noti: il percorso, il peso e `archiviata` non
 * si cambiano da qui. Una foto eliminata nel frattempo fa fallire l'operazione.
 */
export async function aggiornaFoto(
  espId: string, id: string, patch: Partial<Pick<Foto, (typeof CAMPI_MODIFICABILI)[number]>>,
): Promise<void> {
  const campi: Partial<Pick<Foto, (typeof CAMPI_MODIFICABILI)[number]>> = {}
  for (const k of CAMPI_MODIFICABILI) {
    if (k in patch) Object.assign(campi, { [k]: patch[k] })
  }
  if (Object.keys(campi).length === 0) return
  controllaRighe(await supabase.from('foto').update(campi).eq('id', id).eq('esperimento_id', espId).select('id'))
}

/**
 * I byte occupati dalle foto dell'esperimento e da tutto il progetto visibile (quelle di cui si è membri). Le foto
 * archiviate non contano: il loro file non c'è più. La somma si fa qui perché non c'è una RPC: si leggono solo id,
 * esperimento e peso, a pagine.
 */
export async function spazioFoto(espId: string): Promise<{ esperimento: number; progetto: number }> {
  const viste = new Set<string>()
  let esperimento = 0
  let progetto = 0
  for (let da = 0; ; ) {
    const { data, error } = await supabase
      .from('foto')
      .select('id, esperimento_id, byte')
      .eq('archiviata', false)
      .order('id')
      .range(da, da + PAGINA - 1)
    if (error) throw error
    const righe = (data ?? []) as { id: string; esperimento_id: string; byte: number | null }[]
    if (righe.length === 0) return { esperimento, progetto }
    for (const r of righe) {
      if (viste.has(r.id)) continue
      viste.add(r.id)
      progetto += r.byte ?? 0
      if (r.esperimento_id === espId) esperimento += r.byte ?? 0
    }
    da += righe.length
  }
}

/**
 * Toglie dallo Storage tutti i file di un esperimento (la sua cartella `<esperimento_id>/`) e dice quanti. Serve prima di
 * eliminarlo: il database non può toccare lo Storage, e dopo l'eliminazione nessuno ne è più membro, quindi nessuno
 * potrebbe più rimuoverli. Si elenca e si toglie a pagine, sempre dall'inizio (quelli tolti spariscono dall'elenco).
 * Lancia se l'elenco o la rimozione falliscono, e anche se una rimozione non toglie nulla pur essendoci file (accesso
 * negato in silenzio): niente giri a vuoto.
 */
export async function eliminaFileEsperimento(espId: string): Promise<number> {
  // Una stringa vuota o con `..` elencherebbe altro: l'id deve essere un uuid.
  if (!eUuid(espId)) throw new Error(ESPERIMENTO_NON_TROVATO)
  const cartella = espId.toLowerCase()
  let tolti = 0
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list(cartella, { limit: PERCORSI_PER_RICHIESTA, offset: 0 })
    if (error) throw error
    // Le voci senza id sono sottocartelle: nella cartella dell'esperimento non dovrebbero esserci, e non si toccano.
    const percorsi = (data ?? []).filter(f => f.id).map(f => `${cartella}/${f.name}`)
    if (percorsi.length === 0) return tolti
    const { data: rimossi, error: erroreRimozione } = await supabase.storage.from(BUCKET).remove(percorsi)
    if (erroreRimozione) throw erroreRimozione
    if (!rimossi || rimossi.length === 0) throw new Error('Lo Storage non ha tolto i file richiesti.')
    tolti += rimossi.length
  }
}
