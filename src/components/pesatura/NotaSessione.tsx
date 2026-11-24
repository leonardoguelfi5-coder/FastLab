import { useId, useState } from 'react'
import { TestoErrore } from '@/components/TestoErrore'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { messaggioErrore } from '@/lib/errori'

/**
 * La nota di una sessione (pesata o taratura): si legge per intero e, a chi gestisce la sessione, si modifica sul
 * posto.
 */
export function NotaSessione({ nota, puoModificare, senzaRete, onSalva }: {
  nota: string | null
  puoModificare: boolean
  senzaRete: boolean
  /** Salva la nota (vuota = nessuna nota). Se non riesce lancia: il testo resta nel campo, con l'errore sotto. */
  onSalva: (nota: string | null) => Promise<void>
}) {
  const id = useId()
  const [bozza, setBozza] = useState<string | null>(null)
  const [occupato, setOccupato] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  if (bozza !== null) {
    const salva = async () => {
      if (occupato) return
      setOccupato(true)
      setErrore(null)
      try {
        await onSalva(bozza.trim() === '' ? null : bozza.trim())
        setBozza(null)
      } catch (e) {
        setErrore(messaggioErrore(e))
      } finally {
        setOccupato(false)
      }
    }
    return (
      <div className="mt-3 flex flex-col gap-2">
        <Label htmlFor={id}>Nota</Label>
        <Textarea id={id} value={bozza} onChange={e => setBozza(e.target.value)} autoFocus />
        {errore && <TestoErrore role="alert" className="text-base">{errore}</TestoErrore>}
        <div className="flex gap-2">
          <Button type="button" disabled={occupato || senzaRete} aria-busy={occupato} onClick={() => void salva()}>Salva la nota</Button>
          <Button type="button" variant="ghost" disabled={occupato} onClick={() => { setBozza(null); setErrore(null) }}>Annulla</Button>
        </div>
      </div>
    )
  }
  if (!nota && !puoModificare) return null
  return (
    <div className="mt-3 flex flex-col gap-1 rounded-2xl border border-riga bg-foglio px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-label font-medium tracking-wide text-grafite-tenue uppercase">Nota</p>
        {puoModificare && (
          <Button type="button" variant="ghost" size="xs" className="-mr-2" onClick={() => setBozza(nota ?? '')}>
            {nota ? 'Modifica' : 'Aggiungi'}
          </Button>
        )}
      </div>
      {nota
        ? <p className="whitespace-pre-line text-base text-grafite">{nota}</p>
        : <p className="text-base text-grafite-tenue">Nessuna nota.</p>}
    </div>
  )
}
