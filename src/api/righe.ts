import { ELEMENTO_NON_TROVATO } from '@/lib/errori'

/**
 * L'esito di un update o di una delete con `.select('id')`: senza righe toccate l'elemento non c'è più (eliminato da
 * un'altra parte, o non accessibile) e l'operazione non deve sembrare riuscita.
 */
export function controllaRighe({ data, error }: { data: unknown[] | null; error: unknown }): void {
  if (error) throw error
  if (!data || data.length === 0) throw new Error(ELEMENTO_NON_TROVATO)
}
