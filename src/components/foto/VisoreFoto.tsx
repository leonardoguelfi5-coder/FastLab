import { useEffect, useId, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { aggiornaFoto } from '@/api/foto'
import { chiavi } from '@/api/query'
import { TestoErrore } from '@/components/TestoErrore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { descriviFoto } from '@/domain/foto'
import type { ConfigEsperimento, Foto } from '@/domain/tipi'
import { formattaData } from '@/lib/date'
import { messaggioErrore } from '@/lib/errori'

/** Quanto deve scorrere il dito (in pixel) perché sia una strisciata e non un tocco, e quanto più in orizzontale che in verticale. */
const STRISCIATA_MIN = 50
const STRISCIATA_RAPPORTO = 1.5

const SELEZIONE = 'h-13 w-full min-w-0 rounded-md border border-riga-controllo bg-foglio px-3.5 font-mono text-campo tabular-nums text-grafite outline-none transition-colors hover:border-grafite-tenue focus:border-inchiostro focus:ring-3 focus:ring-inchiostro-velato disabled:cursor-not-allowed disabled:border-riga disabled:bg-carta-ombra disabled:text-grafite-tenue'

const FOCALIZZABILI = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

interface VisoreFotoProps {
  espId: string
  config: ConfigEsperimento
  /** La foto aperta e il suo posto nella fila su cui si scorre (già senza quelle in eliminazione). */
  foto: Foto
  posizione: number
  totale: number
  /** L'URL firmato del file: undefined se non c'è ancora (si sta leggendo) o se la foto è archiviata. */
  url: string | undefined
  /** Gli URL sono stati letti: un percorso che manca dalla mappa è un file non disponibile. */
  urlLetti: boolean
  onPrecedente: (() => void) | null
  onSuccessiva: (() => void) | null
  onChiudi: () => void
  onElimina: () => void
}

/**
 * La foto a schermo intero (spec §5.8): data e collegamento a una pianta modificabili, elimina (con Annulla, lo fa chi
 * lo usa) e scorrimento con le frecce, i pulsanti o una strisciata. È una finestra (`role="dialog"`, `aria-modal`) con il
 * fuoco che non esce, Esc che chiude e il fuoco che torna a chi l'ha aperta. Non usa il dialogo di base-ui di proposito:
 * un dialogo modale blocca il tocco su tutto ciò che sta fuori, e il toast con «Annulla» dell'eliminazione deve restare
 * toccabile con il visore aperto.
 */
export function VisoreFoto({ espId, config, foto, posizione, totale, url, urlLetti, onPrecedente, onSuccessiva, onChiudi, onElimina }: VisoreFotoProps) {
  const radice = useRef<HTMLDivElement>(null)
  const inizioDito = useRef<{ x: number; y: number } | null>(null)
  const idTitolo = useId()

  // All'apertura il fuoco entra nella finestra; alla chiusura torna dov'era (la miniatura), se c'è ancora. La pagina sotto
  // non scorre.
  useEffect(() => {
    const prima = document.activeElement instanceof HTMLElement ? document.activeElement : null
    radice.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
      if (prima?.isConnected) prima.focus()
    }
  }, [])

  // Scorrendo, il pulsante che si era toccato può diventare disabilitato (la prima o l'ultima foto) e il fuoco andrebbe
  // perso: le frecce della tastiera smetterebbero di funzionare. Il fuoco torna alla finestra.
  useEffect(() => {
    const attivo = document.activeElement
    if (!radice.current?.contains(attivo) || (attivo instanceof HTMLButtonElement && attivo.disabled)) radice.current?.focus()
  }, [posizione])

  function tasto(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === 'Escape') {
      evento.preventDefault()
      evento.stopPropagation()
      onChiudi()
      return
    }
    if (evento.key === 'Tab') {
      // Il fuoco resta nella finestra: dall'ultimo elemento si riparte dal primo, e viceversa.
      const elementi = Array.from(radice.current?.querySelectorAll<HTMLElement>(FOCALIZZABILI) ?? [])
      if (elementi.length === 0) return
      const primo = elementi[0]
      const ultimo = elementi[elementi.length - 1]
      const attivo = document.activeElement
      if (evento.shiftKey && (attivo === primo || attivo === radice.current)) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && attivo === ultimo) {
        evento.preventDefault()
        primo.focus()
      }
      return
    }
    if (evento.key !== 'ArrowLeft' && evento.key !== 'ArrowRight') return
    // Dentro un campo le frecce spostano il cursore o la scelta, non la foto.
    const bersaglio = evento.target as HTMLElement
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(bersaglio.tagName)) return
    evento.preventDefault()
    if (evento.key === 'ArrowLeft') onPrecedente?.()
    else onSuccessiva?.()
  }

  function dito(evento: TouchEvent<HTMLDivElement>) {
    const t = evento.touches[0]
    inizioDito.current = t ? { x: t.clientX, y: t.clientY } : null
  }
  function ditoSollevato(evento: TouchEvent<HTMLDivElement>) {
    const inizio = inizioDito.current
    const fine = evento.changedTouches[0]
    inizioDito.current = null
    if (!inizio || !fine) return
    const dx = fine.clientX - inizio.x
    const dy = fine.clientY - inizio.y
    if (Math.abs(dx) < STRISCIATA_MIN || Math.abs(dx) < Math.abs(dy) * STRISCIATA_RAPPORTO) return
    if (dx < 0) onSuccessiva?.()
    else onPrecedente?.()
  }

  const descrizione = descriviFoto(foto, config.piante)
  return (
    <div
      ref={radice}
      role="dialog"
      aria-modal="true"
      aria-label={`Foto ${posizione} di ${totale}`}
      tabIndex={-1}
      onKeyDown={tasto}
      className="fixed inset-0 z-40 flex flex-col bg-carta outline-none"
    >
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-riga pt-[env(safe-area-inset-top)] pr-2 pl-4">
        <h2 id={idTitolo} className="min-w-0 flex-1 truncate font-mono text-dato font-medium tabular-nums text-grafite">
          {formattaData(foto.data)}
        </h2>
        <p className="shrink-0 font-mono text-dato tabular-nums text-grafite-tenue">{`${posizione} / ${totale}`}</p>
        <Button type="button" variant="quiet" size="icon" aria-label="Chiudi" onClick={onChiudi}>
          <X className="size-6" />
        </Button>
      </div>

      <div
        data-testid="area-foto"
        onTouchStart={dito}
        onTouchEnd={ditoSollevato}
        className="relative flex min-h-0 flex-1 items-center justify-center bg-carta-ombra"
      >
        <Immagine key={foto.id} foto={foto} url={url} urlLetti={urlLetti} descrizione={descrizione} />
        <Button
          type="button" variant="outline" size="icon" aria-label="Foto precedente"
          disabled={onPrecedente === null} onClick={() => onPrecedente?.()}
          className="absolute top-1/2 left-2 -translate-y-1/2"
        >
          <ChevronLeft className="size-6" />
        </Button>
        <Button
          type="button" variant="outline" size="icon" aria-label="Foto successiva"
          disabled={onSuccessiva === null} onClick={() => onSuccessiva?.()}
          className="absolute top-1/2 right-2 -translate-y-1/2"
        >
          <ChevronRight className="size-6" />
        </Button>
      </div>

      <PannelloFoto key={foto.id} espId={espId} config={config} foto={foto} onElimina={onElimina} />
    </div>
  )
}

