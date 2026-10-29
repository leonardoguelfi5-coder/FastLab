import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { QueryClient } from '@tanstack/react-query'
import { assegnaBozze } from '@/components/scheda/bozza'
import { supabase } from '@/lib/supabase'

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
}

/** Sessione corrente: `caricamento` è vero finché non si sa se c'è una sessione salvata. */
export function useSessione(): { sessione: Session | null; caricamento: boolean } {
  const [stato, setStato] = useState<{ sessione: Session | null; caricamento: boolean }>({
    sessione: null,
    caricamento: true,
  })

  useEffect(() => {
    let attivo = true

    supabase.auth.getSession().then(
      ({ data }) => { if (attivo) setStato({ sessione: data?.session ?? null, caricamento: false }) },
      () => { if (attivo) setStato({ sessione: null, caricamento: false }) },
    )

    const { data } = supabase.auth.onAuthStateChange((_evento, sessione) => {
      if (attivo) setStato({ sessione, caricamento: false })
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
 * un utente diverso (vedi `assegnaBozze`). Restituisce la funzione che toglie l'ascolto.
 */
export function svuotaCacheAlCambioUtente(queryClient: QueryClient): () => void {
  // undefined = ancora non si sa chi c'è: il primo evento (INITIAL_SESSION) fissa il punto di partenza.
  let idPrecedente: string | null | undefined

  const { data } = supabase.auth.onAuthStateChange((_evento, sessione) => {
    const id = sessione?.user.id ?? null
    if (idPrecedente !== undefined && id !== idPrecedente) queryClient.clear()
    if (id !== null) assegnaBozze(id)
    idPrecedente = id
  })

  return () => data.subscription.unsubscribe()
}
