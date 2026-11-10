import type { VoceCatalogo } from '../tipi'

/**
 * Le voci di partenza del catalogo, come le inserisce la migration `20261029000009_catalogo.sql` (stessi id, nomi,
 * icone, descrizioni e valori: il test `semi.test.ts` le confronta con il testo della migration, quindi vanno
 * tenute allineate). Servono al modello Hydrochar quando una voce manca dal catalogo vero.
 * Ogni valore ha una lettura e nessun limite.
 */
export const SEMI_CATALOGO: VoceCatalogo[] = [
  {
    id: 'c0000000-0000-0000-0000-000000000001', nome: 'SPAD', icona: '💚',
    descrizione: 'Contenuto di clorofilla della foglia.', archiviato: false,
    parametri: [{ chiave: 'spad', nome: 'SPAD', unita: null, n_letture: 1, valore_min: null, valore_max: null }],
  },
  {
    id: 'c0000000-0000-0000-0000-000000000002', nome: 'Termometro', icona: '🌡',
    descrizione: 'Temperatura dell\'aria e della pianta.', archiviato: false,
    parametri: [
      { chiave: 'temp_aria', nome: 'Temp aria', unita: '°C', n_letture: 1, valore_min: null, valore_max: null },
      { chiave: 'temp_pianta', nome: 'Temp pianta', unita: '°C', n_letture: 1, valore_min: null, valore_max: null },
    ],
  },
  {
    id: 'c0000000-0000-0000-0000-000000000003', nome: 'Ciras', icona: '🍃',
    descrizione: 'Scambi gassosi della foglia.', archiviato: false,
    parametri: [
      { chiave: 'a', nome: 'A', unita: 'µmol m⁻² s⁻¹', n_letture: 1, valore_min: null, valore_max: null },
      { chiave: 'gs', nome: 'gs', unita: 'mol m⁻² s⁻¹', n_letture: 1, valore_min: null, valore_max: null },
      { chiave: 'e', nome: 'E', unita: 'mmol m⁻² s⁻¹', n_letture: 1, valore_min: null, valore_max: null },
      { chiave: 'ci', nome: 'Ci', unita: 'µmol mol⁻¹', n_letture: 1, valore_min: null, valore_max: null },
    ],
  },
  {
    id: 'c0000000-0000-0000-0000-000000000004', nome: 'Metro', icona: '📏',
    descrizione: 'Altezza della pianta.', archiviato: false,
    parametri: [{ chiave: 'altezza', nome: 'Altezza', unita: 'cm', n_letture: 1, valore_min: null, valore_max: null }],
  },
  {
    id: 'c0000000-0000-0000-0000-000000000005', nome: 'Calibro', icona: '📐',
    descrizione: 'Diametro del fusto.', archiviato: false,
    parametri: [{ chiave: 'diametro', nome: 'Diametro', unita: 'mm', n_letture: 1, valore_min: null, valore_max: null }],
  },
]
