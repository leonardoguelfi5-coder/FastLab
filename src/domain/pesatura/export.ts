import type { DatiPesatura } from '@/api/pesatura'
import { nomeSicuro } from '@/domain/archivioFoto'
import {
  larghezzaColonna, RIGHE_IMMAGINE, testoPerCella, type Cartella, type Cella, type Colonna, type Foglio, type GraficoDaDisegnare,
  type TipoColonna, type TipoFoglio,
} from '@/domain/export/fogli'
import type { ConfigEsperimento, Fattore, Pianta, Trattamento } from '@/domain/tipi'
import { oggiLocale } from '@/lib/date'
import { arrotondaCifre, arrotondaDecimali } from '@/lib/numeri'
import {
  arrotondato, differenzaPesi, inUnita, mlTamponeCalcolato, percentualeCCCalcolata, precisioneDeiPesi, rwcCalcolato,
  sostanzaSeccaCalcolata,
} from './calcoli'
import {
  calcolaLettura, curvePerSubstrato, decimaliLetturaTarget, equazione, intestazioniLetturaCC, modelloPer,
  parametriDelSubstrato, PERCENTUALI_TABELLA, SENZA_SUBSTRATO, vasiDaPesi, type CurveSubstrato, type Vaso,
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

/** L'identificativo con cui `scriviCartella` cerca l'immagine del grafico del substrato `indice`. */
export const idGraficoCurve = (indice: number): string => `curve-${indice}`
const NOME_GRAFICO = 'Curve di ritenzione dei vasi'
const titoloGrafico = (substrato: string): string => `Curve di ritenzione — ${substrato}`

/** Sensore di ripiego: un vaso senza sensore nelle impostazioni (non dovrebbe succedere) si legge come una lettura nuda. */
const SENSORE_NEUTRO: Sensore = { tipo: 'tdr', unita: '' }


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
    { titolo: 'Fase', tipo: 'testo' }, { titolo: 'Peso', tipo: 'numero' }, { titolo: 'Lettura', tipo: 'numero' }, { titolo: 'Acqua', tipo: 'numero' }, { titolo: '% CC', tipo: 'numero' },
  ]
  const righe: Cella[][] = []
  for (const s of [...sessioni].sort(dallaPiuVecchia)) {
    const ids = new Set(campioniDi(s, dati).map(c => c.id))
    const precisione = precisioneDeiPesi(dati.pesi.filter(p => ids.has(p.campione_id)))
    for (const v of vasiDaPesi(campioniDi(s, dati), dati.pesi)) {
      const delVaso = dati.pesi.filter((p: Peso) => p.campione_id === v.campione.id)
      // la capacità di campo con la sua lettura è il punto al 100 %; senza lettura non è un punto della curva
      const cc = delVaso.find(p => p.tipo === 'capacita_campo' && p.replica === 1 && p.lettura !== null)
      const asciugature = delVaso
        .filter(p => p.tipo === 'asciugatura')
        .sort((a, b) => Date.parse(a.misurato_il) - Date.parse(b.misurato_il))
      for (const p of cc ? [cc, ...asciugature] : asciugature) {
        const fase = p.tipo === 'capacita_campo' ? 'Capacità di campo' : 'Asciugatura'
        const pcc = p.tipo === 'capacita_campo' ? (v.secco !== null && v.cc !== null && v.cc > v.secco ? 100 : null)
          : v.secco !== null && v.cc !== null ? arrotondato(percentualeCCCalcolata(p.valore, v.secco, v.cc, precisione)) : null
        const acqua = v.secco === null ? null : differenzaPesi(p.valore, v.secco, precisione)
        righe.push([
          nomeVaso(v), substratoDi(v), { istante: p.misurato_il }, fase, p.valore, p.lettura,
          acqua === null ? null : arrotondaDecimali(acqua.valore, acqua.decimali), pcc,
        ])
      }
    }
  }
  return foglio('Punti', 'dati', colonne, righe)
}

/**
 * Come la Tabella 4 dell'app: a 2 decimali, b 4, R² 3, h 1; nel TDR m (è b) e q (è a) a 4 cifre significative.
 * Numeri, non testo: Excel li mostra da sé.
 */
