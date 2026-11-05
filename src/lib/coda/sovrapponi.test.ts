import { describe, expect, it } from 'vitest'
import { statiPiante } from '@/domain/giro'
import { parametro, piante } from '@/domain/test-helpers'
import type { Misura, Strumento } from '@/domain/tipi'
import type { VoceCoda } from './codaMisure'
import { conCoda, piuRecentiPrima, perOraCrescente } from './sovrapponi'

const misura = (id: string, extra: Partial<Misura> = {}): Misura => ({
  id, pianta_id: 'p1', strumento_id: 's1', data_rilievo: '2026-10-28', ora: '09:00', valori: {}, ...extra,
})
const voce = (m: Misura, extra: Partial<VoceCoda> = {}): VoceCoda => ({
  misura: m, espId: 'E', utente: 'u1', accodataIl: '2026-10-28T09:00:00Z', tentativi: 0, prossimoTentativo: null,
  stato: 'attesa', errore: null, revisione: 'r', forseSulServer: false, etichetta: '1', strumento: 'SPAD', ...extra,
})
const delGiorno = (m: Misura) => m.data_rilievo === '2026-10-28'

describe('conCoda', () => {
  it('senza voci che riguardano l\'elenco dà lo stesso array (nessun disegno in più)', () => {
    const server = [misura('a')]
    expect(conCoda(server, [], delGiorno)).toBe(server)
    expect(conCoda(server, [voce(misura('x', { data_rilievo: '2026-10-27' }))], delGiorno)).toBe(server)
  })

  it('stesso id: vince la coda; le voci che passano il filtro e mancano si aggiungono', () => {
    const server = [misura('a', { ora: '08:00' }), misura('b', { ora: '09:00', valori: { v: [1] } })]
    const voci = [voce(misura('b', { ora: '09:00', valori: { v: [2] } })), voce(misura('c', { ora: '10:00' }))]
    const risultato = conCoda(server, voci, delGiorno, perOraCrescente)
    expect(risultato.map(m => m.id)).toEqual(['a', 'b', 'c'])
    expect(risultato[1].valori).toEqual({ v: [2] })
  })

  it('una correzione in coda che sposta la misura a un altro giorno la toglie da questo', () => {
    const server = [misura('a'), misura('b')]
    const voci = [voce(misura('b', { data_rilievo: '2026-10-27' }))]
    expect(conCoda(server, voci, delGiorno).map(m => m.id)).toEqual(['a'])
  })

  it('ordina con l\'ordine dato: le misure di una pianta dalla più recente', () => {
    const server = [misura('b', { data_rilievo: '2026-10-28', ora: '09:00' }), misura('a', { data_rilievo: '2026-10-27', ora: '18:00' })]
    const voci = [voce(misura('c', { data_rilievo: '2026-10-28', ora: '10:30' }))]
    expect(conCoda(server, voci, m => m.pianta_id === 'p1', piuRecentiPrima).map(m => m.id)).toEqual(['c', 'b', 'a'])
  })

  it('una rilettura del server che non ha ancora la misura in coda non rende "da fare" la pianta appena misurata', () => {
    const spad = parametro('SPAD')
    const [p1, p2] = piante(['1', '2'])
    const strumento: Strumento = {
      id: 's1', nome: 'SPAD', icona: null, tipo: 'strumento', ordine: 0, archiviato: false, catalogo_id: null,
      parametri: [{ parametro_id: spad.id, ordine: 0, obbligatorio: true }],
    }
    const inCoda = voce(misura('m1', { pianta_id: p1.id, valori: { [spad.id]: [38.1] } }))
    // Il server riletto non ha ancora la misura (è in coda): l'elenco sovrapposto sì.
    const riletto: Misura[] = []
    const stati = statiPiante(strumento, [spad], conCoda(riletto, [inCoda], delGiorno), [p1, p2])
    expect(stati.get(p1.id)).toBe('fatta')
    expect(stati.get(p2.id)).toBe('da_fare')
  })
})
