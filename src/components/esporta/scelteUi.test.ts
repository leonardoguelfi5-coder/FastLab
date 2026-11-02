import { describe, expect, it } from 'vitest'
import { SCELTA_TUTTO, leggiSceltaExport, type SceltaExport } from '@/domain/export/scelte'
import { configDiEsempio } from '@/domain/test-helpers'
import type { ConfigEsperimento } from '@/domain/tipi'
import { SETTIMANE_DI_PARTENZA, scelteDaScelta, sceltaDaScelteUi, type ScelteUi } from './scelteUi'

let config: ConfigEsperimento
const tuttiGliStrumenti = () => config.strumenti.map(s => s.id)

function nuova(): ScelteUi {
  config = configDiEsempio()
  return scelteDaScelta(SCELTA_TUTTO, config)
}

describe('scelteDaScelta', () => {
  it('"Tutto l\'esperimento": tutti gli strumenti scelti, tutte le piante, tutto il periodo, tutti i fogli', () => {
    const ui = nuova()
    expect(ui.strumenti).toEqual(tuttiGliStrumenti())
    expect(ui.modoPiante).toBe('tutte')
    expect(ui.modoPeriodo).toBe('tutto')
    expect(ui.settimane).toBe(SETTIMANE_DI_PARTENZA)
    expect(ui.come).toEqual({ valori: true, medie: true, grafici: true, diario: true, info: true })
  })

  it('strumenti scelti, trattamenti, settimane e intervallo si riportano nello stato', () => {
    config = configDiEsempio()
    const [primo] = config.strumenti
    const scelta: SceltaExport = {
      v: 1, strumenti: { modo: 'scelti', ids: [primo.id] }, piante: { modo: 'trattamenti', ids: [config.trattamenti[1].id] },
      periodo: { modo: 'settimane', n: 12 }, come: { valori: false, medie: true, grafici: false, diario: false, info: false },
    }
    const ui = scelteDaScelta(scelta, config)
    expect(ui).toMatchObject({
      strumenti: [primo.id], modoPiante: 'trattamenti', trattamenti: [config.trattamenti[1].id], modoPeriodo: 'settimane', settimane: 12,
    })
    const intervallo = scelteDaScelta({ ...scelta, periodo: { modo: 'intervallo', da: '2026-10-01', a: '2026-10-20' } }, config)
    expect(intervallo).toMatchObject({ modoPeriodo: 'intervallo', da: '2026-10-01', a: '2026-10-20' })
  })

  it('piante precise: il campo di ricerca ha le loro etichette, nell\'ordine della configurazione', () => {
    config = configDiEsempio()
    const [p1, p2, p3] = config.piante
    const ui = scelteDaScelta({ ...SCELTA_TUTTO, piante: { modo: 'piante', ids: [p3.id, p1.id] } }, config)
    expect(ui.modoPiante).toBe('piante')
    expect(ui.cercato).toBe(`${p1.etichetta}, ${p3.etichetta}`)
    expect(p2.etichetta).not.toBe(p1.etichetta)
  })

  it('la scelta copiata non è la stessa dell\'originale: modificare lo stato non cambia SCELTA_TUTTO', () => {
    const ui = nuova()
    ui.come.valori = false
    expect(SCELTA_TUTTO.come.valori).toBe(true)
  })
})

