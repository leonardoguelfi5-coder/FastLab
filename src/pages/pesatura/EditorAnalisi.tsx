import { useId, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CloudOff } from 'lucide-react'
import { useSessione } from '@/api/auth'
import { salvaAnalisi } from '@/api/pesatura'
import { chiavi, useAnalisiPesatura, usePesatura } from '@/api/query'
import { Asterisco } from '@/components/Asterisco'
import { AppShell } from '@/components/AppShell'
import { BarraAzioni } from '@/components/BarraAzioni'
import { RigaStato } from '@/components/Caricamento'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { Interruttore } from '@/components/config/Interruttore'
import { ModuloCampi } from '@/components/ModuloCampi'
import { NumericField } from '@/components/NumericField'
import { SceltaSingola } from '@/components/SceltaSingola'
import { TestoErrore } from '@/components/TestoErrore'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  NOMI_TIPO, type AnalisiPesatura, type ImpostazioniAnalisi, type TipoAnalisi, type TipoSensore, type UnitaPeso,
} from '@/domain/pesatura/tipi'
import { messaggioErrore } from '@/lib/errori'
import { nuovoId } from '@/lib/id'
import { percorsoPesatura } from '@/lib/percorsi'
import { toastSalvato } from '@/lib/toastSalvato'
import { usePermessi } from '@/lib/usePermessi'
import { useSenzaRete } from '@/lib/useSenzaRete'
import { SENZA_RETE_PESATURA } from './messaggi'

const TIPI: TipoAnalisi[] = ['aliquota', 'rwc', 'sostanza_secca', 'vasi']
const UNITA: UnitaPeso[] = ['g', 'mg']
const SENSORI: { valore: TipoSensore; testo: string; unita: string }[] = [
  { valore: 'umidita', testo: 'Umidità', unita: '%' },
  { valore: 'tensione', testo: 'Tensione', unita: 'kPa' },
]
const MIN_REPLICHE = 1
const MAX_REPLICHE = 10

/** I campi del modulo, come li scrive la persona: le impostazioni si costruiscono solo al salvataggio. */
interface Bozza {
  titolo: string
  tipo: TipoAnalisi
  unita: UnitaPeso
  repliche: number | null
  calcolaTampone: boolean
  rapportoTampone: number | null
  sensore: TipoSensore
  unitaSensore: string
}

function bozzaDa(a: AnalisiPesatura | null): Bozza {
  const i = a?.impostazioni
  return {
    titolo: a?.titolo ?? '',
    tipo: a?.tipo ?? 'aliquota',
    unita: a?.unita ?? 'g',
    repliche: i?.repliche ?? 1,
    calcolaTampone: i?.rapportoTampone != null,
    rapportoTampone: i?.rapportoTampone ?? null,
    sensore: i?.sensore?.tipo ?? 'umidita',
    unitaSensore: i?.sensore?.unita ?? '%',
  }
}

/** Ciò che impedisce di salvare, in parole; vuoto se si può salvare. */
function problemiDi(b: Bozza): string[] {
  const p: string[] = []
  if (b.titolo.trim() === '') p.push('Scrivi un titolo.')
  if (b.repliche === null || !Number.isInteger(b.repliche) || b.repliche < MIN_REPLICHE || b.repliche > MAX_REPLICHE) {
    p.push(`Le repliche vanno da ${MIN_REPLICHE} a ${MAX_REPLICHE}.`)
  }
  if (b.tipo === 'aliquota' && b.calcolaTampone && (b.rapportoTampone === null || !(b.rapportoTampone > 0) || !Number.isFinite(b.rapportoTampone))) {
    p.push('Scrivi quanti mL di tampone per ogni g.')
  }
  if (b.tipo === 'vasi' && b.unitaSensore.trim() === '') p.push('Scrivi l\'unità del sensore.')
  return p
}

function impostazioniDa(b: Bozza): ImpostazioniAnalisi {
  return {
    repliche: b.repliche as number,
    rapportoTampone: b.tipo === 'aliquota' && b.calcolaTampone ? b.rapportoTampone : null,
    sensore: b.tipo === 'vasi' ? { tipo: b.sensore, unita: b.unitaSensore.trim() } : null,
  }
}

