import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCampoStore } from '@/store/campo'
import { BannerData } from './BannerData'

beforeEach(() => {
  // Solo `Date`: i timer veri servono a userEvent. 28 ottobre 2026, ore 8:00 (ora locale).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 28, 8, 0))
  localStorage.clear()
  useCampoStore.setState({ stato: {} })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('BannerData', () => {
  it('con la data di rilievo di oggi non mostra nulla', () => {
    const { container } = render(<BannerData espId="E" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('con la data di rilievo di ieri avvisa che non è oggi e propone "Usa oggi"', () => {
    useCampoStore.getState().setData('E', '2026-10-27')
    render(<BannerData espId="E" />)
    expect(screen.getByText(/27\/10\/2026, non oggi/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Stai registrando con data 27/10/2026, non oggi.')
    expect(screen.getByRole('button', { name: 'Usa oggi' })).toBeInTheDocument()
  })

  it('"Usa oggi" porta la data a oggi e il banner sparisce', async () => {
    const utente = userEvent.setup()
    useCampoStore.getState().setData('E', '2026-10-27')
    render(<BannerData espId="E" />)

    await utente.click(screen.getByRole('button', { name: 'Usa oggi' }))

    expect(useCampoStore.getState().dati('E').dataRilievo).toBe('2026-10-28')
    expect(screen.queryByText(/non oggi/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Usa oggi' })).not.toBeInTheDocument()
  })

  it('con `conferma` la data cambia solo quando la pagina esegue il cambio', async () => {
    const utente = userEvent.setup()
    useCampoStore.getState().setData('E', '2026-10-27')
    let cambia: (() => void) | undefined
    const conferma = vi.fn((c: () => void) => { cambia = c })
    render(<BannerData espId="E" conferma={conferma} />)

    await utente.click(screen.getByRole('button', { name: 'Usa oggi' }))

    expect(conferma).toHaveBeenCalledTimes(1)
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe('2026-10-27')
    act(() => cambia!())
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe('2026-10-28')
  })

  it('non è solo colore: ha un\'icona che gli assistenti vocali non leggono', () => {
    useCampoStore.getState().setData('E', '2026-10-27')
    render(<BannerData espId="E" />)
    expect(screen.getByRole('status').querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('guarda la data di rilievo del proprio esperimento', () => {
    useCampoStore.getState().setData('E', '2026-10-27')
    const { container } = render(<BannerData espId="F" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('anche una data futura non è oggi', () => {
    useCampoStore.getState().setData('E', '2026-10-29')
    render(<BannerData espId="E" />)
    expect(screen.getByText(/29\/10\/2026, non oggi/)).toBeInTheDocument()
  })

  it('ha un bordo pieno di attenzione (non una striscia laterale): al sole il solo fondo velato non si vede', () => {
    useCampoStore.getState().setData('E', '2026-10-27')
    render(<BannerData espId="E" />)
    const banner = screen.getByRole('status')
    expect(banner).toHaveClass('border', 'border-attenzione')
    expect(banner.className).not.toMatch(/\bborder-[lrse]-/)
  })
})

describe('BannerData: il giorno che cambia mentre la pagina è aperta', () => {
  beforeEach(() => {
    // Anche i timer: la mezzanotte si aspetta con setTimeout. 28 ottobre 2026, 23:59:30.
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date(2026, 9, 28, 23, 59, 30))
  })

  it('una data scelta che diventa oggi a mezzanotte fa sparire il banner da sola', () => {
    useCampoStore.getState().setData('E', '2026-10-29')
    render(<BannerData espId="E" />)
    expect(screen.getByText(/29\/10\/2026, non oggi/)).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(31_000) })

    expect(screen.queryByText(/non oggi/)).not.toBeInTheDocument()
  })

  it('la stessa data, alla mezzanotte dopo, è passata: il banner torna', () => {
    useCampoStore.getState().setData('E', '2026-10-29')
    render(<BannerData espId="E" />)
    act(() => { vi.advanceTimersByTime(31_000) })
    expect(screen.queryByText(/non oggi/)).not.toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(24 * 60 * 60_000) })

    expect(screen.getByText(/29\/10\/2026, non oggi/)).toBeInTheDocument()
  })

  it('riprendendo l\'app dallo sfondo (focus) guarda di nuovo il giorno', () => {
    useCampoStore.getState().setData('E', '2026-10-29')
    render(<BannerData espId="E" />)
    expect(screen.getByText(/non oggi/)).toBeInTheDocument()

    vi.setSystemTime(new Date(2026, 9, 29, 8, 0))
    act(() => { window.dispatchEvent(new Event('focus')) })

    expect(screen.queryByText(/non oggi/)).not.toBeInTheDocument()
  })

  it('"Usa oggi" usa il giorno vero, anche se il banner non si è ancora accorto del cambio', () => {
    useCampoStore.getState().setData('E', '2026-10-27')
    render(<BannerData espId="E" />)

    vi.setSystemTime(new Date(2026, 9, 29, 8, 0)) // il giorno è cambiato, nessun evento è ancora arrivato
    fireEvent.click(screen.getByRole('button', { name: 'Usa oggi' }))

    expect(useCampoStore.getState().dati('E').dataRilievo).toBe('2026-10-29')
  })
})
