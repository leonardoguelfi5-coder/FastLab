import type { ReactNode } from 'react'
import { riassuntoParametro } from '@/components/config/riassunti'
import { formattaData } from '@/lib/date'
import type { ConfigEsperimento, Parametro, Strumento } from '@/domain/tipi'
import { Sezione, Spiegazione } from './Sezione'
import { IconaStrumento } from '@/components/IconaTonda'

/** La frase al posto dei controlli: la configurazione è del proprietario. */
export const SOLO_IL_PROPRIETARIO = 'Solo il proprietario modifica la configurazione.'

/** Una riga di quaderno: nome a sinistra, dettaglio a destra nel font dei dati. */
function Riga({ nome, dettaglio }: { nome: ReactNode; dettaglio?: ReactNode }) {
  return (
    <li className="flex min-h-11 flex-wrap items-baseline justify-between gap-x-4 border-b border-riga px-4 py-2.5">
      <span className="min-w-0 break-words text-base text-grafite">{nome}</span>
      {dettaglio !== undefined && dettaglio !== '' && (
        <span className="font-mono text-dato tabular-nums text-grafite-tenue">{dettaglio}</span>
      )}
    </li>
  )
}

function Elenco({ nome, children }: { nome: string; children: ReactNode }) {
  return <ul aria-label={nome} className="-mx-4 flex flex-col border-t border-riga">{children}</ul>
}

const valoriDi = (s: Strumento, parametri: Parametro[]): Parametro[] =>
  [...s.parametri].sort((a, b) => a.ordine - b.ordine)
    .flatMap(pp => parametri.find(p => p.id === pp.parametro_id) ?? [])

function Generale({ config }: { config: ConfigEsperimento }) {
  const e = config.esperimento
  return (
    <Sezione titolo="Generale">
      <Spiegazione>{SOLO_IL_PROPRIETARIO}</Spiegazione>
      <Elenco nome="Dati generali">
        <Riga nome="Nome" dettaglio={e.nome} />
        <Riga nome="Data di inizio" dettaglio={e.data_inizio ? formattaData(e.data_inizio) : 'non indicata'} />
        <Riga nome="Note" dettaglio={e.note === '' ? 'nessuna' : e.note} />
        <Riga nome="Stato" dettaglio={e.stato === 'concluso' ? 'concluso' : 'in corso'} />
      </Elenco>
    </Sezione>
  )
}

function Trattamenti({ config }: { config: ConfigEsperimento }) {
  const livelli = new Map(config.fattori.flatMap(f => f.livelli.map(l => [l.id, l.nome] as const)))
  return (
    <Sezione titolo="Trattamenti">
      <Spiegazione>{SOLO_IL_PROPRIETARIO}</Spiegazione>
      <Elenco nome="Trattamenti">
        {[...config.trattamenti].sort((a, b) => a.ordine - b.ordine).map(t => (
          <Riga key={t.id} nome={t.etichetta} dettaglio={t.livello_ids.map(id => livelli.get(id)).filter(Boolean).join(' · ')} />
        ))}
      </Elenco>
    </Sezione>
  )
}

function Piante({ config }: { config: ConfigEsperimento }) {
  const trattamenti = new Map(config.trattamenti.map(t => [t.id, t.etichetta]))
  return (
    <Sezione titolo="Piante">
      <Spiegazione>{SOLO_IL_PROPRIETARIO}</Spiegazione>
      <Elenco nome="Piante">
        {[...config.piante].sort((a, b) => a.ordine - b.ordine).map(p => (
          <Riga
            key={p.id} nome={`#${p.etichetta}`}
            dettaglio={[trattamenti.get(p.trattamento_id), p.blocco].filter(Boolean).join(' · ')}
          />
        ))}
      </Elenco>
    </Sezione>
  )
}

function Strumenti({ config, tipo, titolo }: { config: ConfigEsperimento; tipo: Strumento['tipo']; titolo: string }) {
  const strumenti = config.strumenti.filter(s => s.tipo === tipo).sort((a, b) => a.ordine - b.ordine)
  return (
    <Sezione titolo={titolo}>
      <Spiegazione>{SOLO_IL_PROPRIETARIO}</Spiegazione>
      {strumenti.length === 0 ? (
        <p className="text-grafite-tenue">{tipo === 'fenologico' ? 'La tabella fenologica non c\'è.' : 'Nessuno strumento.'}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {strumenti.map(s => (
            <div key={s.id} className="flex flex-col gap-1">
              <h3 className="text-base font-medium text-grafite">
                <IconaStrumento emoji={s.icona} piccola className="mr-1.5 inline-flex align-middle" />
                {s.nome}
                {s.archiviato && <span className="font-normal text-grafite-tenue">{' · archiviato'}</span>}
              </h3>
              <Elenco nome={`Valori di ${s.nome}`}>
                {valoriDi(s, config.parametri).map(p => <Riga key={p.id} nome={p.nome} dettaglio={riassuntoParametro(p)} />)}
              </Elenco>
            </div>
          ))}
        </div>
      )}
    </Sezione>
  )
}

export type SezioneDiConfigurazione = 'generale' | 'trattamenti' | 'piante' | 'strumenti' | 'fenologia'

/**
 * La configurazione come la vede chi non è proprietario (Piano E, Task E10): la stessa pagina, ma solo da leggere, con
 * la frase che lo dice al posto dei controlli. Non sono i controlli di prima spenti: le righe che si aprono per
 * modificare qui non ci sono, e quindi non c'è nulla da disabilitare. La guardia vera resta il database.
 */
export function SezioneSolaLettura({ sezione, config }: { sezione: SezioneDiConfigurazione; config: ConfigEsperimento }) {
  switch (sezione) {
    case 'generale': return <Generale config={config} />
    case 'trattamenti': return <Trattamenti config={config} />
    case 'piante': return <Piante config={config} />
    case 'strumenti': return <Strumenti config={config} tipo="strumento" titolo="Strumenti" />
    case 'fenologia': return <Strumenti config={config} tipo="fenologico" titolo="Tabella fenologica" />
  }
}
