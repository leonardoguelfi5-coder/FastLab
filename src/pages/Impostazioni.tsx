import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useConfig, useParametriConDati, usePianteConDati, useStrumentiConDati } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { Conferma } from '@/components/Conferma'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { ContestoModifiche } from '@/components/impostazioni/modifiche'
import { SezioneGenerale } from '@/components/impostazioni/SezioneGenerale'
import { SezioneFenologica } from '@/components/impostazioni/SezioneFenologica'
import { SezioneStrumenti } from '@/components/impostazioni/SezioneStrumenti'
import { SezionePiante } from '@/components/impostazioni/SezionePiante'
import { SezioneTrattamenti } from '@/components/impostazioni/SezioneTrattamenti'
import { percorsoCatalogo, percorsoHome } from '@/lib/percorsi'

/**
 * Impostazioni di un esperimento già avviato (spec §5.3, "Modifiche a esperimento avviato"): dati generali, etichette
 * dei trattamenti, piante, strumenti (con i loro valori) e tabella fenologica. Ogni elemento si salva da sé, con il suo esito; quel che non è salvato
 * resta nella pagina (anche se la configurazione si ricarica) e uscire con la freccia o verso il catalogo chiede se
 * scartarlo.
 */
export function Impostazioni() {
  const { espId = '' } = useParams()
  const navigate = useNavigate()
  const config = useConfig(espId)
  const parametriConDati = useParametriConDati(espId)
  const pianteConDati = usePianteConDati(espId)
  const strumentiConDati = useStrumentiConDati(espId)

  // Le sezioni dicono qui se hanno modifiche non salvate; si legge al momento del tocco, senza ridisegnare la pagina.
  const modifiche = useRef(new Map<string, boolean>())
  const segnala = useCallback((chiave: string, modificata: boolean) => { modifiche.current.set(chiave, modificata) }, [])
  const ciSonoModifiche = () => [...modifiche.current.values()].some(Boolean)
  // Dove si vuole andare lasciando modifiche non salvate: la conferma porta lì.
  const [uscita, setUscita] = useState<string | null>(null)
  // Un link che lascia la pagina: con modifiche non salvate si ferma e chiede prima.
  const esci = (evento: MouseEvent<HTMLAnchorElement>, destinazione: string) => {
    if (!ciSonoModifiche()) return
    evento.preventDefault()
    setUscita(destinazione)
  }

  // Chiudere o ricaricare la scheda del browser con modifiche non salvate: il browser chiede conferma.
  useEffect(() => {
    const avvisa = (evento: BeforeUnloadEvent) => {
      if (![...modifiche.current.values()].some(Boolean)) return
      evento.preventDefault()
      evento.returnValue = ''
    }
    window.addEventListener('beforeunload', avvisa)
    return () => window.removeEventListener('beforeunload', avvisa)
  }, [])

  const dati = config.data
  return (
    <AppShell
      titolo="Impostazioni"
      indietro={percorsoHome(espId)}
      onIndietro={evento => esci(evento, percorsoHome(espId))}
    >
      {dati === undefined ? (
        config.isError
          ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
          : <p role="status" className="text-grafite-tenue">Caricamento…</p>
      ) : (
        <ContestoModifiche.Provider value={segnala}>
          <div className="flex flex-col gap-12">
            <SezioneGenerale espId={espId} esperimento={dati.esperimento} />
            <SezioneTrattamenti espId={espId} config={dati} />
            <SezionePiante espId={espId} config={dati} conDati={pianteConDati} />
            <SezioneStrumenti
              espId={espId} config={dati} datiParametri={parametriConDati} datiStrumenti={strumentiConDati}
              onGestisciCatalogo={evento => esci(evento, percorsoCatalogo)}
            />
            <SezioneFenologica espId={espId} config={dati} datiParametri={parametriConDati} datiStrumenti={strumentiConDati} />
          </div>
        </ContestoModifiche.Provider>
      )}
      <Conferma
        aperta={uscita !== null}
        titolo="Scartare le modifiche non salvate?"
        testo="Le modifiche non salvate di queste impostazioni andranno perse."
        annulla="Continua a modificare"
        conferma="Scarta"
        onAnnulla={() => setUscita(null)}
        onConferma={() => {
          const destinazione = uscita
          setUscita(null)
          if (destinazione !== null) navigate(destinazione)
        }}
      />
    </AppShell>
  )
}
