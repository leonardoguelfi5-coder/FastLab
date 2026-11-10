import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(() => 'id-toast'), { error: vi.fn(), dismiss: vi.fn() }) }))

import { toast } from 'sonner'
import { ATTESA_ANNULLA_MS, eliminaConAnnulla, inEliminazione } from './eliminaConAnnulla'

/** Una richiesta di prova con funzioni finte; `elimina` riesce se non diversamente detto. */
function richiesta(extra: Partial<Parameters<typeof eliminaConAnnulla>[0]> = {}) {
  return {
    chiave: 'nota:1', messaggio: 'Nota eliminata.', fallita: 'La nota non è stata eliminata',
    nascondi: vi.fn(), ripristina: vi.fn(), elimina: vi.fn().mockResolvedValue(undefined), dopo: vi.fn(),
    ...extra,
  }
}

/** L'azione "Annulla" del toast mostrato per ultimo. */
function azioneAnnulla() {
  const [, opzioni] = vi.mocked(toast).mock.calls.at(-1) as unknown as [string, { action: { label: string; onClick: () => void } }]
  expect(opzioni.action.label).toBe('Annulla')
  return opzioni.action.onClick
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})
// Lo stato in attesa è del modulo: ogni test lo lascia vuoto, facendo scadere ciò che ha lasciato in sospeso.
afterEach(async () => {
  await vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS)
  vi.useRealTimers()
})

describe('eliminaConAnnulla', () => {
  it('toglie subito l\'elemento dalla vista e mostra il toast con "Annulla" per 5 secondi, senza eliminare nulla', () => {
    const r = richiesta()
    eliminaConAnnulla(r)
    expect(r.nascondi).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledWith('Nota eliminata.', expect.objectContaining({ duration: ATTESA_ANNULLA_MS }))
    expect(ATTESA_ANNULLA_MS).toBe(5000)
    expect(r.elimina).not.toHaveBeenCalled()
    expect(inEliminazione('nota:1')).toBe(true)
  })

  it('"Annulla" rimette l\'elemento e non elimina mai, nemmeno allo scadere dei 5 secondi', async () => {
    const r = richiesta()
    eliminaConAnnulla(r)
    azioneAnnulla()()
    expect(r.ripristina).toHaveBeenCalledTimes(1)
    expect(inEliminazione('nota:1')).toBe(false)
    await vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS * 3)
    expect(r.elimina).not.toHaveBeenCalled()
    expect(r.dopo).not.toHaveBeenCalled()
  })

  it('allo scadere dei 5 secondi elimina davvero, chiude il toast e poi chiama `dopo`', async () => {
    const r = richiesta()
    eliminaConAnnulla(r)
    await vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS - 1)
    expect(r.elimina).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(r.elimina).toHaveBeenCalledTimes(1)
    expect(toast.dismiss).toHaveBeenCalledWith('id-toast')
    expect(r.dopo).toHaveBeenCalledTimes(1)
    expect(r.ripristina).not.toHaveBeenCalled()
    expect(inEliminazione('nota:1')).toBe(false)
  })

  it('se l\'eliminazione fallisce l\'elemento ricompare, con un errore che resta finché non lo si chiude', async () => {
    const r = richiesta({ elimina: vi.fn().mockRejectedValue(new Error('rete')) })
    eliminaConAnnulla(r)
    await vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS)
    expect(r.ripristina).toHaveBeenCalledTimes(1)
    expect(r.dopo).not.toHaveBeenCalled()
    const [messaggio, opzioni] = vi.mocked(toast.error).mock.calls[0] as unknown as [string, { duration: number }]
    expect(messaggio).toContain('La nota non è stata eliminata')
    expect(opzioni.duration).toBe(Infinity)
    expect(inEliminazione('nota:1')).toBe(false)
  })

  it('"Annulla" dopo che l\'eliminazione è partita non fa nulla', async () => {
    const r = richiesta()
    eliminaConAnnulla(r)
    const annulla = azioneAnnulla()
    await vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS)
    annulla()
    expect(r.ripristina).not.toHaveBeenCalled()
    expect(r.elimina).toHaveBeenCalledTimes(1)
  })

  it('un secondo tocco sulla stessa cosa mentre è in attesa non crea una seconda eliminazione', async () => {
    const r = richiesta()
    eliminaConAnnulla(r)
    eliminaConAnnulla(r)
    expect(r.nascondi).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS)
    expect(r.elimina).toHaveBeenCalledTimes(1)
  })

  it('chiudere il toast (gesto o chiusura automatica) esegue subito l\'eliminazione, una volta sola', async () => {
    const r = richiesta()
    eliminaConAnnulla(r)
    const [, opzioni] = vi.mocked(toast).mock.calls[0] as unknown as [string, { onDismiss: () => void; onAutoClose: () => void }]
    opzioni.onDismiss()
    opzioni.onAutoClose()
    await vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS)
    expect(r.elimina).toHaveBeenCalledTimes(1)
  })

  it('"Annulla" che chiude il toast non lo fa passare per un\'eliminazione', async () => {
    const r = richiesta()
    eliminaConAnnulla(r)
    const [, opzioni] = vi.mocked(toast).mock.calls[0] as unknown as [string, { onDismiss: () => void }]
    azioneAnnulla()()
    opzioni.onDismiss()
    await vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS)
    expect(r.elimina).not.toHaveBeenCalled()
  })

  it('finché c\'è un\'eliminazione in attesa il browser chiede conferma prima di chiudere la scheda; poi no', async () => {
    const r = richiesta()
    eliminaConAnnulla(r)
    const prima = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(prima)
    expect(prima.defaultPrevented).toBe(true)
    await vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS)
    const dopo = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dopo)
    expect(dopo.defaultPrevented).toBe(false)
  })

  it('più elementi in attesa insieme sono indipendenti: se ne annulla uno, l\'altro si elimina', async () => {
    const a = richiesta({ chiave: 'nota:a' })
    const b = richiesta({ chiave: 'nota:b' })
    eliminaConAnnulla(a)
    const annullaA = azioneAnnulla()
    eliminaConAnnulla(b)
    annullaA()
    await vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS)
    expect(a.elimina).not.toHaveBeenCalled()
    expect(b.elimina).toHaveBeenCalledTimes(1)
  })
})
