import { useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CloudOff, Plus, X } from 'lucide-react'
import { creaSessione } from '@/api/pesatura'
import { chiavi, useAnalisiPesatura, useConfig } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { BarraAzioni } from '@/components/BarraAzioni'
import { RigaStato } from '@/components/Caricamento'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { ModuloCampi } from '@/components/ModuloCampi'
import { SceltaSingola } from '@/components/SceltaSingola'
import { TestoErrore } from '@/components/TestoErrore'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FASI } from '@/domain/pesatura/sequenza'
import { NOMI_TIPO, type AnalisiPesatura, type CampionePesatura } from '@/domain/pesatura/tipi'
import type { Pianta, Trattamento } from '@/domain/tipi'
import { eDataValida, oggiLocale } from '@/lib/date'
import { messaggioErrore } from '@/lib/errori'
import { nuovoId } from '@/lib/id'
import { percorsoPesata, percorsoPesatura } from '@/lib/percorsi'
import { usePermessi } from '@/lib/usePermessi'
import { useSenzaRete } from '@/lib/useSenzaRete'
import { SENZA_RETE_PESATURA } from './messaggi'

type Modo = 'tutte' | 'trattamento' | 'mano'
const MODI: { valore: Modo; testo: string }[] = [
  { valore: 'tutte', testo: 'Tutte le piante' },
  { valore: 'trattamento', testo: 'Per trattamento' },
  { valore: 'mano', testo: 'Scegli a mano' },
]

/** Una riga che non è una pianta: una riga libera (Bianco, Controllo…) o un vaso (con il suo substrato). */
interface Riga { id: string; nome: string; substrato: string }

const nuovaRiga = (substrato = ''): Riga => ({ id: nuovoId(), nome: '', substrato })
const testoPiante = (n: number) => `${n} ${n === 1 ? 'pianta' : 'piante'}`

/** Una nuova sessione di pesata su un'analisi (`?analisi=`): data, nota e i campioni. Solo online. */
export function NuovaSessione() {
  const { espId = '' } = useParams()
  const [ricerca] = useSearchParams()
  const idAnalisi = ricerca.get('analisi')
  const analisi = useAnalisiPesatura(espId)
  const config = useConfig(espId)
  const permessi = usePermessi(espId)
  const senzaRete = useSenzaRete()
  const indietro = percorsoPesatura(espId)
  const trovata = idAnalisi ? (analisi.data ?? []).find(a => a.id === idAnalisi) ?? null : null
  // I vasi non usano le piante: non aspettano la configurazione.
  const serveConfig = trovata !== null && trovata.tipo !== 'vasi'

  let corpo
  if (idAnalisi && analisi.data === undefined) {
    corpo = analisi.isError
      ? <ErroreConRiprova errore={analisi.error} onRiprova={() => void analisi.refetch()} />
      : <RigaStato testo="Caricamento…" />
  } else if (!trovata) {
    corpo = (
      <div className="flex flex-col items-start gap-2">
        <p className="text-grafite">Analisi non trovata.</p>
        <Link to={indietro} className={buttonVariants({ variant: 'ghost', className: '-ml-3' })}>Torna alla Pesatura</Link>
      </div>
    )
  } else if (!permessi.puoMisurare) {
    corpo = <p className="text-grafite">Non puoi iniziare una pesata: hai solo la lettura di questo esperimento.</p>
  } else if (serveConfig && config.data === undefined) {
    corpo = config.isError
      ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
      : <RigaStato testo="Caricamento…" />
  } else {
    corpo = (
      <Modulo
        key={trovata.id}
        espId={espId}
        analisi={trovata}
        piante={config.data?.piante ?? []}
        trattamenti={config.data?.trattamenti ?? []}
      />
    )
  }

  // Il modulo porta la sua barra azioni; negli altri casi c'è solo il messaggio.
  return (
    <AppShell titolo="Nuova sessione" indietro={indietro} nav={espId}>
      {senzaRete && <MessaggioSenzaRete />}
      {corpo}
    </AppShell>
  )
}

function MessaggioSenzaRete() {
  return (
    <p role="status" className="mb-4 flex items-start gap-2 text-base text-grafite-tenue">
      <CloudOff aria-hidden className="mt-0.5 size-5 shrink-0" />
      {SENZA_RETE_PESATURA}
    </p>
  )
}

