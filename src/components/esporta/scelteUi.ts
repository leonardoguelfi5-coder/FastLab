import { cercaPiante, strumentiPerScelta } from '@/domain/dataset'
import {
  MASSIMO_IDS, MASSIMO_SETTIMANE, leggiSceltaExport, type ComeExport, type SceltaExport, type SceltaPiante, type SceltaStrumenti,
} from '@/domain/export/scelte'
import type { ConfigEsperimento } from '@/domain/tipi'
import { eDataValida } from '@/lib/date'

/**
 * Le scelte di Esporta come le vive la pagina. `SceltaExport` (la forma salvata nel database) non basta: mentre si
 * sceglie ci sono stati che non sono ancora una scelta valida ("Per trattamento…" senza trattamenti, "Dal… al…" con una
 * data sola, il testo delle piante a metà). Qui restano tutti, anche quando si cambia modo e si torna indietro; da qui
 * si ricava la scelta vera (`sceltaDaScelteUi`) o, se non c'è, il motivo da scrivere sotto la sezione.
 */

export type ModoPiante = 'tutte' | 'trattamenti' | 'piante'
export type ModoPeriodo = 'tutto' | 'settimane' | 'intervallo'

export interface ScelteUi {
  /** Gli strumenti scelti (i chip attivi). */
  strumenti: string[]
  modoPiante: ModoPiante
  trattamenti: string[]
  /** Il testo del campo "Piante…" (`35, 36`). */
  cercato: string
  modoPeriodo: ModoPeriodo
  settimane: number
  da: string
  a: string
  come: ComeExport
}

/** Le settimane di "Ultime N settimane" quando non ce n'è una scelta prima (spec §5.6: ultime 4 settimane). */
export const SETTIMANE_DI_PARTENZA = 4

/** Cosa non va in ciascuna sezione, a parole; una chiave c'è solo se quella sezione non è valida. */
export interface ProblemiScelte { strumenti?: string; piante?: string; periodo?: string; come?: string }

export interface EsitoScelte {
  /** La scelta che il database accetta, o `null` se una sezione non è valida. */
  scelta: SceltaExport | null
  problemi: ProblemiScelte
  /** Le piante scritte nel campo che non ci sono, per dirlo sotto il campo (`Non trovata: 99`). */
  nonTrovate: string[]
  /** Le etichette delle piante trovate (solo con «Piante…»), nell'ordine della configurazione. */
  trovate: string[]
}

/** Lo stato della pagina di una scelta (da "Tutto l'esperimento", da un export salvato o dalla URL di Dataset). */
export function scelteDaScelta(scelta: SceltaExport, config: ConfigEsperimento): ScelteUi {
  const tutti = strumentiPerScelta(config).map(s => s.id)
  const scelti = scelta.strumenti.modo === 'scelti' ? new Set(scelta.strumenti.ids) : null
  const ui: ScelteUi = {
    strumenti: scelti === null ? tutti : tutti.filter(id => scelti.has(id)),
    modoPiante: scelta.piante.modo,
    trattamenti: [],
    cercato: '',
    modoPeriodo: scelta.periodo.modo,
    settimane: scelta.periodo.modo === 'settimane' ? scelta.periodo.n : SETTIMANE_DI_PARTENZA,
    da: scelta.periodo.modo === 'intervallo' ? scelta.periodo.da : '',
    a: scelta.periodo.modo === 'intervallo' ? scelta.periodo.a : '',
    come: { ...scelta.come },
  }
  if (scelta.piante.modo === 'trattamenti') {
    const ids = new Set(scelta.piante.ids)
    ui.trattamenti = [...config.trattamenti].sort((a, b) => a.ordine - b.ordine).filter(t => ids.has(t.id)).map(t => t.id)
  } else if (scelta.piante.modo === 'piante') {
    const ids = new Set(scelta.piante.ids)
    ui.cercato = [...config.piante].sort((a, b) => a.ordine - b.ordine).filter(p => ids.has(p.id)).map(p => p.etichetta).join(', ')
  }
  return ui
}

function strumentiDellaScelta(ui: ScelteUi, config: ConfigEsperimento): { valore: SceltaStrumenti | null; problema?: string } {
  const tutti = strumentiPerScelta(config).map(s => s.id)
  const scelti = new Set(ui.strumenti)
  const ids = tutti.filter(id => scelti.has(id))
  if (ids.length === 0) return { valore: null, problema: 'Scegli almeno uno strumento.' }
  // Tutti gli strumenti dell'esperimento = "tutti": un export salvato così comprende anche quelli aggiunti dopo.
  return { valore: ids.length === tutti.length ? { modo: 'tutti' } : { modo: 'scelti', ids } }
}

