import { Link, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { percorsoCatalogo, percorsoDiario, percorsoEsporta, percorsoGalleria, percorsoHome, percorsoImpostazioni, percorsoOggi } from '@/lib/percorsi'

/**
 * Le sezioni che non stanno nella barra in basso. Una sezione nuova si aggiunge qui, a un gruppo, senza toccare la
 * barra. L'emoji è solo decorativa: il nome la dice già.
 */
export function Altro() {
  const { espId = '' } = useParams()

  const gruppi = [
    [
      { to: percorsoOggi(espId), icona: '📅', nome: 'Oggi' },
      { to: percorsoDiario(espId), icona: '📒', nome: 'Diario' },
      { to: percorsoGalleria(espId), icona: '📷', nome: 'Foto' },
      { to: percorsoEsporta(espId), icona: '⬇️', nome: 'Esporta Excel' },
    ],
    [
      { to: percorsoImpostazioni(espId), icona: '⚙️', nome: 'Impostazioni' },
      { to: percorsoCatalogo, icona: '📚', nome: 'Catalogo strumenti' },
    ],
  ]

  return (
    <AppShell titolo="Altro" indietro={percorsoHome(espId)} nav={espId}>
      {gruppi.map((voci, i) => (
        <nav key={i} aria-label={i === 0 ? 'Sezioni' : 'Configurazione'} className="rounded-lg border border-riga bg-foglio px-4">
          {voci.map(v => (
            <Link key={v.nome} to={v.to} className="flex min-h-14 items-center gap-3 border-b border-riga py-3 text-grafite last:border-0">
              <span aria-hidden className="text-[22px] leading-none">{v.icona}</span>
              <span className="flex-1 font-[550]">{v.nome}</span>
              <ChevronRight aria-hidden className="size-5 text-grafite-tenue" />
            </Link>
          ))}
        </nav>
      ))}
    </AppShell>
  )
}
