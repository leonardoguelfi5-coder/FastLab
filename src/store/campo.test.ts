import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { oggiLocale } from '@/lib/date'
import { parametro } from '@/domain/test-helpers'
import { useCampoStore } from './campo'

const CHIAVE = 'fastlab-campo'

/** Cosa c'è scritto nel localStorage (il JSON di zustand `persist`). */
const salvato = () => JSON.parse(localStorage.getItem(CHIAVE) ?? 'null')

const tempAria = parametro('Temp aria', { n_letture: 1 })
const altezza = parametro('Altezza')
const note = parametro('Note', { tipo: 'testo' })
const S = 'strumento-1'
const D = '2026-10-28'

beforeEach(() => {
  // "Oggi" nei test: 28 ottobre 2026, ora locale. Solo `Date`: i timer veri servono al resto.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 28, 8, 0))
  localStorage.clear()
  useCampoStore.setState({ stato: {} })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useCampoStore: valori predefiniti', () => {
  it('senza nulla di salvato: nessuno strumento, data di oggi, nessun valore mantenuto', () => {
    expect(useCampoStore.getState().dati('E')).toEqual({ strumentoId: null, dataRilievo: '2026-10-28', mantenuti: null })
  })

  it('la data predefinita è quella di oggi: segue il cambio di giorno', () => {
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe(oggiLocale())
    vi.setSystemTime(new Date(2026, 9, 29, 0, 5))
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe('2026-10-29')
  })

  it('scegliere lo strumento non fissa la data: il giorno dopo vale ancora oggi', () => {
    useCampoStore.getState().setStrumento('E', 'p1')
    vi.setSystemTime(new Date(2026, 9, 29, 8, 0))
    expect(useCampoStore.getState().dati('E')).toMatchObject({ strumentoId: 'p1', dataRilievo: '2026-10-29' })
  })

  it('mantenere un valore non fissa la data', () => {
    useCampoStore.getState().setMantieni('E', S, D, tempAria.id, true)
    useCampoStore.getState().aggiornaMantenuti('E', { [tempAria.id]: [24.5] })
    vi.setSystemTime(new Date(2026, 9, 29, 8, 0))
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe('2026-10-29')
  })
})

