import { Button } from '@/components/ui/button'

const SCELTA = 'h-auto w-full flex-col items-start gap-1 whitespace-normal p-4 text-left'

/** Prima schermata con la bozza vuota: partire dal modello Hydrochar o da zero. */
export function SceltaIniziale({ onModello, onDaZero }: { onModello: () => void; onDaZero: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-2xl font-bold">Come vuoi iniziare?</h2>
      <Button variant="outline" onClick={onModello} className={SCELTA}>
        <span className="text-lg font-semibold">Parti dal modello Hydrochar</span>
        <span className="text-sm font-normal text-muted-foreground">
          Fattori Stress × Hydrochar, 8 trattamenti, 56 piante, parametri e passate già pronti: li modifichi come vuoi.
        </span>
      </Button>
      <Button variant="outline" onClick={onDaZero} className={SCELTA}>
        <span className="text-lg font-semibold">Parti da zero</span>
        <span className="text-sm font-normal text-muted-foreground">Definisci tu fattori, piante, parametri e passate.</span>
      </Button>
      <p className="text-sm text-muted-foreground">Per ripartire da un tuo esperimento usa «Duplica» nell'elenco degli esperimenti.</p>
    </div>
  )
}
