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
export interface Misura { id: string; pianta_id: string; strumento_id: string; data_rilievo: string; ora: string; valori: ValoriMisura }
