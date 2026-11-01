import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/foto', () => ({ listaFoto: vi.fn(), urlFoto: vi.fn(), archiviaFileFoto: vi.fn(), fileFotoPresenti: vi.fn() }))
vi.mock('@/api/note', () => ({ listaNote: vi.fn() }))
// Il chunk della libreria non si carica (rete assente, app aggiornata sotto i piedi).
vi.mock('fflate', () => { throw new Error('Failed to fetch dynamically imported module') })

import { fileFotoPresenti, listaFoto } from '@/api/foto'
import { listaNote } from '@/api/note'
import type { ConfigEsperimento } from '@/domain/tipi'
import { messaggioErrore } from '@/lib/errori'
import { scaricaArchivio } from './archivioFoto'
import { useArchivioSessione } from './archivioSessione'

const E = 'e0000000-0000-4000-8000-000000000001'
const config = {
  esperimento: { id: E, nome: 'Prova', data_inizio: null, note: '', stato: 'concluso' },
  fattori: [], parametri: [], strumenti: [], trattamenti: [], piante: [],
} as ConfigEsperimento

beforeEach(() => {
  useArchivioSessione.setState({ scaricati: {} })
  vi.mocked(listaFoto).mockResolvedValue([{
    id: 'a', data: '2026-10-28', percorso: `${E}/a.jpg`, larghezza: 1, altezza: 1, byte: 1, pianta_id: null, nota_id: null,
    archiviata: false, archiviata_il: null,
  }])
  vi.mocked(listaNote).mockResolvedValue([])
  vi.mocked(fileFotoPresenti).mockResolvedValue(new Set(['a.jpg']))
  vi.stubGlobal('fetch', vi.fn())
})

describe('scaricaArchivio: la libreria non si carica', () => {
  it('lo dice con un messaggio chiaro, prima di scaricare qualsiasi foto, e non segna nessun download', async () => {
    const errore = await scaricaArchivio({ espId: E, config, onProgresso: () => {} }).catch((e: unknown) => e)
    expect(messaggioErrore(errore)).toBe('Non riesco a preparare lo .zip: ricarica la pagina e riprova.')
    expect(fetch).not.toHaveBeenCalled()
    expect(useArchivioSessione.getState().scaricati[E]).toBeUndefined()
  })
})
