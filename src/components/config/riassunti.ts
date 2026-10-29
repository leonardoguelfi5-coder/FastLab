import type { Parametro } from '@/domain/tipi'

const TIPO: Record<Parametro['tipo'], string> = { numero: 'Numero', testo: 'Testo', sino: 'Sì/No', lista: 'Lista ripetuta' }

/** Riassunto di un parametro in una riga, es. "Numero · °C · ricorda tra piante". */
export function riassuntoParametro(p: Parametro): string {
  const parti: string[] = [TIPO[p.tipo]]
  if (p.unita) parti.push(p.unita)
  if (p.tipo === 'numero' && p.n_letture > 1) parti.push(`${p.n_letture} letture`)
  if (p.tipo === 'lista') parti.push(p.sotto_campi.length === 1 ? '1 sotto-campo' : `${p.sotto_campi.length} sotto-campi`)
  if (p.progressivo) parti.push('progressivo')
  if (p.ricorda_tra_piante) parti.push('ricorda tra piante')
  return parti.join(' · ')
}