/** Una analisi nuova o da modificare (`?id=`): titolo, tipo, unità, repliche e le impostazioni del tipo. Solo online. */
export function EditorAnalisi() {
  const { espId = '' } = useParams()
  const [ricerca] = useSearchParams()
  const id = ricerca.get('id')
  const analisi = useAnalisiPesatura(espId)
  const pesatura = usePesatura(espId)
  const senzaRete = useSenzaRete()
  const indietro = percorsoPesatura(espId)

  const titolo = id ? 'Modifica analisi' : 'Nuova analisi'
  // Una analisi nuova non ha bisogno di leggere nulla; una esistente aspetta analisi e sessioni (da cui dipende il Tipo).
  const attesa = id !== null && (analisi.data === undefined || pesatura.data === undefined)
  if (attesa) {
    return (
      <AppShell titolo={titolo} indietro={indietro} nav={espId}>
        {senzaRete && <MessaggioSenzaRete />}
        {analisi.isError ? (
          <ErroreConRiprova errore={analisi.error} onRiprova={() => void analisi.refetch()} />
        ) : pesatura.isError ? (
          <ErroreConRiprova errore={pesatura.error} onRiprova={() => void pesatura.refetch()} />
        ) : (
          <RigaStato testo="Caricamento…" />
        )}
      </AppShell>
    )
  }

  const esistente = id !== null ? (analisi.data ?? []).find(a => a.id === id) ?? null : null
  if (id !== null && !esistente) {
    return (
      <AppShell titolo={titolo} indietro={indietro} nav={espId}>
        <div className="flex flex-col items-start gap-2">
          <p className="text-grafite">Analisi non trovata.</p>
          <Link to={indietro} className={buttonVariants({ variant: 'ghost', className: '-ml-3' })}>Torna alla Pesatura</Link>
        </div>
      </AppShell>
    )
  }
  const haSessioni = esistente !== null && (pesatura.data?.sessioni ?? []).some(s => s.analisi_id === esistente.id)
  return <Editor key={id ?? 'nuova'} espId={espId} esistente={esistente} haSessioni={haSessioni} />
}

function MessaggioSenzaRete() {
  return (
    <p role="status" className="mb-4 flex items-start gap-2 text-base text-grafite-tenue">
      <CloudOff aria-hidden className="mt-0.5 size-5 shrink-0" />
      {SENZA_RETE_PESATURA}
    </p>
  )
}

