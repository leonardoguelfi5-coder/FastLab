import type { Foto, Nota, Pianta, Trattamento } from './tipi'

/**
 * L'archivio .zip delle foto (Piano C, Task C7): i nomi dei file e il `foto.csv` che stanno nello zip. Funzioni pure,
 * senza rete né file: l'impacchettamento e il download sono in `components/impostazioni/archivioFoto.ts`.
 */

const LUNGHEZZA_MASSIMA_NOME = 40
const LUNGHEZZA_MASSIMA_NOTA = 80
/** Il segno d'ordine dei byte UTF-8 (U+FEFF): senza, Excel apre il CSV come Windows-1252 e rovina gli accenti. */
const BOM = String.fromCharCode(0xfeff)

/**
 * Un pezzo di nome di file sicuro ovunque (Windows, Android, iOS, riga di comando): solo lettere ASCII, cifre e `-`, senza
 * accenti, senza trattini ai bordi né ripetuti, al massimo 40 caratteri. Può restare vuoto: chi chiama sceglie il ripiego.
 */
export function nomeSicuro(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LUNGHEZZA_MASSIMA_NOME)
    .replace(/-+$/, '')
}

/** Il nome del file scaricato: `FastLab_<nome sicuro dell'esperimento>_foto_<AAAA-MM-GG>.zip`. */
export function nomeFileZip(nomeEsperimento: string, oggi: string): string {
  return `FastLab_${nomeSicuro(nomeEsperimento) || 'esperimento'}_foto_${oggi}.zip`
}

/**
 * I nomi dei file nello zip, per id di foto: `<AAAA-MM-GG>_<pianta-N | nota | esperimento>_<primi 8 caratteri dell'id>.jpg`.
 * Solo caratteri sicuri. I nomi sono tutti diversi, anche confrontati senza badare alle maiuscole (Windows e macOS non le
 * distinguono): se due foto darebbero lo stesso nome, la seconda prende `-2`, la terza `-3`, e così via. Due uuid con gli
 * stessi 8 caratteri iniziali sono rarissimi, ma uno zip che ne sovrascrive una in silenzio non è accettabile.
 */
export function nomiFileZip(foto: Foto[], piante: Pick<Pianta, 'id' | 'etichetta'>[]): Map<string, string> {
  const etichetta = new Map(piante.map(p => [p.id, p.etichetta]))
  const nomi = new Map<string, string>()
  const usati = new Set<string>()
  for (const f of foto) {
    const pianta = f.pianta_id === null ? undefined : etichetta.get(f.pianta_id)
    const cosa = pianta !== undefined && nomeSicuro(pianta) !== '' ? `pianta-${nomeSicuro(pianta)}` : f.nota_id !== null ? 'nota' : 'esperimento'
    const base = `${f.data}_${cosa}_${nomeSicuro(f.id.slice(0, 8)).toLowerCase() || 'foto'}`
    let nome = `${base}.jpg`
    for (let n = 2; usati.has(nome.toLowerCase()); n++) nome = `${base}-${n}.jpg`
    usati.add(nome.toLowerCase())
    nomi.set(f.id, nome)
  }
  return nomi
}

/** Il testo di una nota per il CSV: una riga sola (a capo e spazi ripetuti diventano uno spazio) di al massimo 80 caratteri, con «…» se tagliata. */
export function riassuntoNota(testo: string): string {
  const riga = testo.replace(/\s+/g, ' ').trim()
  return riga.length <= LUNGHEZZA_MASSIMA_NOTA ? riga : `${riga.slice(0, LUNGHEZZA_MASSIMA_NOTA - 1).trimEnd()}…`
}

/**
 * Un campo del CSV. Excel (e LibreOffice) eseguono come formula un testo che comincia con `=`, `+`, `-` o `@`: lo si fa
 * precedere da un apice, così resta testo. Se contiene `;`, virgolette o a capo sta tra virgolette, con quelle interne
 * raddoppiate (RFC 4180).
 */
function campoCsv(valore: string): string {
  const sicuro = /^[=+\-@\t\r]/.test(valore) ? `'${valore}` : valore
  return /[;"\r\n]/.test(sicuro) ? `"${sicuro.replace(/"/g, '""')}"` : sicuro
}

export interface ContestoCsvFoto {
  piante: Pick<Pianta, 'id' | 'etichetta' | 'trattamento_id'>[]
  trattamenti: Pick<Trattamento, 'id' | 'etichetta'>[]
  note: Pick<Nota, 'id' | 'testo'>[]
}

/**
 * Il `foto.csv` dello zip: una riga per foto, nell'ordine dato, con data, pianta, trattamento, nota (accorciata), nome del
 * file nello zip e, se manca, il perché: `sì` se la foto era già archiviata, `file assente` se non lo è ma il suo file
 * non c'è più nello Storage (un giro di «Libera lo spazio» interrotto). Quelle foto non sono nello zip: `nomi` non le
 * contiene. Per Excel italiano: separatore `;`, BOM UTF-8 davanti (senza, gli accenti si rovinano) e righe chiuse da CRLF.
 */
export function creaCsvFoto(foto: Foto[], nomi: Map<string, string>, contesto: ContestoCsvFoto): string {
  const pianta = new Map(contesto.piante.map(p => [p.id, p]))
  const trattamento = new Map(contesto.trattamenti.map(t => [t.id, t.etichetta]))
  const nota = new Map(contesto.note.map(n => [n.id, n.testo]))
  const righe: string[][] = [['data', 'pianta', 'trattamento', 'nota', 'nome del file', 'archiviata']]
  for (const f of foto) {
    const p = f.pianta_id === null ? undefined : pianta.get(f.pianta_id)
    const testoNota = f.nota_id === null ? undefined : nota.get(f.nota_id)
    righe.push([
      f.data,
      p?.etichetta ?? '',
      (p && trattamento.get(p.trattamento_id)) ?? '',
      testoNota === undefined ? '' : riassuntoNota(testoNota),
      nomi.get(f.id) ?? '',
      f.archiviata ? 'sì' : nomi.has(f.id) ? '' : 'file assente',
    ])
  }
  return `${BOM}${righe.map(r => r.map(campoCsv).join(';')).join('\r\n')}`
}
