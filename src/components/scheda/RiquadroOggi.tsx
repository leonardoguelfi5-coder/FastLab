import { nuovoId } from '@/lib/id'
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { opzioniMisurePianta } from '@/api/query'
import { misureStrumentoNelGiorno } from '@/domain/misure'
import type { ConfigEsperimento, Misura, Parametro, Strumento, Pianta } from '@/domain/tipi'
import { percorsoPianta } from '@/lib/percorsi'
import { chiaveAperto, chiaveBozza, leggiAperto, leggiBozza } from './bozza'
import { ModuloOggi, type ArrivoScheda, type Avanti, type StatoModulo } from './ModuloOggi'
import { titoloRiquadro } from './titolo'

/** Il modulo con cui si apre il riquadro, deciso da chi lo mostra: una misura nuova o la correzione di una del giorno. */
export type ModuloIniziale = { tipo: 'nuova' } | { tipo: 'correggi'; misuraId: string }

/** I parametri da compilare con uno strumento: nel suo ordine, senza gli archiviati. */
function parametriDelloStrumento(config: ConfigEsperimento, strumento: Strumento): Parametro[] {
  const perId = new Map(config.parametri.map(p => [p.id, p]))
  return [...strumento.parametri]
    .sort((a, b) => a.ordine - b.ordine)
    .map(pp => perId.get(pp.parametro_id))
    .filter((p): p is Parametro => p !== undefined && !p.archiviato)
}

interface RiquadroOggiProps {
  espId: string
  config: ConfigEsperimento
  pianta: Pianta
  strumento: Strumento
  /** Tutte le misure della pianta, già caricate. */
  misure: Misura[]
  /** Fissa per tutta la vita del riquadro: la pagina lo rimonta quando cambia (vedi SchedaPianta). */
  dataRilievo: string
  oggi: string
  /** La pianta che segue (nell'ordine dell'esperimento, o nel giro); `null` sull'ultima. Le sue misure si leggono già. */
  successiva: Pianta | null
  /**
   * Il pulsante "Salva e …". Senza, "Salva e vai alla #N" verso la scheda della pianta successiva, e sull'ultima
   * solo "Salva". La misura nel giro lo usa per restare nel giro e, alla fine, per "Salva e termina".
   */
  avanti?: Avanti | null
  /**
   * Il modulo da aprire, scelto con un tocco (vale l'attesa contro il doppio tocco). Senza, quello lasciato l'ultima
   * volta (se ne resta la bozza), altrimenti una misura nuova. Con `nuova` l'id non è mai quello di una misura già
   * salvata; con `correggi` di una misura che non è del giorno si apre la misura nuova.
   */
  iniziale?: ModuloIniziale
  /** Esegue l'azione, chiedendo prima se scartare i valori non salvati del modulo. */
  conferma: (azione: () => void) => void
  onModifiche: (stato: StatoModulo | null) => void
}

/**
 * Il riquadro "Oggi · 🌡 Termometro" della scheda: le misure già fatte con questo strumento alla data di rilievo e il
 * modulo per una misura nuova o per correggerne una. Il modulo ha un id (quello della misura nuova, o quello della
 * misura che si corregge) e si rimonta quando cambia: così un "Annulla" in sospeso non finisce nella misura sbagliata.
 */
