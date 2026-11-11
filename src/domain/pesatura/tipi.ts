/**
 * I tipi della Pesatura. Le stringhe sono le stesse che il database accetta nei vincoli (`tipo` dell'analisi e della
 * sessione, `tipo` del peso): cambiarle qui senza una migrazione romperebbe i salvataggi.
 */

export type TipoAnalisi = 'aliquota' | 'rwc' | 'sostanza_secca' | 'vasi'
export type UnitaPeso = 'g' | 'mg'
export type TipoSensore = 'umidita' | 'tensione'

/** Lo strumento letto insieme al peso del vaso in asciugatura, con la sua unità (es. `%` o `kPa`). */
export interface Sensore {
  tipo: TipoSensore
  unita: string
}

/** `rapportoTampone` è sempre in mL per g di campione, qualunque sia l'unità di peso dell'analisi. */
export interface ImpostazioniAnalisi {
  repliche: number
  rapportoTampone: number | null
  sensore: Sensore | null
}

export interface AnalisiPesatura {
  id: string
  titolo: string
  tipo: TipoAnalisi
  unita: UnitaPeso
  impostazioni: ImpostazioniAnalisi
  archiviata: boolean
  creato_da?: string
}

/** Una sessione copia titolo, tipo, unità e impostazioni dell'analisi quando nasce: modificare l'analisi non la tocca. */
export interface SessionePesatura {
  id: string
  esperimento_id: string
  analisi_id: string
  titolo: string
  tipo: TipoAnalisi
  unita: UnitaPeso
  impostazioni: ImpostazioniAnalisi
  data: string
  nota: string | null
  conclusa: boolean
  creato_da?: string
  creato_il?: string
}

export interface CampionePesatura {
  id: string
  sessione_id: string
  pianta_id: string | null
  nome: string | null
  substrato: string | null
  ordine: number
}

export type TipoPeso = 'aliquota' | 'fresco' | 'turgido' | 'secco' | 'capacita_campo' | 'asciugatura'

export interface Peso {
  id: string
  campione_id: string
  replica: number
  tipo: TipoPeso
  valore: number
  /** La lettura del sensore, solo per i vasi in asciugatura. */
  lettura: number | null
  misurato_il: string
  creato_da?: string
}

export const IMPOSTAZIONI_PREDEFINITE: ImpostazioniAnalisi = { repliche: 1, rapportoTampone: null, sensore: null }

export const NOMI_TIPO: Record<TipoAnalisi, string> = {
  aliquota: 'Aliquota',
  rwc: 'RWC',
  sostanza_secca: '% sostanza secca',
  vasi: 'Vasi',
}
