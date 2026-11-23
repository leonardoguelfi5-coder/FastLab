import { useState, type FormEvent } from 'react'
import { Pencil, Plus, Scale, Trash2 } from 'lucide-react'
import { Conferma } from '@/components/Conferma'
import { NumericField } from '@/components/NumericField'
import { TestoErrore } from '@/components/TestoErrore'
import { Button } from '@/components/ui/button'
import { percentualeCCCalcolata, precisioneDeiPesi } from '@/domain/pesatura/calcoli'
import { nomeLettura } from '@/domain/pesatura/export'
import type { CampionePesatura, Peso, SessionePesatura, TipoPeso } from '@/domain/pesatura/tipi'
import { pesateDeiVasi, type PesateDelVaso } from '@/domain/taratura/pesate'
import { dataLocaleDa, formattaData, oraLocale } from '@/lib/date'
import { messaggioErrore } from '@/lib/errori'
import { nuovoId } from '@/lib/id'
import { formattaCifre, formattaNumero } from '@/lib/numeri'

interface RiepilogoVasiProps {
  sessione: SessionePesatura
  campioni: CampionePesatura[]
  pesi: Peso[]
  puoAggiungere: boolean
  puoCorreggere: (creatoDa: string | undefined) => boolean
  senzaRete: boolean
  /** Salva (upsert) un peso: nuovo o corretto. Lancia se non riesce; l'errore resta nel riquadro. */
  onSalva: (p: Peso) => Promise<void>
  /** Elimina un peso. Lancia se non riesce. */
  onElimina: (p: Peso) => Promise<void>
}

const TRATTINO = '—'
/** Un peso: esattamente com'è stato scritto o detto, senza arrotondare (come in `RiepilogoSessione`). */
const testoPeso = (n: number, unita: string): string => `${formattaNumero(n)} ${unita}`
/** Data e ora locali di un istante ISO: GG/MM/AAAA HH:MM. */
const dataOra = (iso: string): string => `${formattaData(dataLocaleDa(iso))} ${oraLocale(new Date(iso))}`
/** Il nome del vaso: quello del campione, o la sua posizione se non ne ha uno. */
const nomeVaso = (c: CampionePesatura): string => c.nome?.trim() || `Vaso ${c.ordine}`

/** Il modulo aperto: su quale vaso e quale riga (`secco`, `cc`, l'id di un punto o `nuova`). */
interface Aperto {
  vaso: string
  riga: string
}

interface Valore { nome: string; testo: string }

/** Una riga del vaso: un peso che c'è (o manca, per secco e CC) con i suoi valori. */
interface Riga {
  chiave: string
  titolo: string
  tipo: TipoPeso
  peso: Peso | null
  valori: Valore[]
}

/**
 * Il riassunto delle pesate dei vasi, per substrato: per ogni vaso il secco, la capacità di campo e i punti di
 * asciugatura con la lettura e la % CC. Ogni peso si corregge o si elimina (chi può), un secco o una CC che mancano si
 * pesano e si aggiunge una pesata di asciugatura. Il salvataggio lo fanno `onSalva` e `onElimina`.
 */
