import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Conferma } from '@/components/Conferma'
import { useOggi } from '@/lib/useOggi'
import { useCampoStore } from '@/store/campo'
import type { StatoModulo } from './ModuloOggi'

/**
 * Le protezioni di una pagina che contiene il modulo di una misura (la scheda della pianta, la misura nel giro):
 * prima di chiudere un modulo con valori non salvati si chiede se scartarli, il browser chiede conferma prima di
 * chiudere o ricaricare, e a mezzanotte il rilievo resta sul giorno in cui si è scritto.
 *
 * - `oggi`: il giorno di `useOggi`, con la regola di mezzanotte già applicata;
 * - `conferma(azione)`: esegue l'azione, chiedendo prima se scartare i valori non salvati;
 * - `onModifiche`: da passare al riquadro, che dice così se il modulo è cambiato e come scartarlo;
 * - `onIndietro(percorso)`: il gestore della freccia indietro di `AppShell`, che passa dalla conferma;
 * - `dialogo`: la richiesta di conferma, da mettere nella pagina.
 */
export function useModuloProtetto(espId: string) {
  const navigate = useNavigate()
  // Il modulo aperto dice se ha valori non salvati; prima di chiuderlo (indietro, un'altra misura, "Usa oggi")
  // si chiede se scartarli. Si legge al momento del tocco: un ref basta e non fa ridisegnare la pagina a ogni tasto.
  const modulo = useRef<StatoModulo | null>(null)

  // A mezzanotte (o riaprendo il telefono il mattino dopo) "oggi" cambia. Con valori scritti e nessuna data scelta,
  // il rilievo resta sul giorno in cui li si è scritti: la data si fissa nello stesso evento, prima di ridisegnare,
  // così il modulo non si ricrea vuoto; compare l'avviso "non oggi" e "Usa oggi" passa dalla conferma di scarto.
  const tieniIlGiorno = useCallback((prima: string) => {
    if (!modulo.current?.modificato) return
    const campo = useCampoStore.getState()
    if (campo.dati(espId, prima).dataRilievo === prima) campo.setData(espId, prima)
  }, [espId])
  const oggi = useOggi(tieniIlGiorno)
  const [inAttesa, setInAttesa] = useState<{ esegui: () => void } | null>(null)
  const onModifiche = useCallback((stato: StatoModulo | null) => { modulo.current = stato }, [])
  const conferma = useCallback((esegui: () => void) => {
    if (modulo.current?.modificato) setInAttesa({ esegui })
    else esegui()
  }, [])

  // Chiudere o ricaricare la scheda del browser con valori non salvati: il browser chiede conferma.
  useEffect(() => {
    const avvisa = (evento: BeforeUnloadEvent) => {
      if (!modulo.current?.modificato) return
      evento.preventDefault()
      evento.returnValue = ''
    }
    window.addEventListener('beforeunload', avvisa)
    return () => window.removeEventListener('beforeunload', avvisa)
  }, [])

  function scarta() {
    const azione = inAttesa
    modulo.current?.scarta()
    setInAttesa(null)
    azione?.esegui()
  }

  const onIndietro = (percorso: string) => (evento: MouseEvent<HTMLAnchorElement>) => {
    if (!modulo.current?.modificato) return
    evento.preventDefault()
    setInAttesa({ esegui: () => navigate(percorso) })
  }

  const dialogo = (
    <Conferma
      aperta={inAttesa !== null}
      titolo="Scartare i valori non salvati?"
      testo="I valori inseriti per questa misura andranno persi."
      annulla="Continua a modificare"
      conferma="Scarta"
      onAnnulla={() => setInAttesa(null)}
      onConferma={scarta}
    />
  )

  return { oggi, conferma, onModifiche, onIndietro, dialogo }
}
