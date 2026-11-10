import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { creaInvito, revocaInvito, type Invito } from '@/api/inviti'
import { chiavi, useInviti, useSonoAdmin } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { TestoErrore } from '@/components/TestoErrore'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formattaData, oggiLocale } from '@/lib/date'
import { messaggioErrore } from '@/lib/errori'
import { cn } from '@/lib/utils'

/** Il messaggio che l'amministratore manda al collega: nell'indirizzo non c'è nessun dato personale. */
function messaggioDiInvito(invito: Invito): string {
  return `Ciao! Ti ho invitato su FastLab. Registrati qui: ${window.location.origin}/registrati usando l'email ${invito.email} e il codice invito ${invito.codice}.`
}

/** Data (locale, non UTC) in cui l'invito è stato usato, nel formato GG/MM/AAAA. */
function dataUso(usatoIl: string): string {
  return formattaData(oggiLocale(new Date(usatoIl)))
}

/** Ripiego quando gli appunti non sono disponibili: il testo è già selezionato, basta copiarlo. */
function MessaggioDaCopiare({ messaggio, onFatto }: { messaggio: string; onFatto: () => void }) {
  const casella = useRef<HTMLTextAreaElement>(null)
  const id = useId()

  useEffect(() => {
    casella.current?.focus()
    casella.current?.select()
  }, [])

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Messaggio da copiare</Label>
      <Textarea
        ref={casella}
        id={id}
        readOnly
        rows={5}
        value={messaggio}
        aria-describedby={`${id}-aiuto`}
        onFocus={(e) => e.currentTarget.select()}
      />
      <p id={`${id}-aiuto`} className="text-sm text-grafite-tenue">
        Non è stato possibile copiarlo in automatico: tieni premuto sul testo, selezionalo e copialo.
      </p>
      <Button variant="outline" onClick={onFatto} className="mt-1 self-start">Fatto</Button>
    </div>
  )
}

interface RigaInvitoProps {
  invito: Invito
  evidenziato: boolean
  onRevoca: (invito: Invito) => void
}

function RigaInvito({ invito, evidenziato, onRevoca }: RigaInvitoProps) {
  const [copiaAMano, setCopiaAMano] = useState(false)
  const idEmail = `invito-${invito.id}-email`

  async function copia() {
    const messaggio = messaggioDiInvito(invito)
    try {
      await navigator.clipboard.writeText(messaggio)
      setCopiaAMano(false)
      toast.success('Messaggio copiato.')
    } catch {
      // Appunti negati o assenti (pagina non sicura): niente "copiato" a vuoto, il testo si copia a mano.
      setCopiaAMano(true)
    }
  }

  return (
    // Riga di quaderno; l'invito appena creato ha il fondo inchiostro velato e l'etichetta "Nuovo" (non solo colore).
    <li className={cn('flex flex-col gap-3 border-b border-riga px-4 py-4', evidenziato && 'bg-inchiostro-velato')}>
      <div className="flex items-start justify-between gap-3">
        <p id={idEmail} className="min-w-0 text-title break-all text-grafite">{invito.email}</p>
        {evidenziato && <Badge className="mt-0.5">Nuovo</Badge>}
      </div>

      {invito.usato_il !== null ? (
        <p className="-mt-2 text-dato font-sans text-grafite-tenue tabular-nums">{`Registrato il ${dataUso(invito.usato_il)}`}</p>
      ) : (
        <>
          <p className="-mt-2 text-dato font-sans text-grafite-tenue">In attesa</p>
          <p className="flex items-baseline gap-3">
            <span className="text-label text-grafite-tenue">Codice</span>
            <code className="text-campo font-semibold tracking-[0.08em] text-grafite select-all">{invito.codice}</code>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" aria-describedby={idEmail} onClick={copia} className="flex-1">
              Copia messaggio
            </Button>
            <Button variant="destructive" aria-describedby={idEmail} onClick={() => onRevoca(invito)}>
              Revoca
            </Button>
          </div>
          {copiaAMano && <MessaggioDaCopiare messaggio={messaggioDiInvito(invito)} onFatto={() => setCopiaAMano(false)} />}
        </>
      )}
    </li>
  )
}

