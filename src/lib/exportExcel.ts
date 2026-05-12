import * as XLSX from 'xlsx'
import { RilevazionePrincipale } from '@/types'

export function exportToExcel(rilevazioni: RilevazionePrincipale[]) {
  // Sheet 1: Rilevazioni (flatten — no nested palchi/infiorescenze)
  const rilevSheet = rilevazioni.map((r) => ({
    ID: r.id,
    Data_Ora_Inizio: r.data_ora_inizio,
    Data_Ora_Fine: r.data_ora_fine,
    ID_Pianta: r.id_pianta,
    Trattamento: r.trattamento,
    Altezza: r.altezza,
    N_palchi_totali: r.n_palchi_totali,
    N_fiori_fioriti: r.n_fiori_fioriti,
    N_frutti: r.n_frutti,
    N_frutti_invaiati: r.n_frutti_invaiati,
    Spad: r.spad,
    Temp_Aria: r.temp_aria,
    Temp_Pianta: r.temp_pianta,
    Note: r.note,
  }))

  // Sheet 2: Palchi (flat, with id_rilevazione)
  const palchiSheet = rilevazioni.flatMap((r) =>
    r.palchi.map((p) => ({
      ID_Rilevazione: r.id,
      ID_Pianta: r.id_pianta,
      Numero_Palco: p.numero_palco,
      N_Foglie: p.n_foglie,
    }))
  )

  // Sheet 3: Infiorescenze (flat, with id_rilevazione)
  const infSheet = rilevazioni.flatMap((r) =>
    r.infiorescenze.map((inf) => ({
      ID_Rilevazione: r.id,
      ID_Pianta: r.id_pianta,
      Numero_Infiorescenza: inf.numero_infiorescenza,
      N_Fiori: inf.n_fiori,
    }))
  )

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rilevSheet), 'Rilevazioni')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(palchiSheet.length ? palchiSheet : [{}]), 'Palchi')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(infSheet.length ? infSheet : [{}]), 'Infiorescenze')

  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `FastLab_Rilievi_${date}.xlsx`)
}
