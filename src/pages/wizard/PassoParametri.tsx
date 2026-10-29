import { useState } from 'react'
import type { BozzaEsperimento, Parametro } from '@/domain/tipi'
import { nuovoParametro, problemiParametro } from '@/domain/bozza'
import { EditorParametro } from '@/components/config/EditorParametro'
import { riassuntoParametro } from '@/components/config/riassunti'
import { Button } from '@/components/ui/button'
import { Espandibile } from '@/components/Espandibile'
import { TestoErrore } from '@/components/TestoErrore'

interface PassoParametriProps {
  bozza: BozzaEsperimento
  onChange: (b: BozzaEsperimento) => void
}

/** Passo 3: i parametri che si misurano su ogni pianta. Si modifica un parametro alla volta. */
export function PassoParametri({ bozza, onChange }: PassoParametriProps) {
  const [aperto, setAperto] = useState<string | null>(null)
  const cambia = (p: Parametro) => onChange({ ...bozza, parametri: bozza.parametri.map(x => (x.id === p.id ? p : x)) })

  function aggiungi() {
    const p = nuovoParametro(bozza.parametri.length)
    onChange({ ...bozza, parametri: [...bozza.parametri, p] })
    setAperto(p.id)
  }

  // Un parametro eliminato sparisce anche dagli strumenti che lo includevano.
  function elimina(id: string) {
    onChange({
      ...bozza,
      parametri: bozza.parametri.filter(p => p.id !== id).map((p, ordine) => ({ ...p, ordine })),
      strumenti: bozza.strumenti.map(pa => ({
        ...pa,
        parametri: pa.parametri.filter(pp => pp.parametro_id !== id).map((pp, ordine) => ({ ...pp, ordine })),
      })),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[65ch] text-grafite-tenue">
        I parametri sono le cose che misuri su ogni pianta, es. altezza, temperatura, note. Per ognuno scegli il tipo; nel
        passo successivo li raggruppi negli strumenti. Tocca un parametro per modificarlo.
      </p>
      {bozza.parametri.length === 0 && <p className="text-sm text-grafite-tenue">Nessun parametro ancora.</p>}
      <ul aria-label="Parametri" className="-mx-4 flex flex-col border-t border-riga empty:hidden">
        {bozza.parametri.map(p => {
          // Gli stessi controlli del riepilogo, qui dove si correggono (nome doppio compreso).
          const problemi = problemiParametro(p, bozza.parametri)
          return (
            <Espandibile
              key={p.id}
              titolo={p.nome.trim() || 'Senza nome'}
              riassunto={riassuntoParametro(p)}
              nota={problemi.length > 0 ? 'Da completare' : undefined}
              aperto={aperto === p.id}
              onCambia={() => setAperto(aperto === p.id ? null : p.id)}
            >
              <EditorParametro valore={p} onChange={cambia} />
              {problemi.length > 0 && (
                <div className="flex flex-col gap-1">{problemi.map(e => <TestoErrore key={e}>{e}</TestoErrore>)}</div>
              )}
              <Button variant="destructive" size="sm" onClick={() => elimina(p.id)} className="self-start">
                Elimina parametro
              </Button>
            </Espandibile>
          )
        })}
      </ul>
      <Button variant="outline" onClick={aggiungi}>+ Parametro</Button>
    </div>
  )
}
