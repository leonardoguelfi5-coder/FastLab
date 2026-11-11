import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CloudOff, Mic, MicOff, SkipForward } from 'lucide-react'
import { useConfig, usePesatura } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { BarraAzioni } from '@/components/BarraAzioni'
import { RigaStato } from '@/components/Caricamento'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { ModuloCampi } from '@/components/ModuloCampi'
import { NumericField } from '@/components/NumericField'
import { TestoErrore } from '@/components/TestoErrore'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { controllaAsciugatura, controllaReplica, mlTampone } from '@/domain/pesatura/calcoli'
import {
  etichettaCampione, FASI, letteraReplica, NOMI_FASE, type FasePesata, type Passo,
} from '@/domain/pesatura/sequenza'
import type { CampionePesatura, Peso, SessionePesatura, TipoPeso } from '@/domain/pesatura/tipi'
import { fraseSalvato, leggiComando } from '@/domain/pesatura/voce'
import type { Pianta, Trattamento } from '@/domain/tipi'
import { parla, suonoErrore, useDettatura, type Dettatura } from '@/lib/dettatura'
import { formattaMedia, formattaNumero } from '@/lib/numeri'
import { percorsoPesata, percorsoPesatura, percorsoSessione } from '@/lib/percorsi'
import { usePermessi } from '@/lib/usePermessi'
import { useSenzaRete } from '@/lib/useSenzaRete'
import { cn } from '@/lib/utils'
import { SENZA_RETE_PESATURA } from './messaggi'
import { usePesataSequenziale } from './usePesataSequenziale'

type StatoGiro = ReturnType<typeof usePesataSequenziale>

/** La pesata di una fase, un campione alla volta (tastiera). Solo online. */
export function Pesata() {
  const { espId = '', sessioneId = '', fase = '' } = useParams()
  const dati = usePesatura(espId)
  const config = useConfig(espId)
  const senzaRete = useSenzaRete()
  const sessione = (dati.data?.sessioni ?? []).find(s => s.id === sessioneId) ?? null
  // I vasi non usano le piante: non aspettano la configurazione.
  const serveConfig = sessione !== null && sessione.tipo !== 'vasi'
  const percorsoDellaSessione = percorsoSessione(espId, sessioneId)

  let corpo
  if (dati.data === undefined) {
    corpo = dati.isError
      ? <ErroreConRiprova errore={dati.error} onRiprova={() => void dati.refetch()} />
      : <RigaStato testo="Caricamento…" />
  } else if (!sessione) {
    corpo = <NonTrovata testo="Sessione non trovata." a={percorsoPesatura(espId)} link="Torna alla Pesatura" />
  } else if (!(FASI[sessione.tipo] as string[]).includes(fase)) {
    corpo = <NonTrovata testo="Fase non trovata." a={percorsoDellaSessione} link="Torna alla sessione" />
  } else if (serveConfig && config.data === undefined) {
    corpo = config.isError
      ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
      : <RigaStato testo="Caricamento…" />
  } else {
    corpo = (
      <Giro
        key={`${sessione.id}/${fase}`}
        espId={espId}
        sessione={sessione}
        campioni={dati.data.campioni.filter(c => c.sessione_id === sessione.id)}
        pesi={dati.data.pesi}
        fase={fase as FasePesata}
        piante={config.data?.piante ?? []}
        trattamenti={config.data?.trattamenti ?? []}
      />
    )
  }

  return (
    <AppShell titolo="Pesata" indietro={percorsoDellaSessione}>
      {senzaRete && (
        <p role="status" className="mb-4 flex items-start gap-2 text-base text-grafite-tenue">
          <CloudOff aria-hidden className="mt-0.5 size-5 shrink-0" />
          {SENZA_RETE_PESATURA}
        </p>
      )}
      {corpo}
    </AppShell>
  )
}

function NonTrovata({ testo, a, link }: { testo: string; a: string; link: string }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-grafite">{testo}</p>
      <Link to={a} className={buttonVariants({ variant: 'ghost', className: '-ml-3' })}>{link}</Link>
    </div>
  )
}

