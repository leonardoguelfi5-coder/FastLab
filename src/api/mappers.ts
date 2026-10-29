import type {
  ConfigEsperimento, Esperimento, Fattore, Livello, Misura, Parametro, ParametroCatalogo, Strumento, StrumentoParametro,
  Pianta, SottoCampo, Trattamento, TipoParametro, TipoStrumento, ValoriMisura, VoceCatalogo,
} from '@/domain/tipi'

// Righe come le restituisce PostgREST (select('*')). Le colonne esperimento_id, creato_da,
// creato_il e simili esistono solo nel database: i mapper di lettura non le portano nel
// dominio (così clonaConfig non le copia) e quelli di scrittura aggiungono esperimento_id
// ma mai creato_da (authenticated non ha il privilegio di UPDATE su quella colonna).

export interface RigaEsperimento {
  id: string; nome: string; data_inizio: string | null; note: string; stato: Esperimento['stato']
  creato_da: string; creato_il: string
}
export interface RigaFattore { id: string; esperimento_id: string; nome: string; ordine: number }
export interface RigaLivello { id: string; esperimento_id: string; fattore_id: string; nome: string; ordine: number }
export interface RigaTrattamento { id: string; esperimento_id: string; etichetta: string; ordine: number }
export interface RigaTrattamentoLivello { esperimento_id: string; trattamento_id: string; livello_id: string }
export interface RigaPianta {
  id: string; esperimento_id: string; trattamento_id: string; etichetta: string; blocco: string | null; ordine: number
}
export interface RigaParametro {
  id: string; esperimento_id: string; nome: string; unita: string | null; tipo: TipoParametro; ordine: number
  archiviato: boolean; progressivo: boolean; n_letture: number
  valore_min: number | null; valore_max: number | null; sotto_campi: SottoCampo[]; catalogo_chiave: string | null
}
export interface RigaStrumento {
  id: string; esperimento_id: string; nome: string; icona: string | null; ordine: number; tipo: TipoStrumento; archiviato: boolean
  catalogo_id: string | null
}
export interface RigaStrumentoParametro {
  esperimento_id: string; strumento_id: string; parametro_id: string; obbligatorio: boolean; ordine: number
}
export interface RigaMisura {
  id: string; esperimento_id: string; pianta_id: string; strumento_id: string; data_rilievo: string; ora: string
  valori: ValoriMisura; creato_da?: string; creato_il?: string; aggiornato_il?: string
}

export interface RigheConfig {
  esperimento: RigaEsperimento
  fattori: RigaFattore[]
  livelli: RigaLivello[]
  trattamenti: RigaTrattamento[]
  trattamento_livelli: RigaTrattamentoLivello[]
  piante: RigaPianta[]
  parametri: RigaParametro[]
  strumenti: RigaStrumento[]
  strumento_parametri: RigaStrumentoParametro[]
}

const perOrdine = <T extends { ordine: number }>(a: T, b: T): number => a.ordine - b.ordine

/** Raggruppa per chiave, mantenendo l'ordine di ingresso dentro ogni gruppo. */
function raggruppa<T>(righe: T[], chiave: (r: T) => string): Map<string, T[]> {
  const gruppi = new Map<string, T[]>()
  for (const r of righe) {
    const k = chiave(r)
    const gruppo = gruppi.get(k)
    if (gruppo) gruppo.push(r)
    else gruppi.set(k, [r])
  }
  return gruppi
}

/** Compone la configurazione di un esperimento dalle righe delle sue tabelle, tutto ordinato per `ordine`. */
export function daRigheConfig(r: RigheConfig): ConfigEsperimento {
  const esperimento: Esperimento = {
    id: r.esperimento.id,
    nome: r.esperimento.nome,
    data_inizio: r.esperimento.data_inizio,
    note: r.esperimento.note,
    stato: r.esperimento.stato,
  }

  const livelliPerFattore = raggruppa([...r.livelli].sort(perOrdine), l => l.fattore_id)
  const fattori: Fattore[] = [...r.fattori].sort(perOrdine).map(f => ({
    id: f.id,
    nome: f.nome,
    ordine: f.ordine,
    livelli: (livelliPerFattore.get(f.id) ?? []).map((l): Livello => ({ id: l.id, nome: l.nome, ordine: l.ordine })),
  }))

  // Posizione di ogni livello (fattori e livelli in ordine): i livello_ids di un trattamento
  // seguono l'ordine dei fattori, come li produce generaTrattamenti.
  const posizione = new Map(fattori.flatMap(f => f.livelli).map((l, i) => [l.id, i]))
  const livelliPerTrattamento = raggruppa(r.trattamento_livelli, tl => tl.trattamento_id)
  const trattamenti: Trattamento[] = [...r.trattamenti].sort(perOrdine).map(t => ({
    id: t.id,
    etichetta: t.etichetta,
    ordine: t.ordine,
    livello_ids: (livelliPerTrattamento.get(t.id) ?? [])
      .map(tl => tl.livello_id)
      .sort((a, b) => (posizione.get(a) ?? 0) - (posizione.get(b) ?? 0)),
  }))

  const piante: Pianta[] = [...r.piante].sort(perOrdine).map(p => ({
    id: p.id,
    trattamento_id: p.trattamento_id,
    etichetta: p.etichetta,
    blocco: p.blocco,
    ordine: p.ordine,
  }))

  const parametri: Parametro[] = [...r.parametri].sort(perOrdine).map(p => ({
    id: p.id,
    nome: p.nome,
    unita: p.unita,
    tipo: p.tipo,
    ordine: p.ordine,
    archiviato: p.archiviato,
    progressivo: p.progressivo,
    n_letture: p.n_letture,
    valore_min: p.valore_min,
    valore_max: p.valore_max,
    sotto_campi: p.sotto_campi.map(s => ({ chiave: s.chiave, nome: s.nome, unita: s.unita })),
    // `?? null`: una riga letta da un database senza la colonna non lascia undefined nel dominio.
    catalogo_chiave: p.catalogo_chiave ?? null,
  }))

  const parametriPerStrumento = raggruppa([...r.strumento_parametri].sort(perOrdine), pp => pp.strumento_id)
  const strumenti: Strumento[] = [...r.strumenti].sort(perOrdine).map(p => ({
    id: p.id,
    nome: p.nome,
    icona: p.icona,
    ordine: p.ordine,
    tipo: p.tipo,
    archiviato: p.archiviato,
    catalogo_id: p.catalogo_id ?? null,
    parametri: (parametriPerStrumento.get(p.id) ?? []).map((pp): StrumentoParametro => ({
      parametro_id: pp.parametro_id,
      obbligatorio: pp.obbligatorio,
      ordine: pp.ordine,
    })),
  }))

  return { esperimento, fattori, trattamenti, piante, parametri, strumenti }
}

