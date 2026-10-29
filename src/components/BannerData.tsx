import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formattaData, oggiLocale } from '@/lib/date'
import { useOggi } from '@/lib/useOggi'
import { useCampoStore } from '@/store/campo'

/**
 * Avviso "non oggi": compare solo se la data di rilievo scelta per l'esperimento non è quella di oggi, perché
 * registrare con la data sbagliata è un errore che non si vede. Colori di attenzione con un bordo pieno di 1px
 * (non una striscia laterale: al sole il fondo velato da solo non si distingue), icona (mai solo colore) e,
 * a portata di pollice, "Usa oggi". Il testo è un solo nodo di testo. "Oggi" è `useOggi()`: se l'app resta aperta
 * oltre la mezzanotte l'avviso compare o sparisce da solo.
 *
 * `conferma` riceve il cambio di data invece di eseguirlo: una pagina con valori non salvati che dipendono dalla
 * data (la scheda pianta) può chiedere prima se scartarli.
 */
export function BannerData({ espId, conferma }: { espId: string; conferma?: (cambiaData: () => void) => void }) {
  const oggi = useOggi()
  const dataRilievo = useCampoStore(s => s.dati(espId, oggi).dataRilievo)
  const setData = useCampoStore(s => s.setData)

  if (dataRilievo === oggi) return null

  return (
    <div role="status" className="flex items-center gap-2 rounded-lg border border-attenzione bg-attenzione-velato py-1 pr-1 pl-3 text-grafite">
      <TriangleAlert aria-hidden className="size-5 shrink-0 text-attenzione" />
      <p className="min-w-0 flex-1 py-2">{`Stai registrando con data ${formattaData(dataRilievo)}, non oggi.`}</p>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          const usaOggi = () => setData(espId, oggiLocale())
          if (conferma) conferma(usaOggi)
          else usaOggi()
        }}
      >
        Usa oggi
      </Button>
    </div>
  )
}
