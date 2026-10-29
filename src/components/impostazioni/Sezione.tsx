import { useId, type ReactNode } from 'react'

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
