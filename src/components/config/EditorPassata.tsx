import { useId } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { Parametro, Passata, PassataParametro } from '@/domain/tipi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Interruttore } from './Interruttore'

interface EditorPassataProps {
  valore: Passata
  /** Tutti i parametri dell'esperimento: quelli archiviati non si mostrano. */
  parametri: Parametro[]
  onChange: (p: Passata) => void
}

const TIPO: Record<Parametro['tipo'], string> = { numero: 'numero', testo: 'testo', sino: 'sì/no', lista: 'lista' }

function descrivi(p: Parametro): string {
  return p.unita ? `${TIPO[p.tipo]}, ${p.unita}` : TIPO[p.tipo]
}

/**
 * Modifica di una passata: nome, icona e quali parametri compaiono nel modulo, in che ordine
 * e se sono obbligatori. I parametri inclusi stanno in cima, nell'ordine del modulo.
 */
export function EditorPassata({ valore, parametri, onChange }: EditorPassataProps) {
  const id = useId()
  const attivi = parametri.filter(p => !p.archiviato)
  const visibili = new Set(attivi.map(p => p.id))
  const ordinati = [...valore.parametri].sort((a, b) => a.ordine - b.ordine)
  const inclusi = ordinati.filter(pp => visibili.has(pp.parametro_id))
  // Parametri archiviati già nella passata: non si vedono, ma non si perdono.
  const nascosti = ordinati.filter(pp => !visibili.has(pp.parametro_id))
  const voce = new Map(inclusi.map(pp => [pp.parametro_id, pp]))
  const righe = [
    ...inclusi.map(pp => attivi.find(p => p.id === pp.parametro_id) as Parametro),
    ...attivi.filter(p => !voce.has(p.id)),
  ]

  const salvaInclusi = (nuovi: PassataParametro[]) =>
    onChange({ ...valore, parametri: [...nuovi, ...nascosti].map((pp, ordine) => ({ ...pp, ordine })) })

  function includi(parametroId: string, si: boolean) {
    if (si) salvaInclusi([...inclusi, { parametro_id: parametroId, obbligatorio: false, ordine: inclusi.length }])
    else salvaInclusi(inclusi.filter(pp => pp.parametro_id !== parametroId))
  }

  function sposta(i: number, verso: -1 | 1) {
    const nuovi = [...inclusi]
    ;[nuovi[i], nuovi[i + verso]] = [nuovi[i + verso], nuovi[i]]
    salvaInclusi(nuovi)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-nome`} className="text-sm font-medium">Nome della passata</Label>
          <Input
            id={`${id}-nome`}
            value={valore.nome}
            placeholder="es. Termometro"
            onChange={(e) => onChange({ ...valore, nome: e.target.value })}
            className="h-12 text-lg"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-icona`} className="text-sm font-medium">Icona</Label>
          <Input
            id={`${id}-icona`}
            value={valore.icona ?? ''}
            placeholder="🌱"
            aria-describedby={`${id}-icona-aiuto`}
            onChange={(e) => onChange({ ...valore, icona: e.target.value.trim() === '' ? null : e.target.value })}
            className="h-12 text-center text-lg"
          />
        </div>
      </div>
      <p id={`${id}-icona-aiuto`} className="-mt-2 text-sm text-muted-foreground">L'icona è facoltativa: un'emoji, es. 🌡 o 🌱.</p>

      <div className="flex flex-col gap-2">
        <p className="text-base font-medium">Parametri</p>
        <p className="text-sm text-muted-foreground">
          Accendi "Incluso" per i parametri da misurare in questa passata: compaiono nel modulo in quest'ordine, che cambi con le frecce.
        </p>
        {righe.length === 0 ? (
          <p className="text-sm text-muted-foreground">Non ci sono ancora parametri da includere.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {righe.map(p => {
              const pp = voce.get(p.id)
              const i = pp ? inclusi.indexOf(pp) : -1
              const idNome = `${id}-${p.id}`
              return (
                <li key={p.id} className="flex flex-col gap-3 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <p id={idNome} className="min-w-0 flex-1">
                      <span data-testid="nome-parametro" className="font-medium">{p.nome || 'Senza nome'}</span>
                      <span className="text-sm text-muted-foreground">{` · ${descrivi(p)}`}</span>
                    </p>
                    {pp && (
                      <>
                        <Button variant="outline" size="icon" aria-label={`Sposta «${p.nome}» su`} disabled={i === 0}
                          onClick={() => sposta(i, -1)} className="size-11">
                          <ArrowUp className="size-5" />
                        </Button>
                        <Button variant="outline" size="icon" aria-label={`Sposta «${p.nome}» giù`} disabled={i === inclusi.length - 1}
                          onClick={() => sposta(i, 1)} className="size-11">
                          <ArrowDown className="size-5" />
                        </Button>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-3">
                    <Interruttore etichetta="Incluso" contesto={idNome} checked={pp !== undefined}
                      onCheckedChange={(si) => includi(p.id, si)} />
                    <Interruttore etichetta="Obbligatorio" contesto={idNome} checked={pp?.obbligatorio ?? false}
                      disabled={!pp}
                      onCheckedChange={(si) => salvaInclusi(inclusi.map(x => (x === pp ? { ...x, obbligatorio: si } : x)))} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
