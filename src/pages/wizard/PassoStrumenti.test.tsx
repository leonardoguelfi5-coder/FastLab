import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRef, useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/api/catalogo', () => ({
  listaCatalogo: vi.fn(), salvaVoceCatalogo: vi.fn(), archiviaVoceCatalogo: vi.fn(), copieDiProprieta: vi.fn(), applicaAggiornamento: vi.fn(),
}))

import { listaCatalogo, salvaVoceCatalogo } from '@/api/catalogo'
import { bozzaVuota } from '@/domain/bozza'
import { conPiante } from '@/domain/test-helpers'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import type { BozzaEsperimento, VoceCatalogo } from '@/domain/tipi'
import { PassoStrumenti } from './PassoStrumenti'

function rendi(iniziale: BozzaEsperimento = bozzaVuota()) {
  const onChange = vi.fn<(b: BozzaEsperimento) => void>()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalida = vi.spyOn(client, 'invalidateQueries')
  function Banco() {
    const [b, setB] = useState(iniziale)
    // Come la procedura: la modifica può essere la bozza nuova o una funzione della bozza di quel momento.
    const corrente = useRef(iniziale)
    const applica = (modifica: BozzaEsperimento | ((prima: BozzaEsperimento) => BozzaEsperimento)) => {
      const nuova = typeof modifica === 'function' ? modifica(corrente.current) : modifica
      corrente.current = nuova
      onChange(nuova)
      setB(nuova)
    }
    return <PassoStrumenti bozza={b} onChange={applica} />
  }
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><Banco /></MemoryRouter>
    </QueryClientProvider>,
  )
  return { onChange, invalida }
}

const ultima = (onChange: ReturnType<typeof rendi>['onChange']) => onChange.mock.calls.at(-1)?.[0] as BozzaEsperimento
const strumenti = () => within(screen.getByRole('list', { name: 'Strumenti' }))
const ciras = SEMI_CATALOGO.find(v => v.nome === 'Ciras') as VoceCatalogo

/** Aggiunge «Penetrometro» (1 valore, kg/cm²) con "+ Nuovo strumento" e conferma. */
async function creaPenetrometro(utente: ReturnType<typeof userEvent.setup>) {
  await utente.click(await screen.findByRole('button', { name: '+ Nuovo strumento' }))
  await utente.type(screen.getByLabelText('Nome dello strumento'), 'Penetrometro')
  await utente.click(screen.getByRole('button', { name: 'Aggiungi valore' }))
  await utente.type(screen.getByLabelText('Nome'), 'Resistenza')
  await utente.type(screen.getByLabelText('Unità'), 'kg/cm²')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listaCatalogo).mockResolvedValue(SEMI_CATALOGO)
  vi.mocked(salvaVoceCatalogo).mockResolvedValue(undefined)
})

