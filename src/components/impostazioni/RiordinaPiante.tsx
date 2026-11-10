import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { salvaOrdinePiante } from '@/api/configurazione'
import { BarraAzioni } from '@/components/BarraAzioni'
import { Button } from '@/components/ui/button'
import { ordinaPiante } from '@/domain/giro'
import { riordinaPiante } from '@/domain/piante'
import type { ConfigEsperimento, Pianta } from '@/domain/tipi'
import type { useAzione } from './azione'
import { useSegnalaModifiche } from './modifiche'
import { Spiegazione } from './Sezione'

interface RiordinaPianteProps {
  espId: string
  config: ConfigEsperimento
  azione: ReturnType<typeof useAzione>
  /** Chiude il riordino (dopo "Salva l'ordine" riuscito o "Annulla"). */
  onChiudi: () => void
}

type Direzione = 'su' | 'giu'

/**
 * Il riordino delle piante: l'ordine in cui si misurano di base (`ordine`), che decide la pianta dopo, la griglia e
 * "Vai alle mancanti". Una riga per pianta con "su" e "giù" da 44 px, oppure un ordinamento di colpo per etichetta o
 * per blocco; "Salva l'ordine" scrive solo l'`ordine` delle piante che sono cambiate. Il database non vincola l'ordine
 * (non è unico): con misure già fatte si può cambiare, il giro le segue.
 */
export function RiordinaPiante({ espId, config, azione, onChiudi }: RiordinaPianteProps) {
  const iniziale = useMemo(() => ordinaPiante(config.piante).map(p => p.id), [config.piante])
  const [ordine, setOrdine] = useState<string[]>(iniziale)
  const perId = useMemo(() => new Map(config.piante.map(p => [p.id, p])), [config.piante])
  const trattamenti = useMemo(() => new Map(config.trattamenti.map(t => [t.id, t.etichetta])), [config.trattamenti])
  const modificato = ordine.some((id, i) => id !== iniziale[i])
  useSegnalaModifiche('ordine-piante', modificato)

  // Dopo uno spostamento il fuoco resta sul pulsante della riga spostata: si può continuare a premere.
  const [daFocalizzare, setDaFocalizzare] = useState<{ id: string; direzione: Direzione } | null>(null)
  const lista = useRef<HTMLOListElement>(null)
  useEffect(() => {
    if (!daFocalizzare || !lista.current) return
    const riga = lista.current.querySelector<HTMLElement>(`[data-pianta="${daFocalizzare.id}"]`)
    const principale = riga?.querySelector<HTMLButtonElement>(`[data-direzione="${daFocalizzare.direzione}"]:not(:disabled)`)
    const altro = riga?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    ;(principale ?? altro)?.focus()
    setDaFocalizzare(null)
  }, [daFocalizzare])

  function sposta(i: number, direzione: Direzione) {
    const j = direzione === 'su' ? i - 1 : i + 1
    if (j < 0 || j >= ordine.length) return
    const nuovo = [...ordine]
    ;[nuovo[i], nuovo[j]] = [nuovo[j], nuovo[i]]
    setOrdine(nuovo)
    setDaFocalizzare({ id: ordine[i], direzione })
  }

  const ordinaPer = (criterio: 'etichetta' | 'blocco') => setOrdine(ordinaPiante(config.piante, { criterio, inverso: false }).map(p => p.id))

  async function salva() {
    const cambiate = riordinaPiante(config.piante, ordine)
    const riuscito = await azione.esegui(() => salvaOrdinePiante(espId, cambiate), {
      messaggio: 'Ordine delle piante salvato.',
      aggiorna: c => ({
        ...c,
        piante: c.piante.map((p): Pianta => cambiate.find(x => x.id === p.id) ?? p),
      }),
    })
    if (riuscito) onChiudi()
  }

  return (
    <div className="flex flex-col gap-4">
      <Spiegazione>
        L&apos;ordine in cui si misurano le piante, di base. Sposta una pianta su o giù, oppure ordina tutte per etichetta o per blocco.
      </Spiegazione>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => ordinaPer('etichetta')}>Ordina per etichetta</Button>
        <Button variant="outline" onClick={() => ordinaPer('blocco')}>Ordina per blocco</Button>
      </div>

      <ol ref={lista} aria-label="Ordine delle piante" className="-mx-4 flex flex-col border-t border-riga">
        {ordine.map((id, i) => {
          const p = perId.get(id)
          if (!p) return null
          return (
            <li key={id} data-pianta={id} className="flex min-h-11 items-center gap-2 border-b border-riga pr-2 pl-4">
              <span className="w-8 shrink-0 text-right font-mono text-dato text-grafite-tenue tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-dato text-grafite tabular-nums">
                {`#${p.etichetta}`}
                <span className="text-grafite-tenue">{` · ${trattamenti.get(p.trattamento_id) ?? ''}${p.blocco ? ` · ${p.blocco}` : ''}`}</span>
              </span>
              <Button
                variant="quiet" size="icon" data-direzione="su" disabled={i === 0 || azione.inCorso}
                aria-label={`Sposta su la pianta #${p.etichetta}`} onClick={() => sposta(i, 'su')}
              >
                <ChevronUp aria-hidden />
              </Button>
              <Button
                variant="quiet" size="icon" data-direzione="giu" disabled={i === ordine.length - 1 || azione.inCorso}
                aria-label={`Sposta giù la pianta #${p.etichetta}`} onClick={() => sposta(i, 'giu')}
              >
                <ChevronDown aria-hidden />
              </Button>
            </li>
          )
        })}
      </ol>

      <BarraAzioni>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="lg" className="grow" disabled={azione.inCorso} onClick={onChiudi}>Annulla</Button>
          <Button size="lg" className="grow-3 basis-52" disabled={!modificato || azione.inCorso} onClick={() => void salva()}>
            Salva l&apos;ordine
          </Button>
        </div>
      </BarraAzioni>
    </div>
  )
}
