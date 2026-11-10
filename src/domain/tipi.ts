export type TipoParametro = 'numero' | 'testo' | 'sino' | 'lista'
export interface SottoCampo { chiave: string; nome: string; unita: string | null }
export interface ElementoLista { n: number; valori: Record<string, number | null> }
export type ValoreParametro = (number | null)[] | string | boolean | null | ElementoLista[]
// numero → (number|null)[] di lunghezza n_letture · testo → string · sino → boolean|null · lista → ElementoLista[]
export type ValoriMisura = Record<string, ValoreParametro>
export interface Esperimento { id: string; nome: string; data_inizio: string | null; note: string; stato: 'in_corso' | 'concluso' }
export interface Livello { id: string; nome: string; ordine: number }
export interface Fattore { id: string; nome: string; ordine: number; livelli: Livello[] }
export interface Trattamento { id: string; etichetta: string; ordine: number; livello_ids: string[] }
export interface Pianta { id: string; trattamento_id: string; etichetta: string; blocco: string | null; ordine: number }
/** `catalogo_chiave`: la chiave del valore nella voce del catalogo da cui il parametro è copiato, null se aggiunto a mano. */
export interface Parametro { id: string; nome: string; unita: string | null; tipo: TipoParametro; ordine: number;
  archiviato: boolean; progressivo: boolean; n_letture: number;
  valore_min: number | null; valore_max: number | null; sotto_campi: SottoCampo[]; catalogo_chiave: string | null }
export interface StrumentoParametro { parametro_id: string; obbligatorio: boolean; ordine: number }
/** 'strumento': un gruppo di parametri misurati insieme in campo; 'fenologico': la tabella fenologica (al massimo una). */
export type TipoStrumento = 'strumento' | 'fenologico'
/** `catalogo_id`: la voce del catalogo da cui lo strumento è copiato, null se creato a mano. */
export interface Strumento { id: string; nome: string; icona: string | null; ordine: number; tipo: TipoStrumento;
  archiviato: boolean; catalogo_id: string | null; parametri: StrumentoParametro[] }
/** Un valore di una voce del catalogo: diventa un parametro numerico nella copia, con `catalogo_chiave` = `chiave`. */
export interface ParametroCatalogo { chiave: string; nome: string; unita: string | null; n_letture: number;
  valore_min: number | null; valore_max: number | null }
/** Una voce del catalogo strumenti, condiviso tra tutti gli utenti. Le voci non si eliminano: si archiviano. */
export interface VoceCatalogo { id: string; nome: string; icona: string | null; descrizione: string;
  parametri: ParametroCatalogo[]; archiviato: boolean }
export interface ConfigEsperimento { esperimento: Esperimento; fattori: Fattore[]; trattamenti: Trattamento[];
  piante: Pianta[]; parametri: Parametro[]; strumenti: Strumento[] }
export type BozzaEsperimento = ConfigEsperimento   // stessa forma; ids generati dal client con nuovoId() (src/lib/id.ts)
/**
 * `creato_da` (Piano E, Task E10) è chi ha scritto la riga, come lo firma il database: lo legge l'interfaccia per
 * mostrare "Correggi" ed "Elimina" al rilevatore solo sulle cose sue. Manca in una voce nata sul telefono (in coda,
 * bozza) e nella copia salvata prima: chi lo legge la tratta come propria. Non si scrive mai.
 */
export interface Misura { id: string; pianta_id: string; strumento_id: string; data_rilievo: string; ora: string; valori: ValoriMisura; creato_da?: string }
/**
 * Una nota del Diario. Senza collegamenti (`pianta_ids` e `trattamento_ids` vuoti) riguarda tutto l'esperimento; con i
 * collegamenti, solo quei trattamenti o quelle piante (la scelta è una sola delle tre, non si mescolano).
 * `promemoria`: lo decide chi salva (data futura) e resta anche quando la data arriva; `fatto_il` (data e ora ISO) c'è
 * solo dopo la spunta.
 */
export interface Nota { id: string; data: string; testo: string; promemoria: boolean; fatto_il: string | null;
  pianta_ids: string[]; trattamento_ids: string[]; creato_da?: string }

/**
 * Una foto dell'esperimento. Il file sta nello Storage in `percorso` (`<esperimento_id>/<id>.jpg`); può essere collegata
 * a una pianta, a una nota o a niente (solo l'esperimento). `archiviata`: il file è stato tolto dallo Storage dopo
 * l'archivio .zip, la riga resta; `archiviata_il` (istante ISO) dice quando, e c'è se e solo se `archiviata` (lo impone
 * il database). Dimensioni e peso sono quelli del file compresso.
 */
export interface Foto { id: string; data: string; percorso: string; larghezza: number | null; altezza: number | null;
  byte: number | null; pianta_id: string | null; nota_id: string | null; archiviata: boolean;
  archiviata_il: string | null; creato_da?: string }

/**
 * Un export salvato (Esporta Excel): nome e scelte, per esperimento e per utente. Le `scelte` arrivano dal database
 * come json qualunque: la pagina le legge con `leggiSceltaExport`, che scarta quello che non c'è più.
 */
export interface ExportSalvato { id: string; nome: string; scelte: unknown; aggiornato_il: string }
