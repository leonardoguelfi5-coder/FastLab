import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { accedi } from '@/api/auth'
import { messaggioErrore } from '@/lib/errori'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TestoErrore } from '@/components/TestoErrore'

export function Accedi() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [invio, setInvio] = useState(false)
  const [passwordDimenticata, setPasswordDimenticata] = useState(false)

  async function invia(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setErrore(null)
    setInvio(true)
    try {
      await accedi(email, password)
      navigate('/', { replace: true })
    } catch (e) {
      setErrore(messaggioErrore(e))
      setInvio(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-8 px-4 py-10">
      <h1 className="border-b border-riga pb-4 text-headline text-grafite">FastLab</h1>

      <form onSubmit={invia} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accedi-email">Email</Label>
          <Input
            id="accedi-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accedi-password">Password</Label>
          <Input
            id="accedi-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" size="lg" disabled={invio} className="mt-1">
          {invio ? 'Accesso…' : 'Accedi'}
        </Button>
        {errore && <TestoErrore role="alert">{errore}</TestoErrore>}
      </form>

      <div className="flex flex-col items-start gap-1 text-sm">
        <Button
          type="button"
          variant="link"
          size="sm"
          aria-expanded={passwordDimenticata}
          onClick={() => setPasswordDimenticata(v => !v)}
          className="px-0 text-sm"
        >
          Password dimenticata?
        </Button>
        {passwordDimenticata && <p className="pb-2 text-grafite">Chiedi all'amministratore di reimpostarla.</p>}
        <Link
          to="/registrati"
          className="inline-flex min-h-11 items-center rounded-sm font-medium text-inchiostro underline decoration-1 underline-offset-4 hover:decoration-2"
        >
          Non hai un account? Registrati (serve un invito)
        </Link>
      </div>
    </div>
  )
}
