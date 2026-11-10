import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { aggiungiMembro, togliMembro, type Membro } from '@/api/persone'
import { chiavi, useMembri } from '@/api/query'
import { Conferma } from '@/components/Conferma'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { Scelta } from '@/components/Scelta'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RUOLI, RUOLO_A_PAROLE, RUOLO_NOME, type Ruolo } from '@/domain/ruoli'
import { messaggioErrore } from '@/lib/errori'
import { toastSalvato } from '@/lib/toastSalvato'
import { ModuloCampi } from '@/components/ModuloCampi'
import { Sezione, Spiegazione } from './Sezione'

const nomeMembro = (m: Membro) => m.email ?? 'Persona senza email'

/** Le tre scelte del ruolo: il nome corto, la spiegazione a parole è nell'elenco. */
function OpzioniRuolo() {
  return RUOLI.map(r => <option key={r} value={r}>{RUOLO_NOME[r]}</option>)
}

/**
 * Le persone dell'esperimento (Piano E, Task E10). Tutti vedono l'elenco, con il ruolo a parole e "tu" sulla propria
 * riga. Il proprietario aggiunge un collega già registrato (per email), cambia il ruolo degli altri e li toglie; gli
 * altri possono solo lasciare l'esperimento. Le misure, le note e le foto di chi esce restano. Le regole (solo
 * proprietario, mai zero proprietari, utente registrato) sono del database: qui si traducono i suoi rifiuti.
 */
export function SezionePersone({ espId }: { espId: string }) {
  const id = useId()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const membri = useMembri(espId)
  const elenco = membri.data
  const tu = elenco?.find(m => m.sei_tu)
  const proprietario = tu?.ruolo === 'proprietario'

  const [email, setEmail] = useState('')
  const [ruolo, setRuolo] = useState<Ruolo>('rilevatore')
  const [inCorso, setInCorso] = useState(false)
  // Chi si sta per togliere (o se stessi, per "Lascia l'esperimento"), in attesa della conferma.
  const [daTogliere, setDaTogliere] = useState<Membro | null>(null)

  /** Una modifica alle persone: riuscita o no si rilegge l'elenco; un errore si dice a parole e lascia tutto com'è. */
  async function esegui(operazione: () => Promise<void>): Promise<boolean> {
    if (inCorso) return false
    setInCorso(true)
    try {
      await operazione()
      toastSalvato('Persone aggiornate ✓')
      return true
    } catch (e) {
      toast.error(messaggioErrore(e))
      return false
    } finally {
      setInCorso(false)
      void queryClient.invalidateQueries({ queryKey: chiavi.membri(espId) })
      // Il proprio ruolo e l'elenco degli esperimenti (con il ruolo) possono essere cambiati.
      void queryClient.invalidateQueries({ queryKey: chiavi.ruolo(espId) })
      void queryClient.invalidateQueries({ queryKey: chiavi.esperimenti })
    }
  }

  async function aggiungi() {
    const scritta = email.trim()
    if (scritta === '') return
    if (await esegui(() => aggiungiMembro(espId, scritta, ruolo))) setEmail('')
  }

  async function conferma() {
    const m = daTogliere
    setDaTogliere(null)
    if (!m) return
    const riuscito = await esegui(() => togliMembro(espId, m.utente_id))
    // Chi ha lasciato l'esperimento non lo vede più: torna all'elenco.
    if (riuscito && m.sei_tu) navigate('/', { replace: true })
  }

  return (
    <Sezione titolo="Persone">
      <Spiegazione>
        Il proprietario gestisce tutto. Il rilevatore fa misure, note e foto, e corregge o elimina solo le sue. Il lettore
        guarda, esporta e duplica.
      </Spiegazione>

      {elenco === undefined ? (
        membri.isError
          ? <ErroreConRiprova errore={membri.error} onRiprova={() => void membri.refetch()} />
          : <p role="status" className="text-sm text-grafite-tenue">Caricamento…</p>
      ) : (
        <ul aria-label="Persone dell'esperimento" className="-mx-4 flex flex-col border-t border-riga">
          {elenco.map(m => (
            <li key={m.utente_id} className="flex flex-col gap-2 border-b border-riga px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0 break-all text-base text-grafite">{nomeMembro(m)}</span>
                {m.sei_tu && <span className="text-label text-grafite-tenue">tu</span>}
              </div>
              {proprietario && !m.sei_tu ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 grow basis-44">
                    <Scelta
                      aria-label={`Ruolo di ${nomeMembro(m)}`}
                      value={m.ruolo}
                      disabled={inCorso}
                      onChange={e => void esegui(() => aggiungiMembro(espId, m.email ?? '', e.target.value as Ruolo))}
                    >
                      <OpzioniRuolo />
                    </Scelta>
                  </div>
                  <Button variant="outline" aria-label={`Togli ${nomeMembro(m)}`} disabled={inCorso} onClick={() => setDaTogliere(m)}>
                    Togli
                  </Button>
                </div>
              ) : (
                <span className="text-sm text-grafite-tenue">{RUOLO_A_PAROLE[m.ruolo]}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {proprietario && (
        <ModuloCampi className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-email`}>Email del collega</Label>
            <Input
              id={`${id}-email`} type="email" inputMode="email" autoComplete="off" autoCapitalize="none"
              value={email} onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-ruolo`}>Ruolo</Label>
            <Scelta id={`${id}-ruolo`} value={ruolo} onChange={e => setRuolo(e.target.value as Ruolo)}>
              <OpzioniRuolo />
            </Scelta>
          </div>
          <Button variant="outline" className="self-start" disabled={inCorso || email.trim() === ''} onClick={() => void aggiungi()}>
            {inCorso ? 'Salvataggio…' : 'Aggiungi'}
          </Button>
        </ModuloCampi>
      )}
      <Spiegazione>
        Il collega deve essere già registrato su FastLab: se non lo è, chiedi all&apos;amministratore di invitarlo.
      </Spiegazione>

      {tu && !proprietario && (
        <Button variant="destructive" className="self-start" disabled={inCorso} onClick={() => setDaTogliere(tu)}>
          Lascia l&apos;esperimento
        </Button>
      )}

      <Conferma
        aperta={daTogliere !== null}
        titolo={daTogliere?.sei_tu ? 'Lasciare l\'esperimento?' : `Togliere ${daTogliere ? nomeMembro(daTogliere) : ''}?`}
        testo={daTogliere?.sei_tu
          ? 'Non lo vedrai più nell\'elenco. Le tue misure, note e foto restano all\'esperimento.'
          : `Togliere ${daTogliere ? nomeMembro(daTogliere) : ''} dall'esperimento? Le sue misure restano.`}
        annulla="Annulla"
        conferma={daTogliere?.sei_tu ? 'Lascia' : 'Togli'}
        onAnnulla={() => setDaTogliere(null)}
        onConferma={() => void conferma()}
      />
    </Sezione>
  )
}

