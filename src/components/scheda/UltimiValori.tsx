import { useId, useMemo, useState } from 'react'
import { ChevronRight, TriangleAlert } from 'lucide-react'
import { useMisureGiorno } from '@/api/query'
import { Badge } from '@/components/ui/badge'
import { confrontoTrattamento, decimaliParametro, riepilogoPianta, type BloccoRiepilogo, type RigaRiepilogo } from '@/domain/statistiche'
import type { ConfigEsperimento, Misura, Pianta } from '@/domain/tipi'
import { daQuantoBreve, formattaGiornoMese } from '@/lib/date'
import { formattaConUnita, formattaMedia } from '@/lib/numeri'
import { cn } from '@/lib/utils'
import { IconaStrumento } from '@/components/IconaTonda'

interface ConfrontoProps {
  espId: string
  config: ConfigEsperimento
  pianta: Pianta
  riga: RigaRiepilogo
  /** Il nome del parametro in testa alla riga, quando il blocco ha più di un numero da confrontare. */
  conNome: boolean
}

/**
 * Il confronto con il trattamento, molto discreto (spec §4, "Statistiche invadenti"): una riga in grafite tenue sotto
 * il blocco, la media delle altre piante del trattamento nella data dell'ultimo valore; e un segno, a parole, solo se
 * la pianta è molto fuori dal gruppo. Servono le misure di quella data: finché non arrivano (o se non arrivano) non si
 * mostra nulla, mai un numero finto. Un componente a parte perché la richiesta è una per riga, ma uguale per ogni riga
 * della stessa data (la cache di React Query la condivide).
 */
function Confronto({ espId, config, pianta, riga, conNome }: ConfrontoProps) {
  const giorno = useMisureGiorno(espId, riga.ultimo.data)
  const confronto = useMemo(
    () => (giorno.data ? confrontoTrattamento(config, riga.parametro, giorno.data, pianta.id, riga.ultimo.data) : null),
    [giorno.data, config, riga.parametro, riga.ultimo.data, pianta.id],
  )
  // La media si scrive con i decimali dei dati del parametro: quelli di tutte le piante quel giorno e quelli della pianta.
  const decimali = useMemo(
    () => Math.max(riga.decimali, giorno.data ? decimaliParametro(riga.parametro, giorno.data) : 0),
    [giorno.data, riga.decimali, riga.parametro],
  )
  // Senza altre piante con un valore quel giorno non c'è nulla da confrontare.
  if (!confronto || confronto.media === null) return null
  const trattamento = config.trattamenti.find(t => t.id === pianta.trattamento_id)
  const di = `${trattamento ? ` ${trattamento.etichetta}` : ''} il ${formattaGiornoMese(riga.ultimo.data)}`

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-label font-normal tabular-nums text-grafite-tenue">
      <span>
        {conNome
          ? `Media del trattamento${di}, ${riga.parametro.nome}: ${formattaConUnita(confronto.media, decimali, riga.parametro.unita)}`
          : `Media del trattamento${di}: ${formattaConUnita(confronto.media, decimali, riga.parametro.unita)}`}
      </span>
      {confronto.fuori && (
        <Badge variant="attenzione" className="font-sans">
          <TriangleAlert aria-hidden />
          fuori dal gruppo
        </Badge>
      )}
    </p>
  )
}

/**
 * La freccia rispetto al valore precedente, con la differenza: "▲ 1,1", "▼ 0,8", "=". A chi non la vede si legge a
 * parole, con la data di quel valore. Senza un valore precedente (o per testo e sì/no) non c'è nulla.
 */
function Variazione({ riga }: { riga: RigaRiepilogo }) {
  if (riga.tendenza === null || riga.differenza === null || riga.dataPrecedente === null) return <span />
  const rispetto = formattaGiornoMese(riga.dataPrecedente)
  if (riga.tendenza === 'uguale') {
    return (
      <span className="text-right font-mono tabular-nums text-grafite-tenue">
        <span aria-hidden>=</span>
        <span className="sr-only">{`uguale al ${rispetto}`}</span>
      </span>
    )
  }
  const su = riga.tendenza === 'su'
  const quanto = formattaMedia(Math.abs(riga.differenza), riga.decimali)
  return (
    <span className="text-right font-mono tabular-nums text-grafite-tenue">
      <span aria-hidden>{`${su ? '▲' : '▼'} ${quanto}`}</span>
      <span className="sr-only">{`${su ? 'in aumento' : 'in calo'} di ${quanto} rispetto al ${rispetto}`}</span>
    </span>
  )
}

/** Il valore come si legge nella colonna di destra: numero con l'unità, conteggio della lista, Sì o No, testo. */
function testoValore(riga: RigaRiepilogo): string {
  const { parametro, ultimo } = riga
  switch (parametro.tipo) {
    case 'numero': return formattaConUnita(ultimo.valore as number, riga.decimali, parametro.unita)
    case 'lista': return formattaMedia(ultimo.valore as number, riga.decimali)
    case 'sino': return ultimo.valore ? 'Sì' : 'No'
    case 'testo': return String(ultimo.valore)
  }
}

