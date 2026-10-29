import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ElementoLista } from '@/domain/tipi'
import { parametro } from '@/domain/test-helpers'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(() => 'id-toast'), { dismiss: vi.fn() }) }))

import { toast } from 'sonner'
import { CampoLista } from './CampoLista'

beforeEach(() => vi.clearAllMocks())

const palchi = parametro('Palchi', { tipo: 'lista', sotto_campi: [{ chiave: 'f', nome: 'Foglie', unita: null }] })

/** La lista con uno stato vero; `onChange` registra ogni modifica. */
function rendi(iniziale: ElementoLista[] = [], p = palchi, obbligatorio?: boolean) {
  const onChange = vi.fn<(v: ElementoLista[]) => void>()
  function Banco() {
    const [v, setV] = useState(iniziale)
    return <CampoLista parametro={p} valore={v} obbligatorio={obbligatorio} onChange={(nuovo) => { onChange(nuovo); setV(nuovo) }} />
  }
  render(<Banco />)
  return onChange
}

const ultimo = (onChange: ReturnType<typeof rendi>) => onChange.mock.calls.at(-1)?.[0]

/** L'azione "Annulla" dell'ultimo avviso mostrato. */
function annulla() {
  const [, opzioni] = vi.mocked(toast).mock.calls.at(-1) as unknown as [string, { action: { label: string; onClick: () => void } }]
  return opzioni.action
}

describe('CampoLista', () => {
  it('senza elementi mostra solo il nome e "+ Palchi"; "Rimuovi ultimo" non si può usare', () => {
    rendi()
    expect(screen.getByText('Palchi')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Palchi' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Rimuovi ultimo' })).toBeDisabled()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('"+ Palchi" due volte, poi 12 nel primo campo: elementi numerati con i valori vuoti e il 12', async () => {
    const onChange = rendi()
    await userEvent.click(screen.getByRole('button', { name: '+ Palchi' }))
    await userEvent.click(screen.getByRole('button', { name: '+ Palchi' }))
    await userEvent.type(screen.getAllByRole('textbox')[0], '12')
    expect(ultimo(onChange)).toEqual([{ n: 1, valori: { f: 12 } }, { n: 2, valori: { f: null } }])
  })

  it('le righe sono numerate "Palchi 1", "Palchi 2" e ogni campo porta il nome del sotto-campo', async () => {
    rendi()
    await userEvent.click(screen.getByRole('button', { name: '+ Palchi' }))
    await userEvent.click(screen.getByRole('button', { name: '+ Palchi' }))
    const prima = screen.getByRole('group', { name: 'Palchi 1' })
    const seconda = screen.getByRole('group', { name: 'Palchi 2' })
    expect(within(prima).getByLabelText('Foglie')).toBeInTheDocument()
    expect(within(seconda).getByLabelText('Foglie')).toBeInTheDocument()
  })

  it('"Rimuovi ultimo" toglie l\'ultimo elemento e lascia gli altri', async () => {
    const onChange = rendi()
    await userEvent.click(screen.getByRole('button', { name: '+ Palchi' }))
    await userEvent.click(screen.getByRole('button', { name: '+ Palchi' }))
    await userEvent.type(screen.getAllByRole('textbox')[1], '7')
    await userEvent.click(screen.getByRole('button', { name: 'Rimuovi ultimo' }))
    expect(ultimo(onChange)).toEqual([{ n: 1, valori: { f: null } }])
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.queryByRole('group', { name: 'Palchi 2' })).not.toBeInTheDocument()
  })

  it('dopo aver tolto un elemento, il successivo riparte dal numero giusto', async () => {
    const onChange = rendi([{ n: 1, valori: { f: 3 } }, { n: 2, valori: { f: 4 } }])
    await userEvent.click(screen.getByRole('button', { name: 'Rimuovi ultimo' }))
    await userEvent.click(screen.getByRole('button', { name: '+ Palchi' }))
    expect(ultimo(onChange)).toEqual([{ n: 1, valori: { f: 3 } }, { n: 2, valori: { f: null } }])
  })

  it('mostra i valori che ha già, con la virgola', () => {
    rendi([{ n: 1, valori: { f: 12.5 } }])
    expect(screen.getByRole('textbox')).toHaveValue('12,5')
  })

  it('un campo con testo non valido comunica NaN nell\'elemento', async () => {
    const onChange = rendi([{ n: 1, valori: { f: null } }])
    await userEvent.type(screen.getByRole('textbox'), 'x')
    expect(ultimo(onChange)).toEqual([{ n: 1, valori: { f: NaN } }])
  })

  it('più sotto-campi: un campo per ciascuno, in ogni riga, con l\'unità', async () => {
    const p = parametro('Palchi', {
      tipo: 'lista',
      sotto_campi: [
        { chiave: 'foglie', nome: 'Foglie', unita: null },
        { chiave: 'lungh', nome: 'Lunghezza', unita: 'cm' },
      ],
    })
    const onChange = rendi([], p)
    await userEvent.click(screen.getByRole('button', { name: '+ Palchi' }))
    const riga = screen.getByRole('group', { name: 'Palchi 1' })
    expect(within(riga).getAllByRole('textbox')).toHaveLength(2)
    expect(within(riga).getByText('cm')).toBeInTheDocument()
    await userEvent.type(within(riga).getByLabelText('Lunghezza'), '4,5')
    expect(ultimo(onChange)).toEqual([{ n: 1, valori: { foglie: null, lungh: 4.5 } }])
  })

  it('con obbligatorio il nome ha l\'asterisco e il gruppo è descritto come obbligatorio', () => {
    rendi([], palchi, true)
    expect(screen.getByText('*')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Palchi' })).toHaveAccessibleDescription('Obbligatorio')
  })

  it('"+ Palchi" porta il cursore nel primo campo della nuova riga', async () => {
    rendi()
    await userEvent.click(screen.getByRole('button', { name: '+ Palchi' }))
    expect(screen.getAllByRole('textbox')[0]).toHaveFocus()
    await userEvent.keyboard('12')
    await userEvent.click(screen.getByRole('button', { name: '+ Palchi' }))
    expect(screen.getAllByRole('textbox')[1]).toHaveFocus()
  })

  it('con più sotto-campi il cursore va al primo della nuova riga, non a un altro', async () => {
    const p = parametro('Palchi', {
      tipo: 'lista',
      sotto_campi: [
        { chiave: 'foglie', nome: 'Foglie', unita: null },
        { chiave: 'lungh', nome: 'Lunghezza', unita: 'cm' },
      ],
    })
    rendi([{ n: 1, valori: { foglie: 3, lungh: 2 } }], p)
    await userEvent.click(screen.getByRole('button', { name: '+ Palchi' }))
    expect(within(screen.getByRole('group', { name: 'Palchi 2' })).getByLabelText('Foglie')).toHaveFocus()
  })

  it('una lista già compilata non porta il cursore in nessun campo', () => {
    rendi([{ n: 1, valori: { f: 3 } }])
    expect(screen.getByRole('textbox')).not.toHaveFocus()
  })
})

