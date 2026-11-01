import { FOTO_NON_LEGGIBILE, FOTO_TROPPO_GRANDE } from './errori'
import { leggiJpeg, type MetadatiJpeg } from './exif'

/** Lato lungo massimo di una foto salvata, in pixel. */
export const LATO_MASSIMO = 1600
/** Peso a cui si punta (la qualità scende finché il file non sta sotto): circa 350 KB. */
export const BYTE_OBIETTIVO = 350 * 1024
/** Qualità JPEG di partenza e minima, in centesimi per non accumulare errori di virgola mobile scendendo a passi di 5. */
const QUALITA_INIZIALE = 85
const QUALITA_MINIMA = 60
const PASSO_QUALITA = 5

/** Oltre questo peso una foto che non si decodifica è quasi sempre troppo grande per la memoria del telefono. */
const BYTE_TROPPO_GRANDE = 15 * 1024 * 1024

/** Quanto del file si legge per i metadati: l'APP1/EXIF sta nei primi byte e non supera i 64 KB. */
const BYTE_INTESTAZIONE = 256 * 1024

export interface FotoCompressa { blob: Blob; larghezza: number; altezza: number }

/** Le dimensioni finali: lato lungo al massimo `LATO_MASSIMO`, proporzioni intatte, mai ingrandita. */
export function dimensioniRidotte(larghezza: number, altezza: number): { larghezza: number; altezza: number } {
  const scala = Math.min(1, LATO_MASSIMO / Math.max(larghezza, altezza))
  return { larghezza: Math.max(1, Math.round(larghezza * scala)), altezza: Math.max(1, Math.round(altezza * scala)) }
}

/**
 * La matrice di `setTransform` che disegna un'immagine salvata di `larghezza` x `altezza` pixel nella posizione che dice
 * il suo orientamento EXIF (1..8). Per 5..8 il canvas ha larghezza e altezza scambiate.
 */
// Le matrici 2..4 (specchi e 180 gradi) oggi non sono usate: `orientamentoDaApplicare` non le restituisce mai, perché non si
// può sapere se il browser le ha già applicate e quei casi si lasciano a lui. Restano per completezza della tabella EXIF.
export function matriceOrientamento(orientamento: number, l: number, a: number): [number, number, number, number, number, number] {
  switch (orientamento) {
    case 2: return [-1, 0, 0, 1, l, 0]
    case 3: return [-1, 0, 0, -1, l, a]
    case 4: return [1, 0, 0, -1, 0, a]
    case 5: return [0, 1, 1, 0, 0, 0]
    case 6: return [0, 1, -1, 0, a, 0]
    case 7: return [0, -1, -1, 0, a, l]
    case 8: return [0, -1, 1, 0, 0, l]
    default: return [1, 0, 0, 1, 0, 0]
  }
}

/**
 * Quale orientamento deve applicare l'app, 1 se nessuno.
 *
 * I browser moderni raddrizzano da soli le foto: `createImageBitmap` e `<img>` usano per default `image-orientation:
 * from-image`, quindi una foto scattata in verticale (salvata dal sensore 4000x3000 con EXIF 6) arriva già come
 * 3000x4000. Ruotarla ancora la metterebbe di traverso. Se invece il browser non lo fa (versioni vecchie), le dimensioni
 * decodificate sono quelle salvate nel file, e solo allora si applica l'orientamento a mano. Si può distinguere solo per
 * le rotazioni di 90 gradi (5..8) di un'immagine non quadrata, le sole che scambiano larghezza e altezza: per le altre
 * si lascia fare al browser (un browser che ruota senza specchiare non esiste).
 */
export function orientamentoDaApplicare(
  orientamento: number | null,
  salvate: { l: number | null; a: number | null },
  decodificate: { l: number; a: number },
): number {
  if (orientamento === null || orientamento < 5) return 1
  if (salvate.l === null || salvate.a === null || salvate.l === salvate.a) return 1
  const nonApplicato = decodificate.l === salvate.l && decodificate.a === salvate.a
  return nonApplicato ? orientamento : 1
}

/** I primi byte di un file. */
async function leggiInizio(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, BYTE_INTESTAZIONE).arrayBuffer())
}

/**
 * La data di scatto (AAAA-MM-GG, locale) dai metadati EXIF di un JPEG, o null se non c'è o il file non si legge. Lo
 * chiamante usa la data di oggi al suo posto.
 */
export async function dataDiScatto(file: Blob): Promise<string | null> {
  try {
    return leggiJpeg(await leggiInizio(file)).dataScatto
  } catch {
    return null
  }
}

interface Decodificata { sorgente: CanvasImageSource; larghezza: number; altezza: number; chiudi: () => void }

