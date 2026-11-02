import { describe, it, expect } from 'vitest'
import {
  RIGHE_IMMAGINE, TESTO_GRAFICI, costruisciCartella, larghezzaColonna, nomiFogli, type Cartella, type Cella, type DatiCartella,
  type Foglio,
} from './fogli'
import { SCELTA_TUTTO, type SceltaExport } from './scelte'
import { serieTrattamenti } from '../dataset'
import {
  altezzaF, altezzaM, configExport, misura, nota, noteP, p1, p2, p3, p4, p5, pA, pCi, pOrfana, palchi, parametro, sCiras,
  sFeno, sMetro, sSpad, spad, tCN, tCS, tSN, tSS, uuid, vigoroso, pGs, pE,
} from './test-helpers'
import type { ConfigEsperimento, Misura, Nota } from '../tipi'

/*
 * I numeri attesi sono fatti a mano sulle misure qui sotto (date D1 = 20/10, D2 = 27/10):
 * - SPAD a due letture: p1 D1 alle 09:00 [40, 42] (41) e alle 15:00 [44, vuoto] (44), media del giorno 42,5 con N = 2;
 *   p2 D1 [38, 39] = 38,5; p3 D1 [vuoto, vuoto] non conta; D2: p1 [45, 46] = 45,5, p2 [40, 40] = 40;
 * - Ciras: p1 D1 A 12,5, gs 0,3, E 2, Ci 300; p3 D1 A 10, gs vuoto, Ci 280;
 * - Metro D1: Altezza 30, 32, 28, 25, 27 per p1..p5 (date in disordine nell'array);
 * - Fenologici: p1 D1 alle 12:00 Altezza 31, Note "prima", Vigoroso sì, Palchi di 2 elementi; alle 16:00 Note "seconda",
 *   Vigoroso no, Palchi vuoto; p2 D1 Note di soli spazi e Vigoroso non scelto; p4 D2 Palchi di 1 elemento.
 */
const D1 = '2026-10-20'
const D2 = '2026-10-27'
const OGGI = '2026-11-02'
const ADESSO = '2026-11-02T10:15:00.000Z'

function misureDiProva(): Misura[] {
  return [
    misura(p1, sFeno, D1, '16:00', { [noteP.id]: 'seconda', [vigoroso.id]: false, [palchi.id]: [] }),
    misura(p1, sSpad, D1, '15:00', { [spad.id]: [44, null] }),
    misura(p2, sSpad, D2, '09:00', { [spad.id]: [40, 40] }),
    misura(p1, sSpad, D2, '09:00', { [spad.id]: [45, 46] }),
    misura(p1, sSpad, D1, '09:00', { [spad.id]: [40, 42] }),
    misura(p2, sSpad, D1, '09:10', { [spad.id]: [38, 39] }),
    misura(p3, sSpad, D1, '09:20', { [spad.id]: [null, null] }),
    misura(p1, sCiras, D1, '10:00', { [pA.id]: [12.5], [pGs.id]: [0.3], [pE.id]: [2], [pCi.id]: [300] }),
    misura(p3, sCiras, D1, '10:05', { [pA.id]: [10], [pGs.id]: [null], [pCi.id]: [280] }),
    misura(p5, sMetro, D1, '11:00', { [altezzaM.id]: [27] }),
    misura(p4, sMetro, D1, '11:00', { [altezzaM.id]: [25] }),
    misura(p3, sMetro, D1, '11:00', { [altezzaM.id]: [28] }),
    misura(p2, sMetro, D1, '11:00', { [altezzaM.id]: [32] }),
    misura(p1, sMetro, D1, '11:00', { [altezzaM.id]: [30] }),
    misura(p1, sFeno, D1, '12:00', {
      [altezzaF.id]: [31], [noteP.id]: 'prima', [vigoroso.id]: true,
      [palchi.id]: [{ n: 1, valori: { fiori: 3, lung: 10 } }, { n: 2, valori: { fiori: 1, lung: 5 } }],
    }),
    misura(p2, sFeno, D1, '12:10', { [noteP.id]: '  ', [vigoroso.id]: null }),
    misura(p4, sFeno, D2, '12:00', { [palchi.id]: [{ n: 1, valori: { fiori: 2, lung: null } }] }),
  ]
}

function noteDiProva(): Nota[] {
  return [
    nota(1, '2026-11-10', 'Concimare', { promemoria: true }),
    nota(2, '2026-10-21', '=SOMMA(A1:A3)', { trattamento_ids: [tSS.id] }),
    nota(3, '2026-09-01', 'Fuori periodo'),
    nota(4, '2026-10-22', 'Solo la 035', { pianta_ids: [p4.id] }),
    nota(5, '2026-10-25', 'Spuntata', { promemoria: true, fatto_il: '2026-10-25T23:30:00.000Z' }),
    nota(6, D1, 'Irrigazione'),
  ]
}

function cartella(extra: Partial<DatiCartella> = {}): Cartella {
  return costruisciCartella({
    config: configExport(), misure: misureDiProva(), note: noteDiProva(), scelta: SCELTA_TUTTO,
    oggi: OGGI, adesso: ADESSO, ultimaData: D2, ...extra,
  })
}
const con = (extra: Partial<SceltaExport>): SceltaExport => ({ ...structuredClone(SCELTA_TUTTO), ...extra })
const soloCome = (come: Partial<SceltaExport['come']>): SceltaExport =>
  con({ come: { valori: false, medie: false, grafici: false, diario: false, info: false, ...come } })

const foglio = (c: Cartella, nome: string): Foglio => {
  const f = c.fogli.find(x => x.nome === nome)
  if (!f) throw new Error(`manca il foglio ${nome}: ${c.fogli.map(x => x.nome).join(', ')}`)
  return f
}
const titoli = (f: Foglio): string[] => f.colonne.map(c => c.titolo)
/** I valori di una colonna, per titolo. */
const colonna = (f: Foglio, titolo: string): Cella[] => {
  const i = titoli(f).indexOf(titolo)
  if (i < 0) throw new Error(`manca la colonna ${titolo}: ${titoli(f).join(' | ')}`)
  return f.righe.map(r => r[i])
}
/** Le righe come oggetti { titolo: valore }, per leggere i test. */
const comeOggetti = (f: Foglio): Record<string, Cella>[] =>
  f.righe.map(r => Object.fromEntries(f.colonne.map((c, i) => [c.titolo, r[i]])))

