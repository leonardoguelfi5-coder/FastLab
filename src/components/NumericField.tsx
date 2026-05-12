import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

interface NumericFieldProps {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  required?: boolean
  placeholder?: string
}

export function NumericField({ label, value, onChange, required, placeholder }: NumericFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-sm font-medium">{label}</Label>
      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') { onChange(null); return }
          const num = parseFloat(raw)
          if (!isNaN(num)) onChange(num)
        }}
        required={required}
        placeholder={placeholder ?? '—'}
        className="text-lg h-12"
      />
    </div>
  )
}
