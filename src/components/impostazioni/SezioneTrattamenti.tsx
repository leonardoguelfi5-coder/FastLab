import { useId, useMemo, useState } from 'react'
import { aggiornaTrattamento } from '@/api/configurazione'
import { TestoErrore } from '@/components/TestoErrore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ConfigEsperimento, Trattamento } from '@/domain/tipi'
import { useAzione } from './azione'
import { useSegnalaModifiche } from './modifiche'
import { Sezione, Spiegazione } from './Sezione'

const normalizza = (s: string) => s.trim().toLowerCase()

/** Il problema dell'etichetta scritta per un trattamento, o null se si può salvare. */
function problemaEtichetta(t: Trattamento, testo: string, trattamenti: Trattamento[]): string | null {
  if (testo.trim() === '') return 'Manca l\'etichetta.'
  if (trattamenti.some(x => x.id !== t.id && normalizza(x.etichetta) === normalizza(testo))) {
    return 'C\'è già un trattamento con questa etichetta.'
  }
  return null
}

/** I fattori in sola lettura e le etichette dei trattamenti, ognuna con il suo "Salva". */
export function SezioneTrattamenti({ espId, config }: { espId: string; config: ConfigEsperimento }) {
  const id = useId()
  const { inCorso, esegui } = useAzione(espId)
  // Le etichette scritte e non ancora salvate, per trattamento.
  const [bozze, setBozze] = useState<Record<string, string>>({})
  const modificate = config.trattamenti.filter(t => (bozze[t.id] ?? t.etichetta) !== t.etichetta)
  useSegnalaModifiche('trattamenti', modificate.length > 0)

  // "Stress: S1 · Hydrochar: No": dice quale combinazione è ogni trattamento, anche dopo averlo rinominato.
  const combinazione = useMemo(() => {
    const livelli = new Map(config.fattori.flatMap(f => f.livelli.map(l => [l.id, `${f.nome}: ${l.nome}`])))
    return (t: Trattamento) => t.livello_ids.map(l => livelli.get(l)).filter(Boolean).join(' · ')
  }, [config.fattori])

  async function salva(t: Trattamento) {
    const inviata = bozze[t.id]
    if (inviata === undefined || problemaEtichetta(t, inviata, config.trattamenti) !== null) return
    const etichetta = inviata.trim()
    const riuscito = await esegui(() => aggiornaTrattamento(espId, t.id, etichetta), {
      messaggio: `Trattamento «${etichetta}» salvato.`,
      aggiorna: c => ({ ...c, trattamenti: c.trattamenti.map(x => (x.id === t.id ? { ...x, etichetta } : x)) }),
    })
    if (riuscito) {
      setBozze(b => {
        if (b[t.id] !== inviata) return b
        const resto = { ...b }
        delete resto[t.id]
        return resto
      })
    }
  }

  return (
    <Sezione titolo="Trattamenti">
      <Spiegazione>I fattori non si modificano dopo la creazione.</Spiegazione>
      <dl className="flex flex-col border-t border-riga">
        {config.fattori.map(f => (
          <div key={f.id} className="flex flex-wrap gap-x-3 border-b border-riga py-2.5">
            <dt className="font-semibold text-grafite">{f.nome}</dt>
            <dd className="text-grafite-tenue">{f.livelli.map(l => l.nome).join(', ')}</dd>
          </div>
        ))}
      </dl>

      <Spiegazione>Le etichette dei trattamenti si possono cambiare: compaiono nella scheda delle piante e nell'export.</Spiegazione>
      <ul className="flex flex-col gap-4">
        {config.trattamenti.map((t, i) => {
          const testo = bozze[t.id] ?? t.etichetta
          const modificata = testo !== t.etichetta
          const problema = problemaEtichetta(t, testo, config.trattamenti)
          const idCampo = `${id}-${t.id}`
          return (
            <li key={t.id} className="flex flex-col gap-1.5">
              <Label htmlFor={idCampo}>
                {combinazione(t) || `Trattamento ${i + 1}`}
              </Label>
              <div className="flex items-start gap-2">
                <Input
                  id={idCampo}
                  value={testo}
                  aria-invalid={problema !== null || undefined}
                  aria-describedby={problema ? `${idCampo}-problema` : undefined}
                  onChange={e => setBozze(b => ({ ...b, [t.id]: e.target.value }))}
                />
                <Button
                  variant="outline"
                  className="h-13"
                  disabled={!modificata || problema !== null || inCorso}
                  onClick={() => void salva(t)}
                >
                  Salva
                </Button>
              </div>
              {problema && <TestoErrore id={`${idCampo}-problema`}>{problema}</TestoErrore>}
            </li>
          )
        })}
      </ul>
    </Sezione>
  )
}
