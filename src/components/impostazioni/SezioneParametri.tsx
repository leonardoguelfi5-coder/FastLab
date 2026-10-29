import { useState } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { eliminaOArchiviaParametro, salvaParametro } from '@/api/configurazione'
import { EditorParametro } from '@/components/config/EditorParametro'
import { riassuntoParametro } from '@/components/config/riassunti'
import { Conferma } from '@/components/Conferma'
import { Espandibile } from '@/components/Espandibile'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { TestoErrore } from '@/components/TestoErrore'
import { Button } from '@/components/ui/button'
import { nuovoParametro, problemiParametro } from '@/domain/bozza'
import type { ConfigEsperimento, Parametro } from '@/domain/tipi'
import { useAzione } from './azione'
import { useBozze, useSegnalaModifiche } from './modifiche'
import { ParametriArchiviati } from './ParametriArchiviati'
import { ControlloDati, Sezione, Spiegazione } from './Sezione'

/** Il parametro come si salva: nome e unità senza spazi ai bordi, unità vuota = nessuna. */
function pulito(p: Parametro): Parametro {
  const unita = p.unita?.trim() || null
  return {
    ...p,
    nome: p.nome.trim(),
    unita,
    sotto_campi: p.sotto_campi.map(s => ({ ...s, nome: s.nome.trim(), unita: s.unita?.trim() || null })),
  }
}

/** I valori già registrati di una lista stanno sotto la chiave del sotto-campo: toglierlo li nasconderebbe. */
function sottoCampiTolti(salvato: Parametro, p: Parametro): boolean {
  const rimasti = new Set(p.sotto_campi.map(s => s.chiave))
  return salvato.tipo === 'lista' && salvato.sotto_campi.some(s => !rimasti.has(s.chiave))
}

const sostituisci = (elenco: Parametro[], p: Parametro) =>
  elenco.some(x => x.id === p.id) ? elenco.map(x => (x.id === p.id ? p : x)) : [...elenco, p]

interface SezioneParametriProps {
  espId: string
  config: ConfigEsperimento
  conDati: UseQueryResult<Set<string>>
}

/**
 * I parametri attivi, uno alla volta in un editor che si apre, con il proprio "Salva"; "+ Parametro" ne prepara uno
 * nuovo, che esiste solo dopo il suo "Salva". Con dati un parametro si archivia (i dati restano), senza si elimina.
 */
