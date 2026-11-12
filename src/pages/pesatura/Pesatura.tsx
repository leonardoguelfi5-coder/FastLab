import { Link, useParams } from 'react-router-dom'
import { Check, CloudOff, Plus, RotateCcw } from 'lucide-react'
import { usePesatura } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { RigaStato } from '@/components/Caricamento'
import { buttonVariants } from '@/components/ui/button'
import type { DatiPesatura } from '@/api/pesatura'
import { avanzamentoFasi, eCompletata, NOMI_FASE } from '@/domain/pesatura/sequenza'
import { NOMI_TIPO, type SessionePesatura } from '@/domain/pesatura/tipi'
import { formattaData } from '@/lib/date'
import { percorsoLaboratorio, percorsoNuovaSessione, percorsoSessione } from '@/lib/percorsi'
import { useSenzaRete } from '@/lib/useSenzaRete'
import { usePermessi } from '@/lib/usePermessi'
import { cn } from '@/lib/utils'
import { SENZA_RETE_PESATURA } from './messaggi'

/** Dalla più recente: per data, a parità per quando è stata creata. */
function dallaPiuRecente(a: SessionePesatura, b: SessionePesatura): number {
  return b.data.localeCompare(a.data) || (b.creato_il ?? '').localeCompare(a.creato_il ?? '') || a.id.localeCompare(b.id)
}

/** La prima riga della nota, per l'elenco (il resto lo taglia la riga stessa con i puntini). */
const inizioNota = (nota: string | null): string | null => nota?.trim().split('\n')[0]?.trim() || null

interface Voce {
  sessione: SessionePesatura
  completata: boolean
  /** Le fasi della pesata con il loro stato, per le pesate in corso. */
  fasi: { nome: string; conta: string; stato: 'fatta' | 'attuale' | 'dopo' }[]
  /** Per le completate: quanti pesi ha. */
  pesi: number
}

function vociDi(dati: DatiPesatura): Voce[] {
  return [...dati.sessioni].sort(dallaPiuRecente).map(s => {
    const campioni = dati.campioni.filter(c => c.sessione_id === s.id)
    const ids = new Set(campioni.map(c => c.id))
    const pesi = dati.pesi.filter(p => ids.has(p.campione_id))
    let attualeTrovata = false
    const fasi: Voce['fasi'] = avanzamentoFasi(s, campioni, pesi).map(a => {
      const fatta = a.totali > 0 && a.pesati === a.totali
      const stato = fatta ? 'fatta' : attualeTrovata ? 'dopo' : 'attuale'
      if (!fatta) attualeTrovata = true
      return { nome: NOMI_FASE[a.fase], conta: `${a.pesati}/${a.totali}`, stato }
    })
    if (s.tipo === 'vasi') {
      const n = pesi.filter(p => p.tipo === 'asciugatura').length
      fasi.push({ nome: NOMI_FASE.asciugatura, conta: `${n} ${n === 1 ? 'peso' : 'pesi'}`, stato: attualeTrovata ? 'dopo' : 'attuale' })
    }
    return { sessione: s, completata: eCompletata(s, campioni, pesi), fasi, pesi: pesi.length }
  })
}

