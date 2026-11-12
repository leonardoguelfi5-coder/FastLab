import type { DatiPesatura } from '@/api/pesatura'
import { nomeSicuro } from '@/domain/archivioFoto'
import {
  larghezzaColonna, RIGHE_IMMAGINE, testoPerCella, type Cartella, type Cella, type Colonna, type Foglio, type GraficoDaDisegnare,
  type TipoColonna, type TipoFoglio,
} from '@/domain/export/fogli'
import type { ConfigEsperimento, Fattore, Pianta, Trattamento } from '@/domain/tipi'
import { oggiLocale } from '@/lib/date'
import { arrotondaDecimali, decimaliMassimi } from '@/lib/numeri'
import {
  arrotondato, differenzaPesi, inUnita, mlTamponeCalcolato, percentualeCCCalcolata, precisioneDeiPesi, rwcCalcolato,
  sostanzaSeccaCalcolata,
} from './calcoli'
import {
  consultaPerCC, curvePerSubstrato, equazione, modelloPer, PERCENTUALI_TABELLA, SENZA_SUBSTRATO, vasiDaPesi,
  type CurveSubstrato, type Vaso,
} from './curva'
import { etichettaCampione, letteraReplica, repliche } from './sequenza'
import { NOMI_TIPO, type CampionePesatura, type Peso, type Sensore, type SessionePesatura, type TipoPeso } from './tipi'

/**
 * La cartella Excel della Pesatura: una sessione (o più sessioni dello stesso tipo). Il modello è lo stesso dell'Excel del
 * Dataset (`Cartella`), così lo scrive `scriviCartella`. Tutto puro: niente rete, niente DOM.
 *
 * I valori calcolati (RWC, sostanza secca, mL di tampone, acqua, % CC) sono `null` finché mancano i pesi che servono,
 * come nel riepilogo della pagina: una replica incompleta ha la riga, con le celle vuote.
 */

/** Lo stesso identificativo che `scriviCartella` usa per cercare l'immagine del grafico. */
export const ID_GRAFICO_CURVE = 'curve'
const NOME_GRAFICO = 'Curve di ritenzione dei vasi'

/** Sensore di ripiego: un vaso senza sensore nelle impostazioni (non dovrebbe succedere) si legge come una lettura nuda. */
const SENSORE_NEUTRO: Sensore = { tipo: 'umidita', unita: '' }


/** Dalla più vecchia: per data, a parità per creazione. */
function dallaPiuVecchia(a: SessionePesatura, b: SessionePesatura): number {
  return a.data.localeCompare(b.data) || (a.creato_il ?? '').localeCompare(b.creato_il ?? '') || a.id.localeCompare(b.id)
}

const campioniDi = (s: SessionePesatura, dati: DatiPesatura): CampionePesatura[] =>
  dati.campioni.filter(c => c.sessione_id === s.id).sort((a, b) => a.ordine - b.ordine)

/** I vasi di tutte le sessioni, raggruppati per substrato con le loro curve. Le usano la pagina, l'export e il PNG. */
export function gruppiDeiVasi(sessioni: SessionePesatura[], dati: DatiPesatura): { gruppi: CurveSubstrato[]; sensore: Sensore; vasi: Vaso[] } {
  const sensore = sessioni.find(s => s.impostazioni.sensore)?.impostazioni.sensore ?? SENSORE_NEUTRO
  const vasi = [...sessioni].sort(dallaPiuVecchia).flatMap(s => vasiDaPesi(campioniDi(s, dati), dati.pesi))
  return { gruppi: curvePerSubstrato(vasi, modelloPer(sensore)), sensore, vasi }
}

// ---- il modello di un foglio ----

interface ColonnaGrezza { titolo: string; tipo: TipoColonna }

function foglio(
  nome: string, tipo: TipoFoglio, colonne: ColonnaGrezza[], righe: Cella[][], extra: { intestazione?: boolean; titoliDiBlocco?: number[] } = {},
): Foglio {
  const intestazione = extra.intestazione ?? true
  for (const riga of righe) {
    for (let i = 0; i < riga.length; i++) {
      const x = riga[i]
      if (typeof x === 'string') riga[i] = testoPerCella(x)
    }
  }
  return {
    nome, tipo, intestazione, titoliDiBlocco: extra.titoliDiBlocco ?? [], righe,
    colonne: colonne.map((c, i): Colonna => ({
      titolo: testoPerCella(c.titolo), tipo: c.tipo, larghezza: larghezzaColonna(intestazione ? c.titolo : null, righe, i),
    })),
  }
}

