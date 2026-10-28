import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Parametro } from '@/domain/tipi'
import { parametro } from '@/domain/test-helpers'
import { EditorParametro } from './EditorParametro'

/** L'editor con uno stato vero, come nella pagina; `onChange` registra ogni modifica. */
function rendi(iniziale: Parametro, tipoBloccato?: boolean) {
  const onChange = vi.fn<(p: Parametro) => void>()
  function Banco() {
    const [p, setP] = useState(iniziale)
    return <EditorParametro valore={p} tipoBloccato={tipoBloccato} onChange={(nuovo) => { onChange(nuovo); setP(nuovo) }} />
  }
  render(<Banco />)
  return onChange
}

const ultimo = (onChange: ReturnType<typeof rendi>) => onChange.mock.calls.at(-1)?.[0] as Parametro
const CAMPI_NUMERO = ['Unità', 'Letture per misura', 'Minimo', 'Massimo']

describe('EditorParametro: opzioni per tipo', () => {
  it('con tipo numero mostra Unità, Letture per misura, Minimo, Massimo, Progressivo e Ricorda tra piante', () => {
    rendi(parametro('Altezza'))
    for (const campo of CAMPI_NUMERO) expect(screen.getByLabelText(campo)).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Progressivo' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Ricorda tra piante' })).toBeInTheDocument()
  })

  it('con tipo lista mostra Sotto-campi (con "+ Sotto-campo") e Progressivo, ma non Minimo né Ricorda tra piante', () => {
    rendi(parametro('Palchi', { tipo: 'lista' }))
    const gruppo = screen.getByRole('group', { name: 'Sotto-campi' })
    expect(within(gruppo).getByRole('button', { name: '+ Sotto-campo' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Progressivo' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Minimo')).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Ricorda tra piante' })).not.toBeInTheDocument()
  })

  it.each(['testo', 'sino'] as const)('con tipo %s non compare nessuna opzione extra', (tipo) => {
    rendi(parametro('Note', { tipo }))
    for (const campo of CAMPI_NUMERO) expect(screen.queryByLabelText(campo)).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Sotto-campi' })).not.toBeInTheDocument()
    // Restano solo il nome e il tipo.
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.getByLabelText('Nome')).toBeInTheDocument()
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument()
  })

  it('tipoBloccato: il selettore del tipo è disabilitato e spiega perché', () => {
    rendi(parametro('Altezza'), true)
    const tipo = screen.getByLabelText('Tipo')
    expect(tipo).toBeDisabled()
    expect(screen.getByText('Il tipo non si può cambiare: ci sono già dati.')).toBeInTheDocument()
    expect(tipo).toHaveAccessibleDescription(/Il tipo non si può cambiare: ci sono già dati\./)
  })

  it('senza tipoBloccato il tipo si può cambiare', () => {
    rendi(parametro('Altezza'))
    expect(screen.getByLabelText('Tipo')).toBeEnabled()
    expect(screen.queryByText('Il tipo non si può cambiare: ci sono già dati.')).not.toBeInTheDocument()
  })

  it('cambiando tipo azzera le opzioni che non valgono più', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(parametro('Conta', {
      unita: 'n', progressivo: true, ricorda_tra_piante: true, n_letture: 3, valore_min: 0, valore_max: 10,
    }))

    await utente.selectOptions(screen.getByLabelText('Tipo'), 'lista')
    expect(ultimo(onChange)).toMatchObject({
      tipo: 'lista', unita: null, progressivo: true, ricorda_tra_piante: false, n_letture: 1,
      valore_min: null, valore_max: null, sotto_campi: [],
    })

    await utente.selectOptions(screen.getByLabelText('Tipo'), 'testo')
    expect(ultimo(onChange)).toMatchObject({ tipo: 'testo', progressivo: false, sotto_campi: [] })
  })
})

