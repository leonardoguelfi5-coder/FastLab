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

/** Il Diario: le note e i promemoria dell'esperimento. */
export const percorsoDiario = (espId: string) => `${percorsoHome(espId)}/diario`

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