describe('useCampoStore: strumento e data', () => {
  it('setData salva la data e la mantiene nel localStorage', () => {
    useCampoStore.getState().setData('E', '2026-10-27')
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe('2026-10-27')
    expect(salvato().state.stato.E.dataRilievo).toBe('2026-10-27')
  })

  it('una data scelta resta anche il giorno dopo (è la data di rilievo, finché non la si cambia)', () => {
    useCampoStore.getState().setData('E', '2026-10-27')
    vi.setSystemTime(new Date(2026, 9, 29, 8, 0))
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe('2026-10-27')
  })

  it('scegliere la data di oggi la riporta a "oggi": domani non resta fissata a ieri', () => {
    useCampoStore.getState().setData('E', '2026-10-27')
    useCampoStore.getState().setData('E', oggiLocale())
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe('2026-10-28')
    vi.setSystemTime(new Date(2026, 9, 29, 8, 0))
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe('2026-10-29')
  })

  it('setStrumento salva la scelta e non tocca data e valori mantenuti', () => {
    useCampoStore.getState().setData('E', '2026-10-27')
    useCampoStore.getState().setMantieni('E', 'p1', '2026-10-27', tempAria.id, true)
    useCampoStore.getState().aggiornaMantenuti('E', { [tempAria.id]: [24.5] })
    useCampoStore.getState().setStrumento('E', 'p1')
    expect(useCampoStore.getState().dati('E')).toEqual({
      strumentoId: 'p1', dataRilievo: '2026-10-27',
      mantenuti: { strumentoId: 'p1', data: '2026-10-27', parametri: [tempAria.id], valori: { [tempAria.id]: [24.5] } },
    })
    expect(salvato().state.stato.E.strumentoId).toBe('p1')
  })

  it('ogni esperimento ha le sue scelte', () => {
    useCampoStore.getState().setStrumento('E', 'p1')
    useCampoStore.getState().setData('E', '2026-10-27')
    expect(useCampoStore.getState().dati('F')).toEqual({ strumentoId: null, dataRilievo: '2026-10-28', mantenuti: null })
  })

  it('dopo il ricaricamento della pagina le scelte tornano dal localStorage', async () => {
    useCampoStore.getState().setStrumento('E', 'p1')
    useCampoStore.getState().setData('E', '2026-10-27')
    useCampoStore.getState().setMantieni('E', 'p1', '2026-10-27', tempAria.id, true)
    useCampoStore.getState().aggiornaMantenuti('E', { [tempAria.id]: [24.5] })

    // Come una pagina appena aperta: in memoria non c'è niente, nel localStorage sì (setState riscrive il salvataggio).
    const sulDisco = localStorage.getItem(CHIAVE)!
    useCampoStore.setState({ stato: {} })
    localStorage.setItem(CHIAVE, sulDisco)
    expect(useCampoStore.getState().dati('E').strumentoId).toBeNull()
    await useCampoStore.persist.rehydrate()

    expect(useCampoStore.getState().dati('E')).toEqual({
      strumentoId: 'p1', dataRilievo: '2026-10-27',
      mantenuti: { strumentoId: 'p1', data: '2026-10-27', parametri: [tempAria.id], valori: { [tempAria.id]: [24.5] } },
    })
  })

  it('un salvataggio di prima della rinomina (passataId) vale come strumento scelto', async () => {
    localStorage.setItem(CHIAVE, JSON.stringify({
      state: { stato: { E: { passataId: 'p1' }, F: { passataId: 'vecchio', strumentoId: 'nuovo' } } },
      version: 1,
    }))
    await useCampoStore.persist.rehydrate()
    expect(useCampoStore.getState().dati('E').strumentoId).toBe('p1')
    // Se ci sono tutte e due, vale la chiave nuova.
    expect(useCampoStore.getState().dati('F').strumentoId).toBe('nuovo')
    // La prossima scrittura salva solo la chiave nuova.
    useCampoStore.getState().setData('E', '2026-10-27')
    expect(salvato().state.stato.E).toEqual({ strumentoId: 'p1', dataRilievo: '2026-10-27' })
  })

  it('si salva solo lo stato, non le funzioni', () => {
    useCampoStore.getState().setStrumento('E', 'p1')
    expect(Object.keys(salvato().state)).toEqual(['stato'])
  })
})

