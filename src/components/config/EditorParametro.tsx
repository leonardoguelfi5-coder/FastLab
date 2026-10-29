import { useId } from 'react'
import { X } from 'lucide-react'
import type { Parametro, SottoCampo, TipoParametro } from '@/domain/tipi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Scelta } from '@/components/Scelta'
import { TestoErrore } from '@/components/TestoErrore'
import { leggiIntero, parseNumero } from '@/lib/numeri'
import { CampoNumero } from './CampoNumero'
import { Interruttore } from './Interruttore'

interface EditorParametroProps {
  valore: Parametro
  onChange: (p: Parametro) => void
  /** Il parametro ha già dati: il tipo non si può più cambiare. */
  tipoBloccato?: boolean
  /** Perché il tipo è bloccato, se non è perché ci sono dati (es. mentre lo si sta controllando). */
  motivoBlocco?: string
}

const TIPI: { valore: TipoParametro; nome: string; aiuto: string }[] = [
  { valore: 'numero', nome: 'Numero', aiuto: 'Un valore con decimali, es. altezza in cm.' },
  { valore: 'testo', nome: 'Testo', aiuto: 'Testo libero, es. note o osservazioni.' },
  { valore: 'sino', nome: 'Sì/No', aiuto: 'Una risposta sì o no, es. "presenza di fiori".' },
  {
    valore: 'lista', nome: 'Lista ripetuta',
    aiuto: 'Un elenco di elementi numerati, ognuno con i suoi sotto-campi: es. per ogni palco il numero di foglie.',
  },
]

const ERRORE_LETTURE = 'Scrivi un numero intero da 1 a 20.'
const ERRORE_DECIMALE = 'Scrivi un numero, es. 12,5.'
const leggiLetture = (t: string) => leggiIntero(t, 1, 20) ?? NaN
const normalizza = (s: string) => s.trim().toLowerCase()
const testoONull = (s: string) => (s.trim() === '' ? null : s)

/** Il parametro con il tipo nuovo, senza le opzioni che per quel tipo non valgono (non restano nascoste). */
function conTipo(p: Parametro, tipo: TipoParametro): Parametro {
  if (tipo === 'numero') return { ...p, tipo, sotto_campi: [] }
  const base = { ...p, tipo, unita: null, ricorda_tra_piante: false, n_letture: 1, valore_min: null, valore_max: null }
  if (tipo === 'lista') return base
  return { ...base, progressivo: false, sotto_campi: [] }
}

/** Il problema del nome di un sotto-campo, o null se va bene. */
function problemaSottoCampo(sotto: SottoCampo[], i: number): string | null {
  const nome = normalizza(sotto[i].nome)
  if (nome === '') return 'Dai un nome al sotto-campo.'
  if (sotto.some((s, j) => j !== i && normalizza(s.nome) === nome)) return 'C\'è già un sotto-campo con questo nome.'
  return null
}

function SottoCampi({ valore, onChange }: { valore: SottoCampo[]; onChange: (s: SottoCampo[]) => void }) {
  const id = useId()
  const cambia = (i: number, modifica: Partial<SottoCampo>) => onChange(valore.map((s, j) => (j === i ? { ...s, ...modifica } : s)))

  return (
    <fieldset className="flex flex-col gap-3 border-t border-riga pt-4">
      <legend className="float-left mb-1 w-full text-base font-semibold text-grafite">Sotto-campi</legend>
      <p className="text-sm text-grafite-tenue">I valori numerici da registrare per ogni elemento della lista, es. "N foglie".</p>
      {valore.length === 0 && <TestoErrore>Aggiungi almeno un sotto-campo.</TestoErrore>}
      <ul className="flex flex-col gap-3">
        {valore.map((s, i) => {
          const problema = problemaSottoCampo(valore, i)
          return (
            <li key={s.chiave} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Input
                  aria-label={`Nome del sotto-campo ${i + 1}`}
                  placeholder="Nome, es. N foglie"
                  value={s.nome}
                  aria-invalid={problema !== null || undefined}
                  aria-describedby={problema ? `${id}-${i}-problema` : undefined}
                  onChange={(e) => cambia(i, { nome: e.target.value })}
                  className="flex-1"
                />
                <Input
                  aria-label={`Unità del sotto-campo ${i + 1}`}
                  placeholder="Unità"
                  value={s.unita ?? ''}
                  onChange={(e) => cambia(i, { unita: testoONull(e.target.value) })}
                  className="w-24"
                />
                <Button
                  variant="quiet"
                  size="icon"
                  aria-label={`Togli il sotto-campo ${i + 1}`}
                  onClick={() => onChange(valore.filter((_, j) => j !== i))}
                  className="text-grafite-tenue"
                >
                  <X className="size-5" />
                </Button>
              </div>
              {problema && <TestoErrore id={`${id}-${i}-problema`}>{problema}</TestoErrore>}
            </li>
          )
        })}
      </ul>
      <Button
        variant="outline"
        onClick={() => onChange([...valore, { chiave: crypto.randomUUID(), nome: '', unita: null }])}
        className="self-start"
      >
        + Sotto-campo
      </Button>
    </fieldset>
  )
}

