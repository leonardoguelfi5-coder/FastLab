import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { Caricamento, SENZA_RETE_DATI } from './Caricamento'

afterEach(() => vi.restoreAllMocks())

describe('Caricamento', () => {
  it('con la rete dice "Caricamento…"', () => {
    render(<Caricamento />)
    expect(screen.getByRole('status')).toHaveTextContent('Caricamento…')
  })

  it('senza rete dice che i dati non sono ancora stati letti su questo telefono, e torna "Caricamento…" con la rete', () => {
    const rete = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<Caricamento />)
    expect(screen.getByRole('status')).toHaveTextContent(SENZA_RETE_DATI)
    expect(SENZA_RETE_DATI).toBe('Senza rete: questi dati non sono ancora stati letti su questo telefono.')
    rete.mockReturnValue(true)
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(screen.getByRole('status')).toHaveTextContent('Caricamento…')
  })

  it('il testo senza rete si può dire per la pagina', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<Caricamento senzaRete="Senza rete: la pianta non c'è." />)
    expect(screen.getByRole('status')).toHaveTextContent('Senza rete: la pianta non c\'è.')
  })
})