describe('useCampoStore: mantieni questo parametro uguale', () => {
  const store = () => useCampoStore.getState()

  it('setMantieni su strumento S e data D: dati() con S e D riporta il parametro tra quelli spuntati', () => {
    store().setStrumento('E', S)
    store().setData('E', '2026-10-27')
    store().setMantieni('E', S, '2026-10-27', tempAria.id, true)
    expect(store().dati('E').mantenuti).toEqual({ strumentoId: S, data: '2026-10-27', parametri: [tempAria.id], valori: {} })
  })

  it('la data implicita "oggi" conta come data corrente', () => {
    store().setStrumento('E', S)
    store().setMantieni('E', S, store().dati('E').dataRilievo, tempAria.id, true)
    expect(store().dati('E').mantenuti?.parametri).toEqual([tempAria.id])
    // Il giorno dopo la data implicita è un'altra: i mantenuti di ieri non valgono più.
    vi.setSystemTime(new Date(2026, 9, 29, 8, 0))
    expect(store().dati('E').mantenuti).toBeNull()
  })

  it('cambiando strumento o data i mantenuti non valgono più (null)', () => {
    store().setStrumento('E', S)
    store().setData('E', '2026-10-27')
    store().setMantieni('E', S, '2026-10-27', tempAria.id, true)
    store().aggiornaMantenuti('E', { [tempAria.id]: [24.5] })
    expect(store().dati('E').mantenuti).not.toBeNull()
    store().setData('E', '2026-10-26')
    expect(store().dati('E').mantenuti).toBeNull()
    store().setData('E', '2026-10-27')
    store().setStrumento('E', 'altro')
    expect(store().dati('E').mantenuti).toBeNull()
  })

  it('cambiare strumento o data scarta i mantenuti salvati: tornando indietro non riappaiono', () => {
    store().setStrumento('E', S)
    store().setData('E', '2026-10-27')
    store().setMantieni('E', S, '2026-10-27', tempAria.id, true)
    store().setStrumento('E', 'altro')
    expect(store().stato.E.mantenuti).toBeUndefined()
    store().setStrumento('E', S)
    expect(store().dati('E').mantenuti).toBeNull()

    store().setMantieni('E', S, '2026-10-27', tempAria.id, true)
    store().setData('E', '2026-10-26')
    expect(store().stato.E.mantenuti).toBeUndefined()
    store().setData('E', '2026-10-27')
    expect(store().dati('E').mantenuti).toBeNull()
  })

  it('ribadire la stessa data (la scheda lo fa a mezzanotte per tenere il giorno) o lo stesso strumento tiene i mantenuti', () => {
    store().setStrumento('E', S)
    store().setMantieni('E', S, D, tempAria.id, true)
    store().aggiornaMantenuti('E', { [tempAria.id]: [24.5] })
    store().setStrumento('E', S)
    expect(store().dati('E').mantenuti?.valori).toEqual({ [tempAria.id]: [24.5] })
    // Passata la mezzanotte la scheda fissa il giorno di prima (setData con la data di ieri): i mantenuti restano.
    vi.setSystemTime(new Date(2026, 9, 29, 0, 5))
    store().setData('E', D)
    expect(store().dati('E')).toMatchObject({ dataRilievo: D, mantenuti: { data: D, valori: { [tempAria.id]: [24.5] } } })
  })

  it('mantenutiPer dà i mantenuti validi per uno strumento e una data qualsiasi (non quelli dello store)', () => {
    store().setMantieni('E', S, D, tempAria.id, true)
    expect(store().mantenutiPer('E', S, D)?.parametri).toEqual([tempAria.id])
    expect(store().mantenutiPer('E', 'altro', D)).toBeNull()
    expect(store().mantenutiPer('E', S, '2026-10-27')).toBeNull()
    expect(store().mantenutiPer('F', S, D)).toBeNull()
    // Lo stesso oggetto finché lo stato non cambia: si può usare come selettore.
    expect(store().mantenutiPer('E', S, D)).toBe(store().mantenutiPer('E', S, D))
  })

  it('setMantieni con strumento o data diversi da quelli salvati riparte da zero', () => {
    store().setMantieni('E', S, D, tempAria.id, true)
    store().aggiornaMantenuti('E', { [tempAria.id]: [24.5] })
    store().setMantieni('E', S, '2026-10-27', note.id, true)
    expect(store().mantenutiPer('E', S, '2026-10-27')).toEqual({ strumentoId: S, data: '2026-10-27', parametri: [note.id], valori: {} })
    store().setMantieni('E', 'altro', '2026-10-27', altezza.id, true)
    expect(store().mantenutiPer('E', 'altro', '2026-10-27')).toEqual({ strumentoId: 'altro', data: '2026-10-27', parametri: [altezza.id], valori: {} })
  })

  it('spuntare un altro parametro nello stesso contesto lo aggiunge e tiene i valori degli altri', () => {
    store().setMantieni('E', S, D, tempAria.id, true)
    store().aggiornaMantenuti('E', { [tempAria.id]: [24.5] })
    store().setMantieni('E', S, D, note.id, true)
    store().setMantieni('E', S, D, note.id, true)
    expect(store().mantenutiPer('E', S, D)).toEqual({
      strumentoId: S, data: D, parametri: [tempAria.id, note.id], valori: { [tempAria.id]: [24.5] },
    })
  })

  it('togliere la spunta toglie il parametro e il suo valore', () => {
    store().setMantieni('E', S, D, tempAria.id, true)
    store().setMantieni('E', S, D, note.id, true)
    store().aggiornaMantenuti('E', { [tempAria.id]: [24.5], [note.id]: 'sereno' })
    store().setMantieni('E', S, D, tempAria.id, false)
    expect(store().mantenutiPer('E', S, D)).toEqual({ strumentoId: S, data: D, parametri: [note.id], valori: { [note.id]: 'sereno' } })
  })

  it('aggiornaMantenuti salva solo i parametri spuntati', () => {
    store().setMantieni('E', S, D, tempAria.id, true)
    store().aggiornaMantenuti('E', { [tempAria.id]: [24.5], [altezza.id]: [41] })
    expect(store().mantenutiPer('E', S, D)?.valori).toEqual({ [tempAria.id]: [24.5] })
  })

  it('senza nessuna spunta aggiornaMantenuti non fa nulla', () => {
    store().aggiornaMantenuti('E', { [tempAria.id]: [24.5] })
    expect(store().stato.E).toBeUndefined()
    store().setMantieni('E', S, D, tempAria.id, true)
    store().setMantieni('E', S, D, tempAria.id, false)
    store().aggiornaMantenuti('E', { [tempAria.id]: [24.5] })
    expect(store().mantenutiPer('E', S, D)?.valori).toEqual({})
  })

  it('un nuovo valore sostituisce il precedente e gli altri restano', () => {
    store().setMantieni('E', S, D, tempAria.id, true)
    store().setMantieni('E', S, D, note.id, true)
    store().aggiornaMantenuti('E', { [tempAria.id]: [24.5], [note.id]: 'sereno' })
    store().aggiornaMantenuti('E', { [tempAria.id]: [26] })
    expect(store().mantenutiPer('E', S, D)?.valori).toEqual({ [tempAria.id]: [26], [note.id]: 'sereno' })
  })

  it('un parametro lasciato vuoto cancella il valore mantenuto ma resta spuntato', () => {
    store().setMantieni('E', S, D, tempAria.id, true)
    store().setMantieni('E', S, D, note.id, true)
    store().aggiornaMantenuti('E', { [tempAria.id]: [24.5], [note.id]: 'sereno' })
    store().aggiornaMantenuti('E', { [tempAria.id]: [null], [note.id]: '  ' })
    expect(store().mantenutiPer('E', S, D)).toEqual({ strumentoId: S, data: D, parametri: [tempAria.id, note.id], valori: {} })
  })

  it('un sì/no "no" è un valore, non un vuoto', () => {
    store().setMantieni('E', S, D, 'fiori', true)
    store().aggiornaMantenuti('E', { fiori: false })
    expect(store().mantenutiPer('E', S, D)?.valori).toEqual({ fiori: false })
    store().aggiornaMantenuti('E', { fiori: null })
    expect(store().mantenutiPer('E', S, D)?.valori).toEqual({})
  })

  it('un parametro assente dai valori (non è nello strumento) resta com\'era', () => {
    store().setMantieni('E', S, D, tempAria.id, true)
    store().aggiornaMantenuti('E', { [tempAria.id]: [24.5] })
    store().aggiornaMantenuti('E', {})
    expect(store().mantenutiPer('E', S, D)?.valori).toEqual({ [tempAria.id]: [24.5] })
  })

  it('tiene una copia profonda dei valori: cambiare l\'originale non cambia il mantenuto', () => {
    store().setMantieni('E', S, D, tempAria.id, true)
    const valori = { [tempAria.id]: [24.5] }
    store().aggiornaMantenuti('E', valori)
    valori[tempAria.id][0] = 99
    expect(store().mantenutiPer('E', S, D)?.valori).toEqual({ [tempAria.id]: [24.5] })
  })

  it('i mantenuti sono per esperimento', () => {
    store().setMantieni('E', S, D, tempAria.id, true)
    expect(store().mantenutiPer('F', S, D)).toBeNull()
    expect(store().dati('F').mantenuti).toBeNull()
  })

  it('i mantenuti si salvano nel localStorage e tornano dopo il ricaricamento', async () => {
    store().setMantieni('E', S, D, tempAria.id, true)
    store().aggiornaMantenuti('E', { [tempAria.id]: [24.5] })
    expect(salvato().state.stato.E.mantenuti).toEqual({ strumentoId: S, data: D, parametri: [tempAria.id], valori: { [tempAria.id]: [24.5] } })
    const sulDisco = localStorage.getItem(CHIAVE)!
    useCampoStore.setState({ stato: {} })
    localStorage.setItem(CHIAVE, sulDisco)
    await useCampoStore.persist.rehydrate()
    expect(store().mantenutiPer('E', S, D)?.valori).toEqual({ [tempAria.id]: [24.5] })
  })

  it('un salvataggio vecchio con ricordati (e senza mantenuti) non rompe nulla: mantenuti null', async () => {
    localStorage.setItem(CHIAVE, JSON.stringify({
      state: { stato: { E: { strumentoId: 'p1', dataRilievo: '2026-10-27', ricordati: { [tempAria.id]: [24.5] } } } },
      version: 1,
    }))
    await useCampoStore.persist.rehydrate()
    expect(store().dati('E')).toEqual({ strumentoId: 'p1', dataRilievo: '2026-10-27', mantenuti: null })
    // La prossima scrittura non si trascina i ricordati.
    store().setData('E', '2026-10-26')
    expect(salvato().state.stato.E).toEqual({ strumentoId: 'p1', dataRilievo: '2026-10-26' })
  })

  it.each([
    ['non è un oggetto', 'boh'],
    ['senza strumento', { data: D, parametri: [], valori: {} }],
    ['con la data sbagliata', { strumentoId: S, data: 'ieri', parametri: [], valori: {} }],
    ['con parametri che non è un elenco', { strumentoId: S, data: D, parametri: 'x', valori: {} }],
    ['con valori che non sono un oggetto', { strumentoId: S, data: D, parametri: [], valori: 5 }],
  ])('mantenuti rovinati (%s) valgono come nessun mantenuto', (_nome, mantenuti) => {
    useCampoStore.setState({ stato: { E: { strumentoId: S, mantenuti } as never } })
    expect(store().dati('E').mantenuti).toBeNull()
    expect(store().mantenutiPer('E', S, D)).toBeNull()
  })

  it('i parametri spuntati senza valore nei valori, o non spuntati ma con valore, si rimettono in ordine', () => {
    useCampoStore.setState({ stato: { E: { strumentoId: S, mantenuti: { strumentoId: S, data: D, parametri: ['a', 5], valori: { a: [1], b: [2] } } } as never } })
    expect(store().mantenutiPer('E', S, D)).toEqual({ strumentoId: S, data: D, parametri: ['a'], valori: { a: [1] } })
  })
})

