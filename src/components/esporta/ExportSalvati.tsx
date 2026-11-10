import { useQueryClient } from '@tanstack/react-query'
import { useExportSalvati } from '@/api/query'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { Button } from '@/components/ui/button'
import {
  SCELTA_TUTTO, applicaAllaConfigurazione, descriviScelta, leggiSceltaExport, type SceltaExport,
} from '@/domain/export/scelte'
import type { ConfigEsperimento, ExportSalvato } from '@/domain/tipi'
import { cn } from '@/lib/utils'
import { eliminaExportConAnnulla, senzaExportInEliminazione } from './eliminaExportConAnnulla'
import { Pin } from 'lucide-react'

/** L'identificativo di «Tutto l'esperimento» tra gli export segnati come quello in uso: non è una riga del database. */
export const ID_TUTTO = 'tutto'

const APPLICA = 'flex min-h-14 min-w-0 flex-1 flex-col items-start justify-center gap-0.5 px-3 py-2 text-left transition-colors -outline-offset-2 hover:bg-carta-ombra/70 active:bg-carta-ombra'
const RIGA = 'flex items-stretch border-b border-riga'
const RIGA_IN_USO = 'bg-inchiostro-velato'

interface RigaSalvataProps {
  espId: string
  config: ConfigEsperimento
  salvato: ExportSalvato
  inUso: boolean
  onApplica: (scelta: SceltaExport, id: string) => void
}

/** Un export salvato: nome e, sotto, le sue scelte a parole; toccarlo le applica (non scarica). Su ognuno «Elimina». */
function RigaSalvata({ espId, config, salvato, inUso, onApplica }: RigaSalvataProps) {
  const queryClient = useQueryClient()
  const letta = leggiSceltaExport(salvato.scelte)
  // Gli ids di strumenti, trattamenti o piante eliminati dopo il salvataggio si scartano e la riga lo dice.
  const applicata = letta === null ? null : applicaAllaConfigurazione(letta, config)

  return (
    <li className={cn(RIGA, inUso && RIGA_IN_USO)}>
      {letta === null || applicata === null ? (
        <div className="flex min-h-14 min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-2">
          <span className="truncate text-title text-grafite">{salvato.nome}</span>
          <span className="text-sm font-medium text-attenzione">Non più leggibile: eliminalo.</span>
        </div>
      ) : (
        <button type="button" aria-pressed={inUso} onClick={() => onApplica(applicata.scelta, salvato.id)} className={APPLICA}>
          <span className="max-w-full truncate text-title text-grafite">{salvato.nome}</span>
          <span className="text-dato text-grafite-tenue">{descriviScelta(applicata.scelta, config)}</span>
          {applicata.scartati.length > 0 && <span className="text-sm font-medium text-attenzione">{applicata.scartati.join(' · ')}</span>}
        </button>
      )}
      <Button type="button" variant="quiet" size="sm" className="self-center" onClick={() => eliminaExportConAnnulla(queryClient, espId, salvato)}>
        Elimina
      </Button>
    </li>
  )
}

interface ExportSalvatiProps {
  espId: string
  config: ConfigEsperimento
  /** Quello che ha dato le scelte di adesso (`ID_TUTTO` o l'id di un salvato), o `null` se le scelte sono state toccate. */
  inUso: string | null
  onApplica: (scelta: SceltaExport, id: string) => void
}

/**
 * «Export salvati»: «📌 Tutto l'esperimento» sempre per primo (una costante del client, non si elimina), poi gli export
 * dell'utente in questo esperimento. Toccarne uno applica le sue scelte alla pagina; il download è sempre «Scarica Excel».
 */
export function ExportSalvati({ espId, config, inUso, onApplica }: ExportSalvatiProps) {
  const salvati = useExportSalvati(espId)
  // Le righe in attesa di eliminazione restano fuori anche se l'elenco viene riletto dal server nei 5 secondi.
  const righe = salvati.data ? senzaExportInEliminazione(salvati.data) : []

  return (
    <div className="flex flex-col gap-2">
      <ul aria-label="Export salvati" className="flex flex-col border-t border-riga">
        <li className={cn(RIGA, inUso === ID_TUTTO && RIGA_IN_USO)}>
          <button type="button" aria-pressed={inUso === ID_TUTTO} onClick={() => onApplica(SCELTA_TUTTO, ID_TUTTO)} className={APPLICA}>
            <span className="text-title text-grafite"><Pin aria-hidden className="mr-1.5 inline size-4 align-[-2px]" />Tutto l'esperimento</span>
          </button>
        </li>
        {righe.map(e => (
          <RigaSalvata key={e.id} espId={espId} config={config} salvato={e} inUso={inUso === e.id} onApplica={onApplica} />
        ))}
        {salvati.data === undefined && !salvati.isError && (
          <li className="px-3 py-3"><p role="status" className="text-base text-grafite-tenue">Carico gli export salvati…</p></li>
        )}
      </ul>
      {salvati.isError && salvati.data === undefined && <ErroreConRiprova errore={salvati.error} onRiprova={() => void salvati.refetch()} />}
    </div>
  )
}