describe('PassoStrumenti: dal catalogo', () => {
  it('"Aggiungi" Ciras dal catalogo lo mette tra gli strumenti con A, gs, E, Ci, collegato al catalogo', async () => {
    const utente = userEvent.setup({ delay: null })
    const { onChange } = rendi()

    await utente.click(await screen.findByRole('button', { name: 'Aggiungi «Ciras»' }))

    const b = ultima(onChange)
    expect(b.strumenti).toHaveLength(1)
    expect(b.strumenti[0]).toMatchObject({ nome: 'Ciras', tipo: 'strumento', catalogo_id: ciras.id, ordine: 0 })
    expect(b.parametri.map(p => [p.nome, p.catalogo_chiave, p.ordine])).toEqual(
      [['A', 'a', 0], ['gs', 'gs', 1], ['E', 'e', 2], ['Ci', 'ci', 3]])
    expect(strumenti().getByRole('button', { name: /^🍃 Ciras/ })).toHaveTextContent('A · gs · E · Ci')
  })

  it('una voce già aggiunta ha "Aggiungi" disabilitato', async () => {
    const utente = userEvent.setup({ delay: null })
    rendi()

    await utente.click(await screen.findByRole('button', { name: 'Aggiungi «Ciras»' }))
    expect(screen.getByRole('button', { name: '«Ciras» è già nell\'esperimento' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Aggiungi «SPAD»' })).toBeEnabled()
  })

  it('i parametri nuovi vanno dopo il massimo `ordine` della bozza', async () => {
    const utente = userEvent.setup({ delay: null })
    const { onChange } = rendi(conPiante(['1']))

    await utente.click(await screen.findByRole('button', { name: 'Aggiungi «Termometro»' }))
    const b = ultima(onChange)
    expect(b.parametri.map(p => [p.nome, p.ordine])).toEqual([['Altezza', 0], ['Temp aria', 1], ['Temp pianta', 2]])
    expect(b.strumenti.map(s => [s.nome, s.ordine])).toEqual([['Altezza', 0], ['Termometro', 1]])
  })

  it('il catalogo che non si carica mostra l\'errore con "Riprova"; "+ Nuovo strumento" resta disponibile', async () => {
    vi.mocked(listaCatalogo).mockRejectedValueOnce({ message: 'Failed to fetch' })
    const utente = userEvent.setup({ delay: null })
    rendi()

    expect(await screen.findByText(/Il server non risponde/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Nuovo strumento' })).toBeInTheDocument()
    await utente.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(await screen.findByRole('button', { name: 'Aggiungi «Ciras»' })).toBeInTheDocument()
  })
})

describe('PassoStrumenti: gli strumenti dell\'esperimento', () => {
  it('mostra solo gli strumenti (non la tabella fenologica), ognuno con i suoi valori; toccandolo si apre l\'editor', async () => {
    const utente = userEvent.setup({ delay: null })
    const b = conPiante(['1'])
    b.strumenti.push({ ...b.strumenti[0], id: 'fen', nome: 'Tabella fenologica', tipo: 'fenologico', ordine: 1, parametri: [] })
    rendi(b)

    expect(strumenti().getAllByRole('listitem')).toHaveLength(1)
    const altezza = strumenti().getByRole('button', { name: /^Altezza/ })
    expect(altezza).toHaveTextContent('Altezza')
    expect(screen.queryByText('Tabella fenologica')).not.toBeInTheDocument()
    await utente.click(altezza)
    expect(screen.getByLabelText('Nome dello strumento')).toHaveValue('Altezza')
    // Lo strumento misura numeri: il tipo del valore non si cambia.
    await utente.click(screen.getByRole('button', { name: /^Altezza.*cm/ }))
    expect(screen.getByLabelText('Tipo')).toBeDisabled()
  })

  it('modificare un valore aggiorna il parametro della bozza', async () => {
    const utente = userEvent.setup({ delay: null })
    const { onChange } = rendi(conPiante(['1']))

    await utente.click(strumenti().getByRole('button', { name: /^Altezza/ }))
    await utente.click(screen.getByRole('button', { name: /^Altezza.*cm/ }))
    await utente.clear(screen.getByLabelText('Unità'))
    await utente.type(screen.getByLabelText('Unità'), 'm')
    expect(ultima(onChange).parametri[0].unita).toBe('m')
  })

  it('"Rimuovi strumento" toglie lo strumento e i suoi parametri', async () => {
    const utente = userEvent.setup({ delay: null })
    const { onChange } = rendi(conPiante(['1']))

    await utente.click(strumenti().getByRole('button', { name: /^Altezza/ }))
    await utente.click(screen.getByRole('button', { name: 'Rimuovi strumento' }))

    expect(ultima(onChange).strumenti).toEqual([])
    expect(ultima(onChange).parametri).toEqual([])
    expect(screen.getByText('Nessuno strumento ancora.')).toBeInTheDocument()
  })

  it('un nome già usato da un altro strumento è segnalato, con "Da completare" a voce chiusa', async () => {
    const utente = userEvent.setup({ delay: null })
    rendi(conPiante(['1']))

    await utente.click(await screen.findByRole('button', { name: 'Aggiungi «Metro»' }))
    await utente.click(strumenti().getByRole('button', { name: /Metro/ }))
    await utente.clear(screen.getByLabelText('Nome dello strumento'))
    await utente.type(screen.getByLabelText('Nome dello strumento'), 'altezza ')

    expect(screen.getByText('C\'è già uno strumento che si chiama "Altezza".')).toBeInTheDocument()
    expect(strumenti().getByRole('button', { name: /📏 altezza/ })).toHaveTextContent('Da completare')
  })
})

describe('PassoStrumenti: + Nuovo strumento', () => {
  it('apre un editor vuoto; non si conferma senza nome e senza valori', async () => {
    const utente = userEvent.setup({ delay: null })
    rendi()

    await utente.click(await screen.findByRole('button', { name: '+ Nuovo strumento' }))
    expect(screen.getByLabelText('Nome dello strumento')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Salva nel catalogo e aggiungi' })).toBeDisabled()
    await utente.type(screen.getByLabelText('Nome dello strumento'), 'Penetrometro')
    expect(screen.getByRole('button', { name: 'Salva nel catalogo e aggiungi' })).toBeDisabled()
  })

  it('"Penetrometro" con un valore (kg/cm²): salva la voce nel catalogo e aggiunge la copia collegata alla bozza', async () => {
    const utente = userEvent.setup({ delay: null })
    const { onChange, invalida } = rendi()
    await creaPenetrometro(utente)

    await utente.click(screen.getByRole('button', { name: 'Salva nel catalogo e aggiungi' }))

    expect(salvaVoceCatalogo).toHaveBeenCalledOnce()
    const voce = vi.mocked(salvaVoceCatalogo).mock.calls[0][0]
    expect(voce).toMatchObject({
      nome: 'Penetrometro', archiviato: false,
      parametri: [{ chiave: 'resistenza', nome: 'Resistenza', unita: 'kg/cm²', n_letture: 1, valore_min: null, valore_max: null }],
    })
    const b = ultima(onChange)
    expect(b.strumenti).toHaveLength(1)
    expect(b.strumenti[0]).toMatchObject({ nome: 'Penetrometro', tipo: 'strumento', catalogo_id: voce.id })
    expect(b.parametri.map(p => [p.nome, p.unita, p.catalogo_chiave])).toEqual([['Resistenza', 'kg/cm²', 'resistenza']])
    expect(invalida).toHaveBeenCalledWith({ queryKey: ['catalogo'] })
    expect(await strumenti().findByRole('button', { name: /^Penetrometro/ })).toBeInTheDocument()
    // L'editor si chiude: lo strumento adesso sta nell'elenco.
    expect(screen.queryByRole('button', { name: 'Salva nel catalogo e aggiungi' })).not.toBeInTheDocument()
  })

  it('durante il salvataggio il pulsante è disabilitato: un secondo tocco non salva due volte', async () => {
    let finisci: () => void = () => {}
    vi.mocked(salvaVoceCatalogo).mockReturnValue(new Promise<void>(ok => { finisci = ok }))
    const utente = userEvent.setup({ delay: null })
    const { onChange } = rendi()
    await creaPenetrometro(utente)

    const salva = screen.getByRole('button', { name: 'Salva nel catalogo e aggiungi' })
    // L'inchiostro pieno è solo di "Avanti" nella barra in basso.
    expect(salva).not.toHaveClass('bg-inchiostro')
    await utente.click(salva)
    expect(screen.getByRole('button', { name: 'Salvataggio…' })).toBeDisabled()
    await utente.click(screen.getByRole('button', { name: 'Salvataggio…' }))
    expect(salvaVoceCatalogo).toHaveBeenCalledOnce()
    expect(onChange).not.toHaveBeenCalled()

    finisci()
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledOnce())
  })

  it('se il salvataggio nel catalogo fallisce mostra il messaggio e lascia lo strumento nella bozza, non collegato', async () => {
    vi.mocked(salvaVoceCatalogo).mockRejectedValue({ message: 'Failed to fetch' })
    const utente = userEvent.setup({ delay: null })
    const { onChange, invalida } = rendi()
    await creaPenetrometro(utente)

    await utente.click(screen.getByRole('button', { name: 'Salva nel catalogo e aggiungi' }))

    expect(await screen.findByText(/Il server non risponde/)).toBeInTheDocument()
    expect(screen.getByText(/non è collegato al catalogo/)).toBeInTheDocument()
    const b = ultima(onChange)
    expect(b.strumenti).toHaveLength(1)
    expect(b.strumenti[0]).toMatchObject({ nome: 'Penetrometro', catalogo_id: null })
    expect(b.parametri.map(p => [p.nome, p.catalogo_chiave])).toEqual([['Resistenza', null]])
    expect(invalida).not.toHaveBeenCalledWith({ queryKey: ['catalogo'] })
    expect(strumenti().getByRole('button', { name: /^Penetrometro/ })).toBeInTheDocument()
  })

  it('se il nome è già nel catalogo (23505) il modulo resta aperto col messaggio e non aggiunge nulla; rinominando si riprova con la stessa voce', async () => {
    vi.mocked(salvaVoceCatalogo)
      .mockRejectedValueOnce({ code: '23505', message: 'duplicate key value violates unique constraint "catalogo_strumenti_nome_unico"' })
      .mockResolvedValue(undefined)
    const utente = userEvent.setup({ delay: null })
    const { onChange } = rendi()
    await creaPenetrometro(utente)

    await utente.click(screen.getByRole('button', { name: 'Salva nel catalogo e aggiungi' }))

    expect(await screen.findByText('Nel catalogo c\'è già uno strumento con questo nome.')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Nome dello strumento')).toHaveValue('Penetrometro')
    expect(screen.getByRole('button', { name: 'Salva nel catalogo e aggiungi' })).toBeEnabled()

    await utente.type(screen.getByLabelText('Nome dello strumento'), ' digitale')
    await utente.click(screen.getByRole('button', { name: 'Salva nel catalogo e aggiungi' }))

    await vi.waitFor(() => expect(onChange).toHaveBeenCalledOnce())
    const [primo, secondo] = vi.mocked(salvaVoceCatalogo).mock.calls.map(c => c[0])
    expect(secondo.id).toBe(primo.id)
    expect(secondo.nome).toBe('Penetrometro digitale')
    expect(ultima(onChange).strumenti[0]).toMatchObject({ nome: 'Penetrometro digitale', catalogo_id: primo.id })
    expect(screen.queryByText('Nel catalogo c\'è già uno strumento con questo nome.')).not.toBeInTheDocument()
  })

  it('"Annulla" chiude l\'editor senza aggiungere nulla', async () => {
    const utente = userEvent.setup({ delay: null })
    const { onChange } = rendi()
    await creaPenetrometro(utente)

    await utente.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(screen.queryByLabelText('Nome dello strumento')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(salvaVoceCatalogo).not.toHaveBeenCalled()
  })
})