describe('useCampoStore: uso nei componenti', () => {
  it('useCampoStore(s => s.dati(id)) non rende all\'infinito: il risultato è lo stesso finché lo stato non cambia', () => {
    const { result, rerender } = renderHook(() => useCampoStore(s => s.dati('E')))
    const primo = result.current
    rerender()
    expect(result.current).toBe(primo)
    expect(useCampoStore.getState().dati('E')).toBe(primo)
  })

  it('dati(id, oggi) usa il giorno che gli si dà, non l\'orologio', () => {
    expect(useCampoStore.getState().dati('E', '2026-11-02').dataRilievo).toBe('2026-11-02')
    useCampoStore.getState().setData('E', '2026-10-27')
    expect(useCampoStore.getState().dati('E', '2026-11-02').dataRilievo).toBe('2026-10-27')
  })

  it('chi chiede con giorni diversi (un componente non ancora aggiornato) trova sempre il proprio oggetto', () => {
    const { dati } = useCampoStore.getState()
    const ieri = dati('E', '2026-10-28')
    const oggi = dati('E', '2026-10-29')
    expect(oggi).not.toBe(ieri)
    expect(dati('E', '2026-10-28')).toBe(ieri)
    expect(dati('E', '2026-10-29')).toBe(oggi)
  })
})

