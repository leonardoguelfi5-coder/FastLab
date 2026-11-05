import type { VoceCoda } from '@/lib/coda/codaMisure'

/**
 * Il segno di una misura che è ancora sul telefono, in una riga di misure: "da inviare" in grafite tenue (mai verde: il
 * server non l'ha), "non inviata" in tono errore se il server l'ha rifiutata. Niente per le misure del server.
 */
export function SegnoCoda({ stato }: { stato: VoceCoda['stato'] | undefined }) {
  if (stato === undefined) return null
  return stato === 'rifiutata'
    ? <span className="text-label text-errore">non inviata</span>
    : <span className="text-label text-grafite-tenue">da inviare</span>
}
