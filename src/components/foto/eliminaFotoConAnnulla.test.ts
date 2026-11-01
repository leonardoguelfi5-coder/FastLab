import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/api/foto', () => ({ eliminaFoto: vi.fn(), listaFoto: vi.fn(), spazioFoto: vi.fn(), urlFoto: vi.fn(), VALIDITA_URL_SECONDI: 3600 }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(() => 'id-toast'), { error: vi.fn(), dismiss: vi.fn(), warning: vi.fn() }) }))

import { toast } from 'sonner'
import { eliminaFoto } from '@/api/foto'
import { chiavi } from '@/api/query'
import type { Foto } from '@/domain/tipi'
import { ATTESA_ANNULLA_MS, inEliminazione } from '@/lib/eliminaConAnnulla'
import { OPZIONI_ERRORE_TARDIVO } from '@/lib/toastErrore'
import { chiaveEliminazioneFoto, eliminaFotoConAnnulla } from './eliminaFotoConAnnulla'

const E = 'E'
const foto = (id: string): Foto => ({
  id, data: '2026-10-28', percorso: `E/${id}.jpg`, larghezza: 1, altezza: 1, byte: 1, pianta_id: null, nota_id: null, archiviata: false,
})
const elenco = () => [foto('a'), foto('b'), foto('c')]

let client: QueryClient
const inCache = () => client.getQueryData<Foto[]>(chiavi.foto(E))?.map(f => f.id)

function azioneAnnulla() {
  const [, opzioni] = vi.mocked(toast).mock.calls.at(-1) as unknown as [string, { action: { label: string; onClick: () => void } }]
  return opzioni.action.onClick
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  client = new QueryClient()
  client.setQueryData(chiavi.foto(E), elenco())
  vi.mocked(eliminaFoto).mockResolvedValue({ fileRimosso: true })
})
afterEach(async () => {
  await vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS)
  vi.useRealTimers()
})

describe('eliminaFotoConAnnulla', () => {
  it('toglie subito la foto dalla galleria e mostra «Foto eliminata.» con Annulla, senza toccare il database', () => {
    eliminaFotoConAnnulla(client, E, foto('b'))
    expect(inCache()).toEqual(['a', 'c'])
    expect(toast).toHaveBeenCalledWith('Foto eliminata.', expect.objectContaining({ duration: ATTESA_ANNULLA_MS }))
    expect(eliminaFoto).not.toHaveBeenCalled()
    expect(inEliminazione(chiaveEliminazioneFoto('b'))).toBe(true)
  })

  it('Annulla rimette la foto dov\'era e non elimina mai', async () => {
    eliminaFotoConAnnulla(client, E, foto('b'))
    azioneAnnulla()()
    expect(inCache()).toEqual(['a', 'b', 'c'])
    await vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS * 2)
    expect(eliminaFoto).not.toHaveBeenCalled()
    expect(inEliminazione(chiaveEliminazioneFoto('b'))).toBe(false)
  })

  it('allo scadere elimina davvero (riga e file) e rilegge le foto: anche lo spazio, che sta sotto la stessa chiave', async () => {
    const invalida = vi.spyOn(client, 'invalidateQueries')
    eliminaFotoConAnnulla(client, E, foto('b'))
    await vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS)
    expect(eliminaFoto).toHaveBeenCalledWith(E, foto('b'))
    expect(invalida).toHaveBeenCalledWith({ queryKey: chiavi.foto(E) })
    expect(toast.warning).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('se il file non si è tolto avvisa, senza verde e senza promettere che sia stato rimosso', async () => {
    vi.mocked(eliminaFoto).mockResolvedValue({ fileRimosso: false })
    eliminaFotoConAnnulla(client, E, foto('b'))
    await vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS)

    expect(toast.warning).toHaveBeenCalledTimes(1)
    const [testo, opzioni] = vi.mocked(toast.warning).mock.calls[0]
    expect(testo).toMatch(/^Foto eliminata, ma il suo file è rimasto nello spazio delle foto/)
    expect(testo).not.toMatch(/rimosso|tolto/)
    expect(opzioni).toEqual(OPZIONI_ERRORE_TARDIVO)
    // La riga è andata: la foto non ricompare.
    expect(inCache()).toEqual(['a', 'c'])
  })

  it('se l\'eliminazione fallisce la foto ricompare al suo posto con un errore che resta', async () => {
    vi.mocked(eliminaFoto).mockRejectedValue(new Error('Il server non risponde.'))
    eliminaFotoConAnnulla(client, E, foto('b'))
    await vi.advanceTimersByTimeAsync(ATTESA_ANNULLA_MS)

    expect(inCache()).toEqual(['a', 'b', 'c'])
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('La foto non è stata eliminata'), OPZIONI_ERRORE_TARDIVO)
    expect(toast.warning).not.toHaveBeenCalled()
    expect(inEliminazione(chiaveEliminazioneFoto('b'))).toBe(false)
  })

  it('ferma una lettura in corso dell\'elenco, che potrebbe riportare la foto che sta per sparire', () => {
    const ferma = vi.spyOn(client, 'cancelQueries')
    eliminaFotoConAnnulla(client, E, foto('b'))
    expect(ferma).toHaveBeenCalledWith({ queryKey: chiavi.foto(E) })
  })
})
