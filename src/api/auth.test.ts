import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { AuthApiError, AuthRetryableFetchError, type Session } from '@supabase/supabase-js'
import { QueryClient } from '@tanstack/react-query'

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

import { chiaveAperto, chiaveBozza } from '@/components/scheda/bozza'
import { CHIAVE_CACHE } from '@/lib/cachePersistente'
import { accoda, impostaUtenteCoda, utenteCoda, vociDi } from '@/lib/coda/codaMisure'
import { ErroreRete } from '@/lib/rete'
import { supabase } from '@/lib/supabase'
import { accedi, esci, registrati, sessioneSalvata, svuotaCacheAlCambioUtente, useSessione } from './auth'

/** La chiave con cui supabase-js salva la sessione nel localStorage (`sb-<progetto>-auth-token`). */
const CHIAVE_SESSIONE = 'sb-progetto-auth-token'
/** Una sessione salvata da supabase-js, con il token già scaduto (il telefono riaperto il mattino dopo). */
const salvata = (id: string) => ({
  access_token: `t-${id}`, refresh_token: `r-${id}`, expires_at: 1, expires_in: 3600, token_type: 'bearer',
  user: { id, email: `${id}@b.it` },
})
const salvaSessione = (id: string) => localStorage.setItem(CHIAVE_SESSIONE, JSON.stringify(salvata(id)))

const auth = vi.mocked(supabase.auth)
const errore = { name: 'AuthApiError', message: 'Invalid login credentials', status: 400 }

beforeEach(() => {
  for (const f of Object.values(auth)) vi.mocked(f).mockReset()
  // Una sessione salvata lasciata da un test cambierebbe il punto di partenza degli altri.
  localStorage.clear()
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

  it('restituisce la sessione se l\'accesso è già attivo', async () => {
    const sessione = { access_token: 't', user: { id: 'u1' } } as Session
    auth.signUp.mockResolvedValue({ data: { user: sessione.user, session: sessione }, error: null } as never)
    await expect(registrati('a@b.it', 'segreta123', 'ABCD2345')).resolves.toBe(sessione)
  })

  it('restituisce null se l\'email va ancora confermata (nessuna sessione)', async () => {
    auth.signUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null } as never)
    await expect(registrati('a@b.it', 'segreta123', 'ABCD2345')).resolves.toBeNull()
  })

  it('lancia l\'errore di Supabase (invito mancante)', async () => {
    const e = { name: 'AuthApiError', message: 'INVITO_MANCANTE', status: 500, code: 'P0001' }
    auth.signUp.mockResolvedValue({ data: {}, error: e } as never)
    await expect(registrati('a@b.it', 'x', 'ABCD2345')).rejects.toBe(e)
  })
})

describe('sessioneSalvata', () => {
  beforeEach(() => localStorage.clear())

  it('legge la sessione che supabase-js ha salvato nel localStorage, anche col token scaduto', () => {
    salvaSessione('A')
    expect(sessioneSalvata()?.user.id).toBe('A')
  })

  it('senza sessione salvata, o con una illeggibile o senza utente, è null', () => {
    expect(sessioneSalvata()).toBeNull()
    localStorage.setItem(CHIAVE_SESSIONE, '{rotto')
    expect(sessioneSalvata()).toBeNull()
    localStorage.setItem(CHIAVE_SESSIONE, JSON.stringify({ ...salvata('A'), user: null }))
    expect(sessioneSalvata()).toBeNull()
  })

  it('non confonde le altre chiavi di supabase-js (il verificatore PKCE, l\'utente a parte)', () => {
    localStorage.setItem(`${CHIAVE_SESSIONE}-code-verifier`, JSON.stringify(salvata('A')))
    localStorage.setItem(`${CHIAVE_SESSIONE}-user`, JSON.stringify(salvata('A')))
    expect(sessioneSalvata()).toBeNull()
  })
})

