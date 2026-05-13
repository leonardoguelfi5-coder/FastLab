import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRilevazioneStore } from '@/store/rilevazioneStore'
import type { RilevazionePrincipale } from '@/types'
import type { TipoPassata } from './SceltaMisurazione'
import { getTrattamento } from '@/data/piante'
import { NumericField } from '@/components/NumericField'
import { InlinePalchi } from '@/components/InlinePalchi'
import { InlineInfiorescenze } from '@/components/InlineInfiorescenze'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Thermometer, Droplets, Ruler, Sprout, CheckCircle2, Save } from 'lucide-react'

type CampiPassata = {
  temp_aria?: number | null
  temp_pianta?: number | null
  spad?: number | null
  altezza?: number | null
  n_palchi_totali?: number | null
  n_fiori_fioriti?: number | null
  n_frutti?: number | null
  n_frutti_invaiati?: number | null
  note?: string
  palchi?: RilevazionePrincipale['palchi']
  infiorescenze?: RilevazionePrincipale['infiorescenze']
}

function campiVuoti(tipo: TipoPassata, lastTempAria: number | null): CampiPassata {
  switch (tipo) {
    case 'termometro':
      return { temp_aria: lastTempAria, temp_pianta: null }
    case 'spad':
      return { spad: null }
    case 'altezza':
      return { altezza: null }
    case 'fenologici':
      return {
        altezza: null,
        n_palchi_totali: null,
        n_fiori_fioriti: null,
        n_frutti: null,
        n_frutti_invaiati: null,
        note: '',
        palchi: [],
        infiorescenze: [],
      }
  }
}

const TIPO_CONFIG: Record<TipoPassata, { label: string; icon: React.ElementType; color: string }> = {
  termometro: { label: 'Termometro', icon: Thermometer, color: 'text-orange-600' },
  spad:        { label: 'SPAD',        icon: Droplets,    color: 'text-emerald-600' },
  altezza:     { label: 'Altezza',     icon: Ruler,       color: 'text-blue-600' },
  fenologici:  { label: 'Fenologici',  icon: Sprout,      color: 'text-primary' },
}

