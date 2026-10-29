import { nuovoId } from '@/lib/id'
import type { BozzaEsperimento, Fattore, Parametro, Strumento, VoceCatalogo } from '../tipi'
import { bozzaVuota } from '../bozza'
import { strumentoDaCatalogo } from '../catalogo'
import { SEMI_CATALOGO } from './semi'
import { generaTrattamenti } from '../trattamenti'
import { generaPiante } from '../piante'

function fattore(nome: string, ordine: number, livelli: string[]): Fattore {
  return {
    id: nuovoId(),
    nome,
    ordine,
    livelli: livelli.map((l, i) => ({ id: nuovoId(), nome: l, ordine: i })),
  }
}

function parametro(nome: string, ordine: number, extra: Partial<Parametro> = {}): Parametro {
  return {
    id: nuovoId(),
    nome,
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
    ...extra,
  }
}

/** Strumento della tabella fenologica, con i parametri nell'ordine dato, tutti facoltativi. */
function tabellaFenologica(ordine: number, parametri: Parametro[]): Strumento {
  return {
    id: nuovoId(),
    nome: 'Tabella fenologica',
    icona: '🌱',
    ordine,
    tipo: 'fenologico',
    archiviato: false,
    catalogo_id: null,
    parametri: parametri.map((p, i) => ({ parametro_id: p.id, obbligatorio: false, ordine: i })),
  }
}

const normalizza = (s: string) => s.trim().toLowerCase()

/**
 * Lo strumento di nome `nome` preso dal catalogo (tra le voci non archiviate, senza badare a spazi e maiuscole).
 * Se la voce non c'è si costruisce dagli stessi dati dei semi, ma senza collegamento: `catalogo_id` resta null perché
 * nel catalogo non c'è nessuna voce a cui agganciarsi.
 */
function dalCatalogo(catalogo: VoceCatalogo[], nome: string, ordine: number): { strumento: Strumento; parametri: Parametro[] } {
  const voce = catalogo.find(v => !v.archiviato && normalizza(v.nome) === normalizza(nome))
  if (voce) return strumentoDaCatalogo(voce, ordine)
  const seme = SEMI_CATALOGO.find(v => normalizza(v.nome) === normalizza(nome))
  if (!seme) throw new Error(`Manca il seme del catalogo "${nome}".`)
  const { strumento, parametri } = strumentoDaCatalogo(seme, ordine)
  return { strumento: { ...strumento, catalogo_id: null }, parametri }
}

/**
 * Modello "Hydrochar × Cuore di Bue": la configurazione della v2 (elenco piante, parametri
 * e strumenti dell'app) espressa come bozza di esperimento v3.
 * Piante 1–56: 14 di Controllo, poi 6 per ciascuno degli altri 7 trattamenti.
 * Gli strumenti Termometro, SPAD e Metro si copiano dal `catalogo` (per nome); la Tabella fenologica ha le sue
 * voci, tutte facoltative. L'altezza la misura il Metro, non la tabella: un parametro sta in un solo strumento.
 */
export function bozzaHydrochar(catalogo: VoceCatalogo[]): BozzaEsperimento {
  const bozza = bozzaVuota()
  bozza.esperimento.nome = 'Hydrochar × Cuore di Bue'

  const stress = fattore('Stress', 0, ['Controllo', 'S1', 'W1', 'S1W1'])
  const hydrochar = fattore('Hydrochar', 1, ['No', 'Sì'])
  bozza.fattori = [stress, hydrochar]

  // Stress × Hydrochar darebbe "Controllo + No", "Controllo + Sì", …: nel modello il trattamento
  // senza hydrochar si chiama come lo stress, quello con hydrochar aggiunge " + HC".
  // Hydrochar ha due livelli, quindi i trattamenti vengono a coppie (senza, con) per ogni stress.
  bozza.trattamenti = generaTrattamenti(bozza.fattori).map((t, i) => {
    const stressNome = stress.livelli[Math.floor(i / 2)].nome
    return { ...t, etichetta: i % 2 === 0 ? stressNome : `${stressNome} + HC` }
  })
  bozza.piante = generaPiante(bozza.trattamenti.map((t, i) => ({ trattamento_id: t.id, n: i === 0 ? 14 : 6 })))

  const termometro = dalCatalogo(catalogo, 'Termometro', 0)
  const spad = dalCatalogo(catalogo, 'SPAD', 1)
  const metro = dalCatalogo(catalogo, 'Metro', 2)

  const nPalchi = parametro('N palchi totali', 0, { progressivo: true })
  const nFiori = parametro('N fiori fioriti', 0)
  const nFrutti = parametro('N frutti', 0)
  const nInvaiati = parametro('N frutti invaiati', 0)
  const palchi = parametro('Palchi', 0, {
    tipo: 'lista', progressivo: true,
    sotto_campi: [{ chiave: 'n_foglie', nome: 'N foglie', unita: null }],
  })
  const infiorescenze = parametro('Infiorescenze', 0, {
    tipo: 'lista', progressivo: true,
    sotto_campi: [{ chiave: 'n_fiori', nome: 'N fiori', unita: null }],
  })
  const note = parametro('Note', 0, { tipo: 'testo' })
  const fenologici = [nPalchi, nFiori, nFrutti, nInvaiati, palchi, infiorescenze, note]

  bozza.strumenti = [termometro.strumento, spad.strumento, metro.strumento, tabellaFenologica(3, fenologici)]
  // L'ordine dei parametri è unico nell'esperimento (non riparte da zero in ogni strumento).
  bozza.parametri = [...termometro.parametri, ...spad.parametri, ...metro.parametri, ...fenologici]
    .map((p, i) => ({ ...p, ordine: i }))

  return bozza
}
