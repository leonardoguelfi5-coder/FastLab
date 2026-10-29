import { formattaNumero } from '@/lib/numeri'
import type { ElementoLista, Misura, Parametro, ValoreParametro, ValoriMisura } from './tipi'

const TRATTINO = '—'
type Lettura = number | null

/** Valore "non ancora compilato" per il tipo del parametro (istanza nuova a ogni chiamata). */
export function valoreVuoto(p: Parametro): ValoreParametro {
  switch (p.tipo) {
    case 'numero': return Array.from({ length: p.n_letture }, (): Lettura => null)
    case 'testo': return ''
    case 'sino': return null
    case 'lista': return []
  }
}

/** Un valore è vuoto se manca o non porta informazione: letture tutte nulle, testo bianco, sì/no non scelto, lista senza elementi. */
export function eVuoto(p: Parametro, v: ValoreParametro | undefined): boolean {
  switch (p.tipo) {
    case 'numero': return !Array.isArray(v) || v.every(x => x === null)
    case 'testo': return typeof v !== 'string' || v.trim() === ''
    case 'sino': return typeof v !== 'boolean'
    case 'lista': return !Array.isArray(v) || v.length === 0
  }
}

/** Come `eVuoto`, ma deduce il tipo dalla forma del valore (serve dove non si conosce il parametro). */
function vuotoPerForma(v: ValoreParametro | undefined): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (typeof v === 'boolean') return false
  return v.length === 0 || (v as (Lettura | ElementoLista)[]).every(x => x === null)
}

function copiaProfonda(v: ValoreParametro): ValoreParametro {
  if (!Array.isArray(v)) return v
  return (v as (Lettura | ElementoLista)[]).map(x => (x !== null && typeof x === 'object' ? { n: x.n, valori: { ...x.valori } } : x)) as ValoreParametro
}

/** Un parametro numerico può cambiare `n_letture` dopo che esistono dati: completa con null o tronca alle letture attuali. */
function adattaLetture(p: Parametro, v: ValoreParametro): ValoreParametro {
  if (p.tipo !== 'numero' || !Array.isArray(v)) return v
  return Array.from({ length: p.n_letture }, (_, i): Lettura => (v as Lettura[])[i] ?? null)
}

const confronta = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Il valore non vuoto più recente (per data e ora del rilievo) tra le misure fino a `finoA` compreso.
 * `escludiId` salta una misura, per esempio quella che si sta modificando.
 * Restituisce una copia profonda, o `undefined` se non c'è nessun valore.
 */
export function ultimoValore(misure: Misura[], parametroId: string, finoA: string, escludiId?: string): ValoreParametro | undefined {
  let migliore: Misura | undefined
  for (const m of misure) {
    if (m.data_rilievo > finoA || m.id === escludiId) continue
    if (vuotoPerForma(m.valori[parametroId])) continue
    if (!migliore || confronta(`${m.data_rilievo} ${m.ora}`, `${migliore.data_rilievo} ${migliore.ora}`) >= 0) migliore = m
  }
  return migliore ? copiaProfonda(migliore.valori[parametroId]) : undefined
}

/**
 * Valori di partenza per una nuova misura. Per ogni parametro, in ordine di precedenza:
 * l'ultimo valore della pianta (progressivo), il valore ricordato dalle piante precedenti, il valore vuoto.
 */
export function valoriIniziali(a: {
  parametri: Parametro[]; misurePianta: Misura[]; dataRilievo: string; ricordati: ValoriMisura
}): ValoriMisura {
  const valori: ValoriMisura = {}
  for (const p of a.parametri) {
    const storico = p.progressivo ? ultimoValore(a.misurePianta, p.id, a.dataRilievo) : undefined
    const ricordato = p.ricorda_tra_piante ? a.ricordati[p.id] : undefined
    if (storico !== undefined) valori[p.id] = adattaLetture(p, storico)
    else if (ricordato !== undefined && !eVuoto(p, ricordato)) valori[p.id] = adattaLetture(p, copiaProfonda(ricordato))
    else valori[p.id] = valoreVuoto(p)
  }
  return valori
}

