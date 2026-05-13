import { useState } from 'react'
import type { Infiorescenza } from '@/types'
import { Button } from '@/components/ui/button'
import { NumericField } from './NumericField'
import { Plus, Check, Flower2 } from 'lucide-react'

interface InlineInfiorescenzeProps {
  infiorescenze: Infiorescenza[]
  onChange: (infiorescenze: Infiorescenza[]) => void
}

export function InlineInfiorescenze({ infiorescenze, onChange }: InlineInfiorescenzeProps) {
  const [adding, setAdding] = useState(false)
  const [newFiori, setNewFiori] = useState<number | null>(null)

  const addInfiorescenza = () => {
    if (newFiori === null) return
    onChange([...infiorescenze, { numero_infiorescenza: infiorescenze.length + 1, n_fiori: newFiori }])
    setNewFiori(null)
    setAdding(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Flower2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Infiorescenze ({infiorescenze.length})</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-3 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
          onClick={() => setAdding(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          Inf.
        </Button>
      </div>

      {infiorescenze.map((inf) => (
        <div
          key={inf.numero_infiorescenza}
          className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2.5 text-sm"
        >
          <span className="font-medium text-foreground w-20">Inf. {inf.numero_infiorescenza}</span>
          <span className="text-muted-foreground">{inf.n_fiori} fiori</span>
        </div>
      ))}

      {adding && (
        <div className="flex items-end gap-2 border-2 border-primary/20 rounded-xl p-3 bg-primary/5">
          <div className="flex-1">
            <NumericField
              label={`Inf. ${infiorescenze.length + 1} — N. Fiori`}
              value={newFiori}
              onChange={setNewFiori}
              required
            />
          </div>
          <Button
            type="button"
            size="icon"
            className="h-12 w-12 shrink-0"
            onClick={addInfiorescenza}
            disabled={newFiori === null}
          >
            <Check className="w-5 h-5" />
          </Button>
        </div>
      )}
    </div>
  )
}
