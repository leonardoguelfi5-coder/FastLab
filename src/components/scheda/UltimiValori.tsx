import { useId, useMemo } from 'react'
import { ArrowDown, ArrowUp, TriangleAlert } from 'lucide-react'
import { useMisureGiorno } from '@/api/query'
import { Badge } from '@/components/ui/badge'
import { confrontoTrattamento, ultimiValoriPianta, type UltimoValorePianta } from '@/domain/statistiche'
import type { ConfigEsperimento, Misura, Pianta, Strumento } from '@/domain/tipi'
import { daQuanto, formattaGiornoMese } from '@/lib/date'
import { formattaConUnita } from '@/lib/numeri'

interface ConfrontoProps {
  espId: string
  config: ConfigEsperimento
  pianta: Pianta
  riga: UltimoValorePianta
}

/**
 * Il confronto con il trattamento, molto discreto (spec §4, "Statistiche invadenti"): un numero piccolo in grafite
 * tenue, la media delle altre piante del trattamento nella data dell'ultimo valore; e un segno, a parole, solo se la
 * pianta è molto fuori dal gruppo. Servono le misure di quella data: finché non arrivano (o se non arrivano) non si
 * mostra nulla, mai un numero finto. Un componente a parte perché la richiesta è una per riga, ma uguale per ogni riga
 * della stessa data (la cache di React Query la condivide).
 */
function Confronto({ espId, config, pianta, riga }: ConfrontoProps) {
  const giorno = useMisureGiorno(espId, riga.ultimo.data)
  const confronto = useMemo(
    () => (giorno.data ? confrontoTrattamento(config, riga.parametro, giorno.data, pianta.id, riga.ultimo.data) : null),
    [giorno.data, config, riga.parametro, riga.ultimo.data, pianta.id],
  )
  // Senza altre piante con un valore quel giorno non c'è nulla da confrontare.
  if (!confronto || confronto.media === null) return null

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-label font-normal tabular-nums text-grafite-tenue">
      <span>{`media trattamento ${formattaConUnita(confronto.media, riga.parametro.unita)}`}</span>
      {confronto.fuori && (
        <Badge variant="attenzione" className="font-sans">
          <TriangleAlert aria-hidden />
          fuori dal gruppo
        </Badge>
      )}
    </p>
  )
}

/** La freccia rispetto alla misura precedente; a chi non la vede si legge lo stesso, con la data di quella misura. */
function Freccia({ riga }: { riga: UltimoValorePianta }) {
  if ((riga.tendenza !== 'su' && riga.tendenza !== 'giu') || !riga.precedente) return null
  const Icona = riga.tendenza === 'su' ? ArrowUp : ArrowDown
  return (
    <>
      {' '}
      <Icona aria-hidden className="inline size-4 align-text-bottom text-grafite-tenue" />
      <span className="sr-only">
        {`${riga.tendenza === 'su' ? 'in aumento' : 'in calo'} rispetto al ${formattaGiornoMese(riga.precedente.data)}`}
      </span>
    </>
  )
}

interface RigaValoreProps extends ConfrontoProps {
  oggi: string
}

/** Una riga di quaderno: "SPAD 41,2 · 3 giorni fa", la freccia e, sotto, il confronto. */
function RigaValore({ espId, config, pianta, riga, oggi }: RigaValoreProps) {
  return (
    <li className="flex flex-col gap-0.5 border-b border-riga py-2.5">
      <p className="text-dato font-sans text-grafite">
        <span className="text-grafite-tenue">{riga.parametro.nome}</span>
        {' '}
        <span className="font-mono font-medium tabular-nums">{formattaConUnita(riga.ultimo.valore, riga.parametro.unita)}</span>
        {' · '}
        <span className="text-grafite-tenue">{daQuanto(riga.ultimo.data, oggi)}</span>
        <Freccia riga={riga} />
      </p>
      {/* Le liste (i palchi) sono un conteggio: non si confrontano con il trattamento. */}
      {riga.parametro.tipo === 'numero' && <Confronto espId={espId} config={config} pianta={pianta} riga={riga} />}
    </li>
  )
}

interface GruppoStrumentoProps {
  espId: string
  config: ConfigEsperimento
  pianta: Pianta
  oggi: string
  strumento: Strumento
  /** I valori di questo strumento, nell'ordine dei suoi parametri. */
  righe: UltimoValorePianta[]
}

/** Uno strumento con i suoi valori: icona e nome come intestazione, poi una riga per parametro. */
function GruppoStrumento({ strumento, righe, ...resto }: GruppoStrumentoProps) {
  const id = useId()
  return (
    <li>
      <h4 id={id} className="flex items-center gap-2 pb-1 text-title text-grafite">
        {strumento.icona && <span aria-hidden>{strumento.icona}</span>}
        <span className="min-w-0 truncate">{strumento.nome}</span>
      </h4>
      <ul aria-labelledby={id} className="border-t border-riga">
        {righe.map(riga => <RigaValore key={riga.parametro.id} {...resto} riga={riga} />)}
      </ul>
    </li>
  )
}

interface UltimiValoriProps {
  espId: string
  config: ConfigEsperimento
  pianta: Pianta
  /** Tutte le misure della pianta. */
  misure: Misura[]
  /** La data di oggi (ora locale), per dire "3 giorni fa". */
  oggi: string
}

/**
 * Gli ultimi valori della pianta per strumento: per ogni parametro l'ultimo valore giornaliero, da quanto è, e se è
 * salito o sceso rispetto alla volta prima. Sono righe di quaderno, senza grafici. Mostra solo parametri attivi,
 * numerici o liste: testo e sì/no non hanno un valore da seguire nel tempo.
 */
export function UltimiValori({ espId, config, pianta, misure, oggi }: UltimiValoriProps) {
  const id = useId()
  const gruppi = useMemo(() => {
    const risultato: { strumento: Strumento; righe: UltimoValorePianta[] }[] = []
    for (const riga of ultimiValoriPianta(config, misure)) {
      const ultimo = risultato[risultato.length - 1]
      if (ultimo?.strumento.id === riga.strumento.id) ultimo.righe.push(riga)
      else risultato.push({ strumento: riga.strumento, righe: [riga] })
    }
    return risultato
  }, [config, misure])

  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="text-label text-grafite-tenue uppercase">Ultimi valori</h3>
      {gruppi.length === 0 ? (
        <p className="text-grafite-tenue">Ancora nessun valore da mostrare.</p>
      ) : (
        <ul className="flex flex-col gap-5">
          {gruppi.map(g => (
            <GruppoStrumento key={g.strumento.id} espId={espId} config={config} pianta={pianta} oggi={oggi} strumento={g.strumento} righe={g.righe} />
          ))}
        </ul>
      )}
    </section>
  )
}
