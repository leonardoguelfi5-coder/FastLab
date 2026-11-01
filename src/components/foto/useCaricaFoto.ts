import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { caricaFoto } from '@/api/foto'
import { chiavi } from '@/api/query'
import { oggiLocale } from '@/lib/date'
import { messaggioErrore } from '@/lib/errori'
import { nuovoId } from '@/lib/id'
import { dataDiScatto } from '@/lib/immagini'
import { OPZIONI_ERRORE_TARDIVO } from '@/lib/toastErrore'
import { toastSalvato } from '@/lib/toastSalvato'

/** Una foto scelta e non ancora salvata: in coda, in corso o fallita (le salvate escono dall'elenco). */
export interface ElementoFoto {
  /** L'id della foto, scelto una volta sola quando si sceglie il file: un nuovo tentativo lo riusa, quindi non si duplica. */
  id: string
  nome: string
  file: File
  stato: 'attesa' | 'corso' | 'errore'
  errore: string | null
  /** Esperimento e collegamenti sono quelli del momento della scelta: cambiare pagina nel frattempo non li sposta. */
  espId: string
  piantaId: string | null
  notaId: string | null
}

export interface CaricaFoto {
  elementi: ElementoFoto[]
  /** A che punto è il giro in corso: `fatte` foto già provate su `totale`; null se non si carica nulla. */
  giro: { fatte: number; totale: number } | null
  aggiungi: (files: ArrayLike<File>) => void
  riprova: (id: string) => void
  togli: (id: string) => void
}

// Chiudere o ricaricare la scheda del browser mentre una foto è in viaggio la perderebbe: il browser chiede conferma.
// È a livello di modulo, come per l'eliminazione con Annulla, perché un caricamento sopravvive alla pagina che l'ha avviato.
let inViaggio = 0
let ascolta = false
function avvisaSeInViaggio(evento: BeforeUnloadEvent) {
  if (inViaggio === 0) return
  evento.preventDefault()
  evento.returnValue = ''
}
function cambiaInViaggio(delta: number) {
  inViaggio += delta
  if (inViaggio > 0 && !ascolta) window.addEventListener('beforeunload', avvisaSeInViaggio)
  else if (inViaggio === 0 && ascolta) window.removeEventListener('beforeunload', avvisaSeInViaggio)
  ascolta = inViaggio > 0
}

/**
 * Il caricamento delle foto scelte (fotocamera o galleria), una alla volta: comprime, carica nello Storage e scrive la
 * riga (`caricaFoto`). Ogni foto ha il suo stato e il suo errore con "Riprova".
 *
 * - L'id nasce quando si sceglie il file e non cambia: "Riprova" lo riusa, e `caricaFoto` riconosce il file già
 *   caricato, quindi la stessa foto non si duplica.
 * - La data è quella di scatto (EXIF) o, senza, il giorno di oggi nel momento in cui la foto parte.
 * - Un caricamento iniziato si porta a termine anche se si lascia la pagina: il ciclo vive in questa chiusura, non in
 *   un effetto. Se poi una foto fallisce non c'è più una riga dove mostrare l'errore: compare un toast che resta.
 */
