import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { BozzaEsperimento, Parametro, Strumento } from '@/domain/tipi'
import {
  conStrumento, nuovoStrumento, ordineStrumentoSuccessivo, parametriDello, problemiParametro, problemiStrumento, senzaStrumento,
} from '@/domain/bozza'
import { strumentoDaCatalogo, voceDaStrumento } from '@/domain/catalogo'
import { salvaVoceCatalogo } from '@/api/catalogo'
import { chiavi, useCatalogo } from '@/api/query'
import { EditorStrumento, type StrumentoConValori } from '@/components/config/EditorStrumento'
import { SceltaDalCatalogo } from '@/components/config/SceltaDalCatalogo'
import { Button } from '@/components/ui/button'
import { Espandibile } from '@/components/Espandibile'
import { TestoErrore } from '@/components/TestoErrore'
import { eNomeGiaNelCatalogo, messaggioErrore } from '@/lib/errori'
import { nuovoId } from '@/lib/id'
import type { ModificaBozza } from './bozzaSalvata'

interface PassoStrumentiProps {
  bozza: BozzaEsperimento
  /** La bozza nuova, o una funzione della bozza di quel momento (per ciò che finisce dopo un'attesa). */
  onChange: (modifica: ModificaBozza) => void
}

/** I nomi dei valori, nell'ordine del modulo: es. "A · gs · E · Ci". */
function riassunto(valori: Parametro[]): string {
  return valori.length === 0 ? 'Nessun valore' : valori.map(p => p.nome.trim() || 'senza nome').join(' · ')
}

/**
 * Passo 3: gli strumenti dell'esperimento. Si prendono dal catalogo (ne nasce una copia, che si modifica qui senza
 * toccare il catalogo) o si crea uno strumento nuovo, che entra anche nel catalogo (spec §5.10). La tabella fenologica
 * è il passo dopo e qui non compare.
 */
