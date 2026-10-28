import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export async function accedi(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw error
}

/**
 * Registrazione solo su invito: il codice dell'invito viaggia in options.data.codice_invito
 * (finisce in raw_user_meta_data) e il trigger del database lo confronta con quello dell'invito.
 */
export async function registrati(email: string, password: string, codiceInvito: string): Promise<void> {
  const { error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { codice_invito: codiceInvito.trim().toUpperCase() } },
  })
  if (error) throw error
}

export async function esci(): Promise<void> {
  const { error } = await supabase.auth.signOut()
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