/** La Pesatura: una nuova pesata, quelle in corso e quelle completate. Solo online. */
export function Pesatura() {
  const { espId = '' } = useParams()
  const pesatura = usePesatura(espId)
  const permessi = usePermessi(espId)
  const senzaRete = useSenzaRete()

  const voci = pesatura.data ? vociDi(pesatura.data) : []
  const inCorso = voci.filter(v => !v.completata)
  const completate = voci.filter(v => v.completata)

  return (
    <AppShell titolo="Pesatura" indietro={percorsoLaboratorio(espId)} nav={espId}>
      <div className="flex flex-col gap-8">
        {senzaRete && (
          <p role="status" className="flex items-start gap-2 text-base text-grafite-tenue">
            <CloudOff aria-hidden className="mt-0.5 size-5 shrink-0" />
            {SENZA_RETE_PESATURA}
          </p>
        )}

        {permessi.puoMisurare && (
          <Link to={percorsoNuovaSessione(espId)} className={buttonVariants({ size: 'lg', className: 'w-full' })}>
            <Plus aria-hidden strokeWidth={2.5} />
            Nuova pesata
          </Link>
        )}

        {pesatura.isError ? (
          <ErroreConRiprova errore={pesatura.error} onRiprova={() => void pesatura.refetch()} />
        ) : pesatura.data === undefined ? (
          <RigaStato testo="Caricamento…" />
        ) : voci.length === 0 ? (
          <p className="text-grafite-tenue">Nessuna pesata per ora.</p>
        ) : (
          <>
            {inCorso.length > 0 && <Elenco id="in-corso" titolo="In corso" voci={inCorso} espId={espId} ripeti={permessi.puoMisurare} />}
            {completate.length > 0 && <Elenco id="completate" titolo="Completate" voci={completate} espId={espId} ripeti={permessi.puoMisurare} />}
          </>
        )}
      </div>
    </AppShell>
  )
}

function Elenco({ id, titolo, voci, espId, ripeti }: { id: string; titolo: string; voci: Voce[]; espId: string; ripeti: boolean }) {
  return (
    <section aria-labelledby={`titolo-${id}`} className="flex flex-col gap-3">
      <h2 id={`titolo-${id}`} className="flex items-baseline gap-2 text-title text-grafite">
        {titolo}
        <span className="text-sm font-medium text-grafite-tenue">{voci.length}</span>
      </h2>
      <ul aria-labelledby={`titolo-${id}`} className="rounded-2xl border border-riga bg-foglio">
        {voci.map(v => <Riga key={v.sessione.id} voce={v} espId={espId} ripeti={ripeti} />)}
      </ul>
    </section>
  )
}

function Riga({ voce, espId, ripeti }: { voce: Voce; espId: string; ripeti: boolean }) {
  const s = voce.sessione
  const nota = inizioNota(s.nota)
  const idTitolo = `pesata-${s.id}`
  return (
    <li className="flex items-start border-b border-riga last:border-0">
      <Link to={percorsoSessione(espId, s.id)} className="flex min-w-0 flex-1 flex-col gap-0.5 py-3.5 pr-1 pl-4 text-grafite">
        <span className="text-sm text-grafite-tenue"><span className="font-mono">{formattaData(s.data)}</span> · {NOMI_TIPO[s.tipo]}</span>
        <span id={idTitolo} className="font-[600] break-words">{s.titolo}</span>
        {nota && <span className="truncate text-sm text-grafite-tenue">{nota}</span>}
        {voce.completata ? (
          <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-registrato">
            <Check aria-hidden className="size-4" strokeWidth={3} />
            {s.tipo === 'vasi' ? 'Conclusa' : 'Completa'} · {voce.pesi === 1 ? '1 peso' : `${voce.pesi} pesi`}
          </span>
        ) : (
          <span className="mt-2 flex flex-wrap gap-1.5">
            {voce.fasi.map(f => (
              <span
                key={f.nome}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-sm',
                  f.stato === 'fatta' && 'bg-registrato-velato font-medium text-registrato',
                  f.stato === 'attuale' && 'border border-inchiostro font-semibold text-inchiostro',
                  f.stato === 'dopo' && 'border border-riga-forte text-grafite-tenue',
                )}
              >
                {f.stato === 'fatta' && <Check aria-hidden className="size-3.5" strokeWidth={3} />}
                {f.nome}
                {f.stato !== 'fatta' && <span className="font-mono">{f.conta}</span>}
              </span>
            ))}
          </span>
        )}
      </Link>
      {ripeti && (
        <Link
          to={percorsoNuovaSessione(espId, s.id)}
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
