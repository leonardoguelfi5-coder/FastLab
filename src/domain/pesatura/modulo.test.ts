import { describe, expect, it } from 'vitest'
import type { Pianta } from '../tipi'
import { bozzaDa, bozzaVuota, campioniDa, impostazioniDi, problemiDi, unitaDi, type BozzaPesata } from './modulo'
import type { CampionePesatura, SessionePesatura } from './tipi'

const OGGI = '2026-11-12'
const bozza = (extra: Partial<BozzaPesata> = {}): BozzaPesata => ({ ...bozzaVuota(OGGI), titolo: 'Antociani', ...extra })
const sessione = (extra: Partial<SessionePesatura> = {}): SessionePesatura => ({
  id: 'S', esperimento_id: 'E', titolo: 'RWC foglie', tipo: 'rwc', unita: 'mg',
  impostazioni: { repliche: 3, rapportoTampone: null, sensore: null }, data: '2026-10-28', nota: 'Dischetti', conclusa: false, ...extra,
})
const pianta = (id: string): Pianta => ({ id, trattamento_id: 't', etichetta: id, blocco: null, ordine: 0 }) as Pianta
const campione = (id: string, ordine: number, extra: Partial<CampionePesatura>): CampionePesatura =>
  ({ id, sessione_id: 'S', pianta_id: null, nome: null, substrato: null, ordine, ...extra })

describe('bozza', () => {
  it('vuota: aliquota in grammi, una replica, la data di oggi', () => {
    expect(bozzaVuota(OGGI)).toMatchObject({ titolo: '', data: OGGI, tipo: 'aliquota', sceltaUnita: 'g', repliche: 1, nota: '' })
  })

  it('Ripeti copia titolo, tipo, unità, impostazioni e nota; la data riparte da oggi', () => {
    expect(bozzaDa(sessione(), OGGI)).toMatchObject({
      titolo: 'RWC foglie', data: OGGI, tipo: 'rwc', sceltaUnita: 'mg', unitaLibera: '', repliche: 3, calcolaTampone: false, nota: 'Dischetti',
    })
    expect(bozzaDa(sessione({ tipo: 'aliquota', impostazioni: { repliche: 1, rapportoTampone: 10, sensore: null } }), OGGI))
      .toMatchObject({ calcolaTampone: true, rapportoTampone: 10 })
    expect(bozzaDa(sessione({ nota: null }), OGGI).nota).toBe('')
  })

  it('Ripeti con un\'unità scritta a mano la rimette nel campo libero', () => {
    expect(bozzaDa(sessione({ unita: 'µg' }), OGGI)).toMatchObject({ sceltaUnita: 'altra', unitaLibera: 'µg' })
  })

  it('Ripeti dei vasi riprende il sensore', () => {
    const vasi = sessione({ tipo: 'vasi', impostazioni: { repliche: 1, rapportoTampone: null, sensore: { tipo: 'tensione', unita: 'kPa' } } })
    expect(bozzaDa(vasi, OGGI)).toMatchObject({ tipo: 'vasi', sensore: 'tensione', unitaSensore: 'kPa', repliche: 1 })
  })
})

describe('unitaDi', () => {
  it('quella del menu o quella scritta, senza spazi', () => {
    expect(unitaDi(bozza({ sceltaUnita: 'kg' }))).toBe('kg')
    expect(unitaDi(bozza({ sceltaUnita: 'altra', unitaLibera: '  µg ' }))).toBe('µg')
  })
})

