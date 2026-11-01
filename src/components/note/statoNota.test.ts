import { describe, expect, it } from 'vitest'
import type { Nota } from '@/domain/tipi'
import {
  conData, conPromemoria, daRiaprire, firma, notaDaStato, problemiNota, statoDaNota, statoVuoto,
} from './statoNota'

const OGGI = '2026-11-01'

const nota = (extra: Partial<Nota> = {}): Nota => ({
  id: 'n1', data: '2026-10-30', testo: 'Foglie gialle', promemoria: false, fatto_il: null, pianta_ids: [], trattamento_ids: [], ...extra,
})

describe('statoVuoto', () => {
  it('parte da oggi, per tutto l\'esperimento, senza promemoria', () => {
    expect(statoVuoto(OGGI)).toEqual({
      testo: '', data: OGGI, collegamento: 'esperimento', trattamento_ids: [], pianta_ids: [], promemoria: false, promemoriaAMano: false,
    })
  })

  it('può partire già collegato a una pianta (dalla scheda)', () => {
    const s = statoVuoto(OGGI, { collegamento: 'piante', pianta_ids: ['p1'] })
    expect(s.collegamento).toBe('piante')
    expect(s.pianta_ids).toEqual(['p1'])
  })
})

describe('statoDaNota', () => {
  it('riporta testo, data, promemoria e il tipo di collegamento', () => {
    expect(statoDaNota(nota())).toMatchObject({ testo: 'Foglie gialle', data: '2026-10-30', collegamento: 'esperimento', promemoria: false })
    expect(statoDaNota(nota({ pianta_ids: ['p1', 'p2'] }))).toMatchObject({ collegamento: 'piante', pianta_ids: ['p1', 'p2'] })
    expect(statoDaNota(nota({ trattamento_ids: ['t1'] }))).toMatchObject({ collegamento: 'trattamenti', trattamento_ids: ['t1'] })
    expect(statoDaNota(nota({ promemoria: true })).promemoria).toBe(true)
  })

  it('la casella non risulta toccata a mano', () => {
    expect(statoDaNota(nota({ promemoria: true })).promemoriaAMano).toBe(false)
  })
})

describe('promemoria automatico', () => {
  it('una data futura spunta la casella da sola; tornando a oggi si toglie', () => {
    const base = statoVuoto(OGGI)
    const futura = conData(base, '2026-11-05', OGGI, false)
    expect(futura.promemoria).toBe(true)
    expect(conData(futura, OGGI, OGGI, false).promemoria).toBe(false)
    expect(conData(futura, '2026-10-01', OGGI, false).promemoria).toBe(false)
  })

  it('la casella toccata a mano non cambia più con la data', () => {
    const tolta = conPromemoria(conData(statoVuoto(OGGI), '2026-11-05', OGGI, false), false)
    expect(tolta.promemoriaAMano).toBe(true)
    expect(conData(tolta, '2026-11-09', OGGI, false).promemoria).toBe(false)
    const messa = conPromemoria(statoVuoto(OGGI), true)
    expect(conData(messa, '2026-10-20', OGGI, false).promemoria).toBe(true)
  })

  it('una nota che era già un promemoria lo resta se la data torna indietro', () => {
    const s = statoDaNota(nota({ promemoria: true, data: '2026-10-20' }))
    expect(conData(s, '2026-11-09', OGGI, true).promemoria).toBe(true)
    expect(conData(s, '2026-10-25', OGGI, true).promemoria).toBe(true)
  })
})

