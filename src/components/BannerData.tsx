import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formattaData, oggiLocale } from '@/lib/date'
import { useCampoStore } from '@/store/campo'

/**
 * Avviso "non oggi": compare solo se la data di rilievo scelta per l'esperimento non è quella di oggi, perché
 * registrare con la data sbagliata è un errore che non si vede. Colori di attenzione, icona (mai solo colore) e,
 * a portata di pollice, "Usa oggi". Il testo è un solo nodo di testo.
 */
export function BannerData({ espId }: { espId: string }) {
  const dataRilievo = useCampoStore(s => s.dati(espId).dataRilievo)
  const setData = useCampoStore(s => s.setData)

  if (dataRilievo === oggiLocale()) return null

  return (
    <div role="status" className="flex items-center gap-2 rounded-lg bg-attenzione-velato py-1 pr-1 pl-3 text-grafite">
      <TriangleAlert aria-hidden className="size-5 shrink-0 text-attenzione" />
      <p className="min-w-0 flex-1 py-2">{`Stai registrando con data ${formattaData(dataRilievo)}, non oggi.`}</p>
      <Button variant="ghost" size="sm" onClick={() => setData(espId, oggiLocale())}>Usa oggi</Button>
    </div>
  )
}
