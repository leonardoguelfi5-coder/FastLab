import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Fattore } from '@/domain/tipi'
import { fattore } from '@/domain/test-helpers'
import { EditorFattori } from './EditorFattori'

function rendi(iniziale: Fattore[]) {
  const onChange = vi.fn<(f: Fattore[]) => void>()
  function Banco() {
    const [f, setF] = useState(iniziale)
    return <EditorFattori valore={f} onChange={(nuovi) => { onChange(nuovi); setF(nuovi) }} />
  }
  render(<Banco />)
  return onChange
}

const ultimi = (onChange: ReturnType<typeof rendi>) => onChange.mock.calls.at(-1)?.[0] as Fattore[]

describe('EditorFattori', () => {
  it('senza fattori spiega cosa sono; "+ Fattore" ne aggiunge uno vuoto', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi([])
    expect(screen.getByText(/Nessun fattore/)).toBeInTheDocument()

    await utente.click(screen.getByRole('button', { name: '+ Fattore' }))
    expect(ultimi(onChange)).toEqual([{ id: expect.any(String), nome: '', ordine: 0, livelli: [] }])
    expect(screen.getByLabelText('Nome del fattore')).toHaveValue('')
  })

  it('aggiunge un livello con Invio o con il pulsante e lo mostra come chip', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi([fattore('Concime', [])])

    await utente.type(screen.getByLabelText('Nuovo livello'), ' 0 {Enter}')
    await utente.type(screen.getByLabelText('Nuovo livello'), '50')
    await utente.click(screen.getByRole('button', { name: 'Aggiungi livello' }))

    expect(ultimi(onChange)[0].livelli).toEqual([
      { id: expect.any(String), nome: '0', ordine: 0 },
      { id: expect.any(String), nome: '50', ordine: 1 },
    ])
    expect(screen.getByRole('list', { name: 'Livelli' })).toHaveTextContent('050')
    expect(screen.getByLabelText('Nuovo livello')).toHaveValue('')
  })

  it('non aggiunge un livello vuoto o già presente', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi([fattore('Stress', ['Controllo'])])

    expect(screen.getByRole('button', { name: 'Aggiungi livello' })).toBeDisabled()
    await utente.type(screen.getByLabelText('Nuovo livello'), 'controllo{Enter}')
    expect(screen.getByText('C\'è già un livello con questo nome.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aggiungi livello' })).toBeDisabled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('toglie un livello e rinumera gli altri', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi([fattore('Stress', ['Controllo', 'S1', 'W1'])])

    await utente.click(screen.getByRole('button', { name: 'Togli il livello «Controllo»' }))
    expect(ultimi(onChange)[0].livelli.map(l => [l.nome, l.ordine])).toEqual([['S1', 0], ['W1', 1]])
  })

  it('rinomina ed elimina un fattore, rinumerando gli altri', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi([fattore('Stress', ['S1']), { ...fattore('Hydrochar', ['No']), ordine: 1 }])

    await utente.type(screen.getAllByLabelText('Nome del fattore')[1], ' HC')
    expect(ultimi(onChange)[1].nome).toBe('Hydrochar HC')

    await utente.click(screen.getAllByRole('button', { name: 'Elimina fattore' })[0])
    expect(ultimi(onChange).map(f => [f.nome, f.ordine])).toEqual([['Hydrochar HC', 0]])
  })
})
