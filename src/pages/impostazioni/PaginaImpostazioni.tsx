import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useConfig } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { Caricamento } from '@/components/Caricamento'
import { Conferma } from '@/components/Conferma'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { ContestoModifiche } from '@/components/impostazioni/modifiche'
import type { ConfigEsperimento } from '@/domain/tipi'
import { percorsoImpostazioni } from '@/lib/percorsi'

export interface ArgomentiPagina {
  config: ConfigEsperimento
  /** Un link che lascia la pagina: con modifiche non salvate si ferma e chiede prima (`Scartare le modifiche non salvate?`). */
  esci: (evento: MouseEvent<HTMLAnchorElement>, destinazione: string) => void
}

interface PaginaImpostazioniProps {
  espId: string
  /** Dove porta la freccia indietro: l'indice delle Impostazioni. */
  indietro?: string
  children: (argomenti: ArgomentiPagina) => ReactNode
}

/**
 * Il guscio comune delle pagine delle Impostazioni (Piano E, Task E10): intestazione con la freccia verso l'indice, la
 * configurazione letta una volta, e la protezione delle modifiche non salvate di prima. Le parti della pagina dicono
 * qui se hanno modifiche (`ContestoModifiche`); uscire con la freccia o con un link verso un'altra pagina, o chiudere
 * la scheda del browser, chiede se scartarle. Ogni elemento si salva da sé, con il suo esito.
 */
export function PaginaImpostazioni({ espId, indietro = percorsoImpostazioni(espId), children }: PaginaImpostazioniProps) {
  const navigate = useNavigate()
  const config = useConfig(espId)

  // Le sezioni dicono qui se hanno modifiche non salvate; si legge al momento del tocco, senza ridisegnare la pagina.
  const modifiche = useRef(new Map<string, boolean>())
  const segnala = useCallback((chiave: string, modificata: boolean) => { modifiche.current.set(chiave, modificata) }, [])
  // Dove si vuole andare lasciando modifiche non salvate: la conferma porta lì.
  const [uscita, setUscita] = useState<string | null>(null)
  const esci = useCallback((evento: MouseEvent<HTMLAnchorElement>, destinazione: string) => {
    if (![...modifiche.current.values()].some(Boolean)) return
    evento.preventDefault()
    setUscita(destinazione)
  }, [])

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
    <AppShell titolo="Impostazioni" indietro={indietro} onIndietro={evento => esci(evento, indietro)}>
      {dati === undefined ? (
        config.isError
          ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
          : <Caricamento />
      ) : (
        <ContestoModifiche.Provider value={segnala}>
          {/* `esci` tocca il ref solo quando viene chiamato (al tocco), mai nel disegno: l'avviso è un falso positivo. */}
          {/* eslint-disable-next-line react-hooks/refs */}
          {children({ config: dati, esci })}
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
