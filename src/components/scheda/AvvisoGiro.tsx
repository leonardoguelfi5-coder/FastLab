import { Link } from 'react-router-dom'
import { percorsoNuovaMisura } from '@/lib/percorsi'

/**
 * Una pagina del giro che non si può mostrare (strumento archiviato o inesistente, pianta che non c'è): lo dice e
 * riporta alla scelta dello strumento. Nessun modulo: non si salva niente su uno strumento o una pianta sbagliati.
 */
export function AvvisoGiro({ espId, testo, azione = 'Scegli un altro strumento' }: { espId: string; testo: string; azione?: string }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-grafite">{testo}</p>
      <Link
        to={percorsoNuovaMisura(espId)}
        className="inline-flex min-h-11 items-center font-medium text-inchiostro underline decoration-1 underline-offset-4"
      >
        {azione}
      </Link>
    </div>
  )
}
