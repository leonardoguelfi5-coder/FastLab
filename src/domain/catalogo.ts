import { nuovoId } from '@/lib/id'
import { parametriDello } from './bozza'
import type { Parametro, ParametroCatalogo, Strumento, StrumentoParametro, VoceCatalogo } from './tipi'

/** Un parametro numerico nuovo, copiato da un valore del catalogo e collegato a esso con `catalogo_chiave`. */
function parametroDaCatalogo(pc: ParametroCatalogo, ordine: number): Parametro {
  return {
    id: nuovoId(),
    nome: pc.nome,
    unita: pc.unita,
    tipo: 'numero',
    ordine,
    archiviato: false,
    progressivo: false,
    n_letture: pc.n_letture,
    valore_min: pc.valore_min,
    valore_max: pc.valore_max,
    sotto_campi: [],
    catalogo_chiave: pc.chiave,
  }
}

/**
 * Copia una voce del catalogo in uno strumento dell'esperimento, con un parametro numerico per ogni valore della
 * voce. Gli id sono nuovi (due copie della stessa voce non si sovrappongono); la copia resta collegata alla voce con
 * `catalogo_id` e ogni parametro al suo valore con `catalogo_chiave`, così si può aggiornare in seguito dal catalogo.
 * I parametri sono tutti facoltativi, nell'ordine della voce.
 */
export function strumentoDaCatalogo(v: VoceCatalogo, ordine: number): { strumento: Strumento; parametri: Parametro[] } {
  const parametri: Parametro[] = v.parametri.map((pc, i) => parametroDaCatalogo(pc, i))

  const strumento: Strumento = {
    id: nuovoId(),
    nome: v.nome,
    icona: v.icona,
    ordine,
    tipo: 'strumento',
    archiviato: false,
    catalogo_id: v.id,
    parametri: parametri.map((p, i) => ({ parametro_id: p.id, obbligatorio: false, ordine: i })),
  }

  return { strumento, parametri }
}

