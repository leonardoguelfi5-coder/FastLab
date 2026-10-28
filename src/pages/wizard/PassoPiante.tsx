import { Fragment, useId, useState } from 'react'
import type { BozzaEsperimento, Pianta } from '@/domain/tipi'
import { generaPiante } from '@/domain/piante'
import { EditorFattori } from '@/components/config/EditorFattori'
import { conLivelliInSospeso, livelloAggiungibile } from '@/components/config/livelli'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { leggiIntero } from '@/lib/numeri'
import { Conferma } from './Conferma'
import { MAX_PIANTE, nPiante, rigeneraRighe, trattamentiInclusi, type RigaTrattamento } from './righeTrattamenti'

interface PassoPianteProps {
  bozza: BozzaEsperimento
  righe: RigaTrattamento[]
  onChange: (bozza: BozzaEsperimento, righe: RigaTrattamento[]) => void
}

const MAX_NUMERAZIONE = 999_999
const normalizza = (s: string) => s.trim().toLowerCase()

function Avviso({ id, children }: { id: string; children: string }) {
  return <p id={id} className="text-sm text-muted-foreground">{children}</p>
}

interface TabellaProps {
  righe: RigaTrattamento[]
  onChange: (righe: RigaTrattamento[]) => void
}

function TabellaTrattamenti({ righe, onChange }: TabellaProps) {
  const id = useId()
  const cambia = (i: number, riga: RigaTrattamento) => onChange(righe.map((r, j) => (j === i ? riga : r)))

  return (
    <table className="w-full border-separate border-spacing-y-1">
      <thead className="text-left text-sm text-muted-foreground">
        <tr>
          <th scope="col" className="w-12 font-normal">Incluso</th>
          <th scope="col" className="font-normal">Etichetta</th>
          <th scope="col" className="w-24 font-normal">N piante</th>
        </tr>
      </thead>
      <tbody>
        {righe.map((r, i) => {
          const sbagliato = r.incluso && nPiante(r) === null
          const idErrore = `${id}-${i}-errore`
          return (
            <Fragment key={r.trattamento.id}>
              <tr>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Includi il trattamento ${i + 1}`}
                    checked={r.incluso}
                    onChange={(e) => cambia(i, { ...r, incluso: e.target.checked })}
                    className="size-6 accent-primary"
                  />
                </td>
                <td className="pr-2">
                  <Input
                    aria-label={`Etichetta del trattamento ${i + 1}`}
                    value={r.trattamento.etichetta}
                    disabled={!r.incluso}
                    onChange={(e) => cambia(i, { ...r, trattamento: { ...r.trattamento, etichetta: e.target.value } })}
                    className="h-12 text-lg"
                  />
                </td>
                <td>
                  <Input
                    aria-label={`N piante del trattamento ${i + 1}`}
                    inputMode="numeric"
                    autoComplete="off"
                    value={r.n}
                    disabled={!r.incluso}
                    aria-invalid={sbagliato || undefined}
                    aria-describedby={sbagliato ? idErrore : undefined}
                    onChange={(e) => cambia(i, { ...r, n: e.target.value })}
                    className="h-12 text-center text-lg"
                  />
                </td>
              </tr>
              {sbagliato && (
                <tr>
                  <td colSpan={3}>
                    <p id={idErrore} className="text-right text-sm text-destructive">{`Scrivi un numero intero da 1 a ${MAX_PIANTE}.`}</p>
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

function ElencoPiante({ bozza, onChange }: { bozza: BozzaEsperimento; onChange: (piante: Pianta[]) => void }) {
  const id = useId()
  const ripetute = new Map<string, number>()
  for (const p of bozza.piante) ripetute.set(normalizza(p.etichetta), (ripetute.get(normalizza(p.etichetta)) ?? 0) + 1)
  const cambia = (i: number, modifica: Partial<Pianta>) => onChange(bozza.piante.map((p, j) => (j === i ? { ...p, ...modifica } : p)))

  return (
    <div className="flex flex-col gap-4">
      {bozza.trattamenti.map(t => {
        const indici = bozza.piante.flatMap((p, i) => (p.trattamento_id === t.id ? [i] : []))
        if (indici.length === 0) return null
        return (
          <section key={t.id} aria-labelledby={`${id}-${t.id}`} className="flex flex-col gap-2">
            <h4 id={`${id}-${t.id}`} className="font-medium">
              {t.etichetta}
              <span className="font-normal text-muted-foreground">{` · ${indici.length} piante`}</span>
            </h4>
            <div className="grid grid-cols-[1fr_7rem] gap-2 text-sm text-muted-foreground" aria-hidden>
              <span>Etichetta</span>
              <span>Blocco</span>
            </div>
            <ul className="flex flex-col gap-2">
              {indici.map(i => {
                const p = bozza.piante[i]
                const problema = p.etichetta.trim() === ''
                  ? 'Manca l\'etichetta.'
                  : (ripetute.get(normalizza(p.etichetta)) ?? 0) > 1 ? 'Etichetta ripetuta.' : null
                return (
                  <li key={p.id} className="grid grid-cols-[1fr_7rem] items-start gap-2">
                    <div className="flex flex-col gap-1">
                      <Input
                        aria-label={`Etichetta della pianta ${i + 1}`}
                        value={p.etichetta}
                        aria-invalid={problema !== null || undefined}
                        aria-describedby={problema ? `${id}-p${i}` : undefined}
                        onChange={(e) => cambia(i, { etichetta: e.target.value })}
                        className="h-12 text-lg"
                      />
                      {problema && <p id={`${id}-p${i}`} className="text-sm text-destructive">{problema}</p>}
                    </div>
                    <Input
                      aria-label={`Blocco della pianta ${i + 1}`}
                      value={p.blocco ?? ''}
                      placeholder="—"
                      onChange={(e) => cambia(i, { blocco: e.target.value.trim() === '' ? null : e.target.value })}
                      className="h-12 text-lg"
                    />
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

/** Passo 2: fattori e livelli, tabella dei trattamenti e piante. */
export function PassoPiante({ bozza, righe, onChange }: PassoPianteProps) {
  const id = useId()
  const [inizio, setInizio] = useState('1')
  const [conferma, setConferma] = useState(false)
  // Livelli scritti in "Nuovo livello" ma non ancora aggiunti: "Genera trattamenti" li aggiunge da sé.
  const [inSospeso, setInSospeso] = useState<Record<string, string>>({})

  const cambiaRighe = (nuove: RigaTrattamento[]) => onChange({ ...bozza, trattamenti: trattamentiInclusi(nuove) }, nuove)

  function generaTrattamenti() {
    const pronti = conLivelliInSospeso(bozza.fattori, inSospeso)
    const nuove = rigeneraRighe(righe, pronti.fattori)
    setInSospeso(pronti.testi)
    onChange({ ...bozza, fattori: pronti.fattori, trattamenti: trattamentiInclusi(nuove) }, nuove)
  }

  const senzaLivelli = bozza.fattori.find(f => f.livelli.length === 0 && !livelloAggiungibile(f, inSospeso[f.id] ?? ''))
  const motivoTrattamenti = bozza.fattori.length === 0
    ? 'Aggiungi almeno un fattore con i suoi livelli.'
    : senzaLivelli ? `Il fattore «${senzaLivelli.nome.trim() || 'senza nome'}» non ha livelli: aggiungine almeno uno.` : null

  const inclusi = righe.filter(r => r.incluso)
  const primo = leggiIntero(inizio, 0, MAX_NUMERAZIONE)
  const motivoPiante = righe.length === 0 ? 'Prima genera i trattamenti.'
    : inclusi.length === 0 ? 'Includi almeno un trattamento.'
      : inclusi.some(r => nPiante(r) === null) ? 'Correggi il numero di piante nella tabella.'
        : primo === null ? 'Correggi la numerazione.' : null

  function generaOra() {
    if (motivoPiante !== null || primo === null) return
    const piante = generaPiante(inclusi.map(r => ({ trattamento_id: r.trattamento.id, n: nPiante(r) ?? 0 })), primo)
    onChange({ ...bozza, piante }, righe)
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground">
        Un fattore è ciò che fai variare (es. Stress: Controllo, S1, W1). I trattamenti sono le combinazioni dei livelli
        dei fattori; per ognuno scegli quante piante ha.
      </p>

      <section aria-labelledby={`${id}-fattori`} className="flex flex-col gap-3">
        <h3 id={`${id}-fattori`} className="text-lg font-semibold">Fattori</h3>
        <EditorFattori
          valore={bozza.fattori}
          onChange={(fattori) => onChange({ ...bozza, fattori }, righe)}
          inSospeso={inSospeso}
          onInSospeso={setInSospeso}
        />
      </section>

      <section aria-labelledby={`${id}-trattamenti`} className="flex flex-col gap-3">
        <h3 id={`${id}-trattamenti`} className="text-lg font-semibold">Trattamenti</h3>
        <p className="text-sm text-muted-foreground">
          Togli la spunta alle combinazioni che non usi; puoi cambiare le etichette. Se modifichi i fattori, genera di nuovo:
          le righe già presenti restano come le hai lasciate.
        </p>
        <Button
          variant="outline"
          disabled={motivoTrattamenti !== null}
          aria-describedby={motivoTrattamenti ? `${id}-motivo-trattamenti` : undefined}
          onClick={generaTrattamenti}
          className="h-12 self-start text-base"
        >
          Genera trattamenti
        </Button>
        {motivoTrattamenti && <Avviso id={`${id}-motivo-trattamenti`}>{motivoTrattamenti}</Avviso>}
        {righe.length > 0 && <TabellaTrattamenti righe={righe} onChange={cambiaRighe} />}
      </section>

      <section aria-labelledby={`${id}-piante`} className="flex flex-col gap-3">
        <h3 id={`${id}-piante`} className="text-lg font-semibold">Piante</h3>
        <p className="text-sm text-muted-foreground">
          L'etichetta è quella che digiterai in campo: puoi cambiarla (es. 101 o B3-12). Il blocco è facoltativo.
        </p>
        <div className="flex items-start gap-2">
          <div className="flex w-36 flex-col gap-1">
            <Label htmlFor={`${id}-inizio`} className="text-sm font-medium">Numerazione da</Label>
            <Input
              id={`${id}-inizio`}
              inputMode="numeric"
              autoComplete="off"
              value={inizio}
              aria-invalid={primo === null || undefined}
              aria-describedby={primo === null ? `${id}-inizio-errore` : undefined}
              onChange={(e) => setInizio(e.target.value)}
              className="h-12 text-lg"
            />
          </div>
          <Button
            disabled={motivoPiante !== null}
            aria-describedby={motivoPiante ? `${id}-motivo-piante` : undefined}
            onClick={() => (bozza.piante.length > 0 ? setConferma(true) : generaOra())}
            className="mt-6 h-12 flex-1 text-base"
          >
            Genera piante
          </Button>
        </div>
        {primo === null && (
          <p id={`${id}-inizio-errore`} className="text-sm text-destructive">Scrivi un numero intero, es. 1 o 101.</p>
        )}
        {motivoPiante && <Avviso id={`${id}-motivo-piante`}>{motivoPiante}</Avviso>}
        <ElencoPiante bozza={bozza} onChange={(piante) => onChange({ ...bozza, piante }, righe)} />
      </section>

      <Conferma
        aperta={conferma}
        titolo="Rigenerare le piante?"
        testo="Le etichette modificate andranno perse."
        annulla="Annulla"
        conferma="Rigenera"
        onAnnulla={() => setConferma(false)}
        onConferma={() => { setConferma(false); generaOra() }}
      />
    </div>
  )
}
