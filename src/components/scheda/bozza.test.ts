import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Misura } from '@/domain/tipi'
import { chiaveBozzaNota, leggiBozzaNota, notaAperta, scriviBozzaNota } from '@/components/note/bozzaNota'
import { statoVuoto } from '@/components/note/statoNota'
import {
  assegnaBozze, bozzaDaRiprendere, cancellaBozzaCorrezione, cancellaTutteLeBozze, chiaveAperto, chiaveBozza, GIORNI_BOZZA,
  leggiAperto, leggiBozza, pulisciBozzeVecchie, scriviAperto, scriviBozza, spostaBozzeDallaSessione,
} from './bozza'

const misura: Misura = {
  id: 'm1', pianta_id: 'p1', strumento_id: 'pa1', data_rilievo: '2026-10-21', ora: '09:12', valori: {},
}
const base = { espId: 'E', piantaId: 'p1', strumentoId: 'pa1', dataRilievo: '2026-10-21' }

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const GIORNO = 24 * 60 * 60 * 1000
const chiaveNuova = chiaveBozza({ ...base, misuraId: null })
const chiaveM1 = chiaveBozza({ ...base, misuraId: 'm1' })
/** Le chiavi delle bozze in uno storage, in ordine. */
const chiaviIn = (s: Storage) => Object.keys(s).filter(k => k.startsWith('fastlab-bozza:')).sort()

describe('cancellaBozzaCorrezione', () => {
  it('toglie la bozza di quella misura alla sua data e il ricordo che il modulo era aperto', () => {
    const chiave = chiaveBozza({ ...base, misuraId: 'm1' })
    scriviBozza(chiave, { id: 'm1', valori: {}, ora: null })
    scriviAperto(chiaveAperto(base), 'm1')

    cancellaBozzaCorrezione('E', misura)

    expect(leggiBozza(chiave)).toBeNull()
    expect(leggiAperto(chiaveAperto(base))).toBeNull()
  })

  it('non tocca le bozze di altre misure, della misura nuova, di altre date né il ricordo di un\'altra correzione', () => {
    const altra = chiaveBozza({ ...base, misuraId: 'm2' })
    const nuova = chiaveBozza({ ...base, misuraId: null })
    const altraData = chiaveBozza({ ...base, dataRilievo: '2026-10-22', misuraId: 'm1' })
    for (const [chiave, id] of [[altra, 'm2'], [nuova, 'n'], [altraData, 'm1']] as const) scriviBozza(chiave, { id, valori: {}, ora: null })
    scriviAperto(chiaveAperto(base), 'm2')

    cancellaBozzaCorrezione('E', misura)

    expect(leggiBozza(altra)).not.toBeNull()
    expect(leggiBozza(nuova)).not.toBeNull()
    expect(leggiBozza(altraData)).not.toBeNull()
    expect(leggiAperto(chiaveAperto(base))).toBe('m2')
  })

  it('senza bozze non fa nulla', () => {
    expect(() => cancellaBozzaCorrezione('E', misura)).not.toThrow()
    expect(localStorage.length).toBe(0)
  })
})