// ---- il foglio Pesi (aliquota, RWC, sostanza secca) ----

interface Contesto {
  config: ConfigEsperimento
  piante: Map<string, Pianta>
  trattamenti: Map<string, Trattamento>
  fattori: Fattore[]
}

function contesto(config: ConfigEsperimento): Contesto {
  return {
    config,
    piante: new Map(config.piante.map(p => [p.id, p])),
    trattamenti: new Map(config.trattamenti.map(t => [t.id, t])),
    fattori: [...config.fattori].sort((a, b) => a.ordine - b.ordine),
  }
}

/** Il trattamento di un campione: solo le piante ne hanno uno, le righe libere no. */
function trattamentoDi(c: CampionePesatura, ctx: Contesto): Trattamento | null {
  const pianta = c.pianta_id ? ctx.piante.get(c.pianta_id) : undefined
  return pianta ? ctx.trattamenti.get(pianta.trattamento_id) ?? null : null
}

const livelloDi = (f: Fattore, t: Trattamento): string | null => f.livelli.find(l => t.livello_ids.includes(l.id))?.nome ?? null

function foglioPesi(sessioni: SessionePesatura[], dati: DatiPesatura, ctx: Contesto): Foglio {
  const tipo = sessioni[0].tipo
  const unita = sessioni[0].unita
  const conTampone = tipo === 'aliquota' && sessioni.some(s => s.impostazioni.rapportoTampone !== null)

  const colonne: ColonnaGrezza[] = [
    { titolo: 'Esperimento', tipo: 'testo' }, { titolo: 'Analisi', tipo: 'testo' }, { titolo: 'Data', tipo: 'data' },
    { titolo: 'Campione', tipo: 'testo' },
    ...ctx.fattori.map((f): ColonnaGrezza => ({ titolo: f.nome, tipo: 'testo' })),
    { titolo: 'Trattamento', tipo: 'testo' }, { titolo: 'Replica', tipo: 'testo' },
  ]
  const numero = (titolo: string): ColonnaGrezza => ({ titolo, tipo: 'numero' })
  if (tipo === 'aliquota') {
    colonne.push(numero(`Peso (${unita})`))
    if (conTampone) colonne.push(numero('Tampone (mL)'))
  } else if (tipo === 'rwc') {
    colonne.push(
      numero(`Fresco (${unita})`), numero(`Turgido (${unita})`), numero(`Secco (${unita})`), numero('RWC (%)'), numero('Sostanza secca (%)'),
    )
  } else {
    colonne.push(numero(`Fresco (${unita})`), numero(`Secco (${unita})`), numero('Sostanza secca (%)'))
  }

  const righe: Cella[][] = []
  for (const s of [...sessioni].sort(dallaPiuVecchia)) {
    const campioni = campioniDi(s, dati)
    const pesi = dati.pesi.filter(p => campioni.some(c => c.id === p.campione_id))
    const precisione = precisioneDeiPesi(pesi)
    for (const c of campioni) {
      const t = trattamentoDi(c, ctx)
      for (const replica of repliche(c, s, pesi)) {
        const valore = (tp: TipoPeso): number | null => {
          const p = pesi.find(x => x.campione_id === c.id && x.replica === replica && x.tipo === tp)
          return p ? p.valore : null
        }
        const riga: Cella[] = [
          ctx.config.esperimento.nome, s.titolo, { data: s.data }, etichettaCampione(c, ctx.piante),
          ...ctx.fattori.map((f): Cella => (t ? livelloDi(f, t) : null)),
          t ? t.etichetta : null, letteraReplica(replica),
        ]
        const nellUnita = (v: number | null) => (v === null ? null : inUnita(v, s.unita, unita))
        const fresco = valore('fresco')
        const turgido = valore('turgido')
        const secco = valore('secco')
        if (tipo === 'aliquota') {
          const a = valore('aliquota')
          riga.push(nellUnita(a))
          // i valori calcolati con le cifre significative del dato che ne ha di più, come nell'app
          if (conTampone) riga.push(a === null ? null : arrotondato(mlTamponeCalcolato(a, s.unita, s.impostazioni.rapportoTampone, precisione)))
        } else {
          riga.push(nellUnita(fresco))
          if (tipo === 'rwc') riga.push(nellUnita(turgido))
          riga.push(nellUnita(secco))
          if (tipo === 'rwc') riga.push(fresco !== null && turgido !== null && secco !== null ? arrotondato(rwcCalcolato(fresco, turgido, secco, precisione)) : null)
          riga.push(fresco !== null && secco !== null ? arrotondato(sostanzaSeccaCalcolata(fresco, secco, precisione)) : null)
        }
        righe.push(riga)
      }
    }
  }
  return foglio('Pesi', 'dati', colonne, righe)
}