function descriviIntervallo(p: Parametro): string {
  const { valore_min: min, valore_max: max } = p
  if (min !== null && max !== null) return `${formattaNumero(min)}–${formattaNumero(max)}`
  if (min !== null) return `≥ ${formattaNumero(min)}`
  return `≤ ${formattaNumero(max)}`
}

/**
 * Controlla i valori prima del salvataggio.
 * Gli errori bloccano il salvataggio; gli avvisi (valore fuori dall'intervallo atteso) no.
 */
export function validaMisura(parametri: Parametro[], obbligatori: Set<string>, valori: ValoriMisura): { errori: string[]; avvisi: string[] } {
  const errori: string[] = []
  const avvisi: string[] = []
  for (const p of parametri) {
    const v = valori[p.id]
    if (eVuoto(p, v)) {
      if (obbligatori.has(p.id)) errori.push(`«${p.nome}» è obbligatorio.`)
      continue
    }
    if (p.tipo === 'lista') {
      for (const e of v as ElementoLista[]) {
        for (const c of p.sotto_campi) {
          const x = e.valori[c.chiave]
          if (x !== null && x !== undefined && !Number.isFinite(x)) errori.push(`«${p.nome}» ${e.n}, ${c.nome}: numero non valido.`)
        }
      }
      continue
    }
    if (p.tipo !== 'numero') continue
    ;(v as Lettura[]).forEach((x, i) => {
      if (x === null) return
      const soggetto = p.n_letture > 1 ? `«${p.nome}» lettura ${i + 1}` : `«${p.nome}»`
      if (!Number.isFinite(x)) {
        errori.push(`${soggetto}: numero non valido.`)
      } else if ((p.valore_min !== null && x < p.valore_min) || (p.valore_max !== null && x > p.valore_max)) {
        const misurato = p.unita ? `${formattaNumero(x)} ${p.unita}` : formattaNumero(x)
        avvisi.push(`${soggetto} = ${misurato} è fuori dall'intervallo atteso (${descriviIntervallo(p)}).`)
      }
    })
  }
  if (errori.length === 0 && parametri.every(p => eVuoto(p, valori[p.id]))) errori.push('Nessun valore inserito.')
  return { errori, avvisi }
}

/** Quante misure della passata indicata ha ogni pianta (le piante senza misure non compaiono). */
export function contaPerPianta(misure: Misura[], passataId: string): Map<string, number> {
  const conteggi = new Map<string, number>()
  for (const m of misure) {
    if (m.passata_id === passataId) conteggi.set(m.pianta_id, (conteggi.get(m.pianta_id) ?? 0) + 1)
  }
  return conteggi
}

/** Misure raggruppate per giorno: giorni dal più recente, ore dalla più antica all'interno del giorno. */
export function raggruppaStoria(misure: Misura[]): { data: string; misure: Misura[] }[] {
  const ordinate = [...misure].sort((a, b) => confronta(b.data_rilievo, a.data_rilievo) || confronta(a.ora, b.ora))
  const gruppi: { data: string; misure: Misura[] }[] = []
  for (const m of ordinate) {
    const ultimo = gruppi[gruppi.length - 1]
    if (ultimo && ultimo.data === m.data_rilievo) ultimo.misure.push(m)
    else gruppi.push({ data: m.data_rilievo, misure: [m] })
  }
  return gruppi
}

/** Testo breve per mostrare un valore in elenchi e riepiloghi. */
export function formattaValore(p: Parametro, v: ValoreParametro | undefined): string {
  if (eVuoto(p, v)) return TRATTINO
  switch (p.tipo) {
    case 'numero': {
      const letture = (v as Lettura[]).filter((x): x is number => x !== null).map(formattaNumero).join(' / ')
      return p.unita ? `${letture} ${p.unita}` : letture
    }
    case 'testo': return (v as string).trim()
    case 'sino': return v ? 'Sì' : 'No'
    case 'lista': {
      const elementi = v as ElementoLista[]
      if (p.sotto_campi.length !== 1) return elementi.length === 1 ? '1 elemento' : `${elementi.length} elementi`
      const chiave = p.sotto_campi[0].chiave
      const valori = elementi.map(e => {
        const x = e.valori[chiave]
        return x === null || x === undefined ? TRATTINO : formattaNumero(x)
      })
      return `${elementi.length} (${valori.join(', ')})`
    }
  }
}
