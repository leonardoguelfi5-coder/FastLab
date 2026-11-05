import { createClient } from '@supabase/supabase-js'
import { fetchConLimite } from './rete'

const url = import.meta.env.VITE_SUPABASE_URL
const chiaveAnonima = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !chiaveAnonima) {
  throw new Error('Configurazione mancante: imposta VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY in .env.local (vedi README).')
}

/**
 * Client Supabase condiviso. La chiave anonima è pubblica: i dati sono protetti dalle policy RLS. Ogni richiesta
 * (database, RPC, autenticazione, Storage) passa da `fetchConLimite`: con poco segnale non resta appesa senza fine.
 */
export const supabase = createClient(url, chiaveAnonima, { global: { fetch: fetchConLimite } })
