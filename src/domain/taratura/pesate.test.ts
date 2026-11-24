import { describe, expect, it } from 'vitest'
import { SENZA_SUBSTRATO } from '@/domain/pesatura/curva'
import type { CampionePesatura, Peso, TipoPeso } from '@/domain/pesatura/tipi'
import { nomeDelVaso, pesateDeiVasi } from './pesate'

const campione = (id: string, substrato: string | null, ordine: number): CampionePesatura => ({
  id, sessione_id: 'S', pianta_id: null, nome: id, substrato, ordine,
})
const peso = (id: string, campione_id: string, tipo: TipoPeso, valore: number, misurato_il: string, replica = 1): Peso => ({
  id, campione_id, replica, tipo, valore, lettura: tipo === 'secco' ? null : 10, misurato_il, creato_da: 'io',
})

describe('pesateDeiVasi', () => {
  it('raggruppa per substrato nell\'ordine dei campioni; senza substrato va in SENZA_SUBSTRATO', () => {
    const gruppi = pesateDeiVasi(
      [campione('V3', null, 3), campione('V2', 'Perlite', 2), campione('V1', 'Torba', 1), campione('V4', 'Torba', 4)],
      [],
    )
    expect(gruppi.map(g => g.substrato)).toEqual(['Torba', 'Perlite', SENZA_SUBSTRATO])
    expect(gruppi[0].vasi.map(v => v.campione.id)).toEqual(['V1', 'V4'])
    expect(gruppi[2].vasi.map(v => v.campione.id)).toEqual(['V3'])
  })

  it('un substrato di soli spazi va in SENZA_SUBSTRATO, come in curvePerSubstrato', () => {
    expect(pesateDeiVasi([campione('V1', '  ', 1)], [])[0].substrato).toBe(SENZA_SUBSTRATO)
  })

  it('secco e CC del vaso; i punti in ordine di misurato_il, confrontato come data', () => {
    const pesi = [
      peso('a3', 'V1', 'asciugatura', 3210, '2026-11-12T10:00:00+02:00'), // 08:00 UTC del 12
      peso('a1', 'V1', 'asciugatura', 4030, '2026-11-12T09:00:00Z'),
      peso('a0', 'V1', 'asciugatura', 4400, '2026-11-12T07:30:00Z'),
      peso('s', 'V1', 'secco', 750, '2026-11-10T10:00:00Z'),
      peso('c', 'V1', 'capacita_campo', 4850, '2026-11-11T10:00:00Z'),
    ]
    const [{ vasi: [v] }] = pesateDeiVasi([campione('V1', 'Torba', 1)], pesi)
    expect(v.secco?.id).toBe('s')
    expect(v.cc?.id).toBe('c')
    expect(v.punti.map(p => p.id)).toEqual(['a0', 'a3', 'a1'])
  })

  it('i pesi di replica 2 si ignorano; un vaso senza pesi ha secco e CC null e nessun punto', () => {
    const pesi = [
      peso('s2', 'V1', 'secco', 700, '2026-11-10T10:00:00Z', 2),
      peso('c2', 'V1', 'capacita_campo', 4800, '2026-11-11T10:00:00Z', 2),
      peso('a2', 'V1', 'asciugatura', 4000, '2026-11-12T10:00:00Z', 2),
    ]
    const [{ vasi }] = pesateDeiVasi([campione('V1', 'Torba', 1), campione('V2', 'Torba', 2)], pesi)
    for (const v of vasi) expect(v).toMatchObject({ secco: null, cc: null, punti: [] })
  })

  it('i pesi di un altro vaso non si mescolano', () => {
    const pesi = [peso('s', 'V2', 'secco', 750, '2026-11-10T10:00:00Z')]
    const [{ vasi }] = pesateDeiVasi([campione('V1', 'Torba', 1), campione('V2', 'Torba', 2)], pesi)
    expect(vasi[0].secco).toBeNull()
    expect(vasi[1].secco?.id).toBe('s')
  })
})

describe('nomeDelVaso', () => {
  it('il nome del campione, senza spazi ai lati', () => {
    expect(nomeDelVaso({ ...campione('V1', 'Torba', 4), nome: '  T1 ' })).toBe('T1')
  })
  it('senza nome (assente, vuoto o di soli spazi) è «Vaso» e la posizione', () => {
    expect(nomeDelVaso({ ...campione('V1', 'Torba', 4), nome: null })).toBe('Vaso 4')
    expect(nomeDelVaso({ ...campione('V1', 'Torba', 4), nome: '   ' })).toBe('Vaso 4')
  })
})