describe('bozzaDaRiprendere', () => {
  it('senza bozze è falso', () => {
    expect(bozzaDaRiprendere(base, ['m1'])).toBe(false)
  })

  it('con la bozza della misura nuova è vero', () => {
    scriviBozza(chiaveBozza({ ...base, misuraId: null }), { id: 'n', valori: {}, ora: null })
    expect(bozzaDaRiprendere(base, [])).toBe(true)
  })

  it('con la correzione aperta di una misura del giorno, con la sua bozza, è vero', () => {
    scriviBozza(chiaveBozza({ ...base, misuraId: 'm1' }), { id: 'm1', valori: {}, ora: null })
    scriviAperto(chiaveAperto(base), 'm1')
    expect(bozzaDaRiprendere(base, ['m1'])).toBe(true)
  })

  it('la correzione di una misura che non è più del giorno, o senza bozza, non si riprende', () => {
    scriviBozza(chiaveBozza({ ...base, misuraId: 'm1' }), { id: 'm1', valori: {}, ora: null })
    scriviAperto(chiaveAperto(base), 'm1')
    expect(bozzaDaRiprendere(base, ['m2'])).toBe(false)
    scriviAperto(chiaveAperto(base), 'm2')
    expect(bozzaDaRiprendere(base, ['m2'])).toBe(false)
  })

  it('le bozze di un altro strumento o di un\'altra data non contano', () => {
    scriviBozza(chiaveBozza({ ...base, strumentoId: 'altro', misuraId: null }), { id: 'n', valori: {}, ora: null })
    scriviBozza(chiaveBozza({ ...base, dataRilievo: '2026-10-22', misuraId: null }), { id: 'n', valori: {}, ora: null })
    expect(bozzaDaRiprendere(base, [])).toBe(false)
  })
})

describe('dove stanno le bozze: localStorage', () => {
  it('una bozza sopravvive alla chiusura dell\'app (il sessionStorage vuotato)', () => {
    scriviBozza(chiaveNuova, { id: 'n', valori: { spad: [41.2] }, ora: '09:12' })
    scriviAperto(chiaveAperto(base), 'm1')
    sessionStorage.clear()
    expect(leggiBozza(chiaveNuova)).toEqual({ id: 'n', valori: { spad: [41.2] }, ora: '09:12' })
    expect(leggiAperto(chiaveAperto(base))).toBe('m1')
    expect(sessionStorage.length).toBe(0)
  })

  it('ogni bozza porta scritta_il, l\'istante dell\'ultima scrittura', () => {
    vi.useFakeTimers({ now: new Date('2026-11-05T09:12:00Z') })
    scriviBozza(chiaveNuova, { id: 'n', valori: {}, ora: null })
    expect(JSON.parse(localStorage.getItem(chiaveNuova)!).scritta_il).toBe('2026-11-05T09:12:00.000Z')
    vi.setSystemTime(new Date('2026-11-06T10:00:00Z'))
    scriviBozza(chiaveNuova, { id: 'n', valori: { spad: [1] }, ora: null })
    expect(JSON.parse(localStorage.getItem(chiaveNuova)!).scritta_il).toBe('2026-11-06T10:00:00.000Z')
    // scritta_il resta dentro: chi legge la bozza vede solo id, valori e ora.
    expect(leggiBozza(chiaveNuova)).toEqual({ id: 'n', valori: { spad: [1] }, ora: null })
  })

  it('un numero lasciato a metà (NaN) torna non valido anche dal localStorage', () => {
    scriviBozza(chiaveNuova, { id: 'n', valori: { spad: [41.2, NaN] }, ora: null })
    expect(leggiBozza(chiaveNuova)!.valori.spad).toEqual([41.2, NaN])
  })

  it('senza localStorage (navigazione privata, spazio finito) nulla si rompe', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('pieno') })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloccato') })
    expect(() => scriviBozza(chiaveNuova, { id: 'n', valori: {}, ora: null })).not.toThrow()
    expect(leggiBozza(chiaveNuova)).toBeNull()
    expect(() => pulisciBozzeVecchie(Date.now())).not.toThrow()
    expect(() => spostaBozzeDallaSessione()).not.toThrow()
    expect(() => assegnaBozze('A')).not.toThrow()
  })
})

