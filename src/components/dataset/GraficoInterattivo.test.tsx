import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { GraficoInterattivo } from './GraficoInterattivo'
import { impagina } from '@/domain/grafico'
import type { NoteDellaData, PuntoSerie, SerieTrattamento } from '@/domain/dataset'
import type { Nota } from '@/domain/tipi'

const punto = (data: string, media: number, es: number | null, n: number): PuntoSerie => ({ data, media, es, n })
const serie = (etichetta: string, posto: number, punti: PuntoSerie[]): SerieTrattamento => ({
  tipo: 'trattamento', trattamento: { id: etichetta, etichetta, ordine: posto, livello_ids: [] }, posto, riferimento: false, punti,
})
const SERIE = () => [
  serie('S1', 0, [punto('2026-10-01', 41.2, 0.8, 7), punto('2026-10-11', 44, 1, 7)]),
  serie('S2', 1, [punto('2026-10-01', 38, null, 1)]),
]
const nota: Nota = { id: 'n1', data: '2026-10-06', testo: 'Irrigazione abbondante', promemoria: false, fatto_il: null, pianta_ids: [], trattamento_ids: [] }
const NOTE: NoteDellaData[] = [{ data: '2026-10-06', note: [nota] }]
const LARGHEZZA = 320 // in jsdom il contenitore misura 0: vale la larghezza di partenza
const geometria = () => impagina(SERIE(), NOTE, { larghezza: LARGHEZZA, altezza: 260, scala: 'valore', unita: 'SPAD' })
const x = (data: string) => geometria().giorni.find(g => g.data === data)?.x ?? 0

const mostra = (extra: Partial<Parameters<typeof GraficoInterattivo>[0]> = {}) =>
  render(<GraficoInterattivo serie={SERIE()} note={NOTE} scala="valore" unita="SPAD" titolo="SPAD" {...extra} />)
const area = () => screen.getByRole('group', { name: /frecce/i })
const tocca = (clientX: number, clientY = 130) => fireEvent.pointerDown(area(), { clientX, clientY, pointerType: 'touch' })

