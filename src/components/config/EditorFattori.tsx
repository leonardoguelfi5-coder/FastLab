import { nuovoId } from '@/lib/id'
import { useId, useState } from 'react'
import { X } from 'lucide-react'
import type { Fattore } from '@/domain/tipi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TestoErrore } from '@/components/TestoErrore'
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
    // Un fattore è una voce del quaderno: una linea sopra, il numero come intestazione, nessun riquadro.
    <fieldset className="flex flex-col gap-4 border-t border-riga pt-4">
      <legend className="float-left mb-1 w-full text-label text-grafite-tenue tabular-nums">{`Fattore ${numero}`}</legend>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-nome`}>Nome del fattore</Label>
        <Input
          id={`${id}-nome`}
          value={valore.nome}
          placeholder="es. Stress"
          onChange={(e) => onChange({ ...valore, nome: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <p id={`${id}-livelli`} className="text-label text-grafite-tenue">Livelli</p>
        {valore.livelli.length === 0 ? (
          <p className="text-sm text-grafite-tenue">Nessun livello: aggiungi i valori che prende il fattore, es. Controllo, S1, S2.</p>
        ) : (
          <ul aria-labelledby={`${id}-livelli`} className="flex flex-wrap gap-2">
            {valore.livelli.map(l => (
              <li key={l.id} className="flex min-h-11 max-w-full items-center rounded-lg border border-riga bg-foglio pl-3.5 text-base break-all text-grafite">
                {l.nome}
                <Button
                  variant="quiet"
                  size="icon"
                  aria-label={`Togli il livello «${l.nome}»`}
                  onClick={() => onChange({ ...valore, livelli: rinumera(valore.livelli.filter(x => x.id !== l.id)) })}
                  className="rounded-lg text-grafite-tenue"
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
            className="flex-1"
          />
          <Button variant="outline" size="lg" onClick={aggiungiLivello} disabled={nuovo.trim() === '' || doppio} className="px-4">
            Aggiungi livello
          </Button>
        </div>
        {doppio && <TestoErrore id={`${id}-doppio`}>C'è già un livello con questo nome.</TestoErrore>}
      </div>

      <Button variant="destructive" size="sm" onClick={onElimina} className="self-start">Elimina fattore</Button>
    </fieldset>
  )
}

/** Fattori sperimentali e i loro livelli (mostrati come chip). */
export function EditorFattori({ valore, onChange, inSospeso, onInSospeso }: EditorFattoriProps) {
  const [interni, setInterni] = useState<Record<string, string>>({})
  const testi = inSospeso ?? interni
  const cambiaTesti = onInSospeso ?? setInterni

  function aggiungi() {
    onChange([...valore, { id: nuovoId(), nome: '', ordine: valore.length, livelli: [] }])
  }

  return (
    <div className="flex flex-col gap-5">
      {valore.length === 0 && (
        <p className="max-w-[65ch] text-sm text-grafite-tenue">
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
      <Button variant="outline" onClick={aggiungi} className="self-start">+ Fattore</Button>
    </div>
  )
}
