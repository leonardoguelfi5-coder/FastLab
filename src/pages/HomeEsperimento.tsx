import { useMemo, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Camera, BarChart3, CalendarDays, ChevronRight, NotebookPen, Plus, type LucideIcon } from 'lucide-react'
import { IconaStrumento, IconaTonda } from '@/components/IconaTonda'
import { useConfig, useMisureGiorno, useNote, useUltimeMisure } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { Caricamento } from '@/components/Caricamento'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { senzaNoteInEliminazione } from '@/components/note/eliminaNotaConAnnulla'
import { chiaveSpuntaPromemoria } from '@/components/note/spuntaPromemoriaConAnnulla'
import { promemoriaDelGiorno } from '@/domain/note'
import { riepilogoGiro, statiPiante } from '@/domain/giro'
import { daSistemare } from '@/domain/statistiche'
import type { ConfigEsperimento } from '@/domain/tipi'
import { inEliminazione } from '@/lib/eliminaConAnnulla'
import { percorsoDataset, percorsoDiario, percorsoGalleria, percorsoNuovaMisura, percorsoOggi } from '@/lib/percorsi'
import { useLetturaInAnticipo } from '@/lib/letturaInAnticipo'
import { SOLO_LETTURA } from '@/lib/ruoli'
import { useOggi } from '@/lib/useOggi'
import { usePermessi } from '@/lib/usePermessi'
import { cn } from '@/lib/utils'
import { useCampoStore } from '@/store/campo'

/** "56 piante · 8 trattamenti · in corso", con il singolare dove serve. */
function riepilogo({ esperimento, piante, trattamenti }: ConfigEsperimento): string {
  const nPiante = piante.length === 1 ? '1 pianta' : `${piante.length} piante`
  const nTrattamenti = trattamenti.length === 1 ? '1 trattamento' : `${trattamenti.length} trattamenti`
  return `${nPiante} · ${nTrattamenti} · ${esperimento.stato === 'concluso' ? 'concluso' : 'in corso'}`
}

/**
 * Il giro in corso dello strumento scelto l'ultima volta, alla data di rilievo: "🌡 SPAD in corso · 34/56". Compare
 * solo con uno strumento non archiviato dell'esperimento, almeno una pianta già toccata e il giro non finito; per
 * il resto (nessuna scelta, giro non cominciato o finito) la striscia ha solo il titolo. Gli stati si calcolano solo
 * a misure arrivate (dopo un primo successo; una rilettura fallita lascia quelle già lette): senza, non si può dire
 * quali piante sono fatte. Un errore di lettura qui non si mostra: non serve per aprire la misura, e la home non deve
 * allarmare per un dettaglio. L'icona è a parte, per tenerla fuori dal nome che leggono i lettori di schermo.
 */
function useGiroInCorso(espId: string, config: ConfigEsperimento): { icona: string | null; testo: string; fatte: number; totale: number } | null {
  const oggi = useOggi()
  const { strumentoId, dataRilievo } = useCampoStore(s => s.dati(espId, oggi))
  // Senza uno strumento scelto non c'è giro da mostrare: non si legge nulla (la home non paga una query per niente).
  const misure = useMisureGiorno(strumentoId ? espId : undefined, dataRilievo)
  const dati = misure.data

  return useMemo(() => {
    if (!dati) return null
    const strumento = config.strumenti.find(s => s.id === strumentoId && !s.archiviato)
    if (!strumento) return null
    const stati = statiPiante(strumento, config.parametri, dati, config.piante)
    const { fatte, totale } = riepilogoGiro(config.piante, stati)
    const cominciato = [...stati.values()].some(stato => stato !== 'da_fare')
    if (!cominciato || fatte >= totale) return null
    return { icona: strumento.icona, testo: `${strumento.nome} in corso · ${fatte}/${totale}`, fatte, totale }
  }, [dati, config, strumentoId])
}

