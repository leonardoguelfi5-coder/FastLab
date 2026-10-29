const parte = encodeURIComponent

/** Schermata in campo di un esperimento. */
export const percorsoCampo = (espId: string) => `/esperimenti/${parte(espId)}`

/** Scheda di una pianta. */
export const percorsoPianta = (espId: string, piantaId: string) => `${percorsoCampo(espId)}/piante/${parte(piantaId)}`

/** Modifica di una misura già registrata. */
export const percorsoMisura = (espId: string, misuraId: string) => `${percorsoCampo(espId)}/misure/${parte(misuraId)}`
