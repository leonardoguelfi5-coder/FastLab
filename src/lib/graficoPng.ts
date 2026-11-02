import fileFont from '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url'
import { COLORI_GRAFICO } from '@/domain/grafico'

/**
 * Da SVG a PNG per le immagini dell'Excel (fogli "Grafici"). Tutto in locale: niente rete, niente font da CDN. Se il
 * browser non ce la fa (decodifica, canvas "contaminato", `toBlob` nullo, memoria) la conversione dà `null` e non lancia:
 * il file parte senza immagini e lo dice (Ruling del Piano D, "il file parte senza immagini").
 */

/** Quanto aspettare che il browser decodifichi l'SVG: oltre, l'export non deve restare appeso. */
const ATTESA_DECODIFICA_MS = 10_000

let fontInCache: string | null = null

/**
 * Il woff2 latino di Geist Mono (variabile) come data URL, da incorporare nell'SVG: un SVG usato come immagine non vede
 * i font della pagina. Il file è quello di `@fontsource-variable/geist-mono` servito dall'app stessa. Letto una volta
 * sola; se non si legge (offline senza cache, errore) dà `null` e l'immagine usa `ui-monospace`. Un fallimento non si
 * ricorda: al tentativo dopo si riprova.
 */
export async function fontGeistMono(): Promise<string | null> {
  if (fontInCache) return fontInCache
  try {
    const risposta = await fetch(fileFont)
    if (!risposta.ok) return null
    const byte = new Uint8Array(await risposta.arrayBuffer())
    // String.fromCharCode non regge decine di migliaia di argomenti in una volta: a blocchi.
    let binario = ''
    for (let i = 0; i < byte.length; i += 0x8000) binario += String.fromCharCode(...byte.subarray(i, i + 0x8000))
    fontInCache = `data:font/woff2;base64,${btoa(binario)}`
    return fontInCache
  } catch {
    return null
  }
}

/** Aspetta che l'immagine sia decodificata; rifiuta su errore o dopo `ATTESA_DECODIFICA_MS`. */
function decodifica(immagine: HTMLImageElement, url: string): Promise<void> {
  return new Promise<void>((risolvi, rifiuta) => {
    const timer = setTimeout(() => rifiuta(new Error('decodifica troppo lenta')), ATTESA_DECODIFICA_MS)
    immagine.onload = () => { clearTimeout(timer); risolvi() }
    immagine.onerror = () => { clearTimeout(timer); rifiuta(new Error('SVG non decodificabile')) }
    immagine.src = url
  })
}

/**
 * Trasforma un SVG (con `width` e `height` nel tag) in un PNG a `scala` volte la dimensione: Blob `image/svg+xml`,
 * `Image`, canvas con il fondo foglio, `toBlob('image/png')`. Dà `null` per qualunque errore; l'indirizzo del Blob si
 * libera sempre e il canvas si azzera (su iPhone un canvas grande occupa memoria finché esiste).
 */
export async function svgInPng(svg: string, larghezza: number, altezza: number, scala = 2): Promise<Uint8Array | null> {
  let url: string | null = null
  let canvas: HTMLCanvasElement | null = null
  try {
    url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    const immagine = new Image()
    await decodifica(immagine, url)

    const w = Math.max(1, Math.round(larghezza * scala))
    const h = Math.max(1, Math.round(altezza * scala))
    canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const contesto = canvas.getContext('2d')
    if (!contesto) return null
    contesto.fillStyle = COLORI_GRAFICO.foglio
    contesto.fillRect(0, 0, w, h)
    contesto.drawImage(immagine, 0, 0, w, h)

    const blob = await new Promise<Blob | null>(risolvi => canvas?.toBlob(risolvi, 'image/png'))
    if (!blob) return null
    return new Uint8Array(await blob.arrayBuffer())
  } catch {
    return null
  } finally {
    if (url) URL.revokeObjectURL(url)
    if (canvas) { canvas.width = 0; canvas.height = 0 }
  }
}
