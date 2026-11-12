import { describe, it, expect } from 'vitest'
import {
  FASI, NOMI_FASE, passiDellaFase, primoPassoMancante, avanzamentoFase, statoSessione, repliche, etichettaCampione, letteraReplica,
  faseDaAprire, indiceDelPasso, avanzamentoFasi, eCompletata,
} from './sequenza'
import type { CampionePesatura, Peso, SessionePesatura, TipoAnalisi, TipoPeso } from './tipi'
import type { Pianta } from '../tipi'

const sessione = (tipo: TipoAnalisi, rep = 1, conclusa = false): SessionePesatura => ({
  id: 's', esperimento_id: 'e', titolo: 'T', tipo, unita: 'g',
  impostazioni: { repliche: rep, rapportoTampone: null, sensore: null }, data: '2026-01-01', nota: null, conclusa,
})
const camp = (id: string, ordine: number, extra: Partial<CampionePesatura> = {}): CampionePesatura =>
  ({ id, sessione_id: 's', pianta_id: null, nome: id, substrato: null, ordine, ...extra })
const peso = (campione_id: string, tipo: TipoPeso, replica = 1): Peso =>
  ({ id: `${campione_id}${tipo}${replica}`, campione_id, replica, tipo, valore: 1, lettura: null, misurato_il: '2026-01-01T00:00:00Z' })

describe('fasi', () => {
  it('elenca le fasi per tipo', () => {
    expect(FASI.rwc).toEqual(['fresco', 'turgido', 'secco'])
    expect(FASI.vasi).toEqual(['secco', 'capacita_campo', 'asciugatura'])
    expect(NOMI_FASE.capacita_campo).toBe('Capacità di campo')
  })
  it('lettera della replica', () => {
    expect(letteraReplica(1)).toBe('A')
    expect(letteraReplica(3)).toBe('C')
  })
})

describe('passiDellaFase', () => {
  const s = sessione('rwc', 2)
  const cs = [camp('c2', 2), camp('c1', 1)]
  it('ordina per campione e replica', () => {
    const p = passiDellaFase(s, cs, [], 'turgido')
    expect(p.map(x => [x.campione.id, x.replica])).toEqual([['c1', 1], ['c1', 2], ['c2', 1], ['c2', 2]])
  })
  it('primoPassoMancante e avanzamento', () => {
    const p = passiDellaFase(s, cs, [peso('c1', 'turgido', 1)], 'turgido')
    expect(primoPassoMancante(p)).toBe(1)
    expect(avanzamentoFase(p)).toEqual({ pesati: 1, totali: 4 })
    const tutti = passiDellaFase(s, cs, cs.flatMap(c => [1, 2].map(r => peso(c.id, 'turgido', r))), 'turgido')
    expect(primoPassoMancante(tutti)).toBe(4)
  })
  it('asciugatura: un passo per vaso, senza peso, una sola replica', () => {
    const v = sessione('vasi', 3)
    const p = passiDellaFase(v, [camp('v1', 1), camp('v2', 2)], [peso('v1', 'asciugatura')], 'asciugatura')
    expect(p).toHaveLength(2)
    expect(p.every(x => x.peso === null && x.replica === 1)).toBe(true)
  })
})

describe('repliche', () => {
  it('una replica 3 presente allarga a [1,2,3]', () => {
    expect(repliche(camp('c1', 1), sessione('rwc', 2), [peso('c1', 'fresco', 3)])).toEqual([1, 2, 3])
    expect(repliche(camp('c1', 1), sessione('rwc', 2), [])).toEqual([1, 2])
  })
  it('i vasi hanno una sola replica', () => {
    expect(repliche(camp('v', 1), sessione('vasi', 3), [])).toEqual([1])
  })
})

