import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { salvaVoceCatalogo } from '@/api/catalogo'
import { chiavi } from '@/api/query'
import { EditorStrumento, type StrumentoConValori } from '@/components/config/EditorStrumento'
import { TestoErrore } from '@/components/TestoErrore'
import { Button } from '@/components/ui/button'
import { nuovoStrumento, problemiParametro, problemiStrumento } from '@/domain/bozza'
import { voceDaStrumento } from '@/domain/catalogo'
import type { ConfigEsperimento, Parametro, Strumento } from '@/domain/tipi'
import { eNomeGiaNelCatalogo, messaggioErrore } from '@/lib/errori'
import { nuovoId } from '@/lib/id'

interface NuovoStrumentoProps {
  config: ConfigEsperimento
  /**
   * Lo strumento da aggiungere all'esperimento, dopo il catalogo. `avviso` è l'errore del catalogo, se la copia è stata
   * aggiunta lo stesso ma senza collegamento.
   */
  onAggiungi: (strumento: Strumento, parametri: Parametro[], avviso: string | null) => void
  onAnnulla: () => void
}

/**
 * "+ Nuovo strumento" (spec §5.10), come nel wizard: lo strumento entra nel catalogo, per tutti, e poi se ne aggiunge la
 * copia all'esperimento, collegata alla voce. Un nome già nel catalogo lascia il modulo aperto, per rinominare o per usare
 * la voce che c'è; un errore di rete aggiunge la copia lo stesso, non collegata.
 */
export function NuovoStrumento({ config, onAggiungi, onAnnulla }: NuovoStrumentoProps) {
  const queryClient = useQueryClient()
  const [nuovo, setNuovo] = useState<StrumentoConValori>(() => ({ strumento: nuovoStrumento(0), parametri: [] }))
  const [invio, setInvio] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  // L'id della voce resta lo stesso a ogni tentativo dello stesso modulo: ritentare è un upsert, non un'altra voce.
  const idVoce = useRef(nuovoId())
  // Il doppio tocco si ferma subito, prima che il pulsante risulti disabilitato.
  const inCorso = useRef(false)

  const problemi = [...new Set([
    ...problemiStrumento(nuovo.strumento, config.strumenti),
    ...nuovo.parametri.flatMap(p => problemiParametro(p, [...nuovo.parametri, ...config.parametri])),
  ])]

  async function conferma() {
    if (inCorso.current || problemi.length > 0) return
    inCorso.current = true
    setInvio(true)
    setErrore(null)
    const { voce, strumento, parametri } = voceDaStrumento(nuovo.strumento, nuovo.parametri, idVoce.current)
    let aggiunta: Parameters<typeof onAggiungi> | null = null
    try {
      await salvaVoceCatalogo(voce)
      void queryClient.invalidateQueries({ queryKey: chiavi.catalogo })
      aggiunta = [strumento, parametri, null]
    } catch (e) {
      if (eNomeGiaNelCatalogo(e)) setErrore(messaggioErrore(e))
      // Rete o altro: la copia entra lo stesso, non collegata; il catalogo si sistema dopo.
      else aggiunta = [nuovo.strumento, nuovo.parametri, messaggioErrore(e)]
    } finally {
      inCorso.current = false
      setInvio(false)
    }
    if (aggiunta) onAggiungi(...aggiunta)
  }

  return (
    <section aria-label="Nuovo strumento" className="-mx-4 flex flex-col gap-4 bg-carta-ombra px-4 py-5">
      <h3 className="text-title text-grafite">Nuovo strumento</h3>
      <EditorStrumento valore={nuovo} onChange={setNuovo} altriParametri={config.parametri} />
      {problemi.length > 0 && <div className="flex flex-col gap-1">{problemi.map(e => <TestoErrore key={e}>{e}</TestoErrore>)}</div>}
      {errore && (
        <div role="alert" className="flex flex-col gap-1">
          <TestoErrore className="text-base">{errore}</TestoErrore>
          <p className="text-sm text-grafite-tenue">Cambia il nome, oppure aggiungi dal catalogo lo strumento che c'è già.</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={invio || problemi.length > 0} onClick={() => void conferma()}>
          {invio ? 'Salvataggio…' : 'Salva nel catalogo e aggiungi'}
        </Button>
        <Button variant="outline" disabled={invio} onClick={onAnnulla}>Annulla</Button>
      </div>
    </section>
  )
}
