import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { BozzaEsperimento } from '@/domain/tipi'
import { bozzaVuota, clonaConfig } from '@/domain/bozza'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { useConfig } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import { messaggioErrore } from '@/lib/errori'
import { cn } from '@/lib/utils'
import { PassoGenerale } from './wizard/PassoGenerale'
import { PassoParametri } from './wizard/PassoParametri'
import { PassoPassate } from './wizard/PassoPassate'
import { PassoPiante } from './wizard/PassoPiante'
import { PassoRiepilogo } from './wizard/PassoRiepilogo'
import { motivoBlocco, righeDaBozza } from './wizard/righeTrattamenti'

const PASSI = ['Generale', 'Fattori e piante', 'Parametri', 'Passate', 'Riepilogo'] as const
const ULTIMO = PASSI.length - 1

const SCELTA = 'h-auto w-full flex-col items-start gap-1 whitespace-normal p-4 text-left'

function SceltaIniziale({ onModello, onDaZero }: { onModello: () => void; onDaZero: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-2xl font-bold">Come vuoi iniziare?</h2>
      <Button variant="outline" onClick={onModello} className={SCELTA}>
        <span className="text-lg font-semibold">Parti dal modello Hydrochar</span>
        <span className="text-sm font-normal text-muted-foreground">
          Fattori Stress × Hydrochar, 8 trattamenti, 56 piante, parametri e passate già pronti: li modifichi come vuoi.
        </span>
      </Button>
      <Button variant="outline" onClick={onDaZero} className={SCELTA}>
        <span className="text-lg font-semibold">Parti da zero</span>
        <span className="text-sm font-normal text-muted-foreground">Definisci tu fattori, piante, parametri e passate.</span>
      </Button>
      <p className="text-sm text-muted-foreground">Per ripartire da un tuo esperimento usa «Duplica» nell'elenco degli esperimenti.</p>
    </div>
  )
}

/**
 * La procedura guidata: tiene la bozza (e la tabella dei trattamenti) finché non si crea l'esperimento.
 * `crea` dà la bozza di partenza, oppure null per chiedere prima da dove partire.
 */
function Procedura({ crea }: { crea: () => BozzaEsperimento | null }) {
  const [partenza] = useState(crea)
  const [bozza, setBozza] = useState(() => partenza ?? bozzaVuota())
  const [righe, setRighe] = useState(() => (partenza ? righeDaBozza(partenza) : []))
  const [scelta, setScelta] = useState(partenza === null)
  const [passo, setPasso] = useState(0)

  // A ogni cambio di passo il focus va sul titolo: chi usa un lettore di schermo sa dov'è, e la pagina riparte dall'alto.
  const titolo = useRef<HTMLHeadingElement>(null)
  const vista = scelta ? -1 : passo
  const vistaPrecedente = useRef(vista)
  useEffect(() => {
    if (vistaPrecedente.current === vista) return
    vistaPrecedente.current = vista
    titolo.current?.focus()
  }, [vista])

  function parti(b: BozzaEsperimento) {
    setBozza(b)
    setRighe(righeDaBozza(b))
    setScelta(false)
  }

  if (scelta) return <SceltaIniziale onModello={() => parti(bozzaHydrochar())} onDaZero={() => setScelta(false)} />

  const blocco = passo === 1 ? motivoBlocco(bozza, righe) : null

  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{`Passo ${passo + 1} di ${PASSI.length}`}</p>
        <div aria-hidden className="flex gap-1">
          {PASSI.map((nome, i) => (
            <span key={nome} className={cn('h-1.5 flex-1 rounded-full', i <= passo ? 'bg-primary' : 'bg-muted')} />
          ))}
        </div>
        <h2 ref={titolo} tabIndex={-1} className="text-2xl font-bold outline-none">{PASSI[passo]}</h2>
      </div>

      {passo === 0 && <PassoGenerale bozza={bozza} onChange={setBozza} />}
      {passo === 1 && <PassoPiante bozza={bozza} righe={righe} onChange={(b, r) => { setBozza(b); setRighe(r) }} />}
      {passo === 2 && <PassoParametri bozza={bozza} onChange={setBozza} />}
      {passo === 3 && <PassoPassate bozza={bozza} onChange={setBozza} />}
      {passo === ULTIMO && <PassoRiepilogo bozza={bozza} />}

      <div className="sticky bottom-0 z-10 -mx-4 mt-2 flex flex-col gap-2 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {blocco && <p id="motivo-blocco" className="text-sm text-destructive">{blocco}</p>}
        <div className="flex gap-2">
          {passo > 0 && (
            <Button variant="outline" onClick={() => setPasso(passo - 1)} className="h-12 flex-1 text-base">Indietro</Button>
          )}
          {passo < ULTIMO && (
            <Button
              disabled={blocco !== null}
              aria-describedby={blocco ? 'motivo-blocco' : undefined}
              onClick={() => setPasso(passo + 1)}
              className="h-12 flex-1 text-base"
            >
              Avanti
            </Button>
          )}
        </div>
      </div>
    </>
  )
}

function ErroreConRiprova({ errore, onRiprova }: { errore: unknown; onRiprova: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2">
      <p className="text-sm text-destructive">{messaggioErrore(errore)}</p>
      <Button variant="outline" onClick={onRiprova} className="h-11">Riprova</Button>
    </div>
  )
}

/** Duplicazione: la procedura parte da una copia della configurazione (non dei dati) di un esperimento. */
function Duplica({ espId }: { espId: string }) {
  const config = useConfig(espId)
  const copia = useMemo(() => {
    if (!config.data) return null
    try {
      return { bozza: clonaConfig(config.data), errore: null }
    } catch (e) {
      return { bozza: null, errore: e }
    }
  }, [config.data])

  if (copia?.bozza) {
    const bozza = copia.bozza
    return <Procedura crea={() => bozza} />
  }
  if (copia?.errore || config.isError) {
    return <ErroreConRiprova errore={copia?.errore ?? config.error} onRiprova={() => void config.refetch()} />
  }
  return <p role="status" className="text-muted-foreground">Caricamento…</p>
}

/** Nuovo esperimento: da zero o dal modello (`?modello=hydrochar`), oppure copia di un altro (`?da=<id>`). */
export function NuovoEsperimento() {
  const [ricerca] = useSearchParams()
  const da = ricerca.get('da')
  const modello = ricerca.get('modello')

  return (
    <AppShell titolo="Nuovo esperimento" indietro="/">
      {da
        ? <Duplica key={da} espId={da} />
        : <Procedura key={modello ?? ''} crea={() => (modello === 'hydrochar' ? bozzaHydrochar() : null)} />}
    </AppShell>
  )
}
