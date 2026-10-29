import { useId, useState } from 'react'
import type { Parametro, Strumento } from '@/domain/tipi'
import { nuovoParametro, parametriDello, problemiParametro } from '@/domain/bozza'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Espandibile } from '@/components/Espandibile'
import { TestoErrore } from '@/components/TestoErrore'
import { EditorParametro } from './EditorParametro'
import { Interruttore } from './Interruttore'
import { riassuntoParametro } from './riassunti'

/** Uno strumento con i suoi valori: i parametri che si misurano con lui, nell'ordine del modulo. */
export interface StrumentoConValori {
  strumento: Strumento
  parametri: Parametro[]
}

interface EditorStrumentoProps {
  valore: StrumentoConValori
  onChange: (v: StrumentoConValori) => void
  /**
   * Tabella fenologica: i valori possono essere di ogni tipo, con progressivo e "Obbligatorio". Se manca vale il tipo
   * dello strumento. Uno strumento semplice ha solo valori numerici (unità, letture, minimo e massimo).
   */
  tipoFenologico?: boolean
  /** Gli altri parametri dell'esperimento: un valore non può avere il loro stesso nome. */
  altriParametri?: Parametro[]
}

const MOTIVO_NUMERO = 'Uno strumento misura numeri. Per testo, sì/no o liste usa la tabella fenologica.'

/**
 * Modifica di uno strumento: nome, icona e valori, uno alla volta con l'editor del parametro. Aggiungere un valore crea
 * un parametro e lo collega allo strumento; toglierlo fa il contrario (il parametro non resta senza strumento, dove non
 * si misurerebbe). Nello strumento semplice il progressivo non c'è (vale per le conte che crescono nel tempo, cioè per
 * la tabella fenologica) e "Obbligatorio" nemmeno: la misura conta tutti i valori dello strumento.
 */
export function EditorStrumento({ valore, onChange, tipoFenologico, altriParametri = [] }: EditorStrumentoProps) {
  const id = useId()
  const [aperto, setAperto] = useState<string | null>(null)
  const { strumento } = valore
  const fenologico = tipoFenologico ?? strumento.tipo === 'fenologico'
  const parametri = parametriDello(strumento, valore.parametri)
  const obbligatorio = (p: Parametro) => strumento.parametri.find(pp => pp.parametro_id === p.id)?.obbligatorio ?? false

  const cambiaStrumento = (modifica: Partial<Strumento>) => onChange({ ...valore, strumento: { ...strumento, ...modifica } })
  const cambiaParametro = (p: Parametro) => onChange({ ...valore, parametri: parametri.map(x => (x.id === p.id ? p : x)) })
  const cambiaObbligatorio = (p: Parametro, si: boolean) => cambiaStrumento({
    parametri: strumento.parametri.map(pp => (pp.parametro_id === p.id ? { ...pp, obbligatorio: si } : pp)),
  })

  function aggiungi() {
    const p = nuovoParametro(Math.max(-1, ...parametri.map(x => x.ordine)) + 1)
    onChange({
      strumento: {
        ...strumento,
        parametri: [...strumento.parametri, { parametro_id: p.id, obbligatorio: false, ordine: strumento.parametri.length }],
      },
      parametri: [...parametri, p],
    })
    setAperto(p.id)
  }

  function togli(p: Parametro) {
    onChange({
      strumento: {
        ...strumento,
        parametri: strumento.parametri.filter(pp => pp.parametro_id !== p.id).map((pp, ordine) => ({ ...pp, ordine })),
      },
      parametri: parametri.filter(x => x.id !== p.id),
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-nome`}>Nome dello strumento</Label>
          <Input
            id={`${id}-nome`}
            value={strumento.nome}
            placeholder="es. Termometro"
            onChange={(e) => cambiaStrumento({ nome: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-icona`}>Icona</Label>
          <Input
            id={`${id}-icona`}
            value={strumento.icona ?? ''}
            placeholder="🌱"
            aria-describedby={`${id}-icona-aiuto`}
            onChange={(e) => cambiaStrumento({ icona: e.target.value.trim() === '' ? null : e.target.value })}
            className="text-center text-campo"
          />
        </div>
      </div>
      <p id={`${id}-icona-aiuto`} className="-mt-3 text-sm text-grafite-tenue">L'icona è facoltativa: un'emoji, es. 🌡 o 🌱.</p>

      <div className="flex flex-col gap-2">
        <p className="text-base font-semibold text-grafite">Valori</p>
        <p className="text-sm text-grafite-tenue">
          {fenologico
            ? 'Le voci della tabella: numeri, testo, sì/no o liste ripetute. Tocca un valore per modificarlo.'
            : 'Quello che misuri con questo strumento, es. temperatura dell\'aria. Tocca un valore per modificarlo.'}
        </p>
        {parametri.length === 0 && <p className="text-sm text-grafite-tenue">Nessun valore ancora.</p>}
        <ul aria-label="Valori" className="-mx-4 flex flex-col border-t border-riga empty:hidden">
          {parametri.map(p => {
            // Gli stessi controlli del riepilogo, qui dove si correggono (nome doppio compreso, anche in altri strumenti).
            const problemi = problemiParametro(p, [...parametri, ...altriParametri])
            return (
              <Espandibile
                key={p.id}
                titolo={p.nome.trim() || 'Senza nome'}
                riassunto={riassuntoParametro(p)}
                nota={problemi.length > 0 ? 'Da completare' : undefined}
                aperto={aperto === p.id}
                onCambia={() => setAperto(aperto === p.id ? null : p.id)}
              >
                <EditorParametro
                  valore={p}
                  onChange={cambiaParametro}
                  tipoBloccato={!fenologico}
                  motivoBlocco={MOTIVO_NUMERO}
                  senzaProgressivo={!fenologico}
                />
                {fenologico && (
                  <Interruttore
                    etichetta="Obbligatorio"
                    aiuto="Se manca, la pianta resta «incompleta» e va ripresa."
                    checked={obbligatorio(p)}
                    onCheckedChange={(si) => cambiaObbligatorio(p, si)}
                  />
                )}
                {problemi.length > 0 && (
                  <div className="flex flex-col gap-1">{problemi.map(e => <TestoErrore key={e}>{e}</TestoErrore>)}</div>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  aria-label={`Togli il valore «${p.nome.trim() || 'senza nome'}»`}
                  onClick={() => togli(p)}
                  className="self-start"
                >
                  Togli il valore
                </Button>
              </Espandibile>
            )
          })}
        </ul>
        <Button variant="outline" onClick={aggiungi} className="self-start">Aggiungi valore</Button>
      </div>
    </div>
  )
}