/** Da riga del database a Misura: `ora` passa da HH:MM:SS a HH:MM; le colonne solo-database cadono. */
export function daRigaMisura(r: RigaMisura): Misura {
  return {
    id: r.id,
    pianta_id: r.pianta_id,
    strumento_id: r.strumento_id,
    data_rilievo: r.data_rilievo,
    ora: r.ora.slice(0, 5),
    valori: r.valori,
  }
}

/** Riga da scrivere per una misura: solo colonne scrivibili, mai creato_da. */
export function aRigaMisura(espId: string, m: Misura) {
  return {
    id: m.id,
    esperimento_id: espId,
    pianta_id: m.pianta_id,
    strumento_id: m.strumento_id,
    data_rilievo: m.data_rilievo,
    ora: m.ora,
    valori: m.valori,
  }
}

export function aRigaParametro(espId: string, p: Parametro): RigaParametro {
  return {
    id: p.id,
    esperimento_id: espId,
    nome: p.nome,
    unita: p.unita,
    tipo: p.tipo,
    ordine: p.ordine,
    archiviato: p.archiviato,
    progressivo: p.progressivo,
    n_letture: p.n_letture,
    valore_min: p.valore_min,
    valore_max: p.valore_max,
    sotto_campi: p.sotto_campi,
    catalogo_chiave: p.catalogo_chiave,
  }
}

export function aRigaPianta(espId: string, p: Pianta): RigaPianta {
  return {
    id: p.id,
    esperimento_id: espId,
    trattamento_id: p.trattamento_id,
    etichetta: p.etichetta,
    blocco: p.blocco,
    ordine: p.ordine,
  }
}

/** Solo la riga dello strumento: i suoi parametri vanno in strumento_parametri (aRigaStrumentoParametro). */
export function aRigaStrumento(espId: string, p: Strumento): RigaStrumento {
  return {
    id: p.id, esperimento_id: espId, nome: p.nome, icona: p.icona, ordine: p.ordine, tipo: p.tipo, archiviato: p.archiviato,
    catalogo_id: p.catalogo_id,
  }
}

export function aRigaStrumentoParametro(espId: string, strumentoId: string, pp: StrumentoParametro): RigaStrumentoParametro {
  return {
    esperimento_id: espId,
    strumento_id: strumentoId,
    parametro_id: pp.parametro_id,
    obbligatorio: pp.obbligatorio,
    ordine: pp.ordine,
  }
}

/** Una voce del catalogo come la restituisce PostgREST: `parametri` è JSON libero, letto con tolleranza. */
export interface RigaCatalogo {
  id: string; nome: string; icona: string | null; descrizione: string | null; parametri: unknown; archiviato: boolean
  creato_da?: string | null; creato_il?: string; aggiornato_il?: string
}

const numeroONull = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)

/**
 * Un valore della voce dal JSON del database. Il JSON non ha schema nel database (solo "è un array"): un campo
 * mancante o di tipo sbagliato prende il default (unità e limiti null, una lettura) invece di rompere la pagina.
 * Le letture valide sono quelle che accetta `parametri.n_letture` (da 1 a 20).
 */
function daJsonParametroCatalogo(x: unknown): ParametroCatalogo {
  const o = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>
  const n = o.n_letture
  return {
    chiave: typeof o.chiave === 'string' ? o.chiave : '',
    nome: typeof o.nome === 'string' ? o.nome : '',
    unita: typeof o.unita === 'string' ? o.unita : null,
    n_letture: typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 20 ? n : 1,
    valore_min: numeroONull(o.valore_min),
    valore_max: numeroONull(o.valore_max),
  }
}

/** Da riga del database a voce del catalogo: le colonne solo-database (creato_da, date) cadono. */
export function daRigaCatalogo(r: RigaCatalogo): VoceCatalogo {
  return {
    id: r.id,
    nome: r.nome,
    icona: r.icona ?? null,
    descrizione: r.descrizione ?? '',
    parametri: Array.isArray(r.parametri) ? r.parametri.map(daJsonParametroCatalogo) : [],
    archiviato: r.archiviato,
  }
}

/** Riga da scrivere per una voce del catalogo: solo colonne scrivibili, mai creato_da, creato_il o aggiornato_il. */
export function aRigaCatalogo(v: VoceCatalogo) {
  return {
    id: v.id,
    nome: v.nome,
    icona: v.icona,
    descrizione: v.descrizione,
    parametri: v.parametri.map(p => ({
      chiave: p.chiave, nome: p.nome, unita: p.unita, n_letture: p.n_letture, valore_min: p.valore_min, valore_max: p.valore_max,
    })),
    archiviato: v.archiviato,
  }
}