describe('GraficoInterattivo', () => {
  it('mostra il grafico con la sua etichetta, la legenda e un invito a toccare', () => {
    mostra()
    expect(screen.getByRole('img', { name: /^SPAD\. 2 serie: S1, S2\./ })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Legenda' })).toBeInTheDocument()
    expect(screen.getByText(/Tocca il grafico/)).toBeInTheDocument()
  })

  it('alto 260 px sul telefono', () => {
    mostra()
    expect(screen.getByRole('img')).toHaveAttribute('height', '260')
  })

  it('un tocco sceglie la data più vicina: linea verticale e riga di lettura con valore ± ES e n', () => {
    const { container } = mostra()
    tocca(x('2026-10-01') + 3)
    const lettura = screen.getByTestId('lettura')
    expect(lettura).toHaveTextContent('01/10/2026')
    expect(lettura).toHaveTextContent('S1 41,2 ± 0,8 (n 7)')
    expect(lettura).toHaveTextContent('S2 38 (n 1)')
    expect(lettura.className).toContain('font-mono')
    expect(container.querySelector('[data-cursore="2026-10-01"]')).not.toBeNull()
  })

  it('un trascinamento cambia la data scelta', () => {
    mostra()
    tocca(x('2026-10-01'))
    fireEvent.pointerMove(area(), { clientX: x('2026-10-11') - 2, clientY: 130, pointerType: 'touch' })
    expect(screen.getByTestId('lettura')).toHaveTextContent('11/10/2026')
    expect(screen.getByTestId('lettura')).not.toHaveTextContent('S2')
  })

  it('con la tastiera: frecce, Home, End, Escape', () => {
    mostra()
    area().focus()
    fireEvent.keyDown(area(), { key: 'ArrowRight' })
    expect(screen.getByTestId('lettura')).toHaveTextContent('01/10/2026')
    fireEvent.keyDown(area(), { key: 'ArrowRight' })
    expect(screen.getByTestId('lettura')).toHaveTextContent('06/10/2026') // la data della nota
    fireEvent.keyDown(area(), { key: 'ArrowRight' })
    expect(screen.getByTestId('lettura')).toHaveTextContent('11/10/2026')
    fireEvent.keyDown(area(), { key: 'ArrowRight' })
    expect(screen.getByTestId('lettura')).toHaveTextContent('11/10/2026') // oltre l'ultima non si va
    fireEvent.keyDown(area(), { key: 'ArrowLeft' })
    expect(screen.getByTestId('lettura')).toHaveTextContent('06/10/2026')
    fireEvent.keyDown(area(), { key: 'Home' })
    expect(screen.getByTestId('lettura')).toHaveTextContent('01/10/2026')
    fireEvent.keyDown(area(), { key: 'End' })
    expect(screen.getByTestId('lettura')).toHaveTextContent('11/10/2026')
    fireEvent.keyDown(area(), { key: 'Escape' })
    expect(screen.queryByTestId('lettura')).toBeNull()
  })

  it('la freccia sinistra senza una data scelta parte dall\'ultima', () => {
    mostra()
    fireEvent.keyDown(area(), { key: 'ArrowLeft' })
    expect(screen.getByTestId('lettura')).toHaveTextContent('11/10/2026')
  })

  it('la lettura è annunciata ai lettori di schermo', () => {
    mostra()
    tocca(x('2026-10-01'))
    expect(screen.getByTestId('lettura').closest('[aria-live]')).toHaveAttribute('aria-live', 'polite')
  })

  it('toccando un segno di nota (in alto) si legge il testo della nota con "Apri nel Diario"', () => {
    const onApriNota = vi.fn()
    mostra({ onApriNota })
    tocca(x('2026-10-06') + 5, 8)
    const lettura = screen.getByTestId('lettura')
    expect(lettura).toHaveTextContent('06/10/2026')
    expect(within(lettura).getByText('Irrigazione abbondante')).toBeInTheDocument()
    fireEvent.click(within(lettura).getByRole('button', { name: 'Apri nel Diario' }))
    expect(onApriNota).toHaveBeenCalledWith(nota)
  })

  it('un tocco in alto non vicino a nessun segno sceglie la data più vicina come sempre', () => {
    mostra()
    tocca(x('2026-10-11'), 8)
    expect(screen.getByTestId('lettura')).toHaveTextContent('11/10/2026')
  })

  it('senza onApriNota la nota si legge ma non c\'è il pulsante', () => {
    mostra()
    tocca(x('2026-10-06'), 8)
    expect(screen.getByText('Irrigazione abbondante')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apri nel Diario' })).toBeNull()
  })

  it('il pulsante "Apri nel Diario" è alto almeno 44 px', () => {
    mostra({ onApriNota: vi.fn() })
    tocca(x('2026-10-06'), 8)
    expect(screen.getByRole('button', { name: 'Apri nel Diario' }).className).toMatch(/h-11|min-h-11/)
  })

  it('senza dati c\'è un messaggio e non si può scegliere nulla', () => {
    mostra({ serie: [serie('S1', 0, [])], note: [] })
    expect(screen.getByText('Nessun dato da disegnare con questi filtri.')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /frecce/i })).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('se i dati cambiano e la data scelta non c\'è più, la lettura sparisce', () => {
    const { rerender } = mostra()
    tocca(x('2026-10-11'))
    expect(screen.getByTestId('lettura')).toBeInTheDocument()
    rerender(<GraficoInterattivo serie={[serie('S1', 0, [punto('2026-10-01', 41, 1, 3), punto('2026-10-02', 42, 1, 3)])]} note={[]} scala="valore" titolo="SPAD" />)
    expect(screen.queryByTestId('lettura')).toBeNull()
  })

  describe('larghezza dal contenitore', () => {
    let osservatori: ((voci: { contentRect: { width: number } }[]) => void)[]
    beforeEach(() => {
      osservatori = []
      vi.stubGlobal('ResizeObserver', class {
        constructor(cb: (voci: { contentRect: { width: number } }[]) => void) { osservatori.push(cb) }
        observe() {}
        disconnect() {}
        unobserve() {}
      })
    })
    afterEach(() => vi.unstubAllGlobals())

    it('segue il contenitore (360 px di telefono) e non lo supera', () => {
      mostra()
      act(() => osservatori.forEach(cb => cb([{ contentRect: { width: 360 } }])))
      expect(screen.getByRole('img')).toHaveAttribute('width', '360')
      act(() => osservatori.forEach(cb => cb([{ contentRect: { width: 300 } }])))
      expect(screen.getByRole('img')).toHaveAttribute('width', '300')
    })
  })
})