const COMUNI = ['Esperimento', 'Pianta', 'Stress', 'Hydrochar', 'Trattamento', 'Blocco']

describe('costruisciCartella: i fogli e il loro ordine', () => {
  it('con tutto: Dati, Medie, Misure, una lista, Grafici, Diario, Info (sempre ultimo)', () => {
    const c = cartella()
    expect(c.fogli.map(f => [f.nome, f.tipo])).toEqual([
      ['Dati', 'dati'], ['Medie', 'medie'], ['Misure', 'misure'], ['Palchi', 'lista'], ['Grafici', 'grafici'],
      ['Diario', 'diario'], ['Info', 'info'],
    ])
    expect(c.nomeFile).toBe('FastLab_Hydrochar-prova_2026-11-02.xlsx')
  })

  it('ogni foglio c\'è solo se è scelto', () => {
    expect(cartella({ scelta: soloCome({ medie: true }) }).fogli.map(f => f.nome)).toEqual(['Medie'])
    expect(cartella({ scelta: soloCome({ valori: true }) }).fogli.map(f => f.nome)).toEqual(['Dati', 'Misure', 'Palchi'])
    expect(cartella({ scelta: soloCome({ grafici: true, info: true }) }).fogli.map(f => f.nome)).toEqual(['Grafici', 'Info'])
    expect(cartella({ scelta: soloCome({ diario: true }) }).grafici).toEqual([])
  })

  it('nessuna misura né nota: solo Info (che c\'è sempre se scelto); senza Info nessun foglio', () => {
    expect(cartella({ misure: [], note: [] }).fogli.map(f => f.nome)).toEqual(['Info'])
    const vuota = cartella({ misure: [], note: [], scelta: con({ come: { ...SCELTA_TUTTO.come, info: false } }) })
    expect(vuota.fogli).toEqual([])
    expect(vuota.grafici).toEqual([])
  })

  it('le misure di uno strumento non scelto, di una pianta che non c\'è o fuori periodo non entrano', () => {
    const estranea = { ...misura(p1, sSpad, D1, '08:00', { [spad.id]: [99, 99] }), pianta_id: uuid(77) }
    const c = cartella({ misure: [...misureDiProva(), estranea], scelta: con({ strumenti: { modo: 'scelti', ids: [sCiras.id] } }) })
    expect(foglio(c, 'Dati').righe).toHaveLength(2)
    expect(colonna(foglio(c, 'Misure'), 'Strumento')).toEqual(Array(6).fill('Ciras'))
    expect(c.fogli.some(f => f.nome === 'Palchi')).toBe(false)
  })

  it('una scelta non valida non diventa un file sbagliato: lancia', () => {
    expect(() => cartella({ scelta: con({ periodo: { modo: 'settimane', n: 0 } }) })).toThrow()
  })
})

