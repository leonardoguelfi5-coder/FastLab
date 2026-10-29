import { describe, expect, it, vi } from 'vitest'
import { useState, type ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { nuovaTabellaFenologica, nuovoStrumento } from '@/domain/bozza'
import { parametro } from '@/domain/test-helpers'
import type { Parametro, Strumento } from '@/domain/tipi'
import { EditorStrumento } from './EditorStrumento'

type Valore = { strumento: Strumento; parametri: Parametro[] }

function collega(strumento: Strumento, parametri: Parametro[], obbligatori: string[] = []): Valore {
  return {
    strumento: {
      ...strumento,
      parametri: parametri.map((p, ordine) => ({ parametro_id: p.id, obbligatorio: obbligatori.includes(p.nome), ordine })),
    },
    parametri,
  }
}

const termometro = () => collega(
  { ...nuovoStrumento(0), nome: 'Termometro', icona: '🌡' },
  [parametro('Temp aria', { unita: '°C', ordine: 0 }), parametro('Temp pianta', { unita: '°C', ordine: 1 })],
)

function rendi(iniziale: Valore, props: Partial<ComponentProps<typeof EditorStrumento>> = {}) {
  const onChange = vi.fn<(v: Valore) => void>()
  function Banco() {
    const [v, setV] = useState(iniziale)
    return <EditorStrumento valore={v} onChange={(nuovo) => { onChange(nuovo); setV(nuovo) }} {...props} />
  }
  render(<Banco />)
  return onChange
}

const ultima = (onChange: ReturnType<typeof rendi>) => onChange.mock.calls.at(-1)?.[0] as Valore

describe('EditorStrumento', () => {
  it('ha nome e icona modificabili; l\'icona vuota diventa null', async () => {
    const utente = userEvent.setup({ delay: null })
    const onChange = rendi(termometro())

    expect(screen.getByLabelText('Nome dello strumento')).toHaveValue('Termometro')
    await utente.clear(screen.getByLabelText('Icona'))
    expect(ultima(onChange).strumento.icona).toBeNull()
    await utente.type(screen.getByLabelText('Icona'), '📏')
    expect(ultima(onChange).strumento.icona).toBe('📏')
    await utente.clear(screen.getByLabelText('Nome dello strumento'))
    await utente.type(screen.getByLabelText('Nome dello strumento'), 'Metro')
    expect(ultima(onChange).strumento.nome).toBe('Metro')
  })

  it('la descrizione c\'è solo se la pagina la gestisce (catalogo) ed è un testo facoltativo', async () => {
    const utente = userEvent.setup({ delay: null })
    const { unmount } = render(<EditorStrumento valore={termometro()} onChange={() => {}} />)
    expect(screen.queryByLabelText('Descrizione')).not.toBeInTheDocument()
    unmount()

    const onDescrizione = vi.fn()
    render(<EditorStrumento valore={termometro()} onChange={() => {}} descrizione="Aria e foglia." onDescrizione={onDescrizione} />)
    expect(screen.getByLabelText('Descrizione (facoltativa)')).toHaveValue('Aria e foglia.')
    await utente.type(screen.getByLabelText('Descrizione (facoltativa)'), '!')
    expect(onDescrizione).toHaveBeenLastCalledWith('Aria e foglia.!')
  })

  it('elenca i valori con un riassunto; toccandone uno si apre il suo editor (uno alla volta)', async () => {
    const utente = userEvent.setup({ delay: null })
    rendi(termometro())

    const aria = screen.getByRole('button', { name: /^Temp aria/ })
    expect(aria).toHaveTextContent('Numero · °C')
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument()
    await utente.click(aria)
    expect(screen.getByLabelText('Nome')).toHaveValue('Temp aria')
    await utente.click(screen.getByRole('button', { name: /^Temp pianta/ }))
    expect(screen.getByLabelText('Nome')).toHaveValue('Temp pianta')
  })

  describe('strumento semplice', () => {
    it('i valori sono numeri: il tipo è bloccato, con unità, letture e minimo/massimo, e senza progressivo', async () => {
      const utente = userEvent.setup({ delay: null })
      rendi(termometro())
      await utente.click(screen.getByRole('button', { name: /^Temp aria/ }))

      expect(screen.getByLabelText('Tipo')).toBeDisabled()
      expect(screen.getByLabelText('Tipo')).toHaveValue('numero')
      expect(screen.getByLabelText('Unità')).toHaveValue('°C')
      expect(screen.getByLabelText('Letture per misura')).toBeInTheDocument()
      expect(screen.getByLabelText('Minimo')).toBeInTheDocument()
      expect(screen.getByLabelText('Massimo')).toBeInTheDocument()
      expect(screen.queryByRole('switch', { name: /Progressivo/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('switch', { name: /Obbligatorio/ })).not.toBeInTheDocument()
    })

    it('"Aggiungi valore" aggiunge un valore numerico in coda, collegato allo strumento, e lo apre', async () => {
      const utente = userEvent.setup({ delay: null })
      const onChange = rendi(termometro())

      await utente.click(screen.getByRole('button', { name: 'Aggiungi valore' }))
      const { strumento, parametri } = ultima(onChange)
      expect(parametri.map(p => [p.nome, p.tipo, p.ordine])).toEqual([
        ['Temp aria', 'numero', 0], ['Temp pianta', 'numero', 1], ['', 'numero', 2],
      ])
      expect(strumento.parametri.map(pp => pp.parametro_id)).toEqual(parametri.map(p => p.id))
      expect(strumento.parametri.at(-1)).toEqual({ parametro_id: parametri[2].id, obbligatorio: false, ordine: 2 })

      await utente.type(screen.getByLabelText('Nome'), 'Umidità')
      expect(ultima(onChange).parametri[2].nome).toBe('Umidità')
      expect(screen.getByRole('button', { name: /^Umidità/ })).toHaveAttribute('aria-expanded', 'true')
    })

    it('"Togli il valore" lo toglie dallo strumento e dai parametri, e rinumera i collegamenti', async () => {
      const utente = userEvent.setup({ delay: null })
      const onChange = rendi(termometro())

      await utente.click(screen.getByRole('button', { name: /^Temp aria/ }))
      await utente.click(screen.getByRole('button', { name: 'Togli il valore «Temp aria»' }))

      const { strumento, parametri } = ultima(onChange)
      expect(parametri.map(p => p.nome)).toEqual(['Temp pianta'])
      expect(strumento.parametri).toEqual([{ parametro_id: parametri[0].id, obbligatorio: false, ordine: 0 }])
      expect(screen.queryByRole('button', { name: /^Temp aria/ })).not.toBeInTheDocument()
    })

    it('senza valori lo dice, e segnala nome mancante o doppio nel valore', async () => {
      const utente = userEvent.setup({ delay: null })
      rendi(collega({ ...nuovoStrumento(0), nome: 'Vuoto' }, []))
      expect(screen.getByText('Nessun valore ancora.')).toBeInTheDocument()

      await utente.click(screen.getByRole('button', { name: 'Aggiungi valore' }))
      expect(screen.getByText('Un parametro non ha nome.')).toBeInTheDocument()
    })

    it('un nome già usato in un altro strumento è segnalato nel valore', async () => {
      const utente = userEvent.setup({ delay: null })
      rendi(collega({ ...nuovoStrumento(0), nome: 'Metro' }, []), { altriParametri: [parametro('Altezza')] })

      await utente.click(screen.getByRole('button', { name: 'Aggiungi valore' }))
      await utente.type(screen.getByLabelText('Nome'), ' altezza')
      expect(screen.getByText('C\'è già un parametro che si chiama "Altezza".')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^altezza/ })).toHaveTextContent('Da completare')
    })
  })

  describe('tabella fenologica', () => {
    const tabella = () => collega(
      nuovaTabellaFenologica(0),
      [
        parametro('N frutti', { ordine: 0 }),
        parametro('Palchi', { ordine: 1, tipo: 'lista', progressivo: true, sotto_campi: [{ chiave: 'n_foglie', nome: 'N foglie', unita: null }] }),
        parametro('Note', { ordine: 2, tipo: 'testo' }),
      ],
    )

    it('i valori possono avere ogni tipo, con progressivo', async () => {
      const utente = userEvent.setup({ delay: null })
      rendi(tabella())

      expect(screen.getByRole('button', { name: /^Palchi/ })).toHaveTextContent('Lista ripetuta · 1 sotto-campo · progressivo')
      expect(screen.getByRole('button', { name: /^Note/ })).toHaveTextContent('Testo')

      await utente.click(screen.getByRole('button', { name: /^N frutti/ }))
      expect(screen.getByLabelText('Tipo')).toBeEnabled()
      expect(screen.getByRole('switch', { name: /Progressivo/ })).toBeInTheDocument()
      await utente.selectOptions(screen.getByLabelText('Tipo'), 'testo')
      expect(screen.getByRole('button', { name: /^N frutti/ })).toHaveTextContent('Testo')
    })

    it('ogni valore ha "Obbligatorio", spento di base, che scrive sul collegamento allo strumento', async () => {
      const utente = userEvent.setup({ delay: null })
      const onChange = rendi(tabella())
      await utente.click(screen.getByRole('button', { name: /^Note/ }))

      const obbligatorio = screen.getByRole('switch', { name: /Obbligatorio/ })
      expect(obbligatorio).not.toBeChecked()
      await utente.click(obbligatorio)

      const { strumento, parametri } = ultima(onChange)
      const note = parametri.find(p => p.nome === 'Note') as Parametro
      expect(strumento.parametri.find(pp => pp.parametro_id === note.id)?.obbligatorio).toBe(true)
      expect(strumento.parametri.filter(pp => pp.obbligatorio)).toHaveLength(1)
    })

    it('"Aggiungi valore" ne aggiunge uno numerico che si può cambiare di tipo', async () => {
      const utente = userEvent.setup({ delay: null })
      const onChange = rendi(tabella())

      await utente.click(screen.getByRole('button', { name: 'Aggiungi valore' }))
      await utente.type(screen.getByLabelText('Nome'), 'Sì fiori')
      await utente.selectOptions(screen.getByLabelText('Tipo'), 'sino')
      expect(ultima(onChange).parametri.at(-1)).toMatchObject({ nome: 'Sì fiori', tipo: 'sino', ordine: 3 })
    })

    it('tipoFenologico si può dire anche a mano, senza che lo strumento sia di quel tipo', async () => {
      const utente = userEvent.setup({ delay: null })
      rendi(termometro(), { tipoFenologico: true })
      await utente.click(screen.getByRole('button', { name: /^Temp aria/ }))
      expect(screen.getByLabelText('Tipo')).toBeEnabled()
    })
  })

  describe('per chi modifica uno strumento già salvato', () => {
    const tabella = () => collega(
      nuovaTabellaFenologica(0),
      [parametro('N frutti', { ordine: 0 }), parametro('Note', { ordine: 1, tipo: 'testo' })],
    )

    it('`bloccoTipo` ferma il tipo di un valore con la sua ragione; gli altri restano liberi', async () => {
      const utente = userEvent.setup({ delay: null })
      rendi(tabella(), { bloccoTipo: p => (p.nome === 'Note' ? 'Controllo dei dati in corso.' : null) })

      await utente.click(screen.getByRole('button', { name: /^Note/ }))
      expect(screen.getByLabelText('Tipo')).toBeDisabled()
      expect(screen.getByText('Controllo dei dati in corso.')).toBeInTheDocument()
      await utente.click(screen.getByRole('button', { name: /^N frutti/ }))
      expect(screen.getByLabelText('Tipo')).toBeEnabled()
    })

    it('`azioniValore` sostituisce "Togli il valore" per i valori che dice, gli altri lo tengono', async () => {
      const utente = userEvent.setup({ delay: null })
      const onChange = rendi(tabella(), {
        azioniValore: p => (p.nome === 'Note' ? <button type="button">Archivia il valore «Note»</button> : undefined),
      })

      await utente.click(screen.getByRole('button', { name: /^Note/ }))
      expect(screen.getByRole('button', { name: 'Archivia il valore «Note»' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Togli il valore «Note»' })).not.toBeInTheDocument()
      await utente.click(screen.getByRole('button', { name: /^N frutti/ }))
      await utente.click(screen.getByRole('button', { name: 'Togli il valore «N frutti»' }))
      expect(ultima(onChange).parametri.map(p => p.nome)).toEqual(['Note'])
    })

    it('`problemiExtra` aggiunge dei problemi a un valore: "Da completare" e il testo', async () => {
      const utente = userEvent.setup({ delay: null })
      rendi(tabella(), { problemiExtra: p => (p.nome === 'Note' ? ['Questo valore ha dati.'] : []) })

      expect(screen.getByRole('button', { name: /^Note/ })).toHaveTextContent('Da completare')
      expect(screen.getByRole('button', { name: /^N frutti/ })).not.toHaveTextContent('Da completare')
      await utente.click(screen.getByRole('button', { name: /^Note/ }))
      expect(screen.getByText('Questo valore ha dati.')).toBeInTheDocument()
    })
  })
})