describe('pulisciBozzeVecchie', () => {
  const inizio = new Date('2026-11-01T08:00:00Z').getTime()
  const scriviIl = (quando: number, chiave: string, id: string) => {
    vi.setSystemTime(quando)
    scriviBozza(chiave, { id, valori: {}, ora: null })
  }
  beforeEach(() => { vi.useFakeTimers({ now: inizio }) })

  it('le bozze si tengono 14 giorni', () => {
    expect(GIORNI_BOZZA).toBe(14)
  })

  it('toglie le bozze non toccate da più di 14 giorni, e non prima', () => {
    scriviIl(inizio, chiaveNuova, 'n')
    pulisciBozzeVecchie(inizio + 14 * GIORNO)
    expect(leggiBozza(chiaveNuova)).not.toBeNull()
    pulisciBozzeVecchie(inizio + 14 * GIORNO + 1)
    expect(leggiBozza(chiaveNuova)).toBeNull()
  })

  it('conta l\'ultima scrittura: una bozza ripresa e ritoccata riparte da capo', () => {
    scriviIl(inizio, chiaveNuova, 'n')
    scriviIl(inizio + 10 * GIORNO, chiaveNuova, 'n')
    pulisciBozzeVecchie(inizio + 20 * GIORNO)
    expect(leggiBozza(chiaveNuova)).not.toBeNull()
  })

  it('toglie solo le vecchie: le altre, il proprietario e le chiavi di altri restano', () => {
    assegnaBozze('A')
    scriviIl(inizio, chiaveNuova, 'n')
    scriviIl(inizio + 10 * GIORNO, chiaveM1, 'm1')
    localStorage.setItem('fastlab-campo', 'resta')
    pulisciBozzeVecchie(inizio + 15 * GIORNO)
    expect(leggiBozza(chiaveNuova)).toBeNull()
    expect(leggiBozza(chiaveM1)).not.toBeNull()
    expect(localStorage.getItem('fastlab-bozza:utente')).toBe('A')
    expect(localStorage.getItem('fastlab-campo')).toBe('resta')
  })

  it('toglie anche le illeggibili (JSON rovinato, senza scritta_il o con una data che non è una data)', () => {
    localStorage.setItem(chiaveNuova, '{non json')
    localStorage.setItem(chiaveM1, JSON.stringify({ id: 'm1', valori: {}, ora: null }))
    const terza = chiaveBozza({ ...base, misuraId: 'm3' })
    localStorage.setItem(terza, JSON.stringify({ id: 'm3', valori: {}, ora: null, scritta_il: 'ieri' }))
    pulisciBozzeVecchie(inizio)
    expect(chiaviIn(localStorage)).toEqual([])
  })

  it('il ricordo del modulo aperto se ne va con la sua bozza, non prima', () => {
    scriviIl(inizio, chiaveM1, 'm1')
    scriviAperto(chiaveAperto(base), 'm1')
    pulisciBozzeVecchie(inizio + 14 * GIORNO)
    expect(leggiAperto(chiaveAperto(base))).toBe('m1')
    pulisciBozzeVecchie(inizio + 15 * GIORNO)
    expect(leggiAperto(chiaveAperto(base))).toBeNull()
  })

  it('le bozze delle note seguono la stessa regola, con il ricordo della nota aperta', () => {
    const nota = { id: 'n1', esistente: false, stato: { ...statoVuoto('2026-11-01'), testo: 'Foglie gialle' } }
    scriviBozzaNota('E', nota)
    expect(typeof JSON.parse(localStorage.getItem(chiaveBozzaNota('E', 'n1'))!).scritta_il).toBe('string')
    pulisciBozzeVecchie(inizio + 14 * GIORNO)
    expect(leggiBozzaNota('E', 'n1')).toEqual(nota)
    expect(notaAperta('E')).toBe('n1')
    pulisciBozzeVecchie(inizio + 15 * GIORNO)
    expect(leggiBozzaNota('E', 'n1')).toBeNull()
    expect(notaAperta('E')).toBeNull()
  })
})