describe('sceltaDaScelteUi', () => {
  it('lo stato di partenza dà di nuovo "Tutto l\'esperimento"', () => {
    const { scelta, problemi } = sceltaDaScelteUi(nuova(), config)
    expect(problemi).toEqual({})
    expect(scelta).toEqual(SCELTA_TUTTO)
  })

  it('tutti gli strumenti scelti restano "tutti" (anche uno aggiunto dopo); alcuni diventano un elenco nell\'ordine della configurazione', () => {
    const ui = nuova()
    expect(sceltaDaScelteUi({ ...ui, strumenti: [...ui.strumenti].reverse() }, config).scelta?.strumenti).toEqual({ modo: 'tutti' })
    const [, secondo] = config.strumenti
    expect(sceltaDaScelteUi({ ...ui, strumenti: [secondo.id] }, config).scelta?.strumenti).toEqual({ modo: 'scelti', ids: [secondo.id] })
  })

  it('nessuno strumento: nessuna scelta e il motivo', () => {
    const { scelta, problemi } = sceltaDaScelteUi({ ...nuova(), strumenti: [] }, config)
    expect(scelta).toBeNull()
    expect(problemi.strumenti).toBe('Scegli almeno uno strumento.')
  })

  it('"Per trattamento…" senza trattamenti non è valida; con trattamenti sì, nell\'ordine della configurazione', () => {
    const ui = nuova()
    expect(sceltaDaScelteUi({ ...ui, modoPiante: 'trattamenti', trattamenti: [] }, config)).toMatchObject({
      scelta: null, problemi: { piante: 'Scegli almeno un trattamento.' },
    })
    const [t0, t1, t2] = config.trattamenti
    expect(sceltaDaScelteUi({ ...ui, modoPiante: 'trattamenti', trattamenti: [t2.id, t0.id] }, config).scelta?.piante)
      .toEqual({ modo: 'trattamenti', ids: [t0.id, t2.id] })
    expect(t1.id).toBeTruthy()
  })

  it('"Piante…": la ricerca è esatta, trova quelle che ci sono e dice quelle che mancano', () => {
    const ui = nuova()
    const [p1, p2] = config.piante
    const risultato = sceltaDaScelteUi({ ...ui, modoPiante: 'piante', cercato: `${p2.etichetta}, 99, ${p1.etichetta}` }, config)
    expect(risultato.scelta?.piante).toEqual({ modo: 'piante', ids: [p1.id, p2.id] })
    expect(risultato.nonTrovate).toEqual(['99'])
    expect(risultato.trovate).toEqual([p1.etichetta, p2.etichetta])
    expect(risultato.problemi).toEqual({})
  })

  it('"Piante…" senza nessuna pianta trovata non è valida e dice quali non ci sono', () => {
    const risultato = sceltaDaScelteUi({ ...nuova(), modoPiante: 'piante', cercato: '99, 100' }, config)
    expect(risultato.scelta).toBeNull()
    expect(risultato.problemi.piante).toBe('Scrivi almeno una pianta che c\'è.')
    expect(risultato.nonTrovate).toEqual(['99', '100'])
    expect(sceltaDaScelteUi({ ...nuova(), modoPiante: 'piante', cercato: '' }, config).problemi.piante).toBe('Scrivi almeno una pianta che c\'è.')
  })

  it('periodo: settimane relative, intervallo giusto, e i due modi sbagliati dell\'intervallo', () => {
    const ui = nuova()
    expect(sceltaDaScelteUi({ ...ui, modoPeriodo: 'settimane', settimane: 12 }, config).scelta?.periodo).toEqual({ modo: 'settimane', n: 12 })
    expect(sceltaDaScelteUi({ ...ui, modoPeriodo: 'intervallo', da: '2026-10-01', a: '2026-10-01' }, config).scelta?.periodo)
      .toEqual({ modo: 'intervallo', da: '2026-10-01', a: '2026-10-01' })
    expect(sceltaDaScelteUi({ ...ui, modoPeriodo: 'intervallo', da: '2026-10-02', a: '2026-10-01' }, config))
      .toMatchObject({ scelta: null, problemi: { periodo: 'La data di inizio deve venire prima di quella di fine.' } })
    expect(sceltaDaScelteUi({ ...ui, modoPeriodo: 'intervallo', da: '2026-10-02', a: '' }, config))
      .toMatchObject({ scelta: null, problemi: { periodo: 'Scegli tutte e due le date.' } })
    expect(sceltaDaScelteUi({ ...ui, modoPeriodo: 'intervallo', da: '2026-02-30', a: '2026-03-01' }, config).scelta).toBeNull()
  })

  it('nessun contenuto: nessuna scelta e il motivo', () => {
    const ui = nuova()
    const senza = { valori: false, medie: false, grafici: false, diario: false, info: false }
    expect(sceltaDaScelteUi({ ...ui, come: senza }, config)).toMatchObject({
      scelta: null, problemi: { come: 'Scegli almeno un contenuto per il file.' },
    })
  })

  it('il risultato è sempre una scelta che il database accetta (leggiSceltaExport)', () => {
    const ui = nuova()
    const [p1] = config.piante
    for (const prova of [
      ui,
      { ...ui, modoPiante: 'piante' as const, cercato: p1.etichetta },
      { ...ui, modoPeriodo: 'settimane' as const, settimane: 104 },
      { ...ui, strumenti: [config.strumenti[0].id], come: { ...ui.come, valori: false } },
    ]) {
      const { scelta } = sceltaDaScelteUi(prova, config)
      expect(scelta).not.toBeNull()
      expect(leggiSceltaExport(scelta)).toEqual(scelta)
    }
    // 105 settimane: oltre il limite del database, quindi non valida (e lo dice)
    expect(sceltaDaScelteUi({ ...ui, modoPeriodo: 'settimane', settimane: 105 }, config).scelta).toBeNull()
  })

  it('gli ids che non ci sono più nella configurazione non entrano mai nella scelta', () => {
    const ui = nuova()
    const { scelta } = sceltaDaScelteUi({ ...ui, strumenti: [config.strumenti[0].id, 'fantasma'] }, config)
    expect(scelta?.strumenti).toEqual({ modo: 'scelti', ids: [config.strumenti[0].id] })
    expect(sceltaDaScelteUi({ ...ui, modoPiante: 'trattamenti', trattamenti: ['fantasma'] }, config).scelta).toBeNull()
  })
})