describe('statoSessione', () => {
  it('mancano, completa; "conclusa" vale solo per i vasi', () => {
    const s = sessione('sostanza_secca')
    const cs = [camp('c1', 1)]
    expect(statoSessione(s, cs, [peso('c1', 'fresco')])).toBe('mancano')
    const pesi = [peso('c1', 'fresco'), peso('c1', 'secco')]
    expect(statoSessione(s, cs, pesi)).toBe('completa')
    // una pesata vecchia segnata conclusa con dei pesi mancanti dice ancora che mancano
    expect(statoSessione({ ...s, conclusa: true }, cs, [peso('c1', 'fresco')])).toBe('mancano')
    expect(statoSessione({ ...sessione('vasi'), conclusa: true }, [camp('v1', 1)], [])).toBe('conclusa')
  })
  it('vasi: serve almeno un punto di asciugatura per vaso', () => {
    const s = sessione('vasi')
    const cs = [camp('v1', 1)]
    const base = [peso('v1', 'secco'), peso('v1', 'capacita_campo')]
    expect(statoSessione(s, cs, base)).toBe('mancano')
    expect(statoSessione(s, cs, [...base, peso('v1', 'asciugatura')])).toBe('completa')
  })
  it('senza campioni mancano', () => {
    expect(statoSessione(sessione('aliquota'), [], [])).toBe('mancano')
  })
})

describe('etichettaCampione', () => {
  const piante = new Map<string, Pianta>([['p', { id: 'p', trattamento_id: 't', etichetta: '12', blocco: null, ordine: 1 }]])
  it('pianta o nome', () => {
    expect(etichettaCampione(camp('c', 1, { pianta_id: 'p' }), piante)).toBe('P12')
    expect(etichettaCampione(camp('c', 1, { nome: 'Bianco' }), piante)).toBe('Bianco')
  })
})

describe('aprire la pesata da un campione del riepilogo', () => {
  it('faseDaAprire: la prima fase in cui manca il peso di quella replica', () => {
    const s = sessione('rwc', 2)
    expect(faseDaAprire(s, 'c', 1, [])).toBe('fresco')
    expect(faseDaAprire(s, 'c', 1, [peso('c', 'fresco')])).toBe('turgido')
    expect(faseDaAprire(s, 'c', 2, [peso('c', 'fresco', 1)])).toBe('fresco')
    expect(faseDaAprire(s, 'c', 1, [peso('c', 'fresco'), peso('c', 'turgido'), peso('c', 'secco')])).toBe('fresco')
    expect(faseDaAprire(sessione('aliquota'), 'c', 1, [peso('c', 'aliquota')])).toBe('aliquota')
  })

  it('faseDaAprire: un vaso completo apre l\'asciugatura', () => {
    const s = sessione('vasi')
    expect(faseDaAprire(s, 'v', 1, [peso('v', 'secco')])).toBe('capacita_campo')
    expect(faseDaAprire(s, 'v', 1, [peso('v', 'secco'), peso('v', 'capacita_campo')])).toBe('asciugatura')
  })

  it('indiceDelPasso trova campione e replica, null se non c\'è', () => {
    const passi = passiDellaFase(sessione('rwc', 2), [camp('a', 1), camp('b', 2)], [], 'fresco')
    expect(indiceDelPasso(passi, 'b', 2)).toBe(3)
    expect(indiceDelPasso(passi, 'b', 3)).toBeNull()
    expect(indiceDelPasso(passi, 'x', 1)).toBeNull()
  })
})

describe('avanzamentoFasi ed eCompletata', () => {
  it('le fasi con un peso per campione, senza l\'asciugatura', () => {
    const cs = [camp('c1', 1), camp('c2', 2)]
    expect(avanzamentoFasi(sessione('rwc'), cs, [peso('c1', 'fresco'), peso('c2', 'fresco'), peso('c1', 'turgido')])).toEqual([
      { fase: 'fresco', pesati: 2, totali: 2 }, { fase: 'turgido', pesati: 1, totali: 2 }, { fase: 'secco', pesati: 0, totali: 2 },
    ])
    expect(avanzamentoFasi(sessione('vasi'), cs, []).map(a => a.fase)).toEqual(['secco', 'capacita_campo'])
  })
  it('completata con tutti i pesi; i vasi solo se segnati conclusi', () => {
    const cs = [camp('c1', 1)]
    expect(eCompletata(sessione('aliquota'), cs, [peso('c1', 'aliquota')])).toBe(true)
    expect(eCompletata(sessione('aliquota'), cs, [])).toBe(false)
    const vasi = [peso('c1', 'secco'), peso('c1', 'capacita_campo'), peso('c1', 'asciugatura')]
    expect(eCompletata(sessione('vasi'), cs, vasi)).toBe(false)
    expect(eCompletata(sessione('vasi', 1, true), cs, [])).toBe(true)
  })
})
