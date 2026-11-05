import { useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { TestoErrore } from '@/components/TestoErrore'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CellaGriglia } from '@/domain/giro'
import { etichetteNumeriche, trovaPianta } from '@/domain/piante'
import type { Pianta } from '@/domain/tipi'
import { GrigliaPiante } from './GrigliaPiante'

interface FoglioPianteProps {
  aperto: boolean
  onOpenChange: (aperto: boolean) => void
  piante: Pianta[]
  /** `null` finché le misure di oggi non sono arrivate: gli stati non si inventano. */
  celle: CellaGriglia[] | null
  /** La pianta scelta (dalla griglia o dal campo). Chi chiama decide se serve una conferma e dove andare. */
  onScegli: (pianta: Pianta) => void
}

function Contenuto({ onOpenChange, piante, celle, onScegli }: Omit<FoglioPianteProps, 'aperto'>) {
  const idCampo = useId()
  const idErrore = useId()
  const campo = useRef<HTMLInputElement>(null)
  const [testo, setTesto] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const numeriche = useMemo(() => etichetteNumeriche(piante), [piante])

  function scegli(pianta: Pianta) {
    onOpenChange(false)
    onScegli(pianta)
  }

  function vai(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const cercata = testo.trim()
    if (cercata === '') return
    const pianta = trovaPianta(piante, cercata)
    if (pianta) {
      scegli(pianta)
      return
    }
    setErrore(`Nessuna pianta con etichetta «${cercata}» in questo esperimento.`)
    // Il testo resta selezionato: la prossima cifra lo sostituisce.
    campo.current?.focus()
    campo.current?.select()
  }

  return (
    <>
      <DialogTitle className="pr-10">Vai alla pianta</DialogTitle>
      <form onSubmit={vai} noValidate className="flex flex-col gap-1.5">
        <Label htmlFor={idCampo}>Etichetta della pianta</Label>
        {/* Le tastiere numeriche non hanno sempre il tasto Invio: "Vai" è accanto al campo. */}
        <div className="flex gap-2">
          <Input
            ref={campo}
            id={idCampo}
            type="text"
            variant="campo"
            className="min-w-0 flex-1"
            inputMode={numeriche ? 'numeric' : 'text'}
            enterKeyHint="go"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={testo}
            aria-invalid={errore ? true : undefined}
            aria-describedby={errore ? idErrore : undefined}
            onChange={e => { setTesto(e.target.value); setErrore(null) }}
          />
          <Button type="submit" variant="outline" size="lg" disabled={testo.trim() === ''}>Vai</Button>
        </div>
        {errore && <TestoErrore id={idErrore} role="alert">{errore}</TestoErrore>}
      </form>
      {celle
        ? <GrigliaPiante celle={celle} onScegli={scegli} />
        : <p className="text-grafite-tenue">Le misure di oggi non sono ancora arrivate.</p>}
    </>
  )
}

/**
 * "Vai alla pianta": un foglio dal basso con il campo dell'etichetta e la griglia delle piante di oggi. Non sa niente
 * di navigazione né di moduli aperti: dà la pianta scelta a `onScegli`, che passa dalla conferma di scarto.
 */
export function FoglioPiante({ aperto, onOpenChange, ...resto }: FoglioPianteProps) {
  return (
    <Dialog open={aperto} onOpenChange={onOpenChange}>
      <DialogContent posizione="basso">
        <Contenuto onOpenChange={onOpenChange} {...resto} />
      </DialogContent>
    </Dialog>
  )
}
