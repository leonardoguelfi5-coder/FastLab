import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useConfig, useUltimeMisurePiante } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { Caricamento } from '@/components/Caricamento'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { Espandibile } from '@/components/Espandibile'
import { Scelta } from '@/components/Scelta'
import { TestoErrore } from '@/components/TestoErrore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { filtraPiante, parametriMostrabili, parametroDiBase, ultimoValorePerPianta } from '@/domain/elencoPiante'
import { trovaPianta } from '@/domain/piante'
import { mediaPerTrattamento } from '@/domain/statistiche'
import type { ConfigEsperimento, Parametro } from '@/domain/tipi'
import { formattaGiornoMese } from '@/lib/date'
import { formattaConUnita } from '@/lib/numeri'
import { percorsoHome, percorsoPianta } from '@/lib/percorsi'
import { useCampoStore } from '@/store/campo'

const NUMERI = 'font-mono tabular-nums'

/** Dove si ricorda lo scorrimento di questo elenco: una voce per percorso, finché la scheda del browser resta aperta. */
const chiaveScorrimento = (percorso: string) => `fastlab-scorrimento:${percorso}`

function leggiScorrimento(percorso: string): number {
  try {
    const y = Number(sessionStorage.getItem(chiaveScorrimento(percorso)))
    return Number.isFinite(y) && y > 0 ? y : 0
  } catch {
    return 0
  }
}

function scriviScorrimento(percorso: string, y: number): void {
  try {
    sessionStorage.setItem(chiaveScorrimento(percorso), String(Math.round(y)))
  } catch { /* senza sessionStorage si riparte dall'alto */ }
}

/**
 * Lo scorrimento dell'elenco si ricorda per percorso e si ripristina al ritorno (dalla scheda di una pianta, dalla misura
 * fatta partire da lì): chi ha cercato la pianta 120 non deve riscorrere l'elenco. Si ripristina una volta sola, a
 * elenco disegnato, perché la pagina deve essere già abbastanza lunga.
 */
function useScorrimentoRicordato(percorso: string) {
  useEffect(() => {
    const y = leggiScorrimento(percorso)
    if (y > 0) window.scrollTo(0, y)
    const salva = () => scriviScorrimento(percorso, window.scrollY)
    window.addEventListener('scroll', salva, { passive: true })
    return () => window.removeEventListener('scroll', salva)
  }, [percorso])
}

/**
 * Lo stato degli ultimi valori per le righe: `caricano` finché non sono arrivati (mai un numero finto), `mancano`
 * se non arrivano (l'elenco si usa lo stesso, senza valori).
 */
type Ultimi = { stato: 'caricano' } | { stato: 'mancano' } | { stato: 'pronti'; perPianta: ReturnType<typeof ultimoValorePerPianta>; medie: ReturnType<typeof mediaPerTrattamento> }

