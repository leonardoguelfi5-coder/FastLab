import type { Fattore } from '@/domain/tipi'

const normalizza = (s: string) => s.trim().toLowerCase()

/** Vero se il fattore ha già un livello con questo nome (senza badare a spazi e maiuscole). */
export function livelloDoppio(f: Fattore, testo: string): boolean {
  const nome = normalizza(testo)
  return nome !== '' && f.livelli.some(l => normalizza(l.nome) === nome)
}

/** Vero se `testo` si può aggiungere come livello: non vuoto e non già presente. */
export function livelloAggiungibile(f: Fattore, testo: string): boolean {
  return testo.trim() !== '' && !livelloDoppio(f, testo)
}

/** Il fattore con il livello `testo` in fondo, oppure null se il livello non si può aggiungere. */
export function conLivello(f: Fattore, testo: string): Fattore | null {
  if (!livelloAggiungibile(f, testo)) return null
  return { ...f, livelli: [...f.livelli, { id: crypto.randomUUID(), nome: testo.trim(), ordine: f.livelli.length }] }
}

/**
 * I livelli scritti in "Nuovo livello" e non ancora aggiunti (per id del fattore) entrano nei fattori.
 * Restano scritti solo i testi che non si potevano aggiungere (es. un livello già presente).
 */
export function conLivelliInSospeso(fattori: Fattore[], testi: Record<string, string>): {
  fattori: Fattore[]
  testi: Record<string, string>
} {
  const restanti: Record<string, string> = {}
  const nuovi = fattori.map(f => {
    const testo = testi[f.id] ?? ''
    const aggiornato = conLivello(f, testo)
    if (aggiornato) return aggiornato
    if (testo !== '') restanti[f.id] = testo
    return f
  })
  return { fattori: nuovi, testi: restanti }
}