function Giro({ espId, sessione, campioni, pesi, fase, piante, trattamenti }: {
  espId: string
  sessione: SessionePesatura
  campioni: CampionePesatura[]
  pesi: Peso[]
  fase: FasePesata
  piante: Pianta[]
  trattamenti: Trattamento[]
}) {
  const permessi = usePermessi(espId)
  const senzaRete = useSenzaRete()
  const giro = usePesataSequenziale({ espId, sessione, campioni, pesi, fase })
  const { passi, indice, finito } = giro
  const mappaPiante = useMemo(() => new Map(piante.map(p => [p.id, p])), [piante])
  const mappaTrattamenti = useMemo(() => new Map(trattamenti.map(t => [t.id, t.etichetta])), [trattamenti])
  const etichetta = (p: Passo) => etichettaCampione(p.campione, mappaPiante)
  const conReplica = (p: Passo) => passi.filter(x => x.campione.id === p.campione.id).length > 1
  const sigla = (p: Passo) => (conReplica(p) ? `${etichetta(p)} · ${letteraReplica(p.replica)}` : etichetta(p))
  // Detto ad alta voce: "P12 replica B" (il puntino non si legge).
  const nomeDetto = (p: Passo) => (conReplica(p) ? `${etichetta(p)} replica ${letteraReplica(p.replica)}` : etichetta(p))
  const puoModificarePasso = (p: Passo) => p.peso === null || permessi.puoCorreggere(p.peso.creato_da)
  // Un salvataggio a voce fallito: il valore detto resta nel campo, come quello scritto (si rimonta la scheda).
  const [dettatoFallito, setDettatoFallito] = useState<{ indice: number; valore: number; lettura: number | null; volta: number } | null>(null)

  /** Una frase detta: un comando del giro, con la conferma a voce o il bip. Gli stessi salvataggi della tastiera. */
  async function suFrase(testo: string) {
    const comando = leggiComando(testo, fase === 'asciugatura')
    if (comando.tipo === 'non_capito' || finito || giro.occupato) {
      suonoErrore()
      return
    }
    if (comando.tipo === 'indietro') {
      if (indice === 0) suonoErrore()
      else giro.vaiA(indice - 1)
      return
    }
    if (senzaRete || !puoModificarePasso(passi[indice])) {
      suonoErrore()
      return
    }
    const { valore, lettura } = comando
    if (await giro.salva(valore, lettura)) {
      const prossimo = passi[indice + 1]
      parla(fraseSalvato(valore, sessione.unita, prossimo ? nomeDetto(prossimo) : null))
    } else {
      setDettatoFallito(d => ({ indice, valore, lettura, volta: (d?.volta ?? 0) + 1 }))
      suonoErrore()
      parla('Non salvato, riprova')
    }
  }
  const dettatura = useDettatura(testo => void suFrase(testo))
  const fermaDettatura = dettatura.ferma
  // Finita la fase non c'è più nulla da dettare: l'ascolto si chiude (anche arrivandoci con Salta).
  useEffect(() => {
    if (finito) fermaDettatura()
  }, [finito, fermaDettatura])

  if (!permessi.puoMisurare) {
    return <p className="text-grafite">Non puoi pesare: hai solo la lettura di questo esperimento.</p>
  }

  if (finito) {
    const fasi = FASI[sessione.tipo]
    const prossima = fasi[fasi.indexOf(fase) + 1]
    const mancanti = passi.filter(p => p.peso === null).length
    return (
      <>
        <div className="flex flex-col gap-3">
          <h1 className="text-headline text-grafite">Pesata finita</h1>
          <p className="text-grafite-tenue">{NOMI_FASE[fase]}: {passi.length - mancanti} su {passi.length} pesati.</p>
          {mancanti > 0 && <p className="text-base text-grafite">{mancanti === 1 ? 'Manca 1 peso.' : `Mancano ${mancanti} pesi.`}</p>}
        </div>
        <BarraAzioni>
          {prossima && (
            <Link to={percorsoPesata(espId, sessione.id, prossima)} className={buttonVariants({ size: 'lg' })}>
              Vai a {NOMI_FASE[prossima]}
            </Link>
          )}
          <Link to={percorsoSessione(espId, sessione.id)} className={buttonVariants({ size: 'lg', variant: prossima ? 'outline' : 'default' })}>
            Riepilogo
          </Link>
          {passi.length > 0 && (
            <Button type="button" variant="ghost" onClick={() => giro.vaiA(passi.length - 1)}>
              <ArrowLeft aria-hidden />
              Indietro
            </Button>
          )}
        </BarraAzioni>
      </>
    )
  }

  const passo = passi[indice]
  const trattamento = passo.campione.pianta_id
    ? mappaTrattamenti.get(mappaPiante.get(passo.campione.pianta_id)?.trattamento_id ?? '') ?? null
    : passo.campione.substrato
  const dettato = dettatoFallito !== null && dettatoFallito.indice === indice && giro.errore !== null ? dettatoFallito : null
  return (
    <SchedaPasso
      key={`${indice}:${dettatoFallito?.volta ?? 0}`}
      sessione={sessione}
      pesi={pesi}
      fase={fase}
      passo={passo}
      etichetta={etichetta(passo)}
      trattamento={trattamento}
      replica={conReplica(passo) ? `Replica ${letteraReplica(passo.replica)}` : null}
      posizione={`Passo ${indice + 1} di ${passi.length}`}
      giro={giro}
      ultimo={giro.ultimo ? `${sigla(giro.ultimo)} salvato ✓` : null}
      puoModificare={puoModificarePasso(passo)}
      dettatura={dettatura}
      dettato={dettato}
    />
  )
}

