/**
 * Costruisce a mano il minimo di un JPEG (SOI, APP1/EXIF, SOF0, SOS, EOI) per i test della lettura dei metadati: nessun
 * file binario nel repository, e si può scegliere l'ordine dei byte, l'orientamento, la data e le dimensioni salvate.
 * Non è un'immagine che un browser sappia decodificare: serve solo a chi legge le intestazioni.
 */
export interface OpzioniJpeg {
  /** Orientamento EXIF 1..8 (tag 0x0112); assente = nessun tag. */
  orientamento?: number
  /** Data di scatto nel formato EXIF `AAAA:MM:GG HH:MM:SS` (tag 0x9003 nell'IFD Exif). */
  dataOriginale?: string
  /** Data di digitalizzazione (tag 0x9004). */
  dataDigitalizzata?: string
  /** Larghezza e altezza come stanno nel file (SOF0), prima dell'orientamento. */
  larghezza?: number
  altezza?: number
  /** Ordine dei byte del TIFF: `MM` (big endian, quello delle fotocamere Apple) o `II` (little endian). */
  ordine?: 'MM' | 'II'
  /** Senza il segmento APP1 (un JPEG senza EXIF). */
  senzaExif?: boolean
}

const testo = (s: string): number[] => Array.from(s, c => c.charCodeAt(0))

export function creaJpeg(o: OpzioniJpeg = {}): Uint8Array {
  const piccolo = (o.ordine ?? 'MM') === 'II'
  const u16 = (n: number): number[] => (piccolo ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff])
  const u32 = (n: number): number[] =>
    piccolo ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff] : [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
  // Una voce da 12 byte; il valore sta nel campo di 4 byte (una SHORT è allineata a sinistra).
  const voce = (tag: number, tipo: number, conteggio: number, valore: number[]): number[] =>
    [...u16(tag), ...u16(tipo), ...u32(conteggio), ...valore, ...Array(4 - valore.length).fill(0)]

  const ifd0: number[][] = []
  if (o.orientamento !== undefined) ifd0.push(voce(0x0112, 3, 1, u16(o.orientamento)))

  const date: { tag: number; valore: string }[] = []
  if (o.dataOriginale !== undefined) date.push({ tag: 0x9003, valore: o.dataOriginale })
  if (o.dataDigitalizzata !== undefined) date.push({ tag: 0x9004, valore: o.dataDigitalizzata })

  // Disposizione del TIFF: intestazione (8), IFD0, IFD Exif, poi le stringhe delle date.
  const nIfd0 = ifd0.length + (date.length > 0 ? 1 : 0)
  const dimIfd0 = 2 + nIfd0 * 12 + 4
  const inizioExif = 8 + dimIfd0
  const dimIfdExif = 2 + date.length * 12 + 4
  let cursore = inizioExif + dimIfdExif
  const stringhe: number[] = []
  const vociExif = date.map(d => {
    const bytes = [...testo(d.valore), 0]
    const v = voce(d.tag, 2, bytes.length, u32(cursore))
    stringhe.push(...bytes)
    cursore += bytes.length
    return v
  })

  const tiff: number[] = [...testo(o.ordine ?? 'MM'), ...u16(0x002a), ...u32(8)]
  const vociIfd0 = [...ifd0]
  if (date.length > 0) vociIfd0.push(voce(0x8769, 4, 1, u32(inizioExif)))
  tiff.push(...u16(nIfd0), ...vociIfd0.flat(), ...u32(0))
  if (date.length > 0) tiff.push(...u16(date.length), ...vociExif.flat(), ...u32(0), ...stringhe)

  const be16 = (n: number): number[] => [n >> 8, n & 0xff]
  const bytes: number[] = [0xff, 0xd8]
  if (!o.senzaExif) {
    const corpo = [...testo('Exif'), 0, 0, ...tiff]
    bytes.push(0xff, 0xe1, ...be16(corpo.length + 2), ...corpo)
  }
  // Un segmento APP0 (JFIF) qualunque, prima del SOF, come nei file veri.
  bytes.push(0xff, 0xe0, ...be16(16), ...testo('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0)
  // SOF0: precisione, altezza, larghezza, una componente.
  bytes.push(0xff, 0xc0, ...be16(11), 8, ...be16(o.altezza ?? 3000), ...be16(o.larghezza ?? 4000), 1, 1, 0x11, 0)
  // SOS e pochi byte di dati, poi EOI.
  bytes.push(0xff, 0xda, ...be16(8), 1, 1, 0, 0, 63, 0, 1, 2, 3, 0xff, 0xd9)
  return Uint8Array.from(bytes)
}

/** Un File JPEG di prova costruito con `creaJpeg`. */
export function creaFileJpeg(o: OpzioniJpeg = {}, nome = 'foto.jpg'): File {
  return new File([creaJpeg(o) as BlobPart], nome, { type: 'image/jpeg' })
}
