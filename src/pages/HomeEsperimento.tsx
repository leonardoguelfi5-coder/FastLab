import { useMemo, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useConfig, useMisureGiorno, useNote } from '@/api/query'
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
import { percorsoDataset, percorsoDiario, percorsoEsporta, percorsoGalleria, percorsoImpostazioni, percorsoNuovaMisura, percorsoOggi, percorsoPiante } from '@/lib/percorsi'
import { useLetturaInAnticipo } from '@/lib/letturaInAnticipo'
import { useOggi } from '@/lib/useOggi'
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
function useGiroInCorso(espId: string, config: ConfigEsperimento): { icona: string | null; testo: string } | null {
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
    return { icona: strumento.icona, testo: `${strumento.nome} in corso · ${fatte}/${totale}` }
  }, [dati, config, strumentoId])
}

/**
 * "Nuova misura": l'unico elemento a inchiostro pieno della home (regola dell'unico inchiostro). Porta alla misura;
 * sotto il titolo, se c'è un giro a metà, dice a che punto è.
 */
function StrisciaNuovaMisura({ espId, config }: { espId: string; config: ConfigEsperimento }) {
  const giro = useGiroInCorso(espId, config)

  return (
    <Link
      to={percorsoNuovaMisura(espId)}
      className="flex min-h-14 items-center gap-3 rounded-lg bg-inchiostro px-4 py-3 text-foglio transition-colors hover:bg-inchiostro-scuro active:bg-inchiostro-scuro"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-title"><span aria-hidden>➕ </span>Nuova misura</span>
        {giro && (
          <span className="font-mono text-label tabular-nums text-foglio/85">
            {giro.icona && <span aria-hidden>{`${giro.icona} `}</span>}
            {giro.testo}
          </span>
        )}
      </span>
      <ChevronRight aria-hidden className="size-6 shrink-0" />
    </Link>
  )
}

const VOCE = 'flex min-h-14 items-center gap-2.5 rounded-lg border border-riga-controllo bg-foglio px-3 py-3 font-[550] text-grafite transition-colors hover:border-grafite-tenue active:bg-carta-ombra'

/** Una sezione: l'emoji è l'icona scelta nella spec, solo decorativa (il nome la dice già). */
function Voce({ to, icona, nome, className, children }: { to: string; icona: string; nome: string; className?: string; children?: ReactNode }) {
  return (
    <Link to={to} className={cn(VOCE, className)}>
      <span aria-hidden className="text-[22px] leading-none">{icona}</span>
      <span className="flex-1">{nome}</span>
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
      <span aria-hidden className="inline-flex h-6 min-w-6 items-center justify-center rounded-sm bg-attenzione-velato px-1.5 font-mono text-label tabular-nums text-attenzione">{da.promemoria + da.valori}</span>
      {/* Lo spazio tiene staccata la frase da "Oggi" nel nome del link. */}
      {' '}
      <span className="sr-only">{descriviDaControllare(da)}</span>
    </>
  )
}

/** La home dell'esperimento a configurazione caricata: riepilogo, "Nuova misura" e le icone delle sezioni. */
function HomeCaricata({ espId, config }: { espId: string; config: ConfigEsperimento }) {
  const daControllare = useDaControllare(espId, config)

  return (
    <>
      <p className="font-mono text-dato tabular-nums text-grafite-tenue">{riepilogo(config)}</p>
      <StrisciaNuovaMisura espId={espId} config={config} />
      <nav aria-label="Sezioni" className="grid grid-cols-2 gap-2.5">
        <Voce to={percorsoOggi(espId)} icona="📅" nome="Oggi">
          {daControllare.promemoria + daControllare.valori > 0 && <NumerinoDaControllare da={daControllare} />}
        </Voce>
        <Voce to={percorsoPiante(espId)} icona="🌿" nome="Piante" />
        <Voce to={percorsoDataset(espId)} icona="📊" nome="Dataset" />
        <Voce to={percorsoEsporta(espId)} icona="⬇️" nome="Esporta Excel" />
        <Voce to={percorsoDiario(espId)} icona="📒" nome="Diario" />
        <Voce to={percorsoGalleria(espId)} icona="📷" nome="Foto" />
        <Voce to={percorsoImpostazioni(espId)} icona="⚙️" nome="Impostazioni" className="col-span-2" />
      </nav>
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
    <AppShell titolo={dati?.esperimento.nome ?? 'Esperimento'} indietro="/">
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
