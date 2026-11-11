import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CloudOff, Plus } from 'lucide-react'
import { useAnalisiPesatura, usePesatura } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { Espandibile } from '@/components/Espandibile'
import { RigaStato } from '@/components/Caricamento'
import { buttonVariants } from '@/components/ui/button'
import type { DatiPesatura } from '@/api/pesatura'
import { avanzamentoFase, FASI, passiDellaFase, statoSessione } from '@/domain/pesatura/sequenza'
import { NOMI_TIPO, type AnalisiPesatura, type SessionePesatura } from '@/domain/pesatura/tipi'
import { formattaData } from '@/lib/date'
import { percorsoLaboratorio, percorsoNuovaAnalisi, percorsoNuovaSessione, percorsoSessione } from '@/lib/percorsi'
import { useSenzaRete } from '@/lib/useSenzaRete'
import { usePermessi } from '@/lib/usePermessi'
import { SENZA_RETE_PESATURA } from './messaggi'

const RIGA = 'flex min-h-14 items-center gap-3 border-b border-riga px-4 py-3 text-grafite last:border-0'

/** L'etichetta di stato di una sessione: `12/16 pesati`, `Completa` o `Conclusa`. L'asciugatura dei vasi non si conta. */
function etichettaStato(s: SessionePesatura, dati: DatiPesatura): string {
  const campioni = dati.campioni.filter(c => c.sessione_id === s.id)
  const ids = new Set(campioni.map(c => c.id))
  const pesi = dati.pesi.filter(p => ids.has(p.campione_id))
  const stato = statoSessione(s, campioni, pesi)
  if (stato === 'conclusa') return 'Conclusa'
  if (stato === 'completa') return 'Completa'
  let pesati = 0
  let totali = 0
  for (const fase of FASI[s.tipo]) {
    if (fase === 'asciugatura') continue
    const a = avanzamentoFase(passiDellaFase(s, campioni, pesi, fase))
    pesati += a.pesati
    totali += a.totali
  }
  return `${pesati}/${totali} pesati`
}

/** Dalla più recente: per data, a parità per quando è stata creata. */
function dallaPiuRecente(a: SessionePesatura, b: SessionePesatura): number {
  return b.data.localeCompare(a.data) || (b.creato_il ?? '').localeCompare(a.creato_il ?? '') || a.id.localeCompare(b.id)
}

const testoAnalisi = (a: AnalisiPesatura) => `${a.titolo} · ${NOMI_TIPO[a.tipo]}`

/** La Pesatura: le analisi da cui far nascere una sessione e l'archivio delle sessioni fatte. Solo online. */
export function Pesatura() {
  const { espId = '' } = useParams()
  const analisi = useAnalisiPesatura(espId)
  const pesatura = usePesatura(espId)
  const permessi = usePermessi(espId)
  const senzaRete = useSenzaRete()
  const [archiviateAperte, setArchiviateAperte] = useState(false)

  const attive = (analisi.data ?? []).filter(a => !a.archiviata)
  const archiviate = (analisi.data ?? []).filter(a => a.archiviata)
  const sessioni = [...(pesatura.data?.sessioni ?? [])].sort(dallaPiuRecente)

  return (
    <AppShell titolo="Pesatura" indietro={percorsoLaboratorio(espId)} nav={espId}>
      <div className="flex flex-col gap-8">
        {senzaRete && (
          <p role="status" className="flex items-start gap-2 text-base text-grafite-tenue">
            <CloudOff aria-hidden className="mt-0.5 size-5 shrink-0" />
            {SENZA_RETE_PESATURA}
          </p>
        )}

        <section aria-labelledby="titolo-analisi" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="titolo-analisi" className="text-title text-grafite">Analisi</h2>
            {permessi.puoMisurare && (
              <Link to={percorsoNuovaAnalisi(espId)} className={buttonVariants({ variant: 'outline', className: 'h-11 px-4' })}>
                <Plus aria-hidden />
                Nuova analisi
              </Link>
            )}
          </div>
          {analisi.isError ? (
            <ErroreConRiprova errore={analisi.error} onRiprova={() => void analisi.refetch()} />
          ) : analisi.data === undefined ? (
            <RigaStato testo="Caricamento…" />
          ) : (
            <>
              {attive.length === 0 ? (
                <p className="text-grafite-tenue">Nessuna analisi. Creane una per cominciare a pesare.</p>
              ) : (
                <ul className="rounded-2xl border border-riga bg-foglio">
                  {attive.map(a => (
                    <li key={a.id} className="flex items-center border-b border-riga last:border-0">
                      {permessi.puoMisurare ? (
                        <Link id={`analisi-${a.id}`} to={percorsoNuovaSessione(espId, a.id)} className="flex min-h-14 min-w-0 flex-1 items-center px-4 py-3 text-grafite">
                          {testoAnalisi(a)}
                        </Link>
                      ) : (
                        <span id={`analisi-${a.id}`} className="flex min-h-14 min-w-0 flex-1 items-center px-4 py-3 text-grafite">{testoAnalisi(a)}</span>
                      )}
                      {permessi.puoMisurare && (
                        <Link
                          to={percorsoNuovaAnalisi(espId, a.id)}
                          aria-describedby={`analisi-${a.id}`}
                          className={buttonVariants({ variant: 'ghost', className: 'mr-1 h-11 px-3' })}
                        >
                          Modifica
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {archiviate.length > 0 && (
                <ul className="rounded-2xl border border-riga bg-foglio">
                  <Espandibile
                    titolo="Archiviate"
                    riassunto={archiviate.length === 1 ? '1 analisi' : `${archiviate.length} analisi`}
                    aperto={archiviateAperte}
                    onCambia={() => setArchiviateAperte(v => !v)}
                  >
                    <ul className="-mx-4">
                      {archiviate.map(a => (
                        <li key={a.id}>
                          <Link to={percorsoNuovaAnalisi(espId, a.id)} className={RIGA}>{testoAnalisi(a)}</Link>
                        </li>
                      ))}
                    </ul>
                  </Espandibile>
                </ul>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="titolo-archivio" className="flex flex-col gap-3">
          <h2 id="titolo-archivio" className="text-title text-grafite">Archivio</h2>
          {pesatura.isError ? (
            <ErroreConRiprova errore={pesatura.error} onRiprova={() => void pesatura.refetch()} />
          ) : pesatura.data === undefined ? (
            <RigaStato testo="Caricamento…" />
          ) : sessioni.length === 0 ? (
            <p className="text-grafite-tenue">Nessuna sessione di pesata per ora.</p>
          ) : (
            <ul aria-labelledby="titolo-archivio" className="rounded-2xl border border-riga bg-foglio">
              {sessioni.map(s => (
                <li key={s.id} className="border-b border-riga last:border-0">
                  <Link to={percorsoSessione(espId, s.id)} className="flex min-h-14 items-center gap-3 px-4 py-3 text-grafite">
                    <span className="min-w-0 flex-1">
                      <span className="block text-dato font-sans text-grafite-tenue">{formattaData(s.data)}</span>
                      <span className="block truncate font-[550]">{s.titolo}</span>
                    </span>
                    <span className="shrink-0 text-dato font-sans text-grafite-tenue">{etichettaStato(s, pesatura.data)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  )
}