describe('Dati', () => {
  it('colonne esatte e nell\'ordine: comuni, Data, un parametro per colonna (non le liste), N_ solo dove serve', () => {
    expect(titoli(foglio(cartella(), 'Dati'))).toEqual([
      ...COMUNI, 'Data', 'SPAD', 'N_SPAD', 'A (µmol/m²/s)', 'gs (mol/m²/s)', 'E (mmol/m²/s)', 'Ci (ppm)',
      'Altezza (cm) · Metro', 'Vecchio', 'Altezza (cm) · Fenologici', 'Note', 'Vigoroso',
    ])
  })

  it('una riga per pianta e data con un valore: per data, poi trattamento, poi pianta', () => {
    const dati = foglio(cartella(), 'Dati')
    expect(dati.righe.map(r => [r[1], r[6]])).toEqual([
      ['1', { data: D1 }], ['2', { data: D1 }], ['3', { data: D1 }], ['035', { data: D1 }], ['5', { data: D1 }],
      ['1', { data: D2 }], ['2', { data: D2 }],
    ])
  })

  it('il trattamento viene prima dell\'ordine delle piante: la 5 (S1 + Sì) messa per prima resta dopo le altre', () => {
    const config = configExport()
    config.piante = config.piante.map(p => (p.id === p5.id ? { ...p, ordine: -1 } : p))
    expect(colonna(foglio(cartella({ config }), 'Dati'), 'Pianta').slice(0, 5)).toEqual(['1', '2', '3', '035', '5'])
  })

  it('le celle della prima riga, verificate a mano', () => {
    expect(foglio(cartella(), 'Dati').righe[0]).toEqual([
      'Hydrochar prova', '1', 'Controllo', 'No', 'Controllo + No', 'A', { data: D1 },
      42.5, 2, 12.5, 0.3, 2, 300, 30, null, 31, 'seconda', false,
    ])
  })

  it('due misure nello stesso giorno: media e N_ = 2; le altre righe con un valore N_ = 1, senza valore vuoto', () => {
    const dati = foglio(cartella(), 'Dati')
    expect(colonna(dati, 'SPAD')).toEqual([42.5, 38.5, null, null, null, 45.5, 40])
    expect(colonna(dati, 'N_SPAD')).toEqual([2, 1, null, null, null, 1, 1])
  })

  it('letture ripetute in una sola misura: la media delle letture non vuote, N_ resta 1', () => {
    const c = cartella({ misure: [misura(p1, sSpad, D1, '09:00', { [spad.id]: [40, 43] }), misura(p2, sSpad, D1, '09:00', { [spad.id]: [null, 39] })] })
    const dati = foglio(c, 'Dati')
    expect(colonna(dati, 'SPAD')).toEqual([41.5, 39])
    expect(titoli(dati)).not.toContain('N_SPAD')
  })

  it('nessun N_ se mai più di una misura al giorno', () => {
    expect(titoli(foglio(cartella(), 'Dati')).filter(t => t.startsWith('N_'))).toEqual(['N_SPAD'])
  })

  it('testo e sì/no: l\'ultimo del giorno per ora; un testo di soli spazi e un sì/no non scelto non contano', () => {
    const dati = foglio(cartella(), 'Dati')
    expect(colonna(dati, 'Note').slice(0, 2)).toEqual(['seconda', null])
    expect(colonna(dati, 'Vigoroso').slice(0, 2)).toEqual([false, null])
  })

  it('intestazioni doppie disambiguate con lo strumento; unità tra parentesi', () => {
    const dati = foglio(cartella(), 'Dati')
    expect(colonna(dati, 'Altezza (cm) · Metro')).toEqual([30, 32, 28, 25, 27, null, null])
    expect(colonna(dati, 'Altezza (cm) · Fenologici')).toEqual([31, null, null, null, null, null, null])
  })

  it('senza blocchi nessuna colonna Blocco; la pianta resta testo ("035")', () => {
    const config = configExport()
    config.piante = config.piante.map(p => ({ ...p, blocco: p.id === p3.id ? '  ' : null }))
    const dati = foglio(cartella({ config }), 'Dati')
    expect(titoli(dati)).not.toContain('Blocco')
    expect(colonna(dati, 'Pianta')).toContain('035')
  })

  it('una pianta il cui trattamento non c\'è: la riga resta, con trattamento e fattori vuoti, dopo le altre del giorno', () => {
    const config: ConfigEsperimento = { ...configExport(), piante: [...configExport().piante, pOrfana] }
    const c = cartella({ config, misure: [misura(pOrfana, sMetro, D1, '08:00', { [altezzaM.id]: [40] }), misura(p1, sMetro, D1, '11:00', { [altezzaM.id]: [30] })] })
    expect(comeOggetti(foglio(c, 'Dati')).map(r => [r.Pianta, r.Trattamento, r.Stress, r['Altezza (cm) · Metro']])).toEqual([
      ['1', 'Controllo + No', 'Controllo', 30], ['99', null, null, 40],
    ])
    // nelle medie non c'è un trattamento a cui darla
    expect(colonna(foglio(c, 'Medie'), 'Trattamento')).toEqual(['Controllo + No'])
  })

  it('un parametro con il nome di una colonna fissa ("Data") prende (2), lo stesso in Dati, Medie, Grafici e Info', () => {
    const config = configExport()
    const data = parametro(440, 'data')
    config.parametri.push(data)
    config.strumenti = config.strumenti.map(s => (s.id !== sMetro.id ? s : {
      ...s, parametri: [...s.parametri, { parametro_id: data.id, obbligatorio: false, ordine: 2 }],
    }))
    const c = cartella({ config, misure: [misura(p1, sMetro, D1, '11:00', { [data.id]: [5] })] })
    expect(colonna(foglio(c, 'Dati'), 'data (2)')).toEqual([5])
    expect(colonna(foglio(c, 'Medie'), 'data (2) media')).toEqual([5])
    expect(c.grafici.map(g => g.titolo)).toEqual(['data (2)'])
    const info = foglio(c, 'Info')
    expect(info.righe.find(r => r[1] === 'data')?.[9]).toBe('data (2)')
  })

  it('un fattore senza livello nel trattamento: cella vuota', () => {
    const config = configExport()
    config.trattamenti = config.trattamenti.map(t => (t.id === tCN.id ? { ...t, livello_ids: [t.livello_ids[0]] } : t))
    expect(colonna(foglio(cartella({ config }), 'Dati'), 'Hydrochar')[0]).toBeNull()
  })
})

describe('Misure', () => {
  it('una riga per lettura non vuota, liste escluse, nell\'ordine data, ora, pianta, strumento, parametro, lettura', () => {
    const misure = foglio(cartella(), 'Misure')
    expect(titoli(misure)).toEqual([...COMUNI, 'Data', 'Ora', 'Strumento', 'Parametro', 'Unità', 'N. lettura', 'Valore', 'Id misura'])
    expect(misure.righe).toHaveLength(25)
    expect(comeOggetti(misure).map(r => [(r.Data as { data: string }).data.slice(8), (r.Ora as { ora: string }).ora, r.Pianta, r.Parametro, r['N. lettura'], r.Valore])).toEqual([
      ['20', '09:00', '1', 'SPAD', 1, 40], ['20', '09:00', '1', 'SPAD', 2, 42],
      ['20', '09:10', '2', 'SPAD', 1, 38], ['20', '09:10', '2', 'SPAD', 2, 39],
      ['20', '10:00', '1', 'A', 1, 12.5], ['20', '10:00', '1', 'gs', 1, 0.3], ['20', '10:00', '1', 'E', 1, 2], ['20', '10:00', '1', 'Ci', 1, 300],
      ['20', '10:05', '3', 'A', 1, 10], ['20', '10:05', '3', 'Ci', 1, 280],
      ['20', '11:00', '1', 'Altezza', 1, 30], ['20', '11:00', '2', 'Altezza', 1, 32], ['20', '11:00', '3', 'Altezza', 1, 28],
      ['20', '11:00', '035', 'Altezza', 1, 25], ['20', '11:00', '5', 'Altezza', 1, 27],
      ['20', '12:00', '1', 'Altezza', 1, 31], ['20', '12:00', '1', 'Note', null, 'prima'], ['20', '12:00', '1', 'Vigoroso', null, true],
      ['20', '15:00', '1', 'SPAD', 1, 44],
      ['20', '16:00', '1', 'Note', null, 'seconda'], ['20', '16:00', '1', 'Vigoroso', null, false],
      ['27', '09:00', '1', 'SPAD', 1, 45], ['27', '09:00', '1', 'SPAD', 2, 46], ['27', '09:00', '2', 'SPAD', 1, 40], ['27', '09:00', '2', 'SPAD', 2, 40],
    ])
  })

  it('la lettura conserva la sua posizione: [vuoto, 39] è la lettura 2', () => {
    const c = cartella({ misure: [misura(p2, sSpad, D1, '09:00', { [spad.id]: [null, 39] })] })
    expect(comeOggetti(foglio(c, 'Misure')).map(r => [r['N. lettura'], r.Valore])).toEqual([[2, 39]])
  })

  it('strumento, unità e id della misura', () => {
    const m = misura(p1, sMetro, D1, '11:00', { [altezzaM.id]: [30] })
    const [riga] = comeOggetti(foglio(cartella({ misure: [m] }), 'Misure'))
    expect([riga.Strumento, riga.Parametro, riga.Unità, riga['Id misura']]).toEqual(['Metro', 'Altezza', 'cm', m.id])
  })
})

