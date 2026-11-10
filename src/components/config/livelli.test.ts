import { describe, expect, it } from 'vitest'
import { fattore } from '@/domain/test-helpers'
import { conLivelliInSospeso, conLivello, livelloAggiungibile, livelloDoppio } from './livelli'

describe('livelli', () => {
  const stress = fattore('Stress', ['Controllo', 'S1'])

  it('un livello doppio si riconosce senza badare a spazi e maiuscole', () => {
    expect(livelloDoppio(stress, ' s1 ')).toBe(true)
    expect(livelloDoppio(stress, 'W1')).toBe(false)
    expect(livelloDoppio(stress, '  ')).toBe(false)
  })

  it('si può aggiungere solo un livello non vuoto e nuovo', () => {
    expect(livelloAggiungibile(stress, 'W1')).toBe(true)
    expect(livelloAggiungibile(stress, ' ')).toBe(false)
    expect(livelloAggiungibile(stress, 'CONTROLLO')).toBe(false)
  })

  it('conLivello aggiunge in fondo con il nome ripulito, senza toccare l\'originale', () => {
    const nuovo = conLivello(stress, ' W1 ')
    expect(nuovo?.livelli.map(l => [l.nome, l.ordine])).toEqual([['Controllo', 0], ['S1', 1], ['W1', 2]])
    expect(stress.livelli).toHaveLength(2)
    expect(conLivello(stress, 's1')).toBeNull()
  })

  it('conLivelliInSospeso aggiunge quelli validi e lascia scritti gli altri', () => {
    const hc = fattore('Hydrochar', ['No'])
    const vuoto = fattore('Concime', [])
    const { fattori, testi } = conLivelliInSospeso([stress, hc, vuoto], { [stress.id]: 'W1', [hc.id]: 'no', [vuoto.id]: '' })
    expect(fattori.map(f => f.livelli.map(l => l.nome))).toEqual([['Controllo', 'S1', 'W1'], ['No'], []])
    expect(fattori[1]).toBe(hc)
    expect(testi).toEqual({ [hc.id]: 'no' })
  })
})
