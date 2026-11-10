import type { ConfigEsperimento, Foto, Pianta } from './tipi'
import { dataLocaleDa, formattaData, formattaGiornoMese } from '@/lib/date'
import { formattaNumero } from '@/lib/numeri'
import { filtraPiante } from './elencoPiante'
import { LIMITE_FOTO_BYTE } from './spazio'

/**
 * Il percorso del file di una foto nel bucket `foto`: `<esperimento_id>/<foto_id>.jpg`. Lo impone il vincolo
 * `foto_percorso_formato` della riga e le policy dello Storage (accettano solo questo nome, con uuid in minuscolo, come
 * li scrive Postgres): per questo si porta in minuscolo anche un id arrivato da un link scritto a mano.
 */
export function percorsoFoto(espId: string, fotoId: string): string {
  return `${espId.toLowerCase()}/${fotoId.toLowerCase()}.jpg`
}

/** L'elenco senza quella foto (l'eliminazione con Annulla la toglie subito dalla vista). */
export function senzaFoto(foto: Foto[], id: string): Foto[] {
  return foto.filter(f => f.id !== id)
}

/**
 * Rimette una foto nell'elenco, dov'era (`indice` è la sua posizione quando è stata tolta; -1 se non c'era e allora va
 * in cima, tra le più recenti). L'elenco può essere cambiato nel frattempo: l'indice si tiene nei limiti, e una foto
 * già presente (riletta dal server) non si duplica.
 */
export function reinserisciFoto(foto: Foto[], f: Foto, indice: number): Foto[] {
  if (foto.some(x => x.id === f.id)) return foto
  const posto = indice < 0 ? 0 : Math.min(indice, foto.length)
  return [...foto.slice(0, posto), f, ...foto.slice(posto)]
}

/** Il segnaposto di una foto archiviata (galleria, storia, visore): «Archiviata nel .zip del GG/MM», senza giorno se la riga non lo ha. */
export function testoArchiviata(foto: Pick<Foto, 'archiviata_il'>): string {
  return foto.archiviata_il === null ? 'Archiviata nel .zip' : `Archiviata nel .zip del ${formattaGiornoMese(dataLocaleDa(foto.archiviata_il))}`
}

/** Le foto collegate a una pianta, nell'ordine dato. */
export function fotoDellaPianta(foto: Foto[], piantaId: string): Foto[] {
  return foto.filter(f => f.pianta_id === piantaId)
}

/** Le foto collegate a una nota, nell'ordine dato. */
export function fotoDellaNota(foto: Foto[], notaId: string): Foto[] {
  return foto.filter(f => f.nota_id === notaId)
}

/** Le foto di un giorno, per la galleria. */
export interface GruppoFoto { data: string; foto: Foto[] }

/** Un gruppo per giorno, dal più recente; dentro, le foto nell'ordine dato (l'elenco arriva già dal più recente). */
export function raggruppaPerData(foto: Foto[]): GruppoFoto[] {
  const gruppi = new Map<string, Foto[]>()
  for (const f of foto) {
    const g = gruppi.get(f.data)
    if (g) g.push(f)
    else gruppi.set(f.data, [f])
  }
  return [...gruppi.entries()].map(([data, dentro]) => ({ data, foto: dentro })).sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
}

export interface FiltriFoto {
  /** Il testo cercato nelle etichette delle piante; vuoto = nessun filtro. */
  pianta: string
  /** Il trattamento delle piante; null = nessun filtro. */
  trattamentoId: string | null
}

/**
 * Le foto che passano i filtri della galleria: della pianta cercata (come nell'elenco delle piante) e/o di una pianta
 * del trattamento scelto. Con un filtro attivo, le foto senza pianta (solo dell'esperimento o di una nota) restano fuori.
 */
export function filtraFoto(foto: Foto[], config: Pick<ConfigEsperimento, 'piante'>, filtri: FiltriFoto): Foto[] {
  const cercata = filtri.pianta.trim() === '' ? null : new Set(filtraPiante(config.piante, filtri.pianta).map(p => p.id))
  if (cercata === null && filtri.trattamentoId === null) return foto
  const trattamentoDi = new Map(config.piante.map(p => [p.id, p.trattamento_id]))
  return foto.filter(f => {
    if (f.pianta_id === null) return false
    if (cercata && !cercata.has(f.pianta_id)) return false
    return filtri.trattamentoId === null || trattamentoDi.get(f.pianta_id) === filtri.trattamentoId
  })
}

/** Il nome di una foto per chi non la vede: «Foto del 28/10/2026, pianta 35» (la pianta, se è collegata a una). */
export function descriviFoto(foto: Foto, piante: Pick<Pianta, 'id' | 'etichetta'>[]): string {
  const pianta = foto.pianta_id === null ? undefined : piante.find(p => p.id === foto.pianta_id)
  return `Foto del ${formattaData(foto.data)}${pianta ? `, pianta ${pianta.etichetta}` : ''}`
}

/** Lo spazio del piano gratuito per le foto: un rimando a `LIMITE_FOTO_BYTE` di domain/spazio, dove stanno i limiti. */
export const LIMITE_SPAZIO_BYTE = LIMITE_FOTO_BYTE

/** I byte in megabyte (1 MB = 1 000 000 byte), con la virgola e un decimale: "12,3 MB". */
export function formattaMegabyte(byte: number): string {
  return `${formattaNumero(Math.round(byte / 100_000) / 10)} MB`
}
