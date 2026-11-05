import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Misura } from '@/domain/tipi'
import {
  accoda, aggiornaVoce, chiaveCoda, ErroreCoda, impostaUtenteCoda, iscriviti, rimetti, togli, utenteCoda, vociDi,
} from './codaMisure'

const misura = (id: string, extra: Partial<Misura> = {}): Misura => ({
  id, pianta_id: 'p35', strumento_id: 'spad', data_rilievo: '2026-10-28', ora: '09:12', valori: { spad: [38.1] }, ...extra,
})
const DATI = { etichetta: '35', strumento: '💚 SPAD', sulServer: false }

beforeEach(() => {
  localStorage.clear()
  impostaUtenteCoda(null)
})
afterEach(() => {
  vi.restoreAllMocks()
  impostaUtenteCoda(null)
})

describe('accoda e vociDi', () => {
  it('scrive la voce subito nel localStorage, per utente, con lo stato di partenza', () => {
    accoda('u1', 'E', misura('m1'), DATI, Date.parse('2026-10-28T09:12:30Z'))
    expect(localStorage.getItem(chiaveCoda('u1'))).not.toBeNull()
    expect(chiaveCoda('u1')).toBe('fastlab-coda:v1:u1')
    const [voce] = vociDi('u1')
    expect(voce).toMatchObject({
      misura: misura('m1'), espId: 'E', utente: 'u1', accodataIl: '2026-10-28T09:12:30.000Z', tentativi: 0,
      prossimoTentativo: null, stato: 'attesa', errore: null, etichetta: '35', strumento: '💚 SPAD', forseSulServer: false,
    })
    expect(typeof voce.revisione).toBe('string')
    expect(vociDi('u2')).toEqual([])
  })

  it('tiene l\'ordine di accodamento', () => {
    accoda('u1', 'E', misura('m1'), DATI)
    accoda('u1', 'E', misura('m2'), DATI)
    accoda('u1', 'E', misura('m3'), DATI)
    expect(vociDi('u1').map(v => v.misura.id)).toEqual(['m1', 'm2', 'm3'])
  })

  it('lo stesso id sostituisce la voce al suo posto (una correzione prima dell\'invio), da capo e con una revisione nuova', () => {
    accoda('u1', 'E', misura('m1'), DATI)
    accoda('u1', 'E', misura('m2'), DATI)
    const prima = vociDi('u1')[0]
    aggiornaVoce('u1', 'm1', prima.revisione, v => ({ ...v, stato: 'rifiutata', errore: 'No.', tentativi: 2 }))

    accoda('u1', 'E', misura('m1', { valori: { spad: [40] } }), DATI)

    const voci = vociDi('u1')
    expect(voci.map(v => v.misura.id)).toEqual(['m1', 'm2'])
    expect(voci[0]).toMatchObject({ stato: 'attesa', errore: null, tentativi: 0, accodataIl: prima.accodataIl })
    expect(voci[0].misura.valori).toEqual({ spad: [40] })
    expect(voci[0].revisione).not.toBe(prima.revisione)
  })

  it('"forse sul server": di una correzione di una misura del server, e di una voce che è già partita una volta', () => {
    accoda('u1', 'E', misura('m1'), { ...DATI, sulServer: true })
    expect(vociDi('u1')[0].forseSulServer).toBe(true)

    accoda('u1', 'E', misura('m2'), DATI)
    const v2 = vociDi('u1')[1]
    aggiornaVoce('u1', 'm2', v2.revisione, v => ({ ...v, stato: 'invio', forseSulServer: true }))
    // La correzione nel modulo (la misura era solo in coda) non toglie il "forse": il primo invio può essere arrivato.
    accoda('u1', 'E', misura('m2'), { ...DATI, sulServer: false })
    expect(vociDi('u1')[1].forseSulServer).toBe(true)
  })

  it('senza localStorage utilizzabile lancia ErroreCoda (il modulo salva come prima)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('pieno', 'QuotaExceededError') })
    expect(() => accoda('u1', 'E', misura('m1'), DATI)).toThrow(ErroreCoda)
  })

  it('un valore che il JSON non sa scrivere (NaN) non entra in coda: lancia ErroreCoda', () => {
    expect(() => accoda('u1', 'E', misura('m1', { valori: { spad: [Number.NaN] } }), DATI)).toThrow(ErroreCoda)
    expect(vociDi('u1')).toEqual([])
  })

  it('una voce rovinata si scarta e lo si scrive nella console, le altre restano; mai un\'eccezione', () => {
    accoda('u1', 'E', misura('m1'), DATI)
    const voci = JSON.parse(localStorage.getItem(chiaveCoda('u1'))!) as unknown[]
    localStorage.setItem(chiaveCoda('u1'), JSON.stringify([{ rotta: true }, ...voci, { misura: { id: 3 } }]))
    const avviso = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(vociDi('u1').map(v => v.misura.id)).toEqual(['m1'])
    expect(avviso).toHaveBeenCalled()
  })

  it('un testo che non è JSON, o una voce di un altro utente sotto questa chiave, non rompono nulla', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(chiaveCoda('u1'), '{non json')
    expect(vociDi('u1')).toEqual([])

    accoda('u2', 'E', misura('m9'), DATI)
    localStorage.setItem(chiaveCoda('u1'), localStorage.getItem(chiaveCoda('u2'))!)
    expect(vociDi('u1')).toEqual([])
  })

  it('dà lo stesso elenco finché la coda non cambia (useSyncExternalStore)', () => {
    accoda('u1', 'E', misura('m1'), DATI)
    expect(vociDi('u1')).toBe(vociDi('u1'))
    const prima = vociDi('u1')
    accoda('u1', 'E', misura('m2'), DATI)
    expect(vociDi('u1')).not.toBe(prima)
  })
})