describe('un foglio per ogni lista', () => {
  it('una riga per elemento, i sotto campi in colonna con l\'unità', () => {
    const lista = foglio(cartella(), 'Palchi')
    expect(titoli(lista)).toEqual([...COMUNI, 'Data', 'Ora', 'Strumento', 'N. elemento', 'Fiori', 'Lunghezza (cm)', 'Id misura'])
    expect(comeOggetti(lista).map(r => [r.Pianta, r.Data, r.Ora, r['N. elemento'], r.Fiori, r['Lunghezza (cm)']])).toEqual([
      ['1', { data: D1 }, { ora: '12:00' }, 1, 3, 10], ['1', { data: D1 }, { ora: '12:00' }, 2, 1, 5],
      ['035', { data: D2 }, { ora: '12:00' }, 1, 2, null],
    ])
  })

  it('una lista sempre vuota non ha foglio', () => {
    const c = cartella({ misure: [misura(p1, sFeno, D1, '12:00', { [palchi.id]: [] })] })
    expect(c.fogli.map(f => f.nome)).not.toContain('Palchi')
  })

  it('un nome di lista uguale a un foglio fisso o a un\'altra lista prende (2)', () => {
    const config = configExport()
    const dati = parametro(435, 'dati', { tipo: 'lista', sotto_campi: [{ chiave: 'x', nome: 'X', unita: null }] })
    const palchi2 = parametro(436, 'Palchi', { tipo: 'lista', sotto_campi: [] })
    config.parametri.push(dati, palchi2)
    config.strumenti = config.strumenti.map(s => (s.id !== sFeno.id ? s : {
      ...s, parametri: [...s.parametri, { parametro_id: dati.id, obbligatorio: false, ordine: 4 }, { parametro_id: palchi2.id, obbligatorio: false, ordine: 5 }],
    }))
    const c = cartella({
      config,
      misure: [misura(p1, sFeno, D1, '12:00', {
        [palchi.id]: [{ n: 1, valori: {} }], [dati.id]: [{ n: 1, valori: { x: 7 } }], [palchi2.id]: [{ n: 1, valori: {} }],
      })],
    })
    // solo liste: niente Dati né Misure
    expect(c.fogli.map(f => f.nome)).toEqual(['Medie', 'Palchi', 'dati (2)', 'Palchi (2)', 'Grafici', 'Diario', 'Info'])
    expect(colonna(foglio(c, 'dati (2)'), 'X')).toEqual([7])
  })
})

describe('Medie', () => {
  it('colonne: Esperimento, Trattamento, i fattori, Data, poi media, ES e n (% sì e n per i sì/no, n. elementi per le liste)', () => {
    const t = titoli(foglio(cartella(), 'Medie'))
    expect(t.slice(0, 8)).toEqual(['Esperimento', 'Trattamento', 'Stress', 'Hydrochar', 'Data', 'SPAD media', 'SPAD ES', 'SPAD n'])
    expect(t.slice(-5)).toEqual(['Vigoroso % sì', 'Vigoroso n', 'Palchi (n. elementi) media', 'Palchi (n. elementi) ES', 'Palchi (n. elementi) n'])
    expect(t).not.toContain('Note media')
    expect(t).toHaveLength(5 + 3 * 8 + 2 + 3)
  })

  it('una riga per trattamento e data con almeno un n ≥ 1, per data e poi trattamento', () => {
    const medie = foglio(cartella(), 'Medie')
    expect(comeOggetti(medie).map(r => [r.Trattamento, r.Data])).toEqual([
      ['Controllo + No', { data: D1 }], ['Controllo + Sì', { data: D1 }], ['S1 + No', { data: D1 }], ['S1 + Sì', { data: D1 }],
      ['Controllo + No', { data: D2 }], ['S1 + No', { data: D2 }],
    ])
  })

  it('i numeri, verificati a mano: unità la pianta, ES vuoto con n = 1, n = 0 senza valori', () => {
    const [cn1, cs1, , , cn2, sn2] = comeOggetti(foglio(cartella(), 'Medie'))
    expect(cn1['SPAD media']).toBe(40.5)
    expect(cn1['SPAD ES']).toBeCloseTo(2, 12)
    expect(cn1['SPAD n']).toBe(2)
    expect([cn1['A (µmol/m²/s) media'], cn1['A (µmol/m²/s) ES'], cn1['A (µmol/m²/s) n']]).toEqual([12.5, null, 1])
    expect([cn1['Altezza (cm) · Metro media'], cn1['Altezza (cm) · Metro n']]).toEqual([31, 2])
    expect(cn1['Altezza (cm) · Metro ES']).toBeCloseTo(1, 12)
    expect([cs1['SPAD media'], cs1['SPAD ES'], cs1['SPAD n']]).toEqual([null, null, 0])
    expect([cn1['Vecchio media'], cn1['Vecchio n']]).toEqual([null, 0])
    expect(cn2['SPAD media']).toBe(42.75)
    expect(cn2['SPAD ES']).toBeCloseTo(2.75, 12)
    expect([sn2['Palchi (n. elementi) media'], sn2['Palchi (n. elementi) n']]).toEqual([1, 1])
  })

  it('% sì: solo le piante con un sì/no scelto (p1 ha detto no alle 16:00, p2 non ha scelto)', () => {
    const [cn1] = comeOggetti(foglio(cartella(), 'Medie'))
    expect([cn1['Vigoroso % sì'], cn1['Vigoroso n']]).toEqual([0, 1])
    const c = cartella({ misure: [misura(p1, sFeno, D1, '12:00', { [vigoroso.id]: true }), misura(p2, sFeno, D1, '12:00', { [vigoroso.id]: false })] })
    expect(comeOggetti(foglio(c, 'Medie')).map(r => [r['Vigoroso % sì'], r['Vigoroso n']])).toEqual([[50, 2]])
  })

  it('gli stessi numeri di serieTrattamenti, per ogni parametro e trattamento', () => {
    const config = configExport()
    const misure = misureDiProva()
    const medie = comeOggetti(foglio(cartella(), 'Medie'))
    const tutto = { da: null, a: null }
    for (const [par, strumento, titolo] of [[spad, sSpad, 'SPAD'], [pA, sCiras, 'A (µmol/m²/s)'], [altezzaM, sMetro, 'Altezza (cm) · Metro']] as const) {
      for (const s of serieTrattamenti(config, par, misure.filter(m => m.strumento_id === strumento.id), config.piante, tutto)) {
        for (const punto of s.punti) {
          const riga = medie.find(r => r.Trattamento === s.trattamento.etichetta && (r.Data as { data: string }).data === punto.data)
          expect([riga?.[`${titolo} media`], riga?.[`${titolo} ES`], riga?.[`${titolo} n`]]).toEqual([punto.media, punto.es, punto.n])
        }
      }
    }
  })

  it('piante precise: le medie delle sole piante scelte', () => {
    const c = cartella({ scelta: con({ piante: { modo: 'piante', ids: [p1.id] } }) })
    const [cn1] = comeOggetti(foglio(c, 'Medie'))
    expect([cn1['SPAD media'], cn1['SPAD ES'], cn1['SPAD n']]).toEqual([42.5, null, 1])
    expect(colonna(foglio(c, 'Medie'), 'Trattamento')).toEqual(['Controllo + No', 'Controllo + No'])
  })
})

