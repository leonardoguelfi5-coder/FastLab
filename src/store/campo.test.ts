import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { oggiLocale } from '@/lib/date'
import { parametro } from '@/domain/test-helpers'
import { useCampoStore } from './campo'

const CHIAVE = 'fastlab-campo'

/** Cosa c'è scritto nel localStorage (il JSON di zustand `persist`). */
const salvato = () => JSON.parse(localStorage.getItem(CHIAVE) ?? 'null')

const tempAria = parametro('Temp aria', { ricorda_tra_piante: true, n_letture: 1 })
const altezza = parametro('Altezza', { ricorda_tra_piante: false })
const note = parametro('Note', { tipo: 'testo', ricorda_tra_piante: true })

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
  it('senza nulla di salvato: nessuna passata, data di oggi, nessun valore ricordato', () => {
    expect(useCampoStore.getState().dati('E')).toEqual({ passataId: null, dataRilievo: '2026-10-28', ricordati: {} })
  })

  it('la data predefinita è quella di oggi: segue il cambio di giorno', () => {
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe(oggiLocale())
    vi.setSystemTime(new Date(2026, 9, 29, 0, 5))
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe('2026-10-29')
  })

  it('scegliere la passata non fissa la data: il giorno dopo vale ancora oggi', () => {
    useCampoStore.getState().setPassata('E', 'p1')
    vi.setSystemTime(new Date(2026, 9, 29, 8, 0))
    expect(useCampoStore.getState().dati('E')).toMatchObject({ passataId: 'p1', dataRilievo: '2026-10-29' })
  })

  it('ricordare un valore non fissa la data', () => {
    useCampoStore.getState().ricorda('E', [tempAria], { [tempAria.id]: [24.5] })
    vi.setSystemTime(new Date(2026, 9, 29, 8, 0))
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe('2026-10-29')
  })
})

describe('useCampoStore: passata e data', () => {
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

  it('setPassata salva la scelta e non tocca data e valori ricordati', () => {
    useCampoStore.getState().setData('E', '2026-10-27')
    useCampoStore.getState().ricorda('E', [tempAria], { [tempAria.id]: [24.5] })
    useCampoStore.getState().setPassata('E', 'p1')
    expect(useCampoStore.getState().dati('E')).toEqual({
      passataId: 'p1', dataRilievo: '2026-10-27', ricordati: { [tempAria.id]: [24.5] },
    })
    expect(salvato().state.stato.E.passataId).toBe('p1')
  })

  it('ogni esperimento ha le sue scelte', () => {
    useCampoStore.getState().setPassata('E', 'p1')
    useCampoStore.getState().setData('E', '2026-10-27')
    expect(useCampoStore.getState().dati('F')).toEqual({ passataId: null, dataRilievo: '2026-10-28', ricordati: {} })
  })

  it('dopo il ricaricamento della pagina le scelte tornano dal localStorage', async () => {
    useCampoStore.getState().setPassata('E', 'p1')
    useCampoStore.getState().setData('E', '2026-10-27')
    useCampoStore.getState().ricorda('E', [tempAria], { [tempAria.id]: [24.5] })

    // Come una pagina appena aperta: in memoria non c'è niente, nel localStorage sì (setState riscrive il salvataggio).
    const sulDisco = localStorage.getItem(CHIAVE)!
    useCampoStore.setState({ stato: {} })
    localStorage.setItem(CHIAVE, sulDisco)
    expect(useCampoStore.getState().dati('E').passataId).toBeNull()
    await useCampoStore.persist.rehydrate()

    expect(useCampoStore.getState().dati('E')).toEqual({
      passataId: 'p1', dataRilievo: '2026-10-27', ricordati: { [tempAria.id]: [24.5] },
    })
  })

  it('si salva solo lo stato, non le funzioni', () => {
    useCampoStore.getState().setPassata('E', 'p1')
    expect(Object.keys(salvato().state)).toEqual(['stato'])
  })
})

