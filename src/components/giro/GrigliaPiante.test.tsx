import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CellaGriglia } from '@/domain/giro'
import type { Pianta } from '@/domain/tipi'
import { GrigliaPiante } from './GrigliaPiante'

function cella(etichetta: string, stato: CellaGriglia['stato'], attuale = false): CellaGriglia {
  const pianta: Pianta = { id: `id-${etichetta}`, trattamento_id: 't', etichetta, blocco: null, ordine: 0 }
  return { pianta, stato, attuale }
}

describe('GrigliaPiante', () => {
  it('una cella per pianta, con lo stato a parole nel nome e nella forma (✓, ½, niente)', () => {
    render(<GrigliaPiante celle={[cella('34', 'fatta'), cella('35', 'incompleta'), cella('36', 'da_fare')]} onScegli={() => {}} />)
    const fatta = screen.getByRole('button', { name: 'Pianta #34, fatta' })
    const incompleta = screen.getByRole('button', { name: 'Pianta #35, incompleta' })
    const daFare = screen.getByRole('button', { name: 'Pianta #36, da fare' })
    expect(fatta).toHaveTextContent('34✓')
    expect(incompleta).toHaveTextContent('35½')
    expect(daFare).toHaveTextContent(/^36$/)
    // Il bordo tratteggiato è solo dell'incompleta: la forma non dipende dal colore.
    expect(incompleta.className).toContain('border-dashed')
    expect(fatta.className).not.toContain('border-dashed')
    expect(daFare.className).not.toContain('border-dashed')
  })

  it('celle quadrate di almeno 44 px (2,75 rem), etichetta nel font dei dati, mai verde', () => {
    render(<GrigliaPiante celle={[cella('1', 'fatta'), cella('2', 'da_fare')]} onScegli={() => {}} />)
    const gruppo = screen.getByRole('group', { name: 'Piante del giro' })
    expect(gruppo.style.gridTemplateColumns).toBe('repeat(auto-fill, minmax(2.75rem, 1fr))')
    const b = screen.getByRole('button', { name: 'Pianta #1, fatta' })
    expect(b.className).toContain('aspect-square')
    expect(b.className).toContain('font-mono')
    expect(gruppo.innerHTML).not.toMatch(/registrato/)
  })

  it('con etichette oltre 4 caratteri le celle sono di almeno 4,5 rem', () => {
    render(<GrigliaPiante celle={[cella('A12-3', 'da_fare'), cella('1', 'da_fare')]} onScegli={() => {}} />)
    expect(screen.getByRole('group', { name: 'Piante del giro' }).style.gridTemplateColumns).toBe('repeat(auto-fill, minmax(4.5rem, 1fr))')
  })

  it('la pianta attuale è segnata (aria-current) e ha l\'anello', () => {
    render(<GrigliaPiante celle={[cella('1', 'da_fare'), cella('2', 'fatta', true)]} onScegli={() => {}} />)
    const attuale = screen.getByRole('button', { name: 'Pianta #2, fatta' })
    expect(attuale).toHaveAttribute('aria-current', 'true')
    expect(attuale.className).toContain('ring-2')
    expect(screen.getByRole('button', { name: 'Pianta #1, da fare' })).not.toHaveAttribute('aria-current')
  })

  it('il tocco su una cella dà la pianta', async () => {
    const onScegli = vi.fn()
    render(<GrigliaPiante celle={[cella('1', 'da_fare'), cella('2', 'incompleta')]} onScegli={onScegli} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Pianta #2, incompleta' }))
    expect(onScegli).toHaveBeenCalledWith(expect.objectContaining({ id: 'id-2', etichetta: '2' }))
  })

  it('la legenda dice i tre stati a parole', () => {
    render(<GrigliaPiante celle={[cella('1', 'da_fare')]} onScegli={() => {}} />)
    expect(screen.getByText('✓ fatta · ½ incompleta · □ da fare')).toBeInTheDocument()
  })
})
