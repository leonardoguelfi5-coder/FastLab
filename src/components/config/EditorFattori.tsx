import { useId, useState } from 'react'
import { X } from 'lucide-react'
import type { Fattore } from '@/domain/tipi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { conLivello, livelloDoppio } from './livelli'

interface EditorFattoriProps {
  valore: Fattore[]
  onChange: (f: Fattore[]) => void
  /**
   * Il testo scritto in "Nuovo livello" e non ancora aggiunto, per id del fattore. Facoltativo: chi lo passa
   * (con `onInSospeso`) può aggiungere quei livelli da sé, es. prima di generare i trattamenti.
   */
  inSospeso?: Record<string, string>
  onInSospeso?: (testi: Record<string, string>) => void
}

const rinumera = <T extends { ordine: number }>(elementi: T[]): T[] => elementi.map((e, ordine) => ({ ...e, ordine }))

interface EditorFattoreProps {
  numero: number
  valore: Fattore
  onChange: (f: Fattore) => void
  onElimina: () => void
  nuovo: string
  onNuovo: (testo: string) => void
}

function EditorFattore({ numero, valore, onChange, onElimina, nuovo, onNuovo }: EditorFattoreProps) {
  const id = useId()
  const doppio = livelloDoppio(valore, nuovo)

  function aggiungiLivello() {
    const aggiornato = conLivello(valore, nuovo)
    if (!aggiornato) return
    onChange(aggiornato)
    onNuovo('')
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium text-muted-foreground">{`Fattore ${numero}`}</legend>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-nome`} className="text-sm font-medium">Nome del fattore</Label>
        <Input
          id={`${id}-nome`}
          value={valore.nome}
          placeholder="es. Stress"
          onChange={(e) => onChange({ ...valore, nome: e.target.value })}
          className="h-12 text-lg"
        />
      </div>

      <div className="flex flex-col gap-2">
        <p id={`${id}-livelli`} className="text-sm font-medium">Livelli</p>
        {valore.livelli.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun livello: aggiungi i valori che prende il fattore, es. Controllo, S1, S2.</p>
        ) : (
          <ul aria-labelledby={`${id}-livelli`} className="flex flex-wrap gap-2">
            {valore.livelli.map(l => (
              <li key={l.id} className="flex min-h-10 max-w-full items-center gap-1 rounded-full border bg-muted pl-3 text-base break-all">
                {l.nome}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Togli il livello «${l.nome}»`}
                  onClick={() => onChange({ ...valore, livelli: rinumera(valore.livelli.filter(x => x.id !== l.id)) })}
                  className="size-10 rounded-full"
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input
            aria-label="Nuovo livello"
            placeholder="Nuovo livello"
            value={nuovo}
            enterKeyHint="done"
            aria-invalid={doppio || undefined}
            aria-describedby={doppio ? `${id}-doppio` : undefined}
            onChange={(e) => onNuovo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              aggiungiLivello()
            }}
            className="h-12 flex-1 text-lg"
          />
          <Button variant="outline" onClick={aggiungiLivello} disabled={nuovo.trim() === '' || doppio} className="h-12">
            Aggiungi livello
          </Button>
        </div>
        {doppio && <p id={`${id}-doppio`} className="text-sm text-destructive">C'è già un livello con questo nome.</p>}
      </div>

      <Button variant="ghost" onClick={onElimina} className="h-11 self-start text-destructive">Elimina fattore</Button>
    </fieldset>
  )
}

/** Fattori sperimentali e i loro livelli (mostrati come chip). */
export function EditorFattori({ valore, onChange, inSospeso, onInSospeso }: EditorFattoriProps) {
  const [interni, setInterni] = useState<Record<string, string>>({})
  const testi = inSospeso ?? interni
  const cambiaTesti = onInSospeso ?? setInterni

  function aggiungi() {
    onChange([...valore, { id: crypto.randomUUID(), nome: '', ordine: valore.length, livelli: [] }])
  }

  return (
    <div className="flex flex-col gap-3">
      {valore.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nessun fattore. Un fattore è ciò che fai variare tra le piante, es. Concime con i livelli 0, 50 e 100 kg/ha.
          Un esperimento semplice ne ha uno solo.
        </p>
      )}
      {valore.map((f, i) => (
        <EditorFattore
          key={f.id}
          numero={i + 1}
          valore={f}
          onChange={(nuovo) => onChange(valore.map(x => (x.id === f.id ? nuovo : x)))}
          onElimina={() => onChange(rinumera(valore.filter(x => x.id !== f.id)))}
          nuovo={testi[f.id] ?? ''}
          onNuovo={(testo) => cambiaTesti({ ...testi, [f.id]: testo })}
        />
      ))}
      <Button variant="outline" onClick={aggiungi} className="h-11 self-start">+ Fattore</Button>
    </div>
  )
}
