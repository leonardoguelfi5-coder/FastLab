import { useState } from 'react'
import { eliminaStrumento, salvaStrumento } from '@/api/configurazione'
import { Conferma } from '@/components/Conferma'
import { Espandibile } from '@/components/Espandibile'
import { TestoErrore } from '@/components/TestoErrore'
import { Button } from '@/components/ui/button'
import { nuovoStrumento, problemiStrumento } from '@/domain/bozza'
import type { ConfigEsperimento, Strumento } from '@/domain/tipi'
import { useAzione } from './azione'
import { EditorInclusioneStrumento } from './EditorInclusioneStrumento'
import { useBozze, useSegnalaModifiche } from './modifiche'
import { Sezione, Spiegazione } from './Sezione'

const sostituisci = (elenco: Strumento[], p: Strumento) =>
  elenco.some(x => x.id === p.id) ? elenco.map(x => (x.id === p.id ? p : x)) : [...elenco, p]

/**
 * Gli strumenti, uno alla volta in un editor che si apre, con il proprio "Salva"; "+ Strumento" ne prepara uno nuovo. Uno
 * strumento con misure non si elimina: lo dice il database (23503) e il messaggio lo spiega.
 */
export function SezioneStrumenti({ espId, config }: { espId: string; config: ConfigEsperimento }) {
  const { inCorso, esegui } = useAzione(espId)
  const bozze = useBozze<Strumento>()
  // Gli strumenti nuovi come sono stati creati: quel che si scrive sta nelle bozze, come per quelli salvati.
  const [create, setCreate] = useState<Strumento[]>([])
  const [aperta, setAperta] = useState<string | null>(null)
  const [daEliminare, setDaEliminare] = useState<{ strumento: Strumento; aperto: boolean } | null>(null)

  // Uno nuovo già arrivato in configurazione (salvato anche se la risposta si è persa) è ormai uno strumento salvato.
  const inConfig = new Set(config.strumenti.map(p => p.id))
  const nuove = create.filter(p => !inConfig.has(p.id))
  const attivi = new Set(config.parametri.filter(p => !p.archiviato).map(p => p.id))
  useSegnalaModifiche('strumenti', nuove.length > 0 || config.strumenti.some(p => bozze.modificato(p)))

  function aggiungi() {
    const ordine = Math.max(-1, ...config.strumenti.map(p => p.ordine), ...nuove.map(p => p.ordine)) + 1
    const p = nuovoStrumento(ordine)
    setCreate(n => [...n, p])
    setAperta(p.id)
  }

  function scartaNuova(id: string) {
    setCreate(n => n.filter(x => x.id !== id))
    bozze.scarta(id)
  }

  async function salva(inviata: Strumento, nuova: boolean) {
    // Un parametro eliminato nel frattempo non si manda: il collegamento fallirebbe (23503).
    const esistenti = new Set(config.parametri.map(p => p.id))
    const daSalvare: Strumento = {
      ...inviata,
      nome: inviata.nome.trim(),
      icona: inviata.icona?.trim() || null,
      parametri: inviata.parametri.filter(pp => esistenti.has(pp.parametro_id)),
    }
    const riuscito = await esegui(() => salvaStrumento(espId, daSalvare), {
      messaggio: `Strumento «${daSalvare.nome}» salvato.`,
      aggiorna: c => ({ ...c, strumenti: sostituisci(c.strumenti, daSalvare) }),
    })
    if (!riuscito) return
    if (nuova) setCreate(n => n.filter(x => x.id !== inviata.id))
    bozze.salvata(inviata)
  }

  async function elimina(p: Strumento) {
    setDaEliminare({ strumento: p, aperto: false })
    const riuscito = await esegui(() => eliminaStrumento(espId, p.id), {
      messaggio: 'Strumento eliminato.',
      neutro: true,
      aggiorna: c => ({ ...c, strumenti: c.strumenti.filter(x => x.id !== p.id) }),
    })
    if (riuscito) {
      setCreate(n => n.filter(x => x.id !== p.id))
      bozze.scarta(p.id)
      setAperta(a => (a === p.id ? null : a))
    }
  }

  const voci = [
    ...config.strumenti.map(p => ({ salvata: p as Strumento | null, valore: bozze.valore(p) })),
    ...nuove.map(p => ({ salvata: null, valore: bozze.valore(p) })),
  ]
  // Il nome si confronta con gli strumenti salvati e con quelli nuovi (come per i parametri).
  const altre = [...config.strumenti, ...nuove.map(bozze.valore)]

  return (
    <Sezione titolo="Strumenti">
      <Spiegazione>
        Uno strumento raggruppa i parametri che rilevi insieme in campo. Si elimina solo se non ha ancora misure.
      </Spiegazione>
      <ul aria-label="Strumenti dell'esperimento" className="-mx-4 flex flex-col border-t border-riga empty:hidden">
        {voci.map(({ salvata, valore }) => {
          const modificata = salvata === null || bozze.modificato(salvata)
          const problemi = problemiStrumento(valore, altre, attivi)
          const n = valore.parametri.filter(pp => attivi.has(pp.parametro_id)).length
          return (
            <Espandibile
              key={valore.id}
              titolo={[valore.icona, valore.nome.trim() || 'Senza nome'].filter(Boolean).join(' ')}
              riassunto={n === 0 ? 'Nessun parametro' : n === 1 ? '1 parametro' : `${n} parametri`}
              nota={salvata === null ? 'Non salvato' : modificata ? 'Modifiche non salvate' : undefined}
              aperto={aperta === valore.id}
              onCambia={() => setAperta(aperta === valore.id ? null : valore.id)}
            >
              <EditorInclusioneStrumento valore={valore} parametri={config.parametri} onChange={bozze.cambia} />
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
                  onClick={() => setDaEliminare({ strumento: salvata, aperto: true })}
                >
                  Elimina strumento
                </Button>
              )}
            </Espandibile>
          )
        })}
      </ul>
      <Button variant="outline" onClick={aggiungi}>+ Strumento</Button>

      <Conferma
        aperta={daEliminare?.aperto ?? false}
        titolo={`Eliminare lo strumento «${daEliminare?.strumento.nome ?? ''}»?`}
        testo="Si può eliminare solo uno strumento senza misure: i parametri restano. L'operazione non si può annullare."
        annulla="Annulla"
        conferma="Elimina"
        onAnnulla={() => setDaEliminare(d => d && { ...d, aperto: false })}
        onConferma={() => { if (daEliminare) void elimina(daEliminare.strumento) }}
      />
    </Sezione>
  )
}
