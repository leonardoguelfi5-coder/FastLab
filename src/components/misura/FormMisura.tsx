import type { ElementoLista, Parametro, ValoriMisura } from '@/domain/tipi'
import { valoreVuoto } from '@/domain/misure'
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
}

/** Il modulo di una misura: per ogni parametro il campo del suo tipo, nell'ordine ricevuto. */
export function FormMisura({ parametri, obbligatori, valori, onChange }: FormMisuraProps) {
  return (
    <div className="flex flex-col gap-6">
      {parametri.map((p) => {
        const v = valori[p.id] ?? valoreVuoto(p)
        const obbligatorio = obbligatori.has(p.id)
        const imposta = (nuovo: ValoriMisura[string]) => onChange({ ...valori, [p.id]: nuovo })
        switch (p.tipo) {
          case 'numero':
            return (
              <CampoNumero
                key={p.id}
                parametro={p}
                valore={Array.isArray(v) ? (v as (number | null)[]) : []}
                obbligatorio={obbligatorio}
                onChange={imposta}
              />
            )
          case 'testo':
            return (
              <CampoTesto key={p.id} parametro={p} valore={typeof v === 'string' ? v : ''} obbligatorio={obbligatorio} onChange={imposta} />
            )
          case 'sino':
            return (
              <CampoSiNo key={p.id} parametro={p} valore={typeof v === 'boolean' ? v : null} obbligatorio={obbligatorio} onChange={imposta} />
            )
          case 'lista':
            return (
              <CampoLista
                key={p.id}
                parametro={p}
                valore={Array.isArray(v) ? (v as ElementoLista[]) : []}
                obbligatorio={obbligatorio}
                onChange={imposta}
              />
            )
        }
      })}
    </div>
  )
}
