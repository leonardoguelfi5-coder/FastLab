import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const OPZIONI = [
  { tipo: 'termometro', emoji: '🌡', label: 'Termometro', desc: 'Temp. aria + Temp. pianta' },
  { tipo: 'spad', emoji: '💚', label: 'SPAD', desc: 'Lettura clorofilla SPAD' },
  { tipo: 'altezza', emoji: '📏', label: 'Altezza', desc: 'Altezza pianta (cm)' },
  { tipo: 'fenologici', emoji: '🌱', label: 'Fenologici', desc: 'Palchi, fiori, frutti, infiorescenze' },
] as const

export type TipoPassata = typeof OPZIONI[number]['tipo']

export function SceltaMisurazione() {
  const navigate = useNavigate()

  return (
    <div className="max-w-lg mx-auto p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>← Indietro</Button>
        <h1 className="text-xl font-bold">Tipo di passata</h1>
      </div>
      <p className="text-sm text-muted-foreground">Cosa stai misurando in questa passata?</p>

      <div className="flex flex-col gap-3 mt-2">
        {OPZIONI.map(({ tipo, emoji, label, desc }) => (
          <Card
            key={tipo}
            className="cursor-pointer active:scale-[0.98] transition-transform"
            onClick={() => navigate(`/passo/${tipo}`)}
          >
            <CardContent className="pt-4 flex items-center gap-4">
              <span className="text-4xl">{emoji}</span>
              <div>
                <p className="font-semibold text-base">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