describe('assegnaBozze e cancellaTutteLeBozze (Ruling del Piano 1: legate all\'utente, mai cancellate all\'uscita)', () => {
  it('lo stesso utente le ritrova, un utente diverso le cancella tutte', () => {
    assegnaBozze('A')
    scriviBozza(chiaveNuova, { id: 'n', valori: {}, ora: null })
    scriviAperto(chiaveAperto(base), 'm1')
    assegnaBozze('A')
    expect(leggiBozza(chiaveNuova)).not.toBeNull()
    assegnaBozze('B')
    expect(leggiBozza(chiaveNuova)).toBeNull()
    expect(leggiAperto(chiaveAperto(base))).toBeNull()
    expect(localStorage.getItem('fastlab-bozza:utente')).toBe('B')
  })

  it('le bozze di cui non si sa il proprietario non passano al primo che accede', () => {
    scriviBozza(chiaveNuova, { id: 'n', valori: {}, ora: null })
    assegnaBozze('A')
    expect(leggiBozza(chiaveNuova)).toBeNull()
  })

  it('cancellaTutteLeBozze toglie le bozze di entrambi gli storage e nient\'altro', () => {
    scriviBozza(chiaveNuova, { id: 'n', valori: {}, ora: null })
    sessionStorage.setItem(chiaveM1, '{"id":"m1","valori":{},"ora":null}')
    localStorage.setItem('altro', 'resta')
    cancellaTutteLeBozze()
    expect(chiaviIn(localStorage)).toEqual([])
    expect(chiaviIn(sessionStorage)).toEqual([])
    expect(localStorage.getItem('altro')).toBe('resta')
  })
})

