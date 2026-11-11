import { createElement } from 'react'
import { toast } from 'sonner'
import type { DatiPesatura } from '@/api/pesatura'
import { nomeSicuro } from '@/domain/archivioFoto'
import type { Cartella } from '@/domain/export/fogli'
import { cartellaPesatura, gruppiDeiVasi, ID_GRAFICO_CURVE } from '@/domain/pesatura/export'
import type { CurveSubstrato } from '@/domain/pesatura/curva'
import type { Sensore, SessionePesatura } from '@/domain/pesatura/tipi'
import type { ConfigEsperimento } from '@/domain/tipi'
import { oggiLocale } from '@/lib/date'
import { ErroreApp } from '@/lib/errori'
import { ALTEZZA_IMMAGINE, LARGHEZZA_IMMAGINE, scriviCartella } from '@/lib/excel/scriviXlsx'
import { fontDati, svgInPng } from '@/lib/graficoPng'
import { consegna } from '@/lib/scaricaFile'
import { OPZIONI_ERRORE_TARDIVO } from '@/lib/toastErrore'
import { GraficoCurve } from './GraficoCurve'

/**
 * "Scarica Excel" e "Scarica grafico (PNG)" della Pesatura. La stessa sequenza dell'Excel del Dataset
 * (`components/esporta/scaricaExcel.ts`): il grafico diventa markup con `renderToStaticMarkup`, poi PNG con `svgInPng`,
 * poi `scriviCartella` e `consegna`. Se il browser non disegna il grafico il file parte lo stesso e lo dice.
 */

export const SCRITTURA_NON_RIUSCITA = 'Non sono riuscito a scrivere il file Excel: riprova.'
export const GRAFICO_NON_DISEGNATO = 'Questo browser non riesce a disegnare il grafico: il PNG non è stato creato.'
const AVVISO_GRAFICO = 'Il grafico non è nel file: questo browser non l\'ha disegnato.'

export interface DatiScaricaPesatura {
  sessioni: SessionePesatura[]
  dati: DatiPesatura
  config: ConfigEsperimento
  oggi?: string
}

export interface EsitoPesatura {
  nomeFile: string
  /** I grafici del file e quanti hanno l'immagine. */
  grafici: number
  graficiNelFile: number
}

/** Il disegno di un grafico come markup SVG, o `null` se `react-dom/server` non arriva (il chunk non si scarica). */
async function disegna(gruppi: CurveSubstrato[], sensore: Sensore, titolo: string): Promise<string | null> {
  let render: (typeof import('react-dom/server'))['renderToStaticMarkup']
  try {
    render = (await import('react-dom/server')).renderToStaticMarkup
  } catch {
    return null
  }
  const font = await fontDati()
  return render(createElement(GraficoCurve, { gruppi, sensore, perImmagine: true, titolo, fontIncorporato: font }))
}

async function pngDelleCurve(gruppi: CurveSubstrato[], sensore: Sensore, titolo: string): Promise<Uint8Array | null> {
  const svg = await disegna(gruppi, sensore, titolo)
  if (svg === null) return null
  try {
    return await svgInPng(svg, LARGHEZZA_IMMAGINE, ALTEZZA_IMMAGINE)
  } catch {
    return null
  }
}

/** Costruisce il file Excel delle sessioni date e lo consegna. Se il PNG delle curve non si crea, il file parte senza. */
export async function scaricaPesatura({ sessioni, dati, config, oggi = oggiLocale() }: DatiScaricaPesatura): Promise<EsitoPesatura> {
  const cartella: Cartella = cartellaPesatura(sessioni, dati, config, oggi)

  const immagini = new Map<string, Uint8Array>()
  if (cartella.grafici.length > 0) {
    const { gruppi, sensore } = gruppiDeiVasi(sessioni, dati)
    const png = await pngDelleCurve(gruppi, sensore, cartella.grafici[0].titolo)
    if (png !== null) immagini.set(ID_GRAFICO_CURVE, png)
  }

  let blob: Blob
  try {
    blob = await scriviCartella(cartella, immagini)
  } catch (e) {
    if (e instanceof ErroreApp) throw e
    throw new ErroreApp(SCRITTURA_NON_RIUSCITA)
  }
  consegna(blob, cartella.nomeFile)

  const esito: EsitoPesatura = { nomeFile: cartella.nomeFile, grafici: cartella.grafici.length, graficiNelFile: immagini.size }
  const testo = `Excel scaricato: ${cartella.nomeFile}`
  if (esito.grafici > esito.graficiNelFile) toast.success(testo, { ...OPZIONI_ERRORE_TARDIVO, description: AVVISO_GRAFICO })
  else toast.success(testo)
  return esito
}

/** Scarica il grafico delle curve come PNG. Se il browser non lo disegna lancia un `ErroreApp` che la pagina mostra. */
export async function scaricaGraficoPng(
  { gruppi, sensore, titolo, oggi = oggiLocale() }: { gruppi: CurveSubstrato[]; sensore: Sensore; titolo: string; oggi?: string },
): Promise<string> {
  const png = await pngDelleCurve(gruppi, sensore, titolo)
  if (png === null) throw new ErroreApp(GRAFICO_NON_DISEGNATO)
  const nomeFile = `Pesatura_${nomeSicuro(titolo) || 'analisi'}_curve_${oggi}.png`
  consegna(new Blob([png as BlobPart], { type: 'image/png' }), nomeFile)
  return nomeFile
}