describe('Grafici', () => {
  it('un grafico per ogni parametro disegnabile con almeno un punto, con le serie di serieTrattamenti', () => {
    const c = cartella()
    expect(c.grafici.map(g => [g.titolo, g.scala])).toEqual([
      ['SPAD', 'valore'], ['A (µmol/m²/s)', 'valore'], ['gs (mol/m²/s)', 'valore'], ['E (mmol/m²/s)', 'valore'],
      ['Ci (ppm)', 'valore'], ['Altezza (cm) · Metro', 'valore'], ['Altezza (cm) · Fenologici', 'valore'],
      ['Vigoroso (% sì)', 'percentuale'], ['Palchi (n. elementi)', 'conteggio'],
    ])
    const [g] = c.grafici
    expect(g.parametroId).toBe(spad.id)
    expect(g.unita).toBeNull()
    expect(g.serie.map(s => s.trattamento.etichetta)).toEqual(['Controllo + No', 'Controllo + Sì', 'S1 + No', 'S1 + Sì'])
    expect(g.serie[0].punti).toEqual([{ data: D1, media: 40.5, es: g.serie[0].punti[0].es, n: 2 }, { data: D2, media: 42.75, es: g.serie[0].punti[1].es, n: 2 }])
    expect(c.grafici[5].unita).toBe('cm')
    expect(c.grafici[7].unita).toBe('%')
  })

  it('le note del grafico: nel periodo e collegate alle piante scelte (regola di noteDelGrafico)', () => {
    const c = cartella({ scelta: con({ piante: { modo: 'piante', ids: [p1.id] } }) })
    expect(c.grafici[0].note.map(n => [n.data, n.note.map(x => x.testo)])).toEqual([
      ['2026-09-01', ['Fuori periodo']], [D1, ['Irrigazione']], ['2026-10-25', ['Spuntata']], ['2026-11-10', ['Concimare']],
    ])
  })

  it('il foglio: la riga della regola, poi per ogni grafico il titolo sopra 22 righe libere', () => {
    const c = cartella()
    const grafici = foglio(c, 'Grafici')
    expect(grafici.intestazione).toBe(false)
    expect(grafici.righe[0]).toEqual([TESTO_GRAFICI])
    expect(TESTO_GRAFICI).toBe('Media per trattamento ± errore standard. Unità: la pianta (prima la media del giorno di ogni pianta).')
    expect(c.grafici.map(g => g.riga)).toEqual(c.grafici.map((_, i) => 2 + i * (RIGHE_IMMAGINE + 1)))
    for (const g of c.grafici) expect(grafici.righe[g.riga]).toEqual([g.titolo])
    expect(grafici.righe).toHaveLength(2 + c.grafici.length * (RIGHE_IMMAGINE + 1))
    expect(RIGHE_IMMAGINE).toBe(22)
  })
})

