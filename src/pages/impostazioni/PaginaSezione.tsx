import { Navigate, useParams } from 'react-router-dom'
import { useConteggiStrumenti, useParametriConDati, usePianteConDati, usePianteNonEliminabili } from '@/api/query'
import { Caricamento } from '@/components/Caricamento'
import { SezioneFenologica } from '@/components/impostazioni/SezioneFenologica'
import { SezioneGenerale } from '@/components/impostazioni/SezioneGenerale'
import { SezionePersone } from '@/components/impostazioni/SezionePersone'
import { SezionePiante } from '@/components/impostazioni/SezionePiante'
import { SezioneSpazio } from '@/components/impostazioni/SezioneSpazio'
import { SezioneSolaLettura } from '@/components/impostazioni/SolaLettura'
import { SezioneStrumenti } from '@/components/impostazioni/SezioneStrumenti'
import { SezioneTrattamenti } from '@/components/impostazioni/SezioneTrattamenti'
import type { ConfigEsperimento } from '@/domain/tipi'
import { eSezioneImpostazioni, percorsoCatalogo, percorsoImpostazioni } from '@/lib/percorsi'
import { usePermessi } from '@/lib/usePermessi'
import { PaginaImpostazioni, type ArgomentiPagina } from './PaginaImpostazioni'

/** Le sezioni che hanno bisogno di sapere quali elementi hanno dati: le letture partono solo per il proprietario, che le monta. */
function Piante({ espId, config }: { espId: string; config: ConfigEsperimento }) {
  const conDati = usePianteConDati(espId)
  const nonEliminabili = usePianteNonEliminabili(espId)
  return <SezionePiante espId={espId} config={config} conDati={conDati} nonEliminabili={nonEliminabili} />
}

function Strumenti({ espId, config, esci }: ArgomentiPagina & { espId: string }) {
  const parametriConDati = useParametriConDati(espId)
  const conteggiStrumenti = useConteggiStrumenti(espId)
  return (
    <SezioneStrumenti
      espId={espId} config={config} datiParametri={parametriConDati} datiStrumenti={conteggiStrumenti}
      onGestisciCatalogo={evento => esci(evento, percorsoCatalogo)}
    />
  )
}

function Fenologia({ espId, config }: { espId: string; config: ConfigEsperimento }) {
  const parametriConDati = useParametriConDati(espId)
  const conteggiStrumenti = useConteggiStrumenti(espId)
  return <SezioneFenologica espId={espId} config={config} datiParametri={parametriConDati} datiStrumenti={conteggiStrumenti} />
}

/**
 * Una pagina delle Impostazioni (`/impostazioni/:sezione`). La configurazione (generale, trattamenti, piante, strumenti,
 * fenologia) è del proprietario: rilevatore e lettore la vedono da leggere, con la frase che lo dice. Spazio e Persone
 * sono di tutti, con le azioni che il ruolo permette. Finché il ruolo non si conosce la configurazione aspetta; se la
 * lettura è fallita (senza rete e senza copia) non si toglie niente: la guardia è il database.
 */
export function ImpostazioniSezione() {
  const { espId = '', sezione } = useParams()
  const permessi = usePermessi(espId)
  if (!eSezioneImpostazioni(sezione)) return <Navigate to={percorsoImpostazioni(espId)} replace />

  return (
    <PaginaImpostazioni espId={espId}>
      {({ config, esci }) => {
        if (sezione === 'persone') return <SezionePersone espId={espId} />
        if (sezione === 'spazio') return <SezioneSpazio espId={espId} config={config} puoGestire={!permessi.soloProprietario} />
        // Il ruolo si legge insieme alla configurazione: un attimo, poi si sa se i controlli ci sono.
        if (permessi.caricamento) return <Caricamento />
        if (permessi.soloProprietario) return <SezioneSolaLettura sezione={sezione} config={config} />
        switch (sezione) {
          case 'generale': return <SezioneGenerale espId={espId} esperimento={config.esperimento} />
          case 'trattamenti': return <SezioneTrattamenti espId={espId} config={config} />
          case 'piante': return <Piante espId={espId} config={config} />
          case 'strumenti': return <Strumenti espId={espId} config={config} esci={esci} />
          case 'fenologia': return <Fenologia espId={espId} config={config} />
        }
      }}
    </PaginaImpostazioni>
  )
}
