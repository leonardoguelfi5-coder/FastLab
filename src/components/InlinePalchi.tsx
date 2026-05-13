import { useState } from 'react'
import type { Palco } from '@/types'
import { Button } from '@/components/ui/button'
import { NumericField } from './NumericField'
import { Plus, Check, Layers } from 'lucide-react'

interface InlinePalchiProps {
  palchi: Palco[]
  onChange: (palchi: Palco[]) => void
}

export function InlinePalchi({ palchi, onChange }: InlinePalchiProps) {
  const [adding, setAdding] = useState(false)
  const [newFoglie, setNewFoglie] = useState<number | null>(null)

  const addPalco = () => {
    if (newFoglie === null) return
    onChange([...palchi, { numero_palco: palchi.length + 1, n_foglie: newFoglie }])
    setNewFoglie(null)
    setAdding(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Palchi ({palchi.length})</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-3 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
          onClick={() => setAdding(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          Palco
        </Button>
      </div>

      {palchi.map((p) => (
        <div
          key={p.numero_palco}
          className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2.5 text-sm"
        >
          <span className="font-medium text-foreground w-16">Palco {p.numero_palco}</span>
          <span className="text-muted-foreground">{p.n_foglie} foglie</span>
        </div>
      ))}

      {adding && (
        <div className="flex items-end gap-2 border-2 border-primary/20 rounded-xl p-3 bg-primary/5">
          <div className="flex-1">
            <NumericField
              label={`Palco ${palchi.length + 1} — N. Foglie`}
              value={newFoglie}
              onChange={setNewFoglie}
              required
            />
          </div>
          <Button
            type="button"
            size="icon"
            className="h-12 w-12 shrink-0"
            onClick={addPalco}
            disabled={newFoglie === null}
          >
            <Check className="w-5 h-5" />
          </Button>
        </div>
      )}
    </div>
  )
}
