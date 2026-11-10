import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { QueryClient } from '@tanstack/react-query'

/*
 * Il comportamento VERO di supabase-js (la versione installata) con il token scaduto e la rete assente: è da lui che
 * dipende se, aprendo l'app in serra, si finisce su "Accedi" (Piano E, Task E7). Qui il client non è finto: è quello di
 * `src/lib/supabase.ts`, con `fetchConLimite`; finto è solo il fetch del browser. Se un aggiornamento di supabase-js
 * cambia questo comportamento, questi test lo dicono.
 */
vi.mock('@/lib/supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const { fetchConLimite } = await import('@/lib/rete')
  return { supabase: createClient('https://progetto.supabase.co', 'chiave-anonima', { global: { fetch: fetchConLimite } }) }
})

import { impostaUtenteCoda, utenteCoda } from '@/lib/coda/codaMisure'
import { supabase } from '@/lib/supabase'
import { sessioneSalvata, svuotaCacheAlCambioUtente, useSessione } from './auth'

const CHIAVE = 'sb-progetto-auth-token'
const SESSIONE_SCADUTA = {
  access_token: 'scaduto', refresh_token: 'rinnovo-a', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.parse('2026-11-03T18:00:00Z') / 1000),
  user: { id: 'A', email: 'a@b.it', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' },
}

/** Senza rete: il fetch del browser rifiuta subito (come in modalità aereo). */
const senzaRete = () => vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
/** Il server rifiuta il token di rinnovo (sessione revocata, password cambiata): 400 `refresh_token_not_found`. */
const rinnovoRifiutato = () => vi.fn(async () => new Response(
  JSON.stringify({ code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }),
  { status: 400, headers: { 'Content-Type': 'application/json' } },
))

beforeAll(async () => {
  // Il rinnovo automatico (ogni 30 s) non deve partire da solo durante i test.
  await supabase.auth.stopAutoRefresh()
})

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(CHIAVE, JSON.stringify(SESSIONE_SCADUTA))
  vi.useFakeTimers({ now: Date.parse('2026-11-04T09:12:00Z'), toFake: ['setTimeout', 'clearTimeout', 'Date'] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  impostaUtenteCoda(null)
})

describe('supabase-js con il token scaduto e la rete assente', () => {
  it('getSession dà una sessione vuota con un errore di rete (AuthRetryableFetchError) e la sessione resta salvata', async () => {
    vi.stubGlobal('fetch', senzaRete())
    const risultato = supabase.auth.getSession()
    await vi.advanceTimersByTimeAsync(60_000)
    const { data, error } = await risultato
    expect(data.session).toBeNull()
    expect(isAuthRetryableFetchError(error)).toBe(true)
    expect(localStorage.getItem(CHIAVE)).not.toBeNull()
    expect(sessioneSalvata()?.user.id).toBe('A')
  })

  it('useSessione tiene la sessione salvata: si resta nell\'app, niente "Accedi"', async () => {
    vi.stubGlobal('fetch', senzaRete())
    const { result } = renderHook(() => useSessione())
    expect(result.current).toMatchObject({ caricamento: false, sessione: { user: { id: 'A' } } })
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
    expect(result.current).toMatchObject({ caricamento: false, sessione: { user: { id: 'A' } } })
  })

  it('INITIAL_SESSION arriva vuota, ma la coda resta dell\'utente e la cache non si svuota', async () => {
    vi.stubGlobal('fetch', senzaRete())
    const client = new QueryClient()
    client.setQueryData(['config', 'E'], { ripristinata: true })
    const eventi: string[] = []
    const { data } = supabase.auth.onAuthStateChange((evento, s) => { eventi.push(`${evento}:${s?.user.id ?? 'nessuno'}`) })
    const stacca = svuotaCacheAlCambioUtente(client)
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
    expect(eventi).toContain('INITIAL_SESSION:nessuno')
    expect(utenteCoda()).toBe('A')
    expect(client.getQueryData(['config', 'E'])).toEqual({ ripristinata: true })
    stacca()
    data.subscription.unsubscribe()
  })
})

describe('supabase-js con il token di rinnovo rifiutato dal server', () => {
  it('toglie la sessione salvata e manda SIGNED_OUT: si va ad "Accedi" e la cache si svuota', async () => {
    vi.stubGlobal('fetch', rinnovoRifiutato())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = new QueryClient()
    client.setQueryData(['config', 'E'], { ripristinata: true })
    const stacca = svuotaCacheAlCambioUtente(client)
    const { result } = renderHook(() => useSessione())
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(localStorage.getItem(CHIAVE)).toBeNull()
    expect(result.current).toEqual({ caricamento: false, sessione: null })
    expect(utenteCoda()).toBeNull()
    expect(client.getQueryData(['config', 'E'])).toBeUndefined()
    stacca()
  })
})
