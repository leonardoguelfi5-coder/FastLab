import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bozzaVuota } from '@/domain/bozza'
import { fattore } from '@/domain/test-helpers'
import type { BozzaEsperimento } from '@/domain/tipi'
import { PassoPiante } from './PassoPiante'
import { righeDaBozza, type RigaTrattamento } from './righeTrattamenti'

type Utente = ReturnType<typeof userEvent.setup>

/** Il passo con lo stato vero, come nella procedura; `onChange` registra ogni modifica. */
function rendi(iniziale: BozzaEsperimento) {
  const onChange = vi.fn<(b: BozzaEsperimento, r: RigaTrattamento[]) => void>()
  function Banco() {
    const [stato, setStato] = useState({ bozza: iniziale, righe: righeDaBozza(iniziale) })
    return (
      <PassoPiante
        bozza={stato.bozza}
        righe={stato.righe}
        onChange={(bozza, righe) => { onChange(bozza, righe); setStato({ bozza, righe }) }}
      />
    )
  }
  render(<Banco />)
  return onChange
}

function conConcime(): BozzaEsperimento {
  const b = bozzaVuota()
  b.fattori = [fattore('Concime', ['0', '50', '100'])]
  return b
}

const ultimaBozza = (onChange: ReturnType<typeof rendi>) => onChange.mock.calls.at(-1)?.[0] as BozzaEsperimento
const campoN = (riga: number) => screen.getByLabelText(`N piante del trattamento ${riga}`)

async function scriviN(utente: Utente, riga: number, testo: string) {
  await utente.clear(campoN(riga))
  await utente.type(campoN(riga), testo)
}

describe('PassoPiante: trattamenti', () => {
  it('"Genera trattamenti" crea una riga per combinazione, inclusa, con etichetta e N modificabili', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(conConcime())

    await utente.click(screen.getByRole('button', { name: 'Genera trattamenti' }))

    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    expect(screen.getByLabelText('Etichetta del trattamento 2')).toHaveValue('50')
    expect(campoN(1)).toHaveValue('1')
    expect(ultimaBozza(onChange).trattamenti.map(t => t.etichetta)).toEqual(['0', '50', '100'])

    await utente.type(screen.getByLabelText('Etichetta del trattamento 2'), ' kg')
    await utente.click(screen.getByRole('checkbox', { name: 'Includi il trattamento 3' }))
    expect(ultimaBozza(onChange).trattamenti.map(t => [t.etichetta, t.ordine])).toEqual([['0', 0], ['50 kg', 1]])
    expect(campoN(3)).toBeDisabled()
  })

  it('un livello scritto in "Nuovo livello" ma non aggiunto entra da sé con "Genera trattamenti"', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(conConcime())

    await utente.type(screen.getByLabelText('Nuovo livello'), ' 150 ')
    await utente.click(screen.getByRole('button', { name: 'Genera trattamenti' }))

    const b = ultimaBozza(onChange)
    expect(b.fattori[0].livelli.map(l => [l.nome, l.ordine])).toEqual([['0', 0], ['50', 1], ['100', 2], ['150', 3]])
    expect(b.trattamenti.map(t => t.etichetta)).toEqual(['0', '50', '100', '150'])
    expect(screen.getByLabelText('Nuovo livello')).toHaveValue('')
    expect(screen.getByRole('list', { name: 'Livelli' })).toHaveTextContent('150')
  })

  it('un livello in sospeso già presente non entra e resta scritto con il suo avviso', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(conConcime())

    await utente.type(screen.getByLabelText('Nuovo livello'), '50')
    await utente.click(screen.getByRole('button', { name: 'Genera trattamenti' }))

    expect(ultimaBozza(onChange).trattamenti.map(t => t.etichetta)).toEqual(['0', '50', '100'])
    expect(screen.getByLabelText('Nuovo livello')).toHaveValue('50')
    expect(screen.getByText('C\'è già un livello con questo nome.')).toBeInTheDocument()
  })

  it('un fattore senza livelli ma con un livello in sospeso si può già generare', async () => {
    const utente = userEvent.setup({ delay: null })
    const b = bozzaVuota()
    b.fattori = [fattore('Stress', [])]
    const onChange = rendi(b)
    expect(screen.getByRole('button', { name: 'Genera trattamenti' })).toBeDisabled()

    await utente.type(screen.getByLabelText('Nuovo livello'), 'Controllo')
    await utente.click(screen.getByRole('button', { name: 'Genera trattamenti' }))
    expect(ultimaBozza(onChange).trattamenti.map(t => t.etichetta)).toEqual(['Controllo'])
  })

  it('senza fattori, o con un fattore senza livelli, non si possono generare i trattamenti e lo dice', () => {
    const b = conConcime()
    b.fattori.push({ ...fattore('Stress', []), ordine: 1 })
    rendi(b)
    expect(screen.getByRole('button', { name: 'Genera trattamenti' })).toBeDisabled()
    expect(screen.getByText('Il fattore «Stress» non ha livelli: aggiungine almeno uno.')).toBeInTheDocument()
  })

  it('"N piante" accetta solo interi da 1 in su: 0, -1 e 2,5 sono rifiutati', async () => {
    const utente = userEvent.setup({ delay: null })
    rendi(conConcime())
    await utente.click(screen.getByRole('button', { name: 'Genera trattamenti' }))

    for (const sbagliato of ['0', '-1', '2.5', '2,5', 'tre']) {
      await scriviN(utente, 1, sbagliato)
      expect(campoN(1)).toHaveAttribute('aria-invalid', 'true')
      expect(campoN(1)).toHaveAccessibleDescription('Scrivi un numero intero da 1 a 500.')
      expect(screen.getByRole('button', { name: 'Genera piante' })).toBeDisabled()
    }

    await scriviN(utente, 1, '2')
    expect(campoN(1)).not.toHaveAttribute('aria-invalid')
    expect(screen.getByRole('button', { name: 'Genera piante' })).toBeEnabled()
  })

  it('un N non valido in un trattamento escluso non blocca', async () => {
    const utente = userEvent.setup({ delay: null })
    rendi(conConcime())
    await utente.click(screen.getByRole('button', { name: 'Genera trattamenti' }))
    await scriviN(utente, 3, '0')
    await utente.click(screen.getByRole('checkbox', { name: 'Includi il trattamento 3' }))
    expect(screen.getByRole('button', { name: 'Genera piante' })).toBeEnabled()
  })
})

