import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  },
}))

import { supabase } from '@/lib/supabase'
import { accedi, esci, registrati, useSessione } from './auth'

const auth = vi.mocked(supabase.auth)
const errore = { name: 'AuthApiError', message: 'Invalid login credentials', status: 400 }

beforeEach(() => {
  for (const f of Object.values(auth)) vi.mocked(f).mockReset()
})

describe('accedi', () => {
  it('chiama signInWithPassword con l\'email ripulita dagli spazi', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: null } as never)

    await accedi('  a@b.it ', 'segreta123')

    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.it', password: 'segreta123' })
  })

  it('lancia l\'errore di Supabase', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: errore } as never)
    await expect(accedi('a@b.it', 'x')).rejects.toBe(errore)
  })
})

describe('registrati', () => {
  it('manda il codice invito ripulito e in maiuscolo in options.data.codice_invito', async () => {
    auth.signUp.mockResolvedValue({ data: {}, error: null } as never)

    await registrati(' a@b.it ', 'segreta123', ' abcd2345 ')

    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'a@b.it',
      password: 'segreta123',
      options: { data: { codice_invito: 'ABCD2345' } },
    })
  })

  it('lancia l\'errore di Supabase (invito mancante)', async () => {
    const e = { name: 'AuthApiError', message: 'INVITO_MANCANTE', status: 500, code: 'P0001' }
    auth.signUp.mockResolvedValue({ data: {}, error: e } as never)
    await expect(registrati('a@b.it', 'x', 'ABCD2345')).rejects.toBe(e)
  })
})

describe('esci', () => {
  it('chiama signOut', async () => {
    auth.signOut.mockResolvedValue({ error: null } as never)
    await esci()
    expect(auth.signOut).toHaveBeenCalledOnce()
  })

  it('lancia l\'errore di Supabase', async () => {
    auth.signOut.mockResolvedValue({ error: errore } as never)
    await expect(esci()).rejects.toBe(errore)
  })
})

describe('useSessione', () => {
  const sessione = { access_token: 't', user: { id: 'u1', email: 'a@b.it' } } as Session

  function simulaAuth(iniziale: Session | null) {
    const annulla = vi.fn()
    let notifica: (evento: string, s: Session | null) => void = () => {}
    auth.getSession.mockResolvedValue({ data: { session: iniziale }, error: null } as never)
    auth.onAuthStateChange.mockImplementation(((cb: typeof notifica) => {
      notifica = cb
      return { data: { subscription: { unsubscribe: annulla } } }
    }) as never)
    return { annulla, notifica: (evento: string, s: Session | null) => notifica(evento, s) }
  }

  it('parte in caricamento e poi restituisce la sessione salvata', async () => {
    simulaAuth(sessione)

    const { result } = renderHook(() => useSessione())
    expect(result.current).toEqual({ sessione: null, caricamento: true })

    await waitFor(() => expect(result.current.caricamento).toBe(false))
    expect(result.current.sessione).toBe(sessione)
  })

  it('senza sessione salvata: sessione null e caricamento finito', async () => {
    simulaAuth(null)

    const { result } = renderHook(() => useSessione())

    await waitFor(() => expect(result.current.caricamento).toBe(false))
    expect(result.current.sessione).toBeNull()
  })

  it('se getSession fallisce considera l\'utente non connesso', async () => {
    simulaAuth(null)
    auth.getSession.mockRejectedValue(new TypeError('Failed to fetch'))

    const { result } = renderHook(() => useSessione())

    await waitFor(() => expect(result.current.caricamento).toBe(false))
    expect(result.current.sessione).toBeNull()
  })

  it('segue login e logout, e si disiscrive allo smontaggio', async () => {
    const { annulla, notifica } = simulaAuth(null)

    const { result, unmount } = renderHook(() => useSessione())
    await waitFor(() => expect(result.current.caricamento).toBe(false))

    act(() => notifica('SIGNED_IN', sessione))
    expect(result.current.sessione).toBe(sessione)

    act(() => notifica('SIGNED_OUT', null))
    expect(result.current.sessione).toBeNull()

    unmount()
    expect(annulla).toHaveBeenCalledOnce()
  })
})
