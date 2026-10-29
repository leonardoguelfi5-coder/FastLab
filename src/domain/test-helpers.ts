import type { BozzaEsperimento, ConfigEsperimento, Fattore, Parametro, Pianta } from './tipi'
import { bozzaVuota } from './bozza'

/** Fattore di test con livelli ordinati e id nuovi. */
export function fattore(nome: string, livelli: string[]): Fattore {
  return {
    id: crypto.randomUUID(),
    nome,
    ordine: 0,
    livelli: livelli.map((n, i) => ({ id: crypto.randomUUID(), nome: n, ordine: i })),
  }
}

/** Piante di test: una per etichetta, tutte sullo stesso trattamento fittizio. */
export function piante(etichette: string[], trattamentoId = 't1'): Pianta[] {
  return etichette.map((etichetta, i) => ({
    id: crypto.randomUUID(),
    trattamento_id: trattamentoId,
    etichetta,
    blocco: null,
    ordine: i,
  }))
}

export function parametro(nome: string, extra: Partial<Parametro> = {}): Parametro {
  return {
    id: crypto.randomUUID(),
    nome,
    unita: null,
    tipo: 'numero',
    ordine: 0,
    archiviato: false,
    progressivo: false,
    n_letture: 1,
    valore_min: null,
    valore_max: null,
    sotto_campi: [],
    catalogo_chiave: null,
    ...extra,
  }
}

/** Bozza valida con una sola riga di ogni tipo e le piante indicate. */
export function conPiante(etichette: string[]): BozzaEsperimento {
  const par = parametro('Altezza', { unita: 'cm' })
  const trattamentoId = crypto.randomUUID()
  const b = bozzaVuota()
  b.esperimento.nome = 'Prova'
  b.trattamenti = [{ id: trattamentoId, etichetta: 'Controllo', ordine: 0, livello_ids: [] }]
  b.piante = piante(etichette, trattamentoId)
  b.parametri = [par]
  b.strumenti = [{
    id: crypto.randomUUID(), nome: 'Altezza', icona: null, ordine: 0, tipo: 'strumento', archiviato: false, catalogo_id: null,
    parametri: [{ parametro_id: par.id, obbligatorio: false, ordine: 0 }],
  }]
  return b
}

/**
 * Configurazione completa e valida: 2 fattori, 4 trattamenti, 4 piante,
 * parametri di ogni tipo (compreso uno archiviato) e due strumenti.
 */
export function configDiEsempio(): ConfigEsperimento {
  const stress = fattore('Stress', ['Controllo', 'S1'])
  const hc = fattore('Hydrochar', ['No', 'Sì'])
  const livelli = [stress, hc].map(f => f.livelli)
  const trattamenti = livelli[0].flatMap(a => livelli[1].map(bl => [a, bl] as const)).map(([a, bl], i) => ({
    id: crypto.randomUUID(),
    etichetta: `${a.nome} + ${bl.nome}`,
    ordine: i,
    livello_ids: [a.id, bl.id],
  }))
  const altezza = parametro('Altezza', { unita: 'cm', ordine: 0, valore_min: 0, valore_max: 300 })
  const palchi = parametro('Palchi', {
    tipo: 'lista', ordine: 1, progressivo: true,
    sotto_campi: [{ chiave: 'n_foglie', nome: 'N foglie', unita: null }],
  })
  const note = parametro('Note', { tipo: 'testo', ordine: 2 })
  const vecchio = parametro('Vecchio', { ordine: 3, archiviato: true })
  return {
    esperimento: { id: crypto.randomUUID(), nome: 'Esempio', data_inizio: '2026-10-28', note: 'una nota', stato: 'in_corso' },
    fattori: [stress, hc],
    trattamenti,
    piante: trattamenti.map((t, i) => ({
      id: crypto.randomUUID(), trattamento_id: t.id, etichetta: String(i + 1), blocco: null, ordine: i,
    })),
    parametri: [altezza, palchi, note, vecchio],
    strumenti: [
      {
        id: crypto.randomUUID(), nome: 'Altezza', icona: '📏', ordine: 0, tipo: 'strumento', archiviato: false, catalogo_id: null,
        parametri: [
          { parametro_id: altezza.id, obbligatorio: true, ordine: 0 },
          { parametro_id: vecchio.id, obbligatorio: false, ordine: 1 },
        ],
      },
      {
        id: crypto.randomUUID(), nome: 'Fenologici', icona: '🌱', ordine: 1, tipo: 'strumento', archiviato: false, catalogo_id: null,
        parametri: [
          { parametro_id: palchi.id, obbligatorio: false, ordine: 0 },
          { parametro_id: note.id, obbligatorio: false, ordine: 1 },
        ],
      },
    ],
  }
}
