import { raggruppaStoria } from './misure'
import type { Foto, Misura, Nota } from './tipi'

/** Un giorno della storia di una pianta: le sue misure, le note e le foto di quella data. */
export interface GiornoStoria {
  data: string
  misure: Misura[]
  note: Nota[]
  foto: Foto[]
}

const piuRecente = (a: string, b: string): number => (a < b ? 1 : a > b ? -1 : 0)

/**
 * La linea del tempo di una pianta: un gruppo per data, dal più recente, con dentro le misure (dall'ora più antica),
 * le note e le foto di quel giorno, queste ultime due nell'ordine in cui arrivano. Le date sono AAAA-MM-GG locali,
 * confrontate come testo; un giorno esiste anche se ha solo una nota o solo una foto. Chi chiama passa già le note
 * che riguardano la pianta (`noteDellaPianta`) e le sue foto, senza ciò che è in attesa di eliminazione.
 */
export function storiaPianta(misure: Misura[], note: Nota[], foto: Foto[]): GiornoStoria[] {
  const giorni = new Map<string, GiornoStoria>()
  const giorno = (data: string): GiornoStoria => {
    let g = giorni.get(data)
    if (!g) {
      g = { data, misure: [], note: [], foto: [] }
      giorni.set(data, g)
    }
    return g
  }
  for (const g of raggruppaStoria(misure)) giorno(g.data).misure = g.misure
  for (const n of note) giorno(n.data).note.push(n)
  for (const f of foto) giorno(f.data).foto.push(f)
  return [...giorni.values()].sort((a, b) => piuRecente(a.data, b.data))
}
