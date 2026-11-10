import { Link, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useConfig, useMembri, useSpazioProgetto } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { Caricamento } from '@/components/Caricamento'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { megabyte } from '@/domain/spazio'
import type { ConfigEsperimento } from '@/domain/tipi'
import { percorsoHome, percorsoImpostazioni, type SezioneImpostazioni } from '@/lib/percorsi'

const conta = (n: number, una: string, tante: string) => `${n} ${n === 1 ? una : tante}`

/** Le righe dell'indice nell'ordine di lettura: ciò che si configura, poi lo spazio e le persone. */
const SEZIONI: { sezione: SezioneImpostazioni; nome: string }[] = [
  { sezione: 'generale', nome: 'Generale' },
  { sezione: 'trattamenti', nome: 'Trattamenti' },
  { sezione: 'piante', nome: 'Piante' },
  { sezione: 'strumenti', nome: 'Strumenti' },
  { sezione: 'fenologia', nome: 'Tabella fenologica' },
  { sezione: 'spazio', nome: 'Spazio' },
  { sezione: 'persone', nome: 'Persone' },
]

/** Il riassunto di ciò che la pagina contiene, sotto il nome: `56 piante, 8 trattamenti`. `null` finché non si sa. */
function riassunti(config: ConfigEsperimento, spazio: string | null, persone: string | null): Record<SezioneImpostazioni, string | null> {
  const strumenti = config.strumenti.filter(s => s.tipo === 'strumento' && !s.archiviato)
  const fenologica = config.strumenti.find(s => s.tipo === 'fenologico')
  return {
    generale: `${config.esperimento.nome} · ${config.esperimento.stato === 'concluso' ? 'concluso' : 'in corso'}`,
    trattamenti: conta(config.trattamenti.length, 'trattamento', 'trattamenti'),
    piante: `${conta(config.piante.length, 'pianta', 'piante')}, ${conta(config.trattamenti.length, 'trattamento', 'trattamenti')}`,
    strumenti: conta(strumenti.length, 'strumento', 'strumenti'),
    fenologia: fenologica ? conta(fenologica.parametri.length, 'voce', 'voci') : 'non c\'è ancora',
    spazio,
    persone,
  }
}

/**
 * L'indice delle Impostazioni (Piano E, Task E10): una riga di quaderno per pagina, con il riassunto di ciò che
 * contiene e `›`. Le righe sono alte almeno 44 px. Il riassunto di Spazio e di Persone arriva dal database: se non
 * arriva la riga resta senza, e la pagina lo dirà.
 */
export function Impostazioni() {
  const { espId = '' } = useParams()
  const config = useConfig(espId)
  const spazio = useSpazioProgetto(espId).data
  const membri = useMembri(espId).data
  const dati = config.data

  const testi = dati && riassunti(
    dati,
    spazio ? `database ${megabyte(spazio.database_byte)} MB, foto ${megabyte(spazio.foto_byte)} MB` : null,
    membri ? conta(membri.length, 'persona', 'persone') : null,
  )

  return (
    <AppShell titolo="Impostazioni" indietro={percorsoHome(espId)}>
      {dati === undefined || testi === undefined ? (
        config.isError
          ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
          : <Caricamento />
      ) : (
        <nav aria-label="Impostazioni" className="-mx-4 flex flex-col border-t border-riga">
          {SEZIONI.map(({ sezione, nome }) => (
            <Link
              key={sezione}
              to={percorsoImpostazioni(espId, sezione)}
              className="flex min-h-14 items-center gap-3 border-b border-riga px-4 py-3 transition-colors hover:bg-carta-ombra/70 active:bg-carta-ombra"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-base font-medium text-grafite">{nome}</span>
                {testi[sezione] !== null && (
                  <span className="break-words font-mono text-dato tabular-nums text-grafite-tenue">{testi[sezione]}</span>
                )}
              </span>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-grafite-tenue" />
            </Link>
          ))}
        </nav>
      )}
    </AppShell>
  )
}