describe('EditorParametro: sotto-campi', () => {
  const palchi = () => parametro('Palchi', { tipo: 'lista', sotto_campi: [{ chiave: 'n_foglie', nome: 'N foglie', unita: null }] })

  it('aggiungendo un sotto-campo, onChange riceve sotto_campi con una chiave nuova non vuota', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(palchi())

    await utente.click(screen.getByRole('button', { name: '+ Sotto-campo' }))

    const { sotto_campi } = ultimo(onChange)
    expect(sotto_campi).toHaveLength(2)
    expect(sotto_campi[0]).toEqual({ chiave: 'n_foglie', nome: 'N foglie', unita: null })
    expect(sotto_campi[1].chiave).toBeTruthy()
    expect(sotto_campi[1].chiave).not.toBe('n_foglie')
  })

  it('rinominare un sotto-campo non cambia la sua chiave; l\'unità vuota resta null', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(palchi())

    const nome = screen.getByLabelText('Nome del sotto-campo 1')
    await utente.clear(nome)
    await utente.type(nome, 'Foglie')
    await utente.type(screen.getByLabelText('Unità del sotto-campo 1'), 'n')
    expect(ultimo(onChange).sotto_campi).toEqual([{ chiave: 'n_foglie', nome: 'Foglie', unita: 'n' }])

    await utente.clear(screen.getByLabelText('Unità del sotto-campo 1'))
    expect(ultimo(onChange).sotto_campi[0].unita).toBeNull()
  })

  it('segnala il sotto-campo senza nome e quello con un nome già usato', async () => {
    const utente = userEvent.setup({ delay: null })
    rendi(palchi())

    await utente.click(screen.getByRole('button', { name: '+ Sotto-campo' }))
    expect(screen.getByLabelText('Nome del sotto-campo 2')).toHaveAccessibleDescription('Dai un nome al sotto-campo.')

    await utente.type(screen.getByLabelText('Nome del sotto-campo 2'), ' n FOGLIE ')
    expect(screen.getByLabelText('Nome del sotto-campo 2')).toHaveAccessibleDescription('C\'è già un sotto-campo con questo nome.')
    expect(screen.getByLabelText('Nome del sotto-campo 2')).toHaveAttribute('aria-invalid', 'true')
  })

  it('toglie un sotto-campo; senza sotto-campi chiede di aggiungerne uno', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(palchi())

    await utente.click(screen.getByRole('button', { name: 'Togli il sotto-campo 1' }))
    expect(ultimo(onChange).sotto_campi).toEqual([])
    expect(screen.getByText('Aggiungi almeno un sotto-campo.')).toBeInTheDocument()
  })
})

describe('EditorParametro: campi numerici', () => {
  it('Letture per misura accetta solo interi da 1 a 20', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(parametro('SPAD'))
    const letture = screen.getByLabelText('Letture per misura')

    for (const sbagliato of ['0', '-1', '2,5', '21']) {
      await utente.clear(letture)
      await utente.type(letture, sbagliato)
      expect(letture).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByText('Scrivi un numero intero da 1 a 20.')).toBeInTheDocument()
    }
    expect(onChange.mock.calls.every(([p]) => Number.isInteger(p.n_letture) && p.n_letture >= 1 && p.n_letture <= 20)).toBe(true)

    await utente.clear(letture)
    await utente.type(letture, '3')
    expect(ultimo(onChange).n_letture).toBe(3)
    expect(letture).not.toHaveAttribute('aria-invalid')
  })

  it('uscendo da un campo con un valore non valido torna all\'ultimo valore valido', async () => {
    const utente = userEvent.setup({ delay: null })
    rendi(parametro('SPAD', { n_letture: 3 }))
    const letture = screen.getByLabelText('Letture per misura')

    await utente.clear(letture)
    await utente.type(letture, '0')
    await utente.tab()
    expect(letture).toHaveValue('3')
    expect(screen.queryByText('Scrivi un numero intero da 1 a 20.')).not.toBeInTheDocument()
  })

  it('Minimo e Massimo accettano la virgola decimale e si possono svuotare', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(parametro('Altezza', { valore_max: 300 }))

    await utente.type(screen.getByLabelText('Minimo'), '1,5')
    expect(ultimo(onChange).valore_min).toBe(1.5)
    expect(screen.getByLabelText('Massimo')).toHaveValue('300')

    await utente.clear(screen.getByLabelText('Massimo'))
    expect(ultimo(onChange).valore_max).toBeNull()

    await utente.type(screen.getByLabelText('Massimo'), 'abc')
    expect(screen.getByText('Scrivi un numero, es. 12,5.')).toBeInTheDocument()
    expect(ultimo(onChange).valore_max).toBeNull()
  })

  it('l\'unità vuota diventa null, gli interruttori cambiano le opzioni', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(parametro('Temp aria'))

    await utente.type(screen.getByLabelText('Unità'), '°C')
    expect(ultimo(onChange).unita).toBe('°C')
    await utente.clear(screen.getByLabelText('Unità'))
    expect(ultimo(onChange).unita).toBeNull()

    await utente.click(screen.getByRole('switch', { name: 'Ricorda tra piante' }))
    expect(ultimo(onChange).ricorda_tra_piante).toBe(true)
    await utente.click(screen.getByRole('switch', { name: 'Progressivo' }))
    expect(ultimo(onChange).progressivo).toBe(true)
  })
})
