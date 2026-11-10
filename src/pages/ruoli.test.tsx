import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

// L'interfaccia per ruolo (Piano E, Task E10): vere pagine e vera cache, livello API finto.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/api/auth', () => ({ accedi: vi.fn(), registrati: vi.fn(), esci: vi.fn(), useSessione: vi.fn() }))
vi.mock('@/api/inviti', () => ({ sonoAdmin: vi.fn(), listaInviti: vi.fn(), creaInvito: vi.fn(), revocaInvito: vi.fn() }))
vi.mock('@/api/esperimenti', () => ({ listaEsperimenti: vi.fn(), caricaConfig: vi.fn() }))
vi.mock('@/api/misure', () => ({
  misureDelGiorno: vi.fn(), misurePianta: vi.fn(), caricaMisura: vi.fn(), salvaMisura: vi.fn(), eliminaMisura: vi.fn(),
  ultimaMisuraPerStrumento: vi.fn(), ultimeMisurePiante: vi.fn(),
}))
vi.mock('@/api/note', () => ({ listaNote: vi.fn(), salvaNota: vi.fn(), eliminaNota: vi.fn(), segnaFatto: vi.fn() }))
vi.mock('@/api/foto', () => ({
  listaFoto: vi.fn(), urlFoto: vi.fn(), caricaFoto: vi.fn(), eliminaFoto: vi.fn(), aggiornaFoto: vi.fn(), VALIDITA_URL_SECONDI: 3600,
}))
vi.mock('@/api/persone', () => ({ ruoloIn: vi.fn(), membriDi: vi.fn() }))

import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { caricaConfig, listaEsperimenti } from '@/api/esperimenti'
import { caricaMisura, misureDelGiorno, misurePianta } from '@/api/misure'
import { listaNote } from '@/api/note'
import { listaFoto, urlFoto } from '@/api/foto'
import { ruoloIn } from '@/api/persone'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import type { ConfigEsperimento, Foto as FotoTipo, Misura, Nota } from '@/domain/tipi'
import { dimenticaLettureInAnticipo } from '@/lib/letturaInAnticipo'
import { Diario } from './Diario'
import { Esperimenti } from './Esperimenti'
import { FotoNota } from '@/components/note/FotoNota'
import { Foto } from './Foto'
import { HomeEsperimento } from './HomeEsperimento'
import { ModificaMisura } from './ModificaMisura'
import { SceltaStrumento } from './SceltaStrumento'
import { SchedaPianta } from './SchedaPianta'

const IO = 'utente-io'
const ALTRO = 'utente-altro'
const SESSIONE = { user: { id: IO, email: 'io@example.it' } } as Session

let config: ConfigEsperimento
const strumento = () => config.strumenti.find(s => s.nome === 'SPAD')!

function misura(id: string, creatoDa: string): Misura {
  const pp = strumento().parametri[0]
  return { id, pianta_id: config.piante[0].id, strumento_id: strumento().id, data_rilievo: '2026-10-28', ora: '09:12', valori: { [pp.parametro_id]: [40] }, creato_da: creatoDa }
}
const nota = (id: string, creatoDa: string, extra: Partial<Nota> = {}): Nota =>
  ({ id, data: '2026-10-28', testo: `Nota ${id}`, promemoria: false, fatto_il: null, pianta_ids: [], trattamento_ids: [], creato_da: creatoDa, ...extra })
const foto = (id: string, creatoDa: string): FotoTipo => ({
  id, data: '2026-10-28', percorso: `E/${id}.jpg`, larghezza: 10, altezza: 10, byte: 10, pianta_id: null, nota_id: null,
  archiviata: false, archiviata_il: null, creato_da: creatoDa,
})

function apri(percorso: string, modello: string, elemento: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[percorso]}>
        <Routes>
          <Route path={modello} element={elemento} />
          <Route path="*" element={<p>altrove</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup({ delay: null })
}

beforeEach(() => {
  vi.clearAllMocks()
  dimenticaLettureInAnticipo()
  config = bozzaHydrochar(SEMI_CATALOGO)
  config.esperimento.id = 'E'
  vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(caricaConfig).mockImplementation(async () => structuredClone(config))
  vi.mocked(misureDelGiorno).mockResolvedValue([])
  vi.mocked(misurePianta).mockResolvedValue([])
  vi.mocked(listaNote).mockResolvedValue([])
  vi.mocked(listaFoto).mockResolvedValue([])
  vi.mocked(urlFoto).mockResolvedValue(new Map())
  vi.mocked(ruoloIn).mockResolvedValue('proprietario')
})

const home = () => apri('/esperimenti/E', '/esperimenti/:espId', <HomeEsperimento />)

