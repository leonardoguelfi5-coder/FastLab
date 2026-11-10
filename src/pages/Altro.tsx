import { Link, useParams } from 'react-router-dom'
import { Camera, CalendarDays, ChevronRight, FileDown, Library, NotebookPen, Settings } from 'lucide-react'
import { IconaTonda } from '@/components/IconaTonda'
import { AppShell } from '@/components/AppShell'
import { percorsoCatalogo, percorsoDiario, percorsoEsporta, percorsoGalleria, percorsoHome, percorsoImpostazioni, percorsoOggi } from '@/lib/percorsi'

/**
 * Le sezioni che non stanno nella barra in basso. Una sezione nuova si aggiunge qui, a un gruppo, senza toccare la
 * barra. L'icona è solo decorativa: il nome la dice già.
 */
export function Altro() {
  const { espId = '' } = useParams()

  const gruppi = [
    [
      { to: percorsoOggi(espId), icona: CalendarDays, nome: 'Oggi' },
      { to: percorsoDiario(espId), icona: NotebookPen, nome: 'Diario' },
      { to: percorsoGalleria(espId), icona: Camera, nome: 'Foto' },
      { to: percorsoEsporta(espId), icona: FileDown, nome: 'Esporta Excel' },
    ],
    [
      { to: percorsoImpostazioni(espId), icona: Settings, nome: 'Impostazioni' },
      { to: percorsoCatalogo, icona: Library, nome: 'Catalogo strumenti' },
    ],
  ]

  return (
    <AppShell titolo="Altro" indietro={percorsoHome(espId)} nav={espId}>
      {gruppi.map((voci, i) => (
        <nav key={i} aria-label={i === 0 ? 'Sezioni' : 'Configurazione'} className="rounded-2xl border border-riga bg-foglio px-4">
          {voci.map(v => (
            <Link key={v.nome} to={v.to} className="flex min-h-14 items-center gap-3 border-b border-riga py-3 text-grafite last:border-0">
              <IconaTonda icona={v.icona} />
              <span className="flex-1 font-[550]">{v.nome}</span>
              <ChevronRight aria-hidden className="size-5 text-grafite-tenue" />
            </Link>
          ))}
        </nav>
      ))}
    </AppShell>
  )
}