/**
 * Un passo: l'etichetta in grande e i campi. Rimontato a ogni passo, così i campi ripartono dal valore del passo
 * (o da quello appena dettato, se il salvataggio a voce non è riuscito).
 */
function SchedaPasso({
  sessione, pesi, fase, passo, etichetta, trattamento, replica, posizione, giro, ultimo, puoModificare, dettatura, dettato,
}: {
  sessione: SessionePesatura
  pesi: Peso[]
  fase: FasePesata
  passo: Passo
  etichetta: string
  trattamento: string | null
  replica: string | null
  posizione: string
  giro: StatoGiro
  ultimo: string | null
  puoModificare: boolean
  dettatura: Dettatura
  dettato: { valore: number; lettura: number | null } | null
}) {
  const senzaRete = useSenzaRete()
  const idPeso = useId()
  const radice = useRef<HTMLDivElement>(null)
  const [valore, setValore] = useState<number | null>(dettato ? dettato.valore : passo.peso ? passo.peso.valore : null)
  const [lettura, setLettura] = useState<number | null>(dettato ? dettato.lettura : passo.peso ? passo.peso.lettura : null)
  const inAscolto = dettatura.inAscolto
  // Mentre si detta il campo non prende il fuoco: sul telefono aprirebbe la tastiera sopra i numeri grandi.
  const [fuocoAlCampo] = useState(!inAscolto)
  const [provato, setProvato] = useState(false)
  const eAsciugatura = fase === 'asciugatura'
  const sensore = sessione.impostazioni.sensore
  const nomeLettura = !sensore ? 'Lettura del sensore' : `${sensore.tipo === 'umidita' ? 'Umidità' : 'Tensione'} (${sensore.unita})`
  const comandoDetto = eAsciugatura
    ? `Di' «peso 150 ${sensore?.tipo === 'tensione' ? 'tensione' : 'umidità'} 35 avanti».`
    : "Di' il peso e poi «avanti», per esempio «zero virgola uno due avanti»."

  // La tastiera è già pronta sul primo campo: si scrive subito.
  useEffect(() => {
    if (puoModificare && fuocoAlCampo) radice.current?.querySelector('input')?.focus()
  }, [puoModificare, fuocoAlCampo])

  const valoreValido = valore !== null && Number.isFinite(valore) && valore >= 0
  const letturaValida = lettura !== null && Number.isFinite(lettura)
  const problemi: string[] = []
  if (!valoreValido) problemi.push('Scrivi il peso.')
  if (eAsciugatura && !letturaValida) problemi.push('Scrivi la lettura del sensore.')

  // Avvisi che non bloccano: i pesi della stessa replica non tornano.
  const altri: Partial<Record<TipoPeso, number>> = {}
  for (const p of pesi) {
    if (p.campione_id === passo.campione.id && p.replica === passo.replica && p.tipo !== fase) altri[p.tipo] = p.valore
  }
  let avviso: string | undefined
  if (valoreValido) {
    avviso = eAsciugatura
      ? (altri.secco !== undefined ? controllaAsciugatura(valore, altri.secco) : null) ?? undefined
      : controllaReplica(sessione.tipo, { ...altri, [fase]: valore }).join(' ') || undefined
  }
  const ml = fase === 'aliquota' && valoreValido ? mlTampone(valore, sessione.unita, sessione.impostazioni.rapportoTampone) : null

  async function conferma() {
    setProvato(true)
    if (problemi.length > 0 || !puoModificare) return
    await giro.salva(valore as number, eAsciugatura ? lettura : null)
  }

  return (
    <>
      <div ref={radice} className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-grafite-tenue">{posizione}</p>
          <p className={cn('font-mono tabular-nums text-grafite', inAscolto ? 'text-gigante' : 'text-numero')}>{etichetta}</p>
          {trattamento && <p className="text-title text-grafite">{trattamento}</p>}
          {replica && <p className="text-title text-grafite">{replica}</p>}
          <p className="text-title text-grafite-tenue">{NOMI_FASE[fase]}</p>
        </div>

        {ultimo && <p role="status" className="text-base font-medium text-grafite">{ultimo}</p>}
        {inAscolto && giro.ultimo?.peso && (
          <p className="font-mono text-gigante tabular-nums text-grafite">{formattaNumero(giro.ultimo.peso.valore)} {sessione.unita}</p>
        )}

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-16 w-full text-lg [&_svg:not([class*='size-'])]:size-6"
            disabled={!dettatura.disponibile}
            onClick={() => (inAscolto ? dettatura.ferma() : dettatura.ascolta())}
          >
            {inAscolto ? <MicOff aria-hidden /> : <Mic aria-hidden />}
            {inAscolto ? 'Ferma la dettatura' : 'Detta'}
          </Button>
          {inAscolto && <p className="text-base text-grafite">{comandoDetto} «Indietro» torna al campione prima.</p>}
          {dettatura.motivo && <p className="text-base text-grafite-tenue">{dettatura.motivo}</p>}
        </div>

        <ModuloCampi className="flex flex-col gap-4">
          {puoModificare ? (
            <>
              <NumericField label="Peso" unita={sessione.unita} value={valore} onChange={setValore} avviso={avviso} obbligatorio />
              {eAsciugatura && <NumericField label={nomeLettura} value={lettura} onChange={setLettura} obbligatorio negativo />}
            </>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idPeso}-peso`}>Peso</Label>
              <Input id={`${idPeso}-peso`} variant="campo" readOnly value={formattaNumero(passo.peso?.valore ?? null)} />
              <p className="text-base text-grafite-tenue">Pesato da un&apos;altra persona.</p>
            </div>
          )}
          {ml !== null && <p role="status" className="text-title text-grafite">Aggiungi {formattaMedia(ml)} mL di tampone</p>}
          {provato && problemi.map(p => <TestoErrore key={p}>{p}</TestoErrore>)}
        </ModuloCampi>
      </div>

      <BarraAzioni>
        {giro.errore && (
          <div className="flex flex-col items-start gap-1">
            <TestoErrore role="alert" className="text-base">{giro.errore.testo}</TestoErrore>
            {!giro.errore.giaInserito && puoModificare && (
              <Button type="button" variant="outline" disabled={giro.occupato || senzaRete} onClick={() => void conferma()}>
                Riprova
              </Button>
            )}
          </div>
        )}
        <Button size="lg" disabled={senzaRete || giro.occupato || !puoModificare} aria-busy={giro.occupato} onClick={() => void conferma()}>
          Salva e vai al prossimo
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" disabled={giro.indice === 0 || giro.occupato} onClick={() => giro.vaiA(giro.indice - 1)}>
            <ArrowLeft aria-hidden />
            Indietro
          </Button>
          <Button type="button" variant="outline" className="flex-1" disabled={giro.occupato} onClick={() => giro.vaiA(giro.indice + 1)}>
            <SkipForward aria-hidden />
            Salta
          </Button>
        </div>
      </BarraAzioni>
    </>
  )
}
