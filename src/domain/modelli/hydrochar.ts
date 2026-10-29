import { nuovoId } from '@/lib/id'
import type { BozzaEsperimento, Fattore, Parametro, Passata } from '../tipi'
import { bozzaVuota } from '../bozza'
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
    ricorda_tra_piante: false,
    n_letture: 1,
    valore_min: null,
    valore_max: null,
    sotto_campi: [],
    ...extra,
  }
}

/** Passata con i parametri nell'ordine dato, tutti facoltativi. */
function passata(nome: string, icona: string, ordine: number, parametri: Parametro[]): Passata {
  return {
    id: nuovoId(),
    nome,
    icona,
    ordine,
    parametri: parametri.map((p, i) => ({ parametro_id: p.id, obbligatorio: false, ordine: i })),
  }
}

/**
 * Modello "Hydrochar × Cuore di Bue": la configurazione della v2 (elenco piante, parametri
 * e passate dell'app) espressa come bozza di esperimento v3.
 * Piante 1–56: 14 di Controllo, poi 6 per ciascuno degli altri 7 trattamenti.
 */
export function bozzaHydrochar(): BozzaEsperimento {
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

  const tempAria = parametro('Temp aria', 0, { unita: '°C', ricorda_tra_piante: true })
  const tempPianta = parametro('Temp pianta', 1, { unita: '°C' })
  const spad = parametro('SPAD', 2)
  const altezza = parametro('Altezza', 3, { unita: 'cm' })
  const nPalchi = parametro('N palchi totali', 4, { progressivo: true })
  const nFiori = parametro('N fiori fioriti', 5)
  const nFrutti = parametro('N frutti', 6)
  const nInvaiati = parametro('N frutti invaiati', 7)
  const palchi = parametro('Palchi', 8, {
    tipo: 'lista', progressivo: true,
    sotto_campi: [{ chiave: 'n_foglie', nome: 'N foglie', unita: null }],
  })
  const infiorescenze = parametro('Infiorescenze', 9, {
    tipo: 'lista', progressivo: true,
    sotto_campi: [{ chiave: 'n_fiori', nome: 'N fiori', unita: null }],
  })
  const note = parametro('Note', 10, { tipo: 'testo' })
  bozza.parametri = [tempAria, tempPianta, spad, altezza, nPalchi, nFiori, nFrutti, nInvaiati, palchi, infiorescenze, note]

  bozza.passate = [
    passata('Termometro', '🌡', 0, [tempAria, tempPianta]),
    passata('SPAD', '💚', 1, [spad]),
    passata('Altezza', '📏', 2, [altezza]),
    passata('Fenologici', '🌱', 3, [altezza, nPalchi, nFiori, nFrutti, nInvaiati, palchi, infiorescenze, note]),
  ]

  return bozza
}
