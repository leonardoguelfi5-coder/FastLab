import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { conPiante, parametro } from '@/domain/test-helpers'
import type { BozzaEsperimento } from '@/domain/tipi'
import { PassoParametri } from './PassoParametri'
import { PassoStrumenti } from './PassoStrumenti'

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

/** Bozza con Altezza (in uno strumento) e Palchi. */
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

  it('eliminare un parametro lo toglie anche dagli strumenti', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(PassoParametri, bozza())

    await utente.click(screen.getByRole('button', { name: /Altezza/ }))
    await utente.click(screen.getByRole('button', { name: 'Elimina parametro' }))

    const b = ultima(onChange)
    expect(b.parametri.map(p => [p.nome, p.ordine])).toEqual([['Palchi', 0]])
    expect(b.strumenti[0].parametri).toEqual([])
  })

  it('un nome già usato (anche con spazi o maiuscole) è segnalato nel parametro, con "Da completare" a voce chiusa', async () => {
    const utente = userEvent.setup({ delay: null })
    rendi(PassoParametri, bozza())

    await utente.click(screen.getByRole('button', { name: '+ Parametro' }))
    expect(screen.getByText('Un parametro non ha nome.')).toBeInTheDocument()
    await utente.type(screen.getByLabelText('Nome'), ' ALTEZZA')

    expect(screen.getByText('C\'è già un parametro che si chiama "Altezza".')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ALTEZZA/ })).toHaveTextContent('Da completare')
    expect(screen.getByRole('button', { name: /Palchi/ })).not.toHaveTextContent('Da completare')
  })
})

describe('PassoStrumenti', () => {
  it('mostra icona, nome e numero di parametri; "+ Strumento" ne aggiunge uno e lo apre', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(PassoStrumenti, bozza())

    expect(screen.getByRole('button', { name: /Altezza/ })).toHaveTextContent('1 parametro')
    await utente.click(screen.getByRole('button', { name: '+ Strumento' }))
    expect(ultima(onChange).strumenti).toHaveLength(2)

    const nuova = screen.getByRole('button', { name: /Senza nome/ })
    expect(nuova).toHaveAttribute('aria-expanded', 'true')
    expect(nuova).toHaveTextContent('Nessun parametro')
    const riga = within(screen.getByText('Palchi', { selector: '[data-testid="nome-parametro"]' }).closest('li') as HTMLElement)
    await utente.click(riga.getByRole('switch', { name: /Incluso/ }))
    expect(nuova).toHaveTextContent('1 parametro')
  })

  it('"Elimina strumento" lo toglie e rinumera gli altri', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(PassoStrumenti, bozza())

    await utente.click(screen.getByRole('button', { name: /Altezza/ }))
    await utente.click(screen.getByRole('button', { name: 'Elimina strumento' }))
    expect(ultima(onChange).strumenti).toEqual([])
    expect(screen.getByText('Nessuno strumento ancora.')).toBeInTheDocument()
  })

  it('un nome già usato (anche con spazi o maiuscole) è segnalato nello strumento, con "Da completare" a voce chiusa', async () => {
    const utente = userEvent.setup({ delay: null })
    rendi(PassoStrumenti, bozza())

    await utente.click(screen.getByRole('button', { name: '+ Strumento' }))
    await utente.type(screen.getByLabelText('Nome dello strumento'), 'altezza ')

    expect(screen.getByText('C\'è già uno strumento che si chiama "Altezza".')).toBeInTheDocument()
    const nuova = screen.getAllByRole('button', { name: /altezza/i })[1]
    expect(nuova).toHaveTextContent('Da completare')
  })
})