/** Modifica di un parametro: nome, tipo e le opzioni che valgono per quel tipo. */
export function EditorParametro({
  valore: p, onChange, tipoBloccato, motivoBlocco = 'Il tipo non si può cambiare: ci sono già dati.',
}: EditorParametroProps) {
  const id = useId()
  const tipo = TIPI.find(t => t.valore === p.tipo) ?? TIPI[0]
  const cambia = (modifica: Partial<Parametro>) => onChange({ ...p, ...modifica })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-nome`}>Nome</Label>
        <Input
          id={`${id}-nome`}
          value={p.nome}
          placeholder="es. Altezza"
          onChange={(e) => cambia({ nome: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-tipo`}>Tipo</Label>
        <Scelta
          id={`${id}-tipo`}
          value={p.tipo}
          disabled={tipoBloccato}
          aria-describedby={`${id}-tipo-aiuto${tipoBloccato ? ` ${id}-tipo-bloccato` : ''}`}
          onChange={(e) => onChange(conTipo(p, e.target.value as TipoParametro))}
        >
          {TIPI.map(t => <option key={t.valore} value={t.valore}>{t.nome}</option>)}
        </Scelta>
        <p id={`${id}-tipo-aiuto`} className="text-sm text-grafite-tenue">{tipo.aiuto}</p>
        {tipoBloccato && (
          <p id={`${id}-tipo-bloccato`} className="text-sm text-grafite-tenue">{motivoBlocco}</p>
        )}
      </div>

      {p.tipo === 'numero' && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-unita`}>Unità</Label>
            <Input
              id={`${id}-unita`}
              value={p.unita ?? ''}
              placeholder="es. cm (facoltativa)"
              onChange={(e) => cambia({ unita: testoONull(e.target.value) })}
            />
          </div>
          <CampoNumero
            etichetta="Letture per misura"
            aiuto="Quante volte misuri il valore ogni volta, es. 3 letture SPAD su foglie diverse: nell'export ci sono le letture e la media."
            valore={p.n_letture}
            onChange={(n) => { if (n !== null) cambia({ n_letture: n }) }}
            leggi={leggiLetture}
            errore={ERRORE_LETTURE}
            intero
          />
          <div className="grid grid-cols-2 gap-3">
            <CampoNumero etichetta="Minimo" valore={p.valore_min} onChange={(v) => cambia({ valore_min: v })}
              leggi={parseNumero} errore={ERRORE_DECIMALE} />
            <CampoNumero etichetta="Massimo" valore={p.valore_max} onChange={(v) => cambia({ valore_max: v })}
              leggi={parseNumero} errore={ERRORE_DECIMALE} />
          </div>
          <p className="-mt-3 text-sm text-grafite-tenue">
            Facoltativi: un valore fuori dall'intervallo viene segnalato come sospetto, ma si può salvare.
          </p>
        </>
      )}

      {p.tipo === 'lista' && <SottoCampi valore={p.sotto_campi} onChange={(s) => cambia({ sotto_campi: s })} />}

      {(p.tipo === 'numero' || p.tipo === 'lista') && (
        <Interruttore
          etichetta="Progressivo"
          aiuto="Per le conte che crescono nel tempo: il campo parte dall'ultimo valore registrato per la stessa pianta."
          checked={p.progressivo}
          onCheckedChange={(v) => cambia({ progressivo: v })}
        />
      )}
      {p.tipo === 'numero' && (
        <Interruttore
          etichetta="Ricorda tra piante"
          aiuto="Durante una passata il valore resta da una pianta all'altra, es. la temperatura dell'aria."
          checked={p.ricorda_tra_piante}
          onCheckedChange={(v) => cambia({ ricorda_tra_piante: v })}
        />
      )}
    </div>
  )
}
