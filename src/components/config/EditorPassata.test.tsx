import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Parametro, Passata } from '@/domain/tipi'
import { parametro } from '@/domain/test-helpers'
import { EditorPassata } from './EditorPassata'

const altezza = parametro('Altezza', { unita: 'cm', ordine: 0 })
const spad = parametro('SPAD', { ordine: 1 })
const vecchio = parametro('Vecchio', { ordine: 2, archiviato: true })
const PARAMETRI = [altezza, spad, vecchio]

function passata(parametri: Passata['parametri']): Passata {
  return { id: crypto.randomUUID(), nome: 'Fenologici', icona: '🌱', ordine: 0, parametri }
}

function rendi(iniziale: Passata, parametri: Parametro[] = PARAMETRI) {
  const onChange = vi.fn<(p: Passata) => void>()
  function Banco() {
    const [p, setP] = useState(iniziale)
    return <EditorPassata valore={p} parametri={parametri} onChange={(nuova) => { onChange(nuova); setP(nuova) }} />
  }
  render(<Banco />)
  return onChange
}

const ultima = (onChange: ReturnType<typeof rendi>) => onChange.mock.calls.at(-1)?.[0] as Passata
const riga = (nome: string) => within(screen.getByText(nome).closest('li') as HTMLElement)

describe('EditorPassata', () => {
  it('ha nome e icona modificabili; l\'icona vuota diventa null', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(passata([]))

    expect(screen.getByLabelText('Nome della passata')).toHaveValue('Fenologici')
    await utente.clear(screen.getByLabelText('Icona'))
    expect(ultima(onChange).icona).toBeNull()
    await utente.type(screen.getByLabelText('Icona'), '📏')
    expect(ultima(onChange).icona).toBe('📏')
  })

  it('elenca solo i parametri non archiviati, ognuno con "Incluso" e "Obbligatorio"', () => {
    rendi(passata([]))
    expect(screen.queryByText('Vecchio')).not.toBeInTheDocument()
    for (const nome of ['Altezza', 'SPAD']) {
      expect(riga(nome).getByRole('switch', { name: /Incluso/ })).toBeInTheDocument()
      expect(riga(nome).getByRole('switch', { name: /Obbligatorio/ })).toBeInTheDocument()
    }
  })

  it('"Obbligatorio" è attivo solo se il parametro è incluso', () => {
    rendi(passata([{ parametro_id: altezza.id, obbligatorio: false, ordine: 0 }]))
    expect(riga('Altezza').getByRole('switch', { name: /Obbligatorio/ })).not.toHaveAttribute('aria-disabled', 'true')
    expect(riga('SPAD').getByRole('switch', { name: /Obbligatorio/ })).toHaveAttribute('aria-disabled', 'true')
  })

  it('includere un parametro lo aggiunge in fondo; escluderlo lo toglie e rinumera', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(passata([{ parametro_id: altezza.id, obbligatorio: true, ordine: 0 }]))

    await utente.click(riga('SPAD').getByRole('switch', { name: /Incluso/ }))
    expect(ultima(onChange).parametri).toEqual([
      { parametro_id: altezza.id, obbligatorio: true, ordine: 0 },
      { parametro_id: spad.id, obbligatorio: false, ordine: 1 },
    ])

    await utente.click(riga('Altezza').getByRole('switch', { name: /Incluso/ }))
    expect(ultima(onChange).parametri).toEqual([{ parametro_id: spad.id, obbligatorio: false, ordine: 0 }])
  })

  it('"Obbligatorio" si accende e si spegne', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(passata([{ parametro_id: altezza.id, obbligatorio: false, ordine: 0 }]))

    await utente.click(riga('Altezza').getByRole('switch', { name: /Obbligatorio/ }))
    expect(ultima(onChange).parametri[0].obbligatorio).toBe(true)
  })

  it('le frecce cambiano l\'ordine dei parametri inclusi', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(passata([
      { parametro_id: altezza.id, obbligatorio: false, ordine: 0 },
      { parametro_id: spad.id, obbligatorio: true, ordine: 1 },
    ]))

    // Il primo non sale e l'ultimo non scende.
    expect(screen.getByRole('button', { name: 'Sposta «Altezza» su' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sposta «SPAD» giù' })).toBeDisabled()

    await utente.click(screen.getByRole('button', { name: 'Sposta «SPAD» su' }))
    expect(ultima(onChange).parametri).toEqual([
      { parametro_id: spad.id, obbligatorio: true, ordine: 0 },
      { parametro_id: altezza.id, obbligatorio: false, ordine: 1 },
    ])
    // L'elenco segue il nuovo ordine.
    const nomi = screen.getAllByRole('listitem').map(li => within(li).getByTestId('nome-parametro').textContent)
    expect(nomi).toEqual(['SPAD', 'Altezza'])
  })

  it('non perde i parametri archiviati già presenti nella passata', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(passata([
      { parametro_id: vecchio.id, obbligatorio: false, ordine: 0 },
      { parametro_id: altezza.id, obbligatorio: false, ordine: 1 },
    ]))

    await utente.click(riga('SPAD').getByRole('switch', { name: /Incluso/ }))
    expect(ultima(onChange).parametri.map(p => p.parametro_id)).toEqual([altezza.id, spad.id, vecchio.id])
  })

  it('senza parametri lo dice', () => {
    rendi(passata([]), [])
    expect(screen.getByText('Non ci sono ancora parametri da includere.')).toBeInTheDocument()
  })
})
