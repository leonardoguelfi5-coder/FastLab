import { describe, it, expect } from 'vitest'
import { migliaia, nomeFileExcel, riepilogoCartella, testoRiepilogo } from './riepilogo'
import { costruisciCartella, type Cartella, type Foglio } from './fogli'
import { SCELTA_TUTTO } from './scelte'
import { configExport, misura, nota, p1, p2, p4, palchi, sCiras, sFeno, sSpad, spad, pA } from './test-helpers'

const foglio = (nome: string, tipo: Foglio['tipo'], righe: number): Foglio => ({
  nome, tipo, intestazione: tipo !== 'info' && tipo !== 'grafici', titoliDiBlocco: [],
  colonne: [{ titolo: 'x', tipo: 'testo', larghezza: 8 }], righe: Array.from({ length: righe }, () => ['x']),
})
const cartellaFinta = (fogli: Foglio[], grafici = 0): Cartella => ({
  nomeFile: 'FastLab_x_2026-11-02.xlsx', fogli, intervallo: { da: null, a: null },
  grafici: Array.from({ length: grafici }, (_, i) => ({ parametroId: `p${i}`, titolo: 'T', scala: 'valore', unita: null, serie: [], note: [], riga: 2 })),
  strumenti: [{ id: 's1', nome: 'SPAD', parametri: ['SPAD'] }, { id: 's2', nome: 'Ciras', parametri: ['A', 'gs', 'E', 'Ci'] }],
})

describe('riepilogoCartella e testoRiepilogo', () => {
  it('l\'esempio del piano: righe, immagini, note, Info e la riga dei contenuti', () => {
    const c = cartellaFinta([
      foglio('Dati', 'dati', 896), foglio('Medie', 'medie', 32), foglio('Misure', 'misure', 3584), foglio('Palchi', 'lista', 1),
      foglio('Grafici', 'grafici', 140), foglio('Diario', 'diario', 12), foglio('Info', 'info', 40),
    ], 6)
    expect(riepilogoCartella(c)).toEqual([
      { foglio: 'Dati', quante: 896, cosa: 'righe' }, { foglio: 'Medie', quante: 32, cosa: 'righe' },
      { foglio: 'Misure', quante: 3584, cosa: 'righe' }, { foglio: 'Palchi', quante: 1, cosa: 'righe' },
      { foglio: 'Grafici', quante: 6, cosa: 'immagini' }, { foglio: 'Diario', quante: 12, cosa: 'note' },
      { foglio: 'Info', quante: 40, cosa: 'configurazione' },
    ])
    expect(testoRiepilogo(c)).toEqual({
      fogli: ['Dati: 896 righe', 'Medie: 32 righe', 'Misure: 3.584 righe', 'Palchi: 1 riga', 'Grafici: 6 immagini', 'Diario: 12 note', 'Info'],
      contenuti: 'SPAD, Ciras (A, gs, E, Ci)',
    })
  })

  it('al singolare: 1 immagine, 1 nota', () => {
    const c = cartellaFinta([foglio('Grafici', 'grafici', 24), foglio('Diario', 'diario', 1)], 1)
    expect(testoRiepilogo(c).fogli).toEqual(['Grafici: 1 immagine', 'Diario: 1 nota'])
  })

  it('una cartella vera: i conteggi sono le righe dei suoi fogli, e i fogli senza righe non ci sono', () => {
    const c = costruisciCartella({
      config: configExport(), scelta: SCELTA_TUTTO, oggi: '2026-11-02', adesso: '2026-11-02T10:00:00.000Z', ultimaData: null,
      note: [nota(1, '2026-10-20', 'Irrigazione')],
      misure: [
        misura(p1, sSpad, '2026-10-20', '09:00', { [spad.id]: [40, 42] }),
        misura(p2, sSpad, '2026-10-20', '09:00', { [spad.id]: [38, null] }),
        misura(p1, sCiras, '2026-10-20', '10:00', { [pA.id]: [12] }),
        misura(p4, sFeno, '2026-10-21', '10:00', { [palchi.id]: [] }),
      ],
    })
    const voci = riepilogoCartella(c)
    expect(voci.map(v => v.foglio)).toEqual(c.fogli.map(f => f.nome))
    for (const v of voci) {
      const f = c.fogli.find(x => x.nome === v.foglio) as Foglio
      expect(v.quante).toBe(v.cosa === 'immagini' ? c.grafici.length : f.righe.length)
    }
    expect(testoRiepilogo(c).fogli).toEqual(['Dati: 2 righe', 'Medie: 1 riga', 'Misure: 4 righe', 'Grafici: 2 immagini', 'Diario: 1 nota', 'Info'])
    expect(testoRiepilogo(c).contenuti).toBe('SPAD, Ciras (A, gs, E, Ci), Metro (Altezza, Vecchio), Fenologici (Altezza, Note, Vigoroso, Palchi)')
  })

  it('una cartella vuota: nessuna riga', () => {
    expect(testoRiepilogo(cartellaFinta([]))).toEqual({ fogli: [], contenuti: 'SPAD, Ciras (A, gs, E, Ci)' })
  })
})

describe('migliaia', () => {
  it('il punto delle migliaia italiano, anche a quattro cifre (Intl in italiano non lo mette)', () => {
    expect([0, 7, 999, 1000, 3584, 12_000, 1_234_567].map(migliaia)).toEqual(['0', '7', '999', '1.000', '3.584', '12.000', '1.234.567'])
  })
})

describe('nomeFileExcel', () => {
  it('FastLab_<nome sicuro>_<AAAA-MM-GG>.xlsx', () => {
    expect(nomeFileExcel('Hydrochar', '2026-11-02')).toBe('FastLab_Hydrochar_2026-11-02.xlsx')
  })

  it('accenti, simboli e spazi diventano un nome sicuro; senza niente di sicuro, "esperimento"', () => {
    expect(nomeFileExcel('Prova: è/ "pomodoro" #2', '2026-11-02')).toBe('FastLab_Prova-e-pomodoro-2_2026-11-02.xlsx')
    expect(nomeFileExcel('🌱🌱', '2026-11-02')).toBe('FastLab_esperimento_2026-11-02.xlsx')
    expect(nomeFileExcel('../../etc', '2026-11-02')).toBe('FastLab_etc_2026-11-02.xlsx')
  })
})
