import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { NoteDellaData, ScalaGrafico, Serie } from '@/domain/dataset'
import {
  MASSIMA_DISTANZA_NOTA, dataPiuVicina, dateSelezionabili, impagina, letturaDelGiorno,
} from '@/domain/grafico'
import type { Nota } from '@/domain/tipi'
import { formattaData } from '@/lib/date'
import { Button } from '@/components/ui/button'
import { GraficoSvg } from './GraficoSvg'
import { Legenda } from './Legenda'

/** Larghezza di partenza, prima che il contenitore sia misurato (e dove non c'è impaginazione, come in jsdom). */
const LARGHEZZA_INIZIALE = 320
/** L'altezza del grafico sul telefono (px). */
const ALTEZZA = 260

interface GraficoInterattivoProps {
  serie: Serie[]
  note: NoteDellaData[]
  scala: ScalaGrafico
  unita?: string | null
  /** Il nome del parametro (`SPAD`): inizia l'etichetta del grafico per i lettori di schermo. */
  titolo: string
  altezza?: number
  /** Apre la nota nel Diario; senza, la nota si legge e basta. */
  onApriNota?: (nota: Nota) => void
}

/**
 * Il grafico dell'app: `GraficoSvg` alla larghezza del contenitore, con la legenda sotto e la riga "Lettura". Un tocco
 * o un trascinamento sceglie la data più vicina (linea verticale sottile) e sotto compaiono data, valore ± ES e n di
 * ogni serie; un tocco in alto vicino al segno di una nota la sceglie, e sotto compare il testo con "Apri nel Diario".
 * Con il grafico a fuoco le frecce sinistra e destra scorrono le date (anche quelle delle sole note), Home ed End vanno
 * alla prima e all'ultima, Esc toglie la scelta. `touch-action: pan-y` lascia scorrere la pagina in verticale; la
 * tabella "Mostra i valori" resta l'alternativa accessibile.
 */
export function GraficoInterattivo({ serie, note, scala, unita, titolo, altezza = ALTEZZA, onApriNota }: GraficoInterattivoProps) {
  const contenitore = useRef<HTMLDivElement>(null)
  const zona = useRef<HTMLDivElement>(null)
  const [larghezza, setLarghezza] = useState(LARGHEZZA_INIZIALE)
  const [scelta, setScelta] = useState<string | null>(null)

  useEffect(() => {
    const elemento = contenitore.current
    // ResizeObserver manca solo in ambienti senza impaginazione (jsdom): lì resta la larghezza di partenza.
    if (!elemento || typeof ResizeObserver === 'undefined') return
    const osservatore = new ResizeObserver(voci => {
      const w = Math.floor(voci[voci.length - 1]?.contentRect.width ?? 0)
      if (w > 0) setLarghezza(w)
    })
    osservatore.observe(elemento)
    return () => osservatore.disconnect()
  }, [])

  const imp = impagina(serie, note, { larghezza, altezza, scala, unita })
  const date = dateSelezionabili(imp)
  // Se i dati cambiano e la data scelta non c'è più, la lettura sparisce da sola.
  const attiva = scelta !== null && date.includes(scelta) ? scelta : null
  const lettura = attiva === null ? null : letturaDelGiorno(imp, attiva)

  if (imp.vuoto) {
    return <p className="py-8 text-center text-base text-grafite-tenue">Nessun dato da disegnare con questi filtri.</p>
  }

  /** La data sotto il dito: in alto vicino al segno di una nota vince la nota, altrimenti la data più vicina. */
  function sceglieDaPuntatore(e: PointerEvent<HTMLDivElement>) {
    const r = zona.current?.getBoundingClientRect()
    const fattore = r && r.width > 0 ? imp.larghezza / r.width : 1
    const px = (e.clientX - (r?.left ?? 0)) * fattore
    const py = (e.clientY - (r?.top ?? 0)) * fattore
    if (py <= imp.area.alto + 8) {
      const vicino = imp.segni
        .map(s => ({ s, distanza: Math.abs(s.x - px) }))
        .filter(x => x.distanza <= MASSIMA_DISTANZA_NOTA)
        .sort((a, b) => a.distanza - b.distanza)[0]
      if (vicino) { setScelta(vicino.s.data); return }
    }
    setScelta(dataPiuVicina(imp, px))
  }

  function suTasto(e: KeyboardEvent<HTMLDivElement>) {
    const i = attiva === null ? -1 : date.indexOf(attiva)
    let prossima: string | null | undefined
    switch (e.key) {
      case 'ArrowRight': prossima = i < 0 ? date[0] : date[Math.min(i + 1, date.length - 1)]; break
      case 'ArrowLeft': prossima = i < 0 ? date[date.length - 1] : date[Math.max(i - 1, 0)]; break
      case 'Home': prossima = date[0]; break
      case 'End': prossima = date[date.length - 1]; break
      case 'Escape': prossima = null; break
      default: return
    }
    e.preventDefault()
    setScelta(prossima ?? null)
  }

  return (
    <div ref={contenitore} className="flex w-full flex-col gap-3">
      <div
        ref={zona}
        role="group"
        tabIndex={0}
        aria-label={`${titolo}. Usa le frecce sinistra e destra per leggere i valori di ogni data.`}
        onPointerDown={sceglieDaPuntatore}
        onPointerMove={sceglieDaPuntatore}
        onKeyDown={suTasto}
        style={{ touchAction: 'pan-y' }}
        className="rounded-sm"
      >
        <GraficoSvg
          serie={serie} note={note} scala={scala} unita={unita} larghezza={larghezza} altezza={altezza}
          titolo={titolo} cursore={attiva}
        />
      </div>

      <Legenda voci={imp.legenda} />

      <div aria-live="polite" className="min-h-14">
        {lettura === null ? (
          <p className="text-base text-grafite-tenue">Tocca il grafico per leggere i valori.</p>
        ) : (
          <div data-testid="lettura" className="flex flex-col gap-2 font-mono text-dato tabular-nums text-grafite">
            <p className="font-medium">{formattaData(lettura.data)}</p>
            {lettura.voci.length > 0 ? (
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {lettura.voci.map(v => (
                  <li key={v.indice} className="flex items-center gap-1.5">
                    <svg aria-hidden width={12} height={12} viewBox="-6 -6 12 12" className="shrink-0">
                      <path d={v.stile.marcatore} fill={v.stile.colore} />
                    </svg>
                    <span>{`${v.etichetta} ${v.valore} (n ${v.n})`}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-sans text-base text-grafite-tenue">Nessuna misura in questa data.</p>
            )}
            {lettura.note.map(nota => (
              <div key={nota.id} className="flex flex-col items-start gap-1 border-t border-riga pt-2 font-sans text-base">
                <p className="whitespace-pre-line">{nota.testo}</p>
                {onApriNota && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => onApriNota(nota)}>Apri nel Diario</Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
