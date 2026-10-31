import { useId } from 'react'
import type { ConfigEsperimento, Pianta } from '@/domain/tipi'

/** Una riga del registro: la voce a sinistra in grafite tenue, il valore a destra. */
function Voce({ nome, children }: { nome: string; children: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-b border-riga py-2">
      <dt className="shrink-0 text-grafite-tenue">{nome}</dt>
      <dd className="min-w-0 text-right text-grafite">{children}</dd>
    </div>
  )
}

/**
 * I dati della pianta: etichetta, trattamento, il livello di ogni fattore che lo compone e il blocco (se c'è).
 * Sono già nella configurazione: si vedono subito, senza aspettare le misure.
 */
export function DatiPianta({ config, pianta }: { config: ConfigEsperimento; pianta: Pianta }) {
  const id = useId()
  const trattamento = config.trattamenti.find(t => t.id === pianta.trattamento_id)
  const fattori = [...config.fattori].sort((a, b) => a.ordine - b.ordine).flatMap(f => {
    const livello = f.livelli.find(l => trattamento?.livello_ids.includes(l.id))
    return livello ? [{ id: f.id, nome: f.nome, livello: livello.nome }] : []
  })
  const blocco = pianta.blocco?.trim()

  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="text-label text-grafite-tenue uppercase">Dati della pianta</h3>
      <dl className="border-t border-riga">
        <Voce nome="Etichetta">{pianta.etichetta}</Voce>
        {trattamento && <Voce nome="Trattamento">{trattamento.etichetta}</Voce>}
        {fattori.map(f => <Voce key={f.id} nome={f.nome}>{f.livello}</Voce>)}
        {blocco && <Voce nome="Blocco">{blocco}</Voce>}
      </dl>
    </section>
  )
}
