import { describe, expect, it } from 'vitest'
import { descriviMisure, spiegaConMisure, testoConfermaElimina } from './conteggi'

describe('descriviMisure', () => {
  it('quante misure, di quante piante, tra quali date (giorno e mese nello stesso anno)', () => {
    expect(descriviMisure({ misure: 312, piante: 56, prima: '2026-10-14', ultima: '2026-11-03' }))
      .toBe('312 misure di 56 piante, dal 14/10 al 03/11')
  })

  it('al singolare e in un giorno solo', () => {
    expect(descriviMisure({ misure: 1, piante: 1, prima: '2026-10-07', ultima: '2026-10-07' }))
      .toBe('1 misura di 1 pianta, il 07/10')
  })

  it('il punto delle migliaia, e l\'anno quando le date sono di anni diversi', () => {
    expect(descriviMisure({ misure: 3120, piante: 2, prima: '2025-12-20', ultima: '2026-01-10' }))
      .toBe('3.120 misure di 2 piante, dal 20/12/2025 al 10/01/2026')
  })
})

describe('spiegaConMisure', () => {
  const c = { misure: 312, piante: 56, prima: '2026-10-14', ultima: '2026-11-03' }

  it('uno strumento attivo: quante misure, perché non si elimina, e che si può archiviare', () => {
    expect(spiegaConMisure(c, 'strumento'))
      .toBe('Ha 312 misure di 56 piante, dal 14/10 al 03/11: non si può eliminare. Puoi archiviarlo: le misure restano.')
  })

  it('uno strumento già archiviato non si archivia di nuovo: le misure restano', () => {
    expect(spiegaConMisure(c, 'archiviato')).toBe(
      'Ha 312 misure di 56 piante, dal 14/10 al 03/11: non si può eliminare. '
      + 'È già archiviato: le misure restano nella storia delle piante e nell\'export.',
    )
  })

  it('la tabella fenologica non si archivia: si archiviano le sue voci', () => {
    expect(spiegaConMisure(c, 'tabella')).toMatch(/^Ha 312 misure .*: non si può eliminare\. Le voci .* si archiviano/)
  })
})

describe('testoConfermaElimina', () => {
  it('dice che non ha misure, quali valori se ne vanno con lui, e che non si torna indietro', () => {
    expect(testoConfermaElimina(false, ['SPAD']))
      .toBe('Lo strumento non ha misure. Si eliminano anche i suoi valori (SPAD): non hanno dati. L\'operazione non si può annullare.')
    expect(testoConfermaElimina(true, [])).toBe('La tabella non ha misure. L\'operazione non si può annullare.')
  })
})
