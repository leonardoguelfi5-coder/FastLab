import { useId, useState } from 'react'
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { aggiornaPianta, eliminaPianta, pianteConDati } from '@/api/configurazione'
import { chiavi } from '@/api/query'
import { Conferma } from '@/components/Conferma'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { Scelta } from '@/components/Scelta'
import { Label } from '@/components/ui/label'
import type { ConfigEsperimento, Pianta } from '@/domain/tipi'
import { AggiungiPiante } from './AggiungiPiante'
import { ErroreDaMostrare, useAzione } from './azione'
import { uguali, useBozze, useSegnalaModifiche } from './modifiche'
import { ControlloDati, Sezione, Spiegazione } from './Sezione'
import { VocePianta } from './VocePianta'

const TUTTI = ''
const normalizza = (s: string) => s.trim().toLowerCase()

/** Il problema dell'etichetta scritta, o null: unica nell'esperimento senza badare a spazi e maiuscole, come nel database. */
function problemaEtichetta(p: Pianta, piante: Pianta[]): string | null {
  if (p.etichetta.trim() === '') return 'Manca l\'etichetta.'
  if (piante.some(x => x.id !== p.id && normalizza(x.etichetta) === normalizza(p.etichetta))) {
    return 'C\'è già una pianta con questa etichetta.'
  }
  return null
}

interface SezionePianteProps {
  espId: string
  config: ConfigEsperimento
  conDati: UseQueryResult<Set<string>>
}

/**
 * Le piante, raggruppate per trattamento e filtrabili: una riga per pianta, che si apre per la modifica (niente griglia
 * fitta da foglio di calcolo). Sotto, l'aggiunta di piante a un trattamento.
 */