describe('problemiDi', () => {
  it('una bozza compilata non ha problemi', () => {
    expect(problemiDi(bozza())).toEqual([])
  })

  it('serve un titolo', () => {
    expect(problemiDi(bozza({ titolo: '   ' }))).toEqual(['Scrivi un titolo.'])
  })

  it('l\'unità scritta non è vuota e ha al massimo 20 caratteri', () => {
    expect(problemiDi(bozza({ sceltaUnita: 'altra', unitaLibera: ' ' }))).toEqual(['Scrivi l\'unità di misura.'])
    expect(problemiDi(bozza({ sceltaUnita: 'altra', unitaLibera: 'x'.repeat(21) }))[0]).toMatch(/al massimo 20 caratteri/)
    expect(problemiDi(bozza({ sceltaUnita: 'altra', unitaLibera: 'µg' }))).toEqual([])
  })

  it('repliche da 1 a 10 (i vasi non le usano)', () => {
    expect(problemiDi(bozza({ repliche: 0 }))).toEqual(['Le repliche vanno da 1 a 10.'])
    expect(problemiDi(bozza({ repliche: 11 }))).toEqual(['Le repliche vanno da 1 a 10.'])
    expect(problemiDi(bozza({ repliche: null }))).toEqual(['Le repliche vanno da 1 a 10.'])
    expect(problemiDi(bozza({ tipo: 'vasi', repliche: null }))).toEqual([])
  })

  it('il tampone vuole un rapporto positivo e un\'unità che si converte in grammi', () => {
    expect(problemiDi(bozza({ calcolaTampone: true, rapportoTampone: null }))).toEqual(['Scrivi quanti mL di tampone per ogni g.'])
    expect(problemiDi(bozza({ calcolaTampone: true, rapportoTampone: 10 }))).toEqual([])
    expect(problemiDi(bozza({ calcolaTampone: true, rapportoTampone: 10, sceltaUnita: 'altra', unitaLibera: 'lb' }))[0])
      .toMatch(/Il tampone si calcola solo con g, mg o kg/)
    // il tampone conta solo per le aliquote
    expect(problemiDi(bozza({ tipo: 'rwc', calcolaTampone: true, rapportoTampone: null }))).toEqual([])
  })

  it('i vasi vogliono l\'unità del sensore', () => {
    expect(problemiDi(bozza({ tipo: 'vasi', unitaSensore: ' ' }))).toEqual(['Scrivi l\'unità del sensore.'])
  })
})

describe('impostazioniDi', () => {
  it('il tampone solo per le aliquote, il sensore solo per i vasi (con una replica)', () => {
    expect(impostazioniDi(bozza({ repliche: 2, calcolaTampone: true, rapportoTampone: 10 })))
      .toEqual({ repliche: 2, rapportoTampone: 10, sensore: null })
    expect(impostazioniDi(bozza({ tipo: 'rwc', repliche: 2, calcolaTampone: true, rapportoTampone: 10 })))
      .toEqual({ repliche: 2, rapportoTampone: null, sensore: null })
    expect(impostazioniDi(bozza({ tipo: 'vasi', repliche: 4, sensore: 'tensione', unitaSensore: ' kPa ' })))
      .toEqual({ repliche: 1, rapportoTampone: null, sensore: { tipo: 'tensione', unita: 'kPa' } })
  })
})

describe('campioniDa', () => {
  const piante = ['p1', 'p2', 'p3'].map(pianta)

  it('se c\'erano tutte le piante dell\'esperimento: "tutte"', () => {
    const cs = piante.map((p, i) => campione(`c${i}`, i, { pianta_id: p.id }))
    expect(campioniDa(cs, piante)).toEqual({ modo: 'tutte', piante: [], righe: [] })
  })

  it('altrimenti le stesse piante a mano, in ordine, e le righe libere', () => {
    const cs = [
      campione('c1', 3, { nome: 'Bianco' }), campione('c2', 2, { pianta_id: 'p3' }), campione('c3', 1, { pianta_id: 'p1' }),
      campione('c4', 4, { pianta_id: 'sparita' }),
    ]
    expect(campioniDa(cs, piante)).toEqual({ modo: 'mano', piante: ['p1', 'p3'], righe: [{ nome: 'Bianco', substrato: '' }] })
  })

  it('una pesata fatta solo di righe (o di vasi) si ripete senza piante', () => {
    const cs = [campione('v1', 1, { nome: 'V1', substrato: 'Torba' })]
    expect(campioniDa(cs, piante)).toEqual({ modo: 'mano', piante: [], righe: [{ nome: 'V1', substrato: 'Torba' }] })
  })
})
