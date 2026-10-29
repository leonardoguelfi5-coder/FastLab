import { Fragment, useId, useState } from 'react'
import type { BozzaEsperimento, Pianta } from '@/domain/tipi'
import { generaPiante } from '@/domain/piante'
import { EditorFattori } from '@/components/config/EditorFattori'
import { conLivelliInSospeso, livelloAggiungibile } from '@/components/config/livelli'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TestoErrore } from '@/components/TestoErrore'
import { leggiIntero } from '@/lib/numeri'
import { Conferma } from '@/components/Conferma'
import { MAX_PIANTE, nPiante, rigeneraRighe, trattamentiInclusi, type RigaTrattamento } from './righeTrattamenti'

interface PassoPianteProps {
  bozza: BozzaEsperimento
  righe: RigaTrattamento[]
  onChange: (bozza: BozzaEsperimento, righe: RigaTrattamento[]) => void
}

const MAX_NUMERAZIONE = 999_999
const normalizza = (s: string) => s.trim().toLowerCase()

function Avviso({ id, children }: { id: string; children: string }) {
  return <p id={id} className="text-sm text-grafite-tenue">{children}</p>
}

interface TabellaProps {
  righe: RigaTrattamento[]
  onChange: (righe: RigaTrattamento[]) => void
}

function TabellaTrattamenti({ righe, onChange }: TabellaProps) {
  const id = useId()
  const cambia = (i: number, riga: RigaTrattamento) => onChange(righe.map((r, j) => (j === i ? riga : r)))

  return (
    // Righe di quaderno, non una griglia da foglio di calcolo: solo linee orizzontali tra un trattamento e l'altro.
    <table className="w-full border-collapse">
      <thead className="text-left text-grafite-tenue">
        <tr className="border-b border-riga">
          <th scope="col" className="w-14 pb-2 text-label">Incluso</th>
          <th scope="col" className="pb-2 text-label">Etichetta</th>
          <th scope="col" className="w-24 pb-2 text-label">N piante</th>
        </tr>
      </thead>
      <tbody>
        {righe.map((r, i) => {
          const sbagliato = r.incluso && nPiante(r) === null
          const idErrore = `${id}-${i}-errore`
          return (
            <Fragment key={r.trattamento.id}>
              <tr className={sbagliato ? undefined : 'border-b border-riga'}>
                <td className="py-2">
                  {/* L'etichetta senza testo allarga a 44px l'area che si può toccare intorno alla casella. */}
                  <label className="-ml-2.5 flex size-11 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      aria-label={`Includi il trattamento ${i + 1}`}
                      checked={r.incluso}
                      onChange={(e) => cambia(i, { ...r, incluso: e.target.checked })}
                      className="size-6 cursor-pointer accent-inchiostro"
                    />
                  </label>
                </td>
                <td className="py-2 pr-2">
                  <Input
                    aria-label={`Etichetta del trattamento ${i + 1}`}
                    value={r.trattamento.etichetta}
                    disabled={!r.incluso}
                    onChange={(e) => cambia(i, { ...r, trattamento: { ...r.trattamento, etichetta: e.target.value } })}
                  />
                </td>
                <td className="py-2">
                  <Input
                    variant="campo"
                    aria-label={`N piante del trattamento ${i + 1}`}
                    inputMode="numeric"
                    autoComplete="off"
                    value={r.n}
                    disabled={!r.incluso}
                    aria-invalid={sbagliato || undefined}
                    aria-describedby={sbagliato ? idErrore : undefined}
                    onChange={(e) => cambia(i, { ...r, n: e.target.value })}
                    className="text-center"
                  />
                </td>
              </tr>
              {sbagliato && (
                <tr className="border-b border-riga">
                  <td colSpan={3} className="pb-2">
                    <TestoErrore id={idErrore} className="justify-end">{`Scrivi un numero intero da 1 a ${MAX_PIANTE}.`}</TestoErrore>
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
    <div className="flex flex-col gap-6 empty:hidden">
      {bozza.trattamenti.map(t => {
        const indici = bozza.piante.flatMap((p, i) => (p.trattamento_id === t.id ? [i] : []))
        if (indici.length === 0) return null
        return (
          <section key={t.id} aria-labelledby={`${id}-${t.id}`} className="flex flex-col gap-2">
            <h4 id={`${id}-${t.id}`} className="border-b border-riga pb-2 text-base font-semibold text-grafite">
              {t.etichetta}
              <span className="font-normal text-grafite-tenue tabular-nums">{` · ${indici.length} piante`}</span>
            </h4>
            <div className="grid grid-cols-[1fr_7rem] gap-2 text-label text-grafite-tenue" aria-hidden>
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
                        variant="campo"
                        aria-label={`Etichetta della pianta ${i + 1}`}
                        value={p.etichetta}
                        aria-invalid={problema !== null || undefined}
                        aria-describedby={problema ? `${id}-p${i}` : undefined}
                        onChange={(e) => cambia(i, { etichetta: e.target.value })}
                      />
                      {problema && <TestoErrore id={`${id}-p${i}`}>{problema}</TestoErrore>}
                    </div>
                    <Input
                      variant="campo"
                      aria-label={`Blocco della pianta ${i + 1}`}
                      value={p.blocco ?? ''}
                      placeholder="—"
                      onChange={(e) => cambia(i, { blocco: e.target.value.trim() === '' ? null : e.target.value })}
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
    <div className="flex flex-col gap-10">
      <p className="max-w-[65ch] text-grafite-tenue">
        Un fattore è ciò che fai variare (es. Stress: Controllo, S1, W1). I trattamenti sono le combinazioni dei livelli
        dei fattori; per ognuno scegli quante piante ha.
      </p>

      <section aria-labelledby={`${id}-fattori`} className="flex flex-col gap-3">
        <h3 id={`${id}-fattori`} className="text-title text-grafite">Fattori</h3>
        <EditorFattori
          valore={bozza.fattori}
          onChange={(fattori) => onChange({ ...bozza, fattori }, righe)}
          inSospeso={inSospeso}
          onInSospeso={setInSospeso}
        />
      </section>

      <section aria-labelledby={`${id}-trattamenti`} className="flex flex-col gap-3">
        <h3 id={`${id}-trattamenti`} className="text-title text-grafite">Trattamenti</h3>
        <p className="max-w-[65ch] text-sm text-grafite-tenue">
          Togli la spunta alle combinazioni che non usi; puoi cambiare le etichette. Se modifichi i fattori, genera di nuovo:
          le righe già presenti restano come le hai lasciate.
        </p>
        <Button
          variant="outline"
          disabled={motivoTrattamenti !== null}
          aria-describedby={motivoTrattamenti ? `${id}-motivo-trattamenti` : undefined}
          onClick={generaTrattamenti}
          className="self-start"
        >
          Genera trattamenti
        </Button>
        {motivoTrattamenti && <Avviso id={`${id}-motivo-trattamenti`}>{motivoTrattamenti}</Avviso>}
        {righe.length > 0 && <TabellaTrattamenti righe={righe} onChange={cambiaRighe} />}
      </section>

      <section aria-labelledby={`${id}-piante`} className="flex flex-col gap-3">
        <h3 id={`${id}-piante`} className="text-title text-grafite">Piante</h3>
        <p className="max-w-[65ch] text-sm text-grafite-tenue">
          L'etichetta è quella che digiterai in campo: puoi cambiarla (es. 101 o B3-12). Il blocco è facoltativo.
        </p>
        <div className="flex items-end gap-2">
          <div className="flex w-36 flex-col gap-1.5">
            <Label htmlFor={`${id}-inizio`}>Numerazione da</Label>
            <Input
              id={`${id}-inizio`}
              variant="campo"
              inputMode="numeric"
              autoComplete="off"
              value={inizio}
              aria-invalid={primo === null || undefined}
              aria-describedby={primo === null ? `${id}-inizio-errore` : undefined}
              onChange={(e) => setInizio(e.target.value)}
            />
          </div>
          {/* Secondario: l'unico pulsante pieno della schermata resta "Avanti" nella barra in basso. */}
          <Button
            variant="outline"
            size="lg"
            disabled={motivoPiante !== null}
            aria-describedby={motivoPiante ? `${id}-motivo-piante` : undefined}
            onClick={() => (bozza.piante.length > 0 ? setConferma(true) : generaOra())}
            className="flex-1"
          >
            Genera piante
          </Button>
        </div>
        {primo === null && (
          <TestoErrore id={`${id}-inizio-errore`}>Scrivi un numero intero, es. 1 o 101.</TestoErrore>
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
