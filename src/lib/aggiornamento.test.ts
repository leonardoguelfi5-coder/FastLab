import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: vi.fn() }))

import { toast } from 'sonner'
import {
  applicaAggiornamento, ascoltaErroriDiCaricamento, avviaAggiornamento, ciSonoModificheNonSalvate, fermaAggiornamento,
  useAggiornamentoPronto, type OpzioniRegistrazione,
} from './aggiornamento'

/** Il registratore finto del service worker: tiene le opzioni ricevute e conta le chiamate di `updateSW`. */
function registratoreFinto() {
  let opzioni: OpzioniRegistrazione = {}
  const aggiorna = vi.fn(async () => {})
  const registra = vi.fn((o: OpzioniRegistrazione) => {
    opzioni = o
    return aggiorna
  })
  return { registra, aggiorna, opzioni: () => opzioni }
}

/** Una pagina con modifiche non salvate: come `useModuloProtetto` e le Impostazioni, ferma la chiusura della pagina. */
function modificheAperte(): () => void {
  const avvisa = (e: Event) => { e.preventDefault() }
  window.addEventListener('beforeunload', avvisa)
  return () => window.removeEventListener('beforeunload', avvisa)
}

const ricarica = vi.fn()

beforeEach(() => {
  vi.mocked(toast).mockReset()
  ricarica.mockReset()
})
afterEach(() => {
  fermaAggiornamento()
  vi.useRealTimers()
})

describe('ciSonoModificheNonSalvate', () => {
  it('chiede alle stesse protezioni della chiusura della pagina (beforeunload)', () => {
    expect(ciSonoModificheNonSalvate()).toBe(false)
    const togli = modificheAperte()
    expect(ciSonoModificheNonSalvate()).toBe(true)
    togli()
    expect(ciSonoModificheNonSalvate()).toBe(false)
  })
})

describe('aggiornamento a richiesta', () => {
  it('registra il service worker; finché non c\'è una versione nuova non c\'è nulla da aggiornare', () => {
    const r = registratoreFinto()
    avviaAggiornamento(r.registra, { ricarica })
    expect(r.registra).toHaveBeenCalledOnce()
    const { result } = renderHook(() => useAggiornamentoPronto())
    expect(result.current).toBe(false)
    expect(applicaAggiornamento()).toBe('nessuno')
    expect(r.aggiorna).not.toHaveBeenCalled()
  })

  it('una versione nuova pronta si dice (onNeedRefresh), e non si attiva da sola', () => {
    const r = registratoreFinto()
    avviaAggiornamento(r.registra, { ricarica })
    const { result } = renderHook(() => useAggiornamentoPronto())
    act(() => r.opzioni().onNeedRefresh?.())
    expect(result.current).toBe(true)
    expect(r.aggiorna).not.toHaveBeenCalled()
  })

  it('"Aggiorna" senza modifiche non salvate attiva la versione nuova (che poi ricarica la pagina)', () => {
    const r = registratoreFinto()
    avviaAggiornamento(r.registra, { ricarica })
    act(() => r.opzioni().onNeedRefresh?.())
    expect(applicaAggiornamento()).toBe('avviato')
    expect(r.aggiorna).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('con modifiche non salvate prima chiede: niente aggiornamento finché non si sceglie di scartarle', () => {
    const r = registratoreFinto()
    avviaAggiornamento(r.registra, { ricarica })
    act(() => r.opzioni().onNeedRefresh?.())
    const togli = modificheAperte()
    expect(applicaAggiornamento()).toBe('modifiche')
    expect(r.aggiorna).not.toHaveBeenCalled()

    expect(applicaAggiornamento({ scartaModifiche: true })).toBe('avviato')
    expect(r.aggiorna).toHaveBeenCalledOnce()
    // La ricarica che segue non richiede una seconda conferma al browser: la scelta è già stata fatta.
    const evento = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(evento)
    expect(evento.defaultPrevented).toBe(false)
    togli()
  })

  it('se la ricarica non arriva, dopo poco le protezioni della chiusura tornano a valere', () => {
    vi.useFakeTimers()
    const r = registratoreFinto()
    avviaAggiornamento(r.registra, { ricarica })
    act(() => r.opzioni().onNeedRefresh?.())
    const togli = modificheAperte()
    applicaAggiornamento({ scartaModifiche: true })
    vi.advanceTimersByTime(15_000)
    expect(ciSonoModificheNonSalvate()).toBe(true)
    togli()
  })

  it('la versione nuova attivata da un\'altra finestra ricarica questa solo senza modifiche non salvate', () => {
    const r = registratoreFinto()
    avviaAggiornamento(r.registra, { ricarica })
    act(() => r.opzioni().onNeedReload?.())
    expect(ricarica).toHaveBeenCalledOnce()

    const togli = modificheAperte()
    act(() => r.opzioni().onNeedReload?.())
    expect(ricarica).toHaveBeenCalledOnce()
    expect(toast).toHaveBeenCalledWith('È uscita una nuova versione: ricarica la pagina.', expect.objectContaining({ duration: Infinity }))
    togli()
  })

  it('controlla se c\'è una versione nuova quando l\'app torna visibile, al massimo una volta l\'ora', () => {
    vi.useFakeTimers({ now: Date.parse('2026-11-04T09:00:00Z') })
    const r = registratoreFinto()
    avviaAggiornamento(r.registra, { ricarica })
    const registrazione = { update: vi.fn(async () => {}) } as unknown as ServiceWorkerRegistration
    r.opzioni().onRegisteredSW?.('/sw.js', registrazione)
    const visibile = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')

    vi.setSystemTime(Date.parse('2026-11-04T09:30:00Z'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(registrazione.update).not.toHaveBeenCalled()

    vi.setSystemTime(Date.parse('2026-11-04T10:01:00Z'))
    document.dispatchEvent(new Event('visibilitychange'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(registrazione.update).toHaveBeenCalledOnce()
    visibile.mockRestore()
  })

  it('senza rete il controllo fallisce senza eccezioni', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-11-04T09:00:00Z') })
    const r = registratoreFinto()
    avviaAggiornamento(r.registra, { ricarica })
    const registrazione = { update: vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) } as unknown as ServiceWorkerRegistration
    r.opzioni().onRegisteredSW?.('/sw.js', registrazione)
    const visibile = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    vi.setSystemTime(Date.parse('2026-11-04T11:00:00Z'))
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.runAllTimersAsync()
    expect(registrazione.update).toHaveBeenCalledOnce()
    visibile.mockRestore()
  })
})

describe('ascoltaErroriDiCaricamento (vite:preloadError)', () => {
  it('un pezzo dell\'app che non si carica (versione nuova uscita) dice di ricaricare, con "Ricarica"', () => {
    const stacca = ascoltaErroriDiCaricamento({ ricarica })
    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }))
    expect(toast).toHaveBeenCalledOnce()
    const [testo, opzioni] = vi.mocked(toast).mock.calls[0]
    expect(testo).toBe('È uscita una nuova versione: ricarica la pagina.')
    expect(opzioni).toMatchObject({ duration: Infinity, action: { label: 'Ricarica' } })
    const azione = (opzioni as unknown as { action: { onClick: () => void } }).action
    azione.onClick()
    expect(ricarica).toHaveBeenCalledOnce()
    stacca()
    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }))
    expect(toast).toHaveBeenCalledOnce()
  })
})
