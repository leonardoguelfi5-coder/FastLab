import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import type { Cartella } from '@/domain/export/fogli'
import { testoRiepilogo } from '@/domain/export/riepilogo'
import { formattaData } from '@/lib/date'

/** In che punto è il riepilogo: le scelte non bastano, si sta contando, la lettura è fallita, non c'è nulla o c'è la cartella. */
export type StatoRiepilogo =
  | { tipo: 'incompleto' }
  | { tipo: 'conto' }
  | { tipo: 'errore'; errore: unknown; onRiprova: () => void }
  | { tipo: 'nessunDato' }
  | { tipo: 'pronto'; cartella: Cartella }

/**
 * «Il file conterrà:» (spec §5.6): i fogli e le righe che il file avrà, nelle parole di `testoRiepilogo`, calcolati sulla
 * stessa cartella che poi diventa il file. Fondo carta ombra, Geist Mono; l'area è «polite» perché i numeri cambiano a
 * ogni scelta e chi usa un lettore di schermo li senta senza essere interrotto.
 */
export function Riepilogo({ stato }: { stato: StatoRiepilogo }) {
  let contenuto
  switch (stato.tipo) {
    case 'incompleto':
      contenuto = <p className="text-grafite-tenue">Completa le scelte qui sopra per vedere il riepilogo.</p>
      break
    case 'conto':
      contenuto = <p className="text-grafite-tenue">Conto le righe…</p>
      break
    case 'errore':
      contenuto = <div className="font-sans"><ErroreConRiprova errore={stato.errore} onRiprova={stato.onRiprova} /></div>
      break
    case 'nessunDato':
      contenuto = <p className="text-grafite">Nessun dato con queste scelte.</p>
      break
    case 'pronto': {
      const { fogli, contenuti } = testoRiepilogo(stato.cartella)
      const { da, a } = stato.cartella.intervallo
      contenuto = (
        <>
          <p className="text-grafite-tenue">Il file conterrà:</p>
          <ul className="flex flex-col">
            {fogli.map(riga => <li key={riga}>{riga}</li>)}
          </ul>
          {contenuti && <p className="text-grafite-tenue">{contenuti}</p>}
          {da !== null && a !== null && <p className="text-grafite-tenue">{`Dal ${formattaData(da)} al ${formattaData(a)}`}</p>}
        </>
      )
    }
  }
  return (
    <div
      role="status" aria-live="polite" aria-label="Riepilogo"
      className="flex flex-col gap-1.5 rounded-lg bg-carta-ombra p-3 font-mono text-dato tabular-nums text-grafite"
    >
      {contenuto}
    </div>
  )
}
