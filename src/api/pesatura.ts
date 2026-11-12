import { supabase } from '@/lib/supabase'
import {
  IMPOSTAZIONI_PREDEFINITE, type CampionePesatura, type ImpostazioniAnalisi, type Peso, type SessionePesatura,
} from '@/domain/pesatura/tipi'
import { controllaRighe } from './righe'

/*
 * La Pesatura funziona solo online: niente coda locale, niente copia sul telefono. `creato_da` lo mette il database
 * (default `auth.uid()`) e non si manda mai: si legge soltanto.
 */

/** Le righe che si chiedono in una volta (PostgREST può darne di meno: `max_rows`). */
const PAGINA = 1000

export interface DatiPesatura {
  sessioni: SessionePesatura[]
  campioni: CampionePesatura[]
  pesi: Peso[]
}

/** Le impostazioni di una riga: il default del database è `{}`, e i campi mancanti prendono i valori predefiniti. */
const conPredefinite = (i: Partial<ImpostazioniAnalisi> | null | undefined): ImpostazioniAnalisi => ({ ...IMPOSTAZIONI_PREDEFINITE, ...(i ?? {}) })

/** Il campo `creato_da` solo se la riga lo ha: nel dominio è facoltativo. */
const autore = (r: { creato_da?: string | null }) => (r.creato_da ? { creato_da: r.creato_da } : {})

function daRigaSessione(r: SessionePesatura): SessionePesatura {
  return {
    id: r.id, esperimento_id: r.esperimento_id, titolo: r.titolo, tipo: r.tipo, unita: r.unita,
    impostazioni: conPredefinite(r.impostazioni), data: r.data, nota: r.nota, conclusa: r.conclusa, ...autore(r),
    ...(r.creato_il ? { creato_il: r.creato_il } : {}),
  }
}

function daRigaCampione(r: CampionePesatura): CampionePesatura {
  return { id: r.id, sessione_id: r.sessione_id, pianta_id: r.pianta_id, nome: r.nome, substrato: r.substrato, ordine: r.ordine }
}

function daRigaPeso(r: Peso): Peso {
  return {
    id: r.id, campione_id: r.campione_id, replica: r.replica, tipo: r.tipo, valore: Number(r.valore),
    lettura: r.lettura === null ? null : Number(r.lettura), misurato_il: r.misurato_il, ...autore(r),
  }
}

/**
 * Tutte le righe di una tabella per un esperimento, a pagine come `listaNote`: ci si ferma solo davanti a una pagina
 * vuota (il server può dare meno righe di quelle chieste) e si tengono le righe per `id`, una sola volta (un
 * inserimento concorrente può spostarne una da una pagina all'altra).
 */
async function leggiTutte<R extends { id: string }>(tabella: string, espId: string): Promise<R[]> {
  const righe = new Map<string, R>()
  for (let da = 0; ; ) {
    const { data, error } = await supabase
      .from(tabella)
      .select('*')
      .eq('esperimento_id', espId)
      .order('id', { ascending: true })
      .range(da, da + PAGINA - 1)
    if (error) throw error
    const pagina = (data ?? []) as R[]
    if (pagina.length === 0) return [...righe.values()]
    for (const r of pagina) if (!righe.has(r.id)) righe.set(r.id, r)
    da += pagina.length
  }
}

/** Sessioni, campioni e pesi dell'esperimento. L'ordine (per data, per ordine, per replica) lo dà il dominio. */
export async function listaPesatura(espId: string): Promise<DatiPesatura> {
  const [sessioni, campioni, pesi] = await Promise.all([
    leggiTutte<SessionePesatura>('sessioni_pesatura', espId),
    leggiTutte<CampionePesatura>('campioni_pesatura', espId),
    leggiTutte<Peso>('pesi', espId),
  ])
  return { sessioni: sessioni.map(daRigaSessione), campioni: campioni.map(daRigaCampione), pesi: pesi.map(daRigaPeso) }
}

function aRigaCampione(espId: string, c: CampionePesatura) {
  return {
    id: c.id, sessione_id: c.sessione_id, esperimento_id: espId, pianta_id: c.pianta_id, nome: c.nome, substrato: c.substrato,
    ordine: c.ordine,
  }
}

/**
 * Crea una sessione e i suoi campioni: prima la sessione, poi i campioni (che la richiamano con una chiave esterna).
 * Se la sessione non si scrive, i campioni non si toccano. Upsert per id: un nuovo tentativo non duplica nulla.
 */
export async function creaSessione(s: SessionePesatura, campioni: CampionePesatura[]): Promise<void> {
  const { error } = await supabase.from('sessioni_pesatura').upsert(
    {
      id: s.id, esperimento_id: s.esperimento_id, titolo: s.titolo, tipo: s.tipo, unita: s.unita,
      impostazioni: s.impostazioni, data: s.data, nota: s.nota, conclusa: s.conclusa,
    },
    { onConflict: 'id' },
  )
  if (error) throw error
  await salvaCampioni(s.esperimento_id, campioni)
}

/** Cambia data, nota e chiusura di una sessione. Una sessione eliminata nel frattempo fa fallire l'operazione. */
export async function aggiornaSessione(s: Pick<SessionePesatura, 'id' | 'data' | 'nota' | 'conclusa'>): Promise<void> {
  controllaRighe(
    await supabase.from('sessioni_pesatura').update({ data: s.data, nota: s.nota, conclusa: s.conclusa }).eq('id', s.id).select('id'),
  )
}

/** Salva i campioni (upsert per id). L'esperimento lo dice il chiamante, i campioni non lo portano. */
export async function salvaCampioni(espId: string, campioni: CampionePesatura[]): Promise<void> {
  if (campioni.length === 0) return
  const { error } = await supabase.from('campioni_pesatura').upsert(campioni.map(c => aRigaCampione(espId, c)), { onConflict: 'id' })
  if (error) throw error
}

/**
 * Salva un peso (upsert per id). Mai `creato_da`: lo mette il database. Se un'altra persona ha già pesato lo stesso
 * campione, replica e tipo, il database risponde 23505 su `pesi_unico` (vedi `ePesoGiaInserito`).
 */
export async function salvaPeso(espId: string, sessioneId: string, p: Peso): Promise<void> {
  const { error } = await supabase.from('pesi').upsert(
    {
      id: p.id, campione_id: p.campione_id, sessione_id: sessioneId, esperimento_id: espId, replica: p.replica, tipo: p.tipo,
      valore: p.valore, lettura: p.lettura, misurato_il: p.misurato_il,
    },
    { onConflict: 'id' },
  )
  if (error) throw error
}

export async function eliminaPeso(id: string): Promise<void> {
  controllaRighe(await supabase.from('pesi').delete().eq('id', id).select('id'))
}

/** Elimina una sessione: i suoi campioni e pesi spariscono con lei. */
export async function eliminaSessione(id: string): Promise<void> {
  controllaRighe(await supabase.from('sessioni_pesatura').delete().eq('id', id).select('id'))
}
