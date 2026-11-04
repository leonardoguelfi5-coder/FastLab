import { formattaNumero } from '@/lib/numeri'

/**
 * I limiti del piano gratuito di Supabase, per l'intero progetto (tutti gli esperimenti di tutti gli utenti):
 * 500 MB di database e 1 GB di Storage per le foto. Decimali (1 MB = 1 000 000 byte): avvisano un po' prima.
 */
export const LIMITE_DATABASE_BYTE = 500_000_000
export const LIMITE_FOTO_BYTE = 1_000_000_000

/** Oltre questa quota di un limite (l'80%) le Impostazioni avvisano. */
const SOGLIA_AVVISO = 0.8

/** Quanto di un limite è usato: la percentuale arrotondata (anche oltre il 100: il numero è onesto) e se si è oltre l'80%. */
export function quota(byte: number, limite: number): { percentuale: number; oltreSoglia: boolean } {
  return { percentuale: Math.round((byte / limite) * 100), oltreSoglia: byte > limite * SOGLIA_AVVISO }
}

/**
 * I byte in megabyte interi, come nelle barre ("38 / 500 MB"). Sotto i 10 MB con un decimale e la virgola ("0,4"):
 * qualche foto o qualche misura non diventano "0".
 */
export function megabyte(byte: number): string {
  const mb = byte / 1_000_000
  return mb < 10 ? formattaNumero(Math.round(mb * 10) / 10) : String(Math.round(mb))
}
