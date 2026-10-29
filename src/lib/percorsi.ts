const parte = encodeURIComponent

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Vero se l'id preso da un percorso è un uuid (gli id di esperimenti e misure lo sono): con altro il database darebbe
 * un errore di formato, non "non trovato".
 */
export const eUuid = (id: string): boolean => UUID.test(id)

/** Schermata in campo di un esperimento. */
export const percorsoCampo = (espId: string) => `/esperimenti/${parte(espId)}`

/** Scheda di una pianta. */
export const percorsoPianta = (espId: string, piantaId: string) => `${percorsoCampo(espId)}/piante/${parte(piantaId)}`

/** Impostazioni di un esperimento (configurazione a esperimento avviato). */
export const percorsoImpostazioni = (espId: string) => `${percorsoCampo(espId)}/impostazioni`

/** Modifica di una misura già registrata. */
export const percorsoMisura = (espId: string, misuraId: string) => `${percorsoCampo(espId)}/misure/${parte(misuraId)}`

/** Lo stato di navigazione con cui la storia della pianta apre una misura: la modifica sa di poter tornare indietro. */
export interface ArrivoMisura { daScheda?: boolean }