describe('useCampoStore: salvataggio con valori non validi', () => {
  const salvaCosi = (voce: unknown) => useCampoStore.setState({ stato: { E: voce as never } })

  it.each([
    ['vuota', ''],
    ['in un altro formato', '27/10/2026'],
    ['senza zeri', '2026-1-5'],
    ['con del testo intorno', ' 2026-10-27'],
    ['non scritta come testo', 20261027],
    ['nulla', null],
  ])('una data %s vale come nessuna data scelta: oggi', (_nome, data) => {
    salvaCosi({ strumentoId: null, dataRilievo: data })
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe('2026-10-28')
  })

  it('una data nel formato AAAA-MM-GG si tiene', () => {
    salvaCosi({ strumentoId: null, dataRilievo: '2026-10-27' })
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe('2026-10-27')
  })

  it('anche strumento e valori mantenuti del tipo sbagliato si ignorano', () => {
    salvaCosi({ strumentoId: 5, dataRilievo: '2026-10-27', mantenuti: 'xyz' })
    expect(useCampoStore.getState().dati('E')).toEqual({ strumentoId: null, dataRilievo: '2026-10-27', mantenuti: null })
  })

  it('una voce che non è un oggetto vale come vuota', () => {
    salvaCosi('boh')
    expect(useCampoStore.getState().dati('E')).toEqual({ strumentoId: null, dataRilievo: '2026-10-28', mantenuti: null })
  })

  it('le scelte nuove si scrivono sopra una voce rovinata senza trascinarsi i campi sbagliati', () => {
    salvaCosi({ strumentoId: 5, dataRilievo: 'ieri', mantenuti: 'xyz' })
    useCampoStore.getState().setStrumento('E', 'p1')
    useCampoStore.getState().setMantieni('E', 'p1', D, tempAria.id, true)
    expect(useCampoStore.getState().stato.E).toEqual({
      strumentoId: 'p1', mantenuti: { strumentoId: 'p1', data: D, parametri: [tempAria.id], valori: {} },
    })
  })

  it('dopo il ricaricamento una data rovinata nel localStorage vale oggi', async () => {
    localStorage.setItem(CHIAVE, JSON.stringify({ state: { stato: { E: { strumentoId: 'p1', dataRilievo: 'ieri' } } }, version: 1 }))
    await useCampoStore.persist.rehydrate()
    expect(useCampoStore.getState().dati('E')).toEqual({ strumentoId: 'p1', dataRilievo: '2026-10-28', mantenuti: null })
  })
})

