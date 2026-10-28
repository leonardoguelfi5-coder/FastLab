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
export interface Parametro { id: string; nome: string; unita: string | null; tipo: TipoParametro; ordine: number;
  archiviato: boolean; progressivo: boolean; ricorda_tra_piante: boolean; n_letture: number;
  valore_min: number | null; valore_max: number | null; sotto_campi: SottoCampo[] }
export interface PassataParametro { parametro_id: string; obbligatorio: boolean; ordine: number }
export interface Passata { id: string; nome: string; icona: string | null; ordine: number; parametri: PassataParametro[] }
export interface ConfigEsperimento { esperimento: Esperimento; fattori: Fattore[]; trattamenti: Trattamento[];
  piante: Pianta[]; parametri: Parametro[]; passate: Passata[] }
export type BozzaEsperimento = ConfigEsperimento   // stessa forma; ids generati dal client con crypto.randomUUID()
export interface Misura { id: string; pianta_id: string; passata_id: string; data_rilievo: string; ora: string; valori: ValoriMisura }
