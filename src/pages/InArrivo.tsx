import { useParams } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { percorsoHome } from '@/lib/percorsi'

/** Segnaposto di una sezione della home che arriva con un prossimo aggiornamento (Oggi, Dataset, Esporta, Diario, Foto). */
export function InArrivo({ titolo }: { titolo: string }) {
  const { espId = '' } = useParams()

  return (
    <AppShell titolo={titolo} indietro={percorsoHome(espId)}>
      <p className="text-grafite-tenue">Questa sezione arriva con il prossimo aggiornamento.</p>
    </AppShell>
  )
}
