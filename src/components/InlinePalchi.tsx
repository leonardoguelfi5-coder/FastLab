import { useState } from 'react'
import type { Palco } from '@/types'
import { Button } from '@/components/ui/button'
import { NumericField } from './NumericField'

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
        <span className="text-sm font-semibold">Palchi ({palchi.length})</span>
        <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
          + Palco
        </Button>
      </div>

      {palchi.map((p) => (
        <div key={p.numero_palco} className="flex items-center gap-2 bg-muted rounded px-3 py-2 text-sm">
          <span className="font-medium w-16">Palco {p.numero_palco}</span>
          <span>{p.n_foglie} foglie</span>
        </div>
      ))}

      {adding && (
        <div className="flex items-end gap-2 border rounded p-3">
          <div className="flex-1">
            <NumericField
              label={`Palco ${palchi.length + 1} — N. Foglie`}
              value={newFoglie}
              onChange={setNewFoglie}
              required
            />
          </div>
          <Button type="button" onClick={addPalco} disabled={newFoglie === null}>✓</Button>
        </div>
      )}
    </div>
  )
}
