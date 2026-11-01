import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ConfigEsperimento } from '@/domain/tipi'
import { FotoNota } from './FotoNota'
import { SceltaCollegamento } from './SceltaCollegamento'
import { conData, conPromemoria, type StatoNota } from './statoNota'

interface EditorNotaProps {
  espId: string
  config: ConfigEsperimento
  stato: StatoNota
  onCambia: (stato: StatoNota) => void
  /** Il giorno di oggi (`useOggi`): una data dopo spunta da sola "Ricordamelo quel giorno". */
  oggi: string
  /** Se la nota è già un promemoria (salvata): la casella ci torna, se la data non è futura e non è stata toccata. */
  eraPromemoria: boolean
  /** La nota già salvata che si sta modificando, a cui si collegano le foto; null per una nota nuova. */
  notaSalvataId: string | null
  /** Una nota nuova: il cursore parte nel testo. */
  nuova: boolean
  /** Il modulo riparte da una bozza lasciata a metà. */
  ripresa: boolean
  /** Cosa impedisce di salvare e si può correggere (data, scelta vuota). */
  problemi: string[]
  disabilitato: boolean
}

/**
 * L'editor di una nota in pagina (spec §5.7): testo, data (di base oggi, anche passata o futura), collegamento, la
 * casella "Ricordamelo quel giorno" e le foto della nota. Controllato: chi lo usa tiene lo stato, la bozza e il salvataggio.
 */
export function EditorNota({ espId, config, stato, onCambia, oggi, eraPromemoria, notaSalvataId, nuova, ripresa, problemi, disabilitato }: EditorNotaProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-6">
      {ripresa && (
        <p role="status" className="text-sm text-grafite-tenue">Bozza ripresa: la nota non era stata salvata.</p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-testo`}>Nota</Label>
        <Textarea
          id={`${id}-testo`}
          autoFocus={nuova}
          disabled={disabilitato}
          value={stato.testo}
          onChange={e => onCambia({ ...stato, testo: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-data`}>Data</Label>
        <Input
          id={`${id}-data`}
          type="date"
          variant="campo"
          disabled={disabilitato}
          value={stato.data}
          onChange={e => onCambia(conData(stato, e.target.value, oggi, eraPromemoria))}
        />
      </div>

      <SceltaCollegamento config={config} stato={stato} onCambia={onCambia} />

      <div className="flex flex-col gap-0.5">
        <label htmlFor={`${id}-promemoria`} className="flex min-h-11 cursor-pointer items-center gap-3 text-base font-medium text-grafite">
          <input
            id={`${id}-promemoria`}
            type="checkbox"
            checked={stato.promemoria}
            disabled={disabilitato}
            aria-describedby={`${id}-promemoria-aiuto`}
            onChange={e => onCambia(conPromemoria(stato, e.target.checked))}
            className="size-6 shrink-0 cursor-pointer accent-inchiostro"
          />
          Ricordamelo quel giorno
        </label>
        <p id={`${id}-promemoria-aiuto`} className="pl-9 text-sm text-grafite-tenue">
          Quel giorno la nota compare in Oggi, finché non la spunti. Con una data futura la casella si spunta da sola.
        </p>
      </div>

      <FotoNota espId={espId} config={config} notaId={notaSalvataId} />

      {problemi.length > 0 && (
        <div className="flex flex-col gap-1">
          {problemi.map(p => <p key={p} className="text-sm text-grafite-tenue">{p}</p>)}
        </div>
      )}
    </div>
  )
}