function Editor({ espId, esistente, haSessioni }: { espId: string; esistente: AnalisiPesatura | null; haSessioni: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const permessi = usePermessi(espId)
  const { sessione } = useSessione()
  const senzaRete = useSenzaRete()
  const idCampo = useId()
  // L'id di una analisi nuova si sceglie una volta: un nuovo tentativo dopo un errore è un upsert della stessa riga.
  const [idNuova] = useState(nuovoId)
  const [bozza, setBozza] = useState(() => bozzaDa(esistente))
  const [provato, setProvato] = useState(false)
  const [occupato, setOccupato] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  // Il doppio tocco si ferma subito, prima che il pulsante risulti disabilitato.
  const inCorso = useRef(false)
  const indietro = percorsoPesatura(espId)

  const diAltri = esistente !== null && esistente.creato_da !== undefined && esistente.creato_da !== sessione?.user.id
  const soloLettura = diAltri || !permessi.puoMisurare
  const problemi = problemiDi(bozza)
  const cambia = (parte: Partial<Bozza>) => setBozza(b => ({ ...b, ...parte }))

  /** Scrive l'analisi, rilegge l'elenco e torna a Pesatura; un errore lascia tutto com'è. */
  async function scrivi(a: AnalisiPesatura, messaggio: string) {
    if (inCorso.current) return
    inCorso.current = true
    setOccupato(true)
    setErrore(null)
    try {
      await salvaAnalisi(a)
      await queryClient.invalidateQueries({ queryKey: chiavi.analisiPesatura(espId) })
      toastSalvato(messaggio)
      navigate(indietro)
    } catch (e) {
      setErrore(messaggioErrore(e))
      inCorso.current = false
      setOccupato(false)
    }
  }

  function salva() {
    setProvato(true)
    if (problemi.length > 0) return
    void scrivi({
      id: esistente?.id ?? idNuova,
      titolo: bozza.titolo.trim(),
      tipo: bozza.tipo,
      unita: bozza.unita,
      impostazioni: impostazioniDa(bozza),
      archiviata: esistente?.archiviata ?? false,
    }, 'Analisi salvata.')
  }

  const copiaTraLeMie = () => esistente && void scrivi({ ...esistente, id: nuovoId(), archiviata: false }, 'Copia salvata tra le tue analisi.')
  const archivia = (archiviata: boolean) =>
    esistente && void scrivi({ ...esistente, archiviata }, archiviata ? 'Analisi archiviata.' : 'Analisi ripristinata.')

  const titoloPagina = esistente ? (soloLettura ? 'Analisi' : 'Modifica analisi') : 'Nuova analisi'

  return (
    <AppShell titolo={titoloPagina} indietro={indietro} nav={espId}>
      {senzaRete && <MessaggioSenzaRete />}

      {soloLettura ? (
        <Riepilogo analisi={esistente} diAltri={diAltri} />
      ) : (
        <ModuloCampi className="flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idCampo}-titolo`}>
              Titolo
              <Asterisco />
            </Label>
            <Input
              id={`${idCampo}-titolo`}
              autoComplete="off"
              aria-required
              value={bozza.titolo}
              onChange={e => cambia({ titolo: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-label font-medium text-grafite">Tipo</p>
            <SceltaSingola
              nome="Tipo"
              disabilitato={haSessioni}
              opzioni={TIPI.map(t => ({ valore: t, testo: NOMI_TIPO[t] }))}
              scelto={bozza.tipo}
              onScegli={tipo => cambia({ tipo })}
            />
            {haSessioni && <p className="text-sm text-grafite-tenue">Il tipo non si cambia: l&apos;analisi ha già delle sessioni.</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-label font-medium text-grafite">Unità</p>
            <SceltaSingola
              nome="Unità"
              opzioni={UNITA.map(u => ({ valore: u, testo: u }))}
              scelto={bozza.unita}
              onScegli={unita => cambia({ unita })}
            />
          </div>

          <NumericField
            label="Repliche di default"
            value={bozza.repliche}
            onChange={repliche => cambia({ repliche })}
          />

          {bozza.tipo === 'aliquota' && (
            <div className="flex flex-col gap-4">
              <Interruttore
                etichetta="Calcola i mL di tampone"
                aiuto="Dal peso dell'aliquota si calcola quanto tampone aggiungere."
                checked={bozza.calcolaTampone}
                onCheckedChange={calcolaTampone => cambia({ calcolaTampone })}
              />
              {bozza.calcolaTampone && (
                <NumericField label="mL per g" value={bozza.rapportoTampone} onChange={rapportoTampone => cambia({ rapportoTampone })} />
              )}
            </div>
          )}

          {bozza.tipo === 'vasi' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <p className="text-label font-medium text-grafite">Sensore</p>
                <SceltaSingola
                  nome="Sensore"
                  opzioni={SENSORI.map(s => ({ valore: s.valore, testo: s.testo }))}
                  scelto={bozza.sensore}
                  onScegli={sensore => cambia({ sensore, unitaSensore: SENSORI.find(s => s.valore === sensore)!.unita })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${idCampo}-unita-sensore`}>Unità del sensore</Label>
                <Input
                  id={`${idCampo}-unita-sensore`}
                  autoComplete="off"
                  value={bozza.unitaSensore}
                  onChange={e => cambia({ unitaSensore: e.target.value })}
                />
              </div>
            </div>
          )}

          {provato && problemi.length > 0 && (
            <div className="flex flex-col gap-1">
              {problemi.map(p => <TestoErrore key={p}>{p}</TestoErrore>)}
            </div>
          )}
        </ModuloCampi>
      )}

      <BarraAzioni>
        {errore && <TestoErrore role="alert" className="text-base">{errore}</TestoErrore>}
        {soloLettura ? (
          diAltri && permessi.puoMisurare && (
            <Button size="lg" disabled={senzaRete || occupato} onClick={copiaTraLeMie}>
              {occupato ? 'Salvataggio…' : 'Copia tra le mie'}
            </Button>
          )
        ) : (
          <>
            <Button size="lg" disabled={senzaRete || occupato} onClick={salva}>
              {occupato ? 'Salvataggio…' : 'Salva'}
            </Button>
            {esistente && (
              <Button variant="outline" disabled={senzaRete || occupato} onClick={() => archivia(!esistente.archiviata)}>
                {esistente.archiviata ? 'Ripristina' : 'Archivia'}
              </Button>
            )}
          </>
        )}
      </BarraAzioni>
    </AppShell>
  )
}

/** L'analisi di un altro utente, o vista da un lettore: i valori a parole, senza campi da modificare. */
function Riepilogo({ analisi, diAltri }: { analisi: AnalisiPesatura | null; diAltri: boolean }) {
  if (!analisi) return <p className="text-grafite">Non puoi creare analisi: hai solo la lettura di questo esperimento.</p>
  const { impostazioni: i } = analisi
  const righe: [string, ReactNode][] = [
    ['Tipo', NOMI_TIPO[analisi.tipo]],
    ['Unità', analisi.unita],
    ['Repliche di default', i.repliche],
  ]
  if (i.rapportoTampone != null) righe.push(['mL di tampone per g', i.rapportoTampone])
  if (i.sensore) righe.push(['Sensore', `${i.sensore.tipo === 'umidita' ? 'Umidità' : 'Tensione'} (${i.sensore.unita})`])
  return (
    <div className="flex flex-col gap-4">
      <p className="text-title text-grafite">{analisi.titolo}</p>
      <dl className="rounded-2xl border border-riga bg-foglio px-4">
        {righe.map(([nome, valore]) => (
          <div key={nome} className="flex min-h-12 items-center justify-between gap-3 border-b border-riga py-2 last:border-0">
            <dt className="text-grafite-tenue">{nome}</dt>
            <dd className="font-[550] text-grafite">{valore}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-grafite-tenue">
        {diAltri ? 'Questa analisi è di un\'altra persona: non si modifica.' : 'Hai solo la lettura: l\'analisi non si modifica.'}
      </p>
    </div>
  )
}
