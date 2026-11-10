import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Check } from 'lucide-react'
import { Espandibile } from '@/components/Espandibile'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { filtraPiante } from '@/domain/elencoPiante'
import type { ConfigEsperimento } from '@/domain/tipi'
import { cn } from '@/lib/utils'
import type { Collegamento, StatoNota } from './statoNota'

const NUMERI = 'font-mono tabular-nums'

const SCELTE: { valore: Collegamento; nome: string }[] = [
  { valore: 'esperimento', nome: 'Esperimento' },
  { valore: 'trattamenti', nome: 'Trattamenti' },
  { valore: 'piante', nome: 'Piante' },
]

const CASELLA = 'size-6 shrink-0 cursor-pointer accent-inchiostro'
const RIGA_CASELLA = 'flex min-h-11 w-full cursor-pointer items-center gap-3 px-4 py-2 transition-colors hover:bg-riga/40 active:bg-riga/60'

interface SceltaCollegamentoProps {
  config: ConfigEsperimento
  stato: StatoNota
  onCambia: (stato: StatoNota) => void
}

const conOSenza = (ids: string[], id: string): string[] => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])

/**
 * A cosa si collega una nota: a tutto l'esperimento, a uno o più trattamenti oppure a una o più piante. La scelta è
 * una sola (come per i chip degli strumenti: la selezionata è inchiostro pieno con il ✓). Le liste scelte restano
 * quando si cambia scelta, ma si salva solo quella attiva. Le etichette sono nel font dei dati.
 */
export function SceltaCollegamento({ config, stato, onCambia }: SceltaCollegamentoProps) {
  const id = useId()
  const gruppo = useRef<HTMLDivElement>(null)

  function frecce(evento: KeyboardEvent<HTMLDivElement>) {
    const passo = evento.key === 'ArrowRight' || evento.key === 'ArrowDown' ? 1 : evento.key === 'ArrowLeft' || evento.key === 'ArrowUp' ? -1 : 0
    if (passo === 0) return
    evento.preventDefault()
    const adesso = SCELTE.findIndex(s => s.valore === stato.collegamento)
    const prossima = SCELTE[(adesso + passo + SCELTE.length) % SCELTE.length]
    onCambia({ ...stato, collegamento: prossima.valore })
    // Il focus segue la scelta, come nei gruppi di scelte nativi.
    gruppo.current?.querySelector<HTMLElement>(`[data-valore="${prossima.valore}"]`)?.focus()
  }

  return (
    <div className="flex flex-col gap-3">
      <p id={`${id}-nome`} className="text-label text-grafite-tenue select-none">Collegata a</p>
      <div ref={gruppo} role="radiogroup" aria-labelledby={`${id}-nome`} className="flex flex-wrap gap-2" onKeyDown={frecce}>
        {SCELTE.map(s => {
          const attiva = stato.collegamento === s.valore
          return (
            <button
              key={s.valore}
              type="button"
              role="radio"
              data-valore={s.valore}
              aria-checked={attiva}
              // Come ogni gruppo di scelte singole: in tabulazione entra solo la scelta attiva, le frecce spostano.
              tabIndex={attiva ? 0 : -1}
              onClick={() => onCambia({ ...stato, collegamento: s.valore })}
              className={cn(
                'inline-flex h-11 items-center gap-1.5 rounded-lg border px-3.5 text-base font-medium transition-colors',
                attiva
                  ? 'border-inchiostro bg-inchiostro text-foglio active:bg-inchiostro-scuro'
                  : 'border-riga-controllo bg-foglio text-grafite hover:border-grafite-tenue active:bg-carta-ombra',
              )}
            >
              {attiva && <Check aria-hidden className="size-4" strokeWidth={2.5} />}
              {s.nome}
            </button>
          )
        })}
      </div>

      {stato.collegamento === 'trattamenti' && <Trattamenti config={config} stato={stato} onCambia={onCambia} />}
      {stato.collegamento === 'piante' && <Piante config={config} stato={stato} onCambia={onCambia} />}
    </div>
  )
}

