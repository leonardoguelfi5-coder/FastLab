import { useNavigate } from 'react-router-dom'
import { useRilevazioneStore } from '@/store/rilevazioneStore'
import { exportToExcel } from '@/lib/exportExcel'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function ListaRilevazioni() {
  const navigate = useNavigate()
  const { rilevazioni, deleteRilevazione } = useRilevazioneStore()

  const handleExport = () => {
    if (rilevazioni.length === 0) return
    exportToExcel(rilevazioni)
  }

  return (
    <div className="max-w-lg mx-auto p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">FastLab 🌱</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={rilevazioni.length === 0}
          >
            ⬇ Excel
          </Button>
          <Button size="sm" onClick={() => navigate('/nuova')}>
            + Nuova
          </Button>
        </div>
      </div>

      {rilevazioni.length === 0 && (
        <p className="text-center text-muted-foreground py-12 text-sm">
          Nessuna rilevazione ancora.<br />
          Tocca <strong>+ Nuova</strong> per iniziare.
        </p>
      )}

      {rilevazioni.map((r) => (
        <Card key={r.id}>
          <CardContent className="pt-4 flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <p className="font-semibold">Pianta #{r.id_pianta}</p>
              <Badge variant="secondary" className="w-fit text-xs">{r.trattamento}</Badge>
              <div className="text-xs text-muted-foreground mt-1 flex gap-3 flex-wrap">
                {r.altezza != null && <span>📏 {r.altezza} cm</span>}
                {r.palchi.length > 0 && <span>🌿 {r.palchi.length} palchi</span>}
                {r.infiorescenze.length > 0 && <span>🌸 {r.infiorescenze.length} inf.</span>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <p className="text-xs text-muted-foreground">
                {new Date(r.data_ora_inizio).toLocaleString('it-IT', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                })}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive h-7 px-2 text-xs"
                onClick={() => {
                  if (confirm('Eliminare questa rilevazione?')) deleteRilevazione(r.id)
                }}
              >
                Elimina
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
