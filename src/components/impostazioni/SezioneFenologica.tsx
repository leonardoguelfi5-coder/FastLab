import type { UseQueryResult } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import type { ConfigEsperimento } from '@/domain/tipi'
import { ModificaStrumento } from './ModificaStrumento'
import { AvvisoDati, Sezione, Spiegazione } from './Sezione'
import { useStrumenti } from './useStrumenti'

interface SezioneFenologicaProps {
  espId: string
  config: ConfigEsperimento
  datiParametri: UseQueryResult<Set<string>>
  datiStrumenti: UseQueryResult<Set<string>>
}

/**
 * L'unica tabella fenologica dell'esperimento, con le sue voci di ogni tipo (anche progressive e obbligatorie), o
 * "Crea la tabella fenologica" se manca. Una voce con dati si archivia, come i valori degli strumenti; la tabella si
 * elimina solo senza misure.
 */
export function SezioneFenologica({ espId, config, datiParametri, datiStrumenti }: SezioneFenologicaProps) {
  const g = useStrumenti({ espId, config, tipo: 'fenologico', chiave: 'fenologica', datiParametri, datiStrumenti })
  const voce = g.voci[0]

  return (
    <Sezione titolo="Tabella fenologica">
      <Spiegazione>
        I rilievi sullo sviluppo della pianta (fiori, frutti, palchi, note), con le voci che ti servono: numeri, testo, sì/no o
        liste ripetute. Ce n'è una sola per esperimento. Una voce con dati non si elimina: si archivia.
      </Spiegazione>
      <AvvisoDati letture={[datiParametri, datiStrumenti]} />
      {voce === undefined ? (
        <Button variant="outline" onClick={g.preparaTabella} className="self-start">Crea la tabella fenologica</Button>
      ) : (
        <div className="flex flex-col gap-4">
          {g.salvato(voce.id) === undefined && <p className="text-sm font-medium text-attenzione">Non salvata</p>}
          <ModificaStrumento g={g} voce={voce} tabella />
        </div>
      )}
    </Sezione>
  )
}