// ---- i fogli dei vasi ----

const nomeVaso = (v: Vaso): string => v.campione.nome?.trim() || v.campione.id
const substratoDi = (v: Vaso): string => v.campione.substrato?.trim() || SENZA_SUBSTRATO

function foglioPunti(sessioni: SessionePesatura[], dati: DatiPesatura): Foglio {
  const colonne: ColonnaGrezza[] = [
    { titolo: 'Vaso', tipo: 'testo' }, { titolo: 'Substrato', tipo: 'testo' }, { titolo: 'Data e ora', tipo: 'istante' },
    { titolo: 'Peso', tipo: 'numero' }, { titolo: 'Lettura', tipo: 'numero' }, { titolo: 'Acqua', tipo: 'numero' }, { titolo: '% CC', tipo: 'numero' },
  ]
  const righe: Cella[][] = []
  for (const s of [...sessioni].sort(dallaPiuVecchia)) {
    const ids = new Set(campioniDi(s, dati).map(c => c.id))
    const precisione = precisioneDeiPesi(dati.pesi.filter(p => ids.has(p.campione_id)))
    for (const v of vasiDaPesi(campioniDi(s, dati), dati.pesi)) {
      const asciugature = dati.pesi
        .filter((p: Peso) => p.campione_id === v.campione.id && p.tipo === 'asciugatura')
        .sort((a, b) => Date.parse(a.misurato_il) - Date.parse(b.misurato_il))
      for (const p of asciugature) {
        const pcc = v.secco !== null && v.cc !== null ? arrotondato(percentualeCCCalcolata(p.valore, v.secco, v.cc, precisione)) : null
        const acqua = v.secco === null ? null : differenzaPesi(p.valore, v.secco, precisione)
        righe.push([
          nomeVaso(v), substratoDi(v), { istante: p.misurato_il }, p.valore, p.lettura,
          acqua === null ? null : arrotondaDecimali(acqua.valore, acqua.decimali), pcc,
        ])
      }
    }
  }
  return foglio('Punti', 'dati', colonne, righe)
}

function foglioPesiTarget(gruppi: CurveSubstrato[]): Foglio {
  const colonne: ColonnaGrezza[] = [
    { titolo: 'Substrato', tipo: 'testo' }, { titolo: 'Vaso', tipo: 'testo' },
    ...PERCENTUALI_TABELLA.map((p): ColonnaGrezza => ({ titolo: `${p} % CC`, tipo: 'numero' })),
  ]
  const consulte = PERCENTUALI_TABELLA.map(p => consultaPerCC(gruppi, p))
  // i pesi ricavati con i decimali dei pesi dei vasi (secco e capacità di campo), come nell'app
  const decimali = decimaliMassimi(gruppi.flatMap(g => g.vasi.flatMap(v => [v.secco, v.cc].filter((x): x is number => x !== null))))
  const peso = (x: number | null) => (x === null ? null : arrotondaDecimali(x, decimali))
  const righe: Cella[][] = []
  gruppi.forEach((g, gi) => {
    g.vasi.forEach((v, vi) => righe.push([g.substrato, nomeVaso(v), ...consulte.map(c => peso(c[gi].vasi[vi].peso))]))
    righe.push([g.substrato, 'Media', ...consulte.map(c => peso(c[gi].media))])
  })
  return foglio('Pesi target', 'dati', colonne, righe)
}

function foglioGrafico(): { foglio: Foglio; riga: number } {
  const righe: Cella[][] = [[NOME_GRAFICO], ...Array.from({ length: RIGHE_IMMAGINE }, (): Cella[] => [])]
  return { foglio: foglio('Grafico', 'grafici', [{ titolo: 'Grafico', tipo: 'testo' }], righe, { intestazione: false }), riga: 0 }
}

// ---- Info ----

/** Il nome di ciò che si legge sul sensore, con l'unità: `Tensione (kPa)`. Titolo dell'asse X e del campo di consultazione. */
export function nomeLettura(s: Sensore): string {
  const unita = s.unita.trim()
  return `${s.tipo === 'umidita' ? 'Umidità' : 'Tensione'}${unita ? ` (${unita})` : ''}`
}

