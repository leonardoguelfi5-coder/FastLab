import { describe, expect, it } from 'vitest'
import {
  descriviFoto, filtraFoto, formattaMegabyte, fotoDellaNota, fotoDellaPianta, LIMITE_SPAZIO_BYTE, percorsoFoto, quotaSpazio,
  raggruppaPerData, reinserisciFoto, senzaFoto,
} from './foto'
import type { ConfigEsperimento, Foto } from './tipi'

describe('percorsoFoto', () => {
  it('è <esperimento>/<foto>.jpg, come impone il vincolo del database', () => {
    expect(percorsoFoto('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002'))
      .toBe('e0000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000002.jpg')
  })

  it('scrive gli uuid in minuscolo: il database confronta con il testo che dà lui, e le policy dello Storage accettano solo quello', () => {
    expect(percorsoFoto('E0000000-0000-4000-8000-00000000000A', 'F0000000-0000-4000-8000-00000000000B'))
      .toBe('e0000000-0000-4000-8000-00000000000a/f0000000-0000-4000-8000-00000000000b.jpg')
  })
})

const foto = (id: string, extra: Partial<Foto> = {}): Foto => ({
  id, data: '2026-10-28', percorso: `e/${id}.jpg`, larghezza: 1600, altezza: 1200, byte: 1000,
  pianta_id: null, nota_id: null, archiviata: false, ...extra,
})

describe('senzaFoto e reinserisciFoto', () => {
  it('toglie una foto per id e la rimette nello stesso posto', () => {
    const elenco = [foto('a'), foto('b'), foto('c')]
    expect(senzaFoto(elenco, 'b').map(f => f.id)).toEqual(['a', 'c'])
    expect(reinserisciFoto(senzaFoto(elenco, 'b'), elenco[1], 1).map(f => f.id)).toEqual(['a', 'b', 'c'])
  })

  it('tiene l\'indice nei limiti, mette in cima se non c\'era e non duplica una foto già riletta dal server', () => {
    const elenco = [foto('a'), foto('c')]
    expect(reinserisciFoto(elenco, foto('b'), 9).map(f => f.id)).toEqual(['a', 'c', 'b'])
    expect(reinserisciFoto(elenco, foto('b'), -1).map(f => f.id)).toEqual(['b', 'a', 'c'])
    expect(reinserisciFoto([foto('a'), foto('b')], foto('b'), 0).map(f => f.id)).toEqual(['a', 'b'])
  })
})

describe('fotoDellaPianta e fotoDellaNota', () => {
  const elenco = [foto('a', { pianta_id: 'p1' }), foto('b', { nota_id: 'n1' }), foto('c', { pianta_id: 'p1', nota_id: 'n1' }), foto('d')]
  it('prendono solo le foto collegate, nell\'ordine dato', () => {
    expect(fotoDellaPianta(elenco, 'p1').map(f => f.id)).toEqual(['a', 'c'])
    expect(fotoDellaNota(elenco, 'n1').map(f => f.id)).toEqual(['b', 'c'])
    expect(fotoDellaPianta(elenco, 'x')).toEqual([])
  })
})

describe('raggruppaPerData', () => {
  it('fa un gruppo per giorno, dal più recente, con le foto nell\'ordine dato', () => {
    const gruppi = raggruppaPerData([
      foto('a', { data: '2026-10-20' }), foto('b', { data: '2026-10-28' }), foto('c', { data: '2026-10-20' }),
    ])
    expect(gruppi.map(g => [g.data, g.foto.map(f => f.id)])).toEqual([['2026-10-28', ['b']], ['2026-10-20', ['a', 'c']]])
  })

  it('senza foto non dà gruppi', () => {
    expect(raggruppaPerData([])).toEqual([])
  })
})