describe('PassoPiante: piante', () => {
  async function preparaTabella(utente: Utente, n: string) {
    await utente.click(screen.getByRole('button', { name: 'Genera trattamenti' }))
    for (const riga of [1, 2, 3]) await scriviN(utente, riga, n)
  }

  it('"Genera piante" numera dalla "Numerazione da" e permette di cambiare etichetta e blocco', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(conConcime())
    await preparaTabella(utente, '2')

    expect(screen.getByLabelText('Numerazione da')).toHaveValue('1')
    await utente.clear(screen.getByLabelText('Numerazione da'))
    await utente.type(screen.getByLabelText('Numerazione da'), '101')
    await utente.click(screen.getByRole('button', { name: 'Genera piante' }))

    const { piante, trattamenti } = ultimaBozza(onChange)
    expect(piante.map(p => p.etichetta)).toEqual(['101', '102', '103', '104', '105', '106'])
    expect(piante.map(p => p.trattamento_id)).toEqual(trattamenti.flatMap(t => [t.id, t.id]))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await utente.clear(screen.getByLabelText('Etichetta della pianta 1'))
    await utente.type(screen.getByLabelText('Etichetta della pianta 1'), 'B3-12')
    await utente.type(screen.getByLabelText('Blocco della pianta 1'), 'B3')
    expect(ultimaBozza(onChange).piante[0]).toMatchObject({ etichetta: 'B3-12', blocco: 'B3' })

    await utente.clear(screen.getByLabelText('Blocco della pianta 1'))
    expect(ultimaBozza(onChange).piante[0].blocco).toBeNull()
  })

  it('"Numerazione da" non accetta valori che non sono interi', async () => {
    const utente = userEvent.setup({ delay: null })
    rendi(conConcime())
    await preparaTabella(utente, '1')

    await utente.clear(screen.getByLabelText('Numerazione da'))
    await utente.type(screen.getByLabelText('Numerazione da'), '-5')
    expect(screen.getByLabelText('Numerazione da')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Genera piante' })).toBeDisabled()
  })

  it('segnala le etichette ripetute', async () => {
    const utente = userEvent.setup({ delay: null })
    rendi(conConcime())
    await preparaTabella(utente, '1')
    await utente.click(screen.getByRole('button', { name: 'Genera piante' }))

    await utente.clear(screen.getByLabelText('Etichetta della pianta 2'))
    await utente.type(screen.getByLabelText('Etichetta della pianta 2'), '1')
    expect(screen.getByLabelText('Etichetta della pianta 2')).toHaveAccessibleDescription('Etichetta ripetuta.')
    expect(screen.getByLabelText('Etichetta della pianta 1')).toHaveAttribute('aria-invalid', 'true')
  })

  it('se ci sono già piante chiede conferma prima di rigenerarle', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(conConcime())
    await preparaTabella(utente, '1')
    await utente.click(screen.getByRole('button', { name: 'Genera piante' }))
    await utente.clear(screen.getByLabelText('Etichetta della pianta 1'))
    await utente.type(screen.getByLabelText('Etichetta della pianta 1'), 'A')

    // Annulla: le etichette restano.
    await utente.click(screen.getByRole('button', { name: 'Genera piante' }))
    let dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('Rigenerare le piante?')).toBeInTheDocument()
    expect(within(dialogo).getByText('Le etichette modificate andranno perse.')).toBeInTheDocument()
    await utente.click(within(dialogo).getByRole('button', { name: 'Annulla' }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(ultimaBozza(onChange).piante.map(p => p.etichetta)).toEqual(['A', '2', '3'])

    // Conferma: si riparte dalla numerazione.
    await utente.click(screen.getByRole('button', { name: 'Genera piante' }))
    dialogo = await screen.findByRole('dialog')
    await utente.click(within(dialogo).getByRole('button', { name: 'Rigenera' }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(ultimaBozza(onChange).piante.map(p => p.etichetta)).toEqual(['1', '2', '3'])
  })
})
