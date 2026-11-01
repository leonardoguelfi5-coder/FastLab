/**
 * Lettura minima dei metadati di un JPEG: orientamento e data di scatto dal segmento APP1/EXIF, dimensioni salvate dal
 * segmento SOF. Sono scritti qui, e non presi da una libreria, perché servono tre valori: una dipendenza in più per il
 * bundle dell'app (e per i suoi aggiornamenti di sicurezza) non vale tanto. Non lancia mai: un file strano, troncato o
 * con offset sbagliati dà `null` ai campi che non si leggono.
 */
export interface MetadatiJpeg {
  /** Orientamento EXIF da 1 a 8 (1 = nessuna rotazione), o null se il file non lo dice. */
  orientamento: number | null
  /** Data di scatto locale AAAA-MM-GG (l'EXIF non ha il fuso), o null. */
  dataScatto: string | null
  /** Dimensioni come stanno nel file, prima dell'orientamento. */
  larghezza: number | null
  altezza: number | null
}

const NESSUNO: MetadatiJpeg = { orientamento: null, dataScatto: null, larghezza: null, altezza: null }

/** Tag che servono: orientamento (IFD0), puntatore all'IFD Exif (IFD0), data di scatto e di digitalizzazione (IFD Exif). */
const TAG_ORIENTAMENTO = 0x0112
const TAG_IFD_EXIF = 0x8769
const TAG_DATA_ORIGINALE = 0x9003
const TAG_DATA_DIGITALIZZATA = 0x9004

/** Un IFD vero ha poche decine di voci: oltre questo limite il file è rovinato e non si legge. */
const MAX_VOCI = 512

/** Marcatori di inizio frame (SOF0..SOF15) escluso DHT (C4), JPG (C8) e DAC (CC): contengono le dimensioni. */
const eSof = (m: number): boolean => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc

/** Da `AAAA:MM:GG HH:MM:SS` a `AAAA-MM-GG`, solo se è una data di calendario vera (niente 0000:00:00, né 30 febbraio). */
function dataDaExif(s: string): string | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})\b/.exec(s)
  if (!m) return null
  const [anno, mese, giorno] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (anno < 1900) return null
  const d = new Date(Date.UTC(anno, mese - 1, giorno))
  if (d.getUTCFullYear() !== anno || d.getUTCMonth() !== mese - 1 || d.getUTCDate() !== giorno) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

/** Un lettore del TIFF dentro l'APP1: tutte le letture sono controllate contro la fine dei dati. */
function lettoreTiff(v: DataView, inizio: number, fine: number) {
  const ordine = String.fromCharCode(v.getUint8(inizio), v.getUint8(inizio + 1))
  if (ordine !== 'II' && ordine !== 'MM') return null
  const piccolo = ordine === 'II'
  const dentro = (da: number, n: number) => da >= inizio && da + n <= fine
  return {
    u16: (da: number): number | null => (dentro(da, 2) ? v.getUint16(da, piccolo) : null),
    u32: (da: number): number | null => (dentro(da, 4) ? v.getUint32(da, piccolo) : null),
    testo(da: number, n: number): string | null {
      if (!dentro(da, n)) return null
      let s = ''
      for (let i = 0; i < n; i++) {
        const c = v.getUint8(da + i)
        if (c === 0) break
        s += String.fromCharCode(c)
      }
      return s
    },
    inizio,
  }
}

/** Le voci (tag, tipo, conteggio, posizione del campo valore) di un IFD, all'offset dato dall'inizio del TIFF. */
function voci(l: NonNullable<ReturnType<typeof lettoreTiff>>, offset: number) {
  const base = l.inizio + offset
  const n = l.u16(base)
  if (n === null || n > MAX_VOCI) return []
  const elenco: { tag: number; tipo: number; conteggio: number; campo: number }[] = []
  for (let i = 0; i < n; i++) {
    const p = base + 2 + i * 12
    const tag = l.u16(p), tipo = l.u16(p + 2), conteggio = l.u32(p + 4)
    if (tag === null || tipo === null || conteggio === null || l.u32(p + 8) === null) break
    elenco.push({ tag, tipo, conteggio, campo: p + 8 })
  }
  return elenco
}