function Trattamenti({ config, stato, onCambia }: SceltaCollegamentoProps) {
  const trattamenti = useMemo(() => [...config.trattamenti].sort((a, b) => a.ordine - b.ordine), [config.trattamenti])
  return (
    <ul aria-label="Trattamenti" className="-mx-4 flex flex-col border-t border-riga">
      {trattamenti.map(t => {
        const n = config.piante.filter(p => p.trattamento_id === t.id).length
        return (
          <li key={t.id} className="border-b border-riga">
            <label className={RIGA_CASELLA}>
              <input
                type="checkbox"
                checked={stato.trattamento_ids.includes(t.id)}
                onChange={() => onCambia({ ...stato, trattamento_ids: conOSenza(stato.trattamento_ids, t.id) })}
                className={CASELLA}
              />
              <span className={cn('min-w-0 flex-1 truncate text-dato text-grafite', NUMERI)}>{t.etichetta}</span>{' '}
              <span className="shrink-0 text-sm text-grafite-tenue">{n} {n === 1 ? 'pianta' : 'piante'}</span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}

function Piante({ config, stato, onCambia }: SceltaCollegamentoProps) {
  const idRicerca = useId()
  const [cercato, setCercato] = useState('')
  // Chi apre o chiude un blocco a mano vince sul resto; cambiando il testo cercato si riparte dal comportamento di base.
  const [aMano, setAMano] = useState<Map<string, boolean>>(new Map())

  const ordinate = useMemo(() => [...config.piante].sort((a, b) => a.ordine - b.ordine), [config.piante])
  const blocchi = useMemo(() => [...config.trattamenti].sort((a, b) => a.ordine - b.ordine).map(trattamento => {
    const tutte = ordinate.filter(p => p.trattamento_id === trattamento.id)
    return { trattamento, tutte, trovate: filtraPiante(tutte, cercato) }
  }), [config.trattamenti, ordinate, cercato])

  const inRicerca = cercato.trim() !== ''
  const visibili = inRicerca ? blocchi.filter(b => b.trovate.length > 0) : blocchi.filter(b => b.tutte.length > 0)
  const scelte = ordinate.filter(p => stato.pianta_ids.includes(p.id))

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-grafite-tenue">
        {scelte.length > 0
          ? <>Piante scelte: <span className={cn('text-dato text-grafite', NUMERI)}>{scelte.map(p => p.etichetta).join(', ')}</span></>
          : 'Nessuna pianta scelta.'}
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={idRicerca}>Cerca pianta</Label>
        <Input
          id={idRicerca}
          type="search"
          variant="campo"
          autoComplete="off"
          value={cercato}
          onChange={e => { setCercato(e.target.value); setAMano(new Map()) }}
        />
      </div>

      {visibili.length === 0 ? (
        <p role="status" className="text-grafite-tenue">Nessuna pianta trovata.</p>
      ) : (
        <ul aria-label="Piante per trattamento" className="-mx-4 flex flex-col border-t border-riga">
          {visibili.map(({ trattamento, tutte, trovate }) => {
            const aperto = aMano.get(trattamento.id) ?? inRicerca
            const dentro = tutte.filter(p => stato.pianta_ids.includes(p.id)).length
            return (
              <Espandibile
                key={trattamento.id}
                titolo={<span className={NUMERI}>{trattamento.etichetta}</span>}
                riassunto={<span className={NUMERI}>{dentro} di {tutte.length} scelte</span>}
                aperto={aperto}
                onCambia={() => setAMano(prima => new Map(prima).set(trattamento.id, !aperto))}
              >
                <ul aria-label={`Piante di ${trattamento.etichetta}`} className="-mx-4 flex flex-col border-t border-riga">
                  {trovate.map(p => (
                    <li key={p.id} className="border-b border-riga">
                      <label className={RIGA_CASELLA}>
                        <input
                          type="checkbox"
                          checked={stato.pianta_ids.includes(p.id)}
                          onChange={() => onCambia({ ...stato, pianta_ids: conOSenza(stato.pianta_ids, p.id) })}
                          className={CASELLA}
                        />
                        <span className={cn('text-dato text-grafite', NUMERI)}>{p.etichetta}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </Espandibile>
            )
          })}
        </ul>
      )}
    </div>
  )
}
