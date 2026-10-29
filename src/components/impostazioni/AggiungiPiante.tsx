import { useId, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { aggiungiPiante } from '@/api/configurazione'
import { caricaConfig } from '@/api/esperimenti'
import { chiavi } from '@/api/query'
import { CampoNumero } from '@/components/config/CampoNumero'
import { Scelta } from '@/components/Scelta'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { generaPiante, prossimaEtichetta } from '@/domain/piante'
import type { ConfigEsperimento, Pianta } from '@/domain/tipi'
import { leggiIntero } from '@/lib/numeri'
import type { useAzione } from './azione'
import { Spiegazione } from './Sezione'

const MAX = 200
const leggiQuante = (t: string) => (t.trim() === '' ? null : (leggiIntero(t, 1, MAX) ?? NaN))

interface AggiungiPianteProps {
  espId: string
  config: ConfigEsperimento
  azione: ReturnType<typeof useAzione>
}

/** Un gruppo di piante nuove già preparato: un nuovo tentativo dopo un errore di rete riusa gli stessi id. */
interface Gruppo { chiave: string; piante: Pianta[] }

/**
 * Aggiunta di N piante a un trattamento. Le etichette continuano la numerazione (dopo la più alta) e le piante vanno in
 * fondo all'ordine dell'esperimento, che decide la "pianta successiva" in campo.
 */
export function AggiungiPiante({ espId, config, azione }: AggiungiPianteProps) {
  const id = useId()
  const queryClient = useQueryClient()
  const [trattamentoId, setTrattamentoId] = useState(config.trattamenti[0]?.id ?? '')
  const [quante, setQuante] = useState<number | null>(null)
  const [valido, setValido] = useState(true)
  // Il gruppo dell'ultimo tentativo non riuscito: se l'inserimento era arrivato al database ma la risposta no,
  // riprovare con id nuovi creerebbe piante doppie (57–59 e poi 60–62).
  const inSospeso = useRef<Gruppo | null>(null)

  const trattamento = config.trattamenti.find(t => t.id === trattamentoId) ?? config.trattamenti[0]
  if (!trattamento) return null
  const n = valido ? quante : null
  const prossima = prossimaEtichetta(config.piante)

  function prepara(nPiante: number, trattamentoScelto: string): Pianta[] {
    const chiave = `${trattamentoScelto}:${nPiante}`
    if (inSospeso.current?.chiave === chiave) return inSospeso.current.piante
    // generaPiante numera l'ordine da 0: le nuove vanno dopo l'ultima pianta, senza ordini doppi.
    const primoOrdine = Math.max(-1, ...config.piante.map(p => p.ordine)) + 1
    const piante = generaPiante([{ trattamento_id: trattamentoScelto, n: nPiante }], prossima)
      .map((p, i) => ({ ...p, ordine: primoOrdine + i }))
    inSospeso.current = { chiave, piante }
    return piante
  }

  async function aggiungi() {
    if (n === null || !trattamento) return
    const etichetta = trattamento.etichetta
    const piante = prepara(n, trattamento.id)
    const riuscito = await azione.esegui(async () => {
      try {
        await aggiungiPiante(espId, piante)
      } catch (e) {
        // Etichetta o id già presenti: se sono proprio queste piante, il tentativo di prima era andato a buon fine.
        if ((e as { code?: unknown } | null)?.code !== '23505') throw e
        const fresca = await queryClient.fetchQuery({ queryKey: chiavi.config(espId), queryFn: () => caricaConfig(espId), staleTime: 0 })
        const ids = new Set(fresca.piante.map(p => p.id))
        if (!piante.every(p => ids.has(p.id))) {
          inSospeso.current = null
          throw e
        }
      }
    }, {
      messaggio: `${n === 1 ? '1 pianta aggiunta' : `${n} piante aggiunte`} a «${etichetta}».`,
      aggiorna: c => ({ ...c, piante: [...c.piante.filter(p => !piante.some(x => x.id === p.id)), ...piante] }),
    })
    if (riuscito) {
      inSospeso.current = null
      setQuante(null)
    }
  }

  const ultima = n === null ? null : prossima + n - 1
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-carta-ombra p-4">
      <h3 className="text-title text-grafite">Aggiungi piante</h3>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-trattamento`}>Trattamento delle nuove piante</Label>
        <Scelta id={`${id}-trattamento`} value={trattamento.id} onChange={e => setTrattamentoId(e.target.value)}>
          {config.trattamenti.map(t => <option key={t.id} value={t.id}>{t.etichetta}</option>)}
        </Scelta>
      </div>
      <CampoNumero
        etichetta="Quante piante"
        valore={quante}
        onChange={setQuante}
        onValidita={setValido}
        leggi={leggiQuante}
        errore={`Scrivi un numero intero da 1 a ${MAX}.`}
        intero
      />
      <Spiegazione>
        {ultima === null || ultima === prossima
          ? `La numerazione continua da ${prossima}.`
          : `Etichette da ${prossima} a ${ultima}, in fondo all'ordine delle piante. Le puoi cambiare dopo.`}
      </Spiegazione>
      <Button variant="outline" disabled={n === null || azione.inCorso} onClick={() => void aggiungi()}>
        {n === null
          ? `Aggiungi piante a «${trattamento.etichetta}»`
          : `Aggiungi ${n === 1 ? '1 pianta' : `${n} piante`} a «${trattamento.etichetta}»`}
      </Button>
    </div>
  )
}
