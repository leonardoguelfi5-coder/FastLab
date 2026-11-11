import { ChevronRight, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { controllaReplica, mlTampone, rwc, sostanzaSecca } from '@/domain/pesatura/calcoli'
import { etichettaCampione, letteraReplica, repliche } from '@/domain/pesatura/sequenza'
import type { CampionePesatura, Peso, SessionePesatura, TipoPeso } from '@/domain/pesatura/tipi'
import type { Pianta } from '@/domain/tipi'
import { formattaMedia } from '@/lib/numeri'

interface Valore { nome: string; testo: string }
interface Riga {
  chiave: string
  titolo: string
  /** Il trattamento della pianta o il substrato del vaso. */
  dettaglio: string | null
  valori: Valore[]
  avvisi: string[]
  media: boolean
  /** Il campione e la replica della riga (non c'è sulle righe `Media`). */
  da: { campione: string; replica: number } | null
}

interface RiepilogoSessioneProps {
  sessione: SessionePesatura
  campioni: CampionePesatura[]
  /** I pesi della sessione (altri si ignorano). */
  pesi: Peso[]
  piante: ReadonlyMap<string, Pianta>
  /** Il nome del trattamento per id: solo le piante ne hanno uno. */
  trattamenti: ReadonlyMap<string, string>
  /** Dove porta il tocco su una riga: la pesata da quel campione. Senza, le righe non si toccano (lettore). */
  apri?: (campione: string, replica: number) => string
}

const TRATTINO = '—'
const numero = (n: number | null, unita = ''): string => (n === null ? TRATTINO : `${formattaMedia(n)}${unita}`)

/** Una riga per campione e replica, e una riga `Media` per campione quando RWC o sostanza secca hanno più repliche. */
function righeDi({ sessione, campioni, pesi, piante, trattamenti }: RiepilogoSessioneProps): Riga[] {
  const righe: Riga[] = []
  const u = ` ${sessione.unita}`
  const ordinati = [...campioni].sort((a, b) => a.ordine - b.ordine)
  for (const c of ordinati) {
    const etichetta = etichettaCampione(c, piante)
    const pianta = c.pianta_id ? piante.get(c.pianta_id) : undefined
    const dettaglio = pianta ? trattamenti.get(pianta.trattamento_id) ?? null : c.substrato
    const reps = repliche(c, sessione, pesi)
    const calcolati: number[] = []

    for (const replica of reps) {
      const valore: Partial<Record<TipoPeso, number>> = {}
      for (const p of pesi) if (p.campione_id === c.id && p.replica === replica) valore[p.tipo] = p.valore
      const { fresco, turgido, secco } = valore
      const valori: Valore[] = []
      let calcolato: number | null = null

      if (sessione.tipo === 'aliquota') {
        const a = valore.aliquota ?? null
        valori.push({ nome: 'Peso', testo: numero(a, u) })
        const ml = a === null ? null : mlTampone(a, sessione.unita, sessione.impostazioni.rapportoTampone)
        if (sessione.impostazioni.rapportoTampone !== null) valori.push({ nome: 'Tampone', testo: numero(ml, ' mL') })
      } else if (sessione.tipo === 'rwc') {
        calcolato = fresco !== undefined && turgido !== undefined && secco !== undefined ? rwc(fresco, turgido, secco) : null
        valori.push(
          { nome: 'Fresco', testo: numero(fresco ?? null, u) }, { nome: 'Turgido', testo: numero(turgido ?? null, u) },
          { nome: 'Secco', testo: numero(secco ?? null, u) }, { nome: 'RWC', testo: numero(calcolato, ' %') },
        )
      } else if (sessione.tipo === 'sostanza_secca') {
        calcolato = fresco !== undefined && secco !== undefined ? sostanzaSecca(fresco, secco) : null
        valori.push(
          { nome: 'Fresco', testo: numero(fresco ?? null, u) }, { nome: 'Secco', testo: numero(secco ?? null, u) },
          { nome: 'Sostanza secca', testo: numero(calcolato, ' %') },
        )
      } else {
        const punti = pesi.filter(p => p.campione_id === c.id && p.tipo === 'asciugatura').length
        valori.push(
          { nome: 'Secco', testo: numero(secco ?? null, u) }, { nome: 'Capacità di campo', testo: numero(valore.capacita_campo ?? null, u) },
          { nome: 'Asciugatura', testo: punti === 1 ? '1 peso' : `${punti} pesi` },
        )
      }
      if (calcolato !== null) calcolati.push(calcolato)
      righe.push({
        chiave: `${c.id}/${replica}`,
        titolo: reps.length > 1 ? `${etichetta} · ${letteraReplica(replica)}` : etichetta,
        dettaglio,
        valori,
        avvisi: controllaReplica(sessione.tipo, valore),
        media: false,
        da: { campione: c.id, replica },
      })
    }

    if ((sessione.tipo === 'rwc' || sessione.tipo === 'sostanza_secca') && reps.length > 1 && calcolati.length > 0) {
      const media = calcolati.reduce((s, x) => s + x, 0) / calcolati.length
      righe.push({
        chiave: `${c.id}/media`,
        titolo: `${etichetta} · Media`,
        dettaglio,
        valori: [{ nome: sessione.tipo === 'rwc' ? 'RWC' : 'Sostanza secca', testo: numero(media, ' %') }],
        avvisi: [],
        media: true,
        da: null,
      })
    }
  }
  return righe
}

/**
 * Il riepilogo di una sessione a caratteri grandi: una riga per campione e replica, con i pesi della sessione, i mL o
 * i valori calcolati e gli avvisi di coerenza. Un peso che manca si legge `—`, mai uno zero. Con `apri` ogni riga
 * (non le `Media`) porta alla pesata da quel campione.
 */
export function RiepilogoSessione(props: RiepilogoSessioneProps) {
  const righe = righeDi(props)
  if (righe.length === 0) return <p className="text-grafite-tenue">Questa sessione non ha campioni.</p>
  return (
    <ul className="rounded-2xl border border-riga bg-foglio">
      {righe.map(r => {
        const contenuto = (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className={`font-mono text-title tabular-nums text-grafite ${r.media ? 'font-semibold' : ''}`}>{r.titolo}</span>
              {r.dettaglio && <span className="text-sm text-grafite-tenue">{r.dettaglio}</span>}
            </div>
            <dl className="flex flex-wrap gap-x-5 gap-y-1">
              {r.valori.map(v => (
                <div key={v.nome} className="flex items-baseline gap-1.5">
                  <dt className="text-sm text-grafite-tenue">{v.nome}</dt>
                  <dd className="font-mono text-title tabular-nums text-grafite">{v.testo}</dd>
                </div>
              ))}
            </dl>
            {r.avvisi.map(a => (
              <p key={a} className="flex items-start gap-1.5 text-sm font-medium text-attenzione">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                {a}
              </p>
            ))}
          </>
        )
        const classe = `border-b border-riga last:border-0 ${r.media ? 'bg-carta' : ''}`
        if (props.apri && r.da) {
          return (
            <li key={r.chiave} className={classe}>
              <Link
                to={props.apri(r.da.campione, r.da.replica)}
                aria-label={`Pesa ${r.titolo}`}
                className="flex min-h-11 items-center gap-3 px-4 py-3"
              >
                <div className="flex flex-1 flex-col gap-1">{contenuto}</div>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-grafite-tenue" />
              </Link>
            </li>
          )
        }
        return <li key={r.chiave} className={`flex flex-col gap-1 px-4 py-3 ${classe}`}>{contenuto}</li>
      })}
    </ul>
  )
}
