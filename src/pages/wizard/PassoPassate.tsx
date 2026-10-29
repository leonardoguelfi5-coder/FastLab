import { useState } from 'react'
import type { BozzaEsperimento, Passata } from '@/domain/tipi'
import { nuovaPassata, problemiPassata } from '@/domain/bozza'
import { EditorPassata } from '@/components/config/EditorPassata'
import { Button } from '@/components/ui/button'
import { Espandibile } from '@/components/Espandibile'
import { TestoErrore } from '@/components/TestoErrore'

interface PassoPassateProps {
  bozza: BozzaEsperimento
  onChange: (b: BozzaEsperimento) => void
}

function riassunto(p: Passata): string {
  const n = p.parametri.length
  return n === 0 ? 'Nessun parametro' : n === 1 ? '1 parametro' : `${n} parametri`
}

/** Passo 4: le passate, cioè i gruppi di parametri che si rilevano insieme in campo. Si modifica una passata alla volta. */
export function PassoPassate({ bozza, onChange }: PassoPassateProps) {
  const [aperta, setAperta] = useState<string | null>(null)
  const cambia = (p: Passata) => onChange({ ...bozza, passate: bozza.passate.map(x => (x.id === p.id ? p : x)) })
  const elimina = (id: string) =>
    onChange({ ...bozza, passate: bozza.passate.filter(p => p.id !== id).map((p, ordine) => ({ ...p, ordine })) })

  function aggiungi() {
    const p = nuovaPassata(bozza.passate.length)
    onChange({ ...bozza, passate: [...bozza.passate, p] })
    setAperta(p.id)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[65ch] text-grafite-tenue">
        Una passata è un giro di misure in campo: raggruppa i parametri che rilevi insieme, es. 🌡 Termometro con
        temperatura dell'aria e della pianta. Un parametro può stare in più passate. Tocca una passata per modificarla.
      </p>
      {bozza.passate.length === 0 && <p className="text-sm text-grafite-tenue">Nessuna passata ancora.</p>}
      <ul aria-label="Passate" className="-mx-4 flex flex-col border-t border-riga empty:hidden">
        {bozza.passate.map(p => {
          // Gli stessi controlli del riepilogo, qui dove si correggono (nome doppio compreso).
          const problemi = problemiPassata(p, bozza.passate)
          return (
            <Espandibile
              key={p.id}
              titolo={[p.icona, p.nome.trim() || 'Senza nome'].filter(Boolean).join(' ')}
              riassunto={riassunto(p)}
              nota={problemi.length > 0 ? 'Da completare' : undefined}
              aperto={aperta === p.id}
              onCambia={() => setAperta(aperta === p.id ? null : p.id)}
            >
              <EditorPassata valore={p} parametri={bozza.parametri} onChange={cambia} />
              {problemi.length > 0 && (
                <div className="flex flex-col gap-1">{problemi.map(e => <TestoErrore key={e}>{e}</TestoErrore>)}</div>
              )}
              <Button variant="destructive" size="sm" onClick={() => elimina(p.id)} className="self-start">
                Elimina passata
              </Button>
            </Espandibile>
          )
        })}
      </ul>
      <Button variant="outline" onClick={aggiungi}>+ Passata</Button>
    </div>
  )
}