/** L'anello del giro in corso: quante piante sono fatte sul totale. Solo decorativo, il testo lo dice già. */
function AnelloGiro({ fatte, totale }: { fatte: number; totale: number }) {
  const r = 31
  const giro = 2 * Math.PI * r
  return (
    <svg aria-hidden viewBox="0 0 74 74" className="size-[76px] shrink-0">
      <circle cx="37" cy="37" r={r} stroke="rgb(255 255 255 / 0.2)" strokeWidth="7" fill="none" />
      <circle
        cx="37" cy="37" r={r} stroke="var(--inchiostro)" strokeWidth="7" fill="none" strokeLinecap="round"
        strokeDasharray={`${(fatte / Math.max(totale, 1)) * giro} ${giro}`} transform="rotate(-90 37 37)"
      />
      <text x="37" y="36" textAnchor="middle" fontSize="17" fontWeight="700" fill="currentColor" className="font-display">{fatte}</text>
      <text x="37" y="49" textAnchor="middle" fontSize="8.5" fill="currentColor" opacity="0.75">di {totale}</text>
    </svg>
  )
}

/**
 * La fascia verde in testa: quante piante, il riepilogo, l'anello del giro a metà e "Nuova misura" (o, per un
 * lettore, la tessera di sola lettura). Sotto "Nuova misura", se c'è un giro a metà, si dice a che punto è.
 */
function Fascia({ espId, config, puoMisurare }: { espId: string; config: ConfigEsperimento; puoMisurare: boolean }) {
  const giro = useGiroInCorso(espId, config)
  const nPiante = config.piante.length

  return (
    <section className="-mx-4 -mt-6 flex flex-col gap-4 rounded-b-[34px] bg-fascia px-5 pt-5 pb-6 text-white">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p aria-hidden className="font-display text-[52px] leading-none font-bold tracking-tight tabular-nums">
            {nPiante}
            <span className="ml-1.5 text-xl tracking-normal">{nPiante === 1 ? 'pianta' : 'piante'}</span>
          </p>
          {/* Il numero grande dice già le piante: a vista resta il resto, ai lettori di schermo la frase intera. */}
          <p className="sr-only">{riepilogo(config)}</p>
          <p aria-hidden className="mt-2 font-mono text-label tabular-nums text-white/80">{riepilogo(config).split(' · ').slice(1).join(' · ')}</p>
        </div>
        {giro && <AnelloGiro fatte={giro.fatte} totale={giro.totale} />}
      </div>
      {puoMisurare ? (
        <Link
          to={percorsoNuovaMisura(espId)}
          className="flex min-h-14 items-center gap-3 rounded-full bg-white/15 px-5 py-3 text-white transition-colors hover:bg-white/20 active:bg-white/25"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-2 text-title"><Plus aria-hidden className="size-5" strokeWidth={2.5} />Nuova misura</span>
            {giro && (
              <span className="font-mono text-label tabular-nums text-white/85">
                <IconaStrumento emoji={giro.icona} piccola className="mr-1.5 inline-flex size-5 bg-white/15 align-middle text-white" />
                {giro.testo}
              </span>
            )}
          </span>
          <ChevronRight aria-hidden className="size-6 shrink-0" />
        </Link>
      ) : <TesseraSoloLettura />}
    </section>
  )
}

/** "oggi", "ieri", "3 giorni fa": date AAAA-MM-GG confrontate a mezzogiorno, così l'ora legale non sposta i giorni. */
function quantoTempoFa(data: string, oggi: string): string {
  const giorni = Math.round((Date.parse(`${oggi}T12:00:00`) - Date.parse(`${data}T12:00:00`)) / 86400000)
  if (giorni <= 0) return 'oggi'
  if (giorni === 1) return 'ieri'
  return `${giorni} giorni fa`
}

/**
 * Le ultime misure in ordine di tempo: ogni strumento attivo con la data della sua ultima misura, dalla più recente;
 * quelli mai misurati in fondo. Toccando uno strumento si apre il suo grafico nel Dataset. Finché le date non sono
 * arrivate (o se la lettura non riesce) la sezione non c'è: la home non mostra dati finti né allarma.
 */
