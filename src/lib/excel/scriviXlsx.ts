import type { Cell, Workbook, Worksheet } from 'exceljs'
import type { Cartella, Cella, Foglio, GraficoDaDisegnare } from '@/domain/export/fogli'
import { ErroreApp } from '@/lib/errori'

/**
 * Lo scrittore del file .xlsx: l'unico modulo dell'app che usa `exceljs` (Piano D, Decisione 3), sempre con un import
 * dinamico, così la libreria (pesante) vive in un chunk a parte e si scarica solo al tocco di "Scarica Excel". Riceve la
 * descrizione pura della cartella (`costruisciCartella`, `src/domain/export/fogli.ts`) e i PNG dei grafici, e non decide
 * niente sui dati: scrive le celle come il modello le dà. Se un giorno il peso fosse un problema, si sostituisce solo
 * questo file.
 *
 * Le celle:
 * - `{ data }` diventa una data vera di Excel con `dd/mm/yyyy`. exceljs scrive una `Date` come giorni dal 1970 in UTC:
 *   la data si costruisce quindi a mezzanotte UTC (`Date.UTC`). Costruita in ora locale, in Italia cadrebbe alle 22 o
 *   alle 23 del giorno prima e Excel mostrerebbe il giorno sbagliato;
 * - `{ ora }` diventa la frazione del giorno con `hh:mm`; `{ istante }` la data e l'ora locali (del telefono) come numero
 *   di serie con `dd/mm/yyyy hh:mm`;
 * - numeri e booleani restano tali; **ogni stringa è testo**: exceljs fa una formula solo da un oggetto `{ formula }`,
 *   quindi una nota che comincia con `=` resta testo;
 * - un valore che Excel non saprebbe mostrare come data (prima del 01/03/1900, dove il calendario di Excel ha il finto
 *   29/02/1900, o una data illeggibile) resta il testo del modello: meglio `0026-10-20` che una cella `####`.
 */

export const EXCEL_NON_CARICATO = 'Non riesco a preparare l\'Excel: ricarica la pagina e riprova.'
/** Al posto dell'immagine di un grafico che il browser non ha disegnato, sotto il suo titolo nel foglio Grafici. */
export const IMMAGINE_NON_DISPONIBILE = 'Immagine non disponibile su questo browser.'
/** La misura di ogni immagine nel foglio Grafici, in pixel (il PNG è al doppio, per lo schermo nitido). */
export const LARGHEZZA_IMMAGINE = 800
export const ALTEZZA_IMMAGINE = 450
export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * Gli stili delle celle, uno per formato, con e senza grassetto. Ogni cella riceve uno di questi oggetti, condiviso e mai
 * modificato (niente `cella.numFmt = …`, che cambierebbe l'oggetto di tutte): exceljs riconosce uno stile già visto
 * dall'oggetto stesso, e con 50 000 righe questo dimezza il tempo in cui scrivendo il file la pagina resta ferma.
 */
type Formato = 'nessuno' | 'data' | 'ora' | 'istante'
const FORMATI: Record<Exclude<Formato, 'nessuno'>, string> = { data: 'dd/mm/yyyy', ora: 'hh:mm', istante: 'dd/mm/yyyy hh:mm' }
const stili = (grassetto: boolean): Record<Formato, Cell['style']> => {
  const stile = (f: Formato) => ({ ...(f === 'nessuno' ? {} : { numFmt: FORMATI[f] }), ...(grassetto ? { font: { bold: true } } : {}) })
  return { nessuno: stile('nessuno'), data: stile('data'), ora: stile('ora'), istante: stile('istante') }
}
const STILI = stili(false)
const STILI_GRASSETTO = stili(true)
/** Ogni quante righe si cede il passo al browser: la pagina continua a mostrare la fase e si può lasciare. */
const RIGHE_PER_PAUSA = 2000

const GIORNO_MS = 86_400_000
/** Il numero di serie di Excel del 01/01/1970 (giorni dal 30/12/1899). */
const SERIALE_1970 = 25_569
/** Dal 01/03/1900 i numeri di serie di Excel contano i giorni veri; prima c'è il finto 29/02/1900. */
const PRIMO_GIORNO_SICURO = Date.UTC(1900, 2, 1)
const ULTIMO_GIORNO = Date.UTC(9999, 11, 31)

type CostruttoreCartella = new () => Workbook

/** Carica exceljs (il suo chunk). Un import che non riesce non deve sembrare un guasto qualsiasi: si dice di ricaricare. */
async function caricaExcel(): Promise<CostruttoreCartella> {
  try {
    const modulo = await import('exceljs')
    // exceljs è CommonJS (nel browser un UMD): secondo il bundler le classi stanno nel modulo o nel suo `default`.
    const Classe = modulo.Workbook ?? (modulo as unknown as { default?: { Workbook?: CostruttoreCartella } }).default?.Workbook
    if (typeof Classe !== 'function') throw new Error('exceljs senza Workbook')
    return Classe as CostruttoreCartella
  } catch {
    throw new ErroreApp(EXCEL_NON_CARICATO)
  }
}

const pausa = () => new Promise<void>(risolvi => setTimeout(risolvi, 0))

/** `AAAA-MM-GG` a mezzanotte UTC, o `null` se non è una data vera nel calendario di Excel. */
function dataUtc(testo: string): Date | null {
  const pezzi = /^(\d{4})-(\d{2})-(\d{2})$/.exec(testo)
  if (!pezzi) return null
  const [a, m, g] = [Number(pezzi[1]), Number(pezzi[2]), Number(pezzi[3])]
  // Date.UTC prende un anno sotto il 100 per il 19xx: l'anno si mette dopo
  const d = new Date(Date.UTC(2000, m - 1, g))
  d.setUTCFullYear(a)
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== g) return null
  const ms = d.getTime()
  return ms < PRIMO_GIORNO_SICURO || ms > ULTIMO_GIORNO ? null : d
}

