import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useConfig, useParametriConDati, usePianteConDati } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { Conferma } from '@/components/Conferma'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { ContestoModifiche } from '@/components/impostazioni/modifiche'
import { SezioneGenerale } from '@/components/impostazioni/SezioneGenerale'
import { SezioneParametri } from '@/components/impostazioni/SezioneParametri'
import { SezionePassate } from '@/components/impostazioni/SezionePassate'
import { SezionePiante } from '@/components/impostazioni/SezionePiante'
import { SezioneTrattamenti } from '@/components/impostazioni/SezioneTrattamenti'
import { percorsoCampo } from '@/lib/percorsi'

/**
 * Impostazioni di un esperimento già avviato (spec §5.3, "Modifiche a esperimento avviato"): dati generali, etichette
 * dei trattamenti, piante, parametri e passate. Ogni elemento si salva da sé, con il suo esito; quel che non è salvato
 * resta nella pagina (anche se la configurazione si ricarica) e uscire con la freccia chiede se scartarlo.
 */
export function Impostazioni() {
  const { espId = '' } = useParams()
  const navigate = useNavigate()
  const config = useConfig(espId)
  const parametriConDati = useParametriConDati(espId)
  const pianteConDati = usePianteConDati(espId)

  // Le sezioni dicono qui se hanno modifiche non salvate; si legge al momento del tocco, senza ridisegnare la pagina.
  const modifiche = useRef(new Map<string, boolean>())
  const segnala = useCallback((chiave: string, modificata: boolean) => { modifiche.current.set(chiave, modificata) }, [])
  const ciSonoModifiche = () => [...modifiche.current.values()].some(Boolean)
  const [uscita, setUscita] = useState(false)

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
      indietro={percorsoCampo(espId)}
      onIndietro={evento => {
        if (!ciSonoModifiche()) return
        evento.preventDefault()
        setUscita(true)
      }}
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
            <SezioneParametri espId={espId} config={dati} conDati={parametriConDati} />
            <SezionePassate espId={espId} config={dati} />
          </div>
        </ContestoModifiche.Provider>
      )}
      <Conferma
        aperta={uscita}
        titolo="Scartare le modifiche non salvate?"
        testo="Le modifiche non salvate di queste impostazioni andranno perse."
        annulla="Continua a modificare"
        conferma="Scarta"
        onAnnulla={() => setUscita(false)}
        onConferma={() => {
          setUscita(false)
          navigate(percorsoCampo(espId))
        }}
      />
    </AppShell>
  )
}