const testoSensore = (s: Sensore | null): string | null => (s ? nomeLettura(s) : null)

function foglioInfo(
  sessioni: SessionePesatura[], config: ConfigEsperimento, adesso: string,
  vasi: { gruppi: CurveSubstrato[]; sensore: Sensore } | null,
): Foglio {
  const prima = [...sessioni].sort(dallaPiuVecchia)[0]
  const righe: Cella[][] = []
  const titoli: number[] = []
  const blocco = (titolo: Cella[], corpo: Cella[][]) => {
    if (righe.length > 0) righe.push([])
    titoli.push(righe.length)
    righe.push(titolo, ...corpo)
  }
  const i = prima.impostazioni
  blocco(['Voce', 'Valore'], [
    ['Esperimento', config.esperimento.nome],
    ['Analisi', prima.titolo],
    ['Tipo', NOMI_TIPO[prima.tipo]],
    ['Unità di peso', prima.unita],
    ['Repliche', i.repliche],
    ['Rapporto tampone (mL/g)', i.rapportoTampone],
    ['Sensore', testoSensore(i.sensore)],
    ['Sessioni', sessioni.length],
    ['Esportato il', { istante: adesso }],
  ])
  blocco(['Sessione', 'Data', 'Stato', 'Nota'], [...sessioni].sort(dallaPiuVecchia).map((s): Cella[] => [
    s.titolo, { data: s.data }, s.conclusa ? 'Conclusa' : 'Aperta', s.nota?.trim() || null,
  ]))
  if (vasi) {
    blocco(['Vaso', 'Substrato', 'Peso secco', 'Capacità di campo'], vasi.gruppi.flatMap(g => g.vasi.map((v): Cella[] => [
      nomeVaso(v), g.substrato, v.secco, v.cc,
    ])))
    blocco(['Substrato', 'Equazione della curva media'], vasi.gruppi.map((g): Cella[] => [
      g.substrato, g.media ? equazione(g.media, vasi.sensore) : 'Servono almeno 3 letture diverse per adattare la curva.',
    ]))
  }
  const larghe = Math.max(...righe.map(r => r.length))
  const colonne = Array.from({ length: larghe }, (): ColonnaGrezza => ({ titolo: '', tipo: 'misto' }))
  return foglio('Info', 'info', colonne, righe, { intestazione: false, titoliDiBlocco: titoli })
}

// ---- la cartella ----

/** `oggi` e `adesso` si passano nei test; l'app usa la data e l'ora del momento. */
export function cartellaPesatura(
  sessioniDate: SessionePesatura[], dati: DatiPesatura, config: ConfigEsperimento, oggi: string = oggiLocale(), adesso: string = new Date().toISOString(),
): Cartella {
  // Si ordina una volta sola, dalla più vecchia: tipo, unità, titolo e impostazioni vengono tutti dalla prima.
  const sessioni = [...sessioniDate].sort(dallaPiuVecchia)
  const titolo = sessioni[0]?.titolo ?? ''
  const nomeFile = `Pesatura_${nomeSicuro(titolo) || 'analisi'}_${oggi}.xlsx`
  if (sessioni.length === 0) return { nomeFile, fogli: [], grafici: [], strumenti: [], intervallo: { da: null, a: null } }

  const date = sessioni.map(s => s.data).sort()
  const intervallo = { da: date[0], a: date[date.length - 1] }
  const fogli: Foglio[] = []
  const grafici: GraficoDaDisegnare[] = []

  if (sessioni[0].tipo === 'vasi') {
    const vasi = gruppiDeiVasi(sessioni, dati)
    const g = foglioGrafico()
    fogli.push(foglioPunti(sessioni, dati), foglioPesiTarget(vasi.gruppi), g.foglio)
    grafici.push({
      parametroId: ID_GRAFICO_CURVE, titolo: NOME_GRAFICO, scala: 'valore', unita: vasi.sensore.unita.trim() || null, serie: [], note: [], riga: g.riga,
    })
    fogli.push(foglioInfo(sessioni, config, adesso, vasi))
  } else {
    fogli.push(foglioPesi(sessioni, dati, contesto(config)), foglioInfo(sessioni, config, adesso, null))
  }
  return { nomeFile, fogli, grafici, strumenti: [], intervallo }
}
