const parte = encodeURIComponent

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Vero se l'id preso da un percorso è un uuid (gli id di esperimenti e misure lo sono): con altro il database darebbe
 * un errore di formato, non "non trovato".
 */
export const eUuid = (id: string): boolean => UUID.test(id)

/** Home di un esperimento: la striscia "Nuova misura" e le icone delle sezioni. */
export const percorsoHome = (espId: string) => `/esperimenti/${parte(espId)}`

/** Da qui si fa una nuova misura: la scelta dello strumento. */
export const percorsoNuovaMisura = (espId: string) => `${percorsoHome(espId)}/misura`

/** La misura di una pianta con uno strumento, nel giro sequenziale. */
export const percorsoMisuraPianta = (espId: string, strumentoId: string, piantaId: string) =>
  `${percorsoNuovaMisura(espId)}/${parte(strumentoId)}/${parte(piantaId)}`

/** La fine del giro di uno strumento: riepilogo e piante che mancano. */
export const percorsoFineGiro = (espId: string, strumentoId: string) =>
  `${percorsoNuovaMisura(espId)}/${parte(strumentoId)}/fine`

/** Oggi: gli strumenti con il progresso del giorno e i valori da sistemare. */
export const percorsoOggi = (espId: string) => `${percorsoHome(espId)}/oggi`

/** Le sezioni della home che per ora sono segnaposto "In arrivo". */
export type SezioneInArrivo = 'dataset' | 'esporta'

/** Una sezione della home dell'esperimento ancora segnaposto. */
export const percorsoSezione = (espId: string, sezione: SezioneInArrivo) => `${percorsoHome(espId)}/${sezione}`

/** I parametri di una vista (filtri del Dataset, scelte di Esporta) da mettere in coda a un percorso. */
function coda(ricerca: string | URLSearchParams | undefined): string {
  const testo = (typeof ricerca === 'string' ? ricerca : ricerca?.toString() ?? '').replace(/^\?/, '')
  return testo === '' ? '' : `?${testo}`
}

/** Il Dataset: i grafici. `ricerca` sono i filtri nella URL (`s`, `p`, `t`, `f`, `per`, `cerca`). */
export const percorsoDataset = (espId: string, ricerca?: string | URLSearchParams) => `${percorsoHome(espId)}/dataset${coda(ricerca)}`

/** Esporta Excel. `ricerca` sono le scelte iniziali, per esempio quelle di "Scarica questa vista" dal Dataset. */
export const percorsoEsporta = (espId: string, ricerca?: string | URLSearchParams) => `${percorsoHome(espId)}/esporta${coda(ricerca)}`

/** Il Diario: le note e i promemoria dell'esperimento. */
export const percorsoDiario = (espId: string) => `${percorsoHome(espId)}/diario`

/**
 * Lo stato di navigazione con cui si arriva al Diario da un'altra pagina (Oggi, la scheda della pianta). Vive nella
 * rotta e non in un parametro: un ricaricamento non deve riaprire da solo un editor, e la bozza a metà ha la precedenza.
 */
export interface ArrivoDiario {
  /** La nota da mostrare aperta nell'elenco (dal promemoria di Oggi e dalla storia della pianta). */
  apriNota?: string
  /** Apre una nota nuova già collegata a questa pianta (dalla scheda della pianta). */
  nuovaPerPianta?: string
  /** Dove tornare dopo il salvataggio o l'annullamento della nota nuova (la scheda da cui si è partiti). */
  ritorno?: string
}

/**
 * Lo stato di arrivo al Diario, letto da `location.state` (che può essere qualunque cosa: la cronologia del browser
 * lo conserva). Si tengono solo i testi, e un ritorno solo se resta dentro l'esperimento: la scheda da cui si è partiti.
 */
export function leggiArrivoDiario(stato: unknown, espId: string): ArrivoDiario {
  if (typeof stato !== 'object' || stato === null) return {}
  const { apriNota, nuovaPerPianta, ritorno } = stato as Record<string, unknown>
  const arrivo: ArrivoDiario = {}
  if (typeof apriNota === 'string') arrivo.apriNota = apriNota
  if (typeof nuovaPerPianta === 'string') arrivo.nuovaPerPianta = nuovaPerPianta
  if (typeof ritorno === 'string' && ritorno.startsWith(`${percorsoHome(espId)}/`)) arrivo.ritorno = ritorno
  return arrivo
}

/** La galleria delle foto dell'esperimento. */
export const percorsoGalleria = (espId: string) => `${percorsoHome(espId)}/foto`

/** Elenco delle piante di un esperimento. */
export const percorsoPiante = (espId: string) => `${percorsoHome(espId)}/piante`

/** Scheda di una pianta. */
export const percorsoPianta = (espId: string, piantaId: string) => `${percorsoPiante(espId)}/${parte(piantaId)}`

/** Impostazioni di un esperimento (configurazione a esperimento avviato). */
export const percorsoImpostazioni = (espId: string) => `${percorsoHome(espId)}/impostazioni`

/** Modifica di una misura già registrata. */
export const percorsoModificaMisura = (espId: string, misuraId: string) => `${percorsoHome(espId)}/misure/${parte(misuraId)}`

/**
 * Lo stato di navigazione con cui una pagina apre una misura (la storia della pianta, i valori da sistemare di Oggi):
 * la modifica sa di poter tornare indietro, alla pagina da cui si arriva. `daScheda` ha il nome della prima che lo
 * usa; vale per ogni pagina di provenienza.
 */
export interface ArrivoMisura { daScheda?: boolean }

/** Il catalogo degli strumenti, condiviso tra tutti gli esperimenti. */
export const percorsoCatalogo = '/catalogo'
