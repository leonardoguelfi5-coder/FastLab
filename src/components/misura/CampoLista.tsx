import { useId } from 'react'
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

/**
 * Lista ripetuta (es. i palchi): una riga di quaderno per elemento, numerata "Palchi 1", "Palchi 2"…,
 * con un campo per sotto-campo. "+ Palchi" aggiunge in fondo, "Rimuovi ultimo" toglie l'ultimo.
 */
export function CampoLista({ parametro, valore, onChange, obbligatorio }: CampoListaProps) {
  const id = useId()

  function aggiungi() {
    const vuoti = Object.fromEntries(parametro.sotto_campi.map((c) => [c.chiave, null]))
    onChange([...valore, { n: valore.length + 1, valori: vuoti }])
  }

  function cambia(n: number, chiave: string, x: number | null) {
    onChange(valore.map((e) => (e.n === n ? { ...e, valori: { ...e.valori, [chiave]: x } } : e)))
  }

  return (
    <div
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
              <li key={e.n} className="border-t border-riga py-3.5">
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
        <Button type="button" variant="destructive" disabled={valore.length === 0} onClick={() => onChange(valore.slice(0, -1))}>
          Rimuovi ultimo
        </Button>
      </div>
    </div>
  )
}