/** Orientamento e data dal blocco TIFF dell'APP1. */
function leggiTiff(v: DataView, inizio: number, fine: number): Pick<MetadatiJpeg, 'orientamento' | 'dataScatto'> {
  const l = lettoreTiff(v, inizio, fine)
  if (!l || l.u16(inizio + 2) !== 0x002a) return { orientamento: null, dataScatto: null }
  const offsetIfd0 = l.u32(inizio + 4)
  if (offsetIfd0 === null) return { orientamento: null, dataScatto: null }

  let orientamento: number | null = null
  let offsetExif: number | null = null
  for (const v0 of voci(l, offsetIfd0)) {
    if (v0.tag === TAG_ORIENTAMENTO && v0.tipo === 3 && v0.conteggio === 1) {
      const o = l.u16(v0.campo)
      if (o !== null && o >= 1 && o <= 8) orientamento = o
    }
    if (v0.tag === TAG_IFD_EXIF && v0.tipo === 4) offsetExif = l.u32(v0.campo)
  }

  let originale: string | null = null
  let digitalizzata: string | null = null
  if (offsetExif !== null) {
    for (const ve of voci(l, offsetExif)) {
      if ((ve.tag !== TAG_DATA_ORIGINALE && ve.tag !== TAG_DATA_DIGITALIZZATA) || ve.tipo !== 2 || ve.conteggio < 10) continue
      // Una stringa di più di 4 byte sta altrove: il campo valore contiene il suo offset dall'inizio del TIFF.
      const dove = l.u32(ve.campo)
      const s = dove === null ? null : l.testo(inizio + dove, ve.conteggio)
      const data = s === null ? null : dataDaExif(s)
      if (ve.tag === TAG_DATA_ORIGINALE) originale = data
      else digitalizzata = data
    }
  }
  return { orientamento, dataScatto: originale ?? digitalizzata }
}

/** Legge i metadati dai primi byte di un JPEG (bastano i primi 256 KB: l'APP1 non supera i 64 KB). */
export function leggiJpeg(bytes: Uint8Array): MetadatiJpeg {
  try {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (bytes.length < 4 || v.getUint8(0) !== 0xff || v.getUint8(1) !== 0xd8) return { ...NESSUNO }

    const r: MetadatiJpeg = { ...NESSUNO }
    let exifLetto = false
    let p = 2
    while (p + 4 <= bytes.length) {
      if (v.getUint8(p) !== 0xff) break
      const marcatore = v.getUint8(p + 1)
      if (marcatore === 0xff) { p += 1; continue } // byte di riempimento prima del marcatore
      // Marcatori senza lunghezza: restart, SOI, TEM.
      if (marcatore === 0x01 || (marcatore >= 0xd0 && marcatore <= 0xd8)) { p += 2; continue }
      if (marcatore === 0xd9 || marcatore === 0xda) break // fine immagine o inizio dei dati: dopo non ci sono più intestazioni
      const lunghezza = v.getUint16(p + 2)
      if (lunghezza < 2) break
      const corpo = p + 4
      const fine = Math.min(p + 2 + lunghezza, bytes.length)

      if (marcatore === 0xe1 && !exifLetto && fine - corpo >= 14 &&
          String.fromCharCode(v.getUint8(corpo), v.getUint8(corpo + 1), v.getUint8(corpo + 2), v.getUint8(corpo + 3)) === 'Exif' &&
          v.getUint8(corpo + 4) === 0 && v.getUint8(corpo + 5) === 0) {
        exifLetto = true
        const { orientamento, dataScatto } = leggiTiff(v, corpo + 6, fine)
        r.orientamento = orientamento
        r.dataScatto = dataScatto
      } else if (eSof(marcatore) && fine - corpo >= 5) {
        r.altezza = v.getUint16(corpo + 1) || null
        r.larghezza = v.getUint16(corpo + 3) || null
        break // le dimensioni sono l'ultima cosa che serve (l'EXIF sta sempre prima)
      }
      p += 2 + lunghezza
    }
    return r
  } catch {
    return { ...NESSUNO }
  }
}
