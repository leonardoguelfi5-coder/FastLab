import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { conPiante, parametro } from '@/domain/test-helpers'
import type { BozzaEsperimento } from '@/domain/tipi'
import { PassoParametri } from './PassoParametri'
import { PassoPassate } from './PassoPassate'

function rendi(Passo: typeof PassoParametri, iniziale: BozzaEsperimento) {
  const onChange = vi.fn<(b: BozzaEsperimento) => void>()
  function Banco() {
    const [b, setB] = useState(iniziale)
    return <Passo bozza={b} onChange={(nuova) => { onChange(nuova); setB(nuova) }} />
  }
  render(<Banco />)
  return onChange
}

const ultima = (onChange: ReturnType<typeof rendi>) => onChange.mock.calls.at(-1)?.[0] as BozzaEsperimento

/** Bozza con Altezza (in una passata) e Palchi. */
function bozza(): BozzaEsperimento {
  const b = conPiante(['1'])
  b.parametri.push(parametro('Palchi', {
    ordine: 1, tipo: 'lista', progressivo: true, sotto_campi: [{ chiave: 'n_foglie', nome: 'N foglie', unita: null }],
  }))
  return b
}

describe('PassoParametri', () => {
  it('mostra un riassunto per parametro; toccandolo si apre il suo editor', async () => {
    const utente = userEvent.setup({ delay: null })
    rendi(PassoParametri, bozza())

    const palchi = screen.getByRole('button', { name: /Palchi/ })
    expect(palchi).toHaveTextContent('Lista ripetuta · 1 sotto-campo · progressivo')
    expect(screen.getByRole('button', { name: /Altezza/ })).toHaveTextContent('Numero · cm')
    expect(palchi).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument()

    await utente.click(palchi)
    expect(palchi).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Nome')).toHaveValue('Palchi')

    // Uno alla volta: aprendo Altezza si chiude Palchi.
    await utente.click(screen.getByRole('button', { name: /Altezza/ }))
    expect(screen.getByLabelText('Nome')).toHaveValue('Altezza')
  })

  it('"+ Parametro" aggiunge un parametro numerico e lo apre', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(PassoParametri, bozza())

    await utente.click(screen.getByRole('button', { name: '+ Parametro' }))
    expect(ultima(onChange).parametri.map(p => [p.nome, p.ordine])).toEqual([['Altezza', 0], ['Palchi', 1], ['', 2]])
    await utente.type(screen.getByLabelText('Nome'), 'SPAD')
    expect(screen.getByRole('button', { name: /SPAD/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('eliminare un parametro lo toglie anche dalle passate', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(PassoParametri, bozza())

    await utente.click(screen.getByRole('button', { name: /Altezza/ }))
    await utente.click(screen.getByRole('button', { name: 'Elimina parametro' }))

    const b = ultima(onChange)
    expect(b.parametri.map(p => [p.nome, p.ordine])).toEqual([['Palchi', 0]])
    expect(b.passate[0].parametri).toEqual([])
  })
})

describe('PassoPassate', () => {
  it('mostra icona, nome e numero di parametri; "+ Passata" ne aggiunge una e la apre', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(PassoPassate, bozza())

    expect(screen.getByRole('button', { name: /Altezza/ })).toHaveTextContent('1 parametro')
    await utente.click(screen.getByRole('button', { name: '+ Passata' }))
    expect(ultima(onChange).passate).toHaveLength(2)

    const nuova = screen.getByRole('button', { name: /Senza nome/ })
    expect(nuova).toHaveAttribute('aria-expanded', 'true')
    expect(nuova).toHaveTextContent('Nessun parametro')
    const riga = within(screen.getByText('Palchi', { selector: '[data-testid="nome-parametro"]' }).closest('li') as HTMLElement)
    await utente.click(riga.getByRole('switch', { name: /Incluso/ }))
    expect(nuova).toHaveTextContent('1 parametro')
  })

  it('"Elimina passata" la toglie e rinumera le altre', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(PassoPassate, bozza())

    await utente.click(screen.getByRole('button', { name: /Altezza/ }))
    await utente.click(screen.getByRole('button', { name: 'Elimina passata' }))
    expect(ultima(onChange).passate).toEqual([])
    expect(screen.getByText('Nessuna passata ancora.')).toBeInTheDocument()
  })
})
