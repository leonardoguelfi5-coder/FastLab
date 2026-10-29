import { TestoErrore } from '@/components/TestoErrore'
import { Button } from '@/components/ui/button'
import { messaggioErrore } from '@/lib/errori'

/** Errore di caricamento in linea: cosa è successo (in italiano, da `messaggioErrore`) e "Riprova". */
export function ErroreConRiprova({ errore, onRiprova }: { errore: unknown; onRiprova: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-1">
      <TestoErrore className="text-base">{messaggioErrore(errore)}</TestoErrore>
      <Button variant="ghost" size="sm" onClick={onRiprova} className="-ml-3">Riprova</Button>
    </div>
  )
}
