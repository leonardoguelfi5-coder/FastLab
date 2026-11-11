import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CloudOff } from 'lucide-react'
import { useSessione } from '@/api/auth'
import { caricaConfig } from '@/api/esperimenti'
import { aggiornaSessione, eliminaSessione, listaPesatura, type DatiPesatura } from '@/api/pesatura'
import { chiavi, useConfig, usePesatura } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { RigaStato } from '@/components/Caricamento'
import { Conferma } from '@/components/Conferma'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { ConsultaCurva } from '@/components/pesatura/ConsultaCurva'
import { GraficoCurve } from '@/components/pesatura/GraficoCurve'
import { RiepilogoSessione } from '@/components/pesatura/RiepilogoSessione'
import { scaricaGraficoPng, scaricaPesatura } from '@/components/pesatura/scaricaPesatura'
import { TestoErrore } from '@/components/TestoErrore'
import { Button, buttonVariants } from '@/components/ui/button'
import { gruppiDeiVasi } from '@/domain/pesatura/export'
import { equazione } from '@/domain/pesatura/curva'
import { avanzamentoFase, FASI, NOMI_FASE, passiDellaFase, statoSessione } from '@/domain/pesatura/sequenza'
import { NOMI_TIPO, type SessionePesatura } from '@/domain/pesatura/tipi'
import type { ConfigEsperimento } from '@/domain/tipi'
import { formattaData } from '@/lib/date'
import { ELEMENTO_NON_TROVATO, messaggioErrore, SESSIONE_CON_PESI_ALTRUI } from '@/lib/errori'
import { percorsoPesata, percorsoPesatura } from '@/lib/percorsi'
import { usePermessi } from '@/lib/usePermessi'
import { useSenzaRete } from '@/lib/useSenzaRete'
import { SENZA_RETE_PESATURA } from './messaggi'

const TESTO_STATO = { conclusa: 'Conclusa', completa: 'Completa', mancano: 'Mancano dei pesi' } as const

