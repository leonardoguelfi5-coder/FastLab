import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ModuloCampi, campiDi } from './ModuloCampi'

function Tre({ onSalva = () => {} }: { onSalva?: () => void }) {
  return (
    <ModuloCampi>
      <input aria-label="uno" />
      <input aria-label="data" type="date" />
      <input aria-label="due" />
      <input aria-label="tre" />
      <button onClick={onSalva}>Salva e vai</button>
    </ModuloCampi>
  )
}

describe('ModuloCampi: il tasto Avanti', () => {
  it('Invio porta al campo seguente e salta la data', async () => {
    const u = userEvent.setup()
    render(<Tre />)
    await u.click(screen.getByLabelText('uno'))
    await u.keyboard('{Enter}')
    expect(screen.getByLabelText('due')).toHaveFocus()
  })

  it('sull\'ultimo toglie il fuoco senza salvare né inviare', async () => {
    const u = userEvent.setup()
    const salva = vi.fn()
    const invia = vi.fn()
    render(<Tre onSalva={salva} />)
    document.addEventListener('submit', invia)
    await u.click(screen.getByLabelText('tre'))
    await u.keyboard('{Enter}')
    expect(screen.getByLabelText('tre')).not.toHaveFocus()
    expect(salva).not.toHaveBeenCalled()
    expect(invia).not.toHaveBeenCalled()
    document.removeEventListener('submit', invia)
  })

  it('non agisce durante la composizione (tastiere IME)', () => {
    render(<Tre />)
    const uno = screen.getByLabelText('uno')
    uno.focus()
    fireEvent.keyDown(uno, { key: 'Enter', isComposing: true })
    expect(uno).toHaveFocus()
  })

  it('in una textarea Invio va a capo: nessun preventDefault, nessun enterkeyhint', () => {
    render(<ModuloCampi><input aria-label="a" /><textarea aria-label="nota" /></ModuloCampi>)
    const nota = screen.getByLabelText('nota')
    expect(nota).not.toHaveAttribute('enterkeyhint')
    const esito = fireEvent.keyDown(nota, { key: 'Enter' })
    expect(esito).toBe(true) // non annullato
  })

  it('enterkeyhint: next su primo e mezzo, done sull\'ultimo', () => {
    render(<Tre />)
    expect(screen.getByLabelText('uno')).toHaveAttribute('enterkeyhint', 'next')
    expect(screen.getByLabelText('due')).toHaveAttribute('enterkeyhint', 'next')
    expect(screen.getByLabelText('tre')).toHaveAttribute('enterkeyhint', 'done')
    expect(screen.getByLabelText('data')).not.toHaveAttribute('enterkeyhint')
  })

  it('enterkeyhint si aggiorna quando si aggiunge un campo', async () => {
    function Lista() {
      const [n, setN] = useState(1)
      return (
        <ModuloCampi>
          {Array.from({ length: n }, (_, i) => <input key={i} aria-label={`lettura ${i + 1}`} />)}
          <button type="button" onClick={() => setN(n + 1)}>+ lettura</button>
        </ModuloCampi>
      )
    }
    const u = userEvent.setup()
    render(<Lista />)
    expect(screen.getByLabelText('lettura 1')).toHaveAttribute('enterkeyhint', 'done')
    await u.click(screen.getByRole('button', { name: '+ lettura' }))
    expect(await screen.findByLabelText('lettura 2')).toHaveAttribute('enterkeyhint', 'done')
    expect(screen.getByLabelText('lettura 1')).toHaveAttribute('enterkeyhint', 'next')
  })

  it('i campi nascosti non contano', () => {
    const { container } = render(
      <ModuloCampi><input aria-label="a" /><div hidden><input aria-label="b" /></div><input aria-label="c" /></ModuloCampi>,
    )
    expect(campiDi(container).map(c => c.getAttribute('aria-label'))).toEqual(['a', 'c'])
  })

  it('un modulo dentro un altro non crea un secondo <form>', () => {
    const { container } = render(<ModuloCampi><ModuloCampi><input aria-label="x" /></ModuloCampi></ModuloCampi>)
    expect(container.querySelectorAll('form')).toHaveLength(1)
  })
})