export function PassoPianta() {
  const navigate = useNavigate()
  const { tipo } = useParams<{ tipo: string }>()
  const tipoPassata = (tipo ?? 'termometro') as TipoPassata
  const { label, icon: TipoIcon, color } = TIPO_CONFIG[tipoPassata]

  const { rilevazioni, lastTempAria, addRilevazione, updateRilevazione, setLastTempAria } =
    useRilevazioneStore()

  const [idPianta, setIdPianta] = useState<number | null>(null)
  const [campi, setCampi] = useState<CampiPassata>(() => campiVuoti(tipoPassata, lastTempAria))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<number | null>(null)

  const updateCampo = <K extends keyof CampiPassata>(key: K, value: CampiPassata[K]) => {
    setCampi((c) => ({ ...c, [key]: value }))
  }

  const trattamento = idPianta && idPianta >= 1 && idPianta <= 56
    ? getTrattamento(idPianta)
    : null

  const handleSave = () => {
    if (!idPianta || idPianta < 1 || idPianta > 56) {
      setError('Inserisci un ID Pianta valido (1–56)')
      return
    }
    setError(null)

    const now = new Date()
    const oggi = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const esistente = rilevazioni.find((r) => {
      if (r.id_pianta !== idPianta) return false
      const d = new Date(r.data_ora_inizio)
      const dataLocale = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return dataLocale === oggi
    })

    if (esistente) {
      const campiDefiniti = Object.fromEntries(
        Object.entries(campi).filter(([k, v]) => {
          if (v === null || v === undefined) return false
          if ((k === 'palchi' || k === 'infiorescenze') && Array.isArray(v) && v.length === 0) return false
          return true
        })
      ) as Partial<CampiPassata>
      const aggiornata: RilevazionePrincipale = {
        ...esistente,
        ...campiDefiniti,
        data_ora_fine: new Date().toISOString(),
      }
      updateRilevazione(aggiornata)
    } else {
      const nuova: RilevazionePrincipale = {
        id: crypto.randomUUID(),
        data_ora_inizio: new Date().toISOString(),
        data_ora_fine: new Date().toISOString(),
        id_pianta: idPianta,
        trattamento: getTrattamento(idPianta),
        altezza: null,
        n_palchi_totali: null,
        n_fiori_fioriti: null,
        n_frutti: null,
        n_frutti_invaiati: null,
        spad: null,
        temp_aria: null,
        temp_pianta: null,
        note: '',
        palchi: [],
        infiorescenze: [],
        ...campi,
      }
      addRilevazione(nuova)
    }

    if ('temp_aria' in campi && campi.temp_aria !== null && campi.temp_aria !== undefined) {
      setLastTempAria(campi.temp_aria)
    }

    setSaved(idPianta)
    setIdPianta(null)
  }

  return (
    <div className="max-w-lg mx-auto flex flex-col min-h-dvh">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3 shadow-md">
        <Button
          variant="ghost"
          size="icon"
          className="text-primary-foreground hover:bg-primary-foreground/20 h-9 w-9 shrink-0"
          onClick={() => navigate('/scegli')}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <TipoIcon className={`w-5 h-5 ${color} bg-white/20 rounded p-0.5`} />
        <span className="text-lg font-bold">{label}</span>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 pb-24 flex flex-col gap-4">
        {/* Success toast */}
        {saved !== null && (
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-xl px-4 py-3 text-sm text-primary font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Pianta #{saved} salvata
          </div>
        )}

        {/* Plant ID */}
        <Card className="border-border shadow-sm">
          <CardContent className="pt-4 flex flex-col gap-3">
            <NumericField
              label="ID Pianta (1–56)"
              value={idPianta}
              onChange={setIdPianta}
              required
            />
            {trattamento && (
              <Badge className="w-fit bg-primary/10 text-primary border-primary/20 font-medium">
                {trattamento}
              </Badge>
            )}
          </CardContent>
        </Card>

        {tipoPassata === 'termometro' && (
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Temperature
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <NumericField
                label="Temp. aria (°C)"
                value={campi.temp_aria ?? null}
                onChange={(v) => updateCampo('temp_aria', v)}
              />
              <NumericField
                label="Temp. pianta (°C)"
                value={campi.temp_pianta ?? null}
                onChange={(v) => updateCampo('temp_pianta', v)}
              />
            </CardContent>
          </Card>
        )}

        {tipoPassata === 'spad' && (
          <Card className="border-border shadow-sm">
            <CardContent className="pt-4">
              <NumericField
                label="SPAD"
                value={campi.spad ?? null}
                onChange={(v) => updateCampo('spad', v)}
              />
            </CardContent>
          </Card>
        )}

        {tipoPassata === 'altezza' && (
          <Card className="border-border shadow-sm">
            <CardContent className="pt-4">
              <NumericField
                label="Altezza (cm)"
                value={campi.altezza ?? null}
                onChange={(v) => updateCampo('altezza', v)}
              />
            </CardContent>
          </Card>
        )}

        {tipoPassata === 'fenologici' && (
          <>
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Misure fenologiche
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <NumericField label="Altezza (cm)" value={campi.altezza ?? null} onChange={(v) => updateCampo('altezza', v)} />
                <NumericField label="N. palchi totali" value={campi.n_palchi_totali ?? null} onChange={(v) => updateCampo('n_palchi_totali', v)} />
                <NumericField label="N. fiori fioriti" value={campi.n_fiori_fioriti ?? null} onChange={(v) => updateCampo('n_fiori_fioriti', v)} />
                <NumericField label="N. frutti" value={campi.n_frutti ?? null} onChange={(v) => updateCampo('n_frutti', v)} />
                <NumericField label="N. frutti invaiati" value={campi.n_frutti_invaiati ?? null} onChange={(v) => updateCampo('n_frutti_invaiati', v)} />
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardContent className="pt-4">
                <InlinePalchi palchi={campi.palchi ?? []} onChange={(p) => updateCampo('palchi', p)} />
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardContent className="pt-4">
                <InlineInfiorescenze infiorescenze={campi.infiorescenze ?? []} onChange={(i) => updateCampo('infiorescenze', i)} />
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardContent className="pt-4 flex flex-col gap-2">
                <Label className="text-sm font-medium">Note (dettatura vocale)</Label>
                <Textarea
                  value={campi.note ?? ''}
                  onChange={(e) => updateCampo('note', e.target.value)}
                  rows={3}
                  placeholder="Note..."
                  className="resize-none"
                />
              </CardContent>
            </Card>
          </>
        )}

        {error && (
          <p className="text-destructive text-sm font-medium bg-destructive/10 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>

      {/* Fixed save button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background/95 to-transparent">
        <Button
          className="w-full max-w-lg mx-auto block h-14 text-base font-semibold shadow-lg gap-2"
          onClick={handleSave}
        >
          <Save className="w-5 h-5 inline mr-2" />
          Salva Pianta #{idPianta ?? '?'}
        </Button>
      </div>
    </div>
  )
}
