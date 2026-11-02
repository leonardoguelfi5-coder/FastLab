import type { ConfigEsperimento, Misura, Nota, Parametro, Pianta, Strumento, Trattamento, ValoriMisura } from '../tipi'

/**
 * La configurazione di prova dell'export (solo per i test): due fattori, quattro trattamenti, un blocco, cinque piante
 * (la "035" per vedere che l'etichetta resta testo) e una pianta il cui trattamento non c'è; quattro strumenti in
 * disordine nell'array:
 * - SPAD: SPAD a due letture;
 * - Ciras: A, gs, E, Ci;
 * - Metro: Altezza (cm) e Vecchio (archiviato, in mezzo nello strumento: finisce in fondo);
 * - Fenologici: Altezza (cm) di nuovo, Note (testo), Vigoroso (sì/no), Palchi (lista con Fiori e Lunghezza (cm)).
 * Gli ids sono uuid veri (le scelte li controllano) e fissi.
 */
export const uuid = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

export const parametro = (n: number, nome: string, extra: Partial<Parametro> = {}): Parametro => ({
  id: uuid(n), nome, unita: null, tipo: 'numero', ordine: 0, archiviato: false, progressivo: false, n_letture: 1,
  valore_min: null, valore_max: null, sotto_campi: [], catalogo_chiave: null, ...extra,
})

const strumento = (n: number, nome: string, ordine: number, parametri: Parametro[], extra: Partial<Strumento> = {}): Strumento => ({
  id: uuid(n), nome, icona: null, ordine, tipo: 'strumento', archiviato: false, catalogo_id: null,
  parametri: parametri.map((p, i) => ({ parametro_id: p.id, obbligatorio: !p.archiviato && p.tipo === 'numero', ordine: i })), ...extra,
})

export const livelli = {
  controllo: { id: uuid(101), nome: 'Controllo', ordine: 0 }, s1: { id: uuid(102), nome: 'S1', ordine: 1 },
  no: { id: uuid(103), nome: 'No', ordine: 0 }, si: { id: uuid(104), nome: 'Sì', ordine: 1 },
}
const tratt = (n: number, etichetta: string, ordine: number, ids: string[]): Trattamento => ({ id: uuid(n), etichetta, ordine, livello_ids: ids })
export const tCN = tratt(201, 'Controllo + No', 0, [livelli.controllo.id, livelli.no.id])
export const tCS = tratt(202, 'Controllo + Sì', 1, [livelli.controllo.id, livelli.si.id])
export const tSN = tratt(203, 'S1 + No', 2, [livelli.s1.id, livelli.no.id])
export const tSS = tratt(204, 'S1 + Sì', 3, [livelli.s1.id, livelli.si.id])

const pianta = (n: number, etichetta: string, trattamentoId: string, ordine: number, blocco: string | null): Pianta =>
  ({ id: uuid(n), trattamento_id: trattamentoId, etichetta, blocco, ordine })
export const p1 = pianta(301, '1', tCN.id, 0, 'A')
export const p2 = pianta(302, '2', tCN.id, 1, 'B')
export const p3 = pianta(303, '3', tCS.id, 2, 'A')
export const p4 = pianta(304, '035', tSN.id, 3, null)
export const p5 = pianta(305, '5', tSS.id, 4, 'B')
/** Una pianta con un trattamento che non c'è (non dovrebbe succedere): i suoi valori non devono sparire. */
export const pOrfana = pianta(399, '99', uuid(299), 5, null)

export const spad = parametro(401, 'SPAD', { n_letture: 2 })
export const pA = parametro(411, 'A', { unita: 'µmol/m²/s' })
export const pGs = parametro(412, 'gs', { unita: 'mol/m²/s', ordine: 1 })
export const pE = parametro(413, 'E', { unita: 'mmol/m²/s', ordine: 2 })
export const pCi = parametro(414, 'Ci', { unita: 'ppm', ordine: 3 })
export const altezzaM = parametro(421, 'Altezza', { unita: 'cm', valore_min: 0, valore_max: 300 })
export const vecchio = parametro(422, 'Vecchio', { archiviato: true })
export const altezzaF = parametro(431, 'Altezza', { unita: 'cm' })
export const noteP = parametro(432, 'Note', { tipo: 'testo' })
export const vigoroso = parametro(433, 'Vigoroso', { tipo: 'sino' })
export const palchi = parametro(434, 'Palchi', {
  tipo: 'lista', progressivo: true,
  sotto_campi: [{ chiave: 'fiori', nome: 'Fiori', unita: null }, { chiave: 'lung', nome: 'Lunghezza', unita: 'cm' }],
})

export const sSpad = strumento(501, 'SPAD', 0, [spad])
export const sCiras = strumento(502, 'Ciras', 1, [pA, pGs, pE, pCi])
export const sMetro = strumento(503, 'Metro', 2, [vecchio, altezzaM])
export const sFeno = strumento(504, 'Fenologici', 3, [altezzaF, noteP, vigoroso, palchi], { tipo: 'fenologico' })

export function configExport(): ConfigEsperimento {
  return {
    esperimento: { id: uuid(900), nome: 'Hydrochar prova', data_inizio: '2026-10-01', note: 'Serra 2', stato: 'in_corso' },
    fattori: [
      // in disordine: conta `ordine`
      { id: uuid(111), nome: 'Hydrochar', ordine: 1, livelli: [livelli.no, livelli.si] },
      { id: uuid(110), nome: 'Stress', ordine: 0, livelli: [livelli.controllo, livelli.s1] },
    ],
    trattamenti: [tSS, tCN, tCS, tSN],
    piante: [p5, p1, p2, p3, p4],
    parametri: [spad, pA, pGs, pE, pCi, altezzaM, vecchio, altezzaF, noteP, vigoroso, palchi],
    strumenti: [sFeno, sMetro, sSpad, sCiras],
  }
}

let contatore = 0
export function misura(p: Pianta, s: Strumento, data: string, ora: string, valori: ValoriMisura): Misura {
  contatore += 1
  return { id: uuid(10_000 + contatore), pianta_id: p.id, strumento_id: s.id, data_rilievo: data, ora, valori }
}

export const nota = (n: number, data: string, testo: string, extra: Partial<Nota> = {}): Nota =>
  ({ id: uuid(n), data, testo, promemoria: false, fatto_il: null, pianta_ids: [], trattamento_ids: [], ...extra })