/** L'immagine, o il perché non c'è: archiviata, ancora in lettura, o non disponibile (URL scaduto, file tolto). */
function Immagine({ foto, url, urlLetti, descrizione }: { foto: Foto; url: string | undefined; urlLetti: boolean; descrizione: string }) {
  const [rotta, setRotta] = useState(false)
  if (foto.archiviata) return <p className="px-6 text-center text-grafite-tenue">Archiviata nel .zip</p>
  if (url && !rotta) {
    return <img src={url} alt={descrizione} draggable={false} onError={() => setRotta(true)} className="max-h-full max-w-full object-contain" />
  }
  if (!urlLetti && !rotta) return <p role="status" className="text-grafite-tenue">Caricamento…</p>
  return <p className="px-6 text-center text-grafite-tenue">Foto non disponibile.</p>
}

/** Data, pianta ed «Elimina foto». Si ricrea a ogni foto (`key`), così la data scritta a metà non passa a un'altra. */
function PannelloFoto({ espId, config, foto, onElimina }: { espId: string; config: ConfigEsperimento; foto: Foto; onElimina: () => void }) {
  const queryClient = useQueryClient()
  const id = useId()
  const [data, setData] = useState(foto.data)
  const [pianta, setPianta] = useState(foto.pianta_id ?? '')
  const [occupato, setOccupato] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  /** Scrive il cambio e rilegge le foto; con un errore il messaggio resta e `ripristina` rimette il campo com'era, se serve. */
  async function salva(patch: Parameters<typeof aggiornaFoto>[2], ripristina: () => void) {
    setOccupato(true)
    setErrore(null)
    try {
      await aggiornaFoto(espId, foto.id, patch)
      // Il prefisso `foto` rilegge anche lo spazio; si aspetta la rilettura per mostrare il dato salvato.
      await queryClient.invalidateQueries({ queryKey: chiavi.foto(espId) })
    } catch (e) {
      ripristina()
      setErrore(messaggioErrore(e))
    } finally {
      setOccupato(false)
    }
  }

  const piante = [...config.piante].sort((a, b) => a.ordine - b.ordine)
  const trattamenti = new Map(config.trattamenti.map(t => [t.id, t.etichetta]))
  const dataCambiata = data !== foto.data

  return (
    <div className="flex max-h-[50dvh] shrink-0 flex-col gap-4 overflow-y-auto border-t border-riga bg-carta px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-data`}>Data</Label>
        <div className="flex gap-2">
          <Input
            id={`${id}-data`} type="date" variant="campo" className="min-w-0 flex-1"
            disabled={occupato} value={data} onChange={e => setData(e.target.value)}
          />
          {dataCambiata && (
            <Button
              type="button" size="lg" disabled={occupato || data === ''}
              // Con un errore la data scritta resta nel campo: basta ritoccare «Salva data».
              onClick={() => void salva({ data }, () => {})}
            >
              Salva data
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-pianta`}>Pianta</Label>
        <select
          id={`${id}-pianta`} className={SELEZIONE} disabled={occupato} value={pianta}
          onChange={e => {
            const prima = pianta
            setPianta(e.target.value)
            void salva({ pianta_id: e.target.value === '' ? null : e.target.value }, () => setPianta(prima))
          }}
        >
          <option value="">Nessuna pianta</option>
          {piante.map(p => (
            <option key={p.id} value={p.id}>{`${p.etichetta} · ${trattamenti.get(p.trattamento_id) ?? ''}`}</option>
          ))}
        </select>
        {foto.nota_id !== null && <p className="text-sm text-grafite-tenue">Allegata a una nota del Diario.</p>}
      </div>

      {errore && <TestoErrore role="alert">{errore}</TestoErrore>}

      <Button type="button" variant="destructive" onClick={onElimina}>Elimina foto</Button>
    </div>
  )
}