export function SezioneParametri({ espId, config, conDati }: SezioneParametriProps) {
  const { inCorso, esegui } = useAzione(espId)
  const bozze = useBozze<Parametro>()
  // I parametri nuovi come sono stati creati: quel che si scrive sta nelle bozze, come per quelli salvati.
  const [nuovi, setNuovi] = useState<Parametro[]>([])
  const [aperto, setAperto] = useState<string | null>(null)
  const [daEliminare, setDaEliminare] = useState<{ parametro: Parametro; aperto: boolean } | null>(null)
  const dati = conDati.data

  const salvati = config.parametri.filter(p => !p.archiviato)
  const archiviati = config.parametri.filter(p => p.archiviato)
  const modificati = salvati.filter(p => bozze.modificato(p))
  useSegnalaModifiche('parametri', nuovi.length > 0 || modificati.length > 0)

  function problemi(p: Parametro, salvato: Parametro | null): string[] {
    const altri = [...config.parametri, ...nuovi.map(bozze.valore)].filter(x => x.id !== p.id)
    const elenco = problemiParametro(p, altri)
    if (salvato && dati?.has(salvato.id) && sottoCampiTolti(salvato, p)) {
      elenco.push('Un sotto-campo con dati non si può togliere: i valori registrati sparirebbero. Puoi rinominarlo.')
    }
    return elenco
  }

  function aggiungi() {
    const ordine = Math.max(-1, ...config.parametri.map(p => p.ordine), ...nuovi.map(p => p.ordine)) + 1
    const p = nuovoParametro(ordine)
    setNuovi(n => [...n, p])
    setAperto(p.id)
  }

  async function salva(inviato: Parametro, nuovo: boolean) {
    const daSalvare = pulito(inviato)
    const riuscito = await esegui(() => salvaParametro(espId, daSalvare), {
      messaggio: nuovo
        ? `Parametro «${daSalvare.nome}» salvato. Per misurarlo, aggiungilo a una passata.`
        : `Parametro «${daSalvare.nome}» salvato.`,
      aggiorna: c => ({ ...c, parametri: sostituisci(c.parametri, daSalvare) }),
    })
    if (!riuscito) return
    // Un parametro nuovo ora esiste e lascia i nuovi. Se nel frattempo si è scritto ancora, la bozza resta.
    if (nuovo) setNuovi(n => n.filter(x => x.id !== inviato.id))
    bozze.salvata(inviato)
  }

  async function eliminaOArchivia(p: Parametro) {
    setDaEliminare({ parametro: p, aperto: false })
    const riuscito = await esegui(() => eliminaOArchiviaParametro(espId, p), {
      messaggio: esito => (esito === 'archiviato' ? 'Parametro archiviato.' : 'Parametro eliminato.'),
      neutro: true,
      aggiorna: (c, esito) => esito === 'archiviato'
        ? { ...c, parametri: c.parametri.map(x => (x.id === p.id ? { ...x, archiviato: true } : x)) }
        : {
            ...c,
            parametri: c.parametri.filter(x => x.id !== p.id),
            passate: c.passate.map(pa => ({ ...pa, parametri: pa.parametri.filter(pp => pp.parametro_id !== p.id) })),
          },
    })
    if (riuscito) {
      bozze.scarta(p.id)
      setAperto(a => (a === p.id ? null : a))
    }
  }

  function scartaNuovo(id: string) {
    setNuovi(n => n.filter(x => x.id !== id))
    bozze.scarta(id)
  }

  function ripristina(p: Parametro) {
    const ripristinato = { ...p, archiviato: false }
    void esegui(() => salvaParametro(espId, ripristinato), {
      messaggio: `Parametro «${p.nome}» ripristinato.`,
      aggiorna: c => ({ ...c, parametri: sostituisci(c.parametri, ripristinato) }),
    })
  }

  const voci = [
    ...salvati.map(p => ({ salvato: p as Parametro | null, valore: bozze.valore(p) })),
    ...nuovi.map(p => ({ salvato: null, valore: bozze.valore(p) })),
  ]

  return (
    <Sezione titolo="Parametri">
      <Spiegazione>
        Un parametro con dati non si elimina: si archivia, e i suoi dati restano nella storia e nell'export. Il suo tipo
        non si cambia. Un parametro nuovo si misura dopo averlo aggiunto a una passata.
      </Spiegazione>
      {dati === undefined && (conDati.isError
        ? <ErroreConRiprova errore={conDati.error} onRiprova={() => void conDati.refetch()} />
        : <ControlloDati />)}

      <ul aria-label="Parametri attivi" className="-mx-4 flex flex-col border-t border-riga empty:hidden">
        {voci.map(({ salvato, valore }) => {
          const haDati = salvato ? dati?.has(salvato.id) : false
          const modificato = salvato === null || bozze.modificato(salvato)
          const elenco = problemi(valore, salvato)
          const riassunto = riassuntoParametro(valore) + (haDati ? ' · ha dati' : '')
          return (
            <Espandibile
              key={valore.id}
              titolo={valore.nome.trim() || 'Senza nome'}
              riassunto={riassunto}
              nota={salvato === null ? 'Non salvato' : modificato ? 'Modifiche non salvate' : undefined}
              aperto={aperto === valore.id}
              onCambia={() => setAperto(aperto === valore.id ? null : valore.id)}
            >
              <EditorParametro
                valore={valore}
                onChange={bozze.cambia}
                // Finché non si sa se ha dati, il tipo resta fermo.
                tipoBloccato={salvato !== null && haDati !== false}
                motivoBlocco={haDati === undefined ? 'Controllo dei dati in corso: il tipo si cambia solo senza dati.' : undefined}
              />
              {elenco.length > 0 && (
                <div className="flex flex-col gap-1">{elenco.map(e => <TestoErrore key={e}>{e}</TestoErrore>)}</div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  disabled={!modificato || elenco.length > 0 || inCorso}
                  onClick={() => void salva(valore, salvato === null)}
                >
                  {inCorso ? 'Salvataggio…' : 'Salva'}
                </Button>
                {salvato && modificato && (
                  <Button variant="ghost" disabled={inCorso} onClick={() => bozze.scarta(salvato.id)}>Annulla le modifiche</Button>
                )}
              </div>
              {salvato === null ? (
                <Button variant="destructive" size="sm" className="self-start" onClick={() => scartaNuovo(valore.id)}>
                  Scarta
                </Button>
              ) : haDati ? (
                <Button variant="outline" size="sm" className="self-start" disabled={inCorso} onClick={() => void eliminaOArchivia(salvato)}>
                  Archivia
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  className="self-start"
                  disabled={haDati === undefined || inCorso}
                  onClick={() => setDaEliminare({ parametro: salvato, aperto: true })}
                >
                  Elimina
                </Button>
              )}
            </Espandibile>
          )
        })}
      </ul>
      <Button variant="outline" onClick={aggiungi}>+ Parametro</Button>

      <ParametriArchiviati archiviati={archiviati} inCorso={inCorso} onRipristina={ripristina} />

      <Conferma
        aperta={daEliminare?.aperto ?? false}
        titolo={`Eliminare il parametro «${daEliminare?.parametro.nome ?? ''}»?`}
        testo="Il parametro non ha dati: sparisce anche dalle passate che lo includono. L'operazione non si può annullare."
        annulla="Annulla"
        conferma="Elimina"
        onAnnulla={() => setDaEliminare(d => d && { ...d, aperto: false })}
        onConferma={() => { if (daEliminare) void eliminaOArchivia(daEliminare.parametro) }}
      />
    </Sezione>
  )
}
