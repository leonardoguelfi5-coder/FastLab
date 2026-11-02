import pgtap from '../../../supabase/tests/export_salvati.test.sql?raw'

/**
 * I casi di prova delle scelte di un export, gli STESSI di `scelte_export_valide` nel database: si leggono dalla tabella
 * temporanea `casi` di `supabase/tests/export_salvati.test.sql`, così un caso aggiunto lì vale subito anche per
 * `leggiSceltaExport` (e la funzione TS deve dare la stessa risposta). I casi scritti come testo JSON si leggono dal
 * file; quelli generati in SQL (migliaia di ids, oggetto enorme) non si possono leggere e si rifanno qui con lo stesso
 * generatore: un caso generato senza il suo gemello in `GENERATI` fa fallire il test, e viceversa.
 */
export interface CasoScelte { nome: string; valida: boolean; scelte: unknown }

/** `pg_temp.ids(prefisso, quanti)`: `prefisso || lpad(to_hex(i), 12, '0')` per i da 1 a `quanti`. */
export function idsGenerati(prefisso: string, quanti: number): string[] {
  return Array.from({ length: quanti }, (_, i) => `${prefisso}${(i + 1).toString(16).padStart(12, '0')}`)
}

const COME_TUTTO = { valori: true, medie: true, grafici: true, diario: true, info: true }

/** I casi generati dell'SQL, per nome, rifatti come in `insert into casi ... jsonb_build_object(...)`. */
export const GENERATI: Record<string, () => unknown> = {
  'ids al limite (200 strumenti, 2000 piante)': () => ({
    v: 1,
    strumenti: { modo: 'scelti', ids: idsGenerati('d5000000-0000-0000-0000-', 200) },
    piante: { modo: 'piante', ids: idsGenerati('b5000000-0000-0000-0000-', 2000) },
    periodo: { modo: 'tutto' },
    come: COME_TUTTO,
  }),
  'troppi strumenti (201)': () => ({
    v: 1,
    strumenti: { modo: 'scelti', ids: idsGenerati('d5000000-0000-0000-0000-', 201) },
    piante: { modo: 'tutte' }, periodo: { modo: 'tutto' },
    come: COME_TUTTO,
  }),
  'troppe piante (2001)': () => ({
    v: 1, strumenti: { modo: 'tutti' },
    piante: { modo: 'trattamenti', ids: idsGenerati('75000000-0000-0000-0000-', 2001) },
    periodo: { modo: 'tutto' },
    come: COME_TUTTO,
  }),
  'enorme (oltre 100 000 byte)': () => ({
    v: 1, strumenti: { modo: 'tutti' }, piante: { modo: 'tutte' }, periodo: { modo: 'tutto' },
    come: { valori: true, medie: true, grafici: true, diario: true, info: 'x'.repeat(200000) },
  }),
}

/** Un testo SQL tra apici: `''` è un apice. Con `standard_conforming_strings` la barra resta una barra (`\n` lo legge il JSON). */
const testoSql = (s: string): string => s.replace(/''/g, "'")

/** I blocchi `insert into casi (nome, valida, scelte) values ...;` del file pgTAP. */
const BLOCCO = /insert into casi \(nome, valida, scelte\) values([\s\S]*?);\s*$/gm
/**
 * L'inizio di un caso, a inizio riga: `('nome', true|false,` e, se il caso è scritto come testo, il suo `'json'`. A
 * inizio riga perché dentro i casi generati `jsonb_build_object('valori', true, ...` ha la stessa forma.
 */
const CASO = /^[ \t]*\(\s*'((?:[^']|'')*)'\s*,\s*(true|false)\s*,\s*(?:'((?:[^']|'')*)')?/gm

/** Tutti i casi della tabella `casi`, nell'ordine del file; i generati con `GENERATI` (un nome sconosciuto lancia). */
export function casiDelPgtap(sql: string = pgtap): CasoScelte[] {
  const casi: CasoScelte[] = []
  for (const blocco of sql.matchAll(BLOCCO)) {
    for (const m of blocco[1].matchAll(CASO)) {
      const nome = testoSql(m[1])
      const valida = m[2] === 'true'
      if (m[3] !== undefined) {
        casi.push({ nome, valida, scelte: JSON.parse(testoSql(m[3])) })
        continue
      }
      const genera = GENERATI[nome]
      if (!genera) throw new Error(`Caso generato senza gemello in TS: ${nome}`)
      casi.push({ nome, valida, scelte: genera() })
    }
  }
  return casi
}
