import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { GraficoSvg } from './GraficoSvg'
import { COLORI_GRAFICO, COLORI_SERIE, MARCATORI } from '@/domain/grafico'
import type { NoteDellaData, PuntoSerie, SerieTrattamento } from '@/domain/dataset'
import type { Trattamento } from '@/domain/tipi'

const t = (etichetta: string): Trattamento => ({ id: `t-${etichetta}`, etichetta, ordine: 0, livello_ids: [] })
const punto = (data: string, media: number, es: number | null = 1, n = 4): PuntoSerie => ({ data, media, es, n })
const serie = (etichetta: string, posto: number | null, punti: PuntoSerie[], riferimento = false): SerieTrattamento =>
  ({ tipo: 'trattamento', trattamento: t(etichetta), posto, riferimento, punti })
const DUE = () => [
  serie('Controllo', 0, [punto('2026-10-01', 40), punto('2026-10-11', 44)]),
  serie('S1', 1, [punto('2026-10-01', 38), punto('2026-10-11', 42, null, 1)]),
]
const note: NoteDellaData[] = [{ data: '2026-10-06', note: [
  { id: 'n1', data: '2026-10-06', testo: 'Irrigazione', promemoria: false, fatto_il: null, pianta_ids: [], trattamento_ids: [] },
] }]
const base = { serie: DUE(), note, scala: 'valore' as const, unita: 'SPAD', larghezza: 360, altezza: 260, titolo: 'SPAD · media per trattamento ± ES' }
const render = (extra = {}) => renderToStaticMarkup(<GraficoSvg {...base} {...extra} />)

describe('GraficoSvg', () => {
  it('è un SVG autonomo con role="img" e un\'etichetta che riassume', () => {
    const html = render()
    expect(html).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(html).toContain('role="img"')
    expect(html).toMatch(/aria-label="SPAD · media per trattamento ± ES\. 2 serie: Controllo, S1\./)
    expect(html).toContain('viewBox="0 0 360 260"')
  })
  it('una linea per serie, con il colore del suo posto', () => {
    const html = render()
    expect(html.match(/data-serie="/g)).toHaveLength(2)
    expect(html).toContain(`stroke="${COLORI_SERIE[0]}"`)
    expect(html).toContain(`stroke="${COLORI_SERIE[1]}"`)
  })
  it('un marcatore per punto, della forma della serie', () => {
    const html = render()
    expect(html.split(`d="${MARCATORI[0]}"`).length - 1).toBe(2)
    expect(html.split(`d="${MARCATORI[1]}"`).length - 1).toBe(2)
    expect(html).toContain('paint-order="stroke"')
  })
  it('barre d\'errore solo dove c\'è l\'errore standard', () => {
    expect(render().match(/data-barre="/g)).toHaveLength(2)
  })
  it('il segno della nota e le tacche con i numeri in Geist Mono', () => {
    const html = render()
    expect(html).toContain('data-nota="2026-10-06"')
    expect(html).toContain('Geist Mono Variable')
    expect(html).toContain('01/10')
    expect(html).toContain('11/10')
    expect(html).toContain('46 SPAD')
  })
  it('nell\'app non c\'è fondo, né titolo, né legenda, né font incorporato', () => {
    const html = render()
    expect(html).not.toContain('@font-face')
    expect(html).not.toContain('data-legenda')
    expect(html).not.toContain(COLORI_GRAFICO.foglio)
  })
  it('per l\'immagine: fondo foglio, titolo, legenda con marcatore e nome di ogni serie', () => {
    const html = render({ perImmagine: true, larghezza: 640, altezza: 360 })
    expect(html).toContain(`fill="${COLORI_GRAFICO.foglio}"`)
    expect(html).toContain('>SPAD · media per trattamento ± ES</text>')
    expect(html.match(/data-legenda="/g)).toHaveLength(2)
    expect(html).toContain('>Controllo</text>')
    expect(html).toContain('>S1</text>')
  })
  it('incorpora il font quando è dato, senza chiamare nessuna rete', () => {
    const html = render({ perImmagine: true, fontIncorporato: 'data:font/woff2;base64,AAAA' })
    expect(html).toContain('@font-face')
    expect(html).toContain('data:font/woff2;base64,AAAA')
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/)
  })
  it('senza font incorporato ripiega su un monospazio di sistema, dichiarato', () => {
    const html = render({ perImmagine: true, fontIncorporato: null })
    expect(html).not.toContain('@font-face')
    expect(html).toContain('ui-monospace')
  })
  it('senza dati c\'è un messaggio, non un grafico vuoto', () => {
    const html = render({ serie: [serie('Controllo', 0, [])] })
    expect(html).toContain('Nessun dato da disegnare')
    expect(html).not.toContain('data-serie')
    expect(html).toContain('aria-label="SPAD · media per trattamento ± ES. Nessun dato da disegnare."')
  })
  it('una sola data: il punto c\'è, al centro, e la linea no', () => {
    const html = render({ serie: [serie('Controllo', 0, [punto('2026-10-01', 40, null, 1)])], note: [] })
    expect(html).toContain(`d="${MARCATORI[0]}"`)
    expect(html).not.toContain('data-serie')
  })
  it('il cursore sulla data scelta', () => {
    expect(render({ cursore: '2026-10-11' })).toContain('data-cursore="2026-10-11"')
    expect(render()).not.toContain('data-cursore')
  })
  it('le serie di riferimento sono al 40% e disegnate sotto le altre', () => {
    const html = render({ serie: [...DUE(), serie('Controllo', 0, [punto('2026-10-01', 41), punto('2026-10-11', 43)], true)] })
    expect(html).toContain('opacity="0.4"')
    expect(html.indexOf('data-serie="r:t-Controllo"')).toBeLessThan(html.indexOf('data-serie="t:t-Controllo"'))
  })
  it('nessun trattino lungo nei testi', () => {
    expect(render({ perImmagine: true })).not.toMatch(/[\u2013\u2014]/)
  })
})
