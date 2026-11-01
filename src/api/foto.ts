import { ErroreApp, ESPERIMENTO_NON_TROVATO } from '@/lib/errori'
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
/** Il nome di un file di foto nella cartella dell'esperimento. */
const NOME_FOTO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/
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
 * Il file va prima della riga: una riga senza file mostrerebbe un'immagine rotta. Se la riga poi viene rifiutata dal
 * server, il file appena caricato si toglie (best effort: l'errore che si vede è quello della riga), così non resta un
 * file senza riga. Se l'esito è incerto (errore di rete) il file resta, vedi sotto.
 * Il caricamento è con `upsert: false` (lo Storage non ha una policy di aggiornamento) e "esiste già" vale come riuscito:
 * è il file di un tentativo precedente con lo stesso id, quindi con la stessa foto. In quel caso, se la riga non si
 * scrive, il file non si tocca: non l'ha messo questo tentativo, e un nuovo tentativo con lo stesso id lo riusa. La riga
 * si scrive per id, quindi anche un tentativo ripetuto dopo una risposta persa non crea doppioni.
 */
export async function caricaFoto(espId: string, d: DatiFoto): Promise<Foto> {
  // Prima di comprimere: con un id che non è un uuid la riga e il vincolo sul percorso fallirebbero dopo il lavoro e il caricamento.
  if (!eUuid(espId)) throw new Error(ESPERIMENTO_NON_TROVATO)
  if (!eUuid(d.id)) throw new Error('Identificativo della foto non valido.')
  const { blob, larghezza, altezza } = await comprimi(d.file)
  const percorso = percorsoFoto(espId, d.id)

  const { error: erroreFile } = await supabase.storage.from(BUCKET).upload(percorso, blob, { contentType: 'image/jpeg', upsert: false })
  const nuovo = !erroreFile
  if (erroreFile && !eGiaEsistente(erroreFile)) throw erroreFile

  const foto: Foto = {
    id: d.id, data: d.data, percorso, larghezza, altezza, byte: blob.size,
    pianta_id: d.piantaId ?? null, nota_id: d.notaId ?? null, archiviata: false, archiviata_il: null,
  }
  const { error } = await supabase.from('foto').upsert(aRigaFoto(espId, foto), { onConflict: 'id' })
  if (error) {
    // Il file si toglie solo se la riga di sicuro non c'è: una risposta vera di PostgREST (un `code` o uno stato HTTP).
    // Con un errore di rete la richiesta potrebbe essere arrivata lo stesso: togliere il file lascerebbe una riga senza
    // file, peggio di un file senza riga, che un nuovo tentativo con lo stesso id riusa ("esiste già").
    if (nuovo && eRispostaDelServer(error)) await togliFileSilenzioso(percorso)
    throw error
  }
  return foto
}

/** Vero se l'errore è una risposta del server (PostgREST ha un `code` testuale, o c'è uno stato HTTP), non un guasto di rete o ignoto. */
function eRispostaDelServer(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  const { code, status } = e as { code?: unknown; status?: unknown }
  return (typeof code === 'string' && code !== '') || typeof status === 'number'
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
 * I nomi dei file delle foto nella cartella di un esperimento (`<uuid>.jpg`), letti a pagine. Contano solo i nomi
 * `<uuid>.jpg` (le foto): le sottocartelle (voci senza id) e altri file, come il segnaposto che il servizio può creare in
 * una cartella vuota, non sono nostri e non si toccano. Lancia se l'elenco fallisce.
 * L'elenco è a pagine e non è un'istantanea: una cancellazione concorrente durante la lettura può spostare i nomi tra
 * una pagina e l'altra e far saltare un file, che resterebbe nello Storage senza che nessuno lo sappia (spazio
 * occupato, nessun dato perso: la foto è nello zip e la sua riga la segna il giro dopo).
 */
async function nomiFileFoto(cartella: string): Promise<Set<string>> {
  const nomi = new Set<string>()
  for (let offset = 0; ; offset += PERCORSI_PER_RICHIESTA) {
    const { data, error } = await supabase.storage.from(BUCKET).list(cartella, { limit: PERCORSI_PER_RICHIESTA, offset })
    if (error) throw error
    const pagina = data ?? []
    for (const f of pagina) if (f.id && NOME_FOTO.test(f.name)) nomi.add(f.name)
    if (pagina.length < PERCORSI_PER_RICHIESTA) break
  }
  return nomi
}

/**
 * I nomi (`<uuid>.jpg`) dei file delle foto che ci sono ora nello Storage per un esperimento. Serve all'archivio: una
 * foto non archiviata senza file (un giro di «Libera lo spazio» interrotto tra la rimozione e l'update) non si può
 * scaricare e non deve bloccare lo zip. Lancia se l'id non è un uuid o se l'elenco fallisce.
 */
export async function fileFotoPresenti(espId: string): Promise<Set<string>> {
  if (!eUuid(espId)) throw new Error(ESPERIMENTO_NON_TROVATO)
  return nomiFileFoto(espId.toLowerCase())
}

/**
 * Toglie dallo Storage tutti i file di un esperimento (la sua cartella `<esperimento_id>/`) e dice quanti. Serve prima di
 * eliminarlo: il database non può toccare lo Storage, e dopo l'eliminazione nessuno ne è più membro, quindi nessuno
 * potrebbe più rimuoverli.
 * Lancia se l'elenco o la rimozione falliscono, e anche se una rimozione non toglie nulla pur essendoci file (accesso
 * negato in silenzio): niente giri a vuoto.
 */
export async function eliminaFileEsperimento(espId: string): Promise<number> {
  // Una stringa vuota o con `..` elencherebbe altro: l'id deve essere un uuid.
  if (!eUuid(espId)) throw new Error(ESPERIMENTO_NON_TROVATO)
  const cartella = espId.toLowerCase()

  // Prima si elenca tutta la cartella, poi si toglie: elencare mentre si toglie sposterebbe le posizioni.
  const nomi = await nomiFileFoto(cartella)

  const percorsi = [...nomi].map(n => `${cartella}/${n}`)
  let tolti = 0
  for (let i = 0; i < percorsi.length; i += PERCORSI_PER_RICHIESTA) {
    const { data: rimossi, error } = await supabase.storage.from(BUCKET).remove(percorsi.slice(i, i + PERCORSI_PER_RICHIESTA))
    if (error) throw error
    // Un accesso negato in silenzio non toglie nulla senza dare errore: non si può dire che l'esperimento sia pulito.
    if (!rimossi || rimossi.length === 0) throw new Error('Lo Storage non ha tolto i file richiesti.')
    tolti += rimossi.length
  }
  return tolti
}

/**
 * Segna archiviate (con la data di adesso) le righe date: `archiviata` e `archiviata_il` insieme, come impone il
 * database. A gruppi da 100: il filtro `in` va nell'URL e non può crescere senza limite. Dice quante ne ha toccate.
 */
async function segnaArchiviate(espId: string, ids: string[], adesso: string): Promise<number> {
  let toccate = 0
  for (let i = 0; i < ids.length; i += PERCORSI_PER_RICHIESTA) {
    const { data, error } = await supabase
      .from('foto')
      .update({ archiviata: true, archiviata_il: adesso })
      .eq('esperimento_id', espId)
      .in('id', ids.slice(i, i + PERCORSI_PER_RICHIESTA))
      .select('id')
    controllaRighe({ data, error })
    toccate += data?.length ?? 0
  }
  return toccate
}

/**
 * Libera lo spazio di foto già scaricate nell'archivio .zip: toglie i loro file dallo Storage e segna le righe
 * archiviate. Le righe restano. Le `foto` sono quelle da archiviare (non già archiviate); ogni altra foto, anche
 * un'altra che ha il file nella stessa cartella, non si tocca. Dice quante righe ha segnato.
 *
 * Coerenza tra file e righe, a gruppi da 100:
 * 1. Prima si elenca la cartella (l'elenco non è un'istantanea: vedi `nomiFileFoto`). Una foto il cui file non c'è già (un giro precedente l'aveva tolto ma la riga non si
 *    era aggiornata: errore di rete tra la rimozione e l'update) si segna subito archiviata. Per le foto date il file
 *    c'è stato di sicuro (è nello zip), quindi la sua assenza non può che essere una rimozione nostra.
 * 2. Poi per ogni gruppo si tolgono i file e SOLO per i nomi che `remove` restituisce, cioè i file davvero rimossi, si
 *    aggiornano le righe, prima di passare al gruppo dopo. Un file non rimosso (accesso negato in silenzio) lascia la
 *    sua foto com'è, con il file: alla fine si lancia un errore, e un nuovo giro riprova solo quelle.
 * 3. Se è l'update a fallire dopo una rimozione riuscita, l'errore arriva a chi chiama: il file non c'è più e la riga dice
 *    ancora "non archiviata", ma il passo 1 del giro dopo la sistema. Nessun file va perso senza che lo zip lo abbia.
 */
export async function archiviaFileFoto(espId: string, foto: Foto[]): Promise<number> {
  if (!eUuid(espId)) throw new Error(ESPERIMENTO_NON_TROVATO)
  // Il percorso di una riga è sempre `<esperimento>/<id>.jpg` (lo impone il database): se non lo è, qualcosa non va e non si tocca niente.
  for (const f of foto) if (f.percorso !== percorsoFoto(espId, f.id)) throw new Error('Percorso della foto non valido.')
  if (foto.length === 0) return 0

  const cartella = espId.toLowerCase()
  const esistenti = await nomiFileFoto(cartella)
  const nomeDi = (f: Foto) => f.percorso.slice(cartella.length + 1)
  const adesso = new Date().toISOString()

  let archiviate = await segnaArchiviate(espId, foto.filter(f => !esistenti.has(nomeDi(f))).map(f => f.id), adesso)

  const daTogliere = foto.filter(f => esistenti.has(nomeDi(f)))
  let nonTolti = 0
  for (let i = 0; i < daTogliere.length; i += PERCORSI_PER_RICHIESTA) {
    const gruppo = daTogliere.slice(i, i + PERCORSI_PER_RICHIESTA)
    const { data: rimossi, error } = await supabase.storage.from(BUCKET).remove(gruppo.map(f => f.percorso))
    if (error) throw error
    // Il servizio dà il nome completo nel bucket; si accetta anche solo il nome del file, per non dipendere dal formato.
    const tolti = new Set((rimossi ?? []).flatMap(r => [r.name, r.name.split('/').pop() ?? '']))
    const fatti = gruppo.filter(f => tolti.has(f.percorso) || tolti.has(nomeDi(f)))
    nonTolti += gruppo.length - fatti.length
    archiviate += await segnaArchiviate(espId, fatti.map(f => f.id), adesso)
  }
  if (nonTolti > 0) {
    throw new ErroreApp(nonTolti === 1 ? 'Lo Storage non ha tolto 1 file: la sua foto resta com\'è.' : `Lo Storage non ha tolto ${nonTolti} file: le loro foto restano come sono.`)
  }
  return archiviate
}
