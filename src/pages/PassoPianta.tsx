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

const TIPO_LABEL: Record<TipoPassata, string> = {
  termometro: '🌡 Termometro',
  spad: '💚 SPAD',
  altezza: '📏 Altezza',
  fenologici: '🌱 Fenologici',
}

export function PassoPianta() {
  const navigate = useNavigate()
  const { tipo } = useParams<{ tipo: string }>()
  const tipoPassata = (tipo ?? 'termometro') as TipoPassata

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

    const oggi = new Date().toISOString().slice(0, 10)
    const esistente = rilevazioni.find(
      (r) => r.id_pianta === idPianta && r.data_ora_inizio.slice(0, 10) === oggi
    )

    if (esistente) {
      const aggiornata: RilevazionePrincipale = {
        ...esistente,
        ...campi,
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
    <div className="max-w-lg mx-auto p-4 pb-24 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/scegli')}>← Indietro</Button>
        <h1 className="text-xl font-bold">{TIPO_LABEL[tipoPassata]}</h1>
      </div>

      {saved !== null && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-800 font-medium">
          ✓ Pianta #{saved} salvata
        </div>
      )}

      <Card>
        <CardContent className="pt-4 flex flex-col gap-3">
          <NumericField
            label="ID Pianta (1–56)"
            value={idPianta}
            onChange={setIdPianta}
            required
          />
          {trattamento && (
            <Badge variant="secondary" className="w-fit">{trattamento}</Badge>
          )}
        </CardContent>
      </Card>

      {tipoPassata === 'termometro' && (
        <Card>
          <CardHeader><CardTitle className="text-base">Temperature</CardTitle></CardHeader>
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
        <Card>
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
        <Card>
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
          <Card>
            <CardHeader><CardTitle className="text-base">Misure fenologiche</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <NumericField
                label="Altezza (cm)"
                value={campi.altezza ?? null}
                onChange={(v) => updateCampo('altezza', v)}
              />
              <NumericField
                label="N. palchi totali"
                value={campi.n_palchi_totali ?? null}
                onChange={(v) => updateCampo('n_palchi_totali', v)}
              />
              <NumericField
                label="N. fiori fioriti"
                value={campi.n_fiori_fioriti ?? null}
                onChange={(v) => updateCampo('n_fiori_fioriti', v)}
              />
              <NumericField
                label="N. frutti"
                value={campi.n_frutti ?? null}
                onChange={(v) => updateCampo('n_frutti', v)}
              />
              <NumericField
                label="N. frutti invaiati"
                value={campi.n_frutti_invaiati ?? null}
                onChange={(v) => updateCampo('n_frutti_invaiati', v)}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <InlinePalchi
                palchi={campi.palchi ?? []}
                onChange={(p) => updateCampo('palchi', p)}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <InlineInfiorescenze
                infiorescenze={campi.infiorescenze ?? []}
                onChange={(i) => updateCampo('infiorescenze', i)}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 flex flex-col gap-2">
              <Label>Note (dettatura vocale)</Label>
              <Textarea
                value={campi.note ?? ''}
                onChange={(e) => updateCampo('note', e.target.value)}
                rows={3}
                placeholder="Note..."
              />
            </CardContent>
          </Card>
        </>
      )}

      {error && <p className="text-destructive text-sm font-medium">{error}</p>}

      <Button
        className="fixed bottom-4 left-4 right-4 max-w-[calc(100%-2rem)] h-14 text-lg"
        onClick={handleSave}
      >
        ✅ Salva Pianta #{idPianta ?? '?'}
      </Button>
    </div>
  )
}
