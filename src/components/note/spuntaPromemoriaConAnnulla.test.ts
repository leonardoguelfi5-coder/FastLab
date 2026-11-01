import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/api/note', () => ({ listaNote: vi.fn(), segnaFatto: vi.fn(), eliminaNota: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(() => 'id-toast'), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }) }))

import { toast } from 'sonner'
import { segnaFatto } from '@/api/note'
import { chiavi } from '@/api/query'
import type { Nota } from '@/domain/tipi'
import { ATTESA_ANNULLA_MS, inEliminazione } from '@/lib/eliminaConAnnulla'
import { spuntaNota } from './spuntaNota'
import { chiaveSpuntaPromemoria, spuntaPromemoriaConAnnulla } from './spuntaPromemoriaConAnnulla'

const nota = (id: string): Nota => ({
  id, data: '2026-10-28', testo: id, promemoria: true, fatto_il: null, pianta_ids: [], trattamento_ids: [],
})

let client: QueryClient
const note = () => client.getQueryData<Nota[]>(chiavi.note('E'))!

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.mocked(segnaFatto).mockResolvedValue(undefined)
  client = new QueryClient()
  client.setQueryData(chiavi.note('E'), [nota('a'), nota('b')])
})

afterEach(async () => {
  await vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS * 2)
  vi.useRealTimers()
})

describe('spuntaPromemoriaConAnnulla', () => {
  it('segna subito la nota fatta nella cache, ma scrive nel database solo allo scadere dei 5 secondi', async () => {
    spuntaPromemoriaConAnnulla(client, 'E', nota('a'))
    expect(note().find(n => n.id === 'a')!.fatto_il).not.toBeNull()
    expect(note().find(n => n.id === 'b')!.fatto_il).toBeNull()
    expect(inEliminazione(chiaveSpuntaPromemoria('a'))).toBe(true)
    expect(segnaFatto).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS)
    expect(segnaFatto).toHaveBeenCalledExactlyOnceWith('E', 'a', true)
    expect(inEliminazione(chiaveSpuntaPromemoria('a'))).toBe(false)
  })

  it('la chiave è distinta da quella dell\'eliminazione della nota', () => {
    expect(chiaveSpuntaPromemoria('a')).not.toBe('nota:a')
  })

  it('"Annulla" rimette la nota da fare e non scrive mai nulla', async () => {
    spuntaPromemoriaConAnnulla(client, 'E', nota('a'))
    const [, opzioni] = vi.mocked(toast).mock.calls.at(-1) as unknown as [string, { action: { onClick: () => void } }]
    opzioni.action.onClick()
    expect(note().find(n => n.id === 'a')!.fatto_il).toBeNull()
    expect(inEliminazione(chiaveSpuntaPromemoria('a'))).toBe(false)
    await vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS * 2)
    expect(segnaFatto).not.toHaveBeenCalled()
  })

  it('se il salvataggio fallisce la nota torna da fare e l\'errore resta in vista', async () => {
    vi.mocked(segnaFatto).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    spuntaPromemoriaConAnnulla(client, 'E', nota('a'))
    await vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS)
    expect(note().find(n => n.id === 'a')!.fatto_il).toBeNull()
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Il promemoria non è stato segnato come fatto'), expect.objectContaining({ duration: Infinity }),
    )
  })

  it('una seconda spunta dal Diario, con l\'Annulla ancora aperto, non fa nulla: la scavalcherebbe il salvataggio in attesa', async () => {
    spuntaPromemoriaConAnnulla(client, 'E', nota('a'))
    const fatta = note().find(n => n.id === 'a')!
    await spuntaNota(client, 'E', fatta)
    // Nessuna riapertura nel database, e la nota resta fatta in cache.
    expect(segnaFatto).not.toHaveBeenCalled()
    expect(note().find(n => n.id === 'a')!.fatto_il).not.toBeNull()
  })

  it('quel tocco che non fa nulla non è muto: un messaggio dice che per riaprirlo serve «Annulla»', async () => {
    spuntaPromemoriaConAnnulla(client, 'E', nota('a'))
    vi.mocked(toast).mockClear()
    await spuntaNota(client, 'E', note().find(n => n.id === 'a')!)
    expect(toast).toHaveBeenCalledExactlyOnceWith('Il promemoria è appena stato segnato fatto: per riaprirlo tocca «Annulla».')
  })

  it('una rilettura che riscrive la cache durante l\'attesa non riapre il promemoria: dopo il salvataggio torna fatto', async () => {
    spuntaPromemoriaConAnnulla(client, 'E', nota('a'))
    // Una lettura partita prima della spunta, finita durante i 5 secondi: il server non sa ancora nulla.
    client.setQueryData(chiavi.note('E'), [nota('a'), nota('b')])
    expect(note().find(n => n.id === 'a')!.fatto_il).toBeNull()

    await vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS)

    expect(segnaFatto).toHaveBeenCalledExactlyOnceWith('E', 'a', true)
    expect(note().find(n => n.id === 'a')!.fatto_il).not.toBeNull()
  })
})
