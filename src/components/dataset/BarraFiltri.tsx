import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import {
  MASSIMO_PEZZI_CERCA, SETTIMANE_DEL_DATASET, haFiltriAttivi, limitaCerca, parametriDelloStrumento, strumentiPerScelta,
  type FiltriDataset, type Intervallo, type Periodo,
} from '@/domain/dataset'
import type { ConfigEsperimento } from '@/domain/tipi'
import { eDataValida, formattaData, formattaGiornoMese } from '@/lib/date'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type NomePannello = 'strumento' | 'parametro' | 'trattamenti' | 'fattore' | 'periodo' | 'piante'

/** Il nome del pannello aperto, per chi lo legge con uno screen reader. */
const NOME_PANNELLO: Record<NomePannello, string> = {
  strumento: 'Strumento', parametro: 'Parametro', trattamenti: 'Trattamenti', fattore: 'Fattore', periodo: 'Periodo', piante: 'Piante',
}

const CHIP = 'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3.5 text-base font-medium whitespace-nowrap transition-colors'
/** Un filtro diverso dal default ha il fondo inchiostro velato, mai inchiostro pieno: quello è dei chip scelti nel pannello. */
const CHIP_NORMALE = 'border-riga-controllo bg-foglio text-grafite hover:border-grafite-tenue active:bg-carta-ombra aria-expanded:border-grafite-tenue'
const CHIP_ATTIVO = 'border-inchiostro bg-inchiostro-velato text-grafite active:bg-inchiostro-velato'
const CHIP_SCELTO = 'border-inchiostro bg-inchiostro text-foglio active:bg-inchiostro-scuro'
const CHIP_LIBERO = 'border-riga-controllo bg-foglio text-grafite hover:border-grafite-tenue active:bg-carta-ombra'

const RIGA_SCELTA = 'flex min-h-11 w-full items-center gap-2 border-b border-riga py-2 text-left text-base text-grafite transition-colors hover:bg-carta-ombra active:bg-carta-ombra'

const ordinati = <T extends { ordine: number }>(xs: T[]): T[] => [...xs].sort((a, b) => a.ordine - b.ordine)

function etichettaTrattamenti(config: ConfigEsperimento, ids: string[]): string {
  if (ids.length === 0) return 'Trattamenti: tutti'
  if (ids.length === 1) return `Trattamenti: ${config.trattamenti.find(t => t.id === ids[0])?.etichetta ?? '1'}`
  return `Trattamenti: ${ids.length} di ${config.trattamenti.length}`
}

function etichettaFattori(config: ConfigEsperimento, livelloIds: string[]): string {
  if (livelloIds.length === 0) return 'Fattore: tutti'
  if (livelloIds.length > 1) return `Fattori: ${livelloIds.length}`
  const fattore = config.fattori.find(f => f.livelli.some(l => l.id === livelloIds[0]))
  const livello = fattore?.livelli.find(l => l.id === livelloIds[0])
  return fattore && livello ? `${fattore.nome}: ${livello.nome}` : 'Fattore: 1'
}

function etichettaPeriodo(periodo: Periodo): string {
  switch (periodo.modo) {
    case 'tutto': return 'Tutto il periodo'
    case 'settimane': return `Ultime ${periodo.n} settimane`
    case 'intervallo': return `Dal ${formattaGiornoMese(periodo.da)} al ${formattaGiornoMese(periodo.a)}`
  }
}

/** "Piante: 3, 12, 35": le prime lettere di ciò che si cerca, per non allungare la riga dei filtri. */
function etichettaPiante(cercato: string): string {
  const testo = cercato.trim().replace(/\s+/g, ' ')
  if (testo === '') return 'Piante'
  return `Piante: ${testo.length > 14 ? `${testo.slice(0, 13)}…` : testo}`
}

interface ChipProps {
  nome: NomePannello
  aperto: NomePannello | null
  attivo?: boolean
  mono?: boolean
  idPannello: string
  onApri: (nome: NomePannello) => void
  children: ReactNode
}