export function RiepilogoVasi(props: RiepilogoVasiProps) {
  const { campioni, pesi, onElimina } = props
  const [aperto, setAperto] = useState<Aperto | null>(null)
  const [daEliminare, setDaEliminare] = useState<Peso | null>(null)
  const [erroreEliminazione, setErroreEliminazione] = useState<{ vaso: string; testo: string } | null>(null)

  if (campioni.length === 0) return <p className="text-grafite-tenue">Questa sessione non ha vasi.</p>
  const gruppi = pesateDeiVasi(campioni, pesi)
  const precisione = precisioneDeiPesi(pesi)

  async function elimina(p: Peso) {
    setErroreEliminazione(null)
    try {
      await onElimina(p)
    } catch (e) {
      setErroreEliminazione({ vaso: p.campione_id, testo: messaggioErrore(e) })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {gruppi.map(g => (
        <section key={g.substrato} aria-label={g.substrato} className="flex flex-col gap-3">
          <h3 className="text-label font-semibold tracking-wide text-inchiostro uppercase">
            {g.substrato}
          </h3>
          {g.vasi.map(v => (
            <SchedaVaso
              key={v.campione.id}
              {...props}
              vaso={v}
              precisione={precisione}
              aperto={aperto?.vaso === v.campione.id ? aperto.riga : null}
              apri={riga => setAperto({ vaso: v.campione.id, riga })}
              chiudi={() => setAperto(null)}
              chiediEliminazione={setDaEliminare}
              erroreEliminazione={erroreEliminazione?.vaso === v.campione.id ? erroreEliminazione.testo : null}
            />
          ))}
        </section>
      ))}
      <Conferma
        aperta={daEliminare !== null}
        titolo="Eliminare questa pesata?"
        testo="Non si può annullare."
        annulla="Tieni la pesata"
        conferma="Elimina"
        onAnnulla={() => setDaEliminare(null)}
        onConferma={() => {
          const p = daEliminare
          setDaEliminare(null)
          if (p) void elimina(p)
        }}
      />
    </div>
  )
}

interface SchedaVasoProps extends RiepilogoVasiProps {
  vaso: PesateDelVaso
  precisione: number
  aperto: string | null
  apri: (riga: string) => void
  chiudi: () => void
  chiediEliminazione: (p: Peso) => void
  erroreEliminazione: string | null
}

function righeDel(v: PesateDelVaso, sessione: SessionePesatura, precisione: number): Riga[] {
  const u = sessione.unita
  const sensore = sessione.impostazioni.sensore
  const nome = sensore ? nomeLettura(sensore) : 'Lettura'
  const lettura = (p: Peso): Valore => ({ nome, testo: p.lettura === null ? 'manca la lettura' : formattaNumero(p.lettura) })
  const righe: Riga[] = [
    {
      chiave: 'secco', titolo: 'Secco', tipo: 'secco', peso: v.secco,
      valori: v.secco ? [{ nome: 'Peso', testo: testoPeso(v.secco.valore, u) }] : [],
    },
    {
      chiave: 'cc', titolo: 'Capacità di campo', tipo: 'capacita_campo', peso: v.cc,
      valori: v.cc ? [{ nome: 'Peso', testo: testoPeso(v.cc.valore, u) }, lettura(v.cc)] : [],
    },
  ]
  for (const p of v.punti) {
    const pcc = v.secco && v.cc ? percentualeCCCalcolata(p.valore, v.secco.valore, v.cc.valore, precisione) : null
    righe.push({
      chiave: p.id, titolo: dataOra(p.misurato_il), tipo: 'asciugatura', peso: p,
      valori: [
        { nome: 'Peso', testo: testoPeso(p.valore, u) }, lettura(p),
        { nome: '% CC', testo: pcc === null ? TRATTINO : `${formattaCifre(pcc.valore, pcc.cifre)} %` },
      ],
    })
  }
  return righe
}

function SchedaVaso(props: SchedaVasoProps) {
  const { vaso, sessione, precisione, aperto, apri, chiudi, puoAggiungere, puoCorreggere, senzaRete, onSalva } = props
  const nome = nomeVaso(vaso.campione)
  const righe = righeDel(vaso, sessione, precisione)

  /** Il peso da salvare: quello corretto mantiene id, data e autore; uno nuovo nasce adesso, nella replica 1. */
  const salva = (r: { tipo: TipoPeso; peso: Peso | null }) => async (valore: number, lettura: number | null) => {
    const l = r.tipo === 'secco' ? null : lettura
    const p: Peso = r.peso
      ? { ...r.peso, valore, lettura: l }
      : { id: nuovoId(), campione_id: vaso.campione.id, replica: 1, tipo: r.tipo, valore, lettura: l, misurato_il: new Date().toISOString() }
    await onSalva(p)
    chiudi()
  }

  return (
    <article aria-labelledby={`vaso-${vaso.campione.id}`} className="rounded-2xl border border-riga bg-foglio">
      <h4 id={`vaso-${vaso.campione.id}`} className="px-4 pt-3 pb-1 font-mono text-title tabular-nums text-grafite">{nome}</h4>
      {props.erroreEliminazione && (
        <TestoErrore role="alert" className="px-4">{props.erroreEliminazione}</TestoErrore>
      )}
      <ul>
        {righe.map(r => {
          const etichetta = `${r.titolo}, ${nome}`
          if (aperto === r.chiave) {
            return (
              <li key={r.chiave} className="border-t border-riga px-4 py-3">
                <ModuloPeso
                  nome={`${r.peso ? 'Modifica' : 'Pesa'} ${etichetta}`}
                  sessione={sessione}
                  conLettura={r.tipo !== 'secco'}
                  iniziale={r.peso}
                  senzaRete={senzaRete}
                  onSalva={salva(r)}
                  onAnnulla={chiudi}
                />
              </li>
            )
          }
          const correggibile = r.peso !== null && puoCorreggere(r.peso.creato_da)
          return (
            <li key={r.chiave} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-riga px-4 py-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-medium text-grafite">{r.titolo}</span>
                {r.peso === null ? (
                  <span className="text-grafite-tenue">da pesare</span>
                ) : (
                  <dl className="flex flex-wrap gap-x-5 gap-y-1">
                    {r.valori.map(v => (
                      <div key={v.nome} className="flex items-baseline gap-1.5">
                        <dt className="text-sm text-grafite-tenue">{v.nome}</dt>
                        <dd className="font-mono tabular-nums text-grafite">{v.testo}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
              <div className="flex gap-1">
                {r.peso === null && puoAggiungere && (
                  <Button type="button" variant="outline" size="sm" disabled={senzaRete} aria-label={`Pesa ${etichetta}`} onClick={() => apri(r.chiave)}>
                    <Scale aria-hidden />
                    Pesa
                  </Button>
                )}
                {correggibile && (
                  <>
                    <Button type="button" variant="ghost" size="sm" disabled={senzaRete} aria-label={`Modifica ${etichetta}`} onClick={() => apri(r.chiave)}>
                      <Pencil aria-hidden />
                      Modifica
                    </Button>
                    <Button
                      type="button" variant="ghost" size="sm" disabled={senzaRete} aria-label={`Elimina ${etichetta}`}
                      onClick={() => props.chiediEliminazione(r.peso as Peso)}
                    >
                      <Trash2 aria-hidden />
                      Elimina
                    </Button>
                  </>
                )}
              </div>
            </li>
          )
        })}
        {aperto === 'nuova' && (
          <li className="border-t border-riga px-4 py-3">
            <ModuloPeso
              nome={`Nuova pesata, ${nome}`}
              sessione={sessione}
              conLettura
              iniziale={null}
              senzaRete={senzaRete}
              onSalva={salva({ tipo: 'asciugatura', peso: null })}
              onAnnulla={chiudi}
            />
          </li>
        )}
      </ul>
      {puoAggiungere && aperto !== 'nuova' && (
        <div className="border-t border-riga px-4 py-3">
          <Button type="button" variant="outline" disabled={senzaRete} aria-label={`Aggiungi pesata, ${nome}`} onClick={() => apri('nuova')}>
            <Plus aria-hidden />
            Aggiungi pesata
          </Button>
        </div>
      )}
    </article>
  )
}

interface ModuloPesoProps {
  /** Il nome accessibile del modulo, con la riga e il vaso (es. «Modifica Capacità di campo, V1»). */
  nome: string
  sessione: SessionePesatura
  conLettura: boolean
  /** Il peso da correggere; null per pesarne uno nuovo (modulo vuoto). */
  iniziale: Peso | null
  senzaRete: boolean
  /** Lancia se non riesce: il messaggio resta nel modulo, con i campi. */
  onSalva: (valore: number, lettura: number | null) => Promise<void>
  onAnnulla: () => void
}

/** Il peso e, fuori dal secco, la lettura del sensore: obbligatori, con gli stessi messaggi della pesata. */
function ModuloPeso({ nome, sessione, conLettura, iniziale, senzaRete, onSalva, onAnnulla }: ModuloPesoProps) {
  const [valore, setValore] = useState<number | null>(iniziale?.valore ?? null)
  const [lettura, setLettura] = useState<number | null>(iniziale?.lettura ?? null)
  const [provato, setProvato] = useState(false)
  const [occupato, setOccupato] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const sensore = sessione.impostazioni.sensore

  const valoreValido = valore !== null && Number.isFinite(valore) && valore >= 0
  const letturaValida = lettura !== null && Number.isFinite(lettura)
  const problemi: string[] = []
  if (!valoreValido) problemi.push('Scrivi il peso.')
  if (conLettura && !letturaValida) problemi.push('Scrivi la lettura del sensore.')

  async function invia(e: FormEvent) {
    e.preventDefault()
    setProvato(true)
    if (problemi.length > 0 || senzaRete || occupato) return
    setOccupato(true)
    setErrore(null)
    try {
      await onSalva(valore as number, conLettura ? lettura : null)
    } catch (err) {
      setErrore(messaggioErrore(err))
      setOccupato(false)
    }
  }

  return (
    <form aria-label={nome} noValidate className="flex flex-col gap-3" onSubmit={e => void invia(e)}>
      <p className="font-medium text-grafite">{nome}</p>
      <NumericField label="Peso" unita={sessione.unita} value={valore} onChange={setValore} obbligatorio />
      {conLettura && (
        <NumericField label={sensore ? nomeLettura(sensore) : 'Lettura'} value={lettura} onChange={setLettura} obbligatorio negativo />
      )}
      {provato && problemi.map(p => <TestoErrore key={p}>{p}</TestoErrore>)}
      {errore && <TestoErrore role="alert">{errore}</TestoErrore>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={senzaRete || occupato} aria-busy={occupato}>Salva</Button>
        <Button type="button" variant="outline" disabled={occupato} onClick={onAnnulla}>Annulla</Button>
      </div>
    </form>
  )
}