describe('togli e rimetti', () => {
  it('togli: tolta, assente, e in_invio per una voce che sta partendo (non la tocca)', () => {
    accoda('u1', 'E', misura('m1'), DATI)
    accoda('u1', 'E', misura('m2'), DATI)
    const v2 = vociDi('u1')[1]
    aggiornaVoce('u1', 'm2', v2.revisione, v => ({ ...v, stato: 'invio' }))

    expect(togli('u1', 'm1')).toBe('tolta')
    expect(togli('u1', 'm1')).toBe('assente')
    expect(togli('u1', 'm2')).toBe('in_invio')
    expect(vociDi('u1').map(v => v.misura.id)).toEqual(['m2'])
    expect(togli('u2', 'm2')).toBe('assente')
  })

  it('rimetti riporta una voce tolta al suo posto nell\'ordine di accodamento', () => {
    accoda('u1', 'E', misura('m1'), DATI, 1000)
    accoda('u1', 'E', misura('m2'), DATI, 2000)
    accoda('u1', 'E', misura('m3'), DATI, 3000)
    const v2 = vociDi('u1')[1]
    togli('u1', 'm2')
    rimetti(v2)
    expect(vociDi('u1').map(v => v.misura.id)).toEqual(['m1', 'm2', 'm3'])
  })
})

describe('aggiornaVoce', () => {
  it('cambia la voce solo se è ancora quella revisione; null la toglie', () => {
    accoda('u1', 'E', misura('m1'), DATI)
    const { revisione } = vociDi('u1')[0]
    expect(aggiornaVoce('u1', 'm1', 'altra', v => ({ ...v, tentativi: 9 }))).toBe(false)
    expect(vociDi('u1')[0].tentativi).toBe(0)
    expect(aggiornaVoce('u1', 'm1', revisione, v => ({ ...v, tentativi: 1 }))).toBe(true)
    expect(vociDi('u1')[0].tentativi).toBe(1)
    expect(aggiornaVoce('u1', 'm1', revisione, () => null)).toBe(true)
    expect(vociDi('u1')).toEqual([])
  })
})

describe('iscriviti e utente', () => {
  it('avvisa a ogni cambio della coda, al cambio di utente e per l\'evento storage di un\'altra scheda', () => {
    const ascoltatore = vi.fn()
    const stacca = iscriviti(ascoltatore)

    accoda('u1', 'E', misura('m1'), DATI)
    expect(ascoltatore).toHaveBeenCalledTimes(1)
    togli('u1', 'm1')
    expect(ascoltatore).toHaveBeenCalledTimes(2)
    impostaUtenteCoda('u1')
    expect(ascoltatore).toHaveBeenCalledTimes(3)
    impostaUtenteCoda('u1')
    expect(ascoltatore).toHaveBeenCalledTimes(3)

    window.dispatchEvent(new StorageEvent('storage', { key: chiaveCoda('u1') }))
    expect(ascoltatore).toHaveBeenCalledTimes(4)
    window.dispatchEvent(new StorageEvent('storage', { key: 'fastlab-bozza:x' }))
    expect(ascoltatore).toHaveBeenCalledTimes(4)
    // `localStorage.clear()` da un'altra scheda: la chiave è null.
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    expect(ascoltatore).toHaveBeenCalledTimes(5)

    stacca()
    accoda('u1', 'E', misura('m2'), DATI)
    expect(ascoltatore).toHaveBeenCalledTimes(5)
  })

  it('una voce scritta da un\'altra scheda si legge appena arriva l\'evento storage', () => {
    accoda('u1', 'E', misura('m1'), DATI)
    const prima = vociDi('u1')
    const testo = JSON.parse(localStorage.getItem(chiaveCoda('u1'))!) as Record<string, unknown>[]
    localStorage.setItem(chiaveCoda('u1'), JSON.stringify([...testo, { ...testo[0], misura: misura('m2'), revisione: 'r2' }]))
    expect(vociDi('u1')).not.toBe(prima)
    expect(vociDi('u1').map(v => v.misura.id)).toEqual(['m1', 'm2'])
  })

  it('utenteCoda dice chi usa la coda adesso', () => {
    expect(utenteCoda()).toBeNull()
    impostaUtenteCoda('u1')
    expect(utenteCoda()).toBe('u1')
  })
})
