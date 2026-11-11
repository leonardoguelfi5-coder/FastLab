import { Link, useParams } from 'react-router-dom'
import { ChevronRight, Scale } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { IconaTonda } from '@/components/IconaTonda'
import { percorsoHome, percorsoPesatura } from '@/lib/percorsi'

/**
 * Gli strumenti di laboratorio. Ne compaiono solo di già costruiti: uno nuovo si aggiunge qui, senza toccare la barra.
 * L'icona è solo decorativa: il nome la dice già.
 */
const STRUMENTI_LABORATORIO = [{ nome: 'Pesatura', icona: Scale, percorso: percorsoPesatura }]

export function Laboratorio() {
  const { espId = '' } = useParams()

  return (
    <AppShell titolo="Laboratorio" indietro={percorsoHome(espId)} nav={espId}>
      <nav aria-label="Strumenti di laboratorio" className="rounded-2xl border border-riga bg-foglio px-4">
        {STRUMENTI_LABORATORIO.map(s => (
          <Link key={s.nome} to={s.percorso(espId)} className="flex min-h-14 items-center gap-3 border-b border-riga py-3 text-grafite last:border-0">
            <IconaTonda icona={s.icona} />
            <span className="flex-1 font-[550]">{s.nome}</span>
            <ChevronRight aria-hidden className="size-5 text-grafite-tenue" />
          </Link>
        ))}
      </nav>
    </AppShell>
  )
}