export function useCaricaFoto(espId: string, collegamento: { piantaId?: string | null; notaId?: string | null } = {}): CaricaFoto {
  const queryClient = useQueryClient()
  const [elementi, setElementi] = useState<ElementoFoto[]>([])
  const [giro, setGiro] = useState<CaricaFoto['giro']>(null)

  // Lo stato che il ciclo di caricamento legge e scrive fuori dai disegni.
  const montata = useRef(true)
  const elenco = useRef<ElementoFoto[]>([])
  const coda = useRef<ElementoFoto[]>([])
  const attivo = useRef(false)
  const conteggio = useRef({ totale: 0, fatte: 0, salvate: 0 })
  useEffect(() => {
    montata.current = true
    return () => { montata.current = false }
  }, [])

  const scrivi = useCallback((fai: (prima: ElementoFoto[]) => ElementoFoto[]) => {
    elenco.current = fai(elenco.current)
    setElementi(elenco.current)
  }, [])
  const cambia = useCallback((id: string, patch: Partial<ElementoFoto>) => {
    scrivi(prima => prima.map(e => (e.id === id ? { ...e, ...patch } : e)))
  }, [scrivi])
  const mostraGiro = useCallback(() => {
    setGiro({ fatte: conteggio.current.fatte, totale: conteggio.current.totale })
  }, [])

  const lavora = useCallback(async () => {
    if (attivo.current) return
    attivo.current = true
    cambiaInViaggio(1)
    try {
      for (let e = coda.current.shift(); e; e = coda.current.shift()) {
        cambia(e.id, { stato: 'corso', errore: null })
        mostraGiro()
        try {
          // La data si decide ora, non alla scelta: una foto che parte dopo mezzanotte è di oggi.
          const data = (await dataDiScatto(e.file)) ?? oggiLocale()
          await caricaFoto(e.espId, { id: e.id, file: e.file, data, piantaId: e.piantaId, notaId: e.notaId })
          conteggio.current.salvate += 1
          scrivi(prima => prima.filter(x => x.id !== e.id))
        } catch (errore) {
          const testo = messaggioErrore(errore)
          cambia(e.id, { stato: 'errore', errore: testo })
          // Senza la pagina nessuno vedrebbe la riga con l'errore: lo dice un toast che resta finché non lo si chiude.
          if (!montata.current) {
            toast.error(`La foto «${e.nome}» non è stata caricata: ${testo}`, OPZIONI_ERRORE_TARDIVO)
          }
        }
        conteggio.current.fatte += 1
        // Salvata, o fallita a metà (il file potrebbe essere arrivato): l'elenco e lo spazio si rileggono comunque.
        void queryClient.invalidateQueries({ queryKey: chiavi.foto(e.espId) })
      }
    } finally {
      const { salvate } = conteggio.current
      conteggio.current = { totale: 0, fatte: 0, salvate: 0 }
      attivo.current = false
      cambiaInViaggio(-1)
      setGiro(null)
      if (salvate > 0) toastSalvato(salvate === 1 ? 'Foto salvata.' : `${salvate} foto salvate.`)
    }
  }, [cambia, mostraGiro, queryClient, scrivi])

  const accoda = useCallback((nuovi: ElementoFoto[]) => {
    if (nuovi.length === 0) return
    // Un giro finito non lascia numeri a quello dopo.
    if (!attivo.current) conteggio.current = { totale: 0, fatte: 0, salvate: 0 }
    conteggio.current.totale += nuovi.length
    coda.current.push(...nuovi)
    mostraGiro()
    void lavora()
  }, [lavora, mostraGiro])

  const { piantaId = null, notaId = null } = collegamento
  const aggiungi = useCallback((files: ArrayLike<File>) => {
    const nuovi = Array.from(files).map((file): ElementoFoto => ({
      id: nuovoId(), nome: file.name || 'Foto', file, stato: 'attesa', errore: null, espId, piantaId, notaId,
    }))
    if (nuovi.length === 0) return
    scrivi(prima => [...prima, ...nuovi])
    accoda(nuovi)
  }, [accoda, espId, notaId, piantaId, scrivi])

  const riprova = useCallback((id: string) => {
    const e = elenco.current.find(x => x.id === id)
    if (!e || e.stato !== 'errore') return
    const di = { ...e, stato: 'attesa' as const, errore: null }
    scrivi(prima => prima.map(x => (x.id === id ? di : x)))
    accoda([di])
  }, [accoda, scrivi])

  const togli = useCallback((id: string) => {
    // Solo una foto fallita: una in coda o in corso si porta a termine.
    scrivi(prima => prima.filter(x => x.id !== id || x.stato !== 'errore'))
  }, [scrivi])

  return { elementi, giro, aggiungi, riprova, togli }
}
