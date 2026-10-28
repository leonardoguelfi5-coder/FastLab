import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type { BozzaEsperimento } from '@/domain/tipi'
import { validaBozza } from '@/domain/bozza'
import { caricaConfig, creaEsperimento } from '@/api/esperimenti'
import { chiavi } from '@/api/query'
import { Button } from '@/components/ui/button'
import { messaggioErrore } from '@/lib/errori'

interface PassoRiepilogoProps {
  bozza: BozzaEsperimento
  /** Problemi che `validaBozza` non vede (es. piante da rigenerare), elencati prima degli altri. */
  altriErrori?: string[]
  /** Si è già provato a creare l'esperimento con questa bozza. */
  giaTentato: boolean
  /** Chiamato prima di ogni tentativo di creazione. */
  onTentativo: () => void
  /** Chiamato quando l'esperimento esiste, prima di aprirlo. */
  onCreato: () => void
}

const codice = (e: unknown) => (typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined)

/**
 * Crea l'esperimento. L'id viene dalla bozza: se un tentativo precedente è arrivato al database ma la
 * risposta si è persa (rete), riprovando l'id risulta già usato (23505). In quel caso l'esperimento c'è
 * già: se si riesce a leggerlo, la creazione è andata a buon fine.
 */
async function crea({ bozza, ripresa }: { bozza: BozzaEsperimento; ripresa: boolean }): Promise<string> {
  try {
    return await creaEsperimento(bozza)
  } catch (e) {
    if (ripresa && codice(e) === '23505') {
      const esistente = await caricaConfig(bozza.esperimento.id).catch(() => null)
      if (esistente) return bozza.esperimento.id
    }
    throw e
  }
}

/** Passo 5: conteggi, problemi da sistemare e creazione dell'esperimento. */
export function PassoRiepilogo({ bozza, altriErrori = [], giaTentato, onTentativo, onCreato }: PassoRiepilogoProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const errori = [...altriErrori, ...validaBozza(bozza)]

  const creazione = useMutation({
    mutationFn: crea,
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: chiavi.esperimenti })
      onCreato()
      toast.success('Esperimento creato.')
      // Al posto della procedura: "indietro" dall'esperimento non torna al riepilogo di una bozza già creata.
      navigate(`/esperimenti/${id}`, { replace: true })
    },
    // La bozza resta com'è: si può correggere o riprovare.
    onError: (e) => { toast.error(messaggioErrore(e)) },
  })

  function creaEsperimentoOra() {
    const ripresa = giaTentato
    onTentativo()
    creazione.mutate({ bozza, ripresa })
  }

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
          <p className="text-sm text-muted-foreground">Torna ai passi con «Passo precedente» per correggere.</p>
        </div>
      ) : (
        <p className="text-muted-foreground">Tutto pronto: puoi creare l'esperimento.</p>
      )}

      <p className="text-sm text-muted-foreground">
        Dopo la creazione potrai ancora aggiungere piante, parametri e passate dalle impostazioni dell'esperimento.
      </p>
      <Button
        disabled={errori.length > 0 || creazione.isPending}
        aria-describedby={errori.length > 0 ? 'riepilogo-errori' : undefined}
        onClick={creaEsperimentoOra}
        className="h-12 text-base"
      >
        {creazione.isPending ? 'Creazione…' : 'Crea esperimento'}
      </Button>
    </div>
  )
}
