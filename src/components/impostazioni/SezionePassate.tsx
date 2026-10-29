import { useState } from 'react'
import { eliminaPassata, salvaPassata } from '@/api/configurazione'
import { EditorPassata } from '@/components/config/EditorPassata'
import { Conferma } from '@/components/Conferma'
import { Espandibile } from '@/components/Espandibile'
import { TestoErrore } from '@/components/TestoErrore'
import { Button } from '@/components/ui/button'
import { nuovaPassata, problemiPassata } from '@/domain/bozza'
import type { ConfigEsperimento, Passata } from '@/domain/tipi'
import { useAzione } from './azione'
import { useBozze, useSegnalaModifiche } from './modifiche'
import { Sezione, Spiegazione } from './Sezione'

const sostituisci = (elenco: Passata[], p: Passata) =>
  elenco.some(x => x.id === p.id) ? elenco.map(x => (x.id === p.id ? p : x)) : [...elenco, p]

/**
 * Le passate, una alla volta in un editor che si apre, con il proprio "Salva"; "+ Passata" ne prepara una nuova. Una
 * passata con misure non si elimina: lo dice il database (23503) e il messaggio lo spiega.
 */
export function SezionePassate({ espId, config }: { espId: string; config: ConfigEsperimento }) {
  const { inCorso, esegui } = useAzione(espId)
  const bozze = useBozze<Passata>()
  // Le passate nuove come sono state create: quel che si scrive sta nelle bozze, come per quelle salvate.
  const [nuove, setNuove] = useState<Passata[]>([])
  const [aperta, setAperta] = useState<string | null>(null)
  const [daEliminare, setDaEliminare] = useState<{ passata: Passata; aperto: boolean } | null>(null)

  const attivi = new Set(config.parametri.filter(p => !p.archiviato).map(p => p.id))
  useSegnalaModifiche('passate', nuove.length > 0 || config.passate.some(p => bozze.modificato(p)))

  function aggiungi() {
    const ordine = Math.max(-1, ...config.passate.map(p => p.ordine), ...nuove.map(p => p.ordine)) + 1
    const p = nuovaPassata(ordine)
    setNuove(n => [...n, p])
    setAperta(p.id)
  }

  function scartaNuova(id: string) {
    setNuove(n => n.filter(x => x.id !== id))
    bozze.scarta(id)
  }

  async function salva(inviata: Passata, nuova: boolean) {
    const daSalvare: Passata = { ...inviata, nome: inviata.nome.trim(), icona: inviata.icona?.trim() || null }
    const riuscito = await esegui(() => salvaPassata(espId, daSalvare), {
      messaggio: `Passata «${daSalvare.nome}» salvata.`,
      aggiorna: c => ({ ...c, passate: sostituisci(c.passate, daSalvare) }),
    })
    if (!riuscito) return
    if (nuova) setNuove(n => n.filter(x => x.id !== inviata.id))
    bozze.salvata(inviata)
  }

  async function elimina(p: Passata) {
    setDaEliminare({ passata: p, aperto: false })
    const riuscito = await esegui(() => eliminaPassata(espId, p.id), {
      messaggio: 'Passata eliminata.',
      neutro: true,
      aggiorna: c => ({ ...c, passate: c.passate.filter(x => x.id !== p.id) }),
    })
    if (riuscito) {
      bozze.scarta(p.id)
      setAperta(a => (a === p.id ? null : a))
    }
  }

  const voci = [
    ...config.passate.map(p => ({ salvata: p as Passata | null, valore: bozze.valore(p) })),
    ...nuove.map(p => ({ salvata: null, valore: bozze.valore(p) })),
  ]
  // Il nome si confronta con le passate salvate e con le nuove (come per i parametri).
  const altre = [...config.passate, ...nuove.map(bozze.valore)]

  return (
    <Sezione titolo="Passate">
      <Spiegazione>
        Una passata raggruppa i parametri che rilevi insieme in campo. Si elimina solo se non ha ancora misure.
      </Spiegazione>
      <ul aria-label="Passate dell'esperimento" className="-mx-4 flex flex-col border-t border-riga empty:hidden">
        {voci.map(({ salvata, valore }) => {
          const modificata = salvata === null || bozze.modificato(salvata)
          const problemi = problemiPassata(valore, altre, attivi)
          const n = valore.parametri.filter(pp => attivi.has(pp.parametro_id)).length
          return (
            <Espandibile
              key={valore.id}
              titolo={[valore.icona, valore.nome.trim() || 'Senza nome'].filter(Boolean).join(' ')}
              riassunto={n === 0 ? 'Nessun parametro' : n === 1 ? '1 parametro' : `${n} parametri`}
              nota={salvata === null ? 'Non salvata' : modificata ? 'Modifiche non salvate' : undefined}
              aperto={aperta === valore.id}
              onCambia={() => setAperta(aperta === valore.id ? null : valore.id)}
            >
              <EditorPassata valore={valore} parametri={config.parametri} onChange={bozze.cambia} />
              {problemi.length > 0 && (
                <div className="flex flex-col gap-1">{problemi.map(e => <TestoErrore key={e}>{e}</TestoErrore>)}</div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  disabled={!modificata || problemi.length > 0 || inCorso}
                  onClick={() => void salva(valore, salvata === null)}
                >
                  {inCorso ? 'Salvataggio…' : 'Salva'}
                </Button>
                {salvata && modificata && (
                  <Button variant="ghost" disabled={inCorso} onClick={() => bozze.scarta(salvata.id)}>Annulla le modifiche</Button>
                )}
              </div>
              {salvata === null ? (
                <Button variant="destructive" size="sm" className="self-start" onClick={() => scartaNuova(valore.id)}>Scarta</Button>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  className="self-start"
                  disabled={inCorso}
                  onClick={() => setDaEliminare({ passata: salvata, aperto: true })}
                >
                  Elimina passata
                </Button>
              )}
            </Espandibile>
          )
        })}
      </ul>
      <Button variant="outline" onClick={aggiungi}>+ Passata</Button>

      <Conferma
        aperta={daEliminare?.aperto ?? false}
        titolo={`Eliminare la passata «${daEliminare?.passata.nome ?? ''}»?`}
        testo="Si può eliminare solo una passata senza misure: i parametri restano. L'operazione non si può annullare."
        annulla="Annulla"
        conferma="Elimina"
        onAnnulla={() => setDaEliminare(d => d && { ...d, aperto: false })}
        onConferma={() => { if (daEliminare) void elimina(daEliminare.passata) }}
      />
    </Sezione>
  )
}
