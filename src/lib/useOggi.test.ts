import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useOggi } from './useOggi'

const MINUTO = 60_000
const ORA = 60 * MINUTO

/** Fa credere al documento di essere visibile o in secondo piano. */
function impostaVisibilita(stato: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => stato })
}

const tornaVisibile = () => {
  impostaVisibilita('visible')
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  // Anche i timer: la mezzanotte si aspetta con setTimeout. 28 ottobre 2026, 23:59:30 (ora locale).
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date(2026, 9, 28, 23, 59, 30))
  impostaVisibilita('visible')
})

afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(document, 'visibilityState')
})

describe('useOggi', () => {
  it('dà la data di oggi (ora locale)', () => {
    const { result } = renderHook(() => useOggi())
    expect(result.current).toBe('2026-10-28')
  })

  it('passa al giorno dopo da solo alla mezzanotte, non prima', () => {
    const { result } = renderHook(() => useOggi())
    act(() => { vi.advanceTimersByTime(29_000) })
    expect(result.current).toBe('2026-10-28')
    act(() => { vi.advanceTimersByTime(2_000) })
    expect(result.current).toBe('2026-10-29')
  })

  it('il timer riparte: passa anche alla mezzanotte successiva', () => {
    const { result } = renderHook(() => useOggi())
    act(() => { vi.advanceTimersByTime(31_000) })
    expect(result.current).toBe('2026-10-29')
    act(() => { vi.advanceTimersByTime(24 * ORA) })
    expect(result.current).toBe('2026-10-30')
  })

  it("con il cambio dell'ora legale la mezzanotte è quella vera (il 25 ottobre il giorno dura 25 ore)", () => {
    vi.setSystemTime(new Date(2026, 9, 25, 0, 30))
    const { result } = renderHook(() => useOggi())
    act(() => { vi.advanceTimersByTime(24 * ORA) })
    expect(result.current).toBe('2026-10-25')
    act(() => { vi.advanceTimersByTime(31 * MINUTO) })
    expect(result.current).toBe('2026-10-26')
  })

  it('quando la pagina torna visibile guarda di nuovo la data (un timer in sfondo può non scattare)', () => {
    const { result } = renderHook(() => useOggi())
    impostaVisibilita('hidden')
    vi.setSystemTime(new Date(2026, 9, 29, 8, 0))

    act(() => { document.dispatchEvent(new Event('visibilitychange')) }) // ancora in sfondo: niente
    expect(result.current).toBe('2026-10-28')

    act(tornaVisibile)
    expect(result.current).toBe('2026-10-29')
  })

  it('quando la finestra riprende il focus guarda di nuovo la data', () => {
    const { result } = renderHook(() => useOggi())
    vi.setSystemTime(new Date(2026, 9, 29, 8, 0))
    expect(result.current).toBe('2026-10-28')
    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(result.current).toBe('2026-10-29')
  })

  it('se la data non è cambiata non ridisegna il componente', () => {
    let disegni = 0
    renderHook(() => { disegni += 1; return useOggi() })
    const prima = disegni
    act(() => { window.dispatchEvent(new Event('focus')) })
    act(tornaVisibile)
    expect(disegni).toBe(prima)
  })

  it('smontando toglie timer e ascoltatori', () => {
    const { result, unmount } = renderHook(() => useOggi())
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    vi.setSystemTime(new Date(2026, 9, 29, 8, 0))
    act(() => { window.dispatchEvent(new Event('focus')); tornaVisibile() })
    expect(result.current).toBe('2026-10-28')
  })
})
