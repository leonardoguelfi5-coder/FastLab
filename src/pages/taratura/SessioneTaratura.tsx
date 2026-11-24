import { useId, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CloudOff, RotateCcw } from 'lucide-react'
import { useSessione } from '@/api/auth'
import { caricaConfig } from '@/api/esperimenti'
import { aggiornaSessione, eliminaPeso, eliminaSessione, listaPesatura, salvaPeso, type DatiPesatura } from '@/api/pesatura'
import { chiavi, usePesatura } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { RigaStato } from '@/components/Caricamento'
import { Conferma } from '@/components/Conferma'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { GraficoCurve } from '@/components/pesatura/GraficoCurve'
import { NotaSessione } from '@/components/pesatura/NotaSessione'
import { scaricaGraficoPng, scaricaPesatura } from '@/components/pesatura/scaricaPesatura'
import { Calcolatore } from '@/components/taratura/Calcolatore'
import { RiepilogoVasi } from '@/components/taratura/RiepilogoVasi'
import { TestoErrore } from '@/components/TestoErrore'
import { Button, buttonVariants } from '@/components/ui/button'
import { equazione, type CurveSubstrato } from '@/domain/pesatura/curva'
import { gruppiDeiVasi, nomeLettura } from '@/domain/pesatura/export'
import { FASI, NOMI_FASE } from '@/domain/pesatura/sequenza'
import type { Peso, SessionePesatura } from '@/domain/pesatura/tipi'
import { formattaData } from '@/lib/date'
import { ELEMENTO_NON_TROVATO, messaggioErrore, SESSIONE_CON_PESI_ALTRUI } from '@/lib/errori'
import { percorsoNuovaTaratura, percorsoPesataTaratura, percorsoSessione, percorsoTaratura } from '@/lib/percorsi'
import { usePermessi } from '@/lib/usePermessi'
import { useSenzaRete } from '@/lib/useSenzaRete'
import { SENZA_RETE_TARATURA } from '@/pages/pesatura/messaggi'

/**
 * Una taratura dei vasi: intestazione con la nota, le curve per substrato con l'equazione, il riassunto delle pesate
 * (si corregge, si elimina, si aggiunge), il calcolatore e l'export. Una sessione di un altro tipo va alla Pesatura.
 * Solo online.
 */
export function SessioneTaratura() {
  const { espId = '', sessioneId = '' } = useParams()
  const dati = usePesatura(espId)
  const senzaRete = useSenzaRete()
  const sessione = (dati.data?.sessioni ?? []).find(s => s.id === sessioneId) ?? null

  if (sessione && sessione.tipo !== 'vasi') return <Navigate replace to={percorsoSessione(espId, sessione.id)} />

  let corpo
  if (dati.data === undefined) {
    corpo = dati.isError
      ? <ErroreConRiprova errore={dati.error} onRiprova={() => void dati.refetch()} />
      : <RigaStato testo="Caricamento…" />
  } else if (!sessione) {
    corpo = (
      <div className="flex flex-col items-start gap-2">
        <p className="text-grafite">Sessione non trovata.</p>
        <Link to={percorsoTaratura(espId)} className={buttonVariants({ variant: 'ghost', className: '-ml-3' })}>Torna alla Taratura</Link>
      </div>
    )
  } else {
    corpo = <Contenuto key={sessione.id} espId={espId} sessione={sessione} dati={dati.data} />
  }

  return (
    <AppShell titolo="Taratura" indietro={percorsoTaratura(espId)} nav={espId}>
      {senzaRete && (
        <p role="status" className="mb-4 flex items-start gap-2 text-base text-grafite-tenue">
          <CloudOff aria-hidden className="mt-0.5 size-5 shrink-0" />
          {SENZA_RETE_TARATURA}
        </p>
      )}
      {corpo}
    </AppShell>
  )
}

