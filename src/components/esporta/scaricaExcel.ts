import { createElement } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { caricaConfig } from '@/api/esperimenti'
import { misureStrumento, ultimaMisuraPerStrumento } from '@/api/misure'
import { listaNote } from '@/api/note'
import { chiavi, ultimaDataConMisure } from '@/api/query'
import { GraficoSvg } from '@/components/dataset/GraficoSvg'
import { senzaNoteInEliminazione } from '@/components/note/eliminaNotaConAnnulla'
import { strumentiPerScelta } from '@/domain/dataset'
import { costruisciCartella, type Cartella, type GraficoDaDisegnare } from '@/domain/export/fogli'
import { migliaia } from '@/domain/export/riepilogo'
import { applicaAllaConfigurazione, leggiSceltaExport, type SceltaExport } from '@/domain/export/scelte'
import type { ConfigEsperimento } from '@/domain/tipi'
import { oggiLocale } from '@/lib/date'
import { ErroreApp } from '@/lib/errori'
import { ALTEZZA_IMMAGINE, LARGHEZZA_IMMAGINE, scriviCartella } from '@/lib/excel/scriviXlsx'
import { fontDati, svgInPng } from '@/lib/graficoPng'
import { consegna } from '@/lib/scaricaFile'
import { OPZIONI_ERRORE_TARDIVO } from '@/lib/toastErrore'

/**
 * "Scarica Excel" (Piano D, Task D8): l'orchestratore che porta dalle scelte al file consegnato, in tre fasi che la
 * pagina Esporta mostra sotto il pulsante (`onProgresso`, `testoFase`):
 * 1. `Preparo i dati…`: rilegge dal server, non dalla cache, configurazione, misure degli strumenti scelti, note e ultima
 *    data con misure (`fetchQuery` con `staleTime: 0`), e rifà la cartella con `costruisciCartella`. Così il file dice
 *    i numeri veri del momento del tocco anche se il riepilogo era rimasto indietro (Decisione 9);
 * 2. `Disegno i grafici 3 di 12…`: per ogni grafico `GraficoSvg perImmagine` (lo stesso disegno del Dataset) diventa
 *    markup con `renderToStaticMarkup` e poi PNG con `svgInPng`. Al primo grafico che il browser non disegna ci si
 *    ferma: il file parte con le immagini già fatte, gli altri grafici hanno la riga di ripiego e il toast lo dice;
 * 3. `Scrivo il file…`: `scriviCartella` (exceljs, nel suo chunk) e `consegna`.
 *
 * `react-dom/server` ed exceljs arrivano con un import dinamico: restano fuori dal bundle principale.
 *
 * Un solo download alla volta: un secondo tocco mentre il primo lavora non fa niente. Con `segnale` interrotto (la
 * pagina lasciata a metà) il lavoro si ferma alla prima occasione e nessun file parte dopo: il risultato è `null`, senza
 * toast. Un errore va al chiamante: quelli delle letture così come sono (la pagina li spiega con `messaggioErrore`),
 * quelli della scrittura come `ErroreApp` in italiano.
 */

export type FaseExcel = { fase: 'dati' } | { fase: 'grafici'; numero: number; totale: number } | { fase: 'file' }

export function testoFase(f: FaseExcel): string {
  switch (f.fase) {
    case 'dati': return 'Preparo i dati…'
    case 'grafici': return `Disegno i grafici ${f.numero} di ${f.totale}…`
    case 'file': return 'Scrivo il file…'
  }
}

export interface DatiScaricaExcel {
  queryClient: QueryClient
  espId: string
  /** Le scelte della pagina (anche da un export salvato): si rileggono con `leggiSceltaExport`. */
  scelta: SceltaExport
  /** La data locale di oggi (`useOggi`), la stessa del riepilogo: nome del file e "ultime N settimane". */
  oggi?: string
  onProgresso?: (fase: FaseExcel) => void
  /** Interrotto quando la pagina si chiude: nessun file parte dopo. */
  segnale?: AbortSignal
}