export function SezionePiante({ espId, config, conDati }: SezionePianteProps) {
  const id = useId()
  const queryClient = useQueryClient()
  const azione = useAzione(espId)
  const bozze = useBozze<Pianta>()
  const [filtro, setFiltro] = useState(TUTTI)
  const [aperta, setAperta] = useState<string | null>(null)
  // La pianta resta anche a dialogo chiuso: il titolo non cambia mentre il dialogo sparisce.
  const [daRimuovere, setDaRimuovere] = useState<{ pianta: Pianta; aperto: boolean } | null>(null)
  const dati = conDati.data

  /** La pianta come si vede: con dati il trattamento resta quello salvato, anche se una bozza diceva altro. */
  function valore(p: Pianta): Pianta {
    const b = bozze.valore(p)
    return dati?.has(p.id) && b.trattamento_id !== p.trattamento_id ? { ...b, trattamento_id: p.trattamento_id } : b
  }
  const modificata = (p: Pianta) => !uguali(valore(p), p)
  useSegnalaModifiche('piante', config.piante.some(modificata))

  async function salva(p: Pianta) {
    const inviata = bozze.valore(p)
    const v = valore(p)
    if (problemaEtichetta(v, config.piante) !== null) return
    const daSalvare: Pianta = { ...v, etichetta: v.etichetta.trim(), blocco: v.blocco?.trim() || null }
    const riuscito = await azione.esegui(async () => {
      // Il trattamento si cambia solo senza misure: una misura può essere arrivata dopo l'apertura della pagina.
      if (daSalvare.trattamento_id !== p.trattamento_id) {
        const fresche = await queryClient.fetchQuery({
          queryKey: chiavi.pianteConDati(espId), queryFn: () => pianteConDati(espId), staleTime: 0,
        })
        if (fresche.has(p.id)) {
          throw new ErroreDaMostrare(`La pianta #${p.etichetta} ha già dei dati: il trattamento non si può più cambiare.`)
        }
      }
      await aggiornaPianta(espId, daSalvare)
    }, {
      messaggio: `Pianta #${daSalvare.etichetta} salvata.`,
      aggiorna: c => ({ ...c, piante: c.piante.map(x => (x.id === p.id ? daSalvare : x)) }),
    })
    if (riuscito) bozze.salvata(inviata)
  }

  async function rimuovi(p: Pianta) {
    setDaRimuovere({ pianta: p, aperto: false })
    const riuscito = await azione.esegui(() => eliminaPianta(espId, p.id), {
      messaggio: `Pianta #${p.etichetta} rimossa.`,
      neutro: true,
      aggiorna: c => ({ ...c, piante: c.piante.filter(x => x.id !== p.id) }),
    })
    if (riuscito) {
      bozze.scarta(p.id)
      setAperta(a => (a === p.id ? null : a))
    }
  }

  const gruppi = config.trattamenti
    .filter(t => filtro === TUTTI || t.id === filtro)
    .map(t => ({ trattamento: t, piante: config.piante.filter(p => p.trattamento_id === t.id) }))
    .filter(g => g.piante.length > 0)
  const conteggio = (n: number) => (n === 1 ? '1 pianta' : `${n} piante`)

  return (
    <Sezione titolo="Piante">
      <Spiegazione>
        {`${conteggio(config.piante.length)}. Tocca una pianta per cambiarne etichetta, blocco o trattamento. Una pianta con misure resta nel suo trattamento e non si può rimuovere.`}
      </Spiegazione>
      {dati === undefined && (conDati.isError
        ? <ErroreConRiprova errore={conDati.error} onRiprova={() => void conDati.refetch()} />
        : <ControlloDati />)}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-filtro`}>Mostra</Label>
        <Scelta id={`${id}-filtro`} value={filtro} onChange={e => setFiltro(e.target.value)}>
          <option value={TUTTI}>{`Tutti i trattamenti (${config.piante.length})`}</option>
          {config.trattamenti.map(t => (
            <option key={t.id} value={t.id}>
              {`${t.etichetta} (${config.piante.filter(p => p.trattamento_id === t.id).length})`}
            </option>
          ))}
        </Scelta>
      </div>

      {gruppi.length === 0 && <p className="text-grafite-tenue">Nessuna pianta in questo trattamento.</p>}
      {gruppi.map(({ trattamento, piante }) => (
        <div key={trattamento.id} role="group" aria-labelledby={`${id}-${trattamento.id}`} className="flex flex-col">
          <h3 id={`${id}-${trattamento.id}`} className="pb-2 text-base font-semibold text-grafite">
            {trattamento.etichetta}
            <span className="font-normal text-grafite-tenue tabular-nums">{` · ${conteggio(piante.length)}`}</span>
          </h3>
          <ul className="-mx-4 flex flex-col border-t border-riga">
            {piante.map(p => (
              <VocePianta
                key={p.id}
                pianta={p}
                valore={valore(p)}
                trattamenti={config.trattamenti}
                problema={problemaEtichetta(valore(p), config.piante)}
                modificata={modificata(p)}
                haDati={dati?.has(p.id)}
                aperta={aperta === p.id}
                inCorso={azione.inCorso}
                onApri={() => setAperta(aperta === p.id ? null : p.id)}
                onChange={bozze.cambia}
                onSalva={() => void salva(p)}
                onAnnulla={() => bozze.scarta(p.id)}
                onRimuovi={() => setDaRimuovere({ pianta: p, aperto: true })}
              />
            ))}
          </ul>
        </div>
      ))}

      <AggiungiPiante espId={espId} config={config} azione={azione} />

      <Conferma
        aperta={daRimuovere?.aperto ?? false}
        titolo={`Rimuovere la pianta #${daRimuovere?.pianta.etichetta ?? ''}?`}
        testo="La pianta non ha misure. L'operazione non si può annullare."
        annulla="Annulla"
        conferma="Rimuovi"
        onAnnulla={() => setDaRimuovere(d => d && { ...d, aperto: false })}
        onConferma={() => { if (daRimuovere) void rimuovi(daRimuovere.pianta) }}
      />
    </Sezione>
  )
}
