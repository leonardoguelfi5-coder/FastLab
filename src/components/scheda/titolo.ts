import type { Strumento } from '@/domain/tipi'
import { formattaData } from '@/lib/date'

/** Il titolo del riquadro di una misura: "Oggi · 🌡 Termometro", o la data se il rilievo non è di oggi. */
export function titoloRiquadro(strumento: Strumento, dataRilievo: string, oggi: string): string {
  return `${dataRilievo === oggi ? 'Oggi' : formattaData(dataRilievo)} · ${strumento.icona ? `${strumento.icona} ` : ''}${strumento.nome}`
}
