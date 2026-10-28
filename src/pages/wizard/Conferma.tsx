import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

interface ConfermaProps {
  aperta: boolean
  titolo: string
  testo: string
  /** Testo del pulsante che lascia tutto com'è. */
  annulla: string
  /** Testo del pulsante che esegue l'azione (che fa perdere qualcosa). */
  conferma: string
  onAnnulla: () => void
  onConferma: () => void
}

/** Richiesta di conferma prima di un'azione che fa perdere del lavoro. */
export function Conferma({ aperta, titolo, testo, annulla, conferma, onAnnulla, onConferma }: ConfermaProps) {
  return (
    <Dialog open={aperta} onOpenChange={(aperto) => { if (!aperto) onAnnulla() }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{titolo}</DialogTitle>
          <DialogDescription>{testo}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onAnnulla} className="h-11">{annulla}</Button>
          <Button variant="destructive" onClick={onConferma} className="h-11">{conferma}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