export function PassoStrumenti({ bozza, onChange }: PassoStrumentiProps) {
  const queryClient = useQueryClient()
  const catalogo = useCatalogo()
  const [aperta, setAperta] = useState<string | null>(null)
  const [nuovo, setNuovo] = useState<StrumentoConValori | null>(null)
  const [invio, setInvio] = useState(false)
  // Lo strumento aggiunto senza collegamento al catalogo (sotto l'elenco) e il rifiuto del nome (dentro il modulo).
  const [errore, setErrore] = useState<string | null>(null)
  const [erroreModulo, setErroreModulo] = useState<string | null>(null)
  // L'id della voce resta lo stesso a ogni tentativo dello stesso modulo: ritentare è un upsert, non un'altra voce.
  const idVoce = useRef(nuovoId())
  // Il doppio tocco si ferma subito, prima che il pulsante risulti disabilitato.
  const inCorso = useRef(false)

  const elenco = bozza.strumenti.filter(s => s.tipo === 'strumento' && !s.archiviato)
  const gia = new Set(elenco.flatMap(s => (s.catalogo_id ? [s.catalogo_id] : [])))

  const cambia = (v: StrumentoConValori) => onChange(conStrumento(bozza, v.strumento, v.parametri))

  function aggiungiDaCatalogo(voce: Parameters<typeof strumentoDaCatalogo>[0]) {
    setErrore(null)
    const { strumento, parametri } = strumentoDaCatalogo(voce, ordineStrumentoSuccessivo(bozza))
    onChange(conStrumento(bozza, strumento, parametri))
  }

  function apriNuovo() {
    setErrore(null)
    if (nuovo === null) {
      idVoce.current = nuovoId()
      setErroreModulo(null)
      setNuovo({ strumento: nuovoStrumento(ordineStrumentoSuccessivo(bozza)), parametri: [] })
    }
  }

  // I problemi di uno strumento nuovo: i suoi (nome doppio compreso) e quelli dei suoi valori.
  const problemiNuovo = nuovo === null ? [] : [
    ...problemiStrumento(nuovo.strumento, bozza.strumenti),
    ...nuovo.parametri.flatMap(p => problemiParametro(p, [...nuovo.parametri, ...bozza.parametri])),
  ]

  async function confermaNuovo() {
    if (nuovo === null || inCorso.current || problemiNuovo.length > 0) return
    inCorso.current = true
    setInvio(true)
    setErrore(null)
    setErroreModulo(null)
    const { voce, strumento, parametri } = voceDaStrumento(nuovo.strumento, nuovo.parametri, idVoce.current)
    // Il salvataggio può finire dopo un cambio di passo (o a passo smontato): lo strumento si aggiunge alla bozza di quel
    // momento, non a quella che c'era al tocco, che riporterebbe indietro tutto il resto.
    const aggiungi = (s: Strumento, p: Parametro[]) =>
      onChange(b => conStrumento(b, { ...s, ordine: ordineStrumentoSuccessivo(b) }, p))
    let chiudi = true
    try {
      await salvaVoceCatalogo(voce)
      aggiungi(strumento, parametri)
      void queryClient.invalidateQueries({ queryKey: chiavi.catalogo })
    } catch (e) {
      if (eNomeGiaNelCatalogo(e)) {
        // Un altro strumento ha già questo nome: il modulo resta aperto, per rinominarlo o per usare quello che c'è.
        setErroreModulo(messaggioErrore(e))
        chiudi = false
      } else {
        // Rete o altro: lo strumento resta nella bozza, non collegato; si può usare lo stesso e il catalogo si sistema dopo.
        aggiungi(nuovo.strumento, nuovo.parametri)
        setErrore(messaggioErrore(e))
      }
    } finally {
      inCorso.current = false
      setInvio(false)
      if (chiudi) setNuovo(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-[65ch] text-grafite-tenue">
        Uno strumento è quello che usi in campo, es. 🌡 Termometro con la temperatura dell'aria e della pianta. Scegli dal
        catalogo o creane uno nuovo: finisce nel catalogo, per tutti. Un valore sta in un solo strumento.
      </p>

      <div className="flex flex-col gap-3">
        <h3 className="text-title text-grafite">Strumenti dell'esperimento</h3>
        {elenco.length === 0 && <p className="text-sm text-grafite-tenue">Nessuno strumento ancora.</p>}
        <ul aria-label="Strumenti" className="-mx-4 flex flex-col border-t border-riga empty:hidden">
          {elenco.map(s => {
            const valori = parametriDello(s, bozza.parametri)
            const suoi = new Set(valori.map(p => p.id))
            // Gli stessi controlli del riepilogo, qui dove si correggono (nome doppio compreso).
            const problemi = problemiStrumento(s, bozza.strumenti)
            return (
              <Espandibile
                key={s.id}
                titolo={[s.icona, s.nome.trim() || 'Senza nome'].filter(Boolean).join(' ')}
                riassunto={riassunto(valori)}
                nota={problemi.length > 0 ? 'Da completare' : undefined}
                aperto={aperta === s.id}
                onCambia={() => setAperta(aperta === s.id ? null : s.id)}
              >
                <EditorStrumento
                  valore={{ strumento: s, parametri: valori }}
                  onChange={cambia}
                  altriParametri={bozza.parametri.filter(p => !suoi.has(p.id))}
                />
                {problemi.length > 0 && (
                  <div className="flex flex-col gap-1">{problemi.map(e => <TestoErrore key={e}>{e}</TestoErrore>)}</div>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => { onChange(senzaStrumento(bozza, s.id)); setAperta(null) }}
                  className="self-start"
                >
                  Rimuovi strumento
                </Button>
              </Espandibile>
            )
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-title text-grafite">Dal catalogo</h3>
        <SceltaDalCatalogo
          voci={catalogo.data}
          errore={catalogo.isError ? catalogo.error : undefined}
          onRiprova={() => void catalogo.refetch()}
          gia={gia}
          onAggiungi={aggiungiDaCatalogo}
          onNuovo={apriNuovo}
        />
        {errore && (
          <div role="alert" className="flex flex-col gap-1">
            <TestoErrore className="text-base">{errore}</TestoErrore>
            <p className="text-sm text-grafite-tenue">Lo strumento è comunque nella bozza, ma non è collegato al catalogo.</p>
          </div>
        )}
      </div>

      {nuovo && (
        <section aria-label="Nuovo strumento" className="-mx-4 flex flex-col gap-4 bg-carta-ombra px-4 py-5">
          <h3 className="text-title text-grafite">Nuovo strumento</h3>
          <EditorStrumento valore={nuovo} onChange={setNuovo} altriParametri={bozza.parametri} />
          {problemiNuovo.length > 0 && (
            <div className="flex flex-col gap-1">{[...new Set(problemiNuovo)].map(e => <TestoErrore key={e}>{e}</TestoErrore>)}</div>
          )}
          {erroreModulo && (
            <div role="alert" className="flex flex-col gap-1">
              <TestoErrore className="text-base">{erroreModulo}</TestoErrore>
              <p className="text-sm text-grafite-tenue">Cambia il nome, oppure aggiungi dal catalogo lo strumento che c'è già.</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={invio || problemiNuovo.length > 0} onClick={() => void confermaNuovo()}>
              {invio ? 'Salvataggio…' : 'Salva nel catalogo e aggiungi'}
            </Button>
            <Button variant="outline" disabled={invio} onClick={() => { setNuovo(null); setErroreModulo(null) }}>Annulla</Button>
          </div>
        </section>
      )}
    </div>
  )
}
