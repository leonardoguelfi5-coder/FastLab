import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NumericField } from './NumericField'

const campo = () => screen.getByRole('textbox') as HTMLInputElement

/** Il campo con uno stato vero, come in una pagina: ripete al campo quel che il campo comunica. */
function ConStato({ iniziale = null, onChange }: { iniziale?: number | null; onChange: (v: number | null) => void }) {
  const [v, setV] = useState<number | null>(iniziale)
  return <NumericField label="SPAD" value={v} onChange={(x) => { onChange(x); setV(x) }} />
}

describe('NumericField', () => {
  it('digitando 2, 4, virgola, 5 mostra 24,5 e comunica 24.5', async () => {
    const onChange = vi.fn()
    render(<NumericField label="Altezza" value={null} onChange={onChange} />)
    await userEvent.type(campo(), '24,5')
    expect(campo()).toHaveValue('24,5')
    expect(onChange).toHaveBeenLastCalledWith(24.5)
  })

  it('accetta anche il punto decimale', async () => {
    const onChange = vi.fn()
    render(<NumericField label="Altezza" value={null} onChange={onChange} />)
    await userEvent.type(campo(), '24.5')
    expect(onChange).toHaveBeenLastCalledWith(24.5)
  })

  it('un testo che non è un numero resta nel campo e comunica NaN, perché il salvataggio si fermi', async () => {
    const onChange = vi.fn()
    render(<NumericField label="Altezza" value={null} onChange={onChange} />)
    await userEvent.type(campo(), 'abc')
    expect(campo()).toHaveValue('abc')
    expect(onChange).toHaveBeenLastCalledWith(NaN)
  })

  it('svuotando il campo comunica null', async () => {
    const onChange = vi.fn()
    render(<NumericField label="Altezza" value={null} onChange={onChange} />)
    await userEvent.type(campo(), '7{Backspace}')
    expect(campo()).toHaveValue('')
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('con un nuovo value da fuori il campo mostra il nuovo valore', () => {
    const { rerender } = render(<NumericField label="Altezza" value={null} onChange={() => {}} />)
    rerender(<NumericField label="Altezza" value={30} onChange={() => {}} />)
    expect(campo()).toHaveValue('30')
    rerender(<NumericField label="Altezza" value={2.5} onChange={() => {}} />)
    expect(campo()).toHaveValue('2,5')
    rerender(<NumericField label="Altezza" value={null} onChange={() => {}} />)
    expect(campo()).toHaveValue('')
  })

  it('parte dal value ricevuto, con la virgola', () => {
    render(<NumericField label="Altezza" value={24.5} onChange={() => {}} />)
    expect(campo()).toHaveValue('24,5')
  })

  it('con uno stato vero non riscrive quel che si sta digitando ("24," resta "24,")', async () => {
    const onChange = vi.fn()
    render(<ConStato onChange={onChange} />)
    await userEvent.type(campo(), '24,')
    expect(campo()).toHaveValue('24,')
    expect(onChange).toHaveBeenLastCalledWith(24)
    await userEvent.type(campo(), '5')
    expect(campo()).toHaveValue('24,5')
    expect(onChange).toHaveBeenLastCalledWith(24.5)
  })

  it('con uno stato vero, un testo non valido resta com\'è anche se lo stato diventa NaN', async () => {
    render(<ConStato iniziale={12} onChange={() => {}} />)
    // Il tocco seleziona tutto il testo precompilato: il tasto Fine porta il cursore in fondo, per accodare.
    await userEvent.type(campo(), '{End}x')
    expect(campo()).toHaveValue('12x')
  })

  it('usa la tastiera decimale e non ha il suggerimento del browser', () => {
    render(<NumericField label="Altezza" value={null} onChange={() => {}} />)
    expect(campo()).toHaveAttribute('inputmode', 'decimal')
    expect(campo()).toHaveAttribute('autocomplete', 'off')
  })

  it('con negativo usa la tastiera con il segno meno', () => {
    render(<NumericField label="Potenziale idrico" value={null} onChange={() => {}} negativo />)
    expect(campo()).toHaveAttribute('inputmode', 'text')
  })

  it('l\'etichetta è collegata al campo', () => {
    render(<NumericField label="Altezza" value={null} onChange={() => {}} />)
    expect(screen.getByLabelText('Altezza')).toBe(campo())
  })

  it('mostra l\'unità a destra e la collega al campo', () => {
    render(<NumericField label="Altezza" unita="cm" value={null} onChange={() => {}} />)
    expect(screen.getByText('cm')).toBeInTheDocument()
    expect(campo()).toHaveAccessibleDescription('cm')
  })

  it('con obbligatorio mette l\'asterisco dopo l\'etichetta senza cambiare il nome del campo', () => {
    render(<NumericField label="Altezza" obbligatorio value={null} onChange={() => {}} />)
    expect(campo()).toHaveAttribute('aria-required', 'true')
    expect(screen.getByText('*')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Altezza' })).toBe(campo())
  })

  it('senza obbligatorio non c\'è asterisco', () => {
    render(<NumericField label="Altezza" value={null} onChange={() => {}} />)
    expect(campo()).not.toHaveAttribute('aria-required')
    expect(screen.queryByText('*')).not.toBeInTheDocument()
  })

  it('required (usato dai moduli della versione 2) arriva al campo', () => {
    render(<NumericField label="ID Pianta" required value={null} onChange={() => {}} />)
    expect(campo()).toBeRequired()
  })

  it('l\'avviso compare sotto il campo, non blocca e non è un errore', () => {
    render(<NumericField label="SPAD" value={120} onChange={() => {}} avviso="Fuori dall'intervallo atteso (0–100)." />)
    expect(campo()).toHaveAccessibleDescription("Fuori dall'intervallo atteso (0–100).")
    expect(campo()).not.toBeInvalid()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('un testo non valido segnala l\'errore sul campo con un messaggio', async () => {
    render(<NumericField label="Altezza" value={null} onChange={() => {}} />)
    await userEvent.type(campo(), 'abc')
    expect(campo()).toBeInvalid()
    expect(campo()).toHaveAccessibleDescription('Scrivi un numero, es. 12,5.')
  })

  it('un numero valido non segnala errori', async () => {
    render(<NumericField label="Altezza" value={null} onChange={() => {}} />)
    await userEvent.type(campo(), '12,5')
    expect(campo()).toBeValid()
  })

  it('il segno meno da solo è un inizio di numero: niente errore finché si scrive, errore se si esce', async () => {
    const onChange = vi.fn()
    render(<NumericField label="Temperatura" value={null} onChange={onChange} />)
    await userEvent.type(campo(), '-')
    expect(onChange).toHaveBeenLastCalledWith(NaN)
    expect(campo()).toBeValid()
    await userEvent.type(campo(), '3')
    expect(onChange).toHaveBeenLastCalledWith(-3)
    expect(campo()).toBeValid()

    await userEvent.clear(campo())
    await userEvent.type(campo(), '-')
    await userEvent.tab()
    expect(campo()).toBeInvalid()
  })

  it('placeholder facoltativo', () => {
    render(<NumericField label="Altezza" value={null} onChange={() => {}} placeholder="es. 24,5" />)
    expect(campo()).toHaveAttribute('placeholder', 'es. 24,5')
  })

  it('toccando un campo precompilato ne seleziona tutto il testo, perché scrivere lo sostituisca', async () => {
    render(<NumericField label="Altezza" value={24.5} onChange={() => {}} />)
    await userEvent.click(campo())
    expect(campo().selectionStart).toBe(0)
    expect(campo().selectionEnd).toBe(4)
  })

  it('scrivere in un campo precompilato sostituisce il valore: 24,5 poi 31 dà 31, non 24,531', async () => {
    const onChange = vi.fn()
    render(<NumericField label="Altezza" value={24.5} onChange={onChange} />)
    await userEvent.type(campo(), '31')
    expect(onChange).toHaveBeenLastCalledWith(31)
    expect(campo()).toHaveValue('31')
  })

  it('un secondo tocco sul campo già attivo mette il cursore dove serve, senza riselezionare', async () => {
    const onChange = vi.fn()
    render(<NumericField label="Altezza" value={24.5} onChange={onChange} />)
    await userEvent.type(campo(), '31')
    await userEvent.click(campo())
    expect(campo().selectionStart).toBe(campo().selectionEnd)
    await userEvent.keyboard('9')
    expect(campo()).toHaveValue('319')
    expect(onChange).toHaveBeenLastCalledWith(319)
  })

  it('uscendo dal campo un numero valido passa alla scrittura italiana, senza cambiarne il valore', async () => {
    const onChange = vi.fn()
    render(<NumericField label="Altezza" value={null} onChange={onChange} />)
    await userEvent.type(campo(), '24.5')
    await userEvent.tab()
    expect(campo()).toHaveValue('24,5')
    expect(onChange).toHaveBeenLastCalledWith(24.5)
    expect(onChange).toHaveBeenCalledTimes(4)
  })

  it.each([
    [',5', '0,5', 0.5],
    ['24,', '24', 24],
    ['-,5', '-0,5', -0.5],
    ['007', '7', 7],
  ])('uscendo dal campo "%s" diventa "%s"', async (digitato, mostrato, valore) => {
    const onChange = vi.fn()
    render(<NumericField label="Altezza" value={null} onChange={onChange} />)
    await userEvent.type(campo(), digitato)
    await userEvent.tab()
    expect(campo()).toHaveValue(mostrato)
    expect(onChange).toHaveBeenLastCalledWith(valore)
  })

  it('uscendo dal campo un testo non valido resta com\'è, e un numero che la scrittura italiana non sa rileggere non viene toccato', async () => {
    const onChange = vi.fn()
    render(<NumericField label="Altezza" value={null} onChange={onChange} />)
    await userEvent.type(campo(), 'abc')
    await userEvent.tab()
    expect(campo()).toHaveValue('abc')
    await userEvent.clear(campo())
    await userEvent.type(campo(), '0,0000001')
    await userEvent.tab()
    // String(1e-7) è "1e-7", che non si rilegge: il testo digitato resta.
    expect(campo()).toHaveValue('0,0000001')
    expect(onChange).toHaveBeenLastCalledWith(1e-7)
  })

  it('un value NaN con il campo vuoto segnala l\'errore, non un campo vuoto qualunque', () => {
    render(<NumericField label="Altezza" value={NaN} onChange={() => {}} />)
    expect(campo()).toHaveValue('')
    expect(campo()).toBeInvalid()
    expect(campo()).toHaveAccessibleDescription('Scrivi un numero, es. 12,5.')
  })

  it('con un value NaN l\'errore resta anche con il campo attivo e passa quando si scrive un numero', async () => {
    const onChange = vi.fn()
    render(<ConStato iniziale={NaN} onChange={onChange} />)
    await userEvent.click(campo())
    expect(campo()).toBeInvalid()
    await userEvent.type(campo(), '5')
    expect(onChange).toHaveBeenLastCalledWith(5)
    expect(campo()).toBeValid()
  })
})