function Contenuto({ espId, sessione, dati }: { espId: string; sessione: SessionePesatura; dati: DatiPesatura }) {
  const idCurve = useId()
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
  const vasi = useMemo(() => gruppiDeiVasi([sessione], dati), [sessione, dati])

  // Come `puo_gestire_sessione` del database: il proprietario, oppure chi ha creato la sessione. Il database ha l'ultima parola.
  const puoGestire = permessi.puoMisurare && (!permessi.soloProprietario || (sessione.creato_da !== undefined && sessione.creato_da === utente?.user.id))
  // Come `sessioni_pesatura_delete` (20261111000018): chi non è il proprietario non elimina una sessione con pesi
  // di altre persone, che sparirebbero con lei.
  const conPesiAltrui = permessi.soloProprietario && pesi.some(p => p.creato_da !== utente?.user.id)

  const rileggi = () => queryClient.invalidateQueries({ queryKey: chiavi.pesatura(espId) })

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
      await rileggi()
      navigate(percorsoTaratura(espId))
    })
  }

  /** I dati più freschi se arrivano, altrimenti quelli già in pagina: scaricare non deve fallire per un attimo senza rete. */
  const scarica = () => esegui(async () => {
    const freschi = await queryClient.fetchQuery({ queryKey: chiavi.pesatura(espId), queryFn: () => listaPesatura(espId), staleTime: 0 }).catch(() => dati)
    // I vasi non usano le piante: la configurazione serve solo al foglio Info dell'Excel, si legge qui.
    const configurazione = await caricaConfig(espId)
    const aggiornata = freschi.sessioni.find(s => s.id === sessione.id) ?? sessione
    await scaricaPesatura({ sessioni: [aggiornata], dati: freschi, config: configurazione })
  })

  const scaricaPng = (gruppo: CurveSubstrato) => esegui(async () => {
    await scaricaGraficoPng({ gruppo, sensore: vasi.sensore, titolo: sessione.titolo })
  })

  // Lanciano se non riescono: l'errore lo mostra il riassunto, accanto al vaso.
  const salva = async (p: Peso) => {
    await salvaPeso(espId, sessione.id, p)
    await rileggi()
  }
  const eliminaUnPeso = async (p: Peso) => {
    await eliminaPeso(p.id)
    await rileggi()
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-headline text-grafite">{sessione.titolo}</h1>
        <p className="text-grafite-tenue">{formattaData(sessione.data)} · {nomeLettura(vasi.sensore)} · {sessione.unita}</p>
        <NotaSessione
          nota={sessione.nota}
          puoModificare={puoGestire}
          senzaRete={senzaRete}
          onSalva={async nota => {
            // `conclusa` non si legge più, ma si conserva com'è.
            await aggiornaSessione({ id: sessione.id, data: sessione.data, nota, conclusa: sessione.conclusa })
            await rileggi()
          }}
        />
      </header>

      <section aria-labelledby={`${idCurve}-curve`} className="flex flex-col gap-4">
        <h2 id={`${idCurve}-curve`} className="text-title text-grafite">Curve di ritenzione</h2>
        {vasi.gruppi.length === 0 && <p className="text-grafite-tenue">Questa sessione non ha vasi.</p>}
        {vasi.gruppi.map((g, i) => (
          <section key={g.substrato} aria-labelledby={`${idCurve}-${i}`} className="flex flex-col gap-3">
            <h3 id={`${idCurve}-${i}`} className="text-base font-semibold text-grafite">{g.substrato}</h3>
            <GraficoCurve gruppo={g} sensore={vasi.sensore} />
            <p className="font-mono text-base tabular-nums text-grafite">
              {g.media ? equazione(g.media, vasi.sensore) : 'servono almeno 3 letture diverse in un vaso per la curva'}
            </p>
            <Button type="button" variant="outline" className="self-start" disabled={occupato} aria-label={`Scarica grafico (PNG), ${g.substrato}`} onClick={() => void scaricaPng(g)}>
              Scarica grafico (PNG)
            </Button>
          </section>
        ))}
      </section>

      <section aria-labelledby={`${idCurve}-pesate`} className="flex flex-col gap-3">
        <h2 id={`${idCurve}-pesate`} className="text-title text-grafite">Pesate</h2>
        <RiepilogoVasi
          sessione={sessione}
          campioni={campioni}
          pesi={pesi}
          puoAggiungere={permessi.puoMisurare}
          puoCorreggere={permessi.puoCorreggere}
          senzaRete={senzaRete}
          onSalva={salva}
          onElimina={eliminaUnPeso}
        />
      </section>

      {vasi.gruppi.length > 0 && <Calcolatore gruppi={vasi.gruppi} sensore={vasi.sensore} />}

      <section aria-labelledby={`${idCurve}-azioni`} className="flex flex-col gap-3">
        <h2 id={`${idCurve}-azioni`} className="text-title text-grafite">Esporta e gestisci</h2>
        {permessi.puoMisurare && (
          <div role="group" aria-labelledby={`${idCurve}-giro`} className="flex flex-col gap-2">
            <h3 id={`${idCurve}-giro`} className="text-base font-semibold text-grafite">Pesa tutti i vasi</h3>
            <p className="text-sm text-grafite-tenue">Un vaso dopo l&apos;altro, anche a voce.</p>
            {/* Le tre fasi sono sempre raggiungibili, anche complete: servono a ripesare in fila. */}
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-start">
              {FASI.vasi.map(fase => (
                <Link key={fase} to={percorsoPesataTaratura(espId, sessione.id, fase)} className={buttonVariants({ variant: 'outline', size: 'lg', className: 'justify-start' })}>
                  {NOMI_FASE[fase]}
                </Link>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col items-stretch gap-2 sm:items-start">
          <Button type="button" size="lg" disabled={occupato} onClick={() => void scarica()}>Scarica Excel</Button>
          {permessi.puoMisurare && (
            <Link to={percorsoNuovaTaratura(espId, sessione.id)} className={buttonVariants({ size: 'lg', variant: 'outline' })}>
              <RotateCcw aria-hidden />
              Ripeti questa taratura
            </Link>
          )}
          {puoGestire && !conPesiAltrui && (
            <Button type="button" size="lg" variant="ghost" disabled={occupato || senzaRete} onClick={() => setConfermaElimina(true)}>
              Elimina taratura
            </Button>
          )}
        </div>
        {puoGestire && conPesiAltrui && <p className="text-base text-grafite-tenue">{SESSIONE_CON_PESI_ALTRUI}</p>}
        {errore && <TestoErrore role="alert" className="text-base">{errore}</TestoErrore>}
      </section>

      <Conferma
        aperta={confermaElimina}
        titolo="Eliminare la taratura?"
        testo="Spariscono anche tutti i suoi vasi e le sue pesate. Non si può annullare."
        annulla="Tieni la taratura"
        conferma="Elimina"
        onAnnulla={() => setConfermaElimina(false)}
        onConferma={() => void elimina()}
      />
    </div>
  )
}
