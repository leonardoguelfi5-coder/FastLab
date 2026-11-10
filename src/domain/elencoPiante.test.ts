import { describe, it, expect } from 'vitest'
import { filtraPiante, parametriMostrabili, parametroDiBase, ultimoValorePerPianta } from './elencoPiante'
import type { Misura, Parametro, Pianta, Strumento } from './tipi'
import { configDiEsempio, parametro, piante } from './test-helpers'

const spad = parametro('SPAD', { id: 'par-spad', ordine: 0 })
const temp = parametro('Temp aria', { id: 'par-temp', ordine: 1, unita: '°C' })
const palchi = parametro('Palchi', { id: 'par-palchi', ordine: 2, tipo: 'lista' })
const note = parametro('Note', { id: 'par-note', ordine: 3, tipo: 'testo' })
const vecchio = parametro('Vecchio', { id: 'par-vecchio', ordine: 4, archiviato: true })

function strumento(id: string, nome: string, ordine: number, ps: Parametro[], extra: Partial<Strumento> = {}): Strumento {
  return {
    id, nome, icona: null, ordine, tipo: 'strumento', archiviato: false, catalogo_id: null,
    parametri: ps.map((p, i) => ({ parametro_id: p.id, obbligatorio: false, ordine: i })), ...extra,
  }
}
const sTemp = strumento('s-temp', 'Termometro', 0, [temp])
const sSpad = strumento('s-spad', 'SPAD', 1, [spad, vecchio])
const sFeno = strumento('s-feno', 'Fenologia', 2, [palchi, note])
const sArchiviato = strumento('s-arch', 'Vecchio strumento', 3, [parametro('Altro', { id: 'par-altro' })], { archiviato: true })

const config = {
  ...configDiEsempio(),
  parametri: [spad, temp, palchi, note, vecchio],
  strumenti: [sSpad, sTemp, sFeno, sArchiviato],
}

describe('parametriMostrabili', () => {
  it('solo parametri numerici attivi di strumenti attivi, raggruppati per strumento nell\'ordine degli strumenti', () => {
    const gruppi = parametriMostrabili(config)
    expect(gruppi.map(g => g.strumento.nome)).toEqual(['Termometro', 'SPAD'])
    expect(gruppi[0].parametri.map(p => p.nome)).toEqual(['Temp aria'])
    // lista, testo e archiviato non compaiono; lo strumento senza parametri numerici nemmeno
    expect(gruppi[1].parametri.map(p => p.nome)).toEqual(['SPAD'])
  })
  it('nessuno strumento attivo: nessun gruppo', () => {
    expect(parametriMostrabili({ ...config, strumenti: [sArchiviato] })).toEqual([])
  })
})

describe('parametroDiBase', () => {
  const gruppi = parametriMostrabili(config)
  it('il primo parametro dello strumento scelto nello store', () => {
    expect(parametroDiBase(gruppi, 's-spad')?.id).toBe('par-spad')
  })
  it('senza strumento nello store, o con uno che non c\'è o non ha numeri, il primo del primo strumento', () => {
    expect(parametroDiBase(gruppi, null)?.id).toBe('par-temp')
    expect(parametroDiBase(gruppi, 'non-esiste')?.id).toBe('par-temp')
    expect(parametroDiBase(gruppi, 's-feno')?.id).toBe('par-temp')
  })
  it('nessun parametro mostrabile: null', () => {
    expect(parametroDiBase([], 's-spad')).toBeNull()
  })
})

describe('ultimoValorePerPianta', () => {
  const mis = (id: string, pianta: string, data: string, v: number | null, ora = '09:00'): Misura =>
    ({ id, pianta_id: pianta, strumento_id: 's-spad', data_rilievo: data, ora, valori: { [spad.id]: [v] } })

  it('per ogni pianta l\'ultima data con un valore, come media giornaliera', () => {
    const r = ultimoValorePerPianta(spad, [
      mis('a', 'p1', '2026-10-20', 30),
      mis('b', 'p1', '2026-10-27', 40, '09:00'),
      mis('c', 'p1', '2026-10-27', 42, '11:00'),
      mis('d', 'p2', '2026-10-26', 35),
    ])
    expect(r.get('p1')).toEqual({ data: '2026-10-27', valore: 41 })
    expect(r.get('p2')).toEqual({ data: '2026-10-26', valore: 35 })
    expect(r.size).toBe(2)
  })
  it('una misura più recente senza valore non toglie quello di prima', () => {
    const r = ultimoValorePerPianta(spad, [mis('a', 'p1', '2026-10-20', 30), mis('b', 'p1', '2026-10-27', null)])
    expect(r.get('p1')).toEqual({ data: '2026-10-20', valore: 30 })
  })
  it('nessuna misura: mappa vuota', () => {
    expect(ultimoValorePerPianta(spad, []).size).toBe(0)
  })
})

describe('filtraPiante', () => {
  const lista: Pianta[] = piante(['1', '12', '21', 'A-3', ' 5 '])
  const etichette = (q: string) => filtraPiante(lista, q).map(p => p.etichetta)

  it('senza testo restano tutte', () => {
    expect(etichette('')).toEqual(['1', '12', '21', 'A-3', ' 5 '])
    expect(etichette('   ')).toEqual(['1', '12', '21', 'A-3', ' 5 '])
  })
  it('l\'etichetta contiene il testo, senza badare a maiuscole e spazi ai bordi', () => {
    expect(etichette('1')).toEqual(['1', '12', '21'])
    expect(etichette(' 12 ')).toEqual(['12'])
    expect(etichette('a-')).toEqual(['A-3'])
    expect(etichette('5')).toEqual([' 5 '])
  })
  it('lo zero iniziale trova la pianta che Invio aprirebbe', () => {
    expect(etichette('012')).toEqual(['12'])
  })
  it('nessuna corrispondenza: vuoto', () => {
    expect(etichette('99')).toEqual([])
  })
})