describe('CampoLista: Rimuovi ultimo con valori', () => {
  it('se l\'ultima riga ha dei valori la toglie e lo dice con un avviso "Annulla"', async () => {
    const onChange = rendi([{ n: 1, valori: { f: 3 } }, { n: 2, valori: { f: 4 } }, { n: 3, valori: { f: 12 } }])
    await userEvent.click(screen.getByRole('button', { name: 'Rimuovi ultimo' }))
    expect(ultimo(onChange)).toEqual([{ n: 1, valori: { f: 3 } }, { n: 2, valori: { f: 4 } }])
    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledWith('Palchi 3 rimosso.', expect.objectContaining({ action: expect.objectContaining({ label: 'Annulla' }) }))
  })

  it('"Annulla" rimette la riga con i suoi valori', async () => {
    const onChange = rendi([{ n: 1, valori: { f: 3 } }, { n: 2, valori: { f: 12 } }])
    await userEvent.click(screen.getByRole('button', { name: 'Rimuovi ultimo' }))
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    act(() => annulla().onClick())
    expect(ultimo(onChange)).toEqual([{ n: 1, valori: { f: 3 } }, { n: 2, valori: { f: 12 } }])
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    expect(screen.getAllByRole('textbox')[1]).toHaveValue('12')
  })

  it('"Annulla" dopo altre modifiche rimette la riga in fondo con il numero che le spetta, senza perdere il resto', async () => {
    const onChange = rendi([{ n: 1, valori: { f: 3 } }, { n: 2, valori: { f: 12 } }])
    await userEvent.click(screen.getByRole('button', { name: 'Rimuovi ultimo' }))
    await userEvent.click(screen.getByRole('button', { name: '+ Palchi' }))
    await userEvent.type(screen.getAllByRole('textbox')[1], '8')
    act(() => annulla().onClick())
    expect(ultimo(onChange)).toEqual([
      { n: 1, valori: { f: 3 } },
      { n: 2, valori: { f: 8 } },
      { n: 3, valori: { f: 12 } },
    ])
  })

  it('un testo non numerico (NaN) conta come valore: si avvisa', async () => {
    rendi([{ n: 1, valori: { f: NaN } }])
    await userEvent.click(screen.getByRole('button', { name: 'Rimuovi ultimo' }))
    expect(toast).toHaveBeenCalledWith('Palchi 1 rimosso.', expect.anything())
  })

  it('una riga vuota si toglie senza avvisi', async () => {
    const onChange = rendi([{ n: 1, valori: { f: 3 } }, { n: 2, valori: { f: null } }])
    await userEvent.click(screen.getByRole('button', { name: 'Rimuovi ultimo' }))
    expect(ultimo(onChange)).toEqual([{ n: 1, valori: { f: 3 } }])
    expect(toast).not.toHaveBeenCalled()
  })

  it('uscendo dalla pagina l\'avviso con "Annulla" viene tolto', async () => {
    const { unmount } = render(
      <CampoLista parametro={palchi} valore={[{ n: 1, valori: { f: 5 } }]} onChange={() => {}} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Rimuovi ultimo' }))
    unmount()
    expect(toast.dismiss).toHaveBeenCalledWith('id-toast')
  })
})
