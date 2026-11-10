/**
 * I ruoli in un esperimento (Piano E, Task E9, migration 0016), senza dipendenze: li usano le API, la copia sul
 * telefono e l'interfaccia.
 * - proprietario: tutto, anche la configurazione e le persone; corregge ed elimina i dati di tutti;
 * - rilevatore: crea misure, note e foto, corregge ed elimina solo le proprie;
 * - lettore: legge (Dataset, Esporta, i propri export salvati, Duplica).
 */
export type Ruolo = 'proprietario' | 'rilevatore' | 'lettore'

export const RUOLI: readonly Ruolo[] = ['proprietario', 'rilevatore', 'lettore']

export const eRuolo = (v: unknown): v is Ruolo => typeof v === 'string' && (RUOLI as readonly string[]).includes(v)

/** Il ruolo a parole, per chi legge l'elenco delle persone (Impostazioni › Persone). */
export const RUOLO_A_PAROLE: Record<Ruolo, string> = {
  proprietario: 'Proprietario',
  rilevatore: 'Rilevatore: misure, note e foto',
  lettore: 'Lettore: solo lettura',
}

/** Il nome corto del ruolo, per le scelte e per l'elenco degli esperimenti. */
export const RUOLO_NOME: Record<Ruolo, string> = {
  proprietario: 'Proprietario',
  rilevatore: 'Rilevatore',
  lettore: 'Lettore',
}