/** Decodifica con `createImageBitmap` (fuori dal thread principale, la pagina non si blocca con una foto da 10 MB). */
async function conBitmap(file: Blob): Promise<Decodificata> {
  // L'orientamento è chiesto in modo esplicito: è il default dei browser moderni, ma così non dipende dalla versione.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  return { sorgente: bitmap, larghezza: bitmap.width, altezza: bitmap.height, chiudi: () => bitmap.close() }
}

/** Decodifica con un `<img>` e un indirizzo temporaneo, dove `createImageBitmap` manca o rifiuta il file. */
async function conImmagine(file: Blob): Promise<Decodificata> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return {
      sorgente: img, larghezza: img.naturalWidth, altezza: img.naturalHeight,
      // Svuotare `src` libera i pixel decodificati: sui telefoni la memoria delle immagini non si recupera aspettando il GC.
      chiudi: () => { img.src = ''; URL.revokeObjectURL(url) },
    }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

async function decodifica(file: Blob): Promise<Decodificata> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await conBitmap(file)
    } catch {
      // Un formato che la bitmap non apre (o un'opzione che il browser non conosce): si prova con l'immagine.
    }
  }
  return conImmagine(file)
}

/** JPEG dal canvas; `toBlob` codifica senza bloccare la pagina. */
function codifica(canvas: HTMLCanvasElement, qualita: number): Promise<Blob> {
  return new Promise((ok, ko) => {
    canvas.toBlob(b => (b ? ok(b) : ko(new Error(FOTO_NON_LEGGIBILE))), 'image/jpeg', qualita)
  })
}

/**
 * Comprime una foto per salvarla: lato lungo al massimo 1600 px, JPEG con qualità da 0,85 a scendere finché il file non
 * sta sotto circa 350 KB (minimo 0,6: oltre si perde troppo, e il bucket accetta fino a 5 MB). I metadati
 * (posizione GPS compresa) non si portano dietro: il canvas riscrive un JPEG pulito.
 *
 * Orientamento: la foto esce nel verso in cui la si vede, vedi `orientamentoDaApplicare`.
 */
export async function comprimi(file: Blob): Promise<FotoCompressa> {
  let meta: MetadatiJpeg
  try {
    meta = leggiJpeg(await leggiInizio(file))
  } catch {
    meta = { orientamento: null, dataScatto: null, larghezza: null, altezza: null }
  }

  let immagine: Decodificata
  try {
    immagine = await decodifica(file)
  } catch {
    throw new Error('size' in file && file.size > BYTE_TROPPO_GRANDE ? FOTO_TROPPO_GRANDE : FOTO_NON_LEGGIBILE)
  }

  let canvas: HTMLCanvasElement | undefined
  try {
    if (!(immagine.larghezza > 0 && immagine.altezza > 0)) throw new Error(FOTO_NON_LEGGIBILE)
    const orientamento = orientamentoDaApplicare(
      meta.orientamento, { l: meta.larghezza, a: meta.altezza }, { l: immagine.larghezza, a: immagine.altezza },
    )
    const ruotata = orientamento >= 5 // larghezza e altezza finali scambiate rispetto alle dimensioni decodificate

    // Dimensioni del file decodificato scalato, e del canvas (che per 5..8 sono scambiate).
    const finali = dimensioniRidotte(ruotata ? immagine.altezza : immagine.larghezza, ruotata ? immagine.larghezza : immagine.altezza)
    const disegno = ruotata ? { l: finali.altezza, a: finali.larghezza } : { l: finali.larghezza, a: finali.altezza }

    canvas = document.createElement('canvas')
    canvas.width = finali.larghezza
    canvas.height = finali.altezza
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error(FOTO_NON_LEGGIBILE)
    // Il JPEG non ha trasparenza: un PNG con sfondo trasparente diventerebbe nero.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (orientamento > 1) ctx.setTransform(...matriceOrientamento(orientamento, disegno.l, disegno.a))
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(immagine.sorgente, 0, 0, disegno.l, disegno.a)

    let blob = await codifica(canvas, QUALITA_INIZIALE / 100)
    for (let q = QUALITA_INIZIALE - PASSO_QUALITA; blob.size > BYTE_OBIETTIVO && q >= QUALITA_MINIMA; q -= PASSO_QUALITA) {
      blob = await codifica(canvas, q / 100)
    }
    return { blob, larghezza: finali.larghezza, altezza: finali.altezza }
  } finally {
    immagine.chiudi()
    // Un canvas da 1600 px pesa circa 10 MB: azzerarlo lo libera subito (Safari li tiene nel conto della memoria).
    if (canvas) canvas.width = canvas.height = 0
  }
}