/** Un filtro della barra: mostra il valore attuale in breve e apre il suo pannello sotto la barra. */
function Chip({ nome, aperto, attivo = false, mono = false, idPannello, onApri, children }: ChipProps) {
  const eAperto = aperto === nome
  return (
    <button
      type="button"
      aria-expanded={eAperto}
      aria-controls={eAperto ? idPannello : undefined}
      onClick={() => onApri(nome)}
      className={cn(CHIP, attivo ? CHIP_ATTIVO : CHIP_NORMALE, mono && 'font-mono tabular-nums')}
    >
      {children}
    </button>
  )
}

interface SceltaSingolaProps<T extends string> {
  nome: string
  opzioni: { valore: T; testo: ReactNode }[]
  scelto: T | null
  onScegli: (valore: T) => void
}

/** Una scelta tra poche: righe da quaderno, `radiogroup` con la sola scelta attiva in tabulazione e le frecce che spostano. */
function SceltaSingola<T extends string>({ nome, opzioni, scelto, onScegli }: SceltaSingolaProps<T>) {
  const gruppo = useRef<HTMLDivElement>(null)

  function frecce(evento: KeyboardEvent<HTMLDivElement>) {
    const passo = evento.key === 'ArrowDown' || evento.key === 'ArrowRight' ? 1 : evento.key === 'ArrowUp' || evento.key === 'ArrowLeft' ? -1 : 0
    if (passo === 0) return
    evento.preventDefault()
    const adesso = Math.max(0, opzioni.findIndex(o => o.valore === scelto))
    const prossima = opzioni[(adesso + passo + opzioni.length) % opzioni.length]
    onScegli(prossima.valore)
    Array.from(gruppo.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []).find(el => el.dataset.valore === prossima.valore)?.focus()
  }

  return (
    <div ref={gruppo} role="radiogroup" aria-label={nome} onKeyDown={frecce} className="flex flex-col border-t border-riga">
      {opzioni.map((o, i) => {
        const attiva = o.valore === scelto
        return (
          <button
            key={o.valore}
            type="button"
            role="radio"
            data-valore={o.valore}
            aria-checked={attiva}
            tabIndex={attiva || (scelto === null && i === 0) ? 0 : -1}
            onClick={() => onScegli(o.valore)}
            className={cn(RIGA_SCELTA, attiva && 'font-semibold')}
          >
            <Check aria-hidden strokeWidth={2.5} className={cn('size-4 shrink-0 text-inchiostro', !attiva && 'invisible')} />
            <span className="min-w-0 flex-1">{o.testo}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Un chip del pannello: scelto = inchiostro pieno con il segno, come nella galleria Foto. */
function ChipScelta({ scelto, onClick, children }: { scelto: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={scelto} onClick={onClick} className={cn(CHIP, scelto ? CHIP_SCELTO : CHIP_LIBERO)}>
      {scelto && <Check aria-hidden className="size-4" strokeWidth={2.5} />}
      {children}
    </button>
  )
}

interface PannelloProps { config: ConfigEsperimento; filtri: FiltriDataset; onCambia: (cambio: Partial<FiltriDataset>) => void }

function PannelloStrumento({ config, filtri, onCambia, chiudi }: PannelloProps & { chiudi: () => void }) {
  const strumenti = strumentiPerScelta(config)
  return (
    <SceltaSingola
      nome="Strumento"
      scelto={filtri.strumentoId}
      opzioni={strumenti.map(s => ({ valore: s.id, testo: s.archiviato ? `${s.nome} (archiviato)` : s.nome }))}
      onScegli={id => { onCambia({ strumentoId: id }); chiudi() }}
    />
  )
}

function PannelloParametro({ config, filtri, onCambia, chiudi }: PannelloProps & { chiudi: () => void }) {
  const parametri = filtri.strumentoId === null ? [] : parametriDelloStrumento(config, filtri.strumentoId)
  return (
    <SceltaSingola
      nome="Parametro"
      scelto={filtri.parametroId}
      opzioni={parametri.map(({ parametro, disegnabile }) => ({
        valore: parametro.id,
        testo: `${parametro.nome}${parametro.archiviato ? ' (archiviato)' : ''}${disegnabile ? '' : ' (solo tabella)'}`,
      }))}
      onScegli={id => { onCambia({ parametroId: id }); chiudi() }}
    />
  )
}

function PannelloTrattamenti({ config, filtri, onCambia }: PannelloProps) {
  const scelti = new Set(filtri.trattamentoIds)
  const tutti = ordinati(config.trattamenti)
  const alterna = (id: string) => onCambia({
    // nell'ordine della configurazione, così la URL è la stessa a prescindere da come si è cliccato
    trattamentoIds: tutti.filter(t => (t.id === id ? !scelti.has(id) : scelti.has(t.id))).map(t => t.id),
  })
  return (
    <div className="flex flex-wrap gap-2">
      <ChipScelta scelto={scelti.size === 0} onClick={() => onCambia({ trattamentoIds: [] })}>Tutti</ChipScelta>
      {tutti.map(t => (
        <ChipScelta key={t.id} scelto={scelti.has(t.id)} onClick={() => alterna(t.id)}>
          <span className="font-mono tabular-nums">{t.etichetta}</span>
        </ChipScelta>
      ))}
    </div>
  )
}

function PannelloFattore({ config, filtri, onCambia }: PannelloProps) {
  const fattori = ordinati(config.fattori)
  const scelto = (fattoreId: string) => fattori.find(f => f.id === fattoreId)?.livelli.find(l => filtri.livelloIds.includes(l.id))?.id ?? null
  /** Un livello per fattore, nell'ordine dei fattori; `null` = "Tutti" per quel fattore. */
  const scegli = (fattoreId: string, livelloId: string | null) => onCambia({
    livelloIds: fattori.flatMap(f => {
      const id = f.id === fattoreId ? livelloId : scelto(f.id)
      return id === null ? [] : [id]
    }),
  })
  return (
    <div className="flex flex-col gap-3">
      {fattori.map(f => (
        <div key={f.id} role="group" aria-label={f.nome} className="flex flex-col gap-1.5">
          <p className="text-label text-grafite-tenue select-none">{f.nome}</p>
          <div className="flex flex-wrap gap-2">
            <ChipScelta scelto={scelto(f.id) === null} onClick={() => scegli(f.id, null)}>Tutti</ChipScelta>
            {ordinati(f.livelli).map(l => (
              <ChipScelta key={l.id} scelto={scelto(f.id) === l.id} onClick={() => scegli(f.id, l.id)}>{l.nome}</ChipScelta>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const MODI_SETTIMANE = SETTIMANE_DEL_DATASET.map(n => ({ valore: `${n}s`, testo: `Ultime ${n} settimane`, n }))

function PannelloPeriodo({ filtri, intervallo, onCambia }: Omit<PannelloProps, 'config'> & { intervallo: Intervallo | null }) {
  const { periodo } = filtri
  // "Dal… al…" si sceglie prima di avere le due date: finché mancano, la scelta e le date digitate restano qui.
  const [intervalloScelto, setIntervalloScelto] = useState(periodo.modo === 'intervallo')
  const [da, setDa] = useState(periodo.modo === 'intervallo' ? periodo.da : '')
  const [a, setA] = useState(periodo.modo === 'intervallo' ? periodo.a : '')

  const modo = intervalloScelto ? 'intervallo' : periodo.modo === 'settimane' ? `${periodo.n}s` : 'tutto'
  const dateGiuste = eDataValida(da) && eDataValida(a)
  const ordineSbagliato = dateGiuste && da > a

  function cambiaData(nuovaDa: string, nuovaA: string) {
    setDa(nuovaDa)
    setA(nuovaA)
    // Nella URL entra solo un intervallo giusto: con date a metà o all'incontrario resta l'ultima vista valida.
    if (eDataValida(nuovaDa) && eDataValida(nuovaA) && nuovaDa <= nuovaA) onCambia({ periodo: { modo: 'intervallo', da: nuovaDa, a: nuovaA } })
  }

  return (
    <div className="flex flex-col gap-3">
      <SceltaSingola
        nome="Periodo"
        scelto={modo}
        opzioni={[
          { valore: 'tutto', testo: 'Tutto' },
          ...MODI_SETTIMANE.map(m => ({ valore: m.valore, testo: m.testo })),
          { valore: 'intervallo', testo: 'Dal… al…' },
        ]}
        onScegli={valore => {
          setIntervalloScelto(valore === 'intervallo')
          if (valore === 'intervallo') return
          if (valore === 'tutto') onCambia({ periodo: { modo: 'tutto' } })
          else onCambia({ periodo: { modo: 'settimane', n: MODI_SETTIMANE.find(m => m.valore === valore)?.n ?? 4 } })
        }}
      />
      {modo === 'intervallo' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dataset-dal">Dal</Label>
            <Input id="dataset-dal" type="date" variant="campo" value={da} onChange={e => cambiaData(e.target.value, a)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dataset-al">Al</Label>
            <Input id="dataset-al" type="date" variant="campo" value={a} onChange={e => cambiaData(da, e.target.value)} />
          </div>
        </div>
      )}
      {modo === 'intervallo' && ordineSbagliato && (
        <p role="status" className="text-base text-errore">La data di inizio deve venire prima di quella di fine.</p>
      )}
      {modo === 'intervallo' && !dateGiuste && (da !== '' || a !== '') && (
        <p role="status" className="text-base text-grafite-tenue">Scegli tutte e due le date.</p>
      )}
      {periodo.modo === 'settimane' && intervallo?.da && intervallo.a && (
        <p className="font-mono text-dato tabular-nums text-grafite-tenue">{`Dal ${formattaData(intervallo.da)} al ${formattaData(intervallo.a)}`}</p>
      )}
    </div>
  )
}

function PannelloPiante({ cercatoGrezzo, onCambia }: { cercatoGrezzo: string; onCambia: (cambio: Partial<FiltriDataset>) => void }) {
  const id = useId()
  // Il testo sta qui e la URL lo segue: se partisse dalla URL a ogni tasto, un aggiornamento in ritardo del router
  // riporterebbe il campo a com'era un attimo prima. Un azzeramento da fuori rimonta il pannello (vedi `azzeramenti`).
  const [testo, setTesto] = useState(cercatoGrezzo)
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${id}-cerca`}>Cerca piante</Label>
      <Input
        id={`${id}-cerca`} type="search" variant="campo" autoComplete="off" autoCapitalize="characters" spellCheck={false}
        placeholder="es. 3, 12, 35" value={testo}
        onChange={e => { setTesto(e.target.value); onCambia({ cercato: e.target.value }) }}
      />
      <p className="text-label text-grafite-tenue">Le etichette separate da virgola. Il numero esatto: 3 non trova la 13.</p>
      {limitaCerca(testo) !== testo && (
        <p role="status" className="text-base text-grafite-tenue">{`Si cercano solo i primi ${MASSIMO_PEZZI_CERCA} pezzi.`}</p>
      )}
    </div>
  )
}

interface BarraFiltriProps {
  config: ConfigEsperimento
  filtri: FiltriDataset
  /** Il testo di "Cerca piante" come sta nella URL, anche oltre i limiti di lettura. */
  cercatoGrezzo: string
  /** Gli estremi del periodo, se già calcolati: per "ultime N settimane" si mostrano le date vere. */
  intervallo: Intervallo | null
  /** Cresce a ogni azzeramento dei filtri: il campo di ricerca riparte dalla URL, ora vuota. */
  azzeramenti: number
  onCambia: (cambio: Partial<FiltriDataset>) => void
  onAzzera: () => void
}

/**
 * La barra dei filtri del Dataset, sempre in alto sotto la barra dell'app: una riga che scorre di pulsanti alti 44 px,
 * ognuno con il valore attuale in breve (`Trattamenti: tutti`, `Ultime 4 settimane`). Un filtro diverso dal default ha
 * il fondo inchiostro velato. Toccandone uno si apre sotto la barra il suo pannello (uno alla volta); Esc lo chiude.
 * Il parametro c'è solo se lo strumento ne ha più di uno, il fattore solo se l'esperimento ne ha. In fondo alla riga,
 * con filtri attivi, "Azzera".
 */
export function BarraFiltri({ config, filtri, cercatoGrezzo, intervallo, azzeramenti, onCambia, onAzzera }: BarraFiltriProps) {
  const idPannello = useId()
  const [aperto, setAperto] = useState<NomePannello | null>(null)
  const alterna = (nome: NomePannello) => setAperto(attuale => (attuale === nome ? null : nome))
  const chiudi = () => setAperto(null)

  const strumento = config.strumenti.find(s => s.id === filtri.strumentoId)
  const parametri = useMemo(
    () => (filtri.strumentoId === null ? [] : parametriDelloStrumento(config, filtri.strumentoId)),
    [config, filtri.strumentoId],
  )
  const parametro = parametri.find(p => p.parametro.id === filtri.parametroId)?.parametro
  const comune = { aperto, idPannello, onApri: alterna }
  const pannello: PannelloProps = { config, filtri, onCambia }

  return (
    <div
      role="group"
      aria-label="Filtri"
      onKeyDown={e => { if (e.key === 'Escape' && aperto !== null) { e.stopPropagation(); chiudi() } }}
      // Sotto la barra dell'app (alta 56 px più l'area sicura) e a filo con essa: annulla lo spazio sopra il contenuto.
      className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 -mx-4 -mt-6 border-b border-riga bg-carta"
    >
      <div className="flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none]">
        <Chip nome="strumento" {...comune}>
          {strumento?.icona && <span aria-hidden>{strumento.icona}</span>}
          {strumento?.nome ?? 'Strumento'}
        </Chip>
        {parametri.length > 1 && <Chip nome="parametro" {...comune}>{parametro?.nome ?? 'Parametro'}</Chip>}
        <Chip nome="trattamenti" {...comune} attivo={filtri.trattamentoIds.length > 0}>{etichettaTrattamenti(config, filtri.trattamentoIds)}</Chip>
        {config.fattori.length > 0 && (
          <Chip nome="fattore" {...comune} attivo={filtri.livelloIds.length > 0}>{etichettaFattori(config, filtri.livelloIds)}</Chip>
        )}
        <Chip nome="periodo" {...comune} mono attivo={filtri.periodo.modo !== 'tutto'}>{etichettaPeriodo(filtri.periodo)}</Chip>
        <Chip nome="piante" {...comune} mono attivo={filtri.cercato.trim() !== ''}>{etichettaPiante(filtri.cercato)}</Chip>
        {haFiltriAttivi(filtri) && (
          <Button type="button" variant="ghost" size="sm" onClick={() => { chiudi(); onAzzera() }} className="shrink-0">Azzera</Button>
        )}
      </div>

      {aperto !== null && (
        <div id={idPannello} role="group" aria-label={NOME_PANNELLO[aperto]} className="max-h-[55dvh] overflow-y-auto border-t border-riga px-4 py-3">
          {aperto === 'strumento' && <PannelloStrumento {...pannello} chiudi={chiudi} />}
          {aperto === 'parametro' && <PannelloParametro {...pannello} chiudi={chiudi} />}
          {aperto === 'trattamenti' && <PannelloTrattamenti {...pannello} />}
          {aperto === 'fattore' && <PannelloFattore {...pannello} />}
          {aperto === 'periodo' && <PannelloPeriodo filtri={filtri} intervallo={intervallo} onCambia={onCambia} />}
          {aperto === 'piante' && <PannelloPiante key={azzeramenti} cercatoGrezzo={cercatoGrezzo} onCambia={onCambia} />}
        </div>
      )}
    </div>
  )
}