describe('Diario', () => {
  it('tutte le note per data crescente, con collegamento, promemoria e data locale di "fatto il"', () => {
    const diario = foglio(cartella(), 'Diario')
    expect(titoli(diario)).toEqual(['Data', 'Testo', 'Collegata a', 'Promemoria', 'Fatto il'])
    expect(diario.righe).toEqual([
      [{ data: '2026-09-01' }, 'Fuori periodo', 'Tutto l\'esperimento', false, null],
      [{ data: D1 }, 'Irrigazione', 'Tutto l\'esperimento', false, null],
      [{ data: '2026-10-21' }, '=SOMMA(A1:A3)', 'S1 + Sì', false, null],
      [{ data: '2026-10-22' }, 'Solo la 035', 'Pianta 035', false, null],
      // 23:30 UTC del 25/10 (ora solare dalle 3 di quella notte) è già il 26/10 in Italia
      [{ data: '2026-10-25' }, 'Spuntata', 'Tutto l\'esperimento', true, { data: '2026-10-26' }],
      [{ data: '2026-11-10' }, 'Concimare', 'Tutto l\'esperimento', true, null],
    ])
  })

  it('filtro per periodo e per collegamento: note fuori periodo e di altre piante o trattamenti escluse', () => {
    const c = cartella({ scelta: con({ piante: { modo: 'piante', ids: [p1.id] }, periodo: { modo: 'intervallo', da: '2026-10-01', a: '2026-10-31' } }) })
    expect(colonna(foglio(c, 'Diario'), 'Testo')).toEqual(['Irrigazione', 'Spuntata'])
    const t = cartella({ scelta: con({ piante: { modo: 'trattamenti', ids: [tSS.id, tSN.id] } }) })
    expect(colonna(foglio(t, 'Diario'), 'Testo')).toEqual(['Fuori periodo', 'Irrigazione', '=SOMMA(A1:A3)', 'Solo la 035', 'Spuntata', 'Concimare'])
  })

  it('senza note nel periodo nessun foglio Diario', () => {
    const c = cartella({ scelta: con({ periodo: { modo: 'intervallo', da: '2026-01-01', a: '2026-01-31' } }) })
    expect(c.fogli.map(f => f.nome)).toEqual(['Info'])
  })

  it('un testo lunghissimo si taglia a 32 000 caratteri con …; le formule restano testo così come sono', () => {
    const c = cartella({ note: [nota(9, D1, 'x'.repeat(40_000)), nota(10, D1, '+39 333\tciao'), nota(11, D1, '@a')] })
    const [lungo, tel, chiocciola] = colonna(foglio(c, 'Diario'), 'Testo') as string[]
    expect(lungo).toHaveLength(32_000)
    expect(lungo.endsWith('x…')).toBe(true)
    expect([tel, chiocciola]).toEqual(['+39 333\tciao', '@a'])
  })

  it('il taglio non spezza un carattere fuori dal piano di base (emoji)', () => {
    const c = cartella({ note: [nota(9, D1, `${'x'.repeat(31_998)}🌱🌱`)] })
    const [testo] = colonna(foglio(c, 'Diario'), 'Testo') as string[]
    expect(testo).toBe(`${'x'.repeat(31_998)}…`)
  })

  it('i caratteri che un file .xlsx non può contenere (controllo, U+FFFE) si tolgono; tab e a capo restano', () => {
    const c = cartella({ note: [nota(9, D1, 'a\u0000b\u0007c\u000bd\uFFFEe\nf\tg')] })
    expect(colonna(foglio(c, 'Diario'), 'Testo')).toEqual(['abcde\nf\tg'])
  })
})

describe('Info', () => {
  const info = () => foglio(cartella(), 'Info')

  it('quattro blocchi con il titolo in grassetto, separati da una riga vuota, senza intestazione bloccata', () => {
    const f = info()
    expect(f.intestazione).toBe(false)
    expect(f.titoliDiBlocco.map(i => f.righe[i][0])).toEqual(['Voce', 'Trattamento', 'Pianta', 'Strumento'])
    for (const i of f.titoliDiBlocco.slice(1)) expect(f.righe[i - 1]).toEqual([])
  })

  it('blocco 1: configurazione, istante di export e periodo a parole', () => {
    const f = info()
    expect(f.righe.slice(0, 10)).toEqual([
      ['Voce', 'Valore'],
      ['Esperimento', 'Hydrochar prova'],
      ['Data di inizio', { data: '2026-10-01' }],
      ['Stato', 'in corso'],
      ['Note', 'Serra 2'],
      ['Esportato il', { istante: ADESSO }],
      ['Strumenti', 'SPAD, Ciras, Metro, Fenologici'],
      ['Piante', 'tutte le piante (5 piante)'],
      ['Periodo', 'tutto il periodo'],
      ['Regola delle medie', expect.stringContaining('Unità: la pianta')],
    ])
  })

  it('il periodo con le date vere: ultime 4 settimane da oggi, o dall\'ultima misura per un esperimento concluso', () => {
    const periodo = (c: Cartella) => foglio(c, 'Info').righe.find(r => r[0] === 'Periodo')?.[1]
    expect(periodo(cartella({ scelta: con({ periodo: { modo: 'settimane', n: 4 } }) })))
      .toBe('ultime 4 settimane: dal 06/10/2026 al 02/11/2026')
    const concluso = configExport()
    concluso.esperimento.stato = 'concluso'
    const c = cartella({ config: concluso, scelta: con({ periodo: { modo: 'settimane', n: 1 } }), ultimaData: D1 })
    expect(periodo(c)).toBe('ultima settimana: dal 14/10/2026 al 20/10/2026')
    expect(foglio(c, 'Dati').righe.every(r => (r[6] as { data: string }).data === D1)).toBe(true)
    expect(c.intervallo).toEqual({ da: '2026-10-14', a: D1 })
    expect(periodo(cartella({ scelta: con({ periodo: { modo: 'intervallo', da: '2026-10-06', a: '2026-11-02' } }) })))
      .toBe('dal 06/10/2026 al 02/11/2026')
  })

  it('blocchi 2 e 3: trattamenti con i livelli e quante piante, piante con trattamento e blocco', () => {
    const f = info()
    const [t, p, s] = f.titoliDiBlocco.slice(1)
    expect(f.righe.slice(t, p - 1)).toEqual([
      ['Trattamento', 'Stress', 'Hydrochar', 'Piante'],
      ['Controllo + No', 'Controllo', 'No', 2], ['Controllo + Sì', 'Controllo', 'Sì', 1], ['S1 + No', 'S1', 'No', 1], ['S1 + Sì', 'S1', 'Sì', 1],
    ])
    expect(f.righe.slice(p, s - 1)).toEqual([
      ['Pianta', 'Trattamento', 'Blocco'],
      ['1', 'Controllo + No', 'A'], ['2', 'Controllo + No', 'B'], ['3', 'Controllo + Sì', 'A'], ['035', 'S1 + No', null], ['5', 'S1 + Sì', 'B'],
    ])
  })

  it('blocco 4: strumenti e parametri, con il tipo a parole e la colonna in Dati', () => {
    const f = info()
    const s = f.titoliDiBlocco[3]
    expect(f.righe[s]).toEqual(['Strumento', 'Parametro', 'Tipo', 'Unità', 'Letture', 'Minimo', 'Massimo', 'Obbligatorio', 'Archiviato', 'Colonna in Dati'])
    const righe = f.righe.slice(s + 1)
    expect(righe).toHaveLength(11)
    expect(righe[0]).toEqual(['SPAD', 'SPAD', 'numero', null, 2, null, null, true, false, 'SPAD'])
    expect(righe.find(r => r[1] === 'Vecchio')).toEqual(['Metro', 'Vecchio', 'numero', null, 1, null, null, false, true, 'Vecchio'])
    expect(righe.find(r => r[0] === 'Metro' && r[1] === 'Altezza')).toEqual(['Metro', 'Altezza', 'numero', 'cm', 1, 0, 300, true, false, 'Altezza (cm) · Metro'])
    expect(righe.filter(r => r[0] === 'Fenologici').map(r => [r[1], r[2], r[4], r[9]])).toEqual([
      ['Altezza', 'numero', 1, 'Altezza (cm) · Fenologici'], ['Note', 'testo', null, 'Note'],
      ['Vigoroso', 'sì/no', null, 'Vigoroso'], ['Palchi', 'lista', null, null],
    ])
  })

  it('solo gli strumenti scelti hanno una colonna in Dati; senza Dati nessuna', () => {
    const colonneInDati = (c: Cartella) => {
      const f = foglio(c, 'Info')
      return f.righe.slice(f.titoliDiBlocco[3] + 1).map(r => r[9])
    }
    expect(colonneInDati(cartella({ scelta: con({ strumenti: { modo: 'scelti', ids: [sSpad.id] } }) })).filter(x => x !== null)).toEqual(['SPAD'])
    expect(colonneInDati(cartella({ scelta: soloCome({ info: true }) })).every(x => x === null)).toBe(true)
  })

  it('le piante della scelta a parole e contate; una data di inizio assente è vuota', () => {
    const config = configExport()
    config.esperimento.data_inizio = null
    config.esperimento.note = ''
    const c = cartella({ config, scelta: con({ piante: { modo: 'trattamenti', ids: [tCN.id] } }) })
    const voce = (nome: string) => foglio(c, 'Info').righe.find(r => r[0] === nome)?.[1]
    expect([voce('Piante'), voce('Data di inizio'), voce('Note')]).toEqual(['trattamento Controllo + No (2 piante)', null, null])
  })
})