function foglioParametri(gruppi: CurveSubstrato[], sensore: Sensore): Foglio {
  const lettura = intestazioniLetturaCC(sensore)
  const retta = sensore.tipo === 'tdr'
  const colonne: ColonnaGrezza[] = [
    { titolo: 'Substrato', tipo: 'testo' }, { titolo: 'Vaso', tipo: 'testo' },
    { titolo: retta ? 'm' : 'a', tipo: 'numero' }, { titolo: retta ? 'q' : 'b', tipo: 'numero' }, { titolo: 'R²', tipo: 'numero' },
    { titolo: lettura.curva, tipo: 'numero' }, { titolo: lettura.misurato, tipo: 'numero' }, { titolo: 'n', tipo: 'numero' },
  ]
  const tondo = (x: number | null, decimali: number): number | null => (x === null || !Number.isFinite(x) ? null : arrotondaDecimali(x, decimali))
  const cifre4 = (x: number | null): number | null => (x === null || !Number.isFinite(x) ? null : arrotondaCifre(x, 4))
  const righe = gruppi.flatMap(g => parametriDelSubstrato(g).map((r): Cella[] => [
    g.substrato, r.nome, retta ? cifre4(r.b) : tondo(r.a, 2), retta ? cifre4(r.a) : tondo(r.b, 4), tondo(r.r2, 3), tondo(r.letturaCCCurva, 1), tondo(r.letturaCCMisurata, 1), r.n,
  ]))
  return foglio('Parametri', 'dati', colonne, righe)
}

/**
 * Il calcolatore: per ogni substrato e % CC la lettura che la curva media dà (da impostare sul logger o da cercare sul
 * sensore). La lettura ha i decimali di quelle misurate più uno; la Nota segnala un valore estrapolato oltre le letture misurate.
 */
function foglioCalcolatore(gruppi: CurveSubstrato[], sensore: Sensore): Foglio {
  const colonne: ColonnaGrezza[] = [
    { titolo: 'Substrato', tipo: 'testo' }, { titolo: '% CC', tipo: 'numero' },
    { titolo: nomeLettura(sensore), tipo: 'numero' }, { titolo: 'Nota', tipo: 'testo' },
  ]
  const decimali = decimaliLetturaTarget(gruppi)
  const calcoli = PERCENTUALI_TABELLA.map(p => calcolaLettura(gruppi, p))
  const righe = gruppi.flatMap((g, gi) => PERCENTUALI_TABELLA.map((p, pi): Cella[] => {
    const { valore, fuoriCampo } = calcoli[pi][gi].media
    return [
      g.substrato, p,
      valore === null ? null : arrotondaDecimali(valore, decimali),
      fuoriCampo ? 'fuori dai valori misurati' : null,
    ]
  }))
  return foglio('Calcolatore', 'dati', colonne, righe)
}

/** Un blocco per substrato: il titolo e le righe che l'immagine copre. */
function foglioGrafico(gruppi: CurveSubstrato[]): { foglio: Foglio; righe: number[] } {
  const righe: Cella[][] = []
  const posizioni: number[] = []
  if (gruppi.length === 0) righe.push([NOME_GRAFICO])
  for (const g of gruppi) {
    posizioni.push(righe.length)
    righe.push([titoloGrafico(g.substrato)], ...Array.from({ length: RIGHE_IMMAGINE }, (): Cella[] => []))
  }
  return { foglio: foglio('Grafico', 'grafici', [{ titolo: 'Grafico', tipo: 'testo' }], righe, { intestazione: false }), righe: posizioni }
}

// ---- Info ----

/** Il nome di ciò che si legge sul sensore, con l'unità: `Tensione (kPa)`. Titolo dell'asse X e del campo di consultazione. */
export function nomeLettura(s: Sensore): string {
  const unita = s.unita.trim()
  return `${s.tipo === 'tdr' ? 'TDR' : 'Tensione'}${unita ? ` (${unita})` : ''}`
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
      g.substrato, g.media ? equazione(g.media, vasi.sensore) : 'Servono almeno 3 letture diverse in un vaso per adattare la curva.',
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
  const nomeFile = `${sessioni[0]?.tipo === 'vasi' ? 'Taratura' : 'Pesatura'}_${nomeSicuro(titolo) || 'analisi'}_${oggi}.xlsx`
  if (sessioni.length === 0) return { nomeFile, fogli: [], grafici: [], strumenti: [], intervallo: { da: null, a: null } }

  const date = sessioni.map(s => s.data).sort()
  const intervallo = { da: date[0], a: date[date.length - 1] }
  const fogli: Foglio[] = []
  const grafici: GraficoDaDisegnare[] = []

  if (sessioni[0].tipo === 'vasi') {
    const vasi = gruppiDeiVasi(sessioni, dati)
    const g = foglioGrafico(vasi.gruppi)
    fogli.push(foglioPunti(sessioni, dati), foglioParametri(vasi.gruppi, vasi.sensore), foglioCalcolatore(vasi.gruppi, vasi.sensore))
    fogli.push(g.foglio)
    vasi.gruppi.forEach((gr, i) => grafici.push({
      parametroId: idGraficoCurve(i), titolo: titoloGrafico(gr.substrato), scala: 'valore', unita: vasi.sensore.unita.trim() || null,
      serie: [], note: [], riga: g.righe[i],
    }))
    fogli.push(foglioInfo(sessioni, config, adesso, vasi))
  } else {
    fogli.push(foglioPesi(sessioni, dati, contesto(config)), foglioInfo(sessioni, config, adesso, null))
  }
  return { nomeFile, fogli, grafici, strumenti: [], intervallo }
}
