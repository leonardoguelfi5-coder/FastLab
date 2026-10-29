import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ValoriMisura } from '@/domain/tipi'
import { valoreVuoto } from '@/domain/misure'
import { parametro } from '@/domain/test-helpers'
import { FormMisura } from './FormMisura'

const altezza = parametro('Altezza', { unita: 'cm', valore_min: 0, valore_max: 300 })
const spad = parametro('SPAD', { n_letture: 3 })
const note = parametro('Note', { tipo: 'testo' })
const fiori = parametro('Fiori', { tipo: 'sino' })
const palchi = parametro('Palchi', { tipo: 'lista', sotto_campi: [{ chiave: 'f', nome: 'Foglie', unita: null }] })
const tutti = [altezza, spad, note, fiori, palchi]

function vuoti() {
  return Object.fromEntries(tutti.map((p) => [p.id, valoreVuoto(p)])) as ValoriMisura
}

/** Il modulo con uno stato vero; `onChange` registra ogni modifica. */
function rendi(obbligatori: string[] = [], iniziali: ValoriMisura = vuoti(), parametri = tutti) {
  const onChange = vi.fn<(v: ValoriMisura) => void>()
  function Banco() {
    const [v, setV] = useState(iniziali)
    return <FormMisura parametri={parametri} obbligatori={new Set(obbligatori)} valori={v} onChange={(nuovo) => { onChange(nuovo); setV(nuovo) }} />
  }
  render(<Banco />)
  return onChange
}

const ultimo = (onChange: ReturnType<typeof rendi>) => onChange.mock.calls.at(-1)?.[0] as ValoriMisura