describe('firma e problemi', () => {
  it('la firma ignora ciò che non conta: l\'ordine delle scelte, i collegamenti di un\'altra scelta, la casella toccata', () => {
    const a = { ...statoVuoto(OGGI), testo: 'x', collegamento: 'piante' as const, pianta_ids: ['p2', 'p1'], trattamento_ids: ['t9'] }
    const b = { ...a, pianta_ids: ['p1', 'p2'], trattamento_ids: [], promemoriaAMano: true }
    expect(firma(a)).toBe(firma(b))
  })

  it('la firma cambia con testo, data, collegamento e promemoria', () => {
    const a = { ...statoVuoto(OGGI), testo: 'x' }
    for (const b of [
      { ...a, testo: 'y' }, { ...a, data: '2026-11-02' }, { ...a, collegamento: 'trattamenti' as const }, { ...a, promemoria: true },
      { ...a, collegamento: 'piante' as const, pianta_ids: ['p1'] },
    ]) expect(firma(b)).not.toBe(firma(a))
  })

  it('segnala la data mancante e la scelta vuota di trattamenti o piante', () => {
    expect(problemiNota(statoVuoto(OGGI))).toEqual([])
    expect(problemiNota({ ...statoVuoto(OGGI), data: '' })).toEqual(['Scegli la data.'])
    expect(problemiNota({ ...statoVuoto(OGGI), collegamento: 'trattamenti' })).toEqual(['Scegli almeno un trattamento.'])
    expect(problemiNota({ ...statoVuoto(OGGI), collegamento: 'piante' })).toEqual(['Scegli almeno una pianta.'])
    expect(problemiNota({ ...statoVuoto(OGGI), collegamento: 'piante', pianta_ids: ['p1'] })).toEqual([])
  })
})

describe('notaDaStato', () => {
  it('toglie gli spazi ai bordi del testo e tiene solo i collegamenti della scelta fatta', () => {
    const s = { ...statoVuoto(OGGI), testo: '  Irrigato\n', collegamento: 'trattamenti' as const, trattamento_ids: ['t1', 't1', 't2'], pianta_ids: ['p9'] }
    expect(notaDaStato('n9', s, null, OGGI)).toEqual({
      id: 'n9', data: OGGI, testo: 'Irrigato', promemoria: false, fatto_il: null, pianta_ids: [], trattamento_ids: ['t1', 't2'],
    })
  })

  it('l\'automatismo si rifà al momento del salvataggio: a mezzanotte "oggi" è già domani', () => {
    const s = { ...statoVuoto('2026-11-01'), testo: 'x', data: '2026-11-02' }
    const prima = conData(s, '2026-11-02', '2026-11-01', false)
    expect(prima.promemoria).toBe(true)
    // salvata dopo mezzanotte del 2: la data non è più futura e la casella (mai toccata) torna com'era la nota
    expect(notaDaStato('n', prima, null, '2026-11-02').promemoria).toBe(false)
    // toccata a mano resta com'è
    expect(notaDaStato('n', conPromemoria(prima, true), null, '2026-11-02').promemoria).toBe(true)
  })

  it('di una nota esistente tiene la spunta già fatta', () => {
    const esistente = nota({ promemoria: true, fatto_il: '2026-10-31T10:00:00.000Z' })
    expect(notaDaStato('n1', statoDaNota(esistente), esistente, OGGI).fatto_il).toBe('2026-10-31T10:00:00.000Z')
  })
})

describe('daRiaprire', () => {
  const fatta = nota({ promemoria: true, fatto_il: '2026-10-31T10:00:00.000Z' })

  it('un promemoria fatto con la data spostata in avanti va riaperto', () => {
    expect(daRiaprire(fatta, { ...fatta, data: '2026-11-09' }, OGGI)).toBe(true)
  })

  it('non va riaperto se la data non è stata spostata, nemmeno se è futura', () => {
    const futura = nota({ promemoria: true, data: '2026-11-09', fatto_il: '2026-10-31T10:00:00.000Z' })
    expect(daRiaprire(futura, { ...futura, testo: 'ritoccata' }, OGGI)).toBe(false)
    expect(daRiaprire(futura, { ...futura, data: '2026-11-10' }, OGGI)).toBe(true)
  })

  it('non va riaperto se la data resta passata o di oggi, se non era fatto o se è una nota nuova', () => {
    expect(daRiaprire(fatta, { ...fatta, data: OGGI }, OGGI)).toBe(false)
    expect(daRiaprire(fatta, { ...fatta, data: '2026-10-01' }, OGGI)).toBe(false)
    expect(daRiaprire(nota({ promemoria: true }), nota({ promemoria: true, data: '2026-11-09' }), OGGI)).toBe(false)
    expect(daRiaprire(null, nota({ promemoria: true, data: '2026-11-09' }), OGGI)).toBe(false)
  })
})
