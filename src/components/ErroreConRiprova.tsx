import { Link } from 'react-router-dom'
import { TestoErrore } from '@/components/TestoErrore'
import { Button, buttonVariants } from '@/components/ui/button'
import { eEsperimentoNonTrovato, messaggioErrore } from '@/lib/errori'

/**
 * Errore di caricamento in linea: cosa è successo (in italiano, da `messaggioErrore`) e "Riprova". Per un esperimento
 * che non c'è riprovare non serve: al posto di "Riprova" c'è la strada per l'elenco degli esperimenti.
 */
export function ErroreConRiprova({ errore, onRiprova }: { errore: unknown; onRiprova: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-1">
      <TestoErrore className="text-base">{messaggioErrore(errore)}</TestoErrore>
      {eEsperimentoNonTrovato(errore) ? (
        <Link to="/" className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-3' })}>I miei esperimenti</Link>
      ) : (
        <Button variant="ghost" size="sm" onClick={onRiprova} className="-ml-3">Riprova</Button>
      )}
    </div>
  )
}
