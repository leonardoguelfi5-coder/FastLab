import { describe, expect, it, vi } from 'vitest'

// Il chunk di exceljs che non arriva (rete assente, versione dell'app cambiata sotto i piedi): l'import dinamico lancia.
vi.mock('exceljs', () => { throw new Error('Failed to fetch dynamically imported module') })

import { ErroreApp, messaggioErrore } from '@/lib/errori'
import { EXCEL_NON_CARICATO, scriviCartella } from './scriviXlsx'

describe('scriviCartella senza il chunk di exceljs', () => {
  it('dice di ricaricare la pagina, con un messaggio dell\'app', async () => {
    const cartella = { nomeFile: 'x.xlsx', fogli: [], grafici: [], strumenti: [], intervallo: { da: null, a: null } }
    const errore = await scriviCartella(cartella, new Map()).catch((e: unknown) => e)
    expect(errore).toBeInstanceOf(ErroreApp)
    expect(EXCEL_NON_CARICATO).toBe('Non riesco a preparare l\'Excel: ricarica la pagina e riprova.')
    expect((errore as Error).message).toBe(EXCEL_NON_CARICATO)
    // con la rete presente il messaggio passa così com'è (non "Il server non risponde")
    expect(messaggioErrore(errore)).toBe(EXCEL_NON_CARICATO)
  })
})
