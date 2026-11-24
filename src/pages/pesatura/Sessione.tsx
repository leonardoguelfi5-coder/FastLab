import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CloudOff, RotateCcw } from 'lucide-react'
import { useSessione } from '@/api/auth'
import { aggiornaSessione, eliminaSessione, listaPesatura, type DatiPesatura } from '@/api/pesatura'
import { chiavi, useConfig, usePesatura } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { RigaStato } from '@/components/Caricamento'
import { Conferma } from '@/components/Conferma'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { NotaSessione } from '@/components/pesatura/NotaSessione'
import { RiepilogoSessione } from '@/components/pesatura/RiepilogoSessione'
import { scaricaPesatura } from '@/components/pesatura/scaricaPesatura'
import { TestoErrore } from '@/components/TestoErrore'
import { Button, buttonVariants } from '@/components/ui/button'
import { avanzamentoFase, faseDaAprire, FASI, NOMI_FASE, passiDellaFase, pesoCompleto, statoSessione } from '@/domain/pesatura/sequenza'
import { NOMI_TIPO, type SessionePesatura } from '@/domain/pesatura/tipi'
import type { ConfigEsperimento } from '@/domain/tipi'
import { formattaData } from '@/lib/date'
import { ELEMENTO_NON_TROVATO, messaggioErrore, SESSIONE_CON_PESI_ALTRUI } from '@/lib/errori'
import { percorsoNuovaSessione, percorsoPesata, percorsoPesatura, percorsoSessioneTaratura } from '@/lib/percorsi'
import { usePermessi } from '@/lib/usePermessi'
import { useSenzaRete } from '@/lib/useSenzaRete'
import { SENZA_RETE_PESATURA } from './messaggi'
import { permessiSessione } from './sessioni'

// `conclusa` vale solo per i vasi, che qui non arrivano: resta per il tipo di `statoSessione`.
const TESTO_STATO = { conclusa: 'Conclusa', completa: 'Completa', mancano: 'Mancano dei pesi' } as const

/**
 * Il riepilogo di una sessione di pesata: pesi e valori calcolati, export ed eliminazione. Una sessione dei vasi va alla
 * Taratura. Solo online.
 */
export function Sessione() {
  const { espId = '', sessioneId = '' } = useParams()
  const dati = usePesatura(espId)
  const config = useConfig(espId)
  const senzaRete = useSenzaRete()
  const sessione = (dati.data?.sessioni ?? []).find(s => s.id === sessioneId) ?? null

  if (sessione && sessione.tipo === 'vasi') return <Navigate replace to={percorsoSessioneTaratura(espId, sessione.id)} />

  let corpo
  if (dati.data === undefined) {
    corpo = dati.isError
      ? <ErroreConRiprova errore={dati.error} onRiprova={() => void dati.refetch()} />
      : <RigaStato testo="Caricamento…" />
  } else if (!sessione) {
    corpo = (
      <div className="flex flex-col items-start gap-2">
        <p className="text-grafite">Sessione non trovata.</p>
        <Link to={percorsoPesatura(espId)} className={buttonVariants({ variant: 'ghost', className: '-ml-3' })}>Torna alla Pesatura</Link>
      </div>
    )
  } else if (config.data === undefined) {
    corpo = config.isError
      ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
      : <RigaStato testo="Caricamento…" />
  } else {
    corpo = <Contenuto key={sessione.id} espId={espId} sessione={sessione} dati={dati.data} config={config.data} />
  }

  return (
    <AppShell titolo="Sessione" indietro={percorsoPesatura(espId)} nav={espId}>
      {senzaRete && (
        <p role="status" className="mb-4 flex items-start gap-2 text-base text-grafite-tenue">
          <CloudOff aria-hidden className="mt-0.5 size-5 shrink-0" />
          {SENZA_RETE_PESATURA}
        </p>
      )}
      {corpo}
    </AppShell>
  )
}