describe('FormMisura', () => {
  it('mostra il controllo giusto per ogni tipo', () => {
    rendi()
    expect(screen.getByLabelText('Altezza')).toHaveAttribute('inputmode', 'decimal')
    expect(screen.getByLabelText('Note').tagName).toBe('TEXTAREA')
    expect(screen.getByRole('group', { name: 'Fiori' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sì' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Palchi' })).toBeInTheDocument()
  })

  it('con più letture mostra un campo per lettura: "SPAD · lettura 1", 2, 3', () => {
    rendi()
    for (const n of [1, 2, 3]) expect(screen.getByLabelText(`SPAD · lettura ${n}`)).toBeInTheDocument()
    expect(screen.queryByLabelText('SPAD · lettura 4')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('SPAD')).not.toBeInTheDocument()
  })

  it('se n_letture è stato ridotto dopo la misura, le letture in più restano visibili, modificabili e non spariscono', async () => {
    const ridotto = parametro('Clorofilla', { n_letture: 1 })
    const onChange = rendi([], { [ridotto.id]: [30, 31.5, 29] }, [ridotto])
    for (const n of [1, 2, 3]) expect(screen.getByLabelText(`Clorofilla · lettura ${n}`)).toBeInTheDocument()
    expect(screen.queryByLabelText('Clorofilla · lettura 4')).not.toBeInTheDocument()

    // Correggere la prima non tocca le altre.
    await userEvent.type(screen.getByLabelText('Clorofilla · lettura 1'), '32')
    expect(ultimo(onChange)[ridotto.id]).toEqual([32, 31.5, 29])
    // Una in più si può svuotare, e il suo campo resta lì.
    await userEvent.clear(screen.getByLabelText('Clorofilla · lettura 3'))
    expect(ultimo(onChange)[ridotto.id]).toEqual([32, 31.5, null])
    expect(screen.getByLabelText('Clorofilla · lettura 3')).toBeInTheDocument()
  })

  it('con una sola lettura il campo porta solo il nome, con l\'unità', () => {
    rendi()
    expect(screen.queryByLabelText('Altezza · lettura 1')).not.toBeInTheDocument()
    expect(screen.getByText('cm')).toBeInTheDocument()
  })

  it('digitare in una lettura aggiorna solo quella, lasciando le altre', async () => {
    const onChange = rendi()
    await userEvent.type(screen.getByLabelText('SPAD · lettura 2'), '41,5')
    expect(ultimo(onChange)[spad.id]).toEqual([null, 41.5, null])
    await userEvent.type(screen.getByLabelText('SPAD · lettura 3'), '40')
    expect(ultimo(onChange)[spad.id]).toEqual([null, 41.5, 40])
  })

  it('un testo non numerico in una lettura diventa NaN nei valori (il salvataggio sarà bloccato dalla validazione)', async () => {
    const onChange = rendi()
    await userEvent.type(screen.getByLabelText('Altezza'), 'x')
    expect(ultimo(onChange)[altezza.id]).toEqual([NaN])
  })

  it('le altre parti dei valori restano come sono', async () => {
    const onChange = rendi()
    await userEvent.type(screen.getByLabelText('Note'), 'ok')
    await userEvent.click(screen.getByRole('button', { name: 'No' }))
    await userEvent.click(screen.getByRole('button', { name: '+ Palchi' }))
    const v = ultimo(onChange)
    expect(v[note.id]).toBe('ok')
    expect(v[fiori.id]).toBe(false)
    expect(v[palchi.id]).toEqual([{ n: 1, valori: { f: null } }])
    expect(v[altezza.id]).toEqual([null])
  })

  it('i parametri obbligatori hanno l\'asterisco e sono segnati come richiesti', () => {
    rendi([altezza.id, spad.id, note.id, fiori.id, palchi.id])
    expect(screen.getAllByText('*')).toHaveLength(1 + 3 + 1 + 1 + 1)
    expect(screen.getByLabelText(/^Altezza/)).toHaveAttribute('aria-required', 'true')
    expect(screen.getByLabelText(/^Note/)).toHaveAttribute('aria-required', 'true')
    expect(screen.getByRole('group', { name: 'Fiori' })).toHaveAccessibleDescription('Obbligatorio')
    expect(screen.getByRole('group', { name: 'Palchi' })).toHaveAccessibleDescription('Obbligatorio')
  })

  it('senza parametri obbligatori non compare nessun asterisco', () => {
    rendi()
    expect(screen.queryByText('*')).not.toBeInTheDocument()
  })

  it('un valore fuori dall\'intervallo atteso mostra un avviso sul campo, senza bloccare', async () => {
    const onChange = rendi()
    const campo = screen.getByLabelText('Altezza')
    await userEvent.type(campo, '350')
    expect(ultimo(onChange)[altezza.id]).toEqual([350])
    expect(campo).toHaveAccessibleDescription(/fuori dall'intervallo atteso \(0–300\)/i)
    expect(campo).not.toBeInvalid()
  })

  it('un valore nell\'intervallo non mostra avvisi', async () => {
    rendi()
    const campo = screen.getByLabelText('Altezza')
    await userEvent.type(campo, '120')
    expect(campo).toHaveAccessibleDescription('cm')
  })

  it.each([
    ['con un minimo sotto zero', { valore_min: -3, valore_max: 0 }, 'text'],
    ['con il solo minimo sotto zero', { valore_min: -3 }, 'text'],
    ['senza minimo e con il massimo sotto zero', { valore_max: -1 }, 'text'],
    ['senza minimo e con il massimo a zero', { valore_max: 0 }, 'text'],
    ['senza minimo e con il massimo sopra zero', { valore_max: 10 }, 'decimal'],
    ['con il minimo a zero', { valore_min: 0, valore_max: 100 }, 'decimal'],
    ['senza limiti', {}, 'decimal'],
  ] as const)('tastiera con un parametro %s: %s', (_nome, limiti, tastiera) => {
    const p = parametro('Potenziale', limiti)
    rendi([], { [p.id]: valoreVuoto(p) }, [p])
    expect(screen.getByLabelText('Potenziale')).toHaveAttribute('inputmode', tastiera)
  })

  it('mostra i valori già presenti', () => {
    const v = vuoti()
    v[altezza.id] = [24.5]
    v[note.id] = 'foglie gialle'
    v[fiori.id] = true
    rendi([], v)
    expect(screen.getByLabelText('Altezza')).toHaveValue('24,5')
    expect(screen.getByLabelText('Note')).toHaveValue('foglie gialle')
    expect(screen.getByRole('button', { name: 'Sì' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('se manca il valore di un parametro mostra comunque il campo vuoto', () => {
    rendi([], {})
    expect(screen.getByLabelText('Altezza')).toHaveValue('')
    expect(screen.getByLabelText('SPAD · lettura 3')).toHaveValue('')
  })
})
