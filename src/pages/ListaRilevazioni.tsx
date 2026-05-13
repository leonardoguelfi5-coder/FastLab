import { useNavigate } from 'react-router-dom'
import { useRilevazioneStore } from '@/store/rilevazioneStore'
import { exportToExcel } from '@/lib/exportExcel'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Download, Plus, Pencil, Trash2, Ruler, Layers, Flower2, Leaf } from 'lucide-react'

export function ListaRilevazioni() {
  const navigate = useNavigate()
  const { rilevazioni, deleteRilevazione } = useRilevazioneStore()

  const handleExport = () => {
    if (rilevazioni.length === 0) return
    exportToExcel(rilevazioni)
  }

  return (
    <div className="max-w-lg mx-auto flex flex-col min-h-dvh">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <Leaf className="w-6 h-6" />
          <span className="text-lg font-bold tracking-tight">FastLab</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExport}
          disabled={rilevazioni.length === 0}
          className="text-primary-foreground hover:bg-primary-foreground/20 disabled:opacity-40 gap-1.5"
        >
          <Download className="w-4 h-4" />
          Excel
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 flex flex-col gap-3">
        {rilevazioni.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Leaf className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Nessuna rilevazione ancora.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Tocca <strong>+ Nuova</strong> per iniziare.
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide px-1">
              {rilevazioni.length} rilevazion{rilevazioni.length === 1 ? 'e' : 'i'}
            </p>
            {rilevazioni.map((r) => (
              <Card key={r.id} className="border-border shadow-sm overflow-hidden">
                <div className="h-1 bg-primary" />
                <CardContent className="pt-3 pb-3 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-base text-foreground">
                          Pianta #{r.id_pianta}
                        </span>
                        <Badge variant="secondary" className="text-xs font-medium shrink-0">
                          {r.trattamento}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        {r.altezza != null && (
                          <span className="flex items-center gap-1">
                            <Ruler className="w-3 h-3" />
                            {r.altezza} cm
                          </span>
                        )}
                        {(r.palchi ?? []).length > 0 && (
                          <span className="flex items-center gap-1">
                            <Layers className="w-3 h-3" />
                            {r.palchi.length} palchi
                          </span>
                        )}
                        {(r.infiorescenze ?? []).length > 0 && (
                          <span className="flex items-center gap-1">
                            <Flower2 className="w-3 h-3" />
                            {r.infiorescenze.length} inf.
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.data_ora_inizio).toLocaleString('it-IT', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 px-3 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                        onClick={() => navigate(`/modifica/${r.id}`)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Modifica
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10 gap-1"
                        onClick={() => {
                          if (confirm('Eliminare questa rilevazione?')) deleteRilevazione(r.id)
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Elimina
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>

      {/* FAB */}
      <div className="sticky bottom-0 p-4 bg-gradient-to-t from-background via-background/90 to-transparent pt-6">
        <Button
          size="lg"
          className="w-full h-14 text-base font-semibold shadow-lg gap-2"
          onClick={() => navigate('/scegli')}
        >
          <Plus className="w-5 h-5" />
          Nuova Rilevazione
        </Button>
      </div>
    </div>
  )
}
