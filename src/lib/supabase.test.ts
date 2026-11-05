import { afterEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.hoisted(() => vi.fn(() => ({ finto: true })))
vi.mock('@supabase/supabase-js', () => ({ createClient }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('client Supabase', () => {
  it('ogni richiesta (database, RPC, autenticazione, Storage) passa da fetchConLimite', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://progetto.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chiave')
    const { supabase } = await import('./supabase')
    const { fetchConLimite } = await import('./rete')
    expect(supabase).toEqual({ finto: true })
    expect(createClient).toHaveBeenCalledWith('https://progetto.supabase.co', 'chiave', { global: { fetch: fetchConLimite } })
  })

  it('senza configurazione si ferma con un messaggio che dice cosa manca', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    await expect(import('./supabase')).rejects.toThrow('Configurazione mancante')
  })
})
