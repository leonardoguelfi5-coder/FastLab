import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useConfig, useMisureGiorno } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { riepilogoGiro, statiPiante } from '@/domain/giro'
import type { ConfigEsperimento } from '@/domain/tipi'
import { percorsoImpostazioni, percorsoNuovaMisura, percorsoPiante, percorsoSezione } from '@/lib/percorsi'
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
function Voce({ to, icona, nome, className }: { to: string; icona: string; nome: string; className?: string }) {
  return (
    <Link to={to} className={cn(VOCE, className)}>
      <span aria-hidden className="text-[22px] leading-none">{icona}</span>
      {nome}
    </Link>
  )
}

/** La home dell'esperimento a configurazione caricata: riepilogo, "Nuova misura" e le icone delle sezioni. */
function HomeCaricata({ espId, config }: { espId: string; config: ConfigEsperimento }) {
  return (
    <>
      <p className="font-mono text-dato tabular-nums text-grafite-tenue">{riepilogo(config)}</p>
      <StrisciaNuovaMisura espId={espId} config={config} />
      <nav aria-label="Sezioni" className="grid grid-cols-2 gap-2.5">
        <Voce to={percorsoSezione(espId, 'oggi')} icona="📅" nome="Oggi" />
        <Voce to={percorsoPiante(espId)} icona="🌿" nome="Piante" />
        <Voce to={percorsoSezione(espId, 'dataset')} icona="📊" nome="Dataset" />
        <Voce to={percorsoSezione(espId, 'esporta')} icona="⬇️" nome="Esporta Excel" />
        <Voce to={percorsoSezione(espId, 'diario')} icona="📒" nome="Diario" />
        <Voce to={percorsoSezione(espId, 'foto')} icona="📷" nome="Foto" />
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

  return (
    <AppShell titolo={dati?.esperimento.nome ?? 'Esperimento'} indietro="/">
      {dati === undefined ? (
        config.isError
          ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
          : <p role="status" className="text-grafite-tenue">Caricamento…</p>
      ) : (
        <HomeCaricata espId={espId} config={dati} />
      )}
    </AppShell>
  )
}