export function RiquadroOggi({
  espId, config, pianta, strumento, misure, dataRilievo, oggi, successiva, avanti: avantiScelto, iniziale, conferma, onModifiche,
}: RiquadroOggiProps) {
  const location = useLocation()
  const queryClient = useQueryClient()
  const base = { espId, piantaId: pianta.id, strumentoId: strumento.id, dataRilievo }
  const chiaveNuova = chiaveBozza({ ...base, misuraId: null })
  const aperto = chiaveAperto(base)

  const misureOggi = useMemo(() => misureStrumentoNelGiorno(misure, strumento.id, dataRilievo), [misure, strumento.id, dataRilievo])

  // L'id di una misura nuova cambia solo dopo un salvataggio riuscito: un nuovo tentativo dopo un errore, "Scarta" sulla
  // bozza ripresa o un giro in una correzione lo riusano, e l'upsert per id non crea doppioni anche se un tentativo
  // dato per fallito (un timeout) era arrivato al server. Una bozza ripresa porta il suo. Se invece la misura con
  // quell'id è già tra quelle della pianta (il server l'ha, e la si vede), il modulo nuovo non la riscrive: id nuovo.
  const idLibero = (id: string) => (misure.some(m => m.id === id) ? nuovoId() : id)
  // "Nuova misura" scelta all'arrivo su una pianta già misurata: mai l'id di una misura che c'è già. Una bozza della
  // misura nuova (arrivata nel frattempo da un salvataggio fallito dopo l'uscita) si riprende comunque: ha dei valori.
  const [formId, setFormId] = useState(() => {
    const id = leggiBozza(chiaveNuova)?.id ?? nuovoId()
    return iniziale?.tipo === 'nuova' ? idLibero(id) : id
  })
  // Tornando alla scheda si riapre il modulo che si era lasciato: la correzione di una misura del giorno, se ne
  // resta la bozza; altrimenti la misura nuova. Chi mostra il riquadro può scegliere lui (`iniziale`).
  const [inCorrezione, setInCorrezione] = useState<Misura | null>(() => {
    if (iniziale?.tipo === 'correggi') return misureOggi.find(m => m.id === iniziale.misuraId) ?? null
    if (iniziale?.tipo === 'nuova') return null
    const id = leggiAperto(aperto)
    if (id === null || leggiBozza(chiaveBozza({ ...base, misuraId: id }))?.id !== id) return null
    return misureOggi.find(m => m.id === id) ?? null
  })
  // Dopo "Scarta" su una bozza ripresa si riparte dallo stesso modulo (stesso id): serve una chiave nuova per rimontare.
  const [ripartenze, setRipartenze] = useState(0)
  const [appenaSalvata, setAppenaSalvata] = useState<Misura | null>(null)
  const [primoCampo, setPrimoCampo] = useState(() => (location.state as ArrivoScheda | null)?.primoCampo === true)

  // La pianta dopo è quasi sempre la prossima: le sue misure si caricano già, così "Salva e vai" non aspetta.
  const idSuccessiva = successiva?.id
  useEffect(() => {
    if (idSuccessiva) void queryClient.prefetchQuery(opzioniMisurePianta(idSuccessiva))
  }, [queryClient, idSuccessiva])

  const parametri = useMemo(() => parametriDelloStrumento(config, strumento), [config, strumento])
  const obbligatori = useMemo(
    () => new Set(strumento.parametri.filter(pp => pp.obbligatorio).map(pp => pp.parametro_id)),
    [strumento],
  )
  // I precompilati del modulo dopo un salvataggio partono dalla misura appena salvata, anche prima che la cache la riporti.
  const misurePerIniziali = useMemo(
    () => (appenaSalvata ? [appenaSalvata, ...misure.filter(m => m.id !== appenaSalvata.id)] : misure),
    [appenaSalvata, misure],
  )

  function apriNuova() {
    setInCorrezione(null)
    setFormId(idLibero)
    setPrimoCampo(false)
  }

  function correggi(m: Misura) {
    setInCorrezione(m)
    setPrimoCampo(false)
  }

  function dopoSalvataggio(m: Misura) {
    setAppenaSalvata(m)
    setInCorrezione(null)
    // L'unico punto in cui una misura nuova prende un id nuovo: quella di prima è salvata.
    setFormId(nuovoId())
    setPrimoCampo(false)
  }

  function daCapo() {
    if (!inCorrezione) setFormId(idLibero)
    setRipartenze(n => n + 1)
    setPrimoCampo(false)
  }

  const avanti = avantiScelto !== undefined
    ? avantiScelto
    : successiva && { testo: `e vai alla #${successiva.etichetta}`, percorso: percorsoPianta(espId, successiva.id) }

  const titolo = titoloRiquadro(strumento, dataRilievo, oggi)

  return (
    <ModuloOggi
      key={`${pianta.id}:${inCorrezione ? `misura:${inCorrezione.id}` : `nuova:${formId}`}:${ripartenze}`}
      espId={espId}
      config={config}
      pianta={pianta}
      strumento={strumento}
      titolo={titolo}
      parametri={parametri}
      obbligatori={obbligatori}
      id={inCorrezione?.id ?? formId}
      chiave={chiaveBozza({ ...base, misuraId: inCorrezione?.id ?? null })}
      aperto={aperto}
      misura={inCorrezione}
      misureOggi={misureOggi}
      misurePianta={misurePerIniziali}
      dataRilievo={dataRilievo}
      avanti={avanti}
      primoCampo={primoCampo}
      // Anche il modulo scelto con un tocco all'arrivo (`iniziale`) compare dove c'erano i pulsanti della scelta.
      dopoSalvataggio={primoCampo || appenaSalvata !== null || iniziale !== undefined}
      onCorreggi={m => conferma(() => correggi(m))}
      onNuovaMisura={() => conferma(apriNuova)}
      onSalvata={dopoSalvataggio}
      onDaCapo={daCapo}
      onModifiche={onModifiche}
    />
  )
}
