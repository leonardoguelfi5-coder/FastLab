import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { celleGriglia, type StatoPianta } from '@/domain/giro'
import { piante as creaPiante } from '@/domain/test-helpers'
import { FoglioPiante } from './FoglioPiante'

const piante = creaPiante(['1', '2', '3', '10'])

function monta(opzioni: { stati?: Map<string, StatoPianta> | null; attuale?: string | null } = {}) {
  const onScegli = vi.fn()
  const onOpenChange = vi.fn()
  const stati = opzioni.stati === undefined ? new Map<string, StatoPianta>([[piante[0].id, 'fatta']]) : opzioni.stati
  render(
    <FoglioPiante
      aperto
      onOpenChange={onOpenChange}
      piante={piante}
      celle={stati ? celleGriglia(piante, stati, opzioni.attuale ?? piante[1].id) : null}
      onScegli={onScegli}
    />,
  )
  return { onScegli, onOpenChange, utente: userEvent.setup() }
}

describe('FoglioPiante', () => {
  it('è un foglio dal basso titolato "Vai alla pianta", con il campo in alto e la griglia sotto', () => {
    monta()
    const foglio = screen.getByRole('dialog', { name: 'Vai alla pianta' })
    expect(foglio.className).toContain('bottom-0')
    expect(foglio.className).not.toContain('top-1/2')
    const campo = within(foglio).getByLabelText('Etichetta della pianta')
    const griglia = within(foglio).getByRole('group', { name: 'Piante del giro' })
    expect(campo.compareDocumentPosition(griglia) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(campo).toHaveAttribute('inputmode', 'numeric')
    expect(campo).toHaveAttribute('enterkeyhint', 'go')
  })

  it('il tocco su una cella sceglie la pianta e chiude il foglio', async () => {
    const { onScegli, onOpenChange, utente } = monta()
    await utente.click(screen.getByRole('button', { name: 'Pianta #3, da fare' }))
    expect(onScegli).toHaveBeenCalledWith(piante[2])
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('il campo cerca per etichetta (anche "01") e con Vai sceglie', async () => {
    const { onScegli, onOpenChange, utente } = monta()
    expect(screen.getByRole('button', { name: 'Vai' })).toBeDisabled()
    await utente.type(screen.getByLabelText('Etichetta della pianta'), ' 010 ')
    await utente.click(screen.getByRole('button', { name: 'Vai' }))
    expect(onScegli).toHaveBeenCalledWith(piante[3])
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('una pianta che non c\'è: resta aperto e lo dice', async () => {
    const { onScegli, onOpenChange, utente } = monta()
    await utente.type(screen.getByLabelText('Etichetta della pianta'), '999{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('Nessuna pianta con etichetta «999» in questo esperimento.')
    expect(screen.getByLabelText('Etichetta della pianta')).toHaveAttribute('aria-invalid', 'true')
    expect(onScegli).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    await utente.keyboard('7')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('senza le misure di oggi non inventa gli stati: niente griglia, una riga che lo dice', () => {
    monta({ stati: null })
    expect(screen.queryByRole('group', { name: 'Piante del giro' })).not.toBeInTheDocument()
    expect(screen.getByText('Le misure di oggi non sono ancora arrivate.')).toBeInTheDocument()
    expect(screen.getByLabelText('Etichetta della pianta')).toBeInTheDocument()
  })
})
