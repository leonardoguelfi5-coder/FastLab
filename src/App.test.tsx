import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

vi.mock('@/api/auth', () => ({
  accedi: vi.fn(), registrati: vi.fn(), esci: vi.fn(), useSessione: vi.fn(),
}))
vi.mock('@/api/query', () => ({ useSonoAdmin: vi.fn() }))
// La pagina inviti ha i suoi test: qui interessa solo che il percorso la mostri.
vi.mock('@/pages/AdminInviti', () => ({
  AdminInviti: () => <h1>Pagina inviti (prova)</h1>,
}))
vi.mock('@/pages/Esperimenti', () => ({
  Esperimenti: () => <h1>Elenco esperimenti (prova)</h1>,
}))
vi.mock('@/pages/HomeEsperimento', () => ({
  HomeEsperimento: () => <h1>Home dell'esperimento (prova)</h1>,
}))
vi.mock('@/pages/SceltaStrumento', () => ({
  SceltaStrumento: () => <h1>Scelta dello strumento (prova)</h1>,
}))
vi.mock('@/pages/MisuraPianta', () => ({
  MisuraPianta: () => <h1>Misura della pianta (prova)</h1>,
}))
vi.mock('@/pages/FineGiro', () => ({
  FineGiro: () => <h1>Fine del giro (prova)</h1>,
}))
vi.mock('@/pages/ElencoPiante', () => ({
  ElencoPiante: () => <h1>Elenco delle piante (prova)</h1>,
}))
vi.mock('@/pages/SchedaPianta', () => ({
  SchedaPianta: () => <h1>Scheda della pianta (prova)</h1>,
}))
vi.mock('@/pages/ModificaMisura', () => ({
  ModificaMisura: () => <h1>Modifica della misura (prova)</h1>,
}))
vi.mock('@/pages/Impostazioni', () => ({
  Impostazioni: () => <h1>Impostazioni dell'esperimento (prova)</h1>,
}))
vi.mock('@/pages/Catalogo', () => ({
  Catalogo: () => <h1>Catalogo strumenti (prova)</h1>,
}))
vi.mock('@/pages/NuovoEsperimento', () => ({
  NuovoEsperimento: () => <h1>Procedura nuovo esperimento (prova)</h1>,
}))

import { useSessione } from '@/api/auth'
import { useSonoAdmin } from '@/api/query'
import { AppRoutes } from './App'

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session

const PERCORSI_PRIVATI = [
  '/', '/esperimenti/x', '/esperimenti/x/misura', '/esperimenti/x/misura/s/p', '/esperimenti/x/misura/s/fine', '/esperimenti/x/piante', '/esperimenti/x/piante/p',
  '/esperimenti/x/misure/m', '/esperimenti/x/impostazioni', '/esperimenti/x/dataset',
  '/esperimenti/nuovo', '/admin/inviti', '/catalogo',
]

function vaiA(percorso: string) {
  render(
    <MemoryRouter initialEntries={[percorso]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useSonoAdmin).mockReturnValue({ data: false } as never)
})

describe('AppRoutes', () => {
  it.each(PERCORSI_PRIVATI)('senza sessione %s porta a /accedi', (percorso) => {
    vi.mocked(useSessione).mockReturnValue({ sessione: null, caricamento: false })
    vaiA(percorso)
    expect(screen.getByRole('button', { name: 'Accedi' })).toBeInTheDocument()
  })

  it('/accedi e /registrati sono pubbliche', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: null, caricamento: false })
    vaiA('/registrati')
    expect(screen.getByLabelText('Codice invito')).toBeInTheDocument()
  })

  it('con la sessione /esperimenti/:espId/impostazioni mostra le impostazioni', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
    vaiA('/esperimenti/x/impostazioni')
    expect(screen.getByRole('heading', { level: 1, name: 'Impostazioni dell\'esperimento (prova)' })).toBeInTheDocument()
  })

  it('con la sessione /catalogo mostra il catalogo degli strumenti', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
    vaiA('/catalogo')
    expect(screen.getByRole('heading', { level: 1, name: 'Catalogo strumenti (prova)' })).toBeInTheDocument()
  })

  it('con la sessione / mostra l\'elenco degli esperimenti', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
    vaiA('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Elenco esperimenti (prova)' })).toBeInTheDocument()
  })

  it('con la sessione /esperimenti/:espId mostra la home dell\'esperimento', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
    vaiA('/esperimenti/x')
    expect(screen.getByRole('heading', { level: 1, name: 'Home dell\'esperimento (prova)' })).toBeInTheDocument()
  })

  it('con la sessione /esperimenti/:espId/misura mostra la scelta dello strumento', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
    vaiA('/esperimenti/x/misura')
    expect(screen.getByRole('heading', { level: 1, name: 'Scelta dello strumento (prova)' })).toBeInTheDocument()
  })

  it('con la sessione /esperimenti/:espId/misura/:strumentoId/:piantaId mostra la misura della pianta', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
    vaiA('/esperimenti/x/misura/s/p')
    expect(screen.getByRole('heading', { level: 1, name: 'Misura della pianta (prova)' })).toBeInTheDocument()
  })

  it('con la sessione /esperimenti/:espId/misura/:strumentoId/fine mostra la fine del giro, non una pianta «fine»', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
    vaiA('/esperimenti/x/misura/s/fine')
    expect(screen.getByRole('heading', { level: 1, name: 'Fine del giro (prova)' })).toBeInTheDocument()
  })

  it('con la sessione /esperimenti/:espId/piante mostra l\'elenco delle piante', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
    vaiA('/esperimenti/x/piante')
    expect(screen.getByRole('heading', { level: 1, name: 'Elenco delle piante (prova)' })).toBeInTheDocument()
  })

  it.each([
    ['oggi', 'Oggi'], ['dataset', 'Dataset'], ['esporta', 'Esporta Excel'], ['diario', 'Diario'], ['foto', 'Foto'],
  ])('con la sessione /esperimenti/:espId/%s mostra il segnaposto «%s»', (sezione, titolo) => {
    vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
    vaiA(`/esperimenti/x/${sezione}`)
    expect(screen.getByRole('heading', { level: 1, name: titolo })).toBeInTheDocument()
    expect(screen.getByText('Questa sezione arriva con il prossimo aggiornamento.')).toBeInTheDocument()
  })

  it('con la sessione /esperimenti/:espId/piante/:piantaId mostra la scheda della pianta', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
    vaiA('/esperimenti/x/piante/p')
    expect(screen.getByRole('heading', { level: 1, name: 'Scheda della pianta (prova)' })).toBeInTheDocument()
  })

  it('con la sessione /esperimenti/:espId/misure/:misuraId mostra la modifica della misura', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
    vaiA('/esperimenti/x/misure/m')
    expect(screen.getByRole('heading', { level: 1, name: 'Modifica della misura (prova)' })).toBeInTheDocument()
  })

  it('con la sessione /admin/inviti mostra la pagina degli inviti', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
    vaiA('/admin/inviti')
    expect(screen.getByRole('heading', { level: 1, name: 'Pagina inviti (prova)' })).toBeInTheDocument()
  })

  it('con la sessione /esperimenti/nuovo mostra la procedura guidata', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
    vaiA('/esperimenti/nuovo')
    expect(screen.getByRole('heading', { level: 1, name: 'Procedura nuovo esperimento (prova)' })).toBeInTheDocument()
  })

  it('un percorso sconosciuto con la sessione torna a /', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
    vaiA('/boh')
    expect(screen.getByRole('heading', { level: 1, name: 'Elenco esperimenti (prova)' })).toBeInTheDocument()
  })
})
