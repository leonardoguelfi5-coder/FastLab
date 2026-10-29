import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import { SceltaDalCatalogo } from './SceltaDalCatalogo'

const ciras = SEMI_CATALOGO.find(v => v.nome === 'Ciras')!
const termometro = SEMI_CATALOGO.find(v => v.nome === 'Termometro')!

function rendi(props: Partial<React.ComponentProps<typeof SceltaDalCatalogo>> = {}) {
  const onAggiungi = vi.fn()
  const onNuovo = vi.fn()
  render(
    <MemoryRouter>
      <SceltaDalCatalogo voci={SEMI_CATALOGO} gia={new Set()} onAggiungi={onAggiungi} onNuovo={onNuovo} {...props} />
    </MemoryRouter>,
  )
  return { onAggiungi, onNuovo }
}

const riga = (nome: string) => within(screen.getByText(nome, { selector: 'p' }).closest('li') as HTMLElement)

describe('SceltaDalCatalogo', () => {
  it('elenca le voci con icona, nome e valori con unità', () => {
    rendi()
    expect(screen.getAllByRole('listitem')).toHaveLength(SEMI_CATALOGO.length)
    expect(screen.getByText('🍃 Ciras')).toBeInTheDocument()
    expect(riga('🌡 Termometro').getByText('Temp aria °C · Temp pianta °C')).toBeInTheDocument()
    expect(riga('🍃 Ciras').getByText(/^A µmol m⁻² s⁻¹ · gs mol m⁻² s⁻¹ · E /)).toBeInTheDocument()
    // Un valore senza unità è solo il nome.
    expect(riga('💚 SPAD').getByText('SPAD', { selector: 'p' })).toBeInTheDocument()
  })

  it('"Aggiungi" chiama onAggiungi con la voce', async () => {
    const utente = userEvent.setup({ delay: null })
    const { onAggiungi } = rendi()

    await utente.click(screen.getByRole('button', { name: 'Aggiungi «Ciras»' }))
    expect(onAggiungi).toHaveBeenCalledExactlyOnceWith(ciras)
  })

  it('una voce già nell\'esperimento ha il pulsante disabilitato e non si aggiunge due volte', async () => {
    const utente = userEvent.setup({ delay: null })
    const { onAggiungi } = rendi({ gia: new Set([termometro.id]) })

    const aggiunto = screen.getByRole('button', { name: '«Termometro» è già nell\'esperimento' })
    expect(aggiunto).toBeDisabled()
    expect(aggiunto).toHaveTextContent('Aggiunto')
    await utente.click(aggiunto)
    expect(onAggiungi).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Aggiungi «Ciras»' })).toBeEnabled()
  })

  it('"+ Nuovo strumento" è in fondo e chiama onNuovo', async () => {
    const utente = userEvent.setup({ delay: null })
    const { onNuovo } = rendi()

    const nuovo = screen.getByRole('button', { name: '+ Nuovo strumento' })
    expect(screen.getAllByRole('button').at(-1)).toBe(nuovo)
    await utente.click(nuovo)
    expect(onNuovo).toHaveBeenCalledOnce()
  })

  it('con il catalogo vuoto lo dice e lascia "+ Nuovo strumento"', () => {
    rendi({ voci: [] })
    expect(screen.getByText('Il catalogo è vuoto: crea tu il primo strumento.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Nuovo strumento' })).toBeInTheDocument()
  })

  it('mentre il catalogo si carica dice "Caricamento…"', () => {
    rendi({ voci: undefined })
    expect(screen.getByRole('status')).toHaveTextContent('Caricamento…')
  })

  it('se il catalogo non si carica mostra l\'errore con "Riprova", e "+ Nuovo strumento" resta', async () => {
    const utente = userEvent.setup({ delay: null })
    const onRiprova = vi.fn()
    rendi({ voci: undefined, errore: { message: 'Failed to fetch' }, onRiprova })

    expect(screen.getByRole('alert')).toHaveTextContent('Il server non risponde')
    await utente.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(onRiprova).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '+ Nuovo strumento' })).toBeInTheDocument()
  })
})