describe('le bozze della versione di prima (nel sessionStorage) passano al localStorage', () => {
  const vecchia = '{"id":"n","valori":{"spad":[41.2,{"$nonValido":true}]},"ora":"09:12"}'
  const adesso = new Date('2026-11-05T09:00:00Z').getTime()
  const scriviVecchie = (utente: string | null) => {
    if (utente !== null) sessionStorage.setItem('fastlab-bozza:utente', utente)
    sessionStorage.setItem(chiaveNuova, vecchia)
    sessionStorage.setItem(chiaveM1, '{"id":"m1","valori":{},"ora":"08:00"}')
    sessionStorage.setItem(chiaveAperto(base), 'm1')
    sessionStorage.setItem(chiaveBozzaNota('E', 'n1'), JSON.stringify({ id: 'n1', esistente: false, stato: statoVuoto('2026-11-01') }))
    sessionStorage.setItem('fastlab-bozza:nota-aperta:E', 'n1')
    sessionStorage.setItem('fastlab:bozza:A:nuovo', 'wizard, non si tocca')
  }

  it('al primo avvio si spostano tutte, con scritta_il di adesso, e non restano nella sessione', () => {
    scriviVecchie('A')
    spostaBozzeDallaSessione(adesso)
    // Il numero lasciato a metà (NaN) resta non valido anche dopo lo spostamento.
    expect(leggiBozza(chiaveNuova)).toEqual({ id: 'n', valori: { spad: [41.2, NaN] }, ora: '09:12' })
    expect(JSON.parse(localStorage.getItem(chiaveNuova)!).scritta_il).toBe('2026-11-05T09:00:00.000Z')
    expect(leggiBozza(chiaveM1)).toEqual({ id: 'm1', valori: {}, ora: '08:00' })
    expect(leggiAperto(chiaveAperto(base))).toBe('m1')
    expect(leggiBozzaNota('E', 'n1')).not.toBeNull()
    expect(notaAperta('E')).toBe('n1')
    expect(localStorage.getItem('fastlab-bozza:utente')).toBe('A')
    expect(chiaviIn(sessionStorage)).toEqual([])
    expect(sessionStorage.getItem('fastlab:bozza:A:nuovo')).toBe('wizard, non si tocca')
    // La pulizia che segue all'avvio non le tocca: per lei sono appena scritte.
    pulisciBozzeVecchie(adesso + 14 * GIORNO)
    expect(leggiBozza(chiaveNuova)).not.toBeNull()
    expect(leggiAperto(chiaveAperto(base))).toBe('m1')
    expect(notaAperta('E')).toBe('n1')
  })

  it('con lo stesso proprietario si aggiungono a quelle del localStorage, che restano (sono più recenti)', () => {
    assegnaBozze('A')
    scriviBozza(chiaveNuova, { id: 'nuovissima', valori: {}, ora: null })
    scriviVecchie('A')
    spostaBozzeDallaSessione(adesso)
    expect(leggiBozza(chiaveNuova)!.id).toBe('nuovissima')
    expect(leggiBozzaNota('E', 'n1')).not.toBeNull()
    expect(chiaviIn(sessionStorage)).toEqual([])
  })

  it('le bozze senza proprietario del localStorage non passano a chi arriva dalla sessione', () => {
    const senzaProprietario = chiaveBozza({ ...base, misuraId: 'm9' })
    scriviBozza(senzaProprietario, { id: 'm9', valori: {}, ora: null })
    scriviVecchie('A')
    spostaBozzeDallaSessione(adesso)
    expect(leggiBozza(senzaProprietario)).toBeNull()
    expect(leggiBozza(chiaveNuova)).not.toBeNull()
  })

  it('di un altro utente o di nessuno restano nella sessione finché non si sa chi accede', () => {
    assegnaBozze('B')
    scriviVecchie('A')
    spostaBozzeDallaSessione(adesso)
    expect(leggiBozza(chiaveNuova)).toBeNull()
    expect(sessionStorage.getItem(chiaveNuova)).toBe(vecchia)

    sessionStorage.clear()
    scriviVecchie(null)
    spostaBozzeDallaSessione(adesso)
    expect(sessionStorage.getItem(chiaveNuova)).toBe(vecchia)
  })

  it('all\'accesso del loro proprietario passano a lui (anche se il localStorage era di un altro)', () => {
    assegnaBozze('B')
    const diB = chiaveBozza({ ...base, misuraId: 'm9' })
    scriviBozza(diB, { id: 'm9', valori: {}, ora: null })
    scriviVecchie('A')
    assegnaBozze('A')
    expect(leggiBozza(diB)).toBeNull()
    expect(leggiBozza(chiaveNuova)).toMatchObject({ id: 'n' })
    expect(leggiBozzaNota('E', 'n1')).not.toBeNull()
    expect(localStorage.getItem('fastlab-bozza:utente')).toBe('A')
    expect(chiaviIn(sessionStorage)).toEqual([])
  })

  it('all\'accesso di un altro utente si cancellano, come faceva la versione di prima', () => {
    scriviVecchie('A')
    assegnaBozze('B')
    expect(leggiBozza(chiaveNuova)).toBeNull()
    expect(chiaviIn(sessionStorage)).toEqual([])
    expect(sessionStorage.getItem('fastlab:bozza:A:nuovo')).toBe('wizard, non si tocca')

    scriviVecchie(null)
    assegnaBozze('B')
    expect(leggiBozza(chiaveNuova)).toBeNull()
    expect(chiaviIn(sessionStorage)).toEqual([])
  })

  it('se il localStorage è pieno nessuna si perde: quelle che non entrano restano nella sessione', () => {
    scriviVecchie('A')
    const originale = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (this === localStorage && k === chiaveNuova) throw new Error('pieno')
      originale.call(this, k, v)
    })
    spostaBozzeDallaSessione(adesso)
    expect(sessionStorage.getItem(chiaveNuova)).toBe(vecchia)
    expect(localStorage.getItem(chiaveNuova)).toBeNull()
    expect(leggiBozzaNota('E', 'n1')).not.toBeNull()
    expect(sessionStorage.getItem(chiaveBozzaNota('E', 'n1'))).toBeNull()
  })

  it('senza bozze nella sessione non fa nulla', () => {
    assegnaBozze('B')
    sessionStorage.setItem('fastlab-bozza:utente', 'A')
    spostaBozzeDallaSessione(adesso)
    expect(localStorage.getItem('fastlab-bozza:utente')).toBe('B')
    expect(chiaviIn(sessionStorage)).toEqual([])
  })
})