describe('esci', () => {
  beforeEach(() => localStorage.clear())

  it('toglie la copia delle letture dal telefono, solo se l\'uscita riesce', async () => {
    localStorage.setItem(CHIAVE_CACHE, '{}')
    auth.signOut.mockResolvedValue({ error: errore } as never)
    await expect(esci()).rejects.toBe(errore)
    expect(localStorage.getItem(CHIAVE_CACHE)).toBe('{}')

    auth.signOut.mockResolvedValue({ error: null } as never)
    await esci()
    expect(localStorage.getItem(CHIAVE_CACHE)).toBeNull()
  })

  it('chiama signOut solo per questo dispositivo', async () => {
    auth.signOut.mockResolvedValue({ error: null } as never)
    await esci()
    expect(auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' })
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

  describe('senza rete (Piano E, Task E7)', () => {
    beforeEach(() => localStorage.clear())
    const sospesa = () => new Promise<never>(() => {})

    it('con una sessione salvata l\'app si apre subito, senza aspettare il rinnovo del token', () => {
      simulaAuth(null)
      auth.getSession.mockImplementation(sospesa as never)
      salvaSessione('A')
      const { result } = renderHook(() => useSessione())
      expect(result.current.caricamento).toBe(false)
      expect(result.current.sessione?.user.id).toBe('A')
    })

    it('un errore di rete nel rinnovo (AuthRetryableFetchError) tiene la sessione salvata: niente "Accedi"', async () => {
      simulaAuth(null)
      salvaSessione('A')
      auth.getSession.mockResolvedValue({ data: { session: null }, error: new AuthRetryableFetchError('Rete debole', 0) } as never)
      const { result } = renderHook(() => useSessione())
      await waitFor(() => expect(auth.getSession).toHaveBeenCalled())
      await act(async () => {})
      expect(result.current).toMatchObject({ caricamento: false, sessione: { user: { id: 'A' } } })
    })

    it('anche se getSession lancia un errore di rete (ErroreRete, TypeError)', async () => {
      simulaAuth(null)
      salvaSessione('A')
      auth.getSession.mockRejectedValue(new ErroreRete('rete'))
      const { result } = renderHook(() => useSessione())
      await act(async () => {})
      expect(result.current.sessione?.user.id).toBe('A')
    })

    it('INITIAL_SESSION vuota con la sessione ancora salvata (rinnovo fallito per la rete) non è un\'uscita', () => {
      const { notifica } = simulaAuth(null)
      auth.getSession.mockImplementation(sospesa as never)
      salvaSessione('A')
      const { result } = renderHook(() => useSessione())
      act(() => notifica('INITIAL_SESSION', null))
      expect(result.current.sessione?.user.id).toBe('A')
    })

    it('una sessione rifiutata dal server (supabase-js la toglie) porta ad "Accedi"', async () => {
      simulaAuth(null)
      salvaSessione('A')
      auth.getSession.mockImplementation((async () => {
        localStorage.removeItem(CHIAVE_SESSIONE)
        return { data: { session: null }, error: new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found') }
      }) as never)
      const { result } = renderHook(() => useSessione())
      await waitFor(() => expect(result.current.sessione).toBeNull())
      expect(result.current.caricamento).toBe(false)
    })

    it('SIGNED_OUT è sempre un\'uscita', () => {
      const { notifica } = simulaAuth(null)
      auth.getSession.mockImplementation(sospesa as never)
      salvaSessione('A')
      const { result } = renderHook(() => useSessione())
      act(() => notifica('SIGNED_OUT', null))
      expect(result.current.sessione).toBeNull()
    })
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

describe('svuotaCacheAlCambioUtente', () => {
  const utenteA = { access_token: 'ta', user: { id: 'A' } } as Session
  const utenteB = { access_token: 'tb', user: { id: 'B' } } as Session

  function avvia(iniziale: Session | null) {
    const annulla = vi.fn()
    let notifica: (evento: string, s: Session | null) => void = () => {}
    auth.onAuthStateChange.mockImplementation(((cb: typeof notifica) => {
      notifica = cb
      return { data: { subscription: { unsubscribe: annulla } } }
    }) as never)

    const client = new QueryClient()
    const stacca = svuotaCacheAlCambioUtente(client)
    // Supabase manda INITIAL_SESSION appena ci si iscrive.
    notifica('INITIAL_SESSION', iniziale)

    const riempi = () => {
      client.setQueryData(['esperimenti'], [{ id: 'e1' }])
      client.setQueryData(['sonoAdmin'], true)
    }
    const vuota = () => client.getQueryCache().getAll().length === 0
    return { client, annulla, stacca, riempi, vuota, notifica: (e: string, s: Session | null) => notifica(e, s) }
  }

  it('la sessione iniziale (INITIAL_SESSION) non svuota nulla', () => {
    const { riempi, vuota, notifica } = avvia(utenteA)
    riempi()
    notifica('INITIAL_SESSION', utenteA)
    expect(vuota()).toBe(false)
  })

  it('con la sessione che finisce (A -> nessuno) svuota la cache', () => {
    const { riempi, vuota, notifica } = avvia(utenteA)
    riempi()
    notifica('SIGNED_OUT', null)
    expect(vuota()).toBe(true)
  })

  it('A -> nessuno -> B: svuota alla fine della sessione e di nuovo all\'arrivo di B', () => {
    const { riempi, vuota, notifica } = avvia(utenteA)
    riempi()
    notifica('SIGNED_OUT', null)
    expect(vuota()).toBe(true)

    riempi() // dati arrivati in mezzo, per esempio da una richiesta in corso
    notifica('SIGNED_IN', utenteB)
    expect(vuota()).toBe(true)
  })

  it('A -> B direttamente (accesso con un altro account, anche da un\'altra scheda) svuota la cache', () => {
    const { riempi, vuota, notifica } = avvia(utenteA)
    riempi()
    notifica('SIGNED_IN', utenteB)
    expect(vuota()).toBe(true)
  })

  it('lo stesso utente (rinnovo del token, SIGNED_IN al ritorno sulla scheda) non svuota la cache', () => {
    const { client, riempi, vuota, notifica } = avvia(utenteA)
    riempi()
    notifica('TOKEN_REFRESHED', { ...utenteA, access_token: 'nuovo' })
    notifica('SIGNED_IN', { ...utenteA })
    notifica('USER_UPDATED', { ...utenteA })
    expect(vuota()).toBe(false)
    expect(client.getQueryData(['esperimenti'])).toEqual([{ id: 'e1' }])
  })

  it('partendo senza sessione, l\'accesso di un utente svuota la cache', () => {
    const { riempi, vuota, notifica } = avvia(null)
    riempi()
    notifica('SIGNED_IN', utenteA)
    expect(vuota()).toBe(true)
  })

  describe('senza rete e la copia delle letture (Piano E, Task E7)', () => {
    beforeEach(() => localStorage.clear())
    afterEach(() => impostaUtenteCoda(null))

    it('la coda è subito dell\'utente della sessione salvata, prima che il rinnovo del token finisca', () => {
      salvaSessione('A')
      auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } } as never)
      svuotaCacheAlCambioUtente(new QueryClient())
      expect(utenteCoda()).toBe('A')
    })

    it('INITIAL_SESSION vuota per un errore di rete (sessione ancora salvata): la coda e i dati ripristinati restano', () => {
      salvaSessione('A')
      const { client, notifica } = avvia(null)
      client.setQueryData(['esperimenti'], [{ id: 'e1' }])
      notifica('INITIAL_SESSION', null)
      expect(utenteCoda()).toBe('A')
      expect(client.getQueryData(['esperimenti'])).toEqual([{ id: 'e1' }])
    })

    it('con i dati di A ripristinati, se la sessione è di un altro (o non c\'è più) si svuota tutto, copia compresa', () => {
      salvaSessione('A')
      const client = new QueryClient()
      client.setQueryData(['esperimenti'], [{ id: 'di-A' }])
      localStorage.setItem(CHIAVE_CACHE, '{}')
      let notifica: (evento: string, s: Session | null) => void = () => {}
      auth.onAuthStateChange.mockImplementation(((cb: typeof notifica) => {
        notifica = cb
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }) as never)
      svuotaCacheAlCambioUtente(client)
      localStorage.removeItem(CHIAVE_SESSIONE)
      notifica('INITIAL_SESSION', utenteB)
      expect(client.getQueryData(['esperimenti'])).toBeUndefined()
      expect(localStorage.getItem(CHIAVE_CACHE)).toBeNull()
    })

    it('alla fine della sessione e al cambio di utente la copia delle letture si toglie; al rinnovo del token no', () => {
      const { notifica } = avvia(utenteA)
      localStorage.setItem(CHIAVE_CACHE, '{}')
      notifica('TOKEN_REFRESHED', { ...utenteA, access_token: 'nuovo' })
      expect(localStorage.getItem(CHIAVE_CACHE)).toBe('{}')
      notifica('SIGNED_OUT', null)
      expect(localStorage.getItem(CHIAVE_CACHE)).toBeNull()
      localStorage.setItem(CHIAVE_CACHE, '{}')
      notifica('SIGNED_IN', utenteB)
      expect(localStorage.getItem(CHIAVE_CACHE)).toBeNull()
    })
  })

  describe('la coda d\'invio delle misure (Piano E, Task E6)', () => {
    beforeEach(() => localStorage.clear())
    afterEach(() => impostaUtenteCoda(null))

    it('segue l\'utente della sessione: solo le sue voci si vedono e si inviano', () => {
      const { notifica } = avvia(utenteA)
      expect(utenteCoda()).toBe('A')
      notifica('SIGNED_OUT', null)
      expect(utenteCoda()).toBeNull()
      notifica('SIGNED_IN', utenteB)
      expect(utenteCoda()).toBe('B')
    })

    it('le voci di A restano quando accede B: partiranno al prossimo accesso di A', () => {
      const { notifica } = avvia(utenteA)
      accoda('A', 'E', { id: 'm1', pianta_id: 'p', strumento_id: 's', data_rilievo: '2026-10-28', ora: '09:00', valori: {} },
        { etichetta: '1', strumento: 'SPAD', sulServer: false })
      notifica('SIGNED_OUT', null)
      notifica('SIGNED_IN', utenteB)
      expect(vociDi('A')).toHaveLength(1)
      expect(vociDi('B')).toEqual([])
    })
  })

  describe('le bozze della scheda pianta', () => {
    const riquadro = { espId: 'E', piantaId: 'p35', strumentoId: 'termo', dataRilievo: '2026-10-28' }
    const bozza = chiaveBozza({ ...riquadro, misuraId: null })
    const aperto = chiaveAperto(riquadro)
    const scrivi = () => {
      localStorage.setItem(bozza, '{"id":"m1","valori":{},"ora":null}')
      localStorage.setItem(aperto, 'm1')
      localStorage.setItem('altro', 'resta')
    }
    const ciSono = () => localStorage.getItem(bozza) !== null && localStorage.getItem(aperto) === 'm1'

    beforeEach(() => localStorage.clear())

    it('a sessione finita (scaduta, o uscita da un\'altra scheda) restano: la stessa persona rientra e le ritrova', () => {
      const { notifica } = avvia(utenteA)
      scrivi()
      notifica('SIGNED_OUT', null)
      expect(ciSono()).toBe(true)
      notifica('SIGNED_IN', utenteA)
      expect(ciSono()).toBe(true)
    })

    it('A -> nessuno -> B: all\'accesso di B si cancellano tutte, e solo loro', () => {
      const { notifica } = avvia(utenteA)
      scrivi()
      notifica('SIGNED_OUT', null)
      notifica('SIGNED_IN', utenteB)
      expect(Object.keys(localStorage).filter(k => k !== 'fastlab-bozza:utente')).toEqual(['altro'])
    })

    it('A -> B direttamente (accesso con un altro account, anche da un\'altra scheda) le cancella', () => {
      const { notifica } = avvia(utenteA)
      scrivi()
      notifica('SIGNED_IN', utenteB)
      expect(localStorage.getItem(bozza)).toBeNull()
      expect(localStorage.getItem(aperto)).toBeNull()
    })

    it('ricaricando la pagina con la sessione ancora da recuperare (INITIAL_SESSION vuota, poi A) A le ritrova', () => {
      avvia(utenteA)
      scrivi()
      const { notifica } = avvia(null)
      expect(ciSono()).toBe(true)
      notifica('SIGNED_IN', utenteA)
      expect(ciSono()).toBe(true)
    })

    it('lo stesso utente (rinnovo del token) le ritrova', () => {
      const { notifica } = avvia(utenteA)
      scrivi()
      notifica('TOKEN_REFRESHED', { ...utenteA, access_token: 'nuovo' })
      notifica('SIGNED_IN', { ...utenteA })
      expect(ciSono()).toBe(true)
    })

    it('bozze di cui non si sa il proprietario non passano al primo che accede', () => {
      scrivi()
      avvia(utenteA)
      expect(localStorage.getItem(bozza)).toBeNull()
    })
  })

  it('restituisce la funzione che toglie l\'ascolto', () => {
    const { annulla, stacca } = avvia(utenteA)
    stacca()
    expect(annulla).toHaveBeenCalledOnce()
  })
})
