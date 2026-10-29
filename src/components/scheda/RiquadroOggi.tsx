import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { opzioniMisurePianta } from '@/api/query'
import type { ConfigEsperimento, Misura, Parametro, Passata, Pianta } from '@/domain/tipi'
import { formattaData } from '@/lib/date'
import { chiaveAperto, chiaveBozza, leggiAperto, leggiBozza } from './bozza'
import { ModuloOggi, type ArrivoScheda, type StatoModulo } from './ModuloOggi'

const confronta = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** I parametri da compilare con una passata: nel suo ordine, senza gli archiviati. */
function parametriDellaPassata(config: ConfigEsperimento, passata: Passata): Parametro[] {
  const perId = new Map(config.parametri.map(p => [p.id, p]))
  return [...passata.parametri]
    .sort((a, b) => a.ordine - b.ordine)
    .map(pp => perId.get(pp.parametro_id))
    .filter((p): p is Parametro => p !== undefined && !p.archiviato)
}

interface RiquadroOggiProps {
  espId: string
  config: ConfigEsperimento
  pianta: Pianta
  passata: Passata
  /** Tutte le misure della pianta, già caricate. */
  misure: Misura[]
  /** Fissa per tutta la vita del riquadro: la pagina lo rimonta quando cambia (vedi SchedaPianta). */
  dataRilievo: string
  oggi: string
  /** La pianta che segue nell'ordine dell'esperimento; `null` sull'ultima. */
  successiva: Pianta | null
  /** Esegue l'azione, chiedendo prima se scartare i valori non salvati del modulo. */
  conferma: (azione: () => void) => void
  onModifiche: (stato: StatoModulo | null) => void
}

/**
 * Il riquadro "Oggi · 🌡 Termometro" della scheda: le misure già fatte con questa passata alla data di rilievo e il
 * modulo per una misura nuova o per correggerne una. Il modulo ha un id (quello della misura nuova, o quello della
 * misura che si corregge) e si rimonta quando cambia: così un "Annulla" in sospeso non finisce nella misura sbagliata.
 */
export function RiquadroOggi({
  espId, config, pianta, passata, misure, dataRilievo, oggi, successiva, conferma, onModifiche,
}: RiquadroOggiProps) {
  const location = useLocation()
  const queryClient = useQueryClient()
  const base = { espId, piantaId: pianta.id, passataId: passata.id, dataRilievo }
  const chiaveNuova = chiaveBozza({ ...base, misuraId: null })
  const aperto = chiaveAperto(base)

  const misureOggi = useMemo(
    () => misure
      .filter(m => m.passata_id === passata.id && m.data_rilievo === dataRilievo)
      .sort((a, b) => confronta(a.ora, b.ora)),
    [misure, passata.id, dataRilievo],
  )

  // L'id di una misura nuova cambia solo dopo un salvataggio riuscito: un nuovo tentativo dopo un errore, "Scarta" sulla
  // bozza ripresa o un giro in una correzione lo riusano, e l'upsert per id non crea doppioni anche se un tentativo
  // dato per fallito (un timeout) era arrivato al server. Una bozza ripresa porta il suo. Se invece la misura con
  // quell'id è già tra quelle della pianta (il server l'ha, e la si vede), il modulo nuovo non la riscrive: id nuovo.
  const [formId, setFormId] = useState(() => leggiBozza(chiaveNuova)?.id ?? crypto.randomUUID())
  const idLibero = (id: string) => (misure.some(m => m.id === id) ? crypto.randomUUID() : id)
  // Tornando alla scheda si riapre il modulo che si era lasciato: la correzione di una misura del giorno, se ne
  // resta la bozza; altrimenti la misura nuova.
  const [inCorrezione, setInCorrezione] = useState<Misura | null>(() => {
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

  const parametri = useMemo(() => parametriDellaPassata(config, passata), [config, passata])
  const obbligatori = useMemo(
    () => new Set(passata.parametri.filter(pp => pp.obbligatorio).map(pp => pp.parametro_id)),
    [passata],
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
    setFormId(crypto.randomUUID())
    setPrimoCampo(false)
  }

  function daCapo() {
    if (!inCorrezione) setFormId(idLibero)
    setRipartenze(n => n + 1)
    setPrimoCampo(false)
  }

  const titolo = `${dataRilievo === oggi ? 'Oggi' : formattaData(dataRilievo)} · ${passata.icona ? `${passata.icona} ` : ''}${passata.nome}`

  return (
    <ModuloOggi
      key={`${pianta.id}:${inCorrezione ? `misura:${inCorrezione.id}` : `nuova:${formId}`}:${ripartenze}`}
      espId={espId}
      config={config}
      pianta={pianta}
      passata={passata}
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
      oggi={oggi}
      successiva={successiva}
      primoCampo={primoCampo}
      dopoSalvataggio={primoCampo || appenaSalvata !== null}
      onCorreggi={m => conferma(() => correggi(m))}
      onNuovaMisura={() => conferma(apriNuova)}
      onSalvata={dopoSalvataggio}
      onDaCapo={daCapo}
      onModifiche={onModifiche}
    />
  )
}
