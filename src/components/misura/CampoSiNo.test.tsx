import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { parametro } from '@/domain/test-helpers'
import { CampoSiNo } from './CampoSiNo'

const fiori = parametro('Presenza di fiori', { tipo: 'sino' })
const si = () => screen.getByRole('button', { name: 'Sì' })
const no = () => screen.getByRole('button', { name: 'No' })

describe('CampoSiNo', () => {
  it('mostra il nome e i due pulsanti, nessuno premuto se il valore è null', () => {
    render(<CampoSiNo parametro={fiori} valore={null} onChange={() => {}} />)
    expect(screen.getByRole('group', { name: 'Presenza di fiori' })).toBeInTheDocument()
    expect(si()).toHaveAttribute('aria-pressed', 'false')
    expect(no()).toHaveAttribute('aria-pressed', 'false')
  })

  it('tocca Sì o No per scegliere', async () => {
    const onChange = vi.fn()
    render(<CampoSiNo parametro={fiori} valore={null} onChange={onChange} />)
    await userEvent.click(si())
    expect(onChange).toHaveBeenLastCalledWith(true)
    await userEvent.click(no())
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('il pulsante della scelta attuale risulta premuto, l\'altro no', () => {
    const { rerender } = render(<CampoSiNo parametro={fiori} valore={true} onChange={() => {}} />)
    expect(si()).toHaveAttribute('aria-pressed', 'true')
    expect(no()).toHaveAttribute('aria-pressed', 'false')
    rerender(<CampoSiNo parametro={fiori} valore={false} onChange={() => {}} />)
    expect(si()).toHaveAttribute('aria-pressed', 'false')
    expect(no()).toHaveAttribute('aria-pressed', 'true')
  })

  it('ritoccando il pulsante attivo si torna a null', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<CampoSiNo parametro={fiori} valore={true} onChange={onChange} />)
    await userEvent.click(si())
    expect(onChange).toHaveBeenLastCalledWith(null)
    rerender(<CampoSiNo parametro={fiori} valore={false} onChange={onChange} />)
    await userEvent.click(no())
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('cambiando scelta passa direttamente all\'altra', async () => {
    const onChange = vi.fn()
    render(<CampoSiNo parametro={fiori} valore={true} onChange={onChange} />)
    await userEvent.click(no())
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('con obbligatorio il nome ha l\'asterisco', () => {
    render(<CampoSiNo parametro={fiori} valore={null} obbligatorio onChange={() => {}} />)
    expect(screen.getByText('*')).toBeInTheDocument()
    // aria-required non vale per un gruppo: lo dice la descrizione.
    expect(screen.getByRole('group', { name: 'Presenza di fiori' })).toHaveAccessibleDescription('Obbligatorio')
  })
})
