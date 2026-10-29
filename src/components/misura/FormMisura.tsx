import { useId } from 'react'
import { Check } from 'lucide-react'
import type { ElementoLista, Parametro, ValoriMisura } from '@/domain/tipi'
import { mantenibile, valoreVuoto } from '@/domain/misure'
import { CampoLista } from './CampoLista'
import { CampoNumero } from './CampoNumero'
import { CampoSiNo } from './CampoSiNo'
import { CampoTesto } from './CampoTesto'

interface FormMisuraProps {
  parametri: Parametro[]
  /** Gli id dei parametri obbligatori: hanno l'asterisco. */
  obbligatori: Set<string>
  valori: ValoriMisura
  onChange: (valori: ValoriMisura) => void
  /** Gli id dei parametri con la spunta "Mantieni questo parametro uguale". Solo per le misure nuove. */
  mantenuti?: Set<string>
  /**
   * Spunta o toglie "Mantieni questo parametro uguale anche nelle prossime misure". Senza, le caselle non ci sono
   * (correzione di una misura già salvata): una misura vecchia non decide i valori delle piante dopo.
   */
  onMantieni?: (parametroId: string, attivo: boolean) => void
  /** I parametri il cui valore di partenza viene dai mantenuti: portano il segno "mantenuto" accanto al nome. */
  precompilatiDaMantenuti?: Set<string>
}

interface CasellaMantieniProps {
  attiva: boolean
  onChange: (attiva: boolean) => void
}

/**
 * La casella sotto un campo. L'etichetta è parte del bersaglio da 44 px; la casella è disegnata con il bordo dei
 * controlli e, da spuntata, in inchiostro con il segno ✓ (non solo colore).
 */
function CasellaMantieni({ attiva, onChange }: CasellaMantieniProps) {
  const id = useId()
  return (
    <label htmlFor={id} className="relative flex min-h-11 cursor-pointer items-center gap-3 text-sm text-grafite select-none">
      <input
        id={id}
        type="checkbox"
        checked={attiva}
        onChange={(e) => onChange(e.target.checked)}
        className="peer size-6 shrink-0 cursor-pointer appearance-none rounded-sm border border-riga-controllo bg-foglio checked:border-inchiostro checked:bg-inchiostro"
      />
      <Check aria-hidden className="pointer-events-none absolute left-0 size-6 p-1 text-foglio opacity-0 peer-checked:opacity-100" />
      Mantieni questo parametro uguale anche nelle prossime misure
    </label>
  )
}

/** Il modulo di una misura: per ogni parametro il campo del suo tipo, nell'ordine ricevuto. */
export function FormMisura({ parametri, obbligatori, valori, onChange, mantenuti, onMantieni, precompilatiDaMantenuti }: FormMisuraProps) {
  return (
    <div className="flex flex-col gap-6">
      {parametri.map((p) => {
        const v = valori[p.id] ?? valoreVuoto(p)
        const obbligatorio = obbligatori.has(p.id)
        const imposta = (nuovo: ValoriMisura[string]) => onChange({ ...valori, [p.id]: nuovo })
        const mantenuto = precompilatiDaMantenuti?.has(p.id) ?? false
        const campo = (() => {
          switch (p.tipo) {
            case 'numero':
              return (
                <CampoNumero
                  parametro={p}
                  valore={Array.isArray(v) ? (v as (number | null)[]) : []}
                  obbligatorio={obbligatorio}
                  mantenuto={mantenuto}
                  onChange={imposta}
                />
              )
            case 'testo':
              return (
                <CampoTesto parametro={p} valore={typeof v === 'string' ? v : ''} obbligatorio={obbligatorio} mantenuto={mantenuto} onChange={imposta} />
              )
            case 'sino':
              return (
                <CampoSiNo parametro={p} valore={typeof v === 'boolean' ? v : null} obbligatorio={obbligatorio} mantenuto={mantenuto} onChange={imposta} />
              )
            case 'lista':
              return (
                <CampoLista
                  parametro={p}
                  valore={Array.isArray(v) ? (v as ElementoLista[]) : []}
                  obbligatorio={obbligatorio}
                  onChange={imposta}
                />
              )
          }
        })()
        return (
          <div key={p.id} className="flex flex-col gap-1">
            {campo}
            {onMantieni && mantenibile(p) && (
              <CasellaMantieni attiva={mantenuti?.has(p.id) ?? false} onChange={(attiva) => onMantieni(p.id, attiva)} />
            )}
          </div>
        )
      })}
    </div>
  )
}
