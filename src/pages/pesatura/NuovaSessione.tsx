import { useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CloudOff, Minus, Plus, RotateCcw, X } from 'lucide-react'
import { creaSessione } from '@/api/pesatura'
import { chiavi, useConfig, usePesatura } from '@/api/query'
import { Asterisco } from '@/components/Asterisco'
import { AppShell } from '@/components/AppShell'
import { BarraAzioni } from '@/components/BarraAzioni'
import { RigaStato } from '@/components/Caricamento'
import { Interruttore } from '@/components/config/Interruttore'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { MenuTendina } from '@/components/MenuTendina'
import { ModuloCampi } from '@/components/ModuloCampi'
import { NumericField } from '@/components/NumericField'
import { SceltaSingola } from '@/components/SceltaSingola'
import { TestoErrore } from '@/components/TestoErrore'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  bozzaDa, bozzaVuota, campioniDa, DESCRIZIONI_TIPO, impostazioniDi, MAX_REPLICHE, MIN_REPLICHE, problemiDi, SENSORI, unitaDi,
  type BozzaPesata, type ModoPiante, type SceltaCampioni, type SceltaUnita,
} from '@/domain/pesatura/modulo'
import { FASI } from '@/domain/pesatura/sequenza'
import { MAX_CARATTERI_UNITA, NOMI_TIPO, type CampionePesatura, type SessionePesatura, type TipoAnalisi } from '@/domain/pesatura/tipi'
import type { Pianta, Trattamento } from '@/domain/tipi'
import { eDataValida, formattaData, oggiLocale } from '@/lib/date'
import { messaggioErrore } from '@/lib/errori'
import { nuovoId } from '@/lib/id'
import { percorsoPesata, percorsoPesatura } from '@/lib/percorsi'
import { usePermessi } from '@/lib/usePermessi'
import { useSenzaRete } from '@/lib/useSenzaRete'
import { SENZA_RETE_PESATURA } from './messaggi'

const TIPI: TipoAnalisi[] = ['aliquota', 'rwc', 'sostanza_secca', 'vasi']
const UNITA: { valore: SceltaUnita; testo: string }[] = [
  { valore: 'g', testo: 'g (grammi)' },
  { valore: 'mg', testo: 'mg (milligrammi)' },
  { valore: 'kg', testo: 'kg (chilogrammi)' },
  { valore: 'altra', testo: 'Inserisci tu l\'unità…' },
]
const MODI: { valore: ModoPiante; testo: string }[] = [
  { valore: 'tutte', testo: 'Tutte le piante' },
  { valore: 'trattamento', testo: 'Per trattamento' },
  { valore: 'mano', testo: 'Scegli a mano' },
]

/** Una riga che non è una pianta: una riga libera (Bianco, Controllo…) o un vaso (con il suo substrato). */
interface Riga { id: string; nome: string; substrato: string }
const nuovaRiga = (nome = '', substrato = ''): Riga => ({ id: nuovoId(), nome, substrato })
const testoPiante = (n: number) => `${n} ${n === 1 ? 'pianta' : 'piante'}`

/**
 * Una nuova pesata: titolo, data, tipo, unità, impostazioni, nota e campioni, tutto in un modulo. Con `?da=` ("Ripeti")
 * parte già compilata come quella pesata. Solo online.
 */
