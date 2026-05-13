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
    <div className="max-w-lg mx-auto p-4 pb-24 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>← Indietro</Button>
        <h1 className="text-xl font-bold">{isEditMode ? 'Modifica Rilevazione' : 'Nuova Rilevazione'}</h1>
      </div>
      <p className="text-xs text-muted-foreground">
        Inizio: {new Date(form.data_ora_inizio).toLocaleTimeString('it-IT')}
      </p>

      <Card>
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

      <Card>
        <CardHeader><CardTitle className="text-base">Misure pianta</CardTitle></CardHeader>
        <CardContent>
          <FormMisure
            values={form}
            onChange={(key: MisureKeys, value) => updateField(key, value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <InlinePalchi palchi={form.palchi ?? []} onChange={(p) => updateField('palchi', p)} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <InlineInfiorescenze
            infiorescenze={form.infiorescenze ?? []}
            onChange={(i) => updateField('infiorescenze', i)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 flex flex-col gap-2">
          <Label>Note (dettatura vocale)</Label>
          <Textarea
            value={form.note}
            onChange={(e) => updateField('note', e.target.value)}
            rows={3}
            placeholder="Note..."
          />
        </CardContent>
      </Card>

      {error && <p className="text-destructive text-sm font-medium">{error}</p>}

      <Button
        className="fixed bottom-4 left-4 right-4 max-w-[calc(100%-2rem)] h-14 text-lg"
        onClick={handleSave}
      >
        {isEditMode ? '✅ Aggiorna Rilevazione' : '✅ Salva Rilevazione'}
      </Button>
    </div>
  )
}
