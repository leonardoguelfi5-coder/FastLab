import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { Legenda } from './Legenda'
import { impagina } from '@/domain/grafico'
import type { PuntoSerie, SerieTrattamento } from '@/domain/dataset'

const serie = (etichetta: string, posto: number | null, punti: PuntoSerie[]): SerieTrattamento => ({
  tipo: 'trattamento', trattamento: { id: etichetta, etichetta, ordine: 0, livello_ids: [] }, posto, riferimento: false, punti,
})
const p = (data: string, media: number): PuntoSerie => ({ data, media, es: null, n: 3 })
const legendaDi = (s: SerieTrattamento[]) => impagina(s, [], { larghezza: 360, altezza: 260, scala: 'valore' }).legenda

describe('Legenda', () => {
  it('una voce per serie, con il marcatore e il nome nel font dei dati', () => {
    render(<Legenda voci={legendaDi([serie('Controllo', 0, [p('2026-10-01', 1)]), serie('S1', 1, [p('2026-10-01', 2)])])} />)
    const lista = screen.getByRole('list', { name: 'Legenda' })
    const voci = within(lista).getAllByRole('listitem')
    expect(voci.map(v => v.textContent)).toEqual(['Controllo', 'S1'])
    for (const v of voci) {
      expect(v.querySelector('svg path')).not.toBeNull()
    }
    expect(lista.className).toContain('font-mono')
  })
  it('compare anche con una serie sola', () => {
    render(<Legenda voci={legendaDi([serie('Controllo', 0, [p('2026-10-01', 1)])])} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
  it('una serie senza punti lo dice a parole', () => {
    render(<Legenda voci={legendaDi([serie('Controllo', 0, [p('2026-10-01', 1)]), serie('S1', 1, [])])} />)
    expect(screen.getByText('S1').closest('li')).toHaveTextContent('S1 (nessun dato)')
  })
  it('la serie dal nono trattamento ha la linea tratteggiata nel campione', () => {
    const { container } = render(<Legenda voci={legendaDi([serie('S9', null, [p('2026-10-01', 1)])])} />)
    expect(container.querySelector('line')?.getAttribute('stroke-dasharray')).toBeTruthy()
  })
  it('senza voci non disegna nulla', () => {
    const { container } = render(<Legenda voci={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
