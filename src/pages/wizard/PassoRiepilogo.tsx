import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type { BozzaEsperimento } from '@/domain/tipi'
import { validaBozza } from '@/domain/bozza'
import { creaEsperimento } from '@/api/esperimenti'
import { chiavi } from '@/api/query'
import { Button } from '@/components/ui/button'
import { messaggioErrore } from '@/lib/errori'

/** Passo 5: conteggi, problemi da sistemare e creazione dell'esperimento. */
export function PassoRiepilogo({ bozza }: { bozza: BozzaEsperimento }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const errori = validaBozza(bozza)

  const crea = useMutation({
    // Funzione a parte: React Query passa alla mutazione anche un contesto, che non va dato all'API.
    mutationFn: (b: BozzaEsperimento) => creaEsperimento(b),
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: chiavi.esperimenti })
      toast.success('Esperimento creato.')
      navigate(`/esperimenti/${id}`)
    },
    // La bozza resta com'è: si può correggere o riprovare.
    onError: (e) => { toast.error(messaggioErrore(e)) },
  })

  const conteggi = [
    ['Trattamenti', bozza.trattamenti.length],
    ['Piante', bozza.piante.length],
    ['Parametri', bozza.parametri.filter(p => !p.archiviato).length],
    ['Passate', bozza.passate.length],
  ] as const

  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg font-semibold break-words">{bozza.esperimento.nome.trim() || 'Senza nome'}</p>
      <dl className="grid grid-cols-2 gap-3">
        {conteggi.map(([voce, n]) => (
          <div key={voce} className="rounded-lg border p-3">
            <dt className="text-sm text-muted-foreground">{voce}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>

      {errori.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p id="riepilogo-errori" className="font-medium">Da sistemare prima di creare l'esperimento:</p>
          <ul aria-label="Da sistemare" className="list-disc pl-5 text-sm">
            {/* Lo stesso messaggio può ripetersi (es. due parametri senza nome): la chiave include la posizione. */}
            {errori.map((e, i) => <li key={`${i}-${e}`}>{e}</li>)}
          </ul>
          <p className="text-sm text-muted-foreground">Torna indietro con "Indietro" per correggere.</p>
        </div>
      ) : (
        <p className="text-muted-foreground">Tutto pronto: puoi creare l'esperimento.</p>
      )}

      <p className="text-sm text-muted-foreground">
        Dopo la creazione potrai ancora aggiungere piante, parametri e passate dalle impostazioni dell'esperimento.
      </p>
      <Button
        disabled={errori.length > 0 || crea.isPending}
        aria-describedby={errori.length > 0 ? 'riepilogo-errori' : undefined}
        onClick={() => crea.mutate(bozza)}
        className="h-12 text-base"
      >
        {crea.isPending ? 'Creazione…' : 'Crea esperimento'}
      </Button>
    </div>
  )
}
