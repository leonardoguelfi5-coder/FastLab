import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { opzioniMisurePianta } from '@/api/query'
import type { ConfigEsperimento, Misura, Parametro, Passata, Pianta } from '@/domain/tipi'
import { formattaData } from '@/lib/date'
import { chiaveBozza, leggiBozza } from './bozza'
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
 * modulo per una misura nuova o per correggerne una. Il modulo ha un id generato all'apertura (o quello della misura
 * che si corregge) e si rimonta quando cambia: così un "Annulla" in sospeso non finisce nella misura sbagliata.
 */
export function RiquadroOggi({
  espId, config, pianta, passata, misure, dataRilievo, oggi, successiva, conferma, onModifiche,
}: RiquadroOggiProps) {
  const location = useLocation()
  const queryClient = useQueryClient()
  const base = { espId, piantaId: pianta.id, passataId: passata.id, dataRilievo }
  const chiaveNuova = chiaveBozza({ ...base, misuraId: null })

  // L'id di una misura nuova: cambia solo aprendo un modulo nuovo (dopo un salvataggio riuscito o con "+ Nuova
  // misura"). Un nuovo tentativo dopo un errore lo riusa, e l'upsert per id non crea doppioni. Una bozza ripresa
  // porta il suo: un tentativo arrivato al server prima dell'uscita viene aggiornato, non duplicato.
  const idNuovo = () => leggiBozza(chiaveNuova)?.id ?? crypto.randomUUID()
  const [formId, setFormId] = useState(idNuovo)
  const [inCorrezione, setInCorrezione] = useState<Misura | null>(null)
  // Dopo "Scarta" su una bozza ripresa si riparte dalla stessa misura: serve una chiave nuova per rimontare.
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
  const misureOggi = useMemo(
    () => misure
      .filter(m => m.passata_id === passata.id && m.data_rilievo === dataRilievo)
      .sort((a, b) => confronta(a.ora, b.ora)),
    [misure, passata.id, dataRilievo],
  )
  // I precompilati del modulo dopo un salvataggio partono dalla misura appena salvata, anche prima che la cache la riporti.
  const misurePerIniziali = useMemo(
    () => (appenaSalvata ? [appenaSalvata, ...misure.filter(m => m.id !== appenaSalvata.id)] : misure),
    [appenaSalvata, misure],
  )

  function apriNuova() {
    setInCorrezione(null)
    setFormId(idNuovo())
    setPrimoCampo(false)
  }

  function correggi(m: Misura) {
    setInCorrezione(m)
    setPrimoCampo(false)
  }

  function dopoSalvataggio(m: Misura) {
    setAppenaSalvata(m)
    apriNuova()
  }

  function daCapo() {
    if (inCorrezione) setRipartenze(n => n + 1)
    else setFormId(crypto.randomUUID())
    setPrimoCampo(false)
  }

  const titolo = `${dataRilievo === oggi ? 'Oggi' : formattaData(dataRilievo)} · ${passata.icona ? `${passata.icona} ` : ''}${passata.nome}`

  return (
    <ModuloOggi
      key={`${pianta.id}:${inCorrezione ? `misura:${inCorrezione.id}:${ripartenze}` : `nuova:${formId}`}`}
      espId={espId}
      config={config}
      pianta={pianta}
      passata={passata}
      titolo={titolo}
      parametri={parametri}
      obbligatori={obbligatori}
      id={inCorrezione?.id ?? formId}
      chiave={chiaveBozza({ ...base, misuraId: inCorrezione?.id ?? null })}
      misura={inCorrezione}
      misureOggi={misureOggi}
      misurePianta={misurePerIniziali}
      dataRilievo={dataRilievo}
      oggi={oggi}
      successiva={successiva}
      primoCampo={primoCampo}
      onCorreggi={m => conferma(() => correggi(m))}
      onNuovaMisura={() => conferma(apriNuova)}
      onSalvata={dopoSalvataggio}
      onDaCapo={daCapo}
      onModifiche={onModifiche}
    />
  )
}
