import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Check, Settings } from 'lucide-react'
import { useConfig, useMisureGiorno } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { BannerData } from '@/components/BannerData'
import { BarraAzioni } from '@/components/BarraAzioni'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { TestoErrore } from '@/components/TestoErrore'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { contaPerPianta } from '@/domain/misure'
import { etichetteNumeriche, trovaPianta } from '@/domain/piante'
import type { ConfigEsperimento, Passata } from '@/domain/tipi'
import { formattaData } from '@/lib/date'
import { useOggi } from '@/lib/useOggi'
import { cn } from '@/lib/utils'
import { useCampoStore } from '@/store/campo'

const percorsoPianta = (espId: string, piantaId: string) =>
  `/esperimenti/${encodeURIComponent(espId)}/piante/${encodeURIComponent(piantaId)}`

/**
 * Le passate come scelte esclusive in una riga che scorre di lato (DESIGN.md, Chips). Sono vere scelte radio
 * nascoste dentro un'etichetta da 44px: tastiera, lettori di schermo e "una sola scelta" arrivano dal browser.
 * La scelta selezionata è inchiostro pieno con un ✓ (non solo colore).
 */
function SceltaPassata({ passate, sceltaId, onScegli }: { passate: Passata[]; sceltaId: string | null; onScegli: (id: string) => void }) {
  const idEtichetta = useId()
  const nome = useId()
  const riga = useRef<HTMLDivElement>(null)

  // La passata ricordata dall'ultima volta può essere fuori dallo schermo, in fondo alla riga.
  useEffect(() => {
    riga.current?.querySelector('input:checked')?.closest('label')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' })
  }, [sceltaId])

  return (
    <div className="flex flex-col gap-1.5">
      <p id={idEtichetta} className="text-label text-grafite-tenue">Passata</p>
      <div ref={riga} role="radiogroup" aria-labelledby={idEtichetta} className="-mx-4 flex gap-2 scroll-px-4 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {passate.map(p => {
          const selezionata = p.id === sceltaId
          return (
            // `relative`: la scelta nascosta (sr-only, in posizione assoluta) resta dentro la riga e non allarga la pagina.
            <label key={p.id} className="relative shrink-0 cursor-pointer">
              <input type="radio" name={nome} checked={selezionata} onChange={() => onScegli(p.id)} className="peer sr-only" />
              <span
                className={cn(
                  'flex h-11 items-center gap-1.5 rounded-lg border px-3.5 text-base font-medium whitespace-nowrap transition-colors',
                  'outline-inchiostro peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
                  selezionata
                    ? 'border-inchiostro bg-inchiostro text-foglio'
                    : 'border-riga-controllo bg-foglio text-grafite hover:border-grafite-tenue active:bg-carta-ombra',
                )}
              >
                {p.icona && <span aria-hidden>{p.icona}</span>}
                {p.nome}
                {selezionata && <Check aria-hidden className="size-4" strokeWidth={3} />}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

function DataRilievo({ espId }: { espId: string }) {
  const id = useId()
  const oggi = useOggi()
  const dataRilievo = useCampoStore(s => s.dati(espId, oggi).dataRilievo)
  const setData = useCampoStore(s => s.setData)

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Data di rilievo</Label>
      <Input
        id={id}
        type="date"
        variant="campo"
        value={dataRilievo}
        // Svuotare il selettore non è una data: resta quella di prima.
        onChange={e => { if (e.target.value) setData(espId, e.target.value) }}
      />
    </div>
  )
}

/**
 * Il campo "N° pianta": l'unico testo grande della schermata. "Apri scheda pianta" è l'azione principale, nella
 * barra in basso (fissa, quindi il modulo la contiene senza farle occupare posto).
 */
function CampoPianta({ espId, config, passata }: { espId: string; config: ConfigEsperimento; passata: Passata | null }) {
  const navigate = useNavigate()
  const idCampo = useId()
  const idMessaggio = useId()
  const campo = useRef<HTMLInputElement>(null)
  const [testo, setTesto] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const numeriche = useMemo(() => etichetteNumeriche(config.piante), [config.piante])

  function apri(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const cercata = testo.trim()
    if (!passata || cercata === '') return
    const pianta = trovaPianta(config.piante, cercata)
    if (pianta) {
      navigate(percorsoPianta(espId, pianta.id))
      return
    }
    setErrore(`Nessuna pianta con etichetta "${cercata}" in questo esperimento.`)
    // Il testo resta selezionato: la prossima cifra lo sostituisce.
    campo.current?.focus()
    campo.current?.select()
  }

  return (
    <form onSubmit={apri} noValidate className="flex flex-col gap-1.5">
      <Label htmlFor={idCampo}>N° pianta</Label>
      <Input
        ref={campo}
        id={idCampo}
        type="text"
        variant="campo"
        className="text-numero"
        inputMode={numeriche ? 'numeric' : 'text'}
        enterKeyHint="go"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={!passata}
        value={testo}
        aria-invalid={errore ? true : undefined}
        aria-describedby={errore || !passata ? idMessaggio : undefined}
        onChange={e => { setTesto(e.target.value); setErrore(null) }}
      />
      {errore ? (
        <TestoErrore id={idMessaggio} role="alert">{errore}</TestoErrore>
      ) : !passata ? (
        <p id={idMessaggio} className="text-sm text-grafite-tenue">Scegli una passata</p>
      ) : null}
      <BarraAzioni>
        <Button type="submit" size="lg" className="w-full" disabled={!passata || testo.trim() === ''}>Apri scheda pianta</Button>
      </BarraAzioni>
    </form>
  )
}

/** Larghezza minima di una cella: 44px, oppure quanto serve a un'etichetta lunga (es. "B3-12") per non essere tagliata. */
function larghezzaCella(etichette: string[]): number {
  const piuLunga = etichette.reduce((max, e) => Math.max(max, e.length), 0)
  return Math.max(44, 16 + 9 * piuLunga)
}

function descrizioneCella(etichetta: string, conteggio: number | undefined): string {
  if (conteggio === undefined) return `Pianta ${etichetta}`
  if (conteggio === 0) return `Pianta ${etichetta}, da misurare`
  return conteggio === 1 ? `Pianta ${etichetta}, misurata` : `Pianta ${etichetta}, misurata ${conteggio} volte`
}

/** Quali piante sono già state misurate con la passata scelta, alla data di rilievo. */
function GrigliaPiante({ espId, config, passata, dataRilievo }: { espId: string; config: ConfigEsperimento; passata: Passata; dataRilievo: string }) {
  const misure = useMisureGiorno(espId, dataRilievo)
  const piante = useMemo(() => [...config.piante].sort((a, b) => a.ordine - b.ordine), [config.piante])
  const conteggi = useMemo(() => (misure.data ? contaPerPianta(misure.data, passata.id) : null), [misure.data, passata.id])

  if (piante.length === 0) return <p className="text-grafite-tenue">Questo esperimento non ha piante.</p>

  const fatte = conteggi ? piante.filter(p => (conteggi.get(p.id) ?? 0) > 0).length : 0

  return (
    <section aria-label="Avanzamento della passata" className="flex flex-col gap-3">
      {conteggi ? (
        <p className="text-dato font-sans text-grafite tabular-nums">
          {`Fatte ${fatte}/${piante.length} · ${passata.nome} · ${formattaData(dataRilievo)}`}
        </p>
      ) : misure.isError ? (
        <ErroreConRiprova errore={misure.error} onRiprova={() => void misure.refetch()} />
      ) : (
        <p role="status" className="text-dato font-sans text-grafite-tenue">Caricamento…</p>
      )}
      <ul
        aria-label="Piante"
        style={{ '--cella-min': `${larghezzaCella(piante.map(p => p.etichetta))}px` } as CSSProperties}
        className="grid grid-cols-[repeat(auto-fill,minmax(var(--cella-min),1fr))] gap-1"
      >
        {piante.map(p => {
          const n = conteggi ? (conteggi.get(p.id) ?? 0) : undefined
          const fatta = n !== undefined && n > 0
          return (
            <li key={p.id}>
              <Link
                to={percorsoPianta(espId, p.id)}
                aria-label={descrizioneCella(p.etichetta, n)}
                className={cn(
                  'flex h-11 flex-col items-center justify-center gap-0.5 rounded-sm border font-mono text-dato leading-none tabular-nums transition-colors',
                  fatta
                    ? 'border-transparent bg-inchiostro-velato text-inchiostro active:bg-inchiostro-velato/60'
                    : 'border-riga bg-foglio text-grafite-tenue active:bg-carta-ombra',
                )}
              >
                {p.etichetta}
                {fatta && (
                  <span className="flex items-center gap-0.5 font-mono text-label leading-none">
                    <Check aria-hidden className="size-3" strokeWidth={3} />
                    {n > 1 && `×${n}`}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Il contenuto della schermata, a configurazione caricata. */
function CampoCaricato({ espId, config }: { espId: string; config: ConfigEsperimento }) {
  const oggi = useOggi()
  const { passataId, dataRilievo } = useCampoStore(s => s.dati(espId, oggi))
  const setPassata = useCampoStore(s => s.setPassata)
  const passate = useMemo(() => [...config.passate].sort((a, b) => a.ordine - b.ordine), [config.passate])
  // Una passata salvata e poi cancellata dalle impostazioni è come nessuna scelta.
  const passata = passate.find(p => p.id === passataId) ?? null

  return (
    <>
      <div className="flex flex-col gap-4">
        {passate.length > 0 ? (
          <SceltaPassata passate={passate} sceltaId={passata?.id ?? null} onScegli={id => setPassata(espId, id)} />
        ) : (
          <p className="text-grafite-tenue">Questo esperimento non ha passate: aggiungine una dalle impostazioni.</p>
        )}
        <DataRilievo espId={espId} />
        <BannerData espId={espId} />
      </div>

      <CampoPianta espId={espId} config={config} passata={passata} />

      {passata && <GrigliaPiante espId={espId} config={config} passata={passata} dataRilievo={dataRilievo} />}
    </>
  )
}

/** Schermata in campo di un esperimento: passata, data di rilievo, numero della pianta e avanzamento. */
export function Campo() {
  const { espId = '' } = useParams()
  const config = useConfig(espId)
  const dati = config.data

  return (
    <AppShell
      titolo={dati?.esperimento.nome ?? 'Esperimento'}
      indietro="/"
      azioni={
        <Link
          to={`/esperimenti/${encodeURIComponent(espId)}/impostazioni`}
          aria-label="Impostazioni"
          className={buttonVariants({ variant: 'quiet', size: 'icon' })}
        >
          <Settings aria-hidden className="size-6" />
        </Link>
      }
    >
      {dati === undefined ? (
        config.isError
          ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
          : <p role="status" className="text-grafite-tenue">Caricamento…</p>
      ) : (
        <CampoCaricato espId={espId} config={dati} />
      )}
    </AppShell>
  )
}
