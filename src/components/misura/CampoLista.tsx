import { useEffect, useId, useRef } from 'react'
import { toast } from 'sonner'
import type { ElementoLista, Parametro } from '@/domain/tipi'
import { Asterisco } from '@/components/Asterisco'
import { NumericField } from '@/components/NumericField'
import { Button } from '@/components/ui/button'

interface CampoListaProps {
  parametro: Parametro
  valore: ElementoLista[]
  onChange: (valore: ElementoLista[]) => void
  obbligatorio?: boolean
}

/** Un elemento "pieno" ha almeno un valore: togliendolo si perderebbe qualcosa (anche un testo non numerico, che è `NaN`). */
const haValori = (e: ElementoLista) => Object.values(e.valori).some((x) => x !== null && x !== undefined)

/**
 * Lista ripetuta (es. i palchi): una riga di quaderno per elemento, numerata "Palchi 1", "Palchi 2"…,
 * con un campo per sotto-campo. "+ Palchi" aggiunge in fondo e porta il cursore nel suo primo campo,
 * "Rimuovi ultimo" toglie l'ultimo (se aveva dei valori, un avviso con "Annulla" li restituisce).
 */
export function CampoLista({ parametro, valore, onChange, obbligatorio }: CampoListaProps) {
  const id = useId()
  const radice = useRef<HTMLDivElement>(null)
  const daFocalizzare = useRef<number | null>(null)
  // Il valore e il callback più recenti, per "Annulla", che può scattare dopo altre modifiche.
  const recenti = useRef({ valore, onChange })
  const avvisi = useRef<(string | number)[]>([])

  useEffect(() => {
    recenti.current = { valore, onChange }
    const n = daFocalizzare.current
    if (n === null) return
    const campo = radice.current?.querySelector<HTMLInputElement>(`[data-riga="${n}"] input`)
    if (!campo) return
    daFocalizzare.current = null
    campo.focus()
  })

  // Uscendo dalla pagina un "Annulla" non ha più dove ripristinare: l'avviso se ne va con la lista.
  useEffect(() => () => avvisi.current.forEach((a) => toast.dismiss(a)), [])

  function aggiungi() {
    const vuoti = Object.fromEntries(parametro.sotto_campi.map((c) => [c.chiave, null]))
    const n = valore.length + 1
    daFocalizzare.current = n
    onChange([...valore, { n, valori: vuoti }])
  }

  function rimuoviUltimo() {
    const rimosso = valore[valore.length - 1]
    if (!rimosso) return
    onChange(valore.slice(0, -1))
    if (!haValori(rimosso)) return
    // Si rimette in fondo alla lista com'è ora, con il numero che le spetta.
    const ripristina = () => {
      const { valore: attuale, onChange: scrivi } = recenti.current
      scrivi([...attuale, { n: attuale.length + 1, valori: { ...rimosso.valori } }])
    }
    avvisi.current.push(toast(`${parametro.nome} ${rimosso.n} rimosso.`, {
      duration: 6000,
      action: { label: 'Annulla', onClick: ripristina },
    }))
  }

  function cambia(n: number, chiave: string, x: number | null) {
    onChange(valore.map((e) => (e.n === n ? { ...e, valori: { ...e.valori, [chiave]: x } } : e)))
  }

  return (
    <div
      ref={radice}
      role="group"
      aria-labelledby={`${id}-nome`}
      aria-describedby={obbligatorio ? `${id}-obbligatorio` : undefined}
      className="flex flex-col"
    >
      <p id={`${id}-nome`} className="mb-2 flex items-center gap-2 text-label text-grafite-tenue select-none">
        {parametro.nome}
        {obbligatorio && <Asterisco />}
      </p>
      {obbligatorio && <span id={`${id}-obbligatorio`} className="sr-only">Obbligatorio</span>}
      {valore.length > 0 && (
        <ol>
          {valore.map((e) => {
            const idRiga = `${id}-${e.n}`
            return (
              <li key={e.n} data-riga={e.n} className="border-t border-riga py-3.5">
                <div role="group" aria-labelledby={idRiga} className="flex flex-col gap-3">
                  <p id={idRiga} className="text-base font-medium text-grafite tabular-nums">{`${parametro.nome} ${e.n}`}</p>
                  <div className={parametro.sotto_campi.length > 1 ? 'grid grid-cols-2 gap-3' : 'flex flex-col'}>
                    {parametro.sotto_campi.map((c) => (
                      <NumericField
                        key={c.chiave}
                        label={c.nome}
                        unita={c.unita}
                        value={e.valori[c.chiave] ?? null}
                        onChange={(x) => cambia(e.n, c.chiave, x)}
                      />
                    ))}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
      <div className="flex gap-3 border-t border-riga pt-3.5">
        <Button type="button" variant="outline" onClick={aggiungi} className="flex-1">{`+ ${parametro.nome}`}</Button>
        <Button type="button" variant="destructive" disabled={valore.length === 0} onClick={rimuoviUltimo}>
          Rimuovi ultimo
        </Button>
      </div>
    </div>
  )
}