export function NuovaSessione() {
  const { espId = '' } = useParams()
  const [ricerca] = useSearchParams()
  const idOrigine = ricerca.get('da')
  const pesatura = usePesatura(espId)
  const config = useConfig(espId)
  const permessi = usePermessi(espId)
  const senzaRete = useSenzaRete()
  const indietro = percorsoPesatura(espId)
  const titolo = idOrigine ? 'Ripeti pesata' : 'Nuova pesata'

  const origine = idOrigine ? (pesatura.data?.sessioni ?? []).find(s => s.id === idOrigine) ?? null : null
  let corpo
  if (!permessi.puoMisurare) {
    corpo = <p className="text-grafite">Non puoi iniziare una pesata: hai solo la lettura di questo esperimento.</p>
  } else if (idOrigine && pesatura.data === undefined) {
    corpo = pesatura.isError
      ? <ErroreConRiprova errore={pesatura.error} onRiprova={() => void pesatura.refetch()} />
      : <RigaStato testo="Caricamento…" />
  } else if (idOrigine && !origine) {
    corpo = (
      <div className="flex flex-col items-start gap-2">
        <p className="text-grafite">La pesata da ripetere non c&apos;è più.</p>
        <Link to={indietro} className={buttonVariants({ variant: 'ghost', className: '-ml-3' })}>Torna alla Pesatura</Link>
      </div>
    )
  } else if (config.data === undefined) {
    corpo = config.isError
      ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
      : <RigaStato testo="Caricamento…" />
  } else {
    corpo = (
      <Modulo
        key={origine?.id ?? 'nuova'}
        espId={espId}
        origine={origine}
        campioniOrigine={origine ? (pesatura.data?.campioni ?? []).filter(c => c.sessione_id === origine.id) : []}
        piante={config.data.piante}
        trattamenti={config.data.trattamenti}
      />
    )
  }

  // Il modulo porta la sua barra azioni; negli altri casi c'è solo il messaggio.
  return (
    <AppShell titolo={titolo} indietro={indietro}>
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

function Modulo({ espId, origine, campioniOrigine, piante, trattamenti }: {
  espId: string
  origine: SessionePesatura | null
  campioniOrigine: CampionePesatura[]
  piante: Pianta[]
  trattamenti: Trattamento[]
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const senzaRete = useSenzaRete()
  const idCampo = useId()
  // Gli id si scelgono una volta: un nuovo tentativo dopo un errore riscrive le stesse righe (upsert), senza duplicati.
  const [idSessione] = useState(nuovoId)
  const idPiante = useRef(new Map<string, string>())
  const [bozza, setBozza] = useState<BozzaPesata>(() => (origine ? bozzaDa(origine, oggiLocale()) : bozzaVuota(oggiLocale())))
  const [scelta] = useState<SceltaCampioni | null>(() => (origine ? campioniDa(campioniOrigine, piante) : null))
  const [modo, setModo] = useState<ModoPiante>(scelta?.modo ?? 'tutte')
  const [trattamentiScelti, setTrattamentiScelti] = useState<ReadonlySet<string>>(new Set())
  const [pianteScelte, setPianteScelte] = useState<ReadonlySet<string>>(() => new Set(scelta?.piante ?? []))
  const [righe, setRighe] = useState<Riga[]>(() => scelta?.righe.map(r => nuovaRiga(r.nome, r.substrato)) ?? [])
  const [provato, setProvato] = useState(false)
  const [occupato, setOccupato] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  // Il doppio tocco si ferma subito, prima che il pulsante risulti disabilitato.
  const inCorso = useRef(false)

  const eVasi = bozza.tipo === 'vasi'
  const cambia = (parte: Partial<BozzaPesata>) => setBozza(b => ({ ...b, ...parte }))
  const ordinate = useMemo(() => [...piante].sort((a, b) => a.ordine - b.ordine), [piante])
  const dellaScelta = eVasi ? [] : ordinate.filter(p =>
    modo === 'tutte' ? true : modo === 'trattamento' ? trattamentiScelti.has(p.trattamento_id) : pianteScelte.has(p.id))
  const righeValide = righe.filter(r => r.nome.trim() !== '')

  const problemi = problemiDi(bozza)
  if (!eDataValida(bozza.data)) problemi.unshift('Scrivi una data valida.')
  if (eVasi) {
    if (righeValide.length === 0) problemi.push('Aggiungi almeno un vaso.')
  } else if (dellaScelta.length + righeValide.length === 0) {
    problemi.push('Scegli almeno una pianta o aggiungi una riga.')
  }

  const cambiaRiga = (id: string, parte: Partial<Riga>) => setRighe(r => r.map(x => (x.id === id ? { ...x, ...parte } : x)))
  const togliRiga = (id: string) => setRighe(r => r.filter(x => x.id !== id))
  const aggiungiRiga = () => setRighe(r => [...r, nuovaRiga('', eVasi ? r[r.length - 1]?.substrato ?? '' : '')])
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
  const cambiaRepliche = (passo: number) =>
    cambia({ repliche: Math.min(MAX_REPLICHE, Math.max(MIN_REPLICHE, (Number.isInteger(bozza.repliche) ? bozza.repliche as number : 1) + passo)) })

  async function inizia() {
    setProvato(true)
    if (problemi.length > 0 || inCorso.current) return
    inCorso.current = true
    setOccupato(true)
    setErrore(null)
    const campioni: CampionePesatura[] = [
      ...dellaScelta.map(p => ({ id: idDellaPianta(p.id), pianta_id: p.id, nome: null, substrato: null })),
      ...righeValide.map(r => ({
        id: r.id, pianta_id: null, nome: r.nome.trim(), substrato: eVasi ? (r.substrato.trim() || null) : null,
      })),
    ].map((c, i) => ({ ...c, sessione_id: idSessione, ordine: i + 1 }))
    try {
      await creaSessione({
        id: idSessione,
        esperimento_id: espId,
        titolo: bozza.titolo.trim(),
        tipo: bozza.tipo,
        unita: unitaDi(bozza),
        impostazioni: impostazioniDi(bozza),
        data: bozza.data,
        nota: bozza.nota.trim() === '' ? null : bozza.nota.trim(),
        conclusa: false,
      }, campioni)
      await queryClient.invalidateQueries({ queryKey: chiavi.pesatura(espId) })
      navigate(percorsoPesata(espId, idSessione, FASI[bozza.tipo][0]))
    } catch (e) {
      setErrore(messaggioErrore(e))
      inCorso.current = false
      setOccupato(false)
    }
  }

  return (
    <>
      <ModuloCampi className="flex flex-col gap-6">
        {origine && (
          <p role="status" className="flex items-start gap-2.5 rounded-md bg-inchiostro-velato px-3.5 py-3 text-base text-grafite">
            <RotateCcw aria-hidden className="mt-0.5 size-5 shrink-0 text-inchiostro" />
            <span>
              Compilata come <span className="font-semibold">{origine.titolo}</span> del {formattaData(origine.data)}.
              Controlla e cambia solo quello che serve.
            </span>
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idCampo}-titolo`}>
            Titolo
            <Asterisco />
          </Label>
          <Input
            id={`${idCampo}-titolo`}
            autoComplete="off"
            aria-required
            placeholder="Es. Antociani foglie"
            value={bozza.titolo}
            onChange={e => cambia({ titolo: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idCampo}-data`}>Data</Label>
          <Input id={`${idCampo}-data`} type="date" variant="campo" value={bozza.data} onChange={e => cambia({ data: e.target.value })} />
        </div>

        <MenuTendina
          etichetta="Tipo"
          opzioni={TIPI.map(t => ({ valore: t, testo: NOMI_TIPO[t] }))}
          valore={bozza.tipo}
          onCambia={tipo => cambia({ tipo })}
          aiuto={DESCRIZIONI_TIPO[bozza.tipo]}
        />

        <div className="flex flex-col gap-3">
          <MenuTendina etichetta="Unità di misura" opzioni={UNITA} valore={bozza.sceltaUnita} onCambia={sceltaUnita => cambia({ sceltaUnita })} />
          {bozza.sceltaUnita === 'altra' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idCampo}-unita`}>
                La tua unità
                <Asterisco />
              </Label>
              <Input
                id={`${idCampo}-unita`}
                variant="campo"
                autoComplete="off"
                aria-required
                maxLength={MAX_CARATTERI_UNITA}
                aria-describedby={`${idCampo}-unita-aiuto`}
                placeholder="Es. µg, lb"
                value={bozza.unitaLibera}
                onChange={e => cambia({ unitaLibera: e.target.value })}
              />
              <p id={`${idCampo}-unita-aiuto`} className="text-sm text-grafite-tenue">
                Compare accanto a ogni peso e nell&apos;Excel. RWC e % di sostanza secca si calcolano con qualsiasi unità.
              </p>
            </div>
          )}
        </div>

        {!eVasi && (
          <div role="group" aria-labelledby={`${idCampo}-repliche`} className="flex flex-col gap-1.5">
            <p id={`${idCampo}-repliche`} className="text-label font-medium text-grafite">Repliche per campione</p>
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" size="icon-lg" aria-label="Una replica in meno"
                disabled={bozza.repliche !== null && bozza.repliche <= MIN_REPLICHE} onClick={() => cambiaRepliche(-1)}>
                <Minus aria-hidden />
              </Button>
              <output aria-live="polite" className="min-w-10 text-center font-mono text-numero tabular-nums text-grafite">{bozza.repliche}</output>
              <Button type="button" variant="outline" size="icon-lg" aria-label="Una replica in più"
                disabled={bozza.repliche !== null && bozza.repliche >= MAX_REPLICHE} onClick={() => cambiaRepliche(1)}>
                <Plus aria-hidden />
              </Button>
              <span className="text-sm text-grafite-tenue">
                {bozza.repliche === 1 ? 'un peso per campione' : `${bozza.repliche} pesi per campione (A, B…)`}
              </span>
            </div>
          </div>
        )}

        {bozza.tipo === 'aliquota' && (
          <div className="flex flex-col gap-4">
            <Interruttore
              etichetta="Calcola i mL di tampone"
              aiuto="Dal peso dell'aliquota si calcola quanto tampone aggiungere a ogni provetta."
              checked={bozza.calcolaTampone}
              onCheckedChange={calcolaTampone => cambia({ calcolaTampone })}
            />
            {bozza.calcolaTampone && (
              <NumericField label="mL di tampone per g di campione" value={bozza.rapportoTampone} onChange={rapportoTampone => cambia({ rapportoTampone })} />
            )}
          </div>
        )}

        {eVasi && (
          <div className="flex flex-col gap-4">
            <MenuTendina
              etichetta="Sensore"
              opzioni={SENSORI.map(s => ({ valore: s.valore, testo: s.testo }))}
              valore={bozza.sensore}
              onCambia={sensore => cambia({ sensore, unitaSensore: SENSORI.find(s => s.valore === sensore)!.unita })}
            />
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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idCampo}-nota`}>Nota (facoltativa)</Label>
          <Textarea
            id={`${idCampo}-nota`}
            aria-describedby={`${idCampo}-nota-aiuto`}
            placeholder="Protocollo, condizioni, cosa ricordare…"
            value={bozza.nota}
            onChange={e => cambia({ nota: e.target.value })}
          />
          <p id={`${idCampo}-nota-aiuto`} className="text-sm text-grafite-tenue">
            Le prime parole si vedono nell&apos;elenco delle pesate. Si può modificare anche dopo.
          </p>
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
          <p className="text-sm text-grafite-tenue">
            {eVasi ? 'I vasi della taratura, con nome e substrato.' : 'Campioni che non sono piante: bianco, controllo, standard.'}
          </p>
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
