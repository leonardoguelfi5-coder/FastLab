import { useId, type ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'

/** Una sezione delle impostazioni: intestazione piccola in maiuscolo (come "STORIA" nella scheda) e contenuto. */
export function Sezione({ titolo, children }: { titolo: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="border-b border-riga pb-2 text-label text-grafite-tenue uppercase">{titolo}</h2>
      {children}
    </section>
  )
}

/** Testo che spiega una sezione o un gruppo: grafite tenue, righe entro 65 caratteri. */
export function Spiegazione({ children, id }: { children: ReactNode; id?: string }) {
  return <p id={id} className="max-w-[65ch] text-sm text-grafite-tenue">{children}</p>
}

/** Mentre non si sa ancora quali elementi hanno dati: le azioni che ne dipendono restano spente. */
export function ControlloDati() {
  return <p role="status" className="text-sm text-grafite-tenue">Controllo dei dati in corso…</p>
}

/** Le letture dei dati (quali valori, quali strumenti hanno misure) non ancora arrivate: in corso, o in errore con "Riprova". */
export function AvvisoDati({ letture }: { letture: UseQueryResult<Set<string>>[] }) {
  const mancanti = letture.filter(l => l.data === undefined)
  return (
    <>
      {mancanti.filter(l => l.isError).map((l, i) => <ErroreConRiprova key={i} errore={l.error} onRiprova={() => void l.refetch()} />)}
      {mancanti.some(l => !l.isError) && <ControlloDati />}
    </>
  )
}