/** Il riepilogo di una sessione di pesata: pesi e valori calcolati, curve dei vasi, export, chiusura ed eliminazione. Solo online. */
export function Sessione() {
  const { espId = '', sessioneId = '' } = useParams()
  const dati = usePesatura(espId)
  const config = useConfig(espId)
  const senzaRete = useSenzaRete()
  const sessione = (dati.data?.sessioni ?? []).find(s => s.id === sessioneId) ?? null
  // I vasi non usano le piante: non aspettano la configurazione.
  const serveConfig = sessione !== null && sessione.tipo !== 'vasi'

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
  } else if (serveConfig && config.data === undefined) {
    corpo = config.isError
      ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
      : <RigaStato testo="Caricamento…" />
  } else {
    corpo = <Contenuto key={sessione.id} espId={espId} sessione={sessione} dati={dati.data} config={config.data ?? null} />
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
  config: ConfigEsperimento | null
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
  const piante = useMemo(() => new Map((config?.piante ?? []).map(p => [p.id, p])), [config])
  const trattamenti = useMemo(() => new Map((config?.trattamenti ?? []).map(t => [t.id, t.etichetta])), [config])
  const eVasi = sessione.tipo === 'vasi'
  const vasi = useMemo(() => (eVasi ? gruppiDeiVasi([sessione], dati) : null), [eVasi, sessione, dati])

  // Come `puo_gestire_sessione` del database: il proprietario, oppure chi ha creato la sessione. Il database ha l'ultima parola.
  const puoGestire = permessi.puoMisurare && (!permessi.soloProprietario || (sessione.creato_da !== undefined && sessione.creato_da === utente?.user.id))
  const stato = statoSessione(sessione, campioni, pesi)
  // Come `sessioni_pesatura_delete` (20261111000018): chi non è il proprietario non elimina una sessione con pesi
  // di altre persone, che sparirebbero con lei.
  const conPesiAltrui = permessi.soloProprietario && pesi.some(p => p.creato_da !== utente?.user.id)

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

  const cambiaChiusura = () => esegui(async () => {
    await aggiornaSessione({ id: sessione.id, data: sessione.data, nota: sessione.nota, conclusa: !sessione.conclusa })
    await queryClient.invalidateQueries({ queryKey: chiavi.pesatura(espId) })
  })

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
  const scarica = (tutte: boolean) => esegui(async () => {
    const freschi = await queryClient.fetchQuery({ queryKey: chiavi.pesatura(espId), queryFn: () => listaPesatura(espId), staleTime: 0 }).catch(() => dati)
    const configurazione: ConfigEsperimento = config ?? await caricaConfig(espId)
    const aggiornata = freschi.sessioni.find(s => s.id === sessione.id) ?? sessione
    const sessioni = tutte ? freschi.sessioni.filter(s => s.analisi_id === sessione.analisi_id) : [aggiornata]
    await scaricaPesatura({ sessioni, dati: freschi, config: configurazione })
  })

  const scaricaPng = () => esegui(async () => {
    if (vasi) await scaricaGraficoPng({ gruppi: vasi.gruppi, sensore: vasi.sensore, titolo: sessione.titolo })
  })

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-headline text-grafite">{sessione.titolo}</h1>
        <p className="text-grafite-tenue">{formattaData(sessione.data)} · {NOMI_TIPO[sessione.tipo]} · {sessione.unita}</p>
        {sessione.nota && <p className="text-grafite">{sessione.nota}</p>}
        <p className="text-base font-medium text-grafite">{TESTO_STATO[stato]}</p>
      </header>

      {permessi.puoMisurare && (
        <section aria-labelledby="titolo-fasi" className="flex flex-col gap-3">
          <h2 id="titolo-fasi" className="text-title text-grafite">Pesa</h2>
          <div className="flex flex-col gap-2">
            {FASI[sessione.tipo].map(fase => {
              let testo = NOMI_FASE[fase]
              if (fase === 'asciugatura') {
                const n = pesi.filter(p => p.tipo === 'asciugatura').length
                testo += ` · ${n} ${n === 1 ? 'peso' : 'pesi'}`
              } else {
                const a = avanzamentoFase(passiDellaFase(sessione, campioni, pesi, fase))
                testo += ` · ${a.pesati}/${a.totali}`
              }
              return (
                <Link key={fase} to={percorsoPesata(espId, sessione.id, fase)} className={buttonVariants({ variant: 'outline', size: 'lg', className: 'justify-start' })}>
                  {testo}
                </Link>
              )
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="titolo-riepilogo" className="flex flex-col gap-3">
        <h2 id="titolo-riepilogo" className="text-title text-grafite">Riepilogo</h2>
        <RiepilogoSessione sessione={sessione} campioni={campioni} pesi={pesi} piante={piante} trattamenti={trattamenti} />
      </section>

      {vasi && (
        <section aria-labelledby="titolo-curve" className="flex flex-col gap-4">
          <h2 id="titolo-curve" className="text-title text-grafite">Curve dei vasi</h2>
          <GraficoCurve gruppi={vasi.gruppi} sensore={vasi.sensore} />
          <ul className="flex flex-col gap-1">
            {vasi.gruppi.map(g => (
              <li key={g.substrato} className="text-base text-grafite">
                <span className="font-medium">{g.substrato}</span>
                {': '}
                <span className="font-mono tabular-nums">
                  {g.media ? equazione(g.media, vasi.sensore) : 'servono almeno 3 letture diverse per la curva'}
                </span>
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" className="self-start" disabled={occupato} onClick={() => void scaricaPng()}>
            Scarica grafico (PNG)
          </Button>
          <ConsultaCurva gruppi={vasi.gruppi} sensore={vasi.sensore} unita={sessione.unita} />
        </section>
      )}

      <section aria-labelledby="titolo-azioni" className="flex flex-col gap-3">
        <h2 id="titolo-azioni" className="text-title text-grafite">Esporta e gestisci</h2>
        <div className="flex flex-col items-stretch gap-2 sm:items-start">
          <Button type="button" size="lg" disabled={occupato} onClick={() => void scarica(false)}>Scarica Excel</Button>
          <Button type="button" size="lg" variant="outline" disabled={occupato} onClick={() => void scarica(true)}>
            Scarica tutte le sessioni di questa analisi
          </Button>
          {puoGestire && (
            <Button type="button" size="lg" variant="outline" disabled={occupato || senzaRete} onClick={() => void cambiaChiusura()}>
              {sessione.conclusa ? 'Riapri' : 'Segna come conclusa'}
            </Button>
          )}
          {puoGestire && !conPesiAltrui && (
            <Button type="button" size="lg" variant="ghost" disabled={occupato || senzaRete} onClick={() => setConfermaElimina(true)}>
              Elimina sessione
            </Button>
          )}
        </div>
        {puoGestire && conPesiAltrui && <p className="text-base text-grafite-tenue">{SESSIONE_CON_PESI_ALTRUI}</p>}
        {errore && <TestoErrore role="alert" className="text-base">{errore}</TestoErrore>}
      </section>

      <Conferma
        aperta={confermaElimina}
        titolo="Eliminare la sessione?"
        testo="Spariscono anche tutti i suoi campioni e i suoi pesi. Non si può annullare."
        annulla="Tieni la sessione"
        conferma="Elimina"
        onAnnulla={() => setConfermaElimina(false)}
        onConferma={() => void elimina()}
      />
    </div>
  )
}