function UltimeMisure({ espId, config }: { espId: string; config: ConfigEsperimento }) {
  const oggi = useOggi()
  const ultime = useUltimeMisure(espId).data
  const strumenti = config.strumenti.filter(s => !s.archiviato)
  if (!ultime || strumenti.length === 0) return null

  const ordinati = [...strumenti].sort((a, b) => (ultime.get(b.id) ?? '').localeCompare(ultime.get(a.id) ?? ''))

  return (
    <section aria-labelledby="titolo-ultime" className="flex flex-col gap-1">
      <h2 id="titolo-ultime" className="px-1 text-label text-grafite-tenue uppercase">Ultime misure</h2>
      <ol className="relative pl-6 before:absolute before:top-4 before:bottom-4 before:left-[7px] before:w-0.5 before:bg-riga">
        {ordinati.map(s => {
          const data = ultime.get(s.id)
          return (
            <li key={s.id} className="relative">
              <span
                aria-hidden
                className={cn('absolute top-[22px] -left-[22px] size-3 rounded-full shadow-[0_0_0_3px_var(--carta)]', data ? 'bg-inchiostro' : 'bg-riga-forte')}
              />
              <Link to={percorsoDataset(espId, new URLSearchParams({ s: s.id }))} className="flex min-h-14 items-center gap-3 py-2">
                <IconaStrumento emoji={s.icona} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-[600] text-grafite">{s.nome}</span>
                  <span className="font-mono text-label tabular-nums text-grafite-tenue">
                    {data ? `ultima ${data.slice(8, 10)}/${data.slice(5, 7)} · ${quantoTempoFa(data, oggi)}` : 'mai misurato'}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-grafite-tenue" />
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

const VOCE = 'relative flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-2xl border border-riga bg-foglio px-1 py-3 text-center text-label font-[600] text-grafite transition-colors hover:border-riga-controllo active:bg-carta-ombra'

/** Una sezione: l'emoji è l'icona scelta nella spec, solo decorativa (il nome la dice già). */
function Voce({ to, icona, nome, className, children }: { to: string; icona: LucideIcon; nome: string; className?: string; children?: ReactNode }) {
  return (
    <Link to={to} className={cn(VOCE, className)}>
      <IconaTonda icona={icona} />
      <span>{nome}</span>
      {children}
    </Link>
  )
}

/** Che cosa c'è da guardare in Oggi: quanti promemoria e quanti valori da sistemare. */
interface DaControllare { promemoria: number; valori: number }

/**
 * Quanto c'è da guardare in Oggi, per il numerino: i promemoria del giorno (`promemoriaDelGiorno`) e i valori di oggi da
 * controllare (`daSistemare`), contati con lo stesso `oggi` (`useOggi()`) delle righe della pagina Oggi, non con la
 * data di rilievo scelta. Ciò che non è arrivato (in arrivo, o non riuscito) vale zero: la home non mostra un numero
 * finto né allarma per un errore di lettura (la pagina Oggi, se serve, lo dice). I promemoria spuntati o le note
 * eliminate con l'"Annulla" ancora aperto non si contano. Con la data di rilievo di oggi le misure sono la stessa query
 * della striscia: una sola lettura.
 */
function useDaControllare(espId: string, config: ConfigEsperimento): DaControllare {
  const oggi = useOggi()
  const misure = useMisureGiorno(espId, oggi).data
  const note = useNote(espId).data
  const valori = useMemo(() => (misure ? daSistemare(config, misure, oggi).length : 0), [misure, config, oggi])
  // Senza memoria: dipende anche da ciò che è "in attesa" (fuori da React), e l'elenco è breve.
  const promemoria = note
    ? promemoriaDelGiorno(senzaNoteInEliminazione(note), oggi).filter(n => !inEliminazione(chiaveSpuntaPromemoria(n.id))).length
    : 0
  return { promemoria, valori }
}

/** La frase per chi non vede il numerino: "2 promemoria e 1 valore da controllare". */
function descriviDaControllare({ promemoria, valori }: DaControllare): string {
  const parti: string[] = []
  if (promemoria > 0) parti.push(`${promemoria} promemoria`)
  if (valori > 0) parti.push(valori === 1 ? '1 valore da controllare' : `${valori} valori da controllare`)
  return parti.join(' e ')
}

/**
 * Il numerino su Oggi: un segno in attenzione velato con il totale (promemoria più valori da sistemare), e a chi non lo
 * vede (lettori di schermo) la frase intera. Mai solo colore: c'è il numero.
 */
function NumerinoDaControllare({ da }: { da: DaControllare }) {
  return (
    <>
      <span aria-hidden className="absolute top-1.5 right-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-attenzione px-1 font-mono text-[11px] tabular-nums text-carta">{da.promemoria + da.valori}</span>
      {/* Lo spazio tiene staccata la frase da "Oggi" nel nome del link. */}
      {' '}
      <span className="sr-only">{descriviDaControllare(da)}</span>
    </>
  )
}

/** Al posto di "Nuova misura" per un lettore: la tessera dice che si guarda soltanto (nessun inchiostro, non è un'azione). */
function TesseraSoloLettura() {
  return (
    <div className="flex min-h-14 flex-col justify-center gap-0.5 rounded-lg border border-white/30 px-4 py-3">
      <span className="text-title text-white">{SOLO_LETTURA}</span>
      <span className="text-sm text-white/80">Puoi guardare, esportare e duplicare l&apos;esperimento.</span>
    </div>
  )
}

/** La home dell'esperimento a configurazione caricata: riepilogo, "Nuova misura" e le icone delle sezioni. */
function HomeCaricata({ espId, config }: { espId: string; config: ConfigEsperimento }) {
  const daControllare = useDaControllare(espId, config)
  // Solo un lettore noto perde "Nuova misura": se il ruolo non si è potuto leggere il giro resta aperto (il database
  // rifiuta ciò che non è permesso).
  const { puoMisurare } = usePermessi(espId)

  return (
    <>
      <Fascia espId={espId} config={config} puoMisurare={puoMisurare} />
      {/* Piante e Laboratorio stanno nella barra in basso; Esporta Excel e Impostazioni in Altro. */}
      <nav aria-label="Sezioni" className="grid grid-cols-4 gap-2">
        <Voce to={percorsoOggi(espId)} icona={CalendarDays} nome="Oggi">
          {daControllare.promemoria + daControllare.valori > 0 && <NumerinoDaControllare da={daControllare} />}
        </Voce>
        <Voce to={percorsoDiario(espId)} icona={NotebookPen} nome="Diario" />
        <Voce to={percorsoGalleria(espId)} icona={Camera} nome="Foto" />
        <Voce to={percorsoDataset(espId)} icona={BarChart3} nome="Dataset" />
      </nav>
      <UltimeMisure espId={espId} config={config} />
    </>
  )
}

/** Home di un esperimento: da qui si parte per una nuova misura o si apre una sezione. */
export function HomeEsperimento() {
  const { espId = '' } = useParams()
  const config = useConfig(espId)
  const dati = config.data
  // Con la rete si leggono in anticipo il giorno di rilievo e le piante (Piano E, Task E7): più tardi, senza rete, il giro
  // funziona anche sulle piante non aperte prima.
  const oggi = useOggi()
  const dataRilievo = useCampoStore(s => s.dati(espId, oggi).dataRilievo)
  useLetturaInAnticipo(espId, dati, dataRilievo)

  return (
    <AppShell titolo={dati?.esperimento.nome ?? 'Esperimento'} indietro="/" nav={espId}>
      {dati === undefined ? (
        config.isError
          ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
          : <Caricamento />
      ) : (
        <HomeCaricata espId={espId} config={dati} />
      )}
    </AppShell>
  )
}