/** `HH:MM` (o `HH:MM:SS`) come frazione del giorno, o `null`. */
function frazioneDelGiorno(testo: string): number | null {
  const pezzi = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(testo)
  if (!pezzi) return null
  const [h, min, s] = [Number(pezzi[1]), Number(pezzi[2]), Number(pezzi[3] ?? 0)]
  if (h > 23 || min > 59 || s > 59) return null
  return (h * 3600 + min * 60 + s) / 86_400
}

/** Un istante ISO come numero di serie di Excel della sua data e ora locali, o `null`. */
function serialeLocale(testo: string): number | null {
  const d = new Date(testo)
  if (Number.isNaN(d.getTime())) return null
  const locale = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds())
  if (locale < PRIMO_GIORNO_SICURO || locale > ULTIMO_GIORNO + GIORNO_MS) return null
  return locale / GIORNO_MS + SERIALE_1970
}

/** Il valore da scrivere per una cella del modello e il suo formato. */
function valoreDi(x: Exclude<Cella, null>): { valore: string | number | boolean | Date; formato: Formato } {
  if (typeof x === 'string' || typeof x === 'boolean') return { valore: x, formato: 'nessuno' }
  // Il modello dà solo numeri finiti; un NaN si vedrebbe come errore in Excel: meglio il suo testo
  if (typeof x === 'number') return { valore: Number.isFinite(x) ? x : String(x), formato: 'nessuno' }
  if ('data' in x) {
    const d = dataUtc(x.data)
    return d === null ? { valore: x.data, formato: 'nessuno' } : { valore: d, formato: 'data' }
  }
  if ('ora' in x) {
    const f = frazioneDelGiorno(x.ora)
    return f === null ? { valore: x.ora, formato: 'nessuno' } : { valore: f, formato: 'ora' }
  }
  const s = serialeLocale(x.istante)
  return s === null ? { valore: x.istante, formato: 'nessuno' } : { valore: s, formato: 'istante' }
}

/** Scrive una cella del modello (non vuota) con il suo stile condiviso. */
function scriviCella(cella: Cell, x: Exclude<Cella, null>, grassetto: boolean): void {
  const { valore, formato } = valoreDi(x)
  cella.value = valore
  cella.style = (grassetto ? STILI_GRASSETTO : STILI)[formato]
}

