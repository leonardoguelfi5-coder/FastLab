import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { OrdineGiro } from '@/domain/giro'
import { OrdineGiroScelta } from './OrdineGiroScelta'

function Prova({ iniziale = { criterio: 'impostazioni', inverso: false } as OrdineGiro }) {
  const [ordine, setOrdine] = useState(iniziale)
  return <OrdineGiroScelta ordine={ordine} onCambia={setOrdine} />
}

describe('OrdineGiroScelta', () => {
  it('la riga chiusa dice l\'ordine di adesso', () => {
    render(<Prova />)
    expect(screen.getByRole('button', { name: 'Ordine: come nelle impostazioni' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('si apre sulle quattro scelte e le scelte cambiano la riga', async () => {
    const utente = userEvent.setup()
    render(<Prova />)
    await utente.click(screen.getByRole('button', { name: /^Ordine:/ }))
    expect(screen.getAllByRole('radio').map(r => r.closest('label')?.textContent)).toEqual([
      'Come nelle impostazioni', 'Per etichetta', 'Per blocco',
    ])
    expect(screen.getByRole('checkbox', { name: 'Al contrario' })).not.toBeChecked()

    await utente.click(screen.getByRole('radio', { name: 'Per etichetta' }))
    await utente.click(screen.getByRole('checkbox', { name: 'Al contrario' }))
    expect(screen.getByRole('button', { name: 'Ordine: per etichetta, al contrario' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Per etichetta' })).toBeChecked()
  })

  it('i bersagli sono da 44 px', async () => {
    const utente = userEvent.setup()
    render(<Prova />)
    const riga = screen.getByRole('button', { name: /^Ordine:/ })
    expect(riga.className).toContain('min-h-11')
    await utente.click(riga)
    expect(screen.getByRole('radio', { name: 'Per blocco' }).closest('label')!.className).toContain('min-h-11')
  })

  it('per blocco, al contrario: la riga lo dice', () => {
    render(<Prova iniziale={{ criterio: 'blocco', inverso: true }} />)
    expect(screen.getByRole('button', { name: 'Ordine: per blocco, al contrario' })).toBeInTheDocument()
  })
})
