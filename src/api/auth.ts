import { useEffect, useState } from 'react'
import { isAuthRetryableFetchError, type AuthChangeEvent, type Session } from '@supabase/supabase-js'
import type { QueryClient } from '@tanstack/react-query'
import { assegnaBozze } from '@/components/scheda/bozza'
import { cancellaCache } from '@/lib/cachePersistente'
import { impostaUtenteCoda } from '@/lib/coda/codaMisure'
import { ErroreRete } from '@/lib/rete'
import { supabase } from '@/lib/supabase'

/** La chiave con cui supabase-js salva la sessione nel localStorage: `sb-<progetto>-auth-token` (non `-code-verifier`, `-user`). */
const CHIAVE_SESSIONE = /^sb-.+-auth-token$/

/**
 * La sessione che supabase-js ha salvato sul telefono, letta direttamente dal localStorage (subito, senza aspettare
 * il rinnovo del token, che senza rete dura decine di secondi), o `null`. Il token può essere scaduto: dice solo chi ha
 * acceduto su questo telefono e non è uscito. Supabase la toglie quando il server la rifiuta o all'uscita.
 */
export function sessioneSalvata(): Session | null {
  let n: number
  try { n = localStorage.length } catch { return null }
  for (let i = 0; i < n; i++) {
    try {
      const chiave = localStorage.key(i)
      if (!chiave || !CHIAVE_SESSIONE.test(chiave)) continue
      const s: unknown = JSON.parse(localStorage.getItem(chiave) ?? 'null')
      if (typeof s !== 'object' || s === null) continue
      const o = s as { access_token?: unknown; refresh_token?: unknown; user?: { id?: unknown } | null }
      if (typeof o.access_token === 'string' && typeof o.refresh_token === 'string' && typeof o.user?.id === 'string') return s as Session
    } catch { /* una chiave illeggibile non è una sessione */ }
  }
  return null
}

/** Un errore della rete (non una risposta del server): il rinnovo della sessione si ritenterà, la sessione resta. */
function eErroreDiRete(e: unknown): boolean {
  return isAuthRetryableFetchError(e) || e instanceof ErroreRete || e instanceof TypeError
}

/**
 * La sessione di un evento di supabase-js. Senza rete il rinnovo del token fallisce e supabase-js manda
 * `INITIAL_SESSION` vuota, ma la sessione resta salvata (la toglie solo quando il server la rifiuta): non è
 * un'uscita, l'utente è quello della sessione salvata. `SIGNED_OUT` invece è sempre un'uscita.
 */
function sessioneDi(evento: AuthChangeEvent, sessione: Session | null): Session | null {
  if (sessione || evento === 'SIGNED_OUT') return sessione
  return sessioneSalvata()
}

export async function accedi(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw error
}

/**
 * Registrazione solo su invito: il codice dell'invito viaggia in options.data.codice_invito
 * (finisce in raw_user_meta_data) e il trigger del database lo confronta con quello dell'invito.
 * Restituisce la sessione se l'accesso è già attivo, `null` se prima va confermata l'email
 * (conferma attiva sul progetto Supabase): in quel caso l'utente deve ancora accedere.
 */
export async function registrati(email: string, password: string, codiceInvito: string): Promise<Session | null> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { codice_invito: codiceInvito.trim().toUpperCase() } },
  })
  if (error) throw error
  return data?.session ?? null
}

/**
 * Esce solo da questo dispositivo: con `scope: 'global'` (il predefinito) uscirebbe anche il telefono in campo, che
 * perderebbe la sessione con le modifiche aperte.
 */
export async function esci(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) throw error
  // La copia delle letture sul telefono non resta a chi accede dopo (la toglie anche il cambio di sessione).
  cancellaCache()
}

/**
 * Sessione corrente: `caricamento` è vero finché non si sa se c'è una sessione salvata.
 * Senza rete (Piano E, Task E7) non si finisce su "Accedi" con una sessione valida: con una sessione salvata l'app si
 * apre subito, e un errore di rete nel rinnovo del token la tiene. Si va ad "Accedi" solo senza sessione salvata o
 * quando il server la rifiuta (supabase-js allora la toglie e manda `SIGNED_OUT`).
 */
export function useSessione(): { sessione: Session | null; caricamento: boolean } {
  const [stato, setStato] = useState<{ sessione: Session | null; caricamento: boolean }>(() => {
    const salvata = sessioneSalvata()
    return { sessione: salvata, caricamento: salvata === null }
  })

  useEffect(() => {
    let attivo = true

    supabase.auth.getSession().then(
      ({ data, error }) => {
        if (!attivo) return
        const sessione = data?.session ?? (error && eErroreDiRete(error) ? sessioneSalvata() : null)
        setStato({ sessione, caricamento: false })
      },
      (e: unknown) => { if (attivo) setStato({ sessione: eErroreDiRete(e) ? sessioneSalvata() : null, caricamento: false }) },
    )

    const { data } = supabase.auth.onAuthStateChange((evento, sessione) => {
      if (attivo) setStato({ sessione: sessioneDi(evento, sessione), caricamento: false })
    })

    return () => {
      attivo = false
      data.subscription.unsubscribe()
    }
  }, [])

  return stato
}

/**
 * Svuota la cache delle query quando la sessione finisce o passa a un altro utente (scadenza del token,
 * uscita da un'altra scheda, accesso con un altro account): la cache non è legata all'utente e,
 * senza, il nuovo utente vedrebbe per un po' i dati del precedente. Un rinnovo del token dello stesso
 * utente non la tocca. Le bozze della scheda pianta (valori scritti e non salvati) seguono un'altra regola: restano
 * a chi le ha scritte anche a sessione finita (scaduta, uscita da un'altra scheda) e si cancellano solo quando accede
 * un utente diverso (vedi `assegnaBozze`). La coda d'invio delle misure segue l'utente della sessione
 * (`impostaUtenteCoda`): si vedono e si inviano solo le sue voci, e quelle di un altro restano al loro posto finché non
 * rientra lui. Restituisce la funzione che toglie l'ascolto.
 *
 * Senza rete (Piano E, Task E7): il punto di partenza è l'utente della sessione salvata, quello di cui all'avvio si è
 * ripristinata la copia delle letture (`ripristinaCache` in main.tsx). La coda è sua da subito, senza aspettare il
 * rinnovo del token; un `INITIAL_SESSION` vuota per un errore di rete non è un'uscita (`sessioneDi`); una sessione di un
 * altro, o che non c'è più, svuota la cache e toglie la copia (`cancellaCache`), come ogni cambio di utente.
 */
export function svuotaCacheAlCambioUtente(queryClient: QueryClient): () => void {
  // undefined = ancora non si sa chi c'è: il primo evento (INITIAL_SESSION) fissa il punto di partenza.
  const iniziale = sessioneSalvata()?.user.id
  let idPrecedente: string | null | undefined = iniziale
  if (iniziale) impostaUtenteCoda(iniziale)

  const { data } = supabase.auth.onAuthStateChange((evento, s) => {
    const id = sessioneDi(evento, s)?.user.id ?? null
    if (idPrecedente !== undefined && id !== idPrecedente) {
      queryClient.clear()
      cancellaCache()
    }
    if (id !== null) assegnaBozze(id)
    impostaUtenteCoda(id)
    idPrecedente = id
  })

  return () => data.subscription.unsubscribe()
}