describe('filtraFoto', () => {
  const trattamenti = [
    { id: 't1', etichetta: 'S1 + HC', ordine: 0, livello_ids: [] },
    { id: 't2', etichetta: 'Controllo', ordine: 1, livello_ids: [] },
  ]
  const config = {
    trattamenti,
    piante: [
      { id: 'p1', trattamento_id: 't1', etichetta: '1', blocco: null, ordine: 0 },
      { id: 'p12', trattamento_id: 't2', etichetta: '12', blocco: null, ordine: 1 },
      { id: 'p3', trattamento_id: 't2', etichetta: '3', blocco: null, ordine: 2 },
    ],
  } as unknown as ConfigEsperimento
  const elenco = [
    foto('a', { pianta_id: 'p1' }), foto('b', { pianta_id: 'p12' }), foto('c', { pianta_id: 'p3' }), foto('d'),
  ]

  it('senza filtri lascia tutto, anche le foto senza pianta', () => {
    expect(filtraFoto(elenco, config, { pianta: '  ', trattamentoId: null })).toEqual(elenco)
  })

  it('per pianta cerca nell\'etichetta e scarta le foto senza pianta', () => {
    expect(filtraFoto(elenco, config, { pianta: '1', trattamentoId: null }).map(f => f.id)).toEqual(['a', 'b'])
  })

  it('per trattamento tiene le foto delle sue piante', () => {
    expect(filtraFoto(elenco, config, { pianta: '', trattamentoId: 't2' }).map(f => f.id)).toEqual(['b', 'c'])
  })

  it('i due filtri insieme si sommano', () => {
    expect(filtraFoto(elenco, config, { pianta: '1', trattamentoId: 't2' }).map(f => f.id)).toEqual(['b'])
  })
})

describe('descriviFoto', () => {
  const piante = [{ id: 'p1', etichetta: '35' }]
  it('dice la data e, se c\'è, la pianta', () => {
    expect(descriviFoto(foto('a', { data: '2026-10-28' }), piante)).toBe('Foto del 28/10/2026')
    expect(descriviFoto(foto('a', { data: '2026-10-28', pianta_id: 'p1' }), piante)).toBe('Foto del 28/10/2026, pianta 35')
  })
  it('una pianta che non c\'è più non si cita', () => {
    expect(descriviFoto(foto('a', { pianta_id: 'x' }), piante)).toBe('Foto del 28/10/2026')
  })
})

describe('formattaMegabyte', () => {
  it('scrive i megabyte (1 MB = 1 000 000 byte) con la virgola e un decimale', () => {
    expect(formattaMegabyte(0)).toBe('0 MB')
    expect(formattaMegabyte(350_000)).toBe('0,4 MB')
    expect(formattaMegabyte(12_340_000)).toBe('12,3 MB')
    expect(formattaMegabyte(1_000_000)).toBe('1 MB')
    expect(formattaMegabyte(LIMITE_SPAZIO_BYTE)).toBe('1000 MB')
  })
})

describe('quotaSpazio', () => {
  it('il limite del piano gratuito è 1 GB', () => {
    expect(LIMITE_SPAZIO_BYTE).toBe(1_000_000_000)
  })

  it('dà la percentuale usata, arrotondata, e avvisa solo oltre l\'80%', () => {
    expect(quotaSpazio(0)).toEqual({ percentuale: 0, oltreSoglia: false })
    expect(quotaSpazio(456_700_000)).toEqual({ percentuale: 46, oltreSoglia: false })
    // Esattamente l'80% non è "oltre".
    expect(quotaSpazio(800_000_000)).toEqual({ percentuale: 80, oltreSoglia: false })
    expect(quotaSpazio(800_000_001).oltreSoglia).toBe(true)
    expect(quotaSpazio(950_000_000)).toEqual({ percentuale: 95, oltreSoglia: true })
  })

  it('oltre il limite la percentuale supera 100 (il numero è onesto) ma la barra si ferma a 100', () => {
    const q = quotaSpazio(1_200_000_000)
    expect(q.percentuale).toBe(120)
    expect(q.oltreSoglia).toBe(true)
  })
})