function Modulo({ espId, analisi, piante, trattamenti }: {
  espId: string
  analisi: AnalisiPesatura
  piante: Pianta[]
  trattamenti: Trattamento[]
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const senzaRete = useSenzaRete()
  const idCampo = useId()
  const eVasi = analisi.tipo === 'vasi'
  // Gli id si scelgono una volta: un nuovo tentativo dopo un errore riscrive le stesse righe (upsert), senza duplicati.
  const [idSessione] = useState(nuovoId)
  const idPiante = useRef(new Map<string, string>())
  const [data, setData] = useState(() => oggiLocale())
  const [nota, setNota] = useState('')
  const [modo, setModo] = useState<Modo>('tutte')
  const [trattamentiScelti, setTrattamentiScelti] = useState<ReadonlySet<string>>(new Set())
  const [pianteScelte, setPianteScelte] = useState<ReadonlySet<string>>(new Set())
  const [righe, setRighe] = useState<Riga[]>(() => (eVasi ? [nuovaRiga()] : []))
  const [provato, setProvato] = useState(false)
  const [occupato, setOccupato] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  // Il doppio tocco si ferma subito, prima che il pulsante risulti disabilitato.
  const inCorso = useRef(false)

  const ordinate = useMemo(() => [...piante].sort((a, b) => a.ordine - b.ordine), [piante])
  const dellaScelta = ordinate.filter(p =>
    modo === 'tutte' ? true : modo === 'trattamento' ? trattamentiScelti.has(p.trattamento_id) : pianteScelte.has(p.id))
  const righeValide = righe.filter(r => r.nome.trim() !== '')

  const problemi: string[] = []
  if (!eDataValida(data)) problemi.push('Scrivi una data valida.')
  if (eVasi) {
    if (righeValide.length === 0) problemi.push('Aggiungi almeno un vaso.')
  } else if (dellaScelta.length + righeValide.length === 0) {
    problemi.push('Scegli almeno una pianta o aggiungi una riga.')
  }

  const cambiaRiga = (id: string, parte: Partial<Riga>) => setRighe(r => r.map(x => (x.id === id ? { ...x, ...parte } : x)))
  const togliRiga = (id: string) => setRighe(r => r.filter(x => x.id !== id))
  const aggiungiRiga = () => setRighe(r => [...r, nuovaRiga(eVasi ? r[r.length - 1]?.substrato ?? '' : '')])
  const alterna = (insieme: ReadonlySet<string>, id: string) => {
    const nuovo = new Set(insieme)
    if (!nuovo.delete(id)) nuovo.add(id)
    return nuovo
  }

  function idDellaPianta(piantaId: string): string {
    let id = idPiante.current.get(piantaId)
    if (!id) { id = nuovoId(); idPiante.current.set(piantaId, id) }
    return id
  }

  async function inizia() {
    setProvato(true)
    if (problemi.length > 0 || inCorso.current) return
    inCorso.current = true
    setOccupato(true)
    setErrore(null)
    const campioni: CampionePesatura[] = [
      ...(eVasi ? [] : dellaScelta.map(p => ({ id: idDellaPianta(p.id), pianta_id: p.id, nome: null, substrato: null }))),
      ...righeValide.map(r => ({
        id: r.id, pianta_id: null, nome: r.nome.trim(), substrato: eVasi ? (r.substrato.trim() || null) : null,
      })),
    ].map((c, i) => ({ ...c, sessione_id: idSessione, ordine: i + 1 }))
    try {
      await creaSessione({
        id: idSessione,
        esperimento_id: espId,
        analisi_id: analisi.id,
        titolo: analisi.titolo,
        tipo: analisi.tipo,
        unita: analisi.unita,
        impostazioni: analisi.impostazioni,
        data,
        nota: nota.trim() === '' ? null : nota.trim(),
        conclusa: false,
      }, campioni)
      await queryClient.invalidateQueries({ queryKey: chiavi.pesatura(espId) })
      navigate(percorsoPesata(espId, idSessione, FASI[analisi.tipo][0]))
    } catch (e) {
      setErrore(messaggioErrore(e))
      inCorso.current = false
      setOccupato(false)
    }
  }

  return (
    <>
      <ModuloCampi className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-title text-grafite">{analisi.titolo}</p>
          <p className="text-sm text-grafite-tenue">{NOMI_TIPO[analisi.tipo]} · {analisi.unita}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idCampo}-data`}>Data</Label>
          <Input id={`${idCampo}-data`} type="date" variant="campo" value={data} onChange={e => setData(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idCampo}-nota`}>Nota (facoltativa)</Label>
          <Input id={`${idCampo}-nota`} autoComplete="off" value={nota} onChange={e => setNota(e.target.value)} />
        </div>

        {!eVasi && (
          <section aria-labelledby={`${idCampo}-piante`} className="flex flex-col gap-3">
            <h2 id={`${idCampo}-piante`} className="text-title text-grafite">Piante</h2>
            <SceltaSingola nome="Quali piante" opzioni={MODI} scelto={modo} onScegli={setModo} />
            {modo === 'trattamento' && (
              <Spunte
                voci={[...trattamenti].sort((a, b) => a.ordine - b.ordine).map(t => ({ id: t.id, testo: t.etichetta }))}
                scelte={trattamentiScelti}
                onCambia={id => setTrattamentiScelti(s => alterna(s, id))}
              />
            )}
            {modo === 'mano' && (
              <Spunte
                voci={ordinate.map(p => ({ id: p.id, testo: `P${p.etichetta}` }))}
                scelte={pianteScelte}
                onCambia={id => setPianteScelte(s => alterna(s, id))}
              />
            )}
            <p role="status" className="text-base font-medium text-grafite">{testoPiante(dellaScelta.length)}</p>
          </section>
        )}

        <section aria-labelledby={`${idCampo}-righe`} className="flex flex-col gap-3">
          <h2 id={`${idCampo}-righe`} className="text-title text-grafite">{eVasi ? 'Vasi' : 'Righe libere'}</h2>
          {righe.map((r, i) => (
            <div key={r.id} className="flex items-end gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Label htmlFor={`${r.id}-nome`}>{eVasi ? `Nome vaso ${i + 1}` : `Nome riga ${i + 1}`}</Label>
                <Input
                  id={`${r.id}-nome`}
                  autoComplete="off"
                  placeholder={eVasi ? 'V1' : 'Bianco, Controllo…'}
                  value={r.nome}
                  onChange={e => cambiaRiga(r.id, { nome: e.target.value })}
                />
              </div>
              {eVasi && (
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Label htmlFor={`${r.id}-substrato`}>{`Substrato vaso ${i + 1}`}</Label>
                  <Input
                    id={`${r.id}-substrato`}
                    autoComplete="off"
                    value={r.substrato}
                    onChange={e => cambiaRiga(r.id, { substrato: e.target.value })}
                  />
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={eVasi ? `Togli vaso ${i + 1}` : `Togli riga ${i + 1}`}
                onClick={() => togliRiga(r.id)}
              >
                <X aria-hidden />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" className="self-start" onClick={aggiungiRiga}>
            <Plus aria-hidden />
            {eVasi ? 'Aggiungi vaso' : 'Aggiungi riga libera'}
          </Button>
        </section>

        {provato && problemi.length > 0 && (
          <div className="flex flex-col gap-1">
            {problemi.map(p => <TestoErrore key={p}>{p}</TestoErrore>)}
          </div>
        )}
      </ModuloCampi>

      <BarraAzioni>
        {errore && <TestoErrore role="alert" className="text-base">{errore}</TestoErrore>}
        <Button size="lg" disabled={senzaRete || occupato} onClick={() => void inizia()}>
          {occupato ? 'Salvataggio…' : 'Inizia la pesata'}
        </Button>
      </BarraAzioni>
    </>
  )
}

/** Un elenco di spunte da quaderno: ogni riga è alta almeno 44 px e si tocca per intero. */
function Spunte({ voci, scelte, onCambia }: {
  voci: { id: string; testo: string }[]
  scelte: ReadonlySet<string>
  onCambia: (id: string) => void
}) {
  return (
    <div className="flex flex-col border-t border-riga">
      {voci.map(v => (
        <label key={v.id} className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-riga py-2 pr-3 text-base text-grafite">
          <input type="checkbox" checked={scelte.has(v.id)} onChange={() => onCambia(v.id)} className="size-5 shrink-0 accent-inchiostro" />
          {v.testo}
        </label>
      ))}
    </div>
  )
}
