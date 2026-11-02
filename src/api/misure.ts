import { supabase } from '@/lib/supabase'
import type { Misura } from '@/domain/tipi'
import { MISURA_NON_TROVATA } from '@/lib/errori'
import { aRigaMisura, daRigaMisura, type RigaMisura } from './mappers'

/** Misure di un esperimento in una data (AAAA-MM-GG), dalla più vecchia alla più recente. */
export async function misureDelGiorno(espId: string, data: string): Promise<Misura[]> {
  const { data: righe, error } = await supabase
    .from('misure')
    .select('*')
    .eq('esperimento_id', espId)
    .eq('data_rilievo', data)
    .order('ora', { ascending: true })
  if (error) throw error
  return (righe ?? []).map(daRigaMisura)
}

/** Le righe di misure che si chiedono in una volta (PostgREST può darne di meno: `max_rows`). */
const PAGINA_MISURE = 1000

/**
 * L'ordine in cui il dominio legge le misure: data, ora, poi il momento in cui sono state create e infine l'`id`. A parità
 * di data e ora il dominio tiene "l'ultima misura del giorno" per ordine di arrivo: le pagine per `id` (uuid casuali)
 * non dicono quale è venuta dopo, `creato_il` sì. L'`id` chiude i pareggi, perché l'ordine non dipenda da come arrivano le
 * pagine. Sono tutti testi in formato ISO: il confronto fra testi è quello cronologico.
 */
function perOrdineDiRilievo(a: RigaMisura, b: RigaMisura): number {
  return confronta(a.data_rilievo, b.data_rilievo) || confronta(a.ora, b.ora) || confronta(a.creato_il ?? '', b.creato_il ?? '') || confronta(a.id, b.id)
}
const confronta = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Tutte le misure di uno strumento dell'esperimento, in tutto il periodo (periodo e piante si filtrano sul client, così
 * cambiare un filtro non rilegge nulla). Si legge a pagine "keyset": ordinate per `id`, 1000 righe, e dalla seconda
 * `id > <ultimo id ricevuto>`; a differenza dell'offset, un inserimento o un'eliminazione concorrente non fa saltare
 * righe. Ci si ferma solo davanti a una pagina vuota: il server può dare meno righe di quelle chieste (`max_rows`), e
 * fermarsi a una pagina "corta" perderebbe in silenzio le misure più recenti (come in `listaNote`). Un errore a metà
 * si rilancia senza restituire il risultato parziale: un grafico o un Excel con i dati a metà sarebbero peggio di niente.
 * Alla fine le misure si riordinano in modo stabile (`perOrdineDiRilievo`), non nell'ordine arbitrario delle pagine.
 * L'indice `misure (esperimento_id, strumento_id, id)` serve proprio a queste pagine.
 */
export async function misureStrumento(espId: string, strumentoId: string): Promise<Misura[]> {
  const misure = new Map<string, RigaMisura>()
  let cursore: string | null = null
  for (;;) {
    let query = supabase
      .from('misure')
      .select('id, pianta_id, strumento_id, data_rilievo, ora, valori, creato_il')
      .eq('esperimento_id', espId)
      .eq('strumento_id', strumentoId)
      .order('id')
      .limit(PAGINA_MISURE)
    if (cursore !== null) query = query.gt('id', cursore)
    const { data, error } = await query
    if (error) throw error
    const righe = (data ?? []) as RigaMisura[]
    if (righe.length === 0) return [...misure.values()].sort(perOrdineDiRilievo).map(daRigaMisura)
    // L'ultima riga nell'ordine del server è la più grande: il confronto lo fa il database, non JavaScript.
    const ultimo = righe[righe.length - 1].id
    // Un server che ignorasse il filtro rimanderebbe sempre la stessa pagina: meglio un errore che un ciclo infinito.
    if (ultimo === cursore) throw new Error('La lettura delle misure non avanza: riprova.')
    for (const r of righe) if (!misure.has(r.id)) misure.set(r.id, r)
    cursore = ultimo
  }
}

/** Tutte le misure di una pianta, dalla più recente. */
export async function misurePianta(piantaId: string): Promise<Misura[]> {
  const { data, error } = await supabase
    .from('misure')
    .select('*')
    .eq('pianta_id', piantaId)
    .order('data_rilievo', { ascending: false })
    .order('ora', { ascending: false })
  if (error) throw error
  return (data ?? []).map(daRigaMisura)
}

/** Una misura per id; lancia `MISURA_NON_TROVATA` se non c'è (o non è visibile a chi la chiede). */
export async function caricaMisura(id: string): Promise<Misura> {
  const { data, error } = await supabase.from('misure').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new Error(MISURA_NON_TROVATA)
  return daRigaMisura(data)
}

/**
 * Salva una misura con upsert per id: l'id lo genera il client una volta per modulo, quindi un
 * doppio tocco o un nuovo tentativo dopo un timeout aggiornano la stessa riga invece di duplicarla.
 */
export async function salvaMisura(espId: string, m: Misura): Promise<void> {
  const { error } = await supabase.from('misure').upsert(aRigaMisura(espId, m), { onConflict: 'id' })
  if (error) throw error
}

export async function eliminaMisura(id: string): Promise<void> {
  const { error } = await supabase.from('misure').delete().eq('id', id)
  if (error) throw error
}

/**
 * La data (AAAA-MM-GG) dell'ultima misura di ogni strumento dell'esperimento, per "ultima volta 21/10" nella scelta
 * dello strumento. Gli strumenti mai misurati non compaiono nella mappa. Calcolata dal database (`max` per strumento),
 * così non si scaricano le misure di tutta la stagione.
 */
export async function ultimaMisuraPerStrumento(espId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc('ultime_misure_per_strumento', { p_esperimento: espId })
  if (error) throw error
  return new Map(((data ?? []) as { strumento_id: string; ultima: string }[]).map(r => [r.strumento_id, r.ultima]))
}

/**
 * Le misure più recenti di ogni pianta per ogni strumento: per ogni coppia (pianta, strumento) tutte le misure della
 * data più recente (più misure nello stesso giorno tornano tutte, per la media giornaliera). Calcolata dal database,
 * così la scheda, l'elenco per trattamento e "Oggi" non scaricano le misure di tutta la stagione.
 */
export async function ultimeMisurePiante(espId: string): Promise<Misura[]> {
  const { data, error } = await supabase.rpc('ultime_misure_piante', { p_esperimento: espId })
  if (error) throw error
  return ((data ?? []) as RigaMisura[]).map(daRigaMisura)
}
