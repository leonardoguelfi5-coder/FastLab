import { describe, it, expect } from 'vitest'
import migration from '../../../supabase/migrations/20261029000009_catalogo.sql?raw'
import type { VoceCatalogo } from '../tipi'
import { SEMI_CATALOGO } from './semi'

/** Le voci dell'`insert into catalogo_strumenti` della migration, lette dal testo (apici raddoppiati compresi). */
function semiDellaMigration(): VoceCatalogo[] {
  const testo = migration.slice(migration.indexOf('insert into catalogo_strumenti'))
  const apici = (s: string) => s.replace(/''/g, '\'')
  const riga = /\('(c0000000-[0-9a-f-]+)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'(\[[\s\S]*?\])',\s*null\)/g
  return [...testo.matchAll(riga)].map(m => ({
    id: m[1], nome: apici(m[2]), icona: apici(m[3]), descrizione: apici(m[4]),
    parametri: JSON.parse(m[5]), archiviato: false,
  }))
}

describe('SEMI_CATALOGO', () => {
  it('coincide con i semi della migration del catalogo', () => {
    const dalSql = semiDellaMigration()
    expect(dalSql).toHaveLength(5)
    expect(SEMI_CATALOGO).toEqual(dalSql)
  })

  it('nomi e chiavi sono unici', () => {
    expect(new Set(SEMI_CATALOGO.map(v => v.nome.toLowerCase())).size).toBe(SEMI_CATALOGO.length)
    for (const v of SEMI_CATALOGO) expect(new Set(v.parametri.map(p => p.chiave)).size).toBe(v.parametri.length)
  })
})