function Contenuto({ espId, sessione, dati, config }: {
  espId: string
  sessione: SessionePesatura
  dati: DatiPesatura
  config: ConfigEsperimento
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const permessi = usePermessi(espId)
  const { sessione: utente } = useSessione()
  const senzaRete = useSenzaRete()
  const [occupato, setOccupato] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [confermaElimina, setConfermaElimina] = useState(false)

  const campioni = useMemo(() => dati.campioni.filter(c => c.sessione_id === sessione.id), [dati.campioni, sessione.id])
  const idCampioni = useMemo(() => new Set(campioni.map(c => c.id)), [campioni])
  const pesi = useMemo(() => dati.pesi.filter(p => idCampioni.has(p.campione_id)), [dati.pesi, idCampioni])
  const piante = useMemo(() => new Map(config.piante.map(p => [p.id, p])), [config])
  const trattamenti = useMemo(() => new Map(config.trattamenti.map(t => [t.id, t.etichetta])), [config])

  const { puoGestire, conPesiAltrui } = permessiSessione(permessi, utente?.user.id, sessione, pesi)
  const stato = statoSessione(sessione, campioni, pesi)

  /** Esegue un'azione che scrive o scarica: un solo tocco alla volta, l'errore resta sotto i pulsanti. */
  async function esegui(azione: () => Promise<void>) {
    if (occupato) return
    setOccupato(true)
    setErrore(null)
    try {
      await azione()
    } catch (e) {
      setErrore(messaggioErrore(e))
    } finally {
      setOccupato(false)
    }
  }

  const elimina = () => {
    setConfermaElimina(false)
    return esegui(async () => {
      try {
        await eliminaSessione(sessione.id)
      } catch (e) {
        // Nessuna riga eliminata: per chi non è il proprietario, quasi sempre un peso altrui arrivato nel frattempo.
        if (permessi.soloProprietario && e instanceof Error && e.message === ELEMENTO_NON_TROVATO) {
          throw new Error(SESSIONE_CON_PESI_ALTRUI, { cause: e })
        }
        throw e
      }
      await queryClient.invalidateQueries({ queryKey: chiavi.pesatura(espId) })
      navigate(percorsoPesatura(espId))
    })
  }

  /** I dati più freschi se arrivano, altrimenti quelli già in pagina: scaricare non deve fallire per un attimo senza rete. */
  const scarica = () => esegui(async () => {
    const freschi = await queryClient.fetchQuery({ queryKey: chiavi.pesatura(espId), queryFn: () => listaPesatura(espId), staleTime: 0 }).catch(() => dati)
    const aggiornata = freschi.sessioni.find(s => s.id === sessione.id) ?? sessione
    await scaricaPesatura({ sessioni: [aggiornata], dati: freschi, config })
  })

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-headline text-grafite">{sessione.titolo}</h1>
        <p className="text-grafite-tenue">{formattaData(sessione.data)} · {NOMI_TIPO[sessione.tipo]} · {sessione.unita}</p>
        <p className="text-base font-medium text-grafite">{TESTO_STATO[stato]}</p>
        <NotaSessione
          nota={sessione.nota}
          puoModificare={puoGestire}
          senzaRete={senzaRete}
          onSalva={async nota => {
            await aggiornaSessione({ id: sessione.id, data: sessione.data, nota, conclusa: sessione.conclusa })
            await queryClient.invalidateQueries({ queryKey: chiavi.pesatura(espId) })
          }}
        />
      </header>

      {permessi.puoMisurare && (
        <section aria-labelledby="titolo-fasi" className="flex flex-col gap-3">
          <h2 id="titolo-fasi" className="text-title text-grafite">Pesa</h2>
          <div className="flex flex-col gap-2">
            {FASI[sessione.tipo].map(fase => {
              const a = avanzamentoFase(passiDellaFase(sessione, campioni, pesi, fase), p => pesoCompleto(p, sessione.tipo, fase))
              return (
                <Link key={fase} to={percorsoPesata(espId, sessione.id, fase)} className={buttonVariants({ variant: 'outline', size: 'lg', className: 'justify-start' })}>
                  {`${NOMI_FASE[fase]} · ${a.pesati}/${a.totali}`}
                </Link>
              )
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="titolo-riepilogo" className="flex flex-col gap-3">
        <h2 id="titolo-riepilogo" className="text-title text-grafite">Riepilogo</h2>
        <RiepilogoSessione
          sessione={sessione} campioni={campioni} pesi={pesi} piante={piante} trattamenti={trattamenti}
          apri={permessi.puoMisurare
            ? (campione, replica) => percorsoPesata(espId, sessione.id, faseDaAprire(sessione, campione, replica, pesi), { campione, replica })
            : undefined}
        />
      </section>

      <section aria-labelledby="titolo-azioni" className="flex flex-col gap-3">
        <h2 id="titolo-azioni" className="text-title text-grafite">Esporta e gestisci</h2>
        <div className="flex flex-col items-stretch gap-2 sm:items-start">
          <Button type="button" size="lg" disabled={occupato} onClick={() => void scarica()}>Scarica Excel</Button>
          {permessi.puoMisurare && (
            <Link to={percorsoNuovaSessione(espId, sessione.id)} className={buttonVariants({ size: 'lg', variant: 'outline' })}>
              <RotateCcw aria-hidden />
              Ripeti questa pesata
            </Link>
          )}
          {puoGestire && !conPesiAltrui && (
            <Button type="button" size="lg" variant="ghost" disabled={occupato || senzaRete} onClick={() => setConfermaElimina(true)}>
              Elimina pesata
            </Button>
          )}
        </div>
        {puoGestire && conPesiAltrui && <p className="text-base text-grafite-tenue">{SESSIONE_CON_PESI_ALTRUI}</p>}
        {errore && <TestoErrore role="alert" className="text-base">{errore}</TestoErrore>}
      </section>

      <Conferma
        aperta={confermaElimina}
        titolo="Eliminare la pesata?"
        testo="Spariscono anche tutti i suoi campioni e i suoi pesi. Non si può annullare."
        annulla="Tieni la pesata"
        conferma="Elimina"
        onAnnulla={() => setConfermaElimina(false)}
        onConferma={() => void elimina()}
      />
    </div>
  )
}
