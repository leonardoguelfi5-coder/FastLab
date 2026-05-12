import { useState } from 'react'
import { Infiorescenza } from '@/types'
import { Button } from '@/components/ui/button'
import { NumericField } from './NumericField'

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
        <span className="text-sm font-semibold">Infiorescenze ({infiorescenze.length})</span>
        <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
          + Inf.
        </Button>
      </div>

      {infiorescenze.map((inf) => (
        <div key={inf.numero_infiorescenza} className="flex items-center gap-2 bg-muted rounded px-3 py-2 text-sm">
          <span className="font-medium w-20">Inf. {inf.numero_infiorescenza}</span>
          <span>{inf.n_fiori} fiori</span>
        </div>
      ))}

      {adding && (
        <div className="flex items-end gap-2 border rounded p-3">
          <div className="flex-1">
            <NumericField
              label={`Inf. ${infiorescenze.length + 1} — N. Fiori`}
              value={newFiori}
              onChange={setNewFiori}
              required
            />
          </div>
          <Button type="button" onClick={addInfiorescenza} disabled={newFiori === null}>✓</Button>
        </div>
      )}
    </div>
  )
}
