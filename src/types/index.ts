export interface Pianta {
  id: number
  trattamento: string
}

export interface Palco {
  numero_palco: number
  n_foglie: number
}

export interface Infiorescenza {
  numero_infiorescenza: number
  n_fiori: number
}

export interface RilevazionePrincipale {
  id: string                    // crypto.randomUUID()
  data_ora_inizio: string       // ISO string
  data_ora_fine: string         // ISO string
  id_pianta: number | null
  trattamento: string
  altezza: number | null
  n_palchi_totali: number | null
  n_fiori_fioriti: number | null
  n_frutti: number | null
  n_frutti_invaiati: number | null
  spad: number | null
  temp_aria: number | null
  temp_pianta: number | null
  note: string
  palchi: Palco[]
  infiorescenze: Infiorescenza[]
}
