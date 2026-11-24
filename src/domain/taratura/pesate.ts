import { SENZA_SUBSTRATO } from '@/domain/pesatura/curva'
import type { CampionePesatura, Peso } from '@/domain/pesatura/tipi'

/** Il nome di un vaso: quello del campione, o «Vaso» e la sua posizione se non ne ha uno. */
export const nomeDelVaso = (c: CampionePesatura): string => c.nome?.trim() || `Vaso ${c.ordine}`

/** Le pesate di un vaso nella replica 1 (i vasi ne hanno una sola): il secco, la capacità di campo e l'asciugatura. */
export interface PesateDelVaso {
  campione: CampionePesatura
  secco: Peso | null
  cc: Peso | null
  /** L'asciugatura in ordine di tempo (`misurato_il`, confrontato come data). */
  punti: Peso[]
}

/** Gli istanti si confrontano come date: le stringhe con fusi orari diversi non sono ordinabili alfabeticamente. */
const istante = (s: string): number => {
  const t = Date.parse(s)
  return Number.isNaN(t) ? 0 : t
}

/** Il nome del gruppo, come in `curvePerSubstrato`: un substrato vuoto o di soli spazi è `SENZA_SUBSTRATO`. */
const nomeSubstrato = (s: string | null): string => s?.trim() || SENZA_SUBSTRATO

/** Raggruppate per substrato nell'ordine dei campioni (`ordine`), come `curvePerSubstrato`. Replica 1. */
export function pesateDeiVasi(campioni: CampionePesatura[], pesi: Peso[]): { substrato: string; vasi: PesateDelVaso[] }[] {
  const gruppi = new Map<string, PesateDelVaso[]>()
  for (const campione of [...campioni].sort((a, b) => a.ordine - b.ordine)) {
    const suoi = pesi.filter(p => p.campione_id === campione.id && p.replica === 1)
    const vaso: PesateDelVaso = {
      campione,
      secco: suoi.find(p => p.tipo === 'secco') ?? null,
      cc: suoi.find(p => p.tipo === 'capacita_campo') ?? null,
      punti: suoi.filter(p => p.tipo === 'asciugatura').sort((x, y) => istante(x.misurato_il) - istante(y.misurato_il)),
    }
    const nome = nomeSubstrato(campione.substrato)
    const elenco = gruppi.get(nome)
    if (elenco) elenco.push(vaso)
    else gruppi.set(nome, [vaso])
  }
  return [...gruppi].map(([substrato, vasi]) => ({ substrato, vasi }))
}
