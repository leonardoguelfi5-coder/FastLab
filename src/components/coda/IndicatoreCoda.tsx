import { useState } from 'react'
import { CloudAlert, CloudUpload } from 'lucide-react'
import { useVociCoda } from '@/lib/coda/useCoda'
import { PannelloCoda } from './PannelloCoda'

const misure = (n: number) => (n === 1 ? 'misura' : 'misure')
const nonInviate = (n: number) => `${n} ${n === 1 ? 'non inviata' : 'non inviate'}`

/**
 * Nella barra in alto, a destra del titolo: quante misure salvate su questo telefono non sono ancora arrivate al server
 * ("3 misure da inviare", in grafite: mai verde, non sono salvate sul server). Se il server ne ha rifiutata qualcuna lo
 * dice prima, in tono errore ("1 non inviata"). Il tocco apre il pannello della coda. Senza voci non c'è.
 * Su un telefono stretto si vede "3 da inviare", per lasciare spazio al titolo; il nome intero resta nell'etichetta.
 */
export function IndicatoreCoda() {
  const voci = useVociCoda()
  const [aperto, setAperto] = useState(false)
  const rifiutate = voci.filter(v => v.stato === 'rifiutata').length
  const daInviare = voci.length - rifiutate
  if (voci.length === 0 && !aperto) return null
  const testoDaInviare = `${daInviare} ${misure(daInviare)} da inviare`
  const nome = [rifiutate > 0 ? nonInviate(rifiutate) : null, daInviare > 0 ? testoDaInviare : null].filter(Boolean).join(' · ')

  return (
    <>
      {voci.length > 0 && (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={nome}
          onClick={() => setAperto(true)}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-grafite transition-colors hover:bg-carta-ombra active:bg-riga/70"
        >
          {rifiutate > 0
            ? <CloudAlert aria-hidden className="size-5 shrink-0 text-errore" />
            : <CloudUpload aria-hidden className="size-5 shrink-0 text-grafite-tenue" />}
          {/* Il nome intero è nell'etichetta; qui il testo che si vede, più corto su un telefono stretto. */}
          {rifiutate > 0 ? (
            <span className="text-errore">{nonInviate(rifiutate)}</span>
          ) : (
            <span>
              <span className="font-mono tabular-nums">{daInviare}</span>{' '}
              <span className="max-[400px]:hidden">{misure(daInviare)}{' '}</span>da inviare
            </span>
          )}
        </button>
      )}
      {aperto && <PannelloCoda onChiudi={() => setAperto(false)} />}
    </>
  )
}