/** Il nome come chiave: minuscole, senza accenti, ogni gruppo di caratteri che non sono lettere o cifre diventa un "_". */
function chiaveDaNome(nome: string): string {
  return nome.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

/**
 * Le chiavi dei valori di una voce nuova, una per nome e nello stesso ordine. Il database non controlla che siano non
 * vuote né uniche nella voce, ma l'aggiornamento dal catalogo confronta i valori per chiave: due valori con la stessa
 * chiave (o una vuota) si scambierebbero. Un nome senza lettere né cifre dà `valore`; una chiave già presa riceve
 * `_2`, `_3`, … finché non è libera (anche rispetto alle chiavi che nascono più avanti).
 */
export function chiaviDaNomi(nomi: string[]): string[] {
  const usate = new Set<string>()
  return nomi.map(nome => {
    const base = chiaveDaNome(nome) || 'valore'
    let chiave = base
    for (let n = 2; usate.has(chiave); n++) chiave = `${base}_${n}`
    usate.add(chiave)
    return chiave
  })
}

/**
 * La voce di catalogo che nasce da uno strumento creato a mano (spec §5.10), con la copia già collegata: lo strumento
 * porta il `catalogo_id` della voce nuova e ogni parametro la sua `catalogo_chiave`. Gli id dello strumento e dei
 * parametri restano quelli di prima (la copia è lo stesso strumento, non una nuova). Nome, unità e icona si puliscono
 * come nel catalogo; i valori seguono l'ordine dello strumento. Non modifica gli argomenti: se il salvataggio della
 * voce fallisce, lo strumento originale resta com'era, non collegato. Con `id` la voce prende quell'id: chi ritenta
 * un salvataggio (risposta persa, nome da cambiare) passa lo stesso, così il secondo tentativo è un upsert della
 * stessa voce e non ne crea un'altra.
 */
export function voceDaStrumento(strumento: Strumento, parametri: Parametro[], id: string = nuovoId()): {
  voce: VoceCatalogo; strumento: Strumento; parametri: Parametro[]
} {
  const valori = parametriDello(strumento, parametri)
  const chiavi = chiaviDaNomi(valori.map(p => p.nome))
  const voce: VoceCatalogo = {
    id,
    nome: strumento.nome.trim(),
    icona: strumento.icona?.trim() || null,
    descrizione: '',
    archiviato: false,
    parametri: valori.map((p, i) => ({
      chiave: chiavi[i], nome: p.nome.trim(), unita: p.unita?.trim() || null, n_letture: p.n_letture,
      valore_min: p.valore_min, valore_max: p.valore_max,
    })),
  }
  return {
    voce,
    strumento: { ...strumento, catalogo_id: voce.id },
    parametri: valori.map((p, i) => ({ ...p, catalogo_chiave: chiavi[i] })),
  }
}

/** Uno strumento copiato da una voce del catalogo in un esperimento di cui l'utente è proprietario. */
export interface CopiaStrumento {
  espId: string
  esperimentoNome: string
  strumento: Strumento
  /** I parametri collegati allo strumento, archiviati compresi. */
  parametri: Parametro[]
  /** Ids dei parametri dell'esperimento che compaiono in almeno una misura. */
  conDati: Set<string>
  /**
   * Il massimo `ordine` tra tutti i parametri dell'esperimento (anche di altri strumenti e archiviati), -1 se non ce ne
   * sono: i parametri aggiunti vanno dopo, senza mescolarsi a quelli degli altri strumenti.
   */
  ordineMassimo: number
}

export interface AggiuntaDaCatalogo {
  espId: string
  strumentoId: string
  parametro: Parametro
  /** Il collegamento del parametro nuovo allo strumento, in coda e facoltativo. */
  collegamento: StrumentoParametro
}
/** I campi di un parametro che il catalogo può aggiornare nelle copie. */
export type CampiCatalogo = Partial<Pick<Parametro, 'nome' | 'unita' | 'valore_min' | 'valore_max' | 'n_letture'>>
/**
 * Una modifica a un parametro di una copia: `parametro` è come sarà dopo (per mostrarlo), `campi` i soli campi da
 * scrivere, così un ritocco fatto altrove tra la lettura e l'applicazione non viene sovrascritto con valori vecchi.
 */
export interface ModificaDaCatalogo { espId: string; parametro: Parametro; campi: CampiCatalogo }
export interface PianoAggiornamento { aggiunte: AggiuntaDaCatalogo[]; modifiche: ModificaDaCatalogo[]; saltati: string[] }

type ValoriCatalogo = Required<CampiCatalogo>

/** Il messaggio con cui `pianoAggiornamento` rifiuta di confrontare due voci diverse del catalogo. */
export const VOCI_DIVERSE = 'Le due versioni non sono della stessa voce del catalogo: nessun aggiornamento.'

/**
 * I campi che il catalogo può aggiornare nelle copie, nell'ordine in cui si controllano. `confronto` porta un valore
 * nella forma in cui si confronta (nome e unità senza spazi ai lati, unità vuota come nessuna unità); `bloccatoDaiDati`:
 * con misure già salvate il campo non si aggiorna (meno letture troncherebbero i valori, un'altra unità
 * reinterpreterebbe i numeri già scritti).
 */
const CAMPI: { campo: keyof ValoriCatalogo; etichetta: string; confronto: (v: ValoriCatalogo) => unknown; bloccatoDaiDati: boolean }[] = [
  { campo: 'nome', etichetta: 'nome', confronto: v => v.nome.trim(), bloccatoDaiDati: false },
  { campo: 'unita', etichetta: 'unità', confronto: v => (v.unita ?? '').trim(), bloccatoDaiDati: true },
  { campo: 'valore_min', etichetta: 'minimo', confronto: v => v.valore_min, bloccatoDaiDati: false },
  { campo: 'valore_max', etichetta: 'massimo', confronto: v => v.valore_max, bloccatoDaiDati: false },
  { campo: 'n_letture', etichetta: 'letture', confronto: v => v.n_letture, bloccatoDaiDati: true },
]

/** Valori per chiave; con chiavi doppie vale la prima, come nel resto del confronto. */
function perChiave(parametri: ParametroCatalogo[]): Map<string, ParametroCatalogo> {
  const m = new Map<string, ParametroCatalogo>()
  for (const pc of parametri) if (!m.has(pc.chiave)) m.set(pc.chiave, pc)
  return m
}

/**
 * Cosa cambiare nelle copie di una voce quando la voce passa da `vecchia` a `nuova`, confrontando i parametri per
 * `catalogo_chiave`. Solo modifiche sicure (spec §6.3):
 * - una chiave nuova (assente dalla vecchia voce e dalla copia) diventa un parametro aggiunto in coda; una chiave che
 *   c'era già e che l'utente ha tolto dalla copia non torna;
 * - un campo (nome, unità, minimo, massimo, letture) si aggiorna solo se nella copia è ancora uguale al vecchio valore
 *   del catalogo: se è stato ritoccato a mano resta com'è e finisce tra i `saltati`;
 * - con misure già salvate unità e letture non si aggiornano;
 * - non si elimina nulla (una chiave tolta dal catalogo resta nella copia), il tipo non si tocca, i parametri
 *   archiviati o aggiunti a mano (senza chiave) restano come sono, nome e icona dello strumento pure;
 * - uno strumento archiviato riceve le modifiche ma nessun parametro nuovo (non si misura più).
 * Funzione pura: le copie nell'ordine ricevuto, i loro parametri per `ordine`. Se `vecchia` e `nuova` non sono la
 * stessa voce lancia `VOCI_DIVERSE`: un errore di chi chiama, che non deve sembrare un aggiornamento riuscito a vuoto.
 */
export function pianoAggiornamento(vecchia: VoceCatalogo, nuova: VoceCatalogo, copie: CopiaStrumento[]): PianoAggiornamento {
  if (vecchia.id !== nuova.id) throw new Error(VOCI_DIVERSE)
  const piano: PianoAggiornamento = { aggiunte: [], modifiche: [], saltati: [] }
  const vecchi = perChiave(vecchia.parametri)
  const nuovi = perChiave(nuova.parametri)
  // Più copie nello stesso esperimento: gli ordini dei parametri aggiunti continuano da una copia all'altra.
  const ordineMassimo = new Map<string, number>()

  for (const copia of copie) {
    // Una copia di un'altra voce non si tocca, anche se arrivasse qui per sbaglio.
    if (copia.strumento.catalogo_id !== nuova.id) continue

    for (const p of [...copia.parametri].sort((a, b) => a.ordine - b.ordine)) {
      if (p.archiviato || p.catalogo_chiave === null) continue
      const v = vecchi.get(p.catalogo_chiave)
      const n = nuovi.get(p.catalogo_chiave)
      if (!v || !n) continue

      const dove = `${copia.esperimentoNome} · ${copia.strumento.nome} · ${p.nome}`
      const aggiornato: Parametro = { ...p }
      const campi: CampiCatalogo = {}
      for (const { campo, etichetta, confronto, bloccatoDaiDati } of CAMPI) {
        if (confronto(v) === confronto(n)) continue
        // Già come nel catalogo nuovo (l'utente l'aveva corretto da sé): niente da fare, niente da segnalare.
        if (confronto(p) === confronto(n)) continue
        if (confronto(p) !== confronto(v)) {
          piano.saltati.push(`${dove}: ${etichetta} modificato a mano`)
        } else if (bloccatoDaiDati && copia.conDati.has(p.id)) {
          piano.saltati.push(`${dove}: ${etichetta} non aggiornato, ci sono già misure`)
        } else {
          Object.assign(aggiornato, { [campo]: n[campo] })
          Object.assign(campi, { [campo]: n[campo] })
        }
      }

      // Un minimo nuovo oltre un massimo ritoccato a mano (o viceversa) darebbe un parametro che la configurazione
      // rifiuta: quel limite resta com'era.
      if (aggiornato.valore_min !== null && aggiornato.valore_max !== null && aggiornato.valore_min > aggiornato.valore_max) {
        if ('valore_max' in campi) {
          aggiornato.valore_max = p.valore_max
          delete campi.valore_max
          piano.saltati.push(`${dove}: massimo non aggiornato, sarebbe sotto il minimo`)
        }
        if ('valore_min' in campi) {
          aggiornato.valore_min = p.valore_min
          delete campi.valore_min
          piano.saltati.push(`${dove}: minimo non aggiornato, supererebbe il massimo`)
        }
      }

      if (Object.keys(campi).length > 0) piano.modifiche.push({ espId: copia.espId, parametro: aggiornato, campi })
    }

    // In uno strumento archiviato non si aggiungono valori: non compare più nella misura.
    if (copia.strumento.archiviato) continue

    const presenti = new Set(copia.parametri.map(p => p.catalogo_chiave))
    let ordine = Math.max(ordineMassimo.get(copia.espId) ?? -1, copia.ordineMassimo)
    let ordineCollegamento = Math.max(-1, ...copia.strumento.parametri.map(pp => pp.ordine)) + 1
    for (const pc of nuovi.values()) {
      if (vecchi.has(pc.chiave) || presenti.has(pc.chiave)) continue
      const parametro = parametroDaCatalogo(pc, ++ordine)
      piano.aggiunte.push({
        espId: copia.espId,
        strumentoId: copia.strumento.id,
        parametro,
        collegamento: { parametro_id: parametro.id, obbligatorio: false, ordine: ordineCollegamento++ },
      })
    }
    ordineMassimo.set(copia.espId, ordine)
  }

  return piano
}
