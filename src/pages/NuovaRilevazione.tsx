import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRilevazioneStore } from '@/store/rilevazioneStore'
import type { RilevazionePrincipale } from '@/types'
import { FormPianta } from '@/components/FormPianta'
import { FormMisure } from '@/components/FormMisure'
import { InlinePalchi } from '@/components/InlinePalchi'
import { InlineInfiorescenze } from '@/components/InlineInfiorescenze'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Save, RefreshCw } from 'lucide-react'

type MisureKeys = 'altezza' | 'n_palchi_totali' | 'n_fiori_fioriti' | 'n_frutti' | 'n_frutti_invaiati' | 'spad' | 'temp_aria' | 'temp_pianta'

function emptyForm(lastTempAria: number | null): RilevazionePrincipale {
  return {
    id: crypto.randomUUID(),
    data_ora_inizio: new Date().toISOString(),
    data_ora_fine: '',
    id_pianta: null,
    trattamento: '',
    altezza: null,
    n_palchi_totali: null,
    n_fiori_fioriti: null,
    n_frutti: null,
    n_frutti_invaiati: null,
    spad: null,
    temp_aria: lastTempAria,
    temp_pianta: null,
    note: '',
    palchi: [],
    infiorescenze: [],
  }
}

export function NuovaRilevazione() {
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const { rilevazioni, lastTempAria, addRilevazione, updateRilevazione, setLastTempAria } =
    useRilevazioneStore()

  const isEditMode = Boolean(id)
  const existing = id ? rilevazioni.find((r) => r.id === id) : undefined

  const [form, setForm] = useState<RilevazionePrincipale>(() =>
    existing ? { ...existing } : emptyForm(lastTempAria)
  )
  const [error, setError] = useState<string | null>(null)

  const updateField = (key: keyof RilevazionePrincipale, value: unknown) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const handleSave = () => {
    if (!form.id_pianta || form.id_pianta < 1 || form.id_pianta > 56) {
      setError('Inserisci un ID Pianta valido (1–56)')
      return
    }
    setError(null)
    const saved: RilevazionePrincipale = { ...form, data_ora_fine: new Date().toISOString() }
    if (isEditMode) {
      updateRilevazione(saved)
    } else {
      addRilevazione(saved)
    }
    if (form.temp_aria !== null) setLastTempAria(form.temp_aria)
    navigate('/')
  }

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
        <div className="flex-1 min-w-0">
          <p className="text-lg font-bold leading-tight">
            {isEditMode ? 'Modifica Rilevazione' : 'Nuova Rilevazione'}
          </p>
          <p className="text-xs text-primary-foreground/70">
            {new Date(form.data_ora_inizio).toLocaleTimeString('it-IT')}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 pb-28 flex flex-col gap-4">
        <Card className="border-border shadow-sm">
          <CardContent className="pt-4">
            <FormPianta
              idPianta={form.id_pianta}
              trattamento={form.trattamento}
              onIdPiantaChange={isEditMode ? () => {} : (v) => updateField('id_pianta', v)}
              onTrattamentoChange={(v) => updateField('trattamento', v)}
              readOnly={isEditMode}
            />
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Misure pianta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FormMisure
              values={form}
              onChange={(key: MisureKeys, value) => updateField(key, value)}
            />
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardContent className="pt-4">
            <InlinePalchi palchi={form.palchi ?? []} onChange={(p) => updateField('palchi', p)} />
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardContent className="pt-4">
            <InlineInfiorescenze
              infiorescenze={form.infiorescenze ?? []}
              onChange={(i) => updateField('infiorescenze', i)}
            />
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardContent className="pt-4 flex flex-col gap-2">
            <Label className="text-sm font-medium">Note (dettatura vocale)</Label>
            <Textarea
              value={form.note}
              onChange={(e) => updateField('note', e.target.value)}
              rows={3}
              placeholder="Note..."
              className="resize-none"
            />
          </CardContent>
        </Card>

        {error && (
          <p className="text-destructive text-sm font-medium bg-destructive/10 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>

      {/* Fixed save button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background/95 to-transparent">
        <Button
          className="w-full max-w-lg mx-auto block h-14 text-base font-semibold shadow-lg"
          onClick={handleSave}
        >
          {isEditMode ? (
            <><RefreshCw className="w-5 h-5 inline mr-2" />Aggiorna Rilevazione</>
          ) : (
            <><Save className="w-5 h-5 inline mr-2" />Salva Rilevazione</>
          )}
        </Button>
      </div>
    </div>
  )
}
