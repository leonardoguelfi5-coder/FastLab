import { useEffect, useId, useRef } from 'react'
import { BarraAzioni } from '@/components/BarraAzioni'
import { Button } from '@/components/ui/button'
import type { Misura, Parametro } from '@/domain/tipi'
import type { ModuloIniziale } from './RiquadroOggi'
import { ATTESA_CONFERMA_MS, istante } from './salvataggio'
import { VociMisura } from './VociMisura'
import { vociMisura } from './voci'

/** "09:12", "09:12 e 15:40", "09:12, 11:00 e 15:40". */
function elencoOre(ore: string[]): string {
  return ore.length <= 1 ? (ore[0] ?? '') : `${ore.slice(0, -1).join(', ')} e ${ore[ore.length - 1]}`
}

/** La domanda all'arrivo: con una misura il testo del piano, con più misure le loro ore. */
function domandaArrivo(misure: Misura[]): string {
  return misure.length === 1
    ? `Correggere quella delle ${misure[0].ora} o aggiungerne una nuova?`
    : `Correggere una di quelle delle ${elencoOre(misure.map(m => m.ora))} o aggiungerne una nuova?`
}

interface SceltaArrivoProps {
  /** Il titolo del riquadro che prenderà il suo posto ("Oggi · 💚 SPAD"). */
  titolo: string
  /** Le misure del giorno di questa pianta con questo strumento, in ordine di ora (almeno una). */
  misure: Misura[]
  /** Tutti i parametri dell'esperimento, archiviati compresi: una misura può averne. */
  parametri: Parametro[]
  onScegli: (scelta: ModuloIniziale) => void
}

/**
 * Arrivando su una pianta che ha già misure di questo strumento alla data di rilievo si chiede cosa fare, al posto
 * del modulo: correggere una di quelle misure (lo stesso id) o aggiungerne una nuova (un id nuovo). Un'altra misura
 * sulla stessa pianta va decisa, non creata in silenzio. Sopra i pulsanti, le misure con i loro valori: si vede cosa
 * manca (una pianta "incompleta") prima di scegliere.
 */
export function SceltaArrivo({ titolo, misure, parametri, onScegli }: SceltaArrivoProps) {
  const idTitolo = useId()
  const idDomanda = useId()
  // Il pannello compare sempre dopo un tocco ("Salva e vai", "Vai alle mancanti"), con i suoi pulsanti dove c'era
  // quello appena toccato: un tocco troppo vicino è il secondo di un doppio tocco, non una scelta, e si ignora.
  // Altrimenti la domanda sparirebbe senza essere letta.
  const apertoAlle = useRef<number | null>(null)

  useEffect(() => {
    apertoAlle.current = istante()
  }, [])

  function scegli(scelta: ModuloIniziale) {
    if (apertoAlle.current !== null && istante() - apertoAlle.current < ATTESA_CONFERMA_MS) return
    onScegli(scelta)
  }

  const una = misure.length === 1

  return (
    <section aria-labelledby={idTitolo} aria-describedby={idDomanda} className="rounded-lg bg-carta-ombra p-4">
      <div className="flex flex-col gap-3">
        <h3 id={idTitolo} className="flex min-h-11 items-center text-label text-grafite-tenue uppercase">{titolo}</h3>
        <p id={idDomanda} className="font-semibold text-grafite">{domandaArrivo(misure)}</p>
        <ul aria-label="Misure già registrate" className="-mx-2 border-y border-riga">
          {misure.map(m => (
            <li key={m.id} className="border-b border-riga px-2 py-2.5 text-dato last:border-b-0">
              <span className="font-mono text-grafite tabular-nums">{m.ora}</span>
              {' · '}
              <VociMisura voci={vociMisura(m, parametri)} />
            </li>
          ))}
        </ul>
      </div>

      <BarraAzioni>
        {/* Nessuna delle due è "quella giusta": stessa forma, una accanto all'altra finché ci stanno. */}
        <div className="flex flex-wrap gap-2">
          {misure.map(m => (
            <Button key={m.id} variant="outline" size="lg" className="grow" onClick={() => scegli({ tipo: 'correggi', misuraId: m.id })}>
              {una ? 'Correggi' : `Correggi ${m.ora}`}
            </Button>
          ))}
          <Button variant="outline" size="lg" className="grow" onClick={() => scegli({ tipo: 'nuova' })}>Nuova misura</Button>
        </div>
      </BarraAzioni>
    </section>
  )
}
