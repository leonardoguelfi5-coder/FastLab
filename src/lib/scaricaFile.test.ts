import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ATTESA_REVOCA_MS, consegna } from './scaricaFile'

let scaricati: { download: string; href: string; vistoNelDocumento: boolean }[]

beforeEach(() => {
  vi.useFakeTimers()
  scaricati = []
  // Il click non scarica nulla in jsdom: si registra quello che il link dice al browser, e se in quel momento è nel documento.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    scaricati.push({ download: this.download, href: this.href, vistoNelDocumento: document.body.contains(this) })
  })
  URL.createObjectURL = vi.fn(() => 'blob:file') as never
  URL.revokeObjectURL = vi.fn() as never
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('consegna', () => {
  it('crea un link con download e il nome del file sul Blob, lo clicca una volta e lo toglie dal documento', () => {
    const blob = new Blob(['ciao'], { type: 'text/plain' })

    consegna(blob, 'FastLab_prova.xlsx')

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
    expect(scaricati).toEqual([{ download: 'FastLab_prova.xlsx', href: 'blob:file', vistoNelDocumento: true }])
    expect(document.querySelector('a[download]')).toBeNull()
  })

  it('libera l\'indirizzo del Blob solo dopo 30 secondi (Safari su iPhone non farebbe in tempo a leggerlo)', () => {
    consegna(new Blob(['x']), 'a.zip')

    expect(ATTESA_REVOCA_MS).toBe(30_000)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(29_999)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:file')
  })

  it('due consegne di seguito non si pestano i piedi: ognuna libera il suo indirizzo', () => {
    vi.mocked(URL.createObjectURL).mockReturnValueOnce('blob:uno').mockReturnValueOnce('blob:due')

    consegna(new Blob(['1']), 'uno.xlsx')
    vi.advanceTimersByTime(10_000)
    consegna(new Blob(['2']), 'due.xlsx')
    vi.advanceTimersByTime(20_000)

    expect(vi.mocked(URL.revokeObjectURL).mock.calls).toEqual([['blob:uno']])
    vi.advanceTimersByTime(10_000)
    expect(vi.mocked(URL.revokeObjectURL).mock.calls).toEqual([['blob:uno'], ['blob:due']])
    expect(scaricati.map(s => s.download)).toEqual(['uno.xlsx', 'due.xlsx'])
  })
})
