import type { BozzaEsperimento, ConfigEsperimento } from './tipi'

/** Bozza di un nuovo esperimento: nessun fattore, trattamento, pianta, parametro o passata. */
export function bozzaVuota(): BozzaEsperimento {
  return {
    esperimento: { id: crypto.randomUUID(), nome: '', data_inizio: null, note: '', stato: 'in_corso' },
    fattori: [],
    trattamenti: [],
    piante: [],
    parametri: [],
    passate: [],
  }
}

type Rimappa = Map<string, string>

function nuoviId(elementi: { id: string }[]): Rimappa {
  return new Map(elementi.map(e => [e.id, crypto.randomUUID()]))
}

function rimappa(mappa: Rimappa, id: string): string {
  const nuovo = mappa.get(id)
  if (nuovo === undefined) throw new Error(`Riferimento non valido nella configurazione: ${id}`)
  return nuovo
}

/**
 * Copia la configurazione di un esperimento (non i dati) in una nuova bozza: tutti gli id
 * sono nuovi e i riferimenti rimappati. I parametri archiviati non si copiano, e spariscono
 * anche dalle passate. La copia riparte "in corso", senza data di inizio; le note restano.
 */
export function clonaConfig(c: ConfigEsperimento): BozzaEsperimento {
  const livelli = nuoviId(c.fattori.flatMap(f => f.livelli))
  const fattori = nuoviId(c.fattori)
  const trattamenti = nuoviId(c.trattamenti)
  const attivi = c.parametri.filter(p => !p.archiviato)
  const parametri = nuoviId(attivi)
  const passate = nuoviId(c.passate)

  return {
    esperimento: {
      id: crypto.randomUUID(),
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
      id: crypto.randomUUID(),
      trattamento_id: rimappa(trattamenti, p.trattamento_id),
    })),
    parametri: attivi.map(p => ({
      ...p,
      id: rimappa(parametri, p.id),
      sotto_campi: p.sotto_campi.map(s => ({ ...s })),
    })),
    passate: c.passate.map(p => ({
      ...p,
      id: rimappa(passate, p.id),
      parametri: p.parametri
        .filter(pp => parametri.has(pp.parametro_id))
        .map(pp => ({ ...pp, parametro_id: rimappa(parametri, pp.parametro_id) })),
    })),
  }
}

const normalizza = (s: string) => s.trim().toLowerCase()

/** Etichette (normalizzate) che compaiono più di una volta, nell'ordine in cui si ripetono. */
function duplicate(etichette: string[]): string[] {
  const viste = new Set<string>()
  const doppie = new Set<string>()
  for (const e of etichette.map(normalizza)) {
    if (e === '') continue
    if (viste.has(e)) doppie.add(e)
    viste.add(e)
  }
  return [...doppie]
}

/** Controlla che la bozza sia salvabile: restituisce i problemi in italiano, vuoto se è valida. */
export function validaBozza(b: BozzaEsperimento): string[] {
  const errori: string[] = []

  if (b.esperimento.nome.trim() === '') errori.push('Dai un nome all\'esperimento.')

  if (b.trattamenti.length === 0) errori.push('Crea almeno un trattamento.')
  if (b.trattamenti.some(t => t.etichetta.trim() === '')) errori.push('Un trattamento non ha etichetta.')
  for (const e of duplicate(b.trattamenti.map(t => t.etichetta))) errori.push(`Etichetta trattamento duplicata: "${e}".`)

  if (b.piante.length === 0) errori.push('Aggiungi almeno una pianta.')
  if (b.piante.some(p => p.etichetta.trim() === '')) errori.push('Una pianta non ha etichetta.')
  for (const e of duplicate(b.piante.map(p => p.etichetta))) errori.push(`Etichetta pianta duplicata: "${e}".`)

  const parametri = b.parametri.filter(p => !p.archiviato)
  if (parametri.length === 0) errori.push('Aggiungi almeno un parametro.')
  for (const p of parametri) {
    const nome = p.nome.trim()
    if (nome === '') { errori.push('Un parametro non ha nome.'); continue }
    if (!(p.n_letture >= 1)) errori.push(`Il parametro "${nome}" deve avere almeno una lettura.`)
    else if (p.n_letture > 20) errori.push(`Il parametro "${nome}" può avere al massimo 20 letture.`)
    if (p.tipo === 'lista' && p.sotto_campi.length === 0) errori.push(`Il parametro "${nome}" deve avere almeno un sotto-campo.`)
    if (p.valore_min !== null && p.valore_max !== null && p.valore_min > p.valore_max) {
      errori.push(`Il parametro "${nome}" ha il minimo maggiore del massimo.`)
    }
  }

  if (b.passate.length === 0) errori.push('Crea almeno una passata.')
  for (const p of b.passate) {
    const nome = p.nome.trim()
    if (nome === '') { errori.push('Una passata non ha nome.'); continue }
    if (p.parametri.length === 0) errori.push(`La passata "${nome}" non ha parametri.`)
  }

  return errori
}
