import { nuovoId } from '@/lib/id'
import type { BozzaEsperimento, ConfigEsperimento, Parametro, Strumento, TipoStrumento } from './tipi'

/** Bozza di un nuovo esperimento: nessun fattore, trattamento, pianta, parametro o strumento. */
export function bozzaVuota(): BozzaEsperimento {
  return {
    esperimento: { id: nuovoId(), nome: '', data_inizio: null, note: '', stato: 'in_corso' },
    fattori: [],
    trattamenti: [],
    piante: [],
    parametri: [],
    strumenti: [],
  }
}

/** Parametro nuovo, numerico e senza opzioni, da completare nell'editor. */
export function nuovoParametro(ordine: number): Parametro {
  return {
    id: nuovoId(),
    nome: '',
    unita: null,
    tipo: 'numero',
    ordine,
    archiviato: false,
    progressivo: false,
    n_letture: 1,
    valore_min: null,
    valore_max: null,
    sotto_campi: [],
    catalogo_chiave: null,
  }
}

/** Strumento nuovo, senza nome, icona né parametri, non preso dal catalogo; di tipo 'strumento' se non si dice altro. */
export function nuovoStrumento(ordine: number, tipo: TipoStrumento = 'strumento'): Strumento {
  return { id: nuovoId(), nome: '', icona: null, ordine, tipo, archiviato: false, catalogo_id: null, parametri: [] }
}

type Rimappa = Map<string, string>

function nuoviId(elementi: { id: string }[]): Rimappa {
  return new Map(elementi.map(e => [e.id, nuovoId()]))
}

function rimappa(mappa: Rimappa, id: string): string {
  const nuovo = mappa.get(id)
  if (nuovo === undefined) throw new Error(`Riferimento non valido nella configurazione: ${id}`)
  return nuovo
}

/**
 * Copia la configurazione di un esperimento (non i dati) in una nuova bozza: tutti gli id
 * sono nuovi e i riferimenti rimappati. I parametri e gli strumenti archiviati non si
 * copiano; i parametri archiviati spariscono anche dagli strumenti. La copia riparte "in corso", senza data di inizio; le note restano.
 * I collegamenti al catalogo (`catalogo_id`, `catalogo_chiave`) restano: la copia si aggiorna dal catalogo come l'originale.
 */
export function clonaConfig(c: ConfigEsperimento): BozzaEsperimento {
  const livelli = nuoviId(c.fattori.flatMap(f => f.livelli))
  const fattori = nuoviId(c.fattori)
  const trattamenti = nuoviId(c.trattamenti)
  const attivi = c.parametri.filter(p => !p.archiviato)
  const parametri = nuoviId(attivi)
  const strumentiAttivi = c.strumenti.filter(p => !p.archiviato)
  const strumenti = nuoviId(strumentiAttivi)

  return {
    esperimento: {
      id: nuovoId(),
      nome: `Copia di ${c.esperimento.nome}`,
      data_inizio: null,
      note: c.esperimento.note,
      stato: 'in_corso',
    },
    fattori: c.fattori.map(f => ({
      ...f,
      id: rimappa(fattori, f.id),
      livelli: f.livelli.map(l => ({ ...l, id: rimappa(livelli, l.id) })),
    })),
    trattamenti: c.trattamenti.map(t => ({
      ...t,
      id: rimappa(trattamenti, t.id),
      livello_ids: t.livello_ids.map(id => rimappa(livelli, id)),
    })),
    piante: c.piante.map(p => ({
      ...p,
      id: nuovoId(),
      trattamento_id: rimappa(trattamenti, p.trattamento_id),
    })),
    parametri: attivi.map(p => ({
      ...p,
      id: rimappa(parametri, p.id),
      sotto_campi: p.sotto_campi.map(s => ({ ...s })),
    })),
    strumenti: strumentiAttivi.map(p => ({
      ...p,
      id: rimappa(strumenti, p.id),
      parametri: p.parametri
        .filter(pp => parametri.has(pp.parametro_id))
        .map(pp => ({ ...pp, parametro_id: rimappa(parametri, pp.parametro_id) })),
    })),
  }
}

const normalizza = (s: string) => s.trim().toLowerCase()

/**
 * Etichette che compaiono più di una volta (senza badare a spazi e maiuscole), nell'ordine in cui si ripetono: per
 * ognuna la prima com'è stata scritta, senza spazi ai bordi ("B3-12", non "b3-12").
 */
function duplicate(etichette: string[]): string[] {
  const prime = new Map<string, string>()
  const doppie = new Set<string>()
  for (const e of etichette) {
    const chiave = normalizza(e)
    if (chiave === '') continue
    if (prime.has(chiave)) doppie.add(prime.get(chiave)!)
    else prime.set(chiave, e.trim())
  }
  return [...doppie]
}

