import { ChevronRight, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { controllaReplica, mlTamponeCalcolato, type Calcolato } from '@/domain/pesatura/calcoli'
import { decimaliDelCalcolato, mediePerTrattamento, valoreReplica } from '@/domain/pesatura/medie'
import { etichettaCampione, letteraReplica, repliche } from '@/domain/pesatura/sequenza'
import type { CampionePesatura, Peso, SessionePesatura, TipoPeso } from '@/domain/pesatura/tipi'
import type { Pianta } from '@/domain/tipi'
import { formattaCifre, formattaDecimali, formattaNumero } from '@/lib/numeri'

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
/** Un valore calcolato (RWC, %, mL): con le cifre significative del dato che ne ha di più. */
const calcolato = (c: Calcolato | null, unita: string): string => (c === null ? TRATTINO : `${formattaCifre(c.valore, c.cifre)}${unita}`)
/** Una media di valori calcolati: con i decimali dei valori come si scrivono. */
const media = (n: number, decimali: number, unita: string): string => `${formattaDecimali(n, decimali)}${unita}`
/** Un peso: esattamente com'è stato scritto o detto, senza arrotondare (0,0017 g resta 0,0017 g). */
const peso = (n: number | null, unita: string): string => (n === null ? TRATTINO : `${formattaNumero(n)}${unita}`)

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
    const calcolati: Calcolato[] = []

    for (const replica of reps) {
      const valore: Partial<Record<TipoPeso, number>> = {}
      for (const p of pesi) if (p.campione_id === c.id && p.replica === replica) valore[p.tipo] = p.valore
      const { fresco, turgido, secco } = valore
      const valori: Valore[] = []
      let questo: Calcolato | null = null

      if (sessione.tipo === 'aliquota') {
        const a = valore.aliquota ?? null
        valori.push({ nome: 'Peso', testo: peso(a, u) })
        const ml = a === null ? null : mlTamponeCalcolato(a, sessione.unita, sessione.impostazioni.rapportoTampone)
        if (sessione.impostazioni.rapportoTampone !== null) valori.push({ nome: 'Tampone', testo: calcolato(ml, ' mL') })
      } else if (sessione.tipo === 'rwc') {
        questo = valoreReplica(sessione, pesi, c.id, replica)
        valori.push(
          { nome: 'Fresco', testo: peso(fresco ?? null, u) }, { nome: 'Turgido', testo: peso(turgido ?? null, u) },
          { nome: 'Secco', testo: peso(secco ?? null, u) }, { nome: 'RWC', testo: calcolato(questo, ' %') },
        )
      } else if (sessione.tipo === 'sostanza_secca') {
        questo = valoreReplica(sessione, pesi, c.id, replica)
        valori.push(
          { nome: 'Fresco', testo: peso(fresco ?? null, u) }, { nome: 'Secco', testo: peso(secco ?? null, u) },
          { nome: 'Sostanza secca', testo: calcolato(questo, ' %') },
        )
      } else {
        const punti = pesi.filter(p => p.campione_id === c.id && p.tipo === 'asciugatura').length
        valori.push(
          { nome: 'Secco', testo: peso(secco ?? null, u) }, { nome: 'Capacità di campo', testo: peso(valore.capacita_campo ?? null, u) },
          { nome: 'Asciugatura', testo: punti === 1 ? '1 peso' : `${punti} pesi` },
        )
      }
      if (questo !== null) calcolati.push(questo)
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
      const valoreMedio = calcolati.reduce((s, x) => s + x.valore, 0) / calcolati.length
      const decimali = Math.max(...calcolati.map(decimaliDelCalcolato))
      righe.push({
        chiave: `${c.id}/media`,
        titolo: `${etichetta} · Media`,
        dettaglio,
        valori: [{ nome: sessione.tipo === 'rwc' ? 'RWC' : 'Sostanza secca', testo: media(valoreMedio, decimali, ' %') }],
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
    <div className="flex flex-col gap-3">
      <MediePerTrattamento {...props} />
      <Righe righe={righe} apri={props.apri} />
    </div>
  )
}

/**
 * La media per trattamento dell'RWC o della % di sostanza secca, in cima al riepilogo. Ogni pianta conta una volta (la
 * media delle sue repliche). Non compare per gli altri tipi né finché nessuna pianta ha il valore.
 */
function MediePerTrattamento({ sessione, campioni, pesi, piante, trattamenti }: RiepilogoSessioneProps) {
  const medie = mediePerTrattamento(sessione, campioni, pesi, piante)
  if (medie.length === 0) return null
  const nome = sessione.tipo === 'rwc' ? 'RWC' : 'Sostanza secca'
  return (
    <section aria-label={`${nome} medio per trattamento`} className="overflow-hidden rounded-2xl border border-inchiostro bg-inchiostro-velato">
      <h3 className="px-4 pt-3 pb-1.5 text-label font-semibold tracking-wide text-inchiostro uppercase">Media per trattamento</h3>
      <ul>
        {medie.map(m => (
          <li key={m.trattamentoId} className="flex items-baseline justify-between gap-3 border-t border-riga px-4 py-2.5">
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold text-grafite">{trattamenti.get(m.trattamentoId) ?? '—'}</span>
              <span className="text-sm text-grafite-tenue">{m.n === 1 ? '1 pianta' : `${m.n} piante`}</span>
            </span>
            <span className="font-mono text-title tabular-nums text-grafite">
              <span className="sr-only">{nome} </span>{media(m.media, m.decimali, ' %')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Righe({ righe, apri }: { righe: Riga[]; apri: RiepilogoSessioneProps['apri'] }) {
  const props = { apri }
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