export interface EsitoExcel {
  nomeFile: string
  /** Le righe del foglio Dati, o `null` senza quel foglio. */
  righeDati: number | null
  /** I grafici della cartella e quanti hanno l'immagine nel file. */
  grafici: number
  graficiNelFile: number
}

export const SCELTA_NON_VALIDA = 'Le scelte dell\'export non sono valide: controllale e riprova.'
export const SCRITTURA_NON_RIUSCITA =
  'Non sono riuscito a scrivere il file Excel: riprova. Se succede ancora, esporta meno dati (meno strumenti o un periodo più breve).'

/** Il download in corso, con il segnale di chi l'ha chiesto. */
let inCorso: { promessa: Promise<EsitoExcel | null>; segnale?: AbortSignal } | null = null

const eInterruzione = (e: unknown) => typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError'

/**
 * Gli ids degli strumenti da leggere: quelli scelti che ci sono ancora, o tutti (anche gli archiviati, che sono nel file).
 * Esporta li legge con la stessa regola per il riepilogo, così il conto e il file partono dalle stesse misure.
 */
export function strumentiDaLeggere(scelta: SceltaExport, config: ConfigEsperimento): string[] {
  const { strumenti } = applicaAllaConfigurazione(scelta, config).scelta
  return strumenti.modo === 'tutti' ? strumentiPerScelta(config).map(s => s.id) : strumenti.ids
}

/** Il titolo scritto nell'immagine: `SPAD · media per trattamento ± ES` (per i sì/no non c'è errore standard). */
function titoloImmagine(g: GraficoDaDisegnare): string {
  return g.scala === 'percentuale' ? `${g.titolo} · per trattamento` : `${g.titolo} · media per trattamento ± ES`
}

/**
 * Il disegno dei grafici come markup SVG, o `null` se `react-dom/server` non arriva (il chunk non si scarica): allora il
 * file parte senza immagini, come quando il browser non le disegna.
 */
async function preparaDisegno(): Promise<((g: GraficoDaDisegnare) => string) | null> {
  let render: (typeof import('react-dom/server'))['renderToStaticMarkup']
  try {
    render = (await import('react-dom/server')).renderToStaticMarkup
  } catch {
    return null
  }
  const font = await fontDati()
  return g => render(createElement(GraficoSvg, {
    serie: g.serie, note: g.note, scala: g.scala, unita: g.unita, larghezza: LARGHEZZA_IMMAGINE, altezza: ALTEZZA_IMMAGINE,
    titolo: titoloImmagine(g), perImmagine: true, fontIncorporato: font,
  }))
}

/** I PNG dei grafici, per id del parametro, fino al primo che non si disegna; `null` se la pagina è stata lasciata. */
async function disegnaGrafici(
  cartella: Cartella, onProgresso: DatiScaricaExcel['onProgresso'], interrotto: () => boolean,
): Promise<Map<string, Uint8Array> | null> {
  const immagini = new Map<string, Uint8Array>()
  const totale = cartella.grafici.length
  if (totale === 0) return immagini
  const disegna = await preparaDisegno()
  if (interrotto()) return null
  if (disegna === null) return immagini
  for (let i = 0; i < totale; i++) {
    const g = cartella.grafici[i]
    onProgresso?.({ fase: 'grafici', numero: i + 1, totale })
    let png: Uint8Array | null
    try {
      png = await svgInPng(disegna(g), LARGHEZZA_IMMAGINE, ALTEZZA_IMMAGINE)
    } catch {
      png = null
    }
    if (interrotto()) return null
    if (png === null) break
    immagini.set(g.parametroId, png)
  }
  return immagini
}

/** La riga del toast sui grafici che mancano, o `null` se ci sono tutti. */
function avvisoGrafici(grafici: number, nelFile: number): string | null {
  if (nelFile >= grafici) return null
  if (nelFile === 0) return 'I grafici non sono nel file: questo browser non li ha disegnati.'
  const mancano = grafici - nelFile
  return mancano === 1
    ? `1 grafico su ${grafici} non è nel file: questo browser non l'ha disegnato.`
    : `${mancano} grafici su ${grafici} non sono nel file: questo browser non li ha disegnati.`
}

