import { supabase } from '@/lib/supabase'
import { SENZA_SESSIONE } from '@/lib/errori'

/** I conteggi di un esperimento di cui si è membri: righe, e byte stimati delle righe e dei file delle foto. */
export interface SpazioEsperimento {
  misure: number
  note: number
  foto: number
  dati_byte: number
  foto_byte: number
}

/**
 * Lo spazio di tutto il progetto Supabase (RPC `spazio_progetto`, migration 0015): il database e i file del bucket
 * foto, di tutti gli esperimenti di tutti gli utenti (solo i totali), e i conteggi dell'esperimento, `null` se non se
 * ne è membri.
 */
export interface SpazioProgetto {
  database_byte: number
  foto_byte: number
  esperimento: SpazioEsperimento | null
}

/** Un numero della risposta: anche scritto come testo (un bigint), mai inventato. Qualsiasi altra cosa è un errore. */
function numero(v: unknown, campo: string): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  if (!Number.isFinite(n)) throw new Error(`spazio_progetto: ${campo} non è un numero`)
  return n
}

/** La risposta della RPC come la usa l'app; lancia se la forma non è quella attesa. */
export function daSpazioProgetto(r: unknown): SpazioProgetto {
  const o = (typeof r === 'object' && r !== null ? r : {}) as Record<string, unknown>
  const e = o.esperimento
  let esperimento: SpazioEsperimento | null = null
  if (e !== null && e !== undefined) {
    const x = (typeof e === 'object' ? e : {}) as Record<string, unknown>
    esperimento = {
      misure: numero(x.misure, 'esperimento.misure'),
      note: numero(x.note, 'esperimento.note'),
      foto: numero(x.foto, 'esperimento.foto'),
      dati_byte: numero(x.dati_byte, 'esperimento.dati_byte'),
      foto_byte: numero(x.foto_byte, 'esperimento.foto_byte'),
    }
  }
  return { database_byte: numero(o.database_byte, 'database_byte'), foto_byte: numero(o.foto_byte, 'foto_byte'), esperimento }
}

/** Lo spazio del progetto visto dall'esperimento `espId`. Senza sessione la RPC risponde null: si dice. */
export async function spazioProgetto(espId: string): Promise<SpazioProgetto> {
  const { data, error } = await supabase.rpc('spazio_progetto', { p_esperimento: espId })
  if (error) throw error
  if (data === null || data === undefined) throw new Error(SENZA_SESSIONE)
  return daSpazioProgetto(data)
}