describe('useCampoStore: ricorda', () => {
  it('salva solo i parametri con ricorda_tra_piante', () => {
    useCampoStore.getState().ricorda('E', [tempAria, altezza], { [tempAria.id]: [24.5], [altezza.id]: [41] })
    expect(useCampoStore.getState().dati('E').ricordati).toEqual({ [tempAria.id]: [24.5] })
  })

  it('ignora i parametri senza ricorda_tra_piante anche se non ce n\'è nessuno da ricordare', () => {
    useCampoStore.getState().ricorda('E', [altezza], { [altezza.id]: [41] })
    expect(useCampoStore.getState().dati('E').ricordati).toEqual({})
  })

  it('un nuovo valore sostituisce il precedente e gli altri restano', () => {
    useCampoStore.getState().ricorda('E', [tempAria, note], { [tempAria.id]: [24.5], [note.id]: 'sereno' })
    useCampoStore.getState().ricorda('E', [tempAria, note], { [tempAria.id]: [26] })
    expect(useCampoStore.getState().dati('E').ricordati).toEqual({ [tempAria.id]: [26], [note.id]: 'sereno' })
  })

  it('un parametro lasciato vuoto cancella il valore ricordato (non lo si ripropone alla pianta dopo)', () => {
    useCampoStore.getState().ricorda('E', [tempAria], { [tempAria.id]: [24.5] })
    useCampoStore.getState().ricorda('E', [tempAria], { [tempAria.id]: [null] })
    expect(useCampoStore.getState().dati('E').ricordati).toEqual({})
  })

  it('un parametro assente dai valori (non è nella passata) resta com\'era', () => {
    useCampoStore.getState().ricorda('E', [tempAria], { [tempAria.id]: [24.5] })
    useCampoStore.getState().ricorda('E', [tempAria], {})
    expect(useCampoStore.getState().dati('E').ricordati).toEqual({ [tempAria.id]: [24.5] })
  })

  it('tiene una copia dei valori: cambiare l\'originale non cambia il ricordato', () => {
    const valori = { [tempAria.id]: [24.5] }
    useCampoStore.getState().ricorda('E', [tempAria], valori)
    valori[tempAria.id][0] = 99
    expect(useCampoStore.getState().dati('E').ricordati).toEqual({ [tempAria.id]: [24.5] })
  })

  it('i valori ricordati sono per esperimento', () => {
    useCampoStore.getState().ricorda('E', [tempAria], { [tempAria.id]: [24.5] })
    expect(useCampoStore.getState().dati('F').ricordati).toEqual({})
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
    salvaCosi({ passataId: null, dataRilievo: data, ricordati: {} })
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe('2026-10-28')
  })

  it('una data nel formato AAAA-MM-GG si tiene', () => {
    salvaCosi({ passataId: null, dataRilievo: '2026-10-27', ricordati: {} })
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe('2026-10-27')
  })

  it('anche passata e valori ricordati del tipo sbagliato si ignorano', () => {
    salvaCosi({ passataId: 5, dataRilievo: '2026-10-27', ricordati: 'xyz' })
    expect(useCampoStore.getState().dati('E')).toEqual({ passataId: null, dataRilievo: '2026-10-27', ricordati: {} })
  })

  it('una voce che non è un oggetto vale come vuota', () => {
    salvaCosi('boh')
    expect(useCampoStore.getState().dati('E')).toEqual({ passataId: null, dataRilievo: '2026-10-28', ricordati: {} })
  })

  it('le scelte nuove si scrivono sopra una voce rovinata senza trascinarsi i campi sbagliati', () => {
    salvaCosi({ passataId: 5, dataRilievo: 'ieri', ricordati: 'xyz' })
    useCampoStore.getState().setPassata('E', 'p1')
    useCampoStore.getState().ricorda('E', [tempAria], { [tempAria.id]: [24.5] })
    expect(useCampoStore.getState().stato.E).toEqual({ passataId: 'p1', ricordati: { [tempAria.id]: [24.5] } })
  })

  it('dopo il ricaricamento una data rovinata nel localStorage vale oggi', async () => {
    localStorage.setItem(CHIAVE, JSON.stringify({ state: { stato: { E: { passataId: 'p1', dataRilievo: 'ieri', ricordati: {} } } }, version: 1 }))
    await useCampoStore.persist.rehydrate()
    expect(useCampoStore.getState().dati('E')).toEqual({ passataId: 'p1', dataRilievo: '2026-10-28', ricordati: {} })
  })
})

describe('useCampoStore: salvataggio che non funziona', () => {
  it('se il localStorage rifiuta di scrivere (navigazione privata, spazio finito) la scelta vale comunque in memoria', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('piena', 'QuotaExceededError')
    })
    expect(() => useCampoStore.getState().setPassata('E', 'p1')).not.toThrow()
    expect(useCampoStore.getState().dati('E').passataId).toBe('p1')
  })

  it('se il localStorage non si può leggere il negozio riparte vuoto, senza errori', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('negato', 'SecurityError')
    })
    await expect(useCampoStore.persist.rehydrate()).resolves.not.toThrow()
    expect(useCampoStore.getState().dati('E').passataId).toBeNull()
  })

  it('un salvataggio rovinato (JSON non valido o forma sbagliata) non fa cadere la pagina', async () => {
    localStorage.setItem(CHIAVE, '{non è json')
    await useCampoStore.persist.rehydrate()
    expect(useCampoStore.getState().dati('E').passataId).toBeNull()

    localStorage.setItem(CHIAVE, JSON.stringify({ state: { stato: { E: { passataId: 'p1' } } }, version: 1 }))
    await useCampoStore.persist.rehydrate()
    expect(useCampoStore.getState().dati('E')).toEqual({ passataId: 'p1', dataRilievo: '2026-10-28', ricordati: {} })
  })
})
