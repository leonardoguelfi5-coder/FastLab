import { useState } from 'react'
import type { BozzaEsperimento } from '@/domain/tipi'
import {
  conStrumento, nuovaTabellaFenologica, ordineStrumentoSuccessivo, parametriDello, problemiStrumento, senzaStrumento,
} from '@/domain/bozza'
import { EditorStrumento, type StrumentoConValori } from '@/components/config/EditorStrumento'
import { Button } from '@/components/ui/button'
import { Conferma } from '@/components/Conferma'
import { TestoErrore } from '@/components/TestoErrore'

interface PassoFenologicaProps {
  bozza: BozzaEsperimento
  onChange: (b: BozzaEsperimento) => void
  /** "Questo esperimento non ha rilievi fenologici": si prosegue senza tabella. */
  onSalta: () => void
}

const SENZA_RILIEVI = 'Questo esperimento non ha rilievi fenologici'

/**
 * Passo 4: la tabella fenologica, una sola per esperimento, con le voci che ognuno si costruisce (numeri, testo,
 * sì/no, liste ripetute, anche progressive). È facoltativa: senza rilievi fenologici si va avanti senza, e una tabella
 * creata e rimasta vuota si toglie.
 */
export function PassoFenologica({ bozza, onChange, onSalta }: PassoFenologicaProps) {
  const [conferma, setConferma] = useState(false)
  const tabella = bozza.strumenti.find(s => s.tipo === 'fenologico' && !s.archiviato)
  const valori = tabella ? parametriDello(tabella, bozza.parametri) : []

  const crea = () => onChange(conStrumento(bozza, nuovaTabellaFenologica(ordineStrumentoSuccessivo(bozza)), []))
  const cambia = (v: StrumentoConValori) => onChange(conStrumento(bozza, v.strumento, v.parametri))

  function senzaRilievi() {
    if (tabella) onChange(senzaStrumento(bozza, tabella.id))
    onSalta()
  }

  if (!tabella) {
    return (
      <div className="flex flex-col gap-4">
        <p className="max-w-[65ch] text-grafite-tenue">
          La tabella fenologica raccoglie i rilievi sullo sviluppo della pianta (fiori, frutti, palchi, note). Ce n'è una
          sola per esperimento e te la costruisci tu, con le voci che ti servono.
        </p>
        <div className="flex flex-col items-start gap-2">
          <Button variant="outline" onClick={crea}>Crea la tabella fenologica</Button>
          <Button variant="ghost" onClick={senzaRilievi} className="-ml-3">{SENZA_RILIEVI}</Button>
        </div>
      </div>
    )
  }

  const problemi = problemiStrumento(tabella, bozza.strumenti)
  const suoi = new Set(valori.map(p => p.id))
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[65ch] text-grafite-tenue">
        Le voci della tabella fenologica: per ognuna scegli il tipo. Le conte che crescono nel tempo (es. il numero di
        palchi) si possono rendere progressive.
      </p>
      <EditorStrumento
        valore={{ strumento: tabella, parametri: valori }}
        onChange={cambia}
        tipoFenologico
        altriParametri={bozza.parametri.filter(p => !suoi.has(p.id))}
      />
      {problemi.length > 0 && (
        <div className="flex flex-col gap-1">{problemi.map(e => <TestoErrore key={e}>{e}</TestoErrore>)}</div>
      )}
      {valori.length === 0 ? (
        <Button variant="ghost" onClick={senzaRilievi} className="-ml-3 self-start">{SENZA_RILIEVI}</Button>
      ) : (
        <Button variant="destructive" size="sm" onClick={() => setConferma(true)} className="self-start">
          Elimina la tabella fenologica
        </Button>
      )}

      <Conferma
        aperta={conferma}
        titolo="Eliminare la tabella fenologica?"
        testo="Le voci che hai preparato andranno perse."
        annulla="Annulla"
        conferma="Elimina"
        onAnnulla={() => setConferma(false)}
        onConferma={() => { setConferma(false); onChange(senzaStrumento(bozza, tabella.id)) }}
      />
    </div>
  )
}
