import { create } from 'zustand'

/**
 * Gli archivi .zip scaricati in questa sessione, per esperimento, con gli id delle foto che c'erano dentro. «Libera lo
 * spazio» compare solo per un esperimento che ha una voce qui, e toglie solo i file di quelle foto: quelle aggiunte dopo
 * il download non sono nello zip e non si toccano.
 *
 * Sta in memoria, non in `sessionStorage`: ricaricando la pagina si perde, e per liberare lo spazio bisogna scaricare di
 * nuovo (un passaggio in più, ma mai una cancellazione basata su un download di cui non si è più sicuri). È a livello di
 * modulo perché il download sopravvive alla pagina che l'ha avviato.
 */
interface ArchivioSessione {
  scaricati: Record<string, string[]>
  /** Un download riuscito dell'esperimento: sostituisce il precedente. */
  segna: (espId: string, ids: string[]) => void
  /** Dopo lo spazio liberato (o per annullare). */
  dimentica: (espId: string) => void
}

export const useArchivioSessione = create<ArchivioSessione>(set => ({
  scaricati: {},
  segna: (espId, ids) => set(s => ({ scaricati: { ...s.scaricati, [espId]: [...ids] } })),
  dimentica: espId => set(s => {
    const resto = { ...s.scaricati }
    delete resto[espId]
    return { scaricati: resto }
  }),
}))
