import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { TestoErrore } from '@/components/TestoErrore'
import type { MisureStrumento } from './useStrumenti'

interface NonEliminabileProps {
  aperta: boolean
  titolo: string
  testo: string
  onChiudi: () => void
  /** "Archivia" accanto a "Chiudi": solo per uno strumento attivo (la tabella fenologica non si archivia). */
  onArchivia?: () => void
}

/**
 * La spiegazione di "Elimina" per uno strumento con misure: quante, di quante piante, in che date, e perché non si può.
 * Nessun pulsante elimina: c'è "Chiudi" e, dove ha senso, "Archivia".
 */
export function NonEliminabile({ aperta, titolo, testo, onChiudi, onArchivia }: NonEliminabileProps) {
  return (
    <Dialog open={aperta} onOpenChange={aperto => { if (!aperto) onChiudi() }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{titolo}</DialogTitle>
          <DialogDescription>{testo}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onChiudi}>Chiudi</Button>
          {onArchivia && <Button onClick={onArchivia}>Archivia</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Accanto a "Elimina" quando non si può ancora decidere: mentre si contano le misure, o se una lettura è fallita (con
 * "Riprova"). Negli altri casi niente.
 */
export function AttesaMisure({ misure }: { misure: MisureStrumento }) {
  if (misure.stato === 'contando') return <p role="status" className="text-sm text-grafite-tenue">Conto le misure…</p>
  if (misure.stato !== 'errore') return null
  return (
    <div className="flex flex-col items-start gap-1">
      <TestoErrore>
        {misure.cosa === 'misure'
          ? 'Non so ancora se ha misure: non si può eliminare.'
          : 'Non so ancora se ha dati: non si può eliminare.'}
      </TestoErrore>
      <Button variant="ghost" size="sm" onClick={misure.riprova} className="-ml-3">Riprova</Button>
    </div>
  )
}
