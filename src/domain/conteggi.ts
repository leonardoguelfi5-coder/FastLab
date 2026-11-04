import { migliaia } from '@/domain/export/riepilogo'
import { formattaData, formattaGiornoMese } from '@/lib/date'

/** Le misure di uno strumento in un esperimento: quante, di quante piante, la prima e l'ultima data (AAAA-MM-GG). */
export interface ConteggioStrumento {
  misure: number
  piante: number
  prima: string
  ultima: string
}

/**
 * Le misure di uno strumento a parole: «312 misure di 56 piante, dal 14/10 al 03/11». In un giorno solo «il 07/10»;
 * con date di anni diversi si scrive anche l'anno, perché giorno e mese da soli tornerebbero indietro.
 */
export function descriviMisure(c: ConteggioStrumento): string {
  const misure = `${migliaia(c.misure)} ${c.misure === 1 ? 'misura' : 'misure'}`
  const piante = `${migliaia(c.piante)} ${c.piante === 1 ? 'pianta' : 'piante'}`
  const data = c.prima.slice(0, 4) === c.ultima.slice(0, 4) ? formattaGiornoMese : formattaData
  const quando = c.prima === c.ultima ? `il ${data(c.prima)}` : `dal ${data(c.prima)} al ${data(c.ultima)}`
  return `${misure} di ${piante}, ${quando}`
}

/** Il testo della conferma di "Elimina" per uno strumento senza misure, con i valori che se ne vanno con lui. */
export function testoConfermaElimina(tabella: boolean, valori: string[]): string {
  return `${tabella ? 'La tabella non ha misure.' : 'Lo strumento non ha misure.'} `
    + (valori.length > 0 ? `Si eliminano anche i suoi valori (${valori.join(', ')}): non hanno dati. ` : '')
    + 'L\'operazione non si può annullare.'
}

/** Perché uno strumento con misure non si elimina, e che cosa si può fare invece (dipende da che cosa è). */
export function spiegaConMisure(c: ConteggioStrumento, come: 'strumento' | 'archiviato' | 'tabella'): string {
  const dopo = {
    strumento: 'Puoi archiviarlo: le misure restano.',
    archiviato: 'È già archiviato: le misure restano nella storia delle piante e nell\'export.',
    tabella: 'Le voci che non servono più si archiviano una alla volta: i loro dati restano.',
  }[come]
  return `Ha ${descriviMisure(c)}: non si può eliminare. ${dopo}`
}