describe('periodo e piante della scelta su tutti i fogli', () => {
  it('un trattamento e un giorno: Dati, Misure, Medie e Grafici solo di quelli', () => {
    const c = cartella({ scelta: con({ piante: { modo: 'trattamenti', ids: [tCN.id] }, periodo: { modo: 'intervallo', da: D2, a: D2 } }) })
    expect(c.fogli.map(f => f.nome)).toEqual(['Dati', 'Medie', 'Misure', 'Grafici', 'Info'])
    expect(colonna(foglio(c, 'Dati'), 'Pianta')).toEqual(['1', '2'])
    expect(foglio(c, 'Misure').righe).toHaveLength(4)
    expect(comeOggetti(foglio(c, 'Medie')).map(r => [r.Trattamento, r['SPAD media']])).toEqual([['Controllo + No', 42.75]])
    expect(c.grafici.map(g => g.titolo)).toEqual(['SPAD'])
    expect(c.grafici[0].serie.map(s => s.trattamento.id)).toEqual([tCN.id])
  })

  it('ultime N settimane da oggi per un esperimento in corso (ultima settimana = solo D2)', () => {
    const c = cartella({ scelta: con({ periodo: { modo: 'settimane', n: 1 } }) })
    expect(c.intervallo).toEqual({ da: '2026-10-27', a: OGGI })
    expect(colonna(foglio(c, 'Dati'), 'Pianta')).toEqual(['1', '2'])
    expect(colonna(foglio(c, 'Palchi'), 'Pianta')).toEqual(['035'])
  })

  it('ids che non ci sono più si scartano anche qui (un elenco vuoto vale tutti)', () => {
    const c = cartella({ scelta: con({ strumenti: { modo: 'scelti', ids: [uuid(77)] }, piante: { modo: 'piante', ids: [uuid(78), p3.id] } }) })
    expect(colonna(foglio(c, 'Dati'), 'Pianta')).toEqual(['3'])
    expect(c.strumenti.map(s => s.nome)).toEqual(['SPAD', 'Ciras', 'Metro', 'Fenologici'])
  })
})

describe('i valori: date, ore, numeri, booleani e testo', () => {
  it('ogni cella ha il tipo della sua colonna; nessun numero scritto come testo', () => {
    const c = cartella()
    const tipoDi = (x: Cella): string => {
      if (x === null) return 'vuoto'
      if (typeof x === 'object') return Object.keys(x)[0]
      return typeof x
    }
    const atteso: Record<string, string[]> = {
      testo: ['string', 'vuoto'], numero: ['number', 'vuoto'], data: ['data', 'vuoto'], ora: ['ora', 'vuoto'],
      istante: ['istante', 'vuoto'], booleano: ['boolean', 'vuoto'], misto: ['string', 'number', 'boolean', 'data', 'istante', 'vuoto'],
    }
    for (const f of c.fogli) {
      for (const riga of f.righe) {
        expect(riga.length).toBeLessThanOrEqual(f.colonne.length)
        riga.forEach((x, i) => expect(atteso[f.colonne[i].tipo], `${f.nome} ${f.colonne[i].titolo}`).toContain(tipoDi(x)))
      }
    }
    const dati = foglio(c, 'Dati')
    expect(dati.colonne.map(x => x.tipo)).toEqual([
      'testo', 'testo', 'testo', 'testo', 'testo', 'testo', 'data', 'numero', 'numero', 'numero', 'numero', 'numero', 'numero',
      'numero', 'numero', 'numero', 'testo', 'booleano',
    ])
    expect(foglio(c, 'Misure').colonne.map(x => x.tipo).slice(6)).toEqual(['data', 'ora', 'testo', 'testo', 'testo', 'numero', 'misto', 'testo'])
    for (const f of c.fogli) for (const r of f.righe) for (const x of r) if (typeof x === 'string') expect(x).not.toMatch(/^-?\d+,\d+$/)
  })

  it('le righe di dati hanno tutte le celle, anche le vuote', () => {
    for (const f of cartella().fogli.filter(x => x.intestazione)) for (const r of f.righe) expect(r).toHaveLength(f.colonne.length)
  })
})