/** Modulo per invitare, elenco degli inviti e conferma di revoca. Solo per l'amministratore. */
function GestioneInviti() {
  const queryClient = useQueryClient()
  const inviti = useInviti()
  const [email, setEmail] = useState('')
  const [nuovoId, setNuovoId] = useState<string | null>(null)
  // `daRevocare` resta impostato anche a conferma chiusa, così il testo non cambia durante la dissolvenza.
  const [daRevocare, setDaRevocare] = useState<Invito | null>(null)
  const [confermaAperta, setConfermaAperta] = useState(false)

  const crea = useMutation({
    // Funzione a parte: React Query passa alla mutazione anche un contesto, che non va dato all'API.
    mutationFn: (indirizzo: string) => creaInvito(indirizzo),
    onSuccess: (nuovo) => {
      // Il nuovo invito (con il suo codice) compare subito; poi l'elenco viene riletto dal database.
      queryClient.setQueryData<Invito[]>(chiavi.inviti, (vecchi) => [nuovo, ...(vecchi ?? []).filter(i => i.id !== nuovo.id)])
      void queryClient.invalidateQueries({ queryKey: chiavi.inviti })
      setNuovoId(nuovo.id)
      setEmail('')
      toast.success('Invito creato.')
    },
  })

  const revoca = useMutation({
    mutationFn: (id: string) => revocaInvito(id),
    onSuccess: (_risposta, id) => {
      queryClient.setQueryData<Invito[]>(chiavi.inviti, (vecchi) => vecchi?.filter(i => i.id !== id))
      void queryClient.invalidateQueries({ queryKey: chiavi.inviti })
      setConfermaAperta(false)
      toast.success('Invito revocato.')
    },
    // L'invito potrebbe essere stato usato o revocato nel frattempo: l'elenco si rilegge e mostra com'è adesso.
    onError: () => { void queryClient.invalidateQueries({ queryKey: chiavi.inviti }) },
  })

  function invia(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    crea.mutate(email)
  }

  function chiediRevoca(invito: Invito) {
    revoca.reset()
    setDaRevocare(invito)
    setConfermaAperta(true)
  }

  function chiudiConferma() {
    setConfermaAperta(false)
    revoca.reset()
  }

  return (
    <>
      <form onSubmit={invia} className="flex flex-col gap-1.5">
        <Label htmlFor="invito-email">Email</Label>
        <div className="flex gap-2">
          <Input
            id="invito-email"
            type="email"
            autoComplete="off"
            required
            aria-describedby="invito-email-aiuto"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (crea.isError) crea.reset()
            }}
            className="flex-1"
          />
          <Button type="submit" size="lg" disabled={crea.isPending}>
            {crea.isPending ? 'Invio…' : 'Invita'}
          </Button>
        </div>
        <p id="invito-email-aiuto" className="text-sm text-grafite-tenue">L'email con cui il collega si registrerà.</p>
        {crea.isError && <TestoErrore role="alert">{messaggioErrore(crea.error)}</TestoErrore>}
      </form>

      {inviti.data === undefined ? (
        inviti.isError
          ? <ErroreConRiprova errore={inviti.error} onRiprova={() => void inviti.refetch()} />
          : <p role="status" className="text-grafite-tenue">Caricamento…</p>
      ) : inviti.data.length === 0 ? (
        <p className="text-grafite-tenue">Nessun invito ancora.</p>
      ) : (
        <ul aria-label="Inviti" className="-mx-4 -mt-2 flex flex-col border-t border-riga">
          {inviti.data.map(invito => (
            <RigaInvito key={invito.id} invito={invito} evidenziato={invito.id === nuovoId} onRevoca={chiediRevoca} />
          ))}
        </ul>
      )}

      {/* Mentre la revoca è in corso la conferma non si chiude, così l'esito (o l'errore) lo si vede. */}
      <Dialog open={confermaAperta} onOpenChange={(aperta) => { if (!aperta && !revoca.isPending) chiudiConferma() }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Revocare l'invito?</DialogTitle>
            <DialogDescription>
              {`L'invito per ${daRevocare?.email ?? ''} non sarà più valido: per registrarsi servirà un nuovo invito.`}
            </DialogDescription>
          </DialogHeader>
          {revoca.isError && <TestoErrore role="alert">{messaggioErrore(revoca.error)}</TestoErrore>}
          <DialogFooter>
            <Button variant="outline" onClick={chiudiConferma} disabled={revoca.isPending}>
              Annulla
            </Button>
            <Button
              variant="destructive-solid"
              disabled={revoca.isPending}
              onClick={() => { if (daRevocare) revoca.mutate(daRevocare.id) }}
            >
              {revoca.isPending ? 'Revoca in corso…' : 'Revoca invito'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Contenuto della pagina: l'accesso si decide dal ruolo, che può ancora essere in lettura o non leggibile. */
function Corpo() {
  const admin = useSonoAdmin()

  if (admin.data === true) return <GestioneInviti />
  if (admin.isPending) return <p role="status" className="text-grafite-tenue">Caricamento…</p>
  // Se il ruolo non si è potuto leggere non si può dire "riservata": è un errore, non un divieto.
  if (admin.isError) return <ErroreConRiprova errore={admin.error} onRiprova={() => void admin.refetch()} />
  return <p>Questa pagina è riservata all'amministratore.</p>
}

export function AdminInviti() {
  return (
    <AppShell titolo="Inviti" indietro="/">
      <Corpo />
    </AppShell>
  )
}
