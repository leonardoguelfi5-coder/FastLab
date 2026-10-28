import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'
import { useSessione } from '@/api/auth'

/** Mostra i figli solo con una sessione attiva; senza sessione rimanda a /accedi. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { sessione, caricamento } = useSessione()

  if (caricamento) {
    return (
      <div role="status" aria-label="Caricamento" className="flex min-h-dvh items-center justify-center">
        <LoaderCircle aria-hidden className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!sessione) return <Navigate to="/accedi" replace />

  return <>{children}</>
}
