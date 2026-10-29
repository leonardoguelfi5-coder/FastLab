import { useId } from 'react'
import { Espandibile } from '@/components/Espandibile'
import { Scelta } from '@/components/Scelta'
import { TestoErrore } from '@/components/TestoErrore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Pianta, Trattamento } from '@/domain/tipi'

interface VocePiantaProps {
  /** La pianta com'è salvata. */
  pianta: Pianta
  /** Quel che si vede e si modifica (la bozza, o la pianta salvata). */
  valore: Pianta
  trattamenti: Trattamento[]
  /** Il problema dell'etichetta scritta, o null. */
  problema: string | null
  modificata: boolean
  /** Se la pianta ha misure; `undefined` finché non lo si sa. */
  haDati: boolean | undefined
  aperta: boolean
  inCorso: boolean
  onApri: () => void
  onChange: (p: Pianta) => void
  onSalva: () => void
  onAnnulla: () => void
  onRimuovi: () => void
}

function riassunto(p: Pianta, haDati: boolean | undefined): string {
  const parti = [p.blocco ? `Blocco ${p.blocco}` : 'Senza blocco']
  if (haDati !== undefined) parti.push(haDati ? 'ha dati' : 'nessuna misura')
  return parti.join(' · ')
}

/**
 * Una pianta nell'elenco delle impostazioni: chiusa è una riga "#12 · Blocco B · ha dati"; aperta modifica etichetta,
 * blocco e (solo senza dati) trattamento, e offre "Rimuovi" solo a una pianta senza misure.
 */
export function VocePianta({
  pianta, valore, trattamenti, problema, modificata, haDati, aperta, inCorso,
  onApri, onChange, onSalva, onAnnulla, onRimuovi,
}: VocePiantaProps) {
  const id = useId()
  const cambia = (modifica: Partial<Pianta>) => onChange({ ...valore, ...modifica })
  const motivoTrattamento = haDati === undefined
    ? 'Si può cambiare solo a una pianta senza misure: controllo in corso…'
    : haDati ? 'Ha dati: il trattamento non si può cambiare.' : null

  return (
    <Espandibile
      titolo={<span className="font-mono tabular-nums">{`#${pianta.etichetta}`}</span>}
      riassunto={riassunto(pianta, haDati)}
      nota={modificata ? 'Modifiche non salvate' : undefined}
      aperto={aperta}
      onCambia={onApri}
    >
      <div className="grid grid-cols-[1fr_7rem] items-start gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-etichetta`}>Etichetta</Label>
          <Input
            id={`${id}-etichetta`}
            variant="campo"
            value={valore.etichetta}
            aria-invalid={problema !== null || undefined}
            aria-describedby={problema ? `${id}-problema` : undefined}
            onChange={e => cambia({ etichetta: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-blocco`}>Blocco</Label>
          <Input
            id={`${id}-blocco`}
            variant="campo"
            value={valore.blocco ?? ''}
            placeholder="—"
            onChange={e => cambia({ blocco: e.target.value.trim() === '' ? null : e.target.value })}
          />
        </div>
      </div>
      {problema && <TestoErrore id={`${id}-problema`}>{problema}</TestoErrore>}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-trattamento`}>Trattamento</Label>
        <Scelta
          id={`${id}-trattamento`}
          value={valore.trattamento_id}
          disabled={haDati !== false}
          aria-describedby={motivoTrattamento ? `${id}-trattamento-motivo` : undefined}
          onChange={e => cambia({ trattamento_id: e.target.value })}
        >
          {trattamenti.map(t => <option key={t.id} value={t.id}>{t.etichetta}</option>)}
        </Scelta>
        {motivoTrattamento && (
          <p id={`${id}-trattamento-motivo`} className="text-sm text-grafite-tenue">{motivoTrattamento}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={!modificata || problema !== null || inCorso} onClick={onSalva}>
          {inCorso ? 'Salvataggio…' : 'Salva'}
        </Button>
        {modificata && <Button variant="ghost" disabled={inCorso} onClick={onAnnulla}>Annulla le modifiche</Button>}
      </div>

      {/* Lontano da "Salva": non si rimuove una pianta per sbaglio. */}
      {haDati ? (
        <p className="text-sm text-grafite-tenue">Ha dati: non si può rimuovere</p>
      ) : (
        <Button variant="destructive" size="sm" className="self-start" disabled={haDati === undefined || inCorso} onClick={onRimuovi}>
          Rimuovi
        </Button>
      )}
    </Espandibile>
  )
}
