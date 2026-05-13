import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Thermometer, Droplets, Ruler, Sprout, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

const OPZIONI = [
  {
    tipo: 'termometro',
    icon: Thermometer,
    label: 'Termometro',
    desc: 'Temp. aria + Temp. pianta',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
  },
  {
    tipo: 'spad',
    icon: Droplets,
    label: 'SPAD',
    desc: 'Lettura clorofilla SPAD',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
  },
  {
    tipo: 'altezza',
    icon: Ruler,
    label: 'Altezza',
    desc: 'Altezza pianta (cm)',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  {
    tipo: 'fenologici',
    icon: Sprout,
    label: 'Fenologici',
    desc: 'Palchi, fiori, frutti, infiorescenze',
    color: 'text-primary',
    bg: 'bg-primary/10',
    border: 'border-primary/20',
  },
] as const

export type TipoPassata = typeof OPZIONI[number]['tipo']

export function SceltaMisurazione() {
  const navigate = useNavigate()

  return (
    <div className="max-w-lg mx-auto flex flex-col min-h-dvh">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3 shadow-md">
        <Button
          variant="ghost"
          size="icon"
          className="text-primary-foreground hover:bg-primary-foreground/20 h-9 w-9 shrink-0"
          onClick={() => navigate('/')}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <span className="text-lg font-bold">Tipo di passata</span>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 flex flex-col gap-3">
        <p className="text-sm text-muted-foreground px-1 pb-1">
          Cosa stai misurando in questa passata?
        </p>

        {OPZIONI.map(({ tipo, icon: Icon, label, desc, color, bg, border }) => (
          <button
            key={tipo}
            onClick={() => navigate(`/passo/${tipo}`)}
            className={`
              w-full flex items-center gap-4 p-4 rounded-xl border-2 ${border}
              bg-white active:scale-[0.98] transition-transform duration-150
              text-left shadow-sm
            `}
          >
            <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
              <Icon className={`w-6 h-6 ${color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>
    </div>
  )
}