function pianteDellaScelta(
  ui: ScelteUi, config: ConfigEsperimento,
): { valore: SceltaPiante | null; problema?: string; nonTrovate: string[]; trovate: string[] } {
  if (ui.modoPiante === 'tutte') return { valore: { modo: 'tutte' }, nonTrovate: [], trovate: [] }
  if (ui.modoPiante === 'trattamenti') {
    const scelti = new Set(ui.trattamenti)
    const ids = [...config.trattamenti].sort((a, b) => a.ordine - b.ordine).filter(t => scelti.has(t.id)).map(t => t.id)
    return ids.length === 0
      ? { valore: null, problema: 'Scegli almeno un trattamento.', nonTrovate: [], trovate: [] }
      : { valore: { modo: 'trattamenti', ids }, nonTrovate: [], trovate: [] }
  }
  // La ricerca è quella del Dataset: etichette esatte separate da virgola (`3` non trova la `13`), `035` = `35`. Il limite
  // di pezzi della URL del Dataset qui non c'è: un export salvato con centinaia di piante si riapre intero.
  const { trovate, nonTrovate } = cercaPiante(config.piante, ui.cercato)
  const etichette = trovate.map(p => p.etichetta)
  if (trovate.length === 0) return { valore: null, problema: 'Scrivi almeno una pianta che c\'è.', nonTrovate, trovate: etichette }
  if (trovate.length > MASSIMO_IDS) return { valore: null, problema: 'Troppe piante: scegli per trattamento.', nonTrovate, trovate: etichette }
  return { valore: { modo: 'piante', ids: trovate.map(p => p.id) }, nonTrovate, trovate: etichette }
}

function periodoDellaScelta(ui: ScelteUi): { valore: SceltaExport['periodo'] | null; problema?: string } {
  if (ui.modoPeriodo === 'tutto') return { valore: { modo: 'tutto' } }
  if (ui.modoPeriodo === 'settimane') {
    // Il database accetta da 1 a 104 settimane: un export salvato non le ha mai di più, ma lo stato potrebbe.
    return Number.isInteger(ui.settimane) && ui.settimane >= 1 && ui.settimane <= MASSIMO_SETTIMANE
      ? { valore: { modo: 'settimane', n: ui.settimane } }
      : { valore: null, problema: `Le settimane vanno da 1 a ${MASSIMO_SETTIMANE}.` }
  }
  if (!eDataValida(ui.da) || !eDataValida(ui.a)) return { valore: null, problema: 'Scegli tutte e due le date.' }
  if (ui.da > ui.a) return { valore: null, problema: 'La data di inizio deve venire prima di quella di fine.' }
  return { valore: { modo: 'intervallo', da: ui.da, a: ui.a } }
}

/**
 * La scelta vera dallo stato della pagina, o i motivi per cui non c'è. Ogni sezione ha il suo motivo (la pagina lo
 * scrive sotto la sezione); la scelta, quando c'è, passa anche da `leggiSceltaExport`: è esattamente ciò che il
 * database accetta, così "Salva questa scelta" non può fallire per una forma sbagliata.
 */
export function sceltaDaScelteUi(ui: ScelteUi, config: ConfigEsperimento): EsitoScelte {
  const strumenti = strumentiDellaScelta(ui, config)
  const piante = pianteDellaScelta(ui, config)
  const periodo = periodoDellaScelta(ui)
  const comeScelto = (['valori', 'medie', 'grafici', 'diario', 'info'] as const).some(c => ui.come[c])

  const problemi: ProblemiScelte = {}
  if (strumenti.problema) problemi.strumenti = strumenti.problema
  if (piante.problema) problemi.piante = piante.problema
  if (periodo.problema) problemi.periodo = periodo.problema
  if (!comeScelto) problemi.come = 'Scegli almeno un contenuto per il file.'

  const candidata = strumenti.valore && piante.valore && periodo.valore && comeScelto
    ? { v: 1, strumenti: strumenti.valore, piante: piante.valore, periodo: periodo.valore, come: { ...ui.come } }
    : null
  return { scelta: leggiSceltaExport(candidata), problemi, nonTrovate: piante.nonTrovate, trovate: piante.trovate }
}