describe('nomiFogli', () => {
  it('al più 31 caratteri, senza [ ] : * ? / \\, senza apostrofo ai bordi, non History, unici senza maiuscole', () => {
    expect(nomiFogli([
      'Dati', 'Palchi', 'palchi', 'A/B: [x]*?\\', '\'Citato\'', 'History', 'Un nome lunghissimo di una lista di prova', '', '   ', 'info',
    ])).toEqual([
      'Dati (2)', 'Palchi', 'palchi (2)', 'A B x', 'Citato', 'History (2)', 'Un nome lunghissimo di una list', 'Lista', 'Lista (2)', 'info (2)',
    ])
  })

  it('il suffisso sta nei 31 caratteri e non ripete un nome già dato', () => {
    const lungo = 'Infiorescenze del palco basale!!'
    const nomi = nomiFogli([lungo, lungo, 'Lista', 'Lista (2)', 'Lista'])
    expect(nomi.slice(0, 2)).toEqual(['Infiorescenze del palco basale!', 'Infiorescenze del palco bas (2)'])
    expect(nomi.slice(2)).toEqual(['Lista', 'Lista (2)', 'Lista (3)'])
    for (const n of nomi) expect(n.length).toBeLessThanOrEqual(31)
  })

  it('non spezza un\'emoji al taglio', () => {
    const [n] = nomiFogli([`${'a'.repeat(30)}🌱`])
    expect(n).toBe('a'.repeat(30))
  })
})

describe('larghezze delle colonne', () => {
  it('dalla cella più lunga, intestazione compresa, più 2 di margine, tra 8 e 40', () => {
    const l = (titolo: string, valori: Cella[]) => larghezzaColonna(titolo, valori.map(x => [x]))
    expect(l('Esperimento', ['Hydrochar prova'])).toBe(17)
    expect(l('Pianta', ['1', '035'])).toBe(8)
    expect(l('Testo', ['x'.repeat(500)])).toBe(40)
    expect(l('Data', [{ data: D1 }])).toBe(12)
    expect(l('Ora', [{ ora: '09:00' }, null])).toBe(8)
    expect(l('Esportato il', [{ istante: ADESSO }])).toBe(18)
    expect(l('N', [true, false])).toBe(8)
    expect(l('Valore', [1 / 3, 7])).toBe(14)
    expect(l('Valore', [123456789, 1 / 3])).toBe(14)
    expect(l('Testo', ['riga corta\nseconda riga più lunga'])).toBe(24)
    expect(larghezzaColonna(null, [['a', 'Hydrochar prova']], 1)).toBe(17)
  })

  it('le colonne della cartella le usano', () => {
    const dati = foglio(cartella(), 'Dati')
    expect(dati.colonne[0].larghezza).toBe(17)
    expect(dati.colonne[1].larghezza).toBe(8)
  })
})

describe('prestazioni', () => {
  it('circa 18 000 misure (200 piante, 30 date, 3 strumenti) in meno di 1 s', () => {
    const config = configExport()
    const trattamenti = [tCN, tCS, tSN, tSS]
    config.piante = Array.from({ length: 200 }, (_, i) => ({
      id: uuid(20_000 + i), trattamento_id: trattamenti[i % 4].id, etichetta: String(i + 1), blocco: i % 2 ? 'A' : 'B', ordine: i,
    }))
    const date = Array.from({ length: 30 }, (_, i) => `2026-${i < 15 ? '09' : '10'}-${String((i % 15) + 10).padStart(2, '0')}`)
    const misure: Misura[] = []
    let k = 0
    const id = () => uuid(100_000 + k++)
    for (const pianta of config.piante) {
      for (const data of date) {
        const base = { pianta_id: pianta.id, data_rilievo: data }
        misure.push({ ...base, id: id(), strumento_id: sSpad.id, ora: '09:00', valori: { [spad.id]: [40 + (k % 7), 41] } })
        misure.push({ ...base, id: id(), strumento_id: sCiras.id, ora: '10:00', valori: { [pA.id]: [12], [pGs.id]: [0.3], [pE.id]: [2], [pCi.id]: [300] } })
        misure.push({
          ...base, id: id(), strumento_id: sFeno.id, ora: '11:00', valori: {
            [altezzaF.id]: [30 + (k % 5)], [noteP.id]: 'ok', [vigoroso.id]: k % 2 === 0,
            [palchi.id]: [{ n: 1, valori: { fiori: 2, lung: 3 } }, { n: 2, valori: { fiori: 1, lung: 2 } }],
          },
        })
      }
    }
    expect(misure).toHaveLength(18_000)
    const inizio = performance.now()
    const c = costruisciCartella({ config, misure, note: noteDiProva(), scelta: SCELTA_TUTTO, oggi: OGGI, adesso: ADESSO, ultimaData: null })
    const durata = performance.now() - inizio
    expect(foglio(c, 'Dati').righe).toHaveLength(6000)
    expect(foglio(c, 'Misure').righe).toHaveLength(6000 * (2 + 4 + 3))
    expect(foglio(c, 'Palchi').righe).toHaveLength(12_000)
    expect(foglio(c, 'Medie').righe).toHaveLength(120)
    expect(durata).toBeLessThan(1000)
  })
})