/** Il contenuto a configurazione caricata: ricerca, valore mostrato e un blocco per trattamento. */
function ElencoCaricato({ espId, config }: { espId: string; config: ConfigEsperimento }) {
  const navigate = useNavigate()
  const idRicerca = useId()
  const idValore = useId()
  const strumentoDelloStore = useCampoStore(s => s.dati(espId).strumentoId)
  const ultime = useUltimeMisurePiante(espId)

  const { pathname } = useLocation()
  useScorrimentoRicordato(pathname)
  // La ricerca e i blocchi aperti stanno nella URL (`?cerca=…&aperti=<id>,<id>`, senza nuove voci nella cronologia): da
  // una scheda o da una misura si torna all'elenco com'era. `aperti` presente (anche vuoto) vuol dire "esattamente questi
  // blocchi"; assente, i blocchi seguono il comportamento di base (chiusi, aperti se c'è una ricerca).
  const [ricerca, setRicerca] = useSearchParams()
  const cercato = ricerca.get('cerca') ?? ''
  const apertiNellaUrl = ricerca.get('aperti')
  const aMano = useMemo(
    () => (apertiNellaUrl === null ? null : new Set(apertiNellaUrl.split(',').filter(x => x !== ''))),
    [apertiNellaUrl],
  )
  const [sceltoId, setSceltoId] = useState<string | null>(null)

  const gruppi = useMemo(() => parametriMostrabili(config), [config])
  const parametro = useMemo(() => {
    const scelto = gruppi.flatMap(g => g.parametri).find(p => p.id === sceltoId)
    return scelto ?? parametroDiBase(gruppi, strumentoDelloStore)
  }, [gruppi, sceltoId, strumentoDelloStore])

  // Gli ultimi valori restano anche se una rilettura in background fallisce; senza il primo successo non c'è nulla.
  const dati = ultime.data
  const ultimi = useMemo((): Ultimi => {
    if (!parametro) return { stato: 'mancano' }
    if (dati === undefined) return { stato: ultime.isError ? 'mancano' : 'caricano' }
    return { stato: 'pronti', perPianta: ultimoValorePerPianta(parametro, dati), medie: mediaPerTrattamento(config, parametro, dati) }
  }, [config, parametro, dati, ultime.isError])

  const blocchi = useMemo(() => {
    const ordinate = [...config.piante].sort((a, b) => a.ordine - b.ordine)
    return [...config.trattamenti].sort((a, b) => a.ordine - b.ordine).map(trattamento => {
      const tutte = ordinate.filter(p => p.trattamento_id === trattamento.id)
      return { trattamento, tutte, trovate: filtraPiante(tutte, cercato) }
    })
  }, [config.piante, config.trattamenti, cercato])

  const inRicerca = cercato.trim() !== ''
  const visibili = inRicerca ? blocchi.filter(b => b.trovate.length > 0) : blocchi

  // Cambiando il testo cercato si riparte dal comportamento di base: i blocchi aperti a mano si dimenticano.
  function cerca(testo: string) {
    setRicerca(prima => {
      const nuova = new URLSearchParams(prima)
      if (testo === '') nuova.delete('cerca')
      else nuova.set('cerca', testo)
      nuova.delete('aperti')
      return nuova
    }, { replace: true })
  }

  function cambiaBlocco(id: string, aperto: boolean) {
    const adesso = new Set(visibili.filter(b => aMano ? aMano.has(b.trattamento.id) : inRicerca).map(b => b.trattamento.id))
    if (aperto) adesso.add(id)
    else adesso.delete(id)
    setRicerca(prima => {
      const nuova = new URLSearchParams(prima)
      nuova.set('aperti', [...adesso].join(','))
      return nuova
    }, { replace: true })
  }

  // Invio con un'etichetta esatta (anche "035" per "35") apre subito la scheda; altrimenti resta il filtro.
  function vaiAllaPianta(evento: FormEvent) {
    evento.preventDefault()
    const trovata = trovaPianta(config.piante, cercato)
    if (trovata) navigate(percorsoPianta(espId, trovata.id))
  }

  if (config.piante.length === 0) return <p className="text-grafite-tenue">Questo esperimento non ha piante.</p>

  return (
    <>
      <div className="flex flex-col gap-4">
        <form role="search" onSubmit={vaiAllaPianta} className="flex flex-col gap-1.5">
          <Label htmlFor={idRicerca}>Cerca pianta</Label>
          <Input
            id={idRicerca}
            type="search"
            variant="campo"
            enterKeyHint="go"
            autoComplete="off"
            value={cercato}
            onChange={e => cerca(e.target.value)}
          />
        </form>
        {parametro && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={idValore}>Valore mostrato</Label>
            <Scelta id={idValore} value={parametro.id} onChange={e => setSceltoId(e.target.value)}>
              {gruppi.map(g => (
                <optgroup key={g.strumento.id} label={g.strumento.nome}>
                  {g.parametri.map(p => (
                    <option key={p.id} value={p.id}>{p.unita ? `${p.nome} (${p.unita})` : p.nome}</option>
                  ))}
                </optgroup>
              ))}
            </Scelta>
          </div>
        )}
        {ultime.isError && dati === undefined && parametro && (
          <div role="alert" className="flex flex-col items-start gap-1">
            <TestoErrore className="text-base">Gli ultimi valori non sono arrivati.</TestoErrore>
            <Button variant="ghost" size="sm" onClick={() => void ultime.refetch()} className="-ml-3">Riprova</Button>
          </div>
        )}
      </div>

      {visibili.length === 0 ? (
        <p role="status" className="text-grafite-tenue">Nessuna pianta trovata.</p>
      ) : (
        <ul aria-label="Trattamenti" className="-mx-4 flex flex-col border-t border-riga">
          {visibili.map(({ trattamento, tutte, trovate }) => {
            const aperto = aMano ? aMano.has(trattamento.id) : inRicerca
            const conteggio = inRicerca && trovate.length !== tutte.length
              ? `${trovate.length} di ${tutte.length} piante`
              : `${tutte.length} ${tutte.length === 1 ? 'pianta' : 'piante'}`
            return (
              <Espandibile
                key={trattamento.id}
                titolo={trattamento.etichetta}
                riassunto={
                  <>
                    {conteggio}
                    {parametro && (
                      <>
                        {' · '}
                        <span className={NUMERI}>{riepilogo(parametro, ultimi, trattamento.id, tutte.length)}</span>
                      </>
                    )}
                  </>
                }
                aperto={aperto}
                onCambia={() => cambiaBlocco(trattamento.id, !aperto)}
              >
                <ul aria-label={`Piante di ${trattamento.etichetta}`} className="-mx-4 flex flex-col border-t border-riga">
                  {trovate.map(p => {
                    const ultimo = ultimi.stato === 'pronti' ? ultimi.perPianta.get(p.id) : undefined
                    return (
                      <li key={p.id} className="border-b border-riga">
                        <Link
                          to={percorsoPianta(espId, p.id)}
                          className="flex min-h-11 items-center gap-3 px-4 py-2 transition-colors -outline-offset-2 hover:bg-riga/40 active:bg-riga/60"
                        >
                          <span className={`min-w-14 max-w-24 shrink-0 truncate text-dato text-grafite ${NUMERI}`}>{p.etichetta}</span>
                          <span className={`min-w-0 flex-1 truncate text-dato text-grafite ${NUMERI}`}>
                            {!parametro || ultimi.stato === 'mancano'
                              ? ''
                              : ultimi.stato === 'caricano'
                                ? '…'
                                : ultimo
                                  ? formattaConUnita(ultimo.valore, parametro.unita)
                                  : <span className="font-sans text-grafite-tenue">senza valore</span>}
                          </span>
                          {ultimo && <span className={`shrink-0 text-dato text-grafite-tenue ${NUMERI}`}>{formattaGiornoMese(ultimo.data)}</span>}
                          <ChevronRight aria-hidden className="size-5 shrink-0 text-grafite-tenue" />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </Espandibile>
            )
          })}
        </ul>
      )}
    </>
  )
}

/** "SPAD 41,2 · 6/6": la media degli ultimi valori del trattamento e quante piante ne hanno uno. Mai un numero finto. */
function riepilogo(parametro: Parametro, ultimi: Ultimi, trattamentoId: string, quante: number): string {
  if (ultimi.stato === 'caricano') return `${parametro.nome} …`
  if (ultimi.stato === 'mancano') return parametro.nome
  const m = ultimi.medie.get(trattamentoId)
  if (!m || m.media === null) return `${parametro.nome} senza valori`
  return `${parametro.nome} ${formattaConUnita(m.media, parametro.unita)} · ${m.n}/${quante}`
}

/** Le piante di un esperimento per trattamento: la media dell'ultimo valore scelto, e la ricerca di una pianta. */
export function ElencoPiante() {
  const { espId = '' } = useParams()
  const config = useConfig(espId)
  const dati = config.data

  return (
    <AppShell titolo="Piante" indietro={percorsoHome(espId)}>
      {dati === undefined ? (
        config.isError
          ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
          : <Caricamento />
      ) : (
        <ElencoCaricato espId={espId} config={dati} />
      )}
    </AppShell>
  )
}
