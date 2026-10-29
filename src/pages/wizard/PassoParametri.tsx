import { useState } from 'react'
import type { BozzaEsperimento, Parametro } from '@/domain/tipi'
import { nuovoParametro } from '@/domain/bozza'
import { EditorParametro } from '@/components/config/EditorParametro'
import { riassuntoParametro } from '@/components/config/riassunti'
import { Button } from '@/components/ui/button'
import { Espandibile } from '@/components/Espandibile'

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

  // Un parametro eliminato sparisce anche dalle passate che lo includevano.
  function elimina(id: string) {
    onChange({
      ...bozza,
      parametri: bozza.parametri.filter(p => p.id !== id).map((p, ordine) => ({ ...p, ordine })),
      passate: bozza.passate.map(pa => ({
        ...pa,
        parametri: pa.parametri.filter(pp => pp.parametro_id !== id).map((pp, ordine) => ({ ...pp, ordine })),
      })),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[65ch] text-grafite-tenue">
        I parametri sono le cose che misuri su ogni pianta, es. altezza, temperatura, note. Per ognuno scegli il tipo; nel
        passo successivo li raggruppi nelle passate. Tocca un parametro per modificarlo.
      </p>
      {bozza.parametri.length === 0 && <p className="text-sm text-grafite-tenue">Nessun parametro ancora.</p>}
      <ul aria-label="Parametri" className="-mx-4 flex flex-col border-t border-riga empty:hidden">
        {bozza.parametri.map(p => (
          <Espandibile
            key={p.id}
            titolo={p.nome.trim() || 'Senza nome'}
            riassunto={riassuntoParametro(p)}
            aperto={aperto === p.id}
            onCambia={() => setAperto(aperto === p.id ? null : p.id)}
          >
            <EditorParametro valore={p} onChange={cambia} />
            <Button variant="destructive" size="sm" onClick={() => elimina(p.id)} className="self-start">
              Elimina parametro
            </Button>
          </Espandibile>
        ))}
      </ul>
      <Button variant="outline" onClick={aggiungi}>+ Parametro</Button>
    </div>
  )
}