/** Una riga di quaderno su tre colonne: parametro | valore a destra, in colonna | variazione. */
function RigaValore({ riga }: { riga: RigaRiepilogo }) {
  const idDettaglio = useId()
  const [aperta, setAperta] = useState(false)
  const nome = (
    <>
      {riga.parametro.nome}
      {riga.dataPropria && (
        <>
          {' '}
          <span className="font-mono text-label tabular-nums">{formattaGiornoMese(riga.ultimo.data)}</span>
        </>
      )}
    </>
  )

  return (
    <li className="border-b border-riga">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(4.5rem,auto)] items-center gap-x-3">
        {riga.dettaglio === null ? (
          <span className="py-2.5 text-dato text-grafite-tenue">{nome}</span>
        ) : (
          // Liste e testi si aprono: il nome è il tasto, da 44 px, così il valore resta incolonnato con gli altri.
          <button
            type="button"
            aria-expanded={aperta}
            aria-controls={idDettaglio}
            onClick={() => setAperta(a => !a)}
            className="flex min-h-11 items-center gap-1 text-left text-dato text-grafite-tenue"
          >
            <span className="min-w-0 break-words">{nome}</span>
            <ChevronRight aria-hidden className={cn('size-4 shrink-0 transition-transform', aperta && 'rotate-90')} />
          </button>
        )}
        {' '}
        <span
          className={cn(
            'min-w-0 text-right font-mono text-dato font-medium tabular-nums text-grafite',
            riga.parametro.tipo === 'testo' && 'max-w-[10rem] truncate',
          )}
        >
          {testoValore(riga)}
        </span>
        {' '}
        <Variazione riga={riga} />
      </div>
      {riga.dettaglio !== null && aperta && (
        <p id={idDettaglio} className="break-words whitespace-pre-line pb-2.5 font-mono text-dato tabular-nums text-grafite">
          {riga.dettaglio}
        </p>
      )}
    </li>
  )
}

interface BloccoStrumentoProps {
  espId: string
  config: ConfigEsperimento
  pianta: Pianta
  oggi: string
  blocco: BloccoRiepilogo
}

/**
 * Uno strumento: icona e nome come intestazione con la data dell'ultimo valore e da quanto è, le righe dei suoi
 * parametri e, a parte sotto, la media del trattamento dei numeri.
 */
function BloccoStrumento({ espId, config, pianta, oggi, blocco }: BloccoStrumentoProps) {
  const id = useId()
  const { strumento } = blocco
  const fa = daQuantoBreve(blocco.data, oggi)
  // Le liste (i palchi) sono un conteggio: non si confrontano con il trattamento.
  const numeri = blocco.righe.filter(r => r.parametro.tipo === 'numero')
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 pb-1">
        <h4 id={id} className="flex min-w-0 items-center gap-2 text-title text-grafite">
          <IconaStrumento emoji={strumento.icona} piccola />
          <span className="min-w-0 truncate">{strumento.nome}</span>
        </h4>
        <span className="shrink-0 font-mono text-label tabular-nums text-grafite-tenue">
          {`${formattaGiornoMese(blocco.data)}${fa ? ` · ${fa}` : ''}`}
        </span>
      </div>
      <ul aria-labelledby={id} className="border-t border-riga">
        {blocco.righe.map(riga => <RigaValore key={riga.parametro.id} riga={riga} />)}
      </ul>
      {numeri.length > 0 && (
        <div className="flex flex-col gap-1 pt-2">
          {numeri.map(riga => (
            <Confronto key={riga.parametro.id} espId={espId} config={config} pianta={pianta} riga={riga} conNome={numeri.length > 1} />
          ))}
        </div>
      )}
    </li>
  )
}

interface UltimiValoriProps {
  espId: string
  config: ConfigEsperimento
  pianta: Pianta
  /** Tutte le misure della pianta. */
  misure: Misura[]
  /** La data di oggi (ora locale), per dire "3 g fa". */
  oggi: string
}

/**
 * Il riepilogo della pianta, un blocco per strumento: per ogni parametro l'ultimo valore, da quanto è, e se è salito o
 * sceso rispetto alla volta prima (con la differenza). Sono righe di quaderno, senza grafici. Mostra i parametri attivi
 * di tutti i tipi: numeri e liste con la freccia, testo e sì/no con il solo ultimo valore.
 */
export function UltimiValori({ espId, config, pianta, misure, oggi }: UltimiValoriProps) {
  const id = useId()
  const blocchi = useMemo(() => riepilogoPianta(config, misure), [config, misure])

  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="text-label text-grafite-tenue uppercase">Ultimi valori</h3>
      {blocchi.length === 0 ? (
        <p className="text-grafite-tenue">Ancora nessun valore da mostrare.</p>
      ) : (
        <ul className="flex flex-col gap-5">
          {blocchi.map(b => (
            <BloccoStrumento key={b.strumento.id} espId={espId} config={config} pianta={pianta} oggi={oggi} blocco={b} />
          ))}
        </ul>
      )}
    </section>
  )
}