/** Controlla che la bozza sia salvabile: restituisce i problemi in italiano, vuoto se è valida. */
export function validaBozza(b: BozzaEsperimento): string[] {
  const errori: string[] = []

  if (b.esperimento.nome.trim() === '') errori.push('Dai un nome all\'esperimento.')

  for (const f of b.fattori) {
    const nome = f.nome.trim()
    if (nome === '') errori.push('Un fattore non ha nome.')
    else if (f.livelli.length === 0) errori.push(`Il fattore "${nome}" non ha livelli.`)
  }
  for (const nome of duplicate(b.fattori.map(f => f.nome))) errori.push(`C'è già un fattore che si chiama "${nome}".`)

  if (b.trattamenti.length === 0) errori.push('Crea almeno un trattamento.')
  if (b.trattamenti.some(t => t.etichetta.trim() === '')) errori.push('Un trattamento non ha etichetta.')
  for (const e of duplicate(b.trattamenti.map(t => t.etichetta))) errori.push(`Etichetta trattamento duplicata: "${e}".`)

  if (b.piante.length === 0) errori.push('Aggiungi almeno una pianta.')
  if (b.piante.some(p => p.etichetta.trim() === '')) errori.push('Una pianta non ha etichetta.')
  for (const e of duplicate(b.piante.map(p => p.etichetta))) errori.push(`Etichetta pianta duplicata: "${e}".`)

  const parametri = b.parametri.filter(p => !p.archiviato)
  if (parametri.length === 0) errori.push('Aggiungi almeno un parametro.')
  for (const p of parametri) errori.push(...problemiParametro(p, parametri))

  if (b.strumenti.length === 0) errori.push('Crea almeno uno strumento.')
  for (const p of b.strumenti) errori.push(...problemiStrumento(p, b.strumenti))

  return errori
}

/**
 * I problemi di un parametro da solo (gli stessi controlli di `validaBozza`), più il nome unico tra `altri`
 * (compresi gli archiviati, senza badare a spazi e maiuscole; un elemento con lo stesso id non conta).
 */
export function problemiParametro(p: Parametro, altri: Parametro[]): string[] {
  const nome = p.nome.trim()
  if (nome === '') return ['Un parametro non ha nome.']

  const errori: string[] = []
  const omonimo = altri.find(a => a.id !== p.id && normalizza(a.nome) === normalizza(nome))
  if (omonimo) {
    errori.push(omonimo.archiviato
      ? `C'è già un parametro archiviato che si chiama "${omonimo.nome.trim()}": ripristinalo invece di crearne uno nuovo.`
      : `C'è già un parametro che si chiama "${omonimo.nome.trim()}".`)
  }
  if (!(p.n_letture >= 1)) errori.push(`Il parametro "${nome}" deve avere almeno una lettura.`)
  else if (p.n_letture > 20) errori.push(`Il parametro "${nome}" può avere al massimo 20 letture.`)
  else if (!Number.isInteger(p.n_letture)) errori.push(`Il parametro "${nome}" deve avere un numero intero di letture.`)
  if (p.tipo === 'lista') {
    if (p.sotto_campi.length === 0) errori.push(`Il parametro "${nome}" deve avere almeno un sotto-campo.`)
    if (p.sotto_campi.some(s => s.nome.trim() === '')) errori.push(`Il parametro "${nome}" ha un sotto-campo senza nome.`)
    for (const doppio of duplicate(p.sotto_campi.map(s => s.nome))) {
      errori.push(`Il parametro "${nome}" ha due sotto-campi con lo stesso nome: "${doppio}".`)
    }
  }
  if (p.valore_min !== null && p.valore_max !== null && p.valore_min > p.valore_max) {
    errori.push(`Il parametro "${nome}" ha il minimo maggiore del massimo.`)
  }
  return errori
}

/**
 * I problemi di uno strumento da solo (gli stessi controlli di `validaBozza`), più il nome unico tra `altre`.
 * Con `attivi` (gli id dei parametri non archiviati) contano solo quei parametri: uno strumento che ha solo
 * parametri archiviati non ha nulla da misurare.
 */
export function problemiStrumento(p: Strumento, altre: Strumento[], attivi?: Set<string>): string[] {
  const nome = p.nome.trim()
  if (nome === '') return ['Uno strumento non ha nome.']

  const errori: string[] = []
  const omonima = altre.find(a => a.id !== p.id && normalizza(a.nome) === normalizza(nome))
  if (omonima) errori.push(`C'è già uno strumento che si chiama "${omonima.nome.trim()}".`)
  const inclusi = attivi ? p.parametri.filter(pp => attivi.has(pp.parametro_id)) : p.parametri
  if (inclusi.length === 0) errori.push(`Lo strumento "${nome}" non ha parametri.`)
  return errori
}

/** Il parametro come si salva: nome e unità senza spazi ai bordi, unità vuota = nessuna (anche nei sotto-campi). */
export function pulisciParametro(p: Parametro): Parametro {
  return {
    ...p,
    nome: p.nome.trim(),
    unita: p.unita?.trim() || null,
    sotto_campi: p.sotto_campi.map(s => ({ ...s, nome: s.nome.trim(), unita: s.unita?.trim() || null })),
  }
}

/**
 * La bozza come si crea: nomi ed etichette senza spazi ai bordi, blocco e icona vuoti = nessuno. Sono le stesse
 * pulizie delle impostazioni, così un esperimento nato dalla procedura è uguale a uno sistemato dopo.
 */
export function pulisciBozza(b: BozzaEsperimento): BozzaEsperimento {
  return {
    ...b,
    esperimento: { ...b.esperimento, nome: b.esperimento.nome.trim() },
    fattori: b.fattori.map(f => ({ ...f, nome: f.nome.trim(), livelli: f.livelli.map(l => ({ ...l, nome: l.nome.trim() })) })),
    trattamenti: b.trattamenti.map(t => ({ ...t, etichetta: t.etichetta.trim() })),
    piante: b.piante.map(p => ({ ...p, etichetta: p.etichetta.trim(), blocco: p.blocco?.trim() || null })),
    parametri: b.parametri.map(pulisciParametro),
    strumenti: b.strumenti.map(p => ({ ...p, nome: p.nome.trim(), icona: p.icona?.trim() || null })),
  }
}
