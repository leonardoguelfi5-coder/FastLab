import { nuovoId } from '@/lib/id'
import type { Parametro, Strumento, VoceCatalogo } from './tipi'

/**
 * Copia una voce del catalogo in uno strumento dell'esperimento, con un parametro numerico per ogni valore della
 * voce. Gli id sono nuovi (due copie della stessa voce non si sovrappongono); la copia resta collegata alla voce con
 * `catalogo_id` e ogni parametro al suo valore con `catalogo_chiave`, così si può aggiornare in seguito dal catalogo.
 * I parametri sono tutti facoltativi, nell'ordine della voce.
 */
export function strumentoDaCatalogo(v: VoceCatalogo, ordine: number): { strumento: Strumento; parametri: Parametro[] } {
  const parametri: Parametro[] = v.parametri.map((pc, i) => ({
    id: nuovoId(),
    nome: pc.nome,
    unita: pc.unita,
    tipo: 'numero',
    ordine: i,
    archiviato: false,
    progressivo: false,
    n_letture: pc.n_letture,
    valore_min: pc.valore_min,
    valore_max: pc.valore_max,
    sotto_campi: [],
    catalogo_chiave: pc.chiave,
  }))

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