describe('useCampoStore: salvataggio che non funziona', () => {
  it('se il localStorage rifiuta di scrivere (navigazione privata, spazio finito) la scelta vale comunque in memoria', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('piena', 'QuotaExceededError')
    })
    expect(() => useCampoStore.getState().setStrumento('E', 'p1')).not.toThrow()
    expect(useCampoStore.getState().dati('E').strumentoId).toBe('p1')
  })

  it('se il localStorage non si può leggere il negozio riparte vuoto, senza errori', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('negato', 'SecurityError')
    })
    await expect(useCampoStore.persist.rehydrate()).resolves.not.toThrow()
    expect(useCampoStore.getState().dati('E').strumentoId).toBeNull()
  })

  it('un salvataggio rovinato (JSON non valido o forma sbagliata) non fa cadere la pagina', async () => {
    localStorage.setItem(CHIAVE, '{non è json')
    await useCampoStore.persist.rehydrate()
    expect(useCampoStore.getState().dati('E').strumentoId).toBeNull()

    localStorage.setItem(CHIAVE, JSON.stringify({ state: { stato: { E: { strumentoId: 'p1' } } }, version: 1 }))
    await useCampoStore.persist.rehydrate()
    expect(useCampoStore.getState().dati('E')).toEqual({ strumentoId: 'p1', dataRilievo: '2026-10-28', mantenuti: null })
  })
})
