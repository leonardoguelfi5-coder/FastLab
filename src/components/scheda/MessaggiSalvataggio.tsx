import type { Ref } from 'react'
import { CircleAlert, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { messaggioErrore } from '@/lib/errori'
import { cn } from '@/lib/utils'

/** Perché un salvataggio si è fermato prima di partire: errori (bloccano) o avvisi (si conferma con "Salva comunque"). */
export interface Controllo { tipo: 'errori' | 'avvisi'; messaggi: string[] }

/**
 * Riquadro sopra i pulsanti della barra in basso, sempre in vista anche con la tastiera aperta. Bordo pieno di 1px
 * e fondo velato (mai una striscia laterale), icona davanti a ogni riga. Scorre da solo se i messaggi sono tanti.
 * Prende il focus quando compare (tabIndex -1): chi ha toccato "Salva" lo legge prima di tutto.
 */
const RIQUADRO = 'max-h-[35dvh] overflow-y-auto rounded-lg border px-3 py-2.5 text-sm'

export function EsitoControllo({ controllo, ref }: { controllo: Controllo; ref?: Ref<HTMLDivElement> }) {
  const errori = controllo.tipo === 'errori'
  const Icona = errori ? CircleAlert : TriangleAlert
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className={cn(RIQUADRO, errori ? 'border-errore bg-errore-velato' : 'border-attenzione bg-attenzione-velato')}
    >
      <ul className="flex flex-col gap-1">
        {controllo.messaggi.map((m, i) => (
          <li key={i} className={cn('flex items-start gap-1.5 font-medium', errori ? 'text-errore' : 'text-grafite')}>
            <Icona aria-hidden className={cn('mt-0.5 size-4 shrink-0', !errori && 'text-attenzione')} />
            {m}
          </li>
        ))}
      </ul>
      {!errori && <p className="mt-1.5 text-grafite-tenue">Se il valore è giusto, tocca «Salva comunque».</p>}
    </div>
  )
}

interface ErroreSalvataggioProps {
  etichetta: string
  errore: unknown
  onRiprova: () => void
  ref?: Ref<HTMLDivElement>
}

/** Il salvataggio non è riuscito: lo dice, spiega perché (in italiano, da `messaggioErrore`) e offre "Riprova". */
export function ErroreSalvataggio({ etichetta, errore, onRiprova, ref }: ErroreSalvataggioProps) {
  return (
    <div ref={ref} role="alert" tabIndex={-1} className={cn(RIQUADRO, 'border-errore bg-errore-velato pb-0.5')}>
      <p className="flex items-start gap-1.5 font-medium text-errore">
        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        {`Pianta #${etichetta} non salvata.`}
      </p>
      <p className="mt-1 text-grafite">{messaggioErrore(errore)}</p>
      <Button variant="ghost" size="sm" onClick={onRiprova} className="-ml-3">Riprova</Button>
    </div>
  )
}