async function scriviFoglio(
  cartella: Workbook, foglio: Foglio, grafici: GraficoDaDisegnare[], immagini: ReadonlyMap<string, Uint8Array>, segnale?: AbortSignal,
): Promise<void> {
  const { intestazione, colonne, righe } = foglio
  const ws: Worksheet = cartella.addWorksheet(foglio.nome, intestazione ? { views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }] } : {})
  colonne.forEach((c, i) => { ws.getColumn(i + 1).width = c.larghezza })

  // Con l'intestazione la riga 1 sono i titoli e i dati partono dalla 2; senza (Grafici, Info) i dati partono dalla 1.
  const scarto = intestazione ? 1 : 0
  if (intestazione) {
    const riga = ws.getRow(1)
    colonne.forEach((c, i) => scriviCella(riga.getCell(i + 1), c.titolo, true))
  }
  // in grassetto i titoli dei blocchi di Info e quelli dei grafici
  const inGrassetto = new Set(foglio.titoliDiBlocco)
  if (foglio.tipo === 'grafici') for (const g of grafici) inGrassetto.add(g.riga)
  for (let r = 0; r < righe.length; r++) {
    const valori = righe[r]
    if (valori.length > 0) {
      const riga = ws.getRow(r + 1 + scarto)
      const grassetto = inGrassetto.has(r)
      for (let i = 0; i < valori.length; i++) {
        const x = valori[i]
        if (x !== null) scriviCella(riga.getCell(i + 1), x, grassetto)
      }
    }
    if (r % RIGHE_PER_PAUSA === RIGHE_PER_PAUSA - 1) {
      await pausa()
      segnale?.throwIfAborted()
    }
  }
  if (intestazione && colonne.length > 0) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: righe.length + 1, column: colonne.length } }
  }

  if (foglio.tipo !== 'grafici') return
  for (const g of grafici) {
    // `g.riga` è l'indice in `righe` della riga del titolo; le ancore di exceljs contano le righe da 0 come `righe`.
    const png = immagini.get(g.parametroId)
    if (png === undefined) {
      scriviCella(ws.getCell(g.riga + 2 + scarto, 1), IMMAGINE_NON_DISPONIBILE, false)
      continue
    }
    const id = cartella.addImage({ buffer: png as unknown as Parameters<Workbook['addImage']>[0]['buffer'], extension: 'png' })
    ws.addImage(id, {
      tl: { col: 0, row: g.riga + 1 + scarto },
      ext: { width: LARGHEZZA_IMMAGINE, height: ALTEZZA_IMMAGINE },
      editAs: 'oneCell',
    })
  }
}

/**
 * La cartella come file .xlsx (un Blob da consegnare): un foglio per `Foglio`, nell'ordine; con l'intestazione la riga 1
 * ha i titoli in grassetto, è bloccata e ha il filtro automatico su tutta la tabella; larghezze dal modello. Nel foglio
 * Grafici ogni PNG (`immagini`, per id del parametro) va sotto il titolo del suo grafico, a 800 × 450; un grafico senza
 * PNG ha al suo posto la riga `Immagine non disponibile su questo browser.`. Con `segnale` interrotto (la pagina lasciata)
 * si ferma alla prima pausa con un `AbortError`.
 */
export async function scriviCartella(
  cartella: Cartella, immagini: ReadonlyMap<string, Uint8Array>, { segnale }: { segnale?: AbortSignal } = {},
): Promise<Blob> {
  const Cartella = await caricaExcel()
  segnale?.throwIfAborted()
  const wb = new Cartella()
  wb.creator = 'FastLab'
  wb.lastModifiedBy = 'FastLab'
  wb.created = new Date()
  wb.modified = wb.created

  for (const foglio of cartella.fogli) {
    await scriviFoglio(wb, foglio, cartella.grafici, immagini, segnale)
    // tra un foglio e l'altro la pagina ridisegna (la fase resta visibile) e si può lasciare
    await pausa()
    segnale?.throwIfAborted()
  }
  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], { type: TIPO_XLSX })
}
