import { archiviaFileFoto, listaFoto, urlFoto } from '@/api/foto'
import { listaNote } from '@/api/note'
import { creaCsvFoto, nomeFileZip, nomiFileZip } from '@/domain/archivioFoto'
import type { ConfigEsperimento } from '@/domain/tipi'
import { formattaData, oggiLocale } from '@/lib/date'
import { ErroreApp } from '@/lib/errori'
import { useArchivioSessione } from './archivioSessione'

/** Le foto scaricate in parallelo: poche, per non saturare la rete del telefono né la memoria. */
const CONCORRENZA = 3
/** Gli URL firmati si chiedono a gruppi di questa misura, appena prima di scaricarli (valgono un'ora). */
const URL_PER_RICHIESTA = 100
/** Quanto si aspetta prima di liberare l'indirizzo del Blob: tolto subito, qualche browser (Safari su iPhone) non farebbe in tempo a leggerlo. */
const ATTESA_REVOCA_MS = 30_000

/** Esegue `lavora` su tutti gli elementi, `quanti` alla volta; al primo errore non parte più nessuno e l'errore si rilancia. */
async function inParallelo<T>(elementi: T[], quanti: number, lavora: (elemento: T) => Promise<void>): Promise<void> {
  let prossimo = 0
  let fallito = false
  let errore: unknown
  const corridore = async () => {
    while (!fallito) {
      const i = prossimo++
      if (i >= elementi.length) return
      try {
        await lavora(elementi[i])
      } catch (e) {
        if (!fallito) { fallito = true; errore = e }
        return
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(quanti, elementi.length) }, corridore))
  if (fallito) throw errore
}

/** Scarica un file da un URL firmato. Una risposta che non è un successo è un errore: uno zip senza una foto non va consegnato. */
async function scaricaBytes(url: string): Promise<Uint8Array> {
  const risposta = await fetch(url)
  if (!risposta.ok) throw new ErroreApp(`Una foto non si è scaricata (errore ${risposta.status}). Riprova.`)
  return new Uint8Array(await risposta.arrayBuffer())
}

/** Consegna il file al browser: un link `download` su un Blob, che poi si libera. */
function consegna(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), ATTESA_REVOCA_MS)
}

export interface EsitoArchivio {
  /** Le foto con il file che sono nello zip. */
  foto: number
  nomeFile: string
}

/**
 * Scarica le foto non archiviate dell'esperimento e le consegna in un .zip, con un `foto.csv` (anche le già archiviate,
 * segnate). Si ferma alla prima foto che non si scarica: uno zip incompleto non è un download riuscito, non parte e non
 * abilita «Libera lo spazio». Solo a zip consegnato si ricordano gli id delle foto che contiene.
 *
 * La libreria è `fflate` (piccola, senza dipendenze, in memoria e senza worker: `zipSync`, che in jsdom e nei test va
 * ovunque). Le foto sono già JPEG compressi: livello 0, si copiano senza ricomprimere. Si carica con un import dinamico
 * solo quando serve, quindi resta fuori dal bundle principale dell'app. Lo zip sta tutto in memoria: per qualche
 * centinaio di foto da ~350 KB va bene sul telefono; per migliaia no (vedi il peso nello spazio delle Impostazioni).
 *
 * `onProgresso(fatte, totale)` dice a che punto si è, dopo ogni foto scaricata.
 */
export async function scaricaArchivio(
  { espId, config, onProgresso }: { espId: string; config: ConfigEsperimento; onProgresso: (fatte: number, totale: number) => void },
): Promise<EsitoArchivio> {
  // Elenchi freschi, non quelli in cache: lo zip e «Libera» devono parlare delle foto che ci sono adesso.
  const [elenco, note] = await Promise.all([listaFoto(espId), listaNote(espId)])
  // `listaFoto` è dalla più recente: nel CSV e nello zip si va in ordine di tempo.
  const tutte = [...elenco].reverse()
  const conFile = tutte.filter(f => !f.archiviata)
  if (conFile.length === 0) throw new ErroreApp('Non ci sono foto con il file da scaricare.')

  const { zipSync, strToU8 } = await import('fflate')

  const nomi = nomiFileZip(conFile, config.piante)
  const contenuto: Record<string, [Uint8Array, { level: 0 | 6 }]> = {}
  let fatte = 0
  onProgresso(0, conFile.length)
  for (let da = 0; da < conFile.length; da += URL_PER_RICHIESTA) {
    const gruppo = conFile.slice(da, da + URL_PER_RICHIESTA)
    const urls = await urlFoto(gruppo.map(f => f.percorso))
    await inParallelo(gruppo, CONCORRENZA, async f => {
      const url = urls.get(f.percorso)
      if (!url) throw new ErroreApp(`La foto del ${formattaData(f.data)} non è disponibile nello spazio delle foto.`)
      contenuto[nomi.get(f.id) as string] = [await scaricaBytes(url), { level: 0 }]
      onProgresso(++fatte, conFile.length)
    })
  }
  contenuto['foto.csv'] = [strToU8(creaCsvFoto(tutte, nomi, { piante: config.piante, trattamenti: config.trattamenti, note })), { level: 6 }]

  const nomeFile = nomeFileZip(config.esperimento.nome, oggiLocale())
  consegna(new Blob([zipSync(contenuto) as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), nomeFile)
  useArchivioSessione.getState().segna(espId, conFile.map(f => f.id))
  return { foto: conFile.length, nomeFile }
}

/**
 * «Libera lo spazio»: toglie i file delle foto che erano nello zip scaricato in questa sessione e le segna archiviate
 * (vedi `archiviaFileFoto`). Le foto aggiunte dopo il download non sono nell'elenco degli id e non si toccano; una
 * foto dello zip già archiviata o eliminata nel frattempo esce dall'elenco. Senza un download riuscito non fa niente
 * e lo dice. A buon fine il download si dimentica (non si libera due volte); se si ferma a metà resta valido, e un nuovo
 * giro porta a termine il resto. Dice quante foto ha archiviato.
 */
export async function liberaSpazio(espId: string): Promise<number> {
  const ids = useArchivioSessione.getState().scaricati[espId]
  if (ids === undefined) throw new ErroreApp('Prima scarica le foto in un .zip: lo spazio si libera solo dopo un download riuscito.')
  const nelloZip = new Set(ids)
  const daArchiviare = (await listaFoto(espId)).filter(f => nelloZip.has(f.id) && !f.archiviata)
  const n = daArchiviare.length === 0 ? 0 : await archiviaFileFoto(espId, daArchiviare)
  useArchivioSessione.getState().dimentica(espId)
  return n
}