describe('home per ruolo', () => {
  it.each(['proprietario', 'rilevatore'] as const)('%s ha "Nuova misura"', async ruolo => {
    vi.mocked(ruoloIn).mockResolvedValue(ruolo)
    home()
    expect(await screen.findByRole('link', { name: /^Nuova misura/ })).toBeInTheDocument()
    expect(screen.queryByText('Solo lettura')).not.toBeInTheDocument()
  })

  it('il lettore non ha "Nuova misura": la tessera dice "Solo lettura"', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('lettore')
    home()
    expect(await screen.findByText('Solo lettura')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Nuova misura/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Dataset/ })).toBeInTheDocument()
  })

  it('se il ruolo non si riesce a leggere (senza rete e senza copia) "Nuova misura" resta: il giro non si blocca', async () => {
    vi.mocked(ruoloIn).mockRejectedValue(new TypeError('Failed to fetch'))
    home()
    expect(await screen.findByRole('link', { name: /^Nuova misura/ })).toBeInTheDocument()
    await waitFor(() => expect(ruoloIn).toHaveBeenCalled())
    expect(screen.queryByText('Solo lettura')).not.toBeInTheDocument()
  })

  it('il ruolo si legge in anticipo, con la configurazione', async () => {
    home()
    await screen.findByRole('link', { name: /^Nuova misura/ })
    expect(ruoloIn).toHaveBeenCalledWith('E')
  })
})

describe('scelta dello strumento per ruolo', () => {
  it('il lettore trova una frase, non gli strumenti', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('lettore')
    apri('/esperimenti/E/misura', '/esperimenti/:espId/misura', <SceltaStrumento />)
    expect(await screen.findByText(/Solo lettura: in questo esperimento/)).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Strumenti' })).not.toBeInTheDocument()
  })
})

describe('scheda della pianta per ruolo', () => {
  const scheda = () => apri(`/esperimenti/E/piante/${config.piante[0].id}`, '/esperimenti/:espId/piante/:piantaId', <SchedaPianta />)

  it('il rilevatore misura, scrive note e aggiunge foto', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('rilevatore')
    scheda()
    expect(await screen.findByRole('button', { name: 'Misura questa pianta' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Aggiungi nota' })).toBeInTheDocument()
    expect(screen.getByText('Aggiungi foto', { exact: false })).toBeInTheDocument()
  })

  it('il lettore non ha "Misura questa pianta", "Aggiungi nota" né "Aggiungi foto": c\'è la frase', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('lettore')
    scheda()
    expect(await screen.findByText(/Solo lettura: in questo esperimento/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Misura questa pianta' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Aggiungi nota' })).not.toBeInTheDocument()
    expect(screen.queryByText('Aggiungi foto', { exact: false })).not.toBeInTheDocument()
  })

  it('ruolo ignoto: tutto resta, come per il proprietario', async () => {
    vi.mocked(ruoloIn).mockRejectedValue(new TypeError('Failed to fetch'))
    scheda()
    expect(await screen.findByRole('button', { name: 'Misura questa pianta' })).toBeInTheDocument()
  })
})

