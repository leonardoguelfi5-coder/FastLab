import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
