import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bozzaVuota } from '@/domain/bozza'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import { conPiante } from '@/domain/test-helpers'
import type { BozzaEsperimento } from '@/domain/tipi'
import { PassoFenologica } from './PassoFenologica'

function rendi(iniziale: BozzaEsperimento) {
  const onChange = vi.fn<(b: BozzaEsperimento) => void>()
  const onSalta = vi.fn()
  function Banco() {
    const [b, setB] = useState(iniziale)
    return <PassoFenologica bozza={b} onChange={(nuova) => { onChange(nuova); setB(nuova) }} onSalta={onSalta} />
  }
  render(<Banco />)
  return { onChange, onSalta }
}

const ultima = (onChange: ReturnType<typeof rendi>['onChange']) => onChange.mock.calls.at(-1)?.[0] as BozzaEsperimento
const tabella = (b: BozzaEsperimento) => b.strumenti.find(s => s.tipo === 'fenologico')

describe('PassoFenologica', () => {
  it('senza tabella propone di crearla o di fare a meno, e "Crea la tabella fenologica" ne aggiunge una vuota', async () => {
    const utente = userEvent.setup({ delay: null })
    const { onChange } = rendi(conPiante(['1']))

    expect(screen.getByRole('button', { name: 'Questo esperimento non ha rilievi fenologici' })).toBeInTheDocument()
    await utente.click(screen.getByRole('button', { name: 'Crea la tabella fenologica' }))

    const b = ultima(onChange)
    expect(tabella(b)).toMatchObject({ nome: 'Tabella fenologica', tipo: 'fenologico', ordine: 1, parametri: [] })
    expect(b.strumenti).toHaveLength(2)
    expect(screen.getByLabelText('Nome dello strumento')).toHaveValue('Tabella fenologica')
    expect(screen.queryByRole('button', { name: 'Crea la tabella fenologica' })).not.toBeInTheDocument()
  })

  it('"Questo esperimento non ha rilievi fenologici" senza tabella lascia la bozza com\'è e va avanti', async () => {
    const utente = userEvent.setup({ delay: null })
    const { onChange, onSalta } = rendi(conPiante(['1']))

    await utente.click(screen.getByRole('button', { name: 'Questo esperimento non ha rilievi fenologici' }))
    expect(onSalta).toHaveBeenCalledOnce()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('se c\'era una tabella vuota la toglie e va avanti', async () => {
    const utente = userEvent.setup({ delay: null })
    const { onChange, onSalta } = rendi(conPiante(['1']))
    await utente.click(screen.getByRole('button', { name: 'Crea la tabella fenologica' }))
    expect(screen.getByText('Lo strumento "Tabella fenologica" non ha valori.')).toBeInTheDocument()

    await utente.click(screen.getByRole('button', { name: 'Questo esperimento non ha rilievi fenologici' }))
    expect(tabella(ultima(onChange))).toBeUndefined()
    expect(ultima(onChange).strumenti).toHaveLength(1)
    expect(onSalta).toHaveBeenCalledOnce()
  })

  it('con le voci della tabella mostra l\'editor con tutti i tipi, e non propone di saltarla', () => {
    rendi(bozzaHydrochar(SEMI_CATALOGO))

    expect(screen.getByLabelText('Nome dello strumento')).toHaveValue('Tabella fenologica')
    const valori = within(screen.getByRole('list', { name: 'Valori' }))
    expect(valori.getAllByRole('listitem')).toHaveLength(7)
    expect(valori.getByRole('button', { name: /^Palchi/ })).toHaveTextContent('Lista ripetuta · 1 sotto-campo · progressivo')
    expect(valori.getByRole('button', { name: /^Note/ })).toHaveTextContent('Testo')
    expect(screen.queryByRole('button', { name: 'Questo esperimento non ha rilievi fenologici' })).not.toBeInTheDocument()
  })

  it('aggiungere e togliere voci cambia i parametri della bozza, senza toccare quelli degli altri strumenti', async () => {
    const utente = userEvent.setup({ delay: null })
    const iniziale = bozzaHydrochar(SEMI_CATALOGO)
    const { onChange } = rendi(iniziale)

    await utente.click(screen.getByRole('button', { name: 'Aggiungi valore' }))
    await utente.type(screen.getByLabelText('Nome'), 'Pollini')
    let b = ultima(onChange)
    expect(b.parametri).toHaveLength(iniziale.parametri.length + 1)
    expect(b.parametri.at(-1)).toMatchObject({ nome: 'Pollini', ordine: Math.max(...iniziale.parametri.map(p => p.ordine)) + 1 })

    await utente.click(screen.getByRole('button', { name: 'Togli il valore «Pollini»' }))
    b = ultima(onChange)
    expect(b.parametri.map(p => p.id)).toEqual(iniziale.parametri.map(p => p.id))
    expect(b.strumenti.filter(s => s.tipo === 'strumento')).toEqual(iniziale.strumenti.filter(s => s.tipo === 'strumento'))
  })

  it('una voce può essere obbligatoria', async () => {
    const utente = userEvent.setup({ delay: null })
    const { onChange } = rendi(bozzaHydrochar(SEMI_CATALOGO))

    await utente.click(screen.getByRole('button', { name: /^N frutti invaiati/ }))
    await utente.click(screen.getByRole('switch', { name: /Obbligatorio/ }))
    const b = ultima(onChange)
    const invaiati = b.parametri.find(p => p.nome === 'N frutti invaiati')
    expect(tabella(b)?.parametri.filter(pp => pp.obbligatorio).map(pp => pp.parametro_id)).toEqual([invaiati?.id])
  })

  it('"Elimina la tabella fenologica" chiede conferma, poi toglie la tabella e le sue voci e resta sul passo', async () => {
    const utente = userEvent.setup({ delay: null })
    const iniziale = bozzaHydrochar(SEMI_CATALOGO)
    const { onChange, onSalta } = rendi(iniziale)

    await utente.click(screen.getByRole('button', { name: 'Elimina la tabella fenologica' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('Eliminare la tabella fenologica?')).toBeInTheDocument()
    await utente.click(within(dialogo).getByRole('button', { name: 'Annulla' }))
    expect(onChange).not.toHaveBeenCalled()

    await utente.click(screen.getByRole('button', { name: 'Elimina la tabella fenologica' }))
    await utente.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Elimina' }))
    const b = ultima(onChange)
    expect(tabella(b)).toBeUndefined()
    expect(b.parametri).toHaveLength(iniziale.parametri.length - 7)
    expect(onSalta).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Crea la tabella fenologica' })).toBeInTheDocument()
  })

  it('con la bozza vuota la tabella si crea con ordine 0', async () => {
    const utente = userEvent.setup({ delay: null })
    const { onChange } = rendi(bozzaVuota())
    await utente.click(screen.getByRole('button', { name: 'Crea la tabella fenologica' }))
    expect(tabella(ultima(onChange))?.ordine).toBe(0)
  })
})
