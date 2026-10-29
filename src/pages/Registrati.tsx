import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { registrati } from '@/api/auth'
import { messaggioErrore } from '@/lib/errori'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TestoErrore } from '@/components/TestoErrore'

const LUNGHEZZA_MINIMA = 8

/** Registrazione su invito: servono l'email invitata e il codice ricevuto dall'amministratore. */
export function Registrati() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [conferma, setConferma] = useState('')
  const [codice, setCodice] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [invio, setInvio] = useState(false)
  const [daConfermare, setDaConfermare] = useState(false)

  async function invia(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    // Il codice invito non è "required" nel modulo di proposito: se manca, il messaggio è quello dell'app, non del browser.
    if (password !== conferma) return setErrore('Le password non coincidono.')
    if (password.length < LUNGHEZZA_MINIMA) return setErrore('La password deve avere almeno 8 caratteri.')
    if (codice.trim() === '') return setErrore('Inserisci il codice invito.')

    setErrore(null)
    setInvio(true)
    try {
      const sessione = await registrati(email, password, codice)
      if (sessione) {
        navigate('/', { replace: true })
      } else {
        // Conferma dell'email attiva sul progetto: non c'è ancora una sessione, quindi non si può entrare.
        setDaConfermare(true)
        setInvio(false)
      }
    } catch (e) {
      setErrore(messaggioErrore(e))
      setInvio(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-8 px-4 py-10">
      <h1 className="border-b border-riga pb-4 text-headline text-grafite">FastLab</h1>

      {daConfermare ? (
        <p role="status" className="max-w-[65ch] text-base text-grafite">Controlla la tua email per confermare l'account, poi accedi.</p>
      ) : (
        <form onSubmit={invia} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="registrati-email">Email</Label>
            <Input
              id="registrati-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="registrati-password">Password</Label>
            <Input
              id="registrati-password"
              type="password"
              autoComplete="new-password"
              required
              aria-describedby="registrati-password-aiuto"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p id="registrati-password-aiuto" className="text-sm text-grafite-tenue">Almeno 8 caratteri.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="registrati-conferma">Conferma password</Label>
            <Input
              id="registrati-conferma"
              type="password"
              autoComplete="new-password"
              required
              value={conferma}
              onChange={(e) => setConferma(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="registrati-codice">Codice invito</Label>
            <Input
              id="registrati-codice"
              variant="campo"
              type="text"
              autoCapitalize="characters"
              autoComplete="off"
              aria-describedby="registrati-codice-aiuto"
              value={codice}
              onChange={(e) => setCodice(e.target.value)}
            />
            <p id="registrati-codice-aiuto" className="text-sm text-grafite-tenue">Lo trovi nel messaggio di invito.</p>
          </div>
          <Button type="submit" size="lg" disabled={invio} className="mt-1">
            {invio ? 'Registrazione…' : 'Registrati'}
          </Button>
          {errore && <TestoErrore role="alert">{errore}</TestoErrore>}
        </form>
      )}

      <Link
        to="/accedi"
        className="inline-flex min-h-11 items-center self-start rounded-sm text-sm font-medium text-inchiostro underline decoration-1 underline-offset-4 hover:decoration-2"
      >
        {daConfermare ? 'Accedi' : 'Hai già un account? Accedi'}
      </Link>
    </div>
  )
}
