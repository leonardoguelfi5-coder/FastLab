import type { BozzaEsperimento, Esperimento } from '@/domain/tipi'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface PassoGeneraleProps {
  bozza: BozzaEsperimento
  onChange: (b: BozzaEsperimento) => void
}

/** Passo 1: nome, data di inizio e note dell'esperimento. */
export function PassoGenerale({ bozza, onChange }: PassoGeneraleProps) {
  const e = bozza.esperimento
  const cambia = (modifica: Partial<Esperimento>) => onChange({ ...bozza, esperimento: { ...e, ...modifica } })

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-[65ch] text-grafite-tenue">Dai un nome all'esperimento. Data di inizio e note sono facoltative.</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="esp-nome">Nome</Label>
        <Input
          id="esp-nome"
          value={e.nome}
          placeholder="es. Concime × Pomodoro 2026"
          onChange={(ev) => cambia({ nome: ev.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="esp-data">Data di inizio</Label>
        <Input
          id="esp-data"
          type="date"
          variant="campo"
          value={e.data_inizio ?? ''}
          onChange={(ev) => cambia({ data_inizio: ev.target.value === '' ? null : ev.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="esp-note">Note</Label>
        <Textarea
          id="esp-note"
          value={e.note}
          rows={4}
          placeholder="es. serra 2, varietà Cuore di Bue"
          onChange={(ev) => cambia({ note: ev.target.value })}
        />
      </div>
    </div>
  )
}
