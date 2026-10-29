import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CircleAlert, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import type { BozzaEsperimento } from '@/domain/tipi'
import { pulisciBozza, validaBozza } from '@/domain/bozza'
import { caricaConfig, creaEsperimento } from '@/api/esperimenti'
import { chiavi } from '@/api/query'
import { BarraAzioni } from '@/components/BarraAzioni'
import { Button } from '@/components/ui/button'
import { messaggioErrore } from '@/lib/errori'
import { toastSalvato } from '@/lib/toastSalvato'

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
  /** Torna al passo prima (il pulsante sta nella barra in basso, accanto a "Crea esperimento"). */
  onPassoPrecedente: () => void
}

/**
 * I parametri che non stanno in nessuno strumento: non sono un errore (si possono aggiungere dopo), ma finché restano
 * così non si misurano. L'avviso li nomina.
 */
function avvisoSenzaStrumento(bozza: BozzaEsperimento): string | null {
  const inStrumento = new Set(bozza.strumenti.flatMap(p => p.parametri.map(pp => pp.parametro_id)))
  const fuori = bozza.parametri.filter(p => !p.archiviato && p.nome.trim() !== '' && !inStrumento.has(p.id))
  if (fuori.length === 0) return null
  const nomi = fuori.map(p => `"${p.nome.trim()}"`).join(', ')
  return fuori.length === 1
    ? `${nomi} non è in nessuno strumento: non si potrà misurare finché non lo aggiungi a uno strumento (anche dopo, dalle impostazioni).`
    : `${nomi} non sono in nessuno strumento: non si potranno misurare finché non li aggiungi a uno strumento (anche dopo, dalle impostazioni).`
}

const codice = (e: unknown) => (typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined)

/**
 * Crea l'esperimento. L'id viene dalla bozza: se un tentativo precedente è arrivato al database ma la
 * risposta si è persa (rete), riprovando l'id risulta già usato (23505). In quel caso l'esperimento c'è
 * già: se si riesce a leggerlo, la creazione è andata a buon fine.
 */
async function crea({ bozza, ripresa }: { bozza: BozzaEsperimento; ripresa: boolean }): Promise<string> {
  try {
    // Nomi ed etichette si salvano ripuliti, come dalle impostazioni; gli id restano quelli della bozza.
    return await creaEsperimento(pulisciBozza(bozza))
  } catch (e) {
    if (ripresa && codice(e) === '23505') {
      const esistente = await caricaConfig(bozza.esperimento.id).catch(() => null)
      if (esistente) return bozza.esperimento.id
    }
    throw e
  }
}

/** Passo 5: conteggi, problemi da sistemare e creazione dell'esperimento. */
export function PassoRiepilogo({ bozza, altriErrori = [], giaTentato, onTentativo, onCreato, onPassoPrecedente }: PassoRiepilogoProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const errori = [...altriErrori, ...validaBozza(bozza)]
  const avviso = avvisoSenzaStrumento(bozza)

  const creazione = useMutation({
    mutationFn: crea,
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: chiavi.esperimenti })
      onCreato()
      toastSalvato('Esperimento creato.')
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

  // Gli strumenti si contano senza la tabella fenologica, che ha la sua riga con le voci (i suoi parametri attivi).
  const vociFenologiche = new Set(
    bozza.strumenti.filter(s => s.tipo === 'fenologico' && !s.archiviato).flatMap(s => s.parametri.map(pp => pp.parametro_id)),
  )
  const conteggi = [
    ['Trattamenti', bozza.trattamenti.length],
    ['Piante', bozza.piante.length],
    ['Strumenti', bozza.strumenti.filter(s => s.tipo === 'strumento' && !s.archiviato).length],
    ['Voci fenologiche', bozza.parametri.filter(p => !p.archiviato && vociFenologiche.has(p.id)).length],
  ] as const

  return (
    <div className="flex flex-col gap-6">
      {/* Il riepilogo è un registro: voce a sinistra, conteggio a destra in cifre tabellari. */}
      <div className="flex flex-col gap-2">
        <p className="text-title break-words text-grafite">{bozza.esperimento.nome.trim() || 'Senza nome'}</p>
        <dl className="-mx-4 border-t border-riga">
          {conteggi.map(([voce, n]) => (
            <div key={voce} className="flex items-baseline justify-between gap-4 border-b border-riga px-4 py-3">
              <dt className="text-base text-grafite-tenue">{voce}</dt>
              <dd className="font-mono text-campo text-grafite tabular-nums">{n}</dd>
            </div>
          ))}
        </dl>
      </div>

      {errori.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-lg bg-errore-velato p-4">
          <p id="riepilogo-errori" className="flex items-start gap-2 font-semibold text-errore">
            <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
            Da sistemare prima di creare l'esperimento:
          </p>
          <ul aria-label="Da sistemare" className="flex list-disc flex-col gap-1 pl-7 text-base text-grafite marker:text-errore">
            {/* Lo stesso messaggio può ripetersi (es. due parametri senza nome): la chiave include la posizione. */}
            {errori.map((e, i) => <li key={`${i}-${e}`}>{e}</li>)}
          </ul>
          <p className="pl-7 text-sm text-grafite-tenue">Torna ai passi con «Passo precedente» per correggere.</p>
        </div>
      ) : (
        <p className="text-grafite">Tutto pronto: puoi creare l'esperimento.</p>
      )}

      {avviso && (
        <p className="flex max-w-[65ch] items-start gap-2 text-base font-medium text-attenzione">
          <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
          {avviso}
        </p>
      )}

      <p className="max-w-[65ch] text-sm text-grafite-tenue">
        Dopo la creazione potrai ancora aggiungere piante, strumenti e voci fenologiche dalle impostazioni dell'esperimento.
      </p>

      <BarraAzioni>
        <div className="flex gap-2">
          <Button variant="outline" size="lg" onClick={onPassoPrecedente} className="px-3 text-sm">
            Passo precedente
          </Button>
          <Button
            size="lg"
            disabled={errori.length > 0 || creazione.isPending}
            aria-describedby={errori.length > 0 ? 'riepilogo-errori' : undefined}
            onClick={creaEsperimentoOra}
            // Su un telefono stretto il testo va a capo dentro il pulsante invece di uscirne.
            className="min-w-0 flex-1 px-3 leading-tight whitespace-normal"
          >
            {creazione.isPending ? 'Creazione…' : 'Crea esperimento'}
          </Button>
        </div>
      </BarraAzioni>
    </div>
  )
}
