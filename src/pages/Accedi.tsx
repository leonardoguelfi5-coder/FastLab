import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { accedi } from '@/api/auth'
import { messaggioErrore } from '@/lib/errori'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 p-4">
      <h1 className="text-2xl font-bold">FastLab</h1>

      <form onSubmit={invia} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="accedi-email" className="text-sm font-medium">Email</Label>
          <Input
            id="accedi-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 text-lg"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="accedi-password" className="text-sm font-medium">Password</Label>
          <Input
            id="accedi-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 text-lg"
          />
        </div>
        <Button type="submit" disabled={invio} className="h-12 text-lg">
          {invio ? 'Accesso…' : 'Accedi'}
        </Button>
        {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
      </form>

      <div className="flex flex-col items-start gap-1">
        <Button
          type="button"
          variant="link"
          aria-expanded={passwordDimenticata}
          onClick={() => setPasswordDimenticata(v => !v)}
          className="h-11 px-0"
        >
          Password dimenticata?
        </Button>
        {passwordDimenticata && <p className="text-sm">Chiedi all'amministratore di reimpostarla.</p>}
        <Link to="/registrati" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">
          Non hai un account? Registrati (serve un invito)
        </Link>
      </div>
    </div>
  )
}
