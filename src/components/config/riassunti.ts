import type { Parametro, ParametroCatalogo } from '@/domain/tipi'

const TIPO: Record<Parametro['tipo'], string> = { numero: 'Numero', testo: 'Testo', sino: 'Sì/No', lista: 'Lista ripetuta' }

/** Riassunto di un parametro in una riga, es. "Numero · °C · progressivo". */
export function riassuntoParametro(p: Parametro): string {
  const parti: string[] = [TIPO[p.tipo]]
  if (p.unita) parti.push(p.unita)
  if (p.tipo === 'numero' && p.n_letture > 1) parti.push(`${p.n_letture} letture`)
  if (p.tipo === 'lista') parti.push(p.sotto_campi.length === 1 ? '1 sotto-campo' : `${p.sotto_campi.length} sotto-campi`)
  if (p.progressivo) parti.push('progressivo')
  return parti.join(' · ')
}

/** Un valore di una voce del catalogo come si legge in campo: il nome e, se c'è, l'unità (es. "Temp aria °C"). */
export function valoreCatalogo(p: ParametroCatalogo): string {
  return p.unita ? `${p.nome} ${p.unita}` : p.nome
}
