import { useEffect } from 'react'
import { getTrattamento } from '@/data/piante'
import { NumericField } from './NumericField'
import { Badge } from '@/components/ui/badge'

interface FormPiantaProps {
  idPianta: number | null
  trattamento: string
  onIdPiantaChange: (id: number | null) => void
  onTrattamentoChange: (t: string) => void
}

export function FormPianta({ idPianta, trattamento, onIdPiantaChange, onTrattamentoChange }: FormPiantaProps) {
  useEffect(() => {
    if (!idPianta) { onTrattamentoChange(''); return }
    onTrattamentoChange(getTrattamento(idPianta))
  }, [idPianta])

  return (
    <div className="flex flex-col gap-3">
      <NumericField
        label="ID Pianta (1–56)"
        value={idPianta}
        onChange={onIdPiantaChange}
        required
      />
      {trattamento && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Trattamento:</span>
          <Badge variant="secondary" className="text-sm">{trattamento}</Badge>
        </div>
      )}
    </div>
  )
}
