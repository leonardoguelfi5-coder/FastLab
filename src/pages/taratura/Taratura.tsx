import { Link, useParams } from 'react-router-dom'
import { CloudOff, Plus, RotateCcw } from 'lucide-react'
import { usePesatura } from '@/api/query'
import type { DatiPesatura } from '@/api/pesatura'
import { AppShell } from '@/components/AppShell'
import { RigaStato } from '@/components/Caricamento'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { buttonVariants } from '@/components/ui/button'
import { normalizzaSensore, type SessionePesatura } from '@/domain/pesatura/tipi'
import { formattaData } from '@/lib/date'
import { percorsoLaboratorio, percorsoNuovaTaratura, percorsoSessioneTaratura } from '@/lib/percorsi'
import { usePermessi } from '@/lib/usePermessi'
import { useSenzaRete } from '@/lib/useSenzaRete'
import { SENZA_RETE_TARATURA } from '@/pages/pesatura/messaggi'
import { dallaPiuRecente } from '@/pages/pesatura/sessioni'

/** La prima riga della nota, per l'elenco (il resto lo taglia la riga stessa con i puntini). */
const inizioNota = (nota: string | null): string | null => nota?.trim().split('\n')[0]?.trim() || null

interface Voce {
  sessione: SessionePesatura
  vasi: number
  pesate: number
}

/** Le sessioni dei vasi, dalla più recente, con quanti vasi e quante pesate hanno. */
function vociDi(dati: DatiPesatura): Voce[] {
  return dati.sessioni.filter(s => s.tipo === 'vasi').sort(dallaPiuRecente).map(s => {
    const ids = new Set(dati.campioni.filter(c => c.sessione_id === s.id).map(c => c.id))
    return { sessione: s, vasi: ids.size, pesate: dati.pesi.filter(p => ids.has(p.campione_id)).length }
  })
}

const conta = (n: number, uno: string, tanti: string) => `${n} ${n === 1 ? uno : tanti}`

/**
 * La Taratura e stress idrico: le sessioni dei vasi (curve di ritenzione idrica), una nuova taratura e «Ripeti».
 * Una taratura non si chiude: si arricchisce quando si vuole, quindi niente «In corso» / «Completate». Solo online.
 */
export function Taratura() {
  const { espId = '' } = useParams()
  const pesatura = usePesatura(espId)
  const permessi = usePermessi(espId)
  const senzaRete = useSenzaRete()
  const voci = pesatura.data ? vociDi(pesatura.data) : []

  return (
    <AppShell titolo="Taratura e stress idrico" indietro={percorsoLaboratorio(espId)} nav={espId}>
      <div className="flex flex-col gap-8">
        {senzaRete && (
          <p role="status" className="flex items-start gap-2 text-base text-grafite-tenue">
            <CloudOff aria-hidden className="mt-0.5 size-5 shrink-0" />
            {SENZA_RETE_TARATURA}
          </p>
        )}

        {permessi.puoMisurare && (
          <Link to={percorsoNuovaTaratura(espId)} className={buttonVariants({ size: 'lg', className: 'w-full' })}>
            <Plus aria-hidden strokeWidth={2.5} />
            Nuova taratura
          </Link>
        )}

        {pesatura.isError ? (
          <ErroreConRiprova errore={pesatura.error} onRiprova={() => void pesatura.refetch()} />
        ) : pesatura.data === undefined ? (
          <RigaStato testo="Caricamento…" />
        ) : voci.length === 0 ? (
          <p className="text-grafite-tenue">Nessuna taratura per ora.</p>
        ) : (
          <section aria-labelledby="titolo-tarature" className="flex flex-col gap-3">
            <h2 id="titolo-tarature" className="flex items-baseline gap-2 text-title text-grafite">
              Tarature
              <span className="text-sm font-medium text-grafite-tenue">{voci.length}</span>
            </h2>
            <ul aria-label="Tarature" className="rounded-2xl border border-riga bg-foglio">
              {voci.map(v => <Riga key={v.sessione.id} voce={v} espId={espId} ripeti={permessi.puoMisurare} />)}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  )
}

function Riga({ voce, espId, ripeti }: { voce: Voce; espId: string; ripeti: boolean }) {
  const s = voce.sessione
  const nota = inizioNota(s.nota)
  const sensore = normalizzaSensore(s.impostazioni.sensore)
  const idTitolo = `taratura-${s.id}`
  return (
    <li className="flex items-start border-b border-riga last:border-0">
      <Link to={percorsoSessioneTaratura(espId, s.id)} className="flex min-w-0 flex-1 flex-col gap-0.5 py-3.5 pr-1 pl-4 text-grafite">
        <span className="text-sm text-grafite-tenue">
          <span className="font-mono">{formattaData(s.data)}</span>
          {sensore && ` · ${sensore.tipo === 'tdr' ? 'TDR' : 'Tensione'}`}
        </span>
        <span id={idTitolo} className="font-[600] break-words">{s.titolo}</span>
        {nota && <span className="truncate text-sm text-grafite-tenue">{nota}</span>}
        <span className="mt-1 text-sm font-medium text-grafite-tenue">
          {conta(voce.vasi, 'vaso', 'vasi')} · {conta(voce.pesate, 'pesata', 'pesate')}
        </span>
      </Link>
      {ripeti && (
        <Link
          to={percorsoNuovaTaratura(espId, s.id)}
          aria-describedby={idTitolo}
          className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'mt-2 mr-2 px-3' })}
        >
          <RotateCcw aria-hidden className="size-4.5" />
          Ripeti
        </Link>
      )}
    </li>
  )
}
