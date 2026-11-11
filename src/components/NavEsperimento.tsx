import { NavLink, useNavigate } from 'react-router-dom'
import { FlaskConical, Home, Leaf, MoreHorizontal, Plus } from 'lucide-react'
import { percorsoAltro, percorsoHome, percorsoLaboratorio, percorsoNuovaMisura, percorsoPiante } from '@/lib/percorsi'
import { usePermessi } from '@/lib/usePermessi'
import { cn } from '@/lib/utils'

const VOCE = 'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-[600] transition-colors'

function Voce({ to, nome, icona: Icona, fine }: { to: string; nome: string; icona: typeof Home; fine?: boolean }) {
  return (
    <NavLink to={to} end={fine} className={({ isActive }) => cn(VOCE, isActive ? 'text-inchiostro' : 'text-grafite-tenue')}>
      <Icona aria-hidden className="size-5" />
      {nome}
    </NavLink>
  )
}

/**
 * La barra in basso delle pagine principali di un esperimento: Home, Piante, il + della misura, Laboratorio e Altro.
 * "Altro" raccoglie le sezioni che non stanno qui, così se ne possono aggiungere senza toccare la barra.
 * Un lettore non vede il +: al suo posto resta uno spazio vuoto, così le voci non si spostano.
 */
export function NavEsperimento({ espId }: { espId: string }) {
  const navigate = useNavigate()
  const { puoMisurare } = usePermessi(espId)

  return (
    <nav
      aria-label="Navigazione esperimento"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-riga bg-carta pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex max-w-lg items-center px-2">
        <Voce to={percorsoHome(espId)} nome="Home" icona={Home} fine />
        <Voce to={percorsoPiante(espId)} nome="Piante" icona={Leaf} />
        <div className="flex flex-1 justify-center">
          {puoMisurare && (
            <button
              type="button"
              aria-label="Aggiungi misura"
              onClick={() => navigate(percorsoNuovaMisura(espId))}
              className="-mt-7 grid size-14 place-items-center rounded-2xl bg-inchiostro text-foglio shadow-[0_8px_20px_-6px_rgb(79_224_168/0.6)] transition-transform active:scale-95"
            >
              <Plus aria-hidden className="size-7" strokeWidth={2.5} />
            </button>
          )}
        </div>
        <Voce to={percorsoLaboratorio(espId)} nome="Laboratorio" icona={FlaskConical} />
        <Voce to={percorsoAltro(espId)} nome="Altro" icona={MoreHorizontal} />
      </div>
    </nav>
  )
}
