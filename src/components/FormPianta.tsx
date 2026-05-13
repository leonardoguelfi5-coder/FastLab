import { useEffect } from 'react'
import { getTrattamento } from '@/data/piante'
import { NumericField } from './NumericField'
import { Badge } from '@/components/ui/badge'

interface FormPiantaProps {
  idPianta: number | null
  trattamento: string
  onIdPiantaChange: (id: number | null) => void
  onTrattamentoChange: (t: string) => void
  readOnly?: boolean
}

export function FormPianta({ idPianta, trattamento, onIdPiantaChange, onTrattamentoChange, readOnly }: FormPiantaProps) {
  useEffect(() => {
    if (readOnly) return
    if (!idPianta) { onTrattamentoChange(''); return }
    onTrattamentoChange(getTrattamento(idPianta))
  }, [idPianta, readOnly])

  return (
    <div className="flex flex-col gap-3">
      {readOnly ? (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">ID Pianta</span>
          <p className="text-lg font-semibold">#{idPianta}</p>
        </div>
      ) : (
        <NumericField
          label="ID Pianta (1–56)"
          value={idPianta}
          onChange={onIdPiantaChange}
          required
        />
      )}
      {trattamento && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Trattamento:</span>
          <Badge variant="secondary" className="text-sm">{trattamento}</Badge>
        </div>
      )}
    </div>
  )
}