async function lavora({ queryClient, espId, scelta, oggi = oggiLocale(), onProgresso, segnale }: DatiScaricaExcel): Promise<EsitoExcel | null> {
  const letta = leggiSceltaExport(scelta)
  if (!letta) throw new ErroreApp(SCELTA_NON_VALIDA)
  const interrotto = () => segnale?.aborted === true

  // 1. i dati, freschi: `staleTime: 0` rilegge anche una cache appena scritta (e la aggiorna per il riepilogo)
  onProgresso?.({ fase: 'dati' })
  const leggi = <T>(queryKey: readonly unknown[], queryFn: () => Promise<T>) => queryClient.fetchQuery({ queryKey, queryFn, staleTime: 0 })
  const configP = leggi(chiavi.config(espId), () => caricaConfig(espId))
  const [config, note, ultime, misure] = await Promise.all([
    configP,
    leggi(chiavi.note(espId), () => listaNote(espId)),
    leggi(chiavi.ultimeMisure(espId), () => ultimaMisuraPerStrumento(espId)),
    configP.then(c => Promise.all(strumentiDaLeggere(letta, c).map(id => leggi(chiavi.misureStrumento(espId, id), () => misureStrumento(espId, id))))),
  ])
  if (interrotto()) return null
  const cartella = costruisciCartella({
    config, misure: misure.flat(), note: senzaNoteInEliminazione(note), scelta: letta, oggi, adesso: new Date().toISOString(),
    ultimaData: ultimaDataConMisure(ultime),
  })

  // 2. i grafici
  const immagini = await disegnaGrafici(cartella, onProgresso, interrotto)
  if (immagini === null) return null

  // 3. il file
  onProgresso?.({ fase: 'file' })
  let blob: Blob
  try {
    blob = await scriviCartella(cartella, immagini, { segnale })
  } catch (e) {
    if (interrotto() || eInterruzione(e)) return null
    if (e instanceof ErroreApp) throw e
    throw new ErroreApp(SCRITTURA_NON_RIUSCITA)
  }
  if (interrotto()) return null
  consegna(blob, cartella.nomeFile)

  const dati = cartella.fogli.find(f => f.tipo === 'dati')
  const esito: EsitoExcel = {
    nomeFile: cartella.nomeFile, righeDati: dati ? dati.righe.length : null, grafici: cartella.grafici.length, graficiNelFile: immagini.size,
  }
  // Neutro: il verde è solo per "salvato" (DESIGN.md). Se mancano grafici l'avviso resta finché non si chiude.
  const righe = esito.righeDati === null ? '' : ` · ${dati?.nome} ${migliaia(esito.righeDati)} ${esito.righeDati === 1 ? 'riga' : 'righe'}`
  const avviso = avvisoGrafici(esito.grafici, esito.graficiNelFile)
  const testo = `Excel scaricato: ${cartella.nomeFile}${righe}`
  if (avviso === null) toast.success(testo)
  else toast.success(testo, { ...OPZIONI_ERRORE_TARDIVO, description: avviso })
  return esito
}

/**
 * Prepara e consegna il file Excel delle scelte (vedi in testa al file). `null` quando non parte nessun file: un altro
 * download era già in corso (doppio tocco) o la pagina è stata lasciata a metà. Un download lasciato a metà non blocca
 * il successivo: il nuovo aspetta che il vecchio si fermi, poi parte.
 */
export function scaricaExcel(dati: DatiScaricaExcel): Promise<EsitoExcel | null> {
  const precedente = inCorso
  if (precedente !== null && precedente.segnale?.aborted !== true) return Promise.resolve(null)
  const promessa = (async () => {
    if (precedente !== null) await precedente.promessa.catch(() => undefined)
    return lavora(dati)
  })()
  const questo = { promessa, segnale: dati.segnale }
  inCorso = questo
  const libera = () => { if (inCorso === questo) inCorso = null }
  promessa.then(libera, libera)
  return promessa
}