describe('modifica di una misura per ruolo', () => {
  const modifica = (m: Misura) => {
    vi.mocked(caricaMisura).mockResolvedValue(m)
    return apri(`/esperimenti/E/misure/${m.id}`, '/esperimenti/:espId/misure/:misuraId', <ModificaMisura />)
  }
  const ID = 'a0000000-0000-4000-8000-000000000001'

  it('il rilevatore corregge ed elimina la sua misura', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('rilevatore')
    modifica(misura(ID, IO))
    expect(await screen.findByRole('button', { name: 'Salva' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Elimina misura' })).toBeInTheDocument()
  })

  it('il rilevatore su una misura di un altro: sola lettura, senza "Salva" né "Elimina misura", e lo dice', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('rilevatore')
    modifica(misura(ID, ALTRO))
    expect(await screen.findByText(/è di un altro/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salva' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Elimina misura' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Ora')).toBeDisabled()
  })

  it('una misura senza autore (ancora in coda) è sua', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('rilevatore')
    const senza: Misura = misura(ID, IO)
    delete senza.creato_da
    modifica(senza)
    expect(await screen.findByRole('button', { name: 'Salva' })).toBeInTheDocument()
  })

  it('il proprietario corregge anche le misure degli altri', async () => {
    modifica(misura(ID, ALTRO))
    expect(await screen.findByRole('button', { name: 'Salva' })).toBeInTheDocument()
  })

  it('il lettore guarda soltanto', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('lettore')
    modifica(misura(ID, IO))
    expect(await screen.findByText(/Sei lettore/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salva' })).not.toBeInTheDocument()
  })
})

describe('diario per ruolo', () => {
  const diario = () => apri('/esperimenti/E/diario', '/esperimenti/:espId/diario', <Diario />)

  beforeEach(() => {
    vi.mocked(listaNote).mockResolvedValue([
      nota('mia', IO, { promemoria: true, data: '2026-12-31' }),
      nota('altrui', ALTRO, { promemoria: true, data: '2026-12-31' }),
    ])
  })

  it('il rilevatore: "Nuova nota", e Modifica, Elimina e spunta solo sulle sue', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('rilevatore')
    const utente = diario()
    expect(await screen.findByRole('button', { name: '+ Nuova nota' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('button', { name: /il promemoria del/ })).toHaveLength(1))
    await utente.click(screen.getByRole('button', { name: /Nota altrui/ }))
    expect(screen.queryByRole('button', { name: 'Modifica' })).not.toBeInTheDocument()
    await utente.click(screen.getByRole('button', { name: /Nota mia/ }))
    expect(screen.getByRole('button', { name: 'Modifica' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Elimina' })).toBeInTheDocument()
  })

  it('il lettore: niente "Nuova nota", niente spunta, niente Modifica ed Elimina; c\'è la frase', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('lettore')
    const utente = diario()
    expect(await screen.findByText(/Solo lettura: le note/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Nuova nota' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /il promemoria del/ })).not.toBeInTheDocument()
    await utente.click(screen.getByRole('button', { name: /Nota mia/ }))
    expect(screen.queryByRole('button', { name: 'Modifica' })).not.toBeInTheDocument()
  })

  it('il proprietario spunta anche i promemoria degli altri', async () => {
    diario()
    await waitFor(() => expect(screen.getAllByRole('button', { name: /il promemoria del/ })).toHaveLength(2))
  })
})

describe('foto per ruolo', () => {
  const galleria = () => apri('/esperimenti/E/foto', '/esperimenti/:espId/foto', <Foto />)

  it('il rilevatore aggiunge foto', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('rilevatore')
    galleria()
    expect(await screen.findByText('Aggiungi foto', { exact: false })).toBeInTheDocument()
  })

  it('il lettore non aggiunge foto: c\'è la frase', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('lettore')
    galleria()
    expect(await screen.findByText(/Solo lettura: le foto/)).toBeInTheDocument()
    expect(screen.queryByText('Aggiungi foto', { exact: false })).not.toBeInTheDocument()
  })

  it.each([['mia', IO, true], ['altrui', ALTRO, false]] as const)('il rilevatore, foto %s: "Elimina foto" %s', async (id, autore, elimina) => {
    vi.mocked(ruoloIn).mockResolvedValue('rilevatore')
    vi.mocked(listaFoto).mockResolvedValue([foto(id, autore)])
    const utente = galleria()
    await utente.click(await screen.findByRole('button', { name: /28\/10/ }))
    expect(await screen.findByLabelText('Data')).toBeInTheDocument()
    if (elimina) {
      expect(screen.getByRole('button', { name: 'Elimina foto' })).toBeInTheDocument()
    } else {
      expect(screen.queryByRole('button', { name: 'Elimina foto' })).not.toBeInTheDocument()
      expect(screen.getByText(/è di un altro/)).toBeInTheDocument()
      expect(screen.getByLabelText('Data')).toBeDisabled()
    }
  })
})

describe('elenco esperimenti per ruolo', () => {
  const riga = (id: string, ruolo: 'proprietario' | 'rilevatore' | 'lettore') => ({
    id, nome: `Esp ${id}`, stato: 'in_corso' as const, data_inizio: null, n_piante: 4, n_trattamenti: 2, ultima_data: null, piante_ultima_data: 0, ruolo,
  })

  it('sotto il nome, per quelli condivisi, "Rilevatore" o "Lettore"; per i propri nulla', async () => {
    vi.mocked(listaEsperimenti).mockResolvedValue([riga('a', 'proprietario'), riga('b', 'rilevatore'), riga('c', 'lettore')])
    apri('/', '/', <Esperimenti />)
    await screen.findByText('Esp b')
    expect(screen.getByText('Rilevatore')).toBeInTheDocument()
    expect(screen.getByText('Lettore')).toBeInTheDocument()
    expect(screen.queryByText('Proprietario')).not.toBeInTheDocument()
  })
})

describe('foto nell\'editor di una nota', () => {
  const editor = (notaDi: string) => apri('/n', '/n', <FotoNota espId="E" config={config} notaId="n1" notaDi={notaDi} />)

  it('il rilevatore le aggiunge a una nota sua, non a una di un altro', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('rilevatore')
    editor(IO)
    expect(await screen.findByText('Aggiungi foto', { exact: false })).toBeInTheDocument()
  })

  it('su una nota di un altro il rilevatore non vede "Aggiungi foto"', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('rilevatore')
    editor(ALTRO)
    await waitFor(() => expect(ruoloIn).toHaveBeenCalled())
    await screen.findByText('Foto')
    await waitFor(() => expect(screen.queryByText('Aggiungi foto', { exact: false })).not.toBeInTheDocument())
  })

  it('il proprietario le aggiunge a ogni nota', async () => {
    editor(ALTRO)
    expect(await screen.findByText('Aggiungi foto', { exact: false })).toBeInTheDocument()
  })
})
